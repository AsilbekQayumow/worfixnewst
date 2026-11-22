/**
 * Groups, local leaderboards (mahalla → tuman → viloyat → respublika) and help signals.
 * Pure functions shared by the app and the tests.
 */
import { levelForXp } from "./rewards";
import type { Group, Mission, Submission, UserProfile } from "./types";

export const GROUP_MAX_MEMBERS = 30;
export const GROUP_COLORS = ["#0a6a2c", "#1d5fa8", "#b4580f", "#5b6b2f", "#b32554", "#0f7a7a"] as const;
export const SIGNAL_RADIUS_KM = 2;
export const SIGNAL_HOURS = 6;
export const SIGNALS_PER_DAY = 3;

/** Comparable form of a place name: case, apostrophes and words like "tumani", "mahallasi" do not matter. */
const STOP = new Set(["tumani", "tuman", "shahri", "shahar", "mahallasi", "mahalla", "mfy", "region", "viloyati", "viloyat", "district", "city", "sh", "t", "район", "город", "махалля", "область", "г"]);
export function placeKey(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ʻʼ'’‘`´]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

export const SCOPES = ["mahalla", "district", "province", "country"] as const;
export type Scope = (typeof SCOPES)[number];

type Place = { country?: string; province?: string; district?: string; mahalla?: string };

/** The part of an address that a scope compares; null when the person has not filled it in. */
export function scopeKey(p: Place, scope: Scope): string | null {
  const country = placeKey(p.country || "Uzbekistan");
  if (scope === "country") return country;
  const province = placeKey(p.province);
  if (!province) return null;
  if (scope === "province") return `${country}|${province}`;
  const district = placeKey(p.district);
  if (!district) return null;
  if (scope === "district") return `${country}|${province}|${district}`;
  const mahalla = placeKey(p.mahalla);
  return mahalla ? `${country}|${province}|${district}|${mahalla}` : null;
}

/** XP a submission earned: what approval granted, or the mission's XP for approvals before v3. */
export function earnedXp(s: Submission, mission: Pick<Mission, "rewardXP"> | undefined) {
  if (s.verificationStatus !== "approved") return 0;
  return s.grant?.xp ?? mission?.rewardXP ?? 0;
}

export const monthKey = (iso: string) => iso.slice(0, 7);

export interface BoardRow { id: string; name: string; avatar: string | null; xp: number; level: number; sub: string; color?: string; members?: number; isMe: boolean }

/**
 * Volunteers ranked inside the viewer's area for one scope.
 * period "month": XP from approvals in the current month; "all": total XP.
 */
export function volunteerBoard(opts: {
  viewer: UserProfile; users: UserProfile[]; submissions: Submission[]; missions: Mission[]; scope: Scope; period: "month" | "all"; now: string;
}): { rows: BoardRow[]; missing: boolean } {
  const { viewer, scope } = opts;
  const key = scopeKey(viewer, scope);
  if (!key) return { rows: [], missing: true };
  const missions = new Map(opts.missions.map((m) => [m.id, m]));
  const month = monthKey(opts.now);
  const monthly = new Map<string, number>();
  if (opts.period === "month") {
    for (const s of opts.submissions) {
      if (s.verificationStatus !== "approved" || !s.reviewedAt || monthKey(s.reviewedAt) !== month) continue;
      monthly.set(s.userId, (monthly.get(s.userId) ?? 0) + earnedXp(s, missions.get(s.missionId)));
    }
  }
  const rows = opts.users
    .filter((u) => u.role === "volunteer" && u.status === "active" && u.onboarded && scopeKey(u, scope) === key)
    .filter((u) => u.id === viewer.id || (u.privacy ?? "public") !== "private")
    .map((u) => {
      const xp = opts.period === "month" ? monthly.get(u.id) ?? 0 : u.xp;
      return { id: u.id, name: u.fullName, avatar: u.avatar, xp, level: levelForXp(u.xp), sub: [u.mahalla, u.district].filter(Boolean).join(", ") || u.city, isMe: u.id === viewer.id };
    })
    .filter((r) => r.xp > 0 || r.isMe)
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  return { rows, missing: false };
}

/** XP of each group: approved missions its members did while in the group. */
export function groupXp(submissions: Submission[], missions: Mission[], opts: { month?: string } = {}) {
  const byId = new Map(missions.map((m) => [m.id, m]));
  const out = new Map<string, number>();
  for (const s of submissions) {
    if (!s.groupId || s.verificationStatus !== "approved") continue;
    if (opts.month && (!s.reviewedAt || monthKey(s.reviewedAt) !== opts.month)) continue;
    out.set(s.groupId, (out.get(s.groupId) ?? 0) + earnedXp(s, byId.get(s.missionId)));
  }
  return out;
}

/** Group level: the same curve as volunteers, on the group's shared XP divided by 3 (a team levels up slower). */
export const groupLevel = (xp: number) => levelForXp(Math.floor(xp / 3));

export function groupBoard(opts: {
  viewerPlace: Place; myGroupId: string | null; groups: Group[]; submissions: Submission[]; missions: Mission[]; scope: Scope; period: "month" | "all"; now: string;
}): { rows: BoardRow[]; missing: boolean } {
  const key = scopeKey(opts.viewerPlace, opts.scope);
  if (!key) return { rows: [], missing: true };
  const xpAll = groupXp(opts.submissions, opts.missions);
  const xpMonth = opts.period === "month" ? groupXp(opts.submissions, opts.missions, { month: monthKey(opts.now) }) : xpAll;
  const rows = opts.groups
    .filter((g) => scopeKey(g, opts.scope) === key)
    .map((g) => ({
      id: g.id, name: g.name, avatar: null, xp: xpMonth.get(g.id) ?? 0, level: groupLevel(xpAll.get(g.id) ?? 0), color: g.color,
      members: g.members.length, sub: [g.mahalla, g.district].filter(Boolean).join(", "), isMe: g.id === opts.myGroupId,
    }))
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  return { rows, missing: false };
}

/** Readable, unambiguous invite code: WFX-XXXXX (no 0/O/1/I). */
export function makeGroupCode(random: () => number = Math.random) {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += A[Math.floor(random() * A.length)];
  return `WFX-${s}`;
}
export const normaliseGroupCode = (s: string) => {
  const c = s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.startsWith("WFX") ? `WFX-${c.slice(3)}` : `WFX-${c}`;
};

/** Great-circle distance in km. */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Who is told about a help signal: the author's group, and volunteers living in the same district (or city). */
export function signalAudience(author: UserProfile, users: UserProfile[], group: Group | null) {
  const ids = new Set<string>(group ? group.members : []);
  const d = scopeKey(author, "district");
  const city = placeKey(author.city);
  for (const u of users) {
    if (u.role !== "volunteer" || u.status !== "active") continue;
    if ((d && scopeKey(u, "district") === d) || (!d && city && placeKey(u.city) === city)) ids.add(u.id);
  }
  ids.delete(author.id);
  return [...ids];
}
