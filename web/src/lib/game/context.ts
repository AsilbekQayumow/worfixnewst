/**
 * Builds the engine's inputs from stored records. Shared by the browser (demo database) and the server (Firestore),
 * so both decide from exactly the same numbers.
 */
import type { Mission, MissionParticipant, Submission, TerritoryCapture, UserProfile } from "../domain/types";
import { gameWeek, seasonId, weekEnd, dayStart } from "./core";
import { battles, memberKey, type Battle, type Member, type WeekActivity } from "./league";
import type { ActivityInput } from "./quests";

export const rejected = (c: TerritoryCapture) => c.fairplay?.verdict === "reject";
export const approved = (s: Submission) => s.verificationStatus === "approved";

export function activityOf(uid: string, captures: TerritoryCapture[], participants: MissionParticipant[], submissions: Submission[]): ActivityInput {
  return {
    captures: captures.filter((c) => c.userId === uid).map((c) => ({ createdAt: c.createdAt, distanceM: c.distanceM, gainedM2: c.gainedM2, rejected: rejected(c) })),
    joins: participants.filter((p) => p.userId === uid).map((p) => ({ joinedAt: p.joinedAt })),
    approvals: submissions.filter((s) => s.userId === uid).map((s) => ({ reviewedAt: s.reviewedAt, approved: approved(s) })),
  };
}

export function seasonExtraOf(uid: string, captures: TerritoryCapture[], submissions: Submission[], now: number) {
  const season = seasonId(now);
  return {
    missionXp: submissions.filter((s) => s.userId === uid && approved(s) && s.reviewedAt?.slice(0, 7) === season).reduce((a, s) => a + (s.grant?.xp ?? 0), 0),
    areaM2: captures.filter((c) => c.userId === uid && !rejected(c) && c.createdAt.slice(0, 7) === season).reduce((a, c) => a + c.gainedM2, 0),
  };
}

export const mahallaKeyOf = (u: Pick<UserProfile, "mahallaId" | "mahalla">) => memberKey(u.mahallaId, u.mahalla);
export const districtKeyOf = (u: Pick<UserProfile, "districtId" | "district" | "province">) =>
  u.districtId ? String(u.districtId) : u.district ? `${u.province}|${memberKey(null, u.district)}` : "";

export function membersOf(users: UserProfile[]): Member[] {
  return users.filter((u) => u.role === "volunteer" && u.status === "active").map((u) => ({
    id: u.id, mahalla: mahallaKeyOf(u), mahallaName: u.mahalla ?? "", district: districtKeyOf(u), districtName: u.district ?? "",
  })).filter((m) => m.mahalla && m.district);
}

export function weekActivity(week: string, captures: TerritoryCapture[], submissions: Submission[]): WeekActivity {
  const from = dayStart(week), to = weekEnd(week);
  const inW = (iso: string | null) => { const t = iso ? Date.parse(iso) : NaN; return t >= from && t < to; };
  const act: WeekActivity = { area: {}, hours: {}, walkKm: {} };
  for (const c of captures) if (!rejected(c) && inW(c.createdAt)) {
    act.area[c.userId] = (act.area[c.userId] ?? 0) + c.gainedM2;
    act.walkKm[c.userId] = (act.walkKm[c.userId] ?? 0) + c.distanceM / 1000;
  }
  for (const s of submissions) if (approved(s) && inW(s.reviewedAt)) act.hours[s.userId] = (act.hours[s.userId] ?? 0) + (s.grant?.hours ?? 0);
  return act;
}

export function battlesFor(week: string, users: UserProfile[], captures: TerritoryCapture[], submissions: Submission[], now: number): Battle[] {
  return battles(week, membersOf(users), weekActivity(week, captures, submissions), now);
}

export const tookPart = (uid: string, act: WeekActivity) => (act.area[uid] ?? 0) > 0 || (act.hours[uid] ?? 0) > 0;
export const thisWeek = (now: number) => gameWeek(now);

/** Points of real activity for the heat map: walked loops' centres and missions, last 14 days, before today. */
export function heatActivity(before: number, territories: { userId: string; center: { lat: number; lng: number } | null; updatedAt: string }[], missions: Mission[], participants: MissionParticipant[]) {
  const since = before - 14 * 86_400_000;
  const out: { userId: string; at: { lat: number; lng: number } }[] = [];
  const inP = (iso: string) => { const t = Date.parse(iso); return t >= since && t < before; };
  for (const t of territories) if (t.center && inP(t.updatedAt)) out.push({ userId: t.userId, at: t.center });
  const byMission = new Map(missions.map((m) => [m.id, m]));
  for (const p of participants) {
    const m = byMission.get(p.missionId);
    if (m?.coordinates && inP(p.joinedAt)) out.push({ userId: p.userId, at: m.coordinates });
  }
  return out;
}
