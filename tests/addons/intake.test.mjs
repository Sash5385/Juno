// Юніт-тест анкети: node tests/addons/intake.test.mjs
import assert from "node:assert/strict";
import { normIntake, missingRequired, intakeNeeded, buildItems, answersOf, MAX_FIELDS } from "../../src/intake.js";

const form = normIntake({ enabled: true, fields: [
  { id: "a", label: " Алергії ", type: "text", required: true },
  { id: "b", label: "Тип шкіри", type: "select", options: ["Суха", " ", "Жирна"], required: false },
  { id: "c", label: "Без варіантів", type: "select", options: [] },        // → text
  { id: "d", label: "Є протипоказання", type: "yesno", required: true },
  { id: "e", label: "День народження", type: "date" },
  { id: "x", label: "", type: "text" },                                    // без назви — відкидається
  { id: "y", label: "Невідомий тип", type: "weird" },                      // → text
] });
assert.equal(form.fields.length, 6);
assert.equal(form.fields[0].label, "Алергії");
assert.deepEqual(form.fields[1].options, ["Суха", "Жирна"]);
assert.equal(form.fields[2].type, "text");
assert.equal(form.fields[5].type, "text");
assert.equal(form.enabled, true);
assert.equal(normIntake(null).enabled, false);
assert.equal(normIntake({ enabled: false, fields: [{ label: "x" }] }).enabled, false);
assert.equal(normIntake({ fields: Array.from({ length: 30 }, (_, i) => ({ label: "n" + i })) }).fields.length, MAX_FIELDS);
assert.equal(normIntake({ fields: { 0: { label: "obj" } } }).fields[0].label, "obj", "об'єкт із бази теж приймається");

assert.deepEqual(missingRequired(form, {}).map((f) => f.id), ["a", "d"]);
assert.deepEqual(missingRequired(form, { a: "Немає", d: "Ні" }), []);
assert.deepEqual(missingRequired(form, { a: "  ", d: "Ні" }).map((f) => f.id), ["a"], "пробіли не рахуються відповіддю");

assert.equal(intakeNeeded(form, null), true, "ще не заповнював");
const items = buildItems(form, { a: " Немає ", b: "Суха", d: "Ні", zzz: "чужий ключ" });
assert.deepEqual(items.map((i) => i.id), ["a", "b", "d"], "лише непорожні поля форми");
assert.equal(items[0].value, "Немає");
assert.equal(items[0].label, "Алергії");
const saved = { at: 1, items };
assert.equal(intakeNeeded(form, saved), false, "усе обов'язкове заповнено");
assert.deepEqual(answersOf(saved), { a: "Немає", b: "Суха", d: "Ні" });
// майстер додав нове обов'язкове поле — анкету просимо знову
const form2 = normIntake({ fields: [...form.fields, { id: "n", label: "Нове", type: "text", required: true }] });
assert.equal(intakeNeeded(form2, saved), true);
assert.equal(intakeNeeded(normIntake({ enabled: true, fields: [] }), null), false, "порожня форма не потрібна");
console.log("intake tests: ALL PASS");
