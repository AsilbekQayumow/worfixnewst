/**
 * v6 · Feature 10: GPS fair play for territory walks and mission check-ins.
 * Only the resulting numbers are stored, never the raw trace.
 *
 * Signals: the phone's mock-location flag, steps per km (the strongest: ~1000–1500 on foot, ~0 in a car),
 * the 95th-percentile speed, a suspiciously constant accuracy (typical of fake GPS), and stretches dropped as too fast.
 * The score is 0…1. In shadow mode (the default for the first weeks) the verdict is recorded but not applied,
 * except for a mock location, which always blocks the walk.
 */
import { distanceM, type TracePoint } from "./territory";

export type MoveMode = "walk" | "assisted";

export interface TrackStats {
  distanceM: number;
  durationS: number;
  p95Speed: number;
  /** null when the device gave no step count (web, or the permission was denied) */
  stepsPerKm: number | null;
  /** 0…1: how straight the path runs, segment by segment (roads driven at speed are very straight) */
  straightness: number;
  accuracyMedian: number | null;
  /** every fix reported the very same accuracy */
  accuracyFlat: boolean;
  source: "app" | "web";
  mock: boolean;
}

export const FAIRPLAY = {
  /** shadow = score and record only; switch to false after calibrating on real walks */
  shadow: true,
  p95Kmh: 14,
  minStepsPerKm: 600,
  /** the step check needs this much distance to mean anything */
  stepsMinDistanceM: 200,
  accept: 0.3,
  reject: 0.6,
  /** three rejections in 30 days → a moderator looks at the account */
  strikes: 3,
  strikeDays: 30,
} as const;

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}

export function trackStats(points: TracePoint[], extra: { steps?: number | null; mock?: boolean; source: "app" | "web" }): TrackStats {
  const speeds: number[] = [];
  let dist = 0;
  let turn = 0;
  let turns = 0;
  let prevHeading: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = distanceM(a, b);
    const dt = (b.t - a.t) / 1000;
    dist += d;
    if (dt > 0) speeds.push((d / dt) * 3.6);
    if (d < 3) continue;
    const h = Math.atan2(b.lng - a.lng, b.lat - a.lat);
    if (prevHeading != null) {
      let dh = Math.abs(h - prevHeading);
      if (dh > Math.PI) dh = 2 * Math.PI - dh;
      turn += dh;
      turns++;
    }
    prevHeading = h;
  }
  const accs = points.map((p) => p.acc).filter((x): x is number => typeof x === "number");
  const steps = typeof extra.steps === "number" && extra.steps >= 0 ? extra.steps : null;
  return {
    distanceM: Math.round(dist),
    durationS: points.length > 1 ? Math.round((points[points.length - 1].t - points[0].t) / 1000) : 0,
    p95Speed: Math.round(percentile(speeds, 0.95) * 10) / 10,
    stepsPerKm: steps == null || dist < 1 ? null : Math.round(steps / (dist / 1000)),
    straightness: turns ? Math.round((1 - turn / turns / Math.PI) * 100) / 100 : 1,
    accuracyMedian: accs.length ? percentile(accs, 0.5) : null,
    accuracyFlat: accs.length >= 8 && new Set(accs.map((a) => Math.round(a * 10))).size === 1,
    source: extra.source,
    mock: Boolean(extra.mock),
  };
}

export type FairplayFlag = "mock" | "fast" | "no_steps" | "flat_accuracy" | "dropped";

export function fairplayScore(s: TrackStats, opts: { mode?: MoveMode; droppedFast?: number; points?: number } = {}) {
  const flags: FairplayFlag[] = [];
  let score = 0;
  if (s.mock) { flags.push("mock"); score += 1; }
  if (s.p95Speed > FAIRPLAY.p95Kmh) { flags.push("fast"); score += 0.4; }
  if ((opts.mode ?? "walk") === "walk" && s.stepsPerKm != null && s.distanceM >= FAIRPLAY.stepsMinDistanceM && s.stepsPerKm < FAIRPLAY.minStepsPerKm) {
    flags.push("no_steps");
    score += 0.45;
  }
  if (s.accuracyFlat) { flags.push("flat_accuracy"); score += 0.25; }
  if (opts.points && opts.droppedFast && opts.droppedFast / opts.points > 0.2) { flags.push("dropped"); score += 0.2; }
  return { score: Math.min(1, Math.round(score * 100) / 100), flags };
}

export type FairplayVerdict = "accept" | "delay" | "reject";
export const fairplayVerdict = (score: number): FairplayVerdict => (score < FAIRPLAY.accept ? "accept" : score < FAIRPLAY.reject ? "delay" : "reject");

/**
 * What actually happens to the walk. A mock location always blocks it; otherwise the verdict is applied only
 * when shadow mode is off. A web walk (no mock or step signal) may add area but never takes it from others.
 */
export function fairplayOutcome(s: TrackStats, score: number, shadow: boolean = FAIRPLAY.shadow) {
  const verdict = fairplayVerdict(score);
  const blocked = s.mock || (!shadow && verdict === "reject");
  const mayTake = !blocked && s.source === "app" && score < FAIRPLAY.accept;
  return { verdict, blocked, mayTake, delayed: !blocked && !shadow && verdict === "delay" };
}
