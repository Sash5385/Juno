// Тест сповіщень клієнтам (звільнений час, розсилка), прив'язки записів без акаунта, видалення акаунтів і резервних копій
// на ЕМУЛЯТОРІ Realtime Database; FCM, Auth і Storage підмінені. Запуск (з кореня Juno):
//   npx firebase-tools@13 emulators:exec --only database --project demo-outreach "node functions/test/outreach.e2e.js"
process.env.GCLOUD_PROJECT = "demo-outreach";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
process.env.SALON_ADMIN_URL = "https://admin.test";
process.env.SALON_CLIENT_URL = "https://client.test";
const admin = require("firebase-admin");

const pushes = [];
Object.defineProperty(admin, "messaging", { configurable: true, writable: true, value: () => ({ send: async (m) => { pushes.push({ token: m.token, title: m.data.title, body: m.data.body, url: m.data.url }); return "id"; } }) });
const authState = { phones: {}, deleted: [] };
Object.defineProperty(admin, "auth", {
  configurable: true, writable: true,
  value: () => ({
    // токен "tok:uid[:email]"
    verifyIdToken: async (t) => { if (!String(t).startsWith("tok:")) throw new Error("bad token"); const [, uid, email] = String(t).split(":"); return { uid, email }; },
    getUser: async (uid) => ({ uid, phoneNumber: authState.phones[uid] }),
    deleteUser: async (uid) => { authState.deleted.push(uid); },
  }),
});
const files = new Map(); const deletedPrefixes = []; const removedFiles = [];
const fakeBucket = {
  file: (name) => ({ save: async (body) => { files.set(name, body); }, delete: async () => { removedFiles.push(name); } }),
  deleteFiles: async ({ prefix }) => { deletedPrefixes.push(prefix); },
  getFiles: async ({ prefix }) => [[...files.keys(), "backups/2000-01-01/old.json"].filter((n) => n.startsWith(prefix)).map((name) => ({ name, delete: async () => { removedFiles.push(name); } }))],
};
Object.defineProperty(admin, "storage", { configurable: true, writable: true, value: () => ({ bucket: () => fakeBucket }) });

const fns = require("../index.js");
const lib = require("../salon/lib");
const registry = require("../salon/registry");
const broadcast = require("../salon/broadcast");
const db = admin.database();

// Реальні правила бази в емулятор: запити по date/clientUid працюють лише з .indexOn
async function loadRules() {
  const ns = new URL(JSON.parse(process.env.FIREBASE_CONFIG || "{}").databaseURL || `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`).hostname.split(".")[0];
  const r = await fetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.settings/rules.json?ns=${ns}`, {
    method: "PUT", headers: { Authorization: "Bearer owner" }, body: require("fs").readFileSync(require("path").join(__dirname, "../../database.rules.json"), "utf8"),
  });
  if (!r.ok) throw new Error(`rules not loaded: ${r.status}`);
}

let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };
const call = async (fn, { method = "POST", body = {}, headers = {} } = {}) => {
  const res = { code: 200, out: null, headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.out = b; this.headersSent = true; return this; }, send(b) { this.out = b; this.headersSent = true; return this; }, set() { return this; }, on() {}, setHeader() {}, getHeader() {}, removeHeader() {}, end() {} };
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  await (fn.run || fn)({ method, body, headers: lower, get: (h) => lower[h.toLowerCase()] }, res);
  return res;
};
const as = (uid, email) => ({ Authorization: `Bearer tok:${uid}${email ? ":" + email : ""}` });
const wr = (before, after, params) => ({ data: { before: { val: () => before }, after: { val: () => after } }, params });
const titles = (token) => pushes.filter((p) => p.token === token).map((p) => p.title);

const DAY = 86400000, MIN = 60000, S = "salonA", S2 = "salonB", VENDOR = "sash5385@gmail.com";
const sref = (p, salon = S) => db.ref(p ? `salons/${salon}/${p}` : `salons/${salon}`);
const val = async (p, salon = S) => (await sref(p, salon).get()).val();
const TOMORROW = lib.localDate(Date.now() + DAY), IN20 = lib.localDate(Date.now() + 20 * DAY), YESTERDAY = lib.localDate(Date.now() - DAY);
const NOW9 = lib.localToMs(TOMORROW, "09:00"), NOW2 = lib.localToMs(TOMORROW, "02:00");
const client = (n, extra = {}) => ({ profile: { name: `Client ${n}`, phone: `+38050000000${n}` }, fcmTokens: { d1: `tok-c${n}` }, ...extra });

async function seed() {
  await db.ref("/").set(null);
  await db.ref("salon_index").set({ [S]: { name: "Beauty" }, [S2]: { name: "Other" } });
  await sref("").set({
    profile: { name: "Beauty", slug: "beauty", timezone: "Europe/Kyiv" },
    license: { status: "active", expiresAt: Date.now() + 30 * DAY },
    fcmTokens: { d1: "tok-owner" },
    masters: { m1: { profile: { name: "Anna", active: true } } },
    masterAuth: { uM1: "m1" },
    users: { c1: client(1), c2: client(2), c3: client(3, { blocked: true }), c4: { profile: { name: "No Token" } } },
    clientTokens: { c1: { d1: "tok-c1" }, c2: { d1: "tok-c2" }, c3: { d1: "tok-c3" } },
  });
  await db.ref(`salons/${S2}`).set({ profile: { name: "Other", slug: "other" }, license: { status: "active", expiresAt: Date.now() + 30 * DAY }, users: { c1: client(1) } });
  pushes.length = 0; authState.phones = {}; authState.deleted.length = 0; files.clear(); deletedPrefixes.length = 0; removedFiles.length = 0;
}
const slotFreed = (date, before, after, masterId = "m1", slotId = "slot1400") => fns.salonOnSlotFreed.run(wr(before, after, { salonId: S, masterId, date, slotId }));
const BUSY = { available: false, time: "14:00", bookingStart: true, bookedBy: "c1" };
const FREE = { available: true, time: "14:00" };

(async () => {
  await loadRules();
  // ═══ Звільнився час: черга ═══
  console.log("── slot freed: queue");
  await seed();
  await slotFreed(TOMORROW, BUSY, FREE);
  let q = await val("slotFreedQueue");
  const key = `m1_${TOMORROW}_1400`;
  check("freed booked slot in the next 10 days is queued, delayed 5 min", q && q[key] && q[key].time === "14:00" && q[key].sendAfter > Date.now() + 4 * MIN && q[key].sendAfter <= Date.now() + 5 * MIN + 2000, JSON.stringify(q));
  await sref("slotFreedQueue").remove();
  await slotFreed(TOMORROW, { ...BUSY, phantom: true }, FREE);
  await slotFreed(TOMORROW, { ...BUSY, bookingStart: false }, FREE);
  await slotFreed(TOMORROW, { ...BUSY, adminBlocked: true }, FREE);
  await slotFreed(TOMORROW, FREE, FREE);
  await slotFreed(TOMORROW, null, FREE);
  await slotFreed(TOMORROW, BUSY, { ...FREE, available: false });
  check("phantom / inner / owner-blocked / new / still busy slots are ignored", (await val("slotFreedQueue")) === null);
  await slotFreed(IN20, BUSY, FREE);
  await slotFreed(YESTERDAY, BUSY, FREE);
  check("slots beyond 10 days or in the past are ignored", (await val("slotFreedQueue")) === null);
  await sref("profile/slotFreedPush").set(false);
  await slotFreed(TOMORROW, BUSY, FREE);
  check("owner can switch it off (profile/slotFreedPush=false)", (await val("slotFreedQueue")) === null);
  await sref("profile/slotFreedPush").remove();

  // ═══ Звільнився час: розсилка ═══
  console.log("── slot freed: flush");
  await sref(`slotFreedQueue/${key}`).set({ masterId: "m1", date: TOMORROW, time: "14:00", sendAfter: NOW9 + MIN });
  await sref(`timeslots/m1/${TOMORROW}/slot1400`).set(FREE);
  check("not due yet → nothing sent, stays queued", (await broadcast.flushSlotFreedForSalon(S, NOW9)) === 0 && !pushes.length && !!(await val(`slotFreedQueue/${key}`)));
  const sent = await broadcast.flushSlotFreedForSalon(S, NOW9 + 2 * MIN);
  check("due: pushed to clients with tokens only (blocked and token-less skipped)", sent === 2 && titles("tok-c1").length === 1 && titles("tok-c2").length === 1 && !titles("tok-c3").length, JSON.stringify(pushes));
  check("push text: master, date, time; link to the salon page", pushes[0].body.includes("Anna") && pushes[0].body.includes("14:00") && pushes[0].url === "https://client.test/s/beauty", JSON.stringify(pushes[0]));
  check("queue emptied, rate-limit stamps and notifications saved", (await val("slotFreedQueue")) === null && (await val("lastSlotNotif/c1")) > 0 && Object.values((await val("notifications/c1")) || {}).some((n) => n.type === "slot_freed"));
  pushes.length = 0;
  await sref(`slotFreedQueue/m1_${TOMORROW}_1430`).set({ masterId: "m1", date: TOMORROW, time: "14:30", sendAfter: 0 });
  await sref(`timeslots/m1/${TOMORROW}/slot1430`).set({ available: true, time: "14:30" });
  check("same clients are not pinged again within 30 minutes", (await broadcast.flushSlotFreedForSalon(S, NOW9 + 3 * MIN)) === 0 && !pushes.length);
  await sref("lastSlotNotif").remove();
  await sref(`slotFreedQueue/m1_${TOMORROW}_1500`).set({ masterId: "m1", date: TOMORROW, time: "15:00", sendAfter: 0 });
  await sref(`timeslots/m1/${TOMORROW}/slot1500`).set({ available: false, time: "15:00", bookedBy: "c2" });
  check("slot taken during the 5 minutes → no push, entry dropped", (await broadcast.flushSlotFreedForSalon(S, NOW9 + 4 * MIN)) === 0 && (await val(`slotFreedQueue/m1_${TOMORROW}_1500`)) === null);
  pushes.length = 0; await sref("lastSlotNotif").remove();
  await sref(`slotFreedQueue/${key}`).set({ masterId: "m1", date: TOMORROW, time: "14:00", sendAfter: 0 });
  check("quiet hours (night, salon timezone): kept in the queue, nothing sent", (await broadcast.flushSlotFreedForSalon(S, NOW2)) === 0 && !pushes.length && !!(await val(`slotFreedQueue/${key}`)));
  await sref("license/status").set("suspended");
  check("read-only salon: nothing sent", (await broadcast.flushSlotFreedForSalon(S, NOW9)) === 0 && !pushes.length);
  await sref("license/status").set("active");
  await sref(`slotFreedQueue/${key}`).set({ masterId: "m1", date: TOMORROW, time: "14:00", sendAfter: 0 });
  await sref(`timeslots/m1/${TOMORROW}/slot1400`).set(FREE);
  await fns.salonFlushSlotFreedQueue.run({});
  check("scheduled job walks salon_index and sends", titles("tok-c1").includes("✨ Звільнився час"), JSON.stringify(titles("tok-c1")));

  // ═══ Розсилка ═══
  console.log("── salonSendBroadcast");
  await seed();
  let r = await call(fns.salonSendBroadcast, { body: { title: "T", body: "B" } });
  check("no token → 401", r.code === 401);
  r = await call(fns.salonSendBroadcast, { headers: as("stranger"), body: { title: "T", body: "B" } });
  check("not an owner → 404", r.code === 404);
  r = await call(fns.salonSendBroadcast, { headers: as(S), body: { title: " ", body: "B" } });
  check("empty title → 400", r.code === 400 && r.out.error === "empty_message");
  r = await call(fns.salonSendBroadcast, { headers: as(S), body: { title: "Акція", body: "{ім'я}, знижка на манікюр!" } });
  check("sent to token holders (not blocked), personalised by name", r.code === 200 && r.out.recipients === 2 && r.out.sent === 2 && pushes.find((p) => p.token === "tok-c1").body === "Client 1, знижка на манікюр!" && pushes.find((p) => p.token === "tok-c2").body.startsWith("Client 2,"), JSON.stringify(r.out) + JSON.stringify(pushes));
  check("notifications saved, log written", Object.values((await val("notifications/c1")) || {}).some((n) => n.type === "broadcast") && Object.values((await val("pushLog")) || {})[0].sent === 2);
  const ts = Date.now();
  for (let i = 0; i < 4; i++) await call(fns.salonSendBroadcast, { headers: as(S), body: { title: `T${i}`, body: "B" } });
  r = await call(fns.salonSendBroadcast, { headers: as(S), body: { title: "6", body: "B" } });
  check("limit: 5 broadcasts per 24h, then 429", r.code === 429 && r.out.error === "too_many_broadcasts" && Object.keys((await val("pushLog")) || {}).length === 5 && Date.now() - ts < 60000);
  await sref("pushLog").remove(); await sref("license/status").set("suspended");
  r = await call(fns.salonSendBroadcast, { headers: as(S), body: { title: "T", body: "B" } });
  check("read-only salon → 409", r.code === 409);

  // ═══ Записи без акаунта ═══
  console.log("── walk-in bookings linked by verified phone");
  await seed();
  const wb = (o) => ({ masterId: "m1", serviceName: "Стрижка", price: 500, durationMin: 60, clientName: "Walk-in", date: TOMORROW, time: "10:00", status: "confirmed", ...o });
  await sref("bookings").set({
    w1: wb({ phone: "+380 50 111-11-11" }), w2: wb({ phone: "+380509999999", time: "11:00" }), w3: wb({ phone: "+380501111111", clientUid: "other", time: "12:00" }),
    w4: wb({ phone: "+380501111111", status: "personal", time: "13:00" }), w5: wb({ phone: "380501111111", time: "14:00", date: lib.localDate(Date.now() - 10 * DAY) }),
    w6: wb({ phone: "380501111111", time: "15:00", date: lib.localDate(Date.now() - 60 * DAY) }),
  });
  const prof = { name: "New", phone: "+380501111111" };
  check("phone from the profile is NOT enough (no verified Auth phone)", (await registry.linkWalkInBookings(S, "cN", prof)) === 0 && (await val("bookings/w1/clientUid")) === null);
  authState.phones.cN = "+380509999999";
  check("Auth phone different from the profile phone → nothing", (await registry.linkWalkInBookings(S, "cN", prof)) === 0);
  authState.phones.cN = "+380 (50) 111-11-11";
  check("verified phone (any formatting): own walk-in bookings linked, others untouched", (await registry.linkWalkInBookings(S, "cN", prof)) === 2 && (await val("bookings/w1/clientUid")) === "cN" && (await val("bookings/w5/clientUid")) === "cN" && (await val("bookings/w2/clientUid")) === null && (await val("bookings/w3/clientUid")) === "other" && (await val("bookings/w4/clientUid")) === null && (await val("bookings/w6/clientUid")) === null);
  check("client told", Object.values((await val("notifications/cN")) || {}).some((n) => n.title.includes("Знайшли")));
  await sref("bookings/w1/clientUid").remove(); await sref("bookings/w5/clientUid").remove();
  await fns.salonOnClientRegistered.run({ data: { val: () => prof }, params: { salonId: S, uid: "cN" } });
  check("registration trigger links them and still tells the owner", (await val("bookings/w1/clientUid")) === "cN" && titles("tok-owner").includes("🎉 Новий клієнт"));

  // ═══ Видалення клієнта ═══
  console.log("── delete client account");
  await seed();
  const mk = (o) => ({ masterId: "m1", serviceName: "Стрижка", price: 500, durationMin: 60, clientUid: "c1", clientName: "Client 1", phone: "+380500000001", clientNote: "note", time: "10:00", date: TOMORROW, status: "confirmed", ...o });
  await sref("bookings").set({ f1: mk({}), p1: mk({ date: YESTERDAY, status: "completed" }), x1: mk({ clientUid: "c2", clientName: "Client 2", time: "12:00" }) });
  await sref("timeslots/m1/" + TOMORROW).set({ slot1000: { time: "10:00", available: false, bookingStart: true, bookedBy: "c1" } });
  await sref("chats/c1/x").set({ text: "hi" }); await sref("chatMeta/c1").set({ unreadForAdmin: 1 }); await sref("masterChats/m1/c1/x").set({ text: "hi" });
  await sref("userQueue/c1/k").set(true); await sref(`queue/m1/${TOMORROW}_1500/entries/c1`).set({ ts: 1 }); await sref(`queue/m1/${TOMORROW}_1500/entries/c2`).set({ ts: 2 });
  await sref("notifications/c1/n").set({ title: "x" });
  await db.ref(`salons/${S2}/bookings/s2f`).set(mk({ clientUid: "c1" }));
  r = await call(fns.salonDeleteAccount, { body: { type: "client" } });
  check("no token → 401", r.code === 401);
  r = await call(fns.salonDeleteAccount, { headers: as("c1"), body: { type: "client", salonId: "a.b" } });
  check("bad salon id → 400", r.code === 400);
  r = await call(fns.salonDeleteAccount, { headers: as("c1"), body: { type: "client" } });
  check("deleted in all salons, auth user removed", r.code === 200 && r.out.salons === 2 && authState.deleted.join() === "c1", JSON.stringify(r.out));
  check("client data gone (profile, chats, notifications, queue, tokens)", (await val("users/c1")) === null && (await val("chats/c1")) === null && (await val("chatMeta/c1")) === null && (await val("masterChats/m1/c1")) === null && (await val("notifications/c1")) === null && (await val("userQueue/c1")) === null && (await val(`queue/m1/${TOMORROW}_1500/entries/c1`)) === null && (await val("clientTokens/c1")) === null);
  check("other client's data and queue entry untouched", (await val("users/c2/profile/name")) === "Client 2" && !!(await val(`queue/m1/${TOMORROW}_1500/entries/c2`)) && (await val("bookings/x1/clientName")) === "Client 2");
  const f1 = await val("bookings/f1");
  check("future booking cancelled by client, personal data erased", f1.status === "cancelled" && f1.cancelledBy === "client" && f1.deletedClient === true && f1.clientName === "Видалений клієнт" && f1.phone === undefined && f1.clientNote === undefined);
  const p1 = await val("bookings/p1");
  check("past booking kept for statistics but anonymised", p1.status === "completed" && p1.price === 500 && p1.clientUid === undefined && p1.clientName === "Видалений клієнт" && p1.phone === undefined);
  check("same in the second salon", (await val("bookings/s2f", S2)).deletedClient === true && (await val("users/c1", S2)) === null);
  pushes.length = 0;
  await fns.salonOnBookingChanged.run(wr(mk({}), f1, { salonId: S, bookingId: "f1" }));
  check("cancel trigger frees the slot and tells staff, but never the deleted client", (await val(`timeslots/m1/${TOMORROW}/slot1000/available`)) === true && !titles("tok-c1").length && titles("tok-owner").includes("❌ Запис скасовано клієнтом"), JSON.stringify(pushes));
  check("no notifications re-created for the deleted client", (await val("notifications/c1")) === null);
  await seed(); authState.deleted.length = 0;
  r = await call(fns.salonDeleteAccount, { headers: as("c1"), body: { type: "client", salonId: S } });
  check("with salonId only that salon is cleaned and the auth user stays", r.out.salons === 1 && !authState.deleted.length && (await val("users/c1", S2)) !== null);
  r = await call(fns.salonDeleteAccount, { headers: as("vendor", VENDOR), body: { type: "client" } });
  check("vendor account is protected", r.code === 400 && r.out.error === "vendor_account");

  // ═══ Видалення салону ═══
  console.log("── delete owner account");
  await seed();
  await db.ref(`salon_secrets/${S}`).set({ monobankToken: "SECRET-TOKEN-123" }); await db.ref(`salon_billing/${S}/p1`).set({ status: "success" });
  await db.ref("salon_slugs/beauty").set({ salonId: S }); await db.ref(`master_memberships/uM1/${S}`).set("m1");
  r = await call(fns.salonDeleteAccount, { headers: as("stranger"), body: { type: "owner", salonId: S } });
  check("a stranger cannot delete someone's salon → 403", r.code === 403 && (await val("profile/name")) === "Beauty");
  r = await call(fns.salonDeleteAccount, { headers: as("nobody"), body: { type: "owner" } });
  check("no salon → 404", r.code === 404);
  r = await call(fns.salonDeleteAccount, { headers: as(S), body: { type: "owner" } });
  const archive = [...files.entries()].find(([n]) => n.startsWith(`backups/deleted/${S}-`));
  check("owner deletes own salon: ok, archive saved without the Monobank token", r.code === 200 && archive && JSON.parse(archive[1]).data.profile.name === "Beauty" && !archive[1].includes("SECRET-TOKEN"), JSON.stringify(r.out));
  check("salon, index, slug, secrets, billing, memberships, files and auth user removed", (await val("")) === null && !(await db.ref(`salon_index/${S}`).get()).exists() && !(await db.ref("salon_slugs/beauty").get()).exists() && !(await db.ref(`salon_secrets/${S}`).get()).exists() && !(await db.ref(`salon_billing/${S}`).get()).exists() && !(await db.ref(`master_memberships/uM1/${S}`).get()).exists() && deletedPrefixes.includes(`salons/${S}/`) && authState.deleted.includes(S));
  check("other salon untouched", (await val("profile/name", S2)) === "Other");
  await seed();
  r = await call(fns.salonDeleteAccount, { headers: as("vendor", VENDOR), body: { type: "owner", salonId: S } });
  check("vendor may delete any salon", r.code === 200 && (await val("")) === null);
  await seed();
  r = await call(fns.salonDeleteAccount, { headers: as("c1"), body: { type: "wat" } });
  check("unknown type → 400", r.code === 400 && r.out.error === "type");

  // ═══ Резервна копія ═══
  console.log("── backup");
  await seed(); await sref("chats/c1/x").set({ text: "private" });
  await fns.salonNightlyBackup.run({});
  check("disabled by default (system/backupEnabled): nothing written", ![...files.keys()].some((n) => n.startsWith("backups/20")));
  await db.ref("system/backupEnabled").set(true);
  await fns.salonNightlyBackup.run({});
  const today = lib.localDate(Date.now(), "Europe/Kyiv");
  const bk = files.get(`backups/${today}/${S}.json`);
  check("enabled: one JSON per salon", !!bk && files.has(`backups/${today}/${S2}.json`));
  const parsed = JSON.parse(bk);
  check("copy has profile, masters, users — without chats and push tokens", parsed.data.profile.name === "Beauty" && !!parsed.data.masters && !!parsed.data.users.c1.profile && !bk.includes("private") && !bk.includes("tok-c1"));
  files.clear(); await db.ref("system/backupEnabled").set(false); await db.ref("system/backupRequest").set(Date.now());
  await fns.salonManualBackup.run(wr(null, Date.now(), {}));
  check("manual backup (system/backupRequest) works even when the toggle is off and clears the request", files.has(`backups/${today}/${S}.json`) && (await db.ref("system/backupRequest").get()).val() === null && (await db.ref("system/backupStatus").get()).val().trigger === "manual");
  await fns.salonManualBackup.run(wr(Date.now(), null, {}));
  check("request removal itself does not start a backup", (await db.ref("system/backupStatus").get()).val().trigger === "manual");
  check("status recorded and old copies pruned", (await db.ref("system/backupStatus").get()).val().ok === true && removedFiles.includes("backups/2000-01-01/old.json"));

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("test crashed:", e); process.exit(2); });
