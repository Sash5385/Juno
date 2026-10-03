// Записи клієнтського застосунку салону (DrivePad-Client/src/salon) проти СПРАВЖНІХ правил бази: ті самі шляхи й поля, що в actions.js.
// Червоне тут = у бойовій базі відповідна дія клієнта впаде з permission_denied.
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, get, set, update, remove, push, increment, query, orderByChild, equalTo, limitToLast } from "firebase/database";
import { readFileSync } from "node:fs";
const [HOST, PORT] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000").split(":");
const env = await initializeTestEnvironment({ projectId: "demo-rt", database: { host: HOST, port: Number(PORT), rules: readFileSync("database.rules.json", "utf8") } });
const NOW = Date.now(), DAY = 86400000, D = "2030-05-14";
const grid = () => Object.fromEntries(["10:00", "10:30", "11:00", "11:30", "12:00"].map((t) => [`slot${t.replace(":", "")}`, { time: t, available: true }]));
async function seed() {
  await env.withSecurityRulesDisabled(async (c) => {
    await set(ref(c.database(), "/"), {
      salon_slugs: { s: { salonId: "S" } },
      salons: { S: {
        profile: { name: "S", slug: "s", payment: { enabled: true } }, license: { status: "active", expiresAt: NOW + 30 * DAY },
        masters: { m1: { profile: { name: "A", active: true } }, m2: { profile: { name: "B", active: true } }, m3: { profile: { name: "C", active: false } } },
        services: { s1: { name: "Cut", price: 500, duration: 60, masterIds: { m1: true, m2: true, m3: true }, masterPrices: { m2: 450 } } },
        users: { c1: { profile: { name: "C1", phone: "+380" } }, c2: { profile: { name: "C2" } } },
        timeslots: { m1: { [D]: grid() }, m2: { [D]: grid() }, m3: { [D]: grid() } },
        bookings: { other: { id: "other", masterId: "m1", clientUid: "c2", date: D, time: "12:00", status: "confirmed", price: 500, durationMin: 60 } },
        notifications: { c1: { n1: { title: "x", ts: NOW } } }, chatMeta: { c1: { lastMsg: "m" } },
      } },
    });
  });
}
await seed();
const as = (uid) => env.authenticatedContext(uid).database();
const C1 = as("c1"), C2 = as("c2"), NEW = as("cNew"), anon = env.unauthenticatedContext().database();
let fails = 0;
async function t(name, expect, fn) {
  let ok; try { await fn(); ok = true; } catch { ok = false; }
  const pass = (expect === "ALLOW") === ok; if (!pass) fails++;
  console.log(`${pass ? "ok  " : "FAIL"} ${expect === "ALLOW" ? "ALLOW" : "DENY "} ${name}${pass ? "" : "   <-- got " + (ok ? "ALLOW" : "DENY")}`);
}
const A = "ALLOW", X = "DENY";
const R = (db, p) => ref(db, p), S = (p) => `salons/S/${p}`;
const claim = (db, uid, mid, ids) => update(R(db, S("")), Object.fromEntries(ids.flatMap((id) => [[`timeslots/${mid}/${D}/${id}/available`, false], [`timeslots/${mid}/${D}/${id}/bookedBy`, uid]])));
const release = (db, mid, ids) => update(R(db, S("")), Object.fromEntries(ids.flatMap((id) => [[`timeslots/${mid}/${D}/${id}/available`, true], [`timeslots/${mid}/${D}/${id}/bookedBy`, null]])));
const booking = (over = {}) => ({ id: "bk", masterId: "m1", serviceId: "s1", serviceName: "Cut", price: 500, durationMin: 60, clientUid: "c1", clientName: "C1", phone: "+380", date: D, time: "10:00", status: "pending", paymentMethod: "online", createdAt: NOW, ...over });
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

console.log("── публічне читання (сторінка запису без входу)");
await t("anonymous resolves slug", A, () => get(R(anon, "salon_slugs/s")));
await t("anonymous reads profile, services, masters", A, async () => { await get(R(anon, S("profile"))); await get(R(anon, S("services"))); await get(R(anon, S("masters"))); });
await t("anonymous reads free slots of a master", A, () => get(R(anon, S("timeslots/m1"))));
await t("anonymous cannot claim a slot", X, () => claim(anon, "x", "m1", ["slot1000"]));

console.log("── реєстрація клієнта в салоні");
await t("claim slot before having a profile (not a member)", X, () => claim(NEW, "cNew", "m1", ["slot1000"]));
await t("create own profile (users/uid/profile)", A, () => set(R(NEW, S("users/cNew/profile")), { name: "New", phone: "+380671234567", termsAccepted: true, createdAt: NOW }));
await t("create profile for someone else", X, () => set(R(NEW, S("users/c2/profile")), { name: "hack" }));
await t("edit own name/phone", A, () => update(R(C1, S("users/c1/profile")), { name: "C1x", phone: "+380111" }));
await t("set own isVip / blocked", X, async () => { await set(R(C1, S("users/c1/isVip")), true); });
await t("read own profile", A, () => get(R(C1, S("users/c1/profile"))));
await t("read another client's profile", X, () => get(R(C1, S("users/c2/profile"))));
await t("list all users", X, () => get(R(C1, S("users"))));

console.log("── запис: захоплення слотів і бронь (bookSlot)");
await t("claim 2 slots at once (multi-path)", A, () => claim(C1, "c1", "m1", ["slot1000", "slot1030"]));
await t("another client claims an overlapping range → whole update rejected", X, () => claim(C2, "c2", "m1", ["slot1030", "slot1100"]));
await t("…and the free slot of that rejected range stays free (atomic)", A, async () => { const s = await get(R(C2, S(`timeslots/m1/${D}/slot1100`))); if (s.val().available !== true) throw new Error("not atomic"); });
await t("claim a slot of an inactive master", X, () => claim(C1, "c1", "m3", ["slot1000"]));
await t("claim a slot of another salon's grid (non-member)", X, () => claim(as("cX"), "cX", "m2", ["slot1000"]));
await t("create booking with the exact fields bookSlot writes", A, () => set(R(C1, S("bookings/bk")), booking({ clientNote: "френч" })));
await t("booking for an inactive master", X, () => set(R(C1, S("bookings/b3")), booking({ id: "b3", masterId: "m3" })));
await t("catalog price for master without override", X, () => set(R(C1, S("bookings/b4")), booking({ id: "b4", price: 450 })));
await t("master with override: master price accepted", A, () => set(R(C1, S("bookings/b5")), booking({ id: "b5", masterId: "m2", price: 450, time: "12:00" })));
await t("master with override: catalog price rejected", X, () => set(R(C1, S("bookings/b6")), booking({ id: "b6", masterId: "m2", price: 500, time: "11:30" })));
await t("booking with paidAmount / paymentStatus / depositAmount", X, async () => { await set(R(C1, S("bookings/b7")), booking({ id: "b7", paidAmount: 500 })); });
await t("booking created as confirmed", X, () => set(R(C1, S("bookings/b8")), booking({ id: "b8", status: "confirmed" })));
await t("booking with createdBy", X, () => set(R(C1, S("bookings/b9")), booking({ id: "b9", createdBy: "admin" })));
await t("booking on behalf of another client", X, () => set(R(C1, S("bookings/b10")), booking({ id: "b10", clientUid: "c2" })));
await t("paymentMethod onsite", A, () => set(R(C1, S("bookings/b11")), booking({ id: "b11", paymentMethod: "onsite", time: "11:00", masterId: "m2", price: 450 })));
await t("release own slots when booking creation failed", A, () => release(C1, "m1", ["slot1000", "slot1030"]));
await t("release a slot claimed by another client", X, async () => { await claim(C2, "c2", "m1", ["slot1100"]); await release(C1, "m1", ["slot1100"]); });
await t("owner-only fields on slots (adminBlocked) untouched by client", X, () => update(R(C1, S(`timeslots/m1/${D}/slot1130`)), { adminBlocked: true }));

console.log("── перенесення");
await t("reschedule booking: rescheduledFrom + rescheduledFromId", A, () => set(R(C1, S("bookings/bk2")), booking({ id: "bk2", time: "11:30", rescheduledFrom: `${D} 10:00`, rescheduledFromId: "bk" })));
await t("cancel old with cancelledBy reschedule", A, () => update(R(C1, S("bookings/bk")), { status: "cancelled", cancelledBy: "reschedule", cancelledAt: NOW }));

console.log("── мої записи: скасування, відвідини, оцінка, нотатка");
await t("cancel own (cancelledBy client)", A, () => update(R(C1, S("bookings/bk2")), { status: "cancelled", cancelledBy: "client", cancelledAt: NOW }));
await t("cancel with cancelledBy admin", X, () => update(R(C1, S("bookings/b11")), { status: "cancelled", cancelledBy: "admin" }));
await t("cancel another client's booking", X, () => update(R(C1, S("bookings/other")), { status: "cancelled", cancelledBy: "client" }));
await t("confirm attendance", A, () => update(R(C1, S("bookings/b11")), { clientConfirmed: true }));
await t("rate", A, () => update(R(C1, S("bookings/b11")), { rating: 5 }));
await t("edit and clear note", A, async () => { await update(R(C1, S("bookings/b11")), { clientNote: "нове" }); await update(R(C1, S("bookings/b11")), { clientNote: null }); });
await t("change price / masterId / date of own booking", X, async () => { await update(R(C1, S("bookings/b11")), { price: 1 }); });
await t("mark own booking paid", X, () => update(R(C1, S("bookings/b11")), { paymentStatus: "paid", paidAmount: 450 }));
await t("delete own booking", X, () => remove(R(C1, S("bookings/b11"))));
await t("list own bookings (query by clientUid)", A, () => get(query(R(C1, S("bookings")), orderByChild("clientUid"), equalTo("c1"))));
await t("list someone else's bookings", X, () => get(query(R(C1, S("bookings")), orderByChild("clientUid"), equalTo("c2"))));
await t("list all bookings", X, () => get(R(C1, S("bookings"))));

console.log("── лист очікування");
await t("join queue", A, async () => { await set(R(C1, S(`queue/m1/${D}_10:00/entries/c1`)), { uid: "c1", durationMin: 60, name: "C1", phone: "+380", addedAt: NOW, status: "waiting" }); await set(R(C1, S(`userQueue/c1/m1_${D}_10:00`)), { masterId: "m1", date: D, time: "10:00", durationMin: 60 }); });
await t("join queue as someone else", X, () => set(R(C1, S(`queue/m1/${D}_10:00/entries/c2`)), { uid: "c2", status: "waiting" }));
await t("read own userQueue and queueOffers", A, async () => { await get(R(C1, S("userQueue/c1"))); await get(R(C1, S("users/c1/queueOffers"))); });
await t("mark queue entry booked and clean offers", A, async () => { await update(R(C1, S(`queue/m1/${D}_10:00/entries/c1`)), { status: "booked" }); await remove(R(C1, S(`userQueue/c1/m1_${D}_10:00`))); await remove(R(C1, S(`users/c1/queueOffers/m1_${D}_10:00`))); });
await t("leave queue", A, () => remove(R(C1, S(`queue/m1/${D}_10:00/entries/c1`))));

console.log("── чат, сповіщення, токени");
await t("salon chat: send + meta (increment)", A, async () => { await push(R(C1, S("chats/c1")), { from: "client", text: "hi", name: "C1", ts: NOW, time: "10:00" }); await update(R(C1, S("chatMeta/c1")), { name: "C1", lastMsg: "hi", lastTs: NOW, unreadForAdmin: increment(1), unreadForClient: 0 }); });
await t("master chat: send + meta", A, async () => { await push(R(C1, S("masterChats/m1/c1")), { from: "client", text: "hi", name: "C1", ts: NOW, time: "10:00" }); await update(R(C1, S("masterChatMeta/m1/c1")), { name: "C1", lastMsg: "hi", lastTs: NOW, unreadForMaster: increment(1), unreadForClient: 0 }); });
await t("chat with a non-existent master", X, () => push(R(C1, S("masterChats/m9/c1")), { from: "client", text: "x" }));
await t("read own threads and metas", A, async () => { await get(query(R(C1, S("chats/c1")), limitToLast(100))); await get(query(R(C1, S("masterChats/m1/c1")), limitToLast(100))); await get(R(C1, S("chatMeta/c1"))); await get(R(C1, S("masterChatMeta/m1/c1"))); });
await t("read another client's chat", X, () => get(R(C1, S("chats/c2"))));
await t("write into another client's chat", X, () => push(R(C1, S("chats/c2")), { from: "client", text: "x" }));
await t("mark read (unreadForClient: 0)", A, () => update(R(C1, S("chatMeta/c1")), { unreadForClient: 0 }));
await t("notifications: read own list", A, () => get(query(R(C1, S("notifications/c1")), limitToLast(60))));
await t("notifications: read someone else's / write own", X, async () => { await get(R(C1, S("notifications/c2"))); });
await t("notifications: write own", X, () => push(R(C1, S("notifications/c1")), { title: "fake" }));
await t("push tokens (users/fcmTokens and clientTokens)", A, async () => { await set(R(C1, S("users/c1/fcmTokens/dev1")), "tok"); await set(R(C1, S("clientTokens/c1/dev1")), "tok"); });
await t("payments node is closed to clients", X, async () => { await get(R(C1, S("payments"))); });
await t("secrets node is closed to clients", X, async () => { await get(R(C1, "salon_secrets/S")); });

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
await env.cleanup();
process.exit(fails ? 1 : 0);
