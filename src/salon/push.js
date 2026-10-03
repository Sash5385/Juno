// Push-токени персоналу: власник → salons/{id}/fcmTokens/{device}, майстер → masterTokens/{masterId}/{device}.
// Сервер (functions/salon/lib.js) шле data-only push; показує його SW /firebase-messaging-sw.js (конфіг проєкту приходить у query).
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { set } from "firebase/database";
import { auth, firebaseConfig } from "../firebase.js";
import { DEMO } from "../demo/demoMode.js";

function deviceId() {
  const KEY = "salon_device_id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem(KEY, id); }
    return id;
  } catch { return "d" + Date.now().toString(36); }
}

export async function registerPush(tokenRefFor) {
  if (DEMO || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try {
    if ((await Notification.requestPermission()) !== "granted") return false;
    const SCOPE = "/firebase-cloud-messaging-push-scope";
    const regs = await navigator.serviceWorker.getRegistrations();
    const isFb = (r) => (r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "").includes("firebase-messaging-sw");
    const swReg = regs.find(isFb) || await navigator.serviceWorker.register("/firebase-messaging-sw.js?c=" + encodeURIComponent(JSON.stringify(firebaseConfig)), { scope: SCOPE });
    const token = await getToken(getMessaging(auth.app), { serviceWorkerRegistration: swReg });
    if (!token) return false;
    await set(tokenRefFor(deviceId()), token);
    return true;
  } catch (e) { console.warn("salon push:", e.code || e.message); return false; }
}

export function onForegroundPush(cb) {
  if (DEMO) return () => {};
  try { return onMessage(getMessaging(auth.app), cb); } catch { return () => {}; }
}
export const pushPermission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);
