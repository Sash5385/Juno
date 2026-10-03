// Правила бази для салону (salons/*, salon_slugs/*, salon_index/*): ролі власник / майстер / клієнт.
// Запуск: див. tests/README.md (потрібен емулятор Realtime Database).
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, get, set, update, remove, query, orderByChild, equalTo } from "firebase/database";
import { readFileSync } from "node:fs";
const [EMU_HOST, EMU_PORT_S] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000").split(":");
const env = await initializeTestEnvironment({ projectId: "demo-rt", database: { host: EMU_HOST, port: Number(EMU_PORT_S), rules: readFileSync("database.rules.json", "utf8") } });
const NOW = Date.now(), DAY = 86400000, D = "2026-10-10";
const SLOTS = {
  slot1000: { time: "10:00", available: true },
  slot1100: { time: "11:00", available: false, adminBlocked: true },
  slot1200: { time: "12:00", available: false, phantom: true, bookedBy: "cli1" },
  slot1400: { time: "14:00", available: false, bookedBy: "cli1" },
  slot1600: { time: "16:00", available: false, bookedBy: "cliB" },
  slot1300: { time: "13:00", available: true, vipOnly: true, surcharge: 100, durMin: 120 },
};
const BOOK1 = { id: "b1", date: D, time: "10:00", masterId: "m1", serviceId: "haircut", serviceName: "Стрижка", price: 500, durationMin: 60, clientUid: "cli1", clientName: "C1", phone: "1", status: "confirmed", paymentStatus: "unpaid", paymentMethod: "onsite", createdBy: "admin" };
const BOOK2 = { ...BOOK1, id: "b2", masterId: "m2", clientUid: "cliOther", time: "11:00" };
await env.withSecurityRulesDisabled(async (ctx) => {
  await set(ref(ctx.database(), "/"), {
    salons: {
      ownA: {
        license: { status: "active", expiresAt: NOW + 30 * DAY, provider: "monobank" },
        profile: { name: "Salon A", slug: "salon-a" },
        masters: { m1: { profile: { name: "M1", active: true } }, m2: { profile: { name: "M2", active: true } }, m3: { profile: { name: "M3", active: false } } },
        masterAuth: { mast1: "m1", mast2: "m2" },
        masterSettings: { m1: { commissionPct: 30 }, m2: { commissionPct: 40 } },
        services: { haircut: { name: "Стрижка", price: 500, duration: 60, masterIds: { m1: true, m2: true }, masterPrices: { m2: 450 } }, nails: { name: "Манікюр", price: 700, duration: 90, masterIds: { m3: true } } },
        users: { cli1: { profile: { name: "C1" }, isVip: false, discount: 0, blocked: false }, cliB: { profile: { name: "B" }, blocked: true } },
        timeslots: { m1: { [D]: SLOTS }, m2: { [D]: { slot1000: { time: "10:00", available: true } } }, m3: { [D]: { slot1000: { time: "10:00", available: true } } } },
        bookings: { b1: BOOK1, b2: BOOK2 },
        chats: { cli1: { x: { text: "hi" } } },
      },
      ownB: { users: { cliX: { profile: { name: "X" } } } },
      ownC: {},
    },
  });
});
const as = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).database();
const anon = env.unauthenticatedContext().database();
const OWN_A = as("ownA"), OWN_C = as("ownC"), PLAT = as("platUid", "sash5385@gmail.com");
const M1 = as("mast1"), M2 = as("mast2");
const C1 = as("cli1"), CB = as("cliB"), CX = as("cliX"), CNEW = as("cliNew");
const R = (db, p) => ref(db, p);
const A_ = (p) => `salons/ownA/${p}`;
let fails = 0;
async function t(name, expect, fn) {
  let ok;
  try { await fn(); ok = true } catch { ok = false }
  const pass = (expect === "ALLOW") === ok;
  if (!pass) fails++;
  console.log(`${pass ? "ok  " : "FAIL"} ${expect === "ALLOW" ? "ALLOW" : "DENY "} ${name}${pass ? "" : "   <-- got " + (ok ? "ALLOW" : "DENY")}`);
}
const A = "ALLOW", X = "DENY";
const NEWBOOK = (over = {}) => ({ id: "n1", date: D, time: "10:00", masterId: "m1", serviceId: "haircut", serviceName: "Стрижка", price: 500, durationMin: 60, clientUid: "cli1", clientName: "C1", phone: "1", status: "pending", paymentMethod: "online", createdAt: NOW, ...over });
const reset = () => env.withSecurityRulesDisabled(async (c) => {
  const db = c.database();
  await set(ref(db, A_("bookings")), { b1: BOOK1, b2: BOOK2 });
  await set(ref(db, A_("timeslots/m1")), { [D]: SLOTS });
});

console.log("── SLUGS / INDEX");
await t("anonymous reads salon_slugs", A, () => get(R(anon, "salon_slugs/salon-a")));
await t("owner claims own slug", A, () => set(R(OWN_A, "salon_slugs/salon-a"), { salonId: "ownA" }));
await t("user claims slug for someone else's salon", X, () => set(R(C1, "salon_slugs/hijack"), { salonId: "ownA" }));
await t("other user overwrites existing slug", X, () => set(R(C1, "salon_slugs/salon-a"), { salonId: "cli1" }));
await t("owner writes own salon_index", A, () => set(R(OWN_A, "salon_index/ownA"), { name: "A" }));
await t("owner writes someone else's salon_index", X, () => set(R(OWN_A, "salon_index/ownC"), { name: "A" }));
await t("owner (not platform) reads salon_index", X, () => get(R(OWN_A, "salon_index")));
await t("platform reads salon_index", A, () => get(R(PLAT, "salon_index")));

console.log("── LICENSE");
await t("owner removes own license", X, () => remove(R(OWN_A, A_("license"))));
await t("owner deletes license/expiresAt", X, () => remove(R(OWN_A, A_("license/expiresAt"))));
await t("owner extends expiresAt", X, () => set(R(OWN_A, A_("license/expiresAt")), NOW + 999 * DAY));
await t("owner sets status active", X, () => set(R(OWN_A, A_("license/status")), "active"));
await t("owner removes whole salon node", X, () => remove(R(OWN_A, "salons/ownA")));
await t("new salon creates 14-day trial", A, () => update(R(OWN_C, "salons/ownC"), { profile: { name: "N", slug: "n" }, "license/status": "trial", "license/trialEndsAt": NOW + 14 * DAY }));
await t("then deletes trial to recreate", X, () => remove(R(OWN_C, "salons/ownC/license")));
await env.withSecurityRulesDisabled(async (c) => { await remove(ref(c.database(), "salons/ownC")); });
await t("trial 365 days at creation", X, () => update(R(OWN_C, "salons/ownC"), { "license/status": "trial", "license/trialEndsAt": NOW + 365 * DAY }));
await t("platform sets license", A, () => update(R(PLAT, A_("license")), { status: "active", expiresAt: NOW + 60 * DAY, provider: "manual" }));
await t("owner reads own license", A, () => get(R(OWN_A, A_("license"))));
await t("client reads license", X, () => get(R(C1, A_("license"))));
await t("master reads license", X, () => get(R(M1, A_("license"))));

console.log("── PUBLIC / PRIVATE READS");
for (const p of ["profile", "services", "masters", "timeslots/m1", `timeslots/m1/${D}`, "reviews"]) await t(`anonymous reads ${p}`, A, () => get(R(anon, A_(p))));
for (const p of ["users", "users/cli1", "bookings", "masterAuth", "masterSettings", "settings", "chats", "license", "payments", "queue"]) await t(`anonymous reads ${p}`, X, () => get(R(anon, A_(p))));
await t("owner reads whole salon", A, () => get(R(OWN_A, "salons/ownA")));
await t("client reads whole salon", X, () => get(R(C1, "salons/ownA")));
await t("master reads whole salon", X, () => get(R(M1, "salons/ownA")));

console.log("── MASTERS: управління");
await t("owner adds master profile", A, () => set(R(OWN_A, A_("masters/m4/profile")), { name: "M4", active: true }));
await t("owner binds master login (masterAuth)", A, () => set(R(OWN_A, A_("masterAuth/mast4")), "m4"));
await t("owner writes masterSettings", A, () => set(R(OWN_A, A_("masterSettings/m1/commissionPct")), 35));
await t("owner writes services", A, () => set(R(OWN_A, A_("services/color")), { name: "Фарбування", price: 1500, masterIds: { m1: true } }));
await t("master binds own login to another master", X, () => set(R(M1, A_("masterAuth/mast1")), "m2"));
await t("master creates masterAuth for self", X, () => set(R(as("mastNew"), A_("masterAuth/mastNew")), "m1"));
await t("master edits own profile", X, () => set(R(M1, A_("masters/m1/profile/name")), "Hacked"));
await t("master edits services", X, () => set(R(M1, A_("services/haircut/price")), 1));
await t("master edits masterSettings (commission)", X, () => set(R(M1, A_("masterSettings/m1/commissionPct")), 0));
await t("client edits master profile", X, () => set(R(C1, A_("masters/m1/profile/name")), "Hacked"));
await t("client edits services", X, () => set(R(C1, A_("services/haircut/price")), 1));
await t("master reads own masterSettings", A, () => get(R(M1, A_("masterSettings/m1"))));
await t("master reads other masterSettings", X, () => get(R(M1, A_("masterSettings/m2"))));
await t("client reads masterSettings", X, () => get(R(C1, A_("masterSettings/m1"))));
await t("master reads own masterAuth", A, () => get(R(M1, A_("masterAuth/mast1"))));
await t("master reads other masterAuth", X, () => get(R(M1, A_("masterAuth/mast2"))));
await t("master writes masterInvites", X, () => set(R(M1, A_("masterInvites/code1")), { masterId: "m1" }));
await t("master saves own push token", A, () => set(R(M1, A_("masterTokens/m1/dev1")), "tok"));
await t("master saves push token for other master", X, () => set(R(M1, A_("masterTokens/m2/dev1")), "tok"));

console.log("── SLOTS (пер майстер)");
await t("master writes own slot", A, () => set(R(M1, A_(`timeslots/m1/${D}/slot0900`)), { time: "09:00", available: true }));
await t("master blocks own slot (adminBlocked)", A, () => update(R(M1, A_(`timeslots/m1/${D}/slot1000`)), { adminBlocked: true }));
await t("master writes slot of another master", X, () => set(R(M1, A_(`timeslots/m2/${D}/slot0900`)), { time: "09:00", available: true }));
await t("owner writes any master's slot", A, () => set(R(OWN_A, A_(`timeslots/m2/${D}/slot0900`)), { time: "09:00", available: true }));
await reset();
await t("client books free slot", A, () => update(R(C1, A_(`timeslots/m1/${D}/slot1000`)), { available: false, bookedBy: "cli1" }));
await reset();
await t("client of another salon books slot", X, () => update(R(CX, A_(`timeslots/m1/${D}/slot1000`)), { available: false, bookedBy: "cliX" }));
await t("non-member (no users/uid) books slot", X, () => update(R(CNEW, A_(`timeslots/m1/${D}/slot1000`)), { available: false, bookedBy: "cliNew" }));
await t("anonymous books slot", X, () => update(R(anon, A_(`timeslots/m1/${D}/slot1000`)), { available: false, bookedBy: "x" }));
await t("client books slot of INACTIVE master", X, () => update(R(C1, A_(`timeslots/m3/${D}/slot1000`)), { available: false, bookedBy: "cli1" }));
await t("client frees someone else's slot", X, () => update(R(C1, A_(`timeslots/m1/${D}/slot1600`)), { available: true, bookedBy: null }));
await t("client overwrites someone else's slot", X, () => set(R(C1, A_(`timeslots/m1/${D}/slot1600`)), { time: "16:00", available: false, bookedBy: "cli1" }));
await t("client frees own slot (bookedBy = self, як в instructors)", A, () => update(R(C1, A_(`timeslots/m1/${D}/slot1400`)), { available: true, bookedBy: null }));
await t("client removes own phantom slot", A, () => remove(R(C1, A_(`timeslots/m1/${D}/slot1200`))));
await t("client sets adminBlocked", X, () => update(R(C1, A_(`timeslots/m1/${D}/slot1000`)), { adminBlocked: true }));
await t("client changes surcharge", X, () => update(R(C1, A_(`timeslots/m1/${D}/slot1300`)), { surcharge: 0 }));
await t("client changes durMin", X, () => update(R(C1, A_(`timeslots/m1/${D}/slot1300`)), { durMin: 15 }));
await t("client creates 'available' slot", X, () => set(R(C1, A_(`timeslots/m1/${D}/slotNew`)), { time: "21:00", available: true }));
await t("client creates phantom slot", A, () => set(R(C1, A_(`timeslots/m1/${D}/slotNew2`)), { time: "21:00", available: false, phantom: true, bookedBy: "cli1" }));

console.log("── BOOKINGS: створення клієнтом");
await reset();
await t("client creates valid pending booking", A, () => set(R(C1, A_("bookings/n1")), NEWBOOK()));
await t("reschedule booking with rescheduledFrom/rescheduledFromId", A, () => set(R(C1, A_("bookings/n20")), NEWBOOK({ id: "n20", rescheduledFrom: `${D} 09:00`, rescheduledFromId: "b1" })));
await t("rescheduledFromId cannot be edited later", X, () => update(R(C1, A_("bookings/n20")), { rescheduledFromId: "b2" }));
await t("price below catalog", X, () => set(R(C1, A_("bookings/n2")), NEWBOOK({ id: "n2", price: 1 })));
await t("price above catalog", X, () => set(R(C1, A_("bookings/n2")), NEWBOOK({ id: "n2", price: 9999 })));
await t("service not offered by this master", X, () => set(R(C1, A_("bookings/n3")), NEWBOOK({ id: "n3", serviceId: "nails", price: 700 })));
await t("inactive master", X, () => set(R(C1, A_("bookings/n4")), NEWBOOK({ id: "n4", masterId: "m3", serviceId: "nails", price: 700 })));
await t("unknown service", X, () => set(R(C1, A_("bookings/n5")), NEWBOOK({ id: "n5", serviceId: "ghost" })));
await t("status confirmed at creation", X, () => set(R(C1, A_("bookings/n6")), NEWBOOK({ id: "n6", status: "confirmed" })));
await t("paymentStatus paid at creation", X, () => set(R(C1, A_("bookings/n7")), NEWBOOK({ id: "n7", paymentStatus: "paid" })));
await t("createdBy at creation", X, () => set(R(C1, A_("bookings/n8")), NEWBOOK({ id: "n8", createdBy: "admin" })));
await t("depositAmount at creation", X, () => set(R(C1, A_("bookings/n9")), NEWBOOK({ id: "n9", depositAmount: 500 })));
await t("paymentMethod invalid value", X, () => set(R(C1, A_("bookings/n10")), NEWBOOK({ id: "n10", paymentMethod: "free" })));
await t("booking for someone else's clientUid", X, () => set(R(C1, A_("bookings/n11")), NEWBOOK({ id: "n11", clientUid: "cliB" })));
await t("non-member creates booking", X, () => set(R(CNEW, A_("bookings/n12")), NEWBOOK({ id: "n12", clientUid: "cliNew" })));
await t("client of another salon creates booking", X, () => set(R(CX, A_("bookings/n13")), NEWBOOK({ id: "n13", clientUid: "cliX" })));
await t("anonymous creates booking", X, () => set(R(anon, A_("bookings/n14")), NEWBOOK({ id: "n14" })));

console.log("── BOOKINGS: персональна ціна майстра (masterPrices)");
await t("master with override: price = masterPrices", A, () => set(R(C1, A_("bookings/p1")), NEWBOOK({ id: "p1", masterId: "m2", price: 450 })));
await t("master with override: catalog price rejected", X, () => set(R(C1, A_("bookings/p2")), NEWBOOK({ id: "p2", masterId: "m2", price: 500 })));
await t("master without override: catalog price", A, () => set(R(C1, A_("bookings/p3")), NEWBOOK({ id: "p3", masterId: "m1", price: 500 })));
await t("master without override: other master's price rejected", X, () => set(R(C1, A_("bookings/p4")), NEWBOOK({ id: "p4", masterId: "m1", price: 450 })));
await t("owner sets masterPrices", A, () => set(R(OWN_A, A_("services/haircut/masterPrices/m1")), 550));
await t("master sets own masterPrices", X, () => set(R(M1, A_("services/haircut/masterPrices/m1")), 1));
await t("client sets masterPrices", X, () => set(R(C1, A_("services/haircut/masterPrices/m1")), 1));
await t("after owner override: old price rejected", X, () => set(R(C1, A_("bookings/p5")), NEWBOOK({ id: "p5", masterId: "m1", price: 500 })));
await t("after owner override: new price accepted", A, () => set(R(C1, A_("bookings/p6")), NEWBOOK({ id: "p6", masterId: "m1", price: 550 })));
await env.withSecurityRulesDisabled(async (c) => { await remove(ref(c.database(), A_("services/haircut/masterPrices/m1"))); });
await reset();

console.log("── BOOKINGS: зміна клієнтом");
await t("client cancels own booking", A, () => update(R(C1, A_("bookings/b1")), { status: "cancelled", cancelledBy: "client", cancelledAt: NOW }));
await reset();
await t("client rates own booking", A, () => update(R(C1, A_("bookings/b1")), { rating: 5, clientConfirmed: true }));
await t("client sets paymentStatus paid", X, () => update(R(C1, A_("bookings/b1")), { paymentStatus: "paid" }));
await t("client removes paymentStatus", X, () => remove(R(C1, A_("bookings/b1/paymentStatus"))));
await t("client changes price", X, () => update(R(C1, A_("bookings/b1")), { price: 1 }));
await t("client changes masterId", X, () => update(R(C1, A_("bookings/b1")), { masterId: "m2" }));
await t("client changes clientUid", X, () => update(R(C1, A_("bookings/b1")), { clientUid: "cliB" }));
await t("client changes paymentMethod", X, () => update(R(C1, A_("bookings/b1")), { paymentMethod: "online" }));
await t("client sets depositAmount", X, () => update(R(C1, A_("bookings/b1")), { depositAmount: 1 }));
await t("client confirms own booking via status", X, () => update(R(C1, A_("bookings/b1")), { status: "completed" }));
await t("client deletes own booking", X, () => remove(R(C1, A_("bookings/b1"))));
await t("client edits another client's booking", X, () => update(R(C1, A_("bookings/b2")), { status: "cancelled", cancelledBy: "client" }));
await t("client of another salon cancels booking", X, () => update(R(CX, A_("bookings/b1")), { status: "cancelled", cancelledBy: "client" }));

console.log("── BOOKINGS: читання");
await t("client gets own booking", A, () => get(R(C1, A_("bookings/b1"))));
await t("client gets someone else's booking", X, () => get(R(C1, A_("bookings/b2"))));
await t("client queries own bookings (clientUid)", A, () => get(query(R(C1, A_("bookings")), orderByChild("clientUid"), equalTo("cli1"))));
await t("client queries another's bookings", X, () => get(query(R(C1, A_("bookings")), orderByChild("clientUid"), equalTo("cliOther"))));
await t("client reads all bookings", X, () => get(R(C1, A_("bookings"))));
await t("client queries by masterId", X, () => get(query(R(C1, A_("bookings")), orderByChild("masterId"), equalTo("m1"))));
await t("master gets own booking", A, () => get(R(M1, A_("bookings/b1"))));
await t("master gets another master's booking", X, () => get(R(M1, A_("bookings/b2"))));
await t("master queries own masterId", A, () => get(query(R(M1, A_("bookings")), orderByChild("masterId"), equalTo("m1"))));
await t("master queries another masterId", X, () => get(query(R(M1, A_("bookings")), orderByChild("masterId"), equalTo("m2"))));
await t("master reads all bookings", X, () => get(R(M1, A_("bookings"))));
await t("owner reads all bookings", A, () => get(R(OWN_A, A_("bookings"))));
await t("platform reads all bookings (stats)", A, () => get(R(PLAT, A_("bookings"))));
await t("anonymous reads bookings", X, () => get(R(anon, A_("bookings"))));
await t("client of another salon reads booking", X, () => get(R(CX, A_("bookings/b1"))));

console.log("── BOOKINGS: майстер / власник");
await t("master marks own booking paid on site", A, () => update(R(M1, A_("bookings/b1")), { paymentStatus: "paid", status: "completed" }));
await reset();
await t("master edits another master's booking", X, () => update(R(M1, A_("bookings/b2")), { status: "completed" }));
await t("master reassigns own booking to another master", X, () => update(R(M1, A_("bookings/b1")), { masterId: "m2" }));
await t("master creates booking for self", A, () => set(R(M1, A_("bookings/mb1")), { ...BOOK1, id: "mb1", clientUid: "walkin", createdBy: "master" }));
await t("master creates booking for another master", X, () => set(R(M1, A_("bookings/mb2")), { ...BOOK2, id: "mb2" }));
await t("owner edits any booking", A, () => update(R(OWN_A, A_("bookings/b2")), { price: 450, status: "completed" }));
await t("owner creates booking for any master", A, () => set(R(OWN_A, A_("bookings/ob1")), { ...BOOK2, id: "ob1" }));
await t("owner of another salon edits booking", X, () => update(R(OWN_C, A_("bookings/b1")), { status: "completed" }));
await t("bookings_by_phone: owner", A, () => set(R(OWN_A, A_("bookings_by_phone/380")), { b1: true }));
await t("bookings_by_phone: master", X, () => set(R(M1, A_("bookings_by_phone/380")), { b1: true }));
await t("bookings_by_phone: client", X, () => get(R(C1, A_("bookings_by_phone/380"))));

console.log("── QUEUE (пер майстер)");
await t("client joins queue", A, () => set(R(C1, A_("queue/m1/k1/entries/cli1")), { ts: NOW }));
await t("client joins queue as someone else", X, () => set(R(C1, A_("queue/m1/k1/entries/cliB")), { ts: NOW }));
await t("client reads queue", A, () => get(R(C1, A_("queue/m1"))));
await t("non-member reads queue", X, () => get(R(CNEW, A_("queue/m1"))));
await t("master clears own queue entry", A, () => remove(R(M1, A_("queue/m1/k1/entries/cli1"))));
await t("master writes another master's queue", X, () => set(R(M1, A_("queue/m2/k1/entries/cli1")), { ts: NOW }));
await t("owner writes queue", A, () => set(R(OWN_A, A_("queue/m2/k1/entries/cli1")), { ts: NOW }));
await t("client writes userQueue own", A, () => set(R(C1, A_("userQueue/cli1/k1")), true));
await t("client writes userQueue other", X, () => set(R(C1, A_("userQueue/cliB/k1")), true));

console.log("── USERS (клієнти)");
await t("client sets own isVip", X, () => set(R(C1, A_("users/cli1/isVip")), true));
await t("client sets own discount", X, () => set(R(C1, A_("users/cli1/discount")), 500));
await t("blocked client clears blocked", X, () => remove(R(CB, A_("users/cliB/blocked"))));
await t("client edits own profile", A, () => update(R(C1, A_("users/cli1/profile")), { name: "C1x" }));
await t("client saves fcm token", A, () => set(R(C1, A_("users/cli1/fcmTokens/dev1")), "tok"));
await t("client saves clientTokens", A, () => set(R(C1, A_("clientTokens/cli1/dev1")), "tok"));
await t("new client registers (users/uid/profile)", A, () => set(R(CNEW, A_("users/cliNew/profile")), { name: "New", phone: "1" }));
await t("client reads own user", A, () => get(R(C1, A_("users/cli1"))));
await t("client reads another user", X, () => get(R(C1, A_("users/cliB"))));
await t("master reads client user", X, () => get(R(M1, A_("users/cli1"))));
await t("owner reads/writes users", A, () => update(R(OWN_A, A_("users/cli1")), { isVip: true, discount: 10 }));

console.log("── CHATS / NOTIFICATIONS / SERVER-ONLY");
await t("client writes own chat", A, () => set(R(C1, A_("chats/cli1/y")), { text: "hello" }));
await t("client reads another's chat", X, () => get(R(C1, A_("chats/cliB"))));
await t("master reads client chat", X, () => get(R(M1, A_("chats/cli1"))));
await t("owner reads client chat", A, () => get(R(OWN_A, A_("chats/cli1"))));
await t("client writes general chat", A, () => set(R(C1, A_("chats/general/z")), { text: "hi" }));
await t("non-member writes general chat", X, () => set(R(as("cliZ"), A_("chats/general/z")), { text: "hi" }));
await t("client reads own notifications", A, () => get(R(C1, A_("notifications/cli1"))));
await t("client reads payments", X, () => get(R(C1, A_("payments"))));
await t("client queries payments by bookingId", X, () => get(query(R(C1, A_("payments")), orderByChild("bookingId"), equalTo("b1"))));
await t("client writes payments", X, () => set(R(C1, A_("payments/b1")), { status: "paid" }));
await t("master writes payments", X, () => set(R(M1, A_("payments/b1")), { status: "paid" }));
await t("client writes masterInvites", X, () => set(R(C1, A_("masterInvites/c")), { masterId: "m1" }));
await t("client writes push_tasks", X, () => set(R(C1, A_("push_tasks/x")), { a: 1 }));
await t("client reads settings", X, () => get(R(C1, A_("settings"))));
await t("master reads settings", X, () => get(R(M1, A_("settings"))));

console.log("── MASTER CHATS (клієнт ↔ майстер)");
await env.withSecurityRulesDisabled(async (c) => { await set(ref(c.database(), A_("masterChats/m1/cli1/seed")), { from: "client", text: "hi" }); });
await t("client writes to master chat (own branch)", A, () => set(R(C1, A_("masterChats/m1/cli1/c1")), { from: "client", text: "hello", ts: NOW }));
await t("client updates chatMeta (own branch)", A, () => update(R(C1, A_("masterChatMeta/m1/cli1")), { lastMsg: "hello", lastTs: NOW }));
await t("client writes to another client's branch", X, () => set(R(C1, A_("masterChats/m1/cliB/c1")), { from: "client", text: "x" }));
await t("client writes chat to non-existent master", X, () => set(R(C1, A_("masterChats/m9/cli1/c1")), { from: "client", text: "x" }));
await t("client reads own master chat", A, () => get(R(C1, A_("masterChats/m1/cli1"))));
await t("client reads another client's master chat", X, () => get(R(C1, A_("masterChats/m1/cliB"))));
await t("client lists all chats of master", X, () => get(R(C1, A_("masterChats/m1"))));
await t("non-member writes master chat", X, () => set(R(as("cliZ"), A_("masterChats/m1/cliZ/c1")), { from: "client", text: "x" }));
await t("client of another salon writes master chat", X, () => set(R(CX, A_("masterChats/m1/cliX/c1")), { from: "client", text: "x" }));
await t("anonymous reads master chat", X, () => get(R(anon, A_("masterChats/m1/cli1"))));
await t("master reads own chat with client", A, () => get(R(M1, A_("masterChats/m1/cli1"))));
await t("master replies in own chat", A, () => set(R(M1, A_("masterChats/m1/cli1/r1")), { from: "master", text: "ok", ts: NOW }));
await t("master updates chatMeta in own chat", A, () => update(R(M1, A_("masterChatMeta/m1/cli1")), { unreadForClient: 1 }));
await t("master lists own chats", A, () => get(R(M1, A_("masterChats/m1"))));
await t("master reads another master's chat", X, () => get(R(M2, A_("masterChats/m1/cli1"))));
await t("master writes into another master's chat", X, () => set(R(M2, A_("masterChats/m1/cli1/r2")), { from: "master", text: "x" }));
await t("master reads chatMeta of another master", X, () => get(R(M2, A_("masterChatMeta/m1/cli1"))));
await t("owner reads any master chat", A, () => get(R(OWN_A, A_("masterChats/m1/cli1"))));
await t("owner writes into master chat", A, () => set(R(OWN_A, A_("masterChats/m1/cli1/o1")), { from: "admin", text: "x" }));
await t("owner of another salon reads master chat", X, () => get(R(OWN_C, A_("masterChats/m1/cli1"))));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
await env.cleanup();
process.exit(fails ? 1 : 0);
