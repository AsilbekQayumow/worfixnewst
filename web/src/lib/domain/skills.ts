/**
 * v6 · Feature 11: a skills taxonomy instead of free text. 40 skills in 10 groups, three levels, three kinds of proof:
 * self-declared, confirmed by missions (3 approved missions tagged with the skill), or by a document (only for
 * skills where safety matters; the photo is checked and deleted, only the flag stays).
 */
import type { Lang } from "./types";

export const SKILL_GROUPS = ["medical", "it", "languages", "teaching", "driving", "building", "creative", "organizing", "support", "eco"] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number];
export const SKILL_LEVELS = ["beginner", "experienced", "expert"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

type Names = [string, string, string];
export interface SkillDef { id: string; group: SkillGroup; names: Names; document?: boolean }

const S = (id: string, group: SkillGroup, uz: string, ru: string, en: string, document = false): SkillDef => ({ id, group, names: [uz, ru, en], document });

export const SKILLS: SkillDef[] = [
  S("first_aid", "medical", "Birinchi yordam", "Первая помощь", "First aid", true),
  S("nursing", "medical", "Hamshiralik", "Сестринское дело", "Nursing", true),
  S("doctor", "medical", "Shifokor", "Врач", "Doctor", true),
  S("elder_care", "medical", "Keksalarga g'amxo'rlik", "Уход за пожилыми", "Elderly care"),
  S("web_dev", "it", "Veb-dasturlash", "Веб-разработка", "Web development"),
  S("design", "it", "Grafik dizayn", "Графический дизайн", "Graphic design"),
  S("smm", "it", "SMM va kontent", "SMM и контент", "Social media"),
  S("data", "it", "Ma'lumotlar va Excel", "Данные и Excel", "Data and spreadsheets"),
  S("lang_en", "languages", "Ingliz tili", "Английский язык", "English"),
  S("lang_ru", "languages", "Rus tili", "Русский язык", "Russian"),
  S("lang_uz", "languages", "O'zbek tili", "Узбекский язык", "Uzbek"),
  S("sign_lang", "languages", "Imo-ishora tili", "Жестовый язык", "Sign language"),
  S("translation", "languages", "Tarjima", "Перевод", "Translation"),
  S("tutoring", "teaching", "Repetitorlik", "Репетиторство", "Tutoring"),
  S("kids", "teaching", "Bolalar bilan ishlash", "Работа с детьми", "Working with children"),
  S("mentoring", "teaching", "Mentorlik", "Наставничество", "Mentoring"),
  S("digital_lit", "teaching", "Kompyuter savodxonligi", "Компьютерная грамотность", "Digital literacy"),
  S("driving_b", "driving", "Haydovchilik (B)", "Вождение (B)", "Driving (B)", true),
  S("driving_c", "driving", "Yuk mashinasi (C)", "Грузовик (C)", "Truck driving (C)", true),
  S("logistics", "driving", "Logistika va ombor", "Логистика и склад", "Logistics"),
  S("loading", "driving", "Yuk ortish", "Погрузка", "Loading and moving"),
  S("carpentry", "building", "Duradgorlik", "Столярное дело", "Carpentry"),
  S("plumbing", "building", "Santexnika", "Сантехника", "Plumbing"),
  S("electrical", "building", "Elektrik ishlari", "Электрика", "Electrical work", true),
  S("painting", "building", "Bo'yoqchilik", "Покраска", "Painting"),
  S("photo", "creative", "Fotografiya", "Фотография", "Photography"),
  S("video", "creative", "Video va montaj", "Видео и монтаж", "Video and editing"),
  S("music", "creative", "Musiqa", "Музыка", "Music"),
  S("crafts", "creative", "Qo'l mehnati", "Рукоделие", "Crafts"),
  S("events", "organizing", "Tadbir tashkil qilish", "Организация мероприятий", "Event planning"),
  S("coordination", "organizing", "Jamoani boshqarish", "Координация команды", "Team coordination"),
  S("fundraising", "organizing", "Mablag' yig'ish", "Сбор средств", "Fundraising"),
  S("cooking", "organizing", "Ovqat tayyorlash", "Приготовление еды", "Cooking"),
  S("legal", "support", "Huquqiy maslahat", "Юридическая помощь", "Legal advice", true),
  S("psychology", "support", "Psixologik yordam", "Психологическая помощь", "Psychological support", true),
  S("social_work", "support", "Ijtimoiy ish", "Социальная работа", "Social work"),
  S("gardening", "eco", "Bog'dorchilik", "Садоводство", "Gardening"),
  S("tree_planting", "eco", "Daraxt ekish", "Посадка деревьев", "Tree planting"),
  S("recycling", "eco", "Chiqindini saralash", "Сортировка отходов", "Recycling"),
  S("animal_care", "eco", "Hayvonlarga qarash", "Уход за животными", "Animal care"),
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
const LANG_INDEX: Record<Lang, number> = { uz: 0, ru: 1, en: 2 };
export const skillName = (id: string, lang: Lang) => SKILL_BY_ID.get(id)?.names[LANG_INDEX[lang]] ?? id;

export type SkillProof = "self" | "missions" | "document";
export interface UserSkill { id: string; level: SkillLevel; proof: SkillProof }
export interface SkillWanted { skillId: string; count?: number; required: boolean }

export const SKILL_PROOF_MISSIONS = 3;

/** Old free-text skills → taxonomy ids, by name in any language; the rest are kept as "other". */
export function migrateSkills(free: string[]): { skills: UserSkill[]; other: string[] } {
  const norm = (x: string) => x.toLowerCase().replace(/[ʻʼ'`’]/g, "").replace(/\s+/g, " ").trim();
  const skills: UserSkill[] = [];
  const other: string[] = [];
  for (const raw of free) {
    const n = norm(raw);
    if (!n) continue;
    const hit = SKILLS.find((s) => s.id === n || s.names.some((x) => norm(x) === n || (n.length >= 4 && norm(x).includes(n))));
    if (hit && !skills.some((x) => x.id === hit.id)) skills.push({ id: hit.id, level: "beginner", proof: "self" });
    else if (!hit) other.push(raw.trim());
  }
  return { skills, other };
}

/** How well a volunteer fits a mission: 0 when a required skill is missing, else the share of wanted skills they have. */
export function skillFit(mine: UserSkill[], wanted: SkillWanted[] = []) {
  if (!wanted.length) return 0;
  const have = new Set(mine.map((s) => s.id));
  if (wanted.some((w) => w.required && !have.has(w.skillId))) return 0;
  return wanted.filter((w) => have.has(w.skillId)).length / wanted.length;
}

/** Skill ids confirmed by missions: tagged on at least 3 approved missions. */
export function confirmedByMissions(approvedMissionSkills: string[][]) {
  const count = new Map<string, number>();
  for (const list of approvedMissionSkills) for (const id of new Set(list)) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count.entries()].filter(([, n]) => n >= SKILL_PROOF_MISSIONS).map(([id]) => id);
}
