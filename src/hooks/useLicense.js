import { useState, useEffect } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";

// undefined = ще завантажується, null = вузла license нема в базі (доступ
// дозволено як і раніше — фіча вимкнена, поки для інстанції не заведено ліцензію).
// iid передається явно (а не через глобальний _iid з firebase.js), щоб уникнути
// гонки: цей хук може відпрацювати раніше, ніж useAdminAuth() встигне визначити iid.
export function useLicense(iid) {
  const [license, setLicense] = useState(undefined);
  useEffect(() => {
    if (!iid) { setLicense(undefined); return; }
    return onValue(ref(db, `instructors/${iid}/license`), snap => setLicense(snap.val()), () => setLicense(null));
  }, [iid]);
  return license;
}

// true лише в режимі "читання" (пільгова доба ще не вважається блокуванням)
export function isLicenseBlocked(license) {
  return licenseState(license).level === "readonly";
}

// ─── Стани ліцензії ────────────────────────────────────────────────
// ok       — термін далеко / ліцензії нема (фіча вимкнена);
// warning  — лишилось ≤ 3 днів до кінця;
// grace    — термін вийшов, триває 1 пільгова доба (все працює, просимо оплатити);
// readonly — пільгова доба минула або призупинено: режим лише читання.
export const LICENSE_GRACE_MS = 24 * 3600 * 1000;
export const LICENSE_WARN_DAYS = 3;

export function licenseUntil(license) {
  if (!license) return null;
  return license.status === "trial" ? (license.trialEndsAt || null) : (license.expiresAt || null);
}

export function licenseState(license, now = Date.now()) {
  if (!license) return { level: "ok", until: null, daysLeft: null };
  const until = licenseUntil(license);
  const daysLeft = until ? Math.ceil((until - now) / 86400000) : null;
  if (license.status === "suspended") return { level: "readonly", until, daysLeft };
  if (!until) return { level: "ok", until, daysLeft };
  if (now > until + LICENSE_GRACE_MS) return { level: "readonly", until, daysLeft };
  if (now > until) return { level: "grace", until, daysLeft };
  if (until - now <= LICENSE_WARN_DAYS * 86400000) return { level: "warning", until, daysLeft };
  return { level: "ok", until, daysLeft };
}

// Перераховує стан раз на хвилину — перехід warning→grace→readonly
// відбувається на відкритому екрані без перезавантаження.
export function useLicenseState(license) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);
  return licenseState(license);
}
