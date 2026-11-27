"use client";
import { useState } from "react";
import { PageHead } from "@/components/shell";
import { ImpactCounter, LookAvatar, LookTitle } from "@/components/game";
import { Icon } from "@/components/icons";
import { Button, Empty, Select, Skeleton, useToast } from "@/components/ui";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api7 } from "@/lib/store/api7";
import { useApi } from "@/lib/store/hooks";
import type { Wrapped } from "@/lib/game/wrapped";

/** v7: the monthly summary card, shareable as a picture. */
export default function WrappedPage() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const q = useApi(() => api7.wrapped(month), [month]);
  const d = q.data;
  const [busy, setBusy] = useState(false);
  const monthName = (m: string) => f.month(new Date(`${m}-15T00:00:00Z`)).replace(/^./, (c) => c.toUpperCase()) + ` ${m.slice(0, 4)}`;

  const share = async () => {
    if (!d) return;
    setBusy(true);
    try {
      const blob = await drawCard(d.data, d.me.name, monthName(d.data.month), {
        missions: t("wr.missions"), hours: t("wr.hours"), km: t("wr.km"), area: t("wr.area"), season: t("wr.season"), streak: t("wr.streak"),
        top: d.data.topCategory ? t(`cat.${d.data.topCategory}`) : "", place: [d.me.mahalla, d.me.district].filter(Boolean).join(", "), fmt: f.num,
      });
      const file = new File([blob], `worfix-${d.data.month}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (x: unknown) => boolean };
      if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: "WORFIX", text: t("wr.shareText", { m: monthName(d.data.month) }) });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    } catch (e) { if ((e as Error).name !== "AbortError") toast(errText(e), "error"); } finally { setBusy(false); }
  };

  return (
    <div className="stack g24 enter">
      <PageHead title={t("wr.title")} sub={t("wr.sub")} actions={d && d.months.length > 1 ? (
        <Select aria-label={t("wr.month")} value={d.data.month} onChange={(e) => setMonth(e.target.value)}>{d.months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</Select>
      ) : undefined} />
      {!d ? <Skeleton rows={2} height={160} /> : d.data.empty ? (
        <div className="card"><Empty icon="calendar" title={t("wr.empty")} body={t("wr.emptyBody")} /></div>
      ) : (
        <>
          <section className="wrapped7">
            <div className="row g12">
              <LookAvatar name={d.me.name} src={d.me.avatar} size={56} frame={d.me.look?.frame} />
              <div className="stack g4" style={{ minWidth: 0 }}><strong className="truncate">{d.me.name}</strong><LookTitle id={d.me.look?.title} /><span className="t-small wrapped7-sub">{monthName(d.data.month)}</span></div>
            </div>
            <div className="wrapped7-grid">
              <Cell n={f.num(d.data.missions)} l={t("wr.missions")} />
              {d.data.hours > 0 && <Cell n={f.num(d.data.hours)} l={t("wr.hours")} />}
              {d.data.km > 0 && <Cell n={f.num(d.data.km)} l={t("wr.km")} />}
              {d.data.areaM2 > 0 && <Cell n={f.num(d.data.areaM2)} l={t("wr.area")} />}
              {d.data.seasonXp > 0 && <Cell n={f.num(d.data.seasonXp)} l={t("wr.season")} />}
              {d.data.bestStreak > 0 && <Cell n={f.num(d.data.bestStreak)} l={t("wr.streak")} />}
            </div>
            {d.data.topCategory && <p className="row g8"><Icon name="heart" size={16} />{t("wr.top", { c: t(`cat.${d.data.topCategory}`) })}</p>}
          </section>
          <Button variant="primary" size="lg" icon="share" loading={busy} onClick={share}>{t("wr.share")}</Button>
          <ImpactCounter items={d.data.impact.length ? d.data.impact : d.impactTotal} title={d.data.impact.length ? t("im.month") : t("im.title")} />
        </>
      )}
    </div>
  );
}

function Cell({ n, l }: { n: string; l: string }) {
  return <div className="wrapped7-cell"><b className="num">{n}</b><span>{l}</span></div>;
}

async function drawCard(w: Wrapped, name: string, month: string, L: { missions: string; hours: string; km: string; area: string; season: string; streak: string; top: string; place: string; fmt: (n: number) => string }) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 1080, 1350);
  g.addColorStop(0, "#0d5c2e"); g.addColorStop(1, "#16324f");
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
  x.fillStyle = "rgba(255,255,255,.08)";
  for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(980 - i * 40, 160 + i * 25, 220 - i * 18, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = "#fff";
  x.font = "800 52px Nunito, system-ui, sans-serif"; x.fillText("WORFIX", 80, 130);
  x.font = "600 40px Nunito, system-ui, sans-serif"; x.globalAlpha = .85; x.fillText(month, 80, 200); x.globalAlpha = 1;
  x.font = "800 76px Nunito, system-ui, sans-serif"; x.fillText(name.slice(0, 22), 80, 320);
  if (L.place) { x.font = "500 34px Nunito, system-ui, sans-serif"; x.globalAlpha = .8; x.fillText(L.place.slice(0, 44), 80, 375); x.globalAlpha = 1; }
  const cells: [string, string][] = [[L.fmt(w.missions), L.missions]];
  if (w.hours) cells.push([L.fmt(w.hours), L.hours]);
  if (w.km) cells.push([L.fmt(w.km), L.km]);
  if (w.areaM2) cells.push([L.fmt(w.areaM2), L.area]);
  if (w.seasonXp) cells.push([L.fmt(w.seasonXp), L.season]);
  if (w.bestStreak) cells.push([L.fmt(w.bestStreak), L.streak]);
  cells.slice(0, 6).forEach(([n, l], i) => {
    const cx = 80 + (i % 2) * 470, cy = 470 + Math.floor(i / 2) * 230;
    x.fillStyle = "rgba(255,255,255,.12)"; x.beginPath(); x.roundRect(cx, cy, 440, 200, 32); x.fill();
    x.fillStyle = "#fff"; x.font = "800 88px Nunito, system-ui, sans-serif"; x.fillText(n, cx + 36, cy + 110);
    x.font = "600 32px Nunito, system-ui, sans-serif"; x.globalAlpha = .85; x.fillText(l, cx + 36, cy + 160); x.globalAlpha = 1;
  });
  if (L.top) { x.font = "700 38px Nunito, system-ui, sans-serif"; x.fillText(`♥ ${L.top}`, 80, 1220); }
  x.font = "600 30px Nunito, system-ui, sans-serif"; x.globalAlpha = .7; x.fillText("worfix.site", 80, 1290); x.globalAlpha = 1;
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("e.generic"))), "image/png"));
}
