"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MlMap, Marker as MlMarker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Shape } from "@/lib/domain/territory";
import type { Category, GeoPoint } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { CATEGORY_ICON, Icon } from "./icons";

export interface MapArea { id: string; shape: Shape; relation: "mine" | "group" | "other"; color: string; name: string }
export interface MapMission { id: string; title: string; category: Category; coordinates: GeoPoint; inMyArea: boolean; firstLook: boolean; joined: boolean }

const STYLE = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };
const RASTER: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6 } }],
};
const themeNow = () => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (name: string, fallback: string) => (typeof document === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const areaFeature = (a: MapArea, accent: string): GeoJSON.Feature => ({
  type: "Feature", id: a.id, properties: { id: a.id, relation: a.relation, name: a.name, color: a.relation === "mine" ? accent : a.color },
  geometry: { type: "MultiPolygon", coordinates: a.shape },
});

const svgCache = new Map<Category, string>();
const iconSvg = (c: Category) => {
  if (!svgCache.has(c)) svgCache.set(c, renderToStaticMarkup(<Icon name={CATEGORY_ICON[c]} size={15} strokeWidth={1.8} />));
  return svgCache.get(c)!;
};

function missionEl(m: MapMission) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `tm-pin cat-${m.category}${m.inMyArea ? " is-mine" : ""}${m.firstLook ? " is-first" : ""}${m.joined ? " is-joined" : ""}`;
  el.setAttribute("aria-label", m.title);
  el.innerHTML = `<span class="tm-pin-dot">${iconSvg(m.category)}</span>`;
  return el;
}

/**
 * The game map: this month's areas, the missions on it, where I am and — while capturing — the loop being walked.
 * `flash` briefly fills a newly taken area. Positron/dark vector tiles, raster OpenStreetMap as a fallback.
 */
export function TerritoryMap({ areas, missions, me, trace, flash, focus, onMission, selected, height = "100%" }: {
  areas: MapArea[];
  missions: MapMission[];
  me: (GeoPoint & { accuracy?: number | null }) | null;
  trace: GeoPoint[];
  flash: Shape | null;
  focus: { point: GeoPoint; zoom?: number; key: string } | null;
  onMission: (id: string) => void;
  selected: string | null;
  height?: string | number;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const pins = useRef<Map<string, MlMarker>>(new Map());
  const meMarker = useRef<MlMarker | null>(null);
  const [ready, setReady] = useState(0);
  const [failed, setFailed] = useState(false);
  const pick = useRef(onMission);
  pick.current = onMission;
  const latest = useRef({ areas, me });
  latest.current = { areas, me };

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    void import("maplibre-gl").then((ml) => {
      if (cancelled || !box.current) return;
      lib.current = ml;
      const a0 = latest.current.areas.find((a) => a.relation === "mine")?.shape[0]?.[0]?.[0] ?? latest.current.areas[0]?.shape[0]?.[0]?.[0];
      const c = latest.current.me ?? (a0 ? { lng: a0[0], lat: a0[1] } : { lat: 39.6542, lng: 66.9597 });
      let raster = false;
      const m = new ml.Map({
        container: box.current, style: STYLE[themeNow()], center: [c.lng, c.lat], zoom: 14.2, attributionControl: { compact: true },
        dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      m.on("error", (e) => {
        const msg = String((e as { error?: Error }).error?.message ?? "");
        if (!raster && /style|Failed to fetch|NetworkError|404|AJAXError/i.test(msg) && !m.isStyleLoaded()) { raster = true; m.setStyle(RASTER); }
      });
      m.on("style.load", () => setReady((n) => n + 1));
      m.once("load", () => box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
      map.current = m;
      observer = new MutationObserver(() => { if (!raster) m.setStyle(STYLE[themeNow()]); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      observer?.disconnect();
      pins.current.forEach((p) => p.remove());
      pins.current.clear();
      meMarker.current?.remove();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Sources and layers (again after every style change).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || m.getSource("areas")) return;
    const accent = css("--accent", "#0a6a2c");
    m.addSource("areas", { type: "geojson", data: fc([]) });
    m.addSource("flash", { type: "geojson", data: fc([]) });
    m.addSource("trace", { type: "geojson", data: fc([]) });
    m.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["match", ["get", "relation"], "mine", 0.26, "group", 0.2, 0.13],
    } });
    m.addLayer({ id: "areas-line", type: "line", source: "areas", layout: { "line-join": "round" }, paint: {
      "line-color": ["get", "color"], "line-width": ["match", ["get", "relation"], "mine", 2.6, 1.6],
      "line-dasharray": ["match", ["get", "relation"], "other", ["literal", [2, 1.5]], ["literal", [1, 0]]],
    } });
    m.addLayer({ id: "flash-fill", type: "fill", source: "flash", paint: { "fill-color": accent, "fill-opacity": 0 } });
    m.addLayer({ id: "flash-line", type: "line", source: "flash", paint: { "line-color": accent, "line-width": 4, "line-opacity": 0 } });
    m.addLayer({ id: "trace-casing", type: "line", source: "trace", filter: ["==", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.95 } });
    m.addLayer({ id: "trace-close", type: "line", source: "trace", filter: ["==", ["get", "k"], "close"], layout: { "line-cap": "round" }, paint: { "line-color": accent, "line-width": 2.5, "line-dasharray": [1, 1.6], "line-opacity": 0.8 } });
    m.addLayer({ id: "trace-line", type: "line", source: "trace", filter: ["==", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": accent, "line-width": 5 } });
    m.addLayer({ id: "trace-start", type: "circle", source: "trace", filter: ["==", ["get", "k"], "start"], paint: { "circle-radius": 8, "circle-color": "#ffffff", "circle-stroke-color": accent, "circle-stroke-width": 4 } });
    try {
      m.addLayer({ id: "areas-name", type: "symbol", source: "areas", minzoom: 13.5, layout: {
        "text-field": ["get", "name"], "text-size": 12, "text-font": ["Noto Sans Regular"], "text-allow-overlap": false, "symbol-placement": "point",
      }, paint: { "text-color": css("--text", "#1b1b1b"), "text-halo-color": css("--surface", "#ffffff"), "text-halo-width": 1.6 } });
    } catch { /* raster fallback has no glyphs */ }
    setReady((n) => n + 1);
  }, [ready]);

  // Areas.
  useEffect(() => {
    const src = map.current?.getSource("areas") as GeoJSONSource | undefined;
    if (!src) return;
    const accent = css("--accent", "#0a6a2c");
    src.setData(fc(areas.map((a) => areaFeature(a, accent))));
  }, [areas, ready]);

  // The loop being walked: the path, a dashed line back to the start, and the start point.
  useEffect(() => {
    const src = map.current?.getSource("trace") as GeoJSONSource | undefined;
    if (!src) return;
    if (trace.length < 1) { src.setData(fc([])); return; }
    const line = trace.map((p) => [p.lng, p.lat]);
    const first = line[0], last = line[line.length - 1];
    src.setData(fc([
      { type: "Feature", properties: { k: "start" }, geometry: { type: "Point", coordinates: first } },
      ...(line.length > 1 ? [{ type: "Feature" as const, properties: { k: "path" }, geometry: { type: "LineString" as const, coordinates: line } }] : []),
      ...(line.length > 2 ? [{ type: "Feature" as const, properties: { k: "close" }, geometry: { type: "LineString" as const, coordinates: [last, first] } }] : []),
    ]));
  }, [trace, ready]);

  // A newly taken area fills in, glows, then settles into the areas layer.
  useEffect(() => {
    const m = map.current;
    const src = m?.getSource("flash") as GeoJSONSource | undefined;
    if (!m || !src || !flash) return;
    src.setData(fc([{ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: flash } }]));
    if (reduced()) { m.setPaintProperty("flash-fill", "fill-opacity", 0); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 2200);
      const rise = Math.min(1, k / 0.25);
      const fall = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
      m.setPaintProperty("flash-fill", "fill-opacity", 0.55 * rise * fall);
      m.setPaintProperty("flash-line", "line-opacity", rise * fall);
      m.setPaintProperty("flash-line", "line-width", 4 + 10 * (1 - fall));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flash, ready]);

  // Mission pins (kept by id so they do not flicker).
  useEffect(() => {
    const m = map.current, ml = lib.current;
    if (!m || !ml) return;
    const keep = new Set(missions.map((x) => x.id));
    for (const [id, p] of pins.current) if (!keep.has(id)) { p.remove(); pins.current.delete(id); }
    missions.forEach((x, i) => {
      const old = pins.current.get(x.id);
      if (old) old.remove();
      const el = missionEl(x);
      el.style.setProperty("--i", String(Math.min(i, 12)));
      if (x.id === selected) el.classList.add("is-selected");
      el.addEventListener("click", (e) => { e.stopPropagation(); pick.current(x.id); });
      pins.current.set(x.id, new ml.Marker({ element: el, anchor: "center" }).setLngLat([x.coordinates.lng, x.coordinates.lat]).addTo(m));
    });
  }, [missions, selected, ready]);

  // Me.
  useEffect(() => {
    const m = map.current, ml = lib.current;
    if (!m || !ml) return;
    if (!me) { meMarker.current?.remove(); meMarker.current = null; return; }
    if (!meMarker.current) {
      const el = document.createElement("div");
      el.className = "tm-me";
      el.innerHTML = '<span class="tm-me-ring"></span><span class="tm-me-dot"></span>';
      meMarker.current = new ml.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m);
    } else meMarker.current.setLngLat([me.lng, me.lat]);
  }, [me, ready]);

  // Fly somewhere when asked.
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.easeTo({ center: [focus.point.lng, focus.point.lat], zoom: focus.zoom ?? Math.max(m.getZoom(), 15), duration: reduced() ? 0 : 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, ready > 0]);

  return (
    <div className="tm" style={{ height }} role="region" aria-label={t("map.label")}>
      <div ref={box} className="tm-canvas" />
      {failed && <div className="map-failed t-small secondary"><Icon name="map" size={18} />{t("map.failed")}</div>}
    </div>
  );
}
