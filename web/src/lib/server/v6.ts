/**
 * v6 server work (Admin SDK over REST, so the security rules do not apply here):
 *  • runMissionReminders — every 30 minutes (feature 4): in-app notification + push, once per (user, mission, kind)
 *  • handleEmergencyBroadcast — after an admin or emergency partner declares an emergency (feature 19)
 * Big audiences are written in batches of 400 and pushed one person at a time; each run stops after ~12 s.
 */
import { dueReminders, quietHours, reminderLogId, type ReminderLog } from "../domain/reminders";
import { canDeclare, inArea } from "../domain/emergency";
import type { HelpSignal, Mission, MissionParticipant, Notification, Organization, Submission, UserProfile } from "../domain/types";
import { adminDb, adminReady, caller, notConfigured, tooMany } from "./admin";
import type { Firestore } from "./firestore-rest";
import { langOf, notificationText, sendToUser } from "./push";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const BUDGET_MS = 12_000;
const id = () => crypto.randomUUID();

async function writeAll(db: Firestore, docs: { path: string; data: object }[]) {
  for (let i = 0; i < docs.length; i += 400) {
    const b = db.batch();
    for (const d of docs.slice(i, i + 400)) b.set(db.doc(d.path), d.data);
    await b.commit();
  }
}

export async function runMissionReminders(now = Date.now(), given?: Firestore) {
  if (!given && !adminReady()) return { skipped: "not configured" };
  const db = given ?? adminDb();
  const started = Date.now();
  const missions = (await db.collection("missions").where("status", "==", "published").get()).docs.map((d) => d.data() as Mission)
    .filter((m) => m.source !== "agent" && Date.parse(m.date) > now - 8 * 86_400_000);
  if (!missions.length) return { missions: 0, sent: 0 };
  const ids = missions.map((m) => m.id);
  const participants: MissionParticipant[] = [];
  const submissions: Pick<Submission, "missionId" | "userId">[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    participants.push(...(await db.collection("participants").where("missionId", "in", chunk).get()).docs.map((d) => d.data() as MissionParticipant));
    submissions.push(...(await db.collection("submissions").where("missionId", "in", chunk).get()).docs.map((d) => d.data() as Submission));
  }
  const users = (await db.collection("users").where("role", "==", "volunteer").get()).docs.map((d) => d.data() as UserProfile).filter((u) => u.status === "active");
  const sent = (await db.collection("reminderLog").where("sentAt", ">=", new Date(now - 30 * 86_400_000).toISOString()).get()).docs.map((d) => d.data() as ReminderLog);
  const due = dueReminders({ now, missions, participants, submissions, users: users.map((u) => ({ ...u, skillIds: (u.skillSet ?? []).map((s) => s.id) })), sent });
  const byId = new Map(missions.map((m) => [m.id, m]));
  const people = new Map(users.map((u) => [u.id, u]));
  const at = new Date(now).toISOString();
  const quiet = quietHours(now);
  const docs: { path: string; data: object }[] = [];
  const notes: Notification[] = [];
  for (const r of due) {
    const m = byId.get(r.missionId)!;
    const n: Notification = {
      id: id(), userId: r.userId, type: "mission", title: `n.rem.${r.kind}`, message: JSON.stringify({ title: m.title, left: Math.max(0, m.capacity - m.participantsCount), time: m.date }),
      link: `/app/missions/${m.id}?r=${r.kind}`, read: false, createdAt: at,
    };
    notes.push(n);
    docs.push({ path: `notifications/${n.id}`, data: n });
    const logId = reminderLogId(r.userId, r.missionId, r.kind);
    docs.push({ path: `reminderLog/${logId}`, data: { id: logId, userId: r.userId, missionId: r.missionId, kind: r.kind, sentAt: at, openedAt: null } });
  }
  await writeAll(db, docs);
  let pushed = 0;
  // Quiet hours (22:00–08:00 Tashkent): the in-app notification is written at once, but no push is sent;
  // only the personal "starts in 2 hours" reminder still pushes, because it would be useless in the morning.
  for (const n of notes) {
    if (Date.now() - started > BUDGET_MS) break;
    if (quiet && n.title !== "n.rem.soon2") continue;
    const u = people.get(n.userId);
    const text = notificationText(n, langOf(u));
    if (text) pushed += await sendToUser(db, n.userId, { ...text, link: n.link, tag: n.title }).catch(() => 0);
  }
  return { missions: missions.length, due: due.length, pushed, quiet };
}

export async function handleEmergencyBroadcast(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  const uid = await caller(req);
  if (!uid) return json({ error: "e.signIn" }, 401);
  if (tooMany(`emergency:${uid}`, 5)) return json({ error: "ai.tooMany" }, 429);
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string" || !/^[\w-]{8,80}$/.test(body.id)) return json({ error: "e.notFound" }, 400);
  const db = adminDb();
  const me = (await db.doc(`users/${uid}`).get()).data() as UserProfile | undefined;
  const org = me?.organizationId ? ((await db.doc(`organizations/${me.organizationId}`).get()).data() as Organization | undefined) ?? null : null;
  if (!me || me.status !== "active" || !canDeclare(me, org)) return json({ error: "em.e.notAllowed" }, 403);
  const s = (await db.doc(`helpSignals/${body.id}`).get()).data() as HelpSignal | undefined;
  if (!s || s.kind !== "emergency" || !s.emergency || s.emergency.state !== "verified" || s.userId !== uid) return json({ error: "e.notFound" }, 404);
  const started = Date.now();
  const audience: UserProfile[] = [];
  const seen = new Set<string>();
  for (const p of s.emergency.provinces.slice(0, 10)) {
    for (const d of (await db.collection("users").where("province", "==", p).get()).docs) {
      const u = d.data() as UserProfile;
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      audience.push(u);
    }
  }
  for (const c of s.emergency.cities.slice(0, 10)) {
    for (const d of (await db.collection("users").where("city", "==", c).get()).docs) {
      const u = d.data() as UserProfile;
      if (!seen.has(u.id)) { seen.add(u.id); audience.push(u); }
    }
  }
  const targets = audience.filter((u) => u.status === "active" && u.id !== uid && (u.notifyPrefs?.emergency ?? true) && inArea(u, { provinces: s.emergency!.provinces, cities: s.emergency!.cities }));
  const at = new Date().toISOString();
  const notes: Notification[] = targets.map((u) => ({
    id: id(), userId: u.id, type: "system", title: "n.emergency", message: JSON.stringify({ title: s.title, place: s.place }), link: `${u.role === "admin" || u.role === "super_admin" ? "/admin" : u.role === "organization" ? "/org" : "/app"}/emergency/${s.id}`, read: false, createdAt: at,
  }));
  await writeAll(db, notes.map((n) => ({ path: `notifications/${n.id}`, data: n })));
  let pushed = 0;
  for (const n of notes) {
    if (Date.now() - started > BUDGET_MS) break; // the in-app notice is written for everyone; pushes stop at the time budget
    const text = notificationText(n, langOf(targets.find((u) => u.id === n.userId)));
    if (text) pushed += await sendToUser(db, n.userId, { ...text, link: n.link, tag: `em_${s.id}` }).catch(() => 0);
  }
  return json({ ok: true, notified: notes.length, pushed });
}
