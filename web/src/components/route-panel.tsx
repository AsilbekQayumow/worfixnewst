"use client";
import { useEffect, useRef, useState } from "react";
import { distanceM } from "@/lib/domain/checks";
import type { GeoPoint, GpsFix } from "@/lib/domain/types";
import { useFmt, useI18n } from "@/lib/i18n";
import { directionsLink, walkingRoute, type Route } from "@/lib/map/geo";
import { watchPosition } from "@/lib/store/media";
import { Icon } from "./icons";
import { TileMap } from "./tile-map";
import { Notice, Status } from "./ui";

/** Live walking route from the volunteer's position to the mission, shown once the mission is started. */
export function RoutePanel({ target, radiusM, onFix }: { target: GeoPoint; radiusM: number; onFix?: (f: GpsFix) => void }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const [me, setMe] = useState<GpsFix | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const routedFrom = useRef<GpsFix | null>(null);
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => watchPosition((fix) => { setErr(null); setMe(fix); onFixRef.current?.(fix); }, setErr), []);

  useEffect(() => {
    if (!me) return;
    if (routedFrom.current && distanceM(routedFrom.current, me) < 150) return;
    routedFrom.current = me;
    // Draw the straight line at once, then replace it with the walking route when the router answers.
    setRoute((r) => r ?? { path: [me, target], distanceM: distanceM(me, target), durationS: distanceM(me, target) / (4.8 / 3.6), routed: false });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    walkingRoute(me, target, ac.signal, lang === "ru" ? "ru" : "en").then(setRoute).catch(() => undefined).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ac.abort(); };
  }, [me, target, lang]);

  const left = me ? distanceM(me, target) : null;
  const arrived = left !== null && me !== null && left <= radiusM + Math.min(me.accuracy, 200);

  return (
    <div className="stack g12">
      <TileMap
        height={340}
        markers={[...(me ? [{ ...me, kind: "me" as const }] : []), { ...target, kind: "target" as const }]}
        route={route?.path ?? null}
        label={t("route.mapLabel")}
      />
      {err && <Notice tone="warn">{t(err)} {t("route.noGps")}</Notice>}
      <div className="row between wrap g12">
        {arrived ? (
          <Status tone="ok">{t("route.arrived")}</Status>
        ) : route ? (
          <span className="row g16 wrap">
            <span className="stack"><span className="t-small secondary">{t("route.distance")}</span><span className="num" style={{ fontWeight: 500 }}>{f.distance(route.distanceM)}</span></span>
            <span className="stack"><span className="t-small secondary">{t("route.walk")}</span><span className="num" style={{ fontWeight: 500 }}>{f.duration(Math.max(1, Math.round(route.durationS / 60)))}</span></span>
            {!route.routed && <span className="t-small muted" style={{ alignSelf: "flex-end" }}>{t("route.straight")}</span>}
          </span>
        ) : (
          <span className="t-small secondary row g8"><span className="spinner" aria-hidden /> {t("route.locating")}</span>
        )}
        <a className="btn btn-secondary btn-sm" href={directionsLink(me, target)} target="_blank" rel="noreferrer"><Icon name="external" size={16} />{t("route.openOsm")}</a>
      </div>
      {route?.steps && route.steps.length > 1 && !arrived && (
        <details className="route-steps">
          <summary className="t-small">{t("route.steps", { n: route.steps.length })}</summary>
          <ol>
            {route.steps.map((s, i) => (
              <li key={i} className="row g12">
                <span className="grow t-small">{s.text}</span>
                {s.distanceM > 0 && <span className="t-meta num">{f.distance(s.distanceM)}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
