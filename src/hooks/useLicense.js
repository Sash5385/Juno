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

export function isLicenseBlocked(license) {
  if (!license) return false;
  if (license.status === "suspended") return true;
  const now = Date.now();
  if (license.status === "trial" && license.trialEndsAt && now > license.trialEndsAt) return true;
  if (license.status === "active" && license.expiresAt && now > license.expiresAt) return true;
  return false;
}
