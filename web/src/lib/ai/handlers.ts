/**
 * AI request handlers (plain Request → Response), shared by:
 *  • web/netlify/functions/ai-*.mts — what production uses (Netlify Functions, 60 s limit);
 *  • app/api/ai/* — Next.js routes for local development.
 * The Next.js server handler on Netlify stops at 10 s, too short for map lookups + Gemini.
 */
import { AGENT_SCHEMA, LANG_NAME, VERIFY_SCHEMA, parseAgentRequest, parseAiMission, type AgentPlan, type NearbyPlace, type VerifyResult } from "./missions";
import { AiError, gemini, limited, nearbyPlaces, reverseGeocode } from "./server";
import { CATEGORIES, LANGS, type Category, type Lang } from "../domain/types";

const AGENT_SYSTEM = `You are the WORFIX mission agent. WORFIX is a verified volunteering platform in Uzbekistan and Central Asia:
volunteers do real-world good deeds near them, prove them with photos and GPS, and reviewers approve them.
You receive the volunteer's position, a list of REAL public places around them from OpenStreetMap, and their interests.
Design missions for ONE volunteer (optionally with friends), each tied to exactly one place from the list (placeId).
Rules:
- Only use places from the list. Never invent a place. Prefer named places close to the volunteer.
- Missions are safe, legal, free, suitable for people aged 15+, doable in one visit, and provable with before/after photos.
- No fundraising, political or religious campaigning, medical procedures, licensed work, climbing, traffic or deep water.
- Do not ask volunteers to enter private property, schools or hospitals without saying "with the administration's permission".
- Mind the season and climate of the date given.
- Missions that match the volunteer's interests come first; set matchesInterest accordingly. Mix difficulties.
- Allowed categories: ${CATEGORIES.join(", ")}.
- Write all text fields in the language requested. No statistics you cannot know. Do not mention AI.`;

/** Total time budget per request; Netlify stops functions at about 30 s. */
const BUDGET_MS = 25_000;

export async function handleMissions(req: Request): Promise<Response> {
  const deadline = Date.now() + BUDGET_MS;
  if (limited(req, 5)) return Response.json({ error: "ai.tooMany" }, { status: 429 });
  const r = parseAgentRequest(await req.json().catch(() => null));
  if (!r) return Response.json({ error: "ai.badRequest" }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: "ai.notConfigured" }, { status: 503 });

  const t0 = Date.now();
  // The browser usually sends the places it found; otherwise try OpenStreetMap from here, briefly.
  const [areaName, found] = await Promise.all([
    reverseGeocode(r.lat, r.lng, r.language),
    r.places.length ? Promise.resolve(r.places) : nearbyPlaces(r.lat, r.lng, 1500, 4000),
  ]);
  const trace = [`map lookups: ${Date.now() - t0} ms, ${found.length} places${r.places.length ? " (from browser)" : ""}`];
  // Map servers can be slow; without a place list the agent plans around the volunteer's own position.
  const fallback = !found.length;
  const places: NearbyPlace[] = fallback
    ? [{ id: "here", name: areaName || "current area", kind: "neighbourhood (no detailed map data available)", lat: r.lat, lng: r.lng, distanceM: 0 }]
    : found;

  const list = places.map((p) => `${p.id} | ${p.kind} | ${p.name || "(unnamed)"} | ${p.distanceM} m`).join("\n");
  const prompt = [
    `Volunteer position: ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)} (±${Math.round(r.accuracy)} m)`,
    areaName ? `Area: ${areaName}` : "",
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `Interests: ${r.interests.length ? r.interests.join(", ") : "none given — choose what the area needs most"}`,
    r.notes ? `Volunteer's note: """${r.notes}"""` : "",
    `Language for all text: ${LANG_NAME[r.language]}`,
    `Places nearby (id | kind | name | distance):\n${list}`,
    fallback ? "Only the volunteer's neighbourhood is known. Use placeId \"here\" for every mission and describe a typical public spot within walking distance (a street, courtyard, park edge) instead of a named place." : "",
    `Propose exactly ${r.count} missions.`,
  ].filter(Boolean).join("\n");

  try {
    const { data, model } = await gemini({ system: AGENT_SYSTEM, parts: [{ text: prompt }], schema: AGENT_SCHEMA, temperature: 0.8, deadline, trace });
    const d = data as { areaSummary?: unknown; missions?: unknown[] };
    const byId = new Map(places.map((p) => [p.id, p]));
    const missions = (Array.isArray(d.missions) ? d.missions : []).flatMap((m) => {
      const a = parseAiMission(m);
      const p = a ? byId.get(a.placeId) : undefined;
      return a && p ? [{ ...a, location: a.location || p.name, lat: p.lat, lng: p.lng, distanceM: p.distanceM }] : [];
    }).slice(0, r.count);
    if (!missions.length) return Response.json({ error: "ai.unreadable", trace }, { status: 502 });
    const plan: AgentPlan = { areaName, areaSummary: String(d.areaSummary ?? "").slice(0, 500), places: fallback ? [] : places.slice(0, 25), missions, model };
    return Response.json(plan);
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.key, trace }, { status: e.status });
    console.error("[ai/missions]", e);
    return Response.json({ error: "ai.unavailable" }, { status: 500 });
  }
}

const VERIFY_SYSTEM = `You check photo evidence for WORFIX, a verified volunteering platform. Compare the photos with the mission.
Be strict but fair: phone photos are often imperfect. Signs of real work: the place matches the mission, visible results
(collected bags, planted saplings, cleaned area), before/after differences, people working. Red flags: screenshots, stock or
studio photos, watermarks, scenes unrelated to the task, indoor photos for an outdoor task, no visible work at all.
Never identify people. Write the summary and concerns in the requested language.`;

export async function handleVerify(req: Request): Promise<Response> {
  const deadline = Date.now() + BUDGET_MS;
  if (limited(req, 10)) return Response.json({ error: "ai.tooMany" }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const images = (Array.isArray(b?.images) ? b!.images : []).filter((x): x is string => typeof x === "string" && x.length < 400_000).slice(0, 4);
  const category = (CATEGORIES as readonly string[]).includes(b?.category as string) ? (b!.category as Category) : null;
  const language = (LANGS as readonly string[]).includes(b?.language as string) ? (b!.language as Lang) : "uz";
  if (!b || !images.length || !category) return Response.json({ error: "ai.badRequest" }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: "ai.notConfigured" }, { status: 503 });

  const checklist = (Array.isArray(b.checklist) ? b.checklist : []).map((x) => String(x).slice(0, 120)).slice(0, 6);
  const text = [
    `Mission: ${String(b.title ?? "").slice(0, 120)}`,
    `Category: ${category}`,
    `Description: ${String(b.description ?? "").slice(0, 800)}`,
    checklist.length ? `Steps the volunteer should have done:\n- ${checklist.join("\n- ")}` : "",
    `Language: ${LANG_NAME[language]}`,
    `There are ${images.length} photo(s) attached.`,
  ].filter(Boolean).join("\n");

  try {
    const { data, model } = await gemini({
      system: VERIFY_SYSTEM, schema: VERIFY_SCHEMA, temperature: 0.2, deadline,
      parts: [{ text }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))],
    });
    const d = data as { confidence?: unknown; summary?: unknown; concerns?: unknown };
    const out: VerifyResult = {
      confidence: Math.min(1, Math.max(0, Number(d.confidence) || 0)),
      summary: String(d.summary ?? "").slice(0, 400),
      concerns: (Array.isArray(d.concerns) ? d.concerns : []).map((x) => String(x).slice(0, 160)).slice(0, 5),
      model,
    };
    return Response.json(out);
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.key }, { status: e.status });
    return Response.json({ error: "ai.unavailable" }, { status: 500 });
  }
}
