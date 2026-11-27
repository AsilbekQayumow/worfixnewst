/**
 * Game badges (on top of the volunteering achievements in domain/achievements.ts) and the rarity every badge
 * shows on the profile shelf: common, rare, legendary.
 */
import type { Rarity } from "./season";

export interface GameStats { chests: number; quizRight: number; best: number; early: number; events: number; battles: number; tiers: number }
export interface GameBadge { id: string; family: keyof GameStats; goal: number; rarity: Rarity }

const ladder = (family: keyof GameStats, goals: [number, number, number]): GameBadge[] =>
  goals.map((goal, i) => ({ id: `g_${family}_${goal}`, family, goal, rarity: (["common", "rare", "legendary"] as const)[i] }));

export const GAME_BADGES: GameBadge[] = [
  ...ladder("chests", [10, 75, 300]),
  ...ladder("quizRight", [10, 50, 150]),
  ...ladder("best", [7, 30, 100]),
  ...ladder("early", [7, 30, 100]),
  ...ladder("events", [5, 25, 100]),
  ...ladder("battles", [1, 4, 12]),
  ...ladder("tiers", [10, 20, 30]),
];

export function gameBadges(s: GameStats) {
  return GAME_BADGES.map((b) => ({ ...b, value: Math.min(s[b.family], b.goal), done: s[b.family] >= b.goal }));
}

export const tierRarity = (tier: "bronze" | "silver" | "gold"): Rarity => (tier === "gold" ? "legendary" : tier === "silver" ? "rare" : "common");
