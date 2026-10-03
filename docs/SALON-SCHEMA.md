# Схема RTDB і Cloud Functions для салону (клон DrivePad)

Статус: **етап 1** (схема, rules, тести, шлях-хелпери) і **етап 2** (Cloud Functions, оплата клієнтом, повернення коштів, запрошення майстрів) готові.
UI адмінки/клієнта, ребрендинг, тарифи за кількістю майстрів — наступні етапи.
Рішення: гілка без деплою; чиста схема `salons/` (без міграції); еквайринг — Monobank; `instructors/*` і бойові функції DrivePad не змінено.

| Що | Де |
|---|---|
| Правила | `database.rules.json` (блок «САЛОН») · тести `tests/rules/salons.test.mjs` |
| Шляхи | `src/salonPaths.js` (однаковий файл у DrivePad і DrivePad-Client) |
| Functions | `functions/salon/*` · тести `functions/test/salon.e2e.js` |
| Вмикання Functions | змінна `SALON_FUNCTIONS=1` (див. нижче) |

## Дерево

```
salon_slugs/{slug}: {salonId}                 публічне читання; пише власник
salon_index/{salonId}                         реєстр салонів (за ним ходять шедулери); читає лише адмін платформи
salon_secrets/{salonId}: {monobankToken}      ТІЛЬКИ сервер (правил немає) — токен мерчанта Monobank
salons/{salonId}/                             salonId = uid власника
  profile: {name, slug, address, timezone, ..., payment}    публічно
    payment: {enabled, depositPercent, allowFull, holdMinutes, cancelFreeHours, autoConfirm, hasToken, tokenLast4}
  license: {status, expiresAt, trialEndsAt, provider, ...}  як в instructors (SaaS-підписка власника)
  masters/{masterId}/profile: {name, photo, active, specIds:{id:true}, order}   публічно
  masterAuth/{uid}: masterId                  логін майстра → masterId; пише власник або Cloud Function
  masterSettings/{masterId}: {uid, commissionPct, ...}      власник + сам майстер (читання); uid — Firebase uid майстра
  masterInvites/{secret}: {masterId, expiresAt, claimedBy}  власник / Cloud Function
  masterTokens/{masterId}/{deviceId}: fcmToken              пише майстер
  timeslots/{masterId}/{date}/{slotId}        слоти ПЕР МАЙСТЕР, публічне читання
  services/{serviceId}: {name, category, duration, price, masterIds:{masterId:true}, masterPrices:{masterId:price}}   публічно
  bookings/{bookingId}: {id, masterId, serviceId, serviceName, clientUid, clientName, phone,
                         date, time, durationMin, price, status, createdBy, createdAt,
                         paymentMethod:'online'|'onsite', paymentStatus, paidAmount, paidAt, paymentInvoiceId,
                         clientConfirmed, rating, clientNote, cancelledAt, cancelledBy, rescheduledFrom, rescheduledFromId, paymentMovedFrom/To}
  bookings_by_phone/{phone}                   лише власник
  queue/{masterId}/{slotKey}/entries/{uid}    черга очікування пер майстер (waiting → offered → booked | expired)
  userQueue/{uid}, users/{uid}                клієнти салону (users/{uid}/queueOffers/{masterId}_{slotKey} — пропозиції з черги)
  chats/{general|uid}, chatMeta/...           салон ↔ клієнт
  masterChats/{masterId}/{uid}/{msgId}, masterChatMeta/{masterId}/{uid}   клієнт ↔ майстер
  notifications/{uid}, settings, dayNotes, reviews, fcmTokens, clientTokens
  payments/{paymentId}                        журнал платежів (лише сервер, індекс bookingId)
  sentReminders, rescheduleQueue, activeClients, recentClients     службове (лише сервер)
  push_tasks, adminPush, slotBookings, pushTemplates, pushLog, invites   лише Cloud Functions
```

Відхилення від ТЗ: слоти лежать у `timeslots/{masterId}/...` поруч із `masters`, а не всередині `masters/{id}/`
(щоб публічний список майстрів читався без завантаження всіх слотів). `services.masterIds` — map, а не масив (RTDB).
Записи — плоский список (`bookings/{bookingId}`), а не `bookings/{uid}/{id}`.

Статуси запису: `pending → confirmed → completed`, `cancelled`, `personal` (особистий час майстра: блокує слоти, без сповіщень).
`cancelledBy`: `client`, `reschedule` (клієнт переносить), `admin` (власник), `master`, `license` і `payment_timeout` (ставить сервер).
`paymentStatus`: немає = не сплачено, `deposit_paid`, `paid`, `refunded`.

## Ролі

| | Власник | Майстер | Клієнт |
|---|---|---|---|
| Ідентифікація | `auth.uid === salonId` | `masterAuth/{uid}` = masterId | є `users/{uid}` у салоні |
| Профіль/послуги/ціни/майстри | пише | лише читає | читає |
| Слоти | усі майстри | лише свої | займає вільний слот активного майстра, адмінські поля незмінні |
| Записи | усі | лише свого `masterId` (читання — запитом `orderByChild('masterId')`) | створює `pending`, далі лише підтверджує/оцінює/скасовує; читає свої (`orderByChild('clientUid')`) |
| Клієнти (`users`) | усе | **немає доступу** (ім'я/телефон є в записі) | лише свою анкету |
| Чат салон ↔ клієнт | усе | немає доступу | свій і загальний |
| Чат клієнт ↔ майстер | усе | усі свої чати | свій чат з існуючим майстром |
| `masterSettings`, `license` | пише (license — лише платформа) | свої `masterSettings` читає | немає |
| Токен Monobank | лише передає через `salonSavePaymentSettings`, назад не читає | немає | немає |

## Що rules гарантують при створенні запису клієнтом
`status = pending`; без `createdBy`/`paymentStatus`/`depositAmount`; майстер `active !== false`;
`services/{serviceId}/masterIds/{masterId} === true`; `price` дорівнює персональній ціні майстра
(`services/{id}/masterPrices/{masterId}`, якщо задана), інакше каталожній `services/{id}/price`;
`paymentMethod` лише `online`/`onsite`; `clientUid === auth.uid`. `paymentStatus` ставить тільки власник/майстер/Cloud Function.
Клієнт мусить спершу зайняти слот (`available:false, bookedBy: uid`) і лише потім створити запис — так конкурентні записи на один час відсікає база.

## Cloud Functions (`functions/salon/`, регіон europe-west1)

| Функція | Що робить |
|---|---|
| `salonOnBookingChanged` | слоти майстра (блок/звільнення/перенесення/видалення, phantom), сповіщення клієнту/власнику/майстру, режим читання за ліцензією |
| `salonOnQueueInvite`, `salonOnAdminSlotOpened`, `salonCascadeQueueInvites` | черга очікування пер майстер: пропозиція на 30 хв, каскад на наступного, запрошення при розблокуванні слота |
| `salonSendReminders` (5 хв), `salonFlushRescheduleQueue` (1 хв) | нагадування за 24 год / 2 год (тихі години 23–06 за часовим поясом салону), відкладені сповіщення про перенесення |
| `salonOnClientMessage`, `salonOnOwnerMessage`, `salonOnMasterChatMessage` | push про повідомлення в чатах |
| `salonOnProfileCreated`, `salonOnClientRegistered`, `salonCheckLicenseExpiry` | реєстр `salon_index`, новий клієнт, термін підписки (попередження → пільгова доба → `suspended`) |
| `salonCreateMasterInvite`, `salonClaimMasterInvite` | запрошення майстра: код `{salonId}.{secret}` на 72 год (до 7 діб), одноразовий; прийняття прив'язує `masterAuth/{uid}` |
| `salonSavePaymentSettings` | власник підключає свій токен Monobank (перевіряється запитом ключа), вмикає оплату, задає передоплату/утримання/автопідтвердження |
| `salonCreateBookingInvoice` | клієнт отримує сторінку оплати Monobank (передоплата `%` або повна/залишок); повторний клік віддає той самий рахунок |
| `salonMonobankCallback` | вебхук: підпис ключем САМЕ цього салону, ідемпотентність, порядок подій, звірка суми, `paymentStatus`, повернення |
| `salonRefundBooking` | ручне повернення власником (виняток із політики): усі ще не повернені платежі запису |
| `salonExpireUnpaidBookings` (5 хв) | неоплачений онлайн-запис `pending` знімається через `holdMinutes` (за відкритого рахунку — ще до 15 хв) |

### Оплата клієнтом (Monobank, гроші йдуть салону)
1. Клієнт створює запис `paymentMethod:'online'` (слот утримується; власник/майстер про запис ще **не** сповіщаються).
2. `POST salonCreateBookingInvoice {salonId, bookingId, mode:'deposit'|'full'}` (Bearer ID-токен) → `{pageUrl}`; суму рахує сервер із `booking.price`.
3. Monobank → `salonMonobankCallback`: `success` → `paid`/`deposit_paid`, сповіщення клієнту і персоналу («Новий запис (оплачено)»); `reversed` → знімає суму, `refunded`.
4. Не сплачено за `holdMinutes` → `cancelledBy: payment_timeout`, слот звільняється. Оплата, що встигла прийти за скасований запис, повертається автоматично
   (`/invoice/cancel`); якщо повернення не вдалось — `payments/{id}/needsRefund` і push власнику.

### Повернення коштів (політика як у більшості систем запису)
Салон задає `profile/payment/cancelFreeHours` (0–720, типово 24): безкоштовне скасування не пізніше ніж за N год до початку.
- клієнт скасував **вчасно** → автоповернення (`/invoice/cancel`), сам платіж закриває вебхук `reversed` → `paymentStatus: refunded`;
- клієнт скасував **пізніше** або після початку → передоплата лишається салону, клієнт отримує пояснення;
- скасував **власник або майстер** → завжди повне повернення, незалежно від строку;
- **перенесення** клієнтом: нова бронь з `rescheduledFromId` забирає передоплату старої (платежі переписуються на неї), повернення не робиться;
- власник може повернути кошти вручну (`salonRefundBooking`) — виняток із політики; невдалий автоповернення → `needsRefund` + push власнику, повторюється вручну.
Повернення на запит одноразове (прапорець `refundRequestedAt` займається транзакцією). Клієнтський застосунок має показувати політику перед скасуванням.
Комісії платформи з клієнтських оплат немає: гроші йдуть салону напряму, платформа бере лише підписку.

Токен лежить у `salon_secrets/{salonId}/monobankToken` (вузол без правил — клієнтам закритий) і ніколи не повертається клієнту.
Токен мерчанта дозволяє й повернення платежів — це ризик, який приймає салон, підключаючи його. `reference` в Monobank = `{salonId}.{paymentId}`.

### Як увімкнути
`functions/index.js` підключає `./salon` лише коли `SALON_FUNCTIONS=1`: на проєкті DrivePad (інструктори) нічого не змінюється й не деплоїться.
Для проєкту салону: `functions/.env.<project>` із `SALON_FUNCTIONS=1`, `SALON_ADMIN_URL`, `SALON_CLIENT_URL` (за замовчуванням адреси DrivePad).
HTTP-функції викликаються за `https://europe-west1-<project>.cloudfunctions.net/<name>`; rewrites у `firebase.json` не додавались (деплоя немає).

## Відкриті питання
1. **Знижки/VIP/`discountAmt`** — відкладено (рішення пізніше). Ціна запису зараз строго = каталожна/персональна ціна майстра.
2. Ліміт майстрів за тарифом і підписка власника через Monobank (етап 6): `salonCheckLicenseExpiry` уже ставить `suspended`, оплати підписки для салонів ще немає.
3. Ще не перенесено з функцій інструкторів: розсилка «звільнився слот» (`onSlotFreed`), розблокування VIP-слотів, `push_tasks`, шаблони повідомлень,
   нагадування по нотатках дня/особистих подіях, злиття запрошених клієнтів за телефоном, видалення акаунта, нічний бекап.
4. Старі `instructors/*` правила і функції видаляються в ребрендингу (етап 5), не раніше.
