"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MlMap, Marker as MlMarker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Shape } from "@/lib/domain/territory";
import type { Category, GeoPoint } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { shade } from "@/lib/map-colors";
import { CATEGORY_ICON, Icon } from "./icons";

export interface MapArea { id: string; shape: Shape; relation: "mine" | "group" | "other"; color: string; name: string }
export interface MapMission { id: string; title: string; category: Category; coordinates: GeoPoint; inMyArea: boolean; firstLook: boolean; joined: boolean }

const STYLE = { light: "https://tiles.openfreemap.org/styles/liberty", dark: "https://tiles.openfreemap.org/styles/dark" };
const RASTER: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6 } }],
};
const themeNow = () => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");
/** Dark map with the dark theme, and in the evening (19:00–06:00 local) whatever the theme. */
export const isNight = (d = new Date()) => d.getHours() >= 19 || d.getHours() < 6;
const styleNow = () => (themeNow() === "dark" || isNight() ? "dark" : "light");
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (name: string, fallback: string) => (typeof document === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const areaFeature = (a: MapArea): GeoJSON.Feature => ({
  type: "Feature", id: a.id, properties: { id: a.id, relation: a.relation, name: a.name, color: a.color, line: shade(a.color) },
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
 * `flash` briefly fills a newly taken area. Liberty/dark vector tiles, raster OpenStreetMap as a fallback.
 */
export function TerritoryMap({ areas, missions, me, trace, flash, taken, hot, done, onDone, focus, onMission, selected, myColor, height = "100%" }: {
  areas: MapArea[];
  missions: MapMission[];
  me: (GeoPoint & { accuracy?: number | null }) | null;
  trace: GeoPoint[];
  flash: Shape | null;
  /** Parts of other people's areas a new loop just took: they flare in their owner's colour and give way. */
  taken?: { shape: Shape; color: string }[] | null;
  /** v4: places where verified work was done (a check pin; tapping shows the before/after photos). */
  done?: { id: string; point: GeoPoint }[];
  onDone?: (id: string) => void;
  /** This week's busiest spot: a slow pulse with a label. */
  hot?: { point: GeoPoint; label: string } | null;
  focus: { point: GeoPoint; zoom?: number; key: string } | null;
  onMission: (id: string) => void;
  selected: string | null;
  /** The player's own colour: the loop being walked and a newly taken area. */
  myColor?: string;
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
  const latest = useRef({ areas, me, myColor });
  latest.current = { areas, me, myColor };

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let clock = 0;
    void import("maplibre-gl").then((ml) => {
      if (cancelled || !box.current) return;
      lib.current = ml;
      const a0 = latest.current.areas.find((a) => a.relation === "mine")?.shape[0]?.[0]?.[0] ?? latest.current.areas[0]?.shape[0]?.[0]?.[0];
      const c = latest.current.me ?? (a0 ? { lng: a0[0], lat: a0[1] } : { lat: 39.6542, lng: 66.9597 });
      let raster = false;
      const m = new ml.Map({
        container: box.current, style: STYLE[styleNow()], center: [c.lng, c.lat], zoom: 14.2, attributionControl: { compact: true },
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
      let current = styleNow();
      const restyle = () => { const next = styleNow(); if (!raster && next !== current) { current = next; m.setStyle(STYLE[next]); } };
      observer = new MutationObserver(restyle);
      clock = window.setInterval(restyle, 60_000);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearInterval(clock);
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
    const accent = latest.current.myColor ?? css("--accent", "#0a6a2c");
    m.addSource("areas", { type: "geojson", data: fc([]) });
    m.addSource("flash", { type: "geojson", data: fc([]) });
    m.addSource("trace", { type: "geojson", data: fc([]) });
    m.addSource("taken", { type: "geojson", data: fc([]) });
    m.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["match", ["get", "relation"], "mine", 0.26, "group", 0.2, 0.13],
    } });
    m.addLayer({ id: "areas-line", type: "line", source: "areas", layout: { "line-join": "round" }, paint: {
      "line-color": ["get", "line"], "line-width": ["match", ["get", "relation"], "mine", 2.6, 1.6],
      "line-dasharray": ["match", ["get", "relation"], "other", ["literal", [2, 1.5]], ["literal", [1, 0]]],
    } });
    m.addLayer({ id: "taken-fill", type: "fill", source: "taken", paint: { "fill-color": ["get", "color"], "fill-opacity": 0 } });
    m.addLayer({ id: "taken-line", type: "line", source: "taken", paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0, "line-dasharray": [1.5, 1] } });
    m.addLayer({ id: "flash-fill", type: "fill", source: "flash", paint: { "fill-color": accent, "fill-opacity": 0 } });
    m.addLayer({ id: "flash-line", type: "line", source: "flash", paint: { "line-color": accent, "line-width": 4, "line-opacity": 0 } });
    m.addLayer({ id: "trace-glow", type: "line", source: "trace", filter: ["==", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": accent, "line-width": 28, "line-opacity": 0.35, "line-blur": 10 } });
    m.addLayer({ id: "trace-casing", type: "line", source: "trace", filter: ["==", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.95 } });
    m.addLayer({ id: "trace-close", type: "line", source: "trace", filter: ["==", ["get", "k"], "close"], layout: { "line-cap": "round" }, paint: { "line-color": accent, "line-width": 2.5, "line-dasharray": [1, 1.6], "line-opacity": 0.8 } });
    m.addLayer({ id: "trace-line", type: "line", source: "trace", filter: ["==", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": accent, "line-width": 5 } });
    m.addLayer({ id: "trace-halo", type: "circle", source: "trace", filter: ["==", ["get", "k"], "head"], paint: { "circle-radius": 14, "circle-color": accent, "circle-opacity": 0.25, "circle-blur": 0.4 } });
    m.addLayer({ id: "trace-head", type: "circle", source: "trace", filter: ["==", ["get", "k"], "head"], paint: { "circle-radius": 6, "circle-color": accent, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } });
    m.addLayer({ id: "trace-start", type: "circle", source: "trace", filter: ["==", ["get", "k"], "start"], paint: { "circle-radius": 8, "circle-color": "#ffffff", "circle-stroke-color": accent, "circle-stroke-width": 4 } });
    try {
      m.addLayer({ id: "areas-name", type: "symbol", source: "areas", minzoom: 13.5, layout: {
        "text-field": ["get", "name"], "text-size": 12, "text-font": ["Noto Sans Regular"], "text-allow-overlap": false, "symbol-placement": "point",
      }, paint: styleNow() === "dark"
        ? { "text-color": "#f3f0e8", "text-halo-color": "#16181c", "text-halo-width": 1.6 }
        : { "text-color": css("--text", "#1b1b1b"), "text-halo-color": css("--surface", "#ffffff"), "text-halo-width": 1.6 } });
    } catch { /* raster fallback has no glyphs */ }
    setReady((n) => n + 1);
  }, [ready]);

  // Areas.
  useEffect(() => {
    const src = map.current?.getSource("areas") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData(fc(areas.map(areaFeature)));
  }, [areas, ready]);

  // My own colour for the walked loop and the new-area flash (it can arrive after the layers exist).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !myColor || !m.getLayer("trace-line")) return;
    const dark = shade(myColor);
    m.setPaintProperty("trace-line", "line-color", myColor);
    m.setPaintProperty("trace-close", "line-color", myColor);
    m.setPaintProperty("trace-glow", "line-color", myColor);
    m.setPaintProperty("trace-halo", "circle-color", myColor);
    m.setPaintProperty("trace-head", "circle-color", myColor);
    m.setPaintProperty("trace-start", "circle-stroke-color", dark);
    m.setPaintProperty("flash-fill", "fill-color", myColor);
    m.setPaintProperty("flash-line", "line-color", dark);
  }, [myColor, ready]);

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
      ...(line.length > 1 ? [{ type: "Feature" as const, properties: { k: "head" }, geometry: { type: "Point" as const, coordinates: last } }] : []),
    ]));
  }, [trace, ready]);

  // The head of the walked line breathes while a loop is being walked.
  const walking = trace.length > 1;
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !walking || reduced() || !m.getLayer("trace-halo")) return;
    let raf = 0;
    const step = (now: number) => {
      const k = (Math.sin(now / 420) + 1) / 2;
      m.setPaintProperty("trace-halo", "circle-radius", 11 + 9 * k);
      m.setPaintProperty("trace-halo", "circle-opacity", 0.32 - 0.2 * k);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [walking, ready]);

  // Ground taken from others flares in its owner's colour, then gives way to the new area.
  useEffect(() => {
    const m = map.current;
    const src = m?.getSource("taken") as GeoJSONSource | undefined;
    if (!m || !src || !taken?.length) return;
    src.setData(fc(taken.map((x) => ({ type: "Feature" as const, properties: { color: x.color }, geometry: { type: "MultiPolygon" as const, coordinates: x.shape } }))));
    if (reduced()) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1500);
      const pulse = k < 0.5 ? Math.abs(Math.sin(k * Math.PI * 4)) : 1 - (k - 0.5) / 0.5;
      m.setPaintProperty("taken-fill", "fill-opacity", 0.5 * pulse);
      m.setPaintProperty("taken-line", "line-opacity", pulse);
      m.setPaintProperty("taken-line", "line-width", 3 + 5 * (1 - pulse));
      if (k < 1) raf = requestAnimationFrame(step);
      else src.setData(fc([]));
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [taken, ready]);

  // Work already done.
  const donePins = useRef<MlMarker[]>([]);
  const pickDone = useRef(onDone);
  pickDone.current = onDone;
  useEffect(() => {
    const m = map.current, ml = lib.current;
    donePins.current.forEach((p) => p.remove());
    donePins.current = [];
    if (!m || !ml || !done?.length) return;
    const check = renderToStaticMarkup(<Icon name="check" size={14} strokeWidth={2.4} />);
    done.forEach((x, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "tm-done";
      el.setAttribute("aria-label", t("dn.title"));
      el.style.setProperty("--i", String(Math.min(i, 12)));
      el.innerHTML = check;
      el.addEventListener("click", (e) => { e.stopPropagation(); pickDone.current?.(x.id); });
      donePins.current.push(new ml.Marker({ element: el, anchor: "center" }).setLngLat([x.point.lng, x.point.lat]).addTo(m));
    });
    return () => { donePins.current.forEach((p) => p.remove()); donePins.current = []; };
  }, [done, ready > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // This week's busiest spot.
  const hotMarker = useRef<MlMarker | null>(null);
  useEffect(() => {
    const m = map.current, ml = lib.current;
    hotMarker.current?.remove(); hotMarker.current = null;
    if (!m || !ml || !hot) return;
    const el = document.createElement("div");
    el.className = "tm-hot";
    el.innerHTML = `<span class="tm-hot-ring"></span><span class="tm-hot-ring r2"></span><span class="tm-hot-label"></span>`;
    (el.querySelector(".tm-hot-label") as HTMLElement).textContent = hot.label;
    hotMarker.current = new ml.Marker({ element: el, anchor: "center" }).setLngLat([hot.point.lng, hot.point.lat]).addTo(m);
    return () => { hotMarker.current?.remove(); hotMarker.current = null; };
  }, [hot?.point.lat, hot?.point.lng, hot?.label, ready > 0]);

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

  // Design rec. 5: pins closer than 40 px fold into one numbered bubble; tapping it zooms in. Recomputed after every move.
  const clusters = useRef<MlMarker[]>([]);
  useEffect(() => {
    const m = map.current, ml = lib.current;
    if (!m || !ml) return;
    const run = () => {
      clusters.current.forEach((c) => c.remove());
      clusters.current = [];
      const items = missions.filter((x) => pins.current.has(x.id)).map((x) => ({ x, p: m.project([x.coordinates.lng, x.coordinates.lat]) }));
      const used = new Set<string>();
      for (const a of items) {
        if (used.has(a.x.id)) continue;
        const group = items.filter((b) => !used.has(b.x.id) && Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < 40);
        const keepAlone = group.length < 3 || m.getZoom() >= 16 || group.some((g) => g.x.id === selected);
        for (const g of group) {
          (pins.current.get(g.x.id)!.getElement() as HTMLElement).style.visibility = keepAlone ? "" : "hidden";
          if (!keepAlone) used.add(g.x.id);
        }
        if (keepAlone) continue;
        const lng = group.reduce((s2, g) => s2 + g.x.coordinates.lng, 0) / group.length;
        const lat = group.reduce((s2, g) => s2 + g.x.coordinates.lat, 0) / group.length;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "tm-cluster";
        el.textContent = String(group.length);
        el.setAttribute("aria-label", String(group.length));
        el.addEventListener("click", (e) => { e.stopPropagation(); m.easeTo({ center: [lng, lat], zoom: Math.min(17, m.getZoom() + 2) }); });
        clusters.current.push(new ml.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(m));
      }
    };
    run();
    m.on("moveend", run);
    return () => { m.off("moveend", run); clusters.current.forEach((c) => c.remove()); clusters.current = []; };
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
