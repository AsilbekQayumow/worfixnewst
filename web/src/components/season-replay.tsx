"use client";
/**
 * Season replay: my loops of this month appear one by one in my colour (about ten seconds in all),
 * with the date and the area so far, ending on the area I hold now.
 */
import { useEffect, useMemo, useState } from "react";
import type { Shape } from "@/lib/domain/territory";
import { useFmt, useI18n } from "@/lib/i18n";
import { shade } from "@/lib/map-colors";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Button, Skeleton } from "./ui";

const W = 640, H = 400, PAD = 28;

function project(shapes: Shape[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) for (const poly of s) for (const ring of poly) for (const [lng, lat] of ring) {
    minX = Math.min(minX, lng); maxX = Math.max(maxX, lng); minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
  }
  const k = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
  const w = Math.max(1e-6, (maxX - minX) * k), h = Math.max(1e-6, maxY - minY);
  const scale = Math.min((W - PAD * 2) / w, (H - PAD * 2) / h);
  const ox = (W - w * scale) / 2, oy = (H - h * scale) / 2;
  return (s: Shape) => s.map((poly) => poly.map((ring) => ring.map(([lng, lat], i) =>
    `${i ? "L" : "M"}${(ox + (lng - minX) * k * scale).toFixed(1)},${(oy + (maxY - lat) * scale).toFixed(1)}`).join("") + "Z").join("")).join("");
}

export function SeasonReplay({ color }: { color: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api.seasonTimeline());
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);
  const d = q.data;
  const steps = useMemo(() => (d?.steps ?? []).filter((s) => s.loop), [d]);
  const path = useMemo(() => {
    if (!d) return null;
    const all = [...steps.map((s) => s.loop!), ...(d.final ? [d.final] : [])];
    return all.length ? project(all) : null;
  }, [d, steps]);

  useEffect(() => {
    if (!d) return;
    const total = steps.length + 1;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(total); return; }
    setShown(0);
    const every = Math.max(450, Math.min(1400, 9000 / total));
    let i = 0;
    const id = window.setInterval(() => { i += 1; setShown(i); if (i >= total) window.clearInterval(id); }, every);
    return () => window.clearInterval(id);
  }, [d, steps.length, run]);

  if (!d) return <Skeleton rows={1} height={260} />;
  if (!path) return <p className="secondary">{t("tl.empty")}</p>;
  const done = shown > steps.length;
  const cur = steps[Math.min(shown, steps.length) - 1];
  const area = done ? d.areaM2 : cur?.areaM2 ?? 0;
  const dark = shade(color);

  return (
    <div className="stack g12">
      <div className="replay" style={{ ["--c" as string]: color }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("tl.title")}>
          <defs>
            <pattern id="replay-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="currentColor" strokeOpacity=".07" /></pattern>
          </defs>
          <rect width={W} height={H} fill="url(#replay-grid)" />
          {steps.slice(0, shown).map((s, i) => (
            <path key={`${run}-${i}`} d={path(s.loop!)} className="replay-loop" fill={color} fillOpacity={done ? 0.12 : 0.3} stroke={dark} strokeWidth="2" strokeLinejoin="round" />
          ))}
          {done && d.final && <path key={`f${run}`} d={path(d.final)} className="replay-final" fill={color} fillOpacity=".38" stroke={dark} strokeWidth="3" strokeLinejoin="round" />}
        </svg>
        <div className="replay-hud">
          <span className="t-small">{done ? t("tl.now") : cur ? f.date(cur.at) : "—"}</span>
          <span className="t-h2 num">{area >= 1e6 ? `${(area / 1e6).toFixed(2)} km²` : `${f.num(Math.round(area))} m²`}</span>
        </div>
      </div>
      <div className="row between g12 wrap">
        <span className="t-small secondary">{t("tl.count", { n: steps.length })}</span>
        <Button size="sm" icon="refresh" onClick={() => setRun((r) => r + 1)}>{t("tl.again")}</Button>
      </div>
    </div>
  );
}
