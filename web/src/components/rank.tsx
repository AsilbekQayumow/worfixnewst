"use client";
import { levelForXp, RANKS, rankFor, xpForLevel, type RankId } from "@/lib/domain/rewards";
import { useFmt, useI18n } from "@/lib/i18n";
import { Progress } from "./ui";

const RANK_COLOR: Record<RankId, string> = {
  explorer: "#2f8f5b", volunteer: "#1d6fb8", protector: "#c27a12", guardian: "#7a4cc2", legend: "#b8862b",
};

/** Hexagonal rank badge with a leaf (the WORFIX mark), coloured by rank. */
export function RankBadge({ rank, size = 48 }: { rank: RankId; size?: number }) {
  const c = RANK_COLOR[rank];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="rank-badge">
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill={c} />
      <path d="M32 9.5 51.5 20.8v22.4L32 54.5 12.5 43.2V20.8Z" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2" />
      <path d="M22 40c0-11 8-18 21-19-1 12-8 20-19 20l-2-1Zm2 0c4-6 9-10 14-13" fill="#fff" fillOpacity=".92" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** The ladder Explorer → Volunteer → Protector → Guardian → Legend, with progress to the next rank. */
export function RankLadder({ xp }: { xp: number }) {
  const { t } = useI18n();
  const f = useFmt();
  const level = levelForXp(xp);
  const rank = rankFor(level);
  const i = RANKS.findIndex((r) => r.id === rank);
  const next = RANKS[i + 1];
  const from = xpForLevel(RANKS[i].from);
  const to = next ? xpForLevel(next.from) : from;
  const frac = next ? Math.min(1, (xp - from) / (to - from)) : 1;
  return (
    <div className="stack g12">
      <div className="row g12">
        <RankBadge rank={rank} size={52} />
        <div className="stack g4 grow" style={{ minWidth: 0 }}>
          <span className="t-h3">{t(`rank.${rank}`)} · <span className="num">{t("lvl.long", { n: level })}</span></span>
          <span className="t-small secondary">{next ? t("rk.toNext", { rank: t(`rank.${next.id}`), xp: f.num(Math.max(0, to - xp)) }) : t("rk.top")}</span>
        </div>
      </div>
      <ol className="rank-ladder" aria-label={t("lu.ladder")}>
        {RANKS.map((r, k) => <li key={r.id} data-state={k < i ? "done" : k === i ? "now" : "next"}>{t(`rank.${r.id}`)}</li>)}
      </ol>
      {next && <Progress value={frac} label={t("rk.progress")} />}
    </div>
  );
}
