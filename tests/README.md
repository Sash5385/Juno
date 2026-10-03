# Тести безпеки і платежів

Потрібні Node 20+ і Java (для емулятора Realtime Database). Нічого з бойової бази не чіпають.

## Правила бази (`database.rules.json`)
```bash
cd tests/rules && npm install && npm test
# або з кореня: npx firebase-tools emulators:exec --only database --project demo-rt "node tests/rules/rules.test.mjs"
```
Перевіряє: інструктор не може видалити/продовжити `license`, пробний період ≤ 15 діб; учень не може змінювати
`isVip/discount/hoursOffset/blocked/…` у своїй картці; слоти розкладу пише лише учень ЦЬОГО інструктора,
адмінські поля слота незмінні, справжній слот не видалити, «вільний» слот не створити.
**Після будь-якої зміни правил прогнати тест до деплою.**

### Правила салону (`salons/*`)
```bash
npx firebase-tools emulators:exec --only database --project demo-rt "node tests/rules/salons.test.mjs"
```
Ролі власник / майстер / клієнт: майстер бачить і пише лише свій `masterId` (слоти, записи, черга, токени), клієнт створює лише
`pending`-запис з каталожною ціною для дозволеного майстра і не може чіпати `paymentStatus`/ціну/`masterId`, `license` — як в `instructors`.

## Платіжні вебхуки (LiqPay, Monobank)
```bash
cd functions && npm install && cd ..
npx firebase-tools emulators:exec --only database --project demo-pay "node functions/test/payments.e2e.js"
```
Підписані тестові колбеки проходять через справжній код функцій: підпис, продовження ліцензії, ідемпотентність,
річний тариф, повернення коштів, підроблені запити.

## Моніторинг помилок і вимкнений LiqPay
```bash
npx firebase-tools emulators:exec --only database --project demo-mon "node functions/test/monitoring.e2e.js"
```
`reportError` (групування, ліміт 20/хв на IP, обрізання полів), щоденне очищення `cleanupErrorLog`, `createLiqPayOrder` → 503.

### Адмінка салону (`src/salon/`)
```bash
npx firebase-tools emulators:exec --only database --project demo-rt "node tests/rules/salonApp.test.mjs"   # записи UI проти справжніх правил
node tests/unit/salonLogic.test.mjs                                                                       # чиста логіка: сітка слотів, ціни, вільні вікна, статистика
npm run build && (npx vite preview --port 4173 &) && node tests/smoke/smoke.mjs salon http://localhost:4173 && node tests/smoke/salon-flows.mjs http://localhost:4173
```
`salonApp.test.mjs` повторює кожен запис адмінки (онбордінг, записи, слоти, послуги, майстри, чати) від імені власника й майстра — якщо UI почне писати те, що правила забороняють, тест червоний.
`salon-flows.mjs` проходить сценарії в демо-режимі на екрані 320px (`?app=salon&demo=1`).

## Cloud Functions салону (`functions/salon/`)
```bash
npx firebase-tools emulators:exec --only database --project demo-salon "node functions/test/salon.e2e.js"
```
FCM, Firebase Auth і Monobank підмінені; у емулятор вантажаться справжні `database.rules.json` (запити по `date`/`bookingId` працюють лише з `.indexOn`).
Перевіряє: запис і слоти пер майстер (накладки, phantom, перенесення, особистий час), сповіщення клієнту/власнику/майстру, чергу очікування,
нагадування, чати, запрошення майстрів, налаштування оплати, рахунок, вебхук Monobank (підпис, ідемпотентність, повернення, чужі/підроблені запити),
таймаут неоплачених записів, ліцензію та прапорець `SALON_FUNCTIONS` (без нього бойові функції DrivePad не змінюються).

## Смоук-тест інтерфейсу (демо-режим, екран 320px)
```bash
npm run build && (npx vite preview --port 4173 &) && cd tests/smoke && npm install && npx playwright install chromium
node tests/smoke/smoke.mjs admin http://localhost:4173     # у DrivePad-Client: ... smoke.mjs client ...
```
Проходить усі вкладки, падає на помилці JS, порожньому екрані чи горизонтальному скролі. Без Firebase.

## CI
`.github/workflows/tests.yml` запускає все вище; `deploy.yml` викликає його як `needs: tests` — **деплой не йде, поки тести червоні**.

## Реальна проба платежу (раз перед запуском, вручну)
1. У Firebase Console → Realtime Database створити `payment_test/{iid тестового інструктора}` = `true` (сума стане 1 ₴).
2. В адмінці тестового інструктора: Налаштування → оплата → LiqPay, потім Monobank (по одному платежу).
3. Перевірити `instructors/{iid}/license`: `status: active`, `expiresAt` +31 доба, є `paymentLog/…`.
4. Повторити надсилання вебхука з кабінету провайдера — `expiresAt` не повинен змінитися.
5. Повернути платіж у кабінеті провайдера — ліцензія має відкотитися (`lastRefundAt`).
6. Видалити `payment_test/{iid}`.
