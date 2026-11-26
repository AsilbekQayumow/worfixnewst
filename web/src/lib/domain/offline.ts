/**
 * v6 · Feature 15: offline mode. Writes made without a connection wait in an outbox and are sent in order when the
 * connection comes back. Every operation carries a client id and targets a deterministic document, so sending the
 * same thing twice cannot create two records. Rewards are only ever shown after the server accepted the write.
 */
export const OUTBOX_KINDS = ["startMission", "submitEvidence", "captureTerritory", "sendMessage"] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];
export interface OutboxOp { opId: string; kind: OutboxKind; payload: unknown; createdAt: string; capturedAt: string; attempts: number; status: "waiting" | "sending" | "failed"; error?: string; label?: string }

export const OFFLINE = { maxAgeHours: 72, maxAttempts: 5 } as const;

/** Submission ids are `${missionId}_${userId}`, like participant ids: a retried send updates, never duplicates. */
export const submissionIdOf = (missionId: string, userId: string) => `${missionId}_${userId}`;

/**
 * Device clocks cannot be trusted. capturedAt must be after the mission started, before it reached the server,
 * at most 72 h before it, and never in the future. Anything else goes to a moderator.
 */
export function captureTimeOk(capturedAt: string, opts: { startedAt?: string | null; syncedAt: string }) {
  const c = Date.parse(capturedAt), s = Date.parse(opts.syncedAt);
  if (!Number.isFinite(c)) return false;
  if (c > s + 2 * 60_000) return false;
  if (s - c > OFFLINE.maxAgeHours * 3_600_000) return false;
  if (opts.startedAt && c < Date.parse(opts.startedAt) - 5 * 60_000) return false;
  return true;
}

/** Errors worth retrying later (no network) versus final ones (the mission closed, the place was taken…). */
export function retryable(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /network|offline|fetch|unavailable|timeout|Failed to fetch/i.test(msg) || (typeof navigator !== "undefined" && navigator.onLine === false);
}
