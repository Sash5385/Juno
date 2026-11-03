// Нагадування клієнтам за ~24 год і ~2 год до запису + відкладені сповіщення про перенесення.
// Салони обходимо через реєстр salon_index; записи беремо запитом по даті (індекс bookings.date), а не всім деревом.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  REGION, sRef, allSalonIds, isLicenseReadonly, salonTimezone, localToMs, localDate, isQuietHour,
  pushClient, saveNotification, isCancelled, clientBookingsLink, clientMasterChatLink, postMasterAutoMessage, fmtDM,
} = require("./lib");

const HOUR = 3600000;
const DEFAULT_REMIND_HOURS = 24;

// Години до запису для нагадування в чаті майстра: profile.reminderHours (3–72), 0 = вимкнено (лише класичний push за 24 год)
function remindHoursOf(v) {
  if (v === undefined || v === null || v === "") return DEFAULT_REMIND_HOURS;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(72, Math.max(3, n));
}

// Нагадування: вікна вузькі (за 23–24 год / 1 год 45 хв – 2 год), щоб "за 2 години" не приходило за 2г25хв.
// Прапорець sentReminders/{bookingId}/{r24|r2} ставимо лише коли push реально дійшов — інакше повтор на наступному тіку.
async function remindSalon(salonId, now) {
  if (isLicenseReadonly((await sRef(salonId, "license").get()).val())) return;
  const tz = await salonTimezone(salonId);
  const from = localDate(now - 12 * HOUR, tz);
  const to = localDate(now + 49 * HOUR, tz);
  const snap = await sRef(salonId, "bookings").orderByChild("date").startAt(from).endAt(to).get();
  if (!snap.exists()) return;
  const chatHours = remindHoursOf((await sRef(salonId, "profile/reminderHours").get()).val());
  const sent = (await sRef(salonId, "sentReminders").get()).val() || {};
  const names = {};
  const updates = {};
  const quiet = isQuietHour(now, tz);

  const jobs = [];
  snap.forEach((child) => {
    const b = child.val();
    if (!b || b.status === "personal" || isCancelled(b) || !b.clientUid || !b.date || !b.time) return;
    jobs.push([child.key, b]);
  });

  for (const [bookingId, b] of jobs) {
    const diff = localToMs(b.date, b.time, tz) - now;
    if (diff <= 0) continue;
    const flags = sent[bookingId] || {};
    // Нагадування N годин: вікно 1 година перед N (N=24 → як класичне 23–24 год). У тихі години чат-повідомлення все одно лягає, push — ні
    const lead = chatHours || DEFAULT_REMIND_HOURS;
    const is24 = !flags.r24 && (chatHours > 0 || !quiet) && diff >= (lead - 1) * HOUR && diff <= lead * HOUR;
    const is2 = !flags.r2 && diff >= 105 * 60000 && diff <= 120 * 60000;
    if (!is24 && !is2) continue;
    if (!(b.masterId in names)) names[b.masterId] = (await sRef(salonId, `masters/${b.masterId}/profile/name`).get()).val() || "";
    const who = names[b.masterId] ? ` · ${names[b.masterId]}` : "";
    const dateFmt = fmtDM(b.date);
    if (is24 && chatHours > 0) {
      // Повідомлення в чаті майстра з кнопками «Підтверджую» / «Перенести» (їх малює клієнт за kind=reminder)
      const svc = b.serviceName ? ` (${b.serviceName})` : "";
      const text = `Вітаю! Нагадую про ваш запис: ${dateFmt} о ${b.time}${svc}. Підтвердіть, будь ласка, що прийдете, або перенесіть запис.`;
      try {
        await postMasterAutoMessage(salonId, b.masterId, b.clientUid, text, { kind: "reminder", bookingId });
        updates[`sentReminders/${bookingId}/r24`] = true;
        const title = `💈 ${names[b.masterId] || "Майстер"}: підтвердіть запис`;
        if (!quiet) await pushClient(salonId, b.clientUid, title, `${dateFmt} о ${b.time}`, { url: clientMasterChatLink(b.masterId) }).catch(() => false);
      } catch (e) { console.error(`remindSalon chat: salon=${salonId} booking=${bookingId}`, e); }
      continue;
    }
    const [title, body, key] = is24
      ? ["💈 Нагадування про запис", `Завтра о ${b.time} (${dateFmt})${who}`, "r24"]
      : ["⏰ Запис через 2 години", `О ${b.time}${who}`, "r2"];
    const pushed = await pushClient(salonId, b.clientUid, title, body, { url: clientBookingsLink() }).catch(() => false);
    if (pushed) {
      await saveNotification(salonId, b.clientUid, title, body, "reminder");
      updates[`sentReminders/${bookingId}/${key}`] = true;
    }
  }
  if (Object.keys(updates).length) await sRef(salonId).update(updates).catch(() => {});
}

const salonSendReminders = onSchedule({ schedule: "every 5 minutes", region: REGION }, async () => {
  const now = Date.now();
  for (const salonId of await allSalonIds()) {
    await remindSalon(salonId, now).catch((e) => console.error(`salonSendReminders: salon=${salonId}`, e));
  }
});

// Перенесення: тригер кладе rescheduleQueue/{bookingId} з sendAfter (+1 хв) — дебаунс серії правок одного запису
async function flushRescheduleQueueFor(salonId, now) {
  const q = (await sRef(salonId, "rescheduleQueue").get()).val();
  if (!q) return 0;
  let n = 0;
  await Promise.all(Object.entries(q).filter(([, e]) => e && e.sendAfter <= now).map(async ([bookingId, e]) => {
    await pushClient(salonId, e.clientUid, "🔄 Запис перенесено", e.body, { url: clientBookingsLink() }).catch(() => {});
    await saveNotification(salonId, e.clientUid, "🔄 Запис перенесено", e.body, "booking_rescheduled");
    await sRef(salonId, `rescheduleQueue/${bookingId}`).remove();
    n++;
  }));
  return n;
}

const salonFlushRescheduleQueue = onSchedule({ schedule: "every 1 minutes", region: REGION }, async () => {
  const now = Date.now();
  for (const salonId of await allSalonIds()) {
    try {
      if (isLicenseReadonly((await sRef(salonId, "license").get()).val())) continue;
      await flushRescheduleQueueFor(salonId, now);
    } catch (e) { console.error(`salonFlushRescheduleQueue: salon=${salonId}`, e); }
  }
});

module.exports = { remindSalon, remindHoursOf, flushRescheduleQueueFor, salonSendReminders, salonFlushRescheduleQueue };
