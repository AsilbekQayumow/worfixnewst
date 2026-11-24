/** v5: the WORFIX app's server side — widget data, push texts and delivery, the streak reminder. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "./firestore-rest";
import { notificationText, pushNotification, runStreakReminders, sha256 } from "./push";
import { unitRings, widgetData } from "./widget";

/* ───────────── a small in-memory stand-in for the Firestore REST client ───────────── */

type Doc = Record<string, unknown>;
class FakeDb {
  data = new Map<string, Doc>();
  projectId = "worfix3";
  emulator = false;
  token() { return Promise.resolve("access-token"); }
  set(path: string, d: Doc) { this.data.set(path, d); }
  doc(path: string) {
    const db = this;
    return {
      path,
      get id() { return path.split("/").pop()!; },
      async get() { const v = db.data.get(path); return { id: path.split("/").pop()!, exists: v !== undefined, data: () => v, ref: db.doc(path) }; },
      async set(d: Doc) { db.data.set(path, d); },
    };
  }
  collection(name: string, filters: [string, string, unknown][] = [], max = Infinity) {
    const db = this;
    return {
      where: (f: string, op: string, v: unknown) => db.collection(name, [...filters, [f, op, v]], max),
      limit: (n: number) => db.collection(name, filters, n),
      async get() {
        const docs = [...db.data.entries()].filter(([k]) => k.startsWith(`${name}/`) && k.split("/").length === 2)
          .filter(([, d]) => filters.every(([f, op, v]) => op === "==" ? d[f] === v : op === ">=" ? String(d[f] ?? "") >= String(v) : true))
          .slice(0, max)
          .map(([k, d]) => ({ id: k.split("/")[1], exists: true, data: () => d, ref: db.doc(k) }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }
  batch() {
    const db = this;
    const ops: (() => void)[] = [];
    const b = {
      set(ref: { path: string }, d: Doc) { ops.push(() => db.data.set(ref.path, d)); return b; },
      create(ref: { path: string }, d: Doc) {
        ops.push(() => { if (db.data.has(ref.path)) throw new Error("exists"); db.data.set(ref.path, d); });
        return b;
      },
      delete(ref: { path: string }) { ops.push(() => db.data.delete(ref.path)); return b; },
      async commit() { ops.forEach((o) => o()); },
    };
    return b;
  }
}
const asDb = (f: FakeDb) => f as unknown as Firestore;

const NOW = Date.parse("2026-11-24T12:00:00Z");
const user = (id: string, extra: Doc = {}): Doc => ({
  id, fullName: "Dilnoza Karimova", status: "active", role: "volunteer", xp: 450, streak: 4, lastApprovedDay: "2026-11-23", language: "uz", mapColor: null, ...extra,
});

function seed() {
  const db = new FakeDb();
  db.set("users/u1", user("u1"));
  db.set("users/u2", user("u2", { fullName: "Alisher", language: "ru" }));
  // 3 approved missions → stage 2 (sapling)
  for (const i of [1, 2, 3]) db.set(`submissions/s${i}`, { id: `s${i}`, userId: "u1", missionId: "m0", verificationStatus: "approved", reviewedAt: "2026-11-20T10:00:00Z", grant: { hours: 2 } });
  db.set("submissions/s9", { id: "s9", userId: "u2", missionId: "m0", verificationStatus: "approved", reviewedAt: "2026-11-22T10:00:00Z", grant: { hours: 3 } });
  db.set("missions/m1", { id: "m1", title: "Bog'ni tozalash", category: "environment", status: "published", date: "2026-11-30T05:00:00Z", coordinates: { lat: 39.66, lng: 66.96 } });
  db.set("missions/m2", { id: "m2", title: "Uzoqdagi missiya", category: "water", status: "published", date: "2026-11-26T05:00:00Z", coordinates: { lat: 41.3, lng: 69.2 } });
  db.set("missions/m3", { id: "m3", title: "O'tgan missiya", category: "water", status: "published", date: "2026-11-01T05:00:00Z", coordinates: { lat: 39.65, lng: 66.95 } });
  const ring = [[66.95, 39.65], [66.96, 39.65], [66.96, 39.66], [66.95, 39.66], [66.95, 39.65]];
  db.set("territories/2026-11_u1", { id: "2026-11_u1", userId: "u1", season: "2026-11", shape: JSON.stringify([[ring]]), areaM2: 95_000 });
  db.set("territories/2026-11_u2", { id: "2026-11_u2", userId: "u2", season: "2026-11", shape: "", areaM2: 120_000 });
  return db;
}

test("widget data: tree, streak, level, nearest mission, my area and the week, in the user's language", async () => {
  const db = seed();
  const d = (await widgetData(asDb(db), "u1", { lat: 39.655, lng: 66.955 }, NOW))!;
  assert.ok(d);
  assert.equal(d.lang, "uz");
  assert.equal(d.tree.stage, 2);
  assert.equal(d.tree.count, 3);
  assert.equal(d.tree.title, "Yosh ko'chat");
  assert.equal(d.streak.days, 4, "streak alive: last approval yesterday");
  assert.equal(d.streak.safe, false);
  assert.equal(d.streak.hint, "Bugun missiya bajaring");
  assert.equal(d.level.n, 3); // 450 XP → level 3 (400..900)
  assert.ok(d.level.progress > 0 && d.level.progress < 1);
  assert.equal(d.mission?.id, "m1", "the closest upcoming mission, not the far one or the past one");
  assert.match(d.mission!.distance!, /m$|km$/);
  assert.equal(d.mission!.link, "/app/missions/m1");
  assert.equal(d.area?.rank, 2);
  assert.equal(d.area?.rankText, "Bu oy #2");
  assert.ok(d.area!.rings.length === 1 && d.area!.rings[0].every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
  assert.deepEqual({ missions: d.pulse.missions, people: d.pulse.people, hours: d.pulse.hours }, { missions: 4, people: 2, hours: 9 });
  assert.equal(d.labels.join, "Qo'shilish");

  // Russian reader, no area, streak broken (last approval 3 days ago)
  db.set("users/u2", user("u2", { language: "ru", lastApprovedDay: "2026-11-21", streak: 5 }));
  const r = (await widgetData(asDb(db), "u2", null, NOW))!;
  assert.equal(r.streak.days, 0);
  assert.equal(r.area, null);
  assert.equal(r.labels.area, "Моя территория");
  assert.equal(r.mission?.id, "m2", "without a location: the soonest upcoming mission");
  assert.equal(r.mission?.distance, null);

  // A deleted account gets nothing
  db.set("users/u3", user("u3", { status: "deleted" }));
  assert.equal(await widgetData(asDb(db), "u3", null, NOW), null);
});

test("unitRings keeps the shape in a unit box with its aspect", () => {
  const { rings, aspect } = unitRings([[[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]]]);
  assert.equal(rings.length, 1);
  assert.ok(aspect > 1.9 && aspect < 2.1);
  for (const [x, y] of rings[0]) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
});

test("push text: rendered in the reader's language; plain-text v1 notices are not pushed", () => {
  const n = { title: "n.territoryTaken", message: JSON.stringify({ name: "Alisher", area: "1 200 m²", left: "8 000 m²" }) };
  const uz = notificationText(n, "uz")!, ru = notificationText(n, "ru")!;
  assert.ok(uz.title.length > 0 && uz.body.includes("Alisher"));
  assert.notEqual(uz.title, ru.title);
  assert.equal(notificationText({ title: "Hello", message: "plain" }, "uz"), null);
  assert.equal(notificationText({ title: "n.doesNotExist", message: "{}" }, "uz"), null);
});

test("pushNotification: one FCM message per device, once; forgets dead tokens", async () => {
  const db = seed();
  db.set(`pushTokens/${await sha256("tok-a")}`, { userId: "u2", token: "tok-a", platform: "android", updatedAt: "" });
  db.set(`pushTokens/${await sha256("tok-b")}`, { userId: "u2", token: "tok-b", platform: "ios", updatedAt: "" });
  const sent: { url: string; body: { message: { token: string; notification: { title: string; body: string }; data: { link: string }; android: { notification: { channel_id: string } } } } }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ url: String(u), body });
    return body.message.token === "tok-b" ? new Response('{"error":{"status":"NOT_FOUND","message":"UNREGISTERED"}}', { status: 404 }) : Response.json({ name: "ok" });
  }) as typeof fetch;
  try {
    const n = { id: "n1", userId: "u2", type: "system" as const, title: "n.territoryTaken", message: JSON.stringify({ name: "Dilnoza", area: "500 m²", left: "1 000 m²" }), link: "/app/map", read: false, createdAt: new Date().toISOString() };
    assert.equal(await pushNotification(asDb(db), n), 1);
    assert.equal(sent.length, 2);
    assert.match(sent[0].url, /fcm\.googleapis\.com\/v1\/projects\/worfix3\/messages:send/);
    const a = sent.find((s) => s.body.message.token === "tok-a")!.body.message;
    assert.equal(a.data.link, "/app/map");
    assert.equal(a.android.notification.channel_id, "worfix");
    assert.ok(a.notification.body.includes("Dilnoza"), "Russian text for a Russian reader, with the name");
    assert.equal(db.data.has(`pushTokens/${await sha256("tok-b")}`), false, "a dead token is removed");
    // the same notification again: nothing is sent
    assert.equal(await pushNotification(asDb(db), n), 0);
    assert.equal(sent.length, 2);
  } finally {
    globalThis.fetch = real;
  }
});

test("streak reminder: only streaks of 2+ that end tonight, once a day", async () => {
  const db = seed(); // u1: streak 4, last approval yesterday → reminded; u2 same day but streak 4 → also reminded
  db.set("users/u2", user("u2", { streak: 1, lastApprovedDay: "2026-11-23" }));
  db.set("users/u4", user("u4", { streak: 6, lastApprovedDay: "2026-11-24" })); // already safe today
  db.set(`pushTokens/${await sha256("tok-u1")}`, { userId: "u1", token: "tok-u1", platform: "android", updatedAt: "" });
  const sent: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => { sent.push(String(init?.body)); return Response.json({}); }) as typeof fetch;
  try {
    const r = await runStreakReminders(NOW, asDb(db));
    assert.deepEqual(r, { day: "2026-11-24", candidates: 2, sent: 1 });
    assert.match(sent[0], /4 kunlik seriyangiz bugun tugaydi/);
    const again = await runStreakReminders(NOW, asDb(db));
    assert.equal((again as { sent: number }).sent, 0);
  } finally {
    globalThis.fetch = real;
  }
});
