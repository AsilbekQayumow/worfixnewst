"use client";
/**
 * FIREBASE MODE — Firebase Auth + Cloud Firestore (same project, same collections as before).
 *
 * Active when NEXT_PUBLIC_FIREBASE_* is set; otherwise the browser-local demo store is used.
 * The in-memory database (db.ts) is kept live with onSnapshot listeners and every commit() writes only the
 * documents it changed, in atomic batches. firestore.rules guards roles, rewards and approvals.
 */
import { getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  updatePassword, type Auth, type User,
} from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDocFromServer, getFirestore, initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager, query, waitForPendingWrites, where, writeBatch, type Firestore, type Query, type Unsubscribe } from "firebase/firestore";
import { clearWaiting } from "./outbox";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const FIREBASE_ENABLED = Boolean(config.apiKey && config.projectId && config.appId);

/** Readable while signed out: what the public website shows. */
const PUBLIC = ["missions", "organizations", "certificates", "shopItems", "challenges"] as const;
const PRIVATE = [
  "users", "participants", "submissions", "records", "notifications", "audits", "friendships", "cheers", "orders", "messages", "announcements",
  "news", "groups", "groupJoins", "helpSignals", "promoCodes", "territories", "territoryCaptures", "groupRequests",
  // v6
  "reports", "challengeProgress", "ratings", "orgFollows", "diaryNotes", "reminderLog",
] as const;
/** v3: read per group the signed-in user belongs to (see followGroups). */
const PER_GROUP = ["groupMessages", "groupCodes"] as const;
export const SYNCED = [...PUBLIC, ...PRIVATE, ...PER_GROUP] as const;
export type SyncedName = (typeof SYNCED)[number];
type Doc = { id: string };
export type Snapshot = Record<SyncedName, Doc[]>;

let auth: Auth;
let fs: Firestore;
function init() {
  if (!auth) {
    const app = getApps()[0] ?? initializeApp(config);
    auth = getAuth(app);
    // v6 (offline): seen data and queued writes survive a reload, in IndexedDB, shared across tabs
    try { fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
    catch { fs = getFirestore(app); }
    if (typeof window !== "undefined") {
      const settle = () => { if (navigator.onLine) void waitForPendingWrites(fs).then(clearWaiting).catch(() => undefined); };
      window.addEventListener("online", settle);
      settle();
    }
    // Local testing only: NEXT_PUBLIC_FIREBASE_EMULATOR=127.0.0.1 points the app at the Firebase emulators.
    const emu = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR;
    if (emu && (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ALLOW_EMULATOR === "1")) {
      connectAuthEmulator(auth, `http://${emu}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(fs, emu, 8085);
    }
  }
}

let started: Promise<void> | null = null;
let authUser: User | null = null;
let privateUnsubs: Unsubscribe[] = [];
let privateReady: Promise<void> = Promise.resolve();
let handlers: { onData: (name: SyncedName, docs: Doc[]) => void; onError: (message: string) => void };

/**
 * The query for a collection. Some collections are read whole by admins and filtered for everyone else:
 * the whole-collection query is tried first and, when the rules deny it, the filtered one is used.
 */
function refsFor(name: SyncedName, uid?: string): Query[] {
  const c = collection(fs, name);
  if (!uid) return [c];
  if (name === "notifications" || name === "groupJoins" || name === "diaryNotes" || name === "reminderLog") return [query(c, where("userId", "==", uid))];
  // v6: admins read every report and follow; everyone else only their own
  if (name === "reports") return [c, query(c, where("reporterId", "==", uid))];
  if (name === "orgFollows") return [c, query(c, where("userId", "==", uid))];
  if (name === "orders" || name === "promoCodes" || name === "territoryCaptures") return [c, query(c, where("userId", "==", uid))];
  // v3.2: only this month's areas
  if (name === "territories") return [query(c, where("season", "==", new Date().toISOString().slice(0, 7)))];
  if (name === "news") return [c, query(c, where("status", "==", "published"))];
  if (name === "messages") return [query(c, where("participants", "array-contains", uid))];
  return [c];
}

function listen(name: SyncedName, uid?: string, refs: Query[] = refsFor(name, uid)) {
  let done!: () => void;
  const first = new Promise<void>((r) => (done = r));
  let unsub: Unsubscribe = () => {};
  const attempt = (i: number) => {
    unsub = onSnapshot(
      refs[i],
      (snap) => { handlers.onData(name, snap.docs.map((d) => d.data() as Doc)); done(); },
      (err) => {
        if (err.code === "permission-denied" && i + 1 < refs.length) { attempt(i + 1); return; }
        if (err.code !== "permission-denied") console.warn(`[worfix] listener "${name}" failed:`, err.message);
        handlers.onData(name, []);
        done();
      },
    );
  };
  attempt(0);
  return { unsub: () => unsub(), first };
}

/* v3: group chats and invite codes are readable by members only, one query per group. */
let groupSubs = new Map<string, Unsubscribe[]>();
const perGroup: Record<(typeof PER_GROUP)[number], Map<string, Doc[]>> = { groupMessages: new Map(), groupCodes: new Map() };
function emitPerGroup() {
  for (const name of PER_GROUP) handlers.onData(name, [...perGroup[name].values()].flat());
}
function followGroups(groups: Doc[]) {
  const uid = authUser?.uid;
  const mine = new Set(uid ? (groups as unknown as { id: string; members: string[] }[]).filter((g) => g.members?.includes(uid)).map((g) => g.id) : []);
  for (const [id, subs] of groupSubs) {
    if (mine.has(id)) continue;
    subs.forEach((f) => f());
    groupSubs.delete(id);
    for (const name of PER_GROUP) perGroup[name].delete(id);
  }
  for (const id of mine) {
    if (groupSubs.has(id)) continue;
    groupSubs.set(id, PER_GROUP.map((name) => onSnapshot(
      query(collection(fs, name), where("groupId", "==", id)),
      (snap) => { perGroup[name].set(id, snap.docs.map((d) => d.data() as Doc)); emitPerGroup(); },
      () => { perGroup[name].set(id, []); emitPerGroup(); },
    )));
  }
  emitPerGroup();
}
function stopGroups() {
  groupSubs.forEach((subs) => subs.forEach((f) => f()));
  groupSubs = new Map();
  for (const name of PER_GROUP) perGroup[name].clear();
}

/** One document straight from the server (null when missing or not readable). */
export async function fetchDoc<T>(name: string, id: string): Promise<T | null> {
  init();
  try { const d = await getDocFromServer(doc(fs, name, id)); return d.exists() ? (d.data() as T) : null; } catch { return null; }
}

/** The signed-in user's ID token, for the server functions. */
export async function idToken() {
  return authUser ? authUser.getIdToken() : null;
}

export function start(h: typeof handlers) {
  started ??= (async () => {
    init();
    handlers = {
      ...h,
      onData(name, docs) { h.onData(name, docs); if (name === "groups") followGroups(docs); },
    };
    const pub = PUBLIC.map((n) => listen(n));
    const authKnown = new Promise<void>((resolve) => {
      onAuthStateChanged(auth, (u) => {
        authUser = u;
        privateUnsubs.forEach((f) => f());
        privateUnsubs = [];
        stopGroups();
        if (u) {
          const ls = PRIVATE.map((n) => listen(n, u.uid));
          privateUnsubs = ls.map((l) => l.unsub);
          privateReady = Promise.all(ls.map((l) => l.first)).then(() => undefined);
        } else {
          [...PRIVATE, ...PER_GROUP].forEach((n) => handlers.onData(n, []));
          privateReady = Promise.resolve();
        }
        resolve();
      });
    });
    await Promise.all([...pub.map((l) => l.first), authKnown]);
    await privateReady;
  })();
  return started;
}

export const currentUid = () => authUser?.uid ?? null;
export const currentAuthEmail = () => authUser?.email ?? null;

/**
 * Asks the server (not the local cache) whether the signed-in account has a profile document.
 * Returns null when it cannot tell (offline, rules), so callers never recreate a profile on a guess.
 */
export async function profileExists(id: string): Promise<boolean | null> {
  init();
  try { return (await getDocFromServer(doc(fs, "users", id))).exists(); } catch { return null; }
}
export const authEmailVerified = () => authUser?.emailVerified ?? false;

async function synced(uid: string) {
  for (let i = 0; i < 100 && authUser?.uid !== uid; i++) await new Promise((r) => setTimeout(r, 50));
  await privateReady;
}

/** Firebase Auth error code → i18n key */
const AUTH_KEYS: Record<string, string> = {
  "auth/email-already-in-use": "e.emailTaken",
  "auth/invalid-credential": "e.badLogin",
  "auth/wrong-password": "e.badLogin",
  "auth/user-not-found": "e.badLogin",
  "auth/too-many-requests": "e.tooMany",
  "auth/weak-password": "v.passwordMix",
  "auth/network-request-failed": "e.network",
  "auth/requires-recent-login": "e.recentLogin",
  "auth/operation-not-allowed": "e.authDisabled",
  "auth/invalid-phone-number": "e.phoneInvalid",
  "auth/invalid-verification-code": "e.codeInvalid",
  "auth/code-expired": "e.codeExpired",
  "auth/missing-verification-code": "e.codeInvalid",
  "auth/quota-exceeded": "e.smsQuota",
  "auth/captcha-check-failed": "e.captcha",
  "auth/billing-not-enabled": "e.phoneBilling",
  "auth/invalid-custom-token": "e.authFailed",
};
export class CloudAuthError extends Error {
  constructor(public code: string) {
    super(AUTH_KEYS[code] ?? "e.authFailed");
    this.name = "CloudAuthError";
  }
}
const wrap = async <T>(p: Promise<T>) => {
  try { return await p; } catch (e) { throw new CloudAuthError((e as { code?: string }).code ?? "unknown"); }
};

export async function signUp(email: string, password: string) {
  init();
  const cred = await wrap(createUserWithEmailAndPassword(auth, email, password));
  await synced(cred.user.uid);
  return cred.user.uid;
}
export async function signIn(email: string, password: string) {
  init();
  const cred = await wrap(signInWithEmailAndPassword(auth, email, password));
  await synced(cred.user.uid);
  return cred.user.uid;
}

export async function logOut() {
  init();
  await signOut(auth);
}
export async function sendVerification() {
  if (!authUser) throw new CloudAuthError("unknown");
  await wrap(sendEmailVerification(authUser));
}
export async function sendReset(email: string) {
  init();
  await sendPasswordResetEmail(auth, email).catch(() => undefined);
}
/** Re-authenticates with the current password, then sets the new one. */
export async function changePassword(current: string, next: string) {
  if (!authUser?.email) throw new CloudAuthError("unknown");
  await wrap(reauthenticateWithCredential(authUser, EmailAuthProvider.credential(authUser.email, current)));
  await wrap(updatePassword(authUser, next));
}
export async function refreshVerified() {
  if (!authUser) return false;
  await authUser.reload();
  if (authUser.emailVerified) await authUser.getIdToken(true);
  return authUser.emailVerified;
}
export async function deleteAuthUser() {
  if (!authUser) return;
  await deleteUser(authUser).catch(() => signOut(auth));
}

/** Calls a server function (/.netlify/functions/<name>) as the signed-in user. */
export async function callFunction(name: string, body?: unknown, method: "GET" | "POST" = "POST") {
  const token = await idToken();
  return fetch(`/.netlify/functions/${name}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
}

/**
 * v5: new notifications for other people and new chat messages I sent also go out as phone pushes.
 * The server re-reads each document and decides; this only says which ones are new.
 */
async function pushNew(ops: { name: SyncedName; id: string; data: Doc | null }[], before: Snapshot) {
  const uid = authUser?.uid;
  if (!uid) return;
  const had = (name: SyncedName) => new Set((before[name] ?? []).map((d) => d.id));
  const oldN = had("notifications"), oldM = had("messages");
  const notifications = ops.filter((o) => o.name === "notifications" && o.data && !oldN.has(o.id) && (o.data as unknown as { userId: string }).userId !== uid).map((o) => o.id);
  const messages = ops.filter((o) => o.name === "messages" && o.data && !oldM.has(o.id) && (o.data as unknown as { from: string }).from === uid).map((o) => o.id);
  if (!notifications.length && !messages.length) return;
  await callFunction("push-send", { notifications, messages }).catch(() => undefined);
}

/** Writes exactly the documents that differ between two snapshots (≤ 450 writes per batch). */
export async function push(before: Snapshot, after: Snapshot) {
  init();
  const ops: { name: SyncedName; id: string; data: Doc | null }[] = [];
  for (const name of SYNCED) {
    const prev = new Map((before[name] ?? []).map((d) => [d.id, JSON.stringify(d)]));
    for (const d of after[name] ?? []) {
      const cur = JSON.stringify(d);
      if (prev.get(d.id) !== cur) ops.push({ name, id: d.id, data: JSON.parse(cur) as Doc });
      prev.delete(d.id);
    }
    for (const id of prev.keys()) ops.push({ name, id, data: null });
  }
  try {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(fs);
      for (const op of ops.slice(i, i + 450)) {
        const ref = doc(fs, op.name, op.id);
        if (op.data) batch.set(ref, op.data);
        else batch.delete(ref);
      }
      await batch.commit();
    }
    void pushNew(ops, before);
  } catch (e) {
    const err = e as { code?: string; message: string };
    handlers?.onError(err.code === "permission-denied" ? "e.serverDenied" : "e.saveFailed");
    console.error("[worfix] Firestore write failed:", err.message);
  }
}
