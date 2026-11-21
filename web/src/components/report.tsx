"use client";
import Link from "next/link";
import { CATEGORIES } from "@/lib/domain/types";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { GroupMark } from "./group-bits";
import { CATEGORY_ICON, Icon } from "./icons";
import { Skeleton } from "./ui";

const UZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
/** Short month name; Uzbek is spelled out by hand because browsers print "M06" for uz-Latn. */
export function monthShort(mk: string, lang: string, locale: string) {
  const d = new Date(`${mk}-01T00:00:00`);
  return lang === "uz" ? UZ_MONTHS[d.getMonth()] : d.toLocaleDateString(locale, { month: "short" });
}

type Report = NonNullable<Awaited<ReturnType<typeof api.myReport>>>;

function Delta({ now, before, unit = "" }: { now: number; before: number; unit?: string }) {
  const { t } = useI18n();
  const d = Math.round((now - before) * 10) / 10;
  if (!before && !now) return <span className="t-meta">{t("rp.noData")}</span>;
  const tone = d > 0 ? "up" : d < 0 ? "down" : "flat";
  return (
    <span className={`delta delta-${tone}`}>
      <Icon name={d > 0 ? "arrowRight" : d < 0 ? "arrowRight" : "minus"} size={12} style={{ transform: d > 0 ? "rotate(-45deg)" : d < 0 ? "rotate(45deg)" : undefined }} />
      {d > 0 ? "+" : ""}{d}{unit} {t("rp.vsLast")}
    </span>
  );
}

/** Six months of XP as bars; the current month carries the accent. */
function MonthBars({ data }: { data: Report["byMonth"] }) {
  const { t, locale, lang } = useI18n();
  const f = useFmt();
  const max = Math.max(1, ...data.map((d) => d.xp));
  const W = 360, H = 140, gap = 12, bw = (W - gap * (data.length - 1)) / data.length;
  const label = (mk: string) => monthShort(mk, lang, locale);
  return (
    <figure className="stack g8" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="month-bars" role="img" aria-label={t("rp.chartLabel")}>
        <line x1={0} x2={W} y1={H} y2={H} className="axis" />
        {data.map((d, i) => {
          const h = Math.max(d.xp ? 4 : 0, (d.xp / max) * (H - 18));
          const x = i * (bw + gap);
          const last = i === data.length - 1;
          return (
            <g key={d.month}>
              <title>{`${label(d.month)}: ${d.xp} XP · ${d.missions} · ${d.hours} h`}</title>
              <rect x={x} y={H - h} width={bw} height={h} rx={6} className={last ? "bar-now" : "bar-past"} />
              {d.xp > 0 && <text x={x + bw / 2} y={H - h - 6} textAnchor="middle" className="bar-val">{f.num(d.xp)}</text>}
              <text x={x + bw / 2} y={H + 16} textAnchor="middle" className="bar-lbl">{label(d.month)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="t-meta">{t("rp.chartCaption")}</figcaption>
    </figure>
  );
}

/** "My report" on the home page: this month against last month, six months of XP, causes, impact, ranks and group. */
export function MyReport() {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api.myReport());
  if (!q.data) return <Skeleton rows={3} height={140} />;
  const r = q.data;
  const cats = CATEGORIES.map((c) => ({ c, ...(r.categories[c] ?? { missions: 0, hours: 0 }) })).filter((x) => x.missions > 0).sort((a, b) => b.missions - a.missions);
  const maxCat = Math.max(1, ...cats.map((x) => x.missions));
  const impact = Object.entries(r.impact).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <section className="stack g16" aria-labelledby="report-h">
      <div className="section-title"><h2 id="report-h" className="t-h2">{t("rp.title")}</h2><span className="t-small muted">{t("rp.sub")}</span></div>
      <div className="grid cols-3">
        <div className="card pad stack g4"><span className="stat-label">{t("rp.xpMonth")}</span><span className="stat-value num">{f.num(r.thisMonth.xp)}</span><Delta now={r.thisMonth.xp} before={r.lastMonth.xp} /></div>
        <div className="card pad stack g4"><span className="stat-label">{t("rp.hoursMonth")}</span><span className="stat-value num">{r.thisMonth.hours}</span><Delta now={r.thisMonth.hours} before={r.lastMonth.hours} /></div>
        <div className="card pad stack g4"><span className="stat-label">{t("rp.missionsMonth")}</span><span className="stat-value num">{r.thisMonth.missions}</span><Delta now={r.thisMonth.missions} before={r.lastMonth.missions} /></div>
      </div>

      <div className="report-grid">
        <div className="card pad stack g12"><h3 className="t-h3">{t("rp.months")}</h3><MonthBars data={r.byMonth} /></div>
        <div className="card pad stack g12">
          <h3 className="t-h3">{t("rp.causes")}</h3>
          {cats.length === 0 ? <p className="t-small muted">{t("rp.noCauses")}</p> : (
            <ul className="stack g12">
              {cats.map((x) => (
                <li key={x.c} className={`stack g4 cat-${x.c}`}>
                  <span className="row between t-small"><span className="row g8"><Icon name={CATEGORY_ICON[x.c]} size={14} style={{ color: "var(--cat)" }} />{t(`cat.${x.c}`)}</span><span className="num secondary">{x.missions} · {t("u.hours", { n: x.hours })}</span></span>
                  <span className="hbar"><span style={{ width: `${(x.missions / maxCat) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid cols-4 rank-tiles">
        {r.ranks.map((x) => (
          <Link key={x.scope} href={`/app/rating?scope=${x.scope}&period=all`} className="card pad stack g4">
            <span className="t-small secondary">{t(`sc.${x.scope}`)}</span>
            <span className="stat-value num">{x.rank ? `#${x.rank}` : "—"}</span>
            <span className="t-meta">{x.missing ? t("rt.noArea") : t("rt.of", { n: x.total })}</span>
          </Link>
        ))}
      </div>

      <div className="report-grid">
        <div className="card pad stack g12">
          <h3 className="t-h3">{t("rp.impact")}</h3>
          {impact.length === 0 ? <p className="t-small muted">{t("rp.noImpact")}</p> : (
            <div className="grid cols-2" style={{ gap: 12 }}>
              {impact.map(([k, v]) => <div key={k} className="stack"><span className="t-h2 num">{f.num(v)}</span><span className="t-small secondary">{k}</span></div>)}
            </div>
          )}
          <span className="t-small muted">{t("rp.totals", { hours: Math.round(r.hours * 10) / 10, missions: r.missions })}</span>
        </div>
        {r.group ? (
          <Link href={`/app/groups/${r.group.id}`} className="card pad stack g12">
            <h3 className="t-h3">{t("rp.group")}</h3>
            <div className="row g12">
              <GroupMark name={r.group.name} color={r.group.color} size={44} />
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: 500 }}>{r.group.name}</span>
                <span className="t-small secondary">{t("gr.levelN", { n: r.group.level })} · {f.num(r.group.xp)} XP · {t("gr.members", { n: r.group.members })}</span>
              </span>
            </div>
            <span className="t-small secondary">{t("rp.share", { p: r.group.myShare })}</span>
          </Link>
        ) : (
          <Link href="/app/groups" className="card pad stack g8">
            <h3 className="t-h3">{t("rp.group")}</h3>
            <span className="t-small secondary">{t("rp.noGroup")}</span>
            <span className="t-small accent-text row g4">{t("gr.open")} <Icon name="arrowRight" size={14} /></span>
          </Link>
        )}
      </div>
    </section>
  );
}
