// Анкета клієнта: майстер задає поля (Налаштування → Анкета), клієнт заповнює один раз перед записом.
//  • Форма живе в admin_settings/intake: { enabled, fields: [{ id, label, type, required, options? }] } (читається клієнтом).
//  • Відповіді клієнта — users/{uid}/intake: { at, items: [{ id, label, value }] }; value завжди рядок, label — знімок
//    назви поля на момент відповіді (майстер потім може перейменувати поле, а відповідь лишається зрозумілою).
// Файл однаковий в адмінці й клієнті (src/intake.js) — змінюєте один, копіюйте в інший.

export const FIELD_TYPES = [
  { id: "text", label: "Короткий текст" },
  { id: "select", label: "Вибір зі списку" },
  { id: "yesno", label: "Так / Ні" },
  { id: "date", label: "Дата" },
];
export const MAX_FIELDS = 12;
export const MAX_OPTIONS = 10;
export const YES = "Так";
export const NO = "Ні";

const TYPE_IDS = FIELD_TYPES.map((t) => t.id);
const list = (raw) => (Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []));

// Очищена форма (з бази або з редактора): безпечна для показу. Поле без назви відкидається,
// «вибір» без варіантів перетворюється на текст.
export function normIntake(raw) {
  const fields = list(raw?.fields)
    .filter((f) => f && typeof f === "object" && String(f.label || "").trim())
    .slice(0, MAX_FIELDS)
    .map((f, i) => {
      const type = TYPE_IDS.includes(f.type) ? f.type : "text";
      const options = type === "select"
        ? list(f.options).map((o) => String(o ?? "").trim().slice(0, 40)).filter(Boolean).slice(0, MAX_OPTIONS)
        : [];
      const t = type === "select" && options.length === 0 ? "text" : type;
      return {
        id: String(f.id || `f${i}`).slice(0, 40),
        label: String(f.label).trim().slice(0, 80),
        type: t,
        required: !!f.required,
        ...(t === "select" ? { options } : {}),
      };
    });
  return { enabled: raw?.enabled !== false && fields.length > 0, fields };
}

// Відповіді, які вже збережені у клієнта: { id: value }
export const answersOf = (saved) => Object.fromEntries(list(saved?.items).filter((x) => x && x.id).map((x) => [x.id, String(x.value ?? "")]));

// Обов'язкові поля, на які ще немає відповіді (answers: { id: value })
export function missingRequired(form, answers) {
  return (form?.fields || []).filter((f) => f.required && !String(answers?.[f.id] ?? "").trim());
}

// Чи потрібно показати анкету перед записом: форма увімкнена і є обов'язкове поле без відповіді,
// або клієнт анкету ще жодного разу не заповнював (необов'язкові поля теж пропонуємо один раз).
export function intakeNeeded(form, saved) {
  if (!form?.enabled || !form.fields.length) return false;
  const answers = answersOf(saved);
  if (missingRequired(form, answers).length) return true;
  return !saved?.at;
}

// Знімок відповідей для збереження: лише непорожні значення полів, що є у формі
export function buildItems(form, answers) {
  return (form?.fields || [])
    .map((f) => ({ id: f.id, label: f.label, value: String(answers?.[f.id] ?? "").trim().slice(0, 500) }))
    .filter((x) => x.value);
}
