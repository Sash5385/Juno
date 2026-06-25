const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

const OFFER_WINDOW_MS = 30 * 60 * 1000; // 30 хвилин

// Хелпер: зберегти сповіщення в RTDB для студента
async function saveNotification(uid, title, body, type = "system") {
  const ts = Date.now();
  const time = new Date(ts).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(ts).toLocaleDateString("uk", { day: "2-digit", month: "2-digit", year: "numeric" });
  await db.ref(`notifications/${uid}`).push({ title, body, type, ts, time, date }).catch(() => {});
}

// Хелпер: відправити push студенту
async function pushStudent(uid, title, body, data = {}) {
  const snap = await db.ref(`users/${uid}/fcmTokens/web/token`).get();
  const token = snap.val();
  if (!token) return;
  const link = data.url || "https://id4drive.pro/cabinet";
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries({ url: link, ...data }).map(([k,v]) => [k, String(v)])),
      webpush: {
        notification: { icon: "/favicon.svg" },
        fcmOptions: { link },
      },
    });
  } catch (e) {
    if (e.code === "messaging/registration-token-not-registered" ||
        e.code === "messaging/invalid-registration-token") {
      await db.ref(`users/${uid}/fcmTokens/web/token`).remove().catch(() => {});
    }
  }
}

// Хелпер: запросити наступного в черзі для слота
async function inviteNextInQueue(slotKey, excludeUids = []) {
  const entriesSnap = await db.ref(`queue/${slotKey}/entries`).get();
  if (!entriesSnap.exists()) return;
  const entries = Object.entries(entriesSnap.val())
    .map(([uid, e]) => ({ uid, ...e }))
    .filter(e => e.status === "waiting" && !excludeUids.includes(e.uid))
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  if (!entries.length) return;
  const next = entries[0];
  await db.ref(`queue/${slotKey}/entries/${next.uid}`).update({ status: "offered" });
  // onQueueInvite спрацює автоматично
}

// Хелпер: відправити push адміну
async function pushAdmin(title, body) {
  const snap = await db.ref("admin/fcmToken").get();
  const token = snap.val();
  console.log(`pushAdmin: token exists=${!!token}, title="${title}"`);
  if (!token) { console.warn("pushAdmin: no token at admin/fcmToken"); return; }
  try {
    const result = await admin.messaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: { icon: "/favicon.svg" },
        fcmOptions: { link: "https://admin.id4drive.pro" },
      },
    });
    console.log(`pushAdmin OK: ${title} messageId=${result}`);
  } catch (e) {
    console.error(`pushAdmin error: code=${e.code} msg=${e.message}`);
    // Якщо токен протухнув — очищаємо щоб не повторювати помилку
    if (e.code === "messaging/registration-token-not-registered" ||
        e.code === "messaging/invalid-registration-token") {
      await db.ref("admin/fcmToken").remove().catch(() => {});
      console.warn("pushAdmin: stale token removed from admin/fcmToken");
    }
  }
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
    const before = event.data.before.val();
    const after  = event.data.after.val();
    const uid    = event.params.uid;
    const name   = (after || before)?.studentName || "Учень";
    const date   = (after || before)?.date || "—";
    const time   = (after || before)?.time || "—";

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
      } else if (after.createdBy !== "admin") {
        // Учень записався сам — сповіщаємо адміна
        console.log(`onBookingChanged: new booking uid=${uid}`);
        await pushAdmin("📋 Новий запис", `${name} · ${date} о ${time}`);
      }
      return;
    }

    if (!before || !after) return;

    // Учень скасував — звільняємо слоти
    if (after.cancelledBy === "student" && before.cancelledBy !== "student") {
      console.log(`onBookingChanged: student cancel uid=${uid}`);
      const slotUpd = buildSlotUpdates(before, true);
      if (Object.keys(slotUpd).length) await db.ref("/").update(slotUpd).catch(() => {});
      await pushAdmin("❌ Урок скасовано", `${name} · ${date} о ${time}`);
      if (date !== "—" && time !== "—") await inviteNextInQueue(`${date}_${time}`).catch(() => {});
      return;
    }

    // Адмін підтвердив
    if (after.status === "confirmed" && before.status !== "confirmed") {
      console.log(`onBookingChanged: admin confirmed uid=${uid}`);
      await pushStudent(uid, "✅ Урок підтверджено", `${date} о ${time}`, {
        url: "https://id4drive.pro/cabinet/bookings",
      });
      await saveNotification(uid, "✅ Урок підтверджено", `${date} о ${time}`, "booking_confirmed");
      return;
    }

    // Адмін скасував — звільняємо слоти
    if (after.status === "cancelled" && before.status !== "cancelled" && after.cancelledBy === "admin") {
      console.log(`onBookingChanged: admin cancelled uid=${uid}`);
      const slotUpd = buildSlotUpdates(before, true);
      if (Object.keys(slotUpd).length) await db.ref("/").update(slotUpd).catch(() => {});
      await pushStudent(uid, "❌ Урок скасовано", `${date} о ${time}`, {
        url: "https://id4drive.pro/cabinet/bookings",
      });
      await saveNotification(uid, "❌ Урок скасовано", `${date} о ${time}`, "booking_cancelled");
      if (date !== "—" && time !== "—") await inviteNextInQueue(`${date}_${time}`).catch(() => {});
      return;
    }

    // Студент підтвердив присутність
    if (after.studentConfirmed && !before.studentConfirmed) {
      console.log(`onBookingChanged: student confirmed uid=${uid}`);
      await pushAdmin("✅ Підтвердив присутність", `${name} · ${date} о ${time}`);
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
      const bookingId = event.params.bookingId;
      console.log(`onBookingChanged: rescheduled uid=${uid} bookingId=${bookingId} — queuing notif`);
      await db.ref(`rescheduleQueue/${uid}/${bookingId}`).set({
        uid, body, sendAfter: Date.now() + 60000,
      }).catch(() => {});
      return;
    }
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

    // In-app сповіщення: клієнт підписаний на цей шлях
    await db.ref(`users/${uid}/queueOffers/${slotKey}`).set({ date, time, until, slotKey }).catch(() => {});

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
      const slotMs = new Date(`${date}T${time}:00`).getTime();
      if (slotMs > now && slotMs <= threshold) {
        updates[`timeslots/${date}/${slotId}/vipOnly`] = false;
        unlocked = true;
      }
    }
  }

  if (!unlocked) return;
  await db.ref().update(updates);

  const tokenSnap = await db.ref("studentTokens").get();
  const tokens = Object.values(tokenSnap.val() || {}).filter(Boolean);
  if (!tokens.length) return;

  for (let i = 0; i < tokens.length; i += 500) {
    await admin.messaging().sendEachForMulticast({
      tokens: tokens.slice(i, i + 500),
      notification: {
        title: "🚗 З'явились нові слоти!",
        body: "Відкрились нові години для запису. Поспішай!",
      },
      webpush: {
        notification: { icon: "/favicon.svg" },
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
      const title = "🚗 Звільнився слот!";
      const body  = `${dateFormatted} о ${time} — є вільне місце`;
      const url   = `https://id4drive.pro/cabinet?date=${date}`;

      for (const uid of notifyUids) {
        if (lastNotifData[uid] && now - lastNotifData[uid] < RATE_LIMIT_MS) continue;
        await pushStudent(uid, title, body, { url, date, time }).catch(() => {});
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
    const profileSnap = await db.ref(`users/${uid}/profile`).get();
    const name = profileSnap.val()?.name || "Студент";

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

        const lessonMs = new Date(`${b.date}T${b.time}:00+03:00`).getTime();
        const diffMs = lessonMs - now;
        if (diffMs <= 0) continue;

        const sent = sentData[uid]?.[bookingId] || {};
        const dateFmt = new Date(b.date + "T00:00:00").toLocaleDateString("uk", {
          day: "numeric", month: "long", weekday: "short",
        });

        // 24г нагадування (вікно 23–25г, не в тихі години)
        if (!sent.r24 && !(kyivHour >= 23 || kyivHour < 6)
            && diffMs >= 23 * 3600000 && diffMs <= 25 * 3600000) {
          await pushStudent(uid, "🚗 Нагадування про урок", `Завтра о ${b.time} — ${dateFmt}`, {
            url: "https://id4drive.pro/cabinet/bookings",
          });
          await saveNotification(uid, "🚗 Нагадування про урок", `Завтра о ${b.time} — ${dateFmt}`, "reminder");
          updates[`sentReminders/${uid}/${bookingId}/r24`] = true;
        }

        // 2г нагадування (вікно 1.5–2.5г, завжди)
        if (!sent.r2 && diffMs >= 90 * 60000 && diffMs <= 150 * 60000) {
          await pushStudent(uid, "⏰ Урок через 2 години", `о ${b.time} — ${dateFmt}`, {
            url: "https://id4drive.pro/cabinet/bookings",
          });
          await saveNotification(uid, "⏰ Урок через 2 години", `о ${b.time} — ${dateFmt}`, "reminder");
          updates[`sentReminders/${uid}/${bookingId}/r2`] = true;
        }
      }
    }

    if (Object.keys(updates).length) await db.ref("/").update(updates).catch(() => {});
  }
);

// Ручна розсилка адміна → пуш активним учням (останній місяць)
exports.onPushTask = onValueCreated(
  { ref: "push_tasks/{taskId}", region: "europe-west1" },
  async (event) => {
    const task = event.data.val();
    if (!task || task.status === "sent") return;
    const { date, slots, comment } = task;
    const taskId = event.params.taskId;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentSnap = await db.ref("recentStudents").get();
    const recentUids = recentSnap.exists()
      ? Object.entries(recentSnap.val()).filter(([, ts]) => ts >= thirtyDaysAgo).map(([uid]) => uid)
      : [];

    if (!recentUids.length) {
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

    const tokenSnaps = await Promise.all(recentUids.map(uid => db.ref(`users/${uid}/fcmTokens/web/token`).get()));
    const tokened = tokenSnaps.map((s, i) => ({ token: s.val(), uid: recentUids[i] })).filter(t => t.token);

    let sentCount = 0;
    for (let i = 0; i < tokened.length; i += 500) {
      const batch = tokened.slice(i, i + 500);
      const res = await admin.messaging().sendEachForMulticast({
        tokens: batch.map(t => t.token),
        notification: { title, body },
        data: { url, date, time: slotsArr[0] || "" },
        webpush: { notification: { icon: "/favicon.svg" }, fcmOptions: { link: url } },
      }).catch(() => ({ successCount: 0 }));
      sentCount += res?.successCount || 0;
    }

    await Promise.all(recentUids.map(uid => saveNotification(uid, title, body, "slot_broadcast").catch(() => {})));
    await db.ref(`push_tasks/${taskId}`).update({ status: "sent", sentCount, sentAt: Date.now() });
  }
);
