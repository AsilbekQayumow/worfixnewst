/**
 * Server functions that need the Firebase Admin SDK (see admin.ts):
 *  • ai-review   — the AI reviews an agent-mission submission and the decision (with rewards) is written here;
 *  • shop-fulfil — gives a paid promo-code order the next free code;
 *  • telegram-auth — checks a Telegram Login Widget result and returns a Firebase custom token.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { aiMock, verifyPhotos } from "../ai/handlers";
import { AiError } from "../ai/server";
import { aiNote, aiReviewer, AI_REVIEWER_ID, decideAi, type AiVerdict } from "../domain/ai-review";
import { runChecks } from "../domain/checks";
import { isAgentOrg } from "../domain/permissions";
import { reviewSubmission } from "../domain/verification";
import { LANGS, type Lang, type Mission, type MissionParticipant, type Notification, type Order, type PromoCode, type Submission, type UserProfile } from "../domain/types";
import { adminApp, adminAuth, adminDb, caller, notConfigured, tooMany } from "./admin";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const nowIso = () => new Date().toISOString();
const note = (userId: string, type: Notification["type"], key: string, values: Record<string, unknown>, link: string): Notification =>
  ({ id: randomUUID(), userId, type, title: key, message: JSON.stringify(values), link, read: false, createdAt: nowIso() });

/* ───────────── ai-review ───────────── */

export async function handleAiReview(req: Request): Promise<Response> {
  if (!adminApp()) return notConfigured();
  const uid = await caller(req);
  if (!uid) return json({ error: "e.signIn" }, 401);
  if (tooMany(`ai:${uid}`, 6)) return json({ error: "ai.tooMany" }, 429);
  const { submissionId } = ((await req.json().catch(() => ({}))) ?? {}) as { submissionId?: string };
  if (!submissionId) return json({ error: "ai.badRequest" }, 400);

  const db = adminDb();
  const [sSnap, meSnap] = await Promise.all([db.doc(`submissions/${submissionId}`).get(), db.doc(`users/${uid}`).get()]);
  const s = sSnap.data() as Submission | undefined;
  const me = meSnap.data() as UserProfile | undefined;
  if (!s || !me) return json({ error: "e.notFound" }, 404);
  if (s.userId !== uid && !["admin", "super_admin"].includes(me.role)) return json({ error: "e.forbidden" }, 403);
  if (!isAgentOrg(s.organizationId)) return json({ error: "e.forbidden" }, 403);
  // An admin overturned the AI here: a person reviews it now, never the AI again.
  if (s.verificationStatus !== "pending" || s.aiReview?.audit === "overturned") return json({ decision: s.aiReview?.decision ?? null });
  const mSnap = await db.doc(`missions/${s.missionId}`).get();
  const m = mSnap.data() as Mission | undefined;
  if (!m || m.source !== "agent") return json({ error: "e.notFound" }, 404);
  const volunteer = (await db.doc(`users/${s.userId}`).get()).data() as UserProfile | undefined;
  if (!volunteer) return json({ error: "e.notFound" }, 404);

  // Re-run the automatic checks here: the stored ones were computed in the volunteer's browser.
  const participant = (await db.doc(`participants/${s.missionId}_${s.userId}`).get()).data() as MissionParticipant | undefined;
  const others = (await db.collection("submissions").where("userId", "==", s.userId).get()).docs.map((d) => d.data() as Submission).filter((x) => x.id !== s.id);
  const checks = runChecks({ submission: s, mission: m, participant: participant ?? null, others });

  let verdict: AiVerdict | null = null;
  if (process.env.GEMINI_API_KEY || aiMock()) {
    try {
      const language = ((LANGS as readonly string[]).includes(volunteer.language ?? "") ? volunteer.language : "uz") as Lang;
      verdict = await verifyPhotos({
        images: s.images.slice(-4).map((i) => i.dataUrl.split(",")[1] ?? ""), title: m.title, description: m.description, category: m.category,
        checklist: m.checklist ?? [], language, deadline: Date.now() + 25_000, mock: aiMock(),
      });
    } catch (e) {
      if (!(e instanceof AiError)) console.error("[ai-review]", e);
      verdict = null;
    }
  }

  const decision = await db.runTransaction(async (tx) => {
    const ref = db.doc(`submissions/${s.id}`);
    const cur = (await tx.get(ref)).data() as Submission;
    if (cur.verificationStatus !== "pending" || cur.aiReview?.audit === "overturned") return cur.aiReview?.decision ?? null;
    const vRef = db.doc(`users/${cur.userId}`);
    const vol = (await tx.get(vRef)).data() as UserProfile;
    const admins = (await tx.get(db.collection("users").where("role", "in", ["admin", "super_admin"]))).docs.map((d) => d.id);
    const review = decideAi(verdict, checks.checks, checks.score, nowIso());
    if (review.decision === "escalated") {
      tx.update(ref, { aiReview: review, checks: checks.checks, fraudScore: checks.score, fraudFlags: checks.flags });
      for (const a of admins) { const n = note(a, "submission", "n.toReview", { name: vol.fullName, title: m.title }, "/admin?tab=review"); tx.set(db.doc(`notifications/${n.id}`), n); }
      return review.decision;
    }
    const pRef = db.doc(`participants/${cur.missionId}_${cur.userId}`);
    let teamSize = 1;
    if (cur.teamId) teamSize = (await tx.get(db.collection("participants").where("missionId", "==", cur.missionId).where("teamId", "==", cur.teamId))).docs.filter((d) => d.data().status === "accepted").length;
    const now = nowIso();
    const res = reviewSubmission({
      submission: { ...cur, checks: checks.checks, fraudScore: checks.score, fraudFlags: checks.flags }, mission: m, volunteer: vol, reviewer: aiReviewer(now),
      organization: null, decision: review.decision, note: aiNote(review), now, newId: randomUUID, origin: process.env.URL ?? "", team: teamSize > 1,
    });
    tx.set(ref, { ...res.submission, aiReview: review, reviewedBy: AI_REVIEWER_ID });
    tx.set(vRef, res.volunteer);
    tx.set(db.doc(`records/${res.record.id}`), res.record);
    for (const c of res.certificates) tx.set(db.doc(`certificates/${c.id}`), c);
    for (const n of res.notifications) tx.set(db.doc(`notifications/${n.id}`), n);
    tx.set(db.doc(`audits/${res.audit.id}`), { ...res.audit, actor: AI_REVIEWER_ID, actorRole: "system" });
    if (participant) tx.update(pRef, review.decision === "approved" ? { completionStatus: "completed", attendance: true } : { completionStatus: "joined" });
    return review.decision;
  });
  return json({ decision });
}

/* ───────────── shop-fulfil ───────────── */

export async function handleShopFulfil(req: Request): Promise<Response> {
  if (!adminApp()) return notConfigured();
  const uid = await caller(req);
  if (!uid) return json({ error: "e.signIn" }, 401);
  if (tooMany(`shop:${uid}`, 10)) return json({ error: "ai.tooMany" }, 429);
  const { orderId } = ((await req.json().catch(() => ({}))) ?? {}) as { orderId?: string };
  if (!orderId) return json({ error: "e.notFound" }, 400);
  const db = adminDb();
  const out = await db.runTransaction(async (tx) => {
    const oRef = db.doc(`orders/${orderId}`);
    const o = (await tx.get(oRef)).data() as Order | undefined;
    if (!o || o.userId !== uid) return { status: 404, body: { error: "e.notFound" } };
    if (o.promoCode || o.status === "fulfilled") return { status: 200, body: { code: o.promoCode ?? null } };
    if (o.status !== "placed" && o.status !== "processing") return { status: 409, body: { error: "sh.e.closed" } };
    const free = await tx.get(db.collection("promoCodes").where("itemId", "==", o.itemId).where("orderId", "==", null).limit(1));
    if (free.empty) return { status: 200, body: { code: null, waiting: true } };
    const c = free.docs[0].data() as PromoCode;
    const t = nowIso();
    tx.update(free.docs[0].ref, { orderId: o.id, userId: uid, issuedAt: t });
    tx.update(oRef, { promoCode: c.code, status: "fulfilled", updatedAt: t });
    const n = note(uid, "reward", "n.promoIssued", { title: o.itemTitle }, "/app/shop?tab=codes");
    tx.set(db.doc(`notifications/${n.id}`), n);
    return { status: 200, body: { code: c.code } };
  });
  return json(out.body, out.status);
}

/* ───────────── telegram-auth ───────────── */

/** Telegram Login Widget check: HMAC-SHA256 of the sorted fields with SHA-256(bot token) as the key. */
export function telegramValid(data: Record<string, string | number>, botToken: string, nowSec = Math.floor(Date.now() / 1000)) {
  const { hash, ...rest } = data;
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return false;
  const check = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const mine = createHmac("sha256", secret).update(check).digest("hex");
  const age = nowSec - Number(rest.auth_date);
  return timingSafeEqual(Buffer.from(mine), Buffer.from(hash)) && age >= 0 && age < 86_400;
}

export async function handleTelegramAuth(req: Request): Promise<Response> {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  if (!bot || !adminApp()) return notConfigured();
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for") ?? "?";
  if (tooMany(`tg:${ip}`, 10)) return json({ error: "ai.tooMany" }, 429);
  const data = ((await req.json().catch(() => null)) ?? {}) as Record<string, string | number>;
  const allowed = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];
  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
  if (!clean.id || !telegramValid(clean, bot)) return json({ error: "e.telegramFailed" }, 401);
  const tgId = String(clean.id);
  const token = await adminAuth().createCustomToken(`tg_${tgId}`, { tg: tgId });
  const name = [clean.first_name, clean.last_name].filter(Boolean).join(" ").slice(0, 80);
  return json({ token, name });
}
