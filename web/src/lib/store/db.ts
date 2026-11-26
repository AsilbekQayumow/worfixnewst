"use client";
/**
 * Application database (in-memory) with two interchangeable backends:
 *  • LOCAL DEMO MODE (default): persisted to localStorage and seeded with labelled demo data.
 *  • FIREBASE MODE (NEXT_PUBLIC_FIREBASE_* set): kept live from Cloud Firestore, see ./cloud.ts.
 * Every write goes through commit() and the shared domain rules in api.ts.
 */
import { computeMissionReward, crossedCertificateLevels, dayKey, levelForXp } from "../domain/rewards";
import { makeVerificationCode } from "../domain/certificates";
import { sampleCatalog } from "../domain/shop";
import * as cloud from "./cloud";
import { track } from "./outbox";
import type {
  Announcement, AuditLog, Certificate, Cheer, Friendship, Group, GroupMessage, HelpSignal, Message, Mission, MissionParticipant, NewsPost, Notification,
  Order, Organization, PromoCode, ShopItem, Submission, UserProfile, VerificationRecord, Territory, TerritoryCapture, GroupRequest,
} from "../domain/types";
import { makeGroupCode } from "../domain/community";
import type { Report } from "../domain/reports";
import type { Challenge, ChallengeProgress } from "../domain/challenges";
import type { Rating } from "../domain/ratings";
import type { ReminderLog } from "../domain/reminders";

/** v6: following an organization (id `${userId}_${orgId}`). */
export interface OrgFollow { id: string; userId: string; orgId: string; notify: boolean; createdAt: string }
/** v6: a private note on a diary entry (id = the submission id). */
export interface DiaryNote { id: string; userId: string; text: string; updatedAt: string }
import { bboxOf, centerOf, encodeShape, loopAround, seasonOf, traceToShape } from "../domain/territory";

/** v3: invite code → group (the code is the document id, so it cannot be listed, only looked up). */
export interface GroupCode { id: string; groupId: string; createdAt: string }
/** v3: proof that a member joined with a valid code (checked by the security rules). */
/** v3.2: or with an approved join request (`code` is then empty and `requestId` is set). */
export interface GroupJoin { id: string; groupId: string; userId: string; code: string; createdAt: string; requestId?: string | null }

export interface Credential { userId: string; salt: string; hash: string }
export interface Token { token: string; userId: string; kind: "verify" | "reset"; expiresAt: string }

export interface DB {
  version: 2;
  users: UserProfile[];
  organizations: Organization[];
  missions: Mission[];
  participants: MissionParticipant[];
  submissions: Submission[];
  records: VerificationRecord[];
  certificates: Certificate[];
  notifications: Notification[];
  audits: AuditLog[];
  friendships: Friendship[];
  cheers: Cheer[];
  shopItems: ShopItem[];
  orders: Order[];
  messages: Message[];
  announcements: Announcement[];
  news: NewsPost[];
  groups: Group[];
  groupCodes: GroupCode[];
  groupJoins: GroupJoin[];
  groupMessages: GroupMessage[];
  helpSignals: HelpSignal[];
  territories: Territory[];
  territoryCaptures: TerritoryCapture[];
  groupRequests: GroupRequest[];
  promoCodes: PromoCode[];
  /** v6 */
  reports: Report[];
  challenges: Challenge[];
  challengeProgress: ChallengeProgress[];
  ratings: Rating[];
  orgFollows: OrgFollow[];
  diaryNotes: DiaryNote[];
  reminderLog: ReminderLog[];
  credentials: Credential[];
  tokens: Token[];
  loginAttempts: Record<string, { count: number; first: number }>;
}

export const FIREBASE = cloud.FIREBASE_ENABLED;

const KEY = "worfix.v2.db";
export const SESSION_KEY = "worfix.v2.session";
const listeners = new Set<() => void>();
let cache: DB | null = null;
let version = 0;
let initPromise: Promise<void> | null = null;

export const DEMO_ACCOUNTS = [
  { label: "volunteer", email: "vol@demo.worfix.uz", password: "Volunteer-1" },
  { label: "organization", email: "org@demo.worfix.uz", password: "Organizer-1" },
  { label: "admin", email: "admin@demo.worfix.uz", password: "Moderator-1" },
] as const;

export const uid = () => globalThis.crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));

export async function sha256Hex(data: ArrayBuffer | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, salt = b64(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100_000, hash: "SHA-256" }, key, 256);
  return { salt, hash: b64(bits) };
}

function empty(): DB {
  return {
    version: 2, users: [], organizations: [], missions: [], participants: [], submissions: [], records: [], certificates: [], notifications: [],
    audits: [], friendships: [], cheers: [], shopItems: [], orders: [], messages: [], announcements: [],
    news: [], groups: [], groupCodes: [], groupJoins: [], groupMessages: [], helpSignals: [], territories: [], territoryCaptures: [], groupRequests: [], promoCodes: [], reports: [], challenges: [], challengeProgress: [], ratings: [], orgFollows: [], diaryNotes: [], reminderLog: [], credentials: [], tokens: [], loginAttempts: {},
  };
}

function load(): DB {
  if (cache) return cache;
  if (FIREBASE) return (cache = empty());
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? ({ ...empty(), ...(JSON.parse(raw) as DB) }) : empty();
  } catch {
    cache = empty();
  }
  return cache;
}

export const getDB = () => load();

/**
 * Applies a change to the in-memory database. Returns a promise that settles when the change is saved
 * (immediately in local mode; after the Firestore batch in Firebase mode).
 */
export function commit(mutator: (db: DB) => void): Promise<void> {
  const db = load();
  const snapshot = JSON.stringify(db);
  let saved: Promise<void> = Promise.resolve();
  const audits = db.audits.length;
  try {
    mutator(db);
    // v6: offline or slow → the write waits in Firestore's persistent queue and shows in "Not sent yet"
    if (FIREBASE) saved = track(cloud.push(JSON.parse(snapshot) as cloud.Snapshot, db as unknown as cloud.Snapshot), db.audits.length > audits ? db.audits[0].action : "change");
    else localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    cache = JSON.parse(snapshot) as DB;
    if (e instanceof DOMException && e.name === "QuotaExceededError") throw new Error("e.storageFull");
    throw e;
  }
  version++;
  listeners.forEach((l) => l());
  return saved;
}

export function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { cache = null; version++; l(); }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}
export const getVersion = () => version;

const syncErrorListeners = new Set<(key: string) => void>();
export function onSyncError(l: (key: string) => void) {
  syncErrorListeners.add(l);
  return () => void syncErrorListeners.delete(l);
}
const newestFirst = (key: string) => (a: Record<string, string>, b: Record<string, string>) => Date.parse(b[key]) - Date.parse(a[key]);

function startCloud() {
  return cloud.start({
    onData(name, docs) {
      const db = load() as unknown as Record<string, unknown[]>;
      if (name === "notifications") (docs as unknown as Record<string, string>[]).sort(newestFirst("createdAt"));
      if (name === "audits") (docs as unknown as Record<string, string>[]).sort(newestFirst("timestamp"));
      if (name === "news" || name === "helpSignals") (docs as unknown as Record<string, string>[]).sort(newestFirst("createdAt"));
      db[name] = docs;
      version++;
      listeners.forEach((l) => l());
    },
    onError(key) { syncErrorListeners.forEach((l) => l(key)); },
  });
}

export function resetDemoData() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(SESSION_KEY);
  cache = null;
  initPromise = null;
  version++;
  listeners.forEach((l) => l());
}

/** Idempotent. Seeds clearly labelled demo data on first run (local mode only). */
export function ready() {
  if (FIREBASE) return (initPromise ??= startCloud());
  initPromise ??= (async () => {
    const db = load();
    if (db.users.length > 0) return;
    await seed(db);
    localStorage.setItem(KEY, JSON.stringify(db));
    version++;
  })();
  return initPromise;
}

/* ───────────────────────── demo seed ───────────────────────── */

async function seed(db: DB) {
  const t = nowIso();
  const day = 86_400_000;
  const ago = (d: number) => new Date(Date.now() - d * day).toISOString();
  const at = (d: number, h: number) => { const x = new Date(Date.now() + d * day); x.setHours(h, 0, 0, 0); return x.toISOString(); };

  const person = (over: Partial<UserProfile>): UserProfile => ({
    id: uid(), email: "", emailVerified: true, fullName: "", username: "", avatar: null, bio: "", country: "Uzbekistan",
    province: "Samarqand Region", city: "Samarqand", feedVisible: true, languages: ["O'zbek", "Русский"], skills: [], interests: ["environment"],
    level: 1, xp: 0, points: 0, trustScore: 50, reputation: 0, streak: 0, lastApprovedDay: null, totalVolunteerHours: 0, totalImpact: 0,
    impact: {}, onboarded: true, organizationId: null, role: "volunteer", status: "active", createdAt: ago(60), updatedAt: t, lastLogin: null,
    language: "uz", privacy: "public", phone: "", birthYear: null, district: "Samarqand shahri", mahalla: "Registon", authProvider: "email", ...over,
  });

  const orgId = uid();
  const vol = person({ email: DEMO_ACCOUNTS[0].email, fullName: "Dilnoza Rahimova", username: "dilnoza", bio: "Hafta oxirlari daraxt ekaman va daryo bo'yini tozalayman.", interests: ["environment", "water", "animals"], skills: ["Birinchi yordam", "Ingliz tili"], birthYear: 2004, mahalla: "Bog‘ishamol" });
  const orgUser = person({ email: DEMO_ACCOUNTS[1].email, fullName: "Bekzod Tursunov", username: "bekzod_org", role: "organization", organizationId: orgId });
  const admin = person({ email: DEMO_ACCOUNTS[2].email, fullName: "WORFIX moderatori", username: "moderator", role: "admin" });
  db.users.push(vol, orgUser, admin);
  for (const u of [vol, orgUser, admin]) {
    const pw = DEMO_ACCOUNTS.find((a) => a.email === u.email)!.password;
    db.credentials.push({ userId: u.id, ...(await hashPassword(pw)) });
  }
  db.organizations.push({
    id: orgId, name: "Yashil Samarqand (demo)", logo: null,
    description: "Namoyish uchun tashkilot: shahar bog'lari, ariqlar va mahallalarda ko'ngillilar missiyalarini o'tkazadi. Haqiqiy NNT emas.",
    website: "", email: "org@demo.worfix.uz", phone: "+998 66 000 00 00", address: "Universitet xiyoboni, Samarqand", country: "Uzbekistan",
    city: "Samarqand", organizationType: "NNT", verificationStatus: "approved", verificationNote: "", ownerId: orgUser.id, members: [orgUser.id],
    rating: 0, totalVolunteers: 0, totalMissions: 0, createdAt: ago(90),
  });

  const mission = (o: {
    title: string; category: Mission["category"]; difficulty: Mission["difficulty"]; duration: number; location: string; lat: number; lng: number;
    date: string; deadline: string; capacity: number; featured?: boolean; description: string; impact: [string, number]; status?: Mission["status"]; checklist?: string[];
  }): Mission => {
    const m: Mission = {
      id: uid(), organizationId: orgId, title: o.title, description: o.description, category: o.category, difficulty: o.difficulty,
      ...computeMissionReward(o.difficulty), location: o.location, coordinates: { lat: o.lat, lng: o.lng }, date: o.date, deadline: o.deadline,
      duration: o.duration, capacity: o.capacity, participantsCount: 0, status: o.status ?? "published", featured: o.featured ?? false,
      requirements: "Yopiq poyabzal va suv. 15–17 yoshdagilar ota-onasi roziligi bilan.",
      safety: "Koordinator ko'rsatmalariga amal qiling, juft bo'lib ishlang, o'zingizni yomon his qilsangiz to'xtang.",
      equipment: "Qo'lqop va asboblar beriladi.", impactMetrics: [{ label: o.impact[0], amountPerVolunteer: o.impact[1] }], moderationNote: "",
      isDemo: true, createdAt: ago(20), updatedAt: t, source: "organization", ownerId: null, radiusM: 400,
      checklist: o.checklist ?? ["Ishdan oldin joyni suratga oldim", "Ishni koordinator bilan yakunladim", "Ishdan keyingi holatni suratga oldim"],
    };
    db.missions.push(m);
    return m;
  };

  mission({ title: "Universitet xiyobonida chinor ko'chatlari", category: "environment", difficulty: "medium", duration: 180, location: "Universitet xiyoboni, Samarqand", lat: 39.6542, lng: 66.9597, date: at(4, 9), deadline: at(3, 18), capacity: 25, featured: true, description: "Xiyobon bo'ylab yosh chinor ko'chatlarini ekamiz va sug'oramiz. Har bir ko'ngilli ikki-uch ko'chat bilan ishlaydi, koordinator ekish chuqurligini ko'rsatadi.", impact: ["ko'chat ekildi", 3] });
  mission({ title: "Siyob ariqi bo'yini tozalash", category: "water", difficulty: "easy", duration: 120, location: "Siyob ariqi, Siyob bozori yonida", lat: 39.6626, lng: 66.9851, date: at(2, 8), deadline: at(1, 20), capacity: 40, featured: true, description: "Ariq qirg'og'idagi plastik va shishalarni yig'amiz, qayta ishlanadiganlarini ajratamiz. Yakunda hammasi tortiladi va hisobga olinadi.", impact: ["kg chiqindi yig'ildi", 8] });
  mission({ title: "Mahalla kutubxonasida o'qish soati", category: "education", difficulty: "easy", duration: 90, location: "Bog'ishamol mahallasi kutubxonasi", lat: 39.6710, lng: 66.9440, date: at(6, 15), deadline: at(5, 18), capacity: 12, description: "Boshlang'ich sinf bolalari bilan kitob o'qiymiz, ingliz va o'zbek tilida so'z o'yinlari o'tkazamiz.", impact: ["bolaga yordam", 2] });
  mission({ title: "Hayvonlar boshpanasida sayr kuni", category: "animals", difficulty: "easy", duration: 120, location: "Hayvonlar boshpanasi, Kattaqo'rg'on yo'li", lat: 39.6380, lng: 66.9020, date: at(8, 10), deadline: at(7, 18), capacity: 15, description: "Boshpanadagi itlarni sayr qildiramiz, tarab tozalaymiz va odamlarga o'rgatamiz. Tajriba shart emas, xodimlar avval tushuntiradi.", impact: ["itga g'amxo'rlik", 2] });
  mission({ title: "Qayta ishlash punktida saralash", category: "recycling", difficulty: "medium", duration: 240, location: "Qayta ishlash punkti, Mirzo Ulug'bek ko'chasi", lat: 39.6455, lng: 66.9330, date: at(10, 9), deadline: at(9, 18), capacity: 30, description: "Qog'oz, plastik va shishani saralaymiz hamda aholiga nima qayerga tashlanishini tushuntiramiz.", impact: ["kg qayta ishlandi", 20] });
  mission({ title: "Keksa qo'shnilarga yordam tashriflari", category: "community", difficulty: "hard", duration: 180, location: "Registon mahallasi markazi", lat: 39.6547, lng: 66.9758, date: at(12, 10), deadline: at(11, 18), capacity: 10, description: "Yolg'iz yashovchi keksalarga xarid va kichik yumushlarda yordam beramiz. Faqat juftlikda; tashriflarni koordinator taqsimlaydi.", impact: ["keksaga yordam", 2] });
  mission({ title: "Ulug'bek rasadxonasi atrofida ekoyo'lak", category: "environment", difficulty: "hard", duration: 300, location: "Ulug'bek rasadxonasi tepaligi", lat: 39.6745, lng: 67.0055, date: at(15, 8), deadline: at(13, 18), capacity: 20, description: "Tepalik yonbag'riga yo'lak belgilari qo'yamiz, eroziyaga qarshi tosh to'siqlar terib, yo'l bo'yidagi chiqindini yig'amiz.", impact: ["metr yo'lak", 15] });

  const past = (title: string, category: Mission["category"], difficulty: Mission["difficulty"], duration: number, location: string, lat: number, lng: number, daysAgo: number, impact: [string, number]) =>
    mission({ title, category, difficulty, duration, location, lat, lng, date: ago(daysAgo), deadline: ago(daysAgo + 1), capacity: 20, description: "Yakunlangan namoyish missiyasi. Natijalar tekshirilgan.", impact, status: "closed" });

  const p1 = past("Bog'ishamol bog'ida daraxt ekish", "environment", "medium", 180, "Bog'ishamol bog'i", 39.6720, 66.9420, 3, ["ko'chat ekildi", 3]);
  const p2 = past("Ariq bo'yida chiqindi yig'ish", "water", "easy", 120, "Siyob ariqi", 39.6626, 66.9851, 6, ["kg chiqindi yig'ildi", 6]);
  const p3 = past("Birinchi sinflar bilan ertak soati", "education", "easy", 90, "41-maktab kutubxonasi", 39.6500, 66.9600, 9, ["bolaga yordam", 2]);
  const p4 = past("Boshpanani tozalash kuni", "animals", "medium", 150, "Hayvonlar boshpanasi", 39.6380, 66.9020, 12, ["itga g'amxo'rlik", 2]);
  const p5 = past("Dashtda tog' yo'lini tiklash", "environment", "hard", 300, "Ohalik tog' yo'li", 39.5890, 66.8790, 16, ["metr yo'lak", 20]);

  const friends = [
    person({ email: "aziza@demo.worfix.uz", fullName: "Aziza Karimova", username: "aziza_k", bio: "Ko'chat ekishni yaxshi ko'raman.", interests: ["environment", "water"], mahalla: "Bog‘ishamol" }),
    person({ email: "timur@demo.worfix.uz", fullName: "Timur Rahimov", username: "timur", bio: "Ariqlar va qayta ishlash.", interests: ["water", "recycling"] }),
    person({ email: "malika@demo.worfix.uz", fullName: "Malika Yusupova", username: "malika", province: "Tashkent", city: "Tashkent", district: "Chilonzor", mahalla: "Navro‘z", bio: "Bolalar bilan kitob o'qiyman.", interests: ["education", "community"], privacy: "friends" }),
    person({ email: "jasur@demo.worfix.uz", fullName: "Jasur Aliyev", username: "jasur", province: "Bukhara Region", city: "Bukhara", district: "Buxoro shahri", mahalla: "Ko‘hna shahar", bio: "Boshpanadagi itlar bilan sayr.", interests: ["animals"] }),
  ];
  db.users.push(...friends);
  const [aziza, timur, malika, jasur] = friends;

  const done = (u: UserProfile, m: Mission, daysAgo: number, notes: string) => {
    const ts = ago(daysAgo);
    db.participants.push({ id: `${m.id}_${u.id}`, missionId: m.id, userId: u.id, joinedAt: ago(daysAgo + 3), status: "accepted", attendance: true, completionStatus: "completed", teamId: null, startedAt: ts, startGps: null });
    const r = computeMissionReward(m.difficulty);
    const before = u.xp;
    u.xp += r.rewardXP;
    u.points += r.rewardPoints;
    u.level = levelForXp(u.xp);
    u.totalVolunteerHours = Math.round((u.totalVolunteerHours + m.duration / 60) * 100) / 100;
    for (const im of m.impactMetrics) { u.impact[im.label] = (u.impact[im.label] ?? 0) + im.amountPerVolunteer; u.totalImpact += im.amountPerVolunteer; }
    u.streak = 1;
    u.lastApprovedDay = dayKey(ts);
    m.participantsCount += 1;
    let certId: string | null = null;
    for (const level of crossedCertificateLevels(before, u.xp)) {
      const code = makeVerificationCode();
      certId = uid();
      db.certificates.push({
        id: certId, userId: u.id, missionId: m.id, organizationId: orgId, certificateType: "level", qrCode: `/verify/${code}`, verificationCode: code,
        issuedAt: ts, pdfUrl: null, holderName: u.fullName, missionTitle: m.title, organizationName: "WORFIX", hours: u.totalVolunteerHours, xp: u.xp, level,
      });
    }
    const s: Submission = {
      id: uid(), missionId: m.id, userId: u.id, organizationId: orgId, images: [], videos: [], notes, gps: null, gpsConsent: false, timestamp: ts,
      metadata: { userAgent: "demo", submissionCount: 1 }, aiConfidence: null, fraudScore: 0, fraudFlags: [], verificationStatus: "approved",
      reviewedBy: orgUser.id, reviewedAt: ts, reviewNote: "", rewardGrantedAt: ts, certificateId: certId, checks: [], aiNotes: "", checklistDone: [], teamId: null,
    };
    db.submissions.push(s);
    return s;
  };

  done(vol, p5, 16, "Yo'lakning 20 metrini tosh bilan mustahkamladik.");
  done(vol, p1, 3, "Uchta chinor ko'chati ekdim, butun qatorni sug'ordik.");
  const s1 = done(aziza, p1, 3, "Favvora yonida uchta ko'chat ekib, sug'ordim.");
  const s2 = done(timur, p1, 3, "Ertalabki jamoa bilan chuqurlar qazidik.");
  const s3 = done(timur, p2, 6, "Ariq bo'yidan ikki qop plastik idish yig'dik.");
  done(aziza, p2, 6, "Tortish joyida qayta ishlanadiganlarni ajratdim.");
  done(timur, p5, 16, "Tosh to'siqlarni terdik.");
  const s5 = done(malika, p3, 9, "Ikki kitob o'qidik, bolalar bilan ranglarni ingliz tilida takrorladik.");
  done(jasur, p4, 12, "Reks va Bellani sayr qildirdim, keyin vol'yerlarni tozaladim.");

  const cheer = (s: Submission, u: UserProfile) => db.cheers.push({ id: `${s.id}_${u.id}`, submissionId: s.id, userId: u.id, createdAt: s.timestamp });
  cheer(s1, timur); cheer(s1, malika); cheer(s2, aziza); cheer(s3, aziza); cheer(s3, jasur); cheer(s5, aziza);

  db.friendships.push(
    { id: `${aziza.id}_${timur.id}`, from: aziza.id, to: timur.id, status: "accepted", createdAt: ago(20) },
    { id: `${timur.id}_${vol.id}`, from: timur.id, to: vol.id, status: "accepted", createdAt: ago(14) },
    { id: `${malika.id}_${vol.id}`, from: malika.id, to: vol.id, status: "accepted", createdAt: ago(10) },
    { id: `${aziza.id}_${vol.id}`, from: aziza.id, to: vol.id, status: "pending", createdAt: ago(1) },
  );

  const chat = [vol.id, timur.id].sort().join("_");
  const msg = (from: string, text: string, minsAgo: number) =>
    db.messages.push({ id: uid(), chatId: chat, participants: [vol.id, timur.id].sort() as [string, string], from, text, kind: "text", missionId: null, readBy: [from, ...(minsAgo > 30 ? [vol.id] : [])], createdAt: new Date(Date.now() - minsAgo * 60_000).toISOString() });
  msg(timur.id, "Salom! Shanba kuni ariq bo'yida tozalash bor, borasanmi?", 180);
  msg(vol.id, "Albatta. Qo'lqopni o'zim olib boraman", 170);
  msg(timur.id, "Zo'r, ertalab 8 da Siyob bozori oldida uchrashamiz", 25);

  db.notifications.unshift(
    { id: uid(), userId: vol.id, type: "system", title: "n.friendRequest", message: JSON.stringify({ name: aziza.fullName }), link: "/app/friends", read: false, createdAt: ago(1) },
  );
  db.shopItems.push(...sampleCatalog(t));

  // v3: a group with a chat, a help signal, news and a promo-code item.
  const groupId = uid();
  const code = makeGroupCode();
  db.groups.push({
    id: groupId, name: "Yashil Bog‘ishamol", description: "Mahallamizdagi bog‘ va ariqlarni birga parvarish qilamiz.", color: "#0a6a2c", ownerId: timur.id,
    members: [timur.id, vol.id, aziza.id], province: "Samarqand Region", district: "Samarqand shahri", mahalla: "Bog‘ishamol", createdAt: ago(25),
  });
  db.groupCodes.push({ id: code, groupId, createdAt: ago(25) });
  for (const s of db.submissions) if ([vol.id, timur.id, aziza.id].includes(s.userId)) s.groupId = groupId;
  const gmsg = (from: string, text: string, minsAgo: number) => db.groupMessages.push({
    id: uid(), groupId, from, text, kind: "text", signalId: null, readBy: [from], createdAt: new Date(Date.now() - minsAgo * 60_000).toISOString(),
    reactions: {}, replyTo: null, editedAt: null, deletedAt: null,
  });
  gmsg(timur.id, "Bu hafta ariq bo‘yini tozalashga chiqamiz, kim bor?", 300);
  gmsg(aziza.id, "Men boraman, qoplarni olaman", 240);
  // v3.1: Malika runs a reading group in Tashkent and has invited the demo volunteer in chat.
  const readersId = uid();
  const readersCode = makeGroupCode();
  db.groups.push({
    id: readersId, name: "Kitob do‘stlari", description: "Maktab kutubxonalarida bolalar bilan ertak va kitob soatlari o‘tkazamiz.", color: "#1d5fa8", ownerId: malika.id,
    members: [malika.id], province: "Tashkent", district: "Chilonzor", mahalla: "Navro‘z", createdAt: ago(8),
  });
  db.groupCodes.push({ id: readersCode, groupId: readersId, createdAt: ago(8) });
  const mchat = [vol.id, malika.id].sort().join("_");
  db.messages.push({
    id: uid(), chatId: mchat, participants: [vol.id, malika.id].sort() as [string, string], from: malika.id, text: "Kitob do‘stlari", kind: "group_invite",
    missionId: null, readBy: [malika.id], createdAt: new Date(Date.now() - 95 * 60_000).toISOString(), reactions: {}, replyTo: null, editedAt: null, deletedAt: null, via: null,
    group: { id: readersId, name: "Kitob do‘stlari", color: "#1d5fa8", code: readersCode }, inviteStatus: null,
  });
  db.helpSignals.push({
    id: uid(), userId: timur.id, groupId, missionId: null, title: "Ariq bo‘yi — qo‘l kerak", note: "Plastik ko‘p, yana 2–3 kishi kerak.",
    location: { lat: 39.6626, lng: 66.9851 }, place: "Siyob ariqi", radiusKm: 2, province: "Samarqand Region", district: "Samarqand shahri", city: "Samarqand",
    responders: [aziza.id], status: "open", createdAt: new Date(Date.now() - 40 * 60_000).toISOString(), expiresAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
  });
  db.news.push({
    id: uid(), title: "WORFIX endi guruhlar bilan", summary: "Do‘stlaringiz bilan guruh tuzing, mahalla ligasida birga ko‘tariling.",
    body: "Endi ko‘ngillilar guruh tuzib, QR kod orqali do‘stlarini taklif qilishi mumkin. Guruh a’zolari bajargan missiyalar guruh XP siga qo‘shiladi va mahalla, tuman, viloyat hamda respublika reytinglarida ko‘rinadi.\n\nYordam kerak bo‘lsa, “Yordam chaqirish” tugmasi yaqin atrofdagi ko‘ngillilarga signal yuboradi.",
    cover: null, category: "update", audience: "all", status: "published", pinned: true, publishAt: ago(1), link: "/app/chat?tab=groups", authorId: admin.id, createdAt: ago(1), updatedAt: ago(1),
  });
  // v3.2: this month's areas around Samarkand — the group holds the Siyob canal, Jasur the university avenue,
  // Dilnoza a small block with a mission that is waiting for her. Two fresh missions show the "first look".
  const area = (userId: string, groupId: string | null, lat: number, lng: number, r: number, days: number) => {
    const res = traceToShape(loopAround({ lat, lng }, r, 40, Date.now() - days * 86_400_000, 6));
    if ("error" in res) return;
    db.territories.push({
      id: `${seasonOf()}_${userId}`, userId, groupId, season: seasonOf(), shape: encodeShape(res.shape), areaM2: res.areaM2, center: centerOf(res.shape), bbox: bboxOf(res.shape),
      captures: 1, lostM2: 0, createdAt: ago(days), updatedAt: ago(days), decayCheckedAt: new Date().toISOString(), takenNotice: null,
    });
  };
  area(timur.id, groupId, 39.6626, 66.9851, 260, 6);
  area(aziza.id, groupId, 39.6712, 66.9446, 190, 4);
  area(jasur.id, null, 39.6542, 66.9597, 230, 3);
  area(vol.id, groupId, 39.6478, 66.9712, 150, 2);
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const fresh = mission({ title: "Bog‘ishamol ko‘chasida gul ekish", category: "environment", difficulty: "easy", duration: 90, location: "Bog‘ishamol ko‘chasi, Siyob yonida", lat: 39.6640, lng: 66.9832, date: at(3, 10), deadline: at(2, 18), capacity: 12, description: "Ko‘cha bo‘yidagi gulzorga ko‘chat ekamiz va sug‘oramiz. Asboblar beriladi.", impact: ["ko‘chat ekildi", 4] });
  fresh.publishedAt = hoursAgo(1);
  fresh.createdAt = hoursAgo(2);
  const hidden = mission({ title: "Xiyobondagi skameykalarni bo‘yash", category: "community", difficulty: "easy", duration: 120, location: "Universitet xiyoboni, janubiy qism", lat: 39.6528, lng: 66.9590, date: at(5, 10), deadline: at(4, 18), capacity: 10, description: "Eski skameykalarni tozalab, qayta bo‘yaymiz.", impact: ["skameyka", 1] });
  hidden.publishedAt = hoursAgo(2);
  const waiting = mission({ title: "Hovlidagi maysazorni tozalash", category: "recycling", difficulty: "easy", duration: 60, location: "Registon ko‘chasi hovlisi", lat: 39.6482, lng: 66.9716, date: at(4, 16), deadline: at(3, 18), capacity: 8, description: "Hovlidagi chiqindini yig‘ib, saralaymiz.", impact: ["kg chiqindi", 3] });
  waiting.publishedAt = hoursAgo(30);
  waiting.createdAt = hoursAgo(31);

  const promoItem: ShopItem = {
    id: "promo-books-1y", title: { uz: "Kitob obunasi · 1 yil", ru: "Подписка на книги · 1 год", en: "Book subscription · 1 year" },
    description: { uz: "Hamkor kutubxonaning onlayn obunasi. Xariddan keyin promo-kod beriladi.", ru: "Онлайн-подписка партнёрской библиотеки. После покупки выдаётся промокод.", en: "A partner library's online subscription. You get a promo code after buying." },
    price: 100, kind: "digital", art: "ticket", stock: 3, active: true, createdAt: t, image: null, delivery: "promo",
  };
  db.shopItems.push(promoItem);
  for (const c of ["WRFX-7Q2K-BOOK", "WRFX-9M4D-BOOK", "WRFX-3H8T-BOOK"]) db.promoCodes.push({ id: uid(), itemId: promoItem.id, code: c, orderId: null, userId: null, createdAt: t, issuedAt: null });
  // v6: skills (Dilnoza can be found by organizations), skills wanted on two missions, a live monthly challenge, a follow
  vol.skillSet = [{ id: "first_aid", level: "experienced", proof: "self" }, { id: "lang_en", level: "beginner", proof: "self" }, { id: "tree_planting", level: "experienced", proof: "self" }];
  vol.discoverable = true;
  const orgMissions = db.missions.filter((m) => m.organizationId === orgId);
  if (orgMissions[0]) orgMissions[0].skillsWanted = [{ skillId: "tree_planting", required: false }, { skillId: "gardening", required: false }];
  if (orgMissions[1]) orgMissions[1].skillsWanted = [{ skillId: "first_aid", required: false }];
  const now = new Date();
  db.challenges.push({
    id: uid(), title: { uz: "Kuzgi yashil oy", ru: "Осенний зелёный месяц", en: "Green autumn month" }, theme: "environment",
    startsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5 * 3_600_000).toISOString(),
    endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 5 * 3_600_000).toISOString(),
    goal: { metric: "missions", target: 5, per: "person" }, status: "live", sponsorOrgId: null, createdBy: admin.id, createdAt: ago(10),
    tiers: [{ at: 1, rewardXP: 30, rewardPoints: 10, badgeId: "tier1" }, { at: 3, rewardXP: 80, rewardPoints: 30, badgeId: "tier2" }, { at: 5, rewardXP: 150, rewardPoints: 60, badgeId: "tier3" }],
  });
  db.orgFollows.push({ id: `${vol.id}_${orgId}`, userId: vol.id, orgId, notify: true, createdAt: ago(20) });
  db.organizations.find((o) => o.id === orgId)!.followers = 1;
  db.audits.push({ id: uid(), actor: "system", actorRole: "system", action: "seed.demo", resource: "system", resourceId: "demo", timestamp: t, detail: "", ipAddress: null, device: null });
}
