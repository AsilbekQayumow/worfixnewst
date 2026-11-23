/**
 * Server-only: a small Firestore + Firebase Auth client over plain HTTPS (fetch + WebCrypto).
 *
 * It replaces the Firebase Admin SDK, whose Firestore client needs gRPC and does not run on Cloudflare Workers.
 * It covers exactly what the server functions use, with the Admin SDK's shapes:
 *   db.doc(path).get(), db.collection(c).where(f, op, v).limit(n).get(),
 *   db.runTransaction(tx => tx.get / tx.set / tx.update), db.batch().set / .update / .commit(),
 *   verifyIdToken(token) → uid.
 * Data is plain JSON (strings, numbers, booleans, null, arrays, maps); undefined fields are skipped
 * (like ignoreUndefinedProperties). Works against the Firestore and Auth emulators for tests.
 */

export interface ServiceAccount { project_id: string; client_email: string; private_key: string }

/* ───────────── value encoding ───────────── */

type FsValue = Record<string, unknown>;

function enc(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.filter((x) => x !== undefined).map(enc) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "object") return { mapValue: { fields: encFields(v as Record<string, unknown>) } };
  throw new Error(`firestore: cannot store ${typeof v}`);
}

function encFields(o: Record<string, unknown>) {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = enc(v);
  return out;
}

function dec(v: FsValue): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (((v.arrayValue as { values?: FsValue[] }).values) ?? []).map(dec);
  if ("mapValue" in v) return decFields(((v.mapValue as { fields?: Record<string, FsValue> }).fields) ?? {});
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  return null;
}

function decFields(f: Record<string, FsValue>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) out[k] = dec(v);
  return out;
}

const fieldPath = (p: string) => p.split(".").map((s) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(s) ? s : `\`${s.replace(/[`\\]/g, "\\$&")}\``)).join(".");

/* ───────────── base64 / crypto helpers ───────────── */

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const decodeJwtPart = (s: string) => JSON.parse(new TextDecoder().decode(fromB64(s))) as Record<string, unknown>;

/** Reads FIREBASE_SERVICE_ACCOUNT: raw JSON or base64 of it. */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const s = raw?.trim();
  if (!s) return null;
  const text = s.startsWith("{") ? s : new TextDecoder().decode(fromB64(s));
  const json = JSON.parse(text) as ServiceAccount;
  if (!json.project_id || !json.client_email || !json.private_key) throw new Error("missing project_id, client_email or private_key");
  return json;
}

/* ───────────── OAuth access token from the service account ───────────── */

const SCOPES = "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform";
let cachedToken: { email: string; token: string; until: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.email === sa.client_email && cachedToken.until > now + 60) return cachedToken.token;
  const pem = sa.private_key.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", fromB64(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const unsigned = `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson({ iss: sa.client_email, scope: SCOPES, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${unsigned}.${b64url(sig)}`,
  });
  if (!res.ok) throw new Error(`firestore: token ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { email: sa.client_email, token: j.access_token, until: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

/* ───────────── ID-token verification (Firebase Auth) ───────────── */

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwks: { keys: (JsonWebKey & { kid: string })[]; until: number } | null = null;

async function signingKeys() {
  if (jwks && jwks.until > Date.now()) return jwks.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`auth: keys ${res.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  jwks = { keys: ((await res.json()) as { keys: (JsonWebKey & { kid: string })[] }).keys, until: Date.now() + maxAge * 1000 };
  return jwks.keys;
}

/** Verifies a Firebase ID token and returns its uid; throws when it is not valid for this project. */
export async function verifyIdToken(token: string, projectId: string, emulator: boolean): Promise<string> {
  const [h, p, s] = token.split(".");
  if (!h || !p) throw new Error("auth: malformed token");
  const header = decodeJwtPart(h);
  const claims = decodeJwtPart(p);
  if (!emulator) {
    if (header.alg !== "RS256" || !s) throw new Error("auth: bad algorithm");
    const jwk = (await signingKeys()).find((k) => k.kid === header.kid);
    if (!jwk) throw new Error("auth: unknown key");
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) throw new Error("auth: bad signature");
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId) throw new Error("auth: wrong audience");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("auth: wrong issuer");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("auth: expired");
  if (typeof claims.iat === "number" && claims.iat > now + 300) throw new Error("auth: issued in the future");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("auth: no subject");
  return claims.sub;
}

/* ───────────── Firestore ───────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = { [field: string]: any };
type Op = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";
const OPS: Record<Op, string> = {
  "==": "EQUAL", "!=": "NOT_EQUAL", "<": "LESS_THAN", "<=": "LESS_THAN_OR_EQUAL", ">": "GREATER_THAN", ">=": "GREATER_THAN_OR_EQUAL",
  in: "IN", "not-in": "NOT_IN", "array-contains": "ARRAY_CONTAINS", "array-contains-any": "ARRAY_CONTAINS_ANY",
};

type Write = Record<string, unknown>;

export class DocRef {
  constructor(readonly db: Firestore, readonly path: string) {}
  get id() { return this.path.slice(this.path.lastIndexOf("/") + 1); }
  get name() { return `${this.db.dbName}/documents/${this.path}`; }
  get() { return this.db.getDoc(this, null); }
  set(data: object) { return this.db.batch().set(this, data).commit(); }
  update(data: object) { return this.db.batch().update(this, data).commit(); }
}

export class DocSnap {
  constructor(readonly ref: DocRef, private readonly value: Data | undefined) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data(): any { return this.value; }
}

export class QuerySnap {
  constructor(readonly docs: DocSnap[]) {}
  get size() { return this.docs.length; }
  get empty() { return this.docs.length === 0; }
}

export class Query {
  constructor(readonly db: Firestore, readonly collectionId: string, readonly filters: Write[] = [], readonly max?: number) {}
  where(field: string, op: Op, value: unknown) {
    const f = { fieldPath: fieldPath(field) };
    const filter = value === null && (op === "==" || op === "!=")
      ? { unaryFilter: { op: op === "==" ? "IS_NULL" : "IS_NOT_NULL", field: f } }
      : { fieldFilter: { field: f, op: OPS[op], value: enc(value) } };
    return new Query(this.db, this.collectionId, [...this.filters, filter], this.max);
  }
  limit(n: number) { return new Query(this.db, this.collectionId, this.filters, n); }
  get() { return this.db.runQuery(this, null); }
  structured() {
    const q: Write = { from: [{ collectionId: this.collectionId }] };
    if (this.filters.length === 1) q.where = this.filters[0];
    else if (this.filters.length > 1) q.where = { compositeFilter: { op: "AND", filters: this.filters } };
    if (this.max !== undefined) q.limit = this.max;
    return q;
  }
}

export class CollectionRef extends Query {
  doc(id: string) { return new DocRef(this.db, `${this.collectionId}/${id}`); }
}

function setWrite(ref: DocRef, data: object): Write {
  return { update: { name: ref.name, fields: encFields(data as Data) } };
}
function updateWrite(ref: DocRef, obj: object): Write {
  const data = obj as Data;
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  return { update: { name: ref.name, fields: encFields(data) }, updateMask: { fieldPaths: keys.map(fieldPath) }, currentDocument: { exists: true } };
}

export class WriteBatch {
  protected writes: Write[] = [];
  constructor(protected readonly db: Firestore) {}
  set(ref: DocRef, data: object) { this.writes.push(setWrite(ref, data)); return this; }
  update(ref: DocRef, data: object) { this.writes.push(updateWrite(ref, data)); return this; }
  async commit() { if (this.writes.length) await this.db.commit(this.writes, null); }
}

export class Transaction {
  readonly writes: Write[] = [];
  constructor(private readonly db: Firestore, readonly id: string) {}
  get(target: DocRef): Promise<DocSnap>;
  get(target: Query): Promise<QuerySnap>;
  get(target: DocRef | Query): Promise<DocSnap | QuerySnap> {
    return target instanceof DocRef ? this.db.getDoc(target, this.id) : this.db.runQuery(target, this.id);
  }
  set(ref: DocRef, data: object) { this.writes.push(setWrite(ref, data)); return this; }
  update(ref: DocRef, data: object) { this.writes.push(updateWrite(ref, data)); return this; }
}

class FirestoreError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface FirestoreOptions {
  projectId: string;
  /** "host:port" of the Firestore emulator */
  emulatorHost?: string;
  serviceAccount?: ServiceAccount | null;
}

export class Firestore {
  readonly dbName: string;
  private readonly root: string;
  constructor(private readonly opt: FirestoreOptions) {
    this.dbName = `projects/${opt.projectId}/databases/(default)`;
    const base = opt.emulatorHost ? `http://${opt.emulatorHost}/v1` : "https://firestore.googleapis.com/v1";
    this.root = `${base}/${this.dbName}/documents`;
  }

  doc(path: string) { return new DocRef(this, path); }
  collection(id: string) { return new CollectionRef(this, id); }
  batch() { return new WriteBatch(this); }

  private async call(url: string, init: RequestInit = {}) {
    const auth = this.opt.emulatorHost ? "Bearer owner" : `Bearer ${await accessToken(this.opt.serviceAccount!)}`;
    const res = await fetch(url, { ...init, headers: { authorization: auth, "content-type": "application/json", ...(init.headers ?? {}) } });
    if (!res.ok) throw new FirestoreError(res.status, `firestore ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<unknown>;
  }

  async getDoc(ref: DocRef, tx: string | null): Promise<DocSnap> {
    // documents:batchGet (not GET ?transaction=): the emulator never answers a transactional GET.
    const body: Write = { documents: [ref.name] };
    if (tx) body.transaction = tx;
    const rows = (await this.call(`${this.root}:batchGet`, { method: "POST", body: JSON.stringify(body) })) as { found?: { fields?: Record<string, FsValue> } }[];
    const found = rows.find((r) => r.found)?.found;
    return new DocSnap(ref, found ? decFields(found.fields ?? {}) : undefined);
  }

  async runQuery(q: Query, tx: string | null): Promise<QuerySnap> {
    const body: Write = { structuredQuery: q.structured() };
    if (tx) body.transaction = tx;
    const rows = (await this.call(`${this.root}:runQuery`, { method: "POST", body: JSON.stringify(body) })) as { document?: { name: string; fields?: Record<string, FsValue> } }[];
    const prefix = `${this.dbName}/documents/`;
    return new QuerySnap(rows.filter((r) => r.document).map((r) => new DocSnap(new DocRef(this, r.document!.name.slice(prefix.length)), decFields(r.document!.fields ?? {}))));
  }

  async commit(writes: Write[], tx: string | null) {
    const body: Write = { writes };
    if (tx) body.transaction = tx;
    await this.call(`${this.root}:commit`, { method: "POST", body: JSON.stringify(body) });
  }

  /** Runs fn in a read-write transaction; retries when Firestore aborts it because of contention. */
  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>, attempts = 5): Promise<T> {
    for (let i = 1; ; i++) {
      const { transaction } = (await this.call(`${this.root}:beginTransaction`, { method: "POST", body: "{}" })) as { transaction: string };
      const tx = new Transaction(this, transaction);
      let result: T;
      try {
        result = await fn(tx);
      } catch (e) {
        await this.call(`${this.root}:rollback`, { method: "POST", body: JSON.stringify({ transaction }) }).catch(() => {});
        if (e instanceof FirestoreError && e.status === 409 && i < attempts) continue;
        throw e;
      }
      try {
        await this.commit(tx.writes, transaction);
        return result;
      } catch (e) {
        if (e instanceof FirestoreError && e.status === 409 && i < attempts) { await new Promise((r) => setTimeout(r, 100 * 2 ** i)); continue; }
        throw e;
      }
    }
  }
}
