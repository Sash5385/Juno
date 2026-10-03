// Наскрізний тест підписки салону (тарифи за кількістю майстрів, оплата Monobank платформи, ліміт майстрів) на ЕМУЛЯТОРІ
// Realtime Database — без мережі, FCM, Auth і Monobank (усе підмінено). Запуск (з кореня Juno):
//   npx firebase-tools@13 emulators:exec --only database --project demo-billing "node functions/test/billing.e2e.js"
process.env.GCLOUD_PROJECT = "demo-billing";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
process.env.SALON_ADMIN_URL = "https://admin.test";
process.env.SALON_SUBSCRIPTION_WEBHOOK_URL = "https://hooks.test/salonSubscriptionCallback";
const TOK_P = "platform-token-0123456789abcdef";
process.env.JUNO_MONOBANK_TOKEN = TOK_P;

const crypto = require("crypto");
const admin = require("firebase-admin");

const pushes = [];
Object.defineProperty(admin, "messaging", { configurable: true, writable: true, value: () => ({ send: async (m) => { pushes.push({ token: m.token, title: m.data.title, body: m.data.body }); return "id"; } }) });
Object.defineProperty(admin, "auth", { configurable: true, writable: true, value: () => ({ verifyIdToken: async (t) => { if (!String(t).startsWith("tok:")) throw new Error("bad token"); return { uid: String(t).slice(4) }; } }) });
const titles = (token) => pushes.filter((p) => p.token === token).map((p) => p.title);

const genKey = () => { const k = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }); return { priv: k.privateKey, pub: k.publicKey.export({ type: "spki", format: "pem" }) }; };
const keys = { [TOK_P]: genKey() };
const evilKey = genKey();
const mono = { calls: [], seq: 0, createFail: false };
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  url = String(url);
  const base = "https://api.monobank.ua/api/merchant";
  if (!url.startsWith(base)) return realFetch(url, opts);
  const path = url.slice(base.length);
  const token = opts.headers?.["X-Token"];
  const body = opts.body ? JSON.parse(opts.body) : null;
  mono.calls.push({ path, token, body });
  const R = (ok, status, json) => ({ ok, status, json: async () => json });
  if (path === "/pubkey") return keys[token] ? R(true, 200, { key: Buffer.from(keys[token].pub).toString("base64") }) : R(false, 403, {});
  if (path === "/invoice/create") { if (mono.createFail) return R(false, 500, { errText: "boom" }); const n = ++mono.seq; return R(true, 200, { invoiceId: `sub${n}`, pageUrl: `https://pay.test/sub${n}` }); }
  return R(false, 404, {});
};

const fns = require("../index.js");
const T = require("../salon/tariffs");
const db = admin.database();

let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };
const call = async (fn, { method = "POST", body = {}, headers = {}, rawBody } = {}) => {
  const res = { code: 200, out: null, headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.out = b; this.headersSent = true; return this; }, send(b) { this.out = b; this.headersSent = true; return this; }, set() { return this; }, on() {}, setHeader() {}, getHeader() {}, removeHeader() {}, end() {} };
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  await (fn.run || fn)({ method, body, rawBody, headers: lower, get: (h) => lower[h.toLowerCase()] }, res);
  return res;
};
const as = (uid) => ({ Authorization: `Bearer tok:${uid}` });
const wr = (before, after, params) => ({ data: { before: { val: () => before }, after: { val: () => after } }, params });

const DAY = 86400000, S = "salonA";
const sref = (p, salon = S) => db.ref(p ? `salons/${salon}/${p}` : `salons/${salon}`);
const val = async (p, salon = S) => (await sref(p, salon).get()).val();
const bill = async (id) => (await db.ref(`salon_billing/${S}${id ? "/" + id : ""}`).get()).val();

async function seed(license, masters = 2) {
  await db.ref("/").set(null);
  await db.ref("salon_index").set({ [S]: { name: "Beauty" } });
  const m = {};
  for (let i = 1; i <= masters; i++) m[`m${i}`] = { profile: { name: `Master ${i}`, active: true, createdAt: i } };
  await sref("").set({ profile: { name: "Beauty", slug: "beauty" }, license, masters: m, fcmTokens: { d1: "tok-owner" } });
  pushes.length = 0; mono.calls.length = 0; mono.seq = 0; mono.createFail = false;
}
const hook = async (payload, { key = keys[TOK_P], noSign = false, tamper = false } = {}) => {
  const raw = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign("sha256", raw, key.priv).toString("base64");
  return call(fns.salonSubscriptionCallback, { body: payload, rawBody: raw, headers: noSign ? {} : { "X-Sign": tamper ? Buffer.from("bad").toString("base64") : sig } });
};
const ev = (pid, over = {}) => ({ invoiceId: "sub1", reference: `sub.${S}.${pid}`, status: "success", ...over });

(async () => {
  // ═══ Чиста логіка тарифів ═══
  console.log("── tariffs: pure logic");
  const TT = T.normalizeTariffs(null);
  const now = Date.UTC(2030, 0, 1);
  check("defaults: 4 tiers sorted by maxMasters", TT.tiers.length === 4 && TT.tiers.every((t, i, a) => !i || a[i - 1].maxMasters < t.maxMasters));
  const bad = T.normalizeTariffs({ tiers: [{ key: "x", maxMasters: 0, monthKop: 5 }], yearMonths: 99, trialMasterLimit: "abc" });
  check("broken override ignored → defaults kept", bad.tiers.length === 4 && bad.yearMonths === 10 && bad.trialMasterLimit === 3);
  const ok = T.normalizeTariffs({ yearMonths: 11, tiers: { a: { key: "a", name: "A", maxMasters: 2, monthKop: 10000 }, b: { key: "b", maxMasters: 1, monthKop: 5000 } } });
  check("valid override: sorted, name fallback, yearMonths", ok.tiers.map((t) => t.key).join() === "b,a" && ok.tiers[0].name === "b" && ok.yearMonths === 11);
  check("addMonths clamps month end", new Date(T.addMonths(Date.UTC(2030, 0, 31), 1)).toISOString().startsWith("2030-02-28") && new Date(T.addMonths(Date.UTC(2030, 0, 15), 12)).toISOString().startsWith("2031-01-15"));
  check("masterLimitOf: tier / trial / legacy active / none", T.masterLimitOf({ status: "active", masterLimit: 3 }, TT) === 3 && T.masterLimitOf({ status: "trial" }, TT) === 3 && T.masterLimitOf({ status: "active", expiresAt: 1 }, TT) === 15 && T.masterLimitOf(null, TT) === null);
  let q = T.quote(TT, { status: "trial", trialEndsAt: now + 5 * DAY }, { tierKey: "team", months: 12 }, 2, now);
  check("trial → new: year = 10 months of price, no credit", q.mode === "new" && q.amountKop === 399000 && q.creditKop === 0);
  q = T.quote(TT, { status: "active", expiresAt: now + 15 * DAY, masterLimit: 3, monthKop: 39900 }, { tierKey: "team", months: 1 }, 3, now);
  check("same tier while active → extend, full price", q.mode === "extend" && q.amountKop === 39900);
  q = T.quote(TT, { status: "active", expiresAt: now + 15 * DAY, masterLimit: 3, monthKop: 39900 }, { tierKey: "studio", months: 1 }, 3, now);
  check("upgrade: remaining 15 days of old tier credited", q.mode === "upgrade" && q.creditKop === 19950 && q.amountKop === 69900 - 19950);
  q = T.quote(TT, { status: "active", expiresAt: now + 300 * DAY, masterLimit: 3, monthKop: 39900 }, { tierKey: "studio", months: 1 }, 3, now);
  check("credit never drops the amount below the minimum", q.amountKop === T.MIN_AMOUNT_KOP);
  check("downgrade with too many masters rejected", T.quote(TT, { status: "active", expiresAt: now + DAY, masterLimit: 7 }, { tierKey: "solo", months: 1 }, 2, now).error === "too_many_masters");
  check("unknown tier / period rejected", T.quote(TT, null, { tierKey: "zzz", months: 1 }, 0, now).error === "bad_tier" && T.quote(TT, null, { tierKey: "solo", months: 3 }, 0, now).error === "bad_period");
  const lic = T.applyPayment({ status: "trial", trialEndsAt: now + 5 * DAY }, { mode: "new", months: 1, tierKey: "team", maxMasters: 3, monthKop: 39900, paymentId: "p" }, now);
  check("applyPayment carries the rest of the trial", lic.expiresAt === T.addMonths(now + 5 * DAY, 1) && lic.status === "active" && lic.masterLimit === 3 && lic.lastPaymentId === "p");
  check("applyPayment upgrade starts now", T.applyPayment({ status: "active", expiresAt: now + 20 * DAY }, { mode: "upgrade", months: 1, tierKey: "studio", maxMasters: 7, monthKop: 1, paymentId: "p" }, now).expiresAt === T.addMonths(now, 1));

  // ═══ salonSubscriptionInfo ═══
  console.log("── salonSubscriptionInfo");
  await seed({ status: "trial", trialEndsAt: Date.now() + 9 * DAY }, 2);
  let r = await call(fns.salonSubscriptionInfo, { body: {} });
  check("no token → 401", r.code === 401);
  r = await call(fns.salonSubscriptionInfo, { headers: as("stranger"), body: {} });
  check("not a salon owner → 404", r.code === 404 && r.out.error === "salon_not_found");
  r = await call(fns.salonSubscriptionInfo, { headers: as(S), body: {} });
  check("owner: tariffs, trial license, 2 active masters, trial limit 3, payable", r.code === 200 && r.out.tariffs.tiers.length === 4 && r.out.license.status === "trial" && r.out.activeMasters === 2 && r.out.masterLimit === 3 && r.out.payable === true, JSON.stringify(r.out));
  check("info never leaks secrets", !JSON.stringify(r.out).includes(TOK_P));
  r = await call(fns.salonSubscriptionInfo, { headers: as(S), body: { tier: "solo", months: 1 } });
  check("quote with too many masters is reported, not thrown", r.code === 200 && r.out.quote.error === "too_many_masters");
  r = await call(fns.salonSubscriptionInfo, { headers: as(S), body: { tier: "team", months: 1 } });
  check("quote for team/1", r.out.quote.amountKop === 39900 && r.out.quote.mode === "new");
  await db.ref("system/tariffs").set({ tiers: [{ key: "team", name: "Команда", maxMasters: 3, monthKop: 29900 }, { key: "solo", maxMasters: 1, monthKop: 9900 }] });
  r = await call(fns.salonSubscriptionInfo, { headers: as(S), body: { tier: "team", months: 1 } });
  check("system/tariffs overrides prices without a deploy", r.out.quote.amountKop === 29900 && r.out.tariffs.tiers.length === 2);
  await db.ref("system/tariffs").remove();

  // ═══ Рахунок ═══
  console.log("── salonCreateSubscriptionInvoice");
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "team", months: 1, dryRun: true } });
  check("dryRun: quote only, no Monobank call, nothing stored", r.code === 200 && r.out.quote.amountKop === 39900 && !mono.calls.length && (await bill()) == null);
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "nope", months: 1 } });
  check("bad tier → 400", r.code === 400 && r.out.error === "bad_tier");
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "team", months: 3 } });
  check("bad period → 400", r.code === 400 && r.out.error === "bad_period");
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "solo", months: 1 } });
  check("more active masters than the tier allows → 409", r.code === 409 && r.out.error === "too_many_masters" && !mono.calls.length);
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "team", months: 1 } });
  const pid = r.out.paymentId;
  const c0 = mono.calls[0];
  check("invoice created with the PLATFORM token, right amount, sub reference and webhook", r.code === 200 && r.out.pageUrl === "https://pay.test/sub1" && c0.token === TOK_P && c0.body.amount === 39900 && c0.body.merchantPaymInfo.reference === `sub.${S}.${pid}` && c0.body.webHookUrl === "https://hooks.test/salonSubscriptionCallback", JSON.stringify(c0));
  let rec = await bill(pid);
  check("billing record stored", rec.status === "created" && rec.tierKey === "team" && rec.maxMasters === 3 && rec.amountKop === 39900 && rec.invoiceId === "sub1" && rec.mode === "new");
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "team", months: 1 } });
  check("double click reuses the open invoice", r.out.reused === true && r.out.paymentId === pid && mono.calls.length === 1);
  mono.createFail = true;
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "team", months: 12 } });
  check("Monobank failure → 502, record marked error", r.code === 502 && Object.values(await bill()).some((p) => p.status === "error"));
  mono.createFail = false;
  delete process.env.JUNO_MONOBANK_TOKEN;
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "studio", months: 1 } });
  check("platform token not configured → 503", r.code === 503 && r.out.error === "billing_unavailable");
  r = await call(fns.salonSubscriptionInfo, { headers: as(S), body: {} });
  check("info tells the UI payments are unavailable", r.out.payable === false);
  process.env.JUNO_MONOBANK_TOKEN = TOK_P;

  // ═══ Вебхук ═══
  console.log("── salonSubscriptionCallback");
  r = await hook(ev(pid), { noSign: true });
  check("no X-Sign → 400", r.code === 400);
  r = await hook(ev(pid), { tamper: true });
  check("broken X-Sign → 400, license untouched", r.code === 400 && (await val("license/status")) === "trial");
  r = await hook(ev(pid), { key: evilKey });
  check("signed with a foreign key → 400", r.code === 400 && (await val("license/status")) === "trial");
  r = await hook(ev("x", { reference: "garbage" }));
  check("unknown reference → 200, nothing happens", r.code === 200 && (await val("license/status")) === "trial");
  await hook(ev(pid, { amount: 100 }));
  check("amount mismatch ignored", (await val("license/status")) === "trial" && (await bill(pid)).status === "created");
  await hook(ev(pid, { invoiceId: "other" }));
  check("foreign invoice id ignored", (await val("license/status")) === "trial");
  await hook(ev(pid, { status: "processing", modifiedDate: "2030-01-01T10:00:00Z" }));
  check("processing is recorded, license untouched", (await bill(pid)).status === "processing" && (await val("license/status")) === "trial");
  const trialEnd = (await val("license/trialEndsAt"));
  r = await hook(ev(pid, { amount: 39900, modifiedDate: "2030-01-01T10:05:00Z" }));
  const L = await val("license");
  check("success: license active, tier team, limit 3, expires = trial end + 1 month", r.code === 200 && L.status === "active" && L.tier === "team" && L.masterLimit === 3 && L.monthKop === 39900 && L.provider === "monobank" && L.lastPaymentId === pid && L.expiresAt === T.addMonths(trialEnd, 1), JSON.stringify(L));
  check("trial dates kept (history)", L.trialEndsAt === trialEnd);
  check("owner told + notification saved", titles("tok-owner").includes("✅ Підписку оплачено") && Object.values((await val("notifications/" + S)) || {}).some((n) => n.type === "payment"));
  rec = await bill(pid);
  check("record: success + applied + previous license snapshot", rec.status === "success" && rec.applied > 0 && rec.prevLicense.status === "trial");
  const exp1 = L.expiresAt; pushes.length = 0;
  await hook(ev(pid, { amount: 39900 }));
  check("repeated webhook is idempotent", (await val("license/expiresAt")) === exp1 && !pushes.length);
  await hook(ev(pid, { status: "processing", modifiedDate: "2030-01-01T09:00:00Z" }));
  check("late 'processing' after success cannot downgrade the record", (await bill(pid)).status === "success");

  // ═══ Підвищення тарифу ═══
  console.log("── upgrade with credit");
  await seed({ status: "active", expiresAt: Date.now() + 15 * DAY, masterLimit: 3, monthKop: 39900, tier: "team" }, 3);
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "studio", months: 1 } });
  const up = r.out;
  const amt = mono.calls[0].body.amount;
  check("upgrade amount = price − credit for the remaining days", up.quote.mode === "upgrade" && up.quote.creditKop > 19000 && up.quote.creditKop < 20500 && amt === 69900 - up.quote.creditKop, JSON.stringify(up.quote));
  await hook({ invoiceId: "sub1", reference: `sub.${S}.${up.paymentId}`, status: "success", amount: amt });
  const L2 = await val("license");
  check("upgrade applied: limit 7, new period starts now", L2.masterLimit === 7 && L2.tier === "studio" && Math.abs(L2.expiresAt - T.addMonths(Date.now(), 1)) < 5000);
  // платіж того ж тарифу при діючій підписці додається в кінець
  mono.seq = 1;
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "studio", months: 12 } });
  await hook({ invoiceId: "sub2", reference: `sub.${S}.${r.out.paymentId}`, status: "success", amount: r.out.quote.amountKop });
  check("same tier is added to the end of the paid period (year = 10 months price)", r.out.quote.mode === "extend" && r.out.quote.amountKop === 699000 && (await val("license/expiresAt")) === T.addMonths(L2.expiresAt, 12));

  // ═══ Повернення платежу ═══
  console.log("── reversed payment");
  const before = await val("license");
  const second = r.out.paymentId;
  await hook({ invoiceId: "sub1", reference: `sub.${S}.${up.paymentId}`, status: "reversed", amount: amt });
  check("reversing an OLDER payment is not rolled back automatically (needs review)", (await bill(up.paymentId)).needsReview === true && (await val("license/expiresAt")) === before.expiresAt);
  await hook({ invoiceId: "sub2", reference: `sub.${S}.${second}`, status: "reversed", amount: r.out.quote.amountKop });
  const after = await val("license");
  check("reversing the LATEST payment restores the previous license", after.expiresAt === L2.expiresAt && after.masterLimit === 7 && (await bill(second)).reversedAt > 0, JSON.stringify(after));
  check("owner told about the reversal", titles("tok-owner").includes("↩️ Платіж за підписку повернено"));
  const exp2 = after.expiresAt;
  await hook({ invoiceId: "sub2", reference: `sub.${S}.${second}`, status: "reversed", amount: r.out.quote.amountKop });
  check("repeated reversal is idempotent", (await val("license/expiresAt")) === exp2);

  // ═══ Оплата після видалення салону ═══
  console.log("── payment for a vanished salon");
  await seed({ status: "trial", trialEndsAt: Date.now() + DAY }, 1);
  r = await call(fns.salonCreateSubscriptionInvoice, { headers: as(S), body: { tier: "solo", months: 1 } });
  await sref("profile").remove();
  await hook({ invoiceId: "sub1", reference: `sub.${S}.${r.out.paymentId}`, status: "success", amount: 19900 });
  check("no profile → flagged for refund, license untouched", (await bill(r.out.paymentId)).needsRefund === true && (await val("license/status")) === "trial");

  // ═══ Ліміт майстрів ═══
  console.log("── master limit");
  const fire = async (id) => { const p = await val(`masters/${id}/profile`); return fns.salonOnMasterWritten.run(wr(null, p, { salonId: S, masterId: id })); };
  await seed({ status: "active", expiresAt: Date.now() + 10 * DAY, masterLimit: 1 }, 2);
  await Promise.all([fire("m1"), fire("m2")]);
  check("two masters over limit 1: only the newest is hidden (no double hide)", (await val("masters/m1/profile/active")) === true && (await val("masters/m2/profile/active")) === false);
  check("owner told about the limit", titles("tok-owner").includes("⚠️ Ліміт майстрів за тарифом"));
  pushes.length = 0;
  await fire("m2");
  check("hidden master edits do nothing", !pushes.length && (await val("masters/m1/profile/active")) === true);
  await sref("masters/m2/profile/active").set(true);
  await fire("m2");
  check("owner re-enabling over the limit is hidden again", (await val("masters/m2/profile/active")) === false);
  await sref("masters/m3").set({ profile: { name: "M3", active: false, createdAt: 3 } });
  await fire("m3");
  check("adding a hidden master is fine", (await val("masters/m3/profile/active")) === false && (await val("masters/m1/profile/active")) === true);
  await seed({ status: "trial", trialEndsAt: Date.now() + 5 * DAY }, 4);
  await fire("m4");
  check("trial limit (3): the 4th master is hidden", (await val("masters/m4/profile/active")) === false && (await val("masters/m3/profile/active")) === true);
  await seed({ status: "active", expiresAt: Date.now() + 5 * DAY }, 5);
  await fire("m5");
  check("legacy active license without masterLimit → no restriction", (await val("masters/m5/profile/active")) === true);
  await seed(null, 4); await sref("license").remove();
  await fire("m4");
  check("no license node → feature off", (await val("masters/m4/profile/active")) === true);
  await seed({ status: "active", expiresAt: Date.now() + DAY, masterLimit: 1 }, 1);
  await fns.salonOnMasterWritten.run(wr({ name: "x" }, null, { salonId: S, masterId: "m1" }));
  check("deleted master: no-op", (await val("masters/m1/profile/active")) === true);

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("test crashed:", e); process.exit(2); });
