// Кольори слотів клієнтів для ручного режиму (Налаштування → Сітка → "Автокольори клієнтів" вимкнено).
// 50 відтінків — ті самі, що й в автопалітрі STUDENT_PALETTE (id4drive-admin-v5.jsx).
export const STUDENT_COLOR_CHOICES = Array.from({ length: 50 }, (_, i) => `hsl(${Math.round(i * 360 / 50)},68%,56%)`);
// Колір клієнта, якому вручну ще нічого не призначено
export const MANUAL_DEFAULT_COLOR = "hsl(215,12%,58%)";
