"use client";
import { useEffect, useState } from "react";
import { GiftArt, useAct } from "../game";
import { Icon } from "../icons";
import { Coins } from "../ui";
import { useI18n } from "@/lib/i18n";
import { celebrate, buzz } from "@/lib/fx";
import { music } from "@/lib/season/music";
import { cosmetic } from "@/lib/game/season";
import type { GameView } from "@/lib/store/api7";

const KIND = (day: number) => (day === 31 ? "legendary" : day % 7 === 0 ? "rare" : day % 3 === 0 ? "quiz" : "common");

/** v8: the New Year gift calendar — 1 to 31 December, one gift a day, a big one on the 31st. */
export function AdventCalendar({ g, onChange }: { g: GameView; onChange: () => void }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const a = g.advent;
  const [shown, setShown] = useState<number | null>(null);
  const [left, setLeft] = useState("");
  useEffect(() => {
    if (a.day) return;
    // before December: how long until the first door
    const tick = () => {
      const now = Date.now();
      const y = new Date(now + 18e6).getUTCMonth() === 11 ? new Date(now + 18e6).getUTCFullYear() + 1 : new Date(now + 18e6).getUTCFullYear();
      const ms = Math.max(0, Date.UTC(y, 11, 1) - 18e6 - now);
      const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
      setLeft(t("adv.startsIn", { d, h, m }));
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [a.day, t]);

  const open = (day: number, el: HTMLElement) => run(`adv${day}`, { t: "advent" }, () => {
    setShown(day);
    celebrate(el, 110);
    buzz(40);
    music.chime();
    onChange();
  });

  return (
    <section className="card pad stack g16 adv" aria-labelledby="adv-title">
      <div className="row between g12 wrap">
        <div className="stack g4">
          <h2 id="adv-title" className="t-h2 row g8"><Icon name="gift" size={20} />{t("adv.title")}</h2>
          <p className="t-small secondary">{a.day ? t("adv.sub") : left}</p>
        </div>
        <span className="adv-count num">{a.opened.length}/31</span>
      </div>
      <ol className="adv-grid">
        {a.rewards.map((r, i) => {
          const day = i + 1;
          const done = a.opened.includes(day);
          const today = a.day === day;
          const past = a.day > day && !done;
          const item = r.item ? cosmetic(r.item) : null;
          const state = done ? "done" : today ? "today" : past ? "missed" : "locked";
          return (
            <li key={day} className="adv-door" data-state={state} data-special={item || day === 31 ? "" : undefined}>
              {today ? (
                <button type="button" className="adv-btn" disabled={busy !== null} onClick={(e) => void open(day, e.currentTarget)} aria-label={t("adv.openDay", { n: day })}>
                  <GiftArt kind={KIND(day)} size={46} />
                  <span className="adv-n num">{day}</span>
                  <span className="adv-cta">{t("adv.open")}</span>
                </button>
              ) : (
                <div className="adv-btn" aria-label={t(`adv.${state}`, { n: day })}>
                  <GiftArt kind={KIND(day)} size={38} open={done} />
                  <span className="adv-n num">{day}</span>
                  {done && <Icon name="check" size={14} className="adv-tick" />}
                  {state === "locked" && <Icon name="lock" size={12} className="adv-lock" />}
                </div>
              )}
              {item && <span className="adv-item" title={t(`cos.${item.id}`)}>{t(`lk.${item.slot}`)}</span>}
            </li>
          );
        })}
      </ol>
      {shown !== null && (
        <div className="adv-won" role="status">
          <GiftArt kind={KIND(shown)} size={44} open />
          <span className="stack g4">
            <strong>{t("adv.won", { n: shown })}</strong>
            <span className="row g8 t-small">+{a.rewards[shown - 1].xp} XP · <Coins value={a.rewards[shown - 1].coins} size={13} />
              {a.rewards[shown - 1].item && <> · {t(`cos.${a.rewards[shown - 1].item}`)}</>}</span>
          </span>
        </div>
      )}
    </section>
  );
}
