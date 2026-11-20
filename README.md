# WORFIX v2

Ko'ngillilik platformasi: atrofdagi missiyalar, surat + GPS bilan tasdiqlash, XP, Fixcoin va daraja sertifikatlari.
Stack: **Next.js 15 (App Router) + Firebase (Auth, Firestore)**, Netlify'da (`netlify.toml`, `base = "web"`).

## Ishga tushirish

```bash
cd web
npm install
cp .env.example .env.local   # Firebase va GEMINI_API_KEY qiymatlari
npm run dev                  # http://localhost:3000
npm run typecheck
npm test
npm run build
```

Firebase qiymatlari bo'lmasa ilova **demo rejimda** ishlaydi (ma'lumotlar brauzerda, demo hisoblar login sahifasida).

## Netlify

Site configuration → Environment variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID`, `..._APP_ID` — avvalgi Firebase loyihasi
- `GEMINI_API_KEY` — GPS missiya agenti (`/api/ai/missions`) va surat tahlili (`/api/ai/verify`)
- ixtiyoriy `GEMINI_MODEL`

## Firebase

Ma'lumotlar tuzilmasi saqlangan (`web/src/lib/domain/types.ts`). Yangi maydonlar ixtiyoriy va "EXTRA (v2)" deb belgilangan,
shuning uchun eski hujjatlar o'qilaveradi. Yangi kolleksiyalar: `shopItems`, `orders`, `messages`.

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

So'ng admin hisobidan **Admin → Do'kon → Namunaviy katalogni e'lon qilish** (do'kon tovarlari Firestore'ga yoziladi).

## Asosiy qismlar

| Funksiya | Joyi |
|---|---|
| GPS missiya agenti (OSM joylari + Gemini, qiziqishlar bo'yicha) | `app/api/ai/missions`, `components/agent-panel.tsx` |
| Missiyaga yo'l (marshrut, jonli GPS) | `components/route-panel.tsx`, `components/tile-map.tsx` |
| Verifikatsiya (EXIF vaqt/GPS, dHash takror, geofence, joyda vaqt, checklist, Gemini Vision) | `lib/domain/checks.ts`, `components/evidence-form.tsx`, `app/api/ai/verify` |
| XP qiyinlik bo'yicha, darajada sertifikat | `lib/domain/rewards.ts`, `lib/domain/verification.ts` |
| 54 ta yutuq | `lib/domain/achievements.ts` |
| Fixcoin do'koni | `app/app/shop`, `lib/domain/shop.ts` |
| Chat va jamoaviy missiya taklifi | `components/chat-view.tsx`, `api.inviteToMission` |
| Tashkilot ro'yxati va paneli | `app/(auth)/register?type=organization`, `app/org/*` |
| Sozlamalar (til, parol, profil, maxfiylik) | `components/settings-view.tsx` |
| Tillar: o'zbek, rus, ingliz | `lib/i18n/dict.ts` |

Xarita plitalari va piyoda marshrut OpenStreetMap / FOSSGIS OSRM'dan olinadi (kalit talab qilinmaydi).
`functions/` papkasi o'zgartirilmagan.
