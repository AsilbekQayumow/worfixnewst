/**
 * v6 · Feature 19: emergency mode, an extension of help signals (not a separate system).
 *  level 1 — an ordinary signal (anyone)
 *  level 2 — unverified emergency: at least 3 independent people flag the same kind of event within 2 km (yellow)
 *  level 3 — verified emergency: declared by an admin or an approved "emergency partner" organization (red)
 * The app never replaces the emergency services: every emergency screen shows the official numbers.
 */
import { distanceM } from "./territory";
import type { GeoPoint } from "./types";

export const EMERGENCY_KINDS = ["flood", "earthquake", "fire", "water", "power", "storm", "other"] as const;
export type EmergencyKind = (typeof EMERGENCY_KINDS)[number];
export const EMERGENCY_ROLES = ["medical", "driver", "general"] as const;
export type EmergencyRole = (typeof EMERGENCY_ROLES)[number];
export type EmergencyState = "unverified" | "verified" | "resolved";

/** Official short numbers in Uzbekistan (oldmy.gov.uz "life situations"); 112 is being rolled out region by region. */
export const EMERGENCY_NUMBERS = [
  { n: "101", key: "em.n.fire" },
  { n: "102", key: "em.n.police" },
  { n: "103", key: "em.n.ambulance" },
  { n: "1050", key: "em.n.rescue" },
  { n: "112", key: "em.n.unified" },
] as const;

export const EMERGENCY = {
  clusterReports: 3,
  clusterRadiusM: 2000,
  clusterHours: 6,
  /** a person may flag at most this many emergencies a day (level 2 rate limit) */
  flagsPerDay: 3,
  maxRadiusKm: 50,
} as const;

export interface EmergencyFlag { userId: string; kind: EmergencyKind; location: GeoPoint; createdAt: string }

/** Flags that together reach level 2 (3+ different people, same kind, within 2 km and 6 hours of the newest). */
export function unverifiedCluster(flags: EmergencyFlag[], now = Date.now()) {
  const recent = flags.filter((f) => now - Date.parse(f.createdAt) < EMERGENCY.clusterHours * 3_600_000);
  for (const f of recent) {
    const near = recent.filter((g) => g.kind === f.kind && distanceM(g.location, f.location) <= EMERGENCY.clusterRadiusM);
    const people = new Set(near.map((g) => g.userId));
    if (people.size >= EMERGENCY.clusterReports) return { kind: f.kind, center: f.location, people: [...people] };
  }
  return null;
}

export function canDeclare(u: { role: string }, org: { verificationStatus: string; emergencyPartner?: boolean } | null) {
  if (u.role === "admin" || u.role === "super_admin") return true;
  return u.role === "organization" && org?.verificationStatus === "approved" && Boolean(org.emergencyPartner);
}

/** Under-18s see the information but cannot say "I'm going". */
export const canRespond = (birthYear: number | null | undefined, now = new Date()) => typeof birthYear !== "number" || now.getFullYear() - birthYear >= 18;

/** Hours each responder is credited on close: from their "going" to the close, capped at 12, at least 1. */
export const creditedHours = (goingAt: string, closedAt: string) =>
  Math.max(1, Math.min(12, Math.round((Date.parse(closedAt) - Date.parse(goingAt)) / 3_600_000)));

/** Is this place inside the emergency area (by profile province/city: no stored GPS)? */
export function inArea(u: { province: string; city: string }, area: { provinces: string[]; cities?: string[] }) {
  const n = (x: string) => x.toLowerCase().replace(/ region| viloyati| область/g, "").trim();
  if (area.provinces.some((p) => n(p) === n(u.province) && n(p))) return true;
  return (area.cities ?? []).some((c) => n(c) === n(u.city) && n(c));
}
