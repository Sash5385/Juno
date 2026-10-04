// Наскрізний тест Cloud Functions салону на ЕМУЛЯТОРІ Realtime Database — без мережі, FCM, Auth і Monobank (усе підмінено).
// Запуск (з кореня Juno, потрібні firebase-tools і Java):
//   npx firebase-tools@13 emulators:exec --only database --project demo-salon "node functions/test/salon.e2e.js"
// Перевіряє: життєвий цикл запису і слоти пер майстер, сповіщення (клієнт/власник/майстер), черга очікування,
// нагадування, чати, запрошення майстрів, налаштування оплати, рахунок, вебхук Monobank (підпис, ідемпотентність,
// повернення, чужі запити), таймаут неоплачених записів, ліцензію і набір експортів.
/* eslint-disable no-useless-assignment */
process.env.GCLOUD_PROJECT = "demo-salon";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
process.env.SALON_ADMIN_URL = "https://admin.test";
process.env.SALON_CLIENT_URL = "https://client.test";
process.env.SALON_MONOBANK_WEBHOOK_URL = "https://hooks.test/salonMonobankCallback";

const crypto = require("crypto");
const admin = require("firebase-admin");

// ── підміна FCM і Auth ──────────────────────────────────────────────
const pushes = [];
const staleTokens = new Set();
Object.defineProperty(admin, "messaging", {
  configurable: true, writable: true,
  value: () => ({
    send: async (m) => {
      if (staleTokens.has(m.token)) { const e = new Error("stale"); e.code = "messaging/registration-token-not-registered"; throw e; }
      pushes.push({ token: m.token, title: m.data.title, body: m.data.body, url: m.data.url });
      return "id";
    },
  }),
});
Object.defineProperty(admin, "auth", {
  configurable: true, writable: true,
  value: () => ({ verifyIdToken: async (t) => { if (!String(t).startsWith("tok:")) throw new Error("bad token"); return { uid: String(t).slice(4) }; } }),
});
const pushOf = (token) => pushes.filter((p) => p.token === token);
const titles = (token) => pushOf(token).map((p) => p.title);

// ── підміна Monobank ────────────────────────────────────────────────
const genKey = () => { const k = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }); return { priv: k.privateKey, pub: k.publicKey.export({ type: "spki", format: "pem" }) }; };
const TOK_A = "token-salon-a-0123456789abcdef", TOK_B = "token-salon-b-0123456789abcdef";
const keys = { [TOK_A]: genKey(), [TOK_B]: genKey() };
const mono = { calls: [], seq: 0, refundOk: true, createFail: false };
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
  if (path === "/pubkey") return keys[token] ? R(true, 200, { key: Buffer.from(keys[token].pub).toString("base64") }) : R(false, 403, { errText: "bad token" });
  if (path === "/invoice/create") { if (mono.createFail) return R(false, 500, { errText: "boom" }); const n = ++mono.seq; return R(true, 200, { invoiceId: `inv${n}`, pageUrl: `https://pay.test/inv${n}` }); }
  if (path === "/invoice/cancel") return mono.refundOk ? R(true, 200, { status: "processing" }) : R(false, 500, {});
  return R(false, 404, {});
};

const fns = require("../index.js");
const lib = require("../salon/lib");
const reminders = require("../salon/reminders");
const registry = require("../salon/registry");
const payments = require("../salon/payments");
const db = admin.database();

// Реальні правила бази в емулятор: запити по date/bookingId/masterId працюють лише з .indexOn із database.rules.json,
// тож тест ловить забутий індекс (на бойовій базі це була б повільна вибірка на клієнті)
async function loadRules() {
  const ns = new URL(JSON.parse(process.env.FIREBASE_CONFIG || "{}").databaseURL || `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`).hostname.split(".")[0];
  const r = await realFetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.settings/rules.json?ns=${ns}`, {
    method: "PUT", headers: { Authorization: "Bearer owner" }, body: require("fs").readFileSync(require("path").join(__dirname, "../../database.rules.json"), "utf8"),
  });
  if (!r.ok) throw new Error(`rules not loaded: ${r.status}`);
}

let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };

const call = async (fn, { method = "POST", body = {}, headers = {}, rawBody } = {}) => {
  const res = { code: 200, out: null, headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.out = b; this.headersSent = true; return this; }, send(b) { this.out = b; this.headersSent = true; return this; }, set() { return this; }, on() {}, setHeader() {}, getHeader() {}, removeHeader() {}, end() {} };
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { method, body, rawBody, headers: lower, get: (h) => lower[h.toLowerCase()] };
  await (fn.run || fn)(req, res);
  return res;
};
const as = (uid) => ({ Authorization: `Bearer tok:${uid}` });
const wr = (before, after, params) => ({ data: { before: { val: () => before }, after: { val: () => after } }, params });

const DAY = 86400000, MIN = 60000;
const S = "salonA", S2 = "salonB", D1 = "2030-05-14";
const sref = (p, salon = S) => db.ref(p ? `salons/${salon}/${p}` : `salons/${salon}`);
const val = async (p, salon = S) => (await sref(p, salon).get()).val();
const grid = () => Object.fromEntries(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00"].map((t) => [`slot${t.replace(":", "")}`, { time: t, available: true }]));
const free = async (mid, hhmm, date = D1) => (await val(`timeslots/${mid}/${date}/slot${hhmm.replace(":", "")}/available`));

async function seed() {
  await db.ref("/").set(null);
  const now = Date.now();
  await db.ref("salon_index").set({ [S]: { name: "Beauty" }, [S2]: { name: "Other" } });
  await sref("").set({
    profile: { name: "Beauty", slug: "beauty", timezone: "Europe/Kyiv" },
    license: { status: "active", expiresAt: now + 30 * DAY },
    fcmTokens: { d1: "tok-owner" },
    masters: { m1: { profile: { name: "Anna", active: true } }, m2: { profile: { name: "Boris", active: true } }, m3: { profile: { name: "Clara", active: true } } },
    masterAuth: { uM1: "m1" },
    masterSettings: { m1: { uid: "uM1" } },
    masterTokens: { m1: { d1: "tok-m1" }, m2: { d1: "tok-m2" } },
    users: { c1: { profile: { name: "Client One", phone: "+380501111111" }, fcmTokens: { d1: "tok-c1" } }, c2: { profile: { name: "Client Two" }, fcmTokens: { d1: "tok-c2" } } },
    services: { haircut: { name: "Стрижка", price: 500, masterIds: { m1: true, m2: true } } },
    timeslots: { m1: { [D1]: grid() }, m2: { [D1]: grid() } },
  });
  await db.ref(`salons/${S2}`).set({ profile: { name: "Other" }, license: { status: "active", expiresAt: now + 30 * DAY }, fcmTokens: { d1: "tok-owner-b" } });
  pushes.length = 0; mono.calls.length = 0; mono.seq = 0; mono.refundOk = true; mono.createFail = false; staleTokens.clear();
}
const NB = (over = {}) => ({ id: "b1", masterId: "m1", serviceId: "haircut", serviceName: "Стрижка", price: 500, durationMin: 60, clientUid: "c1", clientName: "Client One", phone: "+380501111111", date: D1, time: "10:00", status: "pending", paymentMethod: "onsite", createdAt: Date.now(), ...over });
const trig = (id, before, after) => fns.salonOnBookingChanged.run(wr(before, after, { salonId: S, bookingId: id }));
async function book(id, b) { await sref(`bookings/${id}`).set(b); await trig(id, null, b); }
async function patch(id, upd) {
  const before = await val(`bookings/${id}`);
  await sref(`bookings/${id}`).update(upd);
  await trig(id, before, await val(`bookings/${id}`));
}
async function del(id) { const before = await val(`bookings/${id}`); await sref(`bookings/${id}`).remove(); await trig(id, before, null); }

(async () => {
  await loadRules();
  // ═══ Експорти ═══
  console.log("── exports");
  const names = Object.keys(fns).filter((k) => k.startsWith("salon"));
  check("29 salon functions exported", names.length === 29, names.join(","));
  check("exports are only functions", Object.values(fns).every((f) => typeof f === "function"));
  check("general functions exported: contact form + error monitoring", ["submitContact", "reportError", "cleanupErrorLog"].every((k) => typeof fns[k] === "function"));
  check("no leftovers from the instructor product", Object.keys(fns).length === 32 && !fns.onBookingChanged && !fns.deleteAccount && !fns.createLiqPayOrder, Object.keys(fns).join(","));

  // ═══ Час ═══
  console.log("── localToMs / timezones");
  check("Kyiv winter (UTC+2)", lib.localToMs("2030-01-15", "12:00") === Date.UTC(2030, 0, 15, 10, 0));
  check("Kyiv summer (UTC+3)", lib.localToMs("2030-07-15", "12:00") === Date.UTC(2030, 6, 15, 9, 0));
  check("Kyiv day after spring-forward (Mar 31 2030)", lib.localToMs("2030-03-31", "12:00") === Date.UTC(2030, 2, 31, 9, 0));
  check("Kyiv day before spring-forward", lib.localToMs("2030-03-30", "12:00") === Date.UTC(2030, 2, 30, 10, 0));
  check("other tz (New York summer UTC-4)", lib.localToMs("2030-07-15", "12:00", "America/New_York") === Date.UTC(2030, 6, 15, 16, 0));
  check("localDate across midnight", lib.localDate(Date.UTC(2030, 4, 13, 22, 30)) === "2030-05-14");
  check("quiet hours 23:00-06:00 (local)", lib.isQuietHour(Date.UTC(2030, 4, 13, 21, 30), "Europe/Kyiv") && !lib.isQuietHour(Date.UTC(2030, 4, 13, 9, 0), "Europe/Kyiv"));

  // ═══ Запис: створення, слоти, сповіщення ═══
  console.log("── booking: create (client)");
  await seed();
  await book("b1", NB());
  check("slots 10:00 and 10:30 of m1 blocked", (await free("m1", "10:00")) === false && (await free("m1", "10:30")) === false);
  check("slot 11:00 untouched, other master untouched", (await free("m1", "11:00")) === true && (await free("m2", "10:00")) === true);
  check("owner pushed 'new booking' with master name", titles("tok-owner").includes("📋 Новий запис") && /Майстер: Anna/.test(pushOf("tok-owner")[0].body));
  check("master pushed, without master line", titles("tok-m1").includes("📋 Новий запис") && !/Майстер:/.test(pushOf("tok-m1")[0].body));
  check("other master not pushed", pushOf("tok-m2").length === 0);
  check("client not pushed on own booking", pushOf("tok-c1").length === 0);
  check("activeClients / recentClients written", (await val("activeClients/c1")) === true && typeof (await val("recentClients/c1")) === "number");

  console.log("── booking: confirm / cancel / notes");
  pushes.length = 0;
  await patch("b1", { status: "confirmed" });
  check("client pushed 'confirmed' + notification stored", titles("tok-c1").includes("✅ Запис підтверджено") && Object.values((await val("notifications/c1")) || {}).some((n) => n.type === "booking_confirmed"));
  pushes.length = 0;
  await patch("b1", { clientConfirmed: true });
  check("client confirmed visit → staff pushed", titles("tok-owner").includes("✅ Клієнт підтвердив візит") && titles("tok-m1").includes("✅ Клієнт підтвердив візит"));
  pushes.length = 0;
  await patch("b1", { clientNote: "Прийду з другом" });
  check("client note → staff pushed with note", /Прийду з другом/.test(pushOf("tok-owner")[0]?.body || ""));
  pushes.length = 0;
  await patch("b1", { paymentStatus: "paid", paidAmount: 500 });
  check("payment-only change sends nothing", pushes.length === 0);
  await patch("b1", { status: "cancelled", cancelledBy: "client", cancelledAt: Date.now() });
  check("client cancel frees slots", (await free("m1", "10:00")) === true && (await free("m1", "10:30")) === true);
  check("client cancel → staff pushed", titles("tok-owner").includes("❌ Запис скасовано клієнтом") && titles("tok-m1").includes("❌ Запис скасовано клієнтом"));

  console.log("── booking: slot protection (overlap / adjacent)");
  await seed();
  await book("b1", NB({ time: "10:00", durationMin: 60 }));
  await book("b2", NB({ id: "b2", time: "11:00", durationMin: 60, clientUid: "c2", clientName: "Two" }));
  await patch("b1", { status: "cancelled", cancelledBy: "client" });
  check("cancelling b1 frees 10:00-11:00 only", (await free("m1", "10:00")) === true && (await free("m1", "10:30")) === true);
  check("neighbour b2 (11:00-12:00) stays blocked", (await free("m1", "11:00")) === false && (await free("m1", "11:30")) === false);
  await seed();
  await book("b1", NB({ time: "10:00", durationMin: 60 }));
  await book("b3", NB({ id: "b3", time: "10:30", durationMin: 60, clientUid: "c2", clientName: "Two" })); // накладка на 10:30
  await patch("b1", { status: "cancelled", cancelledBy: "client" });
  check("overlap: 10:30 stays blocked by active b3, 10:00 freed", (await free("m1", "10:00")) === true && (await free("m1", "10:30")) === false && (await free("m1", "11:00")) === false);
  await del("b3");
  check("deleting an active booking frees its slots", (await free("m1", "10:30")) === true && (await free("m1", "11:00")) === true);

  console.log("── booking: phantom slots (90 min)");
  await seed();
  await sref(`timeslots/m1/${D1}`).set({ slot1000: { time: "10:00", available: true }, slot1100: { time: "11:00", available: true } });
  await book("b1", NB({ durationMin: 90 }));
  const day = await val(`timeslots/m1/${D1}`);
  check("90 min booking creates phantom 10:30 and blocks 10:00, 11:00", day.slot1030?.phantom === true && day.slot1000.available === false && day.slot1100.available === false);
  await patch("b1", { status: "cancelled", cancelledBy: "admin" });
  const day2 = await val(`timeslots/m1/${D1}`);
  check("cancel removes phantom, restores real slots", day2.slot1030 == null && day2.slot1000.available === true && day2.slot1100.available === true);

  console.log("── booking: staff-created, personal, online");
  await seed();
  await book("s1", NB({ id: "s1", createdBy: "admin", status: "confirmed" }));
  check("staff-created: client pushed, master pushed, owner not", titles("tok-c1").includes("📋 Запис створено") && titles("tok-m1").includes("📋 Новий запис у вашому розкладі") && pushOf("tok-owner").length === 0);
  pushes.length = 0;
  await book("s2", NB({ id: "s2", createdBy: "master", time: "12:00", status: "confirmed" }));
  check("master-created: client pushed, owner not pushed", titles("tok-c1").includes("📋 Запис створено") && pushOf("tok-owner").length === 0);
  pushes.length = 0;
  await book("p1", NB({ id: "p1", status: "personal", createdBy: "master", clientUid: null, clientName: null, time: "13:00", durationMin: 60 }));
  check("personal event blocks slots, sends nothing", (await free("m1", "13:00")) === false && pushes.length === 0);
  await del("p1");
  check("deleting personal event frees slots", (await free("m1", "13:00")) === true);
  pushes.length = 0;
  await book("o1", NB({ id: "o1", paymentMethod: "online", time: "09:00" }));
  check("online booking: slots held, staff NOT pushed until paid", (await free("m1", "09:00")) === false && pushOf("tok-owner").length === 0 && pushOf("tok-m1").length === 0);
  await book("w1", NB({ id: "w1", clientUid: null, clientName: "Walk-in", createdBy: "admin", time: "14:00", durationMin: 30, status: "confirmed" }));
  check("walk-in booking without clientUid works", (await free("m1", "14:00")) === false);

  console.log("── booking: owner works as a master (solo salon)");
  await seed();
  await sref("masterSettings/m1/uid").set(S);
  await book("b1", NB());
  check("owner bound to master gets ONE push, not two", titles("tok-owner").filter((t) => t === "📋 Новий запис").length === 1 && pushOf("tok-m1").length === 0);

  console.log("── booking: cancellations by owner / master / timeout / reschedule");
  await seed();
  await book("b1", NB({ status: "confirmed" })); pushes.length = 0;
  await patch("b1", { status: "cancelled", cancelledBy: "admin" });
  check("owner cancel: client + master pushed, owner not", titles("tok-c1").includes("❌ Запис скасовано") && titles("tok-m1").includes("❌ Запис скасовано") && pushOf("tok-owner").length === 0 && (await free("m1", "10:00")) === true);
  await seed();
  await book("b1", NB({ status: "confirmed" })); pushes.length = 0;
  await patch("b1", { status: "cancelled", cancelledBy: "master" });
  check("master cancel: client + owner pushed, master not", titles("tok-c1").includes("❌ Запис скасовано") && titles("tok-owner").includes("❌ Майстер скасував запис") && pushOf("tok-m1").length === 0);
  await seed();
  await book("b1", NB({ paymentMethod: "online" })); pushes.length = 0;
  await patch("b1", { status: "cancelled", cancelledBy: "payment_timeout" });
  check("payment timeout: client told, staff silent, slots freed", titles("tok-c1").includes("⌛ Запис скасовано") && pushOf("tok-owner").length === 0 && (await free("m1", "10:00")) === true);
  await seed();
  await book("b1", NB({ status: "confirmed" })); pushes.length = 0;
  await patch("b1", { status: "cancelled", cancelledBy: "reschedule" });
  check("reschedule-cancel: slots freed, nobody pushed", (await free("m1", "10:00")) === true && pushes.length === 0);
  await book("b1n", NB({ id: "b1n", time: "10:30", rescheduledFrom: `${D1} 10:00` }));
  check("client reschedule (new booking): staff pushed '🔁'", titles("tok-owner").includes("🔁 Запис перенесено") && /з 14\.05 о 10:00 на 14\.05 о 10:30/.test(pushOf("tok-owner").at(-1).body));

  console.log("── booking: staff reschedule (time and master)");
  await seed();
  await book("b1", NB({ status: "confirmed" })); pushes.length = 0;
  await patch("b1", { time: "10:30" });
  check("move 10:00→10:30: 10:00 freed, 10:30 and 11:00 blocked", (await free("m1", "10:00")) === true && (await free("m1", "10:30")) === false && (await free("m1", "11:00")) === false);
  const rq = await val("rescheduleQueue/b1");
  check("client notification queued with debounce", rq && rq.clientUid === "c1" && /10:30/.test(rq.body) && rq.sendAfter > Date.now() + 30000);
  await patch("b1", { masterId: "m2", time: "12:00" });
  check("move to another master: old freed, new blocked", (await free("m1", "10:30")) === true && (await free("m1", "11:00")) === true && (await free("m2", "12:00")) === false && (await free("m2", "12:30")) === false);
  check("both masters notified of the move", titles("tok-m2").includes("📋 Новий запис у вашому розкладі") && titles("tok-m1").includes("🔁 Запис передано іншому майстру"));

  console.log("── booking: license (read-only mode) and robustness");
  await seed();
  await sref("license").set({ status: "suspended" });
  await book("b1", NB());
  const lb = await val("bookings/b1");
  check("suspended salon: client booking cancelled by license", lb.status === "cancelled" && lb.cancelledBy === "license");
  check("…slots freed, client told, staff silent", (await free("m1", "10:00")) === true && titles("tok-c1").includes("⚠️ Запис недоступний") && pushOf("tok-owner").length === 0);
  await trig("b1", NB(), lb);
  check("license-cancel update event is a no-op", titles("tok-c1").length === 1);
  pushes.length = 0;
  await book("b2", NB({ id: "b2", createdBy: "admin", time: "12:00" }));
  check("staff booking still allowed in read-only mode", (await free("m1", "12:00")) === false);
  await seed();
  await book("x1", NB({ id: "x1", masterId: null }));
  check("booking without masterId is ignored safely", pushes.length === 0);
  staleTokens.add("tok-owner");
  await book("b9", NB({ id: "b9", time: "13:00" }));
  check("stale FCM token is removed from owner tokens", (await val("fcmTokens/d1")) === null);

  console.log("── slot step (profile/slotStep)");
  await seed();
  await sref("profile/slotStep").set(15);
  await sref(`timeslots/m1/${D1}`).set(Object.fromEntries(["10:00", "10:15", "10:30", "10:45", "11:00"].map((t) => [`slot${t.replace(":", "")}`, { time: t, available: true }])));
  await book("k1", NB({ id: "k1", durationMin: 45 }));
  check("45 min on a 15-min grid blocks 10:00, 10:15, 10:30 only", (await free("m1", "10:00")) === false && (await free("m1", "10:15")) === false && (await free("m1", "10:30")) === false && (await free("m1", "10:45")) === true);
  await patch("k1", { time: "10:15" });
  check("move by 15 min: 10:00 freed, 10:15–10:45 blocked", (await free("m1", "10:00")) === true && (await free("m1", "10:15")) === false && (await free("m1", "10:45")) === false && (await free("m1", "11:00")) === true);
  await patch("k1", { status: "cancelled", cancelledBy: "client" });
  check("cancel restores the 15-min grid", (await free("m1", "10:15")) === true && (await free("m1", "10:30")) === true && (await free("m1", "10:45")) === true);
  await sref("profile/slotStep").set(7);
  check("invalid step falls back to 30", (await lib.salonSlotStep(S)) === 30);

  // ═══ Черга очікування ═══
  console.log("── queue (per master)");
  await seed();
  await book("b1", NB({ status: "confirmed" }));
  await sref("queue/m1/2030-05-14_10:00/entries").set({
    c2: { uid: "c2", durationMin: 60, name: "Two", addedAt: 1, status: "waiting" },
    c3: { uid: "c3", durationMin: 30, name: "Three", addedAt: 2, status: "waiting" },
  });
  await sref("users/c3").set({ profile: { name: "Three" }, fcmTokens: { d1: "tok-c3" } });
  pushes.length = 0;
  await patch("b1", { status: "cancelled", cancelledBy: "client" });
  let q = await val("queue/m1/2030-05-14_10:00/entries");
  check("cancel invites first waiting client (c2) with freed duration", q.c2.status === "offered" && q.c2.offerDurationMin === 60 && q.c3.status === "waiting");
  const before = { ...q.c2, status: "waiting" };
  await fns.salonOnQueueInvite.run(wr(before, q.c2, { salonId: S, masterId: "m1", slotKey: "2030-05-14_10:00", uid: "c2" }));
  const off = await val(`timeslots/m1/${D1}/slot1000/offeredTo/c2`);
  const qo = await val("users/c2/queueOffers/m1_2030-05-14_10:00");
  check("offer reserves slot 30 min, in-app offer stored", off && off.until > Date.now() + 25 * MIN && qo && qo.masterId === "m1" && qo.durationMin === 60);
  check("c2 pushed with master name", /Anna/.test(pushOf("tok-c2")[0]?.body || "") && titles("tok-c2")[0] === "🎉 Звільнився час для вас!");
  // каскад: пропозиція прострочена → c3
  await sref(`timeslots/m1/${D1}/slot1000/offeredTo/c2`).set({ until: Date.now() - MIN });
  await fns.salonCascadeQueueInvites.run({});
  q = await val("queue/m1/2030-05-14_10:00/entries");
  check("cascade: expired c2 → expired, next c3 invited", q.c2.status === "expired" && q.c3.status === "offered");
  check("cascade clears expired reservation and offer", (await val(`timeslots/m1/${D1}/slot1000/offeredTo/c2`)) === null && (await val("users/c2/queueOffers/m1_2030-05-14_10:00")) === null);
  await sref(`timeslots/m1/${D1}/slot1000/offeredTo/c3`).set({ until: Date.now() + 20 * MIN });
  await sref("queue/m1/2030-05-14_10:00/entries/c4").set({ uid: "c4", addedAt: 3, status: "waiting" });
  await sref(`timeslots/m1/${D1}/slot1000/offeredTo/c2`).set({ until: Date.now() - MIN });
  await sref("queue/m1/2030-05-14_10:00/entries/c2/status").set("offered");
  await fns.salonCascadeQueueInvites.run({});
  check("cascade waits while another offer is still active", (await val("queue/m1/2030-05-14_10:00/entries/c4/status")) === "waiting");
  await sref(`timeslots/m1/${D1}/slot1000/available`).set(false);
  await sref(`timeslots/m1/${D1}/slot1000/offeredTo/c3`).set({ until: Date.now() - MIN });
  await fns.salonCascadeQueueInvites.run({});
  check("cascade ignores slots that are already taken", (await val("queue/m1/2030-05-14_10:00/entries/c4/status")) === "waiting");
  // власник відкрив заблокований слот
  await seed();
  await sref("queue/m1/2030-05-14_09:00/entries/c2").set({ uid: "c2", addedAt: 1, status: "waiting" });
  await fns.salonOnAdminSlotOpened.run(wr({ time: "09:00", available: false, adminBlocked: true }, { time: "09:00", available: true, adminBlocked: false }, { salonId: S, masterId: "m1", date: D1, slotId: "slot0900" }));
  check("unblocking a slot invites the first waiting client", (await val("queue/m1/2030-05-14_09:00/entries/c2/status")) === "offered");
  await sref("queue/m1/2030-05-14_09:30/entries/c2").set({ uid: "c2", addedAt: 1, status: "waiting" });
  await fns.salonOnAdminSlotOpened.run(wr({ time: "09:30", available: true }, { time: "09:30", available: true, adminBlocked: false }, { salonId: S, masterId: "m1", date: D1, slotId: "slot0930" }));
  await fns.salonOnAdminSlotOpened.run(wr({ time: "09:30", available: false, adminBlocked: false }, { time: "09:30", available: true, adminBlocked: false }, { salonId: S, masterId: "m1", date: D1, slotId: "slot0930" }));
  check("ordinary slot changes (not an owner unblock) do not invite", (await val("queue/m1/2030-05-14_09:30/entries/c2/status")) === "waiting");

  // ═══ Нагадування ═══
  console.log("── reminders");
  await seed();
  const T0 = Date.UTC(2030, 4, 13, 7, 0); // 10:00 Київ
  const mk = (id, date, time, extra = {}) => sref(`bookings/${id}`).set(NB({ id, date, time, status: "confirmed", ...extra }));
  await mk("r24", "2030-05-14", "09:30");                 // через 23.5 год
  await mk("r2", "2030-05-13", "11:55");                  // через 1 год 55 хв
  await mk("far", "2030-05-15", "10:00");                 // через 48 год — рано
  await mk("canc", "2030-05-14", "09:45", { status: "cancelled", cancelledBy: "client" });
  await mk("walk", "2030-05-14", "09:40", { clientUid: null });
  await mk("pers", "2030-05-14", "09:50", { status: "personal" });
  await reminders.remindSalon(S, T0);
  const rb = pushOf("tok-c1").map((p) => p.title);
  check("24h and 2h reminders sent once each", rb.filter((t) => t === "💈 Нагадування про запис").length === 1 && rb.filter((t) => t === "⏰ Запис через 2 години").length === 1, rb.join("|"));
  check("reminder text carries time and master", pushOf("tok-c1").every((p) => /Anna/.test(p.body)) && pushOf("tok-c1").some((p) => /09:30/.test(p.body)));
  check("cancelled / walk-in / personal / far bookings not reminded", pushOf("tok-c1").length === 2);
  await reminders.remindSalon(S, T0);
  check("second run: no duplicates (flags)", pushOf("tok-c1").length === 2 && (await val("sentReminders/r24/r24")) === true && (await val("sentReminders/r2/r2")) === true);
  await seed();
  await mk("q24", "2030-05-15", "00:00");                 // рівно через 23.5 год від 00:30 — вікно 24-год відкрите, але це тихі години
  await reminders.remindSalon(S, Date.UTC(2030, 4, 13, 21, 30)); // 00:30 за Києвом
  check("quiet hours (23:00–06:00) suppress the 24h reminder", pushOf("tok-c1").length === 0);
  await seed();
  await sref("license").set({ status: "suspended" });
  await mk("r24", "2030-05-14", "09:30");
  await reminders.remindSalon(S, T0);
  check("read-only salon: no reminders", pushes.length === 0);
  await seed();
  await book("b1", NB({ status: "confirmed" })); pushes.length = 0;
  await patch("b1", { time: "11:00" });
  check("reschedule queue not flushed before sendAfter", (await reminders.flushRescheduleQueueFor(S, Date.now())) === 0 && pushOf("tok-c1").length === 0);
  check("…flushed after sendAfter: client pushed, entry removed", (await reminders.flushRescheduleQueueFor(S, Date.now() + 2 * MIN)) === 1 && titles("tok-c1").includes("🔄 Запис перенесено") && (await val("rescheduleQueue/b1")) === null);
  await sref("rescheduleQueue/b1").set({ clientUid: "c1", body: "Новий час", sendAfter: Date.now() - 1000 }); pushes.length = 0;
  await fns.salonFlushRescheduleQueue.run({});
  check("scheduled flush walks salon_index and delivers due notifications", titles("tok-c1").includes("🔄 Запис перенесено") && (await val("rescheduleQueue/b1")) === null);

  // ═══ Чати ═══
  console.log("── chats");
  await seed();
  const created = (data, params) => ({ data: { val: () => data }, params });
  await fns.salonOnClientMessage.run(created({ from: "client", text: "Є вільний час?" }, { salonId: S, uid: "c1", msgId: "m" }));
  check("client → owner push with client name", pushOf("tok-owner")[0]?.title === "💬 Client One" && pushOf("tok-owner")[0].body === "Є вільний час?");
  await fns.salonOnClientMessage.run(created({ from: "admin", text: "x" }, { salonId: S, uid: "c1", msgId: "m" }));
  check("owner's own message does not push owner", pushOf("tok-owner").length === 1);
  await fns.salonOnOwnerMessage.run(created({ from: "admin", text: "Так, на 15:00" }, { salonId: S, uid: "c1", msgId: "m" }));
  check("owner → client push titled with salon name", pushOf("tok-c1")[0]?.title === "💬 Beauty");
  await fns.salonOnOwnerMessage.run(created({ from: "admin", text: "auto", auto: true }, { salonId: S, uid: "c1", msgId: "m" }));
  await fns.salonOnOwnerMessage.run(created({ from: "admin", text: "all", name: "x" }, { salonId: S, uid: "general", msgId: "m" }));
  check("auto and general messages do not push a client", pushOf("tok-c1").length === 1);
  await fns.salonOnMasterChatMessage.run(created({ from: "client", text: "Привіт, Анно" }, { salonId: S, masterId: "m1", uid: "c1", msgId: "m" }));
  check("client → master chat: master pushed, owner not", pushOf("tok-m1")[0]?.title === "💬 Client One" && pushOf("tok-owner").length === 1);
  await fns.salonOnMasterChatMessage.run(created({ from: "master", text: "Привіт!" }, { salonId: S, masterId: "m1", uid: "c1", msgId: "m" }));
  check("master → client: titled with master name, link to that chat", pushOf("tok-c1")[1]?.title === "💬 Anna" && /chat\?master=m1/.test(pushOf("tok-c1")[1].url));

  // ═══ Реєстр і ліцензія ═══
  console.log("── registry / license");
  await db.ref("/").set(null);
  await fns.salonOnProfileCreated.run(created({ name: "New Salon", slug: "new" }, { salonId: "salonZ" }));
  const idx = (await db.ref("salon_index/salonZ").get()).val();
  check("new salon profile → salon_index entry", idx && idx.name === "New Salon" && idx.slug === "new");
  await seed();
  await fns.salonOnClientRegistered.run(created({ name: "Nova", phone: "+380" }, { salonId: S, uid: "cN" }));
  check("new client → owner pushed", titles("tok-owner").includes("🎉 Новий клієнт") && /Nova · \+380/.test(pushOf("tok-owner")[0].body));
  const now = Date.now();
  await sref("license").set({ status: "trial", trialEndsAt: now + 2 * DAY }); pushes.length = 0;
  await registry.checkSalonLicense(S, now);
  check("3-day warning sent once", titles("tok-owner").includes("⏳ Скоро завершення"));
  await registry.checkSalonLicense(S, now);
  check("…and not repeated", pushOf("tok-owner").length === 1);
  await sref("license").set({ status: "active", expiresAt: now - 3600000 }); pushes.length = 0;
  await registry.checkSalonLicense(S, now);
  check("grace day: reminder, status still active", titles("tok-owner").includes("⚠️ Підписку не оплачено") && (await val("license/status")) === "active");
  await sref("license").set({ status: "active", expiresAt: now - 2 * DAY }); pushes.length = 0;
  await registry.checkSalonLicense(S, now);
  check("after grace: suspended + owner told", (await val("license/status")) === "suspended" && titles("tok-owner").includes("🔒 Режим читання"));
  await sref("license").set({ status: "trial", trialEndsAt: Date.now() + 2 * DAY }); pushes.length = 0;
  await fns.salonCheckLicenseExpiry.run({});
  check("scheduled license check walks salon_index and warns", titles("tok-owner").includes("⏳ Скоро завершення") && (await val("license/warnedFor")) > 0);

  // ═══ Запрошення майстрів ═══
  console.log("── master invites");
  await seed();
  let r = await call(fns.salonCreateMasterInvite, { body: { masterId: "m2" } });
  check("invite without auth → 401", r.code === 401);
  r = await call(fns.salonCreateMasterInvite, { headers: as(S), body: { masterId: "nope" } });
  check("invite for unknown master → 404", r.code === 404 && r.out.error === "master_not_found");
  r = await call(fns.salonCreateMasterInvite, { headers: as("stranger"), body: { masterId: "m2" } });
  check("stranger (no salon) cannot invite → 404", r.code === 404);
  r = await call(fns.salonCreateMasterInvite, { headers: as(S), body: { masterId: "bad/id" } });
  check("unsafe master id → 400", r.code === 400);
  r = await call(fns.salonCreateMasterInvite, { method: "GET", headers: as(S) });
  check("GET → 405", r.code === 405);
  r = await call(fns.salonCreateMasterInvite, { headers: as(S), body: { masterId: "m2" } });
  const code1 = r.out.code;
  check("owner creates invite: code = salonId.secret, link, ttl 72h", r.code === 200 && code1.startsWith(`${S}.`) && r.out.link === `https://admin.test/join/${code1}` && Math.abs(r.out.expiresAt - (Date.now() + 72 * 3600000)) < 60000, JSON.stringify(r.out));
  r = await call(fns.salonCreateMasterInvite, { headers: as(S), body: { masterId: "m2" } });
  const code2 = r.out.code;
  const invs = (await val("masterInvites")) || {};
  check("new invite revokes the previous unclaimed one", Object.keys(invs).length === 1 && code1 !== code2);
  r = await call(fns.salonClaimMasterInvite, { body: { code: code2 } });
  check("claim without auth → 401", r.code === 401);
  r = await call(fns.salonClaimMasterInvite, { headers: as("uM2"), body: { code: "garbage" } });
  check("malformed code → 400", r.code === 400);
  r = await call(fns.salonClaimMasterInvite, { headers: as("uM2"), body: { code: code1 } });
  check("revoked invite → 404", r.code === 404 && r.out.error === "invite_invalid");
  pushes.length = 0;
  r = await call(fns.salonClaimMasterInvite, { headers: as("uM2"), body: { code: code2 } });
  check("master claims invite", r.code === 200 && r.out.salonId === S && r.out.masterId === "m2" && (await val("masterAuth/uM2")) === "m2" && (await val("masterSettings/m2/uid")) === "uM2");
  check("membership index written for the master", (await db.ref("master_memberships/uM2/" + S).get()).val() === "m2");
  check("owner told that master joined", titles("tok-owner").includes("👤 Майстер приєднався") && /Boris/.test(pushOf("tok-owner")[0].body));
  r = await call(fns.salonClaimMasterInvite, { headers: as("uM2"), body: { code: code2 } });
  check("same user again: idempotent OK, no second push", r.code === 200 && pushOf("tok-owner").length === 1);
  r = await call(fns.salonClaimMasterInvite, { headers: as("uOther"), body: { code: code2 } });
  check("another user cannot reuse the code", r.code === 404 && (await val("masterAuth/uOther")) === null);
  r = await call(fns.salonCreateMasterInvite, { headers: as(S), body: { masterId: "m3" } });
  const code3 = r.out.code;
  r = await call(fns.salonClaimMasterInvite, { headers: as("uM2"), body: { code: code3 } });
  check("master of m2 cannot also claim m3 in the same salon → 409", r.code === 409 && r.out.error === "already_master" && (await val("masterAuth/uM2")) === "m2");
  await sref(`masterInvites/${code3.split(".")[1]}/expiresAt`).set(Date.now() - 1000);
  r = await call(fns.salonClaimMasterInvite, { headers: as("uM3"), body: { code: code3 } });
  check("expired invite → 404", r.code === 404);
  r = await call(fns.salonCreateMasterInvite, { headers: as(S), body: { masterId: "m1", ttlHours: 24 } });
  const code4 = r.out.code;
  r = await call(fns.salonClaimMasterInvite, { headers: as("uNewM1"), body: { code: code4 } });
  check("…and the old login loses its membership, the new one gets it", (await db.ref("master_memberships/uM1/" + S).get()).val() == null && (await db.ref("master_memberships/uNewM1/" + S).get()).val() === "m1");
  check("re-invite for bound master replaces the old login", r.code === 200 && (await val("masterAuth/uNewM1")) === "m1" && (await val("masterAuth/uM1")) === null && (await val("masterSettings/m1/uid")) === "uNewM1");
  r = await call(fns.salonClaimMasterInvite, { headers: as("uX"), body: { code: `${S2}.${code4.split(".")[1]}` } });
  check("secret from another salon does not work", r.code === 404);
  await sref("masters/m3").remove();
  r = await call(fns.salonCreateMasterInvite, { headers: as(S), body: { masterId: "m2", ttlHours: 5000 } });
  check("ttl is capped at 7 days", r.out.expiresAt <= Date.now() + 168 * 3600000 + 60000);

  // ═══ Налаштування оплати ═══
  console.log("── payment settings");
  await seed();
  r = await call(fns.salonSavePaymentSettings, { body: {} });
  check("settings without auth → 401", r.code === 401);
  r = await call(fns.salonSavePaymentSettings, { headers: as("stranger"), body: { depositPercent: 30 } });
  check("user without salon → 404", r.code === 404 && r.out.error === "salon_not_found");
  r = await call(fns.salonSavePaymentSettings, { headers: as(S), body: { monobankToken: "short" } });
  check("too short token → 400", r.code === 400 && r.out.error === "invalid_token");
  r = await call(fns.salonSavePaymentSettings, { headers: as(S), body: { monobankToken: "x".repeat(40) } });
  check("token rejected by Monobank → 400, nothing stored", r.code === 400 && (await db.ref(`salon_secrets/${S}`).get()).val() === null);
  r = await call(fns.salonSavePaymentSettings, { headers: as(S), body: { enabled: true, depositPercent: 30 } });
  check("cannot enable payments without a token → 409", r.code === 409 && r.out.error === "token_required");
  r = await call(fns.salonSavePaymentSettings, { headers: as(S), body: { monobankToken: TOK_A, enabled: true, depositPercent: 30, allowFull: true, holdMinutes: 20, autoConfirm: false } });
  const pub = await val("profile/payment");
  check("valid token saved server-side, public settings without the token", r.code === 200 && pub.enabled === true && pub.hasToken === true && pub.tokenLast4 === TOK_A.slice(-4) && pub.depositPercent === 30 && pub.holdMinutes === 20 && !JSON.stringify(pub).includes(TOK_A) && !JSON.stringify(r.out).includes(TOK_A));
  check("secret stored in salon_secrets", (await db.ref(`salon_secrets/${S}/monobankToken`).get()).val() === TOK_A);
  r = await call(fns.salonSavePaymentSettings, { headers: as(S), body: { depositPercent: 500, holdMinutes: 1 } });
  check("values are clamped (0-100 %, 5-120 min), token kept", (await val("profile/payment")).depositPercent === 100 && (await val("profile/payment")).holdMinutes === 5 && (await val("profile/payment")).hasToken === true);
  r = await call(fns.salonSavePaymentSettings, { headers: as(S), body: { depositPercent: 0, allowFull: false } });
  check("enabled without any payment mode → 400", r.code === 400 && r.out.error === "no_payment_mode");
  r = await call(fns.salonSavePaymentSettings, { headers: as(S), body: { removeToken: true } });
  check("remove token: secret deleted, payments disabled", r.code === 200 && (await db.ref(`salon_secrets/${S}`).get()).val() === null && (await val("profile/payment")).enabled === false && (await val("profile/payment")).hasToken === false);

  // ═══ Рахунок ═══
  console.log("── booking invoice (client pays)");
  await seed();
  await call(fns.salonSavePaymentSettings, { headers: as(S), body: { monobankToken: TOK_A, enabled: true, depositPercent: 30, allowFull: true, holdMinutes: 15 } });
  await call(fns.salonSavePaymentSettings, { headers: as(S2), body: { monobankToken: TOK_B } }); // інший салон теж підключає свій токен
  const inv = (over = {}) => call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b1", mode: "deposit", ...over } });
  await book("b1", NB({ paymentMethod: "online", price: 500 }));
  r = await call(fns.salonCreateBookingInvoice, { body: { salonId: S, bookingId: "b1" } });
  check("invoice without auth → 401", r.code === 401);
  r = await inv({ bookingId: "bad/id" });
  check("unsafe ids → 400", r.code === 400);
  r = await inv({ bookingId: "nope" });
  check("unknown booking → 404", r.code === 404);
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c2"), body: { salonId: S, bookingId: "b1", mode: "deposit" } });
  check("someone else's booking → 403", r.code === 403 && mono.calls.every((c) => c.path === "/pubkey"));
  r = await inv({ mode: "weird" });
  check("unknown mode → 400", r.code === 400 && r.out.error === "bad_mode");
  mono.calls.length = 0;
  r = await inv();
  const call1 = mono.calls.find((c) => c.path === "/invoice/create");
  const pay1 = Object.entries((await val("payments")) || {});
  check("deposit invoice: 30% of 500 = 150 ₴ → 15000 kop, salon's own token", r.code === 200 && r.out.amount === 150 && r.out.mode === "deposit" && call1.body.amount === 15000 && call1.token === TOK_A && call1.body.ccy === 980, JSON.stringify(r.out) + JSON.stringify(call1));
  check("reference = salonId.paymentId, webhook and redirect urls", pay1.length === 1 && call1.body.merchantPaymInfo.reference === `${S}.${pay1[0][0]}` && call1.body.webHookUrl === "https://hooks.test/salonMonobankCallback" && call1.body.redirectUrl === "https://client.test/cabinet/bookings");
  check("payment record stored", pay1[0][1].bookingId === "b1" && pay1[0][1].amountKop === 15000 && pay1[0][1].status === "created" && pay1[0][1].invoiceId === "inv1");
  const callsBefore = mono.calls.length;
  r = await inv();
  check("repeated click reuses the open invoice (no new Monobank call)", r.out.reused === true && r.out.pageUrl === "https://pay.test/inv1" && mono.calls.length === callsBefore);
  r = await inv({ mode: "full" });
  check("full mode creates a separate invoice for 500 ₴", r.code === 200 && r.out.amount === 500 && mono.calls.at(-1).body.amount === 50000);
  mono.createFail = true;
  await book("b5", NB({ id: "b5", paymentMethod: "online", time: "12:00" }));
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b5", mode: "full" } });
  check("Monobank failure → 502, record marked error", r.code === 502 && Object.values((await val("payments")) || {}).some((p) => p.bookingId === "b5" && p.status === "error"));
  mono.createFail = false;
  await sref("profile/payment/enabled").set(false);
  r = await inv({ mode: "full" });
  check("payments disabled by owner → 409", r.code === 409 && r.out.error === "payments_disabled");
  await sref("profile/payment/enabled").set(true);
  await sref("license/status").set("suspended");
  r = await inv({ mode: "full" });
  check("read-only salon → 409", r.code === 409 && r.out.error === "salon_unavailable");
  await sref("license/status").set("active");
  await sref("bookings/b1/createdAt").set(Date.now() - 40 * MIN);
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b1", mode: "full" } });
  check("pending booking past hold + grace → 409 hold_expired", r.code === 409 && r.out.error === "hold_expired");
  await sref("bookings/b1/createdAt").set(Date.now());
  await sref("bookings/b1/status").set("cancelled");
  r = await inv({ mode: "full" });
  check("cancelled booking → 409", r.code === 409 && r.out.error === "booking_closed");
  await sref("bookings/b1/status").set("pending");
  await sref("profile/payment/depositPercent").set(0);
  r = await inv({ mode: "deposit" });
  check("deposit not offered by salon → 409", r.code === 409 && r.out.error === "mode_not_allowed");
  await sref("profile/payment/depositPercent").set(30);
  await sref("profile/payment/allowFull").set(false);
  r = await inv({ mode: "full" });
  check("full payment not allowed by salon → 409", r.code === 409 && r.out.error === "mode_not_allowed");
  await sref("profile/payment/allowFull").set(true);
  check("pickAmount: default mode = deposit when salon offers it", payments.pickAmount({ price: 1000 }, { depositPercent: 25, allowFull: true }, undefined).mode === "deposit" && payments.pickAmount({ price: 1000 }, { allowFull: true }, undefined).mode === "full");
  check("pickAmount: deposit rounds up to a kopeck, never above remaining", payments.pickAmount({ price: 333 }, { depositPercent: 30 }, "deposit").amount === 99.9 && payments.pickAmount({ price: 100, paidAmount: 90 }, { depositPercent: 50 }, "full").amount === 10);
  check("pickAmount: already paid / no price / deposit twice", payments.pickAmount({ price: 100, paidAmount: 100 }, {}, "full").error === "already_paid" && payments.pickAmount({}, {}, "full").error === "no_price" && payments.pickAmount({ price: 100, paidAmount: 30 }, { depositPercent: 30 }, "deposit").error === "deposit_already_paid");

  // ═══ Вебхук Monobank ═══
  console.log("── Monobank webhook");
  const hook = async (payload, { key = keys[TOK_A], tamper = false, noSign = false } = {}) => {
    const raw = Buffer.from(JSON.stringify(payload));
    const sig = crypto.sign("sha256", raw, key.priv).toString("base64");
    const headers = noSign ? {} : { "X-Sign": tamper ? Buffer.from("bad").toString("base64") : sig };
    return call(fns.salonMonobankCallback, { body: payload, headers, rawBody: raw });
  };
  await seed();
  await call(fns.salonSavePaymentSettings, { headers: as(S), body: { monobankToken: TOK_A, enabled: true, depositPercent: 30, allowFull: true, holdMinutes: 15 } });
  await book("b1", NB({ paymentMethod: "online", price: 500 })); pushes.length = 0;
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b1", mode: "deposit" } });
  const pid = r.out.paymentId, invId = r.out.invoiceId, ref = `${S}.${pid}`;
  const ev = (over = {}) => ({ invoiceId: invId, status: "success", amount: 15000, ccy: 980, reference: ref, modifiedDate: "2030-05-13T10:00:00Z", ...over });
  r = await hook(ev(), { noSign: true });
  check("no X-Sign → 400", r.code === 400);
  const keyFetchesBefore = mono.calls.filter((c) => c.path === "/pubkey").length;
  for (let i = 0; i < 5; i++) await hook(ev(), { tamper: true });
  check("5 forged webhooks cause at most one merchant-key fetch", mono.calls.filter((c) => c.path === "/pubkey").length - keyFetchesBefore <= 1);
  r = await hook(ev(), { tamper: true });
  check("broken X-Sign → 400, booking untouched", r.code === 400 && (await val("bookings/b1/paymentStatus")) == null);
  r = await hook(ev(), { key: keys[TOK_B] });
  check("signed with ANOTHER merchant's key → 400", r.code === 400 && (await val("bookings/b1/paidAmount")) == null);
  r = await hook(ev({ reference: "garbage" }));
  check("unparsable reference → 200, ignored", r.code === 200 && (await val("bookings/b1/paidAmount")) == null);
  r = await hook(ev({ reference: `ghost.${pid}` }));
  check("unknown salon → 200, ignored", r.code === 200);
  r = await hook(ev({ amount: 100 }));
  check("amount mismatch → ignored", r.code === 200 && (await val("bookings/b1/paidAmount")) == null);
  r = await hook(ev({ invoiceId: "other-invoice" }));
  check("invoiceId that is not ours → ignored", r.code === 200 && (await val("bookings/b1/paidAmount")) == null);
  r = await hook(ev({ status: "processing", modifiedDate: "2030-05-13T09:59:00Z" }));
  check("processing recorded", r.code === 200 && (await val(`payments/${pid}/status`)) === "processing");
  r = await hook(ev({ status: "failure", failureReason: "Insufficient funds", modifiedDate: "2030-05-13T09:59:30Z" }));
  check("failure recorded, booking unpaid", (await val(`payments/${pid}/status`)) === "failure" && (await val("bookings/b1/paymentStatus")) == null);
  r = await hook(ev());
  const b1 = await val("bookings/b1");
  check("success → deposit_paid, paidAmount 150", r.code === 200 && b1.paymentStatus === "deposit_paid" && b1.paidAmount === 150 && b1.paymentInvoiceId === invId && b1.paidAt > 0 && b1.status === "pending", JSON.stringify(b1));
  check("client pushed 'payment received' + notification", titles("tok-c1").includes("💳 Оплату отримано") && Object.values((await val("notifications/c1")) || {}).some((n) => n.type === "payment"));
  check("staff pushed 'new booking (paid)' now (first payment of online booking)", titles("tok-owner").includes("📋 Новий запис (оплачено)") && titles("tok-m1").includes("📋 Новий запис (оплачено)") && /Передоплата 150/.test(pushOf("tok-owner")[0].body));
  const pushCount = pushes.length;
  r = await hook(ev());
  check("duplicate webhook: nothing added, nothing pushed", (await val("bookings/b1/paidAmount")) === 150 && pushes.length === pushCount);
  r = await hook(ev({ status: "processing", modifiedDate: "2030-05-13T09:00:00Z" }));
  check("late 'processing' after success does not regress the record", (await val(`payments/${pid}/status`)) === "success");
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b1", mode: "deposit" } });
  check("second deposit refused", r.code === 409 && r.out.error === "deposit_already_paid");
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b1", mode: "full" } });
  const pid2 = r.out.paymentId, inv2 = r.out.invoiceId;
  check("remaining amount invoice: 350 ₴", r.code === 200 && r.out.amount === 350 && mono.calls.at(-1).body.amount === 35000);
  pushes.length = 0;
  r = await hook({ invoiceId: inv2, status: "success", amount: 35000, reference: `${S}.${pid2}`, modifiedDate: "2030-05-13T11:00:00Z" });
  const b2 = await val("bookings/b1");
  check("remainder paid → paid, 500 total", b2.paymentStatus === "paid" && b2.paidAmount === 500);
  check("subsequent payment pushes staff short note (not 'new booking')", titles("tok-owner").includes("💳 Оплата отримана") && !titles("tok-owner").includes("📋 Новий запис (оплачено)"));
  r = await hook({ invoiceId: inv2, status: "reversed", amount: 35000, reference: `${S}.${pid2}`, modifiedDate: "2030-05-13T12:00:00Z" });
  const b3 = await val("bookings/b1");
  check("refund of the remainder → back to deposit_paid (150)", b3.paymentStatus === "deposit_paid" && b3.paidAmount === 150 && titles("tok-c1").includes("↩️ Платіж повернено"));
  await hook({ invoiceId: inv2, status: "reversed", amount: 35000, reference: `${S}.${pid2}`, modifiedDate: "2030-05-13T12:00:01Z" });
  check("repeated refund webhook ignored", (await val("bookings/b1/paidAmount")) === 150);
  await hook(ev({ status: "reversed", modifiedDate: "2030-05-13T13:00:00Z" }));
  check("refund of the deposit → refunded, 0", (await val("bookings/b1/paymentStatus")) === "refunded" && (await val("bookings/b1/paidAmount")) === 0);
  // автопідтвердження
  await sref("profile/payment/autoConfirm").set(true);
  await book("b7", NB({ id: "b7", paymentMethod: "online", time: "12:00", price: 400 }));
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b7", mode: "full" } });
  await hook({ invoiceId: r.out.invoiceId, status: "success", amount: 40000, reference: `${S}.${r.out.paymentId}`, modifiedDate: "2030-05-13T14:00:00Z" });
  check("autoConfirm: paid booking becomes confirmed", (await val("bookings/b7/status")) === "confirmed" && (await val("bookings/b7/paymentStatus")) === "paid");
  // оплата за скасований запис → автоповернення
  await sref("profile/payment/autoConfirm").set(false);
  await book("b8", NB({ id: "b8", paymentMethod: "online", time: "13:00", price: 200 }));
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b8", mode: "full" } });
  const pid8 = r.out.paymentId, inv8 = r.out.invoiceId;
  await patch("b8", { status: "cancelled", cancelledBy: "payment_timeout" });
  pushes.length = 0; mono.calls.length = 0;
  await hook({ invoiceId: inv8, status: "success", amount: 20000, reference: `${S}.${pid8}`, modifiedDate: "2030-05-13T15:00:00Z" });
  const cancelCall = mono.calls.find((c) => c.path === "/invoice/cancel");
  check("payment for a cancelled booking is refunded automatically", cancelCall && cancelCall.body.invoiceId === inv8 && cancelCall.body.amount === 20000 && cancelCall.token === TOK_A && (await val(`payments/${pid8}/refundedAuto`)) === true && (await val("bookings/b8/paidAmount")) == null);
  check("…owner told, booking not marked paid", titles("tok-owner").includes("↩️ Оплату за скасований запис повернено") && (await val("bookings/b8/paymentStatus")) == null);
  await hook({ invoiceId: inv8, status: "reversed", amount: 20000, reference: `${S}.${pid8}`, modifiedDate: "2030-05-13T15:01:00Z" });
  check("Monobank's own 'reversed' for that refund does not touch the booking", (await val("bookings/b8/paymentStatus")) == null);
  await book("b9", NB({ id: "b9", paymentMethod: "online", time: "13:30", price: 200 }));
  r = await call(fns.salonCreateBookingInvoice, { headers: as("c1"), body: { salonId: S, bookingId: "b9", mode: "full" } });
  const pid9 = r.out.paymentId, inv9 = r.out.invoiceId;
  await patch("b9", { status: "cancelled", cancelledBy: "client" });
  mono.refundOk = false; pushes.length = 0;
  await hook({ invoiceId: inv9, status: "success", amount: 20000, reference: `${S}.${pid9}`, modifiedDate: "2030-05-13T16:00:00Z" });
  check("refund failure → needsRefund flag + owner alerted", (await val(`payments/${pid9}/needsRefund`)) === true && titles("tok-owner").includes("⚠️ Оплата за скасований запис — потрібне повернення"));

  // ═══ Повернення коштів (політика скасування) ═══
  console.log("── refunds: cancellation policy");
  await seed();
  await call(fns.salonSavePaymentSettings, { headers: as(S), body: { monobankToken: TOK_A, enabled: true, depositPercent: 30, cancelFreeHours: 24 } });
  check("cancelFreeHours saved publicly", (await val("profile/payment/cancelFreeHours")) === 24);
  await call(fns.salonSavePaymentSettings, { headers: as(S), body: { cancelFreeHours: 5000 } });
  check("cancelFreeHours clamped to 720", (await val("profile/payment/cancelFreeHours")) === 720);
  await call(fns.salonSavePaymentSettings, { headers: as(S), body: { cancelFreeHours: 24 } });
  const soon = (h) => { const ms = Date.now() + h * 3600000; return [lib.localDate(ms), new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms)]; };
  async function paidBook(id, over = {}, amount = 150) {
    await book(id, NB({ id, paymentMethod: "online", price: 500, paymentStatus: "deposit_paid", paidAmount: amount, paidAt: Date.now(), paymentInvoiceId: `inv-${id}`, status: "confirmed", ...over }));
    await sref(`payments/p-${id}`).set({ bookingId: id, clientUid: over.clientUid || "c1", amountKop: amount * 100, status: "success", applied: Date.now(), invoiceId: `inv-${id}`, mode: "deposit", createdAt: Date.now() });
  }
  const cancels = () => mono.calls.filter((c) => c.path === "/invoice/cancel");
  await paidBook("f1", { time: "09:00" }); pushes.length = 0; mono.calls.length = 0;
  await patch("f1", { status: "cancelled", cancelledBy: "client", cancelledAt: Date.now() });
  check("client cancels in time → automatic refund via salon's token", cancels().length === 1 && cancels()[0].body.invoiceId === "inv-f1" && cancels()[0].body.amount === 15000 && cancels()[0].token === TOK_A && cancels()[0].body.extRef === "p-f1");
  check("…payment marked, client told", (await val("payments/p-f1/refundReason")) === "client_cancel_in_time" && titles("tok-c1").includes("↩️ Повернення коштів"));
  const f1 = await val("bookings/f1");
  await trig("f1", { ...f1, status: "confirmed", cancelledBy: null }, f1);
  check("duplicate cancel event does not refund twice", cancels().length === 1);
  await hook({ invoiceId: "inv-f1", status: "reversed", amount: 15000, reference: `${S}.p-f1`, modifiedDate: "2030-05-13T10:00:00Z" });
  check("Monobank 'reversed' then marks the booking refunded", (await val("bookings/f1/paymentStatus")) === "refunded" && (await val("bookings/f1/paidAmount")) === 0);

  const [ld, lt] = soon(2);
  await paidBook("f2", { date: ld, time: lt, status: "confirmed" }); pushes.length = 0; mono.calls.length = 0;
  await patch("f2", { status: "cancelled", cancelledBy: "client", cancelledAt: Date.now() });
  check("client cancels LATE (<24h) → deposit kept, no refund call", cancels().length === 0 && (await val("bookings/f2/paymentStatus")) === "deposit_paid" && (await val("payments/p-f2/refundRequestedAt")) == null);
  check("…client told the deposit stays with the salon", titles("tok-c1").includes("💳 Передоплата не повертається") && /24 год/.test(pushOf("tok-c1").find((x) => x.title === "💳 Передоплата не повертається").body));
  await paidBook("f3", { date: ld, time: lt, masterId: "m2", status: "confirmed" }); mono.calls.length = 0;
  await patch("f3", { status: "cancelled", cancelledBy: "admin" });
  check("OWNER cancels a late booking → full refund anyway", cancels().length === 1 && (await val("payments/p-f3/refundReason")) === "admin_cancel");
  await paidBook("f4", { date: ld, time: lt, status: "confirmed" }); mono.calls.length = 0;
  await patch("f4", { status: "cancelled", cancelledBy: "master" });
  check("MASTER cancels → full refund", cancels().length === 1 && (await val("payments/p-f4/refundReason")) === "master_cancel");
  await sref("profile/payment/cancelFreeHours").set(0);
  await paidBook("f5", { date: ld, time: lt, status: "confirmed" }); mono.calls.length = 0;
  await patch("f5", { status: "cancelled", cancelledBy: "client" });
  check("cancelFreeHours = 0: client may cancel any time before start", cancels().length === 1);
  await sref("profile/payment/cancelFreeHours").set(24);
  const [pd, pt] = soon(-3);
  await paidBook("f6", { date: pd, time: pt, status: "confirmed" }); mono.calls.length = 0;
  await patch("f6", { status: "cancelled", cancelledBy: "client" });
  check("cancel after the start time keeps the deposit", cancels().length === 0);

  console.log("── refunds: failures and manual refund");
  await paidBook("f7", { time: "12:00" }); pushes.length = 0; mono.refundOk = false;
  await patch("f7", { status: "cancelled", cancelledBy: "client" });
  check("Monobank refuses → needsRefund, owner alerted, flag released for retry", (await val("payments/p-f7/needsRefund")) === true && (await val("payments/p-f7/refundRequestedAt")) == null && titles("tok-owner").includes("⚠️ Не вдалося повернути кошти"));
  mono.refundOk = true;
  let rr = await call(fns.salonRefundBooking, { body: { bookingId: "f7" } });
  check("manual refund without auth → 401", rr.code === 401);
  rr = await call(fns.salonRefundBooking, { headers: as("c1"), body: { bookingId: "f7" } });
  check("a client cannot refund (no salon of their own) → 404", rr.code === 404);
  rr = await call(fns.salonRefundBooking, { headers: as(S), body: { bookingId: "bad/id" } });
  check("unsafe id → 400", rr.code === 400);
  mono.calls.length = 0;
  rr = await call(fns.salonRefundBooking, { headers: as(S), body: { bookingId: "f7" } });
  check("owner retries manually → refunded", rr.code === 200 && rr.out.refunded === 1 && cancels().length === 1 && (await val("payments/p-f7/refundReason")) === "owner_manual");
  rr = await call(fns.salonRefundBooking, { headers: as(S), body: { bookingId: "f7" } });
  check("second manual refund → nothing left (409)", rr.code === 409 && rr.out.error === "nothing_to_refund" && cancels().length === 1);
  await paidBook("f8", { time: "12:30" }); mono.refundOk = false;
  rr = await call(fns.salonRefundBooking, { headers: as(S), body: { bookingId: "f8" } });
  check("manual refund failing → 502", rr.code === 502 && rr.out.error === "refund_failed");
  mono.refundOk = true;
  rr = await call(fns.salonRefundBooking, { headers: as(S), body: { bookingId: "b-none" } });
  check("unknown booking → 404", rr.code === 404);
  await book("f9", NB({ id: "f9", time: "13:00" }));
  rr = await call(fns.salonRefundBooking, { headers: as(S), body: { bookingId: "f9" } });
  check("nothing paid → 409", rr.code === 409);

  console.log("── refunds: reschedule moves the deposit");
  await seed();
  await call(fns.salonSavePaymentSettings, { headers: as(S), body: { monobankToken: TOK_A, enabled: true, depositPercent: 30 } });
  await paidBook("o1", { time: "09:00" }); pushes.length = 0; mono.calls.length = 0;
  await book("n1", NB({ id: "n1", time: "11:00", paymentMethod: "online", price: 500, rescheduledFrom: `${D1} 09:00`, rescheduledFromId: "o1" }));
  const n1 = await val("bookings/n1"), o1 = await val("bookings/o1");
  check("new booking takes over the deposit (150, deposit_paid)", n1.paidAmount === 150 && n1.paymentStatus === "deposit_paid" && n1.paymentMovedFrom === "o1" && n1.paymentInvoiceId === "inv-o1");
  check("old booking is zeroed and linked", o1.paidAmount === 0 && o1.paymentStatus == null && o1.paymentMovedTo === "n1");
  check("payment record now belongs to the new booking", (await val("payments/p-o1/bookingId")) === "n1");
  check("online reschedule still notifies staff (🔁)", titles("tok-owner").includes("🔁 Запис перенесено"));
  await patch("o1", { status: "cancelled", cancelledBy: "reschedule" });
  check("cancelling the old one as 'reschedule' refunds nothing", cancels().length === 0);
  await book("n2", NB({ id: "n2", time: "12:00", paymentMethod: "online", price: 500, rescheduledFrom: `${D1} 09:00`, rescheduledFromId: "o1" }));
  check("the same deposit cannot be moved twice", (await val("bookings/n2/paidAmount")) == null);
  await paidBook("o2", { time: "13:00", clientUid: "c2", clientName: "Two" });
  await book("n3", NB({ id: "n3", time: "14:00", paymentMethod: "online", rescheduledFrom: `${D1} 13:00`, rescheduledFromId: "o2" })); // клієнт c1 → чужий запис
  check("deposit of someone else's booking is never taken", (await val("bookings/n3/paidAmount")) == null && (await val("bookings/o2/paidAmount")) === 150);
  mono.calls.length = 0;
  await patch("n1", { status: "cancelled", cancelledBy: "client" });
  check("moved deposit is refundable from the NEW booking", cancels().length === 1 && cancels()[0].body.invoiceId === "inv-o1");

  // ═══ Таймаут неоплачених записів ═══
  console.log("── unpaid online bookings expire");
  await seed();
  await call(fns.salonSavePaymentSettings, { headers: as(S), body: { monobankToken: TOK_A, enabled: true, depositPercent: 30, holdMinutes: 15 } });
  const nowT = Date.now();
  await book("u1", NB({ id: "u1", paymentMethod: "online", time: "09:00", createdAt: nowT - 20 * MIN }));                    // протермінований
  await book("u2", NB({ id: "u2", paymentMethod: "online", time: "09:30", createdAt: nowT - 5 * MIN }));                     // ще тримається
  await book("u3", NB({ id: "u3", paymentMethod: "online", time: "10:00", createdAt: nowT - 30 * MIN, paymentStatus: "deposit_paid", paidAmount: 150 })); // сплачено
  await book("u4", NB({ id: "u4", paymentMethod: "onsite", time: "10:30", createdAt: nowT - 90 * MIN }));                    // оплата на місці
  await book("u5", NB({ id: "u5", paymentMethod: "online", time: "11:00", createdAt: nowT - 90 * MIN, status: "confirmed" })); // підтверджений власником
  await book("u6", NB({ id: "u6", paymentMethod: "online", time: "11:30", createdAt: nowT - 30 * MIN }));                    // є відкритий рахунок
  await sref("payments/p6").set({ bookingId: "u6", status: "created", createdAt: nowT - 5 * MIN, amountKop: 15000 });
  await book("u7", NB({ id: "u7", paymentMethod: "online", time: "12:00", createdAt: nowT - 30 * MIN }));                    // рахунок старий
  await sref("payments/p7").set({ bookingId: "u7", status: "created", createdAt: nowT - 40 * MIN, amountKop: 15000 });
  pushes.length = 0;
  const n = await payments.expireUnpaidForSalon(S, nowT);
  check("expired: u1 and u7 cancelled by payment_timeout", n === 2 && (await val("bookings/u1/cancelledBy")) === "payment_timeout" && (await val("bookings/u7/status")) === "cancelled");
  check("kept: young u2, paid u3, on-site u4, confirmed u5, open invoice u6", (await val("bookings/u2/status")) === "pending" && (await val("bookings/u3/status")) === "pending" && (await val("bookings/u4/status")) === "pending" && (await val("bookings/u5/status")) === "confirmed" && (await val("bookings/u6/status")) === "pending");
  // тригер знімає слот після скасування
  const u1 = await val("bookings/u1");
  const u1before = { ...u1, status: "pending" }; delete u1before.cancelledBy; delete u1before.cancelledAt;
  await trig("u1", u1before, u1);
  check("trigger frees the slot of the expired booking and tells the client", (await free("m1", "09:00")) === true && titles("tok-c1").includes("⌛ Запис скасовано"));
  await book("u9", NB({ id: "u9", paymentMethod: "online", time: "13:30", createdAt: Date.now() - 60 * MIN }));
  await fns.salonExpireUnpaidBookings.run({});
  check("scheduled expiry job walks salon_index and cancels", (await val("bookings/u9/cancelledBy")) === "payment_timeout");
  await sref("license/status").set("suspended");
  await book("u8", NB({ id: "u8", paymentMethod: "online", time: "13:00", createdAt: nowT - 90 * MIN }));
  check("read-only salon: expiry skipped", (await payments.expireUnpaidForSalon(S, nowT)) === 0);

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("test crashed:", e); process.exit(2); });
