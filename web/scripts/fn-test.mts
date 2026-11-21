/** Emulator test of the Admin-SDK server functions (run by tests/functions). Not part of the app build. */
import assert from "node:assert/strict";
import { handleAiReview, handleShopFulfil } from "../src/lib/server/handlers";
import { adminAuth, adminDb } from "../src/lib/server/admin";

const db = adminDb();
const now = new Date().toISOString();
const vol = { id: "v1", email: "v@x.uz", fullName: "Vol", role: "volunteer", status: "active", xp: 0, points: 0, level: 1, streak: 0, lastApprovedDay: null, totalVolunteerHours: 0, totalImpact: 0, impact: {}, language: "uz" };
await db.doc("users/v1").set(vol);
await db.doc("users/a1").set({ ...vol, id: "a1", role: "admin" });
const img = { kind: "image", dataUrl: "data:image/jpeg;base64,AAAA", sha256: "x", name: "a.jpg", size: 10, phash: "0123456789abcdef", capturedAt: now, source: "camera", stage: "before" };
const img2 = { ...img, sha256: "y", phash: "fedcba9876543210", stage: "after" };
await db.doc("missions/m1").set({ id: "m1", organizationId: "agent_v1", source: "agent", ownerId: "v1", title: "Park", description: "Clean", category: "environment", difficulty: "easy", rewardXP: 60, rewardPoints: 15, duration: 60, coordinates: { lat: 39.65, lng: 66.95 }, date: now, deadline: now, impactMetrics: [{ label: "kg", amountPerVolunteer: 3 }], checklist: ["a"], radiusM: 300, status: "published" });
await db.doc("participants/m1_v1").set({ id: "m1_v1", missionId: "m1", userId: "v1", status: "accepted", startedAt: new Date(Date.now() - 3600_000).toISOString(), startGps: { lat: 39.65, lng: 66.95, accuracy: 10 }, completionStatus: "submitted" });
await db.doc("submissions/s1").set({ id: "s1", missionId: "m1", userId: "v1", organizationId: "agent_v1", images: [img, img2], videos: [], notes: "done", gps: { lat: 39.65, lng: 66.95, accuracy: 10 }, gpsConsent: true, timestamp: now, metadata: { userAgent: "t", submissionCount: 1 }, aiConfidence: null, fraudScore: 0, fraudFlags: [], verificationStatus: "pending", reviewedBy: null, reviewedAt: null, reviewNote: "", rewardGrantedAt: null, certificateId: null, checks: [], checklistDone: ["a"], teamId: null, aiReview: null, grant: null, groupId: null });

const token = async (uid: string) => {
  const custom = await adminAuth().createCustomToken(uid);
  const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  return ((await r.json()) as { idToken: string }).idToken;
};
const call = (fn: (r: Request) => Promise<Response>, uid: string | null, body: unknown) =>
  (uid ? token(uid) : Promise.resolve("")).then((t) => fn(new Request("http://x", { method: "POST", headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(body) })));

assert.equal((await call(handleAiReview, null, { submissionId: "s1" })).status, 401);
const r = await call(handleAiReview, "v1", { submissionId: "s1" });
const body = await r.json();
console.log("ai-review:", r.status, JSON.stringify(body));
const s = (await db.doc("submissions/s1").get()).data()!;
const u = (await db.doc("users/v1").get()).data()!;
console.log("submission:", s.verificationStatus, s.aiReview?.decision, s.aiReview?.audit, "user xp:", u.xp, "points:", u.points);
assert.equal(s.aiReview.decision, body.decision);
if (body.decision === "approved") { assert.equal(s.verificationStatus, "approved"); assert.equal(u.xp, 60); assert.ok(s.grant); }
const again = await (await call(handleAiReview, "v1", { submissionId: "s1" })).json();
assert.equal(again.decision, body.decision);
assert.equal(((await db.doc("users/v1").get()).data()!).xp, u.xp, "second call must not grant twice");

// promo fulfil
await db.doc("shopItems/i1").set({ id: "i1", price: 10, delivery: "promo", stock: 1 });
await db.doc("promoCodes/c1").set({ id: "c1", itemId: "i1", code: "SECRET-1", orderId: null, userId: null });
await db.doc("orders/o1").set({ id: "o1", userId: "v1", itemId: "i1", itemTitle: "Sub", price: 10, code: "X", status: "placed", createdAt: now, promoCode: null });
await db.doc("orders/o2").set({ id: "o2", userId: "v1", itemId: "i1", itemTitle: "Sub", price: 10, code: "Y", status: "placed", createdAt: now, promoCode: null });
const f1 = await (await call(handleShopFulfil, "v1", { orderId: "o1" })).json();
const f2 = await (await call(handleShopFulfil, "v1", { orderId: "o2" })).json();
const fOther = await call(handleShopFulfil, "a1", { orderId: "o2" });
console.log("fulfil:", JSON.stringify(f1), JSON.stringify(f2), fOther.status);
assert.equal(f1.code, "SECRET-1");
assert.equal(f2.code, null);
assert.equal(fOther.status, 404);
assert.equal(((await db.doc("orders/o1").get()).data()!).status, "fulfilled");
console.log("FUNCTIONS OK");
process.exit(0);
