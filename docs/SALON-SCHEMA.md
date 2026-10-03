# Схема RTDB для салону (клон DrivePad)

Статус: **етап 1** (схема + rules + тести + шар шляхів). UI, Cloud Functions, оплата клієнтом, ребрендинг — наступні етапи.
Рішення: гілка без деплою; чиста схема `salons/` (без міграції); еквайринг — Monobank; `instructors/*` не змінено.
Правила: `database.rules.json` (блок «САЛОН»). Тести: `tests/rules/salons.test.mjs`. Шляхи: `src/salonPaths.js` (однаковий файл у DrivePad і DrivePad-Client).

## Дерево

```
salon_slugs/{slug}: {salonId}                 публічне читання; пише власник
salon_index/{salonId}                         читає лише адмін платформи; пише власник
salons/{salonId}/                             salonId = uid власника
  profile: {name, slug, address, workHours, logo, ...}      публічно
  license: {status, expiresAt, trialEndsAt, provider, ...}  як в instructors (SaaS-підписка власника)
  masters/{masterId}/profile: {name, photo, active, specIds:{id:true}, order}   публічно
  masterAuth/{uid}: masterId                  логін майстра → masterId; пише власник / Cloud Function
  masterSettings/{masterId}: {commissionPct, ...}           власник + сам майстер (читання)
  masterInvites/{code}: {masterId, expiresAt}               лише сервер (claim — Cloud Function)
  masterTokens/{masterId}/{deviceId}: fcmToken              пише майстер
  timeslots/{masterId}/{date}/{slotId}        слоти ПЕР МАЙСТЕР, публічне читання
  services/{serviceId}: {name, category, duration, price, masterIds:{masterId:true}}   публічно
  bookings/{bookingId}: {id, masterId, serviceId, serviceName, clientUid, clientName, phone,
                         date, time, durationMin, price, status, createdBy, createdAt,
                         paymentMethod:'online'|'onsite', paymentStatus, depositAmount,
                         clientConfirmed, rating, cancelledAt, cancelledBy}
  bookings_by_phone/{phone}                   лише власник
  queue/{masterId}/{slotKey}/entries/{uid}    черга очікування пер майстер
  userQueue/{uid}, users/{uid}                клієнти салону (як users в instructors; без lessonBalance/internalExam)
  chats/{general|uid}, chatMeta/..., notifications/{uid}, settings, dayNotes, reviews, fcmTokens, clientTokens
  push_tasks, adminPush, slotBookings, pushTemplates, pushLog, invites, payments   лише Cloud Functions
```

Відхилення від ТЗ: слоти лежать у `timeslots/{masterId}/...` поруч із `masters`, а не всередині `masters/{id}/`
(щоб публічний список майстрів читався без завантаження всіх слотів). `services.masterIds` — map, а не масив (RTDB).
Записи — плоский список (`bookings/{bookingId}`), а не `bookings/{uid}/{id}`.

## Ролі

| | Власник | Майстер | Клієнт |
|---|---|---|---|
| Ідентифікація | `auth.uid === salonId` | `masterAuth/{uid}` = masterId | є `users/{uid}` у салоні |
| Профіль/послуги/майстри | пише | лише читає | читає |
| Слоти | усі майстри | лише свої | займає вільний слот активного майстра, адмінські поля незмінні |
| Записи | усі | лише свого `masterId` (читання — запитом `orderByChild('masterId')`) | створює `pending`, далі лише підтверджує/оцінює/скасовує; читає свої (`orderByChild('clientUid')`) |
| Клієнти (`users`) | усе | **немає доступу** (ім'я/телефон є в записі) | лише свою анкету |
| Чати | усе | немає доступу | свій і загальний |
| `masterSettings`, `license` | пише (license — лише платформа) | свої `masterSettings` читає | немає |

## Що rules гарантують при створенні запису клієнтом
`status = pending`; без `createdBy`/`paymentStatus`/`depositAmount`; майстер `active !== false`;
`services/{serviceId}/masterIds/{masterId} === true`; `price` дорівнює каталожній `services/{serviceId}/price`;
`paymentMethod` лише `online`/`onsite`; `clientUid === auth.uid`. `paymentStatus` ставить тільки власник/майстер/Cloud Function (вебхук Monobank).

## Відкриті питання (рішення потрібне до етапів 2–4)
1. Чат клієнт ↔ майстер: зараз лише салон ↔ клієнт. Додати `chats` пер майстер?
2. Знижки/VIP/`discountAmt`: ціна запису зараз строго = каталожна. Як застосовувати знижку (власник правкою після створення чи поле в rules)?
3. Індивідуальна ціна майстра на послугу (`services/{id}/masterPrices/{masterId}`)? Тоді правило ціни треба розширити.
4. Claim запрошення майстра (`masterInvites` → `masterAuth`) — Cloud Function (етап 2/3), rules клієнту запис не дають.
5. Ліміт майстрів за тарифом — лише в Functions (rules не рахують кількість).
6. Старі `instructors/*` правила видаляються в ребрендингу (етап 5), не раніше.
