/** The monthly summary card ("Oy yakuni"): built only from the person's own verified records. */
import type { Category } from "../domain/types";

export interface WrappedInput {
  month: string;
  approvals: { reviewedAt: string | null; hours: number; xp: number; category: Category | null; impact: Record<string, number> }[];
  captures: { createdAt: string; distanceM: number; gainedM2: number }[];
  seasonXp: number;
  tier: number;
  bestStreak: number;
}
export interface Wrapped {
  month: string; missions: number; hours: number; xp: number; km: number; areaM2: number; topCategory: Category | null;
  impact: [string, number][]; seasonXp: number; tier: number; bestStreak: number; empty: boolean;
}

export function wrapped(i: WrappedInput): Wrapped {
  const inM = (iso: string | null) => Boolean(iso && iso.slice(0, 7) === i.month);
  const done = i.approvals.filter((a) => inM(a.reviewedAt));
  const walks = i.captures.filter((c) => inM(c.createdAt));
  const cats = new Map<Category, number>();
  for (const a of done) if (a.category) cats.set(a.category, (cats.get(a.category) ?? 0) + 1);
  const impact = new Map<string, number>();
  for (const a of done) for (const [k, v] of Object.entries(a.impact)) impact.set(k, (impact.get(k) ?? 0) + v);
  const out: Wrapped = {
    month: i.month, missions: done.length, hours: +done.reduce((s, a) => s + a.hours, 0).toFixed(1), xp: done.reduce((s, a) => s + a.xp, 0),
    km: +(walks.reduce((s, c) => s + c.distanceM, 0) / 1000).toFixed(1), areaM2: Math.round(walks.reduce((s, c) => s + c.gainedM2, 0)),
    topCategory: [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    impact: [...impact.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4),
    seasonXp: i.seasonXp, tier: i.tier, bestStreak: i.bestStreak, empty: false,
  };
  out.empty = !out.missions && !out.km && !out.seasonXp;
  return out;
}

/** Months with something to show, newest first (the current one included). */
export function monthsWithActivity(dates: string[], now: number) {
  const set = new Set(dates.filter(Boolean).map((d) => d.slice(0, 7)));
  set.add(new Date(now).toISOString().slice(0, 7));
  return [...set].sort().reverse().slice(0, 12);
}
