// Власні налаштування майстра салону: instructors/{iid}/master_settings/{mid}
//   { weekSchedule, workStart, workEnd, lunchEnabled, lunchStart, lunchEnd,   ← власний графік (якщо є weekSchedule)
//     svc: { [serviceId]: { price, duration, active } } }                      ← перевизначення послуг салону
// Немає запису / поля — діють налаштування салону. Той самий розклад і для клієнтського застосунку.
export const MS_SCHEDULE_KEYS = ["workStart", "workEnd", "weekSchedule", "lunchEnabled", "lunchStart", "lunchEnd"];

export const hasOwnSchedule = (ms) => !!ms && Array.isArray(ms.weekSchedule) && ms.weekSchedule.length > 0;

// Графік майстра поверх налаштувань салону (дати-винятки dateOverrides лишаються спільними)
export function mergeMasterSchedule(settings, ms) {
  if (!hasOwnSchedule(ms)) return settings;
  const out = { ...settings };
  for (const k of MS_SCHEDULE_KEYS) if (ms[k] != null) out[k] = ms[k];
  return out;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Послуги салону з ціною/тривалістю/доступністю майстра
export function mergeMasterServices(services, ms) {
  const ov = ms && ms.svc;
  if (!Array.isArray(services) || !ov) return services;
  return services.map((s) => {
    const o = ov[s.id];
    if (!o) return s;
    const next = { ...s };
    if (num(o.price) != null) next.price = o.price;
    if (num(o.duration) != null) next.duration = o.duration;
    if (o.active === false) next.active = false;
    return next;
  });
}

export const applyMasterSettings = (settings, ms) => {
  const merged = mergeMasterSchedule(settings, ms);
  return ms && ms.svc && Array.isArray(merged.services) ? { ...merged, services: mergeMasterServices(merged.services, ms) } : merged;
};
