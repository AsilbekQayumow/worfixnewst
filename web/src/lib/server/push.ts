/**
 * Server-only: phone push notifications for the WORFIX app (Android and iOS, through Firebase Cloud Messaging).
 *
 *  • push-register / push-unregister: the app hands over its FCM token after sign-in (pushTokens/{sha256(token)}).
 *  • push-send: after the app writes in-app notifications or chat messages, it asks the server to deliver
 *    them as pushes. The server re-reads every document and only sends what is real, fresh and addressed
 *    to someone else, once (pushLog).
 *  • pushNotification(): server-side writers (AI review, promo codes, territory decay) call it directly.
 *  • runStreakReminders(): the daily "your streak ends today" push (cron in wrangler.jsonc).
 *
 * Uses the same service account as Firestore (FIREBASE_SERVICE_ACCOUNT); the cloud-platform scope covers FCM.
 */
import { DICT } from "../i18n/dict";
import type { Lang, Message, Notification, UserProfile } from "../domain/types";
import { adminDb, adminReady, caller, notConfigured, tooMany } from "./admin";
import type { Firestore } from "./firestore-rest";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const FRESH_MS = 10 * 60_000;

export interface PushToken { userId: string; token: string; platform: "android" | "ios"; updatedAt: string }
export interface PushMessage { title: string; body: string; link: string | null; tag?: string }

export async function sha256(text: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const interpolate = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => (v[k] == null ? "" : String(v[k])));
export function tr(lang: Lang, key: string, values: Record<string, unknown> = {}) {
  const s = DICT[lang]?.[key] ?? DICT.en[key];
  return s === undefined ? key : interpolate(s, values);
}
export const langOf = (u: Partial<UserProfile> | undefined): Lang => (u?.language === "ru" || u?.language === "en" ? u.language : "uz");

/** The push text of an in-app notification, in the reader's language; null for v1 plain-text ones. */
export function notificationText(n: Pick<Notification, "title" | "message">, lang: Lang): { title: string; body: string } | null {
  if (!n.title.startsWith("n.") || DICT.en[`${n.title}.t`] === undefined) return null;
  let v: Record<string, unknown> = {};
  try { v = JSON.parse(n.message) as Record<string, unknown>; } catch { /* no values */ }
  return { title: tr(lang, `${n.title}.t`, v), body: tr(lang, `${n.title}.b`, v) };
}

/** Sends one message to every device of a user. Forgets tokens FCM says are gone. Returns how many devices got it. */
export async function sendToUser(db: Firestore, userId: string, msg: PushMessage): Promise<number> {
  if (db.emulator) return 0;
  const snap = await db.collection("pushTokens").where("userId", "==", userId).limit(10).get();
  if (snap.empty) return 0;
  const auth = `Bearer ${await db.token()}`;
  let sent = 0;
  await Promise.all(snap.docs.map(async (d) => {
    const t = d.data() as PushToken;
    const data: Record<string, string> = { link: msg.link ?? "/app/notifications" };
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${db.projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: t.token,
          notification: { title: msg.title.slice(0, 120), body: msg.body.slice(0, 400) },
          data,
          android: {
            priority: "high",
            notification: { icon: "ic_stat_worfix", color: "#1fa84a", channel_id: "worfix", tag: msg.tag, default_sound: true },
          },
          apns: { payload: { aps: { sound: "default", "thread-id": msg.tag ?? "worfix" } } },
        },
      }),
    }).catch(() => null);
    if (res?.ok) { sent += 1; return; }
    const text = res ? await res.text().catch(() => "") : "";
    if (res && (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*token/i.test(text))) await db.batch().delete(d.ref).commit().catch(() => {});
    else if (res) console.warn("[push] FCM", res.status, text.slice(0, 200));
  }));
  return sent;
}

/** Delivers one in-app notification as a push, at most once. */
export async function pushNotification(db: Firestore, n: Notification) {
  try {
    if (!(await claim(db, `n_${n.id}`))) return 0;
    const u = (await db.doc(`users/${n.userId}`).get()).data() as UserProfile | undefined;
    if (!u || u.status === "deleted") return 0;
    const text = notificationText(n, langOf(u));
    if (!text) return 0;
    return await sendToUser(db, n.userId, { ...text, link: n.link, tag: n.title });
  } catch (e) {
    console.warn("[push] notification", (e as Error).message);
    return 0;
  }
}

/** True the first time a key is claimed (pushLog/{key} is created atomically). */
async function claim(db: Firestore, key: string) {
  try {
    await db.batch().create(db.doc(`pushLog/${key}`), { at: new Date().toISOString() }).commit();
    return true;
  } catch {
    return false;
  }
}

/* ───────────── handlers ───────────── */

export async function handlePushRegister(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  const uid = await caller(req);
  if (!uid) return json({ error: "e.signIn" }, 401);
  if (tooMany(`pushreg:${uid}`, 20)) return json({ error: "ai.tooMany" }, 429);
  const body = (await req.json().catch(() => ({}))) as { token?: string; platform?: string };
  const token = String(body.token ?? "").trim();
  if (token.length < 20 || token.length > 4096) return json({ error: "ai.badRequest" }, 400);
  const platform = body.platform === "ios" ? "ios" : "android";
  const db = adminDb();
  await db.doc(`pushTokens/${await sha256(token)}`).set({ userId: uid, token, platform, updatedAt: new Date().toISOString() } satisfies PushToken);
  return json({ ok: true });
}

export async function handlePushUnregister(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  const uid = await caller(req);
  if (!uid) return json({ error: "e.signIn" }, 401);
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = String(body.token ?? "");
  if (!token) return json({ ok: true });
  const db = adminDb();
  const ref = db.doc(`pushTokens/${await sha256(token)}`);
  const cur = (await ref.get()).data() as PushToken | undefined;
  if (cur?.userId === uid) await db.batch().delete(ref).commit();
  return json({ ok: true });
}

/** The app asks for pushes of notifications and chat messages it has just written. */
export async function handlePushSend(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  const uid = await caller(req);
  if (!uid) return json({ error: "e.signIn" }, 401);
  if (tooMany(`pushsend:${uid}`, 40)) return json({ error: "ai.tooMany" }, 429);
  const body = (await req.json().catch(() => ({}))) as { notifications?: unknown; messages?: unknown };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[\w-]{4,80}$/.test(x)).slice(0, 60) : []);
  const db = adminDb();
  const now = Date.now();
  let sent = 0;

  for (const id of ids(body.notifications)) {
    const n = (await db.doc(`notifications/${id}`).get()).data() as Notification | undefined;
    if (!n || n.userId === uid || now - Date.parse(n.createdAt) > FRESH_MS) continue;
    sent += await pushNotification(db, n);
  }

  const people = new Map<string, UserProfile | undefined>();
  const person = async (id: string) => {
    if (!people.has(id)) people.set(id, (await db.doc(`users/${id}`).get()).data() as UserProfile | undefined);
    return people.get(id);
  };
  for (const id of ids(body.messages)) {
    const m = (await db.doc(`messages/${id}`).get()).data() as Message | undefined;
    if (!m || m.from !== uid || now - Date.parse(m.createdAt) > FRESH_MS) continue;
    if (!(await claim(db, `m_${id}`))) continue;
    const from = await person(uid);
    for (const to of m.participants.filter((p) => p !== uid)) {
      const u = await person(to);
      if (!u) continue;
      const lang = langOf(u);
      const text = m.kind === "text" ? m.text.replace(/\s+/g, " ").trim() : tr(lang, m.kind === "invite" ? "push.invite" : "push.groupInvite");
      sent += await sendToUser(db, to, { title: from?.fullName ?? "WORFIX", body: text.length > 140 ? `${text.slice(0, 137)}…` : text, link: `/app/chat/${uid}`, tag: `chat_${uid}` });
    }
  }
  return json({ ok: true, sent });
}

/* ───────────── daily: "your streak ends today" ───────────── */

/** Everyone whose streak (2+ days) ends tonight unless a mission is approved today (UTC days, as in rewards.ts). */
export async function runStreakReminders(now = Date.now(), given?: Firestore) {
  if (!given && !adminReady()) return { skipped: "not configured" };
  const db = given ?? adminDb();
  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const snap = await db.collection("users").where("lastApprovedDay", "==", yesterday).get();
  let sent = 0;
  for (const d of snap.docs) {
    const u = d.data() as UserProfile;
    if (u.streak < 2 || u.status !== "active") continue;
    if (!(await claim(db, `s_${u.id}_${today}`))) continue;
    const lang = langOf(u);
    sent += await sendToUser(db, u.id, { title: tr(lang, "push.streak.t", { n: u.streak }), body: tr(lang, "push.streak.b"), link: "/app/map", tag: "streak" });
  }
  return { day: today, candidates: snap.size, sent };
}
