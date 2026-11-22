"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanTrace, loopAround, loopState, type TracePoint } from "../domain/territory";
import type { GeoPoint } from "../domain/types";

const KEY = "worfix.trace";
type Status = "idle" | "tracking" | "paused";
export type GpsProblem = "denied" | "unavailable" | "unsupported" | null;

interface Saved { points: TracePoint[]; status: Status; startedAt: number }

/**
 * Follows the phone's GPS while a loop is being walked. The walk survives a reload (sessionStorage),
 * keeps the screen awake where the browser allows it, and never leaves this device: only the finished
 * shape is sent. `simulate` (demo mode) walks a loop around a point so the game can be tried at a desk.
 */
export function useTracker() {
  const [points, setPoints] = useState<TracePoint[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [me, setMe] = useState<(GeoPoint & { accuracy: number | null }) | null>(null);
  const [problem, setProblem] = useState<GpsProblem>(null);
  const [awake, setAwake] = useState(false);
  const watch = useRef<number | null>(null);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  const sim = useRef<number | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  // Restore an unfinished walk.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        if (s.points?.length && Date.now() - s.startedAt < 6 * 3_600_000) { setPoints(s.points); setStatus("paused"); setStartedAt(s.startedAt); }
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      if (status === "idle") sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, JSON.stringify({ points, status, startedAt } satisfies Saved));
    } catch { /* private mode */ }
  }, [points, status, startedAt]);

  const stopWatch = () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); watch.current = null; };
  const stopSim = () => { if (sim.current != null) window.clearInterval(sim.current); sim.current = null; };
  const releaseLock = () => { void lock.current?.release().catch(() => {}); lock.current = null; setAwake(false); };
  const keepAwake = async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl) { lock.current = await wl.request("screen"); setAwake(true); }
    } catch { setAwake(false); }
  };

  const follow = useCallback(() => {
    if (!("geolocation" in navigator)) { setProblem("unsupported"); return; }
    stopWatch();
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setProblem(null);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
        setMe(p);
        if (statusRef.current === "tracking") setPoints((xs) => [...xs, { lat: p.lat, lng: p.lng, t: pos.timestamp || Date.now(), acc: p.accuracy }]);
      },
      (err) => setProblem(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
    );
  }, []);

  /** Shows where I am (no walk yet). */
  const locate = useCallback(() => follow(), [follow]);

  const start = useCallback(() => {
    stopSim();
    setPoints([]);
    setStartedAt(Date.now());
    setStatus("tracking");
    void keepAwake();
    follow();
  }, [follow]);

  const pause = useCallback(() => { setStatus("paused"); releaseLock(); }, []);
  const resume = useCallback(() => { setStatus("tracking"); void keepAwake(); follow(); }, [follow]);
  const reset = useCallback(() => { stopSim(); setPoints([]); setStatus("idle"); releaseLock(); }, []);

  /** Demo: walks a loop of `radiusM` around `center` in about 9 seconds (timestamps at walking pace). */
  const simulate = useCallback((center: GeoPoint, radiusM = 160) => {
    stopWatch();
    stopSim();
    const walk = loopAround(center, radiusM, 40, Date.now(), 6.5);
    setPoints([]);
    setStartedAt(Date.now());
    setStatus("tracking");
    let i = 0;
    sim.current = window.setInterval(() => {
      const p = walk[i++];
      if (!p) { stopSim(); return; }
      setMe({ lat: p.lat, lng: p.lng, accuracy: 6 });
      setPoints((xs) => [...xs, p]);
    }, 220);
  }, []);

  useEffect(() => () => { stopWatch(); stopSim(); releaseLock(); }, []);

  // Re-take the wake lock when the tab comes back.
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible" && statusRef.current === "tracking") void keepAwake(); };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  const stats = cleanTrace(points);
  const loop = loopState(points);
  return { points, status, startedAt, me, problem, awake, stats, loop, locate, start, pause, resume, reset, simulate, simulating: () => sim.current != null };
}
