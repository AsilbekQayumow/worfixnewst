"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanTrace, loopAround, loopState, type TracePoint } from "../domain/territory";
import type { GeoPoint } from "../domain/types";
import { isNative, worfix, type WalkPoint } from "../native";

const KEY = "worfix.trace";
type Status = "idle" | "tracking" | "paused";
export type GpsProblem = "denied" | "unavailable" | "unsupported" | null;

interface Saved { points: TracePoint[]; status: Status; startedAt: number; pausedMs?: number; pausedAt?: number }

/**
 * Follows the phone's GPS while a loop is being walked. The walk survives a reload (sessionStorage),
 * keeps the screen awake where the browser allows it, and never leaves this device: only the finished
 * shape is sent. `simulate` (demo mode) walks a loop around a point so the game can be tried at a desk.
 *
 * v5: inside the WORFIX app the walk is recorded by the phone itself (a foreground service on Android, background
 * location + a Live Activity on iOS), so it goes on with the screen off and in a pocket; the page pulls the points.
 */
export function useTracker(native?: { color: string; labels: Record<string, string> }) {
  const [points, setPoints] = useState<TracePoint[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [startedAt, setStartedAt] = useState(0);
  /** time spent paused (ms) and when the current pause began: the walk clock counts active time only */
  const [pausedMs, setPausedMs] = useState(0);
  const [pausedAt, setPausedAt] = useState(0);
  const [me, setMe] = useState<(GeoPoint & { accuracy: number | null }) | null>(null);
  const [problem, setProblem] = useState<GpsProblem>(null);
  const [awake, setAwake] = useState(false);
  const watch = useRef<number | null>(null);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  const sim = useRef<number | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const nativeOpts = useRef(native);
  nativeOpts.current = native;
  /** the phone is recording this walk; nativeFrom = points already pulled */
  const nativeOn = useRef(false);
  const nativeFrom = useRef(0);
  const poll = useRef<number | null>(null);
  const nativeSignals = useRef<{ steps: number | null; mock: boolean }>({ steps: null, mock: false });

  const toTrace = (p: WalkPoint): TracePoint => ({ lat: p.lat, lng: p.lng, t: p.t, acc: p.acc });
  const pullNative = useCallback(async () => {
    const r = await (await worfix()).walkPoints({ from: nativeFrom.current });
    nativeFrom.current = r.total;
    // v6: fair play signals from the phone (step counter, mock location)
    nativeSignals.current = { steps: typeof r.steps === "number" ? r.steps : null, mock: Boolean(r.mock) || nativeSignals.current.mock };
    if (r.points.length) {
      const last = r.points[r.points.length - 1];
      setMe({ lat: last.lat, lng: last.lng, accuracy: last.acc });
      setPoints((xs) => [...xs, ...r.points.map(toTrace)]);
    }
    // "Stop" was pressed on the lock-screen panel: the walk waits, like Pause.
    if (!r.running && nativeOn.current && statusRef.current === "tracking") {
      nativeOn.current = false;
      if (poll.current != null) window.clearInterval(poll.current);
      poll.current = null;
      setStatus("paused");
    }
    return r;
  }, []);
  const stopPoll = () => { if (poll.current != null) window.clearInterval(poll.current); poll.current = null; };
  const startNative = useCallback(async (resume: boolean) => {
    if (!isNative() || !nativeOpts.current) return false;
    try {
      await (await worfix()).startWalk({ ...nativeOpts.current, resume });
      if (!resume) nativeFrom.current = 0;
      nativeOn.current = true;
      stopPoll();
      poll.current = window.setInterval(() => void pullNative().catch(() => {}), 1500);
      return true;
    } catch {
      return false;
    }
  }, [pullNative]);
  const stopNative = useCallback((clear: boolean) => {
    if (!nativeOn.current && !clear) return;
    stopPoll();
    const was = nativeOn.current;
    nativeOn.current = false;
    void (async () => {
      const w = await worfix();
      if (was && !clear) await pullNative().catch(() => {});
      await w.stopWalk({ clear });
      if (clear) nativeFrom.current = 0;
    })().catch(() => {});
  }, [pullNative]);

  // The app was reloaded while the phone kept recording: pick the walk up again.
  useEffect(() => {
    if (!isNative()) return;
    void worfix().then((w) => w.walkPoints({ from: 0 })).then((r) => {
      if (!r.running || !r.points.length) return;
      nativeFrom.current = r.total;
      nativeOn.current = true;
      setPoints(r.points.map(toTrace));
      setStatus("tracking");
      setStartedAt(r.points[0].t);
      stopPoll();
      poll.current = window.setInterval(() => void pullNative().catch(() => {}), 1500);
    }).catch(() => {});
  }, [pullNative]);

  // Restore an unfinished walk.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        if (s.points?.length && Date.now() - s.startedAt < 6 * 3_600_000) { setPoints(s.points); setStatus("paused"); setStartedAt(s.startedAt); setPausedMs(s.pausedMs ?? 0); setPausedAt(s.pausedAt ?? s.points[s.points.length - 1].t); }
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      if (status === "idle") sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, JSON.stringify({ points, status, startedAt, pausedMs, pausedAt } satisfies Saved));
    } catch { /* private mode */ }
  }, [points, status, startedAt, pausedMs, pausedAt]);

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
        if (statusRef.current === "tracking" && !nativeOn.current) setPoints((xs) => [...xs, { lat: p.lat, lng: p.lng, t: pos.timestamp || Date.now(), acc: p.accuracy }]);
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
    nativeSignals.current = { steps: null, mock: false };
    setStartedAt(Date.now());
    setPausedMs(0);
    setPausedAt(0);
    setStatus("tracking");
    void keepAwake();
    follow();
    void startNative(false);
  }, [follow, startNative]);

  const pause = useCallback(() => { setPausedAt(Date.now()); setStatus("paused"); releaseLock(); stopNative(false); }, [stopNative]);
  const resume = useCallback(() => { if (pausedAt) setPausedMs((m) => m + Math.max(0, Date.now() - pausedAt)); setPausedAt(0); setStatus("tracking"); void keepAwake(); follow(); void startNative(true); }, [follow, startNative, pausedAt]);
  const reset = useCallback(() => { stopSim(); setPoints([]); setPausedMs(0); setPausedAt(0); setStatus("idle"); releaseLock(); stopNative(true); }, [stopNative]);

  /** Demo: walks a loop of `radiusM` around `center` in about 9 seconds (timestamps at walking pace). */
  const simulate = useCallback((center: GeoPoint, radiusM = 160) => {
    stopWatch();
    stopSim();
    const walk = loopAround(center, radiusM, 40, Date.now(), 6.5);
    setPoints([]);
    nativeSignals.current = { steps: null, mock: false };
    setStartedAt(Date.now());
    setPausedMs(0);
    setPausedAt(0);
    setStatus("tracking");
    let i = 0;
    sim.current = window.setInterval(() => {
      const p = walk[i++];
      if (!p) { stopSim(); return; }
      setMe({ lat: p.lat, lng: p.lng, accuracy: 6 });
      setPoints((xs) => [...xs, p]);
    }, 220);
  }, []);

  // Leaving the map page does not stop a walk the phone is recording (it goes on in the background).
  useEffect(() => () => { stopWatch(); stopSim(); releaseLock(); stopPoll(); }, []);

  // Re-take the wake lock when the tab comes back; in the app, catch up on the points recorded meanwhile.
  useEffect(() => {
    const vis = () => {
      if (document.visibilityState !== "visible" || statusRef.current !== "tracking") return;
      void keepAwake();
      if (nativeOn.current) void pullNative().catch(() => {});
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  const stats = cleanTrace(points);
  const loop = loopState(points);
  /** active walking time in seconds (pauses excluded) */
  const elapsedSec = (now = Date.now()) => (startedAt ? Math.max(0, (now - startedAt - pausedMs - (status === "paused" && pausedAt ? now - pausedAt : 0)) / 1000) : 0);
  /** v6: what the fair-play check gets with the finished walk */
  const fairplay = () => (nativeOn.current || nativeSignals.current.steps != null ? { source: "app" as const, ...nativeSignals.current } : { source: "web" as const, steps: null, mock: false });
  return { points, status, startedAt, elapsedSec, fairplay, me, problem, awake, stats, loop, locate, start, pause, resume, reset, simulate, simulating: () => sim.current != null, background: () => nativeOn.current };
}
