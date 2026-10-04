// Типові тарифи UI збігаються з сервером, а валідація форми суперадміна дає те, що сервер приймає без змін.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DEFAULT_TARIFFS, toDraft, validateDraft } from "../../src/salonTariffs.js";
const require = createRequire(import.meta.url);
const server = require("../../functions/salon/tariffs.js");
let fails = 0;
const t = (name, fn) => { try { fn(); console.log(`ok   ${name}`); } catch (e) { fails++; console.log(`FAIL ${name}\n     ${e.message}`); } };

t("UI defaults equal the server defaults", () => assert.deepEqual(DEFAULT_TARIFFS, server.DEFAULT_TARIFFS));
t("default draft validates and round-trips", () => {
  const r = validateDraft(toDraft(DEFAULT_TARIFFS));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.tiers, DEFAULT_TARIFFS.tiers);
});
t("server accepts the validated value unchanged", () => {
  const d = toDraft(DEFAULT_TARIFFS); d.tiers[0].price = "149,50"; d.tiers[1].name = "  Команда+ "; d.yearMonths = "11";
  const r = validateDraft(d); assert.deepEqual(r.errors, []);
  const n = server.normalizeTariffs(r.value);
  assert.equal(n.yearMonths, 11); assert.equal(n.tiers[0].monthKop, 14950); assert.equal(n.tiers[1].name, "Команда+"); assert.equal(n.tiers.length, 4);
});
t("tiers are sorted by master limit", () => {
  const d = toDraft(DEFAULT_TARIFFS); d.tiers.reverse();
  assert.deepEqual(validateDraft(d).value.tiers.map((x) => x.key), ["solo", "team", "studio", "salon"]);
});
const bad = (name, mut, re) => t(`rejects: ${name}`, () => { const d = toDraft(DEFAULT_TARIFFS); mut(d); const e = validateDraft(d).errors; assert.ok(e.some((x) => re.test(x)), e.join("|")); });
bad("year months 0 / 13", (d) => { d.yearMonths = "13"; }, /Річна/);
bad("trial limit 0", (d) => { d.trialMasterLimit = "0"; }, /пробному/);
bad("no tiers", (d) => { d.tiers = []; }, /хоча б один/);
bad("bad key", (d) => { d.tiers[0].key = "Solo!"; }, /код/);
bad("duplicate key", (d) => { d.tiers[1].key = "solo"; }, /вже є/);
bad("empty name", (d) => { d.tiers[0].name = " "; }, /назву/);
bad("zero masters", (d) => { d.tiers[0].maxMasters = "0"; }, /ліміт майстрів/);
bad("duplicate limit", (d) => { d.tiers[1].maxMasters = "1"; }, /вже є в іншому/);
bad("price below 1 UAH", (d) => { d.tiers[0].price = "0.5"; }, /ціна від 1/);
bad("price not a number", (d) => { d.tiers[0].price = "abc"; }, /ціна від 1/);
bad("bigger tier cheaper than a smaller one", (d) => { d.tiers[2].price = "100"; }, /дорожчим/);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
