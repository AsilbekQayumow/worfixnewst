import type { GeoPoint } from "../domain/types";

export const TILE = 256;
const MAX_LAT = 85.05112878;

/** Web-Mercator world pixel at zoom z. */
export function project(p: GeoPoint, z: number) {
  const s = TILE * 2 ** z;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  const r = (lat * Math.PI) / 180;
  return { x: ((p.lng + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s };
}

export function unproject(x: number, y: number, z: number): GeoPoint {
  const s = TILE * 2 ** z;
  const lng = (x / s) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI;
  return { lat, lng };
}

/** Largest zoom (≤ maxZ) at which all points fit in w×h with padding. */
export function fitZoom(points: GeoPoint[], w: number, h: number, pad = 48, maxZ = 17) {
  if (points.length < 2) return Math.min(maxZ, 16);
  for (let z = maxZ; z >= 2; z--) {
    const px = points.map((p) => project(p, z));
    const dx = Math.max(...px.map((p) => p.x)) - Math.min(...px.map((p) => p.x));
    const dy = Math.max(...px.map((p) => p.y)) - Math.min(...px.map((p) => p.y));
    if (dx <= w - pad * 2 && dy <= h - pad * 2) return z;
  }
  return 2;
}

export function centerOf(points: GeoPoint[]): GeoPoint {
  if (!points.length) return { lat: 39.6542, lng: 66.9597 };
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

export interface Route {
  path: GeoPoint[];
  distanceM: number;
  durationS: number;
  /** false when routing failed and the path is a straight line */
  routed: boolean;
  /** turn-by-turn instructions, when the router gives them */
  steps?: { text: string; distanceM: number; durationS: number; type: number; at: GeoPoint }[];
}

/** Calls a map service: the Netlify Function in production, the Next.js route in local development. */
async function mapService(name: "route" | "geocode", init: RequestInit & { query?: string }, signal?: AbortSignal) {
  const qs = init.query ? `?${init.query}` : "";
  const r = await fetch(`/.netlify/functions/map-${name}${qs}`, { ...init, signal }).catch((e) => { if ((e as Error).name === "AbortError") throw e; return null; });
  if (r && r.status !== 404) return r;
  return fetch(`/api/map/${name}${qs}`, { ...init, signal });
}

const WALK_MPS = 4.8 / 3.6;

function straight(a: GeoPoint, b: GeoPoint): Route {
  const R = 6_371_000;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(h));
  return { path: [a, b], distanceM: d, durationS: d / WALK_MPS, routed: false };
}

/**
 * Walking route: OpenRouteService through our server (with turn-by-turn steps), then the public FOSSGIS
 * OSRM server, then a straight line.
 */
export async function walkingRoute(a: GeoPoint, b: GeoPoint, signal?: AbortSignal, lang = "en"): Promise<Route> {
  try {
    const r = await mapService("route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: a, to: b, lang }) }, signal);
    if (r.ok) {
      const j = (await r.json()) as { path: GeoPoint[]; distanceM: number; durationS: number; steps: Route["steps"] };
      if (j.path?.length > 1) return { path: [a, ...j.path, b], distanceM: j.distanceM, durationS: Math.max(j.durationS, j.distanceM / WALK_MPS), routed: true, steps: j.steps };
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
  }
  try {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const route = j.routes?.[0];
    if (!route) throw new Error("no route");
    const path = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    return { path: [a, ...path, b], distanceM: route.distance, durationS: Math.max(route.duration, route.distance / WALK_MPS), routed: true };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return straight(a, b);
  }
}

export interface PlaceHit { name: string; label: string; lat: number; lng: number }

/** Place search: OpenRouteService through our server, then the public Photon geocoder. */
export async function searchPlaces(q: string, near: GeoPoint | null, lang: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const text = q.trim();
  if (text.length < 2) return [];
  const query = new URLSearchParams({ q: text, lang, ...(near ? { lat: String(near.lat), lng: String(near.lng) } : {}) }).toString();
  try {
    const r = await mapService("geocode", { method: "GET", query }, signal);
    if (r.ok) { const j = (await r.json()) as { hits?: PlaceHit[] }; if (j.hits) return j.hits; }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
  }
  const p = new URLSearchParams({ q: text, limit: "6", ...(near ? { lat: String(near.lat), lon: String(near.lng) } : {}) });
  const r = await fetch(`https://photon.komoot.io/api/?${p}`, { signal });
  if (!r.ok) return [];
  const j = (await r.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[] };
  return (j.features ?? []).map((f) => {
    const pr = f.properties;
    const name = pr.name ?? pr.street ?? pr.city ?? "";
    const label = [name, pr.street && pr.street !== name ? `${pr.street}${pr.housenumber ? ` ${pr.housenumber}` : ""}` : "", pr.city && pr.city !== name ? pr.city : "", pr.country].filter(Boolean).join(", ");
    return { name, label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  });
}

export const osmLink = (p: GeoPoint) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;
export const directionsLink = (from: GeoPoint | null, to: GeoPoint) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from ? `${from.lat}%2C${from.lng}` : ""}%3B${to.lat}%2C${to.lng}`;
