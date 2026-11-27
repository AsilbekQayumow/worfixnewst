import { districtById, REGIONS } from "../game/places";
import { CATEGORIES, DIFFICULTIES, LANGS, PRIVACY_MODES, type Category, type Difficulty, type Lang, type PrivacyMode } from "./types";

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MIN_IMAGE_EDGE = 320;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Field → i18n key of the problem. */
export type Errors = Record<string, string>;
export type Result<T> = { ok: true; data: T } | { ok: false; errors: Errors };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function done<T>(errors: Errors, data: T): Result<T> {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

export function passwordProblem(p: string): string | null {
  if (p.length < 8) return "v.passwordLen";
  if (p.length > 128) return "v.passwordLen";
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return "v.passwordMix";
  return null;
}

export function ageErrors(birthYear: unknown, guardianConsent: unknown): Errors {
  const year = Number(birthYear);
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) return { birthYear: "v.birthYear" };
  const age = new Date().getFullYear() - year;
  if (age < 15) return { birthYear: "v.age15" };
  if (age < 18 && guardianConsent !== true) return { guardianConsent: "v.guardian" };
  return {};
}

export interface OrganizationInput {
  name: string; description: string; organizationType: string; website: string; email: string; phone: string; address: string; country: string; city: string;
}

export function validateOrganization(i: Partial<OrganizationInput>): Result<OrganizationInput> {
  const e: Errors = {};
  const d: OrganizationInput = {
    name: str(i.name), description: str(i.description), organizationType: str(i.organizationType), website: str(i.website),
    email: str(i.email).toLowerCase(), phone: str(i.phone), address: str(i.address), country: str(i.country), city: str(i.city),
  };
  if (d.name.length < 2 || d.name.length > 120) e.name = "v.orgName";
  if (d.description.length < 30 || d.description.length > 1200) e.description = "v.orgDesc";
  if (d.organizationType.length < 2) e.organizationType = "v.required";
  if (d.website && !/^https?:\/\/.+\..+/.test(d.website)) e.website = "v.url";
  if (!EMAIL.test(d.email)) e.email = "v.email";
  if (d.phone.length > 30) e.phone = "v.phone";
  if (d.address.length < 3) e.address = "v.required";
  if (d.country.length < 2) e.country = "v.required";
  if (d.city.length < 2) e.city = "v.required";
  return done(e, d);
}

export interface RegisterInput {
  fullName: string; email: string; password: string; accountType: "volunteer" | "organization";
  ageConfirmed: boolean; guardianConsent: boolean; birthYear: number;
  /** required when accountType = organization */
  organization?: OrganizationInput;
  /** v7: required for volunteers — picked from the official list */
  place?: PlaceInput;
}

/** v7: viloyat → tuman → mahalla, picked from the list (never typed, except a mahalla sent for adding). */
export interface PlaceInput { province: string; districtId: number | null; district: string; mahallaId: string | null; mahalla: string }

export function validatePlace(i: Partial<PlaceInput> | undefined, required: boolean): { errors: Errors; data: PlaceInput | null } {
  const e: Errors = {};
  const d = districtById(i?.districtId ?? null);
  const region = d ? REGIONS.find((r) => r.id === d.r) : null;
  const mahalla = str(i?.mahalla);
  const mahallaId = str(i?.mahallaId);
  if (!i || (!d && !required)) return { errors: e, data: null };
  if (!region) e.province = "v.pickRegion";
  if (!d) e.district = "v.pickDistrict";
  if (!mahalla || mahalla.length > 80) e.mahalla = "v.pickMahalla";
  if (mahallaId && !/^(m\d{1,6}|c_[a-z0-9-]{4,40})$/.test(mahallaId)) e.mahalla = "v.pickMahalla";
  if (Object.keys(e).length) return { errors: e, data: null };
  return { errors: e, data: { province: region!.p, districtId: d!.id, district: d!.uz, mahallaId: mahallaId || null, mahalla } };
}
/** The city a district stands for ("Urgut tumani" → "Urgut"). */
export const cityOfDistrict = (district: string) => district.replace(/\s+(tumani|shahri)$/i, "");

export function validateRegister(i: Partial<RegisterInput>): Result<RegisterInput> {
  const e: Errors = {};
  const fullName = str(i.fullName);
  const email = str(i.email).toLowerCase();
  const password = typeof i.password === "string" ? i.password : "";
  if (fullName.length < 2 || fullName.length > 80) e.fullName = "v.name";
  if (!EMAIL.test(email)) e.email = "v.email";
  const pw = passwordProblem(password);
  if (pw) e.password = pw;
  const accountType = i.accountType === "organization" ? "organization" : "volunteer";
  if (accountType === "volunteer") {
    if (i.ageConfirmed !== true) e.ageConfirmed = "v.ageConfirm";
    Object.assign(e, ageErrors(i.birthYear, i.guardianConsent));
  }
  let organization: OrganizationInput | undefined;
  if (accountType === "organization") {
    const o = validateOrganization(i.organization ?? {});
    if (!o.ok) for (const [k, v] of Object.entries(o.errors)) e[`org.${k}`] = v;
    else organization = o.data;
  }
  let place: PlaceInput | undefined;
  if (accountType === "volunteer") {
    const pl = validatePlace(i.place, true);
    Object.assign(e, pl.errors);
    place = pl.data ?? undefined;
  }
  return done(e, {
    fullName, email, password, accountType, ageConfirmed: i.ageConfirmed === true, guardianConsent: i.guardianConsent === true,
    birthYear: Number(i.birthYear) || 0, organization, place,
  });
}

export function validateLogin(i: { email?: string; password?: string }): Result<{ email: string; password: string }> {
  const e: Errors = {};
  const email = str(i.email).toLowerCase();
  if (!EMAIL.test(email)) e.email = "v.email";
  if (!i.password) e.password = "v.passwordEmpty";
  return done(e, { email, password: i.password ?? "" });
}

export interface ProfileInput {
  fullName: string; username: string; bio: string; country: string; province: string; city: string;
  feedVisible: boolean; languages: string[]; skills: string[]; interests: Category[];
  /** v3: tuman and mahalla, for the local leaderboards (optional) */
  district?: string; mahalla?: string;
  /** v7: ids from the official list */
  districtId?: number | null; mahallaId?: string | null;
}

const list = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => str(x)).filter(Boolean).slice(0, max);

export function validateProfile(i: Partial<ProfileInput>): Result<ProfileInput> {
  const e: Errors = {};
  const d: ProfileInput = {
    fullName: str(i.fullName), username: str(i.username).toLowerCase(), bio: str(i.bio), country: str(i.country), province: str(i.province),
    city: str(i.city), feedVisible: i.feedVisible !== false, languages: list(i.languages, 10), skills: list(i.skills, 20),
    interests: (Array.isArray(i.interests) ? i.interests : []).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c)),
    district: str(i.district), mahalla: str(i.mahalla), districtId: null, mahallaId: null,
  };
  // v7: in Uzbekistan the district and mahalla come from the list
  if (i.districtId != null && i.districtId !== ("" as unknown)) {
    const pl = validatePlace({ province: d.province, districtId: i.districtId, district: d.district, mahallaId: i.mahallaId ?? null, mahalla: d.mahalla }, true);
    Object.assign(e, pl.errors);
    if (pl.data) Object.assign(d, { province: pl.data.province, district: pl.data.district, districtId: pl.data.districtId, mahalla: pl.data.mahalla, mahallaId: pl.data.mahallaId });
  }
  if ((d.district ?? "").length > 80) e.district = "v.tooLong";
  if ((d.mahalla ?? "").length > 80) e.mahalla = "v.tooLong";
  if (d.fullName.length < 2 || d.fullName.length > 80) e.fullName = "v.name";
  if (!/^[a-z0-9_]{3,24}$/.test(d.username)) e.username = "v.username";
  if (d.bio.length > 280) e.bio = "v.bio";
  if (d.country.length < 2) e.country = "v.required";
  if (d.city.length < 2) e.city = "v.required";
  if (!d.interests.length) e.interests = "v.interests";
  return done(e, d);
}

export interface PersonalInput { phone: string; birthYear: number | null; language: Lang; privacy: PrivacyMode; feedVisible: boolean }

export function validatePersonal(i: Partial<PersonalInput>): Result<PersonalInput> {
  const e: Errors = {};
  const phone = str(i.phone);
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) e.phone = "v.phone";
  const by = i.birthYear == null || (i.birthYear as unknown) === "" ? null : Number(i.birthYear);
  if (by !== null && (!Number.isInteger(by) || by < 1900 || by > new Date().getFullYear() - 10)) e.birthYear = "v.birthYear";
  const language = (LANGS as readonly string[]).includes(i.language ?? "") ? (i.language as Lang) : "uz";
  const privacy = (PRIVACY_MODES as readonly string[]).includes(i.privacy ?? "") ? (i.privacy as PrivacyMode) : "public";
  return done(e, { phone, birthYear: by, language, privacy, feedVisible: privacy !== "private" && i.feedVisible !== false });
}

export interface MissionInput {
  title: string; description: string; category: Category; difficulty: Difficulty; location: string;
  lat: number | null; lng: number | null; date: string; deadline: string; duration: number; capacity: number;
  requirements: string; safety: string; equipment: string; impactLabel: string; impactAmount: number;
  radiusM: number; checklist: string[];
}

export function validateMission(i: Partial<MissionInput>): Result<MissionInput> {
  const e: Errors = {};
  const d: MissionInput = {
    title: str(i.title), description: str(i.description),
    category: (CATEGORIES as readonly string[]).includes(i.category ?? "") ? (i.category as Category) : "environment",
    difficulty: (DIFFICULTIES as readonly string[]).includes(i.difficulty ?? "") ? (i.difficulty as Difficulty) : "easy",
    location: str(i.location), lat: i.lat ?? null, lng: i.lng ?? null, date: str(i.date), deadline: str(i.deadline),
    duration: Math.round(num(i.duration)), capacity: Math.round(num(i.capacity)), requirements: str(i.requirements), safety: str(i.safety),
    equipment: str(i.equipment), impactLabel: str(i.impactLabel), impactAmount: num(i.impactAmount) || 0,
    radiusM: Math.round(num(i.radiusM)) || 400, checklist: list(i.checklist, 8),
  };
  if (d.title.length < 5 || d.title.length > 100) e.title = "v.title";
  if (d.description.length < 30 || d.description.length > 2000) e.description = "v.description";
  if (d.location.length < 3) e.location = "v.required";
  if (Number.isNaN(Date.parse(d.date))) e.date = "v.date";
  if (Number.isNaN(Date.parse(d.deadline))) e.deadline = "v.date";
  else if (!e.date && Date.parse(d.deadline) > Date.parse(d.date)) e.deadline = "v.deadline";
  if (!(d.duration >= 15 && d.duration <= 720)) e.duration = "v.duration";
  if (!(d.capacity >= 1 && d.capacity <= 10_000)) e.capacity = "v.capacity";
  if (d.safety.length < 10) e.safety = "v.safety";
  if ((d.lat === null) !== (d.lng === null)) e.lat = "v.coords";
  if (d.lat !== null && (d.lat < -90 || d.lat > 90 || d.lng! < -180 || d.lng! > 180)) e.lat = "v.coords";
  if (d.impactLabel && !(d.impactAmount > 0)) e.impactAmount = "v.impact";
  if (d.radiusM < 50 || d.radiusM > 5000) e.radiusM = "v.radius";
  return done(e, d);
}
