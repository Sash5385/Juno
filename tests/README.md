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
