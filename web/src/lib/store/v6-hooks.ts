"use client";
/**
 * v6: what the existing flows do in addition (called from api.ts inside the same commit):
 * approval → challenge progress and tier rewards, the team bonus, rating prompts; publish → followers.
 * Kept apart from api6.ts so api.ts can use it without an import cycle.
 */
import { amount, counts, isLive, newTiers, progressId } from "../domain/challenges";
import { levelForXp } from "../domain/rewards";
import { teamBonusFor, teamBonusXp } from "../domain/teams";
import { TERRITORY } from "../domain/territory";
import type { Mission, Notification, Submission, UserProfile } from "../domain/types";
import { nowIso, uid, type DB } from "./db";

export function note(db: DB, userId: string, type: Notification["type"], key: string, values: Record<string, unknown>, link: string | null, at = nowIso()) {
  db.notifications.unshift({ id: uid(), userId, type, title: key, message: JSON.stringify(values), link, read: false, createdAt: at });
}

/** Team mates take photos at the same place: their submissions are not "near-duplicate photo" evidence. */
export const othersForChecks = (db: DB, s: Pick<Submission, "id" | "teamId">) =>
  db.submissions.filter((x) => x.id !== s.id && !(s.teamId && x.teamId === s.teamId));

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getTime(); };

/** Runs after review() changed a submission's status. */
export function afterReview(db: DB, s: Submission, wasApproved: boolean) {
  const nowApproved = s.verificationStatus === "approved";
  const mission = db.missions.find((m) => m.id === s.missionId);
  const volunteer = db.users.find((u) => u.id === s.userId);
  if (!mission || !volunteer) return;
  if (nowApproved && !wasApproved) {
    creditChallenges(db, s, mission, volunteer);
    teamBonus(db, s, mission);
    // rating prompts (feature 7): both sides, 14 days
    const org = db.organizations.find((o) => o.id === mission.organizationId);
    if (org && mission.source !== "agent") {
      note(db, volunteer.id, "mission", "n.rateOrg", { title: mission.title, org: org.name }, `/app/missions/${mission.id}?rate=1`);
      note(db, org.ownerId, "mission", "n.rateVol", { title: mission.title, name: volunteer.fullName }, `/org/missions/${mission.id}?rate=1`);
    }
  }
  if (wasApproved && !nowApproved) {
    // revoked: take back what this submission added
    if (s.challengeCredit) {
      const p = db.challengeProgress.find((x) => x.id === progressId(s.challengeCredit!.challengeId, s.userId));
      if (p) { p.value = Math.max(0, p.value - s.challengeCredit.value); p.updatedAt = nowIso(); }
      s.challengeCredit = null;
    }
    if (s.teamBonusXp) {
      volunteer.xp = Math.max(0, volunteer.xp - s.teamBonusXp);
      volunteer.level = levelForXp(volunteer.xp);
      s.teamBonusXp = 0;
      s.teamBonusAt = null;
    }
  }
}

function creditChallenges(db: DB, s: Submission, m: Mission, u: UserProfile) {
  const grant = s.grant ?? { xp: 0, points: 0, hours: Math.round((m.duration / 60) * 100) / 100, impact: {} };
  for (const c of db.challenges) {
    if (c.status !== "live" && !(c.status === "ended" && counts(c, s, m))) continue;
    if (!counts(c, s, m)) continue;
    const add = amount(c.goal.metric, grant);
    if (add <= 0) continue;
    const id = progressId(c.id, u.id);
    let p = db.challengeProgress.find((x) => x.id === id);
    if (!p) { p = { id, challengeId: c.id, userId: u.id, value: 0, tierReached: 0, coins: 0, updatedAt: nowIso() }; db.challengeProgress.push(p); }
    const before = p.value;
    p.value = Math.round((p.value + add) * 10) / 10;
    p.updatedAt = nowIso();
    s.challengeCredit = { challengeId: c.id, value: add };
    const coinsThisMonth = db.challengeProgress.filter((x) => x.userId === u.id && Date.parse(x.updatedAt) >= monthStart()).reduce((a, x) => a + (x.coins ?? 0), 0);
    for (const t of newTiers(c, before, p.value, coinsThisMonth)) {
      if (t.index + 1 <= p.tierReached) continue;
      p.tierReached = t.index + 1;
      p.coins = (p.coins ?? 0) + t.points;
      u.xp += t.xp;
      u.points += t.points;
      u.level = levelForXp(u.xp);
      note(db, u.id, "reward", "n.challengeTier", { tier: t.index + 1, xp: t.xp, points: t.points }, "/app?challenge=1");
    }
    break; // one challenge per submission (the main one first; sponsored ones are separate PromoCode rewards)
  }
  void isLive;
}

function teamBonus(db: DB, s: Submission, m: Mission) {
  if (!s.teamId) return;
  const team = db.participants.filter((p) => p.missionId === m.id && p.teamId === s.teamId && p.status === "accepted");
  const subOf = (userId: string) => db.submissions.find((x) => x.missionId === m.id && x.userId === userId);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekly = (userId: string) => db.submissions.filter((x) => x.userId === userId && x.teamBonusAt && Date.parse(x.teamBonusAt) > weekAgo).length;
  const members = team.map((p) => { const x = subOf(p.userId); return { userId: p.userId, approved: x?.verificationStatus === "approved", startedAt: p.startedAt, bonusAt: x?.teamBonusAt ?? null }; });
  for (const userId of teamBonusFor(members, weekly)) {
    const sub = subOf(userId);
    const u = db.users.find((x) => x.id === userId);
    if (!sub || !u) continue;
    const xp = teamBonusXp(m.rewardXP);
    sub.teamBonusXp = xp;
    sub.teamBonusAt = nowIso();
    u.xp += xp;
    u.level = levelForXp(u.xp);
    note(db, userId, "reward", "n.teamBonus", { xp, title: m.title }, `/app/missions/${m.id}`);
  }
}

/**
 * Feature 12: followers hear about a new mission. Territory owners already got it (the first look); everyone else's
 * notification is dated to when the mission becomes visible to them, so the first look is not spoiled.
 * At most one per organization per person a day: later ones that day are folded into one "N new missions" note.
 */
export function followFanout(db: DB, m: Mission, alreadyTold: Set<string>) {
  const org = db.organizations.find((o) => o.id === m.organizationId);
  if (!org || org.verificationStatus !== "approved") return 0;
  const followers = db.orgFollows.filter((f) => f.orgId === org.id && f.notify);
  const visibleAt = new Date(Date.parse(m.publishedAt ?? nowIso()) + TERRITORY.firstLookHours * 3_600_000).toISOString();
  const dayAgo = Date.now() - 86_400_000;
  let sent = 0;
  for (const f of followers) {
    if (f.userId === org.ownerId) continue;
    const today = db.notifications.find((n) => n.userId === f.userId && n.title.startsWith("n.follow") && n.link === `/app/orgs/${org.id}` && Date.parse(n.createdAt) > dayAgo);
    if (today) {
      const v = JSON.parse(today.message || "{}") as { n?: number };
      today.title = "n.followMany";
      today.message = JSON.stringify({ org: org.name, n: (v.n ?? 1) + 1 });
      today.read = false;
      continue;
    }
    const at = alreadyTold.has(f.userId) ? nowIso() : visibleAt;
    db.notifications.unshift({ id: uid(), userId: f.userId, type: "mission", title: "n.followNew", message: JSON.stringify({ org: org.name, title: m.title, n: 1 }), link: `/app/orgs/${org.id}`, read: false, createdAt: at });
    sent++;
  }
  return sent;
}
