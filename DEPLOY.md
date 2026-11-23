# WORFIX v3: ishga tushirish

Bu qo'llanma saytni Netlify'ga (yangi yoki eski hisobga) chiqarish uchun. Foydalanuvchilar, missiyalar va boshqa
ma'lumotlar Firebase'da (`worfix3` loyihasi) saqlanadi. Netlify'ga qayta deploy qilish ularga tegmaydi.

## 1. Firestore qoidalarini yangilash (bir marta, deploydan oldin)

v3 funksiyalari (guruhlar va guruh chati, yordam signallari, yangiliklar, promo-kodlar,
AI tekshiruvi) yangi qoidalarni talab qiladi. **Qoidalarni yangilamasangiz, bu funksiyalar "server ruxsat bermadi" xatosini beradi.**

**Brauzer orqali:** Firebase console → `worfix3` → Firestore Database → **Rules** → ichidagini `firestore.rules`
faylining to'liq matni bilan almashtiring → **Publish**.

**Yoki terminal orqali** (shu papkada):

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project worfix3
```

## 2. Netlify sayti

1. app.netlify.com → **Add new project** → **Deploy manually** yoki Git orqali ulang.
   ZIP'ni to'g'ridan-to'g'ri yuklash Next.js uchun ishlamaydi, chunki build kerak. Shuning uchun:
   - **Git orqali (tavsiya):** papkani GitHub repozitoriyasiga yuklang → Netlify'da **Import from Git**.
     Build sozlamalari `netlify.toml` dan o'zi olinadi (base: `web`).
   - **CLI orqali:** `npm i -g netlify-cli` → shu papkada `netlify login` → `netlify init` (yoki `netlify link`) → `netlify deploy --build --prod`.
2. **Site configuration → Environment variables** bo'limiga quyidagilarni kiriting (deploydan OLDIN):

| O'zgaruvchi | Qiymat |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyDyOoQ9mFXuMLVdKGrm0YKCeuJ7AfKfDS0` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `worfix3.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `worfix3` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase console → Project settings dagi qiymat (masalan `worfix3.firebasestorage.app`) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `351884326312` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:351884326312:web:3c6a2e4f5eab119167199d` |
| `GEMINI_API_KEY` | Google AI Studio kaliti (**Secret** deb belgilang) |
| `ORS_API_KEY` | openrouteservice.org kaliti (**Secret** deb belgilang) |
| `FIREBASE_SERVICE_ACCOUNT` | **v3, tavsiya etiladi.** Firebase console → Project settings → Service accounts → **Generate new private key** → yuklangan JSON faylning to'liq matni (**Secret**) |

Firebase qiymatlari `netlify.toml` ichida allaqachon bor, ularni qayta kiritish shart emas.

**`FIREBASE_SERVICE_ACCOUNT` nima beradi:** agent missiyalarini AI serverda tekshiradi va mukofotni o'zi yozadi;
promo-kodlar xariddan so'ng darhol beriladi; har kuni tunda hududlar qisqarishi (`territory-decay`) hammaga qo'llanadi.
U bo'lmasa sayt ishlayveradi: agent missiyalarini admin tekshiradi, promo-kodni admin "Kutayotganlarga kod berish"
tugmasi bilan beradi, hudud esa faqat egasi Xaritani ochganda qisqaradi.

Firebase qiymatlari maxfiy emas, ular brauzerga ochiq beriladi. Himoyani Firestore qoidalari ta'minlaydi.
`GEMINI_API_KEY` va `ORS_API_KEY` esa faqat serverda ishlaydi va brauzerga chiqmaydi.

**Himoya:** Firebase qiymatlari kiritilmagan bo'lsa, production build xato bilan to'xtaydi. Shunday qilib sayt
tasodifan bo'sh "demo rejim"da ochilib qolmaydi.

## 2a. Cloudflare Workers (asosiy hosting, worfix.site)

Sayt endi Cloudflare'da ishlaydi (bepul tarif, "Powered by" belgisi yo'q). Netlify sozlamalari zaxira sifatida qoldirilgan.

- **Joylash:** `cd web && CLOUDFLARE_API_TOKEN=... npm run cf:deploy` — `scripts/deploy-cloudflare.sh` Next.js'ni
  OpenNext bilan yig'adi (`web/cloudflare.env` dagi ochiq Firebase qiymatlari bilan) va `wrangler deploy` qiladi.
- **Sozlamalar:** `web/wrangler.jsonc` — Worker nomi `worfix`, domenlar `worfix.site` va `www.worfix.site`
  (www → asosiy domenga yo'naltiriladi), har kuni 00:15 UTC da hudud qisqarishi (cron).
- **Maxfiy kalitlar** (bir marta): Cloudflare → Workers & Pages → worfix → Settings → Variables and Secrets,
  yoki `npx wrangler secret put <NOM>`: `GEMINI_API_KEY`, `ORS_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`.
- **Server funksiyalari** avvalgi manzilda (`/.netlify/functions/<nom>`) ishlaydi — `web/worker.ts` ularni o'sha
  kodga yo'naltiradi, shuning uchun brauzer kodi o'zgarmagan. Firestore'ga server endi Admin SDK emas,
  `web/src/lib/server/firestore-rest.ts` (HTTPS) orqali yozadi — Workers'da gRPC yo'q.
- **Mahalliy sinov:** `WORFIX_TARGET=cloudflare ALLOW_DEMO=1 npx opennextjs-cloudflare build && npx wrangler dev`.
- Firebase → Authentication → Settings → **Authorized domains** ga `worfix.site` ni qo'shing.

## 3. Firebase'da domenni ruxsat etish

Firebase console → Authentication → Settings → **Authorized domains** → **Add domain** → Netlify bergan manzil
(masalan `worfix-uz.netlify.app`) va o'zingizning domeningiz. Bu qilinmasa, kirish va ro'yxatdan o'tish ishlamaydi.

## 3a. Xarita va hududlar (v3.2)

- Kirish faqat email orqali. Avvalgi `TELEGRAM_BOT_TOKEN` va `NEXT_PUBLIC_TELEGRAM_BOT` o'zgaruvchilarini Netlify'dan o'chirib
  tashlasangiz bo'ladi; Firebase'da **Phone** provayderini ham o'chirsa bo'ladi.
- `territory-decay` funksiyasi Netlify'da **Scheduled function** sifatida har kuni 00:15 UTC da o'zi ishlaydi
  (Netlify → Logs → Functions'da ko'rinadi). `FIREBASE_SERVICE_ACCOUNT` kerak.
- Firestore rules'ni qayta e'lon qiling: yangi `territories`, `territoryCaptures`, `groupRequests` kolleksiyalari bor.
- Xarita GPS'dan foydalanadi: sayt HTTPS'da ochilishi shart (Netlify buni avtomatik beradi).

## 4. Admin

Admin bo'lishi kerak bo'lgan hisob bilan ro'yxatdan o'ting. Keyin Firebase console → Firestore → `users` →
o'sha hujjat → `role` = `admin`. Admin panelida:
- **Boshqaruv paneli:** bugungi vazifalar, statistika, faollik jurnali.
- **Tekshiruv:** AI auditi (AI qarorlarini tasdiqlash yoki bekor qilish), admin navbati, tashkilotlar nazorati, tarix.
  Tashkilot missiyalarini tashkilotlarning o'zi tekshiradi.
- **Moderatsiya:** tashkilotlarni tasdiqlash va missiyalar.
- **Aloqa:** yangiliklar (muqova, rejalashtirish, mahkamlash), hammaga e'lon, bitta foydalanuvchiga xabar, chat.
- **Do'kon:** tovarlar, buyurtmalar, promo-kod tovarlari uchun kodlar to'plami.

## 5. Tekshirish ro'yxati

- [ ] Saytga eski hisob bilan kirish ishlaydi.
- [ ] Do'stga xabar yuborish, reaksiya va javob ishlaydi (qoidalar yangilangan bo'lsa).
- [ ] Missiya sahifasida xarita va boshlangan missiyada marshrut chiqadi.
- [ ] Admin → Aloqa → e'lon foydalanuvchining bosh sahifasida ko'rinadi.

## Foydalanuvchilar xavfsizligi

- Foydalanuvchi hisoblari Firebase Authentication'da, profillar Firestore'da turadi. Netlify deploy ularga tegmaydi.
- Firestore qoidalari profil, xabar va buyurtma hujjatlarini o'chirishni hech kimga (admin ham) ruxsat bermaydi.
- Baza yaratilishidan oldin ro'yxatdan o'tgan, lekin profili yo'q hisoblar kirishda avtomatik tiklanadi.
  Bunda server avval profil haqiqatan yo'qligini tekshiradi, shuning uchun mavjud profil hech qachon ustidan yozilmaydi.
- Qoidalar testlari: `tests/firestore-rules` (`npm install && npm test`, Java 21 kerak) — 21 ta test.
- Server funksiyalari testi (emulyator): `web/scripts/fn-test.mts`.

## Ma'lum cheklovlar

- **Gemini:** AI Studio loyihasida oldindan to'lov tugagan bo'lsa (`402 prepayment credits are depleted`), GPS agenti
  va surat tahlili ishlamaydi. Qolgan tekshiruvlar ishlayveradi. Hal qilish: ai.studio/projects → billing,
  yoki bepul tarifdagi loyihadan yangi kalit.
- **OpenRouteService** bepul tarifi: kuniga 2000 marshrut va 1000 qidiruv. Limit tugasa, sayt avtomatik ravishda
  ochiq OSRM va Photon xizmatlariga o'tadi.
- **Xarita plitkalari:** OpenFreeMap (bepul, kalitsiz). Ishlamay qolsa, oddiy OpenStreetMap plitkalariga o'tiladi.
