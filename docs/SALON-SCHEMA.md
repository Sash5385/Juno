# Juno — схема RTDB і Cloud Functions

Статус: **етап 1** (схема, rules), **етап 2** (Cloud Functions, оплата, повернення, запрошення), **етап 3** (адмінка власника/майстра, `src/salon/`)
і **етап 4** (клієнтський застосунок, `Juno-client/src/salon/`) готові. **Етап 5 (ребрендинг у Juno)**: салон — єдиний застосунок, код, правила і функції інструкторів видалено
(повна копія DrivePad лишається в гілці `main` репозиторіїв Juno / Juno-client). Далі — окремий Firebase-проєкт і тарифи за кількістю майстрів (етап 6).
Рішення: чиста схема `salons/`; еквайринг — Monobank (кожен салон зі своїм токеном); платформа бере лише підписку.

| Що | Де |
|---|---|
| Правила | `database.rules.json` (блок «САЛОН») · тести `tests/rules/salons.test.mjs` |
| Шляхи | `src/salonPaths.js` (однаковий файл у Juno і Juno-client) |
| Functions | `functions/salon/*` · тести `functions/test/salon.e2e.js` |
| Конфіг Functions | `functions/.env.<project>`: `SALON_ADMIN_URL`, `SALON_CLIENT_URL` (див. нижче) |
| Клієнт | `Juno-client/src/salon/*` · спільна логіка `src/utils/salonLogic.js` (копія) · rules-тест `tests/rules/salonClientApp.test.mjs`, смоук `tests/smoke/salon-flows.mjs` у Juno-client |
| Адмінка | `src/salon/*` · спільна логіка `src/salonLogic.js` · тести `tests/rules/salonApp.test.mjs`, `tests/unit/`, `tests/smoke/salon-flows.mjs` |

## Дерево

```
salon_slugs/{slug}: {salonId}                 публічне читання; пише власник
salon_index/{salonId}                         реєстр салонів (за ним ходять шедулери); читає лише адмін платформи
salon_billing/{salonId}/{paymentId}           оплати підписки платформі; пише лише сервер, читає власник
salon_secrets/{salonId}: {monobankToken}      ТІЛЬКИ сервер (правил немає) — токен мерчанта Monobank
master_memberships/{uid}/{salonId}: masterId  де працює майстер (пише сервер при прийнятті запрошення, читає сам майстер)
salons/{salonId}/                             salonId = uid власника
  profile: {name, slug, phone, address, about, timezone, slotStep, logo, slotFreedPush, ..., payment}    публічно; logo — URL у Storage
    payment: {enabled, depositPercent, allowFull, holdMinutes, cancelFreeHours, autoConfirm, hasToken, tokenLast4}
  license: {status, expiresAt, trialEndsAt, provider, tier, masterLimit, monthKop, lastPaymentId, ...}  (SaaS-підписка власника; пише сервер/суперадмін)
  masters/{masterId}/profile: {name, spec, active, order, workHours:[7×{from,to,off}], photo, createdAt, activatedAt}   публічно; photo — URL у Storage
  slotFreedQueue/{masterId_date_HHMM}, lastSlotNotif/{uid}   ТІЛЬКИ сервер: черга «звільнився час» і ліміт 30 хв на клієнта
  pushTemplates/{id}: {name,title,body}, pushLog/{id}: {title,body,sentAt,recipients,sent}   шаблони й журнал розсилок (власник)
  masterAuth/{uid}: masterId                  логін майстра → masterId; пише власник або Cloud Function
  masterSettings/{masterId}: {uid, commissionPct, ...}      власник + сам майстер (читання); uid — Firebase uid майстра
  masterInvites/{secret}: {masterId, expiresAt, claimedBy}  власник / Cloud Function
  masterTokens/{masterId}/{deviceId}: fcmToken              пише майстер
  timeslots/{masterId}/{date}/{slotId}        слоти ПЕР МАЙСТЕР, публічне читання
  services/{serviceId}: {name, category, duration, price, masterIds:{masterId:true}, masterPrices:{masterId:price}}   публічно
  bookings/{bookingId}: {id, masterId, serviceId, serviceName, clientUid, clientName, phone,
                         date, time, durationMin, price, status, createdBy, createdAt,
                         paymentMethod:'online'|'onsite', paymentStatus, paidAmount, paidAt, paymentInvoiceId,
                         clientConfirmed, rating, clientNote, staffNote, cancelledAt, cancelledBy, rescheduledFrom, rescheduledFromId, paymentMovedFrom/To}
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
| `salonOnProfileCreated`, `salonOnClientRegistered`, `salonCheckLicenseExpiry` | реєстр `salon_index`, новий клієнт (+ прив'язка записів без акаунта за **підтвердженим SMS** телефоном, від −30 діб), термін підписки (попередження → пільгова доба → `suspended`) |
| `salonCreateMasterInvite`, `salonClaimMasterInvite` | запрошення майстра: код `{salonId}.{secret}` на 72 год (до 7 діб), одноразовий; прийняття прив'язує `masterAuth/{uid}` |
| `salonSavePaymentSettings` | власник підключає свій токен Monobank (перевіряється запитом ключа), вмикає оплату, задає передоплату/утримання/автопідтвердження |
| `salonCreateBookingInvoice` | клієнт отримує сторінку оплати Monobank (передоплата `%` або повна/залишок); повторний клік віддає той самий рахунок |
| `salonMonobankCallback` | вебхук: підпис ключем САМЕ цього салону, ідемпотентність, порядок подій, звірка суми, `paymentStatus`, повернення |
| `salonRefundBooking` | ручне повернення власником (виняток із політики): усі ще не повернені платежі запису |
| `salonOnSlotFreed`, `salonFlushSlotFreedQueue` (1 хв) | слот звільнився (скасування) у найближчі 10 днів → через 5 хв, якщо ще вільний, push усім клієнтам зі сповіщеннями (не частіше 30 хв на клієнта, не вночі, не в режимі читання); вимикається `profile/slotFreedPush=false` |
| `salonSendBroadcast` | ручна розсилка власника всім клієнтам зі сповіщеннями: `{title, body}`, `{ім'я}` підставляється, до 5 на добу, журнал `pushLog` |
| `salonDeleteAccount` | `{type:"client", salonId?}` — дані клієнта (майбутні записи скасовуються, чат/сповіщення/черга видаляються, минулі записи знеособлюються) + обліковий запис; `{type:"owner"}` — архів у Storage `backups/deleted/…` (без токена Monobank) і видалення салону, slug, секретів, журналу підписки, файлів, облікового запису |
| `salonManualBackup` | запис `system/backupRequest` (кнопка в суперадміні) → копія незалежно від тумблера, запит прибирається |
| `salonNightlyBackup` (03:00 Київ) | JSON-копія кожного салону в Storage `backups/{дата}/{salonId}.json` (без чатів, слотів, токенів), 30 діб; працює лише коли суперадмін виставив `system/backupEnabled = true` |
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

### Підписка салону на платформу (етап 6)
Окремо від оплат клієнтів: гроші йдуть **платформі**, токен Monobank платформи — secret `JUNO_MONOBANK_TOKEN` (`firebase functions:secrets:set JUNO_MONOBANK_TOKEN`).
Тариф залежить від кількості **активних** майстрів (`profile.active !== false`). Типові тарифи — `functions/salon/tariffs.js` (ціни — тимчасові, їх треба затвердити):
Соло (1 майстер) 199 ₴/міс · Команда (до 3) 399 ₴ · Студія (до 7) 699 ₴ · Салон (до 15) 1199 ₴; рік = 10 місяців ціни. Пробний період — 14 діб, у ньому до 3 майстрів.
Ціни — дані: вузол `system/tariffs` (`{yearMonths, trialMasterLimit, tiers:[{key,name,maxMasters,monthKop}]}`, пише суперадмін) перекриває типові без деплою; биті значення ігноруються.

| Функція | Що робить |
|---|---|
| `salonSubscriptionInfo` | власник: тарифи, ліцензія, кількість активних майстрів, ліміт, `payable`; з `{tier, months}` — ще й розрахунок (`quote`) |
| `salonCreateSubscriptionInvoice` | `{tier, months: 1\|12, dryRun?}` → рахунок Monobank (`reference = sub.{salonId}.{paymentId}`), повторний клік віддає той самий рахунок; 409 `too_many_masters`, 503 без токена платформи |
| `salonSubscriptionCallback` | вебхук (ECDSA `X-Sign`, ключ платформи): `success` → `license` = active + `expiresAt`, `tier`, `masterLimit`, `monthKop`, `lastPaymentId`; ідемпотентно, сума й invoiceId звіряються з журналом |
| `salonOnMasterWritten` | активних майстрів понад ліміт ховає (`active:false`, лишаються найстарші за `activatedAt/createdAt`) і пише власнику |

Розрахунок (`quote`): пробний/прострочена → період від кінця пробного (якщо діє) або від зараз; той самий чи нижчий тариф при діючій підписці → період додається в кінець; **вищий** тариф → залишок старого (за `license.monthKop`) іде знижкою, новий період від сьогодні. Знизити тариф можна, лише коли активних майстрів не більше за новий ліміт.
Повернення платежу платформою (`reversed`): якщо це останній платіж — ліцензія відкочується до `prevLicense` з журналу, інакше `needsReview`.
Журнал — `salon_billing/{salonId}/{paymentId}` (пише лише сервер, читає власник). Поля `license.masterLimit/tier/monthKop/...` правила дозволяють писати лише суперадміну (сервер — Admin SDK).

### Фото салону й майстрів (Firebase Storage)
Файли — `salons/{salonId}/logo-{ts}.jpg` і `salons/{salonId}/masters/{masterId}-{ts}.jpg` (`storage.rules`: читають усі, пише лише власник салону, до 5 МБ, лише `image/*`).
Адмінка стискає знімок у браузері (до 900 px, JPEG) і зберігає URL у `profile/logo` та `masters/{id}/profile/photo`; старий файл видаляється після збереження.
Клієнт показує логотип і фото на публічній сторінці салону, у виборі майстра й у списку чатів. Storage потрібно один раз увімкнути в Firebase Console.

### Конфігурація
`functions/index.js` експортує `./salon` і `./monitoring` (форма зв'язку лендингу, журнал помилок). Адреси застосунків — `functions/.env.<project>`:
`SALON_ADMIN_URL`, `SALON_CLIENT_URL` (за замовчуванням `https://juno-admin.web.app`, `https://juno-client.web.app`).
HTTP-функції викликаються за `https://europe-west1-<project>.cloudfunctions.net/<name>`; у `firebase.json` лише rewrites `/api/report-error` (адмінка) і `/api/contact` (лендинг).

## Адмінка (`src/salon/`)
Єдиний застосунок Vite-проєкту: `main.jsx` рендерить `src/salon/index.jsx`. `?demo=1` — демо з вигаданими даними в пам'яті, без Firebase.
Конфіг Firebase-проєкту — змінні збірки `VITE_FIREBASE_*` (див. `.env.example`; без них — лише демо-проєкт `demo-juno`). Також `VITE_FUNCTIONS_BASE` (адреса Cloud Functions, типово за projectId), `VITE_CLIENT_URL` (адреса клієнтського застосунку для посилання `…/s/{slug}`).

| Вкладка | Власник | Майстер |
|---|---|---|
| Календар | усі майстри або один; запис, особистий час, вихідний, блок/розблок слота | лише свій календар |
| Записи | майбутні / очікують / минулі / скасовані, пошук; картка: підтвердити, завершити, скасувати, оплата на місці, перенести, повернення коштів | лише свої записи |
| Клієнти | список, нотатки, блокування, історія | немає (ім'я й телефон є в записі) |
| Послуги | категорія, ціна, тривалість, майстри, персональні ціни, видимість | немає |
| Майстри | профіль, робочі години, запрошення за посиланням `/join/{код}`, «Це я», вимкнення входу | немає |
| Чати | салон ↔ клієнт і клієнт ↔ майстер (усі) | свої чати з клієнтами |
| Статистика | виручка/візити/скасування по майстрах, топ послуг | немає |
| Налаштування | салон, посилання для запису, Monobank, передоплата, політика скасування, сповіщення, тема | профіль, сповіщення, тема |

Вхід: email+пароль або Google. Новий акаунт обирає «Створити салон» (одним мультишляховим записом: профіль, пробні 14 днів, slug, індекс, за бажанням — себе як майстра)
або «У мене є код» (запрошення майстра → `salonClaimMasterInvite`). Роль визначається при вході: є `salons/{uid}/profile` → власник; інакше `master_memberships/{uid}` + перевірка `masterAuth`.
Сітка слотів: при вході на 45 днів уперед додаються лише відсутні слоти за робочими годинами й кроком `profile.slotStep` (раз на добу на пристрої);
після зміни годин майстра сітка перебудовується (`regridWrites`: зайві вільні слоти прибираються, записи/блокування/черга не чіпаються).
Сповіщення: токен пристрою пишеться в `fcmTokens` (власник) або `masterTokens/{masterId}` (майстер) після дозволу в браузері.

## Клієнтський застосунок (`Juno-client/src/salon/`)
Той самий підхід: салон — єдиний застосунок, `?demo=1` — демо.
Маршрути: `/s/{slug}` — публічна сторінка салону й запис (вхід не потрібен, поки не дійшли до підтвердження); `/cabinet/{bookings|chat|notifs|profile}` — кабінет.
Slug запам'ятовується (localStorage + cookie для ярлика iPhone), `/` веде на збережений салон.

**Запис** (`BookFlow`): послуга → майстер (або «будь-який»: найближчий вільний) → дата й час (лише вікна, де всі слоти тривалості вільні — `freeStartTimes`; 30 днів; не ближче 30 хв до початку)
→ підтвердження: оплата (передоплата / повна / в салоні — за налаштуваннями салону), побажання, умови скасування, вхід (SMS, email, Google) і анкета (ім'я, телефон, згода) тут же.
Порядок записів: 1) один multi-path запис захоплює всі слоти діапазону (`available:false, bookedBy:uid`) — якщо хоч один зайнятий, правила відхиляють усе (атомарно);
2) створюється бронь `pending` (ціна = ціна майстра чи каталожна, її перевіряють rules); 3) для онлайн-оплати викликається `salonCreateBookingInvoice` і клієнта переадресовує на сторінку Monobank.
Якщо бронь не створилась — слоти повертаються. Немає вільного часу → лист очікування (`queue/{master}/{дата_час}/entries/{uid}` + `userQueue`), пропозиція від сервера з'являється банером у «Записах».
**Мої записи:** оплатити / доплатити, скасувати (діалог показує політику: вчасно — передоплату повернуть, пізніше — ні), перенести (той самий майстер і послуга; нова бронь з `rescheduledFromId`
забирає передоплату; стара скасовується як `reschedule`), підтвердити візит, оцінити, чат із салоном і майстром, сповіщення, профіль, push.
Ризик, відомий і прийнятий: якщо вкладку закрити між захопленням слотів і створенням броні (мілісекунди), слоти лишаться «зайнятими» без броні — власник може розблокувати їх у календарі.

## Суперадмін (власник платформи)
Екран «🛠 Адмін» (вкладка в оболонці власника; для суперадміна без салону — окремий екран з кнопкою «Створити власний салон»). Видимий лише для email
`sash5385@gmail.com`; справжній захист — правила бази (`auth.token.email` у `license`, `system/*`, `salon_index`, `salon_billing`), UI лише ховає екран.
- **Салони:** підсумок (усього / платних / пробних / проблемних / орієнтовний дохід за місяць), пошук і фільтри; картка салону — статус, дата, ліміт майстрів і тариф
  (ручні виняткові зміни `license`), історія платежів підписки, видалення салону (`salonDeleteAccount` від імені суперадміна, з підтвердженням словом).
- **Тарифи:** редактор `system/tariffs` (назва, код, ліміт майстрів, ціна, «рік = N місяців», ліміт на пробному) з перевіркою (`src/salonTariffs.js`: коректні коди й ліміти,
  більший тариф дорожчий) і кнопкою «Типові». Нові ціни діють одразу для наступних оплат.
- **Система:** тумблер нічної копії, статус останньої, «Зробити копію зараз» (`system/backupRequest` → `salonManualBackup`), звернення з лендингу (опрацьовано/видалити),
  журнал помилок застосунків (групи з лічильниками, очистити).
- Демо: `?demo=1&vendor=1`. Тести: `tests/smoke/superadmin-flows.mjs`, `tests/unit/salonTariffs.test.mjs`, секції SUPERADMIN у rules-тестах.

## Відкриті питання
0. Адмінка й клієнт поки лише українською; галереї робіт немає (лише логотип і фото майстрів); rewrites `/api/*` для Functions у `firebase.json` не додавались (клієнт і адмінка викликають `cloudfunctions.net` напряму); `notifications/{uid}` клієнт лише читає (пишуть Functions).
1. **Знижки/VIP/`discountAmt`** — відкладено (рішення пізніше). Ціна запису зараз строго = каталожна/персональна ціна майстра.
2. Підписка: ціни тимчасові (затвердити), рекурентного автосписання немає (власник платить вручну на період), рахунок-фактури/чеки (ПРРО) не формуються.
3. Перенесено з DrivePad: «звільнився слот», ручна розсилка й шаблони, прив'язка записів за телефоном, видалення акаунта, нічна копія. Свідомо НЕ перенесено:
   розблокування VIP-слотів (разом зі знижками/VIP — рішення відкладено), нотатки дня з нагадуванням, автошаблони повідомлень (welcome/нагадування з редагованим текстом),
   
4. LiqPay/Monobank-оплата ліцензії DrivePad видалена; підписка Juno — розділ «Підписка салону на платформу».
