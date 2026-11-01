// node functions/test/rebook.test.js
const assert = require("node:assert/strict");
const { findRebookDue } = require("../rebook");
const inst = {
  admin_data: { services: [{ id: "s1", active: true, rebookDays: 30 }, { id: "s2", active: true }, { id: "s3", active: true, rebookDays: 10, archived: true }] },
  users: { u3: { blocked: true }, u5: { rebookReminded: "b5" } },
  bookings: {
    u1: { b1: { date: "2026-08-01", serviceId: "s1", status: "confirmed", serviceName: "Манікюр" } },                    // 70 днів → нагадати
    u2: { b2: { date: "2026-08-01", serviceId: "s1", status: "confirmed" }, b2n: { date: "2026-11-01", serviceId: "s1", status: "pending" } }, // є майбутній
    u3: { b3: { date: "2026-08-01", serviceId: "s1", status: "confirmed" } },                                            // заблокований
    u4: { b4: { date: "2026-10-05", serviceId: "s1", status: "confirmed" } },                                            // ще рано (5 днів)
    u5: { b5: { date: "2026-08-01", serviceId: "s1", status: "confirmed" } },                                            // вже нагадували
    u6: { b6: { date: "2026-08-01", serviceId: "s2", status: "confirmed" } },                                            // послуга без інтервалу
    u7: { b7: { date: "2026-08-01", serviceId: "s1", status: "cancelled" } },                                            // скасований
    u8: { b8: { date: "2026-06-01", serviceId: "s1", status: "confirmed" }, b8b: { date: "2026-09-01", serviceId: "s1", status: "confirmed" } }, // рахуємо від останнього (39 днів)
    u9: { b9: { date: "2026-08-01", serviceId: "s3", status: "confirmed" } },                                            // архівна послуга
    guest_1: { g: { date: "2026-08-01", serviceId: "s1", status: "confirmed" } },
  },
};
const due = findRebookDue(inst, "2026-10-10");
assert.deepEqual(due.map((d) => d.uid).sort(), ["u1", "u8"]);
assert.equal(due.find((d) => d.uid === "u1").serviceName, "Манікюр");
assert.equal(due.find((d) => d.uid === "u8").bookingId, "b8b");
assert.deepEqual(findRebookDue({ bookings: inst.bookings }, "2026-10-10"), []);
console.log("rebook tests: ALL PASS");
