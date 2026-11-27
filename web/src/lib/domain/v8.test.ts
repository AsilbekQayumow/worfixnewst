import { test } from "node:test";
import assert from "node:assert/strict";
import { adventDay, countdown, comingYear, isWinter, newYearAt, tashkent } from "../season/winter";
import { play, GameError } from "../game/engine";
import { adventReward, COSMETICS, tierReward } from "../game/season";
import { usernameProblem, validateLogin } from "./validation";

const T = (iso: string) => Date.parse(iso);

test("v8: the season window and the countdown run on Tashkent time", () => {
  assert.equal(isWinter(T("2026-11-19T18:59:00Z")), false, "19 Nov 23:59 Tashkent");
  assert.equal(isWinter(T("2026-11-19T19:00:00Z")), true, "20 Nov 00:00 Tashkent");
  assert.equal(isWinter(T("2027-01-14T18:00:00Z")), true);
  assert.equal(isWinter(T("2027-01-14T19:00:00Z")), false, "15 Jan 00:00 Tashkent");
  // midnight of 1 January 2027 in Tashkent is 31 Dec 19:00 UTC
  assert.equal(new Date(newYearAt(T("2026-11-27T12:00:00Z"))).toISOString(), "2026-12-31T19:00:00.000Z");
  assert.equal(comingYear(T("2026-11-27T12:00:00Z")), 2027);
  const c = countdown(T("2026-12-31T18:58:30Z"));
  assert.deepEqual([c.days, c.hours, c.minutes, c.seconds, c.arrived], [0, 0, 1, 30, false]);
  assert.equal(countdown(T("2027-01-01T03:00:00Z")).arrived, true, "the first days of January: it has arrived");
  assert.equal(tashkent(T("2026-12-31T19:00:00Z")).y, 2027);
  assert.equal(adventDay(T("2026-11-30T19:00:00Z")), 1);
  assert.equal(adventDay(T("2026-11-30T18:59:00Z")), 0);
});

test("v8: the gift calendar gives one gift a day in December and never twice", () => {
  const user = { id: "u1", points: 0, province: "" };
  assert.throws(() => play({ now: T("2026-11-27T10:00:00Z"), user, play: null }, { t: "advent" }), (e: unknown) => e instanceof GameError && e.code === "notYet");
  const d3 = T("2026-12-03T06:00:00Z");
  const r = play({ now: d3, user, play: null }, { t: "advent" });
  assert.equal(r.coins, adventReward(3).coins);
  assert.equal(r.item, "fl_snow");
  assert.ok(r.play.owned.includes("fl_snow"));
  assert.throws(() => play({ now: d3 + 3_600_000, user, play: r.play }, { t: "advent" }), (e: unknown) => e instanceof GameError && e.code === "claimed");
  const next = play({ now: d3 + 86_400_000, user, play: r.play }, { t: "advent" });
  assert.deepEqual(next.play.advent, ["2026-12-03", "2026-12-04"]);
  assert.equal(adventReward(31).xp, 250);
  // calendar looks are not for sale and do not collide with season tiers
  for (const c of COSMETICS.filter((x) => x.advent)) {
    assert.equal(c.price, null);
    assert.equal(c.tier, null);
    assert.throws(() => play({ now: d3, user: { ...user, points: 9999 }, play: null }, { t: "buy", id: c.id }));
  }
  assert.ok(COSMETICS.filter((c) => c.tier).every((c) => tierReward(c.tier!).item === c.id));
});

test("v8: usernames", () => {
  assert.equal(usernameProblem("dilnoza_01"), null);
  assert.equal(usernameProblem("ab"), "v.username");
  assert.equal(usernameProblem("worfix_team"), "v.usernameReserved");
  assert.equal(usernameProblem("user_1a2b3c4d"), "v.usernameReserved");
  const r = validateLogin({ email: "Old@Mail.uz", password: "x1" });
  assert.ok(r.ok && r.data.email === "old@mail.uz", "the old field name still works (saved biometric logins)");
});
