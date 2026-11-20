import type { Evidence, GeoPoint, Mission, MissionParticipant, Submission, VerificationCheck } from "./types";

/** Great-circle distance in metres. */
export function distanceM(a: GeoPoint, b: GeoPoint) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Hamming distance of two hex-encoded 64-bit hashes. */
export function hammingHex(a: string, b: string) {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export const NEAR_DUPLICATE_BITS = 6;
export const DEFAULT_RADIUS_M = 400;

export interface CheckInput {
  submission: Pick<Submission, "images" | "gps" | "timestamp" | "userId" | "checklistDone" | "aiConfidence">;
  mission: Pick<Mission, "coordinates" | "date" | "duration" | "difficulty" | "radiusM" | "checklist">;
  participant: Pick<MissionParticipant, "startedAt" | "startGps"> | null;
  others: Pick<Submission, "images" | "userId">[];
}

export interface CheckResult {
  checks: VerificationCheck[];
  /** 0 = clean … 1 = very suspicious (stored as fraudScore) */
  score: number;
  /** short English flags kept for the v1 field */
  flags: string[];
}

const WEIGHT: Record<VerificationCheck["id"], number> = {
  photos: 1, duplicate: 3, captureTime: 1.5, photoLocation: 1.5, deviceLocation: 2, checkIn: 1, timeOnSite: 1, checklist: 0.5, ai: 2,
};

/**
 * Automatic verification signals. They inform the human reviewer and never approve or reject on their own.
 * Each check passes, warns, fails or is skipped when the data is not there.
 */
export function runChecks({ submission, mission, participant, others }: CheckInput): CheckResult {
  const checks: VerificationCheck[] = [];
  const radius = mission.radiusM ?? DEFAULT_RADIUS_M;
  const imgs: Evidence[] = submission.images;
  const start = Date.parse(mission.date);
  const submitted = Date.parse(submission.timestamp);

  const needed = mission.difficulty === "hard" ? 2 : 1;
  checks.push(imgs.length >= needed
    ? { id: "photos", result: "pass", detail: "chk.photos.ok", values: { n: imgs.length } }
    : { id: "photos", result: "warn", detail: "chk.photos.few", values: { n: imgs.length, need: needed } });

  const mine = new Set(imgs.map((i) => i.sha256));
  let dupOther = false;
  let dupSelf = false;
  for (const o of others) {
    for (const oi of o.images) {
      const same = mine.has(oi.sha256) || imgs.some((i) => i.phash && oi.phash && hammingHex(i.phash, oi.phash) <= NEAR_DUPLICATE_BITS);
      if (same) { if (o.userId === submission.userId) dupSelf = true; else dupOther = true; }
    }
  }
  checks.push(dupOther
    ? { id: "duplicate", result: "fail", detail: "chk.dup.other" }
    : dupSelf ? { id: "duplicate", result: "warn", detail: "chk.dup.self" } : { id: "duplicate", result: "pass", detail: "chk.dup.ok" });

  const times = imgs.map((i) => (i.capturedAt ? Date.parse(i.capturedAt) : NaN)).filter((t) => !Number.isNaN(t));
  if (!times.length) checks.push({ id: "captureTime", result: "skip", detail: "chk.time.none" });
  else {
    const early = times.filter((t) => t < start - 60 * 60_000).length;
    const late = times.filter((t) => t > submitted + 5 * 60_000).length;
    checks.push(early || late
      ? { id: "captureTime", result: "fail", detail: "chk.time.outside", values: { n: early + late } }
      : { id: "captureTime", result: "pass", detail: "chk.time.ok" });
  }

  const exif = imgs.flatMap((i) => (i.exifGps ? [i.exifGps] : []));
  if (!mission.coordinates || !exif.length) checks.push({ id: "photoLocation", result: "skip", detail: "chk.exif.none" });
  else {
    const far = Math.max(...exif.map((p) => distanceM(p, mission.coordinates!)));
    checks.push(far <= radius * 1.5
      ? { id: "photoLocation", result: "pass", detail: "chk.exif.ok", values: { m: Math.round(far) } }
      : { id: "photoLocation", result: far <= radius * 5 ? "warn" : "fail", detail: "chk.exif.far", values: { m: Math.round(far) } });
  }

  if (!mission.coordinates || !submission.gps) checks.push({ id: "deviceLocation", result: submission.gps ? "skip" : "warn", detail: submission.gps ? "chk.gps.nomission" : "chk.gps.none" });
  else {
    const d = distanceM(submission.gps, mission.coordinates);
    const slack = Math.min(submission.gps.accuracy, 500);
    checks.push(d <= radius + slack
      ? { id: "deviceLocation", result: "pass", detail: "chk.gps.ok", values: { m: Math.round(d) } }
      : { id: "deviceLocation", result: d <= (radius + slack) * 5 ? "warn" : "fail", detail: "chk.gps.far", values: { m: Math.round(d) } });
  }

  if (!participant?.startedAt) checks.push({ id: "checkIn", result: "warn", detail: "chk.start.none" });
  else if (participant.startGps && mission.coordinates) {
    const d = distanceM(participant.startGps, mission.coordinates);
    checks.push({ id: "checkIn", result: "pass", detail: "chk.start.ok", values: { m: Math.round(d) } });
  } else checks.push({ id: "checkIn", result: "pass", detail: "chk.start.nogps" });

  if (participant?.startedAt) {
    const min = Math.round((submitted - Date.parse(participant.startedAt)) / 60_000);
    const want = Math.round(mission.duration * 0.5);
    checks.push(min >= want
      ? { id: "timeOnSite", result: "pass", detail: "chk.site.ok", values: { min } }
      : { id: "timeOnSite", result: "warn", detail: "chk.site.short", values: { min, want } });
  } else checks.push({ id: "timeOnSite", result: "skip", detail: "chk.site.none" });

  const list = mission.checklist ?? [];
  if (!list.length) checks.push({ id: "checklist", result: "skip", detail: "chk.list.none" });
  else {
    const done = (submission.checklistDone ?? []).filter((x) => list.includes(x)).length;
    checks.push(done === list.length
      ? { id: "checklist", result: "pass", detail: "chk.list.ok", values: { n: done } }
      : { id: "checklist", result: "warn", detail: "chk.list.part", values: { n: done, total: list.length } });
  }

  const ai = submission.aiConfidence;
  checks.push(ai === null || ai === undefined
    ? { id: "ai", result: "skip", detail: "chk.ai.none" }
    : { id: "ai", result: ai >= 0.7 ? "pass" : ai >= 0.4 ? "warn" : "fail", detail: "chk.ai.score", values: { p: Math.round(ai * 100) } });

  let risk = 0;
  let total = 0;
  for (const c of checks) {
    if (c.result === "skip") continue;
    const w = WEIGHT[c.id];
    total += w;
    risk += w * (c.result === "fail" ? 1 : c.result === "warn" ? 0.4 : 0);
  }
  const score = total ? Math.round((risk / total) * 100) / 100 : 0.5;
  const flags = checks.filter((c) => c.result === "fail" || c.result === "warn").map((c) => `${c.id}:${c.result}`);
  return { checks, score, flags };
}

/** 0–100 trust shown to reviewers. */
export const trustPercent = (fraudScore: number) => Math.round((1 - fraudScore) * 100);
