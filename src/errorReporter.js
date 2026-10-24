// Моніторинг помилок: необроблені помилки браузера йдуть на /api/report-error
// (functions: reportError → system/errorLog, вкладка "Помилки" в суперадмінці + push власнику).
import { APP_VERSION } from "./version.js";
import { DEMO } from "./demo/demoMode";

const APP_NAME = "admin";
const MAX_PER_SESSION = 8;
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /license_readonly/,
  /Режим читання: підписку не оплачено|Read-only mode: subscription not paid/, // очікувана відмова захисту readonly, не баг
  /AbortError/,
  /Failed to fetch|Load failed|NetworkError|network error/i, // немає мережі — не баг застосунку
  /chrome-extension:|moz-extension:|safari-extension:/,
  // Збої реєстрації/оновлення service worker у самому браузері (бот, режим економії, обрив мережі) — не баг застосунку
  /Failed to (update|register) a ServiceWorker/i,
  /^Rejected$/,
  /newestWorker is null/i,
  // Push не підтримується браузером (iOS Chrome/Safari без початкового екрана тощо) — застосунок це вже обробляє
  /messaging\/unsupported-browser/i,
  // Стара версія після деплою не знайшла файл застосунку — сторінка сама перезавантажується (див. main.jsx)
  /not a valid JavaScript MIME type|dynamically imported module|Importing a module script failed/i,
  // Побічний ефект того ж збою у вкладках зі старою версією (lazy-чанка вже немає, сторінка перезавантажується)
  /Cannot read properties of undefined \(reading 'default'\)/,
];

const seen = new Set();
let sent = 0;

export function reportError(error, extra = "") {
  try {
    if (DEMO || sent >= MAX_PER_SESSION) return;
    const message = String((error && error.message) || error || "").slice(0, 300);
    const stack = String((error && error.stack) || extra || "").slice(0, 1500);
    if (!message || IGNORE.some((re) => re.test(message) || re.test(stack))) return;
    const key = message + stack.slice(0, 80);
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;
    fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ app: APP_NAME, message, stack, url: location.pathname, version: APP_VERSION, ua: navigator.userAgent }),
    }).catch(() => {});
  } catch { /* звіт про помилку сам не має ламати застосунок */ }
}

export function initErrorReporter() {
  if (DEMO || typeof window === "undefined") return;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  window.addEventListener("error", (e) => reportError(e.error || e.message, e.filename ? `${e.filename}:${e.lineno}` : ""));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason));
}
