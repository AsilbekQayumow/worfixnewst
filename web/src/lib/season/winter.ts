/**
 * v8: the New Year season — when it runs, the countdown, and the heroes people walk the map as.
 * Times are Tashkent time (UTC+5, no daylight saving), like the rest of the game.
 */
const TZ_MS = 5 * 3_600_000;
const DAY = 86_400_000;

/** Tashkent calendar parts of a moment. */
export function tashkent(now = Date.now()) {
  const d = new Date(now + TZ_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours() };
}

/** The season runs from 20 November to 14 January. */
export function isWinter(now = Date.now()) {
  const { m, d } = tashkent(now);
  return (m === 11 && d >= 20) || m === 12 || (m === 1 && d <= 14);
}

/** The coming midnight of 1 January in Tashkent (or the one just passed, during the first two weeks of January). */
export function newYearAt(now = Date.now()) {
  const { y, m } = tashkent(now);
  const year = m === 1 ? y : y + 1;
  return Date.UTC(year, 0, 1) - TZ_MS;
}
/** The year that starts at newYearAt(). */
export const comingYear = (now = Date.now()) => new Date(newYearAt(now) + TZ_MS).getUTCFullYear();

export interface Countdown { days: number; hours: number; minutes: number; seconds: number; total: number; arrived: boolean }
export function countdown(now = Date.now()): Countdown {
  const total = Math.max(0, newYearAt(now) - now);
  const s = Math.floor(total / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, total, arrived: total === 0 };
}

/** 1–31 during December (the gift calendar), otherwise 0. */
export function adventDay(now = Date.now()) {
  const { m, d } = tashkent(now);
  return m === 12 ? d : 0;
}

/** Days since the season started (for gently rotating the music and decorations). */
export const seasonDay = (now = Date.now()) => Math.floor((now + TZ_MS) / DAY);

/* ── heroes: the person you walk the map as ── */
export const HEROES = ["santa", "snowmaiden", "snowman", "elf", "chopon", "volunteer"] as const;
export type HeroId = (typeof HEROES)[number];
export const isHero = (v: unknown): v is HeroId => typeof v === "string" && (HEROES as readonly string[]).includes(v);
const HERO_KEY = "worfix.hero";
export function savedHero(): HeroId {
  try { const v = localStorage.getItem(HERO_KEY); if (isHero(v)) return v; } catch { /* private mode */ }
  return isWinter() ? "santa" : "volunteer";
}
export function saveHero(h: HeroId) {
  try { localStorage.setItem(HERO_KEY, h); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent("worfix:hero", { detail: h }));
}

/* ── the head script: set data-season before paint so nothing flashes ── */
export const SEASON_SCRIPT = `try{var n=new Date(Date.now()+18e6),m=n.getUTCMonth()+1,d=n.getUTCDate(),w=(m==11&&d>=20)||m==12||(m==1&&d<=14);if(w&&localStorage.getItem("worfix.season")!=="off")document.documentElement.dataset.season="winter"}catch(e){}`;
