import type { ShopItem } from "./types";

type Seed = Omit<ShopItem, "createdAt" | "active">;

/** Sample catalog. Published to Firestore by an admin (Admin → Shop), seeded automatically in demo mode. */
export const SAMPLE_ITEMS: Seed[] = [
  {
    id: "steel-bottle", art: "bottle", kind: "merch", price: 120, stock: 40,
    title: { uz: "Po'lat suv idishi", ru: "Стальная бутылка", en: "Steel water bottle" },
    description: { uz: "0,6 l, issiq-sovuqni saqlaydi. Plastik idishlardan voz kechish uchun.", ru: "0,6 л, держит температуру. Чтобы отказаться от пластика.", en: "0.6 l, keeps drinks hot or cold. One less plastic bottle a day." },
  },
  {
    id: "canvas-tote", art: "tote", kind: "merch", price: 80, stock: 60,
    title: { uz: "Kanvas sumka", ru: "Холщовая сумка", en: "Canvas tote" },
    description: { uz: "Qalin paxta mato, bozor va kutubxona uchun.", ru: "Плотный хлопок, для рынка и библиотеки.", en: "Heavy cotton, for the bazaar and the library." },
  },
  {
    id: "plant-a-tree", art: "tree", kind: "donation", price: 150, stock: 500,
    title: { uz: "Sizning nomingizdan daraxt", ru: "Дерево от вашего имени", en: "A tree in your name" },
    description: { uz: "Hamkor tashkilot kuzgi ekish mavsumida bitta ko'chat ekadi.", ru: "Партнёр посадит саженец в осенний сезон.", en: "A partner organization plants one sapling in the autumn season." },
  },
  {
    id: "field-cap", art: "cap", kind: "merch", price: 100, stock: 30,
    title: { uz: "Dala kepkasi", ru: "Полевая кепка", en: "Field cap" },
    description: { uz: "Yozgi missiyalarda quyoshdan himoya.", ru: "Защита от солнца на летних миссиях.", en: "Sun cover for summer missions." },
  },
  {
    id: "enamel-pin", art: "badge", kind: "merch", price: 40, stock: 200,
    title: { uz: "WORFIX nishoni", ru: "Значок WORFIX", en: "WORFIX enamel pin" },
    description: { uz: "Emal nishon — ryukzak yoki kurtka uchun.", ru: "Эмалевый значок на рюкзак или куртку.", en: "Enamel pin for a backpack or jacket." },
  },
  {
    id: "museum-pass", art: "ticket", kind: "experience", price: 220, stock: 25,
    title: { uz: "Muzeyga chipta", ru: "Билет в музей", en: "Museum day pass" },
    description: { uz: "Hamkor muzeyga bir kunlik kirish chiptasi.", ru: "Однодневный билет в музей-партнёр.", en: "One-day entry to a partner museum." },
  },
  {
    id: "cleanup-kit", art: "kit", kind: "merch", price: 180, stock: 20,
    title: { uz: "Tozalash to'plami", ru: "Набор для уборки", en: "Clean-up kit" },
    description: { uz: "Qo'lqop, qisqich va qayta ishlatiladigan qop — o'z missiyalaringiz uchun.", ru: "Перчатки, захват и многоразовый мешок для своих миссий.", en: "Gloves, a litter picker and a reusable sack for your own missions." },
  },
  {
    id: "profile-frame", art: "frame", kind: "digital", price: 60, stock: 9999,
    title: { uz: "Profil uchun ramka", ru: "Рамка для профиля", en: "Profile frame" },
    description: { uz: "Avataringiz atrofida topografik ramka.", ru: "Топографическая рамка вокруг аватара.", en: "A contour-line frame around your avatar." },
  },
];

export const sampleCatalog = (now: string): ShopItem[] => SAMPLE_ITEMS.map((s) => ({ ...s, active: true, createdAt: now }));
