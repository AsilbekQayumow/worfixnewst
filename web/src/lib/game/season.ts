/**
 * The season pass (30 tiers a month) and the looks it unlocks: avatar frames, titles, area border patterns and
 * area flags. Season XP comes from the game (chests, quizzes, quests) plus verified missions and new area.
 */
export type LookSlot = "frame" | "title" | "pattern" | "flag";
export type Rarity = "common" | "rare" | "legendary";
export interface Cosmetic { id: string; slot: LookSlot; rarity: Rarity; price: number | null; tier: number | null; /** v8: a gift of the New Year calendar on this December day */ advent?: number | null }

const c = (id: string, slot: LookSlot, rarity: Rarity, price: number | null, tier: number | null = null, advent: number | null = null): Cosmetic => ({ id, slot, rarity, price, tier, advent });

export const COSMETICS: Cosmetic[] = [
  // frames
  c("fr_leaf", "frame", "common", 60), c("fr_sky", "frame", "common", 60), c("fr_sun", "frame", "rare", 180),
  c("fr_bronze", "frame", "common", null, 5), c("fr_silver", "frame", "rare", null, 15), c("fr_gold", "frame", "legendary", null, 30),
  // titles
  c("ti_keeper", "title", "common", 80), c("ti_hunter", "title", "rare", null, 10), c("ti_scholar", "title", "rare", null, 20),
  c("ti_earlybird", "title", "common", 80), c("ti_legend", "title", "legendary", null, 29),
  // area border patterns
  c("pa_dash", "pattern", "common", 50), c("pa_dots", "pattern", "common", 50), c("pa_double", "pattern", "rare", null, 25), c("pa_bold", "pattern", "rare", 200),
  // area flags
  c("fl_leaf", "flag", "common", 70), c("fl_star", "flag", "rare", null, 12), c("fl_heart", "flag", "common", 70), c("fl_bolt", "flag", "rare", 220), c("fl_crown", "flag", "legendary", null, 28),
  // v8: the New Year — two for Fixcoin, the rest only from the gift calendar
  c("ti_snowflake", "title", "common", 90), c("fl_gift", "flag", "common", 80),
  c("fl_snow", "flag", "rare", null, null, 3), c("fr_snow", "frame", "rare", null, null, 7), c("ti_santa", "title", "rare", null, null, 14),
  c("pa_garland", "pattern", "rare", null, null, 21), c("fr_garland", "frame", "legendary", null, null, 25), c("fl_tree", "flag", "legendary", null, null, 31),
];
export const cosmetic = (id: string | null | undefined) => COSMETICS.find((x) => x.id === id) ?? null;
/** Icon names (components/icons) for flags. */
export const FLAG_ICON: Record<string, string> = { fl_leaf: "leaf", fl_star: "award", fl_heart: "heart", fl_bolt: "zap", fl_crown: "trophy", fl_gift: "gift", fl_snow: "snowflake", fl_tree: "tree" };

/** v8: the New Year gift calendar (1–31 December): what each day's gift holds. */
export function adventReward(day: number): { xp: number; coins: number; item: string | null } {
  const item = COSMETICS.find((x) => x.advent === day)?.id ?? null;
  if (day === 31) return { xp: 250, coins: 75, item };
  return { xp: 15 + day * 2, coins: item ? 5 : 3 + Math.floor(day / 3), item };
}

export const SEASON_TIERS = 30;
/** XP needed to reach tier n (cumulative): grows gently, 7 800 for all 30. */
export const tierXp = (n: number) => 80 * n + 6 * n * n;
export function tierOf(xp: number) {
  let n = 0;
  while (n < SEASON_TIERS && xp >= tierXp(n + 1)) n++;
  return n;
}

export interface TierReward { tier: number; coins: number; item: string | null }
export function tierReward(n: number): TierReward {
  const item = COSMETICS.find((x) => x.tier === n)?.id ?? null;
  return { tier: n, coins: item ? 0 : n % 10 === 0 ? 60 : n % 5 === 0 ? 40 : 15 + Math.floor(n / 3) * 2, item };
}

/** Season XP: the game's own plus verified mission XP and new area this season. */
export const seasonXp = (game: number, missionXp: number, areaM2: number) => Math.round(game + missionXp + areaM2 / 200);
