/**
 * Uzbekistan's regions, districts and mahallas for the place picker (registration and profile).
 * Districts ship with the app (uz-places.json, ~30 KB); each district's mahallas are fetched on demand from
 * /places/<districtId>.json. Built by scripts/build-places.py from open lists (see the `source` field).
 */
import data from "../geo/uz-places.json";

export interface Region { id: number; p: string; uz: string; oz: string; ru: string }
export interface District { id: number; r: number; uz: string; oz: string; ru: string; n: number }
export type Mahalla = [string, string];

export const REGIONS = (data.regions as Region[]);
export const DISTRICTS = (data.districts as District[]);
export const PLACES_SOURCE = data.source as string;

export const regionByProvince = (province: string) => REGIONS.find((r) => r.p === province) ?? null;
export const districtsOf = (regionId: number) => DISTRICTS.filter((d) => d.r === regionId);
export const districtById = (id: number | string | null | undefined) => DISTRICTS.find((d) => String(d.id) === String(id)) ?? null;
export const placeName = (x: { uz: string; ru: string }, lang: string) => (lang === "ru" && x.ru ? x.ru : x.uz);

const cache = new Map<number, Promise<Mahalla[]>>();
export function loadMahallas(districtId: number): Promise<Mahalla[]> {
  const d = districtById(districtId);
  if (!d || !d.n) return Promise.resolve([]);
  let p = cache.get(districtId);
  if (!p) {
    p = fetch(`/places/${districtId}.json`).then((r) => (r.ok ? (r.json() as Promise<Mahalla[]>) : [])).catch(() => []);
    p.then((x) => { if (!x.length) cache.delete(districtId); });
    cache.set(districtId, p);
  }
  return p;
}

/** Comparable form of a place name ("Chilonzor tumani" ≈ "chilonzor"). */
export const placeKeyOf = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’'`ʻʼ]/g, "")
  .replace(/\b(tumani|tuman|shahri|shahar|mfy|qfy|ofy|mahallasi|mahalla|viloyati|район|город)\b/g, "").replace(/[^a-zа-яё0-9]/g, "");

/** Finds the district for free text an older profile has (exact match after normalising, inside the region). */
export function matchDistrict(province: string, text: string) {
  const r = regionByProvince(province);
  const k = placeKeyOf(text);
  if (!r || !k) return null;
  const list = districtsOf(r.id);
  return list.find((d) => placeKeyOf(d.uz) === k && /shahri$/i.test(d.uz) === /shahr|city|город/i.test(text))
    ?? list.find((d) => placeKeyOf(d.uz) === k) ?? null;
}
export async function matchMahalla(districtId: number, text: string) {
  const k = placeKeyOf(text);
  if (!k) return null;
  return (await loadMahallas(districtId)).find(([, n]) => placeKeyOf(n) === k) ?? null;
}
