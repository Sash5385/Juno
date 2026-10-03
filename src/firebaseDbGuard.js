// vite.config.js підміняє імпорт "firebase/database" на цей модуль: він реекспортує все з @firebase/database,
// а в демо-режимі (?demo=1, див. demo/demoMode.js) усе читання/запис іде у фейкову базу в пам'яті —
// до справжнього Firebase запити не доходять. Код демо вантажиться окремим чанком лише в демо.
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

export const onValue = (r, cb, ...rest) => {
  if (!DEMO) return realOnValue(r, cb, ...rest);
  let unsub = () => {}, dead = false;
  demo().then((m) => { if (!dead) unsub = m.onValue(r, cb); });
  return () => { dead = true; unsub(); };
};
export const get = (r) => (DEMO ? demo().then((m) => m.get(r)) : realGet(r));
export const off = (r, ...rest) => { if (DEMO) { demoMod && demoMod.off(r, ...rest); } else realOff(r, ...rest); };

export const set = (r, value) => DEMO ? demo().then((m) => m.set(r, value)) : realSet(r, value);
export const update = (r, values) => DEMO ? demo().then((m) => m.update(r, values)) : realUpdate(r, values);
export const remove = (r) => DEMO ? demo().then((m) => m.remove(r)) : realRemove(r);
export const runTransaction = (r, fn, opts) => DEMO ? demo().then((m) => m.runTransaction(r, fn)) : realRunTransaction(r, fn, opts);
export const push = (r, value) => {
  if (DEMO) {
    // push(ref) лише генерує ключ; із значенням — пишемо в пам'ять
    const pr = realPush(r);
    if (value !== undefined) demo().then((m) => m.set(pr, value));
    return pr;
  }
  return realPush(r, value);
};
