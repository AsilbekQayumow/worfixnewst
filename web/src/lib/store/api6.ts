"use client";
/**
 * v6 application API: the eleven features of the 2026-11 plan (spec: "WORFIX — 11 ta funksiya").
 * Same rules as api.ts: every call re-reads stored records, never trusts caller-supplied roles or rewards.
 */
import { DomainError, isAdmin } from "../domain/permissions";
import { isMinor, reportBlocked, reportPausedUntil, reportQueue, REPORTS, shouldAutoHide, targetKey, type Report, type ReportAction, type ReportReason, type ReportTarget } from "../domain/reports";
import { FAIRPLAY } from "../domain/fairplay";
import { dueReminders, reminderLogId, type NotifyPrefs, type ReminderKind } from "../domain/reminders";
import { TEAM } from "../domain/teams";
import { clashes, daysLeft, isLive, progressId, type Challenge, type ChallengeMetric, type ChallengeTier } from "../domain/challenges";
import { orgScore, ratingId, ratingOpen, revealed, validRating, volunteerTrusted, type RatingKind } from "../domain/ratings";
import { confirmedByMissions, skillFit, SKILL_BY_ID, type SkillLevel, type SkillWanted, type UserSkill } from "../domain/skills";
import { byMonth, DIARY, longestStreak, yearSummary } from "../domain/diary";
import { canDeclare, canRespond, creditedHours, EMERGENCY, inArea, unverifiedCluster, type EmergencyKind, type EmergencyRole } from "../domain/emergency";
import { levelForXp } from "../domain/rewards";
import { seasonOf } from "../domain/territory";
import type { Category, HelpSignal, Mission, UserProfile } from "../domain/types";
import { actor, api, canSee, groupOf, log, notify, orgOf, person, readSession, requireAdmin, withOrg } from "./api";
import { commit, FIREBASE, getDB, nowIso, ready, uid, type DB } from "./db";
import * as cloud from "./cloud";

const H = 3_600_000, DAY = 24 * H;
/** The emergency page lives in each area (the area guards keep admins and organizations out of /app). */
export const emergencyLink = (role: string, id: string) => `${isAdmin(role as UserProfile["role"]) ? "/admin" : role === "organization" ? "/org" : "/app"}/emergency/${id}`;
const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/* ───────────── 8 · reports ───────────── */

function describeTarget(db: DB, type: ReportTarget, id: string): { owner: string | null; snapshot: string; minor: boolean; link: string | null; label: string } | null {
  const minorOf = (userId: string | null) => { const u = userId ? db.users.find((x) => x.id === userId) : null; return isMinor(u?.birthYear); };
  switch (type) {
    case "user": { const u = db.users.find((x) => x.id === id); return u ? { owner: u.id, snapshot: `${u.fullName} @${u.username}\n${u.bio}`.slice(0, 500), minor: isMinor(u.birthYear), link: `/app/people/${u.id}`, label: u.fullName } : null; }
    case "mission": { const m = db.missions.find((x) => x.id === id); if (!m) return null; const o = orgOf(db, m.organizationId); return { owner: o?.ownerId ?? m.ownerId ?? null, snapshot: `${m.title}\n${m.description}`.slice(0, 500), minor: false, link: `/app/missions/${m.id}`, label: m.title }; }
    case "organization": { const o = orgOf(db, id); return o ? { owner: o.ownerId, snapshot: `${o.name}\n${o.description}`.slice(0, 500), minor: false, link: `/app/orgs/${o.id}`, label: o.name } : null; }
    case "message": {
      const m = db.messages.find((x) => x.id === id);
      if (m) return { owner: m.from, snapshot: m.text.slice(0, 500), minor: minorOf(m.from), link: null, label: m.text.slice(0, 60) };
      const g = db.groupMessages.find((x) => x.id === id);
      return g ? { owner: g.from, snapshot: g.text.slice(0, 500), minor: minorOf(g.from), link: `/app/chat/g_${g.groupId}`, label: g.text.slice(0, 60) } : null;
    }
    case "post": { const s = db.submissions.find((x) => x.id === id); if (!s) return null; const m = db.missions.find((x) => x.id === s.missionId); return { owner: s.userId, snapshot: `${m?.title ?? ""}\n${s.notes}`.slice(0, 500), minor: minorOf(s.userId), link: `/app/explore`, label: m?.title ?? "—" }; }
    case "group": { const g = db.groups.find((x) => x.id === id); return g ? { owner: g.ownerId, snapshot: `${g.name}\n${g.description}`.slice(0, 500), minor: minorOf(g.ownerId), link: `/app/groups/${g.id}`, label: g.name } : null; }
    case "signal": { const s = db.helpSignals.find((x) => x.id === id); return s ? { owner: s.userId, snapshot: `${s.title}\n${s.note}`.slice(0, 500), minor: minorOf(s.userId), link: `/app/signals/${s.id}`, label: s.title } : null; }
  }
}

function hideTarget(db: DB, type: ReportTarget, id: string, at = nowIso()) {
  if (type === "message") {
    const m = db.messages.find((x) => x.id === id) ?? db.groupMessages.find((x) => x.id === id);
    if (m) m.hiddenAt = at;
  } else if (type === "post") {
    const s = db.submissions.find((x) => x.id === id);
    if (s) s.hiddenAt = at;
  } else if (type === "mission") {
    const m = db.missions.find((x) => x.id === id);
    if (m && m.status === "published") { m.status = "cancelled"; m.moderationNote = "report"; m.updatedAt = at; }
  } else if (type === "signal") {
    const s = db.helpSignals.find((x) => x.id === id);
    if (s) s.status = "closed";
  }
}

export const api6 = {
  /* ── 8 ── */
  async reportState() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return { paused: null as number | null };
    return { paused: reportPausedUntil(db.reports.filter((r) => r.reporterId === u.id)) };
  },

  async report(type: ReportTarget, id: string, reason: ReportReason, note = "") {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const mine = db.reports.filter((r) => r.reporterId === u.id);
      const blocked = reportBlocked(mine, type, id);
      if (blocked) throw new DomainError("conflict", blocked);
      const t = describeTarget(db, type, id);
      if (!t) throw new DomainError("not_found", "e.notFound");
      if (t.owner === u.id) throw new DomainError("invalid_state", "rpt.e.self");
      const r: Report = {
        id: uid(), reporterId: u.id, targetType: type, targetId: id, targetOwnerId: t.owner, reason, note: clean(note, REPORTS.noteMax),
        snapshot: t.snapshot, status: "open", decision: null, minor: t.minor || isMinor(u.birthYear), createdAt: nowIso(),
      };
      db.reports.push(r);
      // auto-hide: only possible where this client may see every report (local mode); in Firebase mode admins see "urgent"
      const all = db.reports.filter((x) => x.targetType === type && x.targetId === id);
      if (!FIREBASE && shouldAutoHide({ type, reports: all }, (uid2) => db.users.find((x) => x.id === uid2)?.createdAt)) hideTarget(db, type, id);
      log(db, u, "report.create", "reports", r.id, `${type}:${reason}`);
    });
  },

  async adminReports() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return reportQueue(db.reports).map((q) => {
      const t = describeTarget(db, q.targetType, q.targetId);
      const owner = q.targetOwnerId ? db.users.find((x) => x.id === q.targetOwnerId) : null;
      return { ...q, label: t?.label ?? "—", link: t?.link ?? null, owner: owner ? { id: owner.id, name: owner.fullName, status: owner.status } : null,
        notes: q.reports.map((r) => r.note).filter(Boolean), reasons: [...new Set(q.reports.map((r) => r.reason))] };
    });
  },

  async decideReport(type: ReportTarget, id: string, action: ReportAction, note = "") {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const open = db.reports.filter((r) => r.targetType === type && r.targetId === id && (r.status === "open" || r.status === "reviewing"));
      if (!open.length) throw new DomainError("not_found", "e.notFound");
      const at = nowIso();
      const owner = open[0].targetOwnerId ? db.users.find((x) => x.id === open[0].targetOwnerId) : null;
      if (action === "hide") hideTarget(db, type, id, at);
      if (action === "warn" && owner) notify(db, owner.id, "system", "n.reportWarned", { note: clean(note, 300) }, null);
      if (action === "suspend" && owner && !isAdmin(owner.role)) owner.status = "suspended";
      for (const r of open) {
        r.status = action === "dismiss" ? "dismissed" : "actioned";
        r.decision = { by: a.id, action, note: clean(note, 300), at };
      }
      for (const reporter of new Set(open.map((r) => r.reporterId))) notify(db, reporter, "system", action === "dismiss" ? "n.reportDismissed" : "n.reportActioned", {}, null);
      log(db, a, `report.${action}`, "reports", targetKey(type, id), note);
    });
  },

  /* ── 10 ── */
  async adminFairplay() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    const since = Date.now() - FAIRPLAY.strikeDays * DAY;
    const flagged = db.territoryCaptures.filter((c) => c.fairplay && c.fairplay.score >= FAIRPLAY.accept && Date.parse(c.createdAt) > since)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const strikes = new Map<string, number>();
    for (const c of flagged) if (c.fairplay!.score >= FAIRPLAY.reject) strikes.set(c.userId, (strikes.get(c.userId) ?? 0) + 1);
    return {
      shadow: FAIRPLAY.shadow,
      items: flagged.slice(0, 80).map((c) => {
        const u = db.users.find((x) => x.id === c.userId);
        return { capture: c, name: u?.fullName ?? "—", userId: c.userId, strikes: strikes.get(c.userId) ?? 0, needsReview: (strikes.get(c.userId) ?? 0) >= FAIRPLAY.strikes };
      }),
    };
  },

  /** A confirmed cheat: this month's walks are void, trust drops. */
  async voidWalks(userId: string, note = "") {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const season = seasonOf();
      const t = db.territories.find((x) => x.id === `${season}_${userId}`);
      if (t) { t.shape = ""; t.areaM2 = 0; t.bbox = []; t.center = null; t.updatedAt = nowIso(); }
      const u = db.users.find((x) => x.id === userId);
      if (u) u.trustScore = Math.max(0, (u.trustScore ?? 50) - 15);
      notify(db, userId, "system", "n.walksVoided", { note: clean(note, 200) }, "/app/map");
      log(db, a, "fairplay.void", "territories", `${season}_${userId}`, note);
    });
  },

  /* ── 4 ── */
  async setNotifyPrefs(prefs: Partial<NotifyPrefs> & { emergency?: boolean }) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      u.notifyPrefs = { ...(u.notifyPrefs ?? {}), ...prefs };
      u.updatedAt = nowIso();
    });
  },

  async reminderOpened(missionId: string, kind: ReminderKind) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return;
    const id = reminderLogId(u.id, missionId, kind);
    if (!db.reminderLog.some((r) => r.id === id && !r.openedAt)) return;
    await commit((d) => { const r = d.reminderLog.find((x) => x.id === id); if (r) r.openedAt = nowIso(); }).catch(() => undefined);
  },

  /** Local demo only (in Firebase mode the Worker cron does this every 30 minutes for everyone). */
  async runLocalReminders() {
    if (FIREBASE) return 0;
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u || u.role !== "volunteer") return 0;
    const due = dueReminders({
      now: Date.now(), missions: db.missions, participants: db.participants, submissions: db.submissions,
      users: [{ ...u, skillIds: (u.skillSet ?? []).map((s) => s.id) }], sent: db.reminderLog,
    });
    if (!due.length) return 0;
    await commit((d) => {
      for (const r of due) {
        const m = d.missions.find((x) => x.id === r.missionId);
        if (!m) continue;
        d.reminderLog.push({ id: reminderLogId(r.userId, r.missionId, r.kind), userId: r.userId, missionId: r.missionId, kind: r.kind, sentAt: nowIso(), openedAt: null });
        notify(d, r.userId, "mission", `n.rem.${r.kind}`, { title: m.title, left: Math.max(0, m.capacity - m.participantsCount), time: m.date }, `/app/missions/${m.id}?r=${r.kind}`);
      }
    });
    return due.length;
  },

  /* ── 2 ── */
  /** Invite the whole group to do a mission together as a team (each member answers from the notification). */
  async inviteGroupToMission(missionId: string) {
    await ready();
    let n = 0;
    await commit((db) => {
      const u = actor(db);
      const g = groupOf(db, u.id);
      if (!g) throw new DomainError("invalid_state", "tm2.e.noGroup");
      const m = db.missions.find((x) => x.id === missionId);
      if (!m || m.status !== "published") throw new DomainError("not_found", "e.missionClosed");
      const p = db.participants.find((x) => x.id === `${missionId}_${u.id}`);
      if (!p || p.status !== "accepted") throw new DomainError("invalid_state", "e.joinFirst");
      if (!p.teamId) p.teamId = p.id;
      const inTeam = db.participants.filter((x) => x.missionId === missionId && x.teamId === p.teamId && x.status === "accepted").length;
      const room = Math.min(TEAM.maxSize - inTeam, m.capacity - m.participantsCount);
      if (room <= 0) throw new DomainError("conflict", "tm2.e.full");
      const free = g.members.filter((id) => id !== u.id && !db.participants.some((x) => x.id === `${missionId}_${id}` && x.status === "accepted")).slice(0, room);
      for (const id of free) notify(db, id, "mission", "n.teamInvite", { name: u.fullName, title: m.title }, `/app/missions/${m.id}?team=${p.teamId}`);
      n = free.length;
      log(db, u, "team.invite_group", "missions", missionId, String(n));
    });
    return n;
  },

  async joinTeam(missionId: string, teamId: string) {
    await ready();
    const db = getDB();
    const size = db.participants.filter((x) => x.missionId === missionId && x.teamId === teamId && x.status === "accepted").length;
    if (size === 0) throw new DomainError("not_found", "tm2.e.gone");
    if (size >= TEAM.maxSize) throw new DomainError("conflict", "tm2.e.full");
    await api.joinMission(missionId, teamId);
  },

  /* ── 5 ── */
  async diary(year = new Date().getFullYear()) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const approved = db.submissions.filter((s) => s.userId === u.id && s.verificationStatus === "approved");
    const entries = approved.flatMap((s) => {
      const m = db.missions.find((x) => x.id === s.missionId);
      if (!m) return [];
      const mates = s.teamId
        ? db.participants.filter((p) => p.missionId === m.id && p.teamId === s.teamId && p.userId !== u.id && p.status === "accepted")
          .flatMap((p) => { const x = db.users.find((y) => y.id === p.userId); return x && canSee(db, u, x) ? [x.fullName] : []; })
        : [];
      const impact = Object.values(s.grant?.impact ?? {}).reduce((a, b) => a + b, 0);
      return [{
        id: s.id, at: s.reviewedAt ?? s.timestamp, missionId: m.id, title: m.title, location: m.location, category: m.category as Category,
        hours: s.grant?.hours ?? Math.round((m.duration / 60) * 100) / 100, impact, missions: 1, photo: s.images[0]?.dataUrl ?? null, mates, team: Boolean(s.teamId),
        note: db.diaryNotes.find((n) => n.id === s.id && n.userId === u.id)?.text ?? "",
      }];
    });
    const years = [...new Set(entries.map((e) => new Date(e.at).getFullYear()))].sort((a, b) => b - a);
    const inYear = entries.filter((e) => new Date(e.at).getFullYear() === year);
    const captures = db.territoryCaptures.filter((c) => c.userId === u.id && new Date(c.createdAt).getFullYear() === year && c.areaM2 > 0);
    return {
      year, years: years.length ? years : [year], summary: yearSummary(entries, year), streak: longestStreak(approved.map((s) => s.reviewedAt ?? s.timestamp)),
      months: byMonth(inYear), walks: captures.length, walkedM2: captures.reduce((a, c) => a + c.gainedM2, 0),
      certificates: db.certificates.filter((c) => c.userId === u.id && new Date(c.issuedAt).getFullYear() === year).length,
      name: u.fullName,
    };
  },

  async saveDiaryNote(submissionId: string, text: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const s = db.submissions.find((x) => x.id === submissionId && x.userId === u.id);
      if (!s) throw new DomainError("not_found", "e.notFound");
      const value = text.trim().slice(0, DIARY.noteMax);
      const n = db.diaryNotes.find((x) => x.id === submissionId);
      if (!value) { db.diaryNotes = db.diaryNotes.filter((x) => x.id !== submissionId); return; }
      if (n) { n.text = value; n.updatedAt = nowIso(); }
      else db.diaryNotes.push({ id: submissionId, userId: u.id, text: value, updatedAt: nowIso() });
    });
  },

  /* ── 1 ── */
  async challenges() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    const now = Date.now();
    const view = (c: Challenge) => {
      const progress = db.challengeProgress.filter((p) => p.challengeId === c.id);
      const mine = u ? progress.find((p) => p.id === progressId(c.id, u.id)) ?? null : null;
      const community = progress.reduce((a, p) => a + p.value, 0);
      return { ...c, live: isLive(c, now), daysLeft: daysLeft(c, now), mine, community: c.communityValue ?? community, people: progress.length,
        sponsor: c.sponsorOrgId ? orgOf(db, c.sponsorOrgId)?.name ?? null : null };
    };
    const visible = db.challenges.filter((c) => c.status !== "draft");
    return {
      live: visible.filter((c) => isLive(c, now)).map(view),
      ended: visible.filter((c) => !isLive(c, now) && Date.parse(c.endsAt) <= now).sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt)).slice(0, 6).map(view),
    };
  },

  async adminChallenges() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return [...db.challenges].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map((c) => ({
      ...c, people: db.challengeProgress.filter((p) => p.challengeId === c.id).length,
    }));
  },

  async saveChallenge(input: { title: Challenge["title"]; theme: Category; startsAt: string; endsAt: string; metric: ChallengeMetric; target: number; per: "person" | "community"; tiers: ChallengeTier[]; sponsorOrgId?: string | null }, existingId?: string) {
    await ready();
    if (!input.title.uz.trim() && !input.title.en.trim()) throw new DomainError("validation", "ch.e.title");
    if (!(Date.parse(input.endsAt) > Date.parse(input.startsAt))) throw new DomainError("validation", "ch.e.dates");
    const tiers = [...input.tiers].sort((a, b) => a.at - b.at).slice(0, 3) as Challenge["tiers"];
    if (tiers.length !== 3 || tiers.some((t) => !(t.at > 0) || t.rewardXP < 0 || t.rewardPoints < 0 || t.rewardPoints > 150 || t.rewardXP > 1000)) throw new DomainError("validation", "ch.e.tiers");
    let id = existingId ?? "";
    await commit((db) => {
      const a = requireAdmin(db);
      const data = {
        title: { uz: clean(input.title.uz, 80), ru: clean(input.title.ru, 80), en: clean(input.title.en, 80) }, theme: input.theme,
        startsAt: new Date(input.startsAt).toISOString(), endsAt: new Date(input.endsAt).toISOString(),
        goal: { metric: input.metric, target: Math.max(1, Math.round(input.target)), per: input.per }, tiers, sponsorOrgId: input.sponsorOrgId ?? null,
      };
      if (existingId) {
        const c = db.challenges.find((x) => x.id === existingId);
        if (!c) throw new DomainError("not_found", "e.notFound");
        Object.assign(c, data);
      } else {
        id = uid();
        db.challenges.push({ id, ...data, status: "draft", createdBy: a.id, createdAt: nowIso() });
      }
      log(db, a, existingId ? "challenge.update" : "challenge.create", "challenges", id);
    });
    return id;
  },

  async setChallengeStatus(id: string, status: Challenge["status"]) {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const c = db.challenges.find((x) => x.id === id);
      if (!c) throw new DomainError("not_found", "e.notFound");
      if (status === "live" && clashes(c, db.challenges)) throw new DomainError("conflict", "ch.e.clash");
      c.status = status;
      if (status === "ended") {
        for (const p of db.challengeProgress.filter((x) => x.challengeId === id && x.tierReached > 0)) notify(db, p.userId, "reward", "n.challengeEnded", { tier: p.tierReached }, "/app/profile");
      }
      log(db, a, `challenge.${status}`, "challenges", id);
    });
  },

  /* ── 7 ── */
  /** What the signed-in volunteer may still rate (approved in the last 14 days, not rated yet). */
  async ratingsToGive() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u || u.role !== "volunteer") return [];
    return db.submissions
      .filter((s) => s.userId === u.id && s.verificationStatus === "approved" && s.reviewedAt && ratingOpen(s.reviewedAt))
      .flatMap((s) => {
        const m = db.missions.find((x) => x.id === s.missionId);
        const o = m ? orgOf(db, m.organizationId) : null;
        if (!m || !o || db.ratings.some((r) => r.id === ratingId(m.id, u.id, o.id))) return [];
        return [{ missionId: m.id, title: m.title, orgId: o.id, orgName: o.name }];
      });
  },

  async rate(kind: RatingKind, missionId: string, toId: string, input: { stars: number; tags: string[]; comment: string }) {
    await ready();
    const err = validRating(input, kind);
    if (err) throw new DomainError("validation", err);
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === missionId);
      if (!m) throw new DomainError("not_found", "e.notFound");
      const org = orgOf(db, m.organizationId);
      if (!org) throw new DomainError("not_found", "e.notFound");
      if (kind === "vol_to_org") {
        if (toId !== org.id) throw new DomainError("forbidden", "e.forbidden");
        if (org.members.includes(u.id)) throw new DomainError("forbidden", "rat.e.ownOrg");
        const s = db.submissions.find((x) => x.missionId === missionId && x.userId === u.id && x.verificationStatus === "approved");
        if (!s?.reviewedAt) throw new DomainError("forbidden", "rat.e.notThere");
        if (!ratingOpen(s.reviewedAt)) throw new DomainError("invalid_state", "rat.e.closed");
      } else {
        if (u.organizationId !== org.id && !isAdmin(u.role)) throw new DomainError("forbidden", "e.forbidden");
        const s = db.submissions.find((x) => x.missionId === missionId && x.userId === toId && x.verificationStatus === "approved");
        if (!s?.reviewedAt) throw new DomainError("forbidden", "rat.e.notThere");
        if (!ratingOpen(s.reviewedAt)) throw new DomainError("invalid_state", "rat.e.closed");
      }
      const id = ratingId(missionId, u.id, toId);
      if (db.ratings.some((r) => r.id === id)) throw new DomainError("conflict", "rat.e.already");
      db.ratings.push({ id, missionId, fromId: u.id, toId, kind, stars: input.stars, tags: input.tags, comment: clean(input.comment, 300), hidden: false, createdAt: nowIso() });
      log(db, u, `rating.${kind}`, "ratings", id, String(input.stars));
    });
  },

  /** The organization's volunteers on one mission, with whether each was rated yet. */
  async missionRatings(missionId: string) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const m = db.missions.find((x) => x.id === missionId);
    if (!m || (u.organizationId !== m.organizationId && !isAdmin(u.role))) return [];
    return db.submissions.filter((s) => s.missionId === missionId && s.verificationStatus === "approved").flatMap((s) => {
      const v = db.users.find((x) => x.id === s.userId);
      if (!v) return [];
      return [{ volunteer: person(v), open: Boolean(s.reviewedAt && ratingOpen(s.reviewedAt)), rated: db.ratings.some((r) => r.id === ratingId(missionId, u.id, v.id)) }];
    });
  },

  async orgRating(orgId: string) {
    await ready();
    const db = getDB();
    const approvedAt = (missionId: string, userId: string) => db.submissions.find((s) => s.missionId === missionId && s.userId === userId)?.reviewedAt ?? null;
    const visible = db.ratings.filter((r) => r.kind === "vol_to_org" && r.toId === orgId && revealed(r, db.ratings, approvedAt(r.missionId, r.fromId)));
    const s = orgScore(visible, orgId);
    return { ...s, comments: visible.filter((r) => r.comment).slice(-5).reverse().map((r) => ({ id: r.id, stars: r.stars, comment: r.comment, at: r.createdAt })) };
  },

  /* ── 11 ── */
  async mySkills() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const approvedSkills = db.submissions.filter((s) => s.userId === u.id && s.verificationStatus === "approved")
      .map((s) => (db.missions.find((m) => m.id === s.missionId)?.skillsWanted ?? []).map((w) => w.skillId));
    const confirmed = new Set(confirmedByMissions(approvedSkills));
    return {
      skills: (u.skillSet ?? []).map((s) => ({ ...s, proof: s.proof === "document" ? "document" as const : confirmed.has(s.id) ? "missions" as const : "self" as const })),
      discoverable: Boolean(u.discoverable), other: u.skills, minor: isMinor(u.birthYear), moveMode: u.moveMode ?? "walk",
    };
  },

  async setSkills(skills: { id: string; level: SkillLevel }[], opts: { discoverable?: boolean; moveMode?: "walk" | "assisted" } = {}) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const prev = new Map((u.skillSet ?? []).map((s) => [s.id, s]));
      const next: UserSkill[] = [];
      for (const s of skills.slice(0, 20)) {
        if (!SKILL_BY_ID.has(s.id) || next.some((x) => x.id === s.id)) continue;
        next.push({ id: s.id, level: s.level, proof: prev.get(s.id)?.proof === "document" ? "document" : "self" });
      }
      u.skillSet = next;
      if (opts.discoverable !== undefined) u.discoverable = opts.discoverable && !isMinor(u.birthYear);
      if (opts.moveMode) u.moveMode = opts.moveMode;
      u.updatedAt = nowIso();
    });
  },

  async setMissionSkills(missionId: string, wanted: SkillWanted[]) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === missionId);
      if (!m || (u.organizationId !== m.organizationId && !isAdmin(u.role))) throw new DomainError("forbidden", "e.forbidden");
      m.skillsWanted = wanted.filter((w) => SKILL_BY_ID.has(w.skillId)).slice(0, 8).map((w) => ({ skillId: w.skillId, required: Boolean(w.required), ...(w.count ? { count: Math.max(1, Math.round(w.count)) } : {}) }));
      m.updatedAt = nowIso();
    });
  },

  /** 0…1 fit of the signed-in volunteer for each mission id ("Sizga mos"). */
  async skillFits(missionIds: string[]) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    const out: Record<string, number> = {};
    if (!u) return out;
    for (const id of missionIds) {
      const m = db.missions.find((x) => x.id === id);
      if (m?.skillsWanted?.length) out[id] = skillFit(u.skillSet ?? [], m.skillsWanted);
    }
    return out;
  },

  async findVolunteers(filter: { skillId?: string; level?: SkillLevel | ""; province?: string }) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const org = u.organizationId ? orgOf(db, u.organizationId) : null;
    if (!isAdmin(u.role) && org?.verificationStatus !== "approved") throw new DomainError("forbidden", "sk.e.approvedOnly");
    const rank: Record<SkillLevel, number> = { beginner: 0, experienced: 1, expert: 2 };
    return db.users
      .filter((v) => v.role === "volunteer" && v.status === "active" && v.discoverable && !isMinor(v.birthYear))
      .filter((v) => !filter.province || v.province === filter.province)
      .flatMap((v) => {
        const skills = v.skillSet ?? [];
        if (filter.skillId) {
          const s = skills.find((x) => x.id === filter.skillId);
          if (!s || (filter.level && rank[s.level] < rank[filter.level])) return [];
        }
        return [{ person: person(v), skills, trusted: volunteerTrusted(db.ratings, v.id) }];
      })
      .slice(0, 60);
  },

  async inviteVolunteer(volunteerId: string, missionId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === missionId);
      if (!m || m.organizationId !== u.organizationId || m.status !== "published") throw new DomainError("forbidden", "e.forbidden");
      const today = Date.now() - DAY;
      if (db.audits.filter((x) => x.actor === u.id && x.action === "org.invite_volunteer" && Date.parse(x.timestamp) > today).length >= 20) throw new DomainError("conflict", "sk.e.daily");
      const v = db.users.find((x) => x.id === volunteerId && x.discoverable && x.status === "active");
      if (!v || isMinor(v.birthYear)) throw new DomainError("not_found", "e.notFound");
      if (db.audits.some((x) => x.actor === u.id && x.action === "org.invite_volunteer" && x.resourceId === missionId && x.detail === volunteerId)) throw new DomainError("conflict", "sk.e.already");
      notify(db, v.id, "mission", "n.orgInvite", { org: orgOf(db, m.organizationId)?.name ?? "", title: m.title }, `/app/missions/${m.id}`);
      log(db, u, "org.invite_volunteer", "missions", missionId, volunteerId);
    });
  },

  /* ── 12 ── */
  async orgPage(orgId: string) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    const o = orgOf(db, orgId);
    if (!o || (o.verificationStatus !== "approved" && !(u && (isAdmin(u.role) || o.members.includes(u.id))))) return null;
    const now = Date.now();
    const missions = db.missions.filter((m) => m.organizationId === o.id && m.status === "published" && Date.parse(m.date) > now)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).map((m) => withOrg(db, m, u));
    return {
      org: { id: o.id, name: o.name, logo: o.logo, description: o.description, website: o.website, city: o.city, organizationType: o.organizationType, totalMissions: o.totalMissions, totalVolunteers: o.totalVolunteers },
      followers: o.followers ?? db.orgFollows.filter((f) => f.orgId === o.id).length,
      following: Boolean(u && db.orgFollows.some((f) => f.id === `${u.id}_${o.id}`)),
      mine: Boolean(u && o.members.includes(u.id)),
      missions, rating: await api6.orgRating(o.id),
    };
  },

  async follow(orgId: string, on: boolean) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const o = orgOf(db, orgId);
      if (!o) throw new DomainError("not_found", "e.notFound");
      const id = `${u.id}_${o.id}`;
      const has = db.orgFollows.some((f) => f.id === id);
      if (on && !has) {
        if (db.orgFollows.filter((f) => f.userId === u.id).length >= 200) throw new DomainError("conflict", "fo.e.max");
        db.orgFollows.push({ id, userId: u.id, orgId: o.id, notify: true, createdAt: nowIso() });
        o.followers = (o.followers ?? 0) + 1;
      }
      if (!on && has) {
        db.orgFollows = db.orgFollows.filter((f) => f.id !== id);
        o.followers = Math.max(0, (o.followers ?? 1) - 1);
      }
    });
  },

  async myFollows() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const now = Date.now();
    const follows = db.orgFollows.filter((f) => f.userId === u.id);
    const orgIds = new Set(follows.map((f) => f.orgId));
    const firstLookEnds = (m: Mission) => Date.parse(m.publishedAt ?? m.createdAt) + 6 * H;
    return {
      orgs: follows.flatMap((f) => { const o = orgOf(db, f.orgId); return o ? [{ id: o.id, name: o.name, logo: o.logo, city: o.city, followers: o.followers ?? 0 }] : []; }),
      missions: db.missions.filter((m) => orgIds.has(m.organizationId) && m.status === "published" && Date.parse(m.date) > now && firstLookEnds(m) <= now)
        .sort((a, b) => Date.parse(b.publishedAt ?? b.createdAt) - Date.parse(a.publishedAt ?? a.createdAt)).slice(0, 8).map((m) => withOrg(db, m, u)),
    };
  },

  /** For the organization dashboard: follower count and growth by month (names are never shown). */
  async orgFollowerStats() {
    await ready();
    const db = getDB();
    const u = actor(db);
    if (!u.organizationId) return null;
    const list = db.orgFollows.filter((f) => f.orgId === u.organizationId);
    const months: { month: string; n: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
      const k = d.toISOString().slice(0, 7);
      months.push({ month: k, n: list.filter((f) => f.createdAt.slice(0, 7) <= k).length });
    }
    return { total: orgOf(db, u.organizationId)?.followers ?? list.length, months };
  },

  /* ── 19 ── */
  async emergencies() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    const now = Date.now();
    const all = db.helpSignals.filter((s) => s.kind === "emergency" && s.emergency && s.emergency.state !== "resolved" && Date.parse(s.emergency.validUntil) > now);
    const verified = all.filter((s) => s.emergency!.state === "verified");
    const flags = all.filter((s) => s.emergency!.state === "unverified");
    const cluster = unverifiedCluster(flags.map((s) => ({ userId: s.userId, kind: s.emergency!.type as EmergencyKind, location: s.location, createdAt: s.createdAt })), now);
    const mineArea = (s: HelpSignal) => !u || isAdmin(u.role) || inArea(u, { provinces: s.emergency!.provinces, cities: s.emergency!.cities });
    return {
      verified: verified.filter(mineArea).map((s) => emergencyView(db, s, u)),
      unverified: cluster ? [{ kind: cluster.kind, people: cluster.people.length, center: cluster.center }] : [],
      canDeclare: Boolean(u && canDeclare(u, u.organizationId ? orgOf(db, u.organizationId) : null)),
    };
  },

  async emergency(id: string) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    const s = db.helpSignals.find((x) => x.id === id && x.kind === "emergency");
    return s ? emergencyView(db, s, u) : null;
  },

  async declareEmergency(input: { type: EmergencyKind; title: string; note: string; place: string; lat: number; lng: number; provinces: string[]; cities: string[]; needs: string[]; meetingPoints: string[]; contacts: string; hours: number }) {
    await ready();
    let id = "";
    let audience: string[] = [];
    await commit((db) => {
      const u = actor(db);
      const org = u.organizationId ? orgOf(db, u.organizationId) : null;
      if (!canDeclare(u, org)) throw new DomainError("forbidden", "em.e.notAllowed");
      if (!clean(input.title, 120)) throw new DomainError("validation", "em.e.title");
      id = uid();
      const t = nowIso();
      db.helpSignals.push({
        id, userId: u.id, groupId: null, missionId: null, title: clean(input.title, 120), note: clean(input.note, 1000), location: { lat: input.lat, lng: input.lng },
        place: clean(input.place, 160), radiusKm: EMERGENCY.maxRadiusKm, province: input.provinces[0] ?? "", district: "", city: input.cities[0] ?? "", responders: [], status: "open",
        createdAt: t, expiresAt: new Date(Date.now() + Math.max(1, Math.min(168, input.hours)) * H).toISOString(), kind: "emergency",
        emergency: {
          type: input.type, state: "verified", severity: 3, provinces: input.provinces.map((p) => clean(p, 60)).filter(Boolean), cities: input.cities.map((c) => clean(c, 60)).filter(Boolean),
          verifiedBy: u.id, needs: input.needs.slice(0, 10), meetingPoints: input.meetingPoints.map((p) => clean(p, 120)).filter(Boolean).slice(0, 6), contacts: clean(input.contacts, 300),
          validUntil: new Date(Date.now() + Math.max(1, Math.min(168, input.hours)) * H).toISOString(), going: {},
        },
      });
      // in-app notice for everyone in the area (local mode; in Firebase mode the emergency-broadcast server function does it and pushes)
      if (!FIREBASE) {
        audience = db.users.filter((x) => x.status === "active" && x.id !== u.id && (x.notifyPrefs?.emergency ?? true) && inArea(x, { provinces: input.provinces, cities: input.cities })).map((x) => x.id);
        for (const to of audience) notify(db, to, "system", "n.emergency", { title: clean(input.title, 120), place: clean(input.place, 160) }, emergencyLink(db.users.find((x) => x.id === to)?.role ?? "volunteer", id));
      }
      log(db, u, "emergency.declare", "helpSignals", id, input.type);
    });
    if (FIREBASE) await cloud.callFunction("emergency-broadcast", { id }).catch(() => undefined);
    return { id, notified: audience.length };
  },

  /** Level 2: "I see it too" — three independent people within 2 km make a yellow, unverified alert. */
  async flagEmergency(input: { type: EmergencyKind; note: string; lat: number; lng: number; place: string }) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const today = Date.now() - DAY;
      if (db.helpSignals.filter((s) => s.userId === u.id && s.kind === "emergency" && s.emergency?.state === "unverified" && Date.parse(s.createdAt) > today).length >= EMERGENCY.flagsPerDay) throw new DomainError("conflict", "em.e.rate");
      const t = nowIso();
      db.helpSignals.push({
        id: uid(), userId: u.id, groupId: null, missionId: null, title: input.type, note: clean(input.note, 300), location: { lat: input.lat, lng: input.lng }, place: clean(input.place, 160),
        radiusKm: 2, province: u.province, district: u.district ?? "", city: u.city, responders: [], status: "open", createdAt: t, expiresAt: new Date(Date.now() + EMERGENCY.clusterHours * H).toISOString(),
        kind: "emergency", emergency: { type: input.type, state: "unverified", severity: 1, provinces: [u.province], cities: [u.city], verifiedBy: null, needs: [], meetingPoints: [], contacts: "", validUntil: new Date(Date.now() + EMERGENCY.clusterHours * H).toISOString(), going: {} },
      });
      log(db, u, "emergency.flag", "helpSignals", u.id, input.type);
    });
  },

  async respondEmergency(id: string, going: { role: EmergencyRole; point: string } | null) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const s = db.helpSignals.find((x) => x.id === id && x.kind === "emergency");
      if (!s?.emergency || s.emergency.state !== "verified") throw new DomainError("not_found", "e.notFound");
      if (going && !canRespond(u.birthYear)) throw new DomainError("forbidden", "em.e.minor");
      const g = { ...s.emergency.going };
      if (going) g[u.id] = { role: going.role, point: clean(going.point, 120), at: g[u.id]?.at ?? nowIso() };
      else delete g[u.id];
      s.emergency = { ...s.emergency, going: g };
      s.responders = Object.keys(g);
      if (going) notify(db, s.userId, "system", "n.emergencyGoing", { name: u.fullName, title: s.title }, emergencyLink(db.users.find((x) => x.id === s.userId)?.role ?? "admin", s.id));
    });
  },

  async confirmResponder(id: string, userId: string, confirmed: boolean) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const s = db.helpSignals.find((x) => x.id === id && x.kind === "emergency");
      if (!s?.emergency || (s.userId !== u.id && !isAdmin(u.role))) throw new DomainError("forbidden", "e.forbidden");
      const g = s.emergency.going[userId];
      if (!g) throw new DomainError("not_found", "e.notFound");
      s.emergency = { ...s.emergency, going: { ...s.emergency.going, [userId]: { ...g, confirmed } } };
    });
  },

  async closeEmergency(id: string, closingNote: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const s = db.helpSignals.find((x) => x.id === id && x.kind === "emergency");
      if (!s?.emergency || (s.userId !== u.id && !isAdmin(u.role))) throw new DomainError("forbidden", "e.forbidden");
      if (s.emergency.state === "resolved") return;
      const at = nowIso();
      s.emergency = { ...s.emergency, state: "resolved", closedAt: at, closingNote: clean(closingNote, 500) };
      s.status = "closed";
      // the hours: a closed "emergency mission" record, confirmed responders credited (no photo needed)
      const missionId = `em_${s.id}`;
      const confirmed = Object.entries(s.emergency.going).filter(([, g]) => g.confirmed);
      if (!db.missions.some((m) => m.id === missionId)) {
        db.missions.push({
          id: missionId, organizationId: u.organizationId ?? "", title: s.title, description: s.note, category: "community", difficulty: "hard", rewardXP: 0, rewardPoints: 0,
          location: s.place, coordinates: s.location, date: s.createdAt, deadline: s.createdAt, duration: Math.round((Date.parse(at) - Date.parse(s.createdAt)) / 60_000), capacity: Math.max(1, confirmed.length), participantsCount: confirmed.length,
          status: "closed", featured: false, requirements: "", safety: "", equipment: "", impactMetrics: [], moderationNote: "", isDemo: false, createdAt: at, updatedAt: at, emergencyId: s.id,
        });
      }
      for (const [userId, g] of confirmed) {
        const v = db.users.find((x) => x.id === userId);
        if (!v) continue;
        const hours = creditedHours(g.at, at);
        v.totalVolunteerHours = Math.round((v.totalVolunteerHours + hours) * 10) / 10;
        v.xp += 100;
        v.level = levelForXp(v.xp);
        notify(db, userId, "reward", "n.emergencyThanks", { title: s.title, hours }, `/app/emergency/${s.id}`);
      }
      for (const userId of Object.keys(s.emergency.going).filter((x) => !s.emergency!.going[x].confirmed)) notify(db, userId, "system", "n.emergencyClosed", { title: s.title }, `/app/emergency/${s.id}`);
      log(db, u, "emergency.close", "helpSignals", s.id, String(confirmed.length));
    });
  },

  /* ── for admins: who may declare emergencies ── */
  async setEmergencyPartner(orgId: string, on: boolean) {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const o = orgOf(db, orgId);
      if (!o) throw new DomainError("not_found", "e.notFound");
      o.emergencyPartner = on;
      log(db, a, on ? "org.emergency_partner" : "org.emergency_partner_off", "organizations", orgId);
    });
  },
};

function emergencyView(db: DB, s: HelpSignal, u: UserProfile | null) {
  const e = s.emergency!;
  const coordinator = Boolean(u && (u.id === s.userId || isAdmin(u.role)));
  return {
    id: s.id, title: s.title, note: s.note, place: s.place, location: s.location, createdAt: s.createdAt, state: e.state, type: e.type, severity: e.severity,
    provinces: e.provinces, cities: e.cities, needs: e.needs, meetingPoints: e.meetingPoints, contacts: e.contacts, validUntil: e.validUntil, closingNote: e.closingNote ?? "",
    goingCount: Object.keys(e.going).length, myGoing: u ? e.going[u.id] ?? null : null, coordinator, canRespond: Boolean(u && canRespond(u.birthYear) && u.role === "volunteer"),
    // the coordinator sees who is coming (name, skills, area); never phone numbers
    responders: coordinator ? Object.entries(e.going).flatMap(([id, g]) => {
      const v = db.users.find((x) => x.id === id);
      return v ? [{ id, name: v.fullName, avatar: v.avatar, province: v.province, skills: (v.skillSet ?? []).map((x) => x.id), ...g }] : [];
    }) : [],
  };
}
export type EmergencyView = ReturnType<typeof emergencyView>;
export type ReportQueueView = Awaited<ReturnType<typeof api6.adminReports>>[number];
