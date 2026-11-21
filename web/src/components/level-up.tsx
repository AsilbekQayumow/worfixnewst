"use client";
import { useEffect, useState } from "react";
import { levelForXp, rankFor, RANKS } from "@/lib/domain/rewards";
import { useI18n } from "@/lib/i18n";
import { Icon } from "./icons";
import { RankBadge } from "./rank";
import { useMe } from "./providers";
import { Button } from "./ui";

const KEY = (id: string) => `worfix.level.${id}`;

/**
 * Celebrates a new level once (rare event: the delight budget lives here).
 * The last level seen is kept per account in this browser; the first visit only records it.
 */
export function LevelUp() {
  const { t } = useI18n();
  const { me } = useMe();
  const [shown, setShown] = useState<{ level: number; newRank: boolean } | null>(null);
  const level = me ? levelForXp(me.xp) : 0;

  useEffect(() => {
    if (!me) return;
    let seen = 0;
    try { seen = Number(localStorage.getItem(KEY(me.id)) ?? 0); } catch { return; }
    if (seen && level > seen) setShown({ level, newRank: rankFor(level) !== rankFor(seen) });
    try { localStorage.setItem(KEY(me.id), String(level)); } catch { /* private mode */ }
  }, [me, level]);

  useEffect(() => {
    if (!shown) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setShown(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [shown]);

  if (!shown) return null;
  const rank = rankFor(shown.level);
  const i = RANKS.findIndex((r) => r.id === rank);
  return (
    <div className="levelup" role="dialog" aria-modal="true" aria-labelledby="levelup-title" onClick={() => setShown(null)}>
      <div className="levelup-card" onClick={(e) => e.stopPropagation()}>
        <div className="levelup-rays" aria-hidden />
        <RankBadge rank={rank} size={112} />
        <span className="t-small secondary">{shown.newRank ? t("lu.newRank") : t("lu.newLevel")}</span>
        <h2 id="levelup-title" className="t-h1">{t(`rank.${rank}`)}</h2>
        <span className="t-h3 num">{t("lvl.long", { n: shown.level })}</span>
        <ol className="rank-ladder" aria-label={t("lu.ladder")}>
          {RANKS.map((r, k) => <li key={r.id} data-state={k < i ? "done" : k === i ? "now" : "next"}>{t(`rank.${r.id}`)}</li>)}
        </ol>
        <Button variant="primary" icon="check" onClick={() => setShown(null)}>{t("lu.great")}</Button>
        <button type="button" className="btn btn-ghost btn-sm btn-icon levelup-x" aria-label={t("a.close")} onClick={() => setShown(null)}><Icon name="x" size={16} /></button>
      </div>
    </div>
  );
}
