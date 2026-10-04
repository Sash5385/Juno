# Створення Firebase-проєкту Juno

Один проєкт обслуговує обидва застосунки (адмінка — репозиторій Juno, клієнт — Juno-client): база, вхід, функції, Storage, Hosting.
Все, що можна автоматизувати, робить `scripts/setup-firebase.sh`; решта — кліками в Console (їх неможливо зробити з CLI).
Регіон усюди **europe-west1** — тригери функцій на базі мають бути в тому ж регіоні, що й база.

## 0. Що потрібно
- Google-акаунт власника платформи (`sash5385@gmail.com`: цей email зашитий у правила бази як суперадмін).
- Node 20+, `npx firebase-tools login` (відкриє браузер).
- Банківська картка для тарифу Blaze (оплата за використання; для старту — кілька доларів на місяць або менше).
- Токен Monobank Acquiring **платформи** (ваш мерчант-акаунт; на нього надходить оплата підписок салонів).

## 1. Скрипт (кроки 1–6 автоматично)
```bash
cd Juno
scripts/setup-firebase.sh juno-booking ../Juno-client   # juno-booking — приклад id: унікальний, 6–30 символів
```
Створить проєкт, сайти Hosting `<id>-admin` і `<id>-client` (лендинг піде на сайт за id проєкту), веб-застосунок, Realtime Database
в europe-west1, файли `.env.local` (обидва репо), `functions/.env.<id>`, `.firebaserc`, і задеплоїть правила бази та Storage.
Скрипт не перевірявся на живому акаунті — якщо якийсь крок упаде, виконайте його вручну за описом нижче й запустіть скрипт повторно (він ідемпотентний).
Інші назви сайтів: `JUNO_ADMIN_SITE=my-admin JUNO_CLIENT_SITE=my-client (ID сайтів глобальні — прості назви на кшталт juno-admin зазвичай зайняті) scripts/setup-firebase.sh …`.

## 2. Тариф Blaze (Console, обов'язково)
Console → ⚙ Usage and billing → Upgrade → Blaze. Без нього не працюють Cloud Functions, розклад (Cloud Scheduler) і Secret Manager.
Одразу додайте бюджетне сповіщення (наприклад, 10 $) — Billing → Budgets & alerts.

## 3. Вхід (Console → Build → Authentication → Get started)
| Провайдер | Налаштування |
|---|---|
| Email/Password | увімкнути |
| Google | увімкнути, вказати support email; для iPhone-клієнта додати `https://<juno-client>.web.app/__/auth/handler` у Google Cloud Console → Credentials → OAuth Web client → Authorized redirect URIs |
| Phone | увімкнути (SMS потребує Blaze); за потреби додати тестові номери |
Settings → Authorized domains: домени Hosting додаються самі; власні домени додайте вручну.

## 4. Storage (Console → Build → Storage → Get started)
Режим production, локація europe-west1. Потім: `npx firebase-tools deploy --only storage --project <id>` (скрипт спробує це зробити сам).

## 5. Monobank платформи (секрет)
```bash
npx firebase-tools functions:secrets:set JUNO_MONOBANK_TOKEN --project <id>
```
Токен лежить у Secret Manager і не потрапляє в код чи базу. Вебхук підписки Monobank отримує сам із рахунку
(`https://europe-west1-<id>.cloudfunctions.net/salonSubscriptionCallback`); токени салонів вони підключають самі в Налаштуваннях.

## 6. Деплой
```bash
cd Juno && npm ci && (cd functions && npm ci)
npx firebase-tools deploy --only database,storage,functions,hosting --project <id>
cd ../Juno-client && npm ci && npm run build && npx firebase-tools deploy --only hosting --project <id>
```
- Перший деплой функцій може впасти на правах Eventarc/Pub/Sub — зачекайте 3–5 хв і повторіть; Firebase CLI сам вмикає потрібні API.
- Очікується 32 функції (`firebase functions:list`). Після деплою адмінка: `https://<id>-admin.web.app`, клієнт: `https://<id>-client.web.app`.
- Лендинг: `npx firebase-tools deploy --only hosting:landing`.

## 7. Перший вхід — суперадмін
Відкрийте адмінку, увійдіть через Google акаунтом `sash5385@gmail.com` → з'явиться екран «🛠 Адмін» (салонів ще немає).
Тарифи — вкладка «Тарифи»; нічна копія — «Система» (після кроку 4 увімкніть тумблер й натисніть «Зробити копію зараз»).

## 8. Перевірка (≈15 хв)
1. Інший акаунт: створити салон → додати майстра, послугу → завантажити логотип і фото майстра (перевіряє Storage).
2. Відкрити `https://<id>-client.web.app/s/<slug>` з телефона: запис → кабінет → увімкнути сповіщення (перевіряє FCM).
3. Оплата підписки на живому Monobank: у «Тарифи» на хвилину поставте ціну 1 ₴ → Налаштування → Підписка → оплатити → статус «активна»
   (перевіряє вебхук) → поверніть ціни кнопкою «Типові».
4. Скасувати оплачений запис за політикою — перевіряє повернення коштів (потрібен токен Monobank салону).

## 9. CI/CD (необов'язково, деплой лише вручну)
Juno (GitHub → Settings → Secrets and variables → Actions): secret `FIREBASE_TOKEN` (`npx firebase-tools login:ci`), variables `FIREBASE_PROJECT_ID`
і `VITE_FIREBASE_*` (значення — у згенерованому `.env.local`). Juno-client: secret `FIREBASE_SERVICE_ACCOUNT`
(`firebase init hosting:github` створює), ті самі variables. Запуск: Actions → Deploy → Run workflow.

## 10. Після запуску
- Обмежте API-ключ веб-застосунку за HTTP referrers (Google Cloud Console → Credentials) — необов'язково, але бажано.
- Нативні оболонки клієнта: `npx cap add android` / `ios` (appId `app.juno.client`), додайте `google-services.json` / `GoogleService-Info.plist` з Console.
- Ціни, ліміти й тумблери — з екрана суперадміна, без деплою.
