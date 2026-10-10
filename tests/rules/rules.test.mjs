import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, get, set, update, remove, runTransaction } from "firebase/database";
import { readFileSync } from "node:fs";
const [EMU_HOST, EMU_PORT_S] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000").split(":");
const EMU_PORT = Number(EMU_PORT_S);
const env = await initializeTestEnvironment({ projectId: "demo-rt", database: { host: EMU_HOST, port: EMU_PORT, rules: readFileSync("database.rules.json", "utf8") } });
const NOW = Date.now(), DAY = 86400000, D = "2026-10-10";
const SLOTS = {
          slot1000: { time: "10:00", available: true },
          slot1100: { time: "11:00", available: false, adminBlocked: true },
          slot1200: { time: "12:00", available: false, phantom: true, bookedBy: "stu1" },
          slot1400: { time: "14:00", available: false, bookedBy: "stu1" },
          slot1500: { time: "15:00", available: false },
          slot1600: { time: "16:00", available: false, bookedBy: "stuB" },
          slot1700: { time: "17:00", available: true, reservedFor: "stuB", reservedUntil: NOW + DAY },
          slot1800: { time: "18:00", available: true, reservedFor: "stuB", reservedUntil: NOW - 1000 },
          slot1900: { time: "19:00", available: true, reservedFor: "stu1", reservedUntil: NOW + DAY, offeredTo: { stu1: true, stuB: true } },
          slot2000: { time: "20:00", available: false, phantom: true, bookedBy: "stuB" },
          slot1300: { time: "13:00", available: true, vipOnly: true, surcharge: 100, durMin: 120 },
};
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.database();
  await set(ref(db, "/"), {
    instructors: {
      inst1: {
        license: { status: "active", expiresAt: NOW + 30 * DAY, plan: "monthly", provider: "liqpay" },
        admin_settings: { profile: { name: "I1" } },
        users: { stu1: { profile: { name: "S1" }, isVip: false, discount: 0, hoursOffset: 0, blocked: false, badges: { a: true } }, stuB: { profile: { name: "B" }, blocked: true } },
        timeslots: { [D]: SLOTS },
        bookings: {},
      },
      inst2: { users: { stuX: { profile: { name: "X" } } } },
      inst3: {},
    },
  });
});
const as = (uid, email, verified = true) => env.authenticatedContext(uid, email ? { email, email_verified: verified } : {}).database();
const anon = env.unauthenticatedContext().database();
const I1 = as("inst1"), I3 = as("inst3"), OWNER = as("ownerUid", "sash5385@gmail.com");
const S1 = as("stu1"), SX = as("stuX"), SNEW = as("stuNew");
const R = (db, p) => ref(db, p);
let fails = 0;
async function t(name, expect, fn) {
  let ok;
  try { await fn(); ok = true } catch (e) { ok = false }
  const pass = (expect === "ALLOW") === ok;
  if (!pass) fails++;
  console.log(`${pass ? "ok  " : "FAIL"} ${expect === "ALLOW" ? "ALLOW" : "DENY "} ${name}${pass ? "" : "   <-- got " + (ok ? "ALLOW" : "DENY")}`);
}
const A = "ALLOW", X = "DENY";
console.log("── LICENSE");
await t("instructor removes own license", X, () => remove(R(I1, "instructors/inst1/license")));
await t("instructor deletes license/expiresAt", X, () => remove(R(I1, "instructors/inst1/license/expiresAt")));
await t("instructor deletes license/status", X, () => remove(R(I1, "instructors/inst1/license/status")));
await t("instructor removes whole own node", X, () => remove(R(I1, "instructors/inst1")));
await t("instructor sets status active", X, () => set(R(I1, "instructors/inst1/license/status"), "active"));
await t("instructor extends expiresAt", X, () => set(R(I1, "instructors/inst1/license/expiresAt"), NOW + 999 * DAY));
await t("new instructor creates 14-day trial (registration multi-path)", A, () => update(R(I3, "instructors/inst3"), { "admin_settings/profile": { name: "N", slug: "n" }, "license/status": "trial", "license/trialEndsAt": NOW + 14 * DAY }));
await t("owner with UNVERIFIED email cannot set license", X, () => update(R(as("fakeOwner", "sash5385@gmail.com", false), "instructors/inst1/license"), { status: "active", expiresAt: Date.now() + 86400000 }));
await t("owner sets license active", A, () => update(R(OWNER, "instructors/inst1/license"), { status: "active", expiresAt: NOW + 60 * DAY, provider: "manual" }));
await t("instructor writes admin_settings", A, () => set(R(I1, "instructors/inst1/admin_settings/workStart"), 9));
await t("instructor reads own license", A, () => get(R(I1, "instructors/inst1/license")));
await t("student cannot read license", X, () => get(R(S1, "instructors/inst1/license")));
console.log("── LICENSE: trial abuse (fresh instructor)");
await env.withSecurityRulesDisabled(async (c) => { await remove(ref(c.database(), "instructors/inst3")); });
await t("trial 365 days at creation", X, () => update(R(I3, "instructors/inst3"), { "license/status": "trial", "license/trialEndsAt": NOW + 365 * DAY }));
await env.withSecurityRulesDisabled(async (c) => { await remove(ref(c.database(), "instructors/inst3")); });
await t("trial 14 days at creation", A, () => update(R(I3, "instructors/inst3"), { "license/status": "trial", "license/trialEndsAt": NOW + 14 * DAY }));
await t("then delete trial and recreate", X, async () => { await remove(R(I3, "instructors/inst3/license")); });
console.log("── USERS");
await t("student sets own isVip", X, () => set(R(S1, "instructors/inst1/users/stu1/isVip"), true));
await t("student sets own discount", X, () => set(R(S1, "instructors/inst1/users/stu1/discount"), 500));
await t("student sets hoursOffset 40", X, () => set(R(S1, "instructors/inst1/users/stu1/hoursOffset"), 40));
await t("blocked student clears blocked", X, () => remove(R(as("stuB"), "instructors/inst1/users/stuB/blocked")));
await t("student edits badges", X, () => set(R(S1, "instructors/inst1/users/stu1/badges/b"), true));
await t("student edits own profile", A, () => update(R(S1, "instructors/inst1/users/stu1/profile"), { name: "S1x" }));
await t("student sets own profile photo (small jpeg data-url)", A, () => update(R(S1, "instructors/inst1/users/stu1/profile"), { photo: "data:image/jpeg;base64," + "A".repeat(8000) }));
await t("student photo too large", X, () => update(R(S1, "instructors/inst1/users/stu1/profile"), { photo: "data:image/jpeg;base64," + "A".repeat(40000) }));
await t("student photo not an image", X, () => update(R(S1, "instructors/inst1/users/stu1/profile"), { photo: "http://evil.example/x" }));
await t("student removes own photo", A, () => update(R(S1, "instructors/inst1/users/stu1/profile"), { photo: null }));
await t("student sets welcomeSent (update on user node)", A, () => update(R(S1, "instructors/inst1/users/stu1"), { welcomeSent: true }));
await t("student saves fcm token", A, () => set(R(S1, "instructors/inst1/users/stu1/fcmTokens/dev1"), "tok"));
await t("student sets internalExam/passed", A, () => set(R(S1, "instructors/inst1/users/stu1/internalExam/passed"), true));
await t("student queueOffers cleanup", A, () => remove(R(S1, "instructors/inst1/users/stu1/queueOffers/k")));
await t("new student registers (creates users/uid/profile)", A, () => set(R(SNEW, "instructors/inst1/users/stuNew/profile"), { name: "New", phone: "1" }));
await t("student reads own user", A, () => get(R(S1, "instructors/inst1/users/stu1")));
await t("other student cannot write user", X, () => update(R(SX, "instructors/inst1/users/stu1/profile"), { name: "hack" }));
await t("other student cannot read user", X, () => get(R(SX, "instructors/inst1/users/stu1")));
await t("instructor sets student isVip", A, () => set(R(I1, "instructors/inst1/users/stu1/isVip"), true));
await t("instructor sets student discount", A, () => set(R(I1, "instructors/inst1/users/stu1/discount"), 50));
console.log("── TIMESLOTS");
const P = `instructors/inst1/timeslots/${D}`;
await t("student claims free slot (bookedBy = self)", A, () => update(R(S1, P + "/slot1000"), { available: false, bookingStart: true, bookedBy: "stu1" }));
const tx = async (db, path, fn) => { await get(R(db, path)); const r = await runTransaction(R(db, path), fn); if (!r.committed) throw new Error("not committed"); };
await t("student claims slot via runTransaction (client claimSlot)", A, () => tx(S1, P + "/slot1000", (cur) => ({ ...cur, available: false, bookingStart: true, bookedBy: "stu1" })));
await t("student claims vip+surcharge slot via runTransaction keeping fields", A, () => tx(S1, P + "/slot1300", (cur) => ({ ...cur, available: false, bookedBy: "stu1" })));
await t("student runTransaction that drops admin fields", X, () => tx(S1, P + "/slot1300", (cur) => { const { vipOnly, surcharge, ...rest } = cur; return { ...rest, available: true }; }));
await t("student runTransaction that changes durMin", X, () => tx(S1, P + "/slot1300", (cur) => ({ ...cur, durMin: 30 })));
await t("student releases slot (restoreRange style)", A, () => update(R(S1, P), { "slot1000/available": true, "slot1000/time": "10:00", "slot1000/phantom": null, "slot1000/bookingStart": null, "slot1000/bookedBy": null }));
await t("student sets viewing", A, () => set(R(S1, P + "/slot1000/viewing/stu1"), 1234));
await t("authed user w/o profile sets viewing", A, () => set(R(SNEW.constructor === Object ? SNEW : as("stuNobody"), P + "/slot1000/viewing/stuNobody"), 1));
await t("student unblocks admin-blocked slot", X, () => update(R(S1, P + "/slot1100"), { adminBlocked: false, available: true }));
await t("student deletes adminBlocked flag", X, () => remove(R(S1, P + "/slot1100/adminBlocked")));
await t("student removes vipOnly", X, () => remove(R(S1, P + "/slot1300/vipOnly")));
await t("student changes surcharge", X, () => set(R(S1, P + "/slot1300/surcharge"), 0));
await t("student changes durMin", X, () => set(R(S1, P + "/slot1300/durMin"), 30));
await t("student deletes real slot", X, () => remove(R(S1, P + "/slot1000")));
await t("student deletes OWN phantom slot", A, () => remove(R(S1, P + "/slot1200")));
await t("student deletes someone else's phantom slot", X, () => remove(R(S1, P + "/slot2000")));
await t("student creates fake free slot", X, () => set(R(S1, P + "/slot2300"), { time: "23:00", available: true }));
await t("student creates phantom block", A, () => update(R(S1, P), { "slot0930/phantom": true, "slot0930/available": false, "slot0930/time": "09:30" }));
await t("student of OTHER instructor claims slot", X, () => update(R(SX, P + "/slot1000"), { available: false }));
await t("multi-path booking + slot claim (root of instructor)", A, () => update(R(S1, "instructors/inst1"), { "bookings/stu1/b1": { id: "b1", date: D, status: "pending" }, [`timeslots/${D}/slot1000/available`]: false, [`timeslots/${D}/slot1000/bookingStart`]: true, [`timeslots/${D}/slot1000/bookedBy`]: "stu1" }));
await t("instructor edits vipOnly/durMin", A, () => update(R(I1, P + "/slot1300"), { vipOnly: false, durMin: 60, surcharge: 200 }));
await t("instructor removes a slot", A, () => remove(R(I1, P + "/slot1100")));
await t("instructor removes whole day", A, () => remove(R(I1, P)));
await t("anonymous write", X, () => set(R(anon, P + "/slot1000/available"), false));
await t("anonymous read", A, () => get(R(anon, P)));
console.log("── TIMESLOTS: ownership of taken slots");
await env.withSecurityRulesDisabled(async (c) => { await set(ref(c.database(), P), SLOTS); });
await t("student claims with someone else's bookedBy", X, () => update(R(S1, P + "/slot1000"), { available: false, bookedBy: "stuB" }));
await t("student releases slot taken by another student", X, () => update(R(S1, P + "/slot1600"), { available: true, bookedBy: null }));
await t("student overwrites another student's taken slot", X, () => set(R(S1, P + "/slot1600"), { time: "16:00", available: false, bookedBy: "stu1" }));
await t("student takes over another's slot (bookedBy=self)", X, () => update(R(S1, P + "/slot1600"), { bookedBy: "stu1" }));
await t("student releases taken slot with no owner (legacy)", X, () => update(R(S1, P + "/slot1500"), { available: true }));
await t("student releases OWN taken slot", A, () => update(R(S1, P + "/slot1400"), { available: true, bookedBy: null }));
await t("student claims slot reserved for another student", X, () => update(R(S1, P + "/slot1700"), { available: false, bookedBy: "stu1" }));
await t("student claims slot whose reservation expired", A, () => update(R(S1, P + "/slot1800"), { available: false, bookedBy: "stu1" }));
await t("student claims own reserved slot + clears markers (claimReservedSlot)", A, () => update(R(S1, "instructors/inst1"), { [`timeslots/${D}/slot1900/available`]: false, [`timeslots/${D}/slot1900/bookedBy`]: "stu1", [`timeslots/${D}/slot1900/offeredTo/stu1`]: null, [`timeslots/${D}/slot1900/reservedFor`]: null, [`timeslots/${D}/slot1900/reservedUntil`]: null }));
await t("student removes another student's reservation", X, () => remove(R(S1, P + "/slot1700/reservedFor")));
console.log("── GROUP SEATS (групові записи)");
const GS = "instructors/inst1/groupSeats/" + D + "/1000";
await t("student creates group (count 1)", A, () => set(R(S1, GS), { serviceId: "g1", capacity: 3, count: 1, seats: { b1: "stu1" } }));
await t("student reads group seats", A, () => get(R(S1, GS)));
await t("student joins group (+1, own uid)", A, () => update(R(SNEW, "instructors/inst1/groupSeats/" + D), { "1000": { serviceId: "g1", capacity: 3, count: 2, seats: { b1: "stu1", b2: "stuNew" } } }));
await t("student overfills group (count > capacity)", X, () => set(R(S1, GS), { serviceId: "g1", capacity: 3, count: 4, seats: { b1: "stu1", b2: "stuNew", b3: "x", b4: "y" } }));
await t("student lowers count (frees seats)", X, () => set(R(S1, GS), { serviceId: "g1", capacity: 3, count: 1, seats: { b1: "stu1" } }));
await t("student joins with foreign uid in seat", X, () => set(R(S1, GS), { serviceId: "g1", capacity: 3, count: 3, seats: { b1: "stu1", b2: "stuNew", b3: "someoneElse" } }));
await t("student raises capacity", X, () => set(R(S1, GS), { serviceId: "g1", capacity: 30, count: 3, seats: { b1: "stu1", b2: "stuNew", b3: "stu1" } }));
await t("student deletes group", X, () => remove(R(S1, GS)));
await t("student creates group with capacity 99", X, () => set(R(S1, "instructors/inst1/groupSeats/" + D + "/1100"), { serviceId: "g1", capacity: 99, count: 1, seats: { b1: "stu1" } }));
await t("student of other instructor reads seats", X, () => get(R(SX, GS)));
await t("instructor edits group seats", A, () => set(R(I1, GS), { serviceId: "g1", capacity: 3, count: 1, seats: { b1: "stu1" } }));
await t("student creates booking with groupKey", A, () => set(R(S1, "instructors/inst1/bookings/stu1/grpb"), { id: "grpb", date: D, time: "10:00", status: "pending", durationHours: 1, studentName: "S1", phone: "1", groupKey: D + "_1000", groupCap: 3, createdAt: NOW }));
console.log("── PACKAGES (пакети клієнта)");
await env.withSecurityRulesDisabled(async (c) => { await set(ref(c.database(), "instructors/inst1/users/stu1/packages/p1"), { id: "p1", name: "5", total: 5, createdAt: 1 }); });
await t("student reads own packages", A, () => get(R(S1, "instructors/inst1/users/stu1/packages")));
await t("student adds package to himself", X, () => set(R(S1, "instructors/inst1/users/stu1/packages/p2"), { id: "p2", name: "free", total: 99 }));
await t("student raises total of own package", X, () => update(R(S1, "instructors/inst1/users/stu1/packages/p1"), { total: 500 }));
await t("student clears package uses", X, () => remove(R(S1, "instructors/inst1/users/stu1/packages/p1/uses")));
await t("instructor adds package to student", A, () => set(R(I1, "instructors/inst1/users/stu1/packages/p3"), { id: "p3", name: "10", total: 10, createdAt: 2 }));
await t("student creates booking with packageId/packageUseId", A, () => set(R(S1, "instructors/inst1/bookings/stu1/pkgb"), { id: "pkgb", date: D, time: "10:00", status: "pending", durationHours: 1, studentName: "S1", phone: "1", packageId: "p1", packageName: "5", packageUseId: "old", createdAt: NOW }));
await t("student sets packageUsed himself", X, () => set(R(S1, "instructors/inst1/bookings/stu1/pkgb2"), { id: "pkgb2", date: D, time: "10:00", status: "pending", packageUsed: true }));
console.log("── INTAKE (анкета клієнта)");
const ITEM = { id: "a", label: "Алергії", value: "Немає" };
await t("student saves own intake", A, () => set(R(S1, "instructors/inst1/users/stu1/intake"), { at: NOW, items: [ITEM, { id: "b", label: "Тип", value: "Суха" }] }));
await t("student intake with too long value", X, () => set(R(S1, "instructors/inst1/users/stu1/intake"), { at: NOW, items: [{ ...ITEM, value: "x".repeat(501) }] }));
await t("student intake with extra field in item", X, () => set(R(S1, "instructors/inst1/users/stu1/intake"), { at: NOW, items: [{ ...ITEM, evil: 1 }] }));
await t("student intake with extra top-level key", X, () => set(R(S1, "instructors/inst1/users/stu1/intake"), { at: NOW, items: [ITEM], isVip: true }));
await t("student intake with 100 items (index limit)", X, () => set(R(S1, "instructors/inst1/users/stu1/intake"), { at: NOW, items: Array.from({ length: 100 }, () => ITEM) }));
await t("student writes another student's intake", X, () => set(R(S1, "instructors/inst1/users/stuX/intake"), { at: NOW, items: [ITEM] }));
await t("instructor reads student's intake", A, () => get(R(I1, "instructors/inst1/users/stu1/intake")));
console.log("── BOOKINGS (student)");
const B = "instructors/inst1/bookings/stu1";
await env.withSecurityRulesDisabled(async (c) => { const d = c.database(); await set(ref(d, B + "/own"), { id: "own", date: D, time: "10:00", status: "confirmed", price: 600, durationHours: 1, debtAmount: 600, tag: "x", createdBy: "admin", studentName: "S1" }); await set(ref(d, "instructors/inst1/bookings/stuX/other"), { id: "other", date: D, time: "11:00", status: "pending", price: 600 }); });
await t("student creates pending booking with price (client flow)", A, () => set(R(S1, B + "/new1"), { id: "new1", date: D, time: "10:00", status: "pending", price: 600, surcharge: 0, durationHours: 1, studentName: "S1", phone: "1", serviceType: "school", createdAt: NOW }));
await t("student creates booking with add-ons + buffer (service picker flow)", A, () => set(R(S1, B + "/new5"), { id: "new5", date: D, time: "10:00", status: "pending", price: 750, surcharge: 0, durationHours: 1.25, studentName: "S1", phone: "1", serviceType: "school", serviceId: "sv1", serviceName: "Манікюр", addons: [{ id: "a1", name: "Покриття", price: 150, minutes: 15 }], addonsPrice: 150, bufferMin: 15, createdAt: NOW }));
await t("student creates booking as confirmed", X, () => set(R(S1, B + "/new2"), { id: "new2", date: D, time: "10:00", status: "confirmed", price: 600 }));
await t("student creates booking with createdBy", X, () => set(R(S1, B + "/new3"), { id: "new3", status: "pending", createdBy: "admin" }));
await t("student creates booking with debtAmount", X, () => set(R(S1, B + "/new4"), { id: "new4", status: "pending", debtAmount: 0 }));
await t("student sets bufferMin on existing booking", X, () => update(R(S1, B + "/own"), { bufferMin: 0 }));
await t("student sets addonsPrice on existing booking", X, () => update(R(S1, B + "/own"), { addonsPrice: 1 }));
await t("student adds addons to existing booking", X, () => update(R(S1, B + "/own"), { addons: [{ id: "a1", name: "x", price: 0, minutes: 0 }] }));
await t("student lowers price on own booking", X, () => update(R(S1, B + "/own"), { price: 1 }));
await t("student deletes price on own booking", X, () => remove(R(S1, B + "/own/price")));
await t("student clears debtAmount", X, () => remove(R(S1, B + "/own/debtAmount")));
await t("student sets debtAmount 0", X, () => update(R(S1, B + "/own"), { debtAmount: 0 }));
await t("student changes status to completed", X, () => update(R(S1, B + "/own"), { status: "completed" }));
await t("student changes booking date", X, () => update(R(S1, B + "/own"), { date: "2026-12-12" }));
await t("student deletes own booking", X, () => remove(R(S1, B + "/own")));
await t("student overwrites own booking via set (drops fields)", X, () => set(R(S1, B + "/own"), { id: "own", status: "pending" }));
await t("student writes foreign booking", X, () => update(R(S1, "instructors/inst1/bookings/stuX/other"), { price: 1 }));
await t("student of other instructor writes booking", X, () => set(R(SX, "instructors/inst1/bookings/stuX/newz"), { id: "newz", status: "pending" }));
await t("student confirms attendance", A, () => update(R(S1, B + "/own"), { studentConfirmed: true }));
await t("student rates", A, () => update(R(S1, B + "/own"), { rating: 5 }));
await t("student saves goals then clears", A, async () => { await update(R(S1, B + "/own"), { goals: ["a"] }); await update(R(S1, B + "/own"), { goals: null }); });
await t("student saves note", A, () => update(R(S1, B + "/own"), { studentNote: "hi" }));
await t("student cancels (cancelBooking)", A, () => update(R(S1, B + "/own"), { status: "cancelled", cancelledAt: NOW, cancelledBy: "student" }));
await t("student cancels as reschedule", A, () => update(R(S1, B + "/new1"), { status: "cancelled", cancelledAt: NOW, cancelledBy: "reschedule" }));
await t("student sets cancelledBy admin", X, () => update(R(S1, B + "/new1"), { cancelledBy: "admin" }));
await t("instructor edits student booking", A, () => update(R(I1, B + "/own"), { price: 700, status: "completed", debtAmount: 0 }));
await t("instructor deletes student booking", A, () => remove(R(I1, B + "/own")));
await t("student reads own bookings", A, () => get(R(S1, B)));
await t("other student reads bookings", X, () => get(R(SX, B)));
console.log("── REVIEWS");
await t("student writes fake review", X, () => set(R(S1, "instructors/inst1/reviews/stu1/r1"), { text: "great", approved: true }));
await t("instructor writes review", A, () => set(R(I1, "instructors/inst1/reviews/stu1/r1"), { text: "ok", approved: true }));
await t("anonymous reads reviews", A, () => get(R(anon, "instructors/inst1/reviews")));
console.log("── SYSTEM (error log)");
await t("instructor reads system/errorLog", X, () => get(R(I1, "system/errorLog")));
await t("anonymous writes system/errorLog", X, () => set(R(anon, "system/errorLog/x"), { message: "spam" }));
await t("student writes system/errorLog", X, () => set(R(S1, "system/errorLog/x"), { message: "spam" }));
await t("owner reads and clears system/errorLog", A, async () => { await get(R(OWNER, "system/errorLog")); await remove(R(OWNER, "system/errorLog")); });
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
await env.cleanup();
process.exit(fails ? 1 : 0);
