# Власний домен для Juno (замість `*.web.app`)

Три сайти Firebase Hosting проєкту `juno-booking`. Рекомендована схема (замініть `juno.example` на свій домен):

| Сайт Firebase | Зараз | Після підключення |
|---|---|---|
| `juno-booking` (лендинг) | juno-booking.web.app | `juno.example` (і `www.juno.example`) |
| `juno-booking-admin` (кабінет майстра) | juno-booking-admin.web.app | `admin.juno.example` |
| `juno-booking-client` (застосунок клієнта) | juno-booking-client.web.app | `app.juno.example` |

## Крок 1. Купити домен
Будь-який реєстратор (Namecheap, Cloudflare, GoDaddy, hosting.ua …). Потрібен доступ до DNS-записів.

## Крок 2. Додати домен у Firebase (з ПК, 3 рази)
Консоль → https://console.firebase.google.com/project/juno-booking/hosting/sites
1. Відкрити сайт → **Add custom domain**.
2. Ввести домен (`juno.example`, потім окремо `admin.juno.example`, `app.juno.example`).
3. Firebase покаже **TXT-запис** (підтвердження власності) і **A-записи** (або CNAME для піддоменів). Скопіювати їх.

## Крок 3. Прописати DNS у реєстратора
Приклад (значення візьміть саме з консолі Firebase — вони можуть відрізнятися):

| Тип | Ім'я | Значення |
|---|---|---|
| TXT | `@` | `firebase=juno-booking` (як покаже консоль) |
| A | `@` | IP-адреси з консолі Firebase (зазвичай 199.36.158.100) |
| CNAME | `admin` | `juno-booking-admin.web.app` |
| CNAME | `app` | `juno-booking-client.web.app` |
| CNAME | `www` | `juno-booking.web.app` |

Сертифікат HTTPS Firebase випустить сам, зазвичай за 10–60 хвилин (інколи до доби).

## Крок 4. Дозволити домени для входу
Консоль → Authentication → Settings → **Authorized domains** → додати `juno.example`, `admin.juno.example`, `app.juno.example`
(без цього вхід через Google дасть `auth/unauthorized-domain`).

## Крок 5. Оновити адреси в коді (це зроблю я, коли скажете домен)
- `landing/js/config.js` → `appUrl` (посилання «Спробувати»);
- `landing/*.html` → `og:image`, canonical;
- `functions/index.js` → `CLIENT_URL` / `ADMIN_URL` (посилання в листах/повідомленнях), `BACKUP_BUCKET` не міняється;
- `public/firebase-messaging-sw.js`, `src/firebase.js` → `authDomain` лишається `juno-booking.firebaseapp.com` (або свій домен, якщо налаштуєте custom auth domain);
- PWA-маніфести (`start_url`) — відносні, змін не потребують;
- CORS у функціях (`cors: true`) змін не потребує.

## Крок 6. Перевірка
Відкрити по черзі лендинг, кабінет і клієнта на новому домені; увійти через Google; створити тестовий запис.

> Старі адреси `*.web.app` продовжують працювати, тож перемикатися можна без простою.
