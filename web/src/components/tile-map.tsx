"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MlMap, Marker as MlMarker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { GeoPoint } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n";
import { Icon } from "./icons";

export interface MapMarker extends GeoPoint {
  kind: "me" | "target" | "place";
  label?: string;
  accuracy?: number;
  active?: boolean;
}

/**
 * Vector map (MapLibre GL + OpenFreeMap tiles, OpenStreetMap data): smooth zoom and drag, light and dark styles.
 * If the vector style cannot load, it falls back to the standard OpenStreetMap raster tiles.
 * With onPick, a tap or a drag of the target pin chooses a point.
 */
const STYLE = { light: "https://tiles.openfreemap.org/styles/liberty", dark: "https://tiles.openfreemap.org/styles/dark" };
const RASTER: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const DEFAULT_CENTER: GeoPoint = { lat: 39.6542, lng: 66.9597 };

const themeNow = () => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function pinEl(m: MapMarker) {
  const el = document.createElement("div");
  el.className = `mpin mpin-${m.kind}${m.active ? " is-active" : ""}`;
  if (m.kind === "target") el.innerHTML = '<svg width="30" height="38" viewBox="-15 -36 30 38" aria-hidden="true"><path d="M0 0c-8-10-13-16-13-22a13 13 0 0 1 26 0c0 6-5 12-13 22Z"/><circle cy="-22" r="4.5"/></svg>';
  if (m.label) el.title = m.label;
  return el;
}

export function TileMap({ markers, route, height = 320, onPick, animateRoute = true, label }: {
  markers: MapMarker[];
  route?: GeoPoint[] | null;
  height?: number;
  onPick?: (p: GeoPoint) => void;
  animateRoute?: boolean;
  label?: string;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const pins = useRef<MlMarker[]>([]);
  const halo = useRef<MlMarker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const latest = useRef({ markers, route });
  latest.current = { markers, route };

  const fitKey = [...markers, ...(route ?? [])].map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    void import("maplibre-gl").then((ml) => {
      if (cancelled || !box.current) return;
      lib.current = ml;
      const first = latest.current.markers[0] ?? DEFAULT_CENTER;
      let triedRaster = false;
      const m = new ml.Map({
        container: box.current,
        style: STYLE[themeNow()],
        center: [first.lng, first.lat],
        zoom: 14,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => {
        // The vector style (or its tiles) failed: switch once to raster OpenStreetMap tiles.
        const msg = String((e as { error?: Error }).error?.message ?? "");
        if (!triedRaster && /style|Failed to fetch|NetworkError|404|AJAXError/i.test(msg) && !m.isStyleLoaded()) {
          triedRaster = true;
          m.setStyle(RASTER);
        }
      });
      m.on("style.load", () => { setReady(false); requestAnimationFrame(() => setReady(true)); });
      // Keep the attribution folded to its (i) button so it never covers the map; it opens on tap.
      m.once("load", () => box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
      m.on("click", (e) => { if (pick.current) pick.current({ lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6) }); });
      map.current = m;
      observer = new MutationObserver(() => { if (!triedRaster) m.setStyle(STYLE[themeNow()]); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      observer?.disconnect();
      pins.current.forEach((p) => p.remove());
      halo.current?.remove();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Keep the canvas sized with its box.
  useEffect(() => { map.current?.resize(); }, [height]);

  // Markers.
  useEffect(() => {
    const m = map.current, ml = lib.current;
    if (!m || !ml) return;
    pins.current.forEach((p) => p.remove());
    halo.current?.remove();
    halo.current = null;
    pins.current = markers.map((mk) => {
      const draggable = mk.kind === "target" && Boolean(pick.current);
      const pin = new ml.Marker({ element: pinEl(mk), anchor: mk.kind === "target" ? "bottom" : "center", draggable })
        .setLngLat([mk.lng, mk.lat]).addTo(m);
      if (draggable) pin.on("dragend", () => { const p = pin.getLngLat(); pick.current?.({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); });
      return pin;
    });
    const me = markers.find((x) => x.kind === "me" && x.accuracy);
    if (me && me.accuracy) {
      const el = document.createElement("div");
      el.className = "mpin-halo";
      const sync = () => {
        const metresPerPx = (40_075_016 * Math.cos((me.lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom());
        const r = Math.min(120, Math.max(10, me.accuracy! / metresPerPx));
        el.style.width = el.style.height = `${r * 2}px`;
      };
      sync();
      m.on("zoom", sync);
      halo.current = new ml.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m);
      const h = halo.current;
      const remove = h.remove.bind(h);
      h.remove = () => { m.off("zoom", sync); return remove(); };
    }
  }, [markers, ready]);

  // Route line (with a short drawing animation).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!m.isStyleLoaded()) {
      // The style is still loading images or sources: draw once the map settles.
      const again = () => setRetry((n) => n + 1);
      m.once("idle", again);
      return () => { m.off("idle", again); };
    }
    const coords = route && route.length > 1 ? route.map((p) => [p.lng, p.lat]) : [];
    const data = (c: number[][]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: c } });
    if (!m.getSource("route")) {
      m.addSource("route", { type: "geojson", data: data([]) });
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0a6a2c";
      m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
      m.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": accent, "line-width": 5 } });
    }
    const src = m.getSource("route") as GeoJSONSource;
    if (!coords.length || !animateRoute || reducedMotion()) { src.setData(data(coords)); return; }
    let raf = 0;
    const startAt = performance.now();
    const total = 700;
    const step = (now: number) => {
      const k = Math.min(1, (now - startAt) / total);
      const eased = 1 - (1 - k) ** 3;
      src.setData(data(coords.slice(0, Math.max(2, Math.ceil(coords.length * eased)))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ready, retry]);

  // Fit everything in view when the points change.
  const fit = () => {
    const m = map.current, ml = lib.current;
    const pts = [...latest.current.markers, ...(latest.current.route ?? [])];
    if (!m || !ml || !pts.length) return;
    if (pts.length === 1) { m.easeTo({ center: [pts[0].lng, pts[0].lat], zoom: Math.max(m.getZoom(), 15), duration: reducedMotion() ? 0 : 400 }); return; }
    const b = new ml.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: 48, maxZoom: 17, duration: reducedMotion() ? 0 : 500 });
  };
  useEffect(() => {
    if (!ready) return;
    // While picking, keep the user's zoom: only re-centre if the pin left the view.
    const m = map.current;
    if (pick.current && m && markers.length === 1) {
      const p = markers[0];
      if (!m.getBounds().contains([p.lng, p.lat])) m.easeTo({ center: [p.lng, p.lat], duration: reducedMotion() ? 0 : 400 });
      return;
    }
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  return (
    <div className="map" style={{ height }} role="region" aria-label={label ?? t("map.label")} data-picking={onPick ? "true" : undefined}>
      <div ref={box} className="map-canvas" />
      {failed && <div className="map-failed t-small secondary">{t("map.failed")}</div>}
      <div className="map-controls">
        <button type="button" onClick={fit} aria-label={t("map.fit")}><Icon name="crosshair" size={16} /></button>
      </div>
    </div>
  );
}
