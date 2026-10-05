// Демо-режим: застосунок показує ВИДУМАНІ дані, а Firebase не чіпає взагалі — ні читання,
// ні запису (для скріншотів/реклами). Вмикається адресою з ?demo=1 і пам'ятається
// до закриття вкладки; ?demo=0 вимикає. Без цього параметра нічого не змінюється.
//   ?demo=1&theme=light — демо у світлій (кавовій) темі.
export const DEMO_UID = "demo-instructor";
export const DEMO_USER = { uid: DEMO_UID, email: "demo@drivepad.pro", displayName: "Демо", isAnonymous: false };

const KEY = "dp_demo";
const TKEY = "dp_demo_theme";

function detect() {
  try {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("demo");
    if (d === "0") { sessionStorage.removeItem(KEY); sessionStorage.removeItem(TKEY); return false; }
    if (d === "1") sessionStorage.setItem(KEY, "1");
    const th = q.get("theme");
    if (th === "light" || th === "dark") sessionStorage.setItem(TKEY, th);
    return sessionStorage.getItem(KEY) === "1";
  } catch { return false; }
}

export const DEMO = detect();
export const demoTheme = () => { try { return sessionStorage.getItem(TKEY) || "dark"; } catch { return "dark"; } };
