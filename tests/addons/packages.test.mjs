// Юніт-тест пакетів: node tests/addons/packages.test.mjs
import assert from "node:assert/strict";
import { normPackageTemplates, normPackages, packageUsable, pickPackage, buildClientPackage, MAX_TEMPLATES } from "../../src/packages.js";

const tpl = normPackageTemplates([
  { id: "t1", name: " 5 масажів ", count: "5", days: 90, serviceIds: ["sv1"], price: 2000 },
  { id: "t2", name: "Безстроковий", count: 3 },
  { name: "" },
]);
assert.equal(tpl.length, 2);
assert.deepEqual([tpl[0].name, tpl[0].count, tpl[0].days, tpl[0].price], ["5 масажів", 5, 90, 2000]);
assert.deepEqual([tpl[1].days, tpl[1].serviceIds.length], [0, 0]);
assert.equal(normPackageTemplates(Array.from({ length: 30 }, (_, i) => ({ name: "n" + i }))).length, MAX_TEMPLATES);

const NOW = new Date("2026-10-10T10:00:00").getTime();
const pk = buildClientPackage(tpl[0], NOW);
assert.equal(pk.total, 5);
assert.equal(pk.expiresAt, NOW + 90 * 86400000);
assert.deepEqual(pk.serviceIds, ["sv1"]);
assert.equal(buildClientPackage(tpl[1], NOW).expiresAt, undefined);

const [p] = normPackages({ [pk.id]: { ...pk, uses: { a: 1, b: 2 } } });
assert.equal(p.used, 2); assert.equal(p.left, 3);
assert.equal(packageUsable(p, "sv1", "2026-11-01"), true);
assert.equal(packageUsable(p, "sv2", "2026-11-01"), false, "інша послуга");
assert.equal(packageUsable(p, "sv1", "2027-03-01"), false, "термін минув");
const empty = normPackages([{ ...pk, id: "e", uses: { a: 1, b: 1, c: 1, d: 1, e: 1 } }])[0];
assert.equal(empty.left, 0); assert.equal(packageUsable(empty, "sv1", "2026-10-11"), false);
const any = normPackages([{ id: "z", name: "Z", total: 2 }])[0];
assert.equal(packageUsable(any, "whatever", "2099-01-01"), true, "без послуг і терміну — діє завжди");
// найближчий за терміном обирається першим
const many = normPackages([{ id: "late", name: "A", total: 1, expiresAt: NOW + 5e9 }, { id: "soon", name: "B", total: 1, expiresAt: NOW + 1e9 }, { id: "none", name: "C", total: 1 }]);
assert.equal(pickPackage(many, "x", "2026-10-11").id, "soon");
assert.equal(pickPackage([], "x", "2026-10-11"), null);
console.log("packages tests: ALL PASS");
