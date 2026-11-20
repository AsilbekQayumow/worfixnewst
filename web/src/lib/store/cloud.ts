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
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword, type Auth, type User,
} from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDocFromServer, getFirestore, onSnapshot, query, where, writeBatch, type Firestore, type Unsubscribe } from "firebase/firestore";

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
const PUBLIC = ["missions", "organizations", "certificates", "shopItems"] as const;
const PRIVATE = ["users", "participants", "submissions", "records", "notifications", "audits", "friendships", "cheers", "orders", "messages", "announcements"] as const;
export const SYNCED = [...PUBLIC, ...PRIVATE] as const;
export type SyncedName = (typeof SYNCED)[number];
type Doc = { id: string };
export type Snapshot = Record<SyncedName, Doc[]>;

let auth: Auth;
let fs: Firestore;
function init() {
  if (!auth) {
    const app = getApps()[0] ?? initializeApp(config);
    auth = getAuth(app);
    fs = getFirestore(app);
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

function refFor(name: SyncedName, uid?: string) {
  const c = collection(fs, name);
  if (!uid) return c;
  if (name === "notifications" || name === "orders") return query(c, where("userId", "==", uid));
  if (name === "messages") return query(c, where("participants", "array-contains", uid));
  return c;
}

function listen(name: SyncedName, uid?: string) {
  let done!: () => void;
  const first = new Promise<void>((r) => (done = r));
  const unsub = onSnapshot(
    refFor(name, uid),
    (snap) => { handlers.onData(name, snap.docs.map((d) => d.data() as Doc)); done(); },
    (err) => {
      if (err.code !== "permission-denied") console.warn(`[worfix] listener "${name}" failed:`, err.message);
      handlers.onData(name, []);
      done();
    },
  );
  return { unsub, first };
}

export function start(h: typeof handlers) {
  started ??= (async () => {
    init();
    handlers = h;
    const pub = PUBLIC.map((n) => listen(n));
    const authKnown = new Promise<void>((resolve) => {
      onAuthStateChanged(auth, (u) => {
        authUser = u;
        privateUnsubs.forEach((f) => f());
        privateUnsubs = [];
        if (u) {
          const ls = PRIVATE.map((n) => listen(n, u.uid));
          privateUnsubs = ls.map((l) => l.unsub);
          privateReady = Promise.all(ls.map((l) => l.first)).then(() => undefined);
        } else {
          PRIVATE.forEach((n) => handlers.onData(n, []));
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
  } catch (e) {
    const err = e as { code?: string; message: string };
    handlers?.onError(err.code === "permission-denied" ? "e.serverDenied" : "e.saveFailed");
    console.error("[worfix] Firestore write failed:", err.message);
  }
}
