// Гонка за слоти: кілька клієнтів ОДНОЧАСНО займають той самий / перекривний час реальним клієнтським db.js
// (кожен — власний екземпляр бандла зі своїм Firebase-застосунком і користувачем) проти реальних правил БД.
// Запуск: bash tests/flows/run.sh race
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
const HERE = dirname(fileURLToPath(import.meta.url));
process.env.GCLOUD_PROJECT = "demo-flow";
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "demo-flow", databaseURL: "http://127.0.0.1:9000/?ns=demo-flow-default-rtdb" });
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const req = createRequire(resolve(HERE, "../../functions/index.js"));
const admin = req("firebase-admin");
admin.initializeApp();
const adb = admin.database();

let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };
const pad = (n) => String(n).padStart(2, "0");
const IID = "instRace";
const d = new Date(Date.now() + 7 * 86400000); const D = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const grid = () => { const o = {}; for (let m = 8 * 60; m < 15 * 60; m += 30) o[`slot${pad(m / 60 | 0)}${pad(m % 60)}`] = { time: `${pad(m / 60 | 0)}:${pad(m % 60)}`, available: true }; return o; };
const PRISTINE = grid();
const norm = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)))); // RTDB повертає ключі в іншому порядку

// ── клієнти
const mkClient = async (name) => {
  globalThis.__APPNAME = name;
  const M = await import(`./client.bundle.mjs?${name}`);
  const email = `${name}@t.dev`;
  let uid;
  try { uid = (await createUserWithEmailAndPassword(M.auth, email, "pass123456")).user.uid; } catch { uid = (await signInWithEmailAndPassword(M.auth, email, "pass123456")).user.uid; }
  return { name, M, uid };
};
const clients = [];
for (const n of ["A", "B", "C"]) clients.push(await mkClient(n));
await adb.ref("/").set({ instructors: { [IID]: { license: { status: "active", expiresAt: Date.now() + 30 * 86400000 }, admin_settings: { profile: { name: "I" } },
  users: Object.fromEntries(clients.map((c) => [c.uid, { profile: { name: c.name, phone: "1" } }])) } } });
for (const c of clients) { c.M.setCurrentTenant(IID, "t"); await c.M.getUserProfile(c.uid); }
await new Promise((r) => setTimeout(r, 1500)); // RTDB-з'єднання автентифікується асинхронно
const nameOf = (uid) => clients.find((c) => c.uid === uid)?.name || "?";

const seedDay = async () => { await adb.ref(`instructors/${IID}/timeslots`).set({ [D]: grid() }); await adb.ref(`instructors/${IID}/bookings`).set(null); };
const dayNow = async () => (await adb.ref(`instructors/${IID}/timeslots/${D}`).get()).val() || {};
const mm = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const idsOf = (time, hours) => { const o = []; for (let m = mm(time); m < mm(time) + hours * 60; m += 30) o.push(`slot${pad(m / 60 | 0)}${pad(m % 60)}`); return o; };

// інваріанти після раунду: у кожного переможця його слоти зайняті з його bookedBy; жодного зайнятого слота без переможця; решта як було
const invariants = async (plan, results) => {
  const day = await dayNow(); const problems = [];
  const owned = new Set();
  plan.forEach((p, i) => { if (!results[i]) return; for (const id of idsOf(p.time, p.hours)) { owned.add(id); const s = day[id]; if (!s || s.available !== false || s.bookedBy !== clients[i].uid) problems.push(`${id}: очікували власника ${clients[i].name}, є ${JSON.stringify(s)}`); } });
  for (const [id, s] of Object.entries(day)) if (!owned.has(id) && norm(s) !== norm(PRISTINE[id])) problems.push(`${id}: залишок після програшу ${JSON.stringify(s)}`);
  // переможці не перетинаються
  const winners = plan.map((p, i) => results[i] ? idsOf(p.time, p.hours) : []).filter((a) => a.length);
  const flat = winners.flat(); if (new Set(flat).size !== flat.length) problems.push("двоє переможців мають спільний слот: " + flat.join(","));
  return problems;
};
const race = async (plan) => Promise.all(plan.map((p, i) => clients[i].M.claimSlot(D, p.time, p.hours, 30).catch((e) => "ERR:" + e.message)));

(async () => {
  const ROUNDS = 15;

  console.log(`── 1. Троє захоплюють ОДИН І ТОЙ САМИЙ слот (1 год), ${ROUNDS} раундів`);
  let bad = 0, noWinner = 0; const wins = { A: 0, B: 0, C: 0 };
  for (let r = 0; r < ROUNDS; r++) {
    await seedDay();
    const plan = [{ time: "10:00", hours: 1 }, { time: "10:00", hours: 1 }, { time: "10:00", hours: 1 }];
    const res = await race(plan);
    const w = res.map((x, i) => x === true ? i : -1).filter((i) => i >= 0);
    if (res.some((x) => typeof x === "string")) { bad++; console.log("   ERR", res); continue; }
    if (w.length !== 1) { w.length === 0 ? noWinner++ : bad++; console.log(`   раунд ${r}: переможців ${w.length}`, res); }
    else wins[clients[w[0]].name]++;
    const pr = await invariants(plan, res); if (pr.length) { bad++; console.log("   ", pr.join("\n    ")); }
  }
  check(`рівно один переможець у кожному раунді, без залишків (проблемних раундів: ${bad}, без переможця: ${noWinner})`, bad === 0 && noWinner === 0);
  console.log(`   перемоги: A=${wins.A} B=${wins.B} C=${wins.C}`);

  console.log(`── 2. Перекривні діапазони: A 10:00–11:00, B 10:30–11:30, C 09:30–10:30 (${ROUNDS} раундів)`);
  bad = 0; const outcomes = {};
  for (let r = 0; r < ROUNDS; r++) {
    await seedDay();
    const plan = [{ time: "10:00", hours: 1 }, { time: "10:30", hours: 1 }, { time: "09:30", hours: 1 }];
    const res = await race(plan);
    if (res.some((x) => typeof x === "string")) { bad++; console.log("   ERR", res); continue; }
    const key = res.map((x, i) => x ? clients[i].name : "").join("") || "(ніхто)"; outcomes[key] = (outcomes[key] || 0) + 1;
    const pr = await invariants(plan, res); if (pr.length) { bad++; console.log(`   раунд ${r} [${key}]:\n    ` + pr.join("\n    ")); }
  }
  check(`жодних подвійних слотів і залишків після програшу (проблемних раундів: ${bad})`, bad === 0);
  console.log("   розклад результатів:", JSON.stringify(outcomes));


  console.log("── 2b. Те саме з випадковими затримками 0–40 мс (інші чергування запитів, відкат програвшого проти нового захоплення), 40 раундів");
  bad = 0; const out2 = {};
  for (let r = 0; r < 40; r++) {
    await seedDay();
    const plan = [{ time: "10:00", hours: 1 }, { time: "10:30", hours: 1 }, { time: "10:00", hours: 1.5 }];
    const res = await Promise.all(plan.map(async (p, i) => { await new Promise((ok) => setTimeout(ok, Math.random() * 40)); return clients[i].M.claimSlot(D, p.time, p.hours, 30).catch((e) => "ERR:" + e.message); }));
    if (res.some((x) => typeof x === "string")) { bad++; console.log("   ERR", res); continue; }
    const key = res.map((x, i) => x ? clients[i].name : "").join("") || "(ніхто)"; out2[key] = (out2[key] || 0) + 1;
    const pr = await invariants(plan, res); if (pr.length) { bad++; console.log(`   раунд ${r} [${key}]:\n    ` + pr.join("\n    ")); }
  }
  check(`жодних подвійних слотів і залишків (проблемних раундів: ${bad})`, bad === 0);
  console.log("   розклад результатів:", JSON.stringify(out2));

  console.log("── 3. Не перекриваються (A 10:00, B 11:00, C 12:00) — виграють усі");
  await seedDay();
  const plan3 = [{ time: "10:00", hours: 1 }, { time: "11:00", hours: 1 }, { time: "12:00", hours: 1 }];
  const res3 = await race(plan3);
  check("усі троє отримали свої слоти", res3.every((x) => x === true) && (await invariants(plan3, res3)).length === 0, JSON.stringify(res3));

  console.log("── 4. Повний потік claimSlot → createBooking одночасно (двоє на той самий час)");
  bad = 0;
  for (let r = 0; r < ROUNDS; r++) {
    await seedDay();
    const out = await Promise.all([0, 1].map(async (i) => { const c = clients[i]; if (!(await c.M.claimSlot(D, "13:00", 1, 30))) return null; return c.M.createBooking(c.uid, { date: D, time: "13:00", serviceType: "private", durationHours: 1, price: 600, studentName: c.name, phone: "1" }); }));
    const all = (await adb.ref(`instructors/${IID}/bookings`).get()).val() || {};
    const active = Object.entries(all).flatMap(([uid, bs]) => Object.values(bs).filter((b) => b.status === "pending").map((b) => nameOf(uid)));
    if (out.filter(Boolean).length !== 1 || active.length !== 1) { bad++; console.log(`   раунд ${r}: ключів ${out.filter(Boolean).length}, активних записів ${active.length}`); }
  }
  check(`на одну годину завжди рівно один запис (проблемних раундів: ${bad})`, bad === 0);

  console.log("── 5. Один клієнт двічі підряд тисне «Записатись» (double-click) на той самий час");
  await seedDay();
  const c0 = clients[0]; const dbl = await Promise.all([c0.M.claimSlot(D, "09:00", 1, 30), c0.M.claimSlot(D, "09:00", 1, 30)]);
  check("другий клік не отримує слот вдруге (рівно один true)", dbl.filter((x) => x === true).length === 1, JSON.stringify(dbl));

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
