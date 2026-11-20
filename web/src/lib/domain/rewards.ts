import type { Difficulty, ImpactMetric, UserProfile } from "./types";

/**
 * XP depends only on difficulty, so the same kind of effort is always worth the same.
 * Fixcoin also follows difficulty; a streak and teamwork add Fixcoin (never XP).
 */
export const DIFFICULTY_REWARD: Record<Difficulty, { xp: number; coins: number }> = {
  easy: { xp: 60, coins: 15 },
  medium: { xp: 140, coins: 35 },
  hard: { xp: 300, coins: 75 },
};

export const MAX_STREAK_BONUS = 0.25;
export const TEAM_BONUS = 0.1;

/** Reward stored on a mission. Always recomputed from difficulty; clients never supply it. */
export function computeMissionReward(difficulty: Difficulty) {
  const r = DIFFICULTY_REWARD[difficulty];
  return { rewardXP: r.xp, rewardPoints: r.coins };
}

export function streakBonusMultiplier(streak: number) {
  return 1 + Math.min(Math.max(streak, 0) * 0.05, MAX_STREAK_BONUS);
}

/** Level n starts at 100·(n−1)² XP. */
export function levelForXp(xp: number) {
  return Math.floor(Math.sqrt(Math.max(xp, 0) / 100)) + 1;
}

export function xpForLevel(level: number) {
  return 100 * Math.pow(Math.max(level, 1) - 1, 2);
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, start, next, fraction: next === start ? 0 : (xp - start) / (next - start) };
}

/** Levels at which a certificate is issued. */
export const CERTIFICATE_LEVELS = [3, 5, 10, 15, 20, 30, 40, 50, 75, 100] as const;

/** Certificate levels crossed when XP moves from `before` to `after`. */
export function crossedCertificateLevels(xpBefore: number, xpAfter: number) {
  const a = levelForXp(xpBefore);
  const b = levelForXp(xpAfter);
  return CERTIFICATE_LEVELS.filter((l) => l > a && l <= b);
}

export function nextCertificateLevel(level: number) {
  return CERTIFICATE_LEVELS.find((l) => l > level) ?? null;
}

/** i18n key for the rank name of a level. */
export function levelTitleKey(level: number) {
  if (level >= 50) return "rank.legend";
  if (level >= 30) return "rank.guardian";
  if (level >= 15) return "rank.ranger";
  if (level >= 10) return "rank.pathfinder";
  if (level >= 5) return "rank.scout";
  return "rank.newcomer";
}

export function nextStreak(prevStreak: number, lastDay: string | null, today: string) {
  if (!lastDay) return 1;
  if (lastDay === today) return Math.max(prevStreak, 1);
  const diff = Math.round((Date.parse(today) - Date.parse(lastDay)) / 86_400_000);
  return diff === 1 ? prevStreak + 1 : 1;
}

export function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export interface RewardGrant {
  xp: number;
  points: number;
  hours: number;
  impact: Record<string, number>;
}

export function computeGrant(
  mission: { difficulty: Difficulty; duration: number; impactMetrics: ImpactMetric[] },
  user: Pick<UserProfile, "streak">,
  opts: { team?: boolean } = {},
): RewardGrant {
  const base = DIFFICULTY_REWARD[mission.difficulty];
  const mult = streakBonusMultiplier(user.streak) + (opts.team ? TEAM_BONUS : 0);
  const impact: Record<string, number> = {};
  for (const m of mission.impactMetrics) impact[m.label] = (impact[m.label] ?? 0) + m.amountPerVolunteer;
  return {
    xp: base.xp,
    points: Math.round(base.coins * mult),
    hours: Math.round((mission.duration / 60) * 100) / 100,
    impact,
  };
}
