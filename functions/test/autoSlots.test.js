const test = require("node:test");
const assert = require("node:assert");
const { planAutoSlots, addDays, computeDayUpdatesFor } = require("../autoSlots");

const week = Array.from({ length: 7 }, (_, i) => ({ enabled: i < 5, start: 9, end: 12, lunchEnabled: false }));
const mk = (db) => async (p) => db[p] ?? null;

test("addDays", () => assert.strictEqual(addDays("2026-11-30", 1), "2026-12-01"));

test("порожній робочий день заповнюється, вихідний — ні", async () => {
  const { all, marks } = await planAutoSlots({ settings: { weekSchedule: week, slotGenDays: 6 }, bookingsData: {}, today: "2026-11-02", read: mk({}) });
  assert.strictEqual(all["timeslots/2026-11-02/slot0900/available"], true);
  assert.ok(all["timeslots/2026-11-02/slot1100/time"]);
  assert.ok(!Object.keys(all).some((k) => k.includes("2026-11-07"))); // субота
  assert.ok(marks["autoSlotsDone/2026-11-02"]);
});

test("день зі слотами, заведеними вручну, не чіпається", async () => {
  const db = { "timeslots/2026-11-02": { slot1000: { time: "10:00", available: true } } };
  const { all } = await planAutoSlots({ settings: { weekSchedule: week, slotGenDays: 1 }, bookingsData: {}, today: "2026-11-02", read: mk(db) });
  assert.ok(!Object.keys(all).some((k) => k.includes("2026-11-02")));
});

test("позначений день не відновлює видалені вручну слоти", async () => {
  const day = "2026-11-02";
  const first = await planAutoSlots({ settings: { weekSchedule: week, slotGenDays: 0 }, bookingsData: {}, today: day, read: mk({}) });
  const db = { [`autoSlotsDone/${day}`]: first.marks[`autoSlotsDone/${day}`], [`timeslots/${day}`]: { slot0900: { time: "09:00", available: true } } };
  const again = await planAutoSlots({ settings: { weekSchedule: week, slotGenDays: 1 }, bookingsData: {}, today: day, read: mk(db) });
  assert.ok(!Object.keys(again.all).some((k) => k.includes("2026-11-02")));
});

test("запис блокує слот", () => {
  const r = computeDayUpdatesFor({ weekSchedule: week }, [{ date: "2026-11-02", startMin: 600, durMin: 60 }], "2026-11-02", {});
  assert.strictEqual(r.updates["timeslots/2026-11-02/slot1000/available"], false);
});
