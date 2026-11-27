/**
 * Chests and map events. The map is cut into cells of about 550 × 500 m (roughly a mahalla). Each day every cell
 * gets chests: at least 3, more where more people were active in the last two weeks (the "heat"). Every
 * 30 minutes busy cells may also get an event (double XP for 30 minutes, or a quick bonus spot).
 * Everything is derived from the day, the cell and the heat, so the browser and the server always agree.
 */
import { DAY_MS, gameDay, hash, rng } from "./core";

export interface LatLng { lat: number; lng: number }
export const CELL = { lat: 0.005, lng: 0.006 } as const;

export type ChestKind = "common" | "quiz" | "rare" | "legendary";
export interface Chest { id: string; kind: ChestKind; at: LatLng; cell: string; until: string }
export type EventKind = "boost" | "flash";
export interface MapEvent { id: string; kind: EventKind; at: LatLng; cell: string; from: string; until: string }

/** Heat: distinct active people per cell, plus a few real points (walked loops, missions) to put chests near. */
export interface Heat { day: string; cells: Record<string, { n: number; pts: [number, number][] }> }

export const SPAWN = {
  minPerCell: 1, maxPerCell: 5, reachM: 35, maxAccuracyM: 40, perDay: 15, eventEveryMin: 30, eventChance: 0.4, boostMin: 30, viewKm: 1.1,
} as const;

export const cellOf = (p: LatLng) => `${Math.floor(p.lat / CELL.lat)}:${Math.floor(p.lng / CELL.lng)}`;
const cellBox = (cell: string) => { const [a, b] = cell.split(":").map(Number); return { lat: a * CELL.lat, lng: b * CELL.lng }; };

export function distanceM(a: LatLng, b: LatLng) {
  const R = 6_371_000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** How many chests a cell gets: 3 for a quiet cell, growing with the logarithm of active people, at most 14. */
export const chestsForHeat = (n: number) => Math.min(SPAWN.maxPerCell, SPAWN.minPerCell + Math.round(1.2 * Math.log2(1 + Math.max(0, n))));

function kindOf(r: number): ChestKind {
  if (r < 0.03) return "legendary";
  if (r < 0.15) return "rare";
  if (r < 0.42) return "quiz";
  return "common";
}

/** A point in the cell: near one of its real points when it has some (within ~60 m), else anywhere inside. */
function placeIn(cell: string, pts: [number, number][] | undefined, rand: () => number): LatLng {
  if (pts && pts.length && rand() < 0.75) {
    const [lat, lng] = pts[Math.floor(rand() * pts.length)];
    const ang = rand() * Math.PI * 2, d = 15 + rand() * 45;
    return { lat: +(lat + (d * Math.cos(ang)) / 111_320).toFixed(6), lng: +(lng + (d * Math.sin(ang)) / (111_320 * Math.cos((lat * Math.PI) / 180))).toFixed(6) };
  }
  const o = cellBox(cell);
  return { lat: +(o.lat + CELL.lat * (0.08 + 0.84 * rand())).toFixed(6), lng: +(o.lng + CELL.lng * (0.08 + 0.84 * rand())).toFixed(6) };
}

export function chestsInCell(cell: string, day: string, heat?: Heat | null): Chest[] {
  const h = heat?.day === day ? heat.cells[cell] : undefined;
  const n = chestsForHeat(h?.n ?? 0);
  const rand = rng(`chest|${day}|${cell}`);
  const until = new Date(Date.parse(`${day}T00:00:00Z`) - 5 * 3_600_000 + DAY_MS).toISOString();
  return Array.from({ length: n }, (_, i) => ({ id: `c:${day}:${cell}:${i}`, kind: kindOf(rand()), at: placeIn(cell, h?.pts, rand), cell, until }));
}

/** Events in a cell for the 30-minute slot containing `now`. Quiet cells get one less often. */
export function eventsInCell(cell: string, now: number, heat?: Heat | null): MapEvent[] {
  const slotMs = SPAWN.eventEveryMin * 60_000;
  const slot = Math.floor(now / slotMs);
  const day = gameDay(now);
  const h = heat?.day === day ? heat.cells[cell] : undefined;
  const chance = h ? Math.min(0.85, SPAWN.eventChance + 0.08 * Math.log2(1 + h.n)) : SPAWN.eventChance / 2;
  const rand = rng(`event|${slot}|${cell}`);
  if (rand() > chance) return [];
  return [{ id: `e:${slot}:${cell}`, kind: rand() < 0.5 ? "boost" : "flash", at: placeIn(cell, h?.pts, rand), cell, from: new Date(slot * slotMs).toISOString(), until: new Date((slot + 1) * slotMs).toISOString() }];
}

/** The cells around a point (a square of about `km` each way). */
export function cellsAround(p: LatLng, km: number = SPAWN.viewKm) {
  const dLat = km / 111.32, dLng = km / (111.32 * Math.cos((p.lat * Math.PI) / 180));
  const [a0, b0] = cellOf({ lat: p.lat - dLat, lng: p.lng - dLng }).split(":").map(Number);
  const [a1, b1] = cellOf({ lat: p.lat + dLat, lng: p.lng + dLng }).split(":").map(Number);
  const out: string[] = [];
  for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) out.push(`${a}:${b}`);
  return out;
}

export function spawnsAround(p: LatLng, now: number, heat?: Heat | null, km: number = SPAWN.viewKm) {
  const day = gameDay(now);
  const cells = cellsAround(p, km);
  const chests = cells.flatMap((c) => chestsInCell(c, day, heat)).filter((c) => distanceM(p, c.at) <= km * 1000);
  const events = cells.flatMap((c) => eventsInCell(c, now, heat)).filter((e) => distanceM(p, e.at) <= km * 1000);
  return { chests, events };
}

/** Finds a chest or event by id (re-derived, never trusted from the caller). */
export function findSpawn(id: string, now: number, heat?: Heat | null): Chest | MapEvent | null {
  const [t, a, cellA, cellB, i] = id.split(":");
  const cell = `${cellA}:${cellB}`;
  if (t === "c") {
    if (a !== gameDay(now)) return null;
    return chestsInCell(cell, a, heat)[Number(i)] ?? null;
  }
  if (t === "e") {
    const ev = eventsInCell(cell, Number(a) * SPAWN.eventEveryMin * 60_000, heat)[0];
    return ev && ev.id === id && Date.parse(ev.from) <= now && now < Date.parse(ev.until) ? ev : null;
  }
  return null;
}

/** Is the person close enough? A poor GPS fix (over 40 m) never counts. */
export function inReach(me: LatLng & { acc?: number | null }, at: LatLng) {
  const acc = me.acc ?? 0;
  if (acc > SPAWN.maxAccuracyM) return false;
  return distanceM(me, at) <= SPAWN.reachM + Math.min(acc, 20);
}

/** Builds the heat map from the last two weeks of activity (server, daily; demo, on the fly). */
export function buildHeat(day: string, activity: { userId: string; at: LatLng }[]): Heat {
  const cells: Heat["cells"] = {};
  const people = new Map<string, Set<string>>();
  for (const a of activity) {
    const c = cellOf(a.at);
    (people.get(c) ?? people.set(c, new Set()).get(c)!).add(a.userId);
    const cur = (cells[c] ??= { n: 0, pts: [] });
    if (cur.pts.length < 8 && !cur.pts.some(([la, ln]) => Math.abs(la - a.at.lat) < 0.0004 && Math.abs(ln - a.at.lng) < 0.0004)) cur.pts.push([+a.at.lat.toFixed(5), +a.at.lng.toFixed(5)]);
  }
  for (const [c, s] of people) cells[c].n = s.size;
  return { day, cells };
}

/** Stable key for a spawn kind, used in tests and logs. */
export const spawnSeed = (id: string) => hash(id);
