const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.database();

const OFFER_WINDOW_MS = 30 * 60 * 1000; // 30 хвилин

// Хелпер: перевести "YYYY-MM-DDTHH:MM" за київським часом у абсолютні мс.
// На відміну від фіксованого зсуву "+03:00", коректно враховує DST
// (Київ — UTC+2 взимку, UTC+3 влітку).
function kyivLocalToMs(dateStr, timeStr) {
  const guessMs = new Date(`${dateStr}T${timeStr}:00Z`).getTime();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kiev", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(guessMs).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUtcIfKyivPartsWereUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour === "24" ? 0 : parts.hour, parts.minute, parts.second
  );
  const offsetMs = asUtcIfKyivPartsWereUtc - guessMs;
  return guessMs - offsetMs;
}

// Хелпер: корінь дерева конкретного інструктора
function iRef(iid, path) {
  return db.ref(path ? `instructors/${iid}/${path}` : `instructors/${iid}`);
}

// Хелпер: зберегти сповіщення в RTDB для студента
async function saveNotification(iid, uid, title, body, type = "system") {
  const ts = Date.now();
  const time = new Date(ts).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(ts).toLocaleDateString("uk", { day: "2-digit", month: "2-digit", year: "numeric" });
  await iRef(iid, `notifications/${uid}`).push({ title, body, type, ts, time, date }).catch(() => {});
}

// Хелпер: зібрати токени всіх пристроїв з вузла { deviceId: token, ... }
function collectDeviceTokens(devicesVal) {
  if (!devicesVal || typeof devicesVal !== "object") return [];
  return Object.entries(devicesVal).filter(([, t]) => !!t);
}

// Хелпер: відправити push студенту (на всі зареєстровані пристрої —
// студент міг заходити і з ПК, і з телефону, кожен пристрій має свій токен)
async function pushStudent(iid, uid, title, body, data = {}) {
  const snap = await iRef(iid, `users/${uid}/fcmTokens`).get();
  const devices = collectDeviceTokens(snap.val());
  if (!devices.length) return false;
  const link = data.url || "https://drivepad-client.web.app/cabinet";
  let sent = false;
  for (const [deviceId, token] of devices) {
    try {
      // Data-only push — title/body/url у data (клієнт читає payload.data),
      // без notification, щоб браузер не показав дубль поверх showNotification().
      await admin.messaging().send({
        token,
        data: Object.fromEntries(Object.entries({ title, body, url: link, ...data }).map(([k,v]) => [k, String(v)])),
        webpush: {
          fcmOptions: { link },
        },
      });
      sent = true;
    } catch (e) {
      if (e.code === "messaging/registration-token-not-registered" ||
          e.code === "messaging/invalid-registration-token") {
        // Чистимо ОБИДВІ копії токена цього пристрою — studentTokens це окремий
        // індекс для broadcast-розсилок (flushSlotFreedQueue, unlockVipSlots), і
        // якщо його не чистити тут, студент назавжди лишається у списку
        // розсилки, хоча реальний токен вже видалено — пуш мовчки не
        // відправляється щоразу.
        await iRef(iid, `users/${uid}/fcmTokens/${deviceId}`).remove().catch(() => {});
        await iRef(iid, `studentTokens/${uid}/${deviceId}`).remove().catch(() => {});
      }
    }
  }
  return sent;
}

// Хелпер: запросити наступного в черзі для слота.
// freedDurationHours — тривалість щойно скасованого уроку: якщо відома,
// саме на неї треба записати учня з черги, а не на його власний вибір при
// вступі в чергу (інакше 2-годинний урок звільняється, а бронюється лише 1 год).
async function inviteNextInQueue(iid, slotKey, excludeUids = [], freedDurationHours = null) {
  const entriesSnap = await iRef(iid, `queue/${slotKey}/entries`).get();
  if (!entriesSnap.exists()) return;
  const entries = Object.entries(entriesSnap.val())
    .map(([uid, e]) => ({ uid, ...e }))
    .filter(e => e.status === "waiting" && !excludeUids.includes(e.uid))
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  if (!entries.length) return;
  const next = entries[0];
  const upd = { status: "offered" };
  if (freedDurationHours) upd.offerDurationHours = freedDurationHours;
  await iRef(iid, `queue/${slotKey}/entries/${next.uid}`).update(upd);
  // onQueueInvite спрацює автоматично
}

// Хелпер: побудувати deep-link на конкретний запис у розкладі адмінки
function buildAdminLink(base, { date, time, uid, bookingId } = {}) {
  const p = new URLSearchParams();
  if (date && date !== "—") p.set("date", date);
  if (time && time !== "—") p.set("time", time);
  if (uid) p.set("uid", uid);
  if (bookingId) p.set("bookingId", bookingId);
  const qs = p.toString();
  return qs ? `${base}/?${qs}` : `${base}/`;
}

// Хелпер: відправити push адміну (на всі зареєстровані пристрої)
async function pushAdmin(iid, title, body, data = {}) {
  const snap = await iRef(iid, "fcmTokens").get();
  const devices = collectDeviceTokens(snap.val());
  console.log(`pushAdmin: iid=${iid} devices=${devices.length}, title="${title}"`);
  if (!devices.length) { console.warn(`pushAdmin: no tokens at instructors/${iid}/fcmTokens`); return false; }
  const link = data.url || "https://drivepad-admin.web.app";
  let sent = false;
  for (const [deviceId, token] of devices) {
    try {
      // Data-only push — адмінка читає payload.data (App.jsx + SW), без
      // notification, щоб не було дубля поверх showNotification().
      const result = await admin.messaging().send({
        token,
        data: Object.fromEntries(Object.entries({ title, body, url: link, ...data }).map(([k, v]) => [k, String(v)])),
        webpush: {
          fcmOptions: { link },
        },
      });
      console.log(`pushAdmin OK: ${title} messageId=${result}`);
      sent = true;
    } catch (e) {
      console.error(`pushAdmin error: code=${e.code} msg=${e.message}`);
      // Якщо токен протухнув — очищаємо щоб не повторювати помилку
      if (e.code === "messaging/registration-token-not-registered" ||
          e.code === "messaging/invalid-registration-token") {
        await iRef(iid, `fcmTokens/${deviceId}`).remove().catch(() => {});
        console.warn(`pushAdmin: stale token removed for device=${deviceId}`);
      }
    }
  }
  return sent;
}

// ─── Шаблони повідомлень (admin_data/templates) ───────────────────
// Хелпер: підставити {ім'я}/{дата}/{час}/... у текст шаблону
function renderTemplateBody(body, vars = {}) {
  return (body || "").replace(/\{[^}]+\}/g, (m) => {
    const key = m.slice(1, -1);
    return vars[key] != null && vars[key] !== "" ? String(vars[key]) : m;
  });
}

// Хелпер: для auto_reminder — 24г чи 2г "кошик" шаблону за полем reminderHours
// (без поля — типово вважаємо шаблон "за 24 год", як і було раніше)
function matchesReminderBucket(tpl, targetHours) {
  const h = Number(tpl.reminderHours);
  const hours = Number.isFinite(h) ? h : 24;
  return targetHours === 24 ? hours >= 12 : hours > 0 && hours < 12;
}

// Хелпер: надіслати учню ВСІ активні шаблони заданого тригера — чат-
// повідомлення (як ручна відправка з вкладки "Шаблони") + push. Повертає
// true лише якщо хоч одне повідомлення РЕАЛЬНО дійшло (чат-запис або push) —
// а не просто "знайдено активний шаблон". Виклик використовує це, щоб
// вирішити, чи ставити sentReminders / не слати хардкодний фолбек — якщо
// повернути true при провалі обох каналів, прапорець "відправлено"
// назавжди заблокував би повторні спроби (той самий клас багу, що вже
// фіксився для 24г/2г нагадувань).
async function sendActiveTemplates(iid, uid, triggerId, vars = {}, filterFn = null) {
  const snap = await iRef(iid, "admin_data/templates").get();
  const list = snap.val();
  if (!Array.isArray(list)) return false;
  let matches = list.filter(t => t && t.trigger === triggerId && t.active && (t.body || "").trim());
  if (filterFn) matches = matches.filter(filterFn);
  if (!matches.length) return false;

  let delivered = false;
  for (const tpl of matches) {
    const text = renderTemplateBody(tpl.body, vars);
    const time = new Date().toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" });
    const ts = Date.now();
    const chatSent = await iRef(iid, `chats/${uid}`).push({ from: "admin", text, time, ts })
      .then(() => true).catch(() => false);
    if (chatSent) {
      await iRef(iid, `chatMeta/${uid}`).update({
        unreadForStudent: admin.database.ServerValue.increment(1), lastMsg: text, lastTs: ts,
      }).catch(() => {});
    }
    const pushed = await pushStudent(iid, uid, tpl.title || "Повідомлення", text, {}).catch(() => false);
    if (pushed) await saveNotification(iid, uid, tpl.title || "Повідомлення", text, "template").catch(() => {});
    if (chatSent || pushed) delivered = true;
  }
  return delivered;
}

// Хелпер: для масових розсилок (auto_queue) — СИРИЙ (без підстановки) текст
// першого активного шаблону, БЕЗ запису в чат (уникаємо спаму чату при
// broadcast на всіх учнів). Підстановка робиться окремо для кожного учня —
// {ім'я} тут не рендериться навмисно, інакше усі отримали б однаковий текст
// з іменем ПЕРШОГО підставленого учня (або взагалі невідому змінну "як є").
async function getActiveTemplateRaw(iid, triggerId) {
  const snap = await iRef(iid, "admin_data/templates").get();
  const list = snap.val();
  if (!Array.isArray(list)) return null;
  const tpl = list.find(t => t && t.trigger === triggerId && t.active && (t.body || "").trim());
  return tpl ? { title: tpl.title || "Повідомлення", body: tpl.body } : null;
}

// Хелпер: заблокувати / звільнити timeslots для запису
function buildSlotUpdates(bookingData, available) {
  const { date, time, durationHours, durMin, startMin } = bookingData || {};
  if (!date || (!time && startMin == null)) return {};
  const INTERVAL = 30;
  let start;
  if (startMin != null) {
    start = startMin;
  } else {
    const [h, m] = (time || "0:0").split(":").map(Number);
    start = h * 60 + m;
  }
  const dur = durMin ?? ((durationHours || 1) * 60);
  const updates = {};
  for (let cur = start; cur < start + dur; cur += INTERVAL) {
    const hh = String(Math.floor(cur / 60)).padStart(2, "0");
    const mm = String(cur % 60).padStart(2, "0");
    if (available) {
      // Half-hour slots (9:30, 10:30…) were only created by blockSlots — delete them.
      // Hour-boundary slots were generated — restore to available.
      if (cur % 60 !== 0) {
        updates[`timeslots/${date}/slot${hh}${mm}`] = null;
      } else {
        updates[`timeslots/${date}/slot${hh}${mm}/available`] = true;
        updates[`timeslots/${date}/slot${hh}${mm}/time`] = `${hh}:${mm}`;
      }
    } else {
      updates[`timeslots/${date}/slot${hh}${mm}/available`] = false;
      updates[`timeslots/${date}/slot${hh}${mm}/time`] = `${hh}:${mm}`;
    }
  }
  return updates;
}

// Всі зміни запису → push адміну або клієнту + синхронізація timeslots
exports.onBookingChanged = onValueWritten(
  { ref: "instructors/{iid}/bookings/{uid}/{bookingId}", region: "europe-west1" },
  async (event) => {
    const before     = event.data.before.val();
    const after      = event.data.after.val();
    const { iid, uid, bookingId } = event.params;
    const name       = (after || before)?.studentName || "Учень";
    const date       = (after || before)?.date || "—";
    const time       = (after || before)?.time || "—";
    const adminLink  = () => buildAdminLink("https://drivepad-admin.web.app", { date, time, uid, bookingId });

    // Новий запис (before = null) — блокуємо слоти
    if (before === null && after) {
      const slotUpd = buildSlotUpdates(after, false);
      if (Object.keys(slotUpd).length) await iRef(iid).update(slotUpd).catch(() => {});
      await iRef(iid, `activeStudents/${uid}`).set(true).catch(() => {});
      await iRef(iid, `recentStudents/${uid}`).set(Date.now()).catch(() => {});
      if (after.createdBy === "admin" && uid !== "admin") {
        // Адмін вручну записав учня — сповіщаємо учня
        console.log(`onBookingChanged: admin manual booking iid=${iid} uid=${uid}`);
        await pushStudent(iid, uid, "📋 Урок заплановано", `${date} о ${time}`, {
          url: "https://drivepad-client.web.app/cabinet/bookings",
        });
        await saveNotification(iid, uid, "📋 Урок заплановано", `${date} о ${time}`, "booking_confirmed");
      } else if (after.createdBy !== "admin" && after.status !== "personal") {
        // Учень записався сам — сповіщаємо адміна
        // (особисті події адміна не мають генерувати цей пуш — у них є власне
        // нагадування-будильник через sendPersonalEventReminders)
        console.log(`onBookingChanged: new booking iid=${iid} uid=${uid}`);
        await pushAdmin(iid, "📋 Новий запис", `${name} · ${date} о ${time}`, { url: adminLink() });
      }
      return;
    }

    if (!before || !after) return;

    // Учень скасував — звільняємо слоти
    if (after.cancelledBy === "student" && before.cancelledBy !== "student") {
      console.log(`onBookingChanged: student cancel iid=${iid} uid=${uid}`);
      const slotUpd = buildSlotUpdates(before, true);
      if (Object.keys(slotUpd).length) await iRef(iid).update(slotUpd).catch(() => {});
      await pushAdmin(iid, "❌ Урок скасовано", `${name} · ${date} о ${time}`, { url: adminLink() });
      if (date !== "—" && time !== "—") {
        const freedDurationHours = before.durationHours || (before.durMin ? before.durMin / 60 : 1);
        await inviteNextInQueue(iid, `${date}_${time}`, [], freedDurationHours).catch(() => {});
      }
      return;
    }

    // Адмін підтвердив
    if (after.status === "confirmed" && before.status !== "confirmed") {
      console.log(`onBookingChanged: admin confirmed iid=${iid} uid=${uid}`);
      const vars = { "ім'я": name, "дата": date, "час": time, "послуга": after.serviceName || after.service || "", "ціна": after.price != null ? String(after.price) : "" };
      const usedTpl = await sendActiveTemplates(iid, uid, "auto_confirm", vars).catch(() => false);
      if (!usedTpl) {
        await pushStudent(iid, uid, "✅ Урок підтверджено", `${date} о ${time}`, {
          url: "https://drivepad-client.web.app/cabinet/bookings",
        });
        await saveNotification(iid, uid, "✅ Урок підтверджено", `${date} о ${time}`, "booking_confirmed");
      }
      return;
    }

    // Адмін скасував — звільняємо слоти
    if (after.status === "cancelled" && before.status !== "cancelled" && after.cancelledBy === "admin") {
      console.log(`onBookingChanged: admin cancelled iid=${iid} uid=${uid}`);
      const slotUpd = buildSlotUpdates(before, true);
      if (Object.keys(slotUpd).length) await iRef(iid).update(slotUpd).catch(() => {});
      const cancelVars = { "ім'я": name, "дата": date, "час": time };
      const usedCancelTpl = await sendActiveTemplates(iid, uid, "auto_cancel", cancelVars).catch(() => false);
      if (!usedCancelTpl) {
        await pushStudent(iid, uid, "❌ Урок скасовано", `${date} о ${time}`, {
          url: "https://drivepad-client.web.app/cabinet/bookings",
        });
        await saveNotification(iid, uid, "❌ Урок скасовано", `${date} о ${time}`, "booking_cancelled");
      }
      if (date !== "—" && time !== "—") {
        const freedDurationHours = before.durationHours || (before.durMin ? before.durMin / 60 : 1);
        await inviteNextInQueue(iid, `${date}_${time}`, [], freedDurationHours).catch(() => {});
      }
      return;
    }

    // Студент підтвердив присутність
    if (after.studentConfirmed && !before.studentConfirmed) {
      console.log(`onBookingChanged: student confirmed iid=${iid} uid=${uid}`);
      await pushAdmin(iid, "✅ Підтвердив присутність", `${name} · ${date} о ${time}`, { url: adminLink() });
      return;
    }

    // Перенесено — тільки блокуємо нове місце (старе залишається blocked до ручної генерації)
    const rescheduled = after.status !== "cancelled" &&
      (after.date !== before.date || after.time !== before.time);
    if (rescheduled) {
      const blockUpd = buildSlotUpdates(after, false);
      if (Object.keys(blockUpd).length) await iRef(iid).update(blockUpd).catch(() => {});
      const oldDate = before.date || "—";
      const oldTime = before.time || "—";
      const body = `Новий час: ${date} о ${time} (було ${oldDate} о ${oldTime})`;
      console.log(`onBookingChanged: rescheduled iid=${iid} uid=${uid} bookingId=${bookingId} — queuing notif`);
      await iRef(iid, `rescheduleQueue/${uid}/${bookingId}`).set({
        uid, body, sendAfter: Date.now() + 60000,
      }).catch(() => {});
      return;
    }
  }
);

// Нормалізує телефон до самих цифр для порівняння (+380 67 123-45-67 -> 380671234567)
function normPhone(p) {
  return (p || "").replace(/\D/g, "");
}

// Учень, доданий вручну адміном (картка учня без .profile), запросив
// себе через посилання ("🔗 Запросити" в картці учня) або просто
// самостійно зареєструвався з тим самим номером телефону — зливаємо
// операційні поля (знижку/фікс.ціну/нотатки/години/VIP/медалі) в щойно
// зареєстрований акаунт. Історію записів/чатів навмисно НЕ переносимо —
// це критичний модуль, ризик вищий за користь для типового кейсу
// (запрошення надсилають ДО першого уроку).
async function mergeInvitedStudentRecord(iid, uid, profile) {
  try {
    let oldKey = null;
    const token = profile?.inviteToken;
    if (token) {
      const invite = (await iRef(iid, `invites/${token}`).get()).val();
      if (invite?.studentKey) oldKey = invite.studentKey;
    }
    if (!oldKey) {
      const phone = normPhone(profile?.phone);
      if (phone) {
        const usersVal = (await iRef(iid, "users").get()).val() || {};
        const matches = Object.entries(usersVal).filter(([key, u]) =>
          key !== uid && !u.profile && normPhone(u.phone) === phone
        );
        if (matches.length === 1) oldKey = matches[0][0];
      }
    }
    if (token) await iRef(iid, `invites/${token}`).remove().catch(() => {});
    if (!oldKey || oldKey === uid) return;

    const old = (await iRef(iid, `users/${oldKey}`).get()).val();
    // Захист: зливаємо тільки із "заглушки" адміна (без .profile) —
    // ніколи не чіпаємо чужий реальний зареєстрований акаунт.
    if (!old || old.profile) return;

    const patch = {};
    [
      "discount", "customPrice", "notes", "hours", "hoursOffset",
      "isVip", "noIntervalLimit", "blocked", "badges",
      "maneuverCounts", "maneuverSuccessCounts", "createdAt",
    ].forEach((f) => { if (old[f] !== undefined) patch[`users/${uid}/${f}`] = old[f]; });
    patch[`users/${oldKey}`] = null;
    patch[`users/${uid}/profile/inviteToken`] = null;
    await iRef(iid).update(patch);
    console.log(`mergeInvitedStudentRecord: iid=${iid} merged ${oldKey} -> ${uid}`);
  } catch (e) {
    console.error("mergeInvitedStudentRecord failed:", e);
  }
}

// Новий учень зареєструвався (заповнив анкету) — сповіщаємо адміна
exports.onNewStudentRegistered = onValueCreated(
  { ref: "instructors/{iid}/users/{uid}/profile", region: "europe-west1" },
  async (event) => {
    const profile = event.data.val();
    const { iid, uid } = event.params;
    await mergeInvitedStudentRecord(iid, uid, profile);
    const name  = profile?.name  || "Новий учень";
    const phone = profile?.phone || "";
    console.log(`onNewStudentRegistered: iid=${iid} uid=${uid} name="${name}"`);
    await pushAdmin(iid, "🎉 Новий учень", phone ? `${name} · ${phone}` : name, {
      url: buildAdminLink("https://drivepad-admin.web.app", { uid }),
    });
    await sendActiveTemplates(iid, uid, "auto_welcome", { "ім'я": name }).catch(() => {});
  }
);

// Кнопка "Запросити": записує offeredTo/{uid} і пушить студента
exports.onQueueInvite = onValueUpdated(
  { ref: "instructors/{iid}/queue/{slotKey}/entries/{uid}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before.val();
    const after  = event.data.after.val();
    if (!after || after.status !== "offered" || before?.status === "offered") return;

    const { iid, uid } = event.params;
    const slotKey = event.params.slotKey; // "2026-06-10_09:00"
    const sep = slotKey.lastIndexOf("_");
    const date = slotKey.slice(0, sep);
    const time = slotKey.slice(sep + 1);
    if (!date || !time) return;
    const slotId = `slot${time.replace(":", "")}`;

    // Додаємо uid до offeredTo зі строком дії (перший → теж залишається)
    const until = Date.now() + OFFER_WINDOW_MS;
    await iRef(iid, `timeslots/${date}/${slotId}/offeredTo/${uid}`).set({ until }).catch(() => {});

    // In-app сповіщення: клієнт підписаний на цей шлях. Якщо запрошення
    // прийшло від скасування конкретного уроку — offerDurationHours несе
    // його тривалість, щоб бронювання з черги зайняло стільки ж часу.
    await iRef(iid, `users/${uid}/queueOffers/${slotKey}`).set({
      date, time, until, slotKey,
      ...(after.offerDurationHours ? { durationHours: after.offerDurationHours } : {}),
    }).catch(() => {});

    const url = `https://drivepad-client.web.app/cabinet?date=${date}&time=${encodeURIComponent(time)}`;
    const pushTitle = "🎉 Слот зарезервовано для вас!";
    const pushBody = `${date} о ${time} — у вас 30 хвилин щоб записатись`;
    await pushStudent(iid, uid, pushTitle, pushBody, { url, date, time, slotKey });
    await saveNotification(iid, uid, pushTitle, pushBody, "queue_offer");
  }
);


// Кожні 10 хв: для кожного спроченого offeredTo → запрошує наступного
// (першому резерв залишається — він може й надалі записатися)
exports.cascadeQueueInvites = onSchedule({ schedule: "every 10 minutes", region: "europe-west1" }, async () => {
  const now = Date.now();
  const instructorsSnap = await db.ref("instructors").get();
  const instructors = instructorsSnap.val() || {};

  for (const [iid, inst] of Object.entries(instructors)) {
    const data = inst?.timeslots || {};

    for (const [date, dateSlots] of Object.entries(data)) {
      if (!dateSlots || typeof dateSlots !== "object") continue;
      for (const [slotId, slot] of Object.entries(dateSlots)) {
        if (!slot.offeredTo) continue;
        if (slot.available === false) continue; // слот вже зайнятий

        const time = slot.time;
        if (!time) continue;
        const slotKey = `${date}_${time}`;

        const expiredUids = [];
        for (const [uid, offer] of Object.entries(slot.offeredTo)) {
          if (offer.until < now) expiredUids.push(uid);
        }

        if (!expiredUids.length) continue;

        // Всі хто вже отримав запрошення (offered/expired) — щоб не повторювати
        const queueEntries = inst?.queue?.[slotKey]?.entries;
        const alreadyOffered = queueEntries
          ? Object.entries(queueEntries)
              .filter(([, e]) => e.status === "offered" || e.status === "booked")
              .map(([uid]) => uid)
          : [];

        // Запрошуємо наступного (першому резерв НЕ видаляємо)
        await inviteNextInQueue(iid, slotKey, alreadyOffered);
      }
    }
  }
});

// Адмін відкрив заблокований слот → запрошуємо першого в черзі
exports.onAdminSlotOpened = onValueWritten(
  { ref: "instructors/{iid}/timeslots/{date}/{slotId}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before?.val();
    const after  = event.data.after?.val();
    if (!before || !after) return;
    // Тригер тільки: adminBlocked true → false, available → true
    if (before.adminBlocked !== true) return;
    if (after.adminBlocked !== false || after.available !== true) return;

    const { iid, date, slotId } = event.params;
    let time = after.time;
    if (!time) {
      const m = slotId.match(/^slot(\d{2})(\d{2})$/);
      if (!m) return;
      time = `${m[1]}:${m[2]}`;
    }

    const slotKey = `${date}_${time}`;
    const qSnap = await iRef(iid, `queue/${slotKey}/entries`).get();
    if (!qSnap.exists()) return;

    const entries = Object.entries(qSnap.val())
      .map(([uid, e]) => ({ uid, ...e }))
      .filter(e => e.status === "waiting")
      .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

    if (!entries.length) return;
    // Ставимо першого як "offered" → onQueueInvite відправить push і зарезервує слот
    await iRef(iid, `queue/${slotKey}/entries/${entries[0].uid}`).update({ status: "offered" });
  }
);

// Runs every hour — unlocks VIP slots within 48h and sends push to all non-VIP students
exports.unlockVipSlots = onSchedule("every 1 hours", async () => {
  const now = Date.now();
  const threshold = now + 48 * 60 * 60 * 1000;

  const instructorsSnap = await db.ref("instructors").get();
  const instructors = instructorsSnap.val() || {};

  for (const [iid, inst] of Object.entries(instructors)) {
    const slotsData = inst?.timeslots || {};
    const updates = {};
    let unlocked = false;

    for (const [date, dateSlots] of Object.entries(slotsData)) {
      if (!dateSlots || typeof dateSlots !== "object") continue;
      for (const [slotId, slot] of Object.entries(dateSlots)) {
        if (!slot.vipOnly || slot.available === false) continue;
        const time = slot.time;
        if (!time) continue;
        const slotMs = kyivLocalToMs(date, time);
        if (slotMs > now && slotMs <= threshold) {
          updates[`timeslots/${date}/${slotId}/vipOnly`] = false;
          unlocked = true;
        }
      }
    }

    if (!unlocked) continue;
    await iRef(iid).update(updates);

    const tokens = Object.values(inst?.studentTokens || {})
      .flatMap(devices => Object.values(devices || {}))
      .filter(Boolean);
    if (!tokens.length) continue;

    for (let i = 0; i < tokens.length; i += 500) {
      // Data-only push (title/body в data) — див. onPushTask/SW щодо дублів.
      await admin.messaging().sendEachForMulticast({
        tokens: tokens.slice(i, i + 500),
        data: {
          title: "🚗 З'явились нові слоти!",
          body: "Відкрились нові години для запису. Поспішай!",
          url: "https://drivepad-client.web.app/cabinet",
        },
        webpush: {
          fcmOptions: { link: "https://drivepad-client.web.app/cabinet" },
        },
      }).catch(() => {});
    }
  }
});

// Слот у найближчі 10 днів звільнився → ставимо в чергу, пуш через 5 хв
exports.onSlotFreed = onValueWritten(
  { ref: "instructors/{iid}/timeslots/{date}/{slotId}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before?.val();
    const after  = event.data.after?.val();

    // Перехід до available: true (звільнився або з'явився новий слот)
    if (before?.available === true) return; // вже був вільний — не дублюємо
    if (!after || after.available !== true) return;

    const { iid, date, slotId } = event.params;

    const enabledSnap = await iRef(iid, "admin_settings/slotFreedPushEnabled").get();
    if (enabledSnap.exists() && enabledSnap.val() === false) return;

    // Тільки найближчі 10 днів
    const slotDate = new Date(date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((slotDate - today) / 86400000);
    if (diffDays < 0 || diffDays > 10) return;

    const time = after.time;
    if (!time) return;

    const slotKey = `${date}_${time}`;
    // Записуємо в чергу — пуш відправиться через 5 хв якщо слот ще вільний
    await iRef(iid, `slotFreedQueue/${slotKey}`).set({
      date, time, sendAfter: Date.now() + 5 * 60 * 1000,
    }).catch(() => {});

    // Якщо в цьому слоті був phone-only запис — скасовуємо його
    const slotBookingSnap = await iRef(iid, `slotBookings/${date}/${slotId}`).get();
    if (slotBookingSnap.exists()) {
      const { phone, bookingId } = slotBookingSnap.val();
      if (phone && bookingId) {
        await iRef(iid, `bookings_by_phone/${phone}/${bookingId}`).update({
          status: "cancelled", cancelledAt: Date.now(), cancelledBy: "admin"
        }).catch(() => {});
        await iRef(iid, `slotBookings/${date}/${slotId}`).remove().catch(() => {});
      }
    }
  }
);

// Кожну хвилину: відправляємо відкладені пуші про звільнені слоти
exports.flushSlotFreedQueue = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1" },
  async () => {
    // Тихі години 23:00–6:00 за Києвом
    const kyivHour = parseInt(new Date().toLocaleString("uk", { timeZone: "Europe/Kiev", hour: "2-digit", hour12: false }), 10);
    if (kyivHour >= 23 || kyivHour < 6) return;

    const now = Date.now();
    const instructorsSnap = await db.ref("instructors").get();
    const instructors = instructorsSnap.val() || {};

    for (const [iid, inst] of Object.entries(instructors)) {
      const queueData = inst?.slotFreedQueue;
      if (!queueData) continue;

      const tasks = Object.entries(queueData)
        .filter(([, val]) => val && val.sendAfter <= now)
        .map(([key, val]) => ({ key, ...val }));
      if (!tasks.length) continue;

      // Всі студенти з увімкненими push-сповіщеннями
      const notifyUids = Object.keys(inst?.studentTokens || {});
      if (!notifyUids.length) continue;

      // Rate-limit: не слати одному студенту частіше ніж раз на 30 хвилин
      const lastNotifData = inst?.lastSlotNotif || {};
      const RATE_LIMIT_MS = 30 * 60 * 1000;

      for (const { key, date, time } of tasks) {
        await iRef(iid, `slotFreedQueue/${key}`).remove().catch(() => {});

        // Перевіряємо що слот ще вільний
        const slotId = `slot${time.replace(":", "")}`;
        const slotSnap = await iRef(iid, `timeslots/${date}/${slotId}`).get();
        const slot = slotSnap.val();
        if (!slot || slot.available !== true) continue;

        const slotDate = new Date(date + "T00:00:00");
        const dateFormatted = slotDate.toLocaleDateString("uk", { day: "numeric", month: "long", weekday: "short" });
        // Broadcast на всіх учнів — беремо СИРИЙ текст першого активного
        // шаблону auto_queue (без запису в чат, щоб не заспамити чат усіх
        // учнів), а {ім'я} підставляємо нижче окремо для кожного учня.
        const tpl = await getActiveTemplateRaw(iid, "auto_queue").catch(() => null);
        const rawTitle = tpl?.title || "🚗 Звільнився слот!";
        const rawBody  = tpl?.body  || `${dateFormatted} о ${time} — є вільне місце`;
        const url   = `https://drivepad-client.web.app/cabinet?date=${date}`;

        for (const uid of notifyUids) {
          if (lastNotifData[uid] && now - lastNotifData[uid] < RATE_LIMIT_MS) continue;
          const profileSnap = await iRef(iid, `users/${uid}/profile`).get().catch(() => null);
          const vars = { "дата": dateFormatted, "час": time, "ім'я": profileSnap?.val()?.name || "Учень" };
          const title = renderTemplateBody(rawTitle, vars);
          const body  = renderTemplateBody(rawBody, vars);
          const sent = await pushStudent(iid, uid, title, body, { url, date, time }).catch(() => false);
          if (!sent) continue; // токен мертвий/не знайдено — не займаємо rate-limit слот даремно
          await saveNotification(iid, uid, title, body, "slot_freed").catch(() => {});
          lastNotifData[uid] = now; // локально щоб не спамити кілька слотів за один запуск
          await iRef(iid, `lastSlotNotif/${uid}`).set(now).catch(() => {});
        }
      }
    }
  }
);

// Відправляє відкладені повідомлення про перенос уроку (дебаунс 1 хвилина)
exports.flushRescheduleQueue = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1" },
  async () => {
    const now = Date.now();
    const instructorsSnap = await db.ref("instructors").get();
    const instructors = instructorsSnap.val() || {};

    for (const [iid, inst] of Object.entries(instructors)) {
      const queueData = inst?.rescheduleQueue;
      if (!queueData) continue;

      const tasks = [];
      for (const [uid, userQueue] of Object.entries(queueData)) {
        for (const [bookingId, entry] of Object.entries(userQueue || {})) {
          if (entry && entry.sendAfter <= now) tasks.push({ uid, bookingId, body: entry.body });
        }
      }
      await Promise.all(tasks.map(async ({ uid, bookingId, body }) => {
        await pushStudent(iid, uid, "🔄 Урок перенесено", body, { url: "https://drivepad-client.web.app/cabinet/bookings" });
        await saveNotification(iid, uid, "🔄 Урок перенесено", body, "booking_rescheduled");
        await iRef(iid, `rescheduleQueue/${uid}/${bookingId}`).remove();
        console.log(`flushRescheduleQueue: sent to iid=${iid} uid=${uid} bookingId=${bookingId}`);
      }));
    }
  }
);

// Студент надіслав повідомлення → пуш адміну
exports.onStudentMessage = onValueCreated(
  { ref: "instructors/{iid}/chats/{uid}/{msgId}", region: "europe-west1" },
  async (event) => {
    const msg = event.data.val();
    if (!msg || msg.from !== "student") return;

    const { iid, uid } = event.params;
    // Загальний чат (uid="general") кладе ім'я прямо в повідомлення —
    // users/general/profile не існує, тож інакше завжди був би "Студент".
    let name = msg.name;
    if (!name) {
      const profileSnap = await iRef(iid, `users/${uid}/profile`).get();
      name = profileSnap.val()?.name || "Студент";
    }

    const text = msg.text || "";
    await pushAdmin(iid, `💬 ${name}`, text.length > 100 ? text.slice(0, 100) + "…" : text);
  }
);

// Щогодини: нагадування за 24 год і за 2 год до уроку
exports.sendLessonReminders = onSchedule(
  { schedule: "every 1 hours", region: "europe-west1" },
  async () => {
    const now = Date.now();
    const kyivHour = parseInt(
      new Date().toLocaleString("uk", { timeZone: "Europe/Kiev", hour: "2-digit", hour12: false }), 10
    );

    const instructorsSnap = await db.ref("instructors").get();
    const instructors = instructorsSnap.val() || {};

    for (const [iid, inst] of Object.entries(instructors)) {
      const allUids = new Set([
        ...Object.keys(inst?.activeStudents || {}),
        ...Object.keys(inst?.studentTokens || {}),
      ]);
      if (!allUids.size) continue;

      const sentData = inst?.sentReminders || {};
      const updates = {};

      for (const uid of allUids) {
        const bookingsObj = { ...(inst?.bookings?.[uid] || {}) };

        const rawPhone = (inst?.users?.[uid]?.profile?.phone || "").replace(/\D/g, "");
        if (rawPhone) {
          const phoneBookings = inst?.bookings_by_phone?.[rawPhone];
          if (phoneBookings) {
            Object.entries(phoneBookings).forEach(([id, b]) => {
              if (!bookingsObj[id]) bookingsObj[id] = b;
            });
          }
        }

        if (!Object.keys(bookingsObj).length) continue;

        for (const [bookingId, b] of Object.entries(bookingsObj)) {
          if (!b || b.status === "cancelled" || b.cancelledBy) continue;
          if (!b.date || !b.time) continue;

          const lessonMs = kyivLocalToMs(b.date, b.time);
          const diffMs = lessonMs - now;
          if (diffMs <= 0) continue;

          const sent = sentData[uid]?.[bookingId] || {};
          const dateFmt = new Date(b.date + "T00:00:00").toLocaleDateString("uk", {
            day: "numeric", month: "long", weekday: "short",
          });

          const reminderVars = { "ім'я": b.studentName || "Учень", "дата": dateFmt, "час": b.time };

          // 24г нагадування (вікно 23–25г, не в тихі години)
          if (!sent.r24 && !(kyivHour >= 23 || kyivHour < 6)
              && diffMs >= 23 * 3600000 && diffMs <= 25 * 3600000) {
            // Позначаємо "відправлено" лише якщо push реально дійшов — інакше
            // (немає токена/помилка) прапорець назавжди блокував би повторні
            // спроби на наступних годинних запусках.
            const usedTpl24 = await sendActiveTemplates(iid, uid, "auto_reminder", reminderVars, t => matchesReminderBucket(t, 24)).catch(() => false);
            if (usedTpl24) {
              updates[`sentReminders/${uid}/${bookingId}/r24`] = true;
            } else {
              const pushed = await pushStudent(iid, uid, "🚗 Нагадування про урок", `Завтра о ${b.time} — ${dateFmt}`, {
                url: "https://drivepad-client.web.app/cabinet/bookings",
              }).catch(() => false);
              if (pushed) {
                await saveNotification(iid, uid, "🚗 Нагадування про урок", `Завтра о ${b.time} — ${dateFmt}`, "reminder");
                updates[`sentReminders/${uid}/${bookingId}/r24`] = true;
              }
            }
          }

          // 2г нагадування (вікно 1.5–2.5г, завжди)
          if (!sent.r2 && diffMs >= 90 * 60000 && diffMs <= 150 * 60000) {
            const usedTpl2 = await sendActiveTemplates(iid, uid, "auto_reminder", reminderVars, t => matchesReminderBucket(t, 2)).catch(() => false);
            if (usedTpl2) {
              updates[`sentReminders/${uid}/${bookingId}/r2`] = true;
            } else {
              const pushed = await pushStudent(iid, uid, "⏰ Урок через 2 години", `о ${b.time} — ${dateFmt}`, {
                url: "https://drivepad-client.web.app/cabinet/bookings",
              }).catch(() => false);
              if (pushed) {
                await saveNotification(iid, uid, "⏰ Урок через 2 години", `о ${b.time} — ${dateFmt}`, "reminder");
                updates[`sentReminders/${uid}/${bookingId}/r2`] = true;
              }
            }
          }
        }
      }

      if (Object.keys(updates).length) await iRef(iid).update(updates).catch(() => {});
    }
  }
);

// Нагадування "з будильником" для особистих подій адміна (bookings/personal/*)
// з полем reminderHours. Раз на хвилину — при "За 15 хв"/"За 30 хв" вікно
// [0, reminderHours] само по собі не ширше за 15/30 хв, і перевірка раз на
// 15 хв (як було раніше) регулярно повністю проскакувала його між двома
// тіками, залежно від фази — нагадування мовчки не приходило.
exports.sendPersonalEventReminders = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1" },
  async () => {
    const now = Date.now();
    const instructorsSnap = await db.ref("instructors").get();
    const instructors = instructorsSnap.val() || {};

    for (const [iid, inst] of Object.entries(instructors)) {
      const personal = inst?.bookings?.personal;
      if (!personal) continue;

      const updates = {};
      for (const [id, ev] of Object.entries(personal)) {
        if (!ev || ev.status !== "personal" || ev.reminderSent || !ev.reminderHours) continue;
        if (!ev.date || !ev.time) continue;

        const startMs = kyivLocalToMs(ev.date, ev.time);
        const diffMs = startMs - now;
        if (diffMs <= 0) continue; // подія вже почалась

        const thresholdMs = ev.reminderHours * 3600000;
        if (diffMs <= thresholdMs) {
          const dateFmt = new Date(ev.date + "T00:00:00").toLocaleDateString("uk", {
            day: "numeric", month: "long", weekday: "short",
          });
          await pushAdmin(
            iid,
            `⏰ ${ev.name || "Нагадування"}`,
            `${dateFmt} о ${ev.time}${ev.note ? " · " + ev.note : ""}`,
            { url: `https://drivepad-admin.web.app/?date=${ev.date}`, alarm: "1" }
          );
          updates[`bookings/personal/${id}/reminderSent`] = true;
        }
      }

      if (Object.keys(updates).length) await iRef(iid).update(updates).catch(() => {});
    }
  }
);

// Ручна розсилка адміна → пуш УСІМ учням з увімкненими сповіщеннями
// (раніше — лише активним за останні 30 днів; обмеження прибрано за
// прямим запитом: розсилка про вільний слот має йти всім).
exports.onPushTask = onValueCreated(
  { ref: "instructors/{iid}/push_tasks/{taskId}", region: "europe-west1" },
  async (event) => {
    const task = event.data.val();
    if (!task || task.status === "sent") return;
    const { date, slots, comment } = task;
    const { iid, taskId } = event.params;

    const tokenSnap = await iRef(iid, "studentTokens").get();
    const tokened = tokenSnap.exists()
      ? Object.entries(tokenSnap.val()).flatMap(([uid, devices]) =>
          Object.values(devices || {}).filter(Boolean).map(token => ({ uid, token }))
        )
      : [];

    if (!tokened.length) {
      await iRef(iid, `push_tasks/${taskId}`).update({ status: "sent", sentCount: 0, sentAt: Date.now() });
      return;
    }

    const slotsArr = Array.isArray(slots) ? slots : Object.values(slots || {});
    const d = new Date(date + "T00:00:00");
    const dateFmt = d.toLocaleDateString("uk", { day: "numeric", month: "long", weekday: "short" });
    const slotsStr = slotsArr.filter(Boolean).join(" та ");
    const title = "🚗 Є вільний слот!";
    const body = `${dateFmt} о ${slotsStr}${comment ? " — " + comment : ""}`;
    const url = `https://drivepad-client.web.app/cabinet?date=${date}${slotsArr[0] ? `&time=${encodeURIComponent(slotsArr[0])}` : ""}`;

    let sentCount = 0;
    for (let i = 0; i < tokened.length; i += 500) {
      const batch = tokened.slice(i, i + 500);
      // Data-only push — title/body в data (клієнт читає payload.data),
      // без top-level/webpush "notification", інакше браузер показав би
      // сповіщення ще раз ДОДАТКОВО до showNotification() у SW (дубль).
      const res = await admin.messaging().sendEachForMulticast({
        tokens: batch.map(t => t.token),
        data: { title, body, url, date, time: slotsArr[0] || "" },
        webpush: { fcmOptions: { link: url } },
      }).catch(() => ({ successCount: 0 }));
      sentCount += res?.successCount || 0;
    }

    const notifiedUids = [...new Set(tokened.map(({ uid }) => uid))];
    await Promise.all(notifiedUids.map(uid => saveNotification(iid, uid, title, body, "slot_broadcast").catch(() => {})));
    await iRef(iid, `push_tasks/${taskId}`).update({ status: "sent", sentCount, sentAt: Date.now() });
  }
);
// Кожну хвилину: пуш-нагадування по нотатках дня з увімкненим дзвіночком (notify:true).
// Спрацьовує один раз, рівно в хвилину початку інтервалу (startMin), за київським часом.
exports.flushDayNoteReminders = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1" },
  async () => {
    const now = new Date();
    const kyivParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kiev", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const dateStr = `${kyivParts.year}-${kyivParts.month}-${kyivParts.day}`;
    const nowMin = parseInt(kyivParts.hour, 10) * 60 + parseInt(kyivParts.minute, 10);

    const instructorsSnap = await db.ref("instructors").get();
    const instructors = instructorsSnap.val() || {};

    for (const [iid, inst] of Object.entries(instructors)) {
      const notes = inst?.dayNotes?.[dateStr]?.notes;
      if (!notes) continue;

      for (const [key, note] of Object.entries(notes)) {
        if (!note.notify || note.notified) continue;
        // Толерантне вікно замість точної рівності хвилини — "every 1 minutes"
        // у Cloud Scheduler іноді спрацьовує із затримкою (холодний старт,
        // джиттер), і точна рівність могла "проскочити" цільову хвилину,
        // назавжди залишаючи нагадування невідправленим.
        if (nowMin < note.startMin || nowMin > note.startMin + 5) continue;
        console.log(`flushDayNoteReminders: iid=${iid} sending push for key=${key}`);
        const title = "🔔 Нагадування";
        const body = note.text || `Нотатка на ${dateStr}`;
        await pushAdmin(iid, title, body, { url: `https://drivepad-admin.web.app/?date=${dateStr}`, alarm: "1" });
        await iRef(iid, `dayNotes/${dateStr}/notes/${key}/notified`).set(true).catch(() => {});
      }
    }
  }
);

// Раз на добу: якщо триває пробний період/підписка і термін вийшов —
// призупиняємо доступ (license/status → suspended) і сповіщаємо вендора.
// Якщо вузла license нема — нічого не робимо (фіча вимкнена для цього інстансу).
exports.checkLicenseExpiry = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1" },
  async () => {
    const instructorsSnap = await db.ref("instructors").get();
    const instructors = instructorsSnap.val() || {};
    const now = Date.now();

    for (const [iid, inst] of Object.entries(instructors)) {
      const license = inst?.license;
      if (!license || license.status === "suspended") continue;

      const untilTs = license.status === "trial" ? license.trialEndsAt : license.expiresAt;
      if (!untilTs || now <= untilTs) continue;

      await iRef(iid, "license/status").set("suspended");
      await pushAdmin(
        iid,
        "⛔ Підписку призупинено",
        "Термін дії ліцензії вийшов — доступ для інструктора заблоковано.",
        { url: "https://drivepad-admin.web.app" }
      ).catch(() => {});
    }
  }
);

// ─── Оплата підписки: LiqPay + Monobank ───────────────────────────
// Обидва провайдери дають готовий hosted-чекаут з Apple Pay/Google Pay/карткою.
// LiqPay action:"subscribe" — справжнє автосписання щомісяця (вебхук сам
// продовжує ліцензію, без участі вендора). Monobank Acquiring — рахунок
// (invoice), не підписка: автосписання карткою Monobank Acquiring не дає,
// тому інструктору доведеться раз на місяць самому натиснути оплату —
// але вендору (нам) все одно нічого перемикати вручну, вебхук робить усе сам.

const LIQPAY_PUBLIC_KEY  = defineSecret("LIQPAY_PUBLIC_KEY");
const LIQPAY_PRIVATE_KEY = defineSecret("LIQPAY_PRIVATE_KEY");
const MONOBANK_TOKEN     = defineSecret("MONOBANK_TOKEN");

const MONTHLY_PRICE_UAH = 299;
const LICENSE_PERIOD_MS = 31 * 24 * 3600 * 1000; // трохи більше місяця — запас на затримку вебхука

// LiqPay: signature = base64( sha1_binary(private_key + data + private_key) )
function liqpaySign(privateKey, data) {
  return crypto.createHash("sha1").update(privateKey + data + privateKey, "utf8").digest("base64");
}

// Продовжує ліцензію конкретного інструктора на місяць від сьогодні, а якщо
// вона ще активна — від дати закінчення поточного періоду (щоб оплата
// заздалегідь не "згоряла").
// dedupeKey — унікальний ID саме цієї транзакції (LiqPay payment_id,
// Monobank invoiceId), а НЕ order_id/reference (той повторюється щомісяця
// для однієї підписки). Провайдери повторюють вебхук, якщо не отримали 200
// вчасно, тому без цієї перевірки один і той самий платіж продовжував би
// ліцензію по кілька разів. Транзакція на вузлі дедуплікації — щоб два
// майже одночасні повтори вебхука не проскочили обидва.
async function extendLicense(iid, provider, dedupeKey, extra = {}) {
  const now = Date.now();
  if (dedupeKey) {
    const dedupeRef = iRef(iid, `license/processedPayments/${dedupeKey}`);
    const result = await dedupeRef.transaction(current => current === null ? now : undefined);
    if (!result.committed) {
      console.log(`extendLicense: duplicate webhook, skipped (iid=${iid}, provider=${provider}, key=${dedupeKey})`);
      return;
    }
  }
  const snap = await iRef(iid, "license").get();
  const lic = snap.val() || {};
  const base = lic.status === "active" && lic.expiresAt > now ? lic.expiresAt : now;
  await iRef(iid, "license").update({
    status: "active",
    plan: "monthly",
    provider,
    expiresAt: base + LICENSE_PERIOD_MS,
    lastPaymentAt: now,
    ...extra,
  });
}

// order_id/reference провайдера несе iid інструктора, щоб вебхук (без
// Firebase Auth контексту) знав, кому продовжувати ліцензію. UID Firebase
// Auth ніколи не містить дефіс, тож розбір безпечний.
function buildPaymentRef(iid) {
  return `drivepad-${iid}-${Date.now()}`;
}
function parseIidFromPaymentRef(ref) {
  const m = /^drivepad-([^-]+)-\d+$/.exec(ref || "");
  return m ? m[1] : null;
}

// Створення LiqPay-замовлення на підписку. Викликається з фронту (кнопка
// оплати в Налаштуваннях), авторизований запит — Bearer ID-токен адміна.
exports.createLiqPayOrder = onRequest(
  { region: "europe-west1", secrets: [LIQPAY_PUBLIC_KEY, LIQPAY_PRIVATE_KEY], cors: true },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }
    try {
      const authHeader = req.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!idToken) { res.status(401).json({ error: "unauthorized" }); return; }
      const decoded = await admin.auth().verifyIdToken(idToken);
      const iid = decoded.uid;

      const publicKey  = LIQPAY_PUBLIC_KEY.value();
      const privateKey = LIQPAY_PRIVATE_KEY.value();
      const now = new Date();
      const pad = n => String(n).padStart(2, "0");
      const subscribeDateStart = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const payload = {
        version: 3,
        public_key: publicKey,
        action: "subscribe",
        amount: MONTHLY_PRICE_UAH,
        currency: "UAH",
        description: "DrivePad — місячна підписка",
        order_id: buildPaymentRef(iid),
        subscribe: 1,
        subscribe_date_start: subscribeDateStart,
        subscribe_periodicity: "month",
        server_url: "https://europe-west1-drivepad-86fe1.cloudfunctions.net/liqpayCallback",
        result_url: "https://drivepad-admin.web.app/",
        language: "uk",
      };
      const data = Buffer.from(JSON.stringify(payload)).toString("base64");
      const signature = liqpaySign(privateKey, data);
      res.json({ data, signature, action: "https://www.liqpay.ua/api/3/checkout" });
    } catch (e) {
      console.error("createLiqPayOrder error:", e);
      res.status(500).json({ error: "server error" });
    }
  }
);

// Серверний колбек LiqPay — приходить POST з полями data+signature напряму
// від LiqPay (без Firebase Auth, підпис — єдиний захист, тому перевіряємо
// його завжди перед тим, як довіряти вмісту).
exports.liqpayCallback = onRequest(
  { region: "europe-west1", secrets: [LIQPAY_PRIVATE_KEY] },
  async (req, res) => {
    try {
      const { data, signature } = req.body || {};
      if (!data || !signature) { res.status(400).send("bad request"); return; }
      const privateKey = LIQPAY_PRIVATE_KEY.value();
      const expected = liqpaySign(privateKey, data);
      if (expected !== signature) {
        console.error("liqpayCallback: invalid signature");
        res.status(400).send("invalid signature");
        return;
      }
      const payload = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
      console.log(`liqpayCallback: order=${payload.order_id} status=${payload.status}`);
      const iid = parseIidFromPaymentRef(payload.order_id);
      if (!iid) {
        console.error(`liqpayCallback: cannot parse iid from order_id=${payload.order_id}`);
        res.status(200).send("ok");
        return;
      }
      if (["subscribed", "success", "sandbox"].includes(payload.status)) {
        const dedupeKey = payload.payment_id != null ? String(payload.payment_id) : payload.order_id;
        await extendLicense(iid, "liqpay", dedupeKey, { liqpayOrderId: payload.order_id });
        await pushAdmin(iid, "✅ Оплата отримана (LiqPay)", "Підписку DrivePad продовжено на місяць.", {}).catch(() => {});
      } else {
        console.warn(`liqpayCallback: non-success status "${payload.status}" for order=${payload.order_id}`);
      }
      res.status(200).send("ok");
    } catch (e) {
      console.error("liqpayCallback error:", e);
      res.status(500).send("error");
    }
  }
);

const MONOBANK_API = "https://api.monobank.ua/api/merchant";
let cachedMonoPubKeyPem = null;

async function getMonobankPubKey(token) {
  if (cachedMonoPubKeyPem) return cachedMonoPubKeyPem;
  const resp = await fetch(`${MONOBANK_API}/pubkey`, { headers: { "X-Token": token } });
  const json = await resp.json();
  cachedMonoPubKeyPem = Buffer.from(json.key, "base64").toString("utf8");
  return cachedMonoPubKeyPem;
}

// Створення рахунку Monobank Acquiring (hosted-сторінка з Apple/Google Pay).
exports.createMonobankInvoice = onRequest(
  { region: "europe-west1", secrets: [MONOBANK_TOKEN], cors: true },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }
    try {
      const authHeader = req.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!idToken) { res.status(401).json({ error: "unauthorized" }); return; }
      const decoded = await admin.auth().verifyIdToken(idToken);
      const iid = decoded.uid;

      const token = MONOBANK_TOKEN.value();
      const resp = await fetch(`${MONOBANK_API}/invoice/create`, {
        method: "POST",
        headers: { "X-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: MONTHLY_PRICE_UAH * 100,
          ccy: 980,
          merchantPaymInfo: {
            reference: buildPaymentRef(iid),
            destination: "DrivePad — місячна підписка",
          },
          redirectUrl: "https://drivepad-admin.web.app/",
          webHookUrl: "https://europe-west1-drivepad-86fe1.cloudfunctions.net/monobankCallback",
          validity: 3600,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        console.error("createMonobankInvoice: monobank error", json);
        res.status(502).json({ error: "monobank error" });
        return;
      }
      res.json({ pageUrl: json.pageUrl, invoiceId: json.invoiceId });
    } catch (e) {
      console.error("createMonobankInvoice error:", e);
      res.status(500).json({ error: "server error" });
    }
  }
);

// Вебхук Monobank — підпис перевіряємо публічним ключем мерчанта (ECDSA
// P-256 над сирим тілом запиту). ВАЖЛИВО: формат X-Sign (base64 DER) звірено
// з відкритою документацією без прямого доступу до офіційних докс (мережевий
// проксі блокував api.monobank.ua) — перед першим реальним запуском
// обов'язково перевірити на тестовому вебхуку від Monobank.
exports.monobankCallback = onRequest(
  { region: "europe-west1", secrets: [MONOBANK_TOKEN] },
  async (req, res) => {
    try {
      const signatureB64 = req.get("X-Sign");
      const rawBody = req.rawBody;
      if (!signatureB64 || !rawBody) { res.status(400).send("bad request"); return; }

      const token = MONOBANK_TOKEN.value();
      const pubKeyPem = await getMonobankPubKey(token);
      const verifier = crypto.createVerify("SHA256");
      verifier.update(rawBody);
      const valid = verifier.verify(pubKeyPem, Buffer.from(signatureB64, "base64"));
      if (!valid) {
        console.error("monobankCallback: invalid signature");
        res.status(400).send("invalid signature");
        return;
      }

      const payload = req.body || {};
      console.log(`monobankCallback: invoice=${payload.invoiceId} status=${payload.status}`);
      const iid = parseIidFromPaymentRef(payload.merchantPaymInfo?.reference || payload.reference);
      if (!iid) {
        console.error(`monobankCallback: cannot parse iid from reference`);
        res.status(200).send("ok");
        return;
      }
      if (payload.status === "success") {
        await extendLicense(iid, "monobank", payload.invoiceId, { monobankInvoiceId: payload.invoiceId });
        await pushAdmin(iid, "✅ Оплата отримана (Monobank)", "Підписку DrivePad продовжено на місяць.", {}).catch(() => {});
      }
      res.status(200).send("ok");
    } catch (e) {
      console.error("monobankCallback error:", e);
      res.status(500).send("error");
    }
  }
);
