/** v8 (2026-11): username sign-in and the New Year season. */
type T = [string, string, string];

export const R8: Record<string, T> = {

  // New Year looks
  "cos.ti_snowflake": ["Qor parchasi", "Снежинка", "Snowflake"], "cos.fl_gift": ["Sovg'a bayroq", "Флаг «Подарок»", "Gift flag"],
  "cos.fl_snow": ["Qor bayroq", "Флаг «Снежинка»", "Snow flag"], "cos.fr_snow": ["Qorli ramka", "Снежная рамка", "Snow frame"],
  "cos.ti_santa": ["Qorbobo yordamchisi", "Помощник Деда Мороза", "Santa's helper"], "cos.pa_garland": ["Gulchambar chegara", "Граница-гирлянда", "Garland border"],
  "cos.fr_garland": ["Gulchambar ramka", "Рамка-гирлянда", "Garland frame"], "cos.fl_tree": ["Archa bayroq", "Флаг «Ёлка»", "Tree flag"],
  // username sign-in
  "auth.loginName": ["Username", "Имя пользователя", "Username"],
  "auth.loginNameHint": ["Eski hisoblar email bilan ham kira oladi", "Старые аккаунты могут войти и по email", "Older accounts can also use their email"],
  "auth.username": ["Username", "Имя пользователя", "Username"],
  "auth.usernameHint": ["Platformaga shu nom va parol bilan kirasiz", "С этим именем и паролем вы будете входить", "You'll sign in with this name and your password"],
  "auth.usernameFree": ["Bo'sh, olsangiz bo'ladi", "Свободно", "Available"],
  "auth.emailWhy": ["Faqat parolni tiklash va xabarlar uchun", "Только для восстановления пароля и уведомлений", "Only for password resets and notices"],
  "v.login": ["Username 3–24 belgi: kichik harflar, raqamlar, _", "Имя: 3–24 символа — строчные, цифры, _", "Username: 3–24 of lowercase, digits, _"],
  "v.loginEmpty": ["Username kiriting", "Введите имя пользователя", "Enter your username"],
  "v.usernameReserved": ["Bu nomni olib bo'lmaydi", "Это имя нельзя занять", "That name can't be used"],
  "e.loginByEmail": ["Hozircha email bilan kiring", "Пока войдите по email", "Please sign in with your email for now"],

  "e.badLogin": ["Username (yoki email) va parol mos kelmadi", "Имя пользователя (или email) и пароль не совпадают", "That username (or email) and password don't match"],
  "a.prev": ["Oldingisi", "Назад", "Previous"], "a.next": ["Keyingisi", "Далее", "Next"],

  // the season
  "nav.newyear": ["Yangi yil", "Новый год", "New Year"],
  "ny.until": ["{year}-yilgacha qoldi", "До {year} года осталось", "Until {year}"],
  "ny.arrived": ["{year}-yil muborak!", "С Новым {year} годом!", "Happy New Year {year}!"],
  "ny.aria": ["{d} kun, {h} soat, {m} daqiqa qoldi", "Осталось {d} дн., {h} ч, {m} мин", "{d} days, {h} hours, {m} minutes to go"],
  "ny.days": ["kun", "дней", "days"], "ny.hours": ["soat", "часов", "hours"], "ny.minutes": ["daqiqa", "минут", "minutes"], "ny.seconds": ["soniya", "секунд", "seconds"],
  "ny.d": ["kun", "дн.", "days"],
  "ny.caption": ["Yangi yilni biz bilan birga kutib oling va sovg'alarni qo'lga kiriting!", "Встречайте Новый год вместе с нами и получайте подарки!", "Welcome the New Year with us and win the gifts!"],
  "ny.open": ["Yangi yil sovg'alari", "Новогодние подарки", "New Year gifts"],
  "ny.join": ["Qo'shilish va sovg'a olish", "Присоединиться и получить подарки", "Join and get the gifts"],
  "ny.toMap": ["Xaritada sovg'a qidirish", "Искать подарки на карте", "Find gifts on the map"],
  "ny.musicOn": ["Yangi yil musiqasini yoqish", "Включить новогоднюю музыку", "Play New Year music"],
  "ny.musicOff": ["Musiqani o'chirish", "Выключить музыку", "Stop the music"],
  "ny.snowOn": ["Qorni yoqish", "Включить снег", "Turn on the snow"], "ny.snowOff": ["Qorni o'chirish", "Выключить снег", "Turn off the snow"],
  "ny.musicNote": ["Musiqa saytga kirganingizda o'zi boshlanadi. O'chirsangiz, keyingi safar ham o'chiq turadi.", "Музыка включается сама при входе на сайт. Если выключить, она останется выключенной.", "The music starts by itself when you open the site. Turn it off and it stays off."],
  "ny.moodH": ["Bayram kayfiyati", "Праздничное настроение", "Festive mood"],
  "ny.santa": ["Qorbobo", "Дед Мороз", "Santa"], "ny.hoho": ["Ho-ho-ho!", "Хо-хо-хо!", "Ho-ho-ho!"],
  "ny.sceneKicker": ["WORFIX · {year}", "WORFIX · {year}", "WORFIX · {year}"],
  "ny.sceneTitle": ["Yangi yil mo'jizasi yaxshilikdan boshlanadi", "Новогоднее чудо начинается с доброго дела", "New Year magic starts with a good deed"],
  "ny.hubTitle": ["{year}-yilni birga kutamiz", "Встречаем {year} вместе", "Welcoming {year} together"],
  "ny.hubSub": ["Har kuni sovg'a, xaritada Qorbobo, o'z 3D qahramoningiz va do'stlar uchun tabriknoma", "Подарок каждый день, Дед Мороз на карте, ваш 3D-герой и открытка для друзей", "A gift a day, Santa on the map, your own 3D hero and a card for friends"],
  "ny.mapH": ["Qorbobo xaritaga sovg'a tashlab ketmoqda", "Дед Мороз разбрасывает подарки по карте", "Santa is dropping gifts on the map"],
  "ny.mapB": ["Chanasi xarita ustidan uchib o'tadi va sovg'a qutilarini turli joylarga qo'yib ketadi. Odam ko'p mahallalarda sovg'a ko'proq. Yoniga borib oching — ba'zilarida savol bor.", "Его сани пролетают над картой и оставляют подарки в разных местах. Где больше людей — там больше подарков. Подойдите и откройте — в некоторых вопрос.", "His sleigh flies over the map and leaves gift boxes all around. Busier mahallas get more. Walk up and open them — some hold a question."],

  // gift calendar
  "adv.title": ["Yangi yil taqvimi", "Новогодний календарь", "New Year calendar"],
  "adv.sub": ["1–31-dekabr: har kuni bitta sovg'a. 31-dekabrda — eng kattasi", "1–31 декабря: подарок каждый день. 31-го — самый большой", "1–31 December: one gift a day. The biggest on the 31st"],
  "adv.startsIn": ["Taqvim 1-dekabrda ochiladi: {d} kun {h} soat {m} daqiqa qoldi", "Календарь откроется 1 декабря: через {d} дн. {h} ч {m} мин", "The calendar opens on 1 December: in {d} d {h} h {m} min"],
  "adv.open": ["Ochish", "Открыть", "Open"], "adv.openDay": ["{n}-dekabr sovg'asini ochish", "Открыть подарок {n} декабря", "Open the gift for {n} December"],
  "adv.done": ["{n}-dekabr: ochilgan", "{n} декабря: открыт", "{n} December: opened"], "adv.missed": ["{n}-dekabr: o'tib ketdi", "{n} декабря: пропущен", "{n} December: missed"],
  "adv.locked": ["{n}-dekabr: hali yopiq", "{n} декабря: ещё закрыт", "{n} December: not yet"], "adv.today": ["{n}-dekabr: bugun", "{n} декабря: сегодня", "{n} December: today"],
  "adv.won": ["{n}-dekabr sovg'asi sizniki!", "Подарок {n} декабря ваш!", "The {n} December gift is yours!"],
  "adv.fromDay": ["Taqvim: {n}-dekabr", "Календарь: {n} декабря", "Calendar: {n} December"],

  // heroes
  "hero.title": ["Xaritadagi qahramoningiz", "Ваш герой на карте", "Your hero on the map"],
  "hero.sub": ["Xaritada hudud egallayotganingizda ko'k nuqta o'rnida shu 3D qahramon yuradi", "Вместо синей точки по карте ходит этот 3D-герой", "This 3D hero walks the map instead of the blue dot"],
  "hero.pick": ["Shuni tanlash", "Выбрать", "Pick this one"], "hero.chosen": ["Tanlangan", "Выбран", "Chosen"],
  "hero.toMap": ["Xaritada ko'rish", "Посмотреть на карте", "See it on the map"],
  "hero.santa": ["Qorbobo", "Дед Мороз", "Santa"], "hero.santa.b": ["Oq soqol, qizil to'n — sovg'alar egasi", "Белая борода, красная шуба — хозяин подарков", "White beard, red coat — keeper of the gifts"],
  "hero.snowmaiden": ["Qorqiz", "Снегурочка", "Snow Maiden"], "hero.snowmaiden.b": ["Moviy to'n va uzun sochli Qorboboning nabirasi", "Внучка Деда Мороза в голубой шубке", "Santa's granddaughter in a blue coat"],
  "hero.snowman": ["Qorbola", "Снеговик", "Snowman"], "hero.snowman.b": ["Sabzi burun, shlyapa va qizil sharf — sakrab yuradi", "Нос-морковка, шляпа и красный шарф — передвигается прыжками", "Carrot nose, top hat and a red scarf — it hops"],
  "hero.elf": ["Elf", "Эльф", "Elf"], "hero.elf.b": ["Qorboboning chaqqon yordamchisi", "Шустрый помощник Деда Мороза", "Santa's nimble helper"],
  "hero.chopon": ["Choponli yigit", "Парень в чапане", "Chopon"], "hero.chopon.b": ["Yo'l-yo'l chopon, do'ppi va belbog'", "Полосатый чапан, тюбетейка и пояс", "A striped chopon, a do'ppi and a sash"],
  "hero.volunteer": ["Ko'ngilli", "Волонтёр", "Volunteer"], "hero.volunteer.b": ["WORFIX yeleki, kepka va ryukzak", "Жилет WORFIX, кепка и рюкзак", "A WORFIX vest, cap and backpack"],

  // greeting card
  "gc.h": ["Do'stlarga tabriknoma", "Открытка для друзей", "A card for friends"],
  "gc.sub": ["Yozing, rangini tanlang va rasm qilib ulashing", "Напишите, выберите цвет и поделитесь картинкой", "Write it, pick a colour and share it as a picture"],
  "gc.title": ["Yangi yilingiz muborak!", "С Новым годом!", "Happy New Year!"],
  "gc.default": ["Yangi yil sizga sog'lik, quvonch va ko'plab yaxshi ishlar olib kelsin!", "Пусть Новый год принесёт здоровье, радость и много добрых дел!", "May the New Year bring you health, joy and many good deeds!"],
  "gc.to": ["Kimga", "Кому", "To"], "gc.toPh": ["Masalan, Aziza", "Например, Азиза", "e.g. Aziza"],
  "gc.text": ["Tilagingiz", "Пожелание", "Your wish"], "gc.theme": ["Rangi", "Цвет", "Colour"],
  "gc.th.night": ["Tun", "Ночь", "Night"], "gc.th.snow": ["Qor", "Снег", "Snow"], "gc.th.gold": ["Bayram", "Праздник", "Festive"],
  "gc.share": ["Ulashish", "Поделиться", "Share"], "gc.saved": ["Rasm saqlandi", "Картинка сохранена", "Picture saved"],
  "gc.shareText": ["WORFIX'dan yangi yil tabrigi", "Новогодняя открытка из WORFIX", "A New Year card from WORFIX"],
  "gc.preview": ["Tabriknoma ko'rinishi", "Предпросмотр открытки", "Card preview"],

  // good deeds
  "gd.h": ["Qorbobo yordamchisi", "Помощник Деда Мороза", "Santa's helper"],
  "gd.sub": ["Qishda qila oladigan 6 ta yaxshilik — bajarganingizni belgilang", "6 добрых дел для зимы — отмечайте сделанное", "Six good deeds for winter — tick them off"],
  "gd.snow": ["Qor kurash", "Почистить снег", "Clear the snow"], "gd.snow.b": ["Keksa qo'shnining hovlisi yoki yo'lagini tozalang", "У пожилого соседа во дворе или у подъезда", "For an elderly neighbour's yard or path"],
  "gd.elder": ["Keksalarni yo'qlash", "Навестить пожилых", "Visit the elderly"], "gd.elder.b": ["Bir piyola choy va suhbat — eng yaxshi sovg'a", "Чашка чая и беседа — лучший подарок", "A cup of tea and a chat — the best gift"],
  "gd.birds": ["Qushlarga yem", "Покормить птиц", "Feed the birds"], "gd.birds.b": ["Uy yoki mahallaga qushlar uchun oshxona osing", "Повесьте кормушку у дома или в махалле", "Hang a feeder by your home or in the mahalla"],
  "gd.clothes": ["Issiq kiyim ehsoni", "Тёплые вещи", "Warm clothes"], "gd.clothes.b": ["Kerak bo'lmagan issiq kiyimlarni muhtojlarga bering", "Отдайте ненужные тёплые вещи нуждающимся", "Give warm clothes you don't need to someone who does"],
  "gd.kids": ["Bolalarga sovg'a", "Подарок детям", "A gift for children"], "gd.kids.b": ["Mehribonlik uyi yoki kasalxonadagi bolalarga", "Детям в доме милосердия или больнице", "For children in a care home or hospital"],
  "gd.tree": ["Mahalla archasi", "Ёлка в махалле", "A mahalla tree"], "gd.tree.b": ["Qo'shnilar bilan mahalla archasini bezating", "Нарядите ёлку в махалле вместе с соседями", "Decorate a tree in the mahalla with your neighbours"],
  "gd.note": ["Bu sizning shaxsiy ro'yxatingiz. XP va Fixcoin faqat tasdiqlangan missiyalar uchun beriladi.", "Это ваш личный список. XP и Fixcoin даются только за подтверждённые миссии.", "This is your own list. XP and Fixcoin come only from verified missions."],
  "gd.all": ["Hammasini bajardingiz — siz haqiqiy Qorbobo yordamchisisiz!", "Всё сделано — вы настоящий помощник Деда Мороза!", "All done — you're a true helper of Santa!"],
  "gd.find": ["Qishki missiyalarni topish", "Найти зимние миссии", "Find winter missions"],

  // festive variants of existing text ("@w" = used while the season is on)
  "cs.common@w": ["Sovg'a qutisi", "Подарок", "Gift box"], "cs.quiz@w": ["Savolli sovg'a", "Подарок с вопросом", "Quiz gift"],
  "cs.rare@w": ["Kamyob sovg'a", "Редкий подарок", "Rare gift"], "cs.legendary@w": ["Qorboboning katta sovg'asi", "Большой подарок Деда Мороза", "Santa's big gift"],
  "cs.opened@w": ["Bu sovg'ani ochgansiz", "Этот подарок вы уже открыли", "You've opened this gift"],
  "cs.needGps@w": ["Sovg'ani ochish uchun joylashuvni yoqing", "Включите геолокацию, чтобы открыть подарок", "Turn on location to open gifts"],
  "cs.far@w": ["Sovg'agacha {d} — yaqinroq boring", "До подарка {d} — подойдите ближе", "The gift is {d} away — get closer"],
  "g.daily.title@w": ["Kunlik sovg'a", "Ежедневный подарок", "Daily gift"], "g.daily.done@w": ["Bugungi sovg'a ochildi", "Сегодняшний подарок открыт", "Today's gift is open"],
  "auth.loginTitle@w": ["Bayramga xush kelibsiz!", "С праздником, добро пожаловать!", "Welcome to the celebration!"],
  "auth.loginSub@w": ["Username va parolingiz bilan kiring — sovg'alar sizni kutmoqda", "Войдите по имени и паролю — подарки уже ждут", "Sign in with your username and password — the gifts are waiting"],
  "auth.registerSub@w": ["Yangi yilni yaxshilik bilan boshlang: ro'yxatdan o'ting va sovg'alarni yig'ing", "Начните Новый год с добра: зарегистрируйтесь и собирайте подарки", "Start the New Year with a good deed: sign up and collect gifts"],
  "h5.hello@w": ["Bayramingiz muborak, {name}!", "С праздником, {name}!", "Happy holidays, {name}!"],
};
