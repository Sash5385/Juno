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

// «Давно не були»: останній візит рівно ≥ days днів тому, майбутніх записів немає, за цей візит ще не писали
// (users/{uid}/winbackSent = id візиту). Повертає [{ uid, bookingId, days }]
function findWinbackDue(inst, today, days) {
  const out = [];
  if (!(days > 0)) return out;
  for (const [uid, bks] of Object.entries(inst?.bookings || {})) {
    if (uid === "admin" || uid === "personal" || uid.startsWith("guest_")) continue;
    if (inst?.users?.[uid]?.blocked || !inst?.users?.[uid]) continue;
    let upcoming = false, last = null;
    for (const [id, b] of Object.entries(bks || {})) {
      if (!b || b.status === "cancelled" || b.cancelledBy || b.status === "personal" || b.status === "noshow" || !b.date) continue;
      if (b.date >= today) { upcoming = true; break; }
      if (!last || b.date > last.b.date) last = { id, b };
    }
    if (upcoming || !last) continue;
    if (inst.users[uid].winbackSent === last.id) continue;
    const d = dayNum(today) - dayNum(last.b.date);
    if (d >= days && d <= days + 14) out.push({ uid, bookingId: last.id, days: d }); // лише «свіжі» — не розсилаємо всім, хто зник роки тому
  }
  return out;
}

// День народження: дата з анкети клієнта (поле з «народж»/«birth» у назві) або profile.birthday.
// Формати: YYYY-MM-DD, DD.MM.YYYY, DD.MM. Повертає [uid] у кого сьогодні ДН і цього року ще не вітали (users/{uid}/bdaySent = рік)
function birthdayMD(u) {
  const items = Array.isArray(u?.intake?.items) ? u.intake.items : Object.values(u?.intake?.items || {});
  const raw = String((items.find((x) => x && /народж|birth/i.test(String(x.label || "")))?.value) || u?.profile?.birthday || "").trim();
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}-${m[3]}`;
  m = raw.match(/^(\d{1,2})[./](\d{1,2})/);
  if (m) return `${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
function findBirthdays(inst, today) {
  const md = today.slice(5), year = today.slice(0, 4);
  return Object.entries(inst?.users || {})
    .filter(([, u]) => u && !u.blocked && birthdayMD(u) === md && String(u.bdaySent || "") !== year)
    .map(([uid]) => uid);
}

module.exports = { findRebookDue, findWinbackDue, findBirthdays, birthdayMD };
