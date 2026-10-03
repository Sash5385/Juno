import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, get, set, update, remove, runTransaction } from "firebase/database";
import { readFileSync } from "node:fs";
const [EMU_HOST, EMU_PORT_S] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000").split(":");
const EMU_PORT = Number(EMU_PORT_S);
const env = await initializeTestEnvironment({ projectId: "demo-rt", database: { host: EMU_HOST, port: EMU_PORT, rules: readFileSync("database.rules.json", "utf8") } });
const NOW = Date.now(), DAY = 86400000, D = "2026-10-10";
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.database();
  await set(ref(db, "/"), {
    instructors: {
      inst1: {
        license: { status: "active", expiresAt: NOW + 30 * DAY, plan: "monthly", provider: "liqpay" },
        admin_settings: { profile: { name: "I1" } },
        users: { stu1: { profile: { name: "S1" }, isVip: false, discount: 0, hoursOffset: 0, blocked: false, badges: { a: true } }, stuB: { profile: { name: "B" }, blocked: true } },
        timeslots: { [D]: {
          slot1000: { time: "10:00", available: true },
          slot1100: { time: "11:00", available: false, adminBlocked: true },
          slot1200: { time: "12:00", available: false, phantom: true },
          slot1300: { time: "13:00", available: true, vipOnly: true, surcharge: 100, durMin: 120 },
        } },
        bookings: {},
      },
      inst2: { users: { stuX: { profile: { name: "X" } } } },
      inst3: {},
    },
  });
});
const as = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).database();
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
await t("student claims free slot", A, () => update(R(S1, P + "/slot1000"), { available: false, bookingStart: true }));
const tx = async (db, path, fn) => { await get(R(db, path)); const r = await runTransaction(R(db, path), fn); if (!r.committed) throw new Error("not committed"); };
await t("student claims slot via runTransaction (client claimSlot)", A, () => tx(S1, P + "/slot1000", (cur) => ({ ...cur, available: false, bookingStart: true })));
await t("student claims vip+surcharge slot via runTransaction keeping fields", A, () => tx(S1, P + "/slot1300", (cur) => ({ ...cur, available: false })));
await t("student runTransaction that drops admin fields", X, () => tx(S1, P + "/slot1300", (cur) => { const { vipOnly, surcharge, ...rest } = cur; return { ...rest, available: true }; }));
await t("student runTransaction that changes durMin", X, () => tx(S1, P + "/slot1300", (cur) => ({ ...cur, durMin: 30 })));
await t("student releases slot (restoreRange style)", A, () => update(R(S1, P), { "slot1000/available": true, "slot1000/time": "10:00", "slot1000/phantom": null, "slot1000/bookingStart": null }));
await t("student sets viewing", A, () => set(R(S1, P + "/slot1000/viewing/stu1"), 1234));
await t("authed user w/o profile sets viewing", A, () => set(R(SNEW.constructor === Object ? SNEW : as("stuNobody"), P + "/slot1000/viewing/stuNobody"), 1));
await t("student unblocks admin-blocked slot", X, () => update(R(S1, P + "/slot1100"), { adminBlocked: false, available: true }));
await t("student deletes adminBlocked flag", X, () => remove(R(S1, P + "/slot1100/adminBlocked")));
await t("student removes vipOnly", X, () => remove(R(S1, P + "/slot1300/vipOnly")));
await t("student changes surcharge", X, () => set(R(S1, P + "/slot1300/surcharge"), 0));
await t("student changes durMin", X, () => set(R(S1, P + "/slot1300/durMin"), 30));
await t("student deletes real slot", X, () => remove(R(S1, P + "/slot1000")));
await t("student deletes phantom slot", A, () => remove(R(S1, P + "/slot1200")));
await t("student creates fake free slot", X, () => set(R(S1, P + "/slot2300"), { time: "23:00", available: true }));
await t("student creates phantom block", A, () => update(R(S1, P), { "slot0930/phantom": true, "slot0930/available": false, "slot0930/time": "09:30" }));
await t("student of OTHER instructor claims slot", X, () => update(R(SX, P + "/slot1000"), { available: false }));
await t("multi-path booking + slot claim (root of instructor)", A, () => update(R(S1, "instructors/inst1"), { "bookings/stu1/b1": { id: "b1", date: D }, [`timeslots/${D}/slot1000/available`]: false, [`timeslots/${D}/slot1000/bookingStart`]: true }));
await t("instructor edits vipOnly/durMin", A, () => update(R(I1, P + "/slot1300"), { vipOnly: false, durMin: 60, surcharge: 200 }));
await t("instructor removes a slot", A, () => remove(R(I1, P + "/slot1100")));
await t("instructor removes whole day", A, () => remove(R(I1, P)));
await t("anonymous write", X, () => set(R(anon, P + "/slot1000/available"), false));
await t("anonymous read", A, () => get(R(anon, P)));
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
await env.cleanup();
process.exit(fails ? 1 : 0);
