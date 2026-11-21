/**
 * Automatic review of agent missions (missions the GPS agent made for one volunteer; no organization owns them).
 * The AI decides, and every decision goes to the admins' audit queue, where an admin confirms or overturns it.
 * Pure: shared by the browser (local demo mode) and the ai-review server function (Firebase mode).
 */
import { levelForXp } from "./rewards";
import type { AiReview, Certificate, Submission, UserProfile, VerificationCheck } from "./types";

/** The reviewer identity the AI acts as. */
export const AI_REVIEWER_ID = "worfix-ai";
export function aiReviewer(now: string): UserProfile {
  return {
    id: AI_REVIEWER_ID, email: "", emailVerified: true, fullName: "WORFIX AI", username: "worfix_ai", avatar: null, bio: "", country: "", province: "", city: "",
    languages: [], skills: [], interests: [], feedVisible: false, level: 1, xp: 0, points: 0, trustScore: 100, reputation: 0, streak: 0, lastApprovedDay: null,
    totalVolunteerHours: 0, totalImpact: 0, impact: {}, onboarded: true, organizationId: null, role: "admin", status: "active", createdAt: now, updatedAt: now, lastLogin: null,
  };
}

export const AI_APPROVE_AT = 0.75;
export const AI_REJECT_BELOW = 0.25;
export const AI_MAX_FRAUD = 0.5;

export interface AiVerdict { confidence: number; summary: string; concerns: string[]; model: string }

/**
 * The decision rule:
 *  • approve when the photos clearly show the work (confidence ≥ 0.75), the automatic checks found no failure and fraud risk is low;
 *  • reject when the photos clearly do not show the work (confidence < 0.25) or a photo was reused from another submission;
 *  • ask for more evidence when it is in between and the evidence is thin;
 *  • otherwise (or when the AI is unavailable) escalate to an admin.
 */
export function decideAi(verdict: AiVerdict | null, checks: VerificationCheck[], fraudScore: number, now: string): AiReview {
  const base = { at: now, audit: "pending" as const, auditedBy: null, auditedAt: null, auditNote: "" };
  if (!verdict) {
    return { ...base, decision: "escalated", confidence: 0, summary: "", reasons: ["ai.r.unavailable"], model: "", audit: "not_needed" };
  }
  const failed = checks.filter((c) => c.result === "fail").map((c) => c.id);
  const reasons: string[] = [];
  if (failed.includes("duplicate")) {
    return { ...base, decision: "rejected", confidence: verdict.confidence, summary: verdict.summary, reasons: ["ai.r.duplicate", ...verdict.concerns], model: verdict.model };
  }
  if (verdict.confidence >= AI_APPROVE_AT && failed.length === 0 && fraudScore < AI_MAX_FRAUD) {
    return { ...base, decision: "approved", confidence: verdict.confidence, summary: verdict.summary, reasons: verdict.concerns, model: verdict.model };
  }
  if (verdict.confidence < AI_REJECT_BELOW) {
    return { ...base, decision: "rejected", confidence: verdict.confidence, summary: verdict.summary, reasons: ["ai.r.noWork", ...verdict.concerns], model: verdict.model };
  }
  if (failed.length) reasons.push(...failed.map((id) => `ai.r.check.${id}`));
  if (fraudScore >= AI_MAX_FRAUD) reasons.push("ai.r.risk");
  const thin = checks.some((c) => c.id === "photos" && c.result !== "pass");
  if (thin && verdict.confidence >= AI_REJECT_BELOW) {
    return { ...base, decision: "needs_more_info", confidence: verdict.confidence, summary: verdict.summary, reasons: ["ai.r.morePhotos", ...reasons, ...verdict.concerns], model: verdict.model };
  }
  return { ...base, decision: "escalated", confidence: verdict.confidence, summary: verdict.summary, reasons: ["ai.r.unsure", ...reasons, ...verdict.concerns], model: verdict.model, audit: "not_needed" };
}

/** Note shown to the volunteer for an AI decision (reviewSubmission needs ≥ 5 characters for non-approvals). */
export function aiNote(r: AiReview) {
  const text = [r.summary, ...r.reasons.filter((x) => !x.startsWith("ai.r."))].filter(Boolean).join(" — ");
  return (text || "WORFIX AI").slice(0, 600).padEnd(5, ".");
}

/**
 * Takes back what an approval granted (an admin overturned it). Fixcoin already spent cannot go below zero.
 * Certificates for levels the volunteer no longer has are revoked.
 */
export function reverseGrant(volunteer: UserProfile, grant: NonNullable<Submission["grant"]>, certificates: Certificate[], now: string) {
  const xp = Math.max(0, volunteer.xp - grant.xp);
  const impact = { ...volunteer.impact };
  for (const [k, v] of Object.entries(grant.impact)) {
    const left = (impact[k] ?? 0) - v;
    if (left > 0) impact[k] = left; else delete impact[k];
  }
  const level = levelForXp(xp);
  const next: UserProfile = {
    ...volunteer, xp, level, points: Math.max(0, volunteer.points - grant.points),
    totalVolunteerHours: Math.max(0, Math.round((volunteer.totalVolunteerHours - grant.hours) * 100) / 100),
    impact, totalImpact: Object.values(impact).reduce((a, b) => a + b, 0), updatedAt: now,
  };
  const revoked = certificates.filter((c) => c.userId === volunteer.id && !c.revokedAt && (c.level ?? 0) > level).map((c) => ({ ...c, revokedAt: now }));
  return { volunteer: next, revoked };
}
