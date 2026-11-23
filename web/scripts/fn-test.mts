/** Emulator test of the server functions and their Firestore client (firestore-rest.ts). Not part of the app build.
 *  Run with FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 NEXT_PUBLIC_FIREBASE_PROJECT_ID=<id> AI_MOCK=1. */
import assert from "node:assert/strict";
import { handleAiReview, handleShopFulfil, runTerritoryDecay } from "../src/lib/server/handlers";
import { adminDb } from "../src/lib/server/admin";
import { encodeShape, loopAround, seasonOf, traceToShape } from "../src/lib/domain/territory";

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

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = async (uid: string) => {
  // The Auth emulator accepts unsigned custom tokens.
  const t = Math.floor(Date.now() / 1000);
  const custom = `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: "fn-test@worfix", sub: "fn-test@worfix", aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat: t, exp: t + 3600, uid })}.`;
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
assert.equal(((await db.doc("promoCodes/c1").get()).data()!).orderId, "o1");

// territory decay: an area with a mission inside that nobody on the owner's side joined for 3 days shrinks
const T = Date.now();
const center = { lat: 39.66, lng: 66.96 };
const cap = traceToShape(loopAround(center, 120, 36, T - 3 * 86_400_000));
assert.ok("shape" in cap);
const season = seasonOf(T);
const old = new Date(T - 3 * 86_400_000).toISOString();
await db.doc(`territories/${season}_v1`).set({ id: `${season}_v1`, userId: "v1", groupId: null, season, shape: encodeShape(cap.shape), areaM2: cap.areaM2, center, bbox: [], captures: 1, lostM2: 0, takenNotice: null, createdAt: old, updatedAt: old, decayCheckedAt: old });
await db.doc("missions/m2").set({ id: "m2", organizationId: "o9", source: "org", title: "Tree", description: "Plant", category: "environment", coordinates: center, date: new Date(T + 7 * 86_400_000).toISOString(), deadline: new Date(T + 8 * 86_400_000).toISOString(), status: "published", publishedAt: old, createdAt: old });
await db.doc("groups/g1").set({ id: "g1", members: ["a1"] });
const dec = await runTerritoryDecay(T);
console.log("decay:", JSON.stringify(dec));
assert.equal(dec.shrunk, 1);
const after = (await db.doc(`territories/${season}_v1`).get()).data()!;
assert.ok(after.areaM2 < cap.areaM2 * 0.95, `area should shrink (${after.areaM2} of ${cap.areaM2})`); // one day past the 48 h grace: −10%
assert.ok(after.lostM2 > 0);
const notes = await db.collection("notifications").where("userId", "==", "v1").get();
assert.ok(notes.docs.some((d) => d.data().title === "n.territoryShrunk"));
assert.equal((await runTerritoryDecay(T)).shrunk, 0, "same day must not shrink twice");

// value round-trip: nested maps, arrays, nulls, doubles, empty map/array, missing doc
await db.doc("misc/x").set({ a: { b: [1, 2.5, null, { c: "d" }], e: {} }, f: [], g: true, h: -3 });
assert.deepEqual((await db.doc("misc/x").get()).data(), { a: { b: [1, 2.5, null, { c: "d" }], e: {} }, f: [], g: true, h: -3 });
assert.equal((await db.doc("misc/none").get()).exists, false);
console.log("FUNCTIONS OK");
process.exit(0);
