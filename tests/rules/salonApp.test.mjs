// Записи адмінки салону (src/salon/*) проти СПРАВЖНІХ правил бази: ті самі шляхи й поля, що пише застосунок.
// Якщо тут червоне — у бойовій базі відповідна дія в UI впаде з permission_denied.
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, get, set, update, remove, push, increment, query, orderByChild, equalTo, limitToLast } from "firebase/database";
import { readFileSync } from "node:fs";
import { DEFAULT_TARIFFS, toDraft, validateDraft } from "../../src/salonTariffs.js";
const [HOST, PORT] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000").split(":");
const env = await initializeTestEnvironment({ projectId: "demo-rt", database: { host: HOST, port: Number(PORT), rules: readFileSync("database.rules.json", "utf8") } });
const NOW = Date.now(), DAY = 86400000, D = "2030-05-14";
await env.withSecurityRulesDisabled(async (c) => {
  await set(ref(c.database(), "/"), { salons: { S: {
    profile: { name: "S", slug: "s" }, license: { status: "active", expiresAt: NOW + 30 * DAY },
    masters: { m1: { profile: { name: "A", active: true } }, m2: { profile: { name: "B", active: true } } },
    masterAuth: { uM1: "m1" }, masterSettings: { m1: { uid: "uM1" } },
    users: { c1: { profile: { name: "C1" } } },
    services: { s1: { name: "Cut", price: 500, duration: 60, masterIds: { m1: true, m2: true }, masterPrices: { m2: 450 } } },
    timeslots: { m1: { [D]: { slot1000: { time: "10:00", available: true }, slot1030: { time: "10:30", available: true } } }, m2: { [D]: { slot1000: { time: "10:00", available: true } } } },
    bookings: { bm1: { id: "bm1", masterId: "m1", date: D, time: "10:00", status: "confirmed", price: 500, durationMin: 60, clientName: "X" }, bm2: { id: "bm2", masterId: "m2", date: D, time: "10:00", status: "pending", price: 450, durationMin: 60, clientName: "Y" } },
  } } });
});
const as = (uid) => env.authenticatedContext(uid).database();
const PLAT = env.authenticatedContext("plat", { email: "sash5385@gmail.com" }).database();
const OWN = as("S"), M1 = as("uM1"), NEW = as("ownNew"), STRANGER = as("stranger");
let fails = 0;
async function t(name, expect, fn) {
  let ok; try { await fn(); ok = true; } catch { ok = false; }
  const pass = (expect === "ALLOW") === ok; if (!pass) fails++;
  console.log(`${pass ? "ok  " : "FAIL"} ${expect === "ALLOW" ? "ALLOW" : "DENY "} ${name}${pass ? "" : "   <-- got " + (ok ? "ALLOW" : "DENY")}`);
}
const A = "ALLOW", X = "DENY";
const R = (db, p) => ref(db, p), S = (p) => `salons/S/${p}`;
const staffBooking = (by, over = {}) => ({ masterId: "m1", serviceId: "s1", serviceName: "Cut", price: 500, durationMin: 60, clientUid: "c1", clientName: "C1", phone: "+380", date: D, time: "10:30", status: "confirmed", paymentMethod: "onsite", clientNote: "n", createdBy: by, createdAt: NOW, ...over });

console.log("── онбордінг (мультишлях від кореня, як SalonAuth.Onboarding)");
const upd = { "salons/ownNew/profile": { name: "N", phone: "1", slug: "n-salon", timezone: "Europe/Kyiv", slotStep: 30, createdAt: NOW }, "salons/ownNew/license/status": "trial", "salons/ownNew/license/trialEndsAt": NOW + 14 * DAY,
  "salon_slugs/n-salon": { salonId: "ownNew" }, "salon_index/ownNew": { name: "N", slug: "n-salon", createdAt: NOW },
  "salons/ownNew/masters/mm/profile": { name: "Me", active: true, order: 0, spec: "", workHours: [{ from: "09:00", to: "18:00", off: false }] }, "salons/ownNew/masterAuth/ownNew": "mm", "salons/ownNew/masterSettings/mm/uid": "ownNew" };
await t("create salon + trial + slug + index + owner-as-master in one update", A, () => update(ref(NEW), upd));
await t("same slug taken by someone else", X, () => update(ref(STRANGER), { "salon_slugs/n-salon": { salonId: "stranger" } }));
await t("trial longer than 15 days", X, () => update(ref(as("greedy")), { "salons/greedy/license/status": "trial", "salons/greedy/license/trialEndsAt": NOW + 60 * DAY }));
await t("change slug: free old + claim new + profile + index", A, () => update(ref(NEW), { "salon_slugs/n-salon": null, "salon_slugs/n-new": { salonId: "ownNew" }, "salons/ownNew/profile/slug": "n-new", "salon_index/ownNew/slug": "n-new" }));
await t("profile edit: multi-path name/phone/address/about/timezone/slotStep + index", A, () => update(ref(NEW), { "salons/ownNew/profile/name": "N2", "salons/ownNew/profile/phone": "2", "salons/ownNew/profile/address": "a", "salons/ownNew/profile/about": "b", "salons/ownNew/profile/timezone": "Europe/Warsaw", "salons/ownNew/profile/slotStep": 15, "salon_index/ownNew/name": "N2" }));
await t("owner reads master_memberships of someone else", X, () => get(R(OWN, "master_memberships/uM1")));

console.log("── власник: записи (actions.js)");
let id;
await t("createBooking by owner (createdBy admin)", A, async () => { const r = push(R(OWN, S("bookings"))); id = r.key; await set(r, { ...staffBooking("admin"), id }); });
await t("walk-in booking without clientUid", A, () => { const b = { ...staffBooking("admin"), id: "w1", time: "11:00" }; delete b.clientUid; return set(R(OWN, S("bookings/w1")), b); });
await t("personal time block", A, () => set(R(OWN, S("bookings/p1")), { id: "p1", masterId: "m2", status: "personal", date: D, time: "13:00", durationMin: 60, clientName: "Обід", createdBy: "admin", createdAt: NOW }));
await t("confirm", A, () => update(R(OWN, S("bookings/bm2")), { status: "confirmed" }));
await t("complete", A, () => update(R(OWN, S("bookings/bm2")), { status: "completed" }));
await t("cancel (cancelledBy admin)", A, () => update(R(OWN, S("bookings/bm1")), { status: "cancelled", cancelledBy: "admin", cancelledAt: NOW }));
await t("mark paid on site", A, () => update(R(OWN, S(`bookings/${id}`)), { paymentStatus: "paid", paidAmount: 500, paidAt: NOW, paymentMethod: "onsite" }));
await t("move to another master/date/time", A, () => update(R(OWN, S(`bookings/${id}`)), { date: "2030-05-15", time: "12:00", masterId: "m2" }));
await t("staff note", A, () => update(R(OWN, S(`bookings/${id}`)), { staffNote: "VIP" }));
await t("owner reads bookings by date range (Bookings/Stats)", A, () => get(query(R(OWN, S("bookings")), orderByChild("date"))));

console.log("── власник: слоти, послуги, майстри, клієнти, чат");
await t("block slot", A, () => update(R(OWN, S(`timeslots/m1/${D}/slot1000`)), { available: false, adminBlocked: true }));
await t("unblock slot", A, () => update(R(OWN, S(`timeslots/m1/${D}/slot1000`)), { available: true, adminBlocked: false }));
await t("block whole day (multi-path from salon node)", A, () => update(R(OWN, S("")), { [`timeslots/m1/${D}/slot1000/available`]: false, [`timeslots/m1/${D}/slot1000/adminBlocked`]: true, [`timeslots/m1/${D}/slot1030/available`]: false, [`timeslots/m1/${D}/slot1030/adminBlocked`]: true }));
await t("grid generation for any master (ensureGrid)", A, () => update(R(OWN, S("")), { "timeslots/m2/2030-05-16/slot0900": { time: "09:00", available: true }, "timeslots/m2/2030-05-16/slot0930": { time: "09:30", available: true } }));
await t("regrid removes surplus free slot", A, () => update(R(OWN, S("")), { "timeslots/m2/2030-05-16/slot0930": null }));
await t("service create with masterIds and masterPrices", A, () => set(R(OWN, S("services/s2")), { name: "Color", category: "Фарбування", price: 1500, duration: 120, masterIds: { m1: true }, masterPrices: { m1: 1400 }, active: true }));
await t("service delete", A, () => remove(R(OWN, S("services/s2"))));
await t("master profile save (name, spec, hours, order)", A, () => update(R(OWN, S("masters/m2")), { profile: { name: "B2", spec: "Barber", active: true, order: 1, workHours: [{ from: "09:00", to: "18:00", off: false }] } }));
await t("bind owner as master ('Це я')", A, () => update(R(OWN, S("")), { "masterAuth/S": "m2", "masterSettings/m2/uid": "S" }));
await t("unlink master login", A, () => update(R(OWN, S("")), { "masterAuth/uM1": null, "masterSettings/m1/uid": null, "masterTokens/m1": null }));
await env.withSecurityRulesDisabled(async (c) => { await update(ref(c.database(), "salons/S"), { "masterAuth/uM1": "m1", "masterSettings/m1/uid": "uM1" }); });
await t("client notes / block", A, () => update(R(OWN, S("users/c1")), { notes: "alergy", blocked: true }));
await t("owner reads users and client booking history (query by clientUid)", A, async () => { await get(R(OWN, S("users"))); await get(query(R(OWN, S("bookings")), orderByChild("clientUid"), equalTo("c1"))); });
await t("owner chat: push message + meta with increment", A, async () => { await push(R(OWN, S("chats/c1")), { from: "admin", text: "hi", ts: NOW, time: "10:00" }); await update(R(OWN, S("chatMeta/c1")), { lastMsg: "hi", lastTs: NOW, unreadForClient: increment(1), unreadForAdmin: 0 }); });
await t("owner reads thread (limitToLast)", A, () => get(query(R(OWN, S("chats/c1")), limitToLast(100))));
await t("owner reads chatMeta and all masterChatMeta", A, async () => { await get(R(OWN, S("chatMeta"))); await get(R(OWN, S("masterChatMeta"))); });
await t("owner writes into master chat", A, async () => { await push(R(OWN, S("masterChats/m1/c1")), { from: "admin", text: "x", ts: NOW }); await update(R(OWN, S("masterChatMeta/m1/c1")), { lastMsg: "x", lastTs: NOW, unreadForClient: increment(1), unreadForMaster: 0 }); });
await t("owner push token", A, () => set(R(OWN, S("fcmTokens/dev1")), "tok"));
await t("owner reads own license", A, () => get(R(OWN, S("license"))));

console.log("── майстер (uM1 → m1)");
await t("master loads shared data: profile, masters, services", A, async () => { await get(R(M1, S("profile"))); await get(R(M1, S("masters"))); await get(R(M1, S("services"))); });
await t("master reads own bookings by masterId", A, () => get(query(R(M1, S("bookings")), orderByChild("masterId"), equalTo("m1"))));
await t("master cannot read all bookings", X, () => get(R(M1, S("bookings"))));
await t("master reads license (Shell does not — must stay private)", X, () => get(R(M1, S("license"))));
await t("master reads users (NewBooking must not)", X, () => get(R(M1, S("users"))));
let mid;
await t("createBooking by master (createdBy master)", A, async () => { const r = push(R(M1, S("bookings"))); mid = r.key; await set(r, { ...staffBooking("master", { time: "10:30" }), id: mid }); });
await t("master books for another master", X, () => set(R(M1, S("bookings/bad")), { ...staffBooking("master", { masterId: "m2" }), id: "bad" }));
await t("master personal time", A, () => set(R(M1, S("bookings/mp")), { id: "mp", masterId: "m1", status: "personal", date: D, time: "15:00", durationMin: 30, clientName: "Лікар", createdBy: "master", createdAt: NOW }));
await t("master confirm / complete own", A, async () => { await update(R(M1, S(`bookings/${mid}`)), { status: "confirmed" }); await update(R(M1, S(`bookings/${mid}`)), { status: "completed" }); });
await t("master cancel own (cancelledBy master)", A, () => update(R(M1, S("bookings/bm1")), { status: "cancelled", cancelledBy: "master", cancelledAt: NOW }));
await t("master marks own paid on site / notes", A, () => update(R(M1, S(`bookings/${mid}`)), { paymentStatus: "paid", paidAmount: 500, staffNote: "ok" }));
await t("master moves own booking to another master", X, () => update(R(M1, S(`bookings/${mid}`)), { masterId: "m2" }));
await t("master edits another master's booking", X, () => update(R(M1, S("bookings/bm2")), { status: "cancelled", cancelledBy: "master" }));
await t("master blocks own slot, unblocks", A, async () => { await update(R(M1, S(`timeslots/m1/${D}/slot1000`)), { available: false, adminBlocked: true }); await update(R(M1, S(`timeslots/m1/${D}/slot1000`)), { available: true, adminBlocked: false }); });
await t("master generates own grid (multi-path)", A, () => update(R(M1, S("")), { "timeslots/m1/2030-05-17/slot0900": { time: "09:00", available: true }, "timeslots/m1/2030-05-17/slot0930": { time: "09:30", available: true } }));
await t("master blocks another master's slot", X, () => update(R(M1, S(`timeslots/m2/${D}/slot1000`)), { available: false, adminBlocked: true }));
await t("master writes grid of another master", X, () => update(R(M1, S("")), { "timeslots/m2/2030-05-17/slot0900": { time: "09:00", available: true } }));
await t("master own push token", A, () => set(R(M1, S("masterTokens/m1/dev1")), "tok"));
await t("master chat: list meta, read thread, send, reset unread", A, async () => {
  await get(R(M1, S("masterChatMeta/m1"))); await get(query(R(M1, S("masterChats/m1/c1")), limitToLast(100)));
  await push(R(M1, S("masterChats/m1/c1")), { from: "master", text: "hello", ts: NOW });
  await update(R(M1, S("masterChatMeta/m1/c1")), { lastMsg: "hello", lastTs: NOW, unreadForClient: increment(1), unreadForMaster: 0 });
});
await t("master unread badge: reads masterChatMeta/m1 (Shell)", A, () => get(R(M1, S("masterChatMeta/m1"))));
await t("master reads salon chatMeta (Shell must not for master)", X, () => get(R(M1, S("chatMeta"))));
await t("master edits services / masters / profile", X, async () => { await set(R(M1, S("services/s1/price")), 1); });
await t("master edits own master profile (hours are owner-only)", X, () => update(R(M1, S("masters/m1")), { profile: { name: "hack" } }));
await t("master membership read (resolveSession)", A, async () => { await env.withSecurityRulesDisabled(async (c) => { await set(ref(c.database(), "master_memberships/uM1/S"), "m1"); }); await get(R(M1, "master_memberships/uM1")); await get(R(M1, S("masterAuth/uM1"))); });
await t("stranger has no salon: resolveSession reads are allowed but empty", A, async () => { const p = await get(R(STRANGER, "salons/stranger/profile")); if (p.exists()) throw new Error("x"); await get(R(STRANGER, "master_memberships/stranger")); });

console.log("── розсилка, фото, видалення (як Broadcast / PhotoField / Settings)");
await t("owner saves a broadcast template", A, () => update(R(OWN, S("pushTemplates/t1")), { name: "Акція", title: "Знижка", body: "{ім'я}, −20%" }));
await t("owner deletes the template", A, () => remove(R(OWN, S("pushTemplates/t1"))));
await t("owner reads broadcast log", A, () => get(R(OWN, S("pushLog"))));
await t("owner sets salon logo (profile/logo)", A, () => update(R(OWN, S("profile")), { logo: "https://firebasestorage.googleapis.com/x.jpg" }));
await t("owner switches slot-freed pushes (profile/slotFreedPush)", A, () => update(R(OWN, S("profile")), { slotFreedPush: false }));
await t("owner saves master with photo + createdAt/activatedAt", A, () => update(R(OWN, S("masters/m2")), { profile: { name: "B", active: true, order: 1, photo: "https://firebasestorage.googleapis.com/m.jpg", createdAt: NOW, activatedAt: NOW } }));
await t("master cannot write broadcast templates", X, () => set(R(M1, S("pushTemplates/t2")), { name: "x" }));
await t("master cannot set the salon logo", X, () => update(R(M1, S("profile")), { logo: "https://evil" }));
await t("master cannot read the broadcast log", X, () => get(R(M1, S("pushLog"))));

console.log("── екран суперадміна (як Superadmin / SuperTariffs / SuperSystem)");
const tariffs = validateDraft(toDraft(DEFAULT_TARIFFS)).value;
await t("list salons: salon_index + license of each", A, async () => { await get(R(PLAT, "salon_index")); await get(R(PLAT, "salons/S/license")); await get(R(PLAT, "salon_billing/S")); });
await t("license edit (status + until + limit + tier + provider)", A, () => update(R(PLAT, "salons/S/license"), { status: "active", expiresAt: NOW + 30 * DAY, masterLimit: 3, tier: "team", provider: "manual" }));
await t("trial edit (trialEndsAt) beyond 15 days", A, () => update(R(PLAT, "salons/S/license"), { status: "trial", trialEndsAt: NOW + 90 * DAY, masterLimit: null, tier: null }));
await t("save tariffs from the form (validated draft)", A, () => set(R(PLAT, "system/tariffs"), { ...tariffs, currency: "UAH" }));
await t("reset tariffs to defaults", A, () => remove(R(PLAT, "system/tariffs")));
await t("toggle nightly backup + manual request", A, async () => { await set(R(PLAT, "system/backupEnabled"), true); await set(R(PLAT, "system/backupRequest"), NOW); });
await t("contact messages: mark done / delete", A, async () => { await update(R(PLAT, "system/contactMessages/m1"), { status: "done" }); await remove(R(PLAT, "system/contactMessages/m1")); });
await t("error log: remove one / clear all", A, async () => { await remove(R(PLAT, "system/errorLog/e1")); await remove(R(PLAT, "system/errorLog")); });
await t("the same license edit by the owner", X, () => update(R(OWN, "salons/S/license"), { status: "active", expiresAt: NOW + 900 * DAY }));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
await env.cleanup();
process.exit(fails ? 1 : 0);
