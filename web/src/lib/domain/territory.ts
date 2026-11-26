/**
 * Territory capture: a volunteer walks or runs a loop; the loop becomes an area they hold for the month.
 * Pure functions only, shared by the browser and the server (decay job). The raw GPS trace is never stored:
 * only the resulting shape.
 */
import turfArea from "@turf/area";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import centroid from "@turf/centroid";
import difference from "@turf/difference";
import { featureCollection, multiPolygon, point, polygon } from "@turf/helpers";
import intersect from "@turf/intersect";
import simplify from "@turf/simplify";
import union from "@turf/union";
import unkinkPolygon from "@turf/unkink-polygon";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import type { GeoPoint } from "./types";

/* ── rules of the game ── */
export const TERRITORY = {
  /** faster than this between two fixes (km/h) is a vehicle: that stretch does not count */
  maxSpeedKmh: 18,
  /** fixes less accurate than this (metres) are ignored */
  maxAccuracyM: 35,
  /** the loop closes on its own when you come back this close to the start (metres) */
  autoCloseM: 35,
  /** "Finish" closes the loop if you are at most this far from the start (metres) */
  finishCloseM: 80,
  /** a loop shorter than this (metres) does not count */
  minPathM: 200,
  /** smallest area that counts (m²) */
  minAreaM2: 2_000,
  /** largest single capture (m²) — about a 1.7 km × 1.7 km square */
  maxCaptureM2: 3_000_000,
  /** captures per day */
  capturesPerDay: 5,
  /** the owner (and their group) see a new mission in their area this many hours before everyone else */
  firstLookHours: 6,
  /** an open mission in your area may wait this long before your area starts to shrink */
  graceHours: 48,
  /** each day with an ignored mission, the area keeps this share of its size */
  dailyKeep: 0.9,
  /** losing less than this (m²) to someone does not send a notification */
  notifyLossM2: 500,
} as const;

export type Shape = Position[][][]; // MultiPolygon coordinates: [polygon][ring][point] as [lng, lat]
export interface TracePoint extends GeoPoint { t: number; acc?: number | null }

/** Season = calendar month ("2026-11"); everything resets on the 1st. */
export const seasonOf = (d: Date | string | number = Date.now()) => new Date(d).toISOString().slice(0, 7);

export function distanceM(a: GeoPoint, b: GeoPoint) {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Keeps the fixes that a person on foot could have made: drops inaccurate fixes and any fix reached
 * faster than the speed limit (a car, a bus, a spoofed jump).
 */
export function cleanTrace(points: TracePoint[]) {
  const kept: TracePoint[] = [];
  let distance = 0;
  let droppedFast = 0;
  let maxSpeed = 0;
  for (const p of points) {
    if (p.acc != null && p.acc > TERRITORY.maxAccuracyM) continue;
    const last = kept[kept.length - 1];
    if (!last) { kept.push(p); continue; }
    const d = distanceM(last, p);
    if (d < 2) continue; // standing still
    const hours = Math.max((p.t - last.t) / 3_600_000, 1 / 3600);
    const kmh = d / 1000 / hours;
    if (kmh > TERRITORY.maxSpeedKmh) { droppedFast += 1; continue; }
    maxSpeed = Math.max(maxSpeed, kmh);
    distance += d;
    kept.push(p);
  }
  const durationS = kept.length > 1 ? Math.round((kept[kept.length - 1].t - kept[0].t) / 1000) : 0;
  return { kept, distanceM: Math.round(distance), durationS, droppedFast, maxSpeedKmh: Math.round(maxSpeed * 10) / 10 };
}

/** How far the walker is from closing the loop. */
export function loopState(points: TracePoint[]) {
  const { kept, distanceM: path } = cleanTrace(points);
  if (kept.length < 2) return { toStartM: null as number | null, pathM: path, canAutoClose: false, canFinish: false };
  const toStart = distanceM(kept[kept.length - 1], kept[0]);
  const long = path >= TERRITORY.minPathM && kept.length >= 8;
  return { toStartM: Math.round(toStart), pathM: path, canAutoClose: long && toStart <= TERRITORY.autoCloseM, canFinish: long && toStart <= TERRITORY.finishCloseM };
}

const asFeature = (s: Shape): Feature<MultiPolygon> => multiPolygon(s);
const toShape = (f: Feature<Polygon | MultiPolygon> | null): Shape | null => {
  if (!f) return null;
  const s = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const kept = s.filter((poly) => turfArea(polygon(poly)) >= 1);
  return kept.length ? kept : null;
};
const round = (s: Shape): Shape => s.map((poly) => poly.map((ring) => ring.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])));

export const shapeArea = (s: Shape | null) => (s ? Math.round(turfArea(asFeature(s))) : 0);

export type CaptureError = "too_short" | "not_closed" | "too_small" | "too_big";

/** Turns a closed walk into an area. A figure-eight walk keeps every loop that is big enough. */
export function traceToShape(points: TracePoint[], opts: { forceClose?: boolean } = {}): { shape: Shape; areaM2: number } | { error: CaptureError; toStartM?: number } {
  const { kept, distanceM: path } = cleanTrace(points);
  if (kept.length < 8 || path < TERRITORY.minPathM) return { error: "too_short" };
  const toStart = distanceM(kept[kept.length - 1], kept[0]);
  if (toStart > (opts.forceClose ? TERRITORY.finishCloseM : TERRITORY.autoCloseM)) return { error: "not_closed", toStartM: Math.round(toStart) };
  const ring = kept.map((p) => [p.lng, p.lat]);
  ring.push(ring[0]);
  let poly: Feature<Polygon>;
  try { poly = simplify(polygon([ring]), { tolerance: 0.00002, highQuality: true }) as Feature<Polygon>; } catch { return { error: "too_small" }; }
  let pieces: Feature<Polygon>[];
  try { pieces = unkinkPolygon(poly).features; } catch { pieces = [poly]; }
  const big = pieces.filter((p) => turfArea(p) >= TERRITORY.minAreaM2);
  if (!big.length) return { error: "too_small" };
  const merged = big.length === 1 ? big[0] : union(featureCollection(big));
  const shape = toShape(merged as Feature<Polygon | MultiPolygon>);
  if (!shape) return { error: "too_small" };
  const areaM2 = shapeArea(shape);
  if (areaM2 < TERRITORY.minAreaM2) return { error: "too_small" };
  if (areaM2 > TERRITORY.maxCaptureM2) return { error: "too_big" };
  return { shape: round(shape), areaM2 };
}

export function unionShapes(a: Shape | null, b: Shape | null): Shape | null {
  if (!a) return b;
  if (!b) return a;
  const u = union(featureCollection([asFeature(a), asFeature(b)]));
  const s = toShape(u as Feature<Polygon | MultiPolygon> | null);
  return s ? round(s) : null;
}

/** a minus b; null when nothing worth keeping is left. */
export function subtractShape(a: Shape, b: Shape): Shape | null {
  const d = difference(featureCollection([asFeature(a), asFeature(b)]));
  const s = toShape(d as Feature<Polygon | MultiPolygon> | null);
  if (!s) return null;
  const keep = s.filter((poly) => turfArea(polygon(poly)) >= TERRITORY.minAreaM2 / 4);
  return keep.length ? round(keep) : null;
}

/** The part of `a` inside `b` (null when they do not meet). */
export function overlapShape(a: Shape, b: Shape): Shape | null {
  const i = intersect(featureCollection([asFeature(a), asFeature(b)]));
  const s = toShape(i as Feature<Polygon | MultiPolygon> | null);
  return s ? round(s) : null;
}

export function overlapM2(a: Shape, b: Shape) {
  const i = intersect(featureCollection([asFeature(a), asFeature(b)]));
  return i ? Math.round(turfArea(i)) : 0;
}

export function contains(s: Shape | null, p: GeoPoint | null) {
  if (!s || !p) return false;
  return booleanPointInPolygon(point([p.lng, p.lat]), asFeature(s));
}

export function centerOf(s: Shape): GeoPoint {
  const [lng, lat] = centroid(asFeature(s)).geometry.coordinates;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

export function bboxOf(s: Shape): [number, number, number, number] {
  let w = 180, so = 90, e = -180, n = -90;
  for (const poly of s) for (const ring of poly) for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); }
  return [w, so, e, n];
}

/**
 * Shrinks every piece toward its own centre so the area becomes `keep` of what it was.
 * Pieces that fall under the minimum disappear.
 */
export function shrinkShape(s: Shape, keep: number): Shape | null {
  const k = Math.sqrt(Math.max(0, Math.min(1, keep)));
  const out: Shape = [];
  for (const poly of s) {
    const [cx, cy] = centroid(polygon(poly)).geometry.coordinates;
    const scaled = poly.map((ring) => ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]));
    if (turfArea(polygon(scaled)) >= TERRITORY.minAreaM2) out.push(scaled);
  }
  return out.length ? round(out) : null;
}

export const encodeShape = (s: Shape) => JSON.stringify(s);
export function decodeShape(raw: string | null | undefined): Shape | null {
  if (!raw) return null;
  try { const s = JSON.parse(raw) as Shape; return Array.isArray(s) && s.length ? s : null; } catch { return null; }
}

/**
 * Daily decay. `ignored` = open missions inside the area that nobody from the owner's side has joined,
 * each with the time it became "due" (published + grace). Returns the new shape (or null) and how many days were applied.
 */
export function decay(shape: Shape, checkedAt: string, ignoredDueAt: string[], now = Date.now()) {
  if (!ignoredDueAt.length) return { shape, days: 0, checkedAt: new Date(now).toISOString() };
  const firstDue = Math.min(...ignoredDueAt.map((d) => Date.parse(d)));
  const from = Math.max(Date.parse(checkedAt), firstDue);
  const days = Math.floor((now - from) / 86_400_000);
  if (days < 1) return { shape, days: 0, checkedAt };
  const next = shrinkShape(shape, TERRITORY.dailyKeep ** days);
  return { shape: next, days, checkedAt: new Date(from + days * 86_400_000).toISOString() };
}

/** For tests and the demo: a walk around a rough circle of radius r metres starting north of the centre. */
export function loopAround(center: GeoPoint, r: number, steps = 36, start = Date.now(), speedKmh = 7, wobble = 0.08): TracePoint[] {
  const out: TracePoint[] = [];
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const stepM = (2 * Math.PI * r) / steps;
  const stepMs = (stepM / 1000 / speedKmh) * 3_600_000;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const w = 1 + Math.sin(a * 3) * wobble;
    out.push({ lat: center.lat + Math.cos(a) * dLat * w, lng: center.lng + Math.sin(a) * dLng * w, t: start + i * stepMs, acc: 6 + ((i * 7) % 5) });
  }
  return out;
}
