// Запуск: node tests/unit/templateDefaults.test.mjs
import assert from "node:assert/strict";
import { POLITE, defaultBody, migratePolite } from "../../src/templateDefaults.js";

// Поточні стандартні тексти Juno ДО міграції (копія з HEAD id4drive-templates.jsx)
const JUNO_OLD = {
  t1: "Привіт, {ім'я}! 🔔 Нагадуємо про урок завтра {дата} о {час}. Чекаємо на тебе! Якщо потрібно перенести — напиши нам.",
  t2: "ID4Drive: урок сьогодні о {час}. Адреса: Верховинна 44. Інструктор: {інструктор}",
  t3: "✅ {ім'я}, твій урок підтверджено!\n📅 {дата} о {час}\n🚗 {послуга} — {ціна} ₴\nЧекаємо!",
  t4: "❌ {ім'я}, на жаль урок {дата} о {час} скасовано. Якщо хочеш записатись на інший час — напиши нам або відкрий додаток.",
  t5: "👋 Привіт, {ім'я}! Раді бачити тебе в ID4Drive!\nЯ — {інструктор}, твій інструктор.\nЗаписуйся на перший урок і побачимось на дорозі! 🚗",
  t6: "⏳ {ім'я}, з'явився вільний урок {дата} о {час}! Підтвердити запис → відкрий додаток.",
  t7: "Привіт, {ім'я}! Як пройшов урок {дата}? Буду вдячний за відгук 🙏",
  t8: "Привіт! Для тебе діє спеціальна пропозиція: {послуга} за {ціна} ₴. Діє тільки цього тижня!",
};
const ids = Object.keys(JUNO_OLD);
const mk = (body, id) => ({ id, title: "x", active: true, body });

// 1. Незмінений старий стандарт Juno -> новий
const r1 = migratePolite(ids.map(id => mk(JUNO_OLD[id], id)));
assert.equal(r1.changed, true);
r1.list.forEach(t => assert.equal(t.body, defaultBody(t.id)));
r1.list.forEach(t => assert.notEqual(t.body, JUNO_OLD[t.id]));
// інші поля не зачеплені
assert.deepEqual(r1.list.map(t => [t.id, t.title, t.active]), ids.map(id => [id, "x", true]));

// 2. Відредаговані тексти (навіть мінімально) не чіпаємо
const edited = [
  ...ids.map(id => mk(JUNO_OLD[id] + " ", id)),
  ...ids.map(id => mk("!" + JUNO_OLD[id].slice(1), id)),
  mk("Свій власний текст на «ти»: напиши нам", "t1"),
  mk("", "t3"),
  mk(JUNO_OLD.t1, "custom_1"), // не стандартний id
  { id: "t2" }, // без body
  null,
];
const r2 = migratePolite(edited);
assert.equal(r2.changed, false);
r2.list.forEach((t, i) => assert.strictEqual(t, edited[i]));

// 3. Старий текст під чужим id не мігрує (t1-текст у t2)
assert.equal(migratePolite([mk(JUNO_OLD.t1, "t2")]).changed, false);

// 4. Уже новий текст — без змін
const r4 = migratePolite(ids.map(id => mk(defaultBody(id), id)));
assert.equal(r4.changed, false);

// 5. Ідемпотентність
const r5 = migratePolite(r1.list);
assert.equal(r5.changed, false);
assert.deepEqual(r5.list, r1.list);

// 6. Змішаний список: мігрує лише незмінене
const r6 = migratePolite([mk(JUNO_OLD.t3, "t3"), mk("Мій текст", "t4")]);
assert.equal(r6.list[0].body, defaultBody("t3"));
assert.equal(r6.list[1].body, "Мій текст");

// 7. Нові тексти не містять «ти»-форм і доменів
for (const id of ids) assert.ok(!/drivepad\.|\.pro|http/i.test(POLITE[id].new));
console.log("templateDefaults: OK");
