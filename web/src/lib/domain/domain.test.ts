import assert from "node:assert/strict";
import { test } from "node:test";
import { ACHIEVEMENTS, computeAchievements, type AchievementStats } from "./achievements";
import { distanceM, hammingHex, runChecks } from "./checks";
import { computeGrant, computeMissionReward, crossedCertificateLevels, DIFFICULTY_REWARD, levelForXp } from "./rewards";
import { canReviewSubmission } from "./permissions";
import { reviewSubmission } from "./verification";
import { validateMission, validatePersonal, validateRegister } from "./validation";
import type { Mission, Submission, UserProfile } from "./types";

const now = "2026-11-19T10:00:00.000Z";
let n = 0;
const id = () => `id${++n}`;

function user(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: id(), email: "a@b.uz", emailVerified: true, fullName: "Test User", username: "test", avatar: null, bio: "", country: "Uzbekistan", province: "", city: "Samarkand",
    languages: [], skills: [], interests: ["environment"], feedVisible: true, level: 1, xp: 0, points: 0, trustScore: 50, reputation: 0, streak: 0, lastApprovedDay: null,
    totalVolunteerHours: 0, totalImpact: 0, impact: {}, onboarded: true, organizationId: null, role: "volunteer", status: "active", createdAt: now, updatedAt: now, lastLogin: null, ...over,
  };
}

function mission(over: Partial<Mission> = {}): Mission {
  return {
    id: id(), organizationId: "org1", title: "Plant trees", description: "x".repeat(40), category: "environment", difficulty: "medium", ...computeMissionReward("medium"),
    location: "Park", coordinates: { lat: 39.6542, lng: 66.9597 }, date: "2026-11-19T08:00:00.000Z", deadline: "2026-11-18T08:00:00.000Z", duration: 120, capacity: 10,
    participantsCount: 1, status: "published", featured: false, requirements: "", safety: "Be careful out there", equipment: "", impactMetrics: [{ label: "trees", amountPerVolunteer: 3 }],
    moderationNote: "", isDemo: false, createdAt: now, updatedAt: now, radiusM: 300, checklist: ["a", "b"], ...over,
  };
}

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: id(), missionId: "m", userId: "u", organizationId: "org1", images: [], videos: [], notes: "", gps: null, gpsConsent: false, timestamp: now,
    metadata: { userAgent: "t", submissionCount: 1 }, aiConfidence: null, fraudScore: 0, fraudFlags: [], verificationStatus: "pending", reviewedBy: null,
    reviewedAt: null, reviewNote: "", rewardGrantedAt: null, certificateId: null, ...over,
  };
}

test("there are exactly 54 achievements with unique ids", () => {
  assert.equal(ACHIEVEMENTS.length, 54);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 54);
  for (const a of ACHIEVEMENTS) for (const l of ["uz", "ru", "en"] as const) assert.ok(a.title[l].length > 0, `${a.id} ${l}`);
});

test("achievements unlock from stats", () => {
  const s: AchievementStats = {
    approvedMissions: 5, hours: 12, level: 5, streak: 3, totalImpact: 10, perCategory: { environment: 3, water: 2, animals: 1 }, friends: 1, certificates: 1,
    cheersGiven: 0, cheersReceived: 0, profileComplete: true, hardMissions: 1, teamMissions: 1, agentMissions: 0, purchases: 0,
  };
  const got = new Set(computeAchievements(s).filter((a) => a.unlocked).map((a) => a.id));
  for (const k of ["missions_1", "missions_3", "missions_5", "hours_5", "hours_10", "streak_3", "level_3", "level_5", "cause_environment", "cause_water", "explorer_3", "impact_10", "friends_1", "certificates_1", "profile_1", "hard_1", "team_1"]) assert.ok(got.has(k), k);
  assert.ok(!got.has("missions_10"));
  assert.ok(!got.has("shop_1"));
});

test("XP is set by difficulty only", () => {
  assert.deepEqual(computeMissionReward("easy"), { rewardXP: DIFFICULTY_REWARD.easy.xp, rewardPoints: DIFFICULTY_REWARD.easy.coins });
  const long = computeGrant({ difficulty: "hard", duration: 600, impactMetrics: [] }, { streak: 5 });
  const short = computeGrant({ difficulty: "hard", duration: 30, impactMetrics: [] }, { streak: 0 });
  assert.equal(long.xp, short.xp);
  assert.equal(long.xp, 300);
  assert.ok(long.points > short.points, "streak adds Fixcoin, not XP");
  assert.ok(DIFFICULTY_REWARD.easy.xp < DIFFICULTY_REWARD.medium.xp && DIFFICULTY_REWARD.medium.xp < DIFFICULTY_REWARD.hard.xp);
});

test("certificate levels are crossed by XP", () => {
  assert.equal(levelForXp(399), 2);
  assert.equal(levelForXp(400), 3);
  assert.deepEqual(crossedCertificateLevels(300, 440), [3]);
  assert.deepEqual(crossedCertificateLevels(440, 500), []);
  assert.deepEqual(crossedCertificateLevels(0, 1600), [3, 5]);
});

test("approval issues a level certificate only when a level is reached", () => {
  const reviewer = user({ role: "organization", organizationId: "org1" });
  const org = { verificationStatus: "approved" as const };
  const m = mission();
  const vol = user({ xp: 300, level: 2 });
  const first = reviewSubmission({ submission: submission({ userId: vol.id }), mission: m, volunteer: vol, reviewer, organization: { ...org } as never, decision: "approved", note: "", now, newId: id, origin: "https://x", team: false });
  assert.equal(first.volunteer.xp, 440);
  assert.equal(first.certificates.length, 1);
  assert.equal(first.certificates[0].certificateType, "level");
  assert.equal(first.certificates[0].level, 3);
  const second = reviewSubmission({ submission: submission({ userId: vol.id }), mission: m, volunteer: first.volunteer, reviewer, organization: { ...org } as never, decision: "approved", note: "", now, newId: id, origin: "https://x", team: true });
  assert.equal(second.certificates.length, 0, "no certificate per mission");
  assert.ok(second.volunteer.points - first.volunteer.points > DIFFICULTY_REWARD.medium.coins, "team bonus");
});

test("agent missions are reviewed by admins, not organizations", () => {
  const sub = { userId: "v", organizationId: "agent_v" };
  assert.equal(canReviewSubmission({ id: "o", role: "organization", organizationId: "agent_v", status: "active" }, sub, null), false);
  assert.equal(canReviewSubmission({ id: "a", role: "admin", organizationId: null, status: "active" }, sub, null), true);
  assert.equal(canReviewSubmission({ id: "v", role: "admin", organizationId: null, status: "active" }, sub, null), false);
});

test("verification checks catch duplicates and far GPS", () => {
  const m = mission();
  const img = (sha: string, phash: string) => ({ kind: "image" as const, dataUrl: "", sha256: sha, name: "p", size: 1, phash, capturedAt: "2026-11-19T09:00:00.000Z", exifGps: null, source: "camera" as const });
  const clean = runChecks({
    submission: { images: [img("a", "ffffffff00000000"), img("b", "0f0f0f0f0f0f0f0f")], gps: { lat: 39.6545, lng: 66.96, accuracy: 20 }, timestamp: now, userId: "u", checklistDone: ["a", "b"], aiConfidence: 0.9 },
    mission: m, participant: { startedAt: "2026-11-19T08:05:00.000Z", startGps: { lat: 39.6542, lng: 66.9597, accuracy: 10 } }, others: [],
  });
  assert.ok(clean.score < 0.15, `clean score ${clean.score}`);
  const bad = runChecks({
    submission: { images: [img("c", "ffffffff00000001")], gps: { lat: 41.3, lng: 69.28, accuracy: 20 }, timestamp: now, userId: "u", checklistDone: [], aiConfidence: 0.2 },
    mission: m, participant: null, others: [{ userId: "other", images: [img("zz", "ffffffff00000000")] }],
  });
  assert.equal(bad.checks.find((c) => c.id === "duplicate")?.result, "fail");
  assert.equal(bad.checks.find((c) => c.id === "deviceLocation")?.result, "fail");
  assert.ok(bad.score > 0.6, `bad score ${bad.score}`);
});

test("geo helpers", () => {
  assert.equal(hammingHex("ff", "fe"), 1);
  const d = distanceM({ lat: 39.6542, lng: 66.9597 }, { lat: 41.2995, lng: 69.2401 });
  assert.ok(d > 260_000 && d < 280_000, String(d));
});

test("validation", () => {
  const ok = validateRegister({ fullName: "Ali Valiyev", email: "ALI@x.uz", password: "secret123", accountType: "volunteer", ageConfirmed: true, guardianConsent: false, birthYear: 2000 });
  assert.ok(ok.ok && ok.data.email === "ali@x.uz");
  const young = validateRegister({ fullName: "Ali", email: "a@x.uz", password: "secret123", accountType: "volunteer", ageConfirmed: true, guardianConsent: false, birthYear: new Date().getFullYear() - 12 });
  assert.ok(!young.ok && young.errors.birthYear === "v.age15");
  const org = validateRegister({ fullName: "Ali", email: "a@x.uz", password: "secret123", accountType: "organization", organization: { name: "", organizationType: "", description: "", email: "", phone: "", website: "", address: "", country: "", city: "" } });
  assert.ok(!org.ok && org.errors["org.name"]);
  const m = validateMission({ title: "Short", description: "x".repeat(40), category: "water", difficulty: "hard", location: "Canal", lat: 1, lng: 2, date: "2026-12-01T09:00", deadline: "2026-12-02T09:00", duration: 60, capacity: 5, safety: "Wear gloves please", radiusM: 300 });
  assert.ok(!m.ok && m.errors.deadline === "v.deadline");
  const p = validatePersonal({ phone: "+998 90 123 45 67", birthYear: 2001, language: "ru", privacy: "private", feedVisible: true });
  assert.ok(p.ok && p.data.feedVisible === false, "private hides from feed");
});
