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
