// «Автовідкриття слотів» на сервері: той самий алгоритм, що й AutoSlots у адмінці
// (src/views/id4drive-admin-v5.jsx → computeDayUpdatesFor), але без входу майстра в застосунок.
// Чиста логіка без firebase — тестується окремо.

const bufferOf = (b) => { const n = Number(b?.bufferMin); return Number.isFinite(n) && n > 0 ? Math.min(120, Math.round(n)) : 0; };
const pad2 = (n) => String(n).padStart(2, "0");

// Дата YYYY-MM-DD через d днів від базової (рядкова арифметика, без залежності від TZ сервера)
function addDays(dateStr, d) {
  const t = new Date(`${dateStr}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

function computeDayUpdatesFor(settings, bookings, dateStr, existing, root = "timeslots") {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const ov = (settings.dateOverrides || []).find((o) => o && o.date === dateStr);
  if (ov?.type === "closed") return null;
  const ws = (settings.weekSchedule || [])[dow] || {};
  if (!ov && ws.enabled === false) return null;
  if (!ov && !ws.start && (settings.weekends || []).includes(dow)) return null;
  const start = ov?.start ?? ws.start ?? settings.workStart ?? 9;
  const end = ov?.end ?? ws.end ?? settings.workEnd ?? 18;
  const lunchEnabled = ov?.lunchEnabled ?? ws.lunchEnabled ?? settings.lunchEnabled ?? true;
  const lunchStart = ov?.lunchStart ?? ws.lunchStart ?? settings.lunchStart ?? 12;
  const lunchEnd = ov?.lunchEnd ?? ws.lunchEnd ?? settings.lunchEnd ?? 13;
  const step = 60;
  const updates = {};
  let afterLunch = false;
  for (let min = Math.round(start * 60); min < Math.round(end * 60); min += step) {
    if (lunchEnabled && lunchEnd > lunchStart && min < lunchEnd * 60 && min + step > lunchStart * 60) {
      min = lunchEnd * 60 - step;
      afterLunch = true;
      continue;
    }
    if (afterLunch && min + step > end * 60) break;
    const h = pad2(Math.floor(min / 60)), m = pad2(min % 60);
    const id = `slot${h}${m}`;
    if (!existing[id]?.adminBlocked) {
      updates[`${root}/${dateStr}/${id}/time`] = `${h}:${m}`;
      updates[`${root}/${dateStr}/${id}/available`] = true;
    }
  }
  const intervalMin = settings.snapMin ?? 30;
  bookings.filter((b) => b.date === dateStr && b.status !== "cancelled").forEach((b) => {
    const bEnd = b.startMin + b.durMin;
    for (let cur = b.startMin; cur < bEnd + bufferOf(b); cur += intervalMin) {
      const h = pad2(Math.floor(cur / 60)), m = pad2(cur % 60);
      const id = `slot${h}${m}`;
      if (cur >= bEnd && updates[`${root}/${dateStr}/${id}/available`] !== true) continue;
      if (!(`${root}/${dateStr}/${id}/available` in updates)) updates[`${root}/${dateStr}/${id}/phantom`] = true;
      updates[`${root}/${dateStr}/${id}/available`] = false;
      updates[`${root}/${dateStr}/${id}/time`] = `${h}:${m}`;
      updates[`${root}/${dateStr}/${id}/bookingStart`] = cur === b.startMin;
    }
  });
  return { updates };
}

// bookings/{uid}/{id} → плоский список з startMin/durMin
function flattenBookings(data) {
  const all = [];
  Object.values(data || {}).forEach((u) => {
    if (!u || typeof u !== "object") return;
    Object.values(u).forEach((b) => {
      if (!b || b.status === "cancelled" || !b.date) return;
      const [h, mi] = String(b.time || "0:0").split(":").map(Number);
      all.push({
        ...b,
        startMin: b.startMin ?? ((h || 0) * 60 + (mi || 0)),
        durMin: b.durMin ?? (b.durationHours ? Math.round(b.durationHours * 60) : 60),
      });
    });
  });
  return all;
}

const freeAuto = (sl) => sl?.available === true && !sl.vipOnly && !sl.privateOnly && !sl.surcharge && !sl.fixedPrice;

// Обчислює записи для одного майстра. today — YYYY-MM-DD (Київ).
// Повертає { removals, all, marks } (шляхи відносно instructors/{iid}/); read(path) → значення (async).
async function planAutoSlots({ settings, bookingsData, today, read, root = "timeslots" }) {
  const limit = settings.slotGenDays || 30;
  const days = Array.from({ length: limit + 1 }, (_, i) => addDays(today, i));
  const bookings = flattenBookings(bookingsData);
  const removals = {}, all = {}, marks = {};
  for (const dateStr of days) {
    const [done, existingRaw] = await Promise.all([read(`autoSlotsDone/${dateStr}`), read(`${root}/${dateStr}`)]);
    const existing = existingRaw || {};
    const result = computeDayUpdatesFor(settings, bookings, dateStr, existing, root);
    if (!result) {
      Object.entries(existing).forEach(([slotId, sl]) => { if (freeAuto(sl)) removals[`${root}/${dateStr}/${slotId}`] = null; });
      if (done != null) removals[`autoSlotsDone/${dateStr}`] = null;
      continue;
    }
    const sig = Object.entries(result.updates).filter(([k]) => k.endsWith("/time")).map(([, v]) => v).sort().join(",");
    const hasExisting = Object.keys(existing).length > 0;
    if (done == null && hasExisting) continue; // слоти заводились вручну — не чіпаємо
    if (done == null || (done !== sig && hasExisting)) {
      Object.entries(existing).forEach(([slotId, sl]) => {
        if (!(`${root}/${dateStr}/${slotId}/time` in result.updates) && freeAuto(sl)) removals[`${root}/${dateStr}/${slotId}`] = null;
      });
      Object.assign(all, result.updates);
      marks[`autoSlotsDone/${dateStr}`] = sig;
    }
  }
  return { removals, all, marks };
}

module.exports = { computeDayUpdatesFor, flattenBookings, planAutoSlots, addDays };
