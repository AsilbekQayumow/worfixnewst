import { test } from "node:test";
import assert from "node:assert/strict";
import { gameDay, gameWeek, newPlay, prevDay, roll, type PlayState } from "../game/core";
import { buildHeat, cellOf, chestsForHeat, chestsInCell, eventsInCell, findSpawn, inReach, spawnsAround, SPAWN } from "../game/spawn";
import { canSave, dailyReward, GameError, liveStreak, play, type Ctx } from "../game/engine";
import { questsFor, statsNow } from "../game/quests";
import { COSMETICS, SEASON_TIERS, tierOf, tierReward, tierXp } from "../game/season";
import { battleReward, battles, duelReward, duelScore, settleDuel, type Duel } from "../game/league";
import { ask, isRight, optionOrder, pickQuestion } from "../game/quiz";
import { QUIZ_BANK } from "../game/quiz-bank";
import { gameBadges } from "../game/badges";
import { wrapped } from "../game/wrapped";
import { DISTRICTS, matchDistrict, REGIONS } from "../game/places";

const T0 = Date.parse("2026-11-27T07:00:00Z"); // 12:00 in Tashkent
const D = 86_400_000;
const SAM = { lat: 39.6542, lng: 66.9597 };
const base = (o: Partial<Ctx> = {}): Ctx => ({ now: T0, user: { id: "u1", points: 100, province: "Samarqand Region" }, play: null, bank: QUIZ_BANK, ...o });
const err = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof GameError && e.code === code);

test("days and weeks follow Tashkent time", () => {
  assert.equal(gameDay(Date.parse("2026-11-26T19:30:00Z")), "2026-11-27"); // 00:30 local
  assert.equal(gameWeek(Date.parse("2026-11-27T07:00:00Z")), "2026-11-23");
  assert.equal(prevDay("2026-12-01"), "2026-11-30");
});

test("spawns are deterministic, busier cells get more chests, all within the cell", () => {
  const cell = cellOf(SAM);
  const a = chestsInCell(cell, "2026-11-27"), b = chestsInCell(cell, "2026-11-27");
  assert.deepEqual(a, b);
  assert.equal(a.length, SPAWN.minPerCell);
  assert.equal(chestsForHeat(0), 3);
  assert.ok(chestsForHeat(20) > chestsForHeat(3));
  assert.ok(chestsForHeat(10_000) <= SPAWN.maxPerCell);
  const heat = buildHeat("2026-11-27", Array.from({ length: 30 }, (_, i) => ({ userId: `p${i}`, at: { lat: SAM.lat + 0.0001 * (i % 5), lng: SAM.lng } })));
  const busy = chestsInCell(cell, "2026-11-27", heat);
  assert.ok(busy.length > a.length);
  for (const c of a) assert.equal(cellOf(c.at), cell);
  assert.ok(chestsInCell(cell, "2026-11-28")[0].id !== a[0].id);
  const near = spawnsAround(SAM, T0, heat);
  assert.ok(near.chests.length > 10);
  assert.ok(findSpawn(near.chests[0].id, T0, heat));
  assert.equal(findSpawn(near.chests[0].id, T0 + 2 * D, heat), null, "yesterday's chest is gone");
});

test("events exist only in their 30-minute slot", () => {
  let found = null as null | ReturnType<typeof eventsInCell>[number];
  for (let i = 0; i < 40 && !found; i++) found = eventsInCell(`${7930 + i}:11159`, T0)[0] ?? null;
  assert.ok(found);
  assert.ok(findSpawn(found!.id, T0));
  assert.equal(findSpawn(found!.id, T0 + 31 * 60_000), null);
});

test("reach: 35 m, poor GPS never counts", () => {
  assert.ok(inReach({ ...SAM, acc: 10 }, { lat: SAM.lat + 0.0002, lng: SAM.lng }));
  assert.ok(!inReach({ ...SAM, acc: 10 }, { lat: SAM.lat + 0.001, lng: SAM.lng }));
  assert.ok(!inReach({ ...SAM, acc: 60 }, SAM));
});

test("daily chest: streak grows, a missed day resets it, one save a week", () => {
  let r = play(base(), { t: "daily" });
  assert.equal(r.play.streak, 1);
  assert.equal(r.coins, dailyReward(1).coins);
  err(() => play(base({ play: r.play }), { t: "daily" }), "dailyDone");
  r = play(base({ play: r.play, now: T0 + D }), { t: "daily" });
  assert.equal(r.play.streak, 2);
  let p = r.play; for (let i = 2; i < 6; i++) p = play(base({ play: p, now: T0 + i * D }), { t: "daily" }).play;
  assert.equal(p.streak, 6);
  assert.equal(dailyReward(7).week, true);
  // skip a day
  const later = T0 + 7 * D;
  assert.equal(liveStreak(p, later), 0);
  assert.ok(canSave(p, later));
  err(() => play(base({ play: p, now: later, user: { id: "u1", points: 3, province: "" } }), { t: "save" }), "coins");
  const s = play(base({ play: p, now: later }), { t: "save" });
  assert.equal(s.coins, -25);
  const again = play(base({ play: s.play, now: later }), { t: "daily" });
  assert.equal(again.play.streak, 7);
  assert.equal(again.kind, "week");
  // no second save within the week
  const p2: PlayState = { ...again.play, chestDay: gameDay(later + 2 * D - D * 2), streak: 7 };
  assert.ok(!canSave({ ...p2, chestDay: gameDay(later) }, later + 2 * D));
});

test("chests: must be near, once each, limit per day; quiz chest asks then rewards", () => {
  const { chests } = spawnsAround(SAM, T0, null);
  const plain = chests.find((c) => c.kind === "common" || c.kind === "rare")!;
  err(() => play(base(), { t: "open", id: plain.id, pos: { lat: plain.at.lat + 0.01, lng: plain.at.lng, acc: 5 } }), "far");
  err(() => play(base(), { t: "open", id: plain.id, pos: { ...plain.at, acc: 5, mock: true } }), "mock");
  const r = play(base(), { t: "open", id: plain.id, pos: { ...plain.at, acc: 5 } });
  assert.ok(r.xp > 0 && r.coins > 0);
  err(() => play(base({ play: r.play }), { t: "open", id: plain.id, pos: { ...plain.at, acc: 5 } }), "taken");
  err(() => play(base(), { t: "open", id: "c:2026-11-26:1:1:0", pos: { ...SAM, acc: 5 } }), "gone");
  const quiz = chests.find((c) => c.kind === "quiz")!;
  const q = play(base(), { t: "open", id: quiz.id, pos: { ...quiz.at, acc: 5 } });
  assert.ok(q.quiz && q.quiz.options.length === 4);
  const right = [0, 1, 2, 3].find((i) => isRight(quiz.id, q.quiz!.qid, i))!;
  const a = play(base({ play: q.play }), { t: "answer", choice: right });
  assert.equal(a.right, true);
  assert.equal(a.play.d.quizRight, 1);
  err(() => play(base({ play: a.play }), { t: "answer", choice: 0 }), "noQuiz");
  const full = { ...newPlay("u1", T0), d: { chests: SPAWN.perDay, quizRight: 0, quizAsked: 0, events: 0 } };
  err(() => play(base({ play: full }), { t: "open", id: plain.id, pos: { ...plain.at, acc: 5 } }), "limit");
});

test("boost event doubles chest XP for 30 minutes", () => {
  let ev = null as null | ReturnType<typeof eventsInCell>[number];
  for (let i = 0; i < 80 && !ev; i++) ev = eventsInCell(`${7930 + i}:11159`, T0).find((e) => e.kind === "boost") ?? null;
  assert.ok(ev);
  const r = play(base(), { t: "open", id: ev!.id, pos: { ...ev!.at, acc: 5 } });
  assert.ok(r.boostUntil);
  const c = chestsInCell(ev!.cell, gameDay(T0)).find((x) => x.kind === "common");
  if (c) assert.equal(play(base({ play: r.play }), { t: "open", id: c.id, pos: { ...c.at, acc: 5 } }).xp, 24);
});

test("quests: three a day, two a week; claim only when done", () => {
  const q = questsFor("u1", T0);
  assert.equal(q.daily.length, 3);
  assert.equal(q.weekly.length, 2);
  assert.deepEqual(questsFor("u1", T0), q);
  err(() => play(base(), { t: "quest", id: "d_daily" }), "notYet");
  const d = play(base(), { t: "daily" });
  const c = play(base({ play: d.play }), { t: "quest", id: "d_daily" });
  assert.ok(c.coins > 0);
  err(() => play(base({ play: c.play }), { t: "quest", id: "d_daily" }), "claimed");
  const walk = q.daily.find((x) => x.metric === "walkKm");
  const st = statsNow({ captures: [{ createdAt: new Date(T0 - 3_600_000).toISOString(), distanceM: 2500, gainedM2: 9000 }], joins: [], approvals: [] }, newPlay("u1", T0), T0);
  assert.equal(st.day.walkKm, 2.5);
  assert.equal(st.day.areaM2, 9000);
  if (walk) assert.ok(play(base({ activity: { captures: [{ createdAt: new Date(T0 - 3_600_000).toISOString(), distanceM: 2500, gainedM2: 9000 }], joins: [], approvals: [] } }), { t: "quest", id: walk.id }).coins > 0);
  err(() => play(base(), { t: "quest", id: "w_nope" }), "noQuest");
});

test("season pass: 30 tiers, rewards once, cosmetic items owned and equipped", () => {
  assert.equal(tierOf(0), 0);
  assert.equal(tierOf(tierXp(30)), SEASON_TIERS);
  assert.equal(tierOf(tierXp(5) - 1), 4);
  assert.ok(COSMETICS.filter((c) => c.tier).every((c) => tierReward(c.tier!).item === c.id));
  err(() => play(base(), { t: "tier", n: 1 }), "notYet");
  const r = play(base({ seasonExtra: { missionXp: tierXp(5), areaM2: 0 } }), { t: "tier", n: 5 });
  assert.equal(r.item, "fr_bronze");
  err(() => play(base({ play: r.play, seasonExtra: { missionXp: tierXp(5), areaM2: 0 } }), { t: "tier", n: 5 }), "claimed");
  const e = play(base({ play: r.play }), { t: "equip", slot: "frame", id: "fr_bronze" });
  assert.equal(e.look?.frame, "fr_bronze");
  err(() => play(base({ play: r.play }), { t: "equip", slot: "title", id: "fr_bronze" }), "notOwned");
  err(() => play(base(), { t: "buy", id: "fr_gold" }), "notForSale");
  err(() => play(base({ user: { id: "u1", points: 10, province: "" } }), { t: "buy", id: "fr_leaf" }), "coins");
  const b = play(base(), { t: "buy", id: "fr_leaf" });
  assert.equal(b.coins, -60);
  err(() => play(base({ play: b.play }), { t: "buy", id: "fr_leaf" }), "owned");
});

test("season rolls over every month", () => {
  const p = { ...newPlay("u1", T0), season: { id: "2026-10", xp: 900, claimed: [1, 2] } };
  assert.deepEqual(roll(p, "u1", T0).season, { id: "2026-11", xp: 0, claimed: [] });
});

test("mahalla battle: per member, pairs by rank, rewards only those who took part", () => {
  const members = [
    ...["a1", "a2", "a3", "a4"].map((id) => ({ id, mahalla: "A", mahallaName: "Bog'ishamol MFY", district: "D", districtName: "Samarqand shahri" })),
    ...["b1"].map((id) => ({ id, mahalla: "B", mahallaName: "Navbahor MFY", district: "D", districtName: "Samarqand shahri" })),
    ...["c1", "c2"].map((id) => ({ id, mahalla: "C", mahallaName: "Registon MFY", district: "D", districtName: "Samarqand shahri" })),
  ];
  const act = { area: { a1: 20000, b1: 50000, c1: 1000 }, hours: { a2: 3 }, walkKm: {} };
  const week = "2026-11-16";
  const [bt] = battles(week, members, act, Date.parse("2026-11-24T00:00:00Z"));
  assert.equal(bt.final, true);
  assert.equal(bt.rows[0].key, "B", "one person over three counted members");
  assert.equal(bt.rows[0].rival, "A");
  assert.ok(bt.rows[0].won && bt.rows[0].leader);
  assert.ok(battleReward(bt, "B", true));
  assert.equal(battleReward(bt, "B", false), null);
  assert.equal(battleReward(bt, "A", true), null);
  assert.equal(battles(week, members, act, Date.parse("2026-11-20T00:00:00Z"))[0].final, false);
});

test("duels settle after a week; draws pay a little when someone tried", () => {
  const data = { captures: [{ userId: "a", createdAt: "2026-11-20T10:00:00Z", distanceM: 3000, gainedM2: 7000 }], approvals: [{ userId: "b", reviewedAt: "2026-11-21T10:00:00Z", hours: 2 }] };
  assert.equal(duelScore("area", "a", data, Date.parse("2026-11-19T00:00:00Z"), Date.parse("2026-11-26T00:00:00Z")), 7000);
  assert.equal(duelScore("hours", "b", data, Date.parse("2026-11-19T00:00:00Z"), Date.parse("2026-11-26T00:00:00Z")), 2);
  const d: Duel = { id: "d1", players: ["a", "b"], from: "a", to: "b", metric: "area", status: "active", createdAt: "", start: "2026-11-19T00:00:00Z", end: "2026-11-26T00:00:00Z", scores: { a: 7000, b: 0 }, winner: null, updatedAt: "" };
  assert.equal(settleDuel(d, Date.parse("2026-11-25T00:00:00Z")).status, "active");
  const done = settleDuel(d, Date.parse("2026-11-26T01:00:00Z"));
  assert.equal(done.winner, "a");
  assert.ok(duelReward(done, "a"));
  assert.equal(duelReward(done, "b"), null);
  const r = play(base({ user: { id: "a", points: 0, province: "" }, duel: done }), { t: "duel", id: "d1" });
  assert.equal(r.coins, 40);
  err(() => play(base({ user: { id: "a", points: 0, province: "" }, duel: done, play: r.play }), { t: "duel", id: "d1" }), "claimed");
});

test("quiz bank: unique ids, four distinct options, province names exist; shuffles keep the answer findable", () => {
  const ids = new Set(QUIZ_BANK.map((q) => q[0]));
  assert.equal(ids.size, QUIZ_BANK.length);
  assert.ok(QUIZ_BANK.length >= 150);
  const provinces = new Set(REGIONS.map((r) => r.p));
  for (const q of QUIZ_BANK) {
    assert.equal(q[4].length, 4, q[0]);
    for (let l = 0; l < 3; l++) assert.equal(new Set(q[4].map((o) => o[l])).size, 4, `${q[0]} options repeat`);
    if (q[2]) assert.ok(provinces.has(q[2]), `${q[0]} province ${q[2]}`);
  }
  const order = optionOrder("c:x", "e01");
  assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
  const shown = ask(QUIZ_BANK[0], "c:x");
  const right = order.indexOf(0);
  assert.equal(shown.options[right].uz, QUIZ_BANK[0][4][0][0]);
  const seen = QUIZ_BANK.slice(0, 100).map((q) => q[0]);
  assert.ok(!seen.slice(-60).includes(pickQuestion(QUIZ_BANK, "c:y", seen, "Tashkent")[0]));
});

test("badges and monthly summary", () => {
  const b = gameBadges({ chests: 80, quizRight: 3, best: 7, early: 0, events: 0, battles: 0, tiers: 0 });
  assert.ok(b.find((x) => x.id === "g_chests_75")?.done);
  assert.ok(!b.find((x) => x.id === "g_chests_300")?.done);
  const w = wrapped({ month: "2026-11", approvals: [{ reviewedAt: "2026-11-03T10:00:00Z", hours: 2, xp: 60, category: "environment", impact: { "kg": 12 } }, { reviewedAt: "2026-10-03T10:00:00Z", hours: 5, xp: 60, category: "water", impact: {} }], captures: [], seasonXp: 0, tier: 0, bestStreak: 0 });
  assert.equal(w.missions, 1);
  assert.equal(w.hours, 2);
  assert.equal(w.topCategory, "environment");
  assert.deepEqual(w.impact, [["kg", 12]]);
});

test("places: every region has districts; old free text maps to a district", () => {
  assert.equal(REGIONS.length, 14);
  for (const r of REGIONS) assert.ok(DISTRICTS.some((d) => d.r === r.id), r.uz);
  assert.ok(DISTRICTS.reduce((s, d) => s + d.n, 0) > 9000);
  assert.equal(matchDistrict("Samarqand Region", "Samarqand shahri")?.uz, "Samarqand shahri");
  assert.equal(matchDistrict("Samarqand Region", "Urgut")?.uz, "Urgut tumani");
  assert.equal(matchDistrict("Tashkent", "Chilonzor")?.uz, "Chilonzor tumani");
});
