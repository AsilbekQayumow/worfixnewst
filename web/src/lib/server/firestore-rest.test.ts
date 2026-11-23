import assert from "node:assert/strict";
import { generateKeyPairSync, createSign, createVerify } from "node:crypto";
import { test } from "node:test";
import { Firestore, parseServiceAccount, verifyIdToken } from "./firestore-rest";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };

function idToken(claims: Record<string, unknown>, kid = "k1") {
  const unsigned = `${b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }))}.${b64u(JSON.stringify(claims))}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  return `${unsigned}.${b64u(sig)}`;
}

const realFetch = globalThis.fetch;
function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => handler(String(u), init)) as typeof fetch;
}

test("verifyIdToken accepts a valid Firebase token and rejects tampered or foreign ones", async () => {
  mockFetch((url) => {
    assert.match(url, /securetoken@system\.gserviceaccount\.com/);
    return Response.json({ keys: [jwk] }, { headers: { "cache-control": "public, max-age=600" } });
  });
  const now = Math.floor(Date.now() / 1000);
  const good = { aud: "worfix3", iss: "https://securetoken.google.com/worfix3", sub: "u1", iat: now - 10, exp: now + 3600, auth_time: now - 10 };
  try {
    assert.equal(await verifyIdToken(idToken(good), "worfix3", false), "u1");
    await assert.rejects(verifyIdToken(idToken({ ...good, aud: "other" }), "worfix3", false), /audience/);
    await assert.rejects(verifyIdToken(idToken({ ...good, exp: now - 1 }), "worfix3", false), /expired/);
    await assert.rejects(verifyIdToken(idToken(good, "nope"), "worfix3", false), /unknown key/);
    const [h, , s] = idToken(good).split(".");
    const forged = `${h}.${b64u(JSON.stringify({ ...good, sub: "admin" }))}.${s}`;
    await assert.rejects(verifyIdToken(forged, "worfix3", false), /signature/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("service account signs a valid OAuth assertion and the token is sent to Firestore", async () => {
  const sa = { project_id: "worfix3", client_email: "svc@worfix3.iam.gserviceaccount.com", private_key: privateKey.export({ format: "pem", type: "pkcs8" }).toString() };
  // Stored base64 (as some dashboards prefer) must parse the same.
  assert.deepEqual(parseServiceAccount(Buffer.from(JSON.stringify(sa)).toString("base64")), sa);
  const calls: string[] = [];
  mockFetch((url, init) => {
    calls.push(url);
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(String(init!.body)).get("assertion")!;
      const [h, p, s] = assertion.split(".");
      assert.ok(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url")), "assertion signature");
      const c = JSON.parse(Buffer.from(p, "base64url").toString());
      assert.equal(c.iss, sa.client_email);
      assert.equal(c.aud, "https://oauth2.googleapis.com/token");
      return Response.json({ access_token: "AT", expires_in: 3600 });
    }
    assert.equal((init!.headers as Record<string, string>).authorization, "Bearer AT");
    assert.match(url, /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/worfix3\/databases\/\(default\)\/documents:batchGet$/);
    return Response.json([{ found: { name: "x", fields: { n: { integerValue: "7" }, s: { stringValue: "a" }, m: { mapValue: {} } } } }]);
  });
  try {
    const db = new Firestore({ projectId: "worfix3", serviceAccount: sa });
    assert.deepEqual((await db.doc("users/u1").get()).data(), { n: 7, s: "a", m: {} });
    await db.doc("users/u1").get();
    assert.equal(calls.filter((u) => u.includes("oauth2")).length, 1, "token is cached");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("queries encode null as IS_NULL and several filters as AND", () => {
  const db = new Firestore({ projectId: "p", emulatorHost: "x:1" });
  const q = db.collection("promoCodes").where("itemId", "==", "i1").where("orderId", "==", null).limit(1).structured();
  assert.deepEqual(q, {
    from: [{ collectionId: "promoCodes" }],
    where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: "itemId" }, op: "EQUAL", value: { stringValue: "i1" } } },
      { unaryFilter: { op: "IS_NULL", field: { fieldPath: "orderId" } } },
    ] } },
    limit: 1,
  });
});
