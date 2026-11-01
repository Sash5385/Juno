// node functions/test/i18n.test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { LANGS, t, hasBuiltin, fmtDate, fmtDateLong, fmtTsDate, normLang, DICT } = require("../i18n.cjs");

const OTHER = LANGS.filter((l) => l !== "uk");
const ph = (s) => (s.match(/\{[^{}]+\}/g) || []).sort().join("|");

// 1) словник: усі 5 мов, не порожні, ті самі {змінні}, що й в українському ключі
for (const [uk, row] of Object.entries(DICT)) {
  for (const l of OTHER) {
    assert.ok(typeof row[l] === "string" && row[l].trim(), `немає перекладу ${l}: ${uk}`);
    assert.equal(ph(row[l]), ph(uk), `змінні не збігаються (${l}): ${uk}`);
    assert.ok(!/[А-Яа-яІіЇїЄєҐґ]/.test(row[l].replace(/\{[^{}]+\}/g, "")), `кирилиця в перекладі ${l}: ${uk}`);
  }
}

// 2) uk / невідома мова / невідомий текст → без змін; змінні підставляються
assert.equal(t("uk", "⚠️ Запис недоступний"), "⚠️ Запис недоступний");
assert.equal(t(undefined, "{date} о {time}", { date: "2026-10-10", time: "10:00" }), "2026-10-10 о 10:00");
assert.equal(t("xx", "{date} о {time}", { date: "d", time: "t" }), "d о t");
assert.equal(t("en", "Власний текст майстра {date}", { date: "d" }), "Власний текст майстра d");
assert.equal(t("en", "{date} о {time}", { date: "10/10/2026", time: "10:00" }), "10/10/2026 at 10:00");
assert.equal(t("de", "❌ Запис скасовано"), "❌ Termin abgesagt");
assert.equal(t("pl", "Минуло {days} дн. після «{service}». Оберіть зручний час.", { days: 30, service: "Manicure" }), "Minęło 30 dni od „Manicure”. Wybierz dogodny termin.");
assert.equal(t("en", null), null);

// 3) змінні типового шаблону ({ім'я} тощо), яких немає у vars, лишаються для renderTemplateBody
assert.equal(t("en", "🔔 Нагадуємо: запис сьогодні о {час}. Майстер: {майстер}"), "🔔 Reminder: your appointment is today at {час}. Specialist: {майстер}");
assert.ok(hasBuiltin("{date} о {time}") && !hasBuiltin("Привіт, це мій текст"));

// 4) типові шаблони з admin-застосунку (INIT_TEMPLATES) мають переклад; змінений текст — ні
const src = fs.readFileSync(path.join(__dirname, "../../src/views/id4drive-templates.jsx"), "utf8");
const bodies = [...src.matchAll(/^\s*(?:\{ id:"t\d".*\n)?\s*body:("(?:[^"\\]|\\.)*")/gm)].map((m) => JSON.parse(m[1]));
assert.ok(bodies.length >= 8, "не знайшли типові шаблони");
for (const b of bodies) assert.ok(hasBuiltin(b), `типовий шаблон без перекладу: ${b}`);
assert.equal(t("fr", bodies[0] + " (змінено)"), bodies[0] + " (змінено)");

// 5) дати: uk — як раніше; інші — локаль отримувача
assert.equal(fmtDate("uk", "2026-10-21"), "2026-10-21");
assert.equal(fmtDate("en", "—"), "—");
assert.equal(fmtDate("en", "2026-10-21"), "21/10/2026");
assert.equal(fmtDate("de", "2026-10-21"), "21.10.2026");
assert.equal(fmtDate("pl", "2026-10-21"), "21.10.2026");
assert.equal(fmtDateLong("uk", "2026-10-21"), new Date("2026-10-21T00:00:00").toLocaleDateString("uk", { day: "numeric", month: "long", weekday: "short" }));
assert.match(fmtDateLong("de", "2026-10-21"), /Okt/);
assert.match(fmtDateLong("fr", "2026-10-21"), /octobre/);
assert.match(fmtDateLong("es", "2026-10-21"), /octubre/);
assert.equal(fmtTsDate("uk", Date.UTC(2026, 9, 21, 12)), "21.10.2026");
assert.equal(normLang("ru"), "uk");
assert.equal(normLang("en"), "en");
console.log("i18n.test.js: ALL PASS (" + Object.keys(DICT).length + " рядків × " + OTHER.length + " мов)");
