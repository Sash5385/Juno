# Тести
- Збірка: `npm run build` (обидва репо).
- Smoke (демо, без Firebase): `npx vite preview --port 4173` (адмінка) / `--port 4174` (клієнт), далі `cd tests/smoke && PW_CHROMIUM=/opt/pw-browsers/chromium node smoke.mjs admin http://localhost:4173` (або `client http://localhost:4174`). Відкриває `/?demo=1&lang=uk`.
- Правила БД: `npx firebase-tools@13 emulators:exec --only database --project demo-rt "cd tests/rules && cp ../../database.rules.json . && node rules.test.mjs; rm database.rules.json"`.
- Сценарії (сервер+клієнт): `CLIENT_DIR=/home/user/juno-client bash tests/flows/run.sh`.
- Функції: `node functions/test/i18n.test.js`, `node functions/test/rebook.test.js`; оплати: `npx firebase-tools@13 emulators:exec --only database --project demo-pay "node functions/test/payments.e2e.js"`.
- Addons: `node tests/addons/*.test.mjs`.
- Playwright: `/opt/node-tools/node_modules/playwright/index.mjs`, chromium `/opt/pw-browsers/chromium`. Не використовувати `pkill -f` (вбиває власний shell) — лише kill PID.
