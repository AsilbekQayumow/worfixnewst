import { test } from "node:test";
import assert from "node:assert/strict";
import { reportBlocked, reportPausedUntil, reportQueue, shouldAutoHide, type Report } from "./reports";
import { fairplayOutcome, fairplayScore, trackStats } from "./fairplay";
import { loopAround } from "./territory";
import { dueReminders, matches, quietHours } from "./reminders";
import { teamBonusFor, teamBonusXp, nextLeader } from "./teams";
import { clashes, counts, newTiers, type Challenge } from "./challenges";
import { bayes, orgScore, revealed, validRating, volunteerTrusted, type Rating } from "./ratings";
import { confirmedByMissions, migrateSkills, skillFit, SKILLS, SKILL_GROUPS } from "./skills";
import { canDeclare, canRespond, creditedHours, inArea, unverifiedCluster } from "./emergency";
import { byMonth, longestStreak, yearSummary } from "./diary";
import { captureTimeOk } from "./offline";
import type { Mission, UserProfile } from "./types";

const NOW = Date.parse("2026-11-26T09:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const H = 3_600_000, D = 24 * H;

/* ── 8 reports ── */
const rep = (o: Partial<Report>): Report => ({
  id: Math.random().toString(36), reporterId: "a", targetType: "message", targetId: "m1", targetOwnerId: "x", reason: "spam", note: "",
  snapshot: "", status: "open", decision: null, createdAt: iso(H), ...o,
});

test("reports: once per target, ten a day, paused after three dismissed in a row", () => {
  assert.equal(reportBlocked([rep({})], "message", "m1", NOW), "rpt.e.already");
  assert.equal(reportBlocked(Array.from({ length: 10 }, (_, i) => rep({ targetId: `t${i}` })), "message", "m1", NOW), "rpt.e.daily");
  const dismissed = [1, 2, 3].map((i) => rep({ targetId: `d${i}`, status: "dismissed", createdAt: iso(5 * D), decision: { by: "adm", action: "dismiss", note: "", at: iso(i * H) } }));
  assert.ok(reportPausedUntil(dismissed, NOW));
  assert.equal(reportBlocked(dismissed, "user", "u9", NOW), "rpt.e.paused");
  assert.equal(reportPausedUntil([...dismissed.slice(1), rep({ targetId: "z", status: "actioned", decision: { by: "adm", action: "hide", note: "", at: iso(10 * 60_000) } })], NOW), null);
});

test("reports: queue puts minors, then unsafe, then urgent first; auto-hide needs 5 established reporters", () => {
  const q = reportQueue([
    rep({ targetId: "spam1", reason: "spam", reporterId: "a" }), rep({ targetId: "spam1", reason: "spam", reporterId: "b" }), rep({ targetId: "spam1", reason: "spam", reporterId: "c" }),
    rep({ targetId: "danger", reason: "unsafe" }),
    rep({ targetId: "kid", reason: "other", minor: true }),
    rep({ targetId: "old", status: "dismissed" }),
  ]);
  assert.deepEqual(q.map((x) => x.targetId), ["kid", "danger", "spam1"]);
  assert.equal(q[2].urgent, true);
  const five = ["a", "b", "c", "d", "e"].map((r) => rep({ reporterId: r }));
  assert.equal(shouldAutoHide({ type: "message", reports: five }, () => iso(30 * D), NOW), true);
  assert.equal(shouldAutoHide({ type: "message", reports: five }, (id) => (id === "e" ? iso(D) : iso(30 * D)), NOW), false);
  assert.equal(shouldAutoHide({ type: "user", reports: five }, () => iso(30 * D), NOW), false);
});

/* ── 10 fair play ── */
const C = { lat: 39.6542, lng: 66.9597 };
test("fair play: walking with steps passes; a car, no steps, a mock or flat accuracy do not", () => {
  const walk = loopAround(C, 150, 60, 0, 5);
  const w = trackStats(walk, { steps: 1200, source: "app" });
  const ws = fairplayScore(w);
  assert.equal(ws.score, 0, JSON.stringify(ws));
  assert.equal(fairplayOutcome(w, ws.score, false).mayTake, true);
  const noSteps = trackStats(walk, { steps: 20, source: "app" });
  assert.ok(fairplayScore(noSteps).flags.includes("no_steps"));
  assert.equal(fairplayScore(noSteps, { mode: "assisted" }).score, 0);
  const car = trackStats(loopAround(C, 300, 60, 0, 30), { steps: 0, source: "app" });
  const cs = fairplayScore(car);
  assert.ok(cs.score >= 0.6 && cs.flags.includes("fast"), JSON.stringify(cs));
  assert.equal(fairplayOutcome(car, cs.score, false).blocked, true);
  assert.equal(fairplayOutcome(car, cs.score, true).blocked, false, "shadow mode only records");
  const mock = trackStats(walk, { steps: 1200, mock: true, source: "app" });
  assert.equal(fairplayOutcome(mock, fairplayScore(mock).score, true).blocked, true, "a mock location blocks even in shadow mode");
  const flat = trackStats(walk.map((p) => ({ ...p, acc: 5 })), { source: "app" });
  assert.ok(fairplayScore(flat).flags.includes("flat_accuracy"));
  const web = trackStats(walk, { source: "web" });
  assert.equal(fairplayOutcome(web, 0, false).mayTake, false, "a web walk never takes area from others");
});

/* ── 4 reminders ── */
const user = (o: Partial<UserProfile> & { id: string }): UserProfile => ({
  email: "", emailVerified: true, fullName: o.id, username: o.id, avatar: null, bio: "", country: "Uzbekistan", province: "Samarqand Region", city: "Samarqand",
  languages: [], skills: [], interests: ["environment"], feedVisible: true, level: 1, xp: 0, points: 0, trustScore: 50, reputation: 0, streak: 0, lastApprovedDay: null,
  totalVolunteerHours: 0, totalImpact: 0, impact: {}, onboarded: true, organizationId: null, role: "volunteer", status: "active", createdAt: iso(90 * D), updatedAt: iso(D), lastLogin: null, ...o,
});
const mission = (o: Partial<Mission> & { id: string }): Mission => ({
  organizationId: "o", title: o.id, description: "", category: "environment", difficulty: "easy", rewardXP: 60, rewardPoints: 15, location: "Samarqand, Registon",
  coordinates: null, date: new Date(NOW + 3 * D).toISOString(), deadline: new Date(NOW + 2 * D).toISOString(), duration: 3, capacity: 10, participantsCount: 0,
  status: "published", featured: false, requirements: "", safety: "", equipment: "", impactMetrics: [], moderationNote: "", isDemo: false, createdAt: iso(D), updatedAt: iso(D), ...o,
});

test("reminders: spots and deadline go to matching people nearby, once a day; personal ones respect prefs; dedupe by log", () => {
  const users = [user({ id: "near" }), user({ id: "far", province: "Xorazm Region", city: "Urganch" }), user({ id: "joined" }), user({ id: "muted", notifyPrefs: { mine: false } })];
  const part = (u: string, m: string) => ({ id: `${m}_${u}`, missionId: m, userId: u, joinedAt: iso(D), status: "accepted" as const, attendance: false, completionStatus: "joined" as const });
  const missions = [
    mission({ id: "full9", participantsCount: 9 }),
    mission({ id: "closing", deadline: new Date(NOW + 10 * H).toISOString() }),
    mission({ id: "tomorrow", date: new Date(NOW + 20 * H).toISOString() }),
    mission({ id: "done", date: new Date(NOW - 20 * H).toISOString(), deadline: new Date(NOW - 2 * D).toISOString(), duration: 120 }),
  ];
  const due = dueReminders({ now: NOW, missions, participants: [part("joined", "full9"), part("joined", "tomorrow"), part("muted", "tomorrow"), part("joined", "done")], submissions: [], users, sent: [] });
  const k = due.map((d) => `${d.userId}:${d.missionId}:${d.kind}`).sort();
  assert.deepEqual(k, ["joined:closing:deadline", "joined:done:proof", "joined:tomorrow:soon24", "muted:full9:spots", "near:full9:spots"].sort());
  const again = dueReminders({ now: NOW, missions, participants: [], submissions: [], users: [users[0]], sent: [{ id: "near_full9_spots", userId: "near", kind: "spots", sentAt: iso(H) }] });
  assert.equal(again.length, 0, "the daily discovery cap holds");
  assert.equal(matches(users[1], missions[0]), false);
  assert.equal(quietHours(Date.parse("2026-11-26T18:00:00Z")), true); // 23:00 Tashkent
  assert.equal(quietHours(NOW), false); // 14:00
});

/* ── 2 teams ── */
test("teams: +10% XP for members approved and checked in within 30 min, three a week", () => {
  const t = (m: number) => new Date(NOW + m * 60_000).toISOString();
  const members = [
    { userId: "a", approved: true, startedAt: t(0) }, { userId: "b", approved: true, startedAt: t(20) },
    { userId: "c", approved: true, startedAt: t(90) }, { userId: "d", approved: false, startedAt: t(5) },
  ];
  assert.deepEqual(teamBonusFor(members, () => 0), ["a", "b"]);
  assert.deepEqual(teamBonusFor(members, (u) => (u === "a" ? 3 : 0)), ["b"]);
  assert.deepEqual(teamBonusFor(members.slice(0, 1), () => 0), []);
  assert.equal(teamBonusXp(140), 14);
  assert.equal(nextLeader([{ userId: "a", joinedAt: iso(3 * H) }, { userId: "b", joinedAt: iso(2 * H) }, { userId: "c", joinedAt: iso(H) }], "a"), "b");
});

/* ── 1 challenges ── */
const ch = (o: Partial<Challenge> = {}): Challenge => ({
  id: "c1", title: { uz: "", ru: "", en: "" }, theme: "environment", startsAt: iso(5 * D), endsAt: new Date(NOW + 5 * D).toISOString(),
  goal: { metric: "missions", target: 5, per: "person" }, status: "live", sponsorOrgId: null, createdBy: "adm", createdAt: iso(6 * D),
  tiers: [{ at: 1, rewardXP: 20, rewardPoints: 10, badgeId: "t1" }, { at: 3, rewardXP: 50, rewardPoints: 60, badgeId: "t2" }, { at: 5, rewardXP: 100, rewardPoints: 100, badgeId: "t3" }], ...o,
});
test("challenges: counted by send time and theme; tiers pay once; Fixcoin capped at 150 a month; no overlap", () => {
  assert.equal(counts(ch(), { timestamp: iso(D) }, { category: "environment" }), true);
  assert.equal(counts(ch(), { timestamp: iso(6 * D) }, { category: "environment" }), false);
  assert.equal(counts(ch(), { timestamp: iso(D) }, { category: "animals" }), false);
  assert.deepEqual(newTiers(ch(), 0, 1, 0).map((x) => x.points), [10]);
  assert.deepEqual(newTiers(ch(), 2, 5, 100).map((x) => x.points), [50, 0]);
  assert.equal(newTiers(ch(), 1, 2, 0).length, 0);
  assert.equal(clashes({ id: "c2", startsAt: iso(D), endsAt: new Date(NOW + D).toISOString(), sponsorOrgId: null }, [ch()]), true);
  assert.equal(clashes({ id: "c2", startsAt: iso(D), endsAt: new Date(NOW + D).toISOString(), sponsorOrgId: "org" }, [ch()]), false);
});

/* ── 7 ratings ── */
const rt = (o: Partial<Rating>): Rating => ({ id: Math.random().toString(36), missionId: "m", fromId: "v", toId: "o", kind: "vol_to_org", stars: 5, tags: [], comment: "", hidden: false, createdAt: iso(H), ...o });
test("ratings: Bayesian average, double-blind reveal, trusted badge, validation", () => {
  assert.equal(bayes([]), 4);
  assert.equal(bayes([5, 5]), 4.29);
  const a = rt({}), b = rt({ kind: "org_to_vol", fromId: "owner", toId: "v" });
  assert.equal(revealed(a, [a], iso(D), NOW), false);
  assert.equal(revealed(a, [a, b], iso(D), NOW), true);
  assert.equal(revealed(a, [a], iso(15 * D), NOW), true);
  const s = orgScore([a, rt({ stars: 3, tags: ["safety"] })], "o", NOW);
  assert.equal(s.isNew, true);
  assert.equal(s.tags.safety, 1);
  assert.equal(volunteerTrusted(Array.from({ length: 5 }, () => rt({ kind: "org_to_vol", toId: "v", stars: 5 })), "v"), true);
  assert.equal(volunteerTrusted(Array.from({ length: 4 }, () => rt({ kind: "org_to_vol", toId: "v", stars: 5 })), "v"), false);
  assert.equal(validRating({ stars: 6, tags: [], comment: "" }, "vol_to_org"), "rat.e.stars");
  assert.equal(validRating({ stars: 4, tags: ["punctual"], comment: "" }, "vol_to_org"), "rat.e.tags");
  assert.equal(validRating({ stars: 4, tags: ["safety", "onTime"], comment: "ok" }, "vol_to_org"), null);
});

/* ── 11 skills ── */
test("skills: 40 skills in 10 groups; free text migrates; fit and mission proof", () => {
  assert.equal(SKILLS.length, 40);
  assert.equal(new Set(SKILLS.map((s) => s.group)).size, SKILL_GROUPS.length);
  assert.equal(new Set(SKILLS.map((s) => s.id)).size, 40);
  const m = migrateSkills(["Birinchi yordam", "photography", "juggling"]);
  assert.deepEqual(m.skills.map((s) => s.id), ["first_aid", "photo"]);
  assert.deepEqual(m.other, ["juggling"]);
  const mine = [{ id: "first_aid", level: "expert" as const, proof: "self" as const }];
  assert.equal(skillFit(mine, [{ skillId: "first_aid", required: true }, { skillId: "driving_b", required: false }]), 0.5);
  assert.equal(skillFit(mine, [{ skillId: "driving_b", required: true }]), 0);
  assert.deepEqual(confirmedByMissions([["photo"], ["photo", "video"], ["photo"]]), ["photo"]);
});

/* ── 19 emergency ── */
test("emergency: 3 people within 2 km make a level-2 cluster; who may declare and respond", () => {
  const f = (userId: string, dLat: number) => ({ userId, kind: "flood" as const, location: { lat: C.lat + dLat, lng: C.lng }, createdAt: iso(H) });
  assert.equal(unverifiedCluster([f("a", 0), f("b", 0.005), f("a", 0.001)], NOW), null);
  assert.ok(unverifiedCluster([f("a", 0), f("b", 0.005), f("c", 0.01)], NOW));
  assert.equal(unverifiedCluster([f("a", 0), f("b", 0.005), f("c", 0.05)], NOW), null);
  assert.equal(canDeclare({ role: "admin" }, null), true);
  assert.equal(canDeclare({ role: "organization" }, { verificationStatus: "approved" }), false);
  assert.equal(canDeclare({ role: "organization" }, { verificationStatus: "approved", emergencyPartner: true }), true);
  assert.equal(canRespond(2012, new Date(NOW)), false);
  assert.equal(canRespond(null, new Date(NOW)), true);
  assert.equal(creditedHours(iso(30 * H), iso(0)), 12);
  assert.equal(inArea({ province: "Samarqand Region", city: "" }, { provinces: ["Samarqand viloyati"] }), true);
});

/* ── 5 diary · 15 offline ── */
test("diary: year summary, longest streak, months newest first; offline capture times", () => {
  const e = [{ at: "2026-03-02T10:00:00Z", hours: 2, impact: 5, missions: 1 }, { at: "2026-03-20T10:00:00Z", hours: 1.5, impact: 0, missions: 1 }, { at: "2025-12-01T10:00:00Z", hours: 9, impact: 1, missions: 1 }];
  const y = yearSummary(e, 2026);
  assert.equal(y.hours, 3.5);
  assert.equal(y.months[2], 3.5);
  assert.equal(longestStreak(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05"]), 3);
  assert.deepEqual(byMonth(e).map((x) => x.month), ["2026-03", "2025-12"]);
  const synced = new Date(NOW).toISOString();
  assert.equal(captureTimeOk(iso(2 * H), { syncedAt: synced, startedAt: iso(3 * H) }), true);
  assert.equal(captureTimeOk(new Date(NOW + H).toISOString(), { syncedAt: synced }), false);
  assert.equal(captureTimeOk(iso(80 * H), { syncedAt: synced }), false);
  assert.equal(captureTimeOk(iso(4 * H), { syncedAt: synced, startedAt: iso(3 * H) }), false);
});
