// Додаткові обчислення для вкладки «Статистика» (етап 1: вкладки Огляд / Майстри / Клієнти / Завантаження).
// Чисті функції без React — на вході вже зібраний список записів (з _uid/_key), на виході прості об'єкти.

export const isActive = (b) => { const st = b.status || "confirmed"; return st === "confirmed" || st === "pending"; };
const isCounted = (b) => { const st = b.status || "confirmed"; return st === "confirmed" || st === "pending" || st === "cancelled" || st === "noshow"; };
const durMinOf = (b) => b.durMin || (b.durationHours ? b.durationHours * 60 : 60);
const startHourOf = (b) => {
  if (b.startMin != null) return Math.floor(b.startMin / 60);
  const h = parseInt((b.time || "").split(":")[0], 10);
  return Number.isFinite(h) ? h : null;
};
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dowMon0 = (dateStr) => (new Date(dateStr + "T00:00:00").getDay() + 6) % 7; // 0 = Пн

// Дати, які покриває обраний період (ключі бакетів: дата, дата_година або рік-місяць)
export function periodDates(data, period) {
  const out = new Set();
  data.forEach((d) => {
    const k = String(d.key || "");
    if (period === "year") {
      const [y, m] = k.split("-").map(Number);
      if (!y || !m) return;
      const n = new Date(y, m, 0).getDate();
      for (let i = 1; i <= n; i++) out.add(ymd(new Date(y, m - 1, i)));
    } else {
      out.add(k.slice(0, 10));
    }
  });
  return [...out].sort();
}

// Робочі години дня за тижневим графіком (з урахуванням обіду)
function dayHours(week, dateStr) {
  const d = Array.isArray(week) ? week[dowMon0(dateStr)] : null;
  if (!d || !d.enabled || d.start == null || d.end == null) return 0;
  const lunch = d.lunchEnabled ? Math.max(0, (d.lunchEnd ?? 13) - (d.lunchStart ?? 12)) : 0;
  return Math.max(0, d.end - d.start - lunch);
}

// Завантаження: заброньовані години / робочі години за період (null — графік невідомий)
export function utilization(bookings, dates, week) {
  const avail = dates.reduce((s, ds) => s + dayHours(week, ds), 0);
  if (!avail) return null;
  const set = new Set(dates);
  const booked = bookings.filter((b) => isActive(b) && set.has(b.date)).reduce((s, b) => s + durMinOf(b) / 60, 0);
  return Math.min(100, Math.round((booked / avail) * 100));
}

// Скасування і неявки за період: причини + втрачена виручка
export function cancelStats(periodBookings, incomeOf) {
  const r = { total: 0, active: 0, client: 0, salon: 0, system: 0, noshow: 0, lost: 0 };
  periodBookings.forEach((b) => {
    if (!isCounted(b)) return;
    r.total++;
    const st = b.status || "confirmed";
    if (st === "noshow") { r.noshow++; r.lost += incomeOf(b); return; }
    if (st !== "cancelled") { r.active++; return; }
    r.lost += incomeOf(b);
    if (!b.cancelledBy) r.client++;
    else if (b.cancelledBy === "admin") r.salon++;
    else r.system++;
  });
  r.cancelled = r.client + r.salon + r.system;
  r.pct = r.total ? Math.round(((r.cancelled + r.noshow) / r.total) * 100) : 0;
  return r;
}

// Звідки записи: онлайн (клієнт сам) чи внесені вручну в адмінці
export function sources(periodBookings) {
  let online = 0, manual = 0;
  periodBookings.forEach((b) => { if (!isActive(b)) return; if (b.createdBy === "admin") manual++; else online++; });
  return { online, manual, total: online + manual };
}

// Клієнти: нові за період, постійні, середній інтервал між візитами, «сплячі»
export function clientStats(allBookings, periodBookings, todayStr, sleepDays = 60) {
  const byUid = {};
  allBookings.forEach((b) => {
    if (!isActive(b) || !b.date || !b._uid) return;
    const c = (byUid[b._uid] ||= { uid: b._uid, name: b.studentName || b.name || "Без імені", dates: new Set(), future: false });
    c.dates.add(b.date);
    if (b.date > todayStr) c.future = true;
  });
  const inPeriod = new Set(periodBookings.filter((b) => isActive(b) && b._uid).map((b) => b._uid));
  const periodDatesByUid = {};
  periodBookings.forEach((b) => { if (isActive(b) && b._uid && b.date) (periodDatesByUid[b._uid] ||= []).push(b.date); });
  let fresh = 0;
  inPeriod.forEach((uid) => {
    const c = byUid[uid]; if (!c) return;
    const first = [...c.dates].sort()[0];
    if ((periodDatesByUid[uid] || []).includes(first)) fresh++;
  });
  // Середній інтервал між візитами (лише минулі дати, клієнти з 2+ візитами)
  const gaps = [];
  Object.values(byUid).forEach((c) => {
    const past = [...c.dates].filter((d) => d <= todayStr).sort();
    for (let i = 1; i < past.length; i++) gaps.push((new Date(past[i] + "T00:00:00") - new Date(past[i - 1] + "T00:00:00")) / 86400000);
  });
  const avgGap = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
  // «Сплячі»: був хоча б раз, останній візит давніше sleepDays днів, наперед нічого немає
  const limit = new Date(todayStr + "T00:00:00"); limit.setDate(limit.getDate() - sleepDays);
  const limitStr = ymd(limit);
  const sleeping = Object.values(byUid)
    .filter((c) => !c.future)
    .map((c) => { const past = [...c.dates].filter((d) => d <= todayStr).sort(); return { ...c, visits: past.length, last: past[past.length - 1] }; })
    .filter((c) => c.last && c.last < limitStr)
    .map((c) => ({ uid: c.uid, name: c.name, visits: c.visits, last: c.last, days: Math.round((new Date(todayStr + "T00:00:00") - new Date(c.last + "T00:00:00")) / 86400000) }))
    .sort((a, b) => b.visits - a.visits || a.days - b.days);
  return { total: inPeriod.size, fresh, regular: inPeriod.size - fresh, avgGap, sleeping };
}

// Послуги за період: кількість і виручка
export function serviceStats(periodBookings, services, incomeOf) {
  const map = {};
  periodBookings.forEach((b) => {
    if (!isActive(b)) return;
    const svc = (services || []).find((s) => s.id === b.serviceId);
    const name = svc?.name || b.serviceName || null;
    if (!name) return;
    const r = (map[name] ||= { name, n: 0, sum: 0 });
    r.n++; r.sum += incomeOf(b);
  });
  return Object.values(map);
}

// Теплокарта «день тижня × година»: кількість зайнятих годин у кожній клітинці
export function heatmap(periodBookings, fromH, toH) {
  const hours = [];
  for (let h = fromH; h < toH; h++) hours.push(h);
  const grid = Array.from({ length: 7 }, () => hours.map(() => 0));
  periodBookings.forEach((b) => {
    if (!isActive(b) || !b.date) return;
    const h0 = startHourOf(b); if (h0 == null) return;
    const span = Math.max(1, Math.ceil(durMinOf(b) / 60));
    const row = grid[dowMon0(b.date)];
    for (let h = h0; h < h0 + span; h++) { const i = h - fromH; if (i >= 0 && i < row.length) row[i]++; }
  });
  const max = Math.max(1, ...grid.flat());
  return { hours, grid, max };
}

// Найменш завантажений відрізок (2 години поспіль у робочий день) — підказка для акції
export function quietestSlot(hm, week) {
  let best = null;
  // Години, у які за період не було жодного запису в жоден день, — найімовірніше перерва або неробочий час
  const colSum = hm.hours.map((_, i) => hm.grid.reduce((s, row) => s + row[i], 0));
  hm.grid.forEach((row, d) => {
    const day = Array.isArray(week) ? week[d] : null;
    if (week && (!day || !day.enabled)) return;
    for (let i = 0; i + 1 < row.length; i++) {
      const h = hm.hours[i];
      if (day && (h < day.start || h + 2 > day.end)) continue;
      // обідня перерва — не «вільний час»
      if (day && day.lunchEnabled && h < (day.lunchEnd ?? 13) && h + 2 > (day.lunchStart ?? 12)) continue;
      if (!colSum[i] || !colSum[i + 1]) continue;
      const v = row[i] + row[i + 1];
      if (!best || v < best.v) best = { d, h, v };
    }
  });
  return best;
}

// ── Етап 3: показники під напрямок ─────────────────────────────

// Відвідуваність: минулі записи, що відбулись / (відбулись + не прийшов)
export function attendance(periodBookings, todayStr) {
  let came = 0, missed = 0;
  periodBookings.forEach((b) => {
    if (!b.date || b.date > todayStr) return;
    if (isActive(b)) came++; else if ((b.status || "") === "noshow") missed++;
  });
  return { came, missed, pct: came + missed ? Math.round((came / (came + missed)) * 100) : null };
}

// Утримання: клієнти, що вперше прийшли в місяці, і скільки з них досі ходять (запис за останні 30 днів або наперед)
export function cohorts(allBookings, todayStr, months = 4) {
  const first = {}, last = {};
  allBookings.forEach((b) => {
    if (!isActive(b) || !b.date || !b._uid) return;
    if (!first[b._uid] || b.date < first[b._uid]) first[b._uid] = b.date;
    if (!last[b._uid] || b.date > last[b._uid]) last[b._uid] = b.date;
  });
  const t = new Date(todayStr + "T00:00:00");
  const since = new Date(t); since.setDate(since.getDate() - 30);
  const sinceStr = ymd(since);
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const uids = Object.keys(first).filter((u) => first[u].slice(0, 7) === key);
    const kept = uids.filter((u) => last[u] >= sinceStr).length;
    out.push({ month: d.getMonth(), total: uids.length, kept, pct: uids.length ? Math.round((kept / uids.length) * 100) : null });
  }
  return out;
}

// Тривалість курсу: скільки минулих записів на клієнта, розподіл і частка тих, хто повернувся після першого
export function courseStats(allBookings, todayStr) {
  const dates = {};
  allBookings.forEach((b) => { if (isActive(b) && b.date && b._uid && b.date <= todayStr) (dates[b._uid] ||= new Set()).add(b.date); });
  const counts = Object.values(dates).map((s) => s.size).filter((n) => n > 0);
  const total = counts.length;
  const buckets = [["1", (n) => n === 1], ["2–4", (n) => n >= 2 && n <= 4], ["5–10", (n) => n >= 5 && n <= 10], ["10+", (n) => n > 10]]
    .map(([label, f]) => ({ label, n: counts.filter(f).length }));
  return {
    total,
    avg: total ? Math.round((counts.reduce((s, n) => s + n, 0) / total) * 10) / 10 : null,
    returned: total ? Math.round((counts.filter((n) => n >= 2).length / total) * 100) : null,
    buckets,
  };
}

// Пакети (абонементи) клієнтів: users/{uid}/packages. Активні, продані за період, ті, що закінчуються (≤ 2 записи)
export function packageStats(users, dates, nowMs = Date.now()) {
  const set = new Set(dates);
  const r = { active: 0, sold: 0, soldSum: 0, ending: [] };
  Object.entries(users || {}).forEach(([uid, u]) => {
    const raw = u && u.packages;
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    list.forEach((p) => {
      if (!p || typeof p !== "object" || !p.id) return;
      const total = Math.max(0, Math.round(Number(p.total) || 0));
      const left = Math.max(0, total - Object.keys(p.uses || {}).length);
      const expired = p.expiresAt && Number(p.expiresAt) < nowMs;
      if (p.createdAt && set.has(ymd(new Date(Number(p.createdAt))))) { r.sold++; r.soldSum += Math.max(0, Number(p.price) || 0); }
      if (left <= 0 || expired) return;
      r.active++;
      if (left <= 2) r.ending.push({ uid, name: (u.profile && u.profile.name) || u.name || "Клієнт", left, total, pkName: String(p.name || "Пакет") });
    });
  });
  r.ending.sort((a, b) => a.left - b.left);
  return r;
}
