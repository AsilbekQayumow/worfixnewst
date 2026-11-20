import { CATEGORIES, type Category, type Lang } from "./types";

/** Everything achievements are computed from. All values come from verified records. */
export interface AchievementStats {
  approvedMissions: number;
  hours: number;
  level: number;
  streak: number;
  totalImpact: number;
  perCategory: Partial<Record<Category, number>>;
  friends: number;
  certificates: number;
  cheersGiven: number;
  cheersReceived: number;
  profileComplete: boolean;
  hardMissions: number;
  teamMissions: number;
  agentMissions: number;
  purchases: number;
}

export type AchievementTier = "bronze" | "silver" | "gold";
export type AchievementFamily =
  | "missions" | "hours" | "streak" | "level" | "cause" | "explorer" | "impact" | "friends"
  | "cheersGiven" | "cheersReceived" | "certificates" | "profile" | "hard" | "team" | "agent" | "shop";

export interface AchievementDef {
  id: string;
  family: AchievementFamily;
  title: Record<Lang, string>;
  tier: AchievementTier;
  goal: number;
  /** cause for the "cause" family */
  cause?: Category;
  value: (s: AchievementStats) => number;
}

type T = [string, string, string];
const tt = ([uz, ru, en]: T): Record<Lang, string> => ({ uz, ru, en });
const tier = (i: number, n: number): AchievementTier => (i >= n - 1 ? "gold" : i >= Math.floor(n / 2) ? "silver" : "bronze");

function ladder(family: AchievementFamily, goals: number[], titles: T[], value: (s: AchievementStats) => number): AchievementDef[] {
  return goals.map((goal, i) => ({ id: `${family}_${goal}`, family, goal, tier: tier(i, goals.length), title: tt(titles[i]), value }));
}

const CAUSE_TITLES: Record<Category, T> = {
  environment: ["Yashil qadam", "Зелёный шаг", "Green step"],
  community: ["Mahalla yuragi", "Сердце махалли", "Heart of the mahalla"],
  animals: ["Panja do'sti", "Друг лап", "Paw pal"],
  education: ["Bilim ulashuvchi", "Делюсь знаниями", "Knowledge sharer"],
  water: ["Suv posboni", "Хранитель воды", "Water keeper"],
  recycling: ["Qayta hayot", "Вторая жизнь", "Second life"],
};

export const ACHIEVEMENTS: AchievementDef[] = [
  ...ladder("missions", [1, 3, 5, 10, 25, 50, 100], [
    ["Birinchi iz", "Первый след", "First footprint"],
    ["Uchlik", "Тройка", "Hat trick"],
    ["Odatga aylandi", "Вошло в привычку", "Habit formed"],
    ["O'nlik", "Десятка", "Double digits"],
    ["Dala odami", "Человек поля", "Field regular"],
    ["Ellik yo'l", "Пятьдесят троп", "Fifty trails"],
    ["Yuzlik", "Сотня", "Centurion"],
  ], (s) => s.approvedMissions),
  ...ladder("hours", [5, 10, 25, 50, 100], [
    ["Besh soat", "Пять часов", "Five hours in"],
    ["O'n soatlik yordam", "Десять часов помощи", "Ten-hour helper"],
    ["Chorak yuz", "Четверть сотни", "Quarter century"],
    ["Ellik soat", "Пятьдесят часов", "Fifty-hour hero"],
    ["Yuz soat", "Сто часов", "Hundred-hour pillar"],
  ], (s) => s.hours),
  ...ladder("streak", [3, 7, 14, 30], [
    ["Qizish", "Разогрев", "Warming up"],
    ["To'xtovsiz hafta", "Неделя без пауз", "Unbroken week"],
    ["Ikki hafta", "Две недели", "Fortnight"],
    ["Bir oy safda", "Месяц в строю", "Month on duty"],
  ], (s) => s.streak),
  ...ladder("level", [3, 5, 10, 15, 20, 30], [
    ["Yo'lga chiqdi", "В пути", "On the trail"],
    ["Iz quvar", "Следопыт", "Scout"],
    ["Yo'l topuvchi", "Первопроходец", "Pathfinder"],
    ["Qo'riqchi", "Рейнджер", "Ranger"],
    ["Tajribali", "Бывалый", "Seasoned"],
    ["Posbon", "Страж", "Guardian"],
  ], (s) => s.level),
  ...CATEGORIES.map<AchievementDef>((c) => ({
    id: `cause_${c}`, family: "cause", cause: c, goal: 1, tier: "bronze", title: tt(CAUSE_TITLES[c]), value: (s) => s.perCategory[c] ?? 0,
  })),
  ...ladder("explorer", [3, CATEGORIES.length], [
    ["Yo'nalish izlovchi", "Искатель направлений", "Cause explorer"],
    ["Har tomonlama", "Универсал", "All-rounder"],
  ], (s) => Object.values(s.perCategory).filter((n) => (n ?? 0) > 0).length),
  ...ladder("impact", [10, 50, 100, 500], [
    ["Sezilarli iz", "Заметный след", "Making a dent"],
    ["Ta'sir yaratuvchi", "Создатель влияния", "Impact maker"],
    ["Yuz natija", "Сто результатов", "Hundred results"],
    ["Katta o'zgarish", "Большие перемены", "Big shift"],
  ], (s) => s.totalImpact),
  ...ladder("friends", [1, 5, 10, 25], [
    ["Birga yaxshiroq", "Вместе лучше", "Better together"],
    ["Jamoa", "Команда", "Squad"],
    ["Davra", "Круг", "Circle"],
    ["Harakat", "Движение", "Movement"],
  ], (s) => s.friends),
  ...ladder("cheersGiven", [10, 50], [
    ["Qo'llab-quvvatlovchi", "Болельщик", "Cheerleader"],
    ["Ilhom beruvchi", "Вдохновитель", "Morale booster"],
  ], (s) => s.cheersGiven),
  ...ladder("cheersReceived", [10, 50], [
    ["E'tirofga sazovor", "Признание", "Recognised"],
    ["Hamma sevgan", "Любимец", "Crowd favourite"],
  ], (s) => s.cheersReceived),
  ...ladder("certificates", [1, 3, 5], [
    ["Birinchi sertifikat", "Первый сертификат", "First certificate"],
    ["Uchta muhr", "Три печати", "Three seals"],
    ["Hujjatli tajriba", "Задокументированный опыт", "Documented record"],
  ], (s) => s.certificates),
  { id: "profile_1", family: "profile", goal: 1, tier: "bronze", title: tt(["Tanish bo'ling", "Будем знакомы", "Nice to meet you"]), value: (s) => (s.profileComplete ? 1 : 0) },
  ...ladder("hard", [1, 5, 10], [
    ["Qiyin cho'qqi", "Трудная вершина", "Steep climb"],
    ["Chidamli", "Выносливый", "Tough one"],
    ["Temir iroda", "Железная воля", "Iron will"],
  ], (s) => s.hardMissions),
  ...ladder("team", [1, 5], [
    ["Yelkama-yelka", "Плечом к плечу", "Side by side"],
    ["Jamoa ruhi", "Командный дух", "Team spirit"],
  ], (s) => s.teamMissions),
  ...ladder("agent", [1, 5], [
    ["Atrofni ko'rgan", "Заметил вокруг", "Local eye"],
    ["Mahalla xaritasi", "Карта района", "Neighbourhood mapper"],
  ], (s) => s.agentMissions),
  { id: "shop_1", family: "shop", goal: 1, tier: "bronze", title: tt(["Birinchi xarid", "Первая покупка", "First trade"]), value: (s) => s.purchases },
];

export interface AchievementState extends Omit<AchievementDef, "value"> {
  current: number;
  unlocked: boolean;
  fraction: number;
}

export function computeAchievements(stats: AchievementStats): AchievementState[] {
  return ACHIEVEMENTS.map(({ value, ...def }) => {
    const current = Math.max(0, Math.min(value(stats), def.goal));
    return { ...def, current: Math.round(current * 10) / 10, unlocked: current >= def.goal, fraction: def.goal ? current / def.goal : 0 };
  });
}

export function nextAchievement(list: AchievementState[]): AchievementState | null {
  const locked = list.filter((a) => !a.unlocked);
  if (!locked.length) return null;
  return locked.reduce((best, a) => (a.fraction > best.fraction ? a : best));
}
