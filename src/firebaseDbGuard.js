// Режим "лише читання" для простроченої підписки. vite.config.js підміняє
// імпорт "firebase/database" на цей модуль: він реекспортує все з
// @firebase/database, але set/update/remove/push/runTransaction по
// instructors/{iid}/… відхиляє, поки ліцензія в режимі readonly. Виняток —
// license та fcmTokens (оплата, push-токени). Це захист клієнта; сервер додатково
// відкидає нові записи клієнтів (onBookingChanged) — див. functions/index.js.
import {
  set as realSet, update as realUpdate, remove as realRemove,
  push as realPush, runTransaction as realRunTransaction,
  onValue as realOnValue, get as realGet, off as realOff,
} from "@firebase/database";
import { DEMO } from "./demo/demoMode.js";

export * from "@firebase/database";

// ── Демо-режим (?demo=1, див. demo/demoMode.js): усе читання/запис іде у фейкову базу в
// пам'яті, до справжнього Firebase запити не доходять. Код демо — окремим чанком, який
// вантажиться лише в демо; без ?demo=1 цей блок нічого не змінює.
let demoMod = null;
let demoP = null;
const demo = () => (demoP ||= import("./demo/demoDb.js").then((m) => (demoMod = m)));

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

export const onValue = (r, cb, ...rest) => {
  if (!DEMO) return realOnValue(r, cb, ...rest);
  let unsub = () => {}, dead = false;
  demo().then((m) => { if (!dead) unsub = m.onValue(r, cb); });
  return () => { dead = true; unsub(); };
};
export const get = (r) => (DEMO ? demo().then((m) => m.get(r)) : realGet(r));
export const off = (r, ...rest) => { if (DEMO) { demoMod && demoMod.off(r, ...rest); } else realOff(r, ...rest); };

export const set = (r, value) => DEMO ? demo().then((m) => m.set(r, value)) : isBlocked(r) ? Promise.reject(denyError()) : realSet(r, value);
export const update = (r, values) => DEMO ? demo().then((m) => m.update(r, values)) : isBlocked(r, values) ? Promise.reject(denyError()) : realUpdate(r, values);
export const remove = (r) => DEMO ? demo().then((m) => m.remove(r)) : isBlocked(r) ? Promise.reject(denyError()) : realRemove(r);
export const runTransaction = (r, fn, opts) => DEMO ? demo().then((m) => m.runTransaction(r, fn)) : isBlocked(r) ? Promise.reject(denyError()) : realRunTransaction(r, fn, opts);
export const push = (r, value) => {
  if (DEMO) {
    // push(ref) лише генерує ключ; із значенням — пишемо в пам'ять
    const pr = realPush(r);
    if (value !== undefined) demo().then((m) => m.set(pr, value));
    return pr;
  }
  // push(ref) без значення лише генерує ключ — нічого не пише
  if (value === undefined || !isBlocked(r)) return realPush(r, value);
  const key = realPush(r).key;
  const p = Promise.reject(denyError());
  p.catch(() => {});
  p.key = key;
  return p;
};
