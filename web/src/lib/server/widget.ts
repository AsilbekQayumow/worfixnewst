/**
 * Server-only: the data behind the WORFIX home-screen widgets (Android and iOS).
 *
 *  • widget-token (POST, signed in): issues a long-lived, read-only widget token for this user and device.
 *    The app keeps it in native storage so widgets can refresh on their own; signing out revokes it.
 *  • widget (GET, x-widget-token): one JSON for every widget — my tree, streak and level, the nearest
 *    mission, my area this month and the community pulse — with every text already in the user's language,
 *    so the native widgets stay simple.
 */
import { levelProgress } from "../domain/rewards";
import { decodeShape, distanceM, seasonOf, type Shape } from "../domain/territory";
import { treeOf } from "../domain/tree";
import type { Lang, Mission, Submission, Territory, UserProfile } from "../domain/types";
import { personColor } from "../map-colors";
import { adminDb, adminReady, caller, notConfigured, tooMany } from "./admin";
import type { Firestore } from "./firestore-rest";
import { langOf, sha256, tr } from "./push";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...extra } });

const LOCALE: Record<Lang, string> = { uz: "uz-Latn-UZ", ru: "ru-RU", en: "en-GB" };
const TZ = "Asia/Tashkent";

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function handleWidgetToken(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  const db = adminDb();
  const body = (await req.json().catch(() => ({}))) as { revoke?: string };
  if (body.revoke) {
    // Signing out: the token itself is the proof (no ID token is left at that point).
    const ref = db.doc(`widgetTokens/${await sha256(String(body.revoke))}`);
    if ((await ref.get()).exists) await db.batch().delete(ref).commit();
    return json({ ok: true });
  }
  const uid = await caller(req);
  if (!uid) return json({ error: "e.signIn" }, 401);
  if (tooMany(`wtok:${uid}`, 10)) return json({ error: "ai.tooMany" }, 429);
  const token = `wt_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  await db.doc(`widgetTokens/${await sha256(token)}`).set({ userId: uid, createdAt: new Date().toISOString() });
  return json({ token });
}

/* ───────────── small caches (per Worker isolate) ───────────── */

const cache = new Map<string, { until: number; value: unknown }>();
async function cached<T>(key: string, ms: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { until: Date.now() + ms, value });
  return value;
}

const openMissions = (db: Firestore) => cached("missions", 5 * 60_000, async () => {
  const s = await db.collection("missions").where("status", "==", "published").get();
  return s.docs.map((d) => d.data() as Mission);
});

const seasonAreas = (db: Firestore, season: string) => cached(`areas:${season}`, 5 * 60_000, async () => {
  const s = await db.collection("territories").where("season", "==", season).get();
  return s.docs.map((d) => d.data() as Territory).filter((t) => t.areaM2 > 0).map((t) => ({ userId: t.userId, areaM2: t.areaM2 }));
});

const weekPulse = (db: Firestore) => cached("pulse", 30 * 60_000, async () => {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const s = await db.collection("submissions").where("reviewedAt", ">=", since).get();
  const subs = s.docs.map((d) => d.data() as Submission).filter((x) => x.verificationStatus === "approved");
  const missions = new Map((await openMissions(db)).map((m) => [m.id, m]));
  let hours = 0;
  for (const x of subs) hours += x.grant?.hours ?? (missions.get(x.missionId)?.duration ?? 0) / 60;
  return { missions: subs.length, people: new Set(subs.map((x) => x.userId)).size, hours: Math.round(hours) };
});

/* ───────────── helpers ───────────── */

const num = (n: number) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
const area = (m2: number) => (m2 >= 1_000_000 ? `${(m2 / 1_000_000).toFixed(2)} km²` : `${num(m2)} m²`);
function distance(lang: Lang, m: number) {
  return m < 1000 ? tr(lang, "u.m", { n: Math.max(10, Math.round(m / 10) * 10) }) : tr(lang, "u.km", { n: (m / 1000).toFixed(m < 10_000 ? 1 : 0) });
}
function when(lang: Lang, iso: string) {
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

/**
 * The area as rings in a unit box (x right, y down, aspect kept), ready to draw: the biggest pieces first,
 * at most ~240 points in total.
 */
export function unitRings(shape: Shape) {
  const lat0 = shape[0]?.[0]?.[0]?.[1] ?? 0;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const pts = shape.flatMap((poly) => poly.flatMap((ring) => ring.map(([lng, lat]) => [lng * k, lat])));
  if (!pts.length) return { rings: [] as number[][][], aspect: 1 };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1e-9, h = maxY - minY || 1e-9;
  const size = Math.max(w, h);
  const ox = (size - w) / 2, oy = (size - h) / 2;
  const total = pts.length;
  const step = Math.max(1, Math.ceil(total / 240));
  const rings: number[][][] = [];
  for (const poly of shape) {
    poly.forEach((ring) => {
      const out: number[][] = [];
      ring.forEach(([lng, lat], i) => {
        if (i % step && i !== ring.length - 1) return;
        out.push([+((lng * k - minX + ox) / size).toFixed(4), +((maxY - lat + oy) / size).toFixed(4)]);
      });
      if (out.length >= 3) rings.push(out);
    });
  }
  return { rings, aspect: +(w / h).toFixed(3) };
}

/* ───────────── the widget data ───────────── */

export async function widgetData(db: Firestore, uid: string, here: { lat: number; lng: number } | null, now = Date.now()) {
  const u = (await db.doc(`users/${uid}`).get()).data() as UserProfile | undefined;
  if (!u || u.status !== "active") return null;
  const lang = langOf(u);
  const t = (k: string, v?: Record<string, unknown>) => tr(lang, k, v);
  const season = seasonOf(now);

  const [subsSnap, partsSnap, missions, areas, pulse, mine] = await Promise.all([
    db.collection("submissions").where("userId", "==", uid).get(),
    db.collection("participants").where("userId", "==", uid).get(),
    openMissions(db),
    seasonAreas(db, season),
    weekPulse(db),
    db.doc(`territories/${season}_${uid}`).get(),
  ]);

  // Tree, streak, level
  const approved = subsSnap.docs.filter((d) => (d.data() as Submission).verificationStatus === "approved").length;
  const tree = treeOf(approved, u.lastApprovedDay, now);
  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const alive = u.streak > 0 && (u.lastApprovedDay === today || u.lastApprovedDay === yesterday);
  const streak = alive ? u.streak : 0;
  const lp = levelProgress(u.xp);

  // Nearest upcoming mission I have not joined yet
  const joined = new Set(partsSnap.docs.map((d) => (d.data() as { missionId: string }).missionId));
  const upcoming = missions.filter((m) => m.coordinates && Date.parse(m.date) > now && !joined.has(m.id));
  const ranked = upcoming
    .map((m) => ({ m, d: here && m.coordinates ? distanceM(here, m.coordinates) : null }))
    .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : Date.parse(a.m.date) - Date.parse(b.m.date)));
  const near = ranked[0] ?? null;

  // My area this month
  const terr = mine.data() as Territory | undefined;
  const shape = terr && terr.areaM2 > 0 ? decodeShape(terr.shape) : null;
  const sorted = [...areas].sort((a, b) => b.areaM2 - a.areaM2);
  const rank = shape ? sorted.findIndex((a) => a.userId === uid) + 1 : 0;

  return {
    v: 1,
    lang,
    updatedAt: new Date(now).toISOString(),
    name: u.fullName,
    firstName: u.fullName.split(/\s+/)[0] ?? u.fullName,
    color: personColor(uid, u.mapColor),
    streak: {
      days: streak,
      text: streak ? t("wg.streakDays", { n: streak }) : t("wg.streakNone"),
      hint: streak && u.lastApprovedDay !== today ? t("wg.streakToday") : streak ? t("wg.streakSafe") : t("wg.streakStart"),
      safe: u.lastApprovedDay === today,
    },
    level: {
      n: lp.level, title: t("lvl.long", { n: lp.level }), xp: u.xp, from: lp.start, to: lp.next,
      progress: +Math.min(1, Math.max(0, lp.fraction)).toFixed(3), text: `${num(u.xp - lp.start)} / ${num(lp.next - lp.start)} XP`,
    },
    tree: {
      stage: tree.stage, thirst: tree.thirst, count: approved, title: t(`tree.s${tree.stage}`),
      hint: tree.thirst === 2 ? t("tree.dry") : tree.thirst === 1 ? t("tree.thirsty") : tree.next === null ? t("tree.max") : t("tree.next", { n: tree.toNext }),
    },
    mission: near ? {
      id: near.m.id, title: near.m.title, category: near.m.category, categoryText: t(`cat.${near.m.category}`),
      distance: near.d !== null ? distance(lang, near.d) : null, when: when(lang, near.m.date), link: `/app/missions/${near.m.id}`,
    } : null,
    area: shape && terr ? {
      m2: Math.round(terr.areaM2), text: area(terr.areaM2), rank, rankText: rank ? t("wg.rank", { n: rank }) : "", ...unitRings(shape),
    } : null,
    pulse: { ...pulse, missionsText: t("pc.missions"), peopleText: t("pc.people"), hoursText: t("pc.hours") },
    labels: {
      tree: t("tree.title"), streak: t("wg.streak"), level: t("wg.level"), mission: t("wg.mission"), join: t("wg.join"),
      area: t("wg.area"), pulse: t("pc.title"), noMission: t("wg.noMission"), noArea: t("wg.noArea"), walk: t("wg.walk"),
      open: t("wg.open"), signIn: t("wg.signIn"),
    },
  };
}

export type WidgetData = NonNullable<Awaited<ReturnType<typeof widgetData>>>;

export async function handleWidget(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  const url = new URL(req.url);
  const token = req.headers.get("x-widget-token") ?? "";
  if (!token.startsWith("wt_")) return json({ error: "e.signIn" }, 401);
  if (tooMany(`widget:${token.slice(0, 24)}`, 30)) return json({ error: "ai.tooMany" }, 429);
  const db = adminDb();
  const row = (await db.doc(`widgetTokens/${await sha256(token)}`).get()).data() as { userId: string } | undefined;
  if (!row) return json({ error: "e.signIn" }, 401);
  const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
  const here = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
  const data = await widgetData(db, row.userId, here);
  if (!data) return json({ error: "e.signIn" }, 401);
  return json(data);
}
