# Juno на aldemi.com.ua (гібрид)

| Адреса | Сайт Firebase (проєкт juno-booking) | Що там |
|---|---|---|
| aldemi.com.ua/juno | `juno-booking` (лендинг) | новий лендинг; корінь `/` поки веде на `/juno` |
| admin.aldemi.com.ua | `juno-booking-admin` | кабінет майстра |
| app.aldemi.com.ua | `juno-booking-client` | застосунок клієнта |

## Що робить власник (з ПК)
1. Firebase → Hosting → https://console.firebase.google.com/project/juno-booking/hosting/sites
   - сайт `juno-booking` → Add custom domain → `aldemi.com.ua` (+ `www.aldemi.com.ua` з редіректом на корінь);
   - сайт `juno-booking-admin` → Add custom domain → `admin.aldemi.com.ua`;
   - сайт `juno-booking-client` → Add custom domain → `app.aldemi.com.ua`.
2. DNS у реєстратора .com.ua — записи саме з консолі Firebase (приблизно так):
   | Тип | Ім'я | Значення |
   |---|---|---|
   | TXT | `@` | як покаже Firebase |
   | A | `@` | IP з консолі Firebase |
   | CNAME | `www` | `juno-booking.web.app` |
   | CNAME | `admin` | `juno-booking-admin.web.app` |
   | CNAME | `app` | `juno-booking-client.web.app` |
   HTTPS-сертифікат з'явиться сам за 10–60 хв (інколи до доби).
3. Firebase → Authentication → Settings → Authorized domains: додати `aldemi.com.ua`, `admin.aldemi.com.ua`, `app.aldemi.com.ua`.
4. Google Cloud → APIs & Services → Credentials → OAuth-клієнт (Web) → Authorized redirect URIs: додати
   `https://app.aldemi.com.ua/__/auth/handler` і `https://admin.aldemi.com.ua/__/auth/handler` (вхід через Google на iPhone).
5. Коли адреси відкриваються по HTTPS — написати Claude «домен працює».

## Що робить Claude після цього
Замінює `juno-booking-*.web.app` на нові адреси: `src/salon.js` (обидва репо), посилання запису/запрошення в адмінці,
`landing/js/config.js` (кнопка «Спробувати»), og:image/canonical лендингу, посилання в пушах і оплатах у `functions/index.js`.
Старі `*.web.app` адреси продовжать працювати.

Вже зроблено заздалегідь: маршрут `/juno` на лендингу, service worker'и відкривають сповіщення на поточному домені, вхід на iPhone працює і з aldemi.com.ua.
