// Тест моніторингу помилок на ЕМУЛЯТОРІ Realtime Database.
// Запуск (з кореня Juno): npx firebase-tools emulators:exec --only database --project demo-mon "node functions/test/monitoring.e2e.js"
process.env.GCLOUD_PROJECT = "demo-mon";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:1"; // Auth-емулятора немає: пошук власника для push швидко падає, як і має

const admin = require("firebase-admin");
const fns = require("../index.js");
const db = admin.database();
let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };
const call = async (fn, { method = "POST", body = {}, ip = "1.1.1.1" } = {}) => {
  const res = { code: 200, out: null, headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.out = b; this.headersSent = true; return this; }, send(b) { this.out = b; this.headersSent = true; return this; }, set() { return this; },
    // мінімум для cors-обгортки onRequest
    on() {}, setHeader() {}, getHeader() {}, removeHeader() {}, end() {} };
  const req = { method, body, headers: { "x-forwarded-for": ip }, ip, get: () => "test-agent" };
  await (fn.run || fn)(req, res);
  return res;
};
const log = async () => (await db.ref("system/errorLog").get()).val() || {};
const err = (over = {}) => ({ app: "admin", message: "TypeError: x is undefined", stack: "TypeError: x\n    at a (app.js:1:1)\n    at b (app.js:2:2)", url: "/schedule?token=secret", version: "v02.10.19", ua: "UA", ...over });

(async () => {
  await db.ref("/").set(null);
  console.log("── reportError");
  let r = await call(fns.reportError, { body: err() });
  let l = await log(); const k = Object.keys(l);
  check("valid report → 200 and stored", r.code === 200 && k.length === 1 && l[k[0]].count === 1 && l[k[0]].app === "admin", JSON.stringify(l));
  check("query string stripped from url", l[k[0]]?.url === "/schedule", l[k[0]]?.url);
  r = await call(fns.reportError, { body: err({ version: "v02.10.20" }) });
  l = await log();
  check("same error groups: count=2, latest version kept", Object.keys(l).length === 1 && l[k[0]].count === 2 && l[k[0]].version === "v02.10.20");
  await call(fns.reportError, { body: err({ app: "client" }) });
  check("same message from other app is a separate group", Object.keys(await log()).length === 2);
  r = await call(fns.reportError, { body: { message: "" } });
  check("empty message → 400", r.code === 400);
  r = await call(fns.reportError, { method: "GET" });
  check("GET → 405", r.code === 405);
  await call(fns.reportError, { body: err({ message: "x".repeat(5000), stack: "s".repeat(9000), ua: "u".repeat(999) }) });
  const big = Object.values(await log()).find((e) => e.message.startsWith("xxxx"));
  check("oversized fields are truncated", big && big.message.length === 300 && big.stack.length === 1500 && big.ua.length === 160);
  let last;
  for (let i = 0; i < 25; i++) last = await call(fns.reportError, { body: err({ message: `flood ${i}` }), ip: "9.9.9.9" });
  const flood = Object.values(await log()).filter((e) => e.message.startsWith("flood")).length;
  check("rate limit: 20 per minute per IP, then 429", flood === 20 && last.code === 429, `stored=${flood} last=${last.code}`);
  r = await call(fns.reportError, { body: err({ message: "other ip ok" }), ip: "8.8.8.8" });
  check("other IP is not limited", r.code === 200);

  console.log("── cleanupErrorLog");
  await db.ref("system/errorLog/old1").set({ app: "admin", message: "old", count: 1, last: Date.now() - 20 * 86400000 });
  await db.ref("system/errorLog/new1").set({ app: "admin", message: "new", count: 1, last: Date.now() - 1000 });
  await db.ref("system/errorRate/stale").set({ w: Date.now() - 2 * 3600000, n: 3 });
  await (fns.cleanupErrorLog.run || fns.cleanupErrorLog)({});
  l = await log();
  check("entries older than 14 days removed, fresh kept", !l.old1 && !!l.new1);
  check("stale rate counters removed", !(await db.ref("system/errorRate/stale").get()).exists());

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
