"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "../icons";
import { Progress } from "../ui";
import { useI18n } from "@/lib/i18n";
import { celebrate } from "@/lib/fx";

const DEEDS: { id: string; icon: IconName }[] = [
  { id: "snow", icon: "snowflake" }, { id: "elder", icon: "heart" }, { id: "birds", icon: "leaf" },
  { id: "clothes", icon: "bag" }, { id: "kids", icon: "gift" }, { id: "tree", icon: "tree" },
];
const KEY = (y: number) => `worfix.deeds.${y}`;

/**
 * v8: "Qorbobo's helper" — six winter good deeds to tick off. It is a personal list (kept on this device, no reward:
 * rewards come only from verified missions), with a way into the real missions.
 */
export function GoodDeeds({ year }: { year: number }) {
  const { t } = useI18n();
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(KEY(year)) ?? "[]")); } catch { /* ignore */ } }, [year]);
  const toggle = (id: string, el: HTMLElement) => {
    setDone((d) => {
      const next = d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
      try { localStorage.setItem(KEY(year), JSON.stringify(next)); } catch { /* ignore */ }
      if (!d.includes(id) && next.length === DEEDS.length) celebrate(el, 120);
      return next;
    });
  };
  return (
    <section className="card pad stack g16" aria-labelledby="gd-h">
      <div className="stack g4">
        <h2 id="gd-h" className="t-h2 row g8"><Icon name="hands" size={20} />{t("gd.h")}</h2>
        <p className="t-small secondary">{t("gd.sub")}</p>
      </div>
      <Progress value={done.length / DEEDS.length} label={t("gd.h")} />
      <ul className="gd-list">
        {DEEDS.map((d) => {
          const on = done.includes(d.id);
          return (
            <li key={d.id}>
              <button type="button" className="gd-item" aria-pressed={on} onClick={(e) => toggle(d.id, e.currentTarget)}>
                <span className="gd-ico"><Icon name={on ? "check" : d.icon} size={18} /></span>
                <span className="stack g4 grow" style={{ minWidth: 0, textAlign: "left" }}>
                  <strong>{t(`gd.${d.id}`)}</strong>
                  <span className="t-small secondary">{t(`gd.${d.id}.b`)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="t-small secondary">{done.length === DEEDS.length ? t("gd.all") : t("gd.note")} <Link href="/app/map?view=list&tab=explore" className="link">{t("gd.find")}</Link></p>
    </section>
  );
}
