/**
 * Daily and weekly quests: three a day (the daily chest is always one of them) and two a week, picked per person
 * from fixed pools. Progress is counted from what really happened (walks, missions, chests, answers).
 */
import { dayStart, gameDay, gameWeek, pickN, rng, weekEnd, type Counters } from "./core";

export type QuestMetric = "walkKm" | "areaM2" | "joined" | "done" | "chests" | "quizRight" | "events" | "daily";
export interface QuestDef { id: string; metric: QuestMetric; goal: number; period: "day" | "week"; xp: number; coins: number }

const q = (id: string, metric: QuestMetric, goal: number, period: "day" | "week", xp: number, coins: number): QuestDef => ({ id, metric, goal, period, xp, coins });

export const DAILY_FIXED = q("d_daily", "daily", 1, "day", 20, 2);
export const DAILY_POOL: QuestDef[] = [
  q("d_walk1", "walkKm", 1, "day", 50, 6),
  q("d_walk2", "walkKm", 2, "day", 80, 10),
  q("d_chest3", "chests", 3, "day", 40, 5),
  q("d_chest6", "chests", 6, "day", 70, 8),
  q("d_quiz2", "quizRight", 2, "day", 40, 5),
  q("d_quiz4", "quizRight", 4, "day", 70, 8),
  q("d_join", "joined", 1, "day", 60, 8),
  q("d_area", "areaM2", 5000, "day", 60, 8),
  q("d_event", "events", 1, "day", 50, 6),
];
export const WEEKLY_POOL: QuestDef[] = [
  q("w_done2", "done", 2, "week", 250, 30),
  q("w_walk8", "walkKm", 8, "week", 220, 25),
  q("w_chest25", "chests", 25, "week", 200, 25),
  q("w_quiz12", "quizRight", 12, "week", 200, 25),
  q("w_area", "areaM2", 40000, "week", 220, 25),
  q("w_join3", "joined", 3, "week", 200, 25),
  q("w_events5", "events", 5, "week", 180, 20),
];
export const ALL_QUESTS = [DAILY_FIXED, ...DAILY_POOL, ...WEEKLY_POOL];
export const questById = (id: string) => ALL_QUESTS.find((x) => x.id === id) ?? null;

export function questsFor(userId: string, now: number) {
  const day = gameDay(now), week = gameWeek(now);
  return {
    day, week,
    daily: [DAILY_FIXED, ...pickN(DAILY_POOL, 2, rng(`q|${userId}|${day}`))],
    weekly: pickN(WEEKLY_POOL, 2, rng(`w|${userId}|${week}`)),
  };
}

/** What happened in a period, from stored records. */
export interface ActivityInput {
  captures: { createdAt: string; distanceM: number; gainedM2: number; rejected?: boolean }[];
  joins: { joinedAt: string }[];
  approvals: { reviewedAt: string | null; approved: boolean }[];
}
export type PeriodStats = Record<QuestMetric, number>;

export function periodStats(a: ActivityInput, from: number, to: number, counters: Counters, daily: boolean): PeriodStats {
  const inP = (iso: string | null) => { const t = iso ? Date.parse(iso) : NaN; return t >= from && t < to; };
  const walks = a.captures.filter((c) => !c.rejected && inP(c.createdAt));
  return {
    walkKm: +(walks.reduce((s, c) => s + c.distanceM, 0) / 1000).toFixed(2),
    areaM2: Math.round(walks.reduce((s, c) => s + c.gainedM2, 0)),
    joined: a.joins.filter((j) => inP(j.joinedAt)).length,
    done: a.approvals.filter((s) => s.approved && inP(s.reviewedAt)).length,
    chests: counters.chests,
    quizRight: counters.quizRight,
    events: counters.events,
    daily: daily ? 1 : 0,
  };
}

export function statsNow(a: ActivityInput, play: { day: string; week: string; d: Counters; w: Counters; chestDay: string | null }, now: number) {
  const day = gameDay(now), week = gameWeek(now);
  return {
    day: periodStats(a, dayStart(day), dayStart(day) + 86_400_000, play.day === day ? play.d : { chests: 0, quizRight: 0, quizAsked: 0, events: 0 }, play.chestDay === day),
    week: periodStats(a, dayStart(week), weekEnd(week), play.week === week ? play.w : { chests: 0, quizRight: 0, quizAsked: 0, events: 0 }, false),
  };
}

export const questKey = (def: QuestDef, now: number) => `${def.id}@${def.period === "day" ? gameDay(now) : gameWeek(now)}`;
export const questDone = (def: QuestDef, s: { day: PeriodStats; week: PeriodStats }) => (def.period === "day" ? s.day : s.week)[def.metric] >= def.goal;
