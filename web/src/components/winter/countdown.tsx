"use client";
import { useEffect, useState } from "react";
import { ButtonLink } from "../ui";
import { useI18n } from "@/lib/i18n";
import { comingYear, countdown, type Countdown } from "@/lib/season/winter";
import { Fireworks } from "./fireworks";
import { SleighArt } from "./sleigh";
import { TreeArt } from "./tree";

function Unit({ value, label }: { value: number; label: string }) {
  const s = String(value).padStart(2, "0");
  return (
    <span className="cd-unit">
      <span className="cd-digits" aria-hidden>
        {s.split("").map((d, i) => <span key={`${i}${d}`} className="cd-digit">{d}</span>)}
      </span>
      <span className="cd-label">{label}</span>
    </span>
  );
}

/** v8: how long until the New Year, on Home (and on the landing page). Fireworks at midnight. */
export function NewYearCountdown({ compact, cta = true, publicPage }: { compact?: boolean; cta?: boolean; publicPage?: boolean }) {
  const { t } = useI18n();
  const [c, setC] = useState<Countdown | null>(null);
  const [year, setYear] = useState(0);
  useEffect(() => {
    const tick = () => { setC(countdown()); setYear(comingYear()); };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  const arrived = c?.arrived ?? false;
  const last = c ? c.total < 60_000 && !arrived : false;

  return (
    <section className={`cd-card${compact ? " cd-compact" : ""}${arrived ? " cd-arrived" : ""}`} aria-labelledby="cd-title">
      <div className="cd-sky" aria-hidden>
        <span className="cd-moon" />
        {Array.from({ length: 22 }, (_, i) => <span key={i} className="cd-star" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 62}%`, animationDelay: `${(i % 6) * 0.5}s` }} />)}
        <div className="cd-flight"><SleighArt width={compact ? 120 : 170} /></div>
        <svg className="cd-hills" viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 40C60 18 120 22 180 34S300 52 400 26V60H0Z" fill="#e8f2fb" /><path d="M0 50C80 36 160 40 240 48S340 54 400 44V60H0Z" fill="#fff" /></svg>
        <div className="cd-tree"><TreeArt width={compact ? 70 : 104} /></div>
        {(arrived || last) && <Fireworks rate={arrived ? 1.6 : 0.8} className="cd-fw" />}
      </div>
      <div className="cd-body">
        <h2 id="cd-title" className="cd-title">{arrived ? t("ny.arrived", { year }) : t("ny.until", { year })}</h2>
        {c && !arrived && (
          <div className="cd-units" role="timer" aria-live="off" aria-label={t("ny.aria", { d: c.days, h: c.hours, m: c.minutes })}>
            <Unit value={c.days} label={t("ny.days")} />
            <span className="cd-sep" aria-hidden>:</span>
            <Unit value={c.hours} label={t("ny.hours")} />
            <span className="cd-sep" aria-hidden>:</span>
            <Unit value={c.minutes} label={t("ny.minutes")} />
            <span className="cd-sep" aria-hidden>:</span>
            <Unit value={c.seconds} label={t("ny.seconds")} />
          </div>
        )}
        <p className="cd-caption">{t("ny.caption")}</p>
        {cta && (
          <div className="cd-actions">
            <ButtonLink href={publicPage ? "/register" : "/app/newyear"} variant="primary" icon="gift">{publicPage ? t("ny.join") : t("ny.open")}</ButtonLink>
            <ButtonLink href={publicPage ? "/login" : "/app/map"} variant="secondary" icon={publicPage ? "key" : "sled"} className="cd-ghost">{publicPage ? t("auth.login") : t("ny.toMap")}</ButtonLink>
          </div>
        )}
      </div>
    </section>
  );
}
