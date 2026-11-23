/**
 * Server functions that need the Firebase Admin SDK (see admin.ts):
 *  • ai-review   — the AI reviews an agent-mission submission and the decision (with rewards) is written here;
 *  • shop-fulfil — gives a paid promo-code order the next free code;
 *  • territory-decay — daily: areas with ignored missions inside shrink;
 */
import { randomUUID } from "node:crypto";
import { aiMock, verifyPhotos } from "../ai/handlers";
import { AiError } from "../ai/server";
import { aiNote, aiReviewer, AI_REVIEWER_ID, decideAi, type AiVerdict } from "../domain/ai-review";
import { runChecks } from "../domain/checks";
import { isAgentOrg } from "../domain/permissions";
import { reviewSubmission } from "../domain/verification";
import { LANGS, type Lang, type Mission, type MissionParticipant, type Notification, type Order, type PromoCode, type Submission, type Territory, type UserProfile } from "../domain/types";
import { bboxOf, centerOf, contains, decay, decodeShape, encodeShape, seasonOf, shapeArea, TERRITORY } from "../domain/territory";
import { adminDb, adminReady, caller, notConfigured, tooMany } from "./admin";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const nowIso = () => new Date().toISOString();
const note = (userId: string, type: Notification["type"], key: string, values: Record<string, unknown>, link: string): Notification =>
  ({ id: randomUUID(), userId, type, title: key, message: JSON.stringify(values), link, read: false, createdAt: nowIso() });

/* ───────────── ai-review ───────────── */

export async function handleAiReview(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
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
      organization: null, decision: review.decision, note: aiNote(review), now, newId: randomUUID, origin: process.env.URL ?? process.env.SITE_URL ?? "", team: teamSize > 1,
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
  if (!adminReady()) return notConfigured();
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

/* ───────────── territory-decay (daily) ───────────── */

/**
 * Once a day: every area this month with an open mission inside that nobody on the owner's side joined
 * within the grace period loses 10% a day. Same rules as the app (domain/territory.ts).
 */
export async function runTerritoryDecay(now = Date.now()) {
  if (!adminReady()) return { skipped: "not configured" };
  const db = adminDb();
  const season = seasonOf(now);
  const [tSnap, mSnap, gSnap] = await Promise.all([
    db.collection("territories").where("season", "==", season).get(),
    db.collection("missions").where("status", "==", "published").get(),
    db.collection("groups").get(),
  ]);
  const missions = mSnap.docs.map((d) => d.data() as Mission).filter((m) => m.source !== "agent" && m.coordinates && Date.parse(m.date) > now);
  const groups = gSnap.docs.map((d) => d.data() as { id: string; members: string[] });
  const joinedBy = new Map<string, Set<string>>();
  let changed = 0;
  for (const doc of tSnap.docs) {
    const t = doc.data() as Territory;
    const shape = decodeShape(t.shape);
    if (!shape || t.areaM2 <= 0) continue;
    const g = groups.find((x) => x.members.includes(t.userId));
    const side = new Set(g ? g.members : [t.userId]);
    const due: string[] = [];
    for (const m of missions) {
      if (!contains(shape, m.coordinates)) continue;
      if (!joinedBy.has(m.id)) {
        const ps = await db.collection("participants").where("missionId", "==", m.id).get();
        joinedBy.set(m.id, new Set(ps.docs.map((d) => d.data() as MissionParticipant).filter((p) => p.status === "accepted").map((p) => p.userId)));
      }
      if ([...joinedBy.get(m.id)!].some((u) => side.has(u))) continue;
      const at = Date.parse(m.publishedAt ?? m.createdAt) + TERRITORY.graceHours * 3_600_000;
      if (at <= now) due.push(new Date(at).toISOString());
    }
    const r = decay(shape, t.decayCheckedAt, due, now);
    if (!r.days) continue;
    const area = shapeArea(r.shape);
    const lost = t.areaM2 - area;
    const n = note(t.userId, "system", "n.territoryShrunk", { area: `${Math.round(lost).toLocaleString("en-US").replace(/,/g, " ")} m²`, days: r.days }, "/app/map");
    const batch = db.batch();
    batch.update(doc.ref, {
      shape: r.shape ? encodeShape(r.shape) : "", areaM2: area, center: r.shape ? centerOf(r.shape) : null, bbox: r.shape ? bboxOf(r.shape) : [],
      lostM2: t.lostM2 + lost, decayCheckedAt: r.checkedAt, updatedAt: nowIso(),
    });
    batch.set(db.doc(`notifications/${n.id}`), n);
    await batch.commit();
    changed += 1;
  }
  return { season, checked: tSnap.size, shrunk: changed };
}
