// Блокування / звільнення слотів ПЕР МАЙСТЕР: salons/{salonId}/timeslots/{masterId}/{date}/{slotId}.
// Правила phantom/відновлення — спільні з інструкторами (../slotRules.js).
// Відмінність від інструкторської версії: звільнення НЕ чіпає позиції, які зараз належать іншому
// активному запису цього майстра в цей день (перенесення "на пів години раніше" чи гонка двох скасувань
// інакше звільнили б щойно зайнятий час).
const { blockRangeUpdates, restoreRangeUpdates } = require("../slotRules");
const { sRef, durationMinOf, isCancelled } = require("./lib");

// Діапазон запису в хвилинах від півночі (null, якщо даних замало)
function bookingRange(b) {
  const { date, time, startMin } = b || {};
  if (!date || (!time && startMin == null)) return null;
  let start;
  if (startMin != null) start = startMin;
  else { const [h, m] = String(time || "0:0").split(":").map(Number); start = h * 60 + (m || 0); }
  return { date, start, dur: durationMinOf(b) };
}

const prefixOf = (masterId, date) => `timeslots/${masterId}/${date}/`;

async function readSlotDay(salonId, masterId, date) {
  const snap = await sRef(salonId, `timeslots/${masterId}/${date}`).get().catch(() => null);
  return snap?.val() || {};
}

// Діапазони інших активних записів майстра на цю дату (разом з особистими подіями)
async function otherActiveRanges(salonId, masterId, date, excludeBookingId) {
  const snap = await sRef(salonId, "bookings").orderByChild("date").equalTo(date).get().catch(() => null);
  const out = [];
  snap?.forEach((child) => {
    const b = child.val();
    if (!b || child.key === excludeBookingId || b.masterId !== masterId || isCancelled(b)) return;
    const r = bookingRange(b);
    if (r) out.push({ start: r.start, end: r.start + r.dur });
  });
  return out;
}

// Знімок дня без слотів, що потрапляють у чужі активні діапазони
function dayWithoutRanges(day, ranges) {
  if (!ranges.length) return day;
  const out = {};
  for (const [id, node] of Object.entries(day)) {
    const m = /^slot(\d{2})(\d{2})$/.exec(id);
    const min = m ? Number(m[1]) * 60 + Number(m[2]) : null;
    if (min != null && ranges.some((r) => min >= r.start && min < r.end)) continue;
    out[id] = node;
  }
  return out;
}

// Оновлення (відносно salons/{salonId}) для блокування/звільнення запису.
// uid — клієнт запису: слот, який зайняв інший клієнт (bookedBy), не звільняємо.
async function buildSlotUpdates(salonId, booking, available, { uid = null, excludeBookingId = null } = {}) {
  const r = bookingRange(booking);
  if (!r || !booking.masterId) return {};
  const day = await readSlotDay(salonId, booking.masterId, r.date);
  const prefix = prefixOf(booking.masterId, r.date);
  if (!available) return blockRangeUpdates(day, prefix, r.start, r.dur);
  let mine = uid ? Object.fromEntries(Object.entries(day).filter(([, n]) => !n?.bookedBy || n.bookedBy === uid)) : day;
  mine = dayWithoutRanges(mine, await otherActiveRanges(salonId, booking.masterId, r.date, excludeBookingId));
  return restoreRangeUpdates(mine, prefix, r.start, r.dur, { extra: { bookedBy: null } });
}

// Перенесення (інший час і/або інший майстер): заблокувати нове місце, звільнити старе
async function buildRescheduleSlotUpdates(salonId, before, after, bookingId) {
  const oldR = bookingRange(before);
  const newR = bookingRange(after);
  const updates = {};
  let newDay = null;
  if (newR && after.masterId) {
    newDay = await readSlotDay(salonId, after.masterId, newR.date);
    Object.assign(updates, blockRangeUpdates(newDay, prefixOf(after.masterId, newR.date), newR.start, newR.dur));
  }
  if (oldR && before.masterId) {
    const sameDay = !!newR && newR.date === oldR.date && after.masterId === before.masterId;
    const oldDay = sameDay ? newDay : await readSlotDay(salonId, before.masterId, oldR.date);
    const others = await otherActiveRanges(salonId, before.masterId, oldR.date, bookingId);
    Object.assign(updates, restoreRangeUpdates(dayWithoutRanges(oldDay, others), prefixOf(before.masterId, oldR.date), oldR.start, oldR.dur, {
      skipRange: sameDay ? { start: newR.start, end: newR.start + newR.dur } : null,
    }));
  }
  return updates;
}

const applySlotUpdates = async (salonId, upd) => {
  if (upd && Object.keys(upd).length) await sRef(salonId).update(upd).catch((e) => console.error("salon slots update failed:", e.message));
};

module.exports = { bookingRange, buildSlotUpdates, buildRescheduleSlotUpdates, applySlotUpdates, otherActiveRanges };
