// Тести злиття власних графіка й цін майстра салону (src/masterSettings.js)
import assert from "node:assert/strict";
import * as M from "../../src/masterSettings.js";

let fails = 0;
const t = (name, fn) => { try { fn(); console.log("ok   " + name); } catch (e) { fails++; console.log("FAIL " + name + "\n     " + e.message); } };
const base = { workStart: 9, workEnd: 18, lunchEnabled: true, lunchStart: 12, lunchEnd: 13, weekSchedule: [{ enabled: true, start: 9, end: 18 }], interval: 30, services: [
  { id: "a", name: "A", price: 500, duration: 60, active: true }, { id: "b", name: "B", price: 300, duration: 30, active: true }] };

t("без записів майстра діють налаштування салону", () => {
  assert.equal(M.applyMasterSettings(base, null), base);
  assert.equal(M.applyMasterSettings(base, {}), base);
  assert.equal(M.applyMasterSettings(base, { svc: {} }).services[0].price, 500);
});
t("власний графік перекриває години, решта лишається", () => {
  const o = M.applyMasterSettings(base, { weekSchedule: [{ enabled: true, start: 11, end: 20 }], workStart: 11, workEnd: 20, lunchEnabled: null });
  assert.equal(o.workStart, 11); assert.equal(o.workEnd, 20); assert.equal(o.weekSchedule[0].start, 11);
  assert.equal(o.lunchEnabled, true); assert.equal(o.interval, 30);
  assert.equal(base.workStart, 9); // оригінал не змінено
});
t("графік без weekSchedule ігнорується", () => assert.equal(M.mergeMasterSchedule(base, { workStart: 1 }), base));
t("ціна/тривалість/вимкнення послуги майстра", () => {
  const o = M.applyMasterSettings(base, { svc: { a: { price: 800, duration: 90 }, b: { price: 1, duration: 5, active: false } } });
  assert.equal(o.services[0].price, 800); assert.equal(o.services[0].duration, 90); assert.equal(o.services[0].active, true);
  assert.equal(o.services[1].active, false);
  assert.equal(base.services[0].price, 500);
});
t("некоректні значення ігноруються", () => {
  const o = M.mergeMasterServices(base.services, { svc: { a: { price: "дорого", duration: null } } });
  assert.equal(o[0].price, 500); assert.equal(o[0].duration, 60);
});
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
