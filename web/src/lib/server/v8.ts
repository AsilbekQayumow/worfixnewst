/**
 * v8 server work: sign in with a username.
 *  • handleLoginName  (POST /.netlify/functions/login-name {username, password}) — finds the account by its username,
 *    checks the password with Firebase Auth and only then answers with the account's email, so the browser can sign in
 *    the usual way. A wrong username and a wrong password get the same answer, and an email is never shown to someone
 *    who does not know the password.
 *  • handleUsernameCheck (GET /.netlify/functions/username-check?u=name) — whether a username is free (usernames are
 *    public on profiles, so this tells nothing new).
 */
import { cleanUsername, usernameProblem, USERNAME } from "../domain/validation";
import { adminDb, adminReady, notConfigured, tooMany } from "./admin";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";

async function emailsFor(username: string): Promise<string[]> {
  const snap = await adminDb().collection("users").where("username", "==", username).limit(3).get();
  return snap.docs
    .map((d) => d.data() as { email?: string; status?: string })
    .filter((u) => typeof u.email === "string" && u.email.includes("@") && u.status !== "deleted")
    .map((u) => u.email as string);
}

/** True when this email + password is a real Firebase account (Auth REST, the same check the browser would make). */
async function passwordOk(email: string, password: string): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!key) return false;
  const base = emu ? `http://${emu}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  const res = await fetch(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  return res.ok;
}

export async function handleLoginName(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  let body: { username?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return json({ error: "e.badLogin" }, 400); }
  const username = cleanUsername(body.username);
  const password = typeof body.password === "string" ? body.password.slice(0, 128) : "";
  if (!USERNAME.test(username) || !password) return json({ error: "e.badLogin" }, 401);
  if (tooMany(`login:ip:${ipOf(req)}`, 12) || tooMany(`login:u:${username}`, 8)) return json({ error: "e.tooMany" }, 429);
  for (const email of await emailsFor(username)) {
    if (await passwordOk(email, password)) return json({ email });
  }
  return json({ error: "e.badLogin" }, 401);
}

export async function handleUsernameCheck(req: Request): Promise<Response> {
  if (!adminReady()) return notConfigured();
  if (tooMany(`uname:${ipOf(req)}`, 40)) return json({ error: "e.tooMany" }, 429);
  const name = cleanUsername(new URL(req.url).searchParams.get("u"));
  const me = new URL(req.url).searchParams.get("me") ?? "";
  const problem = usernameProblem(name);
  if (problem) return json({ free: false, problem });
  const snap = await adminDb().collection("users").where("username", "==", name).limit(2).get();
  return json({ free: snap.docs.every((d) => d.id === me) });
}
