/**
 * v6 · Feature 1: seasonal challenges. One theme (a category) for a week or a month; progress counts approved
 * missions, hours or impact sent inside the window (Tashkent time). Three tiers; a tier's reward is given at the
 * moment of approval (reviewers may add Fixcoin, so there is no "claim" button). Challenge Fixcoin is capped at
 * 150 a month per person. At most one main and one sponsored challenge run at a time.
 */
import type { Category } from "./types";

export type ChallengeMetric = "missions" | "hours" | "impact";
export interface ChallengeTier { at: number; rewardXP: number; rewardPoints: number; badgeId: string }
export interface Challenge {
  id: string;
  title: { uz: string; ru: string; en: string };
  theme: Category;
  startsAt: string;
  endsAt: string;
  goal: { metric: ChallengeMetric; target: number; per: "person" | "community" };
  tiers: [ChallengeTier, ChallengeTier, ChallengeTier];
  sponsorOrgId: string | null;
  status: "draft" | "live" | "ended";
  /** community goals: summed by the cron once an hour, never by every approval */
  communityValue?: number;
  createdBy: string;
  createdAt: string;
}
export interface ChallengeProgress { id: string; challengeId: string; userId: string; value: number; tierReached: number; coins: number; updatedAt: string }

export const CHALLENGE = { monthlyCoinCap: 150 } as const;
export const progressId = (challengeId: string, userId: string) => `${challengeId}_${userId}`;

export const isLive = (c: Pick<Challenge, "status" | "startsAt" | "endsAt">, now = Date.now()) =>
  c.status === "live" && Date.parse(c.startsAt) <= now && now < Date.parse(c.endsAt);

/** A submission counts by when it was sent, not when it was approved. */
export function counts(c: Pick<Challenge, "theme" | "startsAt" | "endsAt" | "status">, sub: { timestamp: string }, mission: { category: Category }) {
  if (c.status === "draft") return false;
  const t = Date.parse(sub.timestamp);
  return mission.category === c.theme && t >= Date.parse(c.startsAt) && t < Date.parse(c.endsAt);
}

export function amount(metric: ChallengeMetric, grant: { hours: number; impact: Record<string, number> }) {
  if (metric === "missions") return 1;
  if (metric === "hours") return grant.hours;
  return Object.values(grant.impact).reduce((a, b) => a + b, 0);
}

/** Tiers newly reached when the value goes from `before` to `after`, with what each pays (Fixcoin capped). */
export function newTiers(c: Pick<Challenge, "tiers">, before: number, after: number, coinsThisMonth: number) {
  const out: { index: number; tier: ChallengeTier; xp: number; points: number }[] = [];
  let left = Math.max(0, CHALLENGE.monthlyCoinCap - coinsThisMonth);
  c.tiers.forEach((tier, index) => {
    if (before < tier.at && after >= tier.at) {
      const points = Math.min(tier.rewardPoints, left);
      left -= points;
      out.push({ index, tier, xp: tier.rewardXP, points });
    }
  });
  return out;
}

/** A new live challenge must not overlap another of the same kind (main or sponsored). */
export function clashes(next: Pick<Challenge, "id" | "startsAt" | "endsAt" | "sponsorOrgId">, others: Challenge[]) {
  const s = Date.parse(next.startsAt), e = Date.parse(next.endsAt);
  return others.some((c) => c.id !== next.id && c.status !== "draft" && c.status !== "ended" && Boolean(c.sponsorOrgId) === Boolean(next.sponsorOrgId)
    && Date.parse(c.startsAt) < e && s < Date.parse(c.endsAt));
}

export const daysLeft = (c: Pick<Challenge, "endsAt">, now = Date.now()) => Math.max(0, Math.ceil((Date.parse(c.endsAt) - now) / 86_400_000));
