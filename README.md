# Juno — адмінка (власник і майстер)

Запис клієнтів для салонів краси, барбершопів і майстрів. React 19 + Vite, Firebase (Realtime Database, Auth, Functions, Hosting, FCM).
Схема даних, ролі, функції й оплата: [docs/SALON-SCHEMA.md](docs/SALON-SCHEMA.md). Клієнтський застосунок — репозиторій Juno-client.

```bash
npm ci
npm run dev          # http://localhost:5174/?demo=1 — демо з вигаданими даними, без Firebase
npm run build
```

Новий Firebase-проєкт — крок за кроком: [docs/FIREBASE-SETUP.md](docs/FIREBASE-SETUP.md) (`scripts/setup-firebase.sh`). Вручну: скопіюйте `.env.example` у `.env.local`, заповніть `VITE_FIREBASE_*`; у `functions/.env.<project>` задайте `SALON_ADMIN_URL`, `SALON_CLIENT_URL`.
Тести: [tests/README.md](tests/README.md). Деплой — вручну: GitHub Actions → «Deploy to Firebase».

Гілка `main` містить повну копію DrivePad на момент створення Juno; розробка Juno — в інших гілках.
