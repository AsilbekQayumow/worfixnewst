"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { isWinter } from "@/lib/season/winter";
import { music } from "@/lib/season/music";
import { Snow } from "./snow";

interface SeasonState {
  /** the New Year look is on (in season, and not switched off) */
  winter: boolean;
  /** in season at all (the switch shows only then) */
  inSeason: boolean;
  snow: boolean;
  music: boolean;
  setWinter: (on: boolean) => void;
  setSnow: (on: boolean) => void;
  toggleMusic: () => void;
}
const Ctx = createContext<SeasonState>({
  winter: false, inSeason: false, snow: false, music: false, setWinter: () => {}, setSnow: () => {}, toggleMusic: () => {},
});
export const useSeason = () => useContext(Ctx);

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** v8: the New Year season — the look (html[data-season=winter]), falling snow and the music. */
export function SeasonProvider({ children }: { children: ReactNode }) {
  const [inSeason, setIn] = useState(false);
  const [winter, setW] = useState(false);
  const [snow, setS] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const s = isWinter();
    setIn(s);
    setW(s && read("worfix.season") !== "off");
    setS(read("worfix.snow") !== "off");
    const off = music.subscribe(setPlaying);
    // v8: the music starts by itself on entering the site (unless it was switched off). Browsers allow sound only
    // after a first tap or key press, so if the first try is blocked it starts at the first touch anywhere.
    if (!s || read("worfix.season") === "off" || read("worfix.music") === "off") return off;
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const remove = () => events.forEach((e) => window.removeEventListener(e, go, true));
    const go = (e: Event) => {
      // a first tap on the music button itself is left to the button
      if ((e.target as Element | null)?.closest?.(".season-btn")) { remove(); return; }
      remove();
      if (read("worfix.music") !== "off") void music.start();
    };
    void music.start().then((ok) => { if (!ok) events.forEach((e) => window.addEventListener(e, go, { capture: true, once: true })); });
    return () => { off(); remove(); };
  }, []);

  useEffect(() => {
    if (winter) document.documentElement.dataset.season = "winter";
    else delete document.documentElement.dataset.season;
  }, [winter]);

  const setWinter = useCallback((on: boolean) => {
    write("worfix.season", on ? "on" : "off");
    setW(on && isWinter());
    if (!on) music.stop();
  }, []);
  const setSnow = useCallback((on: boolean) => { write("worfix.snow", on ? "on" : "off"); setS(on); }, []);
  const toggleMusic = useCallback(() => {
    if (music.on) { music.stop(); write("worfix.music", "off"); }
    else { void music.start(); write("worfix.music", "on"); }
  }, []);

  return (
    <Ctx.Provider value={{ winter, inSeason, snow: winter && snow, music: playing, setWinter, setSnow, toggleMusic }}>
      {children}
      {winter && snow && <Snow />}
    </Ctx.Provider>
  );
}
