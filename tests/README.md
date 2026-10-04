# Тести Juno

Потрібні Node 20+ і Java (для емулятора Realtime Database). Нічого з бойової бази не чіпають.

## Правила бази, логіка, записи UI (емулятор)
```bash
npx firebase-tools@13 emulators:exec --only database --project demo-rt "node tests/rules/salons.test.mjs && node tests/rules/salonApp.test.mjs && node tests/rules/salonClientApp.test.mjs && node tests/rules/salonPaths.test.mjs && node tests/unit/salonLogic.test.mjs && node tests/unit/salonTariffs.test.mjs"
```
`salons.test.mjs` — ролі власник / майстер / клієнт: майстер бачить і пише лише свій `masterId`, клієнт створює лише `pending`-запис з каталожною ціною
для дозволеного майстра і не чіпає `paymentStatus`/ціну/`masterId`, `license` пише лише суперадмін. `salonApp` / `salonClientApp` повторюють кожен запис адмінки
й клієнтського застосунку проти справжніх правил — якщо UI почне писати заборонене, тест червоний. **Після будь-якої зміни правил — прогнати до деплою.**

## Cloud Functions
```bash
npx firebase-tools@13 emulators:exec --only database --project demo-salon "node functions/test/salon.e2e.js"
npx firebase-tools@13 emulators:exec --only database --project demo-billing "node functions/test/billing.e2e.js"
npx firebase-tools@13 emulators:exec --only database --project demo-outreach "node functions/test/outreach.e2e.js"
npx firebase-tools@13 emulators:exec --only database --project demo-mon "node functions/test/monitoring.e2e.js"
```
FCM, Firebase Auth і Monobank підмінені; у емулятор вантажаться справжні `database.rules.json` (запити по `date`/`bookingId` працюють лише з `.indexOn`).
`salon.e2e.js`: запис і слоти по майстрах, сповіщення, черга, нагадування, чати, запрошення майстрів, налаштування оплати, рахунок, вебхук Monobank
(підпис, ідемпотентність, повернення, чужі запити), політика скасування, таймаут неоплачених записів, ліцензія. `billing.e2e.js`: тарифи й розрахунок (новий/продовження/підвищення зі знижкою), рахунок Monobank платформи, вебхук (підпис, ідемпотентність, сума, повернення), ліміт майстрів. `outreach.e2e.js`: «звільнився час» (черга, вікно 10 днів, ліміти, тихі години), розсилка, прив'язка записів за підтвердженим телефоном, видалення клієнта і салону, нічна копія. `monitoring.e2e.js`: журнал помилок і ліміти.

## Смоук-тест інтерфейсу (демо-режим, екран 320px)
```bash
npm run build && (npx vite preview --port 4173 &) && cd tests/smoke && npm install && npx playwright install chromium && cd ../..
node tests/smoke/smoke.mjs http://localhost:4173          # усі вкладки: помилки JS, порожній екран, горизонтальний скрол
node tests/smoke/salon-flows.mjs http://localhost:4173    # сценарії: запис, послуги, майстри, чат, налаштування оплати, підписка, розсилка, фото
node tests/smoke/superadmin-flows.mjs http://localhost:4173   # екран суперадміна (?demo=1&vendor=1): салони, тарифи, система
```

## CI
`.github/workflows/tests.yml` запускає все вище; `deploy.yml` (ручний) викликає його як `needs: tests` — деплой не йде, поки тести червоні.
