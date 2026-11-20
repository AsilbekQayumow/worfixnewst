/**
 * Server-only helpers for the AI routes: Gemini calls with model fallback, OpenStreetMap lookups, rate limiting.
 * GEMINI_API_KEY is read from the environment (Netlify → Environment variables) and never reaches the browser.
 */

// Model names change over time (older ones return 404), so the list comes from the API itself.
let modelCache: { at: number; names: string[] } | null = null;
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

/** Text-capable Flash models available to this key, fastest first; GEMINI_MODEL (if set) goes first. */
async function models(key: string, trace?: string[]): Promise<string[]> {
  const pinned = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [];
  if (!modelCache || Date.now() - modelCache.at > 3_600_000) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(3000) });
      const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      const names = (j.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((n) => /flash/.test(n) && !/image|tts|audio|live|embedding|thinking|exp|omni|robotics|computer/.test(n));
      const rank = (n: string) => (/latest/.test(n) ? 0 : /preview/.test(n) ? 2 : 1) + (/lite/.test(n) ? 0 : 0.5);
      names.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a, "en", { numeric: true }));
      if (names.length) modelCache = { at: Date.now(), names };
      trace?.push(`models: ${names.slice(0, 5).join(", ") || "none listed"}`);
    } catch {
      trace?.push("models: list unavailable");
    }
  }
  return [...new Set([...pinned, ...(modelCache?.names.slice(0, 4) ?? FALLBACK_MODELS)])];
}

/** Keep "thinking" short: it adds many seconds and these tasks don't need it. */
function thinkingFor(model: string): Record<string, unknown> | undefined {
  if (/2\.5/.test(model)) return { thinkingBudget: 0 };
  if (/latest|gemini-3/.test(model)) return { thinkingLevel: "low" };
  return undefined;
}

export class AiError extends Error {
  constructor(public status: number, public key: string) {
    super(key);
  }
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

/**
 * Calls Gemini with JSON output; tries the next model name when one is not available for this key.
 * `deadline` (epoch ms) bounds the whole call so the function answers before the platform cuts it off.
 */
export async function gemini(opts: { system: string; parts: Part[]; schema: object; temperature?: number; deadline: number; trace?: string[] }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError(503, "ai.notConfigured");
  const payload = (thinking: Record<string, unknown> | undefined) => JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: opts.schema, temperature: opts.temperature ?? 0.7, ...(thinking ? { thinkingConfig: thinking } : {}) },
  });
  let last = new AiError(502, "ai.unavailable");
  for (const model of await models(key, opts.trace)) {
    let thinking = thinkingFor(model);
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = opts.deadline - Date.now();
      if (left < 2500) throw new AiError(504, "ai.timeout");
      let res: Response;
      const t0 = Date.now();
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: payload(thinking), signal: AbortSignal.timeout(left),
        });
      } catch {
        opts.trace?.push(`${model}: no answer after ${Date.now() - t0} ms`);
        throw new AiError(504, "ai.timeout");
      }
      opts.trace?.push(`${model} ${thinking ? JSON.stringify(thinking) : "default"}: ${res.status} in ${Date.now() - t0} ms`);
      if (res.status === 404) break;
      const json = (await res.json().catch(() => null)) as { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] } | null;
      const msg = json?.error?.message ?? "";
      if (!res.ok) {
        console.error("[ai] Gemini error", model, res.status, msg);
        if (res.status === 400 && thinking && /think/i.test(msg)) { thinking = undefined; continue; } // model doesn't take this thinking setting
        if (res.status === 429) throw new AiError(429, "ai.quota");
        if (res.status === 400 && /not found|not supported/i.test(msg)) break;
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiError(502, "ai.keyRejected");
        last = new AiError(502, "ai.unavailable");
        break;
      }
      const raw = json?.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      try {
        return { data: JSON.parse(raw) as unknown, model };
      } catch {
        last = new AiError(502, "ai.unreadable");
        break;
      }
    }
  }
  throw last;
}

const hits = new Map<string, number[]>();
/** Best-effort per-instance limit. */
export function limited(req: Request, perMinute: number) {
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > perMinute;
}

const UA = "WORFIX/2.0 (volunteering platform; https://worfix.netlify.app)";

/** Neighbourhood name from OpenStreetMap Nominatim. */
export async function reverseGeocode(lat: number, lng: number, lang: string): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lng}&accept-language=${lang}`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000),
    });
    const j = (await r.json()) as { address?: Record<string, string>; display_name?: string };
    const a = j.address ?? {};
    return [a.neighbourhood ?? a.suburb ?? a.quarter ?? a.road, a.city ?? a.town ?? a.village ?? a.county, a.country].filter(Boolean).join(", ") || (j.display_name ?? "");
  } catch {
    return "";
  }
}

export { metres, nearbyPlaces } from "./osm";
