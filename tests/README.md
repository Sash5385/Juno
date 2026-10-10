# Тести безпеки і платежів

Потрібні Node 20+ і Java (для емулятора Realtime Database). Нічого з бойової бази не чіпають.

## Правила бази (`database.rules.json`)
```bash
cd tests/rules && npm install && npm test
# або з кореня: npx firebase-tools emulators:exec --only database --project demo-rt "node tests/rules/rules.test.mjs"
```
Перевіряє: майстер не може видалити/продовжити `license`, пробний період ≤ 15 діб; клієнт не може змінювати
`isVip/discount/hoursOffset/blocked/…` у своїй картці; слоти розкладу пише лише клієнт ЦЬОГО майстра,
адмінські поля слота незмінні, справжній слот не видалити, «вільний» слот не створити.
**Після будь-якої зміни правил прогнати тест до деплою.**

## Платіжні вебхуки (LiqPay, Monobank)
```bash
cd functions && npm install && cd ..
npx firebase-tools emulators:exec --only database --project demo-pay "node functions/test/payments.e2e.js"
```
Підписані тестові колбеки проходять через справжній код функцій: підпис, продовження ліцензії, ідемпотентність,
річний тариф, повернення коштів, підроблені запити.

## Записи / скасування / перенесення (слоти)
```bash
bash tests/flows/run.sh        # потрібен клонований DrivePad-Client поруч (або CLIENT_DIR=...), Java, firebase-tools
```
РЕАЛЬНИЙ `db.js` клієнта + РЕАЛЬНІ правила БД + серверна `onBookingChanged` на емуляторах Database+Auth, два клієнти й майстер.
Сценарії: запис, перекриття двох клієнтів, скасування клієнтом/адміном, phantom-слоти, перенос клієнтом, перенос адміном (в той самий і інший день),
скасування вже переніс. запису, атака «звільнити чужий слот», старі слоти без `bookedBy`, «накладка» записів.
**Гонка за слоти:** `bash tests/flows/run.sh race` — троє клієнтів (три незалежні екземпляри `db.js`) одночасно беруть той самий/перекривний час,
з випадковими затримками і повним потоком `claimSlot → createBooking`; перевіряє: переможець один, слоти лише його, у програвших не лишається слідів.
Адмінські операції (`blockSlots/freeSlots/перенос`) у тесті — репліка логіки `src/App.jsx`: змінюєш її там — онови й тут. У CI не запускається (потрібен другий репозиторій).

**Допуслуги і перерва:** `node tests/addons/addons.test.mjs` (розрахунки допуслуг, `slotRules` з перервою — клієнтська/адмінська/серверна копії дають однаковий результат);
анкета клієнта: `node tests/addons/intake.test.mjs` (+ блок INTAKE у rules-тесті);
пакети: `node tests/addons/packages.test.mjs` (+ блок PACKAGES у rules-тесті);
салон: `node tests/addons/salon.test.mjs` (+ блок SALON у rules-тесті);
групи: `node tests/addons/groups.test.mjs` (+ блок GROUP SEATS у rules-тесті);
у `booking-flow` — блоки 12 (допуслуги/перерва), 13 (пакети), 14 (групи) (запис з допуслугою+перервою, скасування, закритий майстром слот у перерві, чужий запис одразу після, серверне блокування перерви).

## Моніторинг помилок і вимкнений LiqPay
```bash
npx firebase-tools emulators:exec --only database --project demo-mon "node functions/test/monitoring.e2e.js"
```
`reportError` (групування, ліміт 20/хв на IP, обрізання полів), щоденне очищення `cleanupErrorLog`, `createLiqPayOrder` → 503.

## Смоук-тест інтерфейсу (демо-режим, екран 320px)
```bash
npm run build && (npx vite preview --port 4173 &) && cd tests/smoke && npm install && npx playwright install chromium
node tests/smoke/smoke.mjs admin http://localhost:4173     # у DrivePad-Client: ... smoke.mjs client ...
```
Проходить усі вкладки, падає на помилці JS, порожньому екрані чи горизонтальному скролі. Без Firebase.

## CI
`.github/workflows/tests.yml` запускає все вище; `deploy.yml` викликає його як `needs: tests` — **деплой не йде, поки тести червоні**.

## Реальна проба платежу (раз перед запуском, вручну)
1. У Firebase Console → Realtime Database створити `payment_test/{iid тестового майстра}` = `true` (сума стане 1 ₴).
2. В адмінці тестового майстра: Налаштування → оплата → LiqPay, потім Monobank (по одному платежу).
3. Перевірити `instructors/{iid}/license`: `status: active`, `expiresAt` +31 доба, є `paymentLog/…`.
4. Повторити надсилання вебхука з кабінету провайдера — `expiresAt` не повинен змінитися.
5. Повернути платіж у кабінеті провайдера — ліцензія має відкотитися (`lastRefundAt`).
6. Видалити `payment_test/{iid}`.
