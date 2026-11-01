// Юніт-тест допуслуг: node tests/addons/addons.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { normAddons, bufferOf, pickAddons, addonsTotals, rangeTaken, addonsSnapshot, bookingAddonTotals, MAX_ADDONS } from "../../src/addons.js";
import { blockRangeUpdates, restoreRangeUpdates } from "../../src/slotRules.js";
const requireCjs = createRequire(import.meta.url);
const serverRules = requireCjs("../../functions/slotRules.js");

const svc = { bufferMin: 20, addons: [
  { id: "a1", name: " Покриття ", price: "300", minutes: 30 },
  { id: "a2", name: "Дизайн", price: 150, minutes: 15 },
  { id: "a3", name: "", price: 10, minutes: 5 },          // без назви — відкидається
  { id: "a4", name: "Масаж рук", price: -5, minutes: -10 }, // від'ємні → 0
] };

const list = normAddons(svc.addons);
assert.equal(list.length, 3, "порожню назву відкинуто");
assert.equal(list[0].name, "Покриття");
assert.equal(list[0].price, 300);
assert.equal(list[2].price, 0); assert.equal(list[2].minutes, 0);
assert.equal(normAddons(null).length, 0);
assert.equal(normAddons({ x: { id: "q", name: "Obj", price: 1, minutes: 5 } })[0].id, "q", "об'єкт з бази теж приймається");
assert.equal(normAddons(Array.from({ length: 30 }, (_, i) => ({ id: "i" + i, name: "n" + i }))).length, MAX_ADDONS);

assert.equal(bufferOf(svc), 20);
assert.equal(bufferOf({}), 0);
assert.equal(bufferOf({ bufferMin: 9999 }), 120);

const picked = pickAddons(svc, ["a1", "a2", "zzz"]);
assert.deepEqual(picked.map((a) => a.id), ["a1", "a2"]);
assert.deepEqual(addonsTotals(picked), { price: 450, minutes: 45 });
assert.deepEqual(addonsTotals([]), { price: 0, minutes: 0 });
assert.deepEqual(Object.keys(addonsSnapshot(picked)[0]).sort(), ["id", "minutes", "name", "price"]);

// знімок у записі: суму беремо з addonsPrice, а за його відсутності — з пунктів
assert.deepEqual(bookingAddonTotals({ addons: picked, addonsPrice: 450 }), { minutes: 45, price: 450 });
assert.deepEqual(bookingAddonTotals({ addons: picked }), { minutes: 45, price: 450 });
assert.deepEqual(bookingAddonTotals({}), { minutes: 0, price: 0 });
assert.deepEqual(bookingAddonTotals(null), { minutes: 0, price: 0 });

const day = {
  slot1000: { time: "10:00", available: true },
  slot1100: { time: "11:00", available: false },   // зайнято
  slot1130: { time: "11:30", available: true },
};
assert.equal(rangeTaken(day, 10 * 60, 11 * 60), false, "[10:00,11:00) вільне");
assert.equal(rangeTaken(day, 10 * 60, 11 * 60 + 1), true, "11:00 входить у діапазон");
assert.equal(rangeTaken(day, 11 * 60 + 1, 12 * 60), false, "11:30 вільне");
assert.equal(rangeTaken({}, 0, 24 * 60), false);
// закритий майстром слот: звичайна перевірка бачить його зайнятим, а для перерви (ignoreClosed) — ні
const closedDay = { slot1200: { time: "12:00", available: false, adminBlocked: true } };
assert.equal(rangeTaken(closedDay, 12 * 60, 12 * 60 + 15), true);
assert.equal(rangeTaken(closedDay, 12 * 60, 12 * 60 + 15, { ignoreClosed: true }), false);

// ── перерва після запису у slotRules (блок/звільнення) ──
const P = "timeslots/2026-10-10/";
const grid = {
  slot1000: { time: "10:00", available: true },
  slot1030: { time: "10:30", available: true },
  slot1100: { time: "11:00", available: true },
  slot1130: { time: "11:30", available: true },
  slot1200: { time: "12:00", available: false, adminBlocked: true },   // закрито майстром
};
// 1 год + перерва 15 хв: 10:00, 10:30 — запис, 11:00 — перерва (слот наявний → блокується)
let blk = blockRangeUpdates(grid, P, 10 * 60, 60, { bufferMin: 15 });
assert.equal(blk[P + "slot1000/available"], false);
assert.equal(blk[P + "slot1030/available"], false);
assert.equal(blk[P + "slot1100/available"], false, "слот у перерві блокується");
assert.equal(blk[P + "slot1130/available"], undefined, "за перервою — вільний");
assert.equal(Object.keys(blk).some((k) => k.includes("phantom")), false, "без phantom, бо всі слоти наявні");
// перерва без документа слота — phantom НЕ створюється
const sparse = { slot1000: { time: "10:00", available: true } };
blk = blockRangeUpdates(sparse, P, 10 * 60, 60, { bufferMin: 30 });
assert.equal(blk[P + "slot1030/phantom"], true, "всередині запису phantom створюється, як і раніше");
assert.equal(blk[P + "slot1100/available"], undefined, "у перерві phantom не створюється");
// закритий майстром слот у перерві не чіпаємо
blk = blockRangeUpdates(grid, P, 11 * 60, 60, { bufferMin: 30 });
assert.equal(blk[P + "slot1200/available"], undefined, "adminBlocked у перерві не чіпаємо");
// без bufferMin — поведінка не змінилась
const same = blockRangeUpdates(grid, P, 10 * 60, 60);
assert.deepEqual(Object.keys(same).filter((k) => k.endsWith("/available")).sort(), [P + "slot1000/available", P + "slot1030/available"]);
// звільнення: діапазон + перерва; закритий майстром слот не відкривається
const busy = {
  slot1000: { time: "10:00", available: false },
  slot1030: { time: "10:30", available: false, phantom: true },
  slot1100: { time: "11:00", available: false },
  slot1200: { time: "12:00", available: false, adminBlocked: true },
};
const rest = restoreRangeUpdates(busy, P, 10 * 60, 60 + 120);
assert.equal(rest[P + "slot1000/available"], true);
assert.equal(rest[P + "slot1030"], null, "phantom видаляється");
assert.equal(rest[P + "slot1100/available"], true, "слот перерви звільняється");
assert.equal(rest[P + "slot1200/available"], undefined, "adminBlocked не відкривається скасуванням");
// сервер (CJS) і адмінка/клієнт (ESM) дають однаковий результат
assert.deepEqual(serverRules.blockRangeUpdates(grid, P, 10 * 60, 60, { bufferMin: 15 }), blockRangeUpdates(grid, P, 10 * 60, 60, { bufferMin: 15 }));
assert.deepEqual(serverRules.restoreRangeUpdates(busy, P, 10 * 60, 180), restoreRangeUpdates(busy, P, 10 * 60, 180));

console.log("addons tests: ALL PASS");
