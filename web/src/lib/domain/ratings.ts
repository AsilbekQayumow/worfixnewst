/**
 * v6 · Feature 7: two-way ratings. After an approved mission the volunteer rates the organization and the
 * organization rates the volunteer: 1–5 stars, 2–3 tags, an optional note. Double-blind: neither side sees a rating
 * until both have rated or 14 days have passed. An organization's score is a Bayesian average over 12 months, so one
 * or two 5-star ratings cannot put a new organization on top.
 */
export type RatingKind = "vol_to_org" | "org_to_vol";
export interface Rating {
  id: string;
  missionId: string;
  fromId: string;
  /** the organization id (vol_to_org) or the volunteer's user id (org_to_vol) */
  toId: string;
  kind: RatingKind;
  stars: number;
  tags: string[];
  comment: string;
  hidden: boolean;
  createdAt: string;
}

export const ORG_TAGS = ["organized", "safety", "onTime", "friendly"] as const;
export const VOL_TAGS = ["responsible", "punctual", "teamPlayer"] as const;
export const RATING = { windowDays: 14, commentMax: 300, prior: 4.0, priorWeight: 5, months: 12, newBelow: 5, trustedAvg: 4.5, trustedMin: 5, maxTags: 3 } as const;

export const ratingId = (missionId: string, fromId: string, toId: string) => `${missionId}_${fromId}_${toId}`;

/** Is the rating window still open, counted from the approval? */
export const ratingOpen = (approvedAt: string, now = Date.now()) => now - Date.parse(approvedAt) < RATING.windowDays * 86_400_000;

/** Ratings become visible once both sides of the same mission rated each other, or the window has closed. */
export function revealed(r: Rating, all: Rating[], approvedAt: string | null, now = Date.now()) {
  if (r.hidden) return false;
  if (approvedAt && !ratingOpen(approvedAt, now)) return true;
  if (!approvedAt && now - Date.parse(r.createdAt) >= RATING.windowDays * 86_400_000) return true;
  return all.some((x) => x.missionId === r.missionId && (r.kind === "vol_to_org"
    ? x.kind === "org_to_vol" && x.toId === r.fromId
    : x.kind === "vol_to_org" && x.fromId === r.toId));
}

export function bayes(stars: number[]) {
  const n = stars.length;
  const sum = stars.reduce((a, b) => a + b, 0);
  return Math.round(((RATING.prior * RATING.priorWeight + sum) / (RATING.priorWeight + n)) * 100) / 100;
}

export function orgScore(ratings: Rating[], orgId: string, now = Date.now()) {
  const since = now - RATING.months * 30 * 86_400_000;
  const mine = ratings.filter((r) => r.kind === "vol_to_org" && r.toId === orgId && !r.hidden && Date.parse(r.createdAt) >= since);
  const tags: Record<string, number> = {};
  for (const r of mine) for (const t of r.tags) tags[t] = (tags[t] ?? 0) + 1;
  return { score: bayes(mine.map((r) => r.stars)), count: mine.length, isNew: mine.length < RATING.newBelow, tags };
}

/** Other organizations see only a "Trusted" badge, never a volunteer's individual ratings. */
export function volunteerTrusted(ratings: Rating[], userId: string) {
  const mine = ratings.filter((r) => r.kind === "org_to_vol" && r.toId === userId && !r.hidden);
  if (mine.length < RATING.trustedMin) return false;
  return mine.reduce((a, r) => a + r.stars, 0) / mine.length >= RATING.trustedAvg;
}

export function validRating(input: { stars: number; tags: string[]; comment: string }, kind: RatingKind) {
  const allowed: readonly string[] = kind === "vol_to_org" ? ORG_TAGS : VOL_TAGS;
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) return "rat.e.stars";
  if (input.tags.length > RATING.maxTags || input.tags.some((t) => !allowed.includes(t))) return "rat.e.tags";
  if (input.comment.length > RATING.commentMax) return "rat.e.comment";
  return null;
}
