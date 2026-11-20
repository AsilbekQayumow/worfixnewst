"use client";
/**
 * Calls an AI endpoint: the Netlify Function in production, the Next.js route in local development
 * (where /.netlify/functions/* does not exist and answers 404).
 */
export async function postAi(name: "missions" | "verify", body: unknown): Promise<Response> {
  const init: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(`/.netlify/functions/ai-${name}`, init).catch(() => null);
  if (r && r.status !== 404) return r;
  return fetch(`/api/ai/${name}`, init);
}
