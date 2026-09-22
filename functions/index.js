const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
const {
  CALENDAR_SECRETS, getCalendarClient, buildEvent, getBookingSchedule, fromCalendarEvent, isIgnorableCalendarError,
} = require("./googleCalendar");

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

// Хелпер: зберегти сповіщення в RTDB для студента
async function saveNotification(uid, title, body, type = "system") {
  const ts = Date.now();
  const time = new Date(ts).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(ts).toLocaleDateString("uk", { day: "2-digit", month: "2-digit", year: "numeric" });
  await db.ref(`notifications/${uid}`).push({ title, body, type, ts, time, date }).catch(() => {});
}

// Хелпер: зібрати токени всіх пристроїв з вузла { deviceId: token, ... }
function collectDeviceTokens(devicesVal) {
  if (!devicesVal || typeof devicesVal !== "object") return [];
  return Object.entries(devicesVal).filter(([, t]) => !!t);
}

// Хелпер: відправити push студенту (на всі зареєстровані пристрої —
// студент міг заходити і з ПК, і з телефону, кожен пристрій має свій токен)
async function pushStudent(uid, title, body, data = {}) {
  const snap = await db.ref(`users/${uid}/fcmTokens`).get();
  const devices = collectDeviceTokens(snap.val());
  if (!devices.length) return false;
  const link = data.url || "https://id4drive.pro/cabinet";
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
        await db.ref(`users/${uid}/fcmTokens/${deviceId}`).remove().catch(() => {});
        await db.ref(`studentTokens/${uid}/${deviceId}`).remove().catch(() => {});
      }
    }
  }
  return sent;
}

// Хелпер: запросити наступного в черзі для слота.
// freedDurationHours — тривалість щойно скасованого уроку: якщо відома,
// саме на неї треба записати учня з черги, а не на його власний вибір при
// вступі в чергу (інакше 2-годинний урок звільняється, а бронюється лише 1 год).
async function inviteNextInQueue(slotKey, excludeUids = [], freedDurationHours = null) {
  const entriesSnap = await db.ref(`queue/${slotKey}/entries`).get();
  if (!entriesSnap.exists()) return;
  const entries = Object.entries(entriesSnap.val())
    .map(([uid, e]) => ({ uid, ...e }))
    .filter(e => e.status === "waiting" && !excludeUids.includes(e.uid))
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  if (!entries.length) return;
  const next = entries[0];
  const upd = { status: "offered" };
  if (freedDurationHours) upd.offerDurationHours = freedDurationHours;
  await db.ref(`queue/${slotKey}/entries/${next.uid}`).update(upd);
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
async function pushAdmin(title, body, data = {}) {
  const snap = await db.ref("admin/fcmTokens").get();
  const devices = collectDeviceTokens(snap.val());
  console.log(`pushAdmin: devices=${devices.length}, title="${title}"`);
  if (!devices.length) { console.warn("pushAdmin: no tokens at admin/fcmTokens"); return false; }
  const link = data.url || "https://admin.id4drive.pro";
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
        await db.ref(`admin/fcmTokens/${deviceId}`).remove().catch(() => {});
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
async function sendActiveTemplates(uid, triggerId, vars = {}, filterFn = null) {
  const snap = await db.ref("admin_data/templates").get();
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
    const chatSent = await db.ref(`chats/${uid}`).push({ from: "admin", text, time, ts })
      .then(() => true).catch(() => false);
    if (chatSent) {
      await db.ref(`chatMeta/${uid}`).update({
        unreadForStudent: admin.database.ServerValue.increment(1), lastMsg: text, lastTs: ts,
      }).catch(() => {});
    }
    const pushed = await pushStudent(uid, tpl.title || "Повідомлення", text, {}).catch(() => false);
    if (pushed) await saveNotification(uid, tpl.title || "Повідомлення", text, "template").catch(() => {});
    if (chatSent || pushed) delivered = true;
  }
  return delivered;
}

// Хелпер: для масових розсилок (auto_queue) — тільки текст першого активного
// шаблону, БЕЗ запису в чат (уникаємо спаму чату при broadcast на всіх учнів)
async function getActiveTemplateText(triggerId, vars = {}) {
  const snap = await db.ref("admin_data/templates").get();
  const list = snap.val();
  if (!Array.isArray(list)) return null;
  const tpl = list.find(t => t && t.trigger === triggerId && t.active && (t.body || "").trim());
  if (!tpl) return null;
  return { title: tpl.title || "Повідомлення", body: renderTemplateBody(tpl.body, vars) };
}

// Хелпер: заблокувати / звільнити timeslots для букінгу
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

// Всі зміни букінгу → push адміну або клієнту + синхронізація timeslots
exports.onBookingChanged = onValueWritten(
  { ref: "bookings/{uid}/{bookingId}", region: "europe-west1" },
  async (event) => {
    const before     = event.data.before.val();
    const after      = event.data.after.val();
    const uid        = event.params.uid;
    const bookingId  = event.params.bookingId;
    const name       = (after || before)?.studentName || "Учень";
    const date       = (after || before)?.date || "—";
    const time       = (after || before)?.time || "—";
    const adminLink  = () => buildAdminLink("https://admin.id4drive.pro", { date, time, uid, bookingId });

    // Новий запис (before = null) — блокуємо слоти
    if (before === null && after) {
      const slotUpd = buildSlotUpdates(after, false);
      if (Object.keys(slotUpd).length) await db.ref("/").update(slotUpd).catch(() => {});
      await db.ref(`activeStudents/${uid}`).set(true).catch(() => {});
      await db.ref(`recentStudents/${uid}`).set(Date.now()).catch(() => {});
      if (after.createdBy === "admin" && uid !== "admin") {
        // Адмін вручну записав учня — сповіщаємо учня
        console.log(`onBookingChanged: admin manual booking uid=${uid}`);
        await pushStudent(uid, "📋 Урок заплановано", `${date} о ${time}`, {
          url: "https://id4drive.pro/cabinet/bookings",
        });
        await saveNotification(uid, "📋 Урок заплановано", `${date} о ${time}`, "booking_confirmed");
      } else if (after.createdBy !== "admin" && after.status !== "personal") {
        // Учень записався сам — сповіщаємо адміна
        // (особисті події адміна не мають генерувати цей пуш — у них є власне
        // нагадування-будильник через sendPersonalEventReminders)
        console.log(`onBookingChanged: new booking uid=${uid}`);
        await pushAdmin("📋 Новий запис", `${name} · ${date} о ${time}`, { url: adminLink() });
      }
      return;
    }

    if (!before || !after) return;

    // Учень скасував — звільняємо слоти
    if (after.cancelledBy === "student" && before.cancelledBy !== "student") {
      console.log(`onBookingChanged: student cancel uid=${uid}`);
      const slotUpd = buildSlotUpdates(before, true);
      if (Object.keys(slotUpd).length) await db.ref("/").update(slotUpd).catch(() => {});
      await pushAdmin("❌ Урок скасовано", `${name} · ${date} о ${time}`, { url: adminLink() });
      if (date !== "—" && time !== "—") {
        const freedDurationHours = before.durationHours || (before.durMin ? before.durMin / 60 : 1);
        await inviteNextInQueue(`${date}_${time}`, [], freedDurationHours).catch(() => {});
      }
      return;
    }

    // Адмін підтвердив
    if (after.status === "confirmed" && before.status !== "confirmed") {
      console.log(`onBookingChanged: admin confirmed uid=${uid}`);
      const vars = { "ім'я": name, "дата": date, "час": time, "послуга": after.serviceName || after.service || "", "ціна": after.price != null ? String(after.price) : "" };
      const usedTpl = await sendActiveTemplates(uid, "auto_confirm", vars).catch(() => false);
      if (!usedTpl) {
        await pushStudent(uid, "✅ Урок підтверджено", `${date} о ${time}`, {
          url: "https://id4drive.pro/cabinet/bookings",
        });
        await saveNotification(uid, "✅ Урок підтверджено", `${date} о ${time}`, "booking_confirmed");
      }
      return;
    }

    // Адмін скасував — звільняємо слоти
    if (after.status === "cancelled" && before.status !== "cancelled" && after.cancelledBy === "admin") {
      console.log(`onBookingChanged: admin cancelled uid=${uid}`);
      const slotUpd = buildSlotUpdates(before, true);
      if (Object.keys(slotUpd).length) await db.ref("/").update(slotUpd).catch(() => {});
      const cancelVars = { "ім'я": name, "дата": date, "час": time };
      const usedCancelTpl = await sendActiveTemplates(uid, "auto_cancel", cancelVars).catch(() => false);
      if (!usedCancelTpl) {
        await pushStudent(uid, "❌ Урок скасовано", `${date} о ${time}`, {
          url: "https://id4drive.pro/cabinet/bookings",
        });
        await saveNotification(uid, "❌ Урок скасовано", `${date} о ${time}`, "booking_cancelled");
      }
      if (date !== "—" && time !== "—") {
        const freedDurationHours = before.durationHours || (before.durMin ? before.durMin / 60 : 1);
        await inviteNextInQueue(`${date}_${time}`, [], freedDurationHours).catch(() => {});
      }
      return;
    }

    // Студент підтвердив присутність
    if (after.studentConfirmed && !before.studentConfirmed) {
      console.log(`onBookingChanged: student confirmed uid=${uid}`);
      await pushAdmin("✅ Підтвердив присутність", `${name} · ${date} о ${time}`, { url: adminLink() });
      return;
    }

    // Перенесено — тільки блокуємо нове місце (старе залишається blocked до ручної генерації)
    const rescheduled = after.status !== "cancelled" &&
      (after.date !== before.date || after.time !== before.time);
    if (rescheduled) {
      const blockUpd = buildSlotUpdates(after, false);
      if (Object.keys(blockUpd).length) await db.ref("/").update(blockUpd).catch(() => {});
      const oldDate = before.date || "—";
      const oldTime = before.time || "—";
      const body = `Новий час: ${date} о ${time} (було ${oldDate} о ${oldTime})`;
      console.log(`onBookingChanged: rescheduled uid=${uid} bookingId=${bookingId} — queuing notif`);
      await db.ref(`rescheduleQueue/${uid}/${bookingId}`).set({
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
async function mergeInvitedStudentRecord(uid, profile) {
  try {
    let oldKey = null;
    const token = profile?.inviteToken;
    if (token) {
      const invite = (await db.ref(`invites/${token}`).get()).val();
      if (invite?.studentKey) oldKey = invite.studentKey;
    }
    if (!oldKey) {
      const phone = normPhone(profile?.phone);
      if (phone) {
        const usersVal = (await db.ref("users").get()).val() || {};
        const matches = Object.entries(usersVal).filter(([key, u]) =>
          key !== uid && !u.profile && normPhone(u.phone) === phone
        );
        if (matches.length === 1) oldKey = matches[0][0];
      }
    }
    if (token) await db.ref(`invites/${token}`).remove().catch(() => {});
    if (!oldKey || oldKey === uid) return;

    const old = (await db.ref(`users/${oldKey}`).get()).val();
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
    await db.ref().update(patch);
    console.log(`mergeInvitedStudentRecord: merged ${oldKey} -> ${uid}`);
  } catch (e) {
    console.error("mergeInvitedStudentRecord failed:", e);
  }
}

// Новий учень зареєструвався (заповнив анкету) — сповіщаємо адміна
exports.onNewStudentRegistered = onValueCreated(
  { ref: "users/{uid}/profile", region: "europe-west1" },
  async (event) => {
    const profile = event.data.val();
    const { uid } = event.params;
    await mergeInvitedStudentRecord(uid, profile);
    const name  = profile?.name  || "Новий учень";
    const phone = profile?.phone || "";
    console.log(`onNewStudentRegistered: uid=${uid} name="${name}"`);
    await pushAdmin("🎉 Новий учень", phone ? `${name} · ${phone}` : name, {
      url: buildAdminLink("https://admin.id4drive.pro", { uid }),
    });
    await sendActiveTemplates(uid, "auto_welcome", { "ім'я": name }).catch(() => {});
  }
);

// Кнопка "Запросити": записує offeredTo/{uid} і пушить студента
exports.onQueueInvite = onValueUpdated(
  { ref: "queue/{slotKey}/entries/{uid}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before.val();
    const after  = event.data.after.val();
    if (!after || after.status !== "offered" || before?.status === "offered") return;

    const uid     = event.params.uid;
    const slotKey = event.params.slotKey; // "2026-06-10_09:00"
    const sep = slotKey.lastIndexOf("_");
    const date = slotKey.slice(0, sep);
    const time = slotKey.slice(sep + 1);
    if (!date || !time) return;
    const slotId = `slot${time.replace(":", "")}`;

    // Додаємо uid до offeredTo зі строком дії (перший → теж залишається)
    const until = Date.now() + OFFER_WINDOW_MS;
    await db.ref(`timeslots/${date}/${slotId}/offeredTo/${uid}`).set({ until }).catch(() => {});

    // In-app сповіщення: клієнт підписаний на цей шлях. Якщо запрошення
    // прийшло від скасування конкретного уроку — offerDurationHours несе
    // його тривалість, щоб бронювання з черги зайняло стільки ж часу.
    await db.ref(`users/${uid}/queueOffers/${slotKey}`).set({
      date, time, until, slotKey,
      ...(after.offerDurationHours ? { durationHours: after.offerDurationHours } : {}),
    }).catch(() => {});

    const url = `https://id4drive.pro/cabinet?date=${date}&time=${encodeURIComponent(time)}`;
    const pushTitle = "🎉 Слот зарезервовано для вас!";
    const pushBody = `${date} о ${time} — у вас 30 хвилин щоб записатись`;
    await pushStudent(uid, pushTitle, pushBody, { url, date, time, slotKey });
    await saveNotification(uid, pushTitle, pushBody, "queue_offer");
  }
);


// Кожні 10 хв: для кожного спроченого offeredTo → запрошує наступного
// (першому резерв залишається — він може й надалі записатися)
exports.cascadeQueueInvites = onSchedule({ schedule: "every 10 minutes", region: "europe-west1" }, async () => {
  const now = Date.now();
  const slotsSnap = await db.ref("timeslots").get();
  const data = slotsSnap.val() || {};

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
      const alreadyOfferedSnap = await db.ref(`queue/${slotKey}/entries`).get();
      const alreadyOffered = alreadyOfferedSnap.exists()
        ? Object.entries(alreadyOfferedSnap.val())
            .filter(([, e]) => e.status === "offered" || e.status === "booked")
            .map(([uid]) => uid)
        : [];

      // Запрошуємо наступного (першому резерв НЕ видаляємо)
      await inviteNextInQueue(slotKey, alreadyOffered);
    }
  }
});

// Адмін відкрив заблокований слот → запрошуємо першого в черзі
exports.onAdminSlotOpened = onValueWritten(
  { ref: "timeslots/{date}/{slotId}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before?.val();
    const after  = event.data.after?.val();
    if (!before || !after) return;
    // Тригер тільки: adminBlocked true → false, available → true
    if (before.adminBlocked !== true) return;
    if (after.adminBlocked !== false || after.available !== true) return;

    const { date, slotId } = event.params;
    let time = after.time;
    if (!time) {
      const m = slotId.match(/^slot(\d{2})(\d{2})$/);
      if (!m) return;
      time = `${m[1]}:${m[2]}`;
    }

    const slotKey = `${date}_${time}`;
    const qSnap = await db.ref(`queue/${slotKey}/entries`).get();
    if (!qSnap.exists()) return;

    const entries = Object.entries(qSnap.val())
      .map(([uid, e]) => ({ uid, ...e }))
      .filter(e => e.status === "waiting")
      .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

    if (!entries.length) return;
    // Ставимо першого як "offered" → onQueueInvite відправить push і зарезервує слот
    await db.ref(`queue/${slotKey}/entries/${entries[0].uid}`).update({ status: "offered" });
  }
);

// Runs every hour — unlocks VIP slots within 48h and sends push to all non-VIP students
exports.unlockVipSlots = onSchedule("every 1 hours", async () => {
  const now = Date.now();
  const threshold = now + 48 * 60 * 60 * 1000;

  const slotsSnap = await db.ref("timeslots").get();
  const slotsData = slotsSnap.val() || {};
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

  if (!unlocked) return;
  await db.ref().update(updates);

  const tokenSnap = await db.ref("studentTokens").get();
  const tokens = Object.values(tokenSnap.val() || {})
    .flatMap(devices => Object.values(devices || {}))
    .filter(Boolean);
  if (!tokens.length) return;

  for (let i = 0; i < tokens.length; i += 500) {
    // Data-only push (title/body в data) — див. onPushTask/SW щодо дублів.
    await admin.messaging().sendEachForMulticast({
      tokens: tokens.slice(i, i + 500),
      data: {
        title: "🚗 З'явились нові слоти!",
        body: "Відкрились нові години для запису. Поспішай!",
        url: "https://id4drive.pro/cabinet",
      },
      webpush: {
        fcmOptions: { link: "https://id4drive.pro/cabinet" },
      },
    }).catch(() => {});
  }
});

// Слот у найближчі 10 днів звільнився → ставимо в чергу, пуш через 5 хв
exports.onSlotFreed = onValueWritten(
  { ref: "timeslots/{date}/{slotId}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before?.val();
    const after  = event.data.after?.val();

    // Перехід до available: true (звільнився або з'явився новий слот)
    if (before?.available === true) return; // вже був вільний — не дублюємо
    if (!after || after.available !== true) return;

    const enabledSnap = await db.ref("admin_settings/slotFreedPushEnabled").get();
    if (enabledSnap.exists() && enabledSnap.val() === false) return;

    const { date, slotId } = event.params;

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
    await db.ref(`slotFreedQueue/${slotKey}`).set({
      date, time, sendAfter: Date.now() + 5 * 60 * 1000,
    }).catch(() => {});

    // Якщо в цьому слоті був phone-only запис — скасовуємо його
    const slotBookingSnap = await db.ref(`slotBookings/${date}/${slotId}`).get();
    if (slotBookingSnap.exists()) {
      const { phone, bookingId } = slotBookingSnap.val();
      if (phone && bookingId) {
        await db.ref(`bookings_by_phone/${phone}/${bookingId}`).update({
          status: "cancelled", cancelledAt: Date.now(), cancelledBy: "admin"
        }).catch(() => {});
        await db.ref(`slotBookings/${date}/${slotId}`).remove().catch(() => {});
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

    const snap = await db.ref("slotFreedQueue").get();
    if (!snap.exists()) return;
    const now = Date.now();

    const tasks = [];
    snap.forEach(entry => {
      const val = entry.val();
      if (val && val.sendAfter <= now) tasks.push({ key: entry.key, ...val });
    });
    if (!tasks.length) return;

    // Всі студенти з увімкненими push-сповіщеннями
    const tokenSnap = await db.ref("studentTokens").get();
    const notifyUids = tokenSnap.exists() ? Object.keys(tokenSnap.val()) : [];
    if (!notifyUids.length) return;

    // Rate-limit: не слати одному студенту частіше ніж раз на 30 хвилин
    const lastNotifSnap = await db.ref("lastSlotNotif").get();
    const lastNotifData = lastNotifSnap.val() || {};
    const RATE_LIMIT_MS = 30 * 60 * 1000;

    for (const { key, date, time } of tasks) {
      await db.ref(`slotFreedQueue/${key}`).remove().catch(() => {});

      // Перевіряємо що слот ще вільний
      const slotId = `slot${time.replace(":", "")}`;
      const slotSnap = await db.ref(`timeslots/${date}/${slotId}`).get();
      const slot = slotSnap.val();
      if (!slot || slot.available !== true) continue;

      const slotDate = new Date(date + "T00:00:00");
      const dateFormatted = slotDate.toLocaleDateString("uk", { day: "numeric", month: "long", weekday: "short" });
      // Broadcast на всіх учнів — беремо текст першого активного шаблону
      // auto_queue (без запису в чат, щоб не заспамити чат усіх учнів)
      const tpl = await getActiveTemplateText("auto_queue", { "дата": dateFormatted, "час": time }).catch(() => null);
      const title = tpl?.title || "🚗 Звільнився слот!";
      const body  = tpl?.body  || `${dateFormatted} о ${time} — є вільне місце`;
      const url   = `https://id4drive.pro/cabinet?date=${date}`;

      for (const uid of notifyUids) {
        if (lastNotifData[uid] && now - lastNotifData[uid] < RATE_LIMIT_MS) continue;
        const sent = await pushStudent(uid, title, body, { url, date, time }).catch(() => false);
        if (!sent) continue; // токен мертвий/не знайдено — не займаємо rate-limit слот даремно
        await saveNotification(uid, title, body, "slot_freed").catch(() => {});
        lastNotifData[uid] = now; // локально щоб не спамити кілька слотів за один запуск
        await db.ref(`lastSlotNotif/${uid}`).set(now).catch(() => {});
      }
    }
  }
);

// Відправляє відкладені повідомлення про перенос уроку (дебаунс 1 хвилина)
exports.flushRescheduleQueue = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1" },
  async () => {
    const snap = await db.ref("rescheduleQueue").get();
    if (!snap.exists()) return;
    const now = Date.now();
    const tasks = [];
    snap.forEach(userSnap => {
      const uid = userSnap.key;
      userSnap.forEach(bookingSnap => {
        const entry = bookingSnap.val();
        if (entry && entry.sendAfter <= now) {
          tasks.push({ uid, bookingId: bookingSnap.key, body: entry.body });
        }
      });
    });
    await Promise.all(tasks.map(async ({ uid, bookingId, body }) => {
      await pushStudent(uid, "🔄 Урок перенесено", body, { url: "https://id4drive.pro/cabinet/bookings" });
      await saveNotification(uid, "🔄 Урок перенесено", body, "booking_rescheduled");
      await db.ref(`rescheduleQueue/${uid}/${bookingId}`).remove();
      console.log(`flushRescheduleQueue: sent to uid=${uid} bookingId=${bookingId}`);
    }));
  }
);

// Студент надіслав повідомлення → пуш адміну
exports.onStudentMessage = onValueCreated(
  { ref: "chats/{uid}/{msgId}", region: "europe-west1" },
  async (event) => {
    const msg = event.data.val();
    if (!msg || msg.from !== "student") return;

    const { uid } = event.params;
    // Загальний чат (uid="general") кладе ім'я прямо в повідомлення —
    // users/general/profile не існує, тож інакше завжди був би "Студент".
    let name = msg.name;
    if (!name) {
      const profileSnap = await db.ref(`users/${uid}/profile`).get();
      name = profileSnap.val()?.name || "Студент";
    }

    const text = msg.text || "";
    await pushAdmin(`💬 ${name}`, text.length > 100 ? text.slice(0, 100) + "…" : text);
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

    const [activeSnap, tokenSnap] = await Promise.all([
      db.ref("activeStudents").get(),
      db.ref("studentTokens").get(),
    ]);
    const allUids = new Set([
      ...(activeSnap.exists() ? Object.keys(activeSnap.val()) : []),
      ...(tokenSnap.exists() ? Object.keys(tokenSnap.val()) : []),
    ]);
    if (!allUids.size) return;

    const sentSnap = await db.ref("sentReminders").get();
    const sentData = sentSnap.val() || {};
    const updates = {};

    for (const uid of allUids) {
      const [bSnap, profilePhoneSnap] = await Promise.all([
        db.ref(`bookings/${uid}`).get(),
        db.ref(`users/${uid}/profile/phone`).get(),
      ]);

      const bookingsObj = bSnap.exists() ? { ...bSnap.val() } : {};

      const rawPhone = (profilePhoneSnap.val() || "").replace(/\D/g, "");
      if (rawPhone) {
        const phoneBookingsSnap = await db.ref(`bookings_by_phone/${rawPhone}`).get();
        if (phoneBookingsSnap.exists()) {
          Object.entries(phoneBookingsSnap.val()).forEach(([id, b]) => {
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
          const usedTpl24 = await sendActiveTemplates(uid, "auto_reminder", reminderVars, t => matchesReminderBucket(t, 24)).catch(() => false);
          if (usedTpl24) {
            updates[`sentReminders/${uid}/${bookingId}/r24`] = true;
          } else {
            const pushed = await pushStudent(uid, "🚗 Нагадування про урок", `Завтра о ${b.time} — ${dateFmt}`, {
              url: "https://id4drive.pro/cabinet/bookings",
            }).catch(() => false);
            if (pushed) {
              await saveNotification(uid, "🚗 Нагадування про урок", `Завтра о ${b.time} — ${dateFmt}`, "reminder");
              updates[`sentReminders/${uid}/${bookingId}/r24`] = true;
            }
          }
        }

        // 2г нагадування (вікно 1.5–2.5г, завжди)
        if (!sent.r2 && diffMs >= 90 * 60000 && diffMs <= 150 * 60000) {
          const usedTpl2 = await sendActiveTemplates(uid, "auto_reminder", reminderVars, t => matchesReminderBucket(t, 2)).catch(() => false);
          if (usedTpl2) {
            updates[`sentReminders/${uid}/${bookingId}/r2`] = true;
          } else {
            const pushed = await pushStudent(uid, "⏰ Урок через 2 години", `о ${b.time} — ${dateFmt}`, {
              url: "https://id4drive.pro/cabinet/bookings",
            }).catch(() => false);
            if (pushed) {
              await saveNotification(uid, "⏰ Урок через 2 години", `о ${b.time} — ${dateFmt}`, "reminder");
              updates[`sentReminders/${uid}/${bookingId}/r2`] = true;
            }
          }
        }
      }
    }

    if (Object.keys(updates).length) await db.ref("/").update(updates).catch(() => {});
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
    const snap = await db.ref("bookings/personal").get();
    if (!snap.exists()) return;

    const updates = {};
    for (const [id, ev] of Object.entries(snap.val())) {
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
          `⏰ ${ev.name || "Нагадування"}`,
          `${dateFmt} о ${ev.time}${ev.note ? " · " + ev.note : ""}`,
          { url: `https://admin.id4drive.pro/?date=${ev.date}`, alarm: "1" }
        );
        updates[`bookings/personal/${id}/reminderSent`] = true;
      }
    }

    if (Object.keys(updates).length) await db.ref("/").update(updates).catch(() => {});
  }
);

// Ручна розсилка адміна → пуш УСІМ учням з увімкненими сповіщеннями
// (раніше — лише активним за останні 30 днів; обмеження прибрано за
// прямим запитом: розсилка про вільний слот має йти всім).
exports.onPushTask = onValueCreated(
  { ref: "push_tasks/{taskId}", region: "europe-west1" },
  async (event) => {
    const task = event.data.val();
    if (!task || task.status === "sent") return;
    const { date, slots, comment } = task;
    const taskId = event.params.taskId;

    const tokenSnap = await db.ref("studentTokens").get();
    const tokened = tokenSnap.exists()
      ? Object.entries(tokenSnap.val()).flatMap(([uid, devices]) =>
          Object.values(devices || {}).filter(Boolean).map(token => ({ uid, token }))
        )
      : [];

    if (!tokened.length) {
      await db.ref(`push_tasks/${taskId}`).update({ status: "sent", sentCount: 0, sentAt: Date.now() });
      return;
    }

    const slotsArr = Array.isArray(slots) ? slots : Object.values(slots || {});
    const d = new Date(date + "T00:00:00");
    const dateFmt = d.toLocaleDateString("uk", { day: "numeric", month: "long", weekday: "short" });
    const slotsStr = slotsArr.filter(Boolean).join(" та ");
    const title = "🚗 Є вільний слот!";
    const body = `${dateFmt} о ${slotsStr}${comment ? " — " + comment : ""}`;
    const url = `https://id4drive.pro/cabinet?date=${date}${slotsArr[0] ? `&time=${encodeURIComponent(slotsArr[0])}` : ""}`;

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
    await Promise.all(notifiedUids.map(uid => saveNotification(uid, title, body, "slot_broadcast").catch(() => {})));
    await db.ref(`push_tasks/${taskId}`).update({ status: "sent", sentCount, sentAt: Date.now() });
  }
);

// ─── Google Calendar sync (MVP, тільки особистий календар інструктора) ───

const CALENDAR_SYNC_FIELDS = ["googleEventId", "calendarId", "lastSyncedByApp"];
const ECHO_WINDOW_MS = 3 * 60 * 1000;

function isRecentEcho(ts) {
  return !!ts && Date.now() - ts < ECHO_WINDOW_MS;
}

// Якщо різниця before/after — тільки в полях, які пише сам sync (наше ж відлуння)
function onlyCalendarFieldsChanged(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (CALENDAR_SYNC_FIELDS.includes(key)) continue;
    if ((before || {})[key] !== (after || {})[key]) return false;
  }
  return true;
}

// Перевіряє чи діапазон [startMin, startMin+durMin) на дату date вільний
// від інших активних бронювань і адмін-блокувань (для переносу з календаря)
async function isRangeFreeForBooking(date, startMin, durMin, excludeUid, excludeBookingId) {
  const endMin = startMin + durMin;

  const bookingsSnap = await db.ref("bookings").get();
  const bookingsData = bookingsSnap.val() || {};
  for (const [uid, userBookings] of Object.entries(bookingsData)) {
    if (!userBookings || typeof userBookings !== "object") continue;
    for (const [bookingId, b] of Object.entries(userBookings)) {
      if (uid === excludeUid && bookingId === excludeBookingId) continue;
      if (!b || b.status === "cancelled" || b.date !== date) continue;
      const sched = getBookingSchedule(b);
      if (!sched) continue;
      const bEnd = sched.startMin + sched.durMin;
      if (startMin < bEnd && sched.startMin < endMin) return false;
    }
  }

  const slotsSnap = await db.ref(`timeslots/${date}`).get();
  const slotsData = slotsSnap.val() || {};
  for (let cur = startMin; cur < endMin; cur += 30) {
    const hh = String(Math.floor(cur / 60)).padStart(2, "0");
    const mm = String(cur % 60).padStart(2, "0");
    if (slotsData[`slot${hh}${mm}`]?.adminBlocked === true) return false;
  }

  return true;
}

// Брoнь створена/перенесена/скасована/видалена → відображаємо в Google Calendar
exports.onBookingSyncToCalendar = onValueWritten(
  { ref: "bookings/{uid}/{bookingId}", region: "europe-west1", secrets: CALENDAR_SECRETS },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const { uid, bookingId } = event.params;

    if (before && after) {
      const justSyncedFromCalendar =
        after.lastSyncedFromCalendar &&
        after.lastSyncedFromCalendar !== before.lastSyncedFromCalendar &&
        isRecentEcho(after.lastSyncedFromCalendar);
      if (onlyCalendarFieldsChanged(before, after) || justSyncedFromCalendar) return;
    }

    let calendar;
    try {
      calendar = getCalendarClient();
    } catch (e) {
      console.error(`onBookingSyncToCalendar: client init failed uid=${uid} bookingId=${bookingId}: ${e.message}`);
      return;
    }

    try {
      // Запис видалено повністю
      if (!after) {
        if (before?.googleEventId) {
          await calendar.events
            .delete({ calendarId: before.calendarId || "primary", eventId: before.googleEventId })
            .catch((err) => { if (!isIgnorableCalendarError(err)) throw err; });
        }
        return;
      }

      // Скасовано (студентом чи адміном) — прибираємо event з календаря
      if (after.status === "cancelled") {
        if (after.googleEventId) {
          await calendar.events
            .delete({ calendarId: after.calendarId || "primary", eventId: after.googleEventId })
            .catch((err) => { if (!isIgnorableCalendarError(err)) throw err; });
          await event.data.after.ref.update({ lastSyncedByApp: Date.now() });
        }
        return;
      }

      // Новий активний запис — створюємо event
      if (!before) {
        const eventBody = buildEvent(after, bookingId, uid);
        if (!eventBody) return;
        const res = await calendar.events.insert({ calendarId: "primary", requestBody: eventBody });
        await event.data.after.ref.update({
          googleEventId: res.data.id,
          calendarId: "primary",
          lastSyncedByApp: Date.now(),
        });
        return;
      }

      // Перенесено дату/час/тривалість — оновлюємо event
      const rescheduled =
        after.date !== before.date ||
        after.time !== before.time ||
        after.durationHours !== before.durationHours ||
        after.durMin !== before.durMin ||
        after.startMin !== before.startMin;
      if (!rescheduled) return;

      const eventBody = buildEvent(after, bookingId, uid);
      if (!eventBody) return;

      if (after.googleEventId) {
        await calendar.events.patch({
          calendarId: after.calendarId || "primary",
          eventId: after.googleEventId,
          requestBody: eventBody,
        });
        await event.data.after.ref.update({ lastSyncedByApp: Date.now() });
      } else {
        const res = await calendar.events.insert({ calendarId: "primary", requestBody: eventBody });
        await event.data.after.ref.update({
          googleEventId: res.data.id,
          calendarId: "primary",
          lastSyncedByApp: Date.now(),
        });
      }
    } catch (e) {
      console.error(`onBookingSyncToCalendar error uid=${uid} bookingId=${bookingId}: ${e.message}`);
    }
  }
);

// Кожні 10 хв: підтягуємо з Google Calendar скасування, зроблені вручну в календарі
exports.syncCalendarToApp = onSchedule(
  { schedule: "every 10 minutes", region: "europe-west1", secrets: CALENDAR_SECRETS },
  async () => {
    let calendar;
    try {
      calendar = getCalendarClient();
    } catch (e) {
      console.error(`syncCalendarToApp: client init failed: ${e.message}`);
      return;
    }

    const tokenSnap = await db.ref("calendarSync/nextSyncToken").get();
    const syncToken = tokenSnap.val();

    const events = [];
    let pageToken;
    let newSyncToken = null;

    try {
      do {
        const params = { calendarId: "primary", maxResults: 250, pageToken };
        if (syncToken) params.syncToken = syncToken;
        else params.timeMin = new Date().toISOString();
        const res = await calendar.events.list(params);
        events.push(...(res.data.items || []));
        pageToken = res.data.nextPageToken;
        if (res.data.nextSyncToken) newSyncToken = res.data.nextSyncToken;
      } while (pageToken);
    } catch (e) {
      const status = e?.code ?? e?.response?.status;
      if (status === 410) {
        console.warn("syncCalendarToApp: syncToken expired (410) — reset for full resync");
        await db.ref("calendarSync/nextSyncToken").remove();
        return;
      }
      console.error(`syncCalendarToApp: events.list failed: ${e.message}`);
      return;
    }

    for (const ev of events) {
      const priv = ev.extendedProperties?.private;
      if (!priv || priv.appSource !== "id4drive" || !priv.bookingId || !priv.uid) continue;

      const bookingRef = db.ref(`bookings/${priv.uid}/${priv.bookingId}`);
      const bookingSnap = await bookingRef.get();
      const booking = bookingSnap.val();
      if (!booking || booking.status === "cancelled") continue;

      if (ev.status === "cancelled") {
        // Наше ж недавнє видалення через onBookingSyncToCalendar — ігноруємо
        if (isRecentEcho(booking.lastSyncedByApp)) continue;

        await bookingRef.update({ status: "cancelled", cancelledBy: "admin" }).catch(() => {});
        console.log(`syncCalendarToApp: cancelled booking ${priv.bookingId} uid=${priv.uid} (deleted in Google Calendar)`);
        continue;
      }

      // Активна подія — перевіряємо чи не перенесена вручну в календарі
      if (isRecentEcho(booking.lastSyncedByApp) || isRecentEcho(booking.lastSyncedFromCalendar)) continue;

      const calSchedule = fromCalendarEvent(ev);
      if (!calSchedule) continue; // all-day подія — не наш формат, ігноруємо

      const appSchedule = getBookingSchedule(booking);
      if (!appSchedule) continue;

      const changed = calSchedule.date !== appSchedule.date ||
        calSchedule.startMin !== appSchedule.startMin ||
        calSchedule.durMin !== appSchedule.durMin;
      if (!changed) continue;

      const free = await isRangeFreeForBooking(
        calSchedule.date, calSchedule.startMin, calSchedule.durMin, priv.uid, priv.bookingId
      );
      if (!free) {
        console.warn(
          `syncCalendarToApp: reschedule from calendar bookingId=${priv.bookingId} uid=${priv.uid} → ` +
          `${calSchedule.date} ${calSchedule.time} conflicts with existing slot, skipped`
        );
        continue;
      }

      await bookingRef.update({
        date: calSchedule.date,
        time: calSchedule.time,
        durMin: calSchedule.durMin,
        startMin: null,
        durationHours: null,
        lastSyncedFromCalendar: Date.now(),
      }).catch(() => {});
      console.log(
        `syncCalendarToApp: rescheduled booking ${priv.bookingId} uid=${priv.uid} → ` +
        `${calSchedule.date} ${calSchedule.time} (moved in Google Calendar)`
      );
    }

    if (newSyncToken) {
      await db.ref("calendarSync/nextSyncToken").set(newSyncToken);
    }
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

    const snap = await db.ref(`dayNotes/${dateStr}/notes`).get();
    console.log(`flushDayNoteReminders: dateStr=${dateStr} nowMin=${nowMin} notesExist=${snap.exists()}`);
    if (!snap.exists()) return;
    const notes = snap.val();

    for (const [key, note] of Object.entries(notes)) {
      console.log(`flushDayNoteReminders: note key=${key} startMin=${note.startMin} notify=${!!note.notify} notified=${!!note.notified}`);
      if (!note.notify || note.notified) continue;
      // Толерантне вікно замість точної рівності хвилини — "every 1 minutes"
      // у Cloud Scheduler іноді спрацьовує із затримкою (холодний старт,
      // джиттер), і точна рівність могла "проскочити" цільову хвилину,
      // назавжди залишаючи нагадування невідправленим.
      if (nowMin < note.startMin || nowMin > note.startMin + 5) continue;
      console.log(`flushDayNoteReminders: sending push for key=${key}`);
      const title = "🔔 Нагадування";
      const body = note.text || `Нотатка на ${dateStr}`;
      await pushAdmin(title, body, { url: `https://admin.id4drive.pro/?date=${dateStr}`, alarm: "1" });
      await db.ref(`dayNotes/${dateStr}/notes/${key}/notified`).set(true).catch(() => {});
    }
  }
);

// Раз на добу: якщо триває пробний період/підписка і термін вийшов —
// призупиняємо доступ (license/status → suspended) і сповіщаємо вендора.
// Якщо вузла license нема — нічого не робимо (фіча вимкнена для цього інстансу).
exports.checkLicenseExpiry = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1" },
  async () => {
    const snap = await db.ref("license").get();
    const license = snap.val();
    if (!license || license.status === "suspended") return;

    const now = Date.now();
    const untilTs = license.status === "trial" ? license.trialEndsAt : license.expiresAt;
    if (!untilTs || now <= untilTs) return;

    await db.ref("license/status").set("suspended");
    await pushAdmin(
      "⛔ Підписку призупинено",
      "Термін дії ліцензії вийшов — доступ для інструктора заблоковано.",
      { url: "https://admin.id4drive.pro" }
    ).catch(() => {});
  }
);
