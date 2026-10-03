// Наскрізний тест платіжних вебхуків (LiqPay, Monobank) на ЕМУЛЯТОРІ Realtime Database — без мережі й ключів.
// Запуск (з кореня DrivePad, потрібен firebase-tools та Java):
//   npx firebase-tools emulators:exec --only database --project demo-pay "node functions/test/payments.e2e.js"
// Перевіряє: підпис, продовження ліцензії, ідемпотентність, річний тариф, повернення коштів, чужі/биті запити.
process.env.GCLOUD_PROJECT = "demo-pay";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
process.env.LIQPAY_PRIVATE_KEY = "test_private_key";
process.env.LIQPAY_PUBLIC_KEY = "test_public_key";
process.env.MONOBANK_TOKEN = "test_token";

const crypto = require("crypto");
// Monobank: підмінюємо запит публічного ключа власним ECDSA-ключем — так перевіряємо логіку верифікації підпису
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pubPem = publicKey.export({ type: "spki", format: "pem" });
const realFetch = global.fetch;
global.fetch = async (url, opts) => String(url).includes("api.monobank.ua/api/merchant/pubkey")
  ? { json: async () => ({ key: Buffer.from(pubPem).toString("base64") }) }
  : realFetch(url, opts);

const admin = require("firebase-admin");
const fns = require("../index.js");
const db = admin.database();
const DAY = 86400000;
let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };

const call = async (fn, { body = {}, headers = {}, rawBody } = {}) => {
  const res = { code: 200, sent: null, status(c) { this.code = c; return this; }, send(b) { this.sent = b; return this; }, set() { return this; } };
  const req = { method: "POST", body, rawBody, get: (h) => headers[h] || headers[h.toLowerCase()], headers };
  await (fn.run || fn)(req, res);
  return res;
};
const lpSign = (data) => crypto.createHash("sha1").update(process.env.LIQPAY_PRIVATE_KEY + data + process.env.LIQPAY_PRIVATE_KEY, "utf8").digest("base64");
const lpBody = (payload, sig) => { const data = Buffer.from(JSON.stringify(payload)).toString("base64"); return { data, signature: sig ?? lpSign(data) }; };
const lic = async (iid) => (await db.ref(`instructors/${iid}/license`).get()).val();

(async () => {
  await db.ref("/").set(null);
  const now = Date.now();
  await db.ref("instructors/i1/license").set({ status: "trial", trialEndsAt: now + 3 * DAY });
  await db.ref("instructors/i2/license").set({ status: "active", expiresAt: now + 10 * DAY, plan: "monthly" });

  console.log("── LiqPay");
  let r = await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i1-${now}`, status: "success", payment_id: 111 }) });
  let l = await lic("i1");
  check("valid signature → 200, trial becomes active (~31 days)", r.code === 200 && l.status === "active" && l.provider === "liqpay" && Math.abs(l.expiresAt - (now + 31 * DAY)) < 60000, JSON.stringify(l));
  const exp1 = l.expiresAt;
  r = await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i1-${now}`, status: "success", payment_id: 111 }) });
  check("duplicate webhook (same payment_id) does not extend again", (await lic("i1")).expiresAt === exp1);
  r = await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i1-${now + 1}`, status: "success", payment_id: 112 }) });
  check("second real payment extends from current expiry", Math.abs((await lic("i1")).expiresAt - (exp1 + 31 * DAY)) < 60000);
  r = await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i2-y-${now}`, status: "success", payment_id: 221 }) });
  l = await lic("i2");
  check("yearly plan (-y-) extends ~366 days on top of active", l.plan === "yearly" && Math.abs(l.expiresAt - (now + 10 * DAY + 366 * DAY)) < 60000, JSON.stringify(l));
  const before = JSON.stringify(await lic("i1"));
  r = await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i1-${now}`, status: "success", payment_id: 999 }, "forged_signature") });
  check("invalid signature → 400, license untouched", r.code === 400 && JSON.stringify(await lic("i1")) === before);
  r = await call(fns.liqpayCallback, { body: { data: "abc" } });
  check("missing signature → 400", r.code === 400);
  r = await call(fns.liqpayCallback, { body: lpBody({ order_id: "garbage", status: "success", payment_id: 5 }) });
  check("signed but unparsable order_id → 200, nothing changes", r.code === 200 && JSON.stringify(await lic("i1")) === before);
  r = await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i1-${now}`, status: "failure", payment_id: 333 }) });
  check("failed payment does not extend", JSON.stringify(await lic("i1")) === before);
  r = await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i2-y-${now}`, status: "reversed", payment_id: 221 }) });
  l = await lic("i2");
  check("refund (reversed) rolls the yearly payment back", Math.abs(l.expiresAt - (now + 10 * DAY)) < 60000 && l.lastRefundAt, JSON.stringify(l));
  const afterRefund = l.expiresAt;
  r = await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i2-y-${now}`, status: "reversed", payment_id: 221 }) });
  check("repeated refund webhook ignored", (await lic("i2")).expiresAt === afterRefund);
  await db.ref("instructors/i3/license").set({ status: "trial", trialEndsAt: now + 2 * DAY });
  await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i3-${now}`, status: "success", payment_id: 301 }) });
  await call(fns.liqpayCallback, { body: lpBody({ order_id: `drivepad-i3-${now}`, status: "reversed", payment_id: 301 }) });
  l = await lic("i3");
  check("refund of the first payment returns trial to trial", l.status === "trial" && !l.expiresAt, JSON.stringify(l));

  console.log("── Monobank");
  const monoCall = async (payload, { tamper = false, noSign = false } = {}) => {
    const raw = Buffer.from(JSON.stringify(payload));
    const sig = crypto.sign("sha256", raw, privateKey).toString("base64");
    const headers = noSign ? {} : { "X-Sign": tamper ? Buffer.from("bad").toString("base64") : sig };
    return call(fns.monobankCallback, { body: payload, headers, rawBody: raw });
  };
  await db.ref("instructors/i4/license").set({ status: "trial", trialEndsAt: now + 1 * DAY });
  r = await monoCall({ invoiceId: "inv1", status: "success", reference: `drivepad-i4-${now}` });
  l = await lic("i4");
  check("valid X-Sign → 200, license active (~31 days)", r.code === 200 && l.status === "active" && l.provider === "monobank" && Math.abs(l.expiresAt - (now + 31 * DAY)) < 60000, JSON.stringify(l));
  const m1 = l.expiresAt;
  await monoCall({ invoiceId: "inv1", status: "success", reference: `drivepad-i4-${now}` });
  check("duplicate invoice does not extend again", (await lic("i4")).expiresAt === m1);
  r = await monoCall({ invoiceId: "inv2", status: "success", reference: `drivepad-i4-${now}` }, { tamper: true });
  check("bad X-Sign → 400, nothing changes", r.code === 400 && (await lic("i4")).expiresAt === m1);
  r = await monoCall({ invoiceId: "inv3", status: "success", reference: `drivepad-i4-${now}` }, { noSign: true });
  check("no X-Sign → 400", r.code === 400 && (await lic("i4")).expiresAt === m1);
  r = await monoCall({ invoiceId: "inv1", status: "reversed", reference: `drivepad-i4-${now}` });
  l = await lic("i4");
  check("Monobank refund rolls back", l.status === "trial" && !l.expiresAt, JSON.stringify(l));

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("test crashed:", e); process.exit(2); });
