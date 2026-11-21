import { test, before, after } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, writeBatch } from "firebase/firestore";

let env;
const user = (id, extra = {}) => ({ id, email: `${id}@x.uz`, role: "volunteer", status: "active", xp: 0, points: 0, level: 1, emailVerified: false, fullName: id, ...extra });
const msg = (from, to, extra = {}) => ({ id: "m", chatId: [from, to].sort().join("_"), participants: [from, to].sort(), from, text: "hi", kind: "text", missionId: null, readBy: [from], createdAt: "2026-11-20T00:00:00Z", reactions: {}, replyTo: null, editedAt: null, deletedAt: null, via: null, ...extra });

before(async () => {
  env = await initializeTestEnvironment({ projectId: "worfix-rules", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8085 } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "users/alice"), user("alice", { xp: 500, points: 120, level: 3 }));
    await setDoc(doc(db, "users/bob"), user("bob"));
    await setDoc(doc(db, "users/carol"), user("carol"));
    await setDoc(doc(db, "users/admin"), user("admin", { role: "admin" }));
    await setDoc(doc(db, "friendships/alice_bob"), { id: "alice_bob", from: "alice", to: "bob", status: "accepted" });
    await setDoc(doc(db, "messages/ab1"), msg("alice", "bob", { id: "ab1" }));
    await setDoc(doc(db, "orders/o1"), { id: "o1", userId: "alice", itemId: "i1", price: 50, status: "placed", code: "X" });
  });
});
after(async () => { await env?.cleanup(); });

const as = (id) => env.authenticatedContext(id).firestore();

test("users are never deleted, not even by admins or themselves", async () => {
  await assertFails(deleteDoc(doc(as("alice"), "users/alice")));
  await assertFails(deleteDoc(doc(as("admin"), "users/alice")));
});
test("an existing profile cannot be overwritten with a fresh (xp 0) one", async () => {
  await assertFails(setDoc(doc(as("alice"), "users/alice"), user("alice")));
  let xp = null;
  await env.withSecurityRulesDisabled(async (c) => { xp = (await getDoc(doc(c.firestore(), "users/alice"))).data().xp; });
  assert.equal(xp, 500);
});
test("a missing profile can be recreated by its owner, as a volunteer with no rewards", async () => {
  await assertSucceeds(setDoc(doc(as("dave"), "users/dave"), user("dave")));
  await assertFails(setDoc(doc(as("erin"), "users/erin"), user("erin", { role: "admin" })));
  await assertFails(setDoc(doc(as("erin"), "users/erin"), user("erin", { xp: 999 })));
});
test("owner may mark announcements seen, not change role or XP", async () => {
  await assertSucceeds(updateDoc(doc(as("bob"), "users/bob"), { announcementsSeenAt: "2026-11-20T10:00:00Z" }));
  await assertFails(updateDoc(doc(as("bob"), "users/bob"), { role: "admin" }));
  await assertFails(updateDoc(doc(as("bob"), "users/bob"), { xp: 10000 }));
});
test("messages: friends yes, strangers no, the team yes", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "messages/a2"), msg("alice", "bob", { id: "a2", replyTo: { id: "ab1", from: "alice", text: "hi" } })));
  await assertFails(setDoc(doc(as("carol"), "messages/c1"), msg("carol", "bob", { id: "c1" })));
  await assertSucceeds(setDoc(doc(as("carol"), "messages/c2"), msg("carol", "admin", { id: "c2" })));
  await assertSucceeds(setDoc(doc(as("admin"), "messages/ad1"), msg("admin", "carol", { id: "ad1", via: "admin" })));
  await assertFails(setDoc(doc(as("alice"), "messages/fake"), msg("alice", "bob", { id: "fake", via: "admin" })));
});
test("reactions by either side; edits and deletes only by the sender; documents never removed", async () => {
  await assertSucceeds(updateDoc(doc(as("bob"), "messages/ab1"), { reactions: { "👍": ["bob"] } }));
  await assertFails(updateDoc(doc(as("bob"), "messages/ab1"), { text: "forged" }));
  await assertSucceeds(updateDoc(doc(as("alice"), "messages/ab1"), { text: "hello", editedAt: "2026-11-20T01:00:00Z" }));
  await assertSucceeds(updateDoc(doc(as("alice"), "messages/ab1"), { text: "", deletedAt: "2026-11-20T02:00:00Z", reactions: {} }));
  await assertFails(deleteDoc(doc(as("alice"), "messages/ab1")));
  await assertFails(getDoc(doc(as("carol"), "messages/ab1")));
});
test("announcements: admins write, everyone signed in reads", async () => {
  await assertSucceeds(setDoc(doc(as("admin"), "announcements/n1"), { id: "n1", title: "T", body: "B", audience: "all", link: null, authorId: "admin", createdAt: "2026-11-20T00:00:00Z" }));
  await assertFails(setDoc(doc(as("bob"), "announcements/n2"), { id: "n2", title: "T", body: "B", audience: "all", link: null, authorId: "bob", createdAt: "x" }));
  await assertSucceeds(getDoc(doc(as("bob"), "announcements/n1")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "announcements/n1")));
});
test("admin cancels an order and refunds Fixcoin in one batch", async () => {
  const db = as("admin");
  const b = writeBatch(db);
  b.update(doc(db, "orders/o1"), { status: "cancelled", note: "no size", updatedAt: "x" });
  b.update(doc(db, "users/alice"), { points: 170 });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(as("alice"), "users/alice"), { points: 999 }));
});
test("shop items with a photo: admin only", async () => {
  const item = { id: "i9", title: { uz: "A", ru: "A", en: "A" }, description: { uz: "", ru: "", en: "" }, price: 10, stock: 2, kind: "merch", art: "cap", active: true, image: "data:image/jpeg;base64,AAAA", createdAt: "x" };
  await assertSucceeds(setDoc(doc(as("admin"), "shopItems/i9"), item));
  await assertFails(setDoc(doc(as("bob"), "shopItems/i10"), { ...item, id: "i10" }));
});

/* ───────────── v3 ───────────── */
const group = (id, owner, members, extra = {}) => ({ id, name: "G", description: "", color: "#0a6a2c", ownerId: owner, members, province: "Samarqand Region", district: "Samarqand", mahalla: "Registon", createdAt: "2026-11-20T00:00:00Z", ...extra });
const gmsg = (id, gid, from, extra = {}) => ({ id, groupId: gid, from, text: "salom", kind: "text", signalId: null, readBy: [from], createdAt: "2026-11-20T00:00:00Z", reactions: {}, replyTo: null, editedAt: null, deletedAt: null, ...extra });

test("v3 setup", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "groups/g1"), group("g1", "alice", ["alice", "bob"]));
    await setDoc(doc(db, "groupCodes/WFX-ABCDE"), { id: "WFX-ABCDE", groupId: "g1", createdAt: "x" });
    await setDoc(doc(db, "groupMessages/gm1"), gmsg("gm1", "g1", "alice"));
    await setDoc(doc(db, "news/pub"), { id: "pub", status: "published", title: "t" });
    await setDoc(doc(db, "news/draft"), { id: "draft", status: "draft", title: "t" });
    await setDoc(doc(db, "promoCodes/p1"), { id: "p1", itemId: "i1", code: "SECRET-1", orderId: null, userId: null });
    await setDoc(doc(db, "promoCodes/p2"), { id: "p2", itemId: "i1", code: "SECRET-2", orderId: "o1", userId: "alice" });
    await setDoc(doc(db, "helpSignals/s1"), { id: "s1", userId: "alice", groupId: "g1", status: "open", responders: [], title: "Yordam" });
    await setDoc(doc(db, "submissions/sub1"), { id: "sub1", userId: "carol", missionId: "m1", organizationId: "agent_carol", verificationStatus: "approved", rewardGrantedAt: "x", certificateId: null, reviewedBy: "worfix-ai", aiReview: { decision: "approved", audit: "pending" }, grant: { xp: 60 } });
    await setDoc(doc(db, "submissions/sub2"), { id: "sub2", userId: "carol", missionId: "m2", organizationId: "agent_carol", verificationStatus: "needs_more_info", rewardGrantedAt: null, certificateId: null, reviewedBy: "worfix-ai", aiReview: { decision: "needs_more_info", audit: "pending" } });
  });
});

test("groups: create as yourself only; strangers cannot add themselves without a code", async () => {
  await assertSucceeds(setDoc(doc(as("carol"), "groups/g2"), group("g2", "carol", ["carol"])));
  await assertFails(setDoc(doc(as("carol"), "groups/g3"), group("g3", "carol", ["carol", "bob"])));
  await assertFails(updateDoc(doc(as("dave"), "groups/g1"), { members: ["alice", "bob", "dave"] }));
});
test("groups: joining with a valid code works; a wrong code does not", async () => {
  const d0 = as("dave");
  const bad = writeBatch(d0);
  bad.set(doc(d0, "groupJoins/g1_dave"), { id: "g1_dave", groupId: "g1", userId: "dave", code: "WFX-ZZZZZ", createdAt: "x" });
  bad.update(doc(d0, "groups/g1"), { members: ["alice", "bob", "dave"] });
  await assertFails(bad.commit());
  const db = as("dave");
  const ok = writeBatch(db);
  ok.set(doc(db, "groupJoins/g1_dave"), { id: "g1_dave", groupId: "g1", userId: "dave", code: "WFX-ABCDE", createdAt: "x" });
  ok.update(doc(db, "groups/g1"), { members: ["alice", "bob", "dave"] });
  ok.set(doc(db, "groupMessages/gm-join"), gmsg("gm-join", "g1", "dave", { kind: "system" }));
  await assertSucceeds(ok.commit());
});
test("group codes: looked up by code, not listed by strangers", async () => {
  await assertSucceeds(getDoc(doc(as("erin"), "groupCodes/WFX-ABCDE")));
  const { collection, query, where, getDocs } = await import("firebase/firestore");
  await assertFails(getDocs(query(collection(as("erin"), "groupCodes"), where("groupId", "==", "g1"))));
  await assertSucceeds(getDocs(query(collection(as("bob"), "groupCodes"), where("groupId", "==", "g1"))));
});
test("group chat: members only", async () => {
  await assertSucceeds(getDoc(doc(as("bob"), "groupMessages/gm1")));
  await assertFails(getDoc(doc(as("carol"), "groupMessages/gm1")));
  await assertSucceeds(setDoc(doc(as("bob"), "groupMessages/gm2"), gmsg("gm2", "g1", "bob")));
  await assertFails(setDoc(doc(as("carol"), "groupMessages/gm3"), gmsg("gm3", "g1", "carol")));
  await assertFails(setDoc(doc(as("bob"), "groupMessages/gm4"), gmsg("gm4", "g1", "alice")));
  await assertSucceeds(updateDoc(doc(as("bob"), "groupMessages/gm1"), { reactions: { "👍": ["bob"] } }));
  await assertFails(updateDoc(doc(as("bob"), "groupMessages/gm1"), { text: "forged" }));
});
test("v3.1 group invites in chat: members send with the real code; the friend answers", async () => {
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "friendships/alice_carol"), { id: "alice_carol", from: "alice", to: "carol", status: "accepted" }); });
  const inv = (id, from, to, extra = {}) => msg(from, to, { id, kind: "group_invite", text: "G1", group: { id: "g1", name: "G1", color: "#0a6a2c", code: "WFX-ABCDE" }, inviteStatus: null, ...extra });
  await assertSucceeds(setDoc(doc(as("alice"), "messages/gi1"), inv("gi1", "alice", "carol")));
  await assertFails(setDoc(doc(as("carol"), "messages/gi2"), inv("gi2", "carol", "alice")));
  await assertFails(setDoc(doc(as("alice"), "messages/gi3"), inv("gi3", "alice", "carol", { group: { id: "g1", name: "G1", color: "#0a6a2c", code: "WFX-ZZZZZ" } })));
  await assertFails(setDoc(doc(as("alice"), "messages/gi4"), inv("gi4", "alice", "carol", { inviteStatus: "accepted" })));
  await assertFails(updateDoc(doc(as("alice"), "messages/gi1"), { inviteStatus: "accepted" }));
  await assertFails(updateDoc(doc(as("carol"), "messages/gi1"), { inviteStatus: "maybe" }));
  await assertFails(updateDoc(doc(as("carol"), "messages/gi1"), { inviteStatus: "accepted", text: "x" }));
  await assertSucceeds(updateDoc(doc(as("carol"), "messages/gi1"), { inviteStatus: "declined", readBy: ["alice", "carol"] }));
});
test("groups: a member leaves; the owner cannot add people directly", async () => {
  await assertSucceeds(updateDoc(doc(as("bob"), "groups/g1"), { members: ["alice", "dave"] }));
  await assertFails(updateDoc(doc(as("alice"), "groups/g1"), { members: ["alice", "dave", "carol"] }));
  await assertSucceeds(updateDoc(doc(as("alice"), "groups/g1"), { members: ["alice"], name: "Yangi nom" }));
});
test("help signals: others can only add or remove themselves", async () => {
  await assertSucceeds(updateDoc(doc(as("bob"), "helpSignals/s1"), { responders: ["bob"] }));
  await assertFails(updateDoc(doc(as("bob"), "helpSignals/s1"), { responders: ["bob", "carol"] }));
  await assertFails(updateDoc(doc(as("bob"), "helpSignals/s1"), { status: "closed" }));
  await assertSucceeds(updateDoc(doc(as("alice"), "helpSignals/s1"), { status: "closed" }));
});
test("news: drafts are for admins; only admins write", async () => {
  await assertSucceeds(getDoc(doc(as("bob"), "news/pub")));
  await assertFails(getDoc(doc(as("bob"), "news/draft")));
  await assertSucceeds(getDoc(doc(as("admin"), "news/draft")));
  await assertFails(setDoc(doc(as("bob"), "news/x"), { id: "x", status: "published" }));
  await assertSucceeds(setDoc(doc(as("admin"), "news/x"), { id: "x", status: "published" }));
});
test("promo codes: unissued codes are secret; the buyer sees their own", async () => {
  await assertFails(getDoc(doc(as("bob"), "promoCodes/p1")));
  await assertSucceeds(getDoc(doc(as("alice"), "promoCodes/p2")));
  await assertFails(getDoc(doc(as("bob"), "promoCodes/p2")));
  await assertFails(updateDoc(doc(as("bob"), "promoCodes/p1"), { userId: "bob", orderId: "x" }));
  await assertSucceeds(getDoc(doc(as("admin"), "promoCodes/p1")));
});
test("phone and Telegram: verified flags come only from the sign-in token", async () => {
  const phoneUser = env.authenticatedContext("ph1", { phone_number: "+998901234567" }).firestore();
  await assertSucceeds(setDoc(doc(phoneUser, "users/ph1"), user("ph1", { phoneVerified: true, authProvider: "phone" })));
  await assertFails(setDoc(doc(as("ph2"), "users/ph2"), user("ph2", { phoneVerified: true })));
  const tg = env.authenticatedContext("tg_77", { tg: "77" }).firestore();
  await assertSucceeds(setDoc(doc(tg, "users/tg_77"), user("tg_77", { telegramId: "77" })));
  await assertFails(setDoc(doc(as("tg_78"), "users/tg_78"), user("tg_78", { telegramId: "78" })));
  await assertFails(updateDoc(doc(as("bob"), "users/bob"), { phoneVerified: true }));
});
test("AI review: the volunteer cannot hide or forge the AI decision", async () => {
  await assertFails(updateDoc(doc(as("carol"), "submissions/sub1"), { aiReview: null }));
  await assertFails(updateDoc(doc(as("carol"), "submissions/sub1"), { grant: null }));
  await assertSucceeds(updateDoc(doc(as("carol"), "submissions/sub2"), { aiReview: null, verificationStatus: "pending" }));
  await assertFails(setDoc(doc(as("carol"), "submissions/sub3"), { id: "sub3", userId: "carol", missionId: "m3", organizationId: "agent_carol", verificationStatus: "pending", rewardGrantedAt: null, certificateId: null, aiReview: { decision: "approved" } }));
  await assertFails(setDoc(doc(as("carol"), "submissions/sub4"), { id: "sub4", userId: "carol", missionId: "m3", organizationId: "agent_carol", verificationStatus: "pending", rewardGrantedAt: null, certificateId: null, groupId: "g1" }));
});
test("orders cannot be created with a promo code", async () => {
  await assertFails(setDoc(doc(as("alice"), "orders/o9"), { id: "o9", userId: "alice", itemId: "i1", price: 50, status: "placed", code: "Y", promoCode: "SECRET-1" }));
});
