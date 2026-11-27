/**
 * v7 game: shared basics (deterministic random numbers, Tashkent days and weeks, the per-person play state).
 * Everything in src/lib/game is pure: the same code runs in the browser (demo mode) and in the `play` server function.
 */

/** FNV-1a: a stable 32-bit hash of a string. */
export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32: the same seed always gives the same numbers in [0, 1). */
export function rng(seed: string | number) {
  let a = typeof seed === "number" ? seed >>> 0 : hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickN<T>(list: readonly T[], n: number, rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/** Uzbekistan time (UTC+5, no daylight saving): the game day starts at local midnight. */
export const TZ_MS = 5 * 3_600_000;
export const DAY_MS = 86_400_000;
export const gameDay = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
/** Monday of the local week, "2026-11-23". */
export function gameWeek(ms: number) {
  const local = new Date(ms + TZ_MS);
  const dow = (local.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow)).toISOString().slice(0, 10);
}
/** Start of a local day or week as a UTC timestamp. */
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - TZ_MS;
export const weekEnd = (week: string) => dayStart(week) + 7 * DAY_MS;
export const prevDay = (day: string) => gameDay(dayStart(day) - DAY_MS / 2);
export const daysBetween = (a: string, b: string) => Math.round((dayStart(b) - dayStart(a)) / DAY_MS);
/** The month a season covers ("2026-11"), as the territory seasons. */
export const seasonId = (ms: number) => new Date(ms).toISOString().slice(0, 7);

export interface Counters { chests: number; quizRight: number; quizAsked: number; events: number }
export const ZERO: Counters = { chests: 0, quizRight: 0, quizAsked: 0, events: 0 };

export interface Look { frame: string | null; title: string | null; pattern: string | null; flag: string | null }
export const NO_LOOK: Look = { frame: null, title: null, pattern: null, flag: null };

/** One document per person (`play/{userId}`): written only by the game engine. */
export interface PlayState {
  id: string;
  userId: string;
  /** daily-chest streak */
  streak: number;
  best: number;
  /** the last day the daily chest was opened */
  chestDay: string | null;
  /** the last time a lost streak was saved (one save a week) */
  savedAt: string | null;
  /** this day's and this week's counters */
  day: string;
  week: string;
  d: Counters;
  w: Counters;
  /** all-time counters, for badges */
  total: Counters & { early: number };
  /** spawned chests and events taken today */
  opened: string[];
  /** a question waiting for an answer */
  quiz: { chestId: string; qid: string; at: string } | null;
  /** question ids already asked (newest last, capped) */
  seen: string[];
  /** quests claimed, as `${questId}@${period}` */
  quests: string[];
  /** double XP until */
  boostUntil: string | null;
  season: { id: string; xp: number; claimed: number[] };
  owned: string[];
  look: Look;
  /** weekly mahalla battles and duels already rewarded */
  battles: string[];
  duels: string[];
  updatedAt: string;
}

export function newPlay(userId: string, now: number): PlayState {
  return {
    id: userId, userId, streak: 0, best: 0, chestDay: null, savedAt: null, day: gameDay(now), week: gameWeek(now), d: { ...ZERO }, w: { ...ZERO },
    total: { ...ZERO, early: 0 }, opened: [], quiz: null, seen: [], quests: [], boostUntil: null, season: { id: seasonId(now), xp: 0, claimed: [] },
    owned: [], look: { ...NO_LOOK }, battles: [], duels: [], updatedAt: new Date(now).toISOString(),
  };
}

/** Rolls the day, week and season over. Returns a new object; the input is not changed. */
export function roll(p: PlayState | null | undefined, userId: string, now: number): PlayState {
  const base = p ? structuredClone(p) : newPlay(userId, now);
  const day = gameDay(now), week = gameWeek(now), season = seasonId(now);
  if (base.day !== day) { base.day = day; base.d = { ...ZERO }; base.opened = []; if (base.quiz && base.quiz.at.slice(0, 10) < day) base.quiz = null; }
  if (base.week !== week) { base.week = week; base.w = { ...ZERO }; }
  if (base.season.id !== season) base.season = { id: season, xp: 0, claimed: [] };
  base.quests = base.quests.filter((q) => { const at = q.split("@")[1] ?? ""; return at >= week || at === day; });
  base.total ??= { ...ZERO, early: 0 };
  base.look ??= { ...NO_LOOK };
  return base;
}

export const isBoosted = (p: PlayState, now: number) => Boolean(p.boostUntil && Date.parse(p.boostUntil) > now);
