// Адреси Juno: клієнтський застосунок (посилання для записів) і база для /api (за замовчуванням — той самий хост).
export const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || "https://juno-client.web.app";
export const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE || "";
