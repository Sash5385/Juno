// Юніт-тест групових записів: node tests/addons/groups.test.mjs
import assert from "node:assert/strict";
import { capacityOf, isGroupService, seatTimeKey, groupKeyOf, seatPath, seatsLeft, canJoinGroup, seatsLabel, MAX_CAPACITY } from "../../src/groups.js";

assert.equal(capacityOf({}), 1);
assert.equal(capacityOf({ capacity: "6" }), 6);
assert.equal(capacityOf({ capacity: 999 }), MAX_CAPACITY);
assert.equal(capacityOf({ capacity: -3 }), 1);
assert.equal(capacityOf(null), 1);
assert.equal(isGroupService({ capacity: 2 }), true);
assert.equal(isGroupService({ capacity: 1 }), false);
assert.equal(seatTimeKey("10:00"), "1000");
assert.equal(groupKeyOf("2026-10-10", "09:30"), "2026-10-10_0930");
assert.equal(seatPath("2026-10-10", "10:00"), "groupSeats/2026-10-10/1000");
assert.equal(seatsLeft(null), null);
assert.equal(seatsLeft({ capacity: 6, count: 2 }), 4);
assert.equal(seatsLeft({ capacity: 2, count: 5 }), 0);
assert.equal(canJoinGroup({ serviceId: "g", capacity: 3, count: 2 }, "g"), true);
assert.equal(canJoinGroup({ serviceId: "g", capacity: 3, count: 3 }, "g"), false, "повна");
assert.equal(canJoinGroup({ serviceId: "g", capacity: 3, count: 1 }, "other"), false, "інша послуга");
assert.equal(canJoinGroup(null, "g"), false);
assert.deepEqual([1, 2, 5, 11, 21].map(seatsLabel), ["1 місце", "2 місця", "5 місць", "11 місць", "21 місце"]);
console.log("groups tests: ALL PASS");
