// Тарифи підписки для екрана суперадміна: типові значення (копія functions/salon/tariffs.js — це перевіряє
// tests/unit/salonTariffs.test.mjs) і перевірка форми перед записом у system/tariffs. Чиста логіка без Firebase і React.
export const DEFAULT_TARIFFS = {
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

const KEY_RE = /^[a-z0-9_-]{1,20}$/;
const MIN_KOP = 100;

// Чернетка форми: { yearMonths, trialMasterLimit, tiers:[{key, name, maxMasters, price}] } — рядки/числа, ціна в гривнях.
export const toDraft = (t) => ({
  yearMonths: String(t.yearMonths), trialMasterLimit: String(t.trialMasterLimit),
  tiers: t.tiers.map((x) => ({ key: x.key, name: x.name, maxMasters: String(x.maxMasters), price: String(x.monthKop / 100) })),
});

// Повертає { errors: string[], value } — value придатний для запису в system/tariffs (ціни в копійках), коли errors порожній
export function validateDraft(d) {
  const errors = [];
  const int = (v) => (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN);
  const yearMonths = int(d.yearMonths), trial = int(d.trialMasterLimit);
  if (!(yearMonths >= 1 && yearMonths <= 12)) errors.push("Річна оплата: кількість місяців від 1 до 12");
  if (!(trial >= 1)) errors.push("Ліміт майстрів на пробному періоді — ціле число від 1");
  if (!d.tiers.length) errors.push("Потрібен хоча б один тариф");
  const keys = new Set(), limits = new Set();
  const tiers = d.tiers.map((t, i) => {
    const n = i + 1;
    const maxMasters = int(t.maxMasters);
    const price = Number(String(t.price).replace(",", "."));
    if (!KEY_RE.test(t.key)) errors.push(`Тариф ${n}: код — латиниця, цифри, - або _ (до 20 символів)`);
    if (keys.has(t.key)) errors.push(`Тариф ${n}: код «${t.key}» вже є`);
    keys.add(t.key);
    if (!String(t.name).trim()) errors.push(`Тариф ${n}: вкажіть назву`);
    if (!(maxMasters >= 1)) errors.push(`Тариф ${n}: ліміт майстрів — ціле число від 1`);
    if (limits.has(maxMasters)) errors.push(`Тариф ${n}: ліміт ${maxMasters} майстрів вже є в іншому тарифі`);
    limits.add(maxMasters);
    if (!(Number.isFinite(price) && Math.round(price * 100) >= MIN_KOP)) errors.push(`Тариф ${n}: ціна від 1 ₴ за місяць`);
    return { key: t.key, name: String(t.name).trim().slice(0, 30), maxMasters, monthKop: Math.round(price * 100) };
  }).sort((a, b) => a.maxMasters - b.maxMasters);
  // Чим більший ліміт — тим дорожче: інакше «підвищення» тарифу вийшло б дешевшим
  for (let i = 1; i < tiers.length; i++) if (tiers[i].monthKop <= tiers[i - 1].monthKop) { errors.push(`«${tiers[i].name}» має бути дорожчим за «${tiers[i - 1].name}»`); break; }
  return { errors, value: { yearMonths, trialMasterLimit: trial, tiers } };
}
