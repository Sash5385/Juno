// Допуслуги та перерва після запису.
//  • Допуслуга (service.addons[]) — {id, name, price, minutes}: клієнт відмічає її при записі; ціна додається
//    до вартості, minutes — до тривалості запису (слоти займаються на всю тривалість разом).
//  • Перерва (service.bufferMin) — хвилини «на прибирання/відпочинок» ПІСЛЯ запису: слоти за записом теж
//    займаються, але в тривалість і ціну запису не входять (на сервері вони враховуються в bookingRange).
// Файл однаковий в адмінці й клієнті (src/addons.js) — змінюєте один, копіюйте в інший.

export const ADDON_MINUTES = [0, 15, 30, 45, 60, 90, 120];
export const BUFFER_OPTIONS = [0, 10, 15, 30, 45, 60];
export const MAX_ADDONS = 10;

const num = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : def; };

// Список «як є» (з бази: масив або об'єкт) — для редактора, де можуть бути ще порожні рядки
export const rawAddons = (raw) => (Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []));

// Очищений список допуслуг — безпечний для показу й розрахунку
export function normAddons(raw) {
  return rawAddons(raw)
    .filter((a) => a && typeof a === "object" && String(a.name || "").trim())
    .slice(0, MAX_ADDONS)
    .map((a, i) => ({
      id: String(a.id || `ad${i}`),
      name: String(a.name).trim().slice(0, 40),
      price: Math.round(num(a.price)),
      minutes: Math.min(240, Math.round(num(a.minutes))),
    }));
}

export const bufferOf = (service) => Math.min(120, Math.round(num(service?.bufferMin)));

// Вибрані допуслуги послуги за списком id
export function pickAddons(service, ids) {
  const set = new Set(ids || []);
  return normAddons(service?.addons).filter((a) => set.has(a.id));
}

export function addonsTotals(addons) {
  return (addons || []).reduce((t, a) => ({ price: t.price + (a.price || 0), minutes: t.minutes + (a.minutes || 0) }), { price: 0, minutes: 0 });
}

// Допуслуги, що вже записані в запис: хвилини й сума. Знімок у записі (addons / addonsPrice) — джерело істини,
// навіть якщо майстер потім змінив послугу. Для запису без допуслуг — нулі, тож розрахунки лишаються як були.
export function bookingAddonTotals(b) {
  const t = addonsTotals(normAddons(b?.addons));
  const p = Number(b?.addonsPrice);
  return { minutes: t.minutes, price: b?.addonsPrice != null && Number.isFinite(p) && p >= 0 ? p : t.price };
}

// Знімок допуслуг для запису в базу (без зайвих полів)
export const addonsSnapshot = (addons) => (addons || []).map((a) => ({ id: a.id, name: a.name, price: a.price, minutes: a.minutes }));

// Людський опис «+ Покриття, + Дизайн»
export const addonsLabel = (addons) => (addons || []).map((a) => a.name).join(", ");

// Чи є хоч одна зайнята (available:false) позиція дня в [fromMin, toMin) — slots: { slotHHMM: {time, available} }
// ignoreClosed — не рахувати слоти, закриті майстром (adminBlocked): для перерви, яка може припасти на закритий час.
export function rangeTaken(slots, fromMin, toMin, { ignoreClosed = false } = {}) {
  return Object.values(slots || {}).some((s) => {
    if (!s || s.available !== false || !s.time) return false;
    if (ignoreClosed && s.adminBlocked) return false;
    const [h, m] = String(s.time).split(":").map(Number);
    const t = h * 60 + (m || 0);
    return t >= fromMin && t < toMin;
  });
}
