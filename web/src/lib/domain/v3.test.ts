import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAi, reverseGrant, aiNote } from "./ai-review";
import { groupBoard, groupLevel, makeGroupCode, normaliseGroupCode, placeKey, scopeKey, signalAudience, volunteerBoard } from "./community";
import { rankFor, levelTitleKey } from "./rewards";
import type { Group, Mission, Submission, UserProfile, VerificationCheck } from "./types";

const u = (id: string, over: Partial<UserProfile> = {}): UserProfile => ({
  id, email: "", emailVerified: true, fullName: id, username: id, avatar: null, bio: "", country: "Uzbekistan", province: "Samarqand Region", city: "Samarkand",
  languages: [], skills: [], interests: [], feedVisible: true, level: 1, xp: 0, points: 0, trustScore: 50, reputation: 0, streak: 0, lastApprovedDay: null,
  totalVolunteerHours: 0, totalImpact: 0, impact: {}, onboarded: true, organizationId: null, role: "volunteer", status: "active", createdAt: "", updatedAt: "", lastLogin: null,
  district: "Samarqand shahri", mahalla: "Registon", ...over,
});
const sub = (id: string, userId: string, over: Partial<Submission> = {}): Submission => ({
  id, missionId: "m1", userId, organizationId: "o", images: [], videos: [], notes: "", gps: null, gpsConsent: false, timestamp: "2026-11-02T00:00:00Z",
  metadata: { userAgent: "", submissionCount: 1 }, aiConfidence: null, fraudScore: 0, fraudFlags: [], verificationStatus: "approved", reviewedBy: "r",
  reviewedAt: "2026-11-03T00:00:00Z", reviewNote: "", rewardGrantedAt: "x", certificateId: null, ...over,
});
const mission = { id: "m1", rewardXP: 140 } as Mission;

test("rank ladder follows the video: Explorer → Volunteer → Protector → Guardian → Legend", () => {
  assert.equal(rankFor(1), "explorer");
  assert.equal(rankFor(3), "volunteer");
  assert.equal(rankFor(4), "protector");
  assert.equal(rankFor(8), "guardian");
  assert.equal(rankFor(15), "legend");
  assert.equal(levelTitleKey(5), "rank.protector");
});

test("place names compare without case, apostrophes or 'tumani'/'mahallasi'", () => {
  assert.equal(placeKey("Mirzo Ulug‘bek tumani"), placeKey("mirzo ulugbek"));
  assert.equal(placeKey("Registon mahallasi"), placeKey("REGISTON"));
  assert.equal(scopeKey({ province: "Tashkent", district: "Chilonzor", mahalla: "" }, "mahalla"), null);
  assert.ok(scopeKey({ province: "Tashkent", district: "Chilonzor", mahalla: "Navro‘z" }, "mahalla"));
});

test("volunteer board ranks within the area and month", () => {
  const me = u("me", { xp: 100 });
  const users = [me, u("a", { xp: 500 }), u("b", { xp: 300, mahalla: "Boshqa" }), u("c", { xp: 900, province: "Tashkent", district: "Chilonzor" })];
  const subs = [sub("s1", "b", { grant: { xp: 300, points: 0, hours: 0, impact: {} } }), sub("s2", "me")];
  const all = volunteerBoard({ viewer: me, users, submissions: subs, missions: [mission], scope: "mahalla", period: "all", now: "2026-11-20T00:00:00Z" });
  assert.deepEqual(all.rows.map((r) => r.id), ["a", "me"]);
  const district = volunteerBoard({ viewer: me, users, submissions: subs, missions: [mission], scope: "district", period: "month", now: "2026-11-20T00:00:00Z" });
  assert.deepEqual(district.rows.map((r) => [r.id, r.xp]), [["b", 300], ["me", 140]]);
  const country = volunteerBoard({ viewer: me, users, submissions: subs, missions: [mission], scope: "country", period: "all", now: "2026-11-20T00:00:00Z" });
  assert.equal(country.rows[0].id, "c");
  assert.equal(volunteerBoard({ viewer: u("x", { district: "" }), users, submissions: [], missions: [], scope: "district", period: "all", now: "" }).missing, true);
});

test("group XP comes from approved submissions made in the group", () => {
  const g1: Group = { id: "g1", name: "A", description: "", color: "", ownerId: "a", members: ["a"], province: "Samarqand Region", district: "Samarqand shahri", mahalla: "Registon", createdAt: "" };
  const g2: Group = { ...g1, id: "g2", name: "B" };
  const subs = [sub("s1", "a", { groupId: "g1" }), sub("s2", "b", { groupId: "g2", verificationStatus: "pending" })];
  const b = groupBoard({ viewerPlace: g1, myGroupId: "g1", groups: [g1, g2], submissions: subs, missions: [mission], scope: "mahalla", period: "all", now: "2026-11-20T00:00:00Z" });
  assert.deepEqual(b.rows.map((r) => [r.id, r.xp]), [["g1", 140], ["g2", 0]]);
  assert.equal(groupLevel(0), 1);
  assert.ok(groupLevel(3000) > 1);
});

test("group codes are readable and normalise", () => {
  const c = makeGroupCode(() => 0.5);
  assert.match(c, /^WFX-[A-Z0-9]{5}$/);
  assert.equal(normaliseGroupCode(" wfx-ab2cd "), "WFX-AB2CD");
  assert.equal(normaliseGroupCode("ab2cd"), "WFX-AB2CD");
});

test("help signals reach the group and the district, never the author", () => {
  const author = u("me");
  const users = [author, u("near"), u("far", { district: "Urgut" }), u("org", { role: "organization" })];
  const ids = signalAudience(author, users, { members: ["me", "friend"] } as Group);
  assert.deepEqual(ids.sort(), ["friend", "near"]);
});

test("AI decision rule", () => {
  const ok: VerificationCheck[] = [{ id: "photos", result: "pass", detail: "" }];
  assert.equal(decideAi({ confidence: 0.9, summary: "ok", concerns: [], model: "m" }, ok, 0.1, "t").decision, "approved");
  assert.equal(decideAi({ confidence: 0.9, summary: "ok", concerns: [], model: "m" }, [{ id: "duplicate", result: "fail", detail: "" }], 0.1, "t").decision, "rejected");
  assert.equal(decideAi({ confidence: 0.1, summary: "no", concerns: [], model: "m" }, ok, 0.1, "t").decision, "rejected");
  assert.equal(decideAi({ confidence: 0.9, summary: "ok", concerns: [], model: "m" }, ok, 0.7, "t").decision, "escalated");
  assert.equal(decideAi({ confidence: 0.5, summary: "?", concerns: [], model: "m" }, [{ id: "photos", result: "warn", detail: "" }], 0.1, "t").decision, "needs_more_info");
  const none = decideAi(null, ok, 0, "t");
  assert.equal(none.decision, "escalated");
  assert.equal(none.audit, "not_needed");
  assert.ok(aiNote(decideAi({ confidence: 0.1, summary: "", concerns: [], model: "m" }, ok, 0, "t")).length >= 5);
});

test("overturning an approval takes back exactly what it granted", () => {
  const v = u("v", { xp: 440, points: 30, totalVolunteerHours: 5, impact: { trees: 3, kg: 2 }, totalImpact: 5 });
  const r = reverseGrant(v, { xp: 140, points: 40, hours: 2, impact: { trees: 3 } }, [
    { id: "c1", userId: "v", level: 3, revokedAt: null } as never, { id: "c2", userId: "v", level: 2, revokedAt: null } as never,
  ], "now");
  assert.equal(r.volunteer.xp, 300);
  assert.equal(r.volunteer.points, 0);
  assert.equal(r.volunteer.totalVolunteerHours, 3);
  assert.deepEqual(r.volunteer.impact, { kg: 2 });
  assert.equal(r.volunteer.level, 2);
  assert.deepEqual(r.revoked.map((c) => c.id), ["c1"]);
});

