const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

const LIQPAY_PUBLIC_KEY  = defineSecret("LIQPAY_PUBLIC_KEY");
const LIQPAY_PRIVATE_KEY = defineSecret("LIQPAY_PRIVATE_KEY");

admin.initializeApp();
const db = admin.database();

const OFFER_WINDOW_MS = 30 * 60 * 1000;

// ─── MULTI-TENANT HELPERS ────────────────────────────────────────────

async function pushInstructor(iid, title, body) {
  const snap = await db.ref(`instructors/${iid}/fcmToken`).get();
  const token = snap.val();
  if (!token) return;
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: { icon: "/favicon.svg" },
        fcmOptions: { link: "https://admin.drivepad.pro" },
      },
    });
  } catch (e) {
    if (e.code === "messaging/registration-token-not-registered" ||
        e.code === "messaging/invalid-registration-token") {
      await db.ref(`instructors/${iid}/fcmToken`).remove().catch(() => {});
    }
  }
}

async function pushInstructorStudent(iid, uid, title, body, data = {}) {
  const snap = await db.ref(`instructors/${iid}/users/${uid}/fcmTokens/web/token`).get();
  const token = snap.val();
  if (!token) return;
  const link = data.url || "https://drivepad.pro/cabinet";
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries({ url: link, ...data }).map(([k, v]) => [k, String(v)])),
      webpush: {
        notification: { icon: "/favicon.svg" },
        fcmOptions: { link },
      },
    });
  } catch (e) {
    if (e.code === "messaging/registration-token-not-registered" ||
        e.code === "messaging/invalid-registration-token") {
      await db.ref(`instructors/${iid}/users/${uid}/fcmTokens/web/token`).remove().catch(() => {});
    }
  }
}

async function saveInstructorNotification(iid, uid, title, body, type = "system") {
  const ts   = Date.now();
  const time = new Date(ts).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(ts).toLocaleDateString("uk", { day: "2-digit", month: "2-digit", year: "numeric" });
  await db.ref(`instructors/${iid}/notifications/${uid}`).push({ title, body, type, ts, time, date }).catch(() => {});
}

async function freeInstructorSlots(iid, bookingData) {
  const { date, time, durationHours, durMin, startMin } = bookingData || {};
  if (!date || (!time && startMin == null)) return;
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
    if (cur % 60 !== 0) {
      updates[`instructors/${iid}/timeslots/${date}/slot${hh}${mm}`] = null;
    } else {
      updates[`instructors/${iid}/timeslots/${date}/slot${hh}${mm}/available`] = true;
      updates[`instructors/${iid}/timeslots/${date}/slot${hh}${mm}/time`] = `${hh}:${mm}`;
    }
  }
  if (Object.keys(updates).length) await db.ref("/").update(updates).catch(() => {});
}

// ─── BOOKING TRIGGERS ────────────────────────────────────────────────

// Новий запис → push інструктору + блокуємо слоти
exports.onInstructorBookingCreated = onValueCreated(
  { ref: "instructors/{iid}/bookings/{uid}/{bookingId}", region: "europe-west1" },
  async (event) => {
    const booking = event.data.val();
    if (!booking) return;
    const { iid, uid } = event.params;

    const name = booking.studentName || booking.name || "Клієнт";
    const date = booking.date || "—";
    const time = booking.time || "—";

    if (booking.date && (booking.time || booking.startMin != null)) {
      const INTERVAL = 30;
      let start;
      if (booking.startMin != null) {
        start = booking.startMin;
      } else {
        const [h, m] = (booking.time || "0:0").split(":").map(Number);
        start = h * 60 + m;
      }
      const dur = booking.durMin ?? ((booking.durationHours || 1) * 60);
      const updates = {};
      for (let cur = start; cur < start + dur; cur += INTERVAL) {
        const hh = String(Math.floor(cur / 60)).padStart(2, "0");
        const mm = String(cur % 60).padStart(2, "0");
        updates[`instructors/${iid}/timeslots/${booking.date}/slot${hh}${mm}/available`] = false;
        updates[`instructors/${iid}/timeslots/${booking.date}/slot${hh}${mm}/time`] = `${hh}:${mm}`;
      }
      if (Object.keys(updates).length) await db.ref("/").update(updates).catch(() => {});
    }

    // Якщо адмін вручну записав клієнта — push клієнту (не гостю)
    if (booking.createdBy === "admin" && !uid.startsWith("guest_")) {
      await pushInstructorStudent(iid, uid, "📋 Урок заплановано", `${date} о ${time}`, { url: "https://drivepad.pro/cabinet/bookings" });
      await saveInstructorNotification(iid, uid, "📋 Урок заплановано", `${date} о ${time}`, "booking_confirmed");
    } else {
      await pushInstructor(iid, "📋 Новий запис", `${name} · ${date} о ${time}`);
    }
  }
);

// Зміни стану букінгу → push клієнту або інструктору
exports.onInstructorBookingChanged = onValueWritten(
  { ref: "instructors/{iid}/bookings/{uid}/{bookingId}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before.val();
    const after  = event.data.after.val();
    if (before === null) return; // нові записи обробляє onInstructorBookingCreated

    const { iid, uid } = event.params;
    const isGuest = uid.startsWith("guest_");
    const name = (after || before)?.studentName || (after || before)?.name || "Клієнт";
    const date = (after || before)?.date || "—";
    const time = (after || before)?.time || "—";

    // Адмін підтвердив
    if (after?.status === "confirmed" && before?.status !== "confirmed") {
      if (!isGuest) {
        await pushInstructorStudent(iid, uid, "✅ Урок підтверджено", `${date} о ${time}`, { url: "https://drivepad.pro/cabinet/bookings" });
        await saveInstructorNotification(iid, uid, "✅ Урок підтверджено", `${date} о ${time}`, "booking_confirmed");
      }
      return;
    }

    // Адмін скасував → звільняємо слоти + push клієнту
    if (after?.status === "cancelled" && before?.status !== "cancelled" && after?.cancelledBy === "admin") {
      await freeInstructorSlots(iid, before);
      if (!isGuest) {
        await pushInstructorStudent(iid, uid, "❌ Урок скасовано", `${date} о ${time}`, { url: "https://drivepad.pro/cabinet/bookings" });
        await saveInstructorNotification(iid, uid, "❌ Урок скасовано", `${date} о ${time}`, "booking_cancelled");
      }
      return;
    }

    // Клієнт скасував → звільняємо слоти + push інструктору
    if (after?.cancelledBy === "student" && before?.cancelledBy !== "student") {
      await freeInstructorSlots(iid, before);
      await pushInstructor(iid, "❌ Урок скасовано", `${name} · ${date} о ${time}`);
      return;
    }

    // Перенесено — push клієнту + інструктору
    if (after && before && after.status !== "cancelled" &&
        (after.date !== before.date || after.time !== before.time)) {
      const oldDate = before.date || "—";
      const oldTime = before.time || "—";
      const body = `Новий час: ${date} о ${time} (було ${oldDate} о ${oldTime})`;
      if (!isGuest) {
        await pushInstructorStudent(iid, uid, "🔄 Урок перенесено", body, { url: "https://drivepad.pro/cabinet/bookings" });
        await saveInstructorNotification(iid, uid, "🔄 Урок перенесено", body, "booking_rescheduled");
      }
      await pushInstructor(iid, "🔄 Перенос", `${name} · ${body}`);
    }
  }
);

// ─── QUEUE TRIGGER ───────────────────────────────────────────────────

// Статус черги → "offered": резервуємо слот у timeslots, push студенту
exports.onInstructorQueueInvite = onValueUpdated(
  { ref: "instructors/{iid}/queue/{slotKey}/entries/{uid}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before.val();
    const after  = event.data.after.val();
    if (!after || after.status !== "offered" || before?.status === "offered") return;

    const { iid, uid, slotKey } = event.params;
    const sep  = slotKey.lastIndexOf("_");
    const date = slotKey.slice(0, sep);
    const time = slotKey.slice(sep + 1);
    if (!date || !time) return;

    const slotId = `slot${time.replace(":", "")}`;
    const until  = Date.now() + OFFER_WINDOW_MS;

    await db.ref(`instructors/${iid}/timeslots/${date}/${slotId}/offeredTo/${uid}`).set({ until }).catch(() => {});
    await db.ref(`instructors/${iid}/users/${uid}/queueOffers/${slotKey}`).set({ date, time, until, slotKey }).catch(() => {});

    const url   = `https://drivepad.pro/cabinet?date=${date}&time=${encodeURIComponent(time)}`;
    const title = "🎉 Слот зарезервовано для вас!";
    const body  = `${date} о ${time} — у вас 30 хвилин щоб записатись`;
    await pushInstructorStudent(iid, uid, title, body, { url, date, time, slotKey });
    await saveInstructorNotification(iid, uid, title, body, "queue_offer");
  }
);

// ─── CHAT TRIGGER ────────────────────────────────────────────────────

// Студент надіслав повідомлення → push інструктору
exports.onInstructorStudentMessage = onValueCreated(
  { ref: "instructors/{iid}/chats/{uid}/{msgId}", region: "europe-west1" },
  async (event) => {
    const msg = event.data.val();
    if (!msg || msg.from !== "student") return;

    const { iid, uid } = event.params;
    const profileSnap = await db.ref(`instructors/${iid}/users/${uid}/profile`).get();
    const name = profileSnap.val()?.name || "Студент";

    const text = msg.text || "";
    await pushInstructor(iid, `💬 ${name}`, text.length > 100 ? text.slice(0, 100) + "…" : text);
  }
);

// ─── LIQPAY SUBSCRIPTION ─────────────────────────────────────────────

const MONTHLY_PRICE = 499;

exports.createLiqPayOrder = onRequest(
  {
    region: "europe-west1",
    cors: ["https://admin.drivepad.pro", "http://localhost:5173"],
    secrets: [LIQPAY_PUBLIC_KEY, LIQPAY_PRIVATE_KEY],
  },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
    const { amount, months, iid } = req.body || {};
    if (!iid) { res.status(400).json({ error: "missing iid" }); return; }

    const pubKey  = LIQPAY_PUBLIC_KEY.value();
    const privKey = LIQPAY_PRIVATE_KEY.value();

    const orderId = `sub_${iid}_${Date.now()}`;
    const params = {
      version:     "3",
      public_key:  pubKey,
      action:      "pay",
      amount:      String(amount || MONTHLY_PRICE),
      currency:    "UAH",
      description: `DrivePad підписка ${months || 1} міс.`,
      order_id:    orderId,
      result_url:  "https://admin.drivepad.pro/",
      server_url:  "https://europe-west1-drivepad-86fe1.cloudfunctions.net/liqpayCallback",
    };

    const data = Buffer.from(JSON.stringify(params)).toString("base64");
    const signature = crypto.createHash("sha1")
      .update(privKey + data + privKey)
      .digest("base64");

    res.json({ data, signature, action: "https://www.liqpay.ua/api/3/checkout" });
  }
);

exports.liqpayCallback = onRequest(
  {
    region: "europe-west1",
    cors: true,
    secrets: [LIQPAY_PRIVATE_KEY],
  },
  async (req, res) => {
    const { data, signature } = req.body || {};
    if (!data || !signature) { res.status(400).send("Bad request"); return; }

    const privKey = LIQPAY_PRIVATE_KEY.value();
    const expected = crypto.createHash("sha1")
      .update(privKey + data + privKey)
      .digest("base64");
    if (expected !== signature) { res.status(403).send("Invalid signature"); return; }

    const params = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    const { status, order_id, amount } = params;

    if (status !== "success" && status !== "sandbox") { res.send("OK"); return; }

    const match = (order_id || "").match(/^sub_(.+)_\d+$/);
    if (!match) { res.send("OK"); return; }
    const iid = match[1];

    const months    = Math.max(1, Math.round(Number(amount) / MONTHLY_PRICE));
    const now       = Date.now();
    const expiresAt = now + months * 30 * 24 * 3600 * 1000;

    await db.ref(`instructors/${iid}/subscription`).update({
      plan: "active",
      expiresAt,
      lastPaidAt:        now,
      lastPaymentAmount: Number(amount),
    }).catch(console.error);

    console.log(`liqpayCallback: activated iid=${iid} months=${months} expiresAt=${new Date(expiresAt).toISOString()}`);
    res.send("OK");
  }
);

// ─── DEBT REMINDER ───────────────────────────────────────────────
// Runs daily at 10:00 Kyiv. Sends push to students with unpaid past lessons.
// Dedup: max once per 7 days per student (debtReminderSentAt field).
exports.sendDebtReminders = onSchedule(
  { schedule: "0 7 * * *", region: "europe-west1", timeZone: "UTC" }, // 7:00 UTC = 10:00 Kyiv
  async () => {
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const SEVEN_DAYS = 7 * 24 * 3600 * 1000;

    const snap = await db.ref("instructors").get();
    if (!snap.exists()) return null;

    const tasks = [];
    snap.forEach(iSnap => {
      const iid = iSnap.key;
      const booksNode = iSnap.child("bookings");
      if (!booksNode.exists()) return;

      const studentDebt = {};
      booksNode.forEach(userSnap => {
        const uid = userSnap.key;
        if (uid.startsWith("guest_")) return;

        userSnap.forEach(bSnap => {
          const b = bSnap.val();
          if (!b || b.status !== "confirmed" || b.isPaid || !b.price || b.price <= 0) return;
          if (!b.date || b.date >= todayStr) return;
          if (!studentDebt[uid]) studentDebt[uid] = { total: 0, lastSent: b.debtReminderSentAt || 0 };
          studentDebt[uid].total += b.price;
        });
      });

      Object.entries(studentDebt).forEach(([uid, info]) => {
        if (info.total <= 0) return;
        if (now - info.lastSent < SEVEN_DAYS) return;
        tasks.push({ iid, uid, total: info.total });
      });
    });

    if (!tasks.length) return null;

    await Promise.allSettled(tasks.map(async ({ iid, uid, total }) => {
      await pushInstructorStudent(
        iid, uid,
        "💳 Нагадування про оплату",
        `Є неоплачені уроки на суму ${total} ₴. Зверніться до інструктора.`,
        { url: "https://drivepad.pro/cabinet/bookings" }
      );
      await saveInstructorNotification(
        iid, uid,
        "💳 Нагадування про оплату",
        `Є неоплачені уроки на суму ${total} ₴.`,
        "debt_reminder"
      );
      await db.ref(`instructors/${iid}/bookings`).child(uid).once("value").then(async snap => {
        const updates = {};
        snap.forEach(bSnap => {
          const b = bSnap.val();
          if (b && b.status === "confirmed" && !b.isPaid && b.price > 0 && b.date < todayStr) {
            updates[`instructors/${iid}/bookings/${uid}/${bSnap.key}/debtReminderSentAt`] = now;
          }
        });
        if (Object.keys(updates).length) await db.ref("/").update(updates).catch(() => {});
      }).catch(() => {});
    }));

    return null;
  }
);

// ─── LESSON REMINDER NOTIFICATIONS ───────────────────────────────
// Runs every 30 min, sends "lesson in 2 hours" push to students.
// Window: 90–150 min from now. Marks reminderSent/2h to avoid duplicates.
exports.sendLessonReminders = onSchedule(
  { schedule: "every 30 minutes", region: "europe-west1", timeZone: "Europe/Kiev" },
  async () => {
    const now = Date.now();
    const WINDOW_MIN = 90  * 60 * 1000;
    const WINDOW_MAX = 150 * 60 * 1000;

    const snap = await db.ref("instructors").get();
    if (!snap.exists()) return null;

    const tasks = [];
    snap.forEach(iSnap => {
      const iid = iSnap.key;
      const booksNode = iSnap.child("bookings");
      if (!booksNode.exists()) return;

      booksNode.forEach(userSnap => {
        const uid = userSnap.key;
        if (uid.startsWith("guest_")) return;

        userSnap.forEach(bSnap => {
          const b = bSnap.val();
          if (!b || b.status !== "confirmed") return;
          if (b.reminderSent && b.reminderSent["2h"]) return;

          const { date, time } = b;
          if (!date || !time) return;

          // Parse as Kyiv local time (UTC+3 in summer; ±1h offset in winter is within the window)
          const lessonMs = new Date(`${date}T${time}:00+03:00`).getTime();
          const diff = lessonMs - now;
          if (diff >= WINDOW_MIN && diff <= WINDOW_MAX) {
            tasks.push({ iid, uid, key: bSnap.key, date, time });
          }
        });
      });
    });

    if (!tasks.length) return null;

    await Promise.allSettled(tasks.map(async ({ iid, uid, key, date, time }) => {
      await pushInstructorStudent(
        iid, uid,
        "⏰ Урок через 2 години",
        `${date} о ${time.slice(0,5)} — не забудьте!`,
        { url: "https://drivepad.pro/cabinet/bookings" }
      );
      await saveInstructorNotification(
        iid, uid,
        "⏰ Урок через 2 години",
        `${date} о ${time.slice(0,5)} — не забудьте!`,
        "lesson_reminder"
      );
      await db.ref(`instructors/${iid}/bookings/${uid}/${key}/reminderSent/2h`).set(now).catch(() => {});
    }));

    return null;
  }
);

// "Tomorrow" reminder — runs daily at 18:00 Kyiv time.
// Sends push for all confirmed lessons scheduled for tomorrow.
exports.sendTomorrowReminders = onSchedule(
  { schedule: "0 15 * * *", region: "europe-west1", timeZone: "UTC" }, // 15:00 UTC = 18:00 Kyiv (+3)
  async () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const snap = await db.ref("instructors").get();
    if (!snap.exists()) return null;

    const tasks = [];
    snap.forEach(iSnap => {
      const iid = iSnap.key;
      const booksNode = iSnap.child("bookings");
      if (!booksNode.exists()) return;

      booksNode.forEach(userSnap => {
        const uid = userSnap.key;
        if (uid.startsWith("guest_")) return;

        userSnap.forEach(bSnap => {
          const b = bSnap.val();
          if (!b || b.status !== "confirmed") return;
          if (b.reminderSent && b.reminderSent["day"]) return;
          if (b.date !== tomorrowStr) return;

          tasks.push({ iid, uid, key: bSnap.key, date: b.date, time: b.time || "" });
        });
      });
    });

    if (!tasks.length) return null;

    const ts = Date.now();
    await Promise.allSettled(tasks.map(async ({ iid, uid, key, date, time }) => {
      const t = (time || "").slice(0, 5);
      await pushInstructorStudent(
        iid, uid,
        "📅 Урок завтра",
        `${date} о ${t} — чекаємо на вас!`,
        { url: "https://drivepad.pro/cabinet/bookings" }
      );
      await saveInstructorNotification(
        iid, uid,
        "📅 Урок завтра",
        `${date} о ${t} — чекаємо на вас!`,
        "lesson_reminder_day"
      );
      await db.ref(`instructors/${iid}/bookings/${uid}/${key}/reminderSent/day`).set(ts).catch(() => {});
    }));

    return null;
  }
);

exports.onAdminPushQueue = onValueCreated(
  { ref: "instructors/{iid}/pushQueue/{pushId}", region: "europe-west1", instance: "*" },
  async event => {
    const { uid, title, body } = event.data.val() || {};
    if (!uid || !title || !body) { await event.data.ref.remove().catch(() => {}); return; }
    const iid = event.params.iid;
    await pushInstructorStudent(iid, uid, title, body);
    await saveInstructorNotification(iid, uid, title, body, "admin_message");
    await event.data.ref.remove().catch(() => {});
  }
);
