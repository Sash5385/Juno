import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, goOffline, ref, set } from "firebase/database";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getStorage, ref as storageRef } from "firebase/storage";
import { DEMO } from "./demo/demoMode.js";

// Multi-tenant: iid — це uid інструктора, що зараз залогінений. Кожен
// інструктор бачить і пише тільки у свій instructors/{iid}/... (rules).
let _iid = null;
export const setCurrentIid = (id) => { _iid = id; };
export const getCurrentIid = () => _iid;
export const iRef = (path) => ref(db, path ? `instructors/${_iid}/${path}` : `instructors/${_iid}`);

const firebaseConfig = {
  apiKey: "AIzaSyDu4tWzXFZWWlaJGuhlibDKz1U96Uk3Q74",
  authDomain: "juno-booking.firebaseapp.com",
  databaseURL: "https://juno-booking-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "juno-booking",
  storageBucket: "juno-booking.firebasestorage.app",
  messagingSenderId: "852885730629",
  appId: "1:852885730629:web:9a8f34b87d2538541cba2c",
};

// VAPID-ключ навмисно НЕ задаємо: раніше тут стояв ключ іншого проєкту,
// а цей застосунок працює на іншому проєкті (juno-booking) — Firebase відхиляв getToken, токен
// ніколи не зберігався ("no tokens"), пуші не приходили. Без vapidKey SDK бере ключ за
// замовчуванням, який працює для будь-якого проєкту.

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
if (DEMO) goOffline(db); // демо: жодних з'єднань зі справжньою базою
export const storage = getStorage(app);
// Фото інструктора: instructors/{iid}/profile.jpg (одне фото на інструктора,
// перезаписується при новому завантаженні — без сміття зі старих версій).
export const iStorageRef = () => storageRef(storage, `instructors/${getCurrentIid()}/profile.jpg`);
// Фотоколаж лендингу: до 10 фото, кожне — свій файл (на відміну від
// profile.jpg, тут не потрібне перезаписування — фото додаються/видаляються
// незалежно одне від одного).
export const iGalleryStorageRef = (fileName) => storageRef(storage, `instructors/${getCurrentIid()}/gallery/${fileName}`);

// Стабільний id цього браузера/пристрою — щоб токени з різних пристроїв
// (ПК і телефон адміна) не перезаписували один одного в БД.
function getDeviceId() {
  const KEY = "id4_admin_device_id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

export async function registerAdminFCM() {
  if (DEMO) return; // демо-режим: без запиту дозволу на сповіщення й без токенів
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
    const token = await getToken(messaging, { serviceWorkerRegistration: swReg });
    console.log("FCM token obtained:", !!token, token?.slice(0, 20));

    if (token) {
      const deviceId = getDeviceId();
      await set(iRef(`fcmTokens/${deviceId}`), token);
      console.log("FCM token saved to instructors/" + _iid + "/fcmTokens/" + deviceId);
    } else {
      console.warn("FCM: empty token returned");
    }
  } catch (e) {
    console.error("Admin FCM error:", e.code, e.message);
  }
}

export function onAdminForegroundMessage(callback) {
  if (DEMO) return () => {};
  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, callback);
  } catch {
    return () => {};
  }
}
