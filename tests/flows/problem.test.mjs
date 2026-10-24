// Запуск: bash tests/flows/run.sh problem
// «Щось не працює?»: submitProblem → system/contactMessages (суперадмінка), валідація, ліміт частоти.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const JUNO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.env.GCLOUD_PROJECT = "demo-flow";
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "demo-flow", databaseURL: "http://127.0.0.1:9000/?ns=demo-flow-default-rtdb" });
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const req = createRequire(resolve(JUNO, "functions/index.js"));
const admin = req("firebase-admin");
const fns = req(resolve(JUNO, "functions/index.js"));
const adb = admin.database();
let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };

const call = async (body, headers = {}, ip = "1.1.1.1") => {
  let status = 0, json = null;
  const res = { status(c) { status = c; return this; }, json(j) { json = j; return this; }, set() { return this; }, setHeader() {}, getHeader() {}, end() {}, on() {}, once() {}, emit() {}, removeListener() {} };
  await fns.submitProblem({ method: "POST", body, headers: { "x-forwarded-for": ip, ...headers }, get: (h) => headers[h.toLowerCase()] || "", ip }, res);
  return { status, json };
};
const list = async () => Object.values((await adb.ref("system/contactMessages").get()).val() || {});

await adb.ref("/").set({});
let r = await call({ app: "client", message: "ні" });
check("занадто короткий текст відхиляється", r.status === 400);
r = await call({ app: "client", message: "Не відкривається запис на урок", page: "/cabinet?x=1", version: "v1" });
check("звернення учня приймається", r.status === 200 && r.json?.ok === true);
let m = (await list())[0];
check("збережено в contactMessages з джерелом і версією", m && m.source === "app-client" && m.version === "v1" && m.status === "new" && m.message.includes("запис"), JSON.stringify(m));
check("query у шляху відрізається", m && m.page === "/cabinet");
r = await call({ app: "admin", message: "Слоти не розставляються" }, {}, "2.2.2.2");
check("звернення інструктора позначено app-admin", r.status === 200 && (await list()).some(x => x.source === "app-admin"));
r = await call({ app: "client", message: "ще одне повідомлення відразу" });
check("повторне з того ж IP за 15 с — ліміт (429)", r.status === 429);
r = await call({ app: "client", message: "x".repeat(5000) }, {}, "3.3.3.3");
check("довгий текст обрізається до 2000", r.status === 200 && (await list()).some(x => x.message.length === 2000));
// Новий інструктор → push власнику (без токенів нічого не відправляється, але тригер не має падати)
await admin.auth().createUser({ uid: "vendor1", email: "sash5385@gmail.com" }).catch(() => {});
let thrown = null;
try { await fns.notifyNewInstructor.run({ data: { val: () => ({ name: "Іван", phone: "+380501234567", slug: "ivan" }) }, params: { iid: "instX" } }); } catch (e) { thrown = e; }
check("notifyNewInstructor відпрацьовує без помилок", !thrown, String(thrown));
// токен власника з'являється → pushAdmin його читає (відправка в тесті не проходить, але тригер не падає)
await adb.ref("instructors/vendor1/fcmTokens/d1").set("fake-token");
thrown = null;
try { await fns.notifyNewInstructor.run({ data: { val: () => ({ name: "Петро" }) }, params: { iid: "instY" } }); } catch (e) { thrown = e; }
check("notifyNewInstructor із токеном не падає", !thrown, String(thrown));
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
