/**
 * Nearby public places from OpenStreetMap (Overpass API). Works in the browser (Overpass allows CORS)
 * and on the server. Public Overpass servers are often slow, so all mirrors are asked at once and the
 * first answer wins, within a time budget. Returns [] when none answer.
 */
import type { NearbyPlace } from "./missions";

export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const KIND_QUERY = [
  'nwr(around:R,LAT,LNG)["leisure"~"^(park|garden|playground|pitch|nature_reserve)$"]["name"];',
  'nwr(around:R,LAT,LNG)["amenity"~"^(school|kindergarten|library|community_centre|social_facility|clinic|hospital|place_of_worship|marketplace|animal_shelter|recycling|waste_disposal|bus_station)$"];',
  'nwr(around:R,LAT,LNG)["waterway"~"^(river|canal|stream|ditch)$"]["name"];',
  'nwr(around:R,LAT,LNG)["natural"~"^(water|wood|scrub|beach)$"];',
  'nwr(around:R,LAT,LNG)["landuse"~"^(grass|forest|recreation_ground|village_green)$"]["name"];',
];

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

type OverpassJson = { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };

export async function nearbyPlaces(lat: number, lng: number, radius = 1500, budgetMs = 9000): Promise<NearbyPlace[]> {
  const q = `[out:json][timeout:8];(${KIND_QUERY.join("").replace(/R/g, String(radius)).replace(/LAT/g, String(lat)).replace(/LNG/g, String(lng))});out center 60;`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), budgetMs);
  let j: OverpassJson;
  try {
    j = await Promise.any(OVERPASS.map(async (host) => {
      const r = await fetch(host, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(q)}`, signal: ac.signal,
      });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as OverpassJson;
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
  const seen = new Set<string>();
  const out: NearbyPlace[] = [];
  for (const e of j.elements ?? []) {
    const p = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!p) continue;
    const t = e.tags ?? {};
    const kind = t.leisure ?? t.amenity ?? (t.waterway ? `waterway:${t.waterway}` : t.natural ? `natural:${t.natural}` : t.landuse ?? "place");
    const name = t.name ?? t["name:uz"] ?? t["name:en"] ?? "";
    const key = `${kind}|${name}`;
    if (seen.has(key) && name) continue;
    seen.add(key);
    out.push({ id: `${e.type[0]}${e.id}`, name, kind, lat: p.lat, lng: p.lon, distanceM: metres({ lat, lng }, { lat: p.lat, lng: p.lon }) });
  }
  return out.sort((a, b) => Number(Boolean(b.name)) - Number(Boolean(a.name)) || a.distanceM - b.distanceM).slice(0, 40);
}

