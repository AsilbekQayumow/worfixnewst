import { CATEGORIES, DIFFICULTIES, LANGS, type Category, type Difficulty, type Lang } from "../domain/types";

/** One place near the volunteer, found by the server in OpenStreetMap. */
export interface NearbyPlace {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
  distanceM: number;
}

/** Request the browser sends to /api/ai/missions. */
export interface AgentRequest {
  lat: number;
  lng: number;
  accuracy: number;
  interests: Category[];
  language: Lang;
  count: number;
  notes: string;
  /** places the browser already found nearby (optional) */
  places: NearbyPlace[];
}

function parsePlaces(v: unknown): NearbyPlace[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap((p) => {
    const o = p as Record<string, unknown>;
    const lat = Number(o?.lat), lng = Number(o?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || typeof o.id !== "string") return [];
    return [{ id: String(o.id).slice(0, 24), name: String(o.name ?? "").slice(0, 80), kind: String(o.kind ?? "place").slice(0, 40), lat, lng, distanceM: Math.max(0, Math.round(Number(o.distanceM) || 0)) }];
  });
}

export function parseAgentRequest(v: unknown): AgentRequest | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const interests = (Array.isArray(o.interests) ? o.interests : []).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c as string));
  const language = (LANGS as readonly string[]).includes(o.language as string) ? (o.language as Lang) : "uz";
  const count = Math.min(6, Math.max(1, Math.round(Number(o.count) || 4)));
  return { lat, lng, accuracy: Math.max(0, Number(o.accuracy) || 0), interests, language, count, notes: String(o.notes ?? "").slice(0, 300), places: parsePlaces(o.places) };
}

/** A mission draft proposed by the agent, clamped to what the app accepts. */
export interface AiMission {
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  durationMinutes: number;
  location: string;
  placeId: string;
  safety: string;
  requirements: string;
  equipment: string;
  impactLabel: string;
  impactAmount: number;
  checklist: string[];
  whyHere: string;
  matchesInterest: boolean;
}

const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function parseAiMission(v: unknown): AiMission | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const category = (CATEGORIES as readonly string[]).includes(o.category as string) ? (o.category as Category) : null;
  const difficulty = (DIFFICULTIES as readonly string[]).includes(o.difficulty as string) ? (o.difficulty as Difficulty) : null;
  if (!category || !difficulty) return null;
  const m: AiMission = {
    title: s(o.title, 100), description: s(o.description, 1200), category, difficulty,
    durationMinutes: Math.min(480, Math.max(30, Math.round((Number(o.durationMinutes) || 90) / 15) * 15)),
    location: s(o.location, 160), placeId: s(o.placeId, 60), safety: s(o.safety, 500), requirements: s(o.requirements, 400),
    equipment: s(o.equipment, 300), impactLabel: s(o.impactLabel, 60), impactAmount: Math.min(10_000, Math.max(0, Math.round((Number(o.impactAmount) || 0) * 10) / 10)),
    checklist: (Array.isArray(o.checklist) ? o.checklist : []).map((x) => s(x, 120)).filter(Boolean).slice(0, 5),
    whyHere: s(o.whyHere, 300), matchesInterest: o.matchesInterest === true,
  };
  if (m.title.length < 5 || m.description.length < 30 || m.safety.length < 10) return null;
  return m;
}

export interface AgentPlan {
  areaName: string;
  areaSummary: string;
  places: NearbyPlace[];
  missions: (AiMission & { lat: number; lng: number; distanceM: number })[];
  model: string;
}

/** Gemini structured-output schema (OpenAPI subset). */
export const AGENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    areaSummary: { type: "STRING", description: "2 sentences: what this exact neighbourhood needs from volunteers, based on the places list." },
    missions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "5-70 characters, concrete, names the place." },
          description: { type: "STRING", description: "80-500 characters: what the volunteer does step by step and why it matters here." },
          category: { type: "STRING", enum: [...CATEGORIES] },
          difficulty: { type: "STRING", enum: [...DIFFICULTIES], description: "easy: ≤90 min alone, light work. medium: 2-3 h or some physical effort. hard: 3 h+, heavy work or coordinating people." },
          durationMinutes: { type: "INTEGER" },
          placeId: { type: "STRING", description: "id of ONE place from the list where the mission happens." },
          location: { type: "STRING", description: "Human name of that place and the district." },
          safety: { type: "STRING" },
          requirements: { type: "STRING" },
          equipment: { type: "STRING", description: "What the volunteer brings themselves." },
          impactLabel: { type: "STRING", description: "countable unit in lowercase plural, in the requested language" },
          impactAmount: { type: "NUMBER" },
          checklist: { type: "ARRAY", items: { type: "STRING" }, description: "3-4 short, photo-provable steps." },
          whyHere: { type: "STRING", description: "One sentence: why this place." },
          matchesInterest: { type: "BOOLEAN" },
        },
        required: ["title", "description", "category", "difficulty", "durationMinutes", "placeId", "location", "safety", "requirements", "equipment", "impactLabel", "impactAmount", "checklist", "whyHere", "matchesInterest"],
      },
    },
  },
  required: ["areaSummary", "missions"],
} as const;

/** Vision verification. */
export interface VerifyRequest {
  title: string;
  description: string;
  category: Category;
  checklist: string[];
  images: string[]; // base64 JPEG, no data: prefix
  language: Lang;
}

export interface VerifyResult {
  confidence: number;
  summary: string;
  concerns: string[];
  model: string;
}

export const VERIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    confidence: { type: "NUMBER", description: "0..1: how likely the photos show THIS mission really being done by the volunteer." },
    summary: { type: "STRING", description: "1-2 sentences describing what the photos show." },
    concerns: { type: "ARRAY", items: { type: "STRING" }, description: "Specific problems: stock photo, screenshot, unrelated scene, same scene as before, no visible work." },
  },
  required: ["confidence", "summary", "concerns"],
} as const;

export const LANG_NAME: Record<Lang, string> = { uz: "Uzbek (Latin script)", ru: "Russian", en: "English" };
