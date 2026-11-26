/**
 * v6 · Feature 5: the personal diary. Nothing new is collected: approved submissions, captures, certificates.
 * The only new data is a short private note per entry (280 characters).
 */
export const DIARY = { noteMax: 280 } as const;

export interface DiaryEntryInput { at: string; hours: number; impact: number; missions: number }

/** This year's totals and hours per month (12 values, January first). */
export function yearSummary(entries: DiaryEntryInput[], year: number) {
  const months = Array.from({ length: 12 }, () => 0);
  let hours = 0, impact = 0, missions = 0;
  for (const e of entries) {
    const d = new Date(e.at);
    if (d.getFullYear() !== year) continue;
    months[d.getMonth()] += e.hours;
    hours += e.hours;
    impact += e.impact;
    missions += e.missions;
  }
  return { hours: Math.round(hours * 10) / 10, impact, missions, months: months.map((h) => Math.round(h * 10) / 10) };
}

/** Longest run of consecutive days with an approved mission. */
export function longestStreak(days: string[]) {
  const set = [...new Set(days.map((d) => d.slice(0, 10)))].sort();
  let best = 0, run = 0, prev = 0;
  for (const d of set) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev && t - prev === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/** Entries grouped by month, newest month first ("2026-11"). */
export function byMonth<T extends { at: string }>(entries: T[]) {
  const map = new Map<string, T[]>();
  for (const e of [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const k = e.at.slice(0, 7);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return [...map.entries()].map(([month, items]) => ({ month, items }));
}
