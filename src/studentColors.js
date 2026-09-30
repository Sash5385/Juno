// Кольори слотів учнів для ручного режиму (Налаштування → Сітка → "Автокольори учнів" вимкнено).
// Формат такий самий, як в автопалітрі STUDENT_PALETTE (id4drive-admin-v5.jsx).
export const STUDENT_COLOR_CHOICES = [
  ...Array.from({ length: 12 }, (_, i) => `hsl(${i * 30},68%,56%)`),
  "hsl(215,12%,58%)", // нейтральний сірий
];
// Колір учня, якому вручну ще нічого не призначено
export const MANUAL_DEFAULT_COLOR = "hsl(215,12%,58%)";
