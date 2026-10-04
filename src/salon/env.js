import { DEMO_VENDOR } from "../demo/demoMode.js";

// Власник платформи (суперадмін): його email збігається з email у database.rules.json — правила й є справжнім захистом,
// а тут лише вирішується, чи показувати екран «Адмін». У демо — ?demo=1&vendor=1.
export const VENDOR_EMAIL = "sash5385@gmail.com";
export const isVendor = (user) => !!user && (DEMO_VENDOR || user.email === VENDOR_EMAIL);
// Адреси Juno: клієнтський застосунок (посилання для записів) і база для /api (за замовчуванням — той самий хост).
export const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || "https://juno-client.web.app";
export const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE || "";
