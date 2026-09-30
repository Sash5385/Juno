// Режим "лише читання" для простроченої підписки. vite.config.js підміняє
// імпорт "firebase/database" на цей модуль: він реекспортує все з
// @firebase/database, але set/update/remove/push/runTransaction по
// instructors/{iid}/… відхиляє, поки ліцензія в режимі readonly. Виняток —
// license та fcmTokens (оплата, push-токени). Це захист клієнта; сервер додатково
// відкидає нові записи учнів (onBookingChanged) — див. functions/index.js.
import {
  set as realSet, update as realUpdate, remove as realRemove,
  push as realPush, runTransaction as realRunTransaction,
} from "@firebase/database";

export * from "@firebase/database";

const ALLOWED = ["license", "fcmTokens"];
let readOnly = false;
let guardIid = null;

export function setLicenseReadOnly(flag, iid) {
  readOnly = !!flag;
  guardIid = iid || null;
}

function pathOf(r) {
  try { return decodeURIComponent(new URL(String(r)).pathname).replace(/^\/+|\/+$/g, ""); }
  catch { return null; }
}

function pathBlocked(full) {
  const prefix = `instructors/${guardIid}`;
  if (full !== prefix && !full.startsWith(prefix + "/")) return false;
  const rel = full.slice(prefix.length + 1);
  return !ALLOWED.some(a => rel === a || rel.startsWith(a + "/"));
}

function isBlocked(r, updateValues) {
  if (!readOnly || !guardIid) return false;
  const base = pathOf(r);
  if (base == null) return false;
  if (updateValues && typeof updateValues === "object") {
    return Object.keys(updateValues).some(k => pathBlocked(base ? `${base}/${k}` : k));
  }
  return pathBlocked(base);
}

function denyError() {
  const e = new Error("Режим читання: підписку не оплачено");
  e.code = "license_readonly";
  try { window.dispatchEvent(new CustomEvent("dp-license-readonly")); } catch { /* no window */ }
  return e;
}

export const set = (r, value) => isBlocked(r) ? Promise.reject(denyError()) : realSet(r, value);
export const update = (r, values) => isBlocked(r, values) ? Promise.reject(denyError()) : realUpdate(r, values);
export const remove = (r) => isBlocked(r) ? Promise.reject(denyError()) : realRemove(r);
export const runTransaction = (r, fn, opts) => isBlocked(r) ? Promise.reject(denyError()) : realRunTransaction(r, fn, opts);
export const push = (r, value) => {
  // push(ref) без значення лише генерує ключ — нічого не пише
  if (value === undefined || !isBlocked(r)) return realPush(r, value);
  const key = realPush(r).key;
  const p = Promise.reject(denyError());
  p.catch(() => {});
  p.key = key;
  return p;
};
