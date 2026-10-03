import assert from "node:assert/strict";
import * as L from "../../src/salonLogic.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("time helpers", () => { assert.equal(L.minToTime(615), "10:15"); assert.equal(L.timeToMin("09:30"), 570); assert.equal(L.slotIdOf("09:30"), "slot0930"); });
t("dates: add, weekday (Mon=0), range", () => {
  assert.equal(L.addDays("2030-05-31", 1), "2030-06-01"); assert.equal(L.addDays("2030-03-01", -1), "2030-02-28");
  assert.equal(L.weekdayMon0("2030-05-13"), 0); assert.equal(L.weekdayMon0("2030-05-19"), 6);
  assert.deepEqual(L.datesAhead("2030-12-30", 3), ["2030-12-30", "2030-12-31", "2031-01-01"]);
  assert.equal(L.toYMD(L.fromYMD("2030-02-03")), "2030-02-03");
});
t("work hours: normalisation fills gaps", () => {
  const wh = L.normWorkHours([{ from: "08:00", to: "12:00", off: false }]);
  assert.equal(wh.length, 7); assert.equal(wh[0].from, "08:00"); assert.equal(wh[1].to, "18:00"); assert.equal(wh[6].off, true);
});
t("day slots: 09:00-11:00 step 30 → 4 slots, last ends by 'to'", () => {
  const d = L.daySlotDocs({ from: "09:00", to: "11:00" }, 30);
  assert.deepEqual(Object.keys(d), ["slot0900", "slot0930", "slot1000", "slot1030"]);
  assert.deepEqual(d.slot1030, { time: "10:30", available: true });
});
t("day slots: step 45 and day off", () => {
  assert.deepEqual(Object.keys(L.daySlotDocs({ from: "09:00", to: "11:00" }, 45)), ["slot0900", "slot0945"]);
  assert.deepEqual(L.daySlotDocs({ from: "09:00", to: "18:00", off: true }, 30), {});
  assert.deepEqual(L.daySlotDocs(null), {});
});
t("missing slot writes never touch existing slots (booked/phantom/blocked)", () => {
  const wanted = L.daySlotDocs({ from: "09:00", to: "11:00" }, 30);
  const existing = { slot0900: { time: "09:00", available: false }, slot0930: { time: "09:30", phantom: true, available: false } };
  const w = L.missingSlotWrites(existing, wanted, "timeslots/m1/2030-05-14/");
  assert.deepEqual(Object.keys(w), ["timeslots/m1/2030-05-14/slot1000", "timeslots/m1/2030-05-14/slot1030"]);
  assert.equal(Object.keys(L.missingSlotWrites(undefined, wanted, "p/")).length, 4);
});
t("grid writes: weekdays only, 7 days → 5 working days × slots", () => {
  const w = L.gridWrites({ masterId: "m1", workHours: [], step: 30, startYmd: "2030-05-13", days: 7 });
  const dates = new Set(Object.keys(w).map((k) => k.split("/")[2]));
  assert.equal(dates.size, 5); assert.ok(!dates.has("2030-05-18") && !dates.has("2030-05-19"));
  assert.equal(Object.keys(w).length, 5 * 18);
  const again = L.gridWrites({ masterId: "m1", workHours: [], startYmd: "2030-05-13", days: 7, existing: { "2030-05-13": L.daySlotDocs({ from: "09:00", to: "18:00" }) } });
  assert.equal(new Set(Object.keys(again).map((k) => k.split("/")[2])).has("2030-05-13"), false);
});
t("regrid: removes surplus FREE slots, keeps booked/blocked/phantom/offered, adds missing", () => {
  const date = "2030-05-14"; // вівторок
  const existing = { [date]: {
    ...L.daySlotDocs({ from: "09:00", to: "18:00" }, 30),
    slot0900: { time: "09:00", available: false }, slot0930: { time: "09:30", available: false, phantom: true }, slot1000: { time: "10:00", available: false, adminBlocked: true },
    slot1030: { time: "10:30", available: true, offeredTo: { u1: { until: 1 } } }, slot1100: { time: "11:00", available: true, bookedBy: "u2" },
  } };
  const w = L.regridWrites({ masterId: "m1", workHours: [{}, { from: "09:00", to: "12:00" }], startYmd: date, days: 1, existing });
  const removed = Object.keys(w).filter((k) => w[k] === null).map((k) => k.split("/").pop());
  assert.ok(removed.includes("slot1200") && removed.includes("slot1730"));
  for (const keep of ["slot0900", "slot0930", "slot1000", "slot1030", "slot1100"]) assert.ok(!removed.includes(keep), keep);
  assert.ok(!removed.includes("slot1130") && !removed.includes("slot1100"));
  const empty = L.regridWrites({ masterId: "m1", workHours: [{}, { from: "09:00", to: "11:00" }], startYmd: date, days: 1, existing: {} });
  assert.equal(Object.keys(empty).length, 4);
  const off = L.regridWrites({ masterId: "m1", workHours: [{}, { off: true }], startYmd: date, days: 1, existing: { [date]: L.daySlotDocs({ from: "09:00", to: "10:00" }, 30) } });
  assert.deepEqual(Object.values(off), [null, null]);
});
t("price: master override beats catalog; zero override is respected", () => {
  const s = { price: 500, masterPrices: { m2: 450, m3: 0 } };
  assert.equal(L.priceFor(s, "m1"), 500); assert.equal(L.priceFor(s, "m2"), 450); assert.equal(L.priceFor(s, "m3"), 0); assert.equal(L.priceFor(null, "m1"), 0);
});
t("service helpers", () => {
  assert.equal(L.serviceDuration({ duration: 90 }), 90); assert.equal(L.serviceDuration({}), 60);
  assert.equal(L.offersService({ masterIds: { m1: true } }, "m1"), true);
  assert.equal(L.offersService({ masterIds: { m1: true }, active: false }, "m1"), false);
  assert.equal(L.offersService({ masterIds: { m1: true } }, "m2"), false);
  assert.equal(L.fmtMoney(99.9), "99.9 ₴");
});
t("free start times: needs consecutive free slots for the whole duration", () => {
  const day = L.daySlotDocs({ from: "09:00", to: "12:00" }, 30);
  day.slot1000.available = false; day.slot1130 = { time: "11:30", available: true, adminBlocked: true };
  assert.deepEqual(L.freeStartTimes(day, 30), ["09:00", "09:30", "10:30", "11:00"]);
  assert.deepEqual(L.freeStartTimes(day, 60), ["09:00", "10:30"]);
  assert.deepEqual(L.freeStartTimes(day, 90), []);
  day.slot1000.available = true;
  assert.deepEqual(L.freeStartTimes(day, 90), ["09:00", "09:30", "10:00"]);
});
t("free start times: phantom, gaps and minStart", () => {
  const day = { slot0900: { time: "09:00", available: true }, slot0930: { time: "09:30", available: false, phantom: true }, slot1100: { time: "11:00", available: true }, slot1130: { time: "11:30", available: true } };
  assert.deepEqual(L.freeStartTimes(day, 30), ["09:00", "11:00", "11:30"]);
  assert.deepEqual(L.freeStartTimes(day, 60), ["11:00"]);
  assert.deepEqual(L.freeStartTimes(day, 30, 30, { minStart: 10 * 60 }), ["11:00", "11:30"]);
  assert.deepEqual(L.freeStartTimes({}, 30), []);
});
t("free start times: 15-minute grid with 45-minute service", () => {
  const day = L.daySlotDocs({ from: "10:00", to: "11:15" }, 15);
  assert.deepEqual(L.freeStartTimes(day, 45, 15), ["10:00", "10:15", "10:30"]);
});
t("localToMs: salon time zone, DST", () => {
  assert.equal(L.localToMs("2030-01-15", "12:00"), Date.UTC(2030, 0, 15, 10, 0));
  assert.equal(L.localToMs("2030-07-15", "12:00"), Date.UTC(2030, 6, 15, 9, 0));
  assert.equal(L.localToMs("2030-03-31", "12:00"), Date.UTC(2030, 2, 31, 9, 0));
  assert.equal(L.localToMs("2030-03-30", "12:00"), Date.UTC(2030, 2, 30, 10, 0));
  assert.equal(L.localToMs("2030-07-15", "12:00", "America/New_York"), Date.UTC(2030, 6, 15, 16, 0));
});
t("cancel policy", () => {
  const H = 3600000;
  assert.equal(L.cancelPolicy(30 * H, 0, 24).free, true); assert.equal(L.cancelPolicy(24 * H, 0, 24).free, true);
  assert.equal(L.cancelPolicy(23 * H, 0, 24).free, false); assert.equal(L.cancelPolicy(1, 0, 0).free, true);
  assert.equal(L.cancelPolicy(5 * H, 0).hours, 24); assert.equal(L.cancelPolicy(5 * H, 0, undefined).free, false);
});
t("booking helpers", () => {
  assert.equal(L.isCancelledBooking({ status: "cancelled" }), true); assert.equal(L.isCancelledBooking({ status: "pending", cancelledBy: "license" }), true);
  assert.equal(L.isCancelledBooking({ status: "confirmed" }), false);
  assert.equal(L.bookingEndMin({ time: "10:00", durationMin: 90 }), 690);
  assert.deepEqual([{ date: "2030-01-02", time: "09:00" }, { date: "2030-01-01", time: "12:00" }, { date: "2030-01-01", time: "09:00" }].sort(L.bookingSort).map((b) => b.date + b.time), ["2030-01-0109:00", "2030-01-0112:00", "2030-01-0209:00"]);
});
t("stats per master", () => {
  const s = L.aggregateStats([
    { masterId: "m1", status: "completed", price: 500, paidAmount: 150 }, { masterId: "m1", status: "confirmed", price: 300 },
    { masterId: "m1", status: "cancelled", price: 300 }, { masterId: "m2", status: "completed", price: 450 },
    { masterId: "m2", status: "personal" }, { masterId: "m2", status: "pending", cancelledBy: "payment_timeout" },
  ], ["m1", "m2", "m3"]);
  const r = Object.fromEntries(s.rows.map((x) => [x.masterId, x]));
  assert.deepEqual([r.m1.total, r.m1.completed, r.m1.upcoming, r.m1.cancelled, r.m1.revenue, r.m1.prepaid], [3, 1, 1, 1, 500, 150]);
  assert.deepEqual([r.m2.total, r.m2.completed, r.m2.cancelled, r.m2.revenue], [2, 1, 1, 450]);
  assert.equal(r.m3.total, 0); assert.equal(s.all.revenue, 950); assert.equal(s.all.total, 5);
});
console.log(`salonLogic: ${n} OK`);
