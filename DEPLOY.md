# WORFIX v2.1: ishga tushirish

Bu qo'llanma saytni Netlify'ga (yangi yoki eski hisobga) chiqarish uchun. Foydalanuvchilar, missiyalar va boshqa
ma'lumotlar Firebase'da (`worfix3` loyihasi) saqlanadi. Netlify'ga qayta deploy qilish ularga tegmaydi.

## 1. Firestore qoidalarini yangilash (bir marta, deploydan oldin)

Yangi funksiyalar (xabar reaksiyalari, javob, tahrirlash, o'chirish, admin xabarlari, e'lonlar) yangi qoidalarni talab qiladi.

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

Firebase qiymatlari maxfiy emas, ular brauzerga ochiq beriladi. Himoyani Firestore qoidalari ta'minlaydi.
`GEMINI_API_KEY` va `ORS_API_KEY` esa faqat serverda ishlaydi va brauzerga chiqmaydi.

**Himoya:** Firebase qiymatlari kiritilmagan bo'lsa, production build xato bilan to'xtaydi. Shunday qilib sayt
tasodifan bo'sh "demo rejim"da ochilib qolmaydi.

## 3. Firebase'da domenni ruxsat etish

Firebase console → Authentication → Settings → **Authorized domains** → **Add domain** → Netlify bergan manzil
(masalan `worfix-uz.netlify.app`) va o'zingizning domeningiz. Bu qilinmasa, kirish va ro'yxatdan o'tish ishlamaydi.

## 4. Admin

Admin bo'lishi kerak bo'lgan hisob bilan ro'yxatdan o'ting. Keyin Firebase console → Firestore → `users` →
o'sha hujjat → `role` = `admin`. Admin panelida:
- **Aloqa:** bitta foydalanuvchiga yozish yoki hammaga e'lon.
- **Do'kon:** tovar qo'shish/tahrirlash, buyurtmalar holati. Bekor qilinganda Fixcoin avtomatik qaytadi.
- **Xabarlar:** foydalanuvchilar bilan suhbat.

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
- Qoidalar testlari: `tests/firestore-rules` (`npm install && npm test`, Java 21 kerak).

## Ma'lum cheklovlar

- **Gemini:** AI Studio loyihasida oldindan to'lov tugagan bo'lsa (`402 prepayment credits are depleted`), GPS agenti
  va surat tahlili ishlamaydi. Qolgan tekshiruvlar ishlayveradi. Hal qilish: ai.studio/projects → billing,
  yoki bepul tarifdagi loyihadan yangi kalit.
- **OpenRouteService** bepul tarifi: kuniga 2000 marshrut va 1000 qidiruv. Limit tugasa, sayt avtomatik ravishda
  ochiq OSRM va Photon xizmatlariga o'tadi.
- **Xarita plitkalari:** OpenFreeMap (bepul, kalitsiz). Ishlamay qolsa, oddiy OpenStreetMap plitkalariga o'tiladi.
