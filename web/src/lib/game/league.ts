/**
 * Weekly mahalla battles and friend duels.
 *
 * Battle: inside each district the mahallas are ranked by real activity this week (new area and verified
 * volunteer hours) per member, so a big mahalla does not win just by being big (at least 3 members are counted).
 * Mahallas are paired by rank (1 v 2, 3 v 4, …); the pair winner and the district leader earn rewards for every
 * member who took part.
 *
 * Duel: two friends, one metric, seven days.
 */
import { DAY_MS, gameWeek, weekEnd } from "./core";

export interface Member { id: string; mahalla: string; mahallaName: string; district: string; districtName: string }
export interface WeekActivity { area: Record<string, number>; hours: Record<string, number>; walkKm: Record<string, number> }
export interface BattleRow { key: string; name: string; members: number; active: number; score: number; area: number; hours: number; rival: string | null; won: boolean; leader: boolean }
export interface Battle { id: string; week: string; district: string; districtName: string; rows: BattleRow[]; final: boolean; updatedAt: string }

export const BATTLE = { minMembers: 3, win: { coins: 60, xp: 150 }, leader: { coins: 40, xp: 100 } } as const;
export const personScore = (area: number, hours: number) => area / 100 + hours * 20;
export const memberKey = (id: string | null | undefined, text: string | null | undefined) =>
  id ? String(id) : text ? `t:${text.toLowerCase().replace(/[‘’'`ʻʼ]/g, "").replace(/\b(mfy|qfy|mahallasi|mahalla|tumani|shahri)\b/g, "").replace(/\s+/g, " ").trim()}` : "";

export function battles(week: string, members: Member[], act: WeekActivity, now: number): Battle[] {
  const byDistrict = new Map<string, Member[]>();
  for (const m of members) if (m.mahalla && m.district) (byDistrict.get(m.district) ?? byDistrict.set(m.district, []).get(m.district)!).push(m);
  const final = now >= weekEnd(week);
  const out: Battle[] = [];
  for (const [district, list] of byDistrict) {
    const groups = new Map<string, Member[]>();
    for (const m of list) (groups.get(m.mahalla) ?? groups.set(m.mahalla, []).get(m.mahalla)!).push(m);
    const rows: BattleRow[] = [...groups.entries()].map(([key, ms]) => {
      const area = ms.reduce((s, m) => s + (act.area[m.id] ?? 0), 0);
      const hours = ms.reduce((s, m) => s + (act.hours[m.id] ?? 0), 0);
      const active = ms.filter((m) => (act.area[m.id] ?? 0) > 0 || (act.hours[m.id] ?? 0) > 0).length;
      const score = +(ms.reduce((s, m) => s + personScore(act.area[m.id] ?? 0, act.hours[m.id] ?? 0), 0) / Math.max(BATTLE.minMembers, ms.length)).toFixed(2);
      return { key, name: ms[0].mahallaName, members: ms.length, active, score, area: Math.round(area), hours: +hours.toFixed(1), rival: null, won: false, leader: false };
    }).sort((a, b) => b.score - a.score || b.active - a.active || a.name.localeCompare(b.name));
    for (let i = 0; i + 1 < rows.length; i += 2) {
      rows[i].rival = rows[i + 1].key; rows[i + 1].rival = rows[i].key;
      if (rows[i].score > rows[i + 1].score) rows[i].won = true;
    }
    if (rows[0] && rows[0].score > 0) rows[0].leader = true;
    out.push({ id: `${week}_${district}`, week, district, districtName: list[0].districtName, rows, final, updatedAt: new Date(now).toISOString() });
  }
  return out;
}

/** What a person may claim from a finished battle (only members who took part). */
export function battleReward(b: Battle, mahalla: string, tookPart: boolean) {
  if (!b.final || !tookPart) return null;
  const row = b.rows.find((r) => r.key === mahalla);
  if (!row || (!row.won && !row.leader)) return null;
  return { coins: (row.won ? BATTLE.win.coins : 0) + (row.leader ? BATTLE.leader.coins : 0), xp: (row.won ? BATTLE.win.xp : 0) + (row.leader ? BATTLE.leader.xp : 0) };
}

export const lastWeek = (now: number) => gameWeek(now - 7 * DAY_MS);

/* ─── duels ─── */
export type DuelMetric = "area" | "walkKm" | "hours";
export interface Duel {
  id: string; players: [string, string]; from: string; to: string; metric: DuelMetric;
  status: "pending" | "active" | "declined" | "done"; createdAt: string; start: string | null; end: string | null;
  scores: Record<string, number>; winner: string | null; updatedAt: string;
}
export const DUEL = { days: 7, open: 3, win: { coins: 40, xp: 120 }, draw: { coins: 15, xp: 50 } } as const;

export function duelScore(metric: DuelMetric, uid: string, a: { captures: { userId: string; createdAt: string; distanceM: number; gainedM2: number }[]; approvals: { userId: string; reviewedAt: string | null; hours: number }[] }, from: number, to: number) {
  const inP = (iso: string | null) => { const t = iso ? Date.parse(iso) : NaN; return t >= from && t < to; };
  if (metric === "hours") return +a.approvals.filter((s) => s.userId === uid && inP(s.reviewedAt)).reduce((s, x) => s + x.hours, 0).toFixed(1);
  const walks = a.captures.filter((c) => c.userId === uid && inP(c.createdAt));
  return metric === "area" ? Math.round(walks.reduce((s, c) => s + c.gainedM2, 0)) : +(walks.reduce((s, c) => s + c.distanceM, 0) / 1000).toFixed(2);
}

/** Final state of a duel whose week is over. */
export function settleDuel(d: Duel, now: number): Duel {
  if (d.status !== "active" || !d.end || now < Date.parse(d.end)) return d;
  const [a, b] = d.players;
  const sa = d.scores[a] ?? 0, sb = d.scores[b] ?? 0;
  return { ...d, status: "done", winner: sa === sb ? null : sa > sb ? a : b, updatedAt: new Date(now).toISOString() };
}

export function duelReward(d: Duel, uid: string) {
  if (d.status !== "done" || !d.players.includes(uid)) return null;
  if (d.winner === uid) return DUEL.win;
  if (d.winner === null && Object.values(d.scores).some((s) => s > 0)) return DUEL.draw;
  return null;
}
