// Демо-режим: застосунок показує ВИДУМАНІ дані, а Firebase не чіпає взагалі — ні читання,
// ні запису (для скріншотів/реклами). Вмикається адресою з ?demo=1 і пам'ятається
// до закриття вкладки; ?demo=0 вимикає. Без цього параметра нічого не змінюється.
//   ?demo=1&theme=light — демо у світлій (кавовій) темі.
export const DEMO_UID = "demo-instructor";
// ?demo=1&salon=N&as=K (K=1..N) — вхід очима майстра K (uid demo-master-K), а не власника.
// salon та as запам'ятовуються до закриття вкладки (як і сам demo), щоб не губились при перезавантаженні/зміні адреси.
const PKEY = (n) => `dp_demo_${n}`;
export const demoParam = (name) => {
  try { return new URLSearchParams(window.location.search).get(name) || sessionStorage.getItem(PKEY(name)) || ""; } catch { return ""; }
};
export const DEMO_AS = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    // нове посилання demo=1 повністю задає salon/as (без них — звичайне демо); без demo у URL беремо збережене
    const pick = (n) => (q.get("demo") === "1" ? q.get(n) || "" : demoParam(n));
    const k = parseInt(pick("as"), 10), n = parseInt(pick("salon"), 10);
    return k >= 1 && n >= 2 && k <= Math.min(30, n) ? k : 0;
  } catch { return 0; }
})();
export const DEMO_USER = DEMO_AS
  ? { uid: `demo-master-${DEMO_AS}`, email: `master${DEMO_AS}@drivepad.pro`, displayName: "Демо майстер", isAnonymous: false }
  : { uid: DEMO_UID, email: "demo@drivepad.pro", displayName: "Демо", isAnonymous: false };

const KEY = "dp_demo";
const TKEY = "dp_demo_theme";

function detect() {
  try {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("demo");
    if (d === "0") { [KEY, TKEY, PKEY("salon"), PKEY("as")].forEach((k) => sessionStorage.removeItem(k)); return false; }
    if (d === "1") {
      sessionStorage.setItem(KEY, "1");
      ["salon", "as"].forEach((n) => { const v = q.get(n); if (v) sessionStorage.setItem(PKEY(n), v); else sessionStorage.removeItem(PKEY(n)); });
    }
    const pr = q.get("preset");
    if (pr) sessionStorage.setItem("dp_demo_preset", pr);
    const th = q.get("theme");
    if (th === "light" || th === "dark") sessionStorage.setItem(TKEY, th);
    return sessionStorage.getItem(KEY) === "1";
  } catch { return false; }
}

export const DEMO = detect();
export const demoTheme = () => { try { return sessionStorage.getItem(TKEY) || "dark"; } catch { return "dark"; } };
// Готові демо-розклади для різних сфер: ?demo=1&preset=barber|nails|cosmo|tutor|psy (див. demoData.js PRESETS)
export const demoPreset = () => { try { return sessionStorage.getItem("dp_demo_preset") || ""; } catch { return ""; } };
