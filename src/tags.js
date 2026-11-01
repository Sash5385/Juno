// Мітки записів: список редагує майстер (Налаштування → Мітки), зберігається в admin_settings/tags.
// "first" (1-й запис) і "debt" (борг) ставляться автоматично — їх можна перейменувати/змінити значок
// і колір, але не видалити. Решта — довільні: значок + текст + колір.
import { RED, TEAL, BLUE, GOLD, GREEN, PURPLE } from "./theme.js";

export const TAG_COLORS = { red: RED, teal: TEAL, blue: BLUE, gold: GOLD, green: GREEN, purple: PURPLE };
export const TAG_ICONS = ["🚨","🔍","⭐","💸","🔥","❗","✅","⏰","📌","🎁","💎","👑","🎯","📝","📞","💬","🛠️","🧾","🔁","🆕","❤️","👍","⚠️","🏷️","🚗","🏠","🎂","🧴","✂️","💅"];
export const AUTO_TAG_IDS = ["first", "debt"];
export const DEFAULT_TAGS = [
  { id: "exam",  icon: "🚨", label: "Важливо",   colorId: "red" },
  { id: "check", icon: "🔍", label: "Перевірка", colorId: "teal" },
  { id: "first", icon: "⭐", label: "1-й запис", colorId: "blue" },
  { id: "debt",  icon: "💸", label: "Борг",      colorId: "gold" },
];

function resolve(list) {
  return list.map(t => ({ ...t, color: TAG_COLORS[t.colorId] || BLUE }));
}

// Живий список для рендеру (імпорт-«живе посилання»); оновлюється через setTags(settings.tags)
export let TAG_PRESETS = resolve(DEFAULT_TAGS);

export function normalizeTags(raw) {
  if (!raw) return DEFAULT_TAGS; // ще не налаштовано — стандартні
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
  const clean = arr
    .filter(t => t && typeof t.id === "string" && t.id)
    .map(t => ({ id: t.id, icon: String(t.icon || "🏷️").slice(0, 4), label: String(t.label || "").slice(0, 20) || "Мітка", colorId: TAG_COLORS[t.colorId] ? t.colorId : "blue" }));
  // службові «first» і «debt» мають бути завжди
  DEFAULT_TAGS.filter(d => AUTO_TAG_IDS.includes(d.id)).forEach(d => { if (!clean.some(c => c.id === d.id)) clean.push(d); });
  return clean.length ? clean : DEFAULT_TAGS;
}

export function setTags(raw) {
  TAG_PRESETS = resolve(raw ? normalizeTags(raw) : DEFAULT_TAGS);
}
