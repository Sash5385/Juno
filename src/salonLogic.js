// Чиста логіка салону без Firebase і React — однаковий файл у DrivePad (src/) і DrivePad-Client (src/utils/).
// Слоти, ціни, вільні вікна, правило безкоштовного скасування. Схема: docs/SALON-SCHEMA.md.
export const pad2 = (n) => String(n).padStart(2, "0");
export const minToTime = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
export const timeToMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const slotIdOf = (time) => `slot${String(time).replace(":", "")}`;

// ─── Дати (локальні, без UTC-зсувів): "YYYY-MM-DD" ──────────────────────
export const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const fromYMD = (ymd) => { const [y, m, d] = String(ymd).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (ymd, n) => { const d = fromYMD(ymd); d.setDate(d.getDate() + n); return toYMD(d); };
// Пн = 0 … Нд = 6
export const weekdayMon0 = (ymd) => (fromYMD(ymd).getDay() + 6) % 7;
export const datesAhead = (startYmd, n) => Array.from({ length: n }, (_, i) => addDays(startYmd, i));

// ─── Робочі години майстра: масив із 7 днів (Пн…Нд) {from, to, off} ──────
export const DEFAULT_WORK_HOURS = [
  { from: "09:00", to: "18:00", off: false }, { from: "09:00", to: "18:00", off: false },
  { from: "09:00", to: "18:00", off: false }, { from: "09:00", to: "18:00", off: false },
  { from: "09:00", to: "18:00", off: false }, { from: "10:00", to: "15:00", off: true },
  { from: "10:00", to: "15:00", off: true },
];
export const normWorkHours = (wh) => DEFAULT_WORK_HOURS.map((d, i) => ({ ...d, ...(Array.isArray(wh) ? wh[i] : wh?.[i]) || {} }));

// Слоти одного дня за робочими годинами: останній слот закінчується не пізніше "to"
export function daySlotDocs(hours, step = 30) {
  if (!hours || hours.off) return {};
  const from = timeToMin(hours.from), to = timeToMin(hours.to), out = {};
  for (let m = from; m + step <= to; m += step) out[slotIdOf(minToTime(m))] = { time: minToTime(m), available: true };
  return out;
}

// Лише ВІДСУТНІ слоти (наявні — вільні, зайняті, phantom — не чіпаємо): multi-path update відносно salons/{salonId}
export function missingSlotWrites(existingDay, wanted, prefix) {
  const upd = {};
  for (const [id, slot] of Object.entries(wanted)) if (!existingDay || existingDay[id] === undefined) upd[`${prefix}${id}`] = slot;
  return upd;
}
// Сітка на N днів уперед для майстра; existing — знімок timeslots/{masterId}
export function gridWrites({ masterId, workHours, step = 30, startYmd, days = 45, existing = {} }) {
  const wh = normWorkHours(workHours), upd = {};
  for (const date of datesAhead(startYmd, days)) {
    Object.assign(upd, missingSlotWrites(existing[date], daySlotDocs(wh[weekdayMon0(date)], step), `timeslots/${masterId}/${date}/`));
  }
  return upd;
}

// Перебудова сітки після зміни робочих годин/кроку: зайві ВІЛЬНІ слоти прибираємо, відсутні додаємо.
// Зайняті, phantom, заблоковані, зарезервовані й пропоновані з черги — не чіпаємо.
export function regridWrites({ masterId, workHours, step = 30, startYmd, days = 45, existing = {} }) {
  const wh = normWorkHours(workHours), upd = {};
  for (const date of datesAhead(startYmd, days)) {
    const wanted = daySlotDocs(wh[weekdayMon0(date)], step), day = existing[date] || {};
    for (const [id, s] of Object.entries(day)) {
      if (!wanted[id] && s && s.time && !s.phantom && s.available === true && !s.adminBlocked && !s.reservedFor && !s.offeredTo && !s.bookedBy) upd[`timeslots/${masterId}/${date}/${id}`] = null;
    }
    Object.assign(upd, missingSlotWrites(day, wanted, `timeslots/${masterId}/${date}/`));
  }
  return upd;
}

// ─── Ціни ───────────────────────────────────────────────────────────────
// Персональна ціна майстра (services/{id}/masterPrices/{masterId}) має пріоритет — так само вимагають rules
export const priceFor = (service, masterId) => {
  const mp = service?.masterPrices?.[masterId];
  return mp !== undefined && mp !== null && mp !== "" ? Number(mp) : Number(service?.price) || 0;
};
export const serviceDuration = (service) => Number(service?.duration) > 0 ? Number(service.duration) : 60;
export const offersService = (service, masterId) => !!service && service.active !== false && service.masterIds?.[masterId] === true;
export const fmtMoney = (n) => `${Math.round((Number(n) || 0) * 100) / 100} ₴`;

// ─── Вільні вікна ───────────────────────────────────────────────────────
// day — знімок timeslots/{masterId}/{date}. Старт можливий, якщо ВСІ слоти від t до t+duration існують,
// не phantom, вільні й не заблоковані. minStart (хв від півночі) — відсікає минулий час сьогодні.
export function freeStartTimes(day, durationMin, step = 30, { minStart = 0 } = {}) {
  const ok = (id) => { const s = day?.[id]; return !!s && !s.phantom && s.available !== false && !s.adminBlocked; };
  const need = Math.max(1, Math.ceil(durationMin / step));
  const times = Object.values(day || {}).filter((s) => s && s.time && !s.phantom).map((s) => s.time).sort();
  return times.filter((t) => {
    const start = timeToMin(t);
    if (start < minStart) return false;
    for (let i = 0; i < need; i++) if (!ok(slotIdOf(minToTime(start + i * step)))) return false;
    return true;
  });
}

// ─── Час у поясі салону ─────────────────────────────────────────────────
// "YYYY-MM-DD" + "HH:MM" у часовому поясі салону → абсолютні мс (два проходи — правильно в добу переходу на літній час).
// Той самий алгоритм, що в functions/salon/lib.js, — клієнт і сервер рахують початок візиту однаково.
export const DEFAULT_TZ = "Europe/Kyiv";
export function tzOffsetMs(ms, tz) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(ms).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return Date.UTC(p.year, p.month - 1, p.day, p.hour === "24" ? 0 : p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
export function localToMs(dateStr, timeStr, tz = DEFAULT_TZ) {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`).getTime();
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}

// ─── Безкоштовне скасування ─────────────────────────────────────────────
// startMs — початок візиту; freeHours — profile.payment.cancelFreeHours (типово 24)
export const DEFAULT_CANCEL_FREE_HOURS = 24;
export function cancelPolicy(startMs, nowMs, freeHours = DEFAULT_CANCEL_FREE_HOURS) {
  const h = Number.isFinite(Number(freeHours)) ? Number(freeHours) : DEFAULT_CANCEL_FREE_HOURS;
  return { free: startMs - nowMs >= h * 3600000, hours: h };
}

// ─── Записи ─────────────────────────────────────────────────────────────
export const isCancelledBooking = (b) => !b || b.status === "cancelled" || !!b.cancelledBy;
export const bookingEndMin = (b) => timeToMin(b.time) + (Number(b.durationMin) || 60);
export const bookingSort = (a, b) => (a.date || "").localeCompare(b.date || "") || timeToMin(a.time) - timeToMin(b.time);

// Статистика по майстрах: completed — візит відбувся; виручка — сума цін completed; скасування і неявки (no_show) окремо.
// Оцінки клієнтів (rating 1–5) — лише з записів, що потрапили у вибірку; bookedMin/personalMin — для заповненості (occupancyPct).
const validRating = (r) => Number.isInteger(r) && r >= 1 && r <= 5;
const EMPTY_ROW = { total: 0, completed: 0, upcoming: 0, cancelled: 0, noShow: 0, revenue: 0, prepaid: 0, ratingSum: 0, ratingCount: 0, bookedMin: 0, personalMin: 0 };
export function aggregateStats(bookings, masterIds = []) {
  const rows = {};
  const row = (id) => (rows[id] ||= { masterId: id, ...EMPTY_ROW });
  masterIds.forEach(row);
  for (const b of bookings) {
    if (!b || !b.masterId) continue;
    const r = row(b.masterId);
    if (b.status === "personal") { r.personalMin += Number(b.durationMin) || 0; continue; }
    r.total++;
    if (isCancelledBooking(b)) { r.cancelled++; continue; }
    r.bookedMin += Number(b.durationMin) || 60;
    if (b.status === "completed") { r.completed++; r.revenue += Number(b.price) || 0; }
    else if (b.status === "no_show") r.noShow++;
    else r.upcoming++;
    if (validRating(b.rating)) { r.ratingSum += b.rating; r.ratingCount++; }
    r.prepaid += Number(b.paidAmount) || 0;
  }
  const list = Object.values(rows);
  const all = list.reduce((s, r) => Object.fromEntries(Object.keys(EMPTY_ROW).map((k) => [k, s[k] + r[k]])), { ...EMPTY_ROW });
  for (const r of list) r.rating = r.ratingCount ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null;
  all.rating = all.ratingCount ? Math.round((all.ratingSum / all.ratingCount) * 10) / 10 : null;
  return { rows: list, all };
}

// Скільки хвилин майстер працює у проміжку [fromYmd, toYmd] за графіком workHours (вихідні й порожні дні — 0)
export function workMinutes(workHours, fromYmd, toYmd) {
  const wh = normWorkHours(workHours);
  let total = 0;
  for (let d = fromYmd; d <= toYmd; d = addDays(d, 1)) {
    const h = wh[weekdayMon0(d)];
    if (h && !h.off) total += Math.max(0, timeToMin(h.to) - timeToMin(h.from));
  }
  return total;
}
// Заповненість, %: заброньовані хвилини / (робочі хвилини − особистий час). Без графіка → null; не більше 100
export function occupancyPct(row, capacityMin) {
  const cap = (Number(capacityMin) || 0) - (row?.personalMin || 0);
  if (cap <= 0) return null;
  return Math.min(100, Math.round(((row?.bookedMin || 0) / cap) * 100));
}
// Неявки, % від візитів, що мали відбутись (завершені + неявки)
export const noShowPct = (row) => { const d = (row?.completed || 0) + (row?.noShow || 0); return d ? Math.round(((row?.noShow || 0) / d) * 100) : 0; };

// Перший і останній день місяця "YYYY-MM" → [from, to]
export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  return [from, `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`];
}
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
