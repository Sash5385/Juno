// Гонка за слот: N клієнтів одночасно захоплюють один слот тією ж транзакцією, що claimSlot у клієнті
// (Juno-client/src/firebase/db.js). Очікування: рівно один committed, bookedBy = переможець; плюс 2-годинні
// записи, що перетинаються, не можуть обидва забрати спільний слот.
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, set, get, runTransaction } from "firebase/database";
import { readFileSync } from "fs";
const N = +process.env.RACE_N || 100;
const env = await initializeTestEnvironment({ projectId: "demo-rt", database: { rules: readFileSync("database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 } });
const D = "2030-01-15";
const users = {}; for (let i = 0; i < N; i++) users[`c${i}`] = { profile: { name: `C${i}` } };
await env.withSecurityRulesDisabled(async (ctx) => {
  await set(ref(ctx.database(), "/"), { instructors: { inst1: {
    license: { status: "active", expiresAt: Date.now() + 864e5 * 30, plan: "monthly", provider: "liqpay" },
    users, timeslots: { [D]: { slot1000: { time: "10:00", available: true }, slot1030: { time: "10:30", available: true }, slot1100: { time: "11:00", available: true }, slot1130: { time: "11:30", available: true } } },
  } } });
});
const claimTx = (uid, slotH) => (current) => {
  if (current && current.available === false) return undefined;
  return { ...(current || {}), ...(current ? {} : { phantom: true }), available: false, time: slotH, bookedBy: uid };
};
let fails = 0; const ok = (c, m) => { console.log(`${c ? "ok  " : "FAIL"} ${m}`); if (!c) fails++; };
// 1) N клієнтів на один слот
const dbs = Array.from({ length: N }, (_, i) => env.authenticatedContext(`c${i}`).database());
const res = await Promise.all(dbs.map((db, i) => runTransaction(ref(db, `instructors/inst1/timeslots/${D}/slot1000`), claimTx(`c${i}`, "10:00")).then(r => r.committed ? i : -1).catch(() => -1)));
const winners = res.filter(i => i >= 0);
let snap; await env.withSecurityRulesDisabled(async (ctx) => { snap = (await get(ref(ctx.database(), `instructors/inst1/timeslots/${D}/slot1000`))).val(); });
ok(winners.length === 1, `${N} клієнтів на слот 10:00 → переможців ${winners.length}`);
ok(snap && snap.available === false && snap.bookedBy === `c${winners[0]}`, `слот зайнятий переможцем (bookedBy=${snap?.bookedBy})`);
// 2) два 2-годинні записи, що перетинаються (11:00–12:00 і 11:30–12:30): спільний слот 11:30 бере лише один
const claimRange = async (db, uid, slots) => { for (const s of slots) { const r = await runTransaction(ref(db, `instructors/inst1/timeslots/${D}/${s}`), claimTx(uid, s)); if (!r.committed) return false; } return true; };
const [a, b] = await Promise.all([claimRange(dbs[1], "c1", ["slot1100", "slot1130"]), claimRange(dbs[2], "c2", ["slot1130", "slot1200"])]);
ok(!(a && b), `перетин 11:30: обидва записи не пройшли одночасно (c1=${a}, c2=${b})`);
console.log(fails ? `RACE FAILED (${fails})` : "RACE OK");
await env.cleanup(); process.exit(fails ? 1 : 0);
