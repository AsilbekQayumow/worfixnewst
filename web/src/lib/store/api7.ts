"use client";
/**
 * v7 application API: the game (daily chest and streak, quests, chests and quizzes on the map, events, season pass,
 * looks, badges, mahalla battles, duels, monthly summary) and the place picker requests.
 *
 * Rewards never come from the browser in Firebase mode: `act()` calls the `play` server function, which runs the
 * same engine (src/lib/game/engine.ts) in a transaction. In demo mode the engine runs here on the local database.
 */
import { DomainError } from "../domain/permissions";
import { dayStart, gameDay, gameWeek, isBoosted, roll, type PlayState } from "../game/core";
import { canSave, DAILY, dailyReward, liveStreak, play as runEngine, type Action, type Result } from "../game/engine";
import { activityOf, battlesFor, districtKeyOf, heatActivity, mahallaKeyOf, seasonExtraOf, tookPart, weekActivity } from "../game/context";
import { questKey, questsFor, statsNow } from "../game/quests";
import { buildHeat, spawnsAround, type Heat, type LatLng } from "../game/spawn";
import { COSMETICS, seasonXp, SEASON_TIERS, tierOf, tierReward, tierXp } from "../game/season";
import { DUEL, duelScore, lastWeek, settleDuel, type Battle, type Duel, type DuelMetric } from "../game/league";
import { gameBadges } from "../game/badges";
import { monthsWithActivity, wrapped } from "../game/wrapped";
import type { QuizRow } from "../game/quiz-bank";
import type { CustomPlace, PlaceRequest, UserProfile } from "../domain/types";
import { actor, friendIdsOf, log, notify, readSession, requireAdmin } from "./api";
import { commit, FIREBASE, getDB, nowIso, ready, uid, type DB } from "./db";
import * as cloud from "./cloud";

/* The quiz bank ships only in demo builds: with Firebase configured the questions stay on the server. */
let bankP: Promise<QuizRow[]> | null = null;
const bank = () => (bankP ??= process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? Promise.resolve([]) : import("../game/quiz-bank").then((m) => m.QUIZ_BANK));

const playOf = (db: DB, id: string) => db.play.find((p) => p.id === id) ?? null;

/** Demo: the heat map from activity before today (stable through the day). */
function heatOf(db: DB, now: number): Heat | null {
  const day = gameDay(now);
  const stored = db.heat.find((h) => h.day === day);
  if (stored || FIREBASE) return stored ?? null;
  return buildHeat(day, heatActivity(dayStart(day), db.territories, db.missions, db.participants));
}

function battlesNow(db: DB, week: string, now: number): Battle[] {
  if (FIREBASE) return db.battles.filter((b) => b.week === week);
  return battlesFor(week, db.users, db.territoryCaptures, db.submissions, now);
}

function duelLive(db: DB, d: Duel, now: number): Duel {
  if (FIREBASE || d.status !== "active" || !d.start || !d.end) return d;
  const from = Date.parse(d.start), to = Date.parse(d.end);
  const data = { captures: db.territoryCaptures, approvals: db.submissions.filter((s) => s.verificationStatus === "approved").map((s) => ({ userId: s.userId, reviewedAt: s.reviewedAt, hours: s.grant?.hours ?? 0 })) };
  const scores = Object.fromEntries(d.players.map((p) => [p, duelScore(d.metric, p, data, from, to)]));
  return settleDuel({ ...d, scores }, now);
}

function ctxFor(db: DB, u: UserProfile, now: number) {
  const mine = mahallaKeyOf(u);
  const week = lastWeek(now);
  const battle = battlesNow(db, week, now).find((b) => b.district === districtKeyOf(u)) ?? null;
  return {
    now, user: { id: u.id, points: u.points, province: u.province }, play: playOf(db, u.id), heat: heatOf(db, now),
    activity: activityOf(u.id, db.territoryCaptures, db.participants, db.submissions), seasonExtra: seasonExtraOf(u.id, db.territoryCaptures, db.submissions, now),
    battle, mahalla: mine, battleTookPart: tookPart(u.id, weekActivity(week, db.territoryCaptures, db.submissions)),
  };
}

function applyResult(db: DB, u: UserProfile, r: Result) {
  const i = db.play.findIndex((p) => p.id === u.id);
  if (i >= 0) db.play[i] = r.play; else db.play.push(r.play);
  if (r.coins) u.points = Math.max(0, u.points + r.coins);
  if (r.look) u.look = r.look;
}

export type PlayResult = Omit<Result, "play">;

export const api7 = {
  /** Everything the game screens show, in one read. `at` = where the person is (for chests and events). */
  async game(at?: LatLng | null) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return null;
    const now = Date.now();
    const p: PlayState = roll(playOf(db, u.id), u.id, now);
    const act = activityOf(u.id, db.territoryCaptures, db.participants, db.submissions);
    const stats = statsNow(act, p, now);
    const q = questsFor(u.id, now);
    const quest = (def: (typeof q.daily)[number]) => {
      const v = (def.period === "day" ? stats.day : stats.week)[def.metric];
      return { ...def, value: v, done: v >= def.goal, claimed: p.quests.includes(questKey(def, now)) };
    };
    const extra = seasonExtraOf(u.id, db.territoryCaptures, db.submissions, now);
    const sxp = seasonXp(p.season.xp, extra.missionXp, extra.areaM2);
    const tier = tierOf(sxp);
    const heat = heatOf(db, now);
    const spawns = at ? spawnsAround(at, now, heat) : { chests: [], events: [] };
    const opened = new Set(p.opened);
    const district = districtKeyOf(u), mahalla = mahallaKeyOf(u);
    const cur = battlesNow(db, gameWeek(now), now).find((b) => b.district === district) ?? null;
    const prevW = lastWeek(now);
    const prev = battlesNow(db, prevW, now).find((b) => b.district === district) ?? null;
    const ctx = ctxFor(db, u, now);
    let battleClaim = false;
    try { runEngine(ctx, { t: "battle", week: prevW }); battleClaim = true; } catch { battleClaim = false; }
    const duels = db.duels.filter((d) => d.players.includes(u.id)).map((d) => duelLive(db, d, now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const names = new Map(db.users.map((x) => [x.id, x]));
    const streak = liveStreak(p, now);
    return {
      me: { id: u.id, name: u.fullName, avatar: u.avatar, points: u.points, province: u.province, mahalla: u.mahalla ?? "", district: u.district ?? "", hasPlace: Boolean(mahalla && district), look: u.look ?? null },
      today: gameDay(now),
      daily: { done: p.chestDay === gameDay(now), streak, best: p.best, next: dailyReward(p.chestDay === gameDay(now) ? streak + 1 : streak + 1), canSave: canSave(p, now), saveCost: DAILY.save.cost, lost: p.streak },
      quests: { daily: q.daily.map(quest), weekly: q.weekly.map(quest), dayEnds: dayStart(gameDay(now)) + 86_400_000, weekEnds: dayStart(gameWeek(now)) + 7 * 86_400_000 },
      season: { id: p.season.id, xp: sxp, tier, tiers: SEASON_TIERS, claimed: p.season.claimed, nextAt: tier < SEASON_TIERS ? tierXp(tier + 1) : null, prevAt: tierXp(tier), rewards: Array.from({ length: SEASON_TIERS }, (_, i) => tierReward(i + 1)) },
      boostUntil: isBoosted(p, now) ? p.boostUntil : null,
      today_: p.d,
      limit: { used: p.d.chests },
      chests: spawns.chests.map((c) => ({ ...c, opened: opened.has(c.id) })),
      events: spawns.events.map((e) => ({ ...e, opened: opened.has(e.id) })),
      pendingQuiz: p.quiz,
      owned: p.owned, look: p.look, cosmetics: COSMETICS,
      badges: gameBadges({ chests: p.total.chests, quizRight: p.total.quizRight, best: p.best, early: p.total.early, events: p.total.events, battles: p.battles.length, tiers: tier }),
      battle: cur ? { ...cur, mine: mahalla } : null,
      lastBattle: prev ? { ...prev, mine: mahalla, claim: battleClaim } : null,
      duels: duels.map((d) => {
        const other = d.players.find((x) => x !== u.id)!;
        const o = names.get(other);
        let claim = false;
        try { runEngine({ ...ctx, duel: d }, { t: "duel", id: d.id }); claim = true; } catch { claim = false; }
        return { ...d, other: { id: other, name: o?.fullName ?? "—", avatar: o?.avatar ?? null }, mine: d.from === u.id, claim };
      }),
      friends: [...friendIdsOf(db, u.id)].map((id) => names.get(id)).filter(Boolean).map((f) => ({ id: f!.id, name: f!.fullName, avatar: f!.avatar })),
    };
  },

  /** Runs one game action. Firebase: on the server; demo: here. */
  async act(action: Action): Promise<PlayResult> {
    await ready();
    if (FIREBASE) {
      const res = await cloud.callFunction("play", action);
      const body = (await res.json().catch(() => ({}))) as PlayResult & { error?: string };
      if (!res.ok) throw new DomainError("conflict", body.error ?? "e.generic");
      return body;
    }
    const b = action.t === "open" ? await bank() : undefined;
    let out: PlayResult = { coins: 0, xp: 0 };
    await commit((db) => {
      const u = actor(db);
      const ctx = ctxFor(db, u, Date.now());
      const duel = action.t === "duel" ? db.duels.map((d) => duelLive(db, d, Date.now())).find((d) => d.id === action.id) ?? null : null;
      let r: Result;
      try { r = runEngine({ ...ctx, bank: b, duel }, action); } catch (e) { throw new DomainError("conflict", (e as Error).message); }
      applyResult(db, u, r);
      if (action.t === "duel" && duel) { const d = db.duels.find((x) => x.id === duel.id); if (d) Object.assign(d, { status: duel.status, scores: duel.scores, winner: duel.winner }); }
      const { play: _p, ...rest } = r;
      void _p;
      out = rest;
    });
    return out;
  },

  /* ── duels ── */
  async challenge(friendId: string, metric: DuelMetric) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      if (!friendIdsOf(db, u.id).has(friendId)) throw new DomainError("forbidden", "du.e.friend");
      const open = db.duels.filter((d) => d.players.includes(u.id) && (d.status === "pending" || d.status === "active"));
      if (open.length >= DUEL.open) throw new DomainError("conflict", "du.e.many");
      if (open.some((d) => d.players.includes(friendId))) throw new DomainError("conflict", "du.e.already");
      const t = nowIso();
      db.duels.push({ id: uid(), players: [u.id, friendId], from: u.id, to: friendId, metric, status: "pending", createdAt: t, start: null, end: null, scores: {}, winner: null, updatedAt: t });
      notify(db, friendId, "system", "n.duel", { name: u.fullName }, "/app/play?tab=duels");
      log(db, u, "duel.create", "duels", friendId);
    });
  },
  async answerDuel(id: string, accept: boolean) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const d = db.duels.find((x) => x.id === id);
      if (!d || d.to !== u.id || d.status !== "pending") throw new DomainError("not_found", "e.notFound");
      const t = new Date();
      d.status = accept ? "active" : "declined";
      d.updatedAt = t.toISOString();
      if (accept) { d.start = t.toISOString(); d.end = new Date(t.getTime() + DUEL.days * 86_400_000).toISOString(); d.scores = { [d.players[0]]: 0, [d.players[1]]: 0 }; }
      notify(db, d.from, "system", accept ? "n.duelOn" : "n.duelNo", { name: u.fullName }, "/app/play?tab=duels");
    });
  },
  async cancelDuel(id: string) {
    await ready();
    await commit((db) => {
      const u = actor(db);
      const d = db.duels.find((x) => x.id === id);
      if (!d || d.from !== u.id || d.status !== "pending") throw new DomainError("not_found", "e.notFound");
      d.status = "declined";
      d.updatedAt = nowIso();
    });
  },

  /** The monthly summary for the signed-in person. */
  async wrapped(month?: string) {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return null;
    const now = Date.now();
    const mine = db.submissions.filter((s) => s.userId === u.id && s.verificationStatus === "approved");
    const caps = db.territoryCaptures.filter((c) => c.userId === u.id && c.fairplay?.verdict !== "reject");
    const months = monthsWithActivity([...mine.map((s) => s.reviewedAt ?? ""), ...caps.map((c) => c.createdAt)], now);
    const m = month && months.includes(month) ? month : months[0];
    const p = playOf(db, u.id);
    const missions = new Map(db.missions.map((x) => [x.id, x]));
    const current = m === new Date(now).toISOString().slice(0, 7);
    const extra = seasonExtraOf(u.id, db.territoryCaptures, db.submissions, now);
    const sxp = current ? seasonXp(p && p.season.id === m ? p.season.xp : 0, extra.missionXp, extra.areaM2) : 0;
    return {
      months, me: { name: u.fullName, avatar: u.avatar, mahalla: u.mahalla ?? "", district: u.district ?? "", look: u.look ?? null },
      data: wrapped({
        month: m, approvals: mine.map((s) => ({ reviewedAt: s.reviewedAt, hours: s.grant?.hours ?? 0, xp: s.grant?.xp ?? 0, category: missions.get(s.missionId)?.category ?? null, impact: s.grant?.impact ?? {} })),
        captures: caps, seasonXp: sxp, tier: current ? tierOf(sxp) : 0, bestStreak: p?.best ?? 0,
      }),
      impactTotal: Object.entries(u.impact ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]),
    };
  },

  /* ── places ── */
  async customPlaces(districtId: number): Promise<[string, string][]> {
    await ready();
    return getDB().places.filter((p) => p.districtId === districtId).map((p) => [p.id, p.name]);
  },
  async requestPlace(districtId: number, name: string) {
    await ready();
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
    if (clean.length < 2) throw new DomainError("validation", "v.pickMahalla");
    let id = "";
    await commit((db) => {
      const u = actor(db);
      if (db.placeRequests.filter((r) => r.userId === u.id && r.status === "pending").length >= 3) throw new DomainError("conflict", "pl.e.many");
      id = uid();
      db.placeRequests.push({ id, userId: u.id, districtId, name: clean, status: "pending", createdAt: nowIso(), decidedBy: null, decidedAt: null });
    });
    return id;
  },
  async placeRequests() {
    await ready();
    const db = getDB();
    const u = readSession(db);
    if (!u) return [];
    const people = new Map(db.users.map((x) => [x.id, x.fullName]));
    return db.placeRequests.filter((r) => r.status === "pending").map((r) => ({ ...r, who: people.get(r.userId) ?? "—" })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async decidePlace(id: string, add: boolean, name?: string) {
    await ready();
    await commit((db) => {
      const a = requireAdmin(db);
      const r = db.placeRequests.find((x) => x.id === id);
      if (!r || r.status !== "pending") throw new DomainError("not_found", "e.notFound");
      r.status = add ? "added" : "rejected"; r.decidedBy = a.id; r.decidedAt = nowIso();
      if (add) {
        const placeName = (name ?? r.name).replace(/\s+/g, " ").trim().slice(0, 80);
        const place: CustomPlace = { id: `c_${uid().slice(0, 12)}`, districtId: r.districtId, name: placeName, createdAt: nowIso(), createdBy: a.id };
        db.places.push(place);
        const who = db.users.find((x) => x.id === r.userId);
        if (who && !who.mahallaId && who.districtId === r.districtId) { who.mahallaId = place.id; who.mahalla = place.name; }
        notify(db, r.userId, "system", "n.placeAdded", { name: place.name }, "/app/settings");
      } else notify(db, r.userId, "system", "n.placeRejected", { name: r.name }, "/app/settings");
      log(db, a, add ? "place.add" : "place.reject", "placeRequests", r.id);
    });
  },
};

export type GameView = NonNullable<Awaited<ReturnType<typeof api7.game>>>;
export type { PlaceRequest };
