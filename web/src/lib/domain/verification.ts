import { canReviewSubmission, DomainError } from "./permissions";
import { computeGrant, crossedCertificateLevels, dayKey, levelForXp, nextStreak } from "./rewards";
import { makeVerificationCode } from "./certificates";
import type {
  AuditLog, Certificate, Mission, Notification, Organization, Submission, UserProfile, VerificationRecord, VerificationStatus,
} from "./types";

const TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  pending: ["approved", "rejected", "needs_more_info"],
  needs_more_info: ["pending"],
  approved: [],
  rejected: [],
};

export function canTransition(from: VerificationStatus, to: VerificationStatus) {
  return TRANSITIONS[from].includes(to);
}

export type ReviewDecision = "approved" | "rejected" | "needs_more_info";

export interface ReviewInput {
  submission: Submission;
  mission: Mission;
  volunteer: UserProfile;
  reviewer: UserProfile;
  organization: Organization | null;
  decision: ReviewDecision;
  note: string;
  now: string;
  newId: () => string;
  origin: string;
  /** true when the volunteer did the mission with friends */
  team: boolean;
}

export interface ReviewResult {
  submission: Submission;
  volunteer: UserProfile;
  record: VerificationRecord;
  certificates: Certificate[];
  notifications: Notification[];
  audit: AuditLog;
}

const note = (id: string, userId: string, type: Notification["type"], key: string, values: Record<string, unknown>, link: string, now: string): Notification =>
  ({ id, userId, type, title: key, message: JSON.stringify(values), link, read: false, createdAt: now });

/**
 * Pure review decision, shared by every backend.
 * Approval grants XP by difficulty and Fixcoin exactly once. Certificates are issued when the new XP
 * crosses a certificate level, not per mission.
 */
export function reviewSubmission(input: ReviewInput): ReviewResult {
  const { submission, mission, volunteer, reviewer, organization, decision, now } = input;
  const text = input.note.trim();

  if (!canReviewSubmission(reviewer, submission, organization)) throw new DomainError("forbidden", "e.reviewForbidden");
  if (!canTransition(submission.verificationStatus, decision)) throw new DomainError("invalid_state", "e.reviewState");
  if (decision !== "approved" && text.length < 5) throw new DomainError("validation", "e.reviewNote");
  if (decision === "approved" && submission.rewardGrantedAt) throw new DomainError("conflict", "e.rewardTwice");

  const next: Submission = { ...submission, verificationStatus: decision, reviewedBy: reviewer.id, reviewedAt: now, reviewNote: text };
  let vol = volunteer;
  const certificates: Certificate[] = [];
  const notifications: Notification[] = [];

  if (decision === "approved") {
    const grant = computeGrant(mission, volunteer, { team: input.team });
    const xp = volunteer.xp + grant.xp;
    const impact = { ...volunteer.impact };
    for (const [label, amount] of Object.entries(grant.impact)) impact[label] = (impact[label] ?? 0) + amount;
    const hours = Math.round((volunteer.totalVolunteerHours + grant.hours) * 100) / 100;
    vol = {
      ...volunteer, xp, level: levelForXp(xp), points: volunteer.points + grant.points, totalVolunteerHours: hours, impact,
      totalImpact: Object.values(impact).reduce((a, b) => a + b, 0),
      streak: nextStreak(volunteer.streak, volunteer.lastApprovedDay, dayKey(now)), lastApprovedDay: dayKey(now), updatedAt: now,
    };
    for (const level of crossedCertificateLevels(volunteer.xp, xp)) {
      const code = makeVerificationCode();
      certificates.push({
        id: input.newId(), userId: volunteer.id, missionId: mission.id, organizationId: mission.organizationId, certificateType: "level",
        qrCode: `${input.origin}/verify/${code}`, verificationCode: code, issuedAt: now, pdfUrl: null, holderName: volunteer.fullName,
        missionTitle: mission.title, organizationName: "WORFIX", hours, xp, level,
      });
      notifications.push(note(input.newId(), volunteer.id, "reward", "n.certificate", { level }, "/app/profile?tab=certificates", now));
    }
    next.rewardGrantedAt = now;
    next.certificateId = certificates[0]?.id ?? null;
    notifications.push(note(input.newId(), volunteer.id, "reward", "n.approved", { title: mission.title, xp: grant.xp, coins: grant.points }, `/app/missions/${mission.id}`, now));
  } else {
    notifications.push(note(input.newId(), volunteer.id, "submission", decision === "rejected" ? "n.rejected" : "n.moreInfo", { title: mission.title, note: text }, `/app/missions/${mission.id}`, now));
  }

  return {
    submission: next,
    volunteer: vol,
    certificates,
    notifications,
    record: { id: input.newId(), submissionId: submission.id, reviewerId: reviewer.id, reviewerRole: reviewer.role, decision, note: text, createdAt: now },
    audit: {
      id: input.newId(), actor: reviewer.id, actorRole: reviewer.role, action: `submission.${decision}`, resource: "missionSubmissions",
      resourceId: submission.id, timestamp: now, detail: `${mission.title} / ${volunteer.username}`, ipAddress: null, device: null,
    },
  };
}

/** Volunteer adds evidence after "needs more info": back to the queue. */
export function resubmit(submission: Submission, additions: Pick<Submission, "images" | "notes">, now: string): Submission {
  if (!canTransition(submission.verificationStatus, "pending")) throw new DomainError("invalid_state", "e.notWaiting");
  return {
    ...submission,
    images: [...submission.images, ...additions.images].slice(0, 8),
    notes: additions.notes ? `${submission.notes}\n\n[${now.slice(0, 10)}] ${additions.notes}`.trim() : submission.notes,
    verificationStatus: "pending",
    timestamp: now,
    metadata: { ...submission.metadata, submissionCount: submission.metadata.submissionCount + 1 },
  };
}
