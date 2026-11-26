/**
 * v6 · Feature 4: "ending soon" reminders, worked out every 30 minutes by the Worker cron.
 *  • spots     — over 80% of places taken: to matching people in the area who have not joined
 *  • deadline  — sign-up closes within 24 h: same audience
 *  • soon24 / soon2 — starts in 24 h / 2 h: to those who joined
 *  • proof     — ended 12 h ago (within a week), no evidence yet: to those who joined
 * Each (user, mission, kind) is sent once (reminderLog). "spots" and "deadline" together: at most one a day per person.
 */
import type { Category, Mission, MissionParticipant, Submission, UserProfile } from "./types";

export const REMINDER_KINDS = ["spots", "deadline", "soon24", "soon2", "proof"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface NotifyPrefs { nearby: boolean; deadline: boolean; mine: boolean; proof: boolean }
export const DEFAULT_PREFS: NotifyPrefs = { nearby: true, deadline: true, mine: true, proof: true };
const PREF_OF: Record<ReminderKind, keyof NotifyPrefs> = { spots: "nearby", deadline: "deadline", soon24: "mine", soon2: "mine", proof: "proof" };
const DISCOVERY: ReminderKind[] = ["spots", "deadline"];

export interface ReminderLog { id: string; userId: string; missionId: string; kind: ReminderKind; sentAt: string; openedAt?: string | null }
export const reminderLogId = (userId: string, missionId: string, kind: ReminderKind) => `${userId}_${missionId}_${kind}`;

const H = 3_600_000;

/** 22:00–08:00 in Tashkent (UTC+5): pushes wait, the in-app notification is written at once. */
export function quietHours(now = Date.now()) {
  const h = new Date(now + 5 * H).getUTCHours();
  return h >= 22 || h < 8;
}

/** Interest or skill match, and the same province (or city when the province is unknown). */
export function matches(u: Pick<UserProfile, "interests" | "province" | "city"> & { skillIds?: string[] }, m: Pick<Mission, "category" | "location"> & { skillsWanted?: { skillId: string }[]; province?: string; city?: string }) {
  const interest = (u.interests as Category[]).includes(m.category) || (m.skillsWanted ?? []).some((w) => (u.skillIds ?? []).includes(w.skillId));
  if (!interest) return false;
  const where = (m.province || m.city || m.location || "").toLowerCase();
  const mine = [u.province, u.city].filter(Boolean).map((x) => x.toLowerCase().replace(/ region| viloyati| область/g, "").trim());
  return mine.some((x) => x && where.includes(x));
}

export interface Due { userId: string; missionId: string; kind: ReminderKind }

export function dueReminders(input: {
  now: number;
  missions: (Mission & { skillsWanted?: { skillId: string }[]; province?: string; city?: string })[];
  participants: MissionParticipant[];
  submissions: Pick<Submission, "missionId" | "userId">[];
  users: (UserProfile & { skillIds?: string[] })[];
  sent: Pick<ReminderLog, "id" | "userId" | "kind" | "sentAt">[];
}): Due[] {
  const { now } = input;
  const sentIds = new Set(input.sent.map((s) => s.id));
  const discoveryToday = new Set(input.sent.filter((s) => DISCOVERY.includes(s.kind) && now - Date.parse(s.sentAt) < 24 * H).map((s) => s.userId));
  const out: Due[] = [];
  const prefsOf = (u: { notifyPrefs?: Partial<NotifyPrefs> | null }) => ({ ...DEFAULT_PREFS, ...(u.notifyPrefs ?? {}) });
  const push = (u: (typeof input.users)[number], missionId: string, kind: ReminderKind) => {
    if (!prefsOf(u)[PREF_OF[kind]]) return;
    const id = reminderLogId(u.id, missionId, kind);
    if (sentIds.has(id)) return;
    if (DISCOVERY.includes(kind)) {
      if (discoveryToday.has(u.id)) return;
      discoveryToday.add(u.id);
    }
    sentIds.add(id);
    out.push({ userId: u.id, missionId, kind });
  };
  const volunteers = input.users.filter((u) => u.role === "volunteer" && u.status === "active");
  for (const m of input.missions) {
    if (m.status !== "published" || m.source === "agent") continue;
    const joined = input.participants.filter((p) => p.missionId === m.id && p.status === "accepted");
    const joinedIds = new Set(joined.map((p) => p.userId));
    const start = Date.parse(m.date);
    const deadline = Date.parse(m.deadline);
    const full = m.participantsCount >= m.capacity;
    const open = !full && deadline > now;
    // discovery
    const spots = open && m.capacity > 0 && m.participantsCount / m.capacity > 0.8;
    const closing = open && deadline - now <= 24 * H;
    if (spots || closing) {
      for (const u of volunteers) {
        if (joinedIds.has(u.id) || !matches(u, m)) continue;
        push(u, m.id, spots ? "spots" : "deadline");
      }
    }
    // personal
    const users = new Map(volunteers.map((u) => [u.id, u]));
    for (const p of joined) {
      const u = users.get(p.userId);
      if (!u) continue;
      const until = start - now;
      if (until > 0 && until <= 2 * H) push(u, m.id, "soon2");
      else if (until > 2 * H && until <= 24 * H) push(u, m.id, "soon24");
      const end = start + m.duration * 60_000; // duration is in minutes
      if (now - end >= 12 * H && now - end < 7 * 24 * H && !input.submissions.some((s) => s.missionId === m.id && s.userId === u.id)) push(u, m.id, "proof");
    }
  }
  return out;
}
