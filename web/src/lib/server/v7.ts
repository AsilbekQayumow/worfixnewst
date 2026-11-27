/**
 * v7 server work (Admin SDK over REST):
 *  • handlePlay — every game reward (POST /.netlify/functions/play): the engine in a transaction, so the browser
 *    never writes XP or Fixcoin itself and never sees quiz answers;
 *  • runGameTick — every 30 minutes: today's heat map (once a day), this and last week's mahalla battles, duel scores.
 */
import { play as runEngine, GameError, type Action } from "../game/engine";
import { gameDay, gameWeek, dayStart, type PlayState } from "../game/core";
import { activityOf, battlesFor, districtKeyOf, heatActivity, mahallaKeyOf, seasonExtraOf, tookPart, weekActivity } from "../game/context";
import { buildHeat, type Heat } from "../game/spawn";
import { duelScore, lastWeek, settleDuel, type Battle, type Duel } from "../game/league";
import { QUIZ_BANK } from "../game/quiz-bank";
import type { Mission, MissionParticipant, Notification, Submission, Territory, TerritoryCapture, UserProfile } from "../domain/types";
import { adminDb, adminReady, caller, notConfigured, tooMany } from "./admin";
import type { Firestore } from "./firestore-rest";
import { langOf, notificationText, sendToUser } from "./push";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const DAY = 86_400_000;
const ACTIONS = new Set(["daily", "save", "open", "answer", "quest", "tier", "buy", "equip", "battle", "duel"]);

function cleanAction(raw: unknown): Action | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  if (typeof a.t !== "string" || !ACTIONS.has(a.t)) return null;
  const s = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  switch (a.t) {
    case "open": {
      const p = (a.pos ?? {}) as Record<string, unknown>;
      return { t: "open", id: s(a.id), pos: { lat: n(p.lat), lng: n(p.lng), acc: Number.isFinite(n(p.acc)) ? n(p.acc) : null, mock: p.mock === true } };
    }
    case "answer": return { t: "answer", choice: n(a.choice) };
    case "quest": return { t: "quest", id: s(a.id) };
    case "tier": return { t: "tier", n: n(a.n) };
    case "buy": return { t: "buy", id: s(a.id) };
    case "equip": return { t: "equip", slot: s(a.slot) as "frame", id: a.id === null ? null : s(a.id) };
    case "battle": return { t: "battle", week: s(a.week, 10) };
    case "duel": return { t: "duel", id: s(a.id) };
    default: return { t: a.t as "daily" | "save" };
  }
}

export async function handlePlay(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  const uid = await caller(req);
  if (!uid) return json({ error: "e.signIn" }, 401);
  if (tooMany(`play:${uid}`, 40)) return json({ error: "g.e.slow" }, 429);
  const action = cleanAction(await req.json().catch(() => null));
  if (!action) return json({ error: "e.generic" }, 400);
  const db = adminDb();
  const now = Date.now();
  const me = (await db.doc(`users/${uid}`).get()).data() as UserProfile | undefined;
  if (!me || me.status !== "active" || me.role !== "volunteer") return json({ error: "e.forbidden" }, 403);

  // Read-only inputs (outside the transaction): the person's own walks, joins and reviewed submissions.
  const [caps, parts, subs] = await Promise.all([
    db.collection("territoryCaptures").where("userId", "==", uid).get().then((s) => s.docs.map((d) => d.data() as TerritoryCapture)),
    db.collection("participants").where("userId", "==", uid).get().then((s) => s.docs.map((d) => d.data() as MissionParticipant)),
    db.collection("submissions").where("userId", "==", uid).get().then((s) => s.docs.map((d) => d.data() as Submission)),
  ]);
  const heat = (await db.doc(`heat/${gameDay(now)}`).get()).data() as Heat | undefined;
  const week = lastWeek(now);
  const battle = action.t === "battle" ? ((await db.doc(`battles/${week}_${districtKeyOf(me)}`).get()).data() as Battle | undefined) ?? null : null;
  const duel = action.t === "duel" ? ((await db.doc(`duels/${action.id}`).get()).data() as Duel | undefined) ?? null : null;

  try {
    const out = await db.runTransaction(async (tx) => {
      const uRef = db.doc(`users/${uid}`), pRef = db.doc(`play/${uid}`);
      const u = (await tx.get(uRef)).data() as UserProfile;
      const p = (await tx.get(pRef)).data() as PlayState | undefined;
      const r = runEngine({
        now, user: { id: uid, points: u.points, province: u.province }, play: p ?? null, heat: heat ?? null,
        activity: activityOf(uid, caps, parts, subs), seasonExtra: seasonExtraOf(uid, caps, subs, now),
        battle, mahalla: mahallaKeyOf(u), battleTookPart: tookPart(uid, weekActivity(week, caps, subs)),
        duel: duel ? settleDuel(duel, now) : null, bank: QUIZ_BANK,
      }, action);
      tx.set(pRef, r.play);
      const patch: Record<string, unknown> = {};
      if (r.coins) patch.points = Math.max(0, u.points + r.coins);
      if (r.look) patch.look = r.look;
      if (Object.keys(patch).length) tx.update(uRef, { ...patch, updatedAt: new Date(now).toISOString() });
      return { ...r, points: patch.points ?? u.points };
    });
    return json(out);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, 409);
    console.error("[play]", e);
    return json({ error: "e.generic" }, 500);
  }
}

async function writeAll(db: Firestore, docs: { path: string; data: object }[]) {
  for (let i = 0; i < docs.length; i += 400) {
    const b = db.batch();
    for (const d of docs.slice(i, i + 400)) b.set(db.doc(d.path), d.data);
    await b.commit();
  }
}

/** Every 30 minutes (wrangler cron "*\/30 * * * *"). */
export async function runGameTick(now = Date.now(), given?: Firestore) {
  if (!given && !adminReady()) return { skipped: "not configured" };
  const db = given ?? adminDb();
  const out: Record<string, number | string> = {};
  const day = gameDay(now);

  // 1. today's heat map, once
  if (!(await db.doc(`heat/${day}`).get()).exists) {
    const since = new Date(dayStart(day) - 14 * DAY).toISOString();
    const territories = (await db.collection("territories").where("updatedAt", ">=", since).get()).docs.map((d) => d.data() as Territory);
    const parts = (await db.collection("participants").where("joinedAt", ">=", since).get()).docs.map((d) => d.data() as MissionParticipant);
    const ids = [...new Set(parts.map((p) => p.missionId))];
    const missions: Mission[] = [];
    for (let i = 0; i < ids.length; i += 30) missions.push(...(await db.collection("missions").where("id", "in", ids.slice(i, i + 30)).get()).docs.map((d) => d.data() as Mission));
    const heat = buildHeat(day, heatActivity(dayStart(day), territories, missions, parts));
    await db.doc(`heat/${day}`).set({ id: day, ...heat });
    out.heatCells = Object.keys(heat.cells).length;
  }

  // 2. battles: this week, and last week until it is final
  const thisW = gameWeek(now), prevW = lastWeek(now);
  const from = new Date(dayStart(prevW)).toISOString();
  const users = (await db.collection("users").where("role", "==", "volunteer").get()).docs.map((d) => d.data() as UserProfile);
  const caps = (await db.collection("territoryCaptures").where("createdAt", ">=", from).get()).docs.map((d) => d.data() as TerritoryCapture);
  const subs = (await db.collection("submissions").where("reviewedAt", ">=", from).get()).docs.map((d) => d.data() as Submission);
  const docs: { path: string; data: object }[] = [];
  for (const w of [thisW, prevW]) {
    if (w === prevW) {
      const sample = await db.collection("battles").where("week", "==", prevW).where("final", "==", true).limit(1).get();
      if (!sample.empty) continue;
    }
    for (const b of battlesFor(w, users, caps, subs, now)) docs.push({ path: `battles/${b.id}`, data: b });
  }
  await writeAll(db, docs);
  out.battles = docs.length;

  // 3. duels: scores, and the result once the week is over
  const active = (await db.collection("duels").where("status", "==", "active").get()).docs.map((d) => d.data() as Duel);
  const approvals = subs.filter((s) => s.verificationStatus === "approved").map((s) => ({ userId: s.userId, reviewedAt: s.reviewedAt, hours: s.grant?.hours ?? 0 }));
  const notes: Notification[] = [];
  const dDocs: { path: string; data: object }[] = [];
  const at = new Date(now).toISOString();
  for (const d of active) {
    if (!d.start || !d.end) continue;
    const scores = Object.fromEntries(d.players.map((p) => [p, duelScore(d.metric, p, { captures: caps, approvals }, Date.parse(d.start!), Date.parse(d.end!))]));
    const next = settleDuel({ ...d, scores, updatedAt: at }, now);
    dDocs.push({ path: `duels/${d.id}`, data: next });
    if (next.status === "done") for (const p of next.players) {
      const n: Notification = { id: crypto.randomUUID(), userId: p, type: "system", title: next.winner === p ? "n.duelWon" : next.winner ? "n.duelLost" : "n.duelDraw", message: "{}", link: "/app/play?tab=duels", read: false, createdAt: at };
      notes.push(n);
      dDocs.push({ path: `notifications/${n.id}`, data: n });
    }
  }
  await writeAll(db, dDocs);
  out.duels = active.length;
  const people = new Map(users.map((u) => [u.id, u]));
  for (const n of notes) {
    const text = notificationText(n, langOf(people.get(n.userId)));
    if (text) await sendToUser(db, n.userId, { ...text, link: n.link, tag: n.title }).catch(() => 0);
  }
  return out;
}
