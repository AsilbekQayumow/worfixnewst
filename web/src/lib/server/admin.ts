/**
 * Server-only: Firebase Admin SDK for the Netlify functions that must write what a browser may not
 * (AI review results and rewards, promo-code delivery, Telegram sign-in tokens).
 *
 * Configure with FIREBASE_SERVICE_ACCOUNT = the service-account JSON from
 * Firebase console → Project settings → Service accounts → Generate new private key (raw JSON or base64).
 * Without it these functions answer 501 and the app falls back (admins review; admins issue codes; no Telegram).
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App | null | undefined;

export function adminApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  try {
    if (raw) {
      const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as { project_id: string; client_email: string; private_key: string };
      app = getApps()[0] ?? initializeApp({ credential: cert({ projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key }) });
    } else if (process.env.FIRESTORE_EMULATOR_HOST && projectId) {
      // Local tests against the Firebase emulators.
      app = getApps()[0] ?? initializeApp({ projectId });
    } else app = null;
  } catch (e) {
    console.error("[worfix] FIREBASE_SERVICE_ACCOUNT is not valid JSON:", (e as Error).message);
    app = null;
  }
  return app;
}

export const adminDb = () => getFirestore(adminApp()!);
export const adminAuth = () => getAuth(adminApp()!);

export const notConfigured = () => Response.json({ error: "server.notConfigured" }, { status: 501 });

/** The signed-in caller (Bearer ID token), or null. */
export async function caller(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  try { return (await adminAuth().verifyIdToken(token)).uid; } catch { return null; }
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
