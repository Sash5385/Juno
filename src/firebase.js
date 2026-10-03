import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, goOffline } from "firebase/database";
import { getStorage } from "firebase/storage";
import { DEMO } from "./demo/demoMode.js";

// Конфіг окремого Firebase-проєкту Juno — з .env (VITE_FIREBASE_*, див. .env.example).
// Без нього застосунок бачить лише демо-проєкт "demo-juno" (префікс demo- зарезервований під емулятор):
// справжні дані нікуди не пишуться, працює демо-режим (?demo=1).
const env = import.meta.env;
const projectId = env.VITE_FIREBASE_PROJECT_ID || "demo-juno";
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-key",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`,
  projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: env.VITE_FIREBASE_APP_ID || "1:0:web:0",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
if (DEMO) goOffline(db); // демо: жодних з'єднань зі справжньою базою
export const storage = getStorage(app);
