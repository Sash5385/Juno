# CLAUDE.md — Juno (адмінка)

Juno — SaaS онлайн-запису для салонів/майстрів. Окремий продукт зі своїм Firebase-проєктом `juno-booking`.
Репозиторії: `Sash5385/Juno` (адмінка, цей), `Sash5385/Juno-client` (клієнт).

## Стек
Vite + React (JSX, без TypeScript), PWA. Firebase Realtime DB, Auth, Storage, Cloud Functions (`functions/`), правила: `database.rules.json`, `storage.rules`. Хостинг: Firebase Hosting (`firebase.json`).

## Порядок роботи
0. Перед змінами — уточнити і узгодити план (що, які файли, ризики, відкат).
1. `git pull` обох репо (Juno, Juno-client).
2. Мінімальні зміни, не ламати наявне; UI/кольори/структуру без запиту не міняти.
3. `npm run build` + `npm run lint` обов'язково.
4. Оновити `src/version.js` в ОБОХ репо (`vДД.ММ.N`), коміт починати з версії: `v26.10.1 — опис`.

## Правила
- Не змішувати з DrivePad / ID4Drive: жодних проєктів `drivepad-86fe1`, `id4drive-booking-44182`.
- Без підтвердження не видаляти дані/таблиці/колонки, не міняти `database.rules.json` наосліп.
- Перевіряти `null`/`undefined` з БД; коментарі — українською.
- Критичні модулі: календар, записи (створення/перенос/скасування), сповіщення, оплата (Monobank/LiqPay, карти не зберігати).
- Mobile first, мін. ширина 320px.
- Заборонено без підтвердження: `rm -rf`, `git reset --hard`, `git push --force`.

## Git і деплой
- `main` — реліз, пуш у `main` запускає `.github/workflows/deploy.yml`.
- Робота — у робочій гілці `claude/*`, потім merge у `main`.
- Деплой після фіксу — автоматично, без питань «Деплоїти?».

## Стиль відповідей
Коротко: що зроблено, файли, ризики.
