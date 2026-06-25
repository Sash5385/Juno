import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, set } from "firebase/database";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDO6-LTuBoNHi6uS5KcOpmBuyvgJSouYpk",
  authDomain: "id4drive-booking-44182.firebaseapp.com",
  databaseURL: "https://id4drive-booking-44182-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "id4drive-booking-44182",
  storageBucket: "id4drive-booking-44182.firebasestorage.app",
  messagingSenderId: "815176240686",
  appId: "1:815176240686:web:1cf54d6c465420230199bf"
};

const VAPID_KEY = "BFT1t7hXhEcSsHdotLlG5xoIFNrdS11vU_jsHiD1UUMsskVINBW2het8ogOKioGTPK8X_-u1ivEQM0n0Dh6Zvqk";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export async function registerAdminFCM() {
  if (!("Notification" in window)) { console.warn("FCM: Notification API not supported"); return; }
  try {
    const permission = await Notification.requestPermission();
    console.log("FCM permission:", permission);
    if (permission !== "granted") return;

    let swReg
    try {
      // Firebase push SW must live on its OWN scope so it never replaces the
      // PWA app SW at "/" (that conflict broke the "update available" flow).
      // "/firebase-cloud-messaging-push-scope" is FCM's default scope.
      const FCM_SCOPE = '/firebase-cloud-messaging-push-scope'
      const regs = await navigator.serviceWorker.getRegistrations()
      const isFbSw = r => (r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '').includes('firebase-messaging-sw')
      // Migration: remove any legacy firebase SW registered at the root scope.
      for (const r of regs) {
        if (isFbSw(r) && new URL(r.scope).pathname === '/') {
          await r.unregister().catch(() => {})
        }
      }
      const fresh = await navigator.serviceWorker.getRegistrations()
      swReg = fresh.find(isFbSw)
        || await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: FCM_SCOPE })
      // Wait for the SW to become active before FCM tries to subscribe
      if (swReg && !swReg.active) {
        await new Promise(resolve => {
          const sw = swReg.installing || swReg.waiting
          if (!sw) { resolve(); return; }
          sw.addEventListener('statechange', function handler() {
            if (this.state === 'activated') { sw.removeEventListener('statechange', handler); resolve(); }
          })
        })
      }
    } catch (_) {
      swReg = undefined
    }
    console.log("FCM SW scope:", swReg?.scope);

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    console.log("FCM token obtained:", !!token, token?.slice(0, 20));

    if (token) {
      await set(ref(db, "admin/fcmToken"), token);
      console.log("FCM token saved to admin/fcmToken");
    } else {
      console.warn("FCM: empty token returned");
    }
  } catch (e) {
    console.error("Admin FCM error:", e.code, e.message);
  }
}

export function onAdminForegroundMessage(callback) {
  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, callback);
  } catch {
    return () => {};
  }
}
