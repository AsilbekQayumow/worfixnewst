/**
 * WORFIX domain types. Timestamps are ISO-8601 strings.
 * The original data structure is kept field-for-field. Fields added in this version are marked
 * "EXTRA (v2)" and are optional on read, so documents written by the previous app still load.
 */

export const ROLES = ["volunteer", "organization", "company", "admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["active", "suspended", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const CATEGORIES = ["environment", "community", "animals", "education", "water", "recycling"] as const;
export type Category = (typeof CATEGORIES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const MISSION_STATUSES = ["draft", "pending_review", "published", "closed", "cancelled"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const PARTICIPANT_STATUSES = ["pending", "accepted", "rejected", "withdrawn"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const VERIFICATION_STATUSES = ["pending", "approved", "rejected", "needs_more_info"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ORG_VERIFICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type OrgVerificationStatus = (typeof ORG_VERIFICATION_STATUSES)[number];

/** EXTRA (v2) */
export const LANGS = ["uz", "ru", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** EXTRA (v2): who can open a volunteer's profile and see their results. */
export const PRIVACY_MODES = ["public", "friends", "private"] as const;
export type PrivacyMode = (typeof PRIVACY_MODES)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
}
export interface GpsFix extends GeoPoint {
  accuracy: number;
  /** v6: the phone said this location came from a mock-location app */
  mock?: boolean;
}

export interface ImpactMetric {
  label: string;
  amountPerVolunteer: number;
}

export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  username: string;
  avatar: string | null;
  bio: string;
  country: string;
  province: string;
  city: string;
  languages: string[];
  skills: string[];
  interests: Category[];
  feedVisible: boolean;
  level: number;
  xp: number;
  /** Fixcoin balance. Earned from verified missions, spent in the shop. */
  points: number;
  trustScore: number;
  reputation: number;
  streak: number;
  lastApprovedDay: string | null;
  totalVolunteerHours: number;
  totalImpact: number;
  impact: Record<string, number>;
  onboarded: boolean;
  organizationId: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
  /** EXTRA (v2) */
  language?: Lang;
  /** EXTRA (v2) */
  privacy?: PrivacyMode;
  /** EXTRA (v2): personal info, visible only to the owner */
  phone?: string;
  /** EXTRA (v2) */
  birthYear?: number | null;
  /** v2.1: announcements created before this time count as read */
  announcementsSeenAt?: string | null;
  /** v3: district (tuman) and neighbourhood (mahalla), for the local leaderboards */
  district?: string;
  mahalla?: string;
  /** v4: the player's own colour on the territory map (one of MAP_COLORS); unset = derived from the id */
  mapColor?: string | null;
  /** v3: how the account signs in */
  authProvider?: "email" | "phone" | "telegram";
  /** v3: set when the phone number was confirmed by SMS (Firebase phone sign-in) */
  phoneVerified?: boolean;
  /** v3: Telegram account id when signed in with Telegram */
  telegramId?: string | null;
  /** v6: reminder kinds the person wants (all on when unset) */
  notifyPrefs?: { nearby?: boolean; deadline?: boolean; mine?: boolean; proof?: boolean; emergency?: boolean } | null;
  /** v6: skills from the taxonomy (domain/skills.ts); `skills` keeps the old free text */
  skillSet?: { id: string; level: "beginner" | "experienced" | "expert"; proof: "self" | "missions" | "document" }[];
  /** v6: organizations may find this volunteer by skill (off by default) */
  discoverable?: boolean;
  /** v6: "assisted" (wheelchair, bike, not on foot) turns the step check off */
  moveMode?: "walk" | "assisted";
  /** v7: the place picked from the official list (SOATO district id, mahalla id); `district`/`mahalla` keep the names */
  districtId?: number | null;
  mahallaId?: string | null;
  /** v7: what the person wears from the game (written only by the game engine) */
  look?: { frame: string | null; title: string | null; pattern: string | null; flag: string | null } | null;
}

export interface Organization {
  id: string;
  name: string;
  logo: string | null;
  description: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  city: string;
  organizationType: string;
  verificationStatus: OrgVerificationStatus;
  verificationNote: string;
  ownerId: string;
  members: string[];
  rating: number;
  totalVolunteers: number;
  totalMissions: number;
  createdAt: string;
  /** v6: number of followers (the list itself is never shown to the organization) */
  followers?: number;
  /** v6: how many ratings the score is made of */
  ratingCount?: number;
  /** v6: may declare verified emergencies */
  emergencyPartner?: boolean;
}

export interface Mission {
  id: string;
  /** For missions the Gemini agent made for one volunteer: `agent_<userId>`. */
  organizationId: string;
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  /** Fixed by difficulty (see rewards.ts). */
  rewardXP: number;
  /** Fixcoin reward. */
  rewardPoints: number;
  location: string;
  coordinates: GeoPoint | null;
  date: string;
  deadline: string;
  duration: number;
  capacity: number;
  participantsCount: number;
  status: MissionStatus;
  featured: boolean;
  requirements: string;
  safety: string;
  equipment: string;
  impactMetrics: ImpactMetric[];
  moderationNote: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  /** EXTRA (v2): "agent" = generated by the GPS mission agent for one volunteer */
  source?: "organization" | "agent";
  /** EXTRA (v2): owner of an agent mission */
  ownerId?: string | null;
  /** EXTRA (v2): geofence radius in metres for GPS checks */
  radiusM?: number;
  /** EXTRA (v2): concrete steps the volunteer confirms when submitting */
  checklist?: string[];
  /** EXTRA (v2): why the agent picked this place */
  whyHere?: string;
  /** v3.2: when it went live (territory owners get the first look for a few hours) */
  publishedAt?: string | null;
  /** v6: skills the mission needs (domain/skills.ts) */
  skillsWanted?: { skillId: string; count?: number; required: boolean }[];
  /** v6: made automatically when an emergency closed */
  emergencyId?: string | null;
}

export interface MissionParticipant {
  id: string;
  missionId: string;
  userId: string;
  joinedAt: string;
  status: ParticipantStatus;
  attendance: boolean;
  completionStatus: "joined" | "submitted" | "completed";
  /** EXTRA (v2): friends doing the mission together share a team id */
  teamId?: string | null;
  /** EXTRA (v2): when the volunteer pressed "Start" */
  startedAt?: string | null;
  /** EXTRA (v2): GPS check-in at start */
  startGps?: GpsFix | null;
}

export interface Evidence {
  kind: "image";
  dataUrl: string;
  sha256: string;
  name: string;
  size: number;
  /** EXTRA (v2): 64-bit difference hash (hex) for near-duplicate detection */
  phash?: string;
  /** EXTRA (v2): when the photo was taken (EXIF or in-app camera) */
  capturedAt?: string | null;
  /** EXTRA (v2): GPS written into the photo by the camera */
  exifGps?: GeoPoint | null;
  /** EXTRA (v2) */
  source?: "camera" | "library";
  /** EXTRA (v2) */
  stage?: "before" | "after" | "proof";
}

/** EXTRA (v2): one automatic verification signal shown to the reviewer. */
export interface VerificationCheck {
  id: "photos" | "duplicate" | "captureTime" | "photoLocation" | "deviceLocation" | "checkIn" | "timeOnSite" | "checklist" | "ai" | "mockLocation" | "deviceClock";
  result: "pass" | "warn" | "fail" | "skip";
  /** i18n key */
  detail: string;
  /** values for the i18n string */
  values?: Record<string, string | number>;
}

export interface Submission {
  id: string;
  missionId: string;
  userId: string;
  organizationId: string;
  images: Evidence[];
  videos: Evidence[];
  notes: string;
  gps: GpsFix | null;
  gpsConsent: boolean;
  timestamp: string;
  metadata: { userAgent: string; submissionCount: number };
  aiConfidence: number | null;
  fraudScore: number;
  fraudFlags: string[];
  verificationStatus: VerificationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  rewardGrantedAt: string | null;
  certificateId: string | null;
  /** EXTRA (v2) */
  checks?: VerificationCheck[];
  /** EXTRA (v2): what the vision model saw */
  aiNotes?: string;
  /** EXTRA (v2) */
  checklistDone?: string[];
  /** EXTRA (v2) */
  teamId?: string | null;
  /** v3: what approval granted, so an overturned decision can be reversed exactly */
  grant?: { xp: number; points: number; hours: number; impact: Record<string, number> } | null;
  /** v3: automatic review of agent missions by the AI, and the admins' audit of it */
  aiReview?: AiReview | null;
  /** v3: the volunteer's group when the mission was done, for group XP */
  groupId?: string | null;
  /** v6: the team bonus XP given for this submission */
  teamBonusXp?: number;
  teamBonusAt?: string | null;
  /** v6: what this submission added to a challenge, so a revoked approval can take it back */
  challengeCredit?: { challengeId: string; value: number } | null;
  /** v6: written offline: when the device made it */
  capturedAt?: string | null;
  /** v6: hidden from the feed by a moderator */
  hiddenAt?: string | null;
}

/** v3: the AI reviewer's decision on an agent-mission submission. */
export interface AiReview {
  /** "escalated": the AI could not decide (or was unavailable); an admin reviews it like any other submission */
  decision: "approved" | "rejected" | "needs_more_info" | "escalated";
  confidence: number;
  summary: string;
  reasons: string[];
  model: string;
  at: string;
  /** the admins' check of the AI decision */
  audit: "pending" | "confirmed" | "overturned" | "not_needed";
  auditedBy?: string | null;
  auditedAt?: string | null;
  auditNote?: string;
}

export interface VerificationRecord {
  id: string;
  submissionId: string;
  reviewerId: string;
  reviewerRole: Role;
  decision: VerificationStatus;
  note: string;
  createdAt: string;
}

export interface Certificate {
  id: string;
  userId: string;
  /** The mission whose approval reached the level ("" when none). */
  missionId: string;
  organizationId: string;
  /** v2 issues "level" certificates only; "mission" ones from v1 stay valid. */
  certificateType: "mission" | "level";
  qrCode: string;
  verificationCode: string;
  issuedAt: string;
  pdfUrl: string | null;
  holderName: string;
  missionTitle: string;
  organizationName: string;
  hours: number;
  xp: number;
  /** EXTRA (v2): level reached */
  level?: number | null;
  /** v3: set when the approval behind it was overturned */
  revokedAt?: string | null;
}

export interface Notification {
  id: string;
  userId: string;
  type: "submission" | "mission" | "organization" | "reward" | "system";
  /** v2: an i18n key ("n.*"); v1 documents hold plain text */
  title: string;
  /** v2: JSON-encoded values for the i18n key; v1 documents hold plain text */
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  actorRole: Role | "system";
  action: string;
  resource: string;
  resourceId: string;
  timestamp: string;
  detail: string;
  ipAddress: string | null;
  device: string | null;
}

export interface Friendship {
  id: string;
  from: string;
  to: string;
  status: "pending" | "accepted";
  createdAt: string;
}

export interface Cheer {
  id: string;
  submissionId: string;
  userId: string;
  createdAt: string;
}

/** EXTRA (v2): item in the Fixcoin shop. Public read, admin write. */
export interface ShopItem {
  id: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  price: number;
  kind: "merch" | "experience" | "donation" | "digital";
  /** which drawn artwork to show */
  art: "bottle" | "tote" | "tree" | "cap" | "badge" | "ticket" | "kit" | "frame";
  stock: number;
  active: boolean;
  createdAt: string;
  /** v2.1: a product photo (small JPEG data URL); the drawn art is shown when there is none */
  image?: string | null;
  /** v3: the item is delivered as a partner promo code (subscriptions, vouchers) */
  delivery?: "pickup" | "promo";
}

/** v3: one partner promo code for a "promo" shop item. Only admins and the buyer it was issued to can read it. */
export interface PromoCode {
  id: string;
  itemId: string;
  code: string;
  orderId: string | null;
  userId: string | null;
  createdAt: string;
  issuedAt: string | null;
}

/** EXTRA (v2): a Fixcoin purchase. */
export interface Order {
  id: string;
  userId: string;
  itemId: string;
  itemTitle: string;
  price: number;
  code: string;
  status: "placed" | "processing" | "fulfilled" | "cancelled";
  createdAt: string;
  /** v2.1: admin's note to the buyer (pick-up place, reason for cancelling) */
  note?: string | null;
  updatedAt?: string | null;
  /** v3: the partner code delivered for a promo item */
  promoCode?: string | null;
}

/** EXTRA (v2): a direct message between two friends. chatId = the two user ids sorted and joined by "_". */
export interface Message {
  id: string;
  chatId: string;
  participants: [string, string];
  from: string;
  text: string;
  kind: "text" | "invite" | "group_invite";
  missionId: string | null;
  readBy: string[];
  createdAt: string;
  /** v2.1: emoji → user ids who reacted */
  reactions?: Record<string, string[]>;
  /** v2.1: the message this one answers (a short copy so it shows even if the original changes) */
  replyTo?: { id: string; from: string; text: string } | null;
  /** v2.1: set when the sender edits the text */
  editedAt?: string | null;
  /** v2.1: set when the sender deletes it; text is then emptied */
  deletedAt?: string | null;
  /** v2.1: "admin" for a message sent by the moderation team */
  via?: "admin" | null;
  /** v3.1: the group a "group_invite" message invites to (code lets the friend join in one tap) */
  group?: { id: string; name: string; color: string; code: string } | null;
  /** v3.1: the invited friend's answer to a group invite */
  inviteStatus?: "accepted" | "declined" | null;
  /** v6: hidden by a moderator (or by reports) until reviewed */
  hiddenAt?: string | null;
}

/** v2.1: an announcement from the admins, shown to everyone (or one audience) in notifications and on the home page. */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: "all" | "volunteer" | "organization";
  link: string | null;
  authorId: string;
  createdAt: string;
}

/** v3: a news post written by the admins, shown on the home pages. */
export interface NewsPost {
  id: string;
  title: string;
  summary: string;
  body: string;
  /** small JPEG data URL */
  cover: string | null;
  category: "news" | "event" | "update" | "story" | "partner";
  audience: "all" | "volunteer" | "organization";
  status: "draft" | "published";
  pinned: boolean;
  /** shown from this time (lets admins schedule a post) */
  publishAt: string;
  link: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

/** v3: a volunteer group (team). Members read and write its chat. */
export interface Group {
  id: string;
  name: string;
  description: string;
  color: string;
  ownerId: string;
  members: string[];
  province: string;
  district: string;
  mahalla: string;
  createdAt: string;
}

/** v3: a message in a group chat. */
export interface GroupMessage {
  id: string;
  groupId: string;
  from: string;
  text: string;
  kind: "text" | "signal" | "system";
  signalId: string | null;
  readBy: string[];
  createdAt: string;
  reactions?: Record<string, string[]>;
  replyTo?: { id: string; from: string; text: string } | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  /** v6: hidden by a moderator until reviewed */
  hiddenAt?: string | null;
}

/** v3: a call for help: nearby volunteers and the group are asked to come. */
export interface HelpSignal {
  id: string;
  userId: string;
  groupId: string | null;
  missionId: string | null;
  title: string;
  note: string;
  location: GeoPoint;
  place: string;
  radiusKm: number;
  province: string;
  district: string;
  city: string;
  responders: string[];
  status: "open" | "closed";
  createdAt: string;
  expiresAt: string;
  /** v6: "emergency" = a wide-scale event (domain/emergency.ts) */
  kind?: "signal" | "emergency";
  emergency?: {
    type: string; state: "unverified" | "verified" | "resolved"; severity: 1 | 2 | 3; provinces: string[]; cities: string[];
    verifiedBy: string | null; needs: string[]; meetingPoints: string[]; contacts: string; validUntil: string;
    going: Record<string, { role: string; at: string; point: string; confirmed?: boolean }>; closedAt?: string | null; closingNote?: string;
  } | null;
}

/** v3.2: the area a volunteer holds this month (one document per person per season). */
export interface Territory {
  /** `${season}_${userId}` */
  id: string;
  userId: string;
  /** the owner's group when the area was last taken; group areas are the union of their members' */
  groupId: string | null;
  /** "2026-11" — areas reset every month */
  season: string;
  /** MultiPolygon coordinates as JSON ([lng, lat]); empty string when nothing is left */
  shape: string;
  areaM2: number;
  center: GeoPoint | null;
  bbox: number[];
  captures: number;
  /** area lost to others and to decay this season */
  lostM2: number;
  /** the last "someone is taking your area" notice (one per person per 12 hours) */
  takenNotice?: { by: string; at: string } | null;
  createdAt: string;
  updatedAt: string;
  decayCheckedAt: string;
}

/** v3.2: one closed loop (no raw GPS is kept, only these figures for fair play checks). */
export interface TerritoryCapture {
  id: string;
  userId: string;
  groupId: string | null;
  season: string;
  areaM2: number;
  gainedM2: number;
  distanceM: number;
  durationS: number;
  maxSpeedKmh: number;
  droppedFast: number;
  takenFrom: { userId: string; areaM2: number }[];
  createdAt: string;
  /** v4: the loop itself (encoded MultiPolygon), for the season replay */
  loop?: string;
  /** v6: fair play numbers (no raw trace) */
  fairplay?: { score: number; flags: string[]; verdict: "accept" | "delay" | "reject"; p95Speed: number; stepsPerKm: number | null; accuracyMedian: number | null; source: "app" | "web"; mock: boolean; shadow: boolean; countsAfter?: string | null } | null;
}

/** v3.2: someone asks to join a group; any member can let them in. `${groupId}_${userId}` */
export interface GroupRequest {
  id: string;
  groupId: string;
  userId: string;
  status: "pending" | "approved" | "declined" | "joined" | "cancelled";
  note: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** v7: a mahalla missing from the list, sent from the place picker; admins add it (`places`). */
export interface PlaceRequest {
  id: string;
  userId: string;
  districtId: number;
  name: string;
  status: "pending" | "added" | "rejected";
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}
/** v7: a mahalla added by an admin on top of the shipped list. */
export interface CustomPlace { id: string; districtId: number; name: string; createdAt: string; createdBy: string }
