/**
 * v6 · Feature 8: reports ("Shikoyat qilish").
 * A person flags a user, mission, organization, message, post, group or help signal; admins work a queue.
 * The reporter is never shown to the reported side. Pure rules here, storage in store/api6.ts.
 */

export const REPORT_TARGETS = ["user", "mission", "organization", "message", "post", "group", "signal"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

/** In queue order: safety first. */
export const REPORT_REASONS = ["unsafe", "harassment", "fraud", "fake_mission", "spam", "inappropriate", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_ACTIONS = ["dismiss", "warn", "hide", "suspend"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  /** who the target belongs to (the user themself, the mission's organization owner, the message author…) */
  targetOwnerId: string | null;
  reason: ReportReason;
  note: string;
  /** a copy of the reported text, kept as evidence even if the source changes */
  snapshot: string;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  decision: { by: string; action: ReportAction; note: string; at: string } | null;
  /** set when the target belongs to (or is) someone under 18: top of the queue */
  minor?: boolean;
  createdAt: string;
}

export const REPORTS = {
  noteMax: 500,
  perDay: 10,
  /** this many different reporters on one target → "urgent" */
  urgentReporters: 3,
  /** this many different reporters (accounts older than `autoHideMinAgeDays`) → a message or post is hidden until reviewed */
  autoHideReporters: 5,
  autoHideMinAgeDays: 7,
  /** this many dismissed reports in a row → the right to report pauses for `pauseDays` */
  dismissedInRow: 3,
  pauseDays: 7,
} as const;

export const targetKey = (type: ReportTarget, id: string) => `${type}:${id}`;

const REASON_RANK: Record<ReportReason, number> = { unsafe: 0, harassment: 1, fraud: 2, fake_mission: 3, spam: 4, inappropriate: 5, other: 6 };

/** May this person report this target now? Returns an i18n error key, or null. */
export function reportBlocked(mine: Report[], type: ReportTarget, id: string, now = Date.now()): string | null {
  if (mine.some((r) => r.targetType === type && r.targetId === id)) return "rpt.e.already";
  if (mine.filter((r) => now - Date.parse(r.createdAt) < 86_400_000).length >= REPORTS.perDay) return "rpt.e.daily";
  if (reportPausedUntil(mine, now)) return "rpt.e.paused";
  return null;
}

/** "reportTrust": after several dismissed reports in a row, reporting pauses for a week. */
export function reportPausedUntil(mine: Report[], now = Date.now()): number | null {
  const decided = mine.filter((r) => r.decision).sort((a, b) => Date.parse(b.decision!.at) - Date.parse(a.decision!.at));
  if (decided.length < REPORTS.dismissedInRow) return null;
  const last = decided.slice(0, REPORTS.dismissedInRow);
  if (!last.every((r) => r.status === "dismissed")) return null;
  const until = Date.parse(last[0].decision!.at) + REPORTS.pauseDays * 86_400_000;
  return until > now ? until : null;
}

export interface QueueItem {
  key: string;
  targetType: ReportTarget;
  targetId: string;
  targetOwnerId: string | null;
  reports: Report[];
  reporters: number;
  reason: ReportReason;
  urgent: boolean;
  minor: boolean;
  firstAt: string;
  snapshot: string;
}

/** Open reports grouped by target, most pressing first: minors, then reason, then urgent, then oldest. */
export function reportQueue(reports: Report[]): QueueItem[] {
  const by = new Map<string, Report[]>();
  for (const r of reports) {
    if (r.status !== "open" && r.status !== "reviewing") continue;
    const k = targetKey(r.targetType, r.targetId);
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const items: QueueItem[] = [...by.entries()].map(([key, list]) => {
    const reporters = new Set(list.map((r) => r.reporterId)).size;
    const reason = list.map((r) => r.reason).sort((a, b) => REASON_RANK[a] - REASON_RANK[b])[0];
    const first = list.reduce((a, b) => (Date.parse(a.createdAt) <= Date.parse(b.createdAt) ? a : b));
    return {
      key, targetType: first.targetType, targetId: first.targetId, targetOwnerId: first.targetOwnerId, reports: list, reporters, reason,
      urgent: reporters >= REPORTS.urgentReporters, minor: list.some((r) => r.minor), firstAt: first.createdAt, snapshot: first.snapshot,
    };
  });
  return items.sort((a, b) =>
    Number(b.minor) - Number(a.minor)
    || REASON_RANK[a.reason] - REASON_RANK[b.reason]
    || Number(b.urgent) - Number(a.urgent)
    || Date.parse(a.firstAt) - Date.parse(b.firstAt));
}

/**
 * A message or post is hidden until reviewed when enough independent, established accounts report it.
 * Accounts are never blocked automatically: only a person decides that.
 */
export function shouldAutoHide(target: { type: ReportTarget; reports: Report[] }, accountCreatedAt: (userId: string) => string | undefined, now = Date.now()) {
  if (target.type !== "message" && target.type !== "post") return false;
  const old = new Set(
    target.reports
      .filter((r) => r.status === "open" || r.status === "reviewing")
      .map((r) => r.reporterId)
      .filter((id) => { const c = accountCreatedAt(id); return Boolean(c) && now - Date.parse(c!) >= REPORTS.autoHideMinAgeDays * 86_400_000; }),
  );
  return old.size >= REPORTS.autoHideReporters;
}

export const isMinor = (birthYear: number | null | undefined, now = new Date()) => typeof birthYear === "number" && now.getFullYear() - birthYear < 18;
