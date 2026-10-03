// Cloud Functions Juno: салон (bookings, queue, reminders, chat, registry, masters, payments) + загальні (monitoring).
// Схема і ролі: docs/SALON-SCHEMA.md. Усе, що стосувалося інструкторів DrivePad, видалено; повна версія — у гілці main цього репозиторію.
module.exports = {
  ...require("./salon"),
  ...require("./monitoring"),
};

// Firebase бере з exports усе — лишаємо лише обгортки функцій (без внутрішніх хелперів модулів)
for (const k of Object.keys(module.exports)) {
  const v = module.exports[k];
  if (typeof v !== "function" || !v.__endpoint) delete module.exports[k];
}
