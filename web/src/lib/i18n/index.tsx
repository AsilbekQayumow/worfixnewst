"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "../domain/types";
import { DICT } from "./dict";

export type Values = Record<string, string | number | null | undefined>;

const LOCALE: Record<Lang, string> = { uz: "uz-Latn-UZ", ru: "ru-RU", en: "en-GB" };
const KEY = "worfix.lang";

function interpolate(s: string, v?: Values) {
  if (!v) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (v[k] === undefined || v[k] === null ? "" : String(v[k])));
}

/** v8: in the New Year season a key may have a festive variant ("cs.common@w": chest → gift). */
export function translate(lang: Lang, key: string, values?: Values, winter = false): string {
  const w = winter ? DICT[lang][`${key}@w`] ?? DICT.en[`${key}@w`] : undefined;
  const s = w ?? DICT[lang][key] ?? DICT.en[key];
  if (s !== undefined) return interpolate(s, values);
  return key;
}

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "uz" || saved === "ru" || saved === "en") return saved;
    const nav = navigator.language.slice(0, 2);
    if (nav === "ru") return "ru";
    if (nav === "en") return "en";
  } catch { /* ignore */ }
  return "uz";
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, values?: Values) => string;
  locale: string;
}

const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uz");
  // v8: festive wording follows html[data-season] — read after hydration, so the server and first client render agree
  const [winter, setWinter] = useState(false);
  useEffect(() => { setLangState(detect()); }, []);
  useEffect(() => {
    const read = () => setWinter(document.documentElement.dataset.season === "winter");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-season"] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, locale: LOCALE[lang], t: (k, v) => translate(lang, k, v, winter) }), [lang, setLang, winter]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const c = useContext(I18n);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}

/* Browsers ship incomplete Uzbek (Latin) locale data, so Uzbek dates are formatted here. */
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const UZ_DAYS_SHORT = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const uzDate = (d: Date) => `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
function uzRelative(iso: string) {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "hozir";
  const [n, u] = abs < 3600 ? [Math.round(abs / 60), "daqiqa"] : abs < 86400 ? [Math.round(abs / 3600), "soat"] : [Math.round(abs / 86400), "kun"];
  if (abs >= 86400 * 30) { const d = new Date(iso); return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`; }
  return diff < 0 ? `${n} ${u} oldin` : `${n} ${u}dan keyin`;
}

/** Formatting helpers bound to the current language. */
export function useFmt() {
  const { locale, t, lang } = useI18n();
  const uz = lang === "uz";
  return useMemo(() => ({
    date: (iso: string) => (uz ? uzDate(new Date(iso)) : new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })),
    dayTime: (iso: string) => {
      const d = new Date(iso);
      return uz ? `${UZ_DAYS_SHORT[d.getDay()]}, ${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${hhmm(d)}` : d.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    },
    today: () => {
      const d = new Date();
      return uz ? `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${UZ_DAYS[d.getDay()]}` : d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    },
    time: (iso: string) => (uz ? hhmm(new Date(iso)) : new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })),
    num: (n: number) => (uz ? n.toLocaleString("ru-RU") : n.toLocaleString(locale)),
    duration: (min: number) => (min < 60 ? t("u.min", { n: min }) : t("u.hours", { n: Math.round((min / 60) * 10) / 10 })),
    distance: (m: number) => (m < 1000 ? t("u.m", { n: Math.round(m / 10) * 10 }) : t("u.km", { n: Math.round(m / 100) / 10 })),
    relative: (iso: string) => {
      if (uz) return uzRelative(iso);
      const diff = (Date.parse(iso) - Date.now()) / 1000;
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const abs = Math.abs(diff);
      if (abs < 60) return rtf.format(Math.round(diff), "second");
      if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
      if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
      return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
    },
    month: (d: Date = new Date()) => {
      const name = uz ? UZ_MONTHS[d.getMonth()] : d.toLocaleDateString(locale, { month: "long" });
      return name.charAt(0).toUpperCase() + name.slice(1);
    },
    area: (m2: number) => (m2 >= 100_000 ? t("u.km2", { n: (m2 / 1_000_000).toFixed(2) }) : t("u.m2", { n: (uz ? Math.round(m2).toLocaleString("ru-RU") : Math.round(m2).toLocaleString(locale)) })),
    clock: (s: number) => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(Math.floor(s % 60)).padStart(2, "0");
      return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
    },
    coords: (lat: number, lng: number) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}  ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`,
  }), [locale, t, uz]);
}

/** Turns any thrown error into readable text. */
export function useErrorText() {
  const { t } = useI18n();
  return useCallback((e: unknown) => {
    if (e && typeof e === "object") {
      const fields = (e as { fields?: Record<string, string> }).fields;
      if (fields) { const first = Object.values(fields)[0]; if (first) return t(first); }
      const msg = (e as { message?: string }).message;
      const values = (e as { values?: Values }).values;
      if (msg) {
        const out = t(msg, values);
        return out === msg && /^[a-z]+\.[A-Za-z.]+$/.test(msg) ? t("e.generic") : out;
      }
    }
    return t("e.generic");
  }, [t]);
}

/** v2 notifications store an i18n key and JSON values; v1 ones hold plain text. */
export function useNotificationText() {
  const { t } = useI18n();
  return useCallback((title: string, message: string) => {
    if (!title.startsWith("n.")) return { title, body: message };
    let v: Values = {};
    try { v = JSON.parse(message) as Values; } catch { /* plain */ }
    return { title: t(`${title}.t`, v), body: t(`${title}.b`, v) };
  }, [t]);
}
