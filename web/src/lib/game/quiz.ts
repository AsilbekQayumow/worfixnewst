/**
 * Quiz questions for quiz chests: one question per chest, never one of the last 60 asked; questions about the
 * person's own region come up more often. Options are shuffled per chest; the right answer stays with the engine.
 */
import { rng } from "./core";
import type { QuizRow } from "./quiz-bank";

export type QuizLang = "uz" | "ru" | "en";
export interface QuizAsk { qid: string; cat: QuizRow[1]; q: Record<QuizLang, string>; options: Record<QuizLang, string>[] }
export const QUIZ = { seenKeep: 60, right: { xp: 30, coins: 6 }, wrong: { xp: 6, coins: 0 }, answerSec: 120 } as const;

const L = (t: [string, string, string]): Record<QuizLang, string> => ({ uz: t[0], ru: t[1], en: t[2] });

/** The order options are shown in for this chest: a permutation of 0..3. */
export const optionOrder = (chestId: string, qid: string) => {
  const r = rng(`opt|${chestId}|${qid}`);
  const a = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function pickQuestion(bank: QuizRow[], chestId: string, seen: string[], province: string): QuizRow {
  const r = rng(`quiz|${chestId}`);
  const recent = new Set(seen.slice(-QUIZ.seenKeep));
  let pool = bank.filter((x) => !recent.has(x[0]) && (!x[2] || x[2] === province));
  if (!pool.length) pool = bank.filter((x) => !x[2] || x[2] === province);
  const local = pool.filter((x) => x[2] === province);
  const from = local.length && r() < 0.35 ? local : pool;
  return from[Math.floor(r() * from.length)];
}

export function ask(row: QuizRow, chestId: string): QuizAsk {
  const order = optionOrder(chestId, row[0]);
  return { qid: row[0], cat: row[1], q: L(row[3]), options: order.map((i) => L(row[4][i])) };
}

/** Is the shown option `choice` (0..3) the right one? */
export const isRight = (chestId: string, qid: string, choice: number) => optionOrder(chestId, qid)[choice] === 0;
