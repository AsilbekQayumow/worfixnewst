"use client";
/**
 * WORFIX application API. Same surface in local demo mode and Firebase mode.
 * Never trusts caller-supplied role, status, reward or verification values: it re-reads stored records.
 * Errors carry i18n keys (lib/i18n/dict.ts).
 */
import { agentOrgId, assertActive, canEnterArea, canManageMission, DomainError, isAdmin, isAgentOrg, type Area } from "../domain/permissions";
import { computeMissionReward, dayKey, levelForXp, nextCertificateLevel } from "../domain/rewards";
import { makeOrderCode, normaliseCode } from "../domain/certificates";
import { runChecks } from "../domain/checks";
import { resubmit, reviewSubmission, type ReviewDecision } from "../domain/verification";
import { computeAchievements, nextAchievement, type AchievementStats } from "../domain/achievements";
import { sampleCatalog } from "../domain/shop";
import {
  passwordProblem, validateLogin, validateMission, validateOrganization, validatePersonal, validateProfile, validateRegister,
  type Errors, type MissionInput, type OrganizationInput, type PersonalInput, type ProfileInput, type RegisterInput, type Result,
} from "../domain/validation";
import type {
  Announcement, Category, Certificate, Evidence, GpsFix, Lang, Message, Mission, Notification, Order, Organization, Role, ShopItem, Submission, UserProfile,
} from "../domain/types";
import type { AiMission } from "../ai/missions";
import * as cloud from "./cloud";
import { commit, FIREBASE, getDB, hashPassword, nowIso, ready, SESSION_KEY, uid, type DB } from "./db";

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
  async updateProfile(input: Partial<ProfileInput>, extra: { avatar?: string | null; onboarded?: boolean } = {}) {
    await ready();
    const data = unwrap(validateProfile(input));
    await commit((db) => {
      const u = actor(db);
      if (db.users.some((x) => x.id !== u.id && x.username === data.username)) throw new ValidationError({ username: "e.usernameTaken" });
      Object.assign(u, data, { updatedAt: nowIso() });
      if (extra.avatar !== undefined) u.avatar = extra.avatar;
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
    return { participant: p, submission: sub ? publicSubmission(sub) : null, team, friends, emailVerified: u.emailVerified, onboarded: u.onboarded, role: u.role };
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
      if (existing) {
        const next = { ...resubmit(existing, { images: input.images, notes: input.notes.trim() }, t), ...extra, gps: gps ?? existing.gps };
        const r = runChecks({ submission: next, mission: m, participant: p, others: db.submissions.filter((s) => s.id !== existing.id) });
        Object.assign(existing, next, { checks: r.checks, fraudScore: r.score, fraudFlags: r.flags });
        log(db, u, "submission.resubmit", "missionSubmissions", existing.id);
      } else {
        const sub: Submission = {
          id: uid(), missionId, userId: u.id, organizationId: m.organizationId, images: input.images, videos: [], notes: input.notes.trim(),
          gps, gpsConsent: input.gpsConsent, timestamp: t, metadata: { userAgent: navigator.userAgent.slice(0, 160), submissionCount: 1 },
          fraudScore: 0, fraudFlags: [], verificationStatus: "pending", reviewedBy: null, reviewedAt: null, reviewNote: "", rewardGrantedAt: null,
          certificateId: null, checks: [], ...extra,
        };
        const r = runChecks({ submission: sub, mission: m, participant: p, others: db.submissions });
        Object.assign(sub, { checks: r.checks, fraudScore: r.score, fraudFlags: r.flags });
        db.submissions.push(sub);
        log(db, u, "submission.create", "missionSubmissions", sub.id);
      }
      p.completionStatus = "submitted";
      const reviewers = isAgentOrg(m.organizationId)
        ? db.users.filter((x) => isAdmin(x.role) && x.status === "active").map((x) => x.id)
        : [orgOf(db, m.organizationId)?.ownerId].filter((x): x is string => Boolean(x));
      for (const r of reviewers) notify(db, r, "submission", "n.toReview", { name: u.fullName, title: m.title }, isAgentOrg(m.organizationId) ? "/admin?tab=review" : "/org/review");
    });
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
        notify(db, other.id, "system", "n.friendRequest", { name: u.fullName }, "/app/friends");
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

  /* ---- chat ---- */
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
      return [{ person: person(other), last, unread: ms.filter((m) => !m.readBy.includes(u.id)).length, isFriend: friends.has(id) }];
    }).sort((a, b) => (b.last ? Date.parse(b.last.createdAt) : 0) - (a.last ? Date.parse(a.last.createdAt) : 0) || a.person.fullName.localeCompare(b.person.fullName));
  },

  async thread(friendId: string) {
    await ready();
    const db = getDB();
    const u = actor(db);
    const other = db.users.find((x) => x.id === friendId && x.status === "active");
    if (!other) return null;
    const chatId = chatIdOf(u.id, friendId);
    const messages = db.messages.filter((m) => m.chatId === chatId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map((m) => {
      const mission = m.missionId ? db.missions.find((x) => x.id === m.missionId) ?? null : null;
      const joined = m.missionId ? db.participants.some((p) => p.id === `${m.missionId}_${u.id}` && p.status === "accepted") : false;
      return { ...m, mission: mission ? { id: mission.id, title: mission.title, date: mission.date, location: mission.location, category: mission.category, difficulty: mission.difficulty, status: mission.status } : null, joined };
    });
    const myActive = db.participants.filter((p) => p.userId === u.id && p.status === "accepted" && p.completionStatus === "joined")
      .flatMap((p) => { const m = db.missions.find((x) => x.id === p.missionId && x.status === "published"); return m ? [{ id: m.id, title: m.title, date: m.date }] : []; });
    const adminThread = isAdmin(u.role) || isAdmin(other.role);
    return { me: u.id, person: person(other), isFriend: relationOf(db, u.id, friendId) === "friend", canWrite: relationOf(db, u.id, friendId) === "friend" || adminThread, otherIsAdmin: isAdmin(other.role), messages, myActive };
  },

  async sendMessage(friendId: string, text: string, replyToId: string | null = null) {
    await ready();
    const body = text.trim();
    if (!body) return;
    if (body.length > 1000) throw new ValidationError({ text: "v.message" });
    await commit((db) => {
      const u = actor(db);
      const other = db.users.find((x) => x.id === friendId);
      if (!other) throw new DomainError("not_found", "e.notFound");
      const admin = isAdmin(u.role) || isAdmin(other.role);
      if (!admin && relationOf(db, u.id, friendId) !== "friend") throw new DomainError("forbidden", "e.friendsOnly");
      const chatId = chatIdOf(u.id, friendId);
      const ref = replyToId ? db.messages.find((m) => m.id === replyToId && m.chatId === chatId && !m.deletedAt) : null;
      db.messages.push({
        id: uid(), chatId, participants: [u.id, friendId].sort() as [string, string], from: u.id, text: body, kind: "text", missionId: null,
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
      const m = db.messages.find((x) => x.id === messageId);
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
      const m = db.messages.find((x) => x.id === messageId);
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
      const m = db.messages.find((x) => x.id === messageId);
      if (!m || !m.participants.includes(u.id) || m.deletedAt) throw new DomainError("forbidden", "e.forbidden");
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

  async markChatRead(friendId: string) {
    await ready();
    const db0 = getDB();
    const me = readSession(db0);
    if (!me) return;
    const chatId = chatIdOf(me.id, friendId);
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
      db.orders.push({ id: uid(), userId: u.id, itemId, itemTitle: item.title.en, price: item.price, code, status: "placed", createdAt: nowIso() });
      notify(db, u.id, "reward", "n.order", { code }, "/app/shop?tab=orders");
      log(db, u, "shop.buy", "orders", code, item.id);
    });
    return { code };
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
      unreadMessages: db.messages.filter((m) => m.participants.includes(u.id) && !m.readBy.includes(u.id)).length,
    };
  },

  /** Counters for the navigation badges. */
  async badges() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return { notifications: 0, messages: 0, friends: 0 };
    return {
      notifications: db.notifications.filter((n) => n.userId === u.id && !n.read).length
        + announcementsFor(db, u).filter((a) => !u.announcementsSeenAt || Date.parse(a.createdAt) > Date.parse(u.announcementsSeenAt)).length,
      messages: db.messages.filter((m) => m.participants.includes(u.id) && !m.readBy.includes(u.id)).length,
      friends: db.friendships.filter((f) => f.to === u.id && f.status === "pending").length,
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
      orders: db.orders.length, shopItems: db.shopItems.length, recentActivity: db.audits.slice(0, 10),
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
      const data = { title, description, price: input.price, stock: input.stock, kind: input.kind, art: input.art, active: input.active, image: input.image || null };
      if (existingId) {
        const it = db.shopItems.find((i) => i.id === existingId);
        if (!it) throw new DomainError("not_found", "e.notFound");
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
}

function joinInto(db: DB, u: UserProfile, missionId: string, teamId: string | null) {
  const m = db.missions.find((x) => x.id === missionId);
  if (!m || m.status !== "published") throw new DomainError("not_found", "e.missionClosed");
  if (!u.emailVerified) throw new DomainError("unverified_email", "e.verifyFirst");
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

export { levelForXp };
export type { Mission };
