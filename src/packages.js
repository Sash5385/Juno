// Пакети (абонементи): шаблони задає майстер (Налаштування → Пакети, admin_settings/packages), а в картці клієнта
// додає йому конкретний пакет (users/{uid}/packages/{id}). Запис «за пакетом» списує один запис — це робить сервер
// (functions: consumePackage/releasePackage), клієнт лише читає. Залишок = total − кількість uses.
// Файл однаковий в адмінці й клієнті (src/packages.js) — змінюєте один, копіюйте в інший.

export const MAX_TEMPLATES = 10;
const list = (raw) => (Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []));
const num = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : def; };

// Шаблони пакетів майстра: { id, name, count, days (0 — без терміну), serviceIds ([] — будь-які послуги), price }
export function normPackageTemplates(raw) {
  return list(raw)
    .filter((t) => t && typeof t === "object" && String(t.name || "").trim())
    .slice(0, MAX_TEMPLATES)
    .map((t, i) => ({
      id: String(t.id || `pk${i}`).slice(0, 40),
      name: String(t.name).trim().slice(0, 40),
      count: Math.max(1, Math.min(200, Math.round(num(t.count, 1)))),
      days: Math.min(1095, Math.round(num(t.days))),
      serviceIds: list(t.serviceIds).map(String).slice(0, 30),
      price: Math.round(num(t.price)),
    }));
}

// Пакет клієнта з обчисленим залишком. uses — { ключ: мітка часу }
export function normPackages(raw) {
  return list(raw)
    .filter((p) => p && typeof p === "object" && p.id)
    .map((p) => {
      const total = Math.round(num(p.total));
      const used = Object.keys(p.uses || {}).length;
      return {
        id: String(p.id), name: String(p.name || "Пакет"), total, used, left: Math.max(0, total - used),
        expiresAt: p.expiresAt ? Number(p.expiresAt) : null,
        serviceIds: list(p.serviceIds).map(String),
        createdAt: p.createdAt || 0,
      };
    })
    .sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity) || a.createdAt - b.createdAt);
}

const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Чи можна списати запис на послугу serviceId у день dateStr (YYYY-MM-DD): є залишок, термін не минув (рахуємо
// за датою запису), послуга входить у пакет (порожній список — будь-яка)
export function packageUsable(pkg, serviceId, dateStr) {
  if (!pkg || pkg.left <= 0) return false;
  if (pkg.expiresAt && dateStr && dateStr > dayOf(pkg.expiresAt)) return false;
  return !pkg.serviceIds.length || pkg.serviceIds.includes(serviceId);
}

// Перший придатний пакет (найближчий за терміном) або null
export const pickPackage = (packages, serviceId, dateStr) => packages.find((p) => packageUsable(p, serviceId, dateStr)) || null;

// Новий пакет клієнта із шаблону (для запису в БД)
export function buildClientPackage(tpl, now = Date.now()) {
  return {
    id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: tpl.name, total: tpl.count, createdAt: now,
    ...(tpl.days > 0 ? { expiresAt: now + tpl.days * 86400000 } : {}),
    ...(tpl.serviceIds.length ? { serviceIds: tpl.serviceIds } : {}),
    ...(tpl.price > 0 ? { price: tpl.price } : {}),
  };
}

export const packageLabel = (p) => `${p.name}: ${p.left} з ${p.total}`;
export const expiresLabel = (p) => (p.expiresAt ? `до ${new Date(p.expiresAt).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}` : "без терміну");
