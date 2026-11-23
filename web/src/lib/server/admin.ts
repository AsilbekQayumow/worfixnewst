/**
 * Server-only: Firestore access for the server functions that must write what a browser may not
 * (AI review results and rewards, promo-code delivery, the daily territory decay).
 *
 * Configure with FIREBASE_SERVICE_ACCOUNT = the service-account JSON from
 * Firebase console → Project settings → Service accounts → Generate new private key (raw JSON or base64).
 * Without it these functions answer 501 and the app falls back (admins review; admins issue codes; areas decay when their owner opens the map).
 *
 * Uses the small HTTPS client in firestore-rest.ts (the Admin SDK needs gRPC, which Cloudflare Workers do not have).
 */
import { Firestore, parseServiceAccount, verifyIdToken, type ServiceAccount } from "./firestore-rest";

let state: { db: Firestore; projectId: string; emulator: boolean } | null | undefined;
let key = "";

function setup() {
  // Workers may hand the environment over per request: rebuild when it changes.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim() ?? "";
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  const k = `${raw.length}:${raw.slice(-24)}:${emulatorHost}`;
  if (state !== undefined && k === key) return state;
  key = k;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? "";
  let sa: ServiceAccount | null = null;
  try {
    sa = parseServiceAccount(raw);
  } catch (e) {
    console.error("[worfix] FIREBASE_SERVICE_ACCOUNT is not valid JSON:", (e as Error).message);
  }
  if (sa) state = { db: new Firestore({ projectId: sa.project_id, serviceAccount: sa }), projectId: sa.project_id, emulator: false };
  else if (emulatorHost && projectId) state = { db: new Firestore({ projectId, emulatorHost }), projectId, emulator: true }; // local tests
  else state = null;
  return state;
}

/** True when the server can write to Firestore. */
export const adminReady = () => setup() !== null;
export const adminDb = () => setup()!.db;

export const notConfigured = () => Response.json({ error: "server.notConfigured" }, { status: 501 });

/** The signed-in caller (Bearer ID token), or null. */
export async function caller(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const s = setup();
  if (!token || !s) return null;
  try { return await verifyIdToken(token, s.projectId, s.emulator && !!process.env.FIREBASE_AUTH_EMULATOR_HOST); } catch { return null; }
}

const hits = new Map<string, number[]>();
/** Small per-instance rate limit by key. */
export function tooMany(key: string, perMinute: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  return list.length > perMinute;
}
