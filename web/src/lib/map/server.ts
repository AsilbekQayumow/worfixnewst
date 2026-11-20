/**
 * Server-side map services (runs in Netlify Functions, and as Next.js routes in local development).
 * OpenRouteService answers walking routes and place search; the key (ORS_API_KEY) never reaches the browser.
 * Both handlers answer { error } with status 503 when the key is missing or ORS fails, and the browser
 * then falls back to the public OSRM / Photon services.
 */
import { limited } from "../ai/server";

const ORS = "https://api.openrouteservice.org";

/** Requests from other websites are refused so the shared daily quota serves WORFIX users only. */
function foreign(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host !== new URL(req.url).host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(new URL(origin).host); } catch { return true; }
}

type LngLat = [number, number];
const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache } });

const num = (v: unknown, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const point = (o: unknown): LngLat | null => {
  const p = o as { lat?: unknown; lng?: unknown } | null;
  const lat = num(p?.lat, -90, 90), lng = num(p?.lng, -180, 180);
  return lat === null || lng === null ? null : [lng, lat];
};

export interface RouteStep { text: string; distanceM: number; durationS: number; type: number; at: { lat: number; lng: number } }

export async function handleRoute(req: Request) {
  if (foreign(req)) return json({ error: "forbidden" }, 403);
  if (limited(req, 20)) return json({ error: "tooMany" }, 429);
  const key = process.env.ORS_API_KEY;
  if (!key) return json({ error: "map.noKey" }, 503);
  let body: { from?: unknown; to?: unknown; lang?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad.json" }, 400); }
  const from = point(body.from), to = point(body.to);
  if (!from || !to) return json({ error: "bad.points" }, 400);
  const language = body.lang === "ru" ? "ru" : "en";
  try {
    const r = await fetch(`${ORS}/v2/directions/foot-walking/geojson`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/geo+json" },
      body: JSON.stringify({ coordinates: [from, to], instructions: true, language, units: "m", geometry_simplify: false }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return json({ error: `ors.${r.status}` }, 503);
    const j = (await r.json()) as {
      features?: { geometry: { coordinates: LngLat[] }; properties: { summary?: { distance?: number; duration?: number }; segments?: { steps?: { instruction: string; distance: number; duration: number; type: number; way_points: [number, number] }[] }[] } }[];
    };
    const f = j.features?.[0];
    if (!f) return json({ error: "ors.empty" }, 503);
    const coords = f.geometry.coordinates;
    const steps: RouteStep[] = (f.properties.segments ?? []).flatMap((s) => s.steps ?? []).map((s) => {
      const c = coords[Math.min(s.way_points[0], coords.length - 1)];
      return { text: s.instruction, distanceM: Math.round(s.distance), durationS: Math.round(s.duration), type: s.type, at: { lat: c[1], lng: c[0] } };
    });
    return json({
      path: coords.map(([lng, lat]) => ({ lat, lng })),
      distanceM: Math.round(f.properties.summary?.distance ?? 0),
      durationS: Math.round(f.properties.summary?.duration ?? 0),
      steps, provider: "openrouteservice",
    });
  } catch {
    return json({ error: "ors.unreachable" }, 503);
  }
}

export interface PlaceHit { name: string; label: string; lat: number; lng: number }

export async function handleGeocode(req: Request) {
  if (foreign(req)) return json({ error: "forbidden" }, 403);
  if (limited(req, 30)) return json({ error: "tooMany" }, 429);
  const key = process.env.ORS_API_KEY;
  if (!key) return json({ error: "map.noKey" }, 503);
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return json({ hits: [] });
  const lat = num(u.searchParams.get("lat"), -90, 90), lng = num(u.searchParams.get("lng"), -180, 180);
  const params = new URLSearchParams({ text: q, size: "6", lang: u.searchParams.get("lang") === "ru" ? "ru" : "en" });
  if (lat !== null && lng !== null) { params.set("focus.point.lat", String(lat)); params.set("focus.point.lon", String(lng)); }
  try {
    const r = await fetch(`${ORS}/geocode/search?${params}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return json({ error: `ors.${r.status}` }, 503);
    const j = (await r.json()) as { features?: { geometry: { coordinates: LngLat }; properties: { name?: string; label?: string } }[] };
    const hits: PlaceHit[] = (j.features ?? []).map((f) => ({
      name: f.properties.name ?? f.properties.label ?? "", label: f.properties.label ?? f.properties.name ?? "", lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
    }));
    // Same query → same answer for a day: saves the daily quota.
    return json({ hits, provider: "openrouteservice" }, 200, "public, max-age=86400");
  } catch {
    return json({ error: "ors.unreachable" }, 503);
  }
}
