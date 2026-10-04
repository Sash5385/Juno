// Демо-режим: застосунок показує ВИДУМАНІ дані, а Firebase не чіпає взагалі — ні читання,
// ні запису (для скріншотів/реклами). Вмикається адресою з ?demo=1 і пам'ятається
// до закриття вкладки; ?demo=0 вимикає. Без цього параметра нічого не змінюється.
//   ?demo=1&theme=light — демо у світлій (кавовій) темі.
export const DEMO_UID = "demo-owner";
export const DEMO_USER = { uid: DEMO_UID, email: "demo@juno.app", displayName: "Демо", isAnonymous: false };

const KEY = "juno_demo";
const TKEY = "juno_demo_theme";

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

// ?demo=1&vendor=1 — демо від імені власника платформи (екран суперадміна); ?vendor=0 вимикає
const VKEY = "juno_demo_vendor";
function detectVendor() {
  try {
    const v = new URLSearchParams(window.location.search).get("vendor");
    if (v === "0") sessionStorage.removeItem(VKEY);
    if (v === "1") sessionStorage.setItem(VKEY, "1");
    return DEMO && sessionStorage.getItem(VKEY) === "1";
  } catch { return false; }
}
export const DEMO_VENDOR = detectVendor();
export const demoTheme = () => { try { return sessionStorage.getItem(TKEY) || "dark"; } catch { return "dark"; } };
