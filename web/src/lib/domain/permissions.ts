import type { Mission, Organization, Role, Submission, UserProfile } from "./types";

/** `message` is an i18n key (see lib/i18n/dict.ts) or plain text. */
export class DomainError extends Error {
  constructor(
    public code: "forbidden" | "not_found" | "invalid_state" | "validation" | "conflict" | "suspended" | "unverified_email",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const isAdmin = (role: Role) => role === "admin" || role === "super_admin";

export const AGENT_PREFIX = "agent_";
export const agentOrgId = (userId: string) => `${AGENT_PREFIX}${userId}`;
export const isAgentOrg = (orgId: string) => orgId.startsWith(AGENT_PREFIX);

export function homeForRole(role: Role) {
  if (isAdmin(role)) return "/admin";
  if (role === "organization") return "/org";
  return "/app";
}

export type Area = "volunteer" | "organization" | "admin";

export function canEnterArea(role: Role, area: Area) {
  if (area === "admin") return isAdmin(role);
  if (area === "organization") return role === "organization" || isAdmin(role);
  return role === "volunteer" || role === "company";
}

export function assertActive(user: Pick<UserProfile, "status">) {
  if (user.status === "suspended") throw new DomainError("suspended", "e.suspended");
  if (user.status === "deleted") throw new DomainError("not_found", "e.notFound");
}

/**
 * Who can review: staff of the approved owning organization, or an admin.
 * Missions made by the GPS agent have no organization, so WORFIX moderators (admins) review them.
 * Never the author.
 */
export function canReviewSubmission(
  reviewer: Pick<UserProfile, "id" | "role" | "organizationId" | "status">,
  submission: Pick<Submission, "userId" | "organizationId">,
  org: Pick<Organization, "verificationStatus"> | null,
) {
  if (reviewer.status !== "active") return false;
  if (reviewer.id === submission.userId) return false;
  if (isAdmin(reviewer.role)) return true;
  if (isAgentOrg(submission.organizationId)) return false;
  return reviewer.role === "organization" && reviewer.organizationId === submission.organizationId && org?.verificationStatus === "approved";
}

export function canManageMission(user: Pick<UserProfile, "role" | "organizationId" | "status">, mission: Pick<Mission, "organizationId">) {
  if (user.status !== "active") return false;
  if (isAdmin(user.role)) return true;
  return user.role === "organization" && user.organizationId === mission.organizationId;
}
