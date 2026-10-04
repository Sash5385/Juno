// Життєвий цикл запису: salons/{salonId}/bookings/{bookingId} (плоский список, masterId в записі).
// Синхронізує слоти майстра і шле сповіщення клієнту / власнику / майстру.
// Статуси: pending → confirmed → completed | cancelled; personal — особистий час (блокує слоти, без сповіщень).
// cancelledBy: client | reschedule (клієнт), admin (власник), master, license (сервер), payment_timeout (сервер).
const { onValueWritten } = require("firebase-functions/v2/database");
const {
  REGION, sRef, pushClient, pushOwner, pushMaster, pushStaff, masterName, masterUid, saveNotification,
  durationMinOf, isLicenseReadonly, fmtDM, buildAdminLink, clientBookingsLink, buildBookingBody,
} = require("./lib");
const { buildSlotUpdates, buildRescheduleSlotUpdates, applySlotUpdates } = require("./slots");
const { inviteNextInQueue } = require("./queue");
const { settleRefundOnCancel, moveReschedulePayment } = require("./payments");

const staffCreated = (b) => b.createdBy === "admin" || b.createdBy === "master";

function buildRescheduleBody(b, mName) {
  const svc = b.serviceName || "";
  const line1 = `${b.clientName || "Клієнт"}${svc ? " · " + svc : ""} ${durationMinOf(b)} хв`;
  const [od, ot] = String(b.rescheduledFrom || "").split(" ");
  const lines = [line1];
  if (mName) lines.push(`Майстер: ${mName}`);
  lines.push(`з ${fmtDM(od)} о ${ot || "—"} на ${fmtDM(b.date)} о ${b.time}`);
  return lines.join("\n");
}

async function handleCreate(salonId, bookingId, after) {
  const uid = after.clientUid || null;
  const date = after.date || "—", time = after.time || "—";
  const link = buildAdminLink({ date, time, masterId: after.masterId, bookingId });

  // Режим читання (підписку не оплачено): нові записи клієнтів відсікаємо (перенесення і записи персоналу — ні)
  if (!staffCreated(after) && !after.rescheduledFrom && after.status !== "personal") {
    const lic = (await sRef(salonId, "license").get().catch(() => null))?.val();
    if (isLicenseReadonly(lic)) {
      console.warn(`salonOnBookingChanged: booking rejected, license readonly salon=${salonId} booking=${bookingId}`);
      await sRef(salonId, `bookings/${bookingId}`).update({ status: "cancelled", cancelledBy: "license", cancelledAt: Date.now() }).catch(() => {});
      await applySlotUpdates(salonId, await buildSlotUpdates(salonId, after, true, { uid, excludeBookingId: bookingId }));
      await pushClient(salonId, uid, "⚠️ Запис недоступний", "Салон тимчасово не приймає нові записи.", { url: clientBookingsLink() }).catch(() => {});
      return;
    }
  }

  await applySlotUpdates(salonId, await buildSlotUpdates(salonId, after, false));
  if (uid && after.rescheduledFromId) await moveReschedulePayment(salonId, after.rescheduledFromId, bookingId, uid).catch((e) => console.error("salon payment move error:", e));
  if (uid) {
    await sRef(salonId).update({ [`activeClients/${uid}`]: true, [`recentClients/${uid}`]: Date.now() }).catch(() => {});
  }
  if (after.status === "personal") return;

  if (staffCreated(after)) {
    // Запис створив власник/майстер вручну — сповіщаємо клієнта (і майстра, якщо записав власник)
    if (uid) {
      const body = `${date} о ${time}${after.serviceName ? " · " + after.serviceName : ""}`;
      await pushClient(salonId, uid, "📋 Запис створено", body, { url: clientBookingsLink() }).catch(() => {});
      await saveNotification(salonId, uid, "📋 Запис створено", body, "booking_confirmed");
    }
    if (after.createdBy === "admin" && after.masterId) {
      const mUid = await masterUid(salonId, after.masterId);
      if (mUid !== salonId) {
        await pushMaster(salonId, after.masterId, "📋 Новий запис у вашому розкладі", buildBookingBody(after), { url: link }).catch(() => {});
      }
    }
    return;
  }

  // Онлайн-оплата: персонал дізнається про запис, коли оплату отримано (payments.js); неоплачений запис
  // зніметься сам за holdMinutes (salonExpireUnpaidBookings) і не має засмічувати сповіщення
  if (after.paymentMethod === "online" && !after.rescheduledFrom) return;

  const mName = await masterName(salonId, after.masterId);
  if (after.rescheduledFrom) {
    await pushStaff(salonId, after.masterId, "🔁 Запис перенесено", buildRescheduleBody(after, mName), { url: link },
      { masterBody: buildRescheduleBody(after, "") });
  } else {
    await pushStaff(salonId, after.masterId, "📋 Новий запис", buildBookingBody(after, { masterName: mName, withMaster: true }), { url: link },
      { masterBody: buildBookingBody(after) });
  }
}

async function handleCancel(salonId, bookingId, before, after) {
  const by = after.cancelledBy || "admin";
  if (by === "license") return; // уже оброблено в handleCreate
  const uid = after.deletedClient ? null : (after.clientUid || null); // клієнт видалив акаунт (account.js) — сповіщати нікого
  const name = after.clientName || "Клієнт";
  const date = after.date || "—", time = after.time || "—";
  const link = buildAdminLink({ date, time, masterId: after.masterId, bookingId });

  await applySlotUpdates(salonId, await buildSlotUpdates(salonId, before, true, { uid, excludeBookingId: bookingId }));
  if (by === "reschedule") return; // про перенесення сповістить створення нового запису

  // Сплачений запис: повернення за політикою салону (cancelFreeHours) — клієнт скасував вчасно/пізно, власник/майстер — завжди
  const refund = await settleRefundOnCancel(salonId, bookingId, after, by).catch((e) => { console.error("salon refund error:", e); return null; });
  if (refund?.kept) {
    const body = `${date} о ${time} — скасування пізніше ніж за ${refund.hours} год, передоплата залишається салону`;
    await pushClient(salonId, uid, "💳 Передоплата не повертається", body, { url: clientBookingsLink() }).catch(() => {});
    await saveNotification(salonId, uid, "💳 Передоплата не повертається", body, "payment");
  } else if (refund?.ok) {
    await pushClient(salonId, uid, "↩️ Повернення коштів", `${date} о ${time} — кошти повернуться на картку протягом кількох днів`, { url: clientBookingsLink() }).catch(() => {});
  }
  if (refund?.failed) {
    await pushOwner(salonId, "⚠️ Не вдалося повернути кошти", `${name} · ${date} о ${time} — поверніть вручну в налаштуваннях оплати`, { url: link }).catch(() => {});
  }

  if (by === "client") {
    await pushStaff(salonId, after.masterId, "❌ Запис скасовано клієнтом", `${name} · ${date} о ${time}`, { url: link });
  } else if (by === "payment_timeout") {
    const body = `${date} о ${time} — запис не оплачено вчасно, час звільнено`;
    await pushClient(salonId, uid, "⌛ Запис скасовано", body, { url: clientBookingsLink() }).catch(() => {});
    await saveNotification(salonId, uid, "⌛ Запис скасовано", body, "booking_cancelled");
  } else {
    // скасував власник або майстер: клієнт отримує сповіщення, "інша сторона" персоналу — теж
    const body = `${date} о ${time}`;
    await pushClient(salonId, uid, "❌ Запис скасовано", body, { url: clientBookingsLink() }).catch(() => {});
    await saveNotification(salonId, uid, "❌ Запис скасовано", body, "booking_cancelled");
    if (by === "master") await pushOwner(salonId, "❌ Майстер скасував запис", `${name} · ${date} о ${time}`, { url: link }).catch(() => {});
    else if (after.masterId && (await masterUid(salonId, after.masterId)) !== salonId) {
      await pushMaster(salonId, after.masterId, "❌ Запис скасовано", `${name} · ${date} о ${time}`, { url: link }).catch(() => {});
    }
  }
  if (date !== "—" && time !== "—") {
    await inviteNextInQueue(salonId, after.masterId, `${date}_${time}`, [], durationMinOf(before)).catch(() => {});
  }
}

async function handleBookingChange(salonId, bookingId, before, after) {
  const cur = after || before;
  if (!cur) return;
  if (!cur.masterId) { console.warn(`salonOnBookingChanged: booking ${bookingId} without masterId — skipped`); return; }

  // Особистий час майстра: лише слоти
  if (cur.status === "personal") {
    if (!before && after) await handleCreate(salonId, bookingId, after);
    else if (before && !after) await applySlotUpdates(salonId, await buildSlotUpdates(salonId, before, true, { excludeBookingId: bookingId }));
    else if (before && after && (before.date !== after.date || before.time !== after.time || before.masterId !== after.masterId || durationMinOf(before) !== durationMinOf(after))) {
      await applySlotUpdates(salonId, await buildRescheduleSlotUpdates(salonId, before, after, bookingId));
    }
    return;
  }

  if (!before && after) return handleCreate(salonId, bookingId, after);

  // Запис видалено: активний звільняє слоти (без сповіщень)
  if (before && !after) {
    if (before.status !== "cancelled" && !before.cancelledBy) {
      await applySlotUpdates(salonId, await buildSlotUpdates(salonId, before, true, { uid: before.clientUid || null, excludeBookingId: bookingId }));
    }
    return;
  }

  const uid = after.clientUid || null;
  const name = after.clientName || "Клієнт";
  const date = after.date || "—", time = after.time || "—";
  const link = buildAdminLink({ date, time, masterId: after.masterId, bookingId });

  if (after.status === "cancelled" && before.status !== "cancelled") return handleCancel(salonId, bookingId, before, after);

  if (after.status === "confirmed" && before.status !== "confirmed") {
    const body = `${date} о ${time}${after.serviceName ? " · " + after.serviceName : ""}`;
    await pushClient(salonId, uid, "✅ Запис підтверджено", body, { url: clientBookingsLink() }).catch(() => {});
    await saveNotification(salonId, uid, "✅ Запис підтверджено", body, "booking_confirmed");
    return;
  }

  if (after.clientConfirmed && !before.clientConfirmed) {
    await pushStaff(salonId, after.masterId, "✅ Клієнт підтвердив візит", `${name} · ${date} о ${time}`, { url: link });
    return;
  }

  // Перенесення (інший час і/або майстер) — слоти зараз, сповіщення клієнту з дебаунсом 1 хв (salonFlushRescheduleQueue)
  const moved = after.status !== "cancelled" && (after.date !== before.date || after.time !== before.time || after.masterId !== before.masterId);
  if (moved) {
    await applySlotUpdates(salonId, await buildRescheduleSlotUpdates(salonId, before, after, bookingId));
    if (uid) {
      const mName = after.masterId !== before.masterId ? await masterName(salonId, after.masterId) : "";
      const body = `Новий час: ${date} о ${time} (було ${before.date || "—"} о ${before.time || "—"})${mName ? `\nМайстер: ${mName}` : ""}`;
      await sRef(salonId, `rescheduleQueue/${bookingId}`).set({ clientUid: uid, body, sendAfter: Date.now() + 60000 }).catch(() => {});
    }
    if (after.masterId !== before.masterId) {
      await pushMaster(salonId, after.masterId, "📋 Новий запис у вашому розкладі", buildBookingBody(after), { url: link }).catch(() => {});
      await pushMaster(salonId, before.masterId, "🔁 Запис передано іншому майстру", `${name} · ${before.date || "—"} о ${before.time || "—"}`, { url: link }).catch(() => {});
    }
    return;
  }

  // Клієнт додав/змінив нотатку — сповіщаємо персонал (очищення нотатки не сповіщає)
  const noteBefore = String(before.clientNote || "").trim();
  const noteAfter = String(after.clientNote || "").trim();
  if (noteAfter && noteAfter !== noteBefore && after.status !== "cancelled" && !staffCreated(after)) {
    await pushStaff(salonId, after.masterId, "💬 Коментар до запису", `${name} · ${date} о ${time}\n${noteAfter}`, { url: link });
  }
}

const salonOnBookingChanged = onValueWritten(
  { ref: "salons/{salonId}/bookings/{bookingId}", region: REGION },
  async (event) => {
    const { salonId, bookingId } = event.params;
    await handleBookingChange(salonId, bookingId, event.data.before.val(), event.data.after.val());
  }
);

module.exports = { salonOnBookingChanged, handleBookingChange };
