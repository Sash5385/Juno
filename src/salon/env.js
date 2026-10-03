// Режим «салон»: збірка з VITE_APP_MODE=salon (npm run build:salon) або адреса з ?app=salon (для розробки і смоук-тесту,
// пам'ятається до закриття вкладки; ?app=dr вимикає). Без цього застосунок лишається адмінкою інструктора DrivePad.
function detect() {
  try {
    if (import.meta.env.VITE_APP_MODE === "salon") return true;
    const q = new URLSearchParams(window.location.search).get("app");
    if (q === "dr") { sessionStorage.removeItem("dp_app"); return false; }
    if (q === "salon") sessionStorage.setItem("dp_app", "salon");
    return sessionStorage.getItem("dp_app") === "salon";
  } catch { return false; }
}
export const SALON_MODE = detect();
export const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || "https://drivepad-client.web.app";
export const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE || "";
