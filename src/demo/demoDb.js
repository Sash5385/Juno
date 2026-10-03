// Фейкова Realtime Database в пам'яті для демо-режиму (див. demoMode.js).
// Реалізує лише те, чим користується застосунок: onValue/get/set/update/remove/push/
// runTransaction/off. Дані — з buildSalonDemoTree(); записи міняють лише цю копію в пам'яті,
// тож інтерфейс у демо "живий" (можна тапати, переносити), а Firebase лишається недоторканим.
import { buildSalonDemoTree } from "../salon/demoData.js";

let root = buildSalonDemoTree();
const listeners = new Set();

const norm = (p) => String(p || "").replace(/^\/+|\/+$/g, "");
const parts = (p) => norm(p).split("/").filter(Boolean);
const clone = (v) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));

// Шлях із ref-а Firebase (URL бази) — так само, як у firebaseDbGuard.js
export function pathOf(r) {
  try { return decodeURIComponent(new URL(String(r)).pathname).replace(/^\/+|\/+$/g, ""); }
  catch { return ""; }
}

function getAt(path) {
  let n = root;
  for (const k of parts(path)) {
    if (n == null || typeof n !== "object") return null;
    n = n[k];
  }
  return n === undefined ? null : n;
}

function setAt(path, val) {
  const ks = parts(path);
  if (!ks.length) { root = val && typeof val === "object" ? val : {}; return; }
  let n = root;
  for (let i = 0; i < ks.length - 1; i++) {
    if (n[ks[i]] == null || typeof n[ks[i]] !== "object") {
      if (val == null) return;
      n[ks[i]] = {};
    }
    n = n[ks[i]];
  }
  const last = ks[ks.length - 1];
  if (val == null) {
    if (Array.isArray(n)) n[last] = undefined; else delete n[last];
  } else n[last] = val;
}

// Серверні значення Firebase: increment(n) і serverTimestamp()
function resolveSv(val, cur) {
  if (val && typeof val === "object") {
    if (val[".sv"] !== undefined) {
      const sv = val[".sv"];
      if (sv === "timestamp") return Date.now();
      if (sv && typeof sv === "object" && sv.increment !== undefined) return (Number(cur) || 0) + sv.increment;
      return null;
    }
    const out = Array.isArray(val) ? [] : {};
    for (const k of Object.keys(val)) {
      const r = resolveSv(val[k], cur && typeof cur === "object" ? cur[k] : undefined);
      if (r !== undefined && r !== null) out[k] = r;
    }
    return out;
  }
  return val;
}

export class Snap {
  constructor(path, value) { this._p = norm(path); this._v = value === undefined ? null : value; }
  get key() { const k = parts(this._p); return k.length ? k[k.length - 1] : null; }
  val() { return clone(this._v); }
  exportVal() { return clone(this._v); }
  exists() { return this._v !== null && this._v !== undefined; }
  hasChildren() { return this._v !== null && typeof this._v === "object" && Object.keys(this._v).length > 0; }
  numChildren() { return this.hasChildren() ? Object.keys(this._v).length : 0; }
  child(p) { return new Snap(`${this._p}/${norm(p)}`, getAt(`${this._p}/${norm(p)}`)); }
  forEach(fn) {
    if (!this.hasChildren()) return false;
    for (const k of Object.keys(this._v)) {
      if (this._v[k] == null) continue;
      if (fn(new Snap(`${this._p}/${k}`, this._v[k])) === true) return true;
    }
    return false;
  }
}

const snapAt = (path) => new Snap(path, getAt(path));
const overlaps = (a, b) => a === b || a === "" || b === "" || a.startsWith(b + "/") || b.startsWith(a + "/");

function notify(changedPath) {
  const cp = norm(changedPath);
  for (const l of Array.from(listeners)) {
    if (!overlaps(l.path, cp)) continue;
    const json = JSON.stringify(getAt(l.path));
    if (json === l.last) continue;          // як у справжній базі: подія лише при зміні значення
    l.last = json;
    setTimeout(() => { if (listeners.has(l)) l.cb(snapAt(l.path)); }, 0);
  }
}

export function onValue(r, cb) {
  const path = pathOf(r);
  const l = { path, cb, last: JSON.stringify(getAt(path)) };
  listeners.add(l);
  setTimeout(() => { if (listeners.has(l)) cb(snapAt(path)); }, 0);
  const unsub = () => listeners.delete(l);
  l.unsub = unsub;
  return unsub;
}

export function off(r, _evt, cb) {
  const path = pathOf(r);
  for (const l of Array.from(listeners)) {
    if (l.path === path && (!cb || l.cb === cb || l.unsub === cb)) listeners.delete(l);
  }
}

export const get = (r) => Promise.resolve(snapAt(pathOf(r)));

export function set(r, value) {
  const path = pathOf(r);
  setAt(path, clone(resolveSv(value, getAt(path))));
  notify(path);
  return Promise.resolve();
}

export function update(r, values) {
  const base = pathOf(r);
  const keys = Object.keys(values || {});
  keys.forEach((k) => {
    const full = base ? `${base}/${norm(k)}` : norm(k);
    setAt(full, clone(resolveSv(values[k], getAt(full))));
  });
  keys.forEach((k) => notify(base ? `${base}/${norm(k)}` : norm(k)));
  return Promise.resolve();
}

export const remove = (r) => set(r, null);

export function runTransaction(r, fn) {
  const path = pathOf(r);
  const res = fn(clone(getAt(path)));
  if (res !== undefined) { setAt(path, clone(res)); notify(path); }
  return Promise.resolve({ committed: res !== undefined, snapshot: snapAt(path) });
}
