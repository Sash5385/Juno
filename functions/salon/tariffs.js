// Тарифи підписки салону за кількістю активних майстрів. Чиста логіка (без Firebase) + завантаження з БД.
// Ціни — це дані, а не код: system/tariffs (пише лише суперадмін) перекриває DEFAULT_TARIFFS без деплою.
// Усі суми в копійках. Рік = yearMonths місяців ціни (типово 10: два місяці в подарунок).
const DEFAULT_TARIFFS = {
  currency: "UAH",
  yearMonths: 10,
  trialMasterLimit: 3,
  tiers: [
    { key: "solo", name: "Соло", maxMasters: 1, monthKop: 19900 },
    { key: "team", name: "Команда", maxMasters: 3, monthKop: 39900 },
    { key: "studio", name: "Студія", maxMasters: 7, monthKop: 69900 },
    { key: "salon", name: "Салон", maxMasters: 15, monthKop: 119900 },
  ],
};

const DAY = 86400000;
const MIN_AMOUNT_KOP = 100;
const PERIODS = [1, 12];

const posInt = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

// Приймає сирий вузол system/tariffs (або null) і повертає коректну таблицю; биті тарифи ігноруються, лишаються типові
function normalizeTariffs(raw) {
  const t = { ...DEFAULT_TARIFFS, tiers: DEFAULT_TARIFFS.tiers.map((x) => ({ ...x })) };
  if (!raw || typeof raw !== "object") return t;
  if (posInt(raw.yearMonths) && Number(raw.yearMonths) <= 12) t.yearMonths = Number(raw.yearMonths);
  if (posInt(raw.trialMasterLimit)) t.trialMasterLimit = Number(raw.trialMasterLimit);
  const src = Array.isArray(raw.tiers) ? raw.tiers : raw.tiers && typeof raw.tiers === "object" ? Object.values(raw.tiers) : [];
  const tiers = src
    .filter((x) => x && typeof x.key === "string" && /^[a-z0-9_-]{1,20}$/.test(x.key) && posInt(x.maxMasters) && posInt(x.monthKop) && Number(x.monthKop) >= MIN_AMOUNT_KOP)
    .map((x) => ({ key: x.key, name: String(x.name || x.key).slice(0, 30), maxMasters: Number(x.maxMasters), monthKop: Number(x.monthKop) }))
    .sort((a, b) => a.maxMasters - b.maxMasters);
  if (tiers.length && new Set(tiers.map((x) => x.key)).size === tiers.length) t.tiers = tiers;
  return t;
}

const periodKop = (tariffs, tier, months) => tier.monthKop * (months === 12 ? tariffs.yearMonths : months);

// +n календарних місяців (UTC; 31 січня + 1 міс = 28/29 лютого)
function addMonths(ms, n) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

const isPaidActive = (lic, now) => !!lic && lic.status === "active" && Number(lic.expiresAt) > now;

// Ліміт майстрів за ліцензією: оплачений тариф → його maxMasters; пробний → trialMasterLimit; активна без тарифу
// (виставлена суперадміном вручну) → без обмеження (найбільший тариф); немає вузла license → null (перевірка вимкнена)
function masterLimitOf(lic, tariffs) {
  if (!lic) return null;
  if (posInt(lic.masterLimit)) return Number(lic.masterLimit);
  if (lic.status === "trial") return tariffs.trialMasterLimit;
  return tariffs.tiers[tariffs.tiers.length - 1].maxMasters;
}

// Розрахунок оплати. mode:
//   "new"      — пробний/прострочена/призупинена: період іде від кінця пробного (якщо ще діє) або від зараз;
//   "extend"   — той самий або нижчий тариф при діючій підписці: період додається в кінець, без перерахунку;
//   "upgrade"  — вищий тариф при діючій підписці: залишок старого тарифу йде знижкою (credit), новий період — від зараз.
// Повертає {error} або {tier, months, mode, baseKop, creditKop, amountKop}. Дата завершення рахується в момент оплати (applyPayment).
function quote(tariffs, lic, { tierKey, months }, activeMasters, now = Date.now()) {
  const tier = tariffs.tiers.find((t) => t.key === tierKey);
  if (!tier) return { error: "bad_tier" };
  if (!PERIODS.includes(months)) return { error: "bad_period" };
  if (activeMasters > tier.maxMasters) return { error: "too_many_masters", maxMasters: tier.maxMasters, activeMasters };
  const baseKop = periodKop(tariffs, tier, months);
  let mode = "new", creditKop = 0;
  if (isPaidActive(lic, now)) {
    const curLimit = masterLimitOf(lic, tariffs);
    if (tier.maxMasters > curLimit) {
      mode = "upgrade";
      const remaining = Math.max(0, Number(lic.expiresAt) - now);
      creditKop = Math.min(baseKop - MIN_AMOUNT_KOP, Math.round((Number(lic.monthKop) || 0) * remaining / (30 * DAY)));
      creditKop = Math.max(0, creditKop);
    } else mode = "extend";
  }
  return { tier, months, mode, baseKop, creditKop, amountKop: Math.max(MIN_AMOUNT_KOP, baseKop - creditKop) };
}

// Нова ліцензія після успішної оплати (на момент оплати, а не виставлення рахунку)
function applyPayment(lic, rec, now = Date.now()) {
  const paidActive = isPaidActive(lic, now);
  const from = rec.mode === "upgrade" ? now
    : paidActive ? Number(lic.expiresAt)
      : Math.max(now, lic && lic.status === "trial" ? Number(lic.trialEndsAt) || 0 : 0);
  return {
    status: "active", provider: "monobank", expiresAt: addMonths(from, rec.months), lastPaymentAt: now,
    tier: rec.tierKey, masterLimit: rec.maxMasters, monthKop: rec.monthKop, lastPaymentId: rec.paymentId,
  };
}

module.exports = { DEFAULT_TARIFFS, MIN_AMOUNT_KOP, PERIODS, normalizeTariffs, addMonths, masterLimitOf, quote, applyPayment, isPaidActive };
