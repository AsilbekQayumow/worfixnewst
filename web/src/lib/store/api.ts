"use client";
/**
 * WORFIX application API. Same surface in local demo mode and Firebase mode.
 * Never trusts caller-supplied role, status, reward or verification values: it re-reads stored records.
 * Errors carry i18n keys (lib/i18n/dict.ts).
 */
import { MAP_COLORS } from "../map-colors";
import { agentOrgId, assertActive, canEnterArea, canManageMission, DomainError, isAdmin, isAgentOrg, type Area } from "../domain/permissions";
import { computeMissionReward, dayKey, levelForXp, nextCertificateLevel } from "../domain/rewards";
import { makeOrderCode, normaliseCode } from "../domain/certificates";
import { runChecks } from "../domain/checks";
import { resubmit, reviewSubmission, type ReviewDecision } from "../domain/verification";
import { computeAchievements, nextAchievement, type AchievementStats } from "../domain/achievements";
import { sampleCatalog } from "../domain/shop";
import { aiNote, aiReviewer, AI_REVIEWER_ID, decideAi, reverseGrant, type AiVerdict } from "../domain/ai-review";
import {
  GROUP_COLORS, GROUP_MAX_MEMBERS, groupBoard, groupLevel, groupXp, km, makeGroupCode, monthKey, normaliseGroupCode, scopeKey, SCOPES, signalAudience,
  SIGNAL_HOURS, SIGNAL_RADIUS_KM, SIGNALS_PER_DAY, volunteerBoard, earnedXp, type Scope,
} from "../domain/community";
import { rankFor, RANKS, xpForLevel } from "../domain/rewards";
import {
  ageErrors, passwordProblem, validateLogin, validateMission, validateOrganization, validatePersonal, validateProfile, validateRegister,
  type Errors, type MissionInput, type OrganizationInput, type PersonalInput, type ProfileInput, type RegisterInput, type Result,
} from "../domain/validation";
import type {
  AiReview, Announcement, Category, Certificate, Evidence, GpsFix, Group, GroupMessage, HelpSignal, Lang, Message, Mission, NewsPost, Notification, Order,
  Organization, Role, ShopItem, Submission, UserProfile, Territory, GroupRequest,
} from "../domain/types";
import { postAi } from "../ai/client";
import type { AiMission } from "../ai/missions";
import * as cloud from "./cloud";

/** v5: work that must run while still signed in (the app unregisters push and widget tokens). */
const beforeLogout = new Set<() => Promise<unknown>>();
export function onBeforeLogout(fn: () => Promise<unknown>) { beforeLogout.add(fn); return () => void beforeLogout.delete(fn); }
import {
  bboxOf, centerOf, cleanTrace, contains, decay, decodeShape, encodeShape, overlapM2, seasonOf, shapeArea, subtractShape, TERRITORY, traceToShape, unionShapes,
  type CaptureError, type Shape, type TracePoint,
} from "../domain/territory";
import { commit, FIREBASE, getDB, hashPassword, nowIso, ready, SESSION_KEY, uid, type DB } from "./db";
import type { GeoPoint } from "../domain/types";

export class ValidationError extends Error {
  constructor(public fields: Errors) {
    super(Object.values(fields)[0] ?? "v.check");
    this.name = "ValidationError";
  }
}

export type SelfUser = Omit<UserProfile, "trustScore">;
const SESSION_HOURS: Record<string, number> = { admin: 8, super_admin: 8, default: 24 * 14 };
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60_000;

const strip = (u: UserProfile): SelfUser => {
  const { trustScore: _t, ...rest } = u;
  void _t;
  return rest;
};

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new ValidationError(r.errors);
  return r.data;
}

/* ───────────────────────── session ───────────────────────── */

function readSession(db: DB): UserProfile | null {
  if (FIREBASE) {
    const u = db.users.find((x) => x.id === cloud.currentUid());
    return u && u.status === "active" ? u : null;
  }
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { userId: string; expiresAt: string };
    if (Date.parse(s.expiresAt) < Date.now()) { localStorage.removeItem(SESSION_KEY); return null; }
    const u = db.users.find((x) => x.id === s.userId);
    return u && u.status === "active" ? u : null;
  } catch {
    return null;
  }
}

function startSession(u: UserProfile) {
  const hours = SESSION_HOURS[u.role] ?? SESSION_HOURS.default;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id, expiresAt: new Date(Date.now() + hours * 3_600_000).toISOString() }));
}

function actor(db: DB): UserProfile {
  const u = readSession(db);
  if (!u) throw new DomainError("forbidden", "e.signIn");
  assertActive(u);
  return u;
}

function requireAdmin(db: DB) {
  const u = actor(db);
  if (!isAdmin(u.role)) throw new DomainError("forbidden", "e.adminOnly");
  return u;
}

function log(db: DB, a: { id: string; role: Role | "system" }, action: string, resource: string, resourceId: string, detail = "") {
  db.audits.unshift({
    id: uid(), actor: a.id, actorRole: a.role, action, resource, resourceId, timestamp: nowIso(), detail, ipAddress: null,
    device: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 120),
  });
}

function notify(db: DB, userId: string, type: Notification["type"], key: string, values: Record<string, unknown>, link: string | null) {
  db.notifications.unshift({ id: uid(), userId, type, title: key, message: JSON.stringify(values), link, read: false, createdAt: nowIso() });
}

const orgOf = (db: DB, id: string) => db.organizations.find((o) => o.id === id) ?? null;
const orgName = (db: DB, m: Mission) => (isAgentOrg(m.organizationId) ? "" : orgOf(db, m.organizationId)?.name ?? "");

/* ───────────────────────── people & privacy ───────────────────────── */

function friendIdsOf(db: DB, userId: string) {
  return new Set(db.friendships.filter((f) => f.status === "accepted" && (f.from === userId || f.to === userId)).map((f) => (f.from === userId ? f.to : f.from)));
}

function relationOf(db: DB, me: string, other: string): "none" | "friend" | "outgoing" | "incoming" {
  const f = db.friendships.find((x) => (x.from === me && x.to === other) || (x.from === other && x.to === me));
  if (!f) return "none";
  if (f.status === "accepted") return "friend";
  return f.from === me ? "outgoing" : "incoming";
}

const privacyOf = (u: UserProfile) => u.privacy ?? "public";

/** May `viewer` see `target`'s results? */
function canSee(db: DB, viewer: UserProfile, target: UserProfile) {
  if (viewer.id === target.id || isAdmin(viewer.role)) return true;
  const p = privacyOf(target);
  if (p === "public") return true;
  if (p === "friends") return relationOf(db, viewer.id, target.id) === "friend";
  return false;
}

/** What others may see about a person: never email, phone, birth year or trust score. */
function person(u: UserProfile) {
  return {
    id: u.id, fullName: u.fullName, username: u.username, avatar: u.avatar, city: u.city, province: u.province, country: u.country,
    district: u.district ?? "", mahalla: u.mahalla ?? "", mapColor: u.mapColor ?? null,
    level: levelForXp(u.xp), xp: u.xp, hours: u.totalVolunteerHours, impact: u.totalImpact, streak: u.streak, privacy: privacyOf(u),
  };
}
export type Person = ReturnType<typeof person>;

function sameArea(a: { country: string; province: string; city: string }, b: { country: string; province: string; city: string }) {
  if (!a.country || a.country !== b.country) return false;
  return a.province && b.province ? a.province === b.province : a.city.toLowerCase() === b.city.toLowerCase();
}

/** Achievement inputs for one user, from verified records only. */
function statsFor(db: DB, u: UserProfile): AchievementStats {
  const approved = db.submissions.filter((s) => s.userId === u.id && s.verificationStatus === "approved");
  const perCategory: Partial<Record<Category, number>> = {};
  let hard = 0, team = 0, agent = 0;
  for (const s of approved) {
    const m = db.missions.find((x) => x.id === s.missionId);
    if (!m) continue;
    perCategory[m.category] = (perCategory[m.category] ?? 0) + 1;
    if (m.difficulty === "hard") hard++;
    if (s.teamId) team++;
    if (m.source === "agent") agent++;
  }
  const ids = new Set(approved.map((s) => s.id));
  return {
    approvedMissions: approved.length, hours: u.totalVolunteerHours, level: levelForXp(u.xp), streak: u.streak, totalImpact: u.totalImpact,
    perCategory, friends: friendIdsOf(db, u.id).size, certificates: db.certificates.filter((c) => c.userId === u.id).length,
    cheersGiven: db.cheers.filter((c) => c.userId === u.id).length, cheersReceived: db.cheers.filter((c) => ids.has(c.submissionId)).length,
    profileComplete: Boolean(u.avatar && u.bio && u.country && u.city && u.skills.length), hardMissions: hard, teamMissions: team,
    agentMissions: agent, purchases: db.orders.filter((o) => o.userId === u.id && o.status !== "cancelled").length,
  };
}

/** Missions a person may open: published org missions, or agent missions they own or joined. */
function missionVisibleTo(db: DB, m: Mission, viewer: UserProfile | null) {
  if (m.source === "agent") {
    if (!viewer) return false;
    if (m.ownerId === viewer.id || isAdmin(viewer.role)) return true;
    return db.participants.some((p) => p.missionId === m.id && p.userId === viewer.id && p.status === "accepted");
  }
  if (m.status === "published" || m.status === "closed") return true;
  return Boolean(viewer && canManageMission(viewer, m));
}

const withOrg = (db: DB, m: Mission, viewer: UserProfile | null) => ({
  ...m,
  moderationNote: viewer && (isAdmin(viewer.role) || viewer.organizationId === m.organizationId) ? m.moderationNote : "",
  organizationName: orgName(db, m),
});
export type MissionView = ReturnType<typeof withOrg>;

export function publicSubmission(s: Submission) {
  const { fraudScore: _f, fraudFlags: _g, ...rest } = s;
  void _f; void _g;
  return rest;
}
export type PublicSubmission = ReturnType<typeof publicSubmission>;

const chatIdOf = (a: string, b: string) => [a, b].sort().join("_");
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/* ───────────────────────── api ───────────────────────── */

/** v4: a verified result with its before and after photos, if its owner lets the viewer see it. */
function resultOf(db: DB, viewer: UserProfile, sub: Submission) {
  if (sub.verificationStatus !== "approved" || sub.images.length < 2) return null;
  const owner = db.users.find((x) => x.id === sub.userId);
  const m = db.missions.find((x) => x.id === sub.missionId);
  if (!owner || !m || owner.status === "deleted" || !canSee(db, viewer, owner)) return null;
  return {
    id: sub.id, missionId: m.id, title: m.title, category: m.category, point: m.coordinates, at: sub.reviewedAt ?? sub.timestamp,
    before: sub.images[0].dataUrl, after: sub.images[sub.images.length - 1].dataUrl,
    person: { id: owner.id, name: owner.fullName, avatar: owner.avatar },
  };
}
export type WorkResult = NonNullable<ReturnType<typeof resultOf>>;

/** v4: what one verified submission did (its grant, else the mission's own numbers). */
function impactOf(db: DB, sub: Submission): Record<string, number> {
  if (sub.grant?.impact && Object.keys(sub.grant.impact).length) return sub.grant.impact;
  const m = db.missions.find((x) => x.id === sub.missionId);
  const out: Record<string, number> = {};
  for (const im of m?.impactMetrics ?? []) out[im.label] = (out[im.label] ?? 0) + im.amountPerVolunteer;
  return out;
}

/** v4: this week's busiest spot: people on missions held in the last seven days, else areas walked this week (~1 km cells). */
function hotSpot(db: DB, live: Territory[], now: number): { point: GeoPoint; people: number } | null {
  const week = now - 7 * 86_400_000;
  const cells = new Map<string, { w: number; lat: number; lng: number; people: number }>();
  const add = (p: GeoPoint, w: number, people: number) => {
    const key = `${Math.round(p.lat * 100)}:${Math.round(p.lng * 100)}`;
    const c = cells.get(key) ?? { w: 0, lat: 0, lng: 0, people: 0 };
    c.w += w; c.lat += p.lat * w; c.lng += p.lng * w; c.people += people;
    cells.set(key, c);
  };
  for (const m of db.missions) {
    const at = Date.parse(m.date);
    if (!m.coordinates || at < week || at > now || m.participantsCount < 1 || (m.status !== "published" && m.status !== "closed")) continue;
    add(m.coordinates, m.participantsCount, m.participantsCount);
  }
  if (!cells.size) for (const t of live) if (t.center && Date.parse(t.updatedAt) > week) add(t.center, Math.max(1, t.captures), 1);
  let best: { w: number; lat: number; lng: number; people: number } | null = null;
  for (const c of cells.values()) if (!best || c.w > best.w) best = c;
  if (!best || best.people < 2) return null;
  return { point: { lat: best.lat / best.w, lng: best.lng / best.w }, people: best.people };
}

export const api = {
  ready,
  mode: (FIREBASE ? "firebase" : "local") as "firebase" | "local",

  /* ---- auth ---- */
  async me(): Promise<SelfUser | null> {
    await ready();
    const u = readSession(getDB());
    return u ? strip(u) : null;
  },

  async refreshEmailVerified() {
    await ready();
    if (!FIREBASE) return readSession(getDB())?.emailVerified ?? false;
    const ok = await cloud.refreshVerified();
    if (ok) await commit((db) => {
      const u = actor(db);
      if (!u.emailVerified) { u.emailVerified = true; log(db, u, "user.verify_email", "users", u.id); }
    });
    return ok;
  },

  async register(input: Partial<RegisterInput>, language: Lang) {
    await ready();
    const data = unwrap(validateRegister(input));
    if (!FIREBASE && getDB().users.some((u) => u.email === data.email)) throw new ValidationError({ email: "e.emailTaken" });
    let cloudUid = "";
    if (FIREBASE) {
      try { cloudUid = await cloud.signUp(data.email, data.password); } catch (e) {
        if (e instanceof cloud.CloudAuthError && e.code === "auth/email-already-in-use") throw new ValidationError({ email: e.message });
        throw e;
      }
    }
    const pw = FIREBASE ? null : await hashPassword(data.password);
    let token = "";
    let userId = "";
    await commit((db) => {
      const t = nowIso();
      const user: UserProfile = {
        id: cloudUid || uid(), email: data.email, emailVerified: false, fullName: data.fullName, username: `user_${uid().slice(0, 8)}`,
        avatar: null, bio: "", country: "", province: "", city: "", feedVisible: true, languages: [], skills: [], interests: [], level: 1, xp: 0,
        points: 0, trustScore: 50, reputation: 0, streak: 0, lastApprovedDay: null, totalVolunteerHours: 0, totalImpact: 0, impact: {},
        onboarded: data.accountType === "organization", organizationId: null, role: data.accountType, status: "active", createdAt: t, updatedAt: t,
        lastLogin: t, language, privacy: "public", phone: "", birthYear: data.accountType === "volunteer" ? data.birthYear : null,
      };
      userId = user.id;
      db.users.push(user);
      log(db, { id: user.id, role: user.role }, "user.register", "users", user.id);
      if (!pw) return;
      db.credentials.push({ userId: user.id, ...pw });
      token = uid();
      db.tokens.push({ token, userId: user.id, kind: "verify", expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
      startSession(user);
    });
    // The organization is a second write: the security rules check the (now existing) organization account.
    if (data.organization) await createOrganization(data.organization, userId);
    if (FIREBASE) await cloud.sendVerification().catch(() => undefined);
    return { devVerifyToken: token, role: data.accountType };
  },

  async login(input: { email: string; password: string }) {
    await ready();
    const data = unwrap(validateLogin(input));
    if (FIREBASE) {
      const id = await cloud.signIn(data.email, data.password);
      // An account created while the database was missing has no profile: recreate it, but only after the
      // server confirms there is none, so an existing profile is never overwritten.
      if (!getDB().users.some((x) => x.id === id) && (await cloud.profileExists(id)) === false) {
        await commit((db) => {
          const t = nowIso();
          const email = cloud.currentAuthEmail() ?? data.email;
          db.users.push({
            id, email, emailVerified: false, fullName: email.split("@")[0], username: `user_${uid().slice(0, 8)}`,
            avatar: null, bio: "", country: "", province: "", city: "", feedVisible: true, languages: [], skills: [], interests: [], level: 1, xp: 0,
            points: 0, trustScore: 50, reputation: 0, streak: 0, lastApprovedDay: null, totalVolunteerHours: 0, totalImpact: 0, impact: {},
            onboarded: false, organizationId: null, role: "volunteer", status: "active", createdAt: t, updatedAt: t,
            lastLogin: t, language: "uz", privacy: "public", phone: "", birthYear: null,
          });
          log(db, { id, role: "volunteer" }, "user.profile_restored", "users", id);
        });
      }
      const u = getDB().users.find((x) => x.id === id);
      if (!u || u.status !== "active") {
        await cloud.logOut();
        throw new DomainError(u?.status === "suspended" ? "suspended" : "forbidden", u?.status === "suspended" ? "e.suspended" : "e.badLogin");
      }
      const verified = cloud.authEmailVerified();
      await commit((db) => {
        const me = db.users.find((x) => x.id === id)!;
        me.lastLogin = nowIso();
        if (verified) me.emailVerified = true;
      });
      return strip(u);
    }
    const db0 = getDB();
    const att = db0.loginAttempts[data.email];
    if (att && Date.now() - att.first < WINDOW_MS && att.count >= MAX_ATTEMPTS) throw new DomainError("forbidden", "e.tooMany");
    const user = db0.users.find((u) => u.email === data.email);
    const cred = user && db0.credentials.find((c) => c.userId === user.id);
    const ok = user && cred ? (await hashPassword(data.password, cred.salt)).hash === cred.hash : false;
    if (!user || !ok) {
      await commit((db) => {
        const a = db.loginAttempts[data.email];
        db.loginAttempts[data.email] = !a || Date.now() - a.first > WINDOW_MS ? { count: 1, first: Date.now() } : { ...a, count: a.count + 1 };
      });
      throw new DomainError("forbidden", "e.badLogin");
    }
    if (user.status === "suspended") throw new DomainError("suspended", "e.suspended");
    if (user.status === "deleted") throw new DomainError("forbidden", "e.badLogin");
    await commit((db) => {
      delete db.loginAttempts[data.email];
      const u = db.users.find((x) => x.id === user.id)!;
      u.lastLogin = nowIso();
      startSession(u);
      log(db, { id: u.id, role: u.role }, "user.login", "users", u.id);
    });
    return strip(getDB().users.find((u) => u.id === user.id)!);
  },

  async logout() {
    // v5: the app forgets this phone's push token and widget token while the user can still prove who they are.
    await Promise.all([...beforeLogout].map((fn) => fn().catch(() => undefined)));
    if (FIREBASE) return cloud.logOut();
    localStorage.removeItem(SESSION_KEY);
    await commit(() => {});
  },

  async verifyEmail(token: string) {
    await ready();
    await commit((db) => {
      const t = db.tokens.find((x) => x.token === token && x.kind === "verify");
      if (!t || Date.parse(t.expiresAt) < Date.now()) throw new DomainError("not_found", "e.linkExpired");
      const u = db.users.find((x) => x.id === t.userId)!;
      u.emailVerified = true;
      db.tokens = db.tokens.filter((x) => x !== t);
      log(db, { id: u.id, role: u.role }, "user.verify_email", "users", u.id);
    });
  },

  async resendVerification() {
    await ready();
    if (FIREBASE) { await cloud.sendVerification(); return { devVerifyToken: "" }; }
    let token = "";
    await commit((db) => {
      const u = actor(db);
      if (u.emailVerified) throw new DomainError("conflict", "e.alreadyVerified");
      db.tokens = db.tokens.filter((t) => !(t.userId === u.id && t.kind === "verify"));
      token = uid();
      db.tokens.push({ token, userId: u.id, kind: "verify", expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    });
    return { devVerifyToken: token };
  },

  async requestPasswordReset(email: string) {
    await ready();
    const clean = email.trim().toLowerCase();
    if (FIREBASE) { await cloud.sendReset(clean); return { devResetToken: null as string | null }; }
    let token: string | null = null;
    await commit((db) => {
      const u = db.users.find((x) => x.email === clean && x.status === "active");
      if (!u) return;
      db.tokens = db.tokens.filter((t) => !(t.userId === u.id && t.kind === "reset"));
      token = uid();
      db.tokens.push({ token, userId: u.id, kind: "reset", expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    });
    return { devResetToken: token as string | null };
  },

  async resetPassword(token: string, password: string) {
    await ready();
    const p = passwordProblem(password);
    if (p) throw new ValidationError({ password: p });
    const pw = await hashPassword(password);
    await commit((db) => {
      const t = db.tokens.find((x) => x.token === token && x.kind === "reset");
      if (!t || Date.parse(t.expiresAt) < Date.now()) throw new DomainError("not_found", "e.linkExpired");
      db.credentials = db.credentials.filter((c) => c.userId !== t.userId);
      db.credentials.push({ userId: t.userId, ...pw });
      db.tokens = db.tokens.filter((x) => x !== t);
      const u = db.users.find((x) => x.id === t.userId)!;
      log(db, { id: u.id, role: u.role }, "user.reset_password", "users", u.id);
    });
  },

  /** Settings → change password. Needs the current password. */
  async changePassword(current: string, next: string) {
    await ready();
    const p = passwordProblem(next);
    if (p) throw new ValidationError({ next: p });
    if (current === next) throw new ValidationError({ next: "v.passwordSame" });
    if (FIREBASE) {
      try { await cloud.changePassword(current, next); } catch (e) {
        if (e instanceof cloud.CloudAuthError && e.message === "e.badLogin") throw new ValidationError({ current: "e.currentPassword" });
        throw e;
      }
      return;
    }
    const db0 = getDB();
    const u = actor(db0);
    const cred = db0.credentials.find((c) => c.userId === u.id);
    if (!cred || (await hashPassword(current, cred.salt)).hash !== cred.hash) throw new ValidationError({ current: "e.currentPassword" });
    const pw = await hashPassword(next);
    await commit((db) => {
      db.credentials = db.credentials.filter((c) => c.userId !== u.id);
      db.credentials.push({ userId: u.id, ...pw });
      log(db, u, "user.change_password", "users", u.id);
    });
  },

  async guard(area: Area): Promise<{ user: SelfUser | null; allowed: boolean }> {
    await ready();
    const u = readSession(getDB());
    if (!u) return { user: null, allowed: false };
    return { user: strip(u), allowed: canEnterArea(u.role, area) };
  },

  /* ---- profile & settings ---- */
  async updateProfile(input: Partial<ProfileInput>, extra: { avatar?: string | null; mapColor?: string | null; onboarded?: boolean; birthYear?: number | null; guardianConsent?: boolean } = {}) {
    await ready();
    const data = unwrap(validateProfile(input));
    if (extra.birthYear !== undefined) {
      const e = ageErrors(extra.birthYear, extra.guardianConsent);
      if (Object.keys(e).length) throw new ValidationError(e);
    }
    await commit((db) => {
      const u = actor(db);
      if (extra.onboarded && u.role === "volunteer" && !u.birthYear && extra.birthYear == null) throw new ValidationError({ birthYear: "v.birthYear" });
      if (extra.birthYear != null) u.birthYear = extra.birthYear;
      if (db.users.some((x) => x.id !== u.id && x.username === data.username)) throw new ValidationError({ username: "e.usernameTaken" });
      Object.assign(u, data, { updatedAt: nowIso() });
      if (extra.avatar !== undefined) u.avatar = extra.avatar;
      if (extra.mapColor !== undefined) u.mapColor = extra.mapColor && MAP_COLORS.includes(extra.mapColor) ? extra.mapColor : null;
      if (extra.onboarded) u.onboarded = true;
      log(db, u, "user.update_profile", "users", u.id);
    });
  },

  async updatePersonal(input: Partial<PersonalInput>) {
    await ready();
    const data = unwrap(validatePersonal(input));
    await commit((db) => {
      const u = actor(db);
      Object.assign(u, data, { updatedAt: nowIso() });
      log(db, u, "user.update_personal", "users", u.id);
    });
  },

  async setLanguage(language: Lang) {
    await ready();
    const u = readSession(getDB());
    if (!u || u.language === language) return;
    await commit((db) => { const me = actor(db); me.language = language; });
  },

  async deleteAccount() {
    await ready();
    await commit((db) => {
      const u = actor(db);
      if (isAdmin(u.role)) throw new DomainError("forbidden", "e.adminDelete");
      for (const p of db.participants.filter((x) => x.userId === u.id && x.status !== "withdrawn")) {
        p.status = "withdrawn";
        const m = db.missions.find((x) => x.id === p.missionId);
        if (m) m.participantsCount = Math.max(0, m.participantsCount - 1);
      }
      for (const s of db.submissions.filter((x) => x.userId === u.id)) { s.images = []; s.videos = []; s.notes = ""; s.gps = null; }
      for (const c of db.certificates.filter((x) => x.userId === u.id)) c.holderName = "—";
      db.notifications = db.notifications.filter((n) => n.userId !== u.id);
      db.credentials = db.credentials.filter((c) => c.userId !== u.id);
      db.tokens = db.tokens.filter((t) => t.userId !== u.id);
      db.friendships = db.friendships.filter((f) => f.from !== u.id && f.to !== u.id);
      db.cheers = db.cheers.filter((c) => c.userId !== u.id);
      db.messages = db.messages.filter((m) => !m.participants.includes(u.id));
      for (const g of db.groups.filter((x) => x.members.includes(u.id))) removeFromGroup(db, g, u.id);
      Object.assign(u, {
        email: `deleted-${u.id}@deleted.invalid`, fullName: "—", username: `deleted_${u.id.slice(0, 8)}`, avatar: null, bio: "", city: "",
        province: "", country: "", skills: [], languages: [], interests: [], phone: "", status: "deleted", updatedAt: nowIso(),
      });
      log(db, u, "user.delete_account", "users", u.id);
      localStorage.removeItem(SESSION_KEY);
    });
    if (FIREBASE) await cloud.deleteAuthUser();
  },

  async exportMyData() {
    await ready();
    const db = getDB();
    const u = actor(db);
    return {
      exportedAt: nowIso(), profile: strip(u),
      participations: db.participants.filter((p) => p.userId === u.id),
      submissions: db.submissions.filter((s) => s.userId === u.id).map(publicSubmission),
      certificates: db.certificates.filter((c) => c.userId === u.id),
      orders: db.orders.filter((o) => o.userId === u.id),
      friendships: db.friendships.filter((f) => f.from === u.id || f.to === u.id),
      messages: db.messages.filter((m) => m.participants.includes(u.id)),
    };
  },

  /* ---- organizations ---- */
  async registerOrganization(input: Partial<OrganizationInput>) {
    await ready();
    const u = actor(getDB());
    return createOrganization(unwrap(validateOrganization(input)), u.id);
  },

  async myOrganization(): Promise<Organization | null> {
    await ready();
    const db = getDB();
    const u = actor(db);
    return u.organizationId ? orgOf(db, u.organizationId) : null;
  },

  async updateOrganization(input: Partial<OrganizationInput>) {
    await ready();
    const data = unwrap(validateOrganization(input));
    await commit((db) => {
      const u = actor(db);
      const o = u.organizationId ? orgOf(db, u.organizationId) : null;
      if (!o || o.ownerId !== u.id) throw new DomainError("forbidden", "e.orgOwner");
      Object.assign(o, data);
      log(db, u, "organization.update", "organizations", o.id);
    });
  },

  async publicOrganizations(): Promise<Organization[]> {
    await ready();
    return getDB().organizations.filter((o) => o.verificationStatus === "approved").map((o) => ({ ...o, members: [], ownerId: "" }));
  },

  /* ---- missions ---- */
  async listMissions(opts: { scope?: "public" | "mine" | "all"; category?: string; q?: string } = {}): Promise<MissionView[]> {
    await ready();
    const db = getDB();
    const viewer = readSession(db);
    let list = db.missions;
    if (opts.scope === "mine") {
      const u = actor(db);
      list = list.filter((m) => m.organizationId === u.organizationId);
    } else if (opts.scope === "all") {
      requireAdmin(db);
    } else {
      list = list.filter((m) => m.status === "published" && m.source !== "agent");
      // v3.2: a new mission inside someone's area is theirs to see first
      if (viewer?.role === "volunteer") { const live = liveTerritories(db); list = list.filter((m) => !firstLook(db, m, viewer.id, live).hidden); }
      else if (!viewer) { const live = liveTerritories(db); list = list.filter((m) => { const at = Date.parse(m.publishedAt ?? m.createdAt); return Date.now() > at + TERRITORY.firstLookHours * 3_600_000 || !live.some((t) => contains(decodeShape(t.shape), m.coordinates)); }); }
    }
    if (opts.category && opts.category !== "all") list = list.filter((m) => m.category === opts.category);
    if (opts.q) {
      const q = opts.q.toLowerCase();
      list = list.filter((m) => `${m.title} ${m.location} ${m.description}`.toLowerCase().includes(q));
    }
    return list.map((m) => withOrg(db, m, viewer)).sort((a, b) => Number(b.featured) - Number(a.featured) || Date.parse(a.date) - Date.parse(b.date));
  },

  async getMission(id: string) {
    await ready();
    const db = getDB();
    const m = db.missions.find((x) => x.id === id);
    const viewer = readSession(db);
    if (!m || !missionVisibleTo(db, m, viewer)) return null;
    return { mission: withOrg(db, m, viewer), canManage: Boolean(viewer && canManageMission(viewer, m)) };
  },

  async saveMission(input: Partial<MissionInput>, existingId?: string) {
    await ready();
    const data = unwrap(validateMission(input));
    let id = existingId ?? "";
    await commit((db) => {
      const u = actor(db);
      const org = u.organizationId ? orgOf(db, u.organizationId) : null;
      if (!org) throw new DomainError("forbidden", "e.registerOrgFirst");
      const common = {
        title: data.title, description: data.description, category: data.category, difficulty: data.difficulty,
        ...computeMissionReward(data.difficulty), location: data.location,
        coordinates: data.lat !== null && data.lng !== null ? { lat: data.lat, lng: data.lng } : null,
        date: new Date(data.date).toISOString(), deadline: new Date(data.deadline).toISOString(), duration: data.duration, capacity: data.capacity,
        requirements: data.requirements, safety: data.safety, equipment: data.equipment,
        impactMetrics: data.impactLabel ? [{ label: data.impactLabel, amountPerVolunteer: data.impactAmount }] : [],
        radiusM: data.radiusM, checklist: data.checklist, updatedAt: nowIso(),
      };
      if (existingId) {
        const m = db.missions.find((x) => x.id === existingId);
        if (!m) throw new DomainError("not_found", "e.notFound");
        if (!canManageMission(u, m)) throw new DomainError("forbidden", "e.forbidden");
        if (m.status === "published" && data.capacity < m.participantsCount) throw new ValidationError({ capacity: "e.capacityBelow" });
        Object.assign(m, common);
        log(db, u, "mission.update", "missions", m.id);
      } else {
        id = uid();
        db.missions.push({
          id, organizationId: org.id, ...common, participantsCount: 0, status: "draft", featured: false, moderationNote: "", isDemo: false,
          createdAt: nowIso(), source: "organization", ownerId: null,
        });
        org.totalMissions += 1;
        log(db, u, "mission.create", "missions", id, data.title);
      }
    });
    return { id };
  },

  async publishMission(id: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === id);
      if (!m) throw new DomainError("not_found", "e.notFound");
      if (!canManageMission(u, m)) throw new DomainError("forbidden", "e.forbidden");
      if (orgOf(db, m.organizationId)?.verificationStatus !== "approved") throw new DomainError("invalid_state", "e.orgNotApproved");
      if (m.status !== "draft") throw new DomainError("invalid_state", "e.onlyDrafts");
      if (Date.parse(m.date) <= Date.now()) throw new DomainError("validation", "e.startPast");
      m.status = "published";
      m.updatedAt = nowIso();
      m.publishedAt = nowIso();
      // v3.2: whoever holds this spot (and their group) hears about it first
      const told = new Set<string>();
      for (const t of liveTerritories(db)) {
        if (!contains(decodeShape(t.shape), m.coordinates)) continue;
        for (const who of sideOf(db, t.userId)) {
          if (told.has(who)) continue;
          told.add(who);
          notify(db, who, "mission", "n.missionInArea", { title: m.title, hours: TERRITORY.firstLookHours }, `/app/missions/${m.id}`);
        }
      }
      log(db, u, "mission.publish", "missions", id, m.title);
    });
  },

  async deleteDraft(id: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === id);
      if (!m) throw new DomainError("not_found", "e.notFound");
      if (!canManageMission(u, m)) throw new DomainError("forbidden", "e.forbidden");
      if (m.status !== "draft") throw new DomainError("invalid_state", "e.onlyDrafts");
      db.missions = db.missions.filter((x) => x.id !== id);
      const org = orgOf(db, m.organizationId);
      if (org) org.totalMissions = Math.max(0, org.totalMissions - 1);
      log(db, u, "mission.delete_draft", "missions", id, m.title);
    });
  },

  async closeMission(id: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === id);
      if (!m || !canManageMission(u, m)) throw new DomainError("forbidden", "e.forbidden");
      if (m.status !== "published") throw new DomainError("invalid_state", "e.onlyPublished");
      m.status = "closed";
      m.updatedAt = nowIso();
      log(db, u, "mission.close", "missions", id);
    });
  },

  async moderateMission(id: string, action: "feature" | "unfeature" | "cancel", note = "") {
    await ready();
    await commit((db) => {
      const u = requireAdmin(db);
      const m = db.missions.find((x) => x.id === id);
      if (!m) throw new DomainError("not_found", "e.notFound");
      if (action === "cancel") {
        if (note.trim().length < 5) throw new ValidationError({ note: "e.reasonNeeded" });
        m.status = "cancelled";
        m.moderationNote = note.trim();
        const org = orgOf(db, m.organizationId);
        if (org) notify(db, org.ownerId, "mission", "n.missionCancelled", { title: m.title, note: note.trim() }, "/org/missions");
      } else m.featured = action === "feature";
      m.updatedAt = nowIso();
      log(db, u, `mission.${action}`, "missions", id, note);
    });
  },

  /* ---- GPS mission agent ---- */
  /** Saves missions proposed by the agent as the volunteer's own missions and joins them. */
  async saveAgentMissions(items: (AiMission & { lat: number; lng: number })[], area: string) {
    await ready();
    const ids: string[] = [];
    await commit((db) => {
      const u = actor(db);
      if (!items.length) throw new DomainError("validation", "e.nothingSelected");
      const open = db.missions.filter((m) => m.source === "agent" && m.ownerId === u.id && m.status === "published").length;
      if (open + items.length > 12) throw new DomainError("conflict", "e.agentLimit");
      const t = nowIso();
      for (const a of items) {
        const id = uid();
        const start = new Date(Date.now() + 60 * 60_000);
        start.setMinutes(0, 0, 0);
        db.missions.push({
          id, organizationId: agentOrgId(u.id), title: a.title, description: a.description, category: a.category, difficulty: a.difficulty,
          ...computeMissionReward(a.difficulty), location: a.location || area, coordinates: { lat: a.lat, lng: a.lng },
          date: start.toISOString(), deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(), duration: a.durationMinutes, capacity: 6,
          participantsCount: 1, status: "published", featured: false, requirements: a.requirements, safety: a.safety, equipment: a.equipment,
          impactMetrics: a.impactLabel && a.impactAmount > 0 ? [{ label: a.impactLabel, amountPerVolunteer: a.impactAmount }] : [],
          moderationNote: "", isDemo: false, createdAt: t, updatedAt: t, source: "agent", ownerId: u.id, radiusM: 300,
          checklist: a.checklist, whyHere: a.whyHere,
        });
        db.participants.push({ id: `${id}_${u.id}`, missionId: id, userId: u.id, joinedAt: t, status: "accepted", attendance: false, completionStatus: "joined", teamId: null, startedAt: null, startGps: null });
        ids.push(id);
        log(db, u, "mission.agent_create", "missions", id, a.title);
      }
    });
    return { ids };
  },

  async dropAgentMission(id: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === id && x.source === "agent" && x.ownerId === u.id);
      if (!m) throw new DomainError("not_found", "e.notFound");
      if (db.submissions.some((s) => s.missionId === id)) throw new DomainError("invalid_state", "e.alreadySubmitted");
      m.status = "cancelled";
      for (const p of db.participants.filter((x) => x.missionId === id)) p.status = "withdrawn";
      m.participantsCount = 0;
    });
  },

  /* ---- participation ---- */
  async joinMission(missionId: string, teamId: string | null = null) {
    await ready();
    await commit((db) => joinInto(db, actor(db), missionId, teamId));
  },

  async leaveMission(missionId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const p = db.participants.find((x) => x.id === `${missionId}_${u.id}`);
      if (!p || p.status !== "accepted") throw new DomainError("not_found", "e.notJoined");
      if (db.submissions.some((s) => s.missionId === missionId && s.userId === u.id)) throw new DomainError("invalid_state", "e.alreadySubmitted");
      p.status = "withdrawn";
      p.teamId = null;
      const m = db.missions.find((x) => x.id === missionId);
      if (m) m.participantsCount = Math.max(0, m.participantsCount - 1);
      // The organization's volunteer counter counted this join; take it back.
      const org = m ? orgOf(db, m.organizationId) : null;
      if (org) org.totalVolunteers = Math.max(0, org.totalVolunteers - 1);
      log(db, u, "mission.leave", "missionParticipants", p.id);
    });
  },

  /** "Start mission": GPS check-in and the clock for time on site. */
  async startMission(missionId: string, gps: GpsFix | null) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const p = db.participants.find((x) => x.id === `${missionId}_${u.id}`);
      if (!p || p.status !== "accepted") throw new DomainError("not_found", "e.notJoined");
      const m = db.missions.find((x) => x.id === missionId)!;
      if (Date.parse(m.date) - Date.now() > 2 * 3_600_000) throw new DomainError("invalid_state", "e.tooEarly");
      if (!p.startedAt) p.startedAt = nowIso();
      if (gps) p.startGps = gps;
      log(db, u, "mission.start", "missionParticipants", p.id);
    });
  },

  async myParticipations() {
    await ready();
    const db = getDB();
    const u = actor(db);
    return db.participants
      .filter((p) => p.userId === u.id && p.status !== "withdrawn")
      .flatMap((p) => {
        const mission = db.missions.find((m) => m.id === p.missionId);
        if (!mission || mission.status === "cancelled") return [];
        const sub = db.submissions.find((s) => s.missionId === p.missionId && s.userId === u.id) ?? null;
        return [{ participant: p, mission: withOrg(db, mission, u), submission: sub ? publicSubmission(sub) : null }];
      })
      .sort((a, b) => Date.parse(a.mission.date) - Date.parse(b.mission.date));
  },

  /** Everything the mission screen needs for the signed-in volunteer. */
  async missionState(missionId: string) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return null;
    const p = db.participants.find((x) => x.id === `${missionId}_${u.id}`) ?? null;
    const sub = db.submissions.find((s) => s.missionId === missionId && s.userId === u.id) ?? null;
    const team = p?.teamId
      ? db.participants.filter((x) => x.missionId === missionId && x.teamId === p.teamId && x.status === "accepted" && x.userId !== u.id)
          .flatMap((x) => { const f = db.users.find((y) => y.id === x.userId); return f ? [person(f)] : []; })
      : [];
    const friends = [...friendIdsOf(db, u.id)].flatMap((id) => { const f = db.users.find((y) => y.id === id && y.status === "active"); return f ? [person(f)] : []; });
    return { participant: p, submission: sub ? publicSubmission(sub) : null, team, friends, emailVerified: isVerifiedAccount(u), onboarded: u.onboarded, role: u.role };
  },

  async missionParticipants(missionId: string) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const m = db.missions.find((x) => x.id === missionId);
    if (!m || !canManageMission(u, m)) throw new DomainError("forbidden", "e.forbidden");
    return db.participants.filter((p) => p.missionId === missionId).map((p) => {
      const v = db.users.find((x) => x.id === p.userId)!;
      const s = db.submissions.find((x) => x.missionId === missionId && x.userId === p.userId) ?? null;
      return { participant: p, volunteer: person(v), skills: v.skills, submissionStatus: s?.verificationStatus ?? null };
    });
  },

  async decideParticipant(missionId: string, userId: string, decision: "accepted" | "rejected") {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === missionId);
      if (!m || !canManageMission(u, m)) throw new DomainError("forbidden", "e.forbidden");
      const p = db.participants.find((x) => x.id === `${missionId}_${userId}`);
      if (!p) throw new DomainError("not_found", "e.notFound");
      if (db.submissions.some((s) => s.missionId === missionId && s.userId === userId)) throw new DomainError("invalid_state", "e.alreadySubmitted");
      if (decision === "rejected" && p.status === "accepted") m.participantsCount = Math.max(0, m.participantsCount - 1);
      if (decision === "accepted" && p.status !== "accepted") {
        if (m.participantsCount >= m.capacity) throw new DomainError("conflict", "e.full");
        m.participantsCount += 1;
      }
      p.status = decision;
      notify(db, userId, "mission", decision === "accepted" ? "n.accepted" : "n.declined", { title: m.title }, `/app/missions/${m.id}`);
      log(db, u, `participant.${decision}`, "missionParticipants", p.id);
    });
  },

  /* ---- team missions ---- */
  async inviteToMission(friendId: string, missionId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      if (relationOf(db, u.id, friendId) !== "friend") throw new DomainError("forbidden", "e.friendsOnly");
      const m = db.missions.find((x) => x.id === missionId);
      if (!m || m.status !== "published") throw new DomainError("not_found", "e.missionClosed");
      const p = db.participants.find((x) => x.id === `${missionId}_${u.id}`);
      if (!p || p.status !== "accepted") throw new DomainError("invalid_state", "e.joinFirst");
      if (db.participants.some((x) => x.id === `${missionId}_${friendId}` && x.status === "accepted")) throw new DomainError("conflict", "e.friendAlreadyIn");
      if (m.participantsCount >= m.capacity) throw new DomainError("conflict", "e.full");
      if (!p.teamId) p.teamId = p.id;
      const chatId = chatIdOf(u.id, friendId);
      db.messages.push({
        id: uid(), chatId, participants: [u.id, friendId].sort() as [string, string], from: u.id, text: m.title, kind: "invite", missionId, readBy: [u.id], createdAt: nowIso(),
      });
      notify(db, friendId, "mission", "n.teamInvite", { name: u.fullName, title: m.title }, `/app/chat/${u.id}`);
      log(db, u, "team.invite", "missions", missionId, friendId);
    });
  },

  async acceptInvite(messageId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const msg = db.messages.find((x) => x.id === messageId && x.kind === "invite" && x.participants.includes(u.id) && x.from !== u.id);
      if (!msg || !msg.missionId) throw new DomainError("not_found", "e.notFound");
      const inviter = db.participants.find((x) => x.id === `${msg.missionId}_${msg.from}` && x.status === "accepted");
      if (!inviter) throw new DomainError("invalid_state", "e.inviterLeft");
      const mine = db.participants.find((x) => x.id === `${msg.missionId}_${u.id}`);
      if (mine && mine.status === "accepted") mine.teamId = inviter.teamId ?? inviter.id;
      else joinInto(db, u, msg.missionId, inviter.teamId ?? inviter.id);
      notify(db, msg.from, "mission", "n.teamJoined", { name: u.fullName, title: msg.text }, `/app/missions/${msg.missionId}`);
    });
  },

  /* ---- evidence ---- */
  async submitEvidence(missionId: string, input: {
    notes: string; gpsConsent: boolean; gps: GpsFix | null; images: Evidence[]; checklistDone: string[]; aiConfidence: number | null; aiNotes: string;
  }) {
    await ready();
    if (input.notes.trim().length > 1000) throw new ValidationError({ notes: "v.notes" });
    if (input.images.length < 1) throw new ValidationError({ images: "e.photoNeeded" });
    if (input.images.length > 6) throw new ValidationError({ images: "e.photoMax" });
    let submissionId = "";
    let agent = false;
    await commit((db) => {
      const u = actor(db);
      const m = db.missions.find((x) => x.id === missionId);
      const p = db.participants.find((x) => x.id === `${missionId}_${u.id}`);
      if (!m || !p || p.status !== "accepted") throw new DomainError("forbidden", "e.joinFirst");
      if (Date.parse(m.date) - Date.now() > 2 * 3_600_000) throw new DomainError("invalid_state", "e.tooEarly");
      const existing = db.submissions.find((s) => s.missionId === missionId && s.userId === u.id);
      const t = nowIso();
      const gps = input.gpsConsent ? input.gps : null;
      const extra = { checklistDone: input.checklistDone, aiConfidence: input.aiConfidence, aiNotes: input.aiNotes.slice(0, 600), teamId: p.teamId ?? null };
      agent = m.source === "agent";
      if (existing) {
        const next = { ...resubmit(existing, { images: input.images, notes: input.notes.trim() }, t), ...extra, gps: gps ?? existing.gps };
        const r = runChecks({ submission: next, mission: m, participant: p, others: db.submissions.filter((s) => s.id !== existing.id) });
        Object.assign(existing, next, { checks: r.checks, fraudScore: r.score, fraudFlags: r.flags, aiReview: null });
        submissionId = existing.id;
        log(db, u, "submission.resubmit", "missionSubmissions", existing.id);
      } else {
        const sub: Submission = {
          id: uid(), missionId, userId: u.id, organizationId: m.organizationId, images: input.images, videos: [], notes: input.notes.trim(),
          gps, gpsConsent: input.gpsConsent, timestamp: t, metadata: { userAgent: navigator.userAgent.slice(0, 160), submissionCount: 1 },
          fraudScore: 0, fraudFlags: [], verificationStatus: "pending", reviewedBy: null, reviewedAt: null, reviewNote: "", rewardGrantedAt: null,
          certificateId: null, checks: [], ...extra, groupId: groupOf(db, u.id)?.id ?? null, aiReview: null, grant: null,
        };
        submissionId = sub.id;
        const r = runChecks({ submission: sub, mission: m, participant: p, others: db.submissions });
        Object.assign(sub, { checks: r.checks, fraudScore: r.score, fraudFlags: r.flags });
        db.submissions.push(sub);
        log(db, u, "submission.create", "missionSubmissions", sub.id);
      }
      p.completionStatus = "submitted";
      // Agent missions are reviewed by the AI first (admins are told only when it escalates); org missions by the organization.
      if (!isAgentOrg(m.organizationId)) {
        const owner = orgOf(db, m.organizationId)?.ownerId;
        if (owner) notify(db, owner, "submission", "n.toReview", { name: u.fullName, title: m.title }, `/org/review?mission=${m.id}`);
      }
    });
    if (agent) void api.runAiReview(submissionId).catch(() => undefined);
    return { id: submissionId, agent };
  },

  async reviewQueue(scope: "org" | "admin") {
    await ready();
    const db = getDB();
    const u = actor(db);
    if (scope === "admin") requireAdmin(db);
    else if (u.role !== "organization" && !isAdmin(u.role)) throw new DomainError("forbidden", "e.forbidden");
    return db.submissions
      .filter((s) => (scope === "admin" ? true : s.organizationId === u.organizationId))
      .flatMap((s) => {
        const mission = db.missions.find((m) => m.id === s.missionId);
        const v = db.users.find((x) => x.id === s.userId);
        if (!mission || !v) return [];
        const participant = db.participants.find((p) => p.id === `${s.missionId}_${s.userId}`) ?? null;
        return [{ submission: s, mission, volunteer: person(v), participant }];
      })
      .sort((a, b) => Date.parse(b.submission.timestamp) - Date.parse(a.submission.timestamp));
  },

  async review(submissionId: string, decision: ReviewDecision, note: string) {
    await ready();
    await commit((db) => {
      const reviewer = actor(db);
      const s = db.submissions.find((x) => x.id === submissionId);
      if (!s) throw new DomainError("not_found", "e.notFound");
      const mission = db.missions.find((m) => m.id === s.missionId)!;
      const volunteer = db.users.find((x) => x.id === s.userId)!;
      const teamSize = s.teamId ? db.participants.filter((p) => p.missionId === s.missionId && p.teamId === s.teamId && p.status === "accepted").length : 1;
      const res = reviewSubmission({
        submission: s, mission, volunteer, reviewer, organization: orgOf(db, s.organizationId), decision, note, now: nowIso(), newId: uid,
        origin: window.location.origin, team: teamSize > 1,
      });
      Object.assign(s, res.submission);
      Object.assign(volunteer, res.volunteer);
      db.records.push(res.record);
      db.certificates.push(...res.certificates);
      db.notifications.unshift(...res.notifications);
      db.audits.unshift(res.audit);
      const p = db.participants.find((x) => x.id === `${s.missionId}_${s.userId}`);
      if (p) {
        if (decision === "approved") Object.assign(p, { completionStatus: "completed", attendance: true });
        else p.completionStatus = "joined";
      }
    });
  },

  /* ---- certificates ---- */
  async myCertificates(): Promise<Certificate[]> {
    await ready();
    const db = getDB();
    const u = actor(db);
    return db.certificates.filter((c) => c.userId === u.id).sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
  },

  async verifyCertificate(code: string) {
    await ready();
    const c = getDB().certificates.find((x) => x.verificationCode === normaliseCode(code));
    if (!c) return null;
    return { verificationCode: c.verificationCode, holderName: c.holderName, certificateType: c.certificateType, level: c.level ?? null, missionTitle: c.missionTitle, organizationName: c.organizationName, issuedAt: c.issuedAt, hours: c.hours, xp: c.xp };
  },

  /* ---- notifications ---- */
  async myNotifications() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const seen = u.announcementsSeenAt ? Date.parse(u.announcementsSeenAt) : 0;
    const anns: Notification[] = announcementsFor(db, u).map((a) => ({
      id: `ann_${a.id}`, userId: u.id, type: "system", title: a.title, message: a.body, link: a.link, read: Date.parse(a.createdAt) <= seen, createdAt: a.createdAt,
    }));
    return [...anns, ...db.notifications.filter((n) => n.userId === u.id)].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
  },
  async markNotificationsRead(ids?: string[]) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      for (const n of db.notifications) if (n.userId === u.id && !n.read && (!ids || ids.includes(n.id))) n.read = true;
      const newest = announcementsFor(db, u)[0];
      if (newest && (!u.announcementsSeenAt || Date.parse(newest.createdAt) > Date.parse(u.announcementsSeenAt))) u.announcementsSeenAt = nowIso();
    });
  },
  /** The newest announcement for the signed-in user that they have not dismissed yet (for the home page). */
  async latestAnnouncement() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return null;
    const a = announcementsFor(db, u)[0];
    return a && (!u.announcementsSeenAt || Date.parse(a.createdAt) > Date.parse(u.announcementsSeenAt)) ? a : null;
  },

  /* ---- feed ---- */
  async feed(opts: { scope?: "all" | "friends" | "mine" } = {}) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const friends = friendIdsOf(db, u.id);
    return db.submissions
      .filter((s) => s.verificationStatus === "approved")
      .flatMap((s) => {
        const author = db.users.find((x) => x.id === s.userId);
        const mission = db.missions.find((m) => m.id === s.missionId);
        if (!author || !mission || author.status !== "active") return [];
        const isMe = author.id === u.id;
        if (!isMe && (!author.feedVisible || !canSee(db, u, author))) return [];
        const cheers = db.cheers.filter((c) => c.submissionId === s.id);
        return [{
          id: s.id, at: s.reviewedAt ?? s.timestamp, author: person(author), isMe, isFriend: friends.has(author.id),
          mission: { id: mission.id, title: mission.title, category: mission.category, location: mission.location, difficulty: mission.difficulty },
          photos: s.images.map((i) => i.dataUrl), notes: s.notes, cheers: cheers.length, cheered: cheers.some((c) => c.userId === u.id), team: Boolean(s.teamId),
        }];
      })
      .filter((i) => (opts.scope === "friends" ? i.isFriend : opts.scope === "mine" ? i.isMe : true))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 60);
  },

  async toggleCheer(submissionId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const s = db.submissions.find((x) => x.id === submissionId && x.verificationStatus === "approved");
      if (!s) throw new DomainError("not_found", "e.notFound");
      if (s.userId === u.id) throw new DomainError("forbidden", "e.ownCheer");
      const id = `${submissionId}_${u.id}`;
      if (db.cheers.some((c) => c.id === id)) { db.cheers = db.cheers.filter((c) => c.id !== id); return; }
      db.cheers.push({ id, submissionId, userId: u.id, createdAt: nowIso() });
      const m = db.missions.find((x) => x.id === s.missionId);
      notify(db, s.userId, "system", "n.cheer", { name: u.fullName, title: m?.title ?? "" }, `/app/people/${u.id}`);
    });
  },

  /* ---- friends & profiles ---- */
  async people(q = "") {
    await ready();
    const db = getDB();
    const u = actor(db);
    const needle = q.trim().toLowerCase();
    return db.users
      .filter((x) => x.id !== u.id && x.role === "volunteer" && x.status === "active" && x.onboarded && privacyOf(x) !== "private")
      .filter((x) => !needle || `${x.fullName} ${x.username} ${x.city} ${x.province}`.toLowerCase().includes(needle))
      .map((x) => ({ ...person(x), relation: relationOf(db, u.id, x.id), nearby: sameArea(u, x) }))
      .sort((a, b) => Number(b.nearby) - Number(a.nearby) || b.xp - a.xp)
      .slice(0, 40);
  },

  async friendsOverview() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const byId = (id: string) => db.users.find((x) => x.id === id && x.status === "active");
    const friends = [...friendIdsOf(db, u.id)].flatMap((id) => { const x = byId(id); return x ? [person(x)] : []; });
    const incoming = db.friendships.filter((f) => f.to === u.id && f.status === "pending").flatMap((f) => { const x = byId(f.from); return x ? [{ friendshipId: f.id, person: person(x) }] : []; });
    const outgoing = db.friendships.filter((f) => f.from === u.id && f.status === "pending").flatMap((f) => { const x = byId(f.to); return x ? [{ friendshipId: f.id, person: person(x) }] : []; });
    const leaderboard = [{ ...person(u), isMe: true }, ...friends.map((f) => ({ ...f, isMe: false }))].sort((a, b) => b.xp - a.xp);
    return { friends: friends.sort((a, b) => a.fullName.localeCompare(b.fullName)), incoming, outgoing, leaderboard };
  },

  async sendFriendRequest(userId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const other = db.users.find((x) => x.id === userId && x.status === "active" && x.role === "volunteer");
      if (!other || other.id === u.id) throw new DomainError("not_found", "e.notFound");
      const rel = relationOf(db, u.id, other.id);
      if (rel === "friend") throw new DomainError("conflict", "e.alreadyFriends");
      if (rel === "outgoing") throw new DomainError("conflict", "e.requestSent");
      if (rel === "incoming") {
        db.friendships.find((x) => x.from === other.id && x.to === u.id)!.status = "accepted";
        notify(db, other.id, "system", "n.friendAccepted", { name: u.fullName }, `/app/people/${u.id}`);
      } else {
        db.friendships.push({ id: `${u.id}_${other.id}`, from: u.id, to: other.id, status: "pending", createdAt: nowIso() });
        notify(db, other.id, "system", "n.friendRequest", { name: u.fullName }, `/app/people/${u.id}`);
      }
      log(db, u, "friend.request", "friendships", `${u.id}_${other.id}`);
    });
  },

  async respondFriendRequest(friendshipId: string, accept: boolean) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const f = db.friendships.find((x) => x.id === friendshipId && x.to === u.id && x.status === "pending");
      if (!f) throw new DomainError("not_found", "e.notFound");
      if (accept) {
        f.status = "accepted";
        notify(db, f.from, "system", "n.friendAccepted", { name: u.fullName }, `/app/people/${u.id}`);
      } else db.friendships = db.friendships.filter((x) => x !== f);
    });
  },

  async removeFriend(userId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const before = db.friendships.length;
      db.friendships = db.friendships.filter((f) => !((f.from === u.id && f.to === userId) || (f.from === userId && f.to === u.id)));
      if (db.friendships.length === before) throw new DomainError("not_found", "e.notFound");
    });
  },

  /** Another volunteer's profile and results, respecting their privacy mode. */
  async profile(userId: string) {
    await ready();
    const db = getDB();
    const viewer = actor(db);
    const u = db.users.find((x) => x.id === userId && x.status === "active");
    if (!u) return null;
    const relation = relationOf(db, viewer.id, u.id);
    const base = { person: person(u), relation, isMe: u.id === viewer.id, bio: u.bio, interests: u.interests };
    if (!canSee(db, viewer, u)) return { ...base, locked: true as const };
    const achievements = computeAchievements(statsFor(db, u));
    const approved = db.submissions.filter((s) => s.userId === u.id && s.verificationStatus === "approved")
      .flatMap((s) => { const m = db.missions.find((x) => x.id === s.missionId); return m ? [{ id: s.id, at: s.reviewedAt ?? s.timestamp, title: m.title, category: m.category, difficulty: m.difficulty, xp: m.rewardXP, photo: s.images[0]?.dataUrl ?? null }] : []; })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return {
      ...base, locked: false as const, skills: u.skills, languages: u.languages,
      achievements: achievements.filter((a) => a.unlocked), achievementCount: achievements.filter((a) => a.unlocked).length,
      certificates: db.certificates.filter((c) => c.userId === u.id).map((c) => ({ id: c.id, level: c.level ?? null, issuedAt: c.issuedAt, verificationCode: c.verificationCode, missionTitle: c.missionTitle, certificateType: c.certificateType })),
      missions: approved.slice(0, 12), missionCount: approved.length,
    };
  },

  /* ---- chat: personal chats (friends, moderators) and group chats ---- */
  async chats() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const friends = friendIdsOf(db, u.id);
    const threads = new Map<string, Message[]>();
    for (const m of db.messages) if (m.participants.includes(u.id)) threads.set(m.chatId, [...(threads.get(m.chatId) ?? []), m]);
    const ids = new Set([...friends, ...[...threads.values()].map((ms) => ms[0].participants.find((p) => p !== u.id)!)]);
    return [...ids].flatMap((id) => {
      const other = db.users.find((x) => x.id === id && x.status === "active");
      if (!other) return [];
      const ms = (threads.get(chatIdOf(u.id, id)) ?? []).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      const last = ms[ms.length - 1] ?? null;
      return [{ person: person(other), last, unread: ms.filter((m) => !m.readBy.includes(u.id)).length, isFriend: friends.has(id), isTeam: isAdmin(other.role) }];
    }).sort((a, b) => (b.last ? Date.parse(b.last.createdAt) : 0) - (a.last ? Date.parse(a.last.createdAt) : 0) || a.person.fullName.localeCompare(b.person.fullName));
  },

  /** Group chats of the signed-in user (one per group). */
  async groupChats() {
    await ready();
    const db = getDB();
    const u = actor(db);
    return db.groups.filter((g) => g.members.includes(u.id)).map((g) => {
      const ms = db.groupMessages.filter((m) => m.groupId === g.id).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      const last = ms[ms.length - 1] ?? null;
      const lastFrom = last ? db.users.find((x) => x.id === last.from)?.fullName.split(" ")[0] ?? "" : "";
      return { group: g, last, lastFrom, unread: ms.filter((m) => !m.readBy.includes(u.id)).length };
    });
  },

  /** One conversation. `id` is a user id (personal chat) or "g_<groupId>" (group chat). */
  async thread(id: string) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const myActive = db.participants.filter((p) => p.userId === u.id && p.status === "accepted" && p.completionStatus === "joined")
      .flatMap((p) => { const m = db.missions.find((x) => x.id === p.missionId && x.status === "published"); return m ? [{ id: m.id, title: m.title, date: m.date }] : []; });
    const missionOf = (missionId: string | null) => {
      const mission = missionId ? db.missions.find((x) => x.id === missionId) ?? null : null;
      return mission ? { id: mission.id, title: mission.title, date: mission.date, location: mission.location, category: mission.category, difficulty: mission.difficulty, status: mission.status } : null;
    };
    if (id.startsWith("g_")) {
      const g = db.groups.find((x) => x.id === id.slice(2));
      if (!g || !g.members.includes(u.id)) return null;
      const names: Record<string, { name: string; avatar: string | null }> = {};
      for (const uidx of new Set([...g.members, ...db.groupMessages.filter((m) => m.groupId === g.id).map((m) => m.from)])) {
        const x = db.users.find((y) => y.id === uidx);
        names[uidx] = { name: x?.fullName ?? "—", avatar: x?.avatar ?? null };
      }
      const messages = db.groupMessages.filter((m) => m.groupId === g.id).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map((m) => {
        const sig = m.signalId ? db.helpSignals.find((x) => x.id === m.signalId) ?? null : null;
        return {
          ...m, kind: m.kind, mission: null, joined: false, invite: null,
          signal: sig ? { id: sig.id, title: sig.title, place: sig.place, status: sig.status, expiresAt: sig.expiresAt, responders: sig.responders.length, going: sig.responders.includes(u.id) } : null,
        };
      });
      return {
        kind: "group" as const, id, me: u.id, title: g.name, subtitle: "", color: g.color, avatar: null as string | null, group: { id: g.id, members: g.members.length, ownerId: g.ownerId },
        person: null, isFriend: false, canWrite: true, otherIsAdmin: false, names, messages, myActive, groupInvite: null,
      };
    }
    const other = db.users.find((x) => x.id === id && x.status === "active");
    if (!other) return null;
    const chatId = chatIdOf(u.id, id);
    const messages = db.messages.filter((m) => m.chatId === chatId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map((m) => ({
      ...m, mission: missionOf(m.missionId), signal: null,
      joined: m.missionId ? db.participants.some((p) => p.id === `${m.missionId}_${u.id}` && p.status === "accepted") : false,
      invite: m.kind === "group_invite" && m.group ? inviteInfo(db, u.id, m.group.id) : null,
    }));
    const adminThread = isAdmin(u.role) || isAdmin(other.role);
    const friend = relationOf(db, u.id, id) === "friend";
    return {
      kind: "direct" as const, id, me: u.id, title: other.fullName, subtitle: "", color: null as string | null, avatar: other.avatar, group: null,
      person: person(other), isFriend: friend, canWrite: friend || adminThread, otherIsAdmin: isAdmin(other.role),
      groupInvite: (() => {
        const mine = groupOf(db, u.id);
        if (!friend || !mine || other.role !== "volunteer") return null;
        return { groupName: mine.name, state: mine.members.includes(other.id) ? "member" as const : pendingGroupInvite(db, mine.id, other.id) ? "invited" as const : "free" as const };
      })(),
      names: { [u.id]: { name: u.fullName, avatar: u.avatar }, [other.id]: { name: other.fullName, avatar: other.avatar } } as Record<string, { name: string; avatar: string | null }>,
      messages, myActive,
    };
  },

  async sendMessage(to: string, text: string, replyToId: string | null = null) {
    await ready();
    const body = text.trim();
    if (!body) return;
    if (body.length > 1000) throw new ValidationError({ text: "v.message" });
    await commit((db) => {
      const u = actor(db);
      if (to.startsWith("g_")) {
        const g = db.groups.find((x) => x.id === to.slice(2));
        if (!g || !g.members.includes(u.id)) throw new DomainError("forbidden", "e.groupMembersOnly");
        const ref = replyToId ? db.groupMessages.find((m) => m.id === replyToId && m.groupId === g.id && !m.deletedAt) : null;
        db.groupMessages.push({
          id: uid(), groupId: g.id, from: u.id, text: body, kind: "text", signalId: null, readBy: [u.id], createdAt: nowIso(), reactions: {},
          replyTo: ref ? { id: ref.id, from: ref.from, text: ref.text.slice(0, 140) } : null, editedAt: null, deletedAt: null,
        });
        return;
      }
      const other = db.users.find((x) => x.id === to);
      if (!other) throw new DomainError("not_found", "e.notFound");
      const admin = isAdmin(u.role) || isAdmin(other.role);
      if (!admin && relationOf(db, u.id, to) !== "friend") throw new DomainError("forbidden", "e.friendsOnly");
      const chatId = chatIdOf(u.id, to);
      const ref = replyToId ? db.messages.find((m) => m.id === replyToId && m.chatId === chatId && !m.deletedAt) : null;
      db.messages.push({
        id: uid(), chatId, participants: [u.id, to].sort() as [string, string], from: u.id, text: body, kind: "text", missionId: null,
        readBy: [u.id], createdAt: nowIso(), reactions: {}, replyTo: ref ? { id: ref.id, from: ref.from, text: ref.text.slice(0, 140) } : null,
        editedAt: null, deletedAt: null, via: isAdmin(u.role) ? "admin" : null,
      });
    });
  },

  async editMessage(messageId: string, text: string) {
    await ready();
    const body = text.trim();
    if (!body) throw new ValidationError({ text: "v.required" });
    if (body.length > 1000) throw new ValidationError({ text: "v.message" });
    await commit((db) => {
      const u = actor(db);
      const m = findMessage(db, messageId);
      if (!m || m.from !== u.id || m.kind !== "text" || m.deletedAt) throw new DomainError("forbidden", "e.forbidden");
      if (m.text === body) return;
      m.text = body;
      m.editedAt = nowIso();
    });
  },

  async deleteMessage(messageId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const m = findMessage(db, messageId);
      if (!m || m.from !== u.id || m.deletedAt) throw new DomainError("forbidden", "e.forbidden");
      m.text = "";
      m.reactions = {};
      m.deletedAt = nowIso();
    });
  },

  async reactToMessage(messageId: string, emoji: string) {
    await ready();
    if (!REACTIONS.includes(emoji)) return;
    await commit((db) => {
      const u = actor(db);
      const m = findMessage(db, messageId);
      const allowed = m && ("participants" in m ? m.participants.includes(u.id) : Boolean(db.groups.find((g) => g.id === m.groupId)?.members.includes(u.id)));
      if (!m || !allowed || m.deletedAt) throw new DomainError("forbidden", "e.forbidden");
      const r: Record<string, string[]> = {};
      let had = false;
      for (const [e, ids] of Object.entries(m.reactions ?? {})) {
        if (e === emoji && ids.includes(u.id)) had = true;
        const rest = ids.filter((x) => x !== u.id);
        if (rest.length) r[e] = rest;
      }
      // One reaction per person: choosing the same emoji again removes it.
      if (!had) r[emoji] = [...(r[emoji] ?? []), u.id];
      m.reactions = r;
    });
  },

  async markChatRead(id: string) {
    await ready();
    const db0 = getDB();
    const me = readSession(db0);
    if (!me) return;
    if (id.startsWith("g_")) {
      const gid = id.slice(2);
      if (!db0.groupMessages.some((m) => m.groupId === gid && !m.readBy.includes(me.id))) return;
      await commit((db) => { for (const m of db.groupMessages) if (m.groupId === gid && !m.readBy.includes(me.id)) m.readBy = [...m.readBy, me.id]; });
      return;
    }
    const chatId = chatIdOf(me.id, id);
    if (!db0.messages.some((m) => m.chatId === chatId && !m.readBy.includes(me.id))) return;
    await commit((db) => { for (const m of db.messages) if (m.chatId === chatId && !m.readBy.includes(me.id)) m.readBy = [...m.readBy, me.id]; });
  },

  /* ---- Fixcoin shop ---- */
  async shop() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    return {
      items: db.shopItems.filter((i) => i.active).sort((a, b) => a.price - b.price),
      balance: u?.points ?? 0,
      orders: u ? db.orders.filter((o) => o.userId === u.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [],
      canPublish: Boolean(u && isAdmin(u.role)),
    };
  },

  async buy(itemId: string) {
    await ready();
    let code = "";
    let orderId = "";
    let promo = false;
    await commit((db) => {
      const u = actor(db);
      if (u.role !== "volunteer") throw new DomainError("forbidden", "e.volunteersOnly");
      const item = db.shopItems.find((i) => i.id === itemId && i.active);
      if (!item) throw new DomainError("not_found", "e.notFound");
      if (item.stock <= 0) throw new DomainError("conflict", "e.outOfStock");
      if (u.points < item.price) throw new DomainError("conflict", "e.notEnoughCoins");
      u.points -= item.price;
      item.stock -= 1;
      code = makeOrderCode();
      orderId = uid();
      promo = item.delivery === "promo";
      const order: Order = { id: orderId, userId: u.id, itemId, itemTitle: item.title.en, price: item.price, code, status: "placed", createdAt: nowIso(), promoCode: null };
      db.orders.push(order);
      // Local mode: the promo code is issued at once. Firebase mode: by the shop-fulfil server function (or an admin).
      if (promo && !FIREBASE) issueCode(db, order);
      else notify(db, u.id, "reward", "n.order", { code }, "/app/shop?tab=orders");
      log(db, u, "shop.buy", "orders", code, item.id);
    });
    if (promo && FIREBASE) await callServer("shop-fulfil", { orderId }).catch(() => undefined);
    return { code, orderId, promo };
  },

  async publishCatalog() {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const have = new Set(db.shopItems.map((i) => i.id));
      db.shopItems.push(...sampleCatalog(nowIso()).filter((i) => !have.has(i.id)));
      log(db, a, "shop.publish_catalog", "shopItems", "sample");
    });
  },

  /* ---- home insights ---- */
  async myInsights() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const stats = statsFor(db, u);
    const achievements = computeAchievements(stats);
    const mine = db.submissions.filter((s) => s.userId === u.id);
    const parts = db.participants.filter((p) => p.userId === u.id && p.status === "accepted");
    const joined = new Set(parts.map((p) => p.missionId));
    const interests = new Set(u.interests);
    const open = db.missions.filter((m) => m.status === "published" && m.source !== "agent" && !joined.has(m.id) && m.participantsCount < m.capacity && Date.parse(m.deadline) > Date.now());
    const forYou = open.sort((a, b) => Number(interests.has(b.category)) - Number(interests.has(a.category)) || Date.parse(a.date) - Date.parse(b.date)).slice(0, 4);
    const active = parts.flatMap((p) => {
      const m = db.missions.find((x) => x.id === p.missionId && x.status !== "cancelled");
      const s = mine.find((x) => x.missionId === p.missionId);
      return m && (!s || s.verificationStatus === "pending" || s.verificationStatus === "needs_more_info") ? [{ mission: withOrg(db, m, u), participant: p, status: s?.verificationStatus ?? null }] : [];
    }).sort((a, b) => Date.parse(a.mission.date) - Date.parse(b.mission.date));
    const friendIds = friendIdsOf(db, u.id);
    const board = [u, ...db.users.filter((x) => friendIds.has(x.id) && x.status === "active")].sort((a, b) => b.xp - a.xp);
    const level = levelForXp(u.xp);
    return {
      achievements, unlocked: achievements.filter((a) => a.unlocked).length, next: nextAchievement(achievements),
      active, forYou: forYou.map((m) => withOrg(db, m, u)), level, nextCertificate: nextCertificateLevel(level),
      certificates: db.certificates.filter((c) => c.userId === u.id).length,
      pendingReviews: mine.filter((s) => s.verificationStatus === "pending").length,
      needsInfo: mine.filter((s) => s.verificationStatus === "needs_more_info").length,
      approved: stats.approvedMissions, today: dayKey(nowIso()),
      board: board.slice(0, 5).map((x) => ({ ...person(x), isMe: x.id === u.id })),
      pendingFriends: db.friendships.filter((f) => f.to === u.id && f.status === "pending").length,
      unreadMessages: unreadFor(db, u.id),
    };
  },

  /** Counters for the navigation badges. */
  async badges() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return { notifications: 0, messages: 0, friends: 0, reviews: 0, adminQueue: 0, aiAudit: 0, signals: 0 };
    const admin = isAdmin(u.role);
    return {
      notifications: db.notifications.filter((n) => n.userId === u.id && !n.read).length
        + announcementsFor(db, u).filter((a) => !u.announcementsSeenAt || Date.parse(a.createdAt) > Date.parse(u.announcementsSeenAt)).length,
      messages: unreadFor(db, u.id),
      friends: db.friendships.filter((f) => f.to === u.id && f.status === "pending").length,
      reviews: u.organizationId ? db.submissions.filter((s) => s.organizationId === u.organizationId && s.verificationStatus === "pending").length : 0,
      adminQueue: admin ? db.submissions.filter((s) => needsAdmin(s)).length : 0,
      aiAudit: admin ? db.submissions.filter((s) => s.aiReview?.audit === "pending").length : 0,
      signals: u.role === "volunteer" ? openSignalsFor(db, u, null).filter((x) => x.userId !== u.id && !x.responders.includes(u.id)).length : 0,
    };
  },

  /* ---- analytics ---- */
  async publicStats() {
    await ready();
    const db = getDB();
    const approved: { missionId: string }[] = FIREBASE && !cloud.currentUid() ? db.certificates : db.submissions.filter((s) => s.verificationStatus === "approved");
    let hours = 0;
    for (const s of approved) hours += (db.missions.find((x) => x.id === s.missionId)?.duration ?? 0) / 60;
    return {
      verifiedActions: approved.length,
      volunteers: db.users.filter((u) => u.role === "volunteer" && u.status === "active").length,
      hours: Math.round(hours),
      openMissions: db.missions.filter((m) => m.status === "published" && m.source !== "agent").length,
      organizations: db.organizations.filter((o) => o.verificationStatus === "approved").length,
      includesDemoData: db.missions.some((m) => m.isDemo),
    };
  },

  async orgAnalytics() {
    await ready();
    const db = getDB();
    const u = actor(db);
    if (!u.organizationId) throw new DomainError("forbidden", "e.registerOrgFirst");
    const missions = db.missions.filter((m) => m.organizationId === u.organizationId);
    const subs = db.submissions.filter((s) => s.organizationId === u.organizationId);
    const count = (st: string) => subs.filter((s) => s.verificationStatus === st).length;
    const approved = subs.filter((s) => s.verificationStatus === "approved");
    const hours = approved.reduce((a, s) => a + (missions.find((m) => m.id === s.missionId)?.duration ?? 0) / 60, 0);
    return {
      missions: missions.length, published: missions.filter((m) => m.status === "published").length,
      drafts: missions.filter((m) => m.status === "draft").length,
      volunteers: new Set(db.participants.filter((p) => missions.some((m) => m.id === p.missionId) && p.status === "accepted").map((p) => p.userId)).size,
      pending: count("pending"), approved: count("approved"), rejected: count("rejected"), needsInfo: count("needs_more_info"),
      hours: Math.round(hours * 10) / 10,
      upcoming: missions.filter((m) => m.status === "published" && Date.parse(m.date) > Date.now()).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 5),
    };
  },

  /* ---- admin ---- */
  async adminOverview() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return {
      users: db.users.length, volunteers: db.users.filter((u) => u.role === "volunteer").length,
      organizations: db.organizations.length, pendingOrganizations: db.organizations.filter((o) => o.verificationStatus === "pending").length,
      missions: db.missions.length, agentMissions: db.missions.filter((m) => m.source === "agent").length,
      pendingSubmissions: db.submissions.filter((s) => s.verificationStatus === "pending").length,
      flagged: db.submissions.filter((s) => s.fraudScore >= 0.5 && s.verificationStatus === "pending").length,
      volunteersByMonth: lastMonths(6).map((mk) => ({ month: mk, n: db.users.filter((x) => x.role === "volunteer" && monthKey(x.createdAt) === mk).length })),
      approvalsByMonth: lastMonths(6).map((mk) => ({ month: mk, n: db.submissions.filter((x) => x.verificationStatus === "approved" && x.reviewedAt && monthKey(x.reviewedAt) === mk).length })),
      orders: db.orders.length, shopItems: db.shopItems.length, recentActivity: db.audits.slice(0, 10),
      adminQueue: db.submissions.filter((s) => needsAdmin(s)).length, aiAudit: db.submissions.filter((s) => s.aiReview?.audit === "pending").length,
      orgPending: db.submissions.filter((s) => s.verificationStatus === "pending" && !isAgentOrg(s.organizationId)).length,
      ordersOpen: db.orders.filter((o) => o.status === "placed" || o.status === "processing").length,
      groups: db.groups.length, news: db.news.filter((n) => n.status === "published").length,
    };
  },
  async adminUsers(): Promise<UserProfile[]> {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return [...db.users].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },
  async setUserStatus(userId: string, status: "active" | "suspended", reason = "") {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const u = db.users.find((x) => x.id === userId);
      if (!u) throw new DomainError("not_found", "e.notFound");
      if (u.id === a.id) throw new DomainError("forbidden", "e.forbidden");
      if (isAdmin(u.role) && a.role !== "super_admin") throw new DomainError("forbidden", "e.forbidden");
      if (status === "suspended" && reason.trim().length < 5) throw new ValidationError({ reason: "e.reasonNeeded" });
      u.status = status;
      u.updatedAt = nowIso();
      log(db, a, `user.${status === "suspended" ? "suspend" : "reactivate"}`, "users", u.id, reason);
    });
  },
  async adminOrganizations() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return db.organizations.map((o) => ({ ...o, ownerName: db.users.find((u) => u.id === o.ownerId)?.fullName ?? "—" }))
      .sort((a, b) => Number(b.verificationStatus === "pending") - Number(a.verificationStatus === "pending") || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },
  async decideOrganization(orgId: string, decision: "approved" | "rejected", note = "") {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const o = orgOf(db, orgId);
      if (!o) throw new DomainError("not_found", "e.notFound");
      if (decision === "rejected" && note.trim().length < 5) throw new ValidationError({ note: "e.reasonNeeded" });
      o.verificationStatus = decision;
      o.verificationNote = note.trim();
      notify(db, o.ownerId, "organization", decision === "approved" ? "n.orgApproved" : "n.orgRejected", { name: o.name, note: note.trim() }, "/org");
      log(db, a, `organization.${decision}`, "organizations", orgId, note);
    });
  },
  /** Sends one user a notification and/or a chat message from the moderation team. */
  async adminContact(userId: string, input: { title: string; body: string; link?: string; asMessage: boolean; asNotification: boolean }) {
    await ready();
    const title = input.title.trim();
    const body = input.body.trim();
    const errors: Errors = {};
    if (input.asNotification && title.length < 2) errors.title = "v.required";
    if (body.length < 2) errors.body = "v.required";
    if (body.length > 1000) errors.body = "v.message";
    if (!input.asMessage && !input.asNotification) errors.channel = "ad.pickChannel";
    if (Object.keys(errors).length) throw new ValidationError(errors);
    await commit((db) => {
      const a = requireAdmin(db);
      const u = db.users.find((x) => x.id === userId);
      if (!u) throw new DomainError("not_found", "e.notFound");
      if (input.asNotification) db.notifications.unshift({ id: uid(), userId: u.id, type: "system", title, message: body, link: cleanLink(input.link), read: false, createdAt: nowIso() });
      if (input.asMessage && u.id !== a.id) {
        db.messages.push({
          id: uid(), chatId: chatIdOf(a.id, u.id), participants: [a.id, u.id].sort() as [string, string], from: a.id,
          text: input.asNotification ? `${title}\n\n${body}` : body, kind: "text", missionId: null, readBy: [a.id], createdAt: nowIso(),
          reactions: {}, replyTo: null, editedAt: null, deletedAt: null, via: "admin",
        });
      }
      log(db, a, "admin.contact", "users", u.id, title || body.slice(0, 60));
    });
  },

  /** One announcement document that every user (of the chosen audience) sees; no per-user copies. */
  async publishAnnouncement(input: { title: string; body: string; audience: Announcement["audience"]; link?: string }) {
    await ready();
    const title = input.title.trim();
    const body = input.body.trim();
    const errors: Errors = {};
    if (title.length < 2 || title.length > 120) errors.title = "v.required";
    if (body.length < 2) errors.body = "v.required";
    if (body.length > 2000) errors.body = "v.message";
    if (Object.keys(errors).length) throw new ValidationError(errors);
    await commit((db) => {
      const a = requireAdmin(db);
      db.announcements.unshift({ id: uid(), title, body, audience: input.audience, link: cleanLink(input.link), authorId: a.id, createdAt: nowIso() });
      log(db, a, "admin.announce", "announcements", input.audience, title);
    });
  },
  async adminAnnouncements() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return [...db.announcements].sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))
      .map((x) => ({ ...x, reach: db.users.filter((u) => u.status === "active" && (x.audience === "all" || u.role === x.audience)).length }));
  },
  async deleteAnnouncement(id: string) {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      db.announcements = db.announcements.filter((x) => x.id !== id);
      log(db, a, "admin.announce_delete", "announcements", id);
    });
  },

  /* ---- admin: shop ---- */
  async adminShop() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    const items = [...db.shopItems].sort((a, b) => Number(b.active) - Number(a.active) || a.price - b.price)
      .map((i) => ({ ...i, sold: db.orders.filter((o) => o.itemId === i.id && o.status !== "cancelled").length }));
    const orders = [...db.orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((o) => ({ ...o, buyer: db.users.find((u) => u.id === o.userId)?.fullName ?? "—", buyerEmail: db.users.find((u) => u.id === o.userId)?.email ?? "" }));
    return { items, orders };
  },
  async saveShopItem(input: ShopItemInput, existingId?: string) {
    await ready();
    const errors: Errors = {};
    const title = { uz: input.title.uz.trim(), ru: input.title.ru.trim(), en: input.title.en.trim() };
    const description = { uz: input.description.uz.trim(), ru: input.description.ru.trim(), en: input.description.en.trim() };
    if (title.uz.length < 2) errors.titleUz = "v.required";
    if (!Number.isInteger(input.price) || input.price < 1 || input.price > 100_000) errors.price = "sh.v.price";
    if (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > 100_000) errors.stock = "sh.v.stock";
    if (input.image && input.image.length > 300_000) errors.image = "sh.v.image";
    if (Object.keys(errors).length) throw new ValidationError(errors);
    // Untranslated fields fall back to Uzbek so the item never shows empty text.
    for (const l of ["ru", "en"] as const) { if (!title[l]) title[l] = title.uz; if (!description[l]) description[l] = description.uz; }
    let id = existingId ?? "";
    await commit((db) => {
      const a = requireAdmin(db);
      const delivery: "pickup" | "promo" = input.delivery === "promo" ? "promo" : "pickup";
      const data = { title, description, price: input.price, stock: input.stock, kind: input.kind, art: input.art, active: input.active, image: input.image || null, delivery };
      // A promo item's stock is the number of free codes; it changes only when codes are added or used.
      if (delivery === "promo") data.stock = existingId ? db.shopItems.find((i) => i.id === existingId)?.stock ?? 0 : 0;
      if (existingId) {
        const it = db.shopItems.find((i) => i.id === existingId);
        if (!it) throw new DomainError("not_found", "e.notFound");
        if (delivery === "promo" && it.delivery !== "promo") data.stock = db.promoCodes.filter((c) => c.itemId === it.id && !c.orderId).length;
        Object.assign(it, data);
      } else {
        id = uid();
        db.shopItems.push({ id, ...data, createdAt: nowIso() });
      }
      log(db, a, existingId ? "shop.item_update" : "shop.item_create", "shopItems", id, title.uz);
    });
    return { id };
  },
  async deleteShopItem(id: string) {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      // Items that were ordered stay (orders refer to them); they are hidden instead.
      if (db.orders.some((o) => o.itemId === id)) { const it = db.shopItems.find((i) => i.id === id); if (it) it.active = false; }
      else db.shopItems = db.shopItems.filter((i) => i.id !== id);
      log(db, a, "shop.item_delete", "shopItems", id);
    });
  },
  async setOrderStatus(orderId: string, status: Order["status"], note = "") {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const o = db.orders.find((x) => x.id === orderId);
      if (!o) throw new DomainError("not_found", "e.notFound");
      if (o.status === status) return;
      if (o.status === "cancelled" || o.status === "fulfilled") throw new DomainError("invalid_state", "sh.e.closed");
      if (status === "cancelled") {
        // Refund the Fixcoin and put the item back in stock.
        const buyer = db.users.find((u) => u.id === o.userId);
        if (buyer) buyer.points += o.price;
        const it = db.shopItems.find((i) => i.id === o.itemId);
        if (it) it.stock += 1;
      }
      o.status = status;
      o.note = note.trim() || null;
      o.updatedAt = nowIso();
      notify(db, o.userId, "reward", `n.order_${status}`, { code: o.code, coins: o.price, note: note.trim() ? ` — ${note.trim()}` : "" }, "/app/shop?tab=orders");
      log(db, a, `shop.order_${status}`, "orders", o.id, note);
    });
  },

  /* ───────────── v3: groups ───────────── */
  async myGroup() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const g = groupOf(db, u.id);
    return g ? groupView(db, g, u) : null;
  },

  async group(id: string) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const g = db.groups.find((x) => x.id === id);
    return g ? groupView(db, g, u) : null;
  },

  async createGroup(input: { name: string; description: string; color: string }) {
    await ready();
    const name = input.name.trim();
    const description = input.description.trim();
    const errors: Errors = {};
    if (name.length < 2 || name.length > 40) errors.name = "v.groupName";
    if (description.length > 200) errors.description = "v.tooLong";
    if (Object.keys(errors).length) throw new ValidationError(errors);
    let id = "";
    await commit((db) => {
      const u = actor(db);
      if (u.role !== "volunteer") throw new DomainError("forbidden", "e.volunteersOnly");
      if (groupOf(db, u.id)) throw new DomainError("conflict", "e.inGroup");
      if (!scopeKey(u, "district")) throw new DomainError("invalid_state", "e.areaFirst");
      id = uid();
      const t = nowIso();
      db.groups.push({
        id, name, description, color: (GROUP_COLORS as readonly string[]).includes(input.color) ? input.color : GROUP_COLORS[0], ownerId: u.id, members: [u.id],
        province: u.province, district: u.district ?? "", mahalla: u.mahalla ?? "", createdAt: t,
      });
      const code = makeGroupCode();
      db.groupCodes.push({ id: code, groupId: id, createdAt: t });
      db.groupMessages.push(systemMessage(id, u.id, "gm.created", { name: u.fullName }));
      log(db, u, "group.create", "groups", id, name);
    });
    return { id };
  },

  async updateGroup(id: string, input: { name: string; description: string; color: string }) {
    await ready();
    const name = input.name.trim();
    if (name.length < 2 || name.length > 40) throw new ValidationError({ name: "v.groupName" });
    await commit((db) => {
      const u = actor(db);
      const g = db.groups.find((x) => x.id === id);
      if (!g || g.ownerId !== u.id) throw new DomainError("forbidden", "e.groupOwner");
      g.name = name;
      g.description = input.description.trim().slice(0, 200);
      if ((GROUP_COLORS as readonly string[]).includes(input.color)) g.color = input.color;
    });
  },

  /** Joins a group with its invite code (typed, or read from the QR link /join/WFX-XXXXX). */
  async joinGroup(rawCode: string) {
    await ready();
    const code = normaliseGroupCode(rawCode);
    if (!/^WFX-[A-Z0-9]{5}$/.test(code)) throw new ValidationError({ code: "e.groupCode" });
    const found = FIREBASE ? await cloud.fetchDoc<{ id: string; groupId: string }>("groupCodes", code) : getDB().groupCodes.find((c) => c.id === code) ?? null;
    if (!found) throw new ValidationError({ code: "e.groupCode" });
    await commit((db) => {
      const u = actor(db);
      if (u.role !== "volunteer") throw new DomainError("forbidden", "e.volunteersOnly");
      const g = db.groups.find((x) => x.id === found.groupId);
      if (!g) throw new ValidationError({ code: "e.groupCode" });
      if (g.members.includes(u.id)) throw new DomainError("conflict", "e.alreadyMember");
      if (groupOf(db, u.id)) throw new DomainError("conflict", "e.inGroup");
      if (g.members.length >= GROUP_MAX_MEMBERS) throw new DomainError("conflict", "e.groupFull");
      const joinId = `${g.id}_${u.id}`;
      db.groupJoins = db.groupJoins.filter((j) => j.id !== joinId);
      db.groupJoins.push({ id: joinId, groupId: g.id, userId: u.id, code, createdAt: nowIso() });
      g.members = [...g.members, u.id];
      db.groupMessages.push(systemMessage(g.id, u.id, "gm.joined", { name: u.fullName }));
      notify(db, g.ownerId, "system", "n.groupJoined", { name: u.fullName, group: g.name }, `/app/groups/${g.id}`);
      log(db, u, "group.join", "groups", g.id);
    });
    return { id: found.groupId };
  },

  /** Looks up a group by code without joining (for the invite page). */
  async groupByCode(rawCode: string) {
    await ready();
    const code = normaliseGroupCode(rawCode);
    const found = FIREBASE ? await cloud.fetchDoc<{ id: string; groupId: string }>("groupCodes", code) : getDB().groupCodes.find((c) => c.id === code) ?? null;
    const g = found ? getDB().groups.find((x) => x.id === found.groupId) : null;
    return g ? { id: g.id, name: g.name, description: g.description, color: g.color, members: g.members.length, mahalla: g.mahalla, district: g.district, code } : null;
  },

  async leaveGroup() {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const g = groupOf(db, u.id);
      if (!g) throw new DomainError("not_found", "e.notFound");
      removeFromGroup(db, g, u.id);
      log(db, u, "group.leave", "groups", g.id);
    });
  },

  async removeGroupMember(userId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const g = groupOf(db, u.id);
      if (!g || g.ownerId !== u.id || userId === u.id) throw new DomainError("forbidden", "e.groupOwner");
      if (!g.members.includes(userId)) throw new DomainError("not_found", "e.notFound");
      removeFromGroup(db, g, userId, u.id);
      notify(db, userId, "system", "n.groupRemoved", { group: g.name }, "/app/chat?tab=groups");
    });
  },

  /** New invite code; the old one stops working. */
  async newGroupCode() {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const g = groupOf(db, u.id);
      if (!g || g.ownerId !== u.id) throw new DomainError("forbidden", "e.groupOwner");
      db.groupCodes = db.groupCodes.filter((c) => c.groupId !== g.id);
      db.groupCodes.push({ id: makeGroupCode(), groupId: g.id, createdAt: nowIso() });
    });
  },

  /* ───────────── v3.2: territory ───────────── */
  /**
   * Everything the Map shows: this month's areas (with who holds them and how they relate to me),
   * the missions I may see on the map, my standing, and the top of the season. My own area decays here
   * first (in demo mode every area does); the daily server job covers everyone else.
   */
  async territoryMap() {
    await ready();
    const db0 = getDB();
    const me0 = actor(db0);
    const decayIds = liveTerritories(db0).filter((t) => (!FIREBASE || t.userId === me0.id) && pendingDecay(db0, t)).map((t) => t.id);
    if (decayIds.length) {
      await commit((db) => { for (const t of db.territories) if (decayIds.includes(t.id)) applyDecay(db, t); });
    }
    const db = getDB();
    const u = actor(db);
    const side = sideOf(db, u.id);
    const myGroup = groupOf(db, u.id);
    const live = liveTerritories(db);
    const areas = live.map((t) => {
      const owner = db.users.find((x) => x.id === t.userId);
      const g = groupOf(db, t.userId);
      const relation: "mine" | "group" | "other" = t.userId === u.id ? "mine" : side.has(t.userId) ? "group" : "other";
      return {
        id: t.id, userId: t.userId, name: owner?.fullName ?? "—", avatar: owner?.avatar ?? null, mapColor: owner?.mapColor ?? null, areaM2: t.areaM2, shape: decodeShape(t.shape)!,
        center: t.center, relation, group: g ? { id: g.id, name: g.name, color: g.color } : null, updatedAt: t.updatedAt,
      };
    }).filter((a) => a.shape);
    const mineT = live.find((t) => t.userId === u.id) ?? null;
    const mineShape = decodeShape(mineT?.shape);
    const sideShapes = areas.filter((a) => a.relation !== "other").map((a) => a.shape);
    const now = Date.now();
    const missions = db.missions
      .filter((m) => m.status === "published" && m.source !== "agent" && m.coordinates && Date.parse(m.date) > now)
      .flatMap((m) => {
        const look = firstLook(db, m, u.id, live);
        if (look.hidden) return [];
        const inMine = sideShapes.some((s) => contains(s, m.coordinates));
        return [{ ...withOrg(db, m, u), inMyArea: inMine, firstLookUntil: look.until, joined: db.participants.some((p) => p.missionId === m.id && p.userId === u.id && p.status === "accepted") }];
      });
    const users = [...live].sort((a, b) => b.areaM2 - a.areaM2);
    const groupTotals = new Map<string, number>();
    for (const t of live) { const g = groupOf(db, t.userId); if (g) groupTotals.set(g.id, (groupTotals.get(g.id) ?? 0) + t.areaM2); }
    const groups = [...groupTotals.entries()].sort((a, b) => b[1] - a[1]);
    const since = now - 86_400_000;
    const capturesToday = db.territoryCaptures.filter((c) => c.userId === u.id && Date.parse(c.createdAt) > since).length;
    const ignored = mineT && mineShape ? ignoredMissions(db, mineT, mineShape) : [];
    return {
      season: seasonOf(), areas, missions, hot: hotSpot(db, live, now),
      me: {
        areaM2: mineT?.areaM2 ?? 0, lostM2: mineT?.lostM2 ?? 0, captures: mineT?.captures ?? 0,
        rank: mineT && mineT.areaM2 > 0 ? users.findIndex((t) => t.userId === u.id) + 1 : null, of: users.length,
        capturesLeft: Math.max(0, TERRITORY.capturesPerDay - capturesToday),
        ignored: ignored.map((m) => ({ id: m.id, title: m.title, dueAt: new Date(Date.parse(m.publishedAt ?? m.createdAt) + TERRITORY.graceHours * 3_600_000).toISOString() })),
        group: myGroup ? { id: myGroup.id, name: myGroup.name, color: myGroup.color, areaM2: groupTotals.get(myGroup.id) ?? 0, rank: groups.findIndex(([id]) => id === myGroup.id) + 1 || null } : null,
        canCapture: u.role === "volunteer",
      },
      board: {
        people: users.slice(0, 5).map((t) => { const x = db.users.find((y) => y.id === t.userId); return { id: t.userId, name: x?.fullName ?? "—", avatar: x?.avatar ?? null, mapColor: x?.mapColor ?? null, areaM2: t.areaM2, me: t.userId === u.id }; }),
        groups: groups.slice(0, 5).map(([id, m2]) => { const g = db.groups.find((x) => x.id === id)!; return { id, name: g.name, color: g.color, areaM2: m2, mine: id === myGroup?.id }; }),
      },
    };
  },

  /** v4: my captures this season in order, for the season replay. */
  async seasonTimeline() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const season = seasonOf();
    const steps = db.territoryCaptures.filter((c) => c.userId === u.id && c.season === season).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ at: c.createdAt, areaM2: c.areaM2, gainedM2: c.gainedM2, loop: decodeShape(c.loop ?? null) }));
    const mine = liveTerritories(db).find((t) => t.userId === u.id);
    return { season, steps, final: decodeShape(mine?.shape ?? null), areaM2: mine?.areaM2 ?? 0 };
  },

  /** v4: the newest verified before/after results I may see. */
  async recentResults(limit = 8) {
    await ready();
    const db = getDB();
    const u = actor(db);
    return db.submissions.filter((x) => x.verificationStatus === "approved" && x.images.length >= 2)
      .sort((a, b) => (b.reviewedAt ?? b.timestamp).localeCompare(a.reviewedAt ?? a.timestamp))
      .flatMap((x) => { const r = resultOf(db, u, x); return r ? [r] : []; }).slice(0, limit);
  },

  /** v4: the whole platform this week: verified missions, people, hours and the biggest results. */
  async communityPulse() {
    await ready();
    const db = getDB();
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const subs = db.submissions.filter((x) => x.verificationStatus === "approved" && (x.reviewedAt ?? x.timestamp) >= since);
    const impact: Record<string, number> = {};
    let hours = 0;
    for (const x of subs) {
      for (const [k, v] of Object.entries(impactOf(db, x))) impact[k] = (impact[k] ?? 0) + v;
      hours += x.grant?.hours ?? (db.missions.find((m) => m.id === x.missionId)?.duration ?? 0) / 60;
    }
    return {
      missions: subs.length, people: new Set(subs.map((x) => x.userId)).size, hours: Math.round(hours),
      impact: Object.entries(impact).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, amount]) => ({ label, amount: Math.round(amount * 10) / 10 })),
    };
  },

  /** v4: numbers for my shareable result card. */
  async shareStats() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const mine = liveTerritories(db).find((t) => t.userId === u.id);
    const approved = db.submissions.filter((x) => x.userId === u.id && x.verificationStatus === "approved").length;
    return {
      name: u.fullName, avatar: u.avatar, mapColor: u.mapColor ?? null, id: u.id, level: levelForXp(u.xp), xp: u.xp,
      areaM2: mine?.areaM2 ?? 0, missions: approved, hours: Math.round(u.totalVolunteerHours * 10) / 10,
      impact: Object.entries(u.impact).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([label, amount]) => ({ label, amount })),
    };
  },

  /** Light summary for Home: my area and rank this month. */
  async myTerritory() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const live = liveTerritories(db).sort((a, b) => b.areaM2 - a.areaM2);
    const i = live.findIndex((t) => t.userId === u.id);
    return { areaM2: i >= 0 ? live[i].areaM2 : 0, rank: i >= 0 ? i + 1 : null, of: live.length };
  },

  /**
   * Turns a finished walk into area. Returns what was gained and from whom it was taken,
   * or why the walk does not count (without throwing, so the walker can carry on).
   */
  async captureTerritory(trace: TracePoint[], opts: { forceClose?: boolean } = {}): Promise<
    | { ok: true; gainedM2: number; areaM2: number; takenFrom: { name: string; areaM2: number }[]; missionsInside: number; shape: Shape }
    | { ok: false; error: CaptureError | "limit"; toStartM?: number }
  > {
    await ready();
    const res = traceToShape(trace, opts);
    if ("error" in res) return { ok: false, error: res.error, toStartM: res.toStartM };
    const stats = cleanTrace(trace);
    let out: { gainedM2: number; areaM2: number; takenFrom: { name: string; areaM2: number }[]; missionsInside: number } | null = null;
    try {
      await commit((db) => {
        const u = actor(db);
        if (u.role !== "volunteer") throw new DomainError("forbidden", "e.volunteersOnly");
        const since = Date.now() - 86_400_000;
        if (db.territoryCaptures.filter((c) => c.userId === u.id && Date.parse(c.createdAt) > since).length >= TERRITORY.capturesPerDay) throw new DomainError("conflict", "limit");
        const season = seasonOf();
        const g = groupOf(db, u.id);
        const side = sideOf(db, u.id);
        const box = bboxOf(res.shape);
        const takenFrom: { userId: string; areaM2: number }[] = [];
        for (const t of liveTerritories(db)) {
          if (side.has(t.userId) || !boxesMeet(t.bbox, box)) continue;
          const s = decodeShape(t.shape);
          if (!s || overlapM2(s, res.shape) < 50) continue;
          const left = subtractShape(s, res.shape);
          const area = shapeArea(left);
          const lost = t.areaM2 - area;
          if (lost <= 0) continue;
          setShape(t, left);
          t.lostM2 += lost;
          takenFrom.push({ userId: t.userId, areaM2: lost });
          const recent = t.takenNotice && t.takenNotice.by === u.id && Date.now() - Date.parse(t.takenNotice.at) < 12 * 3_600_000;
          if (lost >= TERRITORY.notifyLossM2 && !recent) {
            t.takenNotice = { by: u.id, at: nowIso() };
            notify(db, t.userId, "system", "n.territoryTaken", { name: u.fullName, area: fmtArea(lost), left: fmtArea(area) }, "/app/map");
          }
        }
        const id = `${season}_${u.id}`;
        let mine = db.territories.find((t) => t.id === id);
        const before = mine?.areaM2 ?? 0;
        const merged = unionShapes(decodeShape(mine?.shape), res.shape)!;
        if (!mine) {
          mine = { id, userId: u.id, groupId: g?.id ?? null, season, shape: "", areaM2: 0, center: null, bbox: [], captures: 0, lostM2: 0, createdAt: nowIso(), updatedAt: nowIso(), decayCheckedAt: nowIso(), takenNotice: null };
          db.territories.push(mine);
        }
        setShape(mine, merged);
        mine.captures += 1;
        mine.groupId = g?.id ?? null;
        const gained = Math.max(0, mine.areaM2 - before);
        db.territoryCaptures.push({
          id: uid(), userId: u.id, groupId: g?.id ?? null, season, areaM2: res.areaM2, gainedM2: gained, distanceM: stats.distanceM, durationS: stats.durationS,
          maxSpeedKmh: stats.maxSpeedKmh, droppedFast: stats.droppedFast, takenFrom, createdAt: nowIso(), loop: encodeShape(res.shape),
        });
        const now = Date.now();
        const inside = db.missions.filter((m) => m.status === "published" && m.source !== "agent" && Date.parse(m.date) > now && contains(res.shape, m.coordinates)).length;
        if (g) db.groupMessages.push(systemMessage(g.id, u.id, "gm.territory", { name: u.fullName, area: fmtArea(gained) }));
        log(db, u, "territory.capture", "territories", id, String(gained));
        out = {
          gainedM2: gained, areaM2: mine.areaM2, missionsInside: inside,
          takenFrom: takenFrom.map((x) => ({ name: db.users.find((y) => y.id === x.userId)?.fullName ?? "—", areaM2: x.areaM2 })),
        };
      });
    } catch (e) {
      if (e instanceof DomainError && e.message === "limit") return { ok: false, error: "limit" };
      throw e;
    }
    return { ok: true, ...out!, shape: res.shape };
  },

  /* ───────────── v3.2: asking to join a group ───────────── */
  /** A public view of a group for someone who is not in it (from the map, the rating or a shared link). */
  async groupPublic(id: string) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const g = db.groups.find((x) => x.id === id);
    if (!g) return null;
    const req = db.groupRequests.find((r) => r.id === `${g.id}_${u.id}`) ?? null;
    const t = liveTerritories(db).filter((x) => g.members.includes(x.userId)).reduce((a, x) => a + x.areaM2, 0);
    return {
      id: g.id, name: g.name, description: g.description, color: g.color, members: g.members.length, full: g.members.length >= GROUP_MAX_MEMBERS,
      place: [g.mahalla, g.district].filter(Boolean).join(", "), areaM2: t, isMember: g.members.includes(u.id), myGroup: groupOf(db, u.id)?.name ?? null,
      faces: g.members.slice(0, 5).flatMap((m) => { const x = db.users.find((y) => y.id === m); return x ? [person(x)] : []; }),
      request: req && req.status !== "cancelled" ? { status: req.status, createdAt: req.createdAt } : null,
    };
  },

  async requestToJoin(groupId: string, note = "") {
    await ready();
    await commit((db) => {
      const u = actor(db);
      if (u.role !== "volunteer") throw new DomainError("forbidden", "e.volunteersOnly");
      const g = db.groups.find((x) => x.id === groupId);
      if (!g) throw new DomainError("not_found", "e.notFound");
      if (g.members.includes(u.id)) throw new DomainError("conflict", "e.alreadyMember");
      if (g.members.length >= GROUP_MAX_MEMBERS) throw new DomainError("conflict", "e.groupFull");
      const id = `${g.id}_${u.id}`;
      const prev = db.groupRequests.find((r) => r.id === id);
      if (prev?.status === "pending") return;
      const req: GroupRequest = { id, groupId: g.id, userId: u.id, status: "pending", note: note.trim().slice(0, 200), createdAt: nowIso(), decidedBy: null, decidedAt: null };
      db.groupRequests = [...db.groupRequests.filter((r) => r.id !== id), req];
      for (const m of g.members) notify(db, m, "system", "n.groupRequest", { name: u.fullName, group: g.name }, `/app/chat/g_${g.id}`);
      log(db, u, "group.request", "groupRequests", id);
    });
  },

  async cancelJoinRequest(groupId: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const r = db.groupRequests.find((x) => x.id === `${groupId}_${u.id}`);
      if (r && r.status === "pending") r.status = "cancelled";
    });
  },

  /** Requests waiting for my group (members only). */
  async groupRequestsFor(groupId: string) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const g = db.groups.find((x) => x.id === groupId);
    if (!g || !g.members.includes(u.id)) return [];
    return db.groupRequests.filter((r) => r.groupId === g.id && r.status === "pending").flatMap((r) => {
      const x = db.users.find((y) => y.id === r.userId);
      if (!x) return [];
      const other = groupOf(db, x.id);
      return [{ id: r.id, person: person(x), note: r.note, createdAt: r.createdAt, inGroup: other?.name ?? null, level: x.level }];
    }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  /** A member lets someone in (they join on their next visit, or right away in demo mode) or says no. */
  async decideJoinRequest(requestId: string, decision: "approved" | "declined") {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const r = db.groupRequests.find((x) => x.id === requestId);
      if (!r || r.status !== "pending") throw new DomainError("invalid_state", "e.requestGone");
      const g = db.groups.find((x) => x.id === r.groupId);
      if (!g || !g.members.includes(u.id)) throw new DomainError("forbidden", "e.forbidden");
      if (decision === "approved" && g.members.length >= GROUP_MAX_MEMBERS) throw new DomainError("conflict", "e.groupFull");
      r.status = decision;
      r.decidedBy = u.id;
      r.decidedAt = nowIso();
      const who = db.users.find((x) => x.id === r.userId)?.fullName ?? "—";
      db.groupMessages.push(systemMessage(g.id, u.id, decision === "approved" ? "gm.requestApproved" : "gm.requestDeclined", { name: u.fullName, who }));
      notify(db, r.userId, "system", decision === "approved" ? "n.requestApproved" : "n.requestDeclined", { group: g.name }, decision === "approved" ? `/app/groups/${g.id}` : "/app/groups");
    });
  },

  /** Joins every group that has let me in (called on load). Leaves a request open if I am already in a group. */
  async claimApprovedJoins() {
    await ready();
    const db0 = getDB();
    const me = readSession(db0);
    if (!me || me.role !== "volunteer" || groupOf(db0, me.id)) return null;
    const r = db0.groupRequests.find((x) => x.userId === me.id && x.status === "approved");
    if (!r) return null;
    const g0 = db0.groups.find((x) => x.id === r.groupId);
    await commit((db) => {
      const u = actor(db);
      const req = db.groupRequests.find((x) => x.id === r.id)!;
      const g = db.groups.find((x) => x.id === r.groupId);
      if (!g || g.members.length >= GROUP_MAX_MEMBERS) { req.status = "cancelled"; return; }
      const joinId = `${g.id}_${u.id}`;
      db.groupJoins = db.groupJoins.filter((j) => j.id !== joinId);
      db.groupJoins.push({ id: joinId, groupId: g.id, userId: u.id, code: "", requestId: req.id, createdAt: nowIso() });
      g.members = [...g.members, u.id];
      req.status = "joined";
      db.groupMessages.push(systemMessage(g.id, u.id, "gm.joined", { name: u.fullName }));
      log(db, u, "group.join", "groups", g.id, "request");
    });
    return g0 ? { id: g0.id, name: g0.name } : null;
  },

  /* ───────────── v3.1: group invites sent as chat messages ───────────── */
  /** Friends of the signed-in member with what an invite to my group would do for each. */
  async groupInviteCandidates() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const g = groupOf(db, u.id);
    if (!g) return null;
    const friends = [...friendIdsOf(db, u.id)].flatMap((id) => {
      const x = db.users.find((y) => y.id === id && y.status === "active" && y.role === "volunteer");
      if (!x) return [];
      const other = groupOf(db, x.id);
      const state: "member" | "other_group" | "invited" | "free" = other?.id === g.id ? "member" : pendingGroupInvite(db, g.id, x.id) ? "invited" : other ? "other_group" : "free";
      return [{ person: person(x), state, otherGroup: other && other.id !== g.id ? other.name : null }];
    });
    const order = { free: 0, other_group: 1, invited: 2, member: 3 } as const;
    return {
      group: { id: g.id, name: g.name, color: g.color, members: g.members.length, max: GROUP_MAX_MEMBERS },
      friends: friends.sort((a, b) => order[a.state] - order[b.state] || a.person.fullName.localeCompare(b.person.fullName)),
    };
  },

  /** Sends each friend a chat message with a one-tap invite to my group. */
  async inviteToGroup(friendIds: string[]) {
    await ready();
    let sent = 0;
    await commit((db) => {
      const u = actor(db);
      const g = groupOf(db, u.id);
      if (!g) throw new DomainError("not_found", "e.notFound");
      const code = db.groupCodes.find((c) => c.groupId === g.id);
      if (!code) throw new DomainError("invalid_state", "e.inviteExpired");
      let room = GROUP_MAX_MEMBERS - g.members.length;
      for (const fid of new Set(friendIds)) {
        if (fid === u.id || relationOf(db, u.id, fid) !== "friend") continue;
        if (g.members.includes(fid) || pendingGroupInvite(db, g.id, fid)) continue;
        if (room <= 0) throw new DomainError("conflict", "e.groupFull");
        room -= 1;
        db.messages.push({
          id: uid(), chatId: chatIdOf(u.id, fid), participants: [u.id, fid].sort() as [string, string], from: u.id, text: g.name, kind: "group_invite",
          missionId: null, readBy: [u.id], createdAt: nowIso(), reactions: {}, replyTo: null, editedAt: null, deletedAt: null, via: null,
          group: { id: g.id, name: g.name, color: g.color, code: code.id }, inviteStatus: null,
        });
        notify(db, fid, "system", "n.groupInvite", { name: u.fullName, group: g.name }, `/app/chat/${u.id}`);
        sent += 1;
      }
      if (sent) log(db, u, "group.invite", "groups", g.id, String(sent));
    });
    return { sent };
  },

  /** Group invites waiting for my answer (shown on the Groups page). */
  async myGroupInvites() {
    await ready();
    const db = getDB();
    const u = actor(db);
    return db.messages
      .filter((m) => m.kind === "group_invite" && m.participants.includes(u.id) && m.from !== u.id && !m.inviteStatus && !m.deletedAt && m.group)
      .flatMap((m) => {
        const g = db.groups.find((x) => x.id === m.group!.id);
        const from = db.users.find((x) => x.id === m.from);
        if (!g || !from || g.members.includes(u.id)) return [];
        return [{ messageId: m.id, from: person(from), group: { id: g.id, name: g.name, color: g.color, members: g.members.length, description: g.description }, createdAt: m.createdAt }];
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  /** Accepts (optionally leaving my current group first) or declines a group invite from a chat. */
  async respondGroupInvite(messageId: string, decision: "accepted" | "declined", opts: { switchGroup?: boolean } = {}) {
    await ready();
    const db0 = getDB();
    const me = actor(db0);
    const msg = db0.messages.find((x) => x.id === messageId && x.kind === "group_invite" && x.participants.includes(me.id) && x.from !== me.id);
    if (!msg?.group) throw new DomainError("not_found", "e.notFound");
    const target = msg.group;
    if (decision === "accepted") {
      const current = groupOf(db0, me.id);
      if (current && current.id !== target.id) {
        if (!opts.switchGroup) throw new DomainError("conflict", "e.inGroup");
        await api.leaveGroup();
      }
      if (!current || current.id !== target.id) {
        try { await api.joinGroup(target.code); } catch (e) {
          if (e instanceof ValidationError) throw new DomainError("invalid_state", "e.inviteExpired");
          if (!(e instanceof DomainError && e.message === "e.alreadyMember")) throw e;
        }
      }
    }
    await commit((db) => {
      const u = actor(db);
      const m = db.messages.find((x) => x.id === messageId);
      if (!m) return;
      m.inviteStatus = decision;
      if (!m.readBy.includes(u.id)) m.readBy = [...m.readBy, u.id];
      if (decision === "declined") notify(db, m.from, "system", "n.groupInviteDeclined", { name: u.fullName, group: target.name }, `/app/chat/${u.id}`);
    });
    return { groupId: target.id };
  },

  /* ───────────── v3: leaderboards ───────────── */
  async leaderboard(opts: { entity: "volunteers" | "groups"; scope: Scope; period: "month" | "all" }) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const now = nowIso();
    const my = groupOf(db, u.id);
    const res = opts.entity === "volunteers"
      ? volunteerBoard({ viewer: u, users: db.users, submissions: db.submissions, missions: db.missions, scope: opts.scope, period: opts.period, now })
      : groupBoard({ viewerPlace: my ?? u, myGroupId: my?.id ?? null, groups: db.groups, submissions: db.submissions, missions: db.missions, scope: opts.scope, period: opts.period, now });
    const myIndex = res.rows.findIndex((r) => r.isMe);
    const place = my && opts.entity === "groups" ? my : u;
    const area = { country: place === u ? u.country || "Uzbekistan" : "Uzbekistan", province: place.province, district: place.district ?? "", mahalla: place.mahalla ?? "" };
    return { ...res, rows: res.rows.slice(0, 100), myRank: myIndex >= 0 ? myIndex + 1 : null, total: res.rows.length, area, hasGroup: Boolean(my) };
  },

  /* ───────────── v3: help signals ───────────── */
  async sendHelpSignal(input: { title: string; note: string; lat: number; lng: number; place: string; missionId?: string | null }) {
    await ready();
    const title = input.title.trim();
    const errors: Errors = {};
    if (title.length < 3 || title.length > 80) errors.title = "v.signalTitle";
    if (input.note.trim().length > 300) errors.note = "v.tooLong";
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) errors.location = "e.gpsUnavailable";
    if (Object.keys(errors).length) throw new ValidationError(errors);
    let id = "";
    await commit((db) => {
      const u = actor(db);
      if (u.role !== "volunteer") throw new DomainError("forbidden", "e.volunteersOnly");
      const since = Date.now() - 86_400_000;
      if (db.helpSignals.filter((x) => x.userId === u.id && Date.parse(x.createdAt) > since).length >= SIGNALS_PER_DAY) throw new DomainError("conflict", "e.signalLimit");
      const g = groupOf(db, u.id);
      id = uid();
      const t = nowIso();
      const sig: HelpSignal = {
        id, userId: u.id, groupId: g?.id ?? null, missionId: input.missionId ?? null, title, note: input.note.trim(), location: { lat: input.lat, lng: input.lng },
        place: input.place.trim().slice(0, 120), radiusKm: SIGNAL_RADIUS_KM, province: u.province, district: u.district ?? "", city: u.city, responders: [],
        status: "open", createdAt: t, expiresAt: new Date(Date.now() + SIGNAL_HOURS * 3_600_000).toISOString(),
      };
      db.helpSignals.unshift(sig);
      if (g) db.groupMessages.push({ id: uid(), groupId: g.id, from: u.id, text: title, kind: "signal", signalId: id, readBy: [u.id], createdAt: t, reactions: {}, replyTo: null, editedAt: null, deletedAt: null });
      for (const to of signalAudience(u, db.users, g).slice(0, 200)) notify(db, to, "mission", "n.signal", { name: u.fullName, title }, `/app/signals/${id}`);
      log(db, u, "signal.create", "helpSignals", id, title);
    });
    return { id };
  },

  /** Open signals for the volunteer: their own, their group's, their area's, and any within 2 km of `near`. */
  async helpSignals(near: { lat: number; lng: number } | null = null) {
    await ready();
    const db = getDB();
    const u = actor(db);
    return openSignalsFor(db, u, near).map((x) => signalView(db, x, u, near));
  },

  async helpSignal(id: string) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const x = db.helpSignals.find((s) => s.id === id);
    return x ? signalView(db, x, u, null) : null;
  },

  async respondSignal(id: string, going: boolean) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const x = db.helpSignals.find((s) => s.id === id);
      if (!x || x.status !== "open" || Date.parse(x.expiresAt) < Date.now()) throw new DomainError("invalid_state", "e.signalClosed");
      if (x.userId === u.id) throw new DomainError("forbidden", "e.forbidden");
      const had = x.responders.includes(u.id);
      if (going && !had) {
        x.responders = [...x.responders, u.id];
        notify(db, x.userId, "mission", "n.signalGoing", { name: u.fullName, title: x.title }, `/app/signals/${x.id}`);
      } else if (!going && had) x.responders = x.responders.filter((r) => r !== u.id);
    });
  },

  async closeSignal(id: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const x = db.helpSignals.find((s) => s.id === id);
      if (!x || (x.userId !== u.id && !isAdmin(u.role))) throw new DomainError("forbidden", "e.forbidden");
      x.status = "closed";
    });
  },

  /* ───────────── v3: personal report for the home page ───────────── */
  async myReport() {
    await ready();
    const db = getDB();
    const u = actor(db);
    const now = nowIso();
    const missions = new Map(db.missions.map((m) => [m.id, m]));
    const approved = db.submissions.filter((s) => s.userId === u.id && s.verificationStatus === "approved" && s.reviewedAt);
    const months = lastMonths(6);
    const byMonth = months.map((mk) => {
      const list = approved.filter((s) => monthKey(s.reviewedAt!) === mk);
      return {
        month: mk, xp: list.reduce((a, s) => a + earnedXp(s, missions.get(s.missionId)), 0), missions: list.length,
        hours: Math.round(list.reduce((a, s) => a + (s.grant?.hours ?? (missions.get(s.missionId)?.duration ?? 0) / 60), 0) * 10) / 10,
      };
    });
    const cats: Partial<Record<Category, { missions: number; hours: number }>> = {};
    for (const s of approved) {
      const m = missions.get(s.missionId);
      if (!m) continue;
      const c = (cats[m.category] ??= { missions: 0, hours: 0 });
      c.missions += 1;
      c.hours = Math.round((c.hours + m.duration / 60) * 10) / 10;
    }
    const ranks = SCOPES.map((scope) => {
      const b = volunteerBoard({ viewer: u, users: db.users, submissions: db.submissions, missions: db.missions, scope, period: "all", now });
      const i = b.rows.findIndex((r) => r.isMe);
      return { scope, rank: i >= 0 ? i + 1 : null, total: b.rows.length, missing: b.missing };
    });
    const level = levelForXp(u.xp);
    const rank = rankFor(level);
    const nextRank = RANKS.find((r) => r.from > level) ?? null;
    const g = groupOf(db, u.id);
    const gxAll = g ? groupXp(db.submissions, db.missions).get(g.id) ?? 0 : 0;
    const myInGroup = g ? approved.filter((s) => s.groupId === g.id).reduce((a, s) => a + earnedXp(s, missions.get(s.missionId)), 0) : 0;
    const cur = byMonth[byMonth.length - 1];
    const prev = byMonth[byMonth.length - 2];
    return {
      byMonth, thisMonth: cur, lastMonth: prev, categories: cats, impact: u.impact, totalImpact: u.totalImpact, hours: u.totalVolunteerHours,
      missions: approved.length, ranks, rank, nextRank: nextRank ? { id: nextRank.id, from: nextRank.from, xpNeeded: Math.max(0, xpForLevel(nextRank.from) - u.xp) } : null,
      group: g ? { id: g.id, name: g.name, color: g.color, xp: gxAll, level: groupLevel(gxAll), myShare: gxAll ? Math.round((myInGroup / gxAll) * 100) : 0, members: g.members.length } : null,
      streak: u.streak, coins: u.points,
    };
  },

  /* ───────────── v3: news ───────────── */
  async newsFeed(limit = 6) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    const now = Date.now();
    return db.news
      .filter((n) => n.status === "published" && Date.parse(n.publishAt) <= now && (n.audience === "all" || (u && (n.audience === u.role || isAdmin(u.role)))))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.publishAt) - Date.parse(a.publishAt))
      .slice(0, limit);
  },
  async newsPost(id: string) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    const n = db.news.find((x) => x.id === id);
    if (!n) return null;
    if (n.status !== "published" || Date.parse(n.publishAt) > Date.now()) return u && isAdmin(u.role) ? n : null;
    return n;
  },
  async adminNews() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return [...db.news].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  },
  async saveNews(input: NewsInput, existingId?: string) {
    await ready();
    const errors: Errors = {};
    const title = input.title.trim();
    const summary = input.summary.trim();
    const body = input.body.trim();
    if (title.length < 3 || title.length > 120) errors.title = "v.newsTitle";
    if (summary.length > 240) errors.summary = "v.tooLong";
    if (body.length < 10) errors.body = "v.newsBody";
    if (body.length > 8000) errors.body = "v.tooLong";
    if (input.cover && input.cover.length > 300_000) errors.cover = "sh.v.image";
    const at = input.publishAt ? Date.parse(input.publishAt) : Date.now();
    if (Number.isNaN(at)) errors.publishAt = "v.date";
    if (Object.keys(errors).length) throw new ValidationError(errors);
    let id = existingId ?? "";
    await commit((db) => {
      const a = requireAdmin(db);
      const t = nowIso();
      const data = {
        title, summary: summary || body.slice(0, 200), body, cover: input.cover || null, category: input.category, audience: input.audience, status: input.status,
        pinned: input.pinned, publishAt: new Date(at).toISOString(), link: cleanLink(input.link), updatedAt: t,
      };
      if (existingId) {
        const n = db.news.find((x) => x.id === existingId);
        if (!n) throw new DomainError("not_found", "e.notFound");
        Object.assign(n, data);
      } else {
        id = uid();
        db.news.unshift({ id, ...data, authorId: a.id, createdAt: t });
      }
      log(db, a, existingId ? "news.update" : "news.create", "news", id, `${input.status}: ${title}`);
    });
    return { id };
  },
  async deleteNews(id: string) {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      db.news = db.news.filter((x) => x.id !== id);
      log(db, a, "news.delete", "news", id);
    });
  },
  async setNewsFlags(id: string, flags: { status?: NewsPost["status"]; pinned?: boolean }) {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const n = db.news.find((x) => x.id === id);
      if (!n) throw new DomainError("not_found", "e.notFound");
      if (flags.status) { n.status = flags.status; if (flags.status === "published" && Date.parse(n.publishAt) > Date.now()) n.publishAt = nowIso(); }
      if (flags.pinned !== undefined) n.pinned = flags.pinned;
      n.updatedAt = nowIso();
      log(db, a, "news.flags", "news", id, JSON.stringify(flags));
    });
  },

  /* ───────────── v3: promo codes ───────────── */
  async adminPromoCodes(itemId: string) {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return db.promoCodes.filter((c) => c.itemId === itemId).sort((a, b) => Number(Boolean(a.orderId)) - Number(Boolean(b.orderId)) || a.code.localeCompare(b.code))
      .map((c) => ({ ...c, buyer: c.userId ? db.users.find((u) => u.id === c.userId)?.fullName ?? "—" : null }));
  },
  /** Adds codes (one per line); duplicates are skipped. The item's stock follows the free codes. */
  async addPromoCodes(itemId: string, text: string) {
    await ready();
    const codes = [...new Set(text.split(/[\s,;]+/).map((c) => c.trim()).filter((c) => c.length >= 4 && c.length <= 64))];
    if (!codes.length) throw new ValidationError({ codes: "sh.v.codes" });
    if (codes.length > 400) throw new ValidationError({ codes: "sh.v.codesMax" });
    let added = 0;
    await commit((db) => {
      const a = requireAdmin(db);
      const item = db.shopItems.find((i) => i.id === itemId);
      if (!item) throw new DomainError("not_found", "e.notFound");
      const have = new Set(db.promoCodes.filter((c) => c.itemId === itemId).map((c) => c.code));
      for (const code of codes) {
        if (have.has(code)) continue;
        db.promoCodes.push({ id: uid(), itemId, code, orderId: null, userId: null, createdAt: nowIso(), issuedAt: null });
        added++;
      }
      item.delivery = "promo";
      item.stock += added;
      log(db, a, "shop.promo_add", "shopItems", itemId, String(added));
    });
    // Orders that waited for codes get them now.
    await api.issueWaitingCodes(itemId).catch(() => undefined);
    return { added, skipped: codes.length - added };
  },
  async deletePromoCode(id: string) {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const c = db.promoCodes.find((x) => x.id === id);
      if (!c) throw new DomainError("not_found", "e.notFound");
      if (c.orderId) throw new DomainError("invalid_state", "sh.e.codeUsed");
      db.promoCodes = db.promoCodes.filter((x) => x.id !== id);
      const item = db.shopItems.find((i) => i.id === c.itemId);
      if (item) item.stock = Math.max(0, item.stock - 1);
      log(db, a, "shop.promo_delete", "shopItems", c.itemId);
    });
  },
  /** Gives free codes to paid orders that are still waiting (admin). */
  async issueWaitingCodes(itemId?: string) {
    await ready();
    let issued = 0;
    await commit((db) => {
      requireAdmin(db);
      for (const o of db.orders) {
        if (o.status !== "placed" && o.status !== "processing") continue;
        if (itemId && o.itemId !== itemId) continue;
        const item = db.shopItems.find((i) => i.id === o.itemId);
        if (item?.delivery !== "promo" || o.promoCode) continue;
        if (issueCode(db, o)) issued++;
      }
    });
    return { issued };
  },
  /** The promo code of one of my orders (also from the promoCodes collection, for orders delivered by an admin). */
  async myPromoCodes() {
    await ready();
    const db = getDB();
    const u = actor(db);
    return db.orders.filter((o) => o.userId === u.id && (o.promoCode || db.promoCodes.some((c) => c.orderId === o.id)))
      .map((o) => ({ orderId: o.id, title: o.itemTitle, itemId: o.itemId, code: o.promoCode ?? db.promoCodes.find((c) => c.orderId === o.id)!.code, at: o.updatedAt ?? o.createdAt }));
  },

  /* ───────────── v3: AI review of agent missions ───────────── */
  /** Runs the AI reviewer on an agent-mission submission (the volunteer's own, or any for an admin). */
  async runAiReview(submissionId: string) {
    await ready();
    const db0 = getDB();
    const u = actor(db0);
    const s0 = db0.submissions.find((x) => x.id === submissionId);
    const m0 = s0 ? db0.missions.find((x) => x.id === s0.missionId) : null;
    if (!s0 || !m0 || m0.source !== "agent") throw new DomainError("not_found", "e.notFound");
    if (s0.userId !== u.id && !isAdmin(u.role)) throw new DomainError("forbidden", "e.forbidden");
    if (s0.verificationStatus !== "pending" || s0.aiReview?.audit === "overturned") return { decision: s0.aiReview?.decision ?? null };
    if (FIREBASE) {
      // The server reviews and writes the result (the volunteer cannot grant themselves rewards).
      const r = await callServer("ai-review", { submissionId }).catch(() => null);
      if (r?.ok) return { decision: ((await r.json()) as { decision: AiReview["decision"] }).decision };
      await commit((db) => {
        for (const a of db.users.filter((x) => isAdmin(x.role) && x.status === "active")) notify(db, a.id, "submission", "n.toReview", { name: u.fullName, title: m0.title }, "/admin?tab=review");
      });
      return { decision: "escalated" as const };
    }
    let verdict: AiVerdict | null = null;
    try {
      const images = s0.images.slice(-4).map((i) => i.dataUrl.split(",")[1] ?? "");
      const res = await postAi("verify", { images, title: m0.title, description: m0.description, category: m0.category, checklist: m0.checklist ?? [], language: u.language ?? "uz" });
      if (res.ok) verdict = (await res.json()) as AiVerdict;
    } catch { verdict = null; }
    let decision: AiReview["decision"] = "escalated";
    await commit((db) => {
      const s = db.submissions.find((x) => x.id === submissionId)!;
      if (s.verificationStatus !== "pending") return;
      const review = decideAi(verdict, s.checks ?? [], s.fraudScore, nowIso());
      decision = review.decision;
      applyAiReview(db, s, review);
    });
    return { decision };
  },

  /** Admin: AI decisions waiting for a human check. */
  async aiAuditQueue() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return db.submissions.filter((s) => s.aiReview && s.aiReview.decision !== "escalated").flatMap((s) => {
      const mission = db.missions.find((m) => m.id === s.missionId);
      const v = db.users.find((x) => x.id === s.userId);
      if (!mission || !v) return [];
      return [{ submission: s, mission, volunteer: person(v), participant: db.participants.find((p) => p.id === `${s.missionId}_${s.userId}`) ?? null }];
    }).sort((a, b) => Number(b.submission.aiReview!.audit === "pending") - Number(a.submission.aiReview!.audit === "pending") || Date.parse(b.submission.aiReview!.at) - Date.parse(a.submission.aiReview!.at));
  },

  /**
   * Admin confirms or overturns an AI decision.
   * Overturning an approval takes the rewards back; overturning a rejection (or a request for more evidence)
   * puts the submission back in the admins' queue for a normal review.
   */
  async auditAiReview(submissionId: string, verdict: "confirm" | "overturn", note = "") {
    await ready();
    if (verdict === "overturn" && note.trim().length < 5) throw new ValidationError({ note: "e.reasonNeeded" });
    await commit((db) => {
      const a = requireAdmin(db);
      const s = db.submissions.find((x) => x.id === submissionId);
      if (!s?.aiReview || s.aiReview.decision === "escalated") throw new DomainError("not_found", "e.notFound");
      if (s.aiReview.audit === "confirmed" || s.aiReview.audit === "overturned") throw new DomainError("invalid_state", "e.auditDone");
      const m = db.missions.find((x) => x.id === s.missionId);
      const t = nowIso();
      s.aiReview = { ...s.aiReview, audit: verdict === "confirm" ? "confirmed" : "overturned", auditedBy: a.id, auditedAt: t, auditNote: note.trim() };
      if (verdict === "overturn") {
        if (s.aiReview.decision === "approved" && s.verificationStatus === "approved") {
          const v = db.users.find((x) => x.id === s.userId);
          if (v && s.grant) {
            const r = reverseGrant(v, s.grant, db.certificates, t);
            Object.assign(v, r.volunteer);
            for (const c of r.revoked) Object.assign(db.certificates.find((x) => x.id === c.id)!, c);
          }
          s.verificationStatus = "rejected";
          s.reviewedBy = a.id;
          s.reviewedAt = t;
          s.reviewNote = note.trim();
          s.rewardGrantedAt = null;
          const p = db.participants.find((x) => x.id === `${s.missionId}_${s.userId}`);
          if (p) p.completionStatus = "joined";
          db.records.push({ id: uid(), submissionId: s.id, reviewerId: a.id, reviewerRole: a.role, decision: "rejected", note: note.trim(), createdAt: t });
          notify(db, s.userId, "submission", "n.aiOverturnedApproval", { title: m?.title ?? "", note: note.trim() }, `/app/missions/${s.missionId}`);
        } else {
          s.verificationStatus = "pending";
          s.reviewedBy = null;
          s.reviewedAt = null;
          notify(db, s.userId, "submission", "n.aiOverturnedRejection", { title: m?.title ?? "" }, `/app/missions/${s.missionId}`);
        }
      }
      log(db, a, `ai_review.${verdict}`, "missionSubmissions", s.id, note);
    });
  },

  /* ───────────── v3: review queues ───────────── */
  /** Admin queue split by who should act: escalated agent missions, AI audit, and organizations' backlog (oversight). */
  async adminQueues() {
    await ready();
    const db = getDB();
    requireAdmin(db);
    const all = await api.reviewQueue("admin");
    const stale = Date.now() - 3 * 86_400_000;
    return {
      admin: all.filter((x) => needsAdmin(x.submission)),
      orgs: all.filter((x) => !isAgentOrg(x.submission.organizationId) && x.submission.verificationStatus === "pending"),
      orgsStale: all.filter((x) => !isAgentOrg(x.submission.organizationId) && x.submission.verificationStatus === "pending" && Date.parse(x.submission.timestamp) < stale).length,
      history: all.filter((x) => x.submission.verificationStatus !== "pending").slice(0, 60),
    };
  },

  async adminAudit(limit = 200) {
    await ready();
    const db = getDB();
    requireAdmin(db);
    return db.audits.slice(0, limit);
  },
};

/* ───────────────────────── shared mutations ───────────────────────── */

function announcementsFor(db: DB, u: UserProfile) {
  return db.announcements.filter((a) => a.audience === "all" || a.audience === u.role || isAdmin(u.role)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Only links inside the app or https links are kept. */
function cleanLink(link?: string) {
  const l = (link ?? "").trim();
  if (!l) return null;
  if (l.startsWith("/") && !l.startsWith("//")) return l.slice(0, 300);
  return /^https:\/\/[^\s]+$/.test(l) ? l.slice(0, 300) : null;
}

export interface ShopItemInput {
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  price: number;
  stock: number;
  kind: ShopItem["kind"];
  art: ShopItem["art"];
  active: boolean;
  image: string | null;
  /** v3: "promo" items are delivered as partner promo codes */
  delivery?: "pickup" | "promo";
}

function joinInto(db: DB, u: UserProfile, missionId: string, teamId: string | null) {
  const m = db.missions.find((x) => x.id === missionId);
  if (!m || m.status !== "published") throw new DomainError("not_found", "e.missionClosed");
  if (!isVerifiedAccount(u)) throw new DomainError("unverified_email", "e.verifyFirst");
  if (!u.onboarded) throw new DomainError("invalid_state", "e.profileFirst");
  if (u.role !== "volunteer") throw new DomainError("forbidden", "e.volunteersOnly");
  if (Date.parse(m.deadline) < Date.now()) throw new DomainError("invalid_state", "e.signupClosed");
  const id = `${missionId}_${u.id}`;
  const existing = db.participants.find((p) => p.id === id);
  if (existing && existing.status === "accepted") throw new DomainError("conflict", "e.alreadyJoined");
  if (existing?.status === "rejected") throw new DomainError("forbidden", "e.declined");
  if (m.participantsCount >= m.capacity) throw new DomainError("conflict", "e.full");
  if (existing) Object.assign(existing, { status: "accepted", joinedAt: nowIso(), completionStatus: "joined", teamId });
  else db.participants.push({ id, missionId, userId: u.id, joinedAt: nowIso(), status: "accepted", attendance: false, completionStatus: "joined", teamId, startedAt: null, startGps: null });
  m.participantsCount += 1;
  const org = orgOf(db, m.organizationId);
  if (org) {
    org.totalVolunteers += 1;
    notify(db, org.ownerId, "mission", "n.newVolunteer", { name: u.fullName, title: m.title }, `/org/missions/${m.id}`);
  }
  log(db, u, "mission.join", "missionParticipants", id);
}

async function createOrganization(data: OrganizationInput, ownerId: string) {
  let id = "";
  await commit((db) => {
    const u = db.users.find((x) => x.id === ownerId);
    if (!u || u.role !== "organization") throw new DomainError("forbidden", "e.orgAccountsOnly");
    if (u.organizationId) throw new DomainError("conflict", "e.orgExists");
    id = uid();
    db.organizations.push({
      id, ...data, logo: null, verificationStatus: "pending", verificationNote: "", ownerId: u.id, members: [u.id], rating: 0,
      totalVolunteers: 0, totalMissions: 0, createdAt: nowIso(),
    });
    u.organizationId = id;
    log(db, u, "organization.register", "organizations", id, data.name);
    for (const a of db.users.filter((x) => isAdmin(x.role) && x.status === "active")) notify(db, a.id, "organization", "n.orgPending", { name: data.name }, "/admin?tab=organizations");
  });
  return { id };
}

/* ───────────────────────── v3 helpers ───────────────────────── */

/** +998 90 123 45 67 → +998901234567 (Uzbek numbers may be typed without the country code). */
export function normalisePhone(raw: string) {
  let d = raw.replace(/[^\d+]/g, "");
  if (!d.startsWith("+")) d = d.length === 9 ? `+998${d}` : `+${d}`;
  return /^\+\d{10,15}$/.test(d) ? d : null;
}

/** A confirmed email (older accounts made by SMS or Telegram keep counting as verified). */
export function isVerifiedAccount(u: Pick<UserProfile, "emailVerified" | "phoneVerified" | "telegramId">) {
  return Boolean(u.emailVerified || u.phoneVerified || u.telegramId);
}


/** An unanswered invite from any member of this group to this person. */
function pendingGroupInvite(db: DB, groupId: string, userId: string) {
  return db.messages.some((m) => m.kind === "group_invite" && m.group?.id === groupId && m.participants.includes(userId) && m.from !== userId && !m.inviteStatus && !m.deletedAt);
}

/** What a group invite card shows right now: the live group and where the viewer stands. */
function inviteInfo(db: DB, viewerId: string, groupId: string) {
  const g = db.groups.find((x) => x.id === groupId);
  const mine = groupOf(db, viewerId);
  return {
    exists: Boolean(g), members: g?.members.length ?? 0, full: g ? g.members.length >= GROUP_MAX_MEMBERS : false,
    description: g?.description ?? "", isMember: Boolean(g?.members.includes(viewerId)),
    otherGroup: mine && mine.id !== groupId ? mine.name : null,
  };
}

/* v3.2 territory helpers */
function liveTerritories(db: DB) {
  const season = seasonOf();
  return db.territories.filter((t) => t.season === season && t.areaM2 > 0 && t.shape);
}
/** Me and everyone in my group: we never take area from each other and share the first look. */
function sideOf(db: DB, userId: string) {
  const g = groupOf(db, userId);
  return new Set(g ? g.members : [userId]);
}
function setShape(t: Territory, s: Shape | null) {
  t.shape = s ? encodeShape(s) : "";
  t.areaM2 = shapeArea(s);
  t.center = s ? centerOf(s) : null;
  t.bbox = s ? bboxOf(s) : [];
  t.updatedAt = nowIso();
}
const boxesMeet = (a: number[], b: number[]) => a.length === 4 && b.length === 4 && a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
function fmtArea(m2: number) {
  return m2 >= 100_000 ? `${(m2 / 1_000_000).toFixed(2)} km²` : `${Math.round(m2).toLocaleString("en-US").replace(/,/g, " ")} m²`;
}
/** Open missions inside this area that nobody on the owner's side has joined. */
function ignoredMissions(db: DB, t: Territory, s: Shape) {
  const side = sideOf(db, t.userId);
  const now = Date.now();
  return db.missions.filter((m) => m.status === "published" && m.source !== "agent" && Date.parse(m.date) > now && contains(s, m.coordinates)
    && !db.participants.some((p) => p.missionId === m.id && side.has(p.userId) && p.status === "accepted"));
}
function dueTimes(db: DB, t: Territory, s: Shape) {
  const now = Date.now();
  return ignoredMissions(db, t, s).map((m) => new Date(Date.parse(m.publishedAt ?? m.createdAt) + TERRITORY.graceHours * 3_600_000).toISOString()).filter((d) => Date.parse(d) <= now);
}
function pendingDecay(db: DB, t: Territory) {
  const s = decodeShape(t.shape);
  return Boolean(s && decay(s, t.decayCheckedAt, dueTimes(db, t, s)).days > 0);
}
function applyDecay(db: DB, t: Territory) {
  const s = decodeShape(t.shape);
  if (!s) return;
  const r = decay(s, t.decayCheckedAt, dueTimes(db, t, s));
  if (!r.days) return;
  const before = t.areaM2;
  setShape(t, r.shape);
  t.decayCheckedAt = r.checkedAt;
  t.lostM2 += before - t.areaM2;
  notify(db, t.userId, "system", "n.territoryShrunk", { area: fmtArea(before - t.areaM2), days: r.days }, "/app/map");
}
/** New missions inside someone's area are shown only to that side for the first hours. */
function firstLook(db: DB, m: Mission, viewerId: string, live = liveTerritories(db)) {
  const at = Date.parse(m.publishedAt ?? m.createdAt);
  const until = at + TERRITORY.firstLookHours * 3_600_000;
  if (!m.coordinates || Date.now() > until) return { hidden: false, until: null as string | null };
  const holders = live.filter((t) => contains(decodeShape(t.shape), m.coordinates));
  if (!holders.length) return { hidden: false, until: null };
  const side = sideOf(db, viewerId);
  const ours = holders.some((t) => side.has(t.userId));
  return { hidden: !ours, until: ours ? new Date(until).toISOString() : null };
}

/** The group a volunteer belongs to (one at a time). */
function groupOf(db: DB, userId: string) {
  return db.groups.find((g) => g.members.includes(userId)) ?? null;
}

function systemMessage(groupId: string, from: string, key: string, values: Record<string, string>): GroupMessage {
  return { id: uid(), groupId, from, text: JSON.stringify({ key, values }), kind: "system", signalId: null, readBy: [from], createdAt: nowIso(), reactions: {}, replyTo: null, editedAt: null, deletedAt: null };
}

/** Removes a member; the oldest remaining member becomes the owner; an empty group is deleted with its codes. */
function removeFromGroup(db: DB, g: Group, userId: string, actorId: string = userId) {
  g.members = g.members.filter((m) => m !== userId);
  const name = db.users.find((x) => x.id === userId)?.fullName ?? "—";
  if (!g.members.length) {
    db.groups = db.groups.filter((x) => x.id !== g.id);
    db.groupCodes = db.groupCodes.filter((c) => c.groupId !== g.id);
    return;
  }
  if (g.ownerId === userId) g.ownerId = g.members[0];
  // Written by the person who acts; someone who left can no longer post in the group.
  if (actorId !== userId) db.groupMessages.push(systemMessage(g.id, actorId, "gm.removed", { name }));
}

function groupView(db: DB, g: Group, viewer: UserProfile) {
  const now = nowIso();
  const isMember = g.members.includes(viewer.id);
  const all = groupXp(db.submissions, db.missions).get(g.id) ?? 0;
  const month = groupXp(db.submissions, db.missions, { month: monthKey(now) }).get(g.id) ?? 0;
  const level = groupLevel(all);
  const ranks = SCOPES.map((scope) => {
    const b = groupBoard({ viewerPlace: g, myGroupId: g.id, groups: db.groups, submissions: db.submissions, missions: db.missions, scope, period: "all", now });
    const i = b.rows.findIndex((r) => r.isMe);
    return { scope, rank: i >= 0 ? i + 1 : null, total: b.rows.length };
  });
  const missions = new Map(db.missions.map((m) => [m.id, m]));
  const contrib = new Map<string, number>();
  for (const s of db.submissions) if (s.groupId === g.id && s.verificationStatus === "approved") contrib.set(s.userId, (contrib.get(s.userId) ?? 0) + earnedXp(s, missions.get(s.missionId)));
  const members = g.members.flatMap((id) => {
    const x = db.users.find((y) => y.id === id);
    return x ? [{ ...person(x), isOwner: id === g.ownerId, groupXp: contrib.get(id) ?? 0, isMe: id === viewer.id }] : [];
  }).sort((a, b) => b.groupXp - a.groupXp);
  const recent = db.submissions.filter((s) => s.groupId === g.id && s.verificationStatus === "approved" && s.reviewedAt)
    .sort((a, b) => Date.parse(b.reviewedAt!) - Date.parse(a.reviewedAt!)).slice(0, 8)
    .flatMap((s) => { const m = missions.get(s.missionId); const x = db.users.find((y) => y.id === s.userId); return m && x ? [{ id: s.id, at: s.reviewedAt!, title: m.title, category: m.category, name: x.fullName, xp: earnedXp(s, m) }] : []; });
  return {
    group: g, isMember, isOwner: g.ownerId === viewer.id, members, xp: all, monthXp: month, level, levelStart: xpForLevel(level) * 3, levelNext: xpForLevel(level + 1) * 3,
    ranks, recent, code: isMember ? db.groupCodes.find((c) => c.groupId === g.id)?.id ?? null : null,
    signals: db.helpSignals.filter((x) => x.groupId === g.id && x.status === "open" && Date.parse(x.expiresAt) > Date.now()).map((x) => signalView(db, x, viewer, null)),
  };
}
export type GroupView = ReturnType<typeof groupView>;

type AnyMessage = Message | GroupMessage;
function findMessage(db: DB, id: string): AnyMessage | null {
  return db.messages.find((m) => m.id === id) ?? db.groupMessages.find((m) => m.id === id) ?? null;
}

function unreadFor(db: DB, userId: string) {
  const groups = new Set(db.groups.filter((g) => g.members.includes(userId)).map((g) => g.id));
  return db.messages.filter((m) => m.participants.includes(userId) && !m.readBy.includes(userId)).length
    + db.groupMessages.filter((m) => groups.has(m.groupId) && !m.readBy.includes(userId)).length;
}

function openSignalsFor(db: DB, u: UserProfile, near: { lat: number; lng: number } | null) {
  const now = Date.now();
  const g = groupOf(db, u.id);
  const d = scopeKey(u, "district");
  return db.helpSignals.filter((x) => {
    if (x.status !== "open" || Date.parse(x.expiresAt) < now) return false;
    if (x.userId === u.id || (g && x.groupId === g.id)) return true;
    if (near && km(near, x.location) <= x.radiusKm) return true;
    if (d) return scopeKey({ country: "Uzbekistan", province: x.province, district: x.district }, "district") === d;
    return Boolean(u.city) && u.city.toLowerCase() === x.city.toLowerCase();
  });
}

function signalView(db: DB, x: HelpSignal, viewer: UserProfile, near: { lat: number; lng: number } | null) {
  const author = db.users.find((y) => y.id === x.userId);
  return {
    ...x, author: author ? person(author) : null, isMine: x.userId === viewer.id, going: x.responders.includes(viewer.id),
    distanceKm: near ? Math.round(km(near, x.location) * 10) / 10 : null,
    open: x.status === "open" && Date.parse(x.expiresAt) > Date.now(),
    people: x.responders.flatMap((id) => { const y = db.users.find((z) => z.id === id); return y ? [person(y)] : []; }),
    groupName: x.groupId ? db.groups.find((gg) => gg.id === x.groupId)?.name ?? null : null,
  };
}
export type SignalView = ReturnType<typeof signalView>;

/** Keys "YYYY-MM" of the last n months, oldest first. */
function lastMonths(n: number) {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Gives an order the next free promo code of its item. False when none is left. */
function issueCode(db: DB, o: Order) {
  const c = db.promoCodes.find((x) => x.itemId === o.itemId && !x.orderId);
  if (!c) return false;
  const t = nowIso();
  Object.assign(c, { orderId: o.id, userId: o.userId, issuedAt: t });
  Object.assign(o, { promoCode: c.code, status: "fulfilled", updatedAt: t });
  notify(db, o.userId, "reward", "n.promoIssued", { title: o.itemTitle }, "/app/shop?tab=codes");
  return true;
}

/** Calls a Netlify server function as the signed-in user. */
async function callServer(name: string, body: unknown) {
  const token = await cloud.idToken();
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`server ${res.status}`);
  return res;
}

/** Applies the AI reviewer's decision (local mode; the ai-review server function does the same with the Admin SDK). */
function applyAiReview(db: DB, s: Submission, review: AiReview) {
  const mission = db.missions.find((m) => m.id === s.missionId);
  const volunteer = db.users.find((x) => x.id === s.userId);
  if (!mission || !volunteer) return;
  if (review.decision === "escalated") {
    s.aiReview = review;
    for (const a of db.users.filter((x) => isAdmin(x.role) && x.status === "active")) notify(db, a.id, "submission", "n.toReview", { name: volunteer.fullName, title: mission.title }, "/admin?tab=review");
    return;
  }
  const now = nowIso();
  const teamSize = s.teamId ? db.participants.filter((p) => p.missionId === s.missionId && p.teamId === s.teamId && p.status === "accepted").length : 1;
  const res = reviewSubmission({
    submission: s, mission, volunteer, reviewer: aiReviewer(now), organization: null, decision: review.decision, note: aiNote(review), now, newId: uid,
    origin: typeof window === "undefined" ? "" : window.location.origin, team: teamSize > 1,
  });
  Object.assign(s, res.submission, { aiReview: review, reviewedBy: AI_REVIEWER_ID });
  Object.assign(volunteer, res.volunteer);
  db.records.push(res.record);
  db.certificates.push(...res.certificates);
  db.notifications.unshift(...res.notifications);
  db.audits.unshift({ ...res.audit, actor: AI_REVIEWER_ID, actorRole: "system" });
  const p = db.participants.find((x) => x.id === `${s.missionId}_${s.userId}`);
  if (p) p.completionStatus = review.decision === "approved" ? "completed" : "joined";
  if (review.decision === "approved" && p) p.attendance = true;
}

/** An agent-mission submission the AI could not decide (or never got to): an admin must review it. */
function needsAdmin(s: Submission) {
  if (s.verificationStatus !== "pending" || !isAgentOrg(s.organizationId)) return false;
  // escalated by the AI, or an AI rejection an admin overturned: a person decides now
  if (s.aiReview?.decision === "escalated" || s.aiReview?.audit === "overturned") return true;
  return !s.aiReview && Date.parse(s.timestamp) < Date.now() - 2 * 60_000;
}

export interface NewsInput {
  title: string; summary: string; body: string; cover: string | null; category: NewsPost["category"]; audience: NewsPost["audience"];
  status: NewsPost["status"]; pinned: boolean; publishAt: string; link: string;
}

export { levelForXp };
export type { Mission };
