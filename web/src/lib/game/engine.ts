/**
 * The game engine: every reward goes through `play()`. It gets the stored state (never values from the caller),
 * checks the action and returns the new play state plus the Fixcoin to add to the person's balance.
 * The browser runs it on the demo database; the `play` server function runs it in a Firestore transaction.
 */
import { DAY_MS, gameDay, isBoosted, prevDay, roll, TZ_MS, type Look, type PlayState } from "./core";
import { findSpawn, inReach, SPAWN, type Chest, type Heat, type LatLng, type MapEvent } from "./spawn";
import { questById, questDone, questKey, questsFor, statsNow, type ActivityInput } from "./quests";
import { cosmetic, seasonXp, tierOf, tierReward, type LookSlot } from "./season";
import { battleReward, duelReward, type Battle, type Duel } from "./league";
import { ask, isRight, pickQuestion, QUIZ, type QuizAsk } from "./quiz";
import type { QuizRow } from "./quiz-bank";

export class GameError extends Error {
  constructor(readonly code: string) { super(`g.e.${code}`); }
}

export const DAILY = { baseXp: 20, stepXp: 3, baseCoins: 4, weekBonus: { xp: 60, coins: 15 }, save: { cost: 25, minStreak: 3, everyDays: 7 } } as const;
export const CHEST_REWARD = { common: { xp: 12, coins: 3 }, rare: { xp: 30, coins: 8 }, legendary: { xp: 80, coins: 25 }, flash: { xp: 40, coins: 6 } } as const;

export function dailyReward(streak: number) {
  const s = Math.min(streak, 10);
  const week = streak > 0 && streak % 7 === 0;
  return { xp: DAILY.baseXp + DAILY.stepXp * s + (week ? DAILY.weekBonus.xp : 0), coins: DAILY.baseCoins + Math.floor(Math.min(streak, 14) / 2) + (week ? DAILY.weekBonus.coins : 0), week };
}

/** Can a broken streak be saved today? (exactly one missed day, a streak worth saving, one save a week) */
export function canSave(p: PlayState, now: number) {
  const today = gameDay(now);
  if (!p.chestDay || p.chestDay === today || p.streak < DAILY.save.minStreak) return false;
  if (p.chestDay !== prevDay(prevDay(today))) return false;
  return !p.savedAt || now - Date.parse(p.savedAt) >= DAILY.save.everyDays * DAY_MS;
}
/** The streak as it stands today (0 once a day was missed and not saved). */
export function liveStreak(p: PlayState | null, now: number) {
  if (!p?.chestDay) return 0;
  const today = gameDay(now);
  return p.chestDay === today || p.chestDay === prevDay(today) ? p.streak : 0;
}

export interface Ctx {
  now: number;
  user: { id: string; points: number; province: string };
  play: PlayState | null | undefined;
  heat?: Heat | null;
  activity?: ActivityInput;
  seasonExtra?: { missionXp: number; areaM2: number };
  battle?: Battle | null;
  mahalla?: string;
  battleTookPart?: boolean;
  duel?: Duel | null;
  bank?: QuizRow[];
}
export type Action =
  | { t: "daily" } | { t: "save" }
  | { t: "open"; id: string; pos: LatLng & { acc?: number | null; mock?: boolean } }
  | { t: "answer"; choice: number }
  | { t: "quest"; id: string } | { t: "tier"; n: number }
  | { t: "buy"; id: string } | { t: "equip"; slot: LookSlot; id: string | null }
  | { t: "battle"; week: string } | { t: "duel"; id: string };

export interface Result {
  play: PlayState;
  /** Fixcoin to add (negative for purchases) */
  coins: number;
  /** season XP added */
  xp: number;
  /** the look changed: mirror it on the public profile */
  look?: Look;
  quiz?: QuizAsk;
  right?: boolean;
  /** the right option, shown after answering */
  correct?: number;
  item?: string | null;
  kind?: string;
  boostUntil?: string | null;
}

function grant(p: PlayState, xp: number, coins: number, now: number, boostable = true) {
  const x = boostable && isBoosted(p, now) ? xp * 2 : xp;
  p.season.xp += x;
  return { xp: x, coins };
}

export function play(ctx: Ctx, a: Action): Result {
  const { now } = ctx;
  const p = roll(ctx.play, ctx.user.id, now);
  const iso = new Date(now).toISOString();
  p.updatedAt = iso;
  const today = gameDay(now);
  switch (a.t) {
    case "daily": {
      if (p.chestDay === today) throw new GameError("dailyDone");
      p.streak = p.chestDay === prevDay(today) ? p.streak + 1 : 1;
      p.best = Math.max(p.best, p.streak);
      p.chestDay = today;
      if (new Date(now + TZ_MS).getUTCHours() < 8) p.total.early += 1;
      const r = dailyReward(p.streak);
      const g = grant(p, r.xp, r.coins, now, false);
      return { play: p, ...g, kind: r.week ? "week" : "day" };
    }
    case "save": {
      if (!canSave(p, now)) throw new GameError("noSave");
      if (ctx.user.points < DAILY.save.cost) throw new GameError("coins");
      p.chestDay = prevDay(today);
      p.savedAt = iso;
      return { play: p, xp: 0, coins: -DAILY.save.cost };
    }
    case "open": {
      if (a.pos?.mock) throw new GameError("mock");
      if (p.opened.includes(a.id)) throw new GameError("taken");
      const s = findSpawn(a.id, now, ctx.heat);
      if (!s) throw new GameError("gone");
      if (!a.pos || !inReach(a.pos, s.at)) throw new GameError("far");
      if (a.id.startsWith("e:")) {
        const ev = s as MapEvent;
        p.opened.push(a.id); p.d.events++; p.w.events++; p.total.events++;
        if (ev.kind === "boost") { p.boostUntil = new Date(Math.max(now, Date.parse(p.boostUntil ?? "") || 0) + SPAWN.boostMin * 60_000).toISOString(); return { play: p, xp: 0, coins: 0, kind: "boost", boostUntil: p.boostUntil }; }
        const g = grant(p, CHEST_REWARD.flash.xp, CHEST_REWARD.flash.coins, now);
        return { play: p, ...g, kind: "flash" };
      }
      const chest = s as Chest;
      if (p.d.chests >= SPAWN.perDay) throw new GameError("limit");
      if (p.quiz && Date.parse(p.quiz.at) + QUIZ.answerSec * 1000 > now) throw new GameError("quizOpen");
      p.opened.push(a.id); p.d.chests++; p.w.chests++; p.total.chests++;
      if (chest.kind === "quiz") {
        if (!ctx.bank?.length) throw new GameError("noQuiz");
        const row = pickQuestion(ctx.bank, chest.id, p.seen, ctx.user.province);
        p.quiz = { chestId: chest.id, qid: row[0], at: iso };
        p.seen = [...p.seen, row[0]].slice(-QUIZ.seenKeep);
        p.d.quizAsked++; p.w.quizAsked++; p.total.quizAsked++;
        return { play: p, xp: 0, coins: 0, kind: "quiz", quiz: ask(row, chest.id) };
      }
      const r = CHEST_REWARD[chest.kind];
      return { play: p, ...grant(p, r.xp, r.coins, now), kind: chest.kind };
    }
    case "answer": {
      const q = p.quiz;
      if (!q) throw new GameError("noQuiz");
      p.quiz = null;
      if (Date.parse(q.at) + QUIZ.answerSec * 1000 < now) return { play: p, xp: 0, coins: 0, right: false, kind: "late", correct: [0, 1, 2, 3].find((i) => isRight(q.chestId, q.qid, i)) };
      const right = Number.isInteger(a.choice) && a.choice >= 0 && a.choice < 4 && isRight(q.chestId, q.qid, a.choice);
      if (right) { p.d.quizRight++; p.w.quizRight++; p.total.quizRight++; }
      const r = right ? QUIZ.right : QUIZ.wrong;
      const right0 = [0, 1, 2, 3].find((i) => isRight(q.chestId, q.qid, i)) ?? 0;
      return { play: p, ...grant(p, r.xp, r.coins, now), right, correct: right0 };
    }
    case "quest": {
      const def = questById(a.id);
      const mine = questsFor(ctx.user.id, now);
      if (!def || ![...mine.daily, ...mine.weekly].some((x) => x.id === def.id)) throw new GameError("noQuest");
      const key = questKey(def, now);
      if (p.quests.includes(key)) throw new GameError("claimed");
      const stats = statsNow(ctx.activity ?? { captures: [], joins: [], approvals: [] }, p, now);
      if (!questDone(def, stats)) throw new GameError("notYet");
      p.quests.push(key);
      return { play: p, ...grant(p, def.xp, def.coins, now, false) };
    }
    case "tier": {
      const xp = seasonXp(p.season.xp, ctx.seasonExtra?.missionXp ?? 0, ctx.seasonExtra?.areaM2 ?? 0);
      if (!Number.isInteger(a.n) || a.n < 1 || a.n > tierOf(xp)) throw new GameError("notYet");
      if (p.season.claimed.includes(a.n)) throw new GameError("claimed");
      p.season.claimed.push(a.n);
      const r = tierReward(a.n);
      if (r.item && !p.owned.includes(r.item)) p.owned.push(r.item);
      return { play: p, xp: 0, coins: r.coins, item: r.item };
    }
    case "buy": {
      const c = cosmetic(a.id);
      if (!c || c.price === null) throw new GameError("notForSale");
      if (p.owned.includes(c.id)) throw new GameError("owned");
      if (ctx.user.points < c.price) throw new GameError("coins");
      p.owned.push(c.id);
      return { play: p, xp: 0, coins: -c.price, item: c.id };
    }
    case "equip": {
      if (a.id !== null) {
        const c = cosmetic(a.id);
        if (!c || c.slot !== a.slot || !p.owned.includes(c.id)) throw new GameError("notOwned");
      }
      if (!["frame", "title", "pattern", "flag"].includes(a.slot)) throw new GameError("notOwned");
      p.look = { ...p.look, [a.slot]: a.id };
      return { play: p, xp: 0, coins: 0, look: p.look };
    }
    case "battle": {
      const b = ctx.battle;
      if (!b || b.week !== a.week || !ctx.mahalla) throw new GameError("notYet");
      if (p.battles.includes(a.week)) throw new GameError("claimed");
      const r = battleReward(b, ctx.mahalla, Boolean(ctx.battleTookPart));
      if (!r) throw new GameError("notYet");
      p.battles = [...p.battles, a.week].slice(-20);
      return { play: p, ...grant(p, r.xp, r.coins, now, false) };
    }
    case "duel": {
      const d = ctx.duel;
      if (!d || d.id !== a.id) throw new GameError("notYet");
      if (p.duels.includes(d.id)) throw new GameError("claimed");
      const r = duelReward(d, ctx.user.id);
      if (!r) throw new GameError("notYet");
      p.duels = [...p.duels, d.id].slice(-50);
      return { play: p, ...grant(p, r.xp, r.coins, now, false) };
    }
  }
}
