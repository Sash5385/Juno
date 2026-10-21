# Juno — правила для Claude (коротко; деталі в docs/claude/*.md — читати лише за потреби)

- Проєкт: Juno (SaaS онлайн-запису). Адмінка `/home/user/juno` (Sash5385/Juno), клієнт `/home/user/juno-client` (Sash5385/Juno-client). React+Vite, Firebase RTDB `instructors/{iid}/…`, Cloud Functions у `functions/`, правила `database.rules.json`.
- Мова відповідей — українська, коротко: що зроблено, файли, ризики.
- Гілка: лише та, що задана сесією; push у інші — тільки з дозволу. Деплой — автоматично після push (GitHub Actions).
- Перед кожним push: підняти `src/version.js` в ОБОХ репо (`vДД.ММ.N`), коміт починати з версії.
- Не ламати існуюче; мінімальні зміни; UI-стиль не міняти без запиту; працює від 320px.
- Без підтвердження: не видаляти дані/гілки, без force-push, без `rm -rf`, без `git reset --hard`.
- Перевірка після змін: `npm run build`; smoke `cd tests/smoke && PW_CHROMIUM=/opt/pw-browsers/chromium node smoke.mjs admin|client <URL>`; правила/flows — див. docs/claude/testing.md.
- Тексти в коді — українською; переклад через `src/i18n/dict.json` (див. docs/claude/i18n.md).
- Економія токенів: Grep → Read з offset/limit; не читати node_modules/dist/package-lock; агентам — точні шляхи і вивід «файли+рядки / підсумок ≤10 рядків»; продовжувати агента через SendMessage; дрібні правки пакетувати.

Довідка: docs/claude/testing.md · docs/claude/i18n.md · docs/claude/salon.md · docs/claude/legacy-rules.md (старі загальні правила ID4Drive)
