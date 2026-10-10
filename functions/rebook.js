// Нагадування про повторний запис: послуга має rebookDays (через скільки днів після візиту нагадати).
// Нагадуємо клієнту, коли з дати його ОСТАННЬОГО візиту цієї послуги минуло ≥ rebookDays днів, у нього немає
// майбутнього запису, і за цей візит ми ще не нагадували (users/{uid}/rebookReminded = id візиту).
const DAY = 86400000;
const dayNum = (s) => Math.floor(Date.parse(`${s}T00:00:00Z`) / DAY);

// inst — вузол instructors/{iid}; today — YYYY-MM-DD (Київ). Повертає [{ uid, bookingId, serviceName, days }]
function findRebookDue(inst, today) {
  const raw = inst?.admin_data?.services;
  const services = Array.isArray(raw) ? raw : Object.values(raw || {});
  const interval = {};
  services.forEach((s) => { const d = Math.round(Number(s?.rebookDays)); if (s?.id && d > 0 && s.active && !s.archived) interval[s.id] = d; });
  if (!Object.keys(interval).length) return [];
  const out = [];
  for (const [uid, bks] of Object.entries(inst?.bookings || {})) {
    if (uid === "admin" || uid.startsWith("guest_")) continue;
    if (inst?.users?.[uid]?.blocked) continue;
    let upcoming = false;
    let last = null; // останній минулий візит із послугою, що має інтервал
    for (const [id, b] of Object.entries(bks || {})) {
      if (!b || b.status === "cancelled" || b.cancelledBy || b.status === "personal" || b.status === "noshow" || !b.date) continue;
      if (b.date >= today) { upcoming = true; continue; }
      if (interval[b.serviceId] && (!last || b.date > last.b.date)) last = { id, b };
    }
    if (upcoming || !last) continue;
    if (inst?.users?.[uid]?.rebookReminded === last.id) continue;
    const days = dayNum(today) - dayNum(last.b.date);
    if (days >= interval[last.b.serviceId]) out.push({ uid, bookingId: last.id, serviceName: last.b.serviceName || "запис", days });
  }
  return out;
}

module.exports = { findRebookDue };
