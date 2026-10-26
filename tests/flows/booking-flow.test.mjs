// Запуск: bash tests/flows/run.sh  (потрібні firebase-tools, Java і клонований Juno-client поруч або CLIENT_DIR=...)
// Наскрізний тест записів/скасувань/переносів: РЕАЛЬНИЙ клієнтський db.js (бандл) + РЕАЛЬНІ правила БД
// + серверна onBookingChanged (виклик вручну після кожної зміни запису) на емуляторах Database+Auth.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const JUNO = resolve(HERE, "../..");
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, update, get } from "firebase/database";

process.env.GCLOUD_PROJECT = "demo-flow";
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "demo-flow", databaseURL: "http://127.0.0.1:9000/?ns=demo-flow-default-rtdb" });
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const req = createRequire(resolve(JUNO, "functions/index.js"));
const admin = req("firebase-admin");
const fns = req(resolve(JUNO, "functions/index.js"));
const C = await import("./client.bundle.mjs");
const adb = admin.database();

let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };

// ── користувачі (Auth-емулятор)
const mkUser = async (auth, email) => { try { return (await createUserWithEmailAndPassword(auth, email, "pass123456")).user.uid; } catch { return (await signInWithEmailAndPassword(auth, email, "pass123456")).user.uid; } };
const instApp = initializeApp({ apiKey: "x", projectId: "demo-flow", databaseURL: "https://demo-flow-default-rtdb.firebaseio.com" }, "inst");
const instAuth = getAuth(instApp); connectAuthEmulator(instAuth, "http://127.0.0.1:9099", { disableWarnings: true });
const instDb = getDatabase(instApp); connectDatabaseEmulator(instDb, "127.0.0.1", 9000);
const IID = await mkUser(instAuth, "inst@t.dev");
const UA = await mkUser(C.auth, "a@t.dev");
const UB = await mkUser(C.auth, "b@t.dev");
const loginAs = async (email) => { await signInWithEmailAndPassword(C.auth, email, "pass123456"); await new Promise((r) => setTimeout(r, 1000)); }; // RTDB-з'єднання перевіряється під новим токеном асинхронно

// ── дані
const pad = (n) => String(n).padStart(2, "0");
const dateIn = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const D1 = dateIn(7), D2 = dateIn(8), D3 = dateIn(9);
const grid = (step) => { const o = {}; for (let m = 9 * 60; m < 14 * 60; m += step) o[`slot${pad(m / 60 | 0)}${pad(m % 60)}`] = { time: `${pad(m / 60 | 0)}:${pad(m % 60)}`, available: true }; return o; };
const seedDays = async () => {
  await adb.ref(`instructors/${IID}/timeslots`).set({ [D1]: grid(30), [D2]: grid(60), [D3]: grid(30) });
  await adb.ref(`instructors/${IID}/bookings`).set(null);
};
const seed = async () => {
  await adb.ref("/").set({ instructors: { [IID]: {
    license: { status: "active", expiresAt: Date.now() + 30 * 86400000 },
    admin_settings: { profile: { name: "I" } },
    users: { [UA]: { profile: { name: "A", phone: "1" } }, [UB]: { profile: { name: "B", phone: "2" } } },
  } } });
  await seedDays();
};
const day = async (d) => { const v = (await adb.ref(`instructors/${IID}/timeslots/${d}`).get()).val() || {}; return v; };
const clean = (v) => Object.fromEntries(Object.entries(v).map(([k, s]) => { const { lastChangedBy, lastChangedAt, ...r } = s; return [k, r]; }));
const show = (v) => Object.entries(v).filter(([, s]) => s.available === false || s.bookedBy || s.phantom).map(([k, s]) => `${k.slice(4)}:${s.available === false ? "X" : "."}${s.phantom ? "P" : ""}${s.bookedBy ? "<" + (s.bookedBy === UA ? "A" : s.bookedBy === UB ? "B" : "?") : ""}`).join(" ") || "(all free)";
const bk = async (uid, id) => (await adb.ref(`instructors/${IID}/bookings/${uid}/${id}`).get()).val();
const fire = async (uid, id, before, after) => { await fns.onBookingChanged.run({ data: { before: { val: () => before }, after: { val: () => after } }, params: { iid: IID, uid, bookingId: id } }); };
// дія над записом + спрацювання серверного тригера, як у проді
const act = async (uid, id, fn) => { const before = await bk(uid, id); const r = await fn(); const after = await bk(uid, id); await fire(uid, id, before, after); return r; };

console.log("admin ns:", adb.ref().toString());
C.setCurrentTenant(IID, "t");
const book = async (uid, date, time, hours, extra = {}) => {
  const ok = await C.claimSlot(date, time, hours, 30);
  if (!ok) return null;
  const key = await C.createBooking(uid, { date, time, serviceType: "private", serviceName: "Приватний", durationHours: hours, price: 600 * hours, studentName: "X", phone: "1", ...extra });
  await fire(uid, key, null, await bk(uid, key));
  return key;
};

// ── репліка адмін-логіки з Juno/src/App.jsx (blockSlots / freeSlots / скасування / перенесення)
const adminCtx = async (d) => { const dd = await day(d); return new Set(Object.entries(dd).filter(([, s]) => !s.phantom).map(([, s]) => s.time)); };
const aBlock = (upd, date, startMin, durMin, exists, onlyExisting = false) => {
  for (let cur = startMin; cur < startMin + durMin; cur += 30) {
    const t = `${pad(cur / 60 | 0)}:${pad(cur % 60)}`; if (onlyExisting && !exists.has(t)) continue;
    const key = `timeslots/${date}/slot${pad(cur / 60 | 0)}${pad(cur % 60)}`;
    if (!exists.has(t)) upd[`${key}/phantom`] = true;
    upd[`${key}/available`] = false; upd[`${key}/time`] = t; upd[`${key}/lastChangedBy`] = "admin";
    if (!process.env.STALE) upd[`${key}/bookedBy`] = null; // виправлення: адмін не лишає чужий bookedBy
  }
};
const aFree = (upd, date, startMin, durMin, exists) => {
  for (let cur = startMin; cur < startMin + durMin; cur += 30) {
    const t = `${pad(cur / 60 | 0)}:${pad(cur % 60)}`; const key = `timeslots/${date}/slot${pad(cur / 60 | 0)}${pad(cur % 60)}`;
    if (exists.has(t)) { upd[`${key}/available`] = true; if (!process.env.STALE) upd[`${key}/bookedBy`] = null; upd[`${key}/lastChangedBy`] = "admin"; } else upd[key] = null;
  }
};
await signInWithEmailAndPassword(instAuth, "inst@t.dev", "pass123456");
const mm = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

(async () => {
  await seed();
  await loginAs("a@t.dev"); await C.getUserProfile(UA);
  const pristine = clean(await day(D1));

  console.log("── 1. Запис учня (1 год, сітка 30 хв)");
  const bA = await book(UA, D1, "10:00", 1);
  let d = clean(await day(D1));
  check("запис створено, статус pending, ціна збережена", (await bk(UA, bA))?.status === "pending" && (await bk(UA, bA))?.price === 600);
  console.log("   слоти:", show(d));
  check("зайняті рівно 10:00 і 10:30, власник = учень A", d.slot1000.available === false && d.slot1030.available === false && d.slot1000.bookedBy === UA && d.slot1030.bookedBy === UA && d.slot0930.available && d.slot1100.available);
  check("activeStudents виставлено сервером", (await adb.ref(`instructors/${IID}/activeStudents/${UA}`).get()).val() === true);

  console.log("── 2. Другий учень на перекриття 09:30–10:30");
  await loginAs("b@t.dev"); await C.getUserProfile(UB);
  const okB = await C.claimSlot(D1, "09:30", 1, 30);
  d = clean(await day(D1));
  check("claimSlot відмовлено (10:00 зайнято)", okB === false);
  check("компенсація: 09:30 знову вільний без сліду bookedBy", d.slot0930.available === true && !d.slot0930.bookedBy && JSON.stringify(d.slot0930) === JSON.stringify(pristine.slot0930), JSON.stringify(d.slot0930));
  check("слоти A не зачеплено", d.slot1000.bookedBy === UA && d.slot1030.available === false);

  console.log("── 3. Скасування учнем");
  await loginAs("a@t.dev"); await C.getUserProfile(UA);
  await act(UA, bA, () => C.cancelBooking(UA, bA));
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("запис cancelled/student", (await bk(UA, bA)).status === "cancelled" && (await bk(UA, bA)).cancelledBy === "student");
  check("день повернувся РІВНО до початкового (без bookedBy/phantom)", JSON.stringify(d) === JSON.stringify(pristine), JSON.stringify(d));

  console.log("── 4. Phantom-слот (сітка 60 хв, запис на 1 год → :30 створюється як phantom)");
  const pr2 = clean(await day(D2));
  const bP = await book(UA, D2, "10:00", 1);
  d = clean(await day(D2));
  console.log("   слоти:", show(d));
  check("створено phantom 10:30, 10:00 зайнято", d.slot1030?.phantom === true && d.slot1030.available === false && d.slot1000.available === false);
  await act(UA, bP, () => C.cancelBooking(UA, bP));
  d = clean(await day(D2));
  check("після скасування phantom видалено, день як був", JSON.stringify(d) === JSON.stringify(pr2), JSON.stringify(d));

  console.log("── 5. Перенесення уроку учнем (claim нового → cancel старого → новий запис)");
  const b1 = await book(UA, D1, "10:00", 1);
  // як BookingsTab: 1) claimSlot новий 2) cancelBooking(isReschedule) 3) createBooking(rescheduledFrom)
  const okNew = await C.claimSlot(D1, "12:00", 1, 30);
  await act(UA, b1, () => C.cancelBooking(UA, b1, { isReschedule: true }));
  const b2 = await C.createBooking(UA, { date: D1, time: "12:00", serviceType: "private", durationHours: 1, price: 600, studentName: "X", phone: "1", rescheduledFrom: `${D1} 10:00` });
  await fire(UA, b2, null, await bk(UA, b2));
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("новий час зайнято учнем A", okNew && d.slot1200.available === false && d.slot1230.available === false && d.slot1200.bookedBy === UA);
  check("старий час 10:00–10:30 звільнено", d.slot1000.available === true && d.slot1030.available === true && !d.slot1000.bookedBy);
  check("старий запис cancelled/reschedule, новий pending з rescheduledFrom", (await bk(UA, b1)).cancelledBy === "reschedule" && (await bk(UA, b2)).rescheduledFrom === `${D1} 10:00`);
  // перенос на перекриття — має відмовити, а не зламати
  const okOverlap = await C.claimSlot(D1, "12:30", 1, 30);
  check("перенос на перекриття власного запису відхиляється, слоти не псуються", okOverlap === false && clean(await day(D1)).slot1200.bookedBy === UA && clean(await day(D1)).slot1300.available === true);

  console.log("── 6. Скасування адміном");
  await act(UA, b2, async () => {
    const ex = await adminCtx(D1); const upd = {};
    aFree(upd, D1, mm("12:00"), 60, ex);
    upd[`instructors/${IID}/bookings/${UA}/${b2}/status`] = "cancelled"; upd[`instructors/${IID}/bookings/${UA}/${b2}/cancelledBy`] = "admin"; upd[`instructors/${IID}/bookings/${UA}/${b2}/cancelledAt`] = Date.now();
    const rel = {}; for (const [k, v] of Object.entries(upd)) rel[k.startsWith("instructors/") ? k.slice(`instructors/${IID}/`.length) : k] = v;
    await update(ref(instDb, `instructors/${IID}`), rel);
  });
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("слоти 12:00–12:30 вільні, bookedBy знято", d.slot1200.available === true && d.slot1230.available === true && !d.slot1200.bookedBy && !d.slot1230.bookedBy, JSON.stringify([d.slot1200, d.slot1230]));
  check("сервер на admin-cancel не звільнив чужого", JSON.stringify(d) === JSON.stringify(pristine), JSON.stringify(d));

  console.log("── 7. Перенос запису адміном (drag: звільнити старе + блок нового + поля запису)");
  const b3 = await book(UA, D1, "10:00", 1);
  await act(UA, b3, async () => {
    const ex = await adminCtx(D1); const upd = {};
    aFree(upd, D1, mm("10:00"), 60, ex); aBlock(upd, D1, mm("13:00"), 60, ex, true);
    upd[`bookings/${UA}/${b3}/date`] = D1; upd[`bookings/${UA}/${b3}/time`] = "13:00"; upd[`bookings/${UA}/${b3}/startMin`] = mm("13:00"); upd[`bookings/${UA}/${b3}/rescheduledAt`] = Date.now();
    await update(ref(instDb, `instructors/${IID}`), upd);
  });
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("старе місце 10:00–10:30 вільне", d.slot1000.available === true && d.slot1030.available === true && !d.slot1000.bookedBy);
  check("нове місце 13:00–13:30 зайняте", d.slot1300.available === false && d.slot1330.available === false);
  console.log("   → перенос в інший день (D3)");
  await act(UA, b3, async () => {
    const ex1 = await adminCtx(D1), ex3 = await adminCtx(D3); const upd = {};
    aFree(upd, D1, mm("13:00"), 60, ex1); aBlock(upd, D3, mm("09:00"), 60, ex3, true);
    upd[`bookings/${UA}/${b3}/date`] = D3; upd[`bookings/${UA}/${b3}/time`] = "09:00"; upd[`bookings/${UA}/${b3}/rescheduledAt`] = Date.now();
    await update(ref(instDb, `instructors/${IID}`), upd);
  });
  const d1 = clean(await day(D1)), d3 = clean(await day(D3));
  console.log("   D1:", show(d1), "| D3:", show(d3));
  check("D1 повністю вільний, D3 09:00–09:30 зайнято", JSON.stringify(d1) === JSON.stringify(pristine) && d3.slot0900.available === false && d3.slot0930.available === false);

  console.log("── 8. Атака: учень A намагається звільнити слот, зайнятий адміном/іншим після його запису");
  await seedDays();
  const b4 = await book(UA, D1, "11:00", 1);
  // адмін скасовує запис A і одразу ставить свій урок у цей час
  await act(UA, b4, async () => {
    const ex = await adminCtx(D1); const upd = {};
    aFree(upd, D1, mm("11:00"), 60, ex);
    upd[`bookings/${UA}/${b4}/status`] = "cancelled"; upd[`bookings/${UA}/${b4}/cancelledBy`] = "admin";
    await update(ref(instDb, `instructors/${IID}`), upd);
  });
  { const ex = await adminCtx(D1); const upd = {}; aBlock(upd, D1, mm("11:00"), 60, ex); await update(ref(instDb, `instructors/${IID}`), upd); }
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  let denied = false;
  const dbS = C.db; // студентський db
  try { await update(ref(dbS, `instructors/${IID}/timeslots/${D1}/slot1100`), { available: true, bookedBy: null }); } catch { denied = true; }
  check("A не може звільнити слот, який тепер займає адмін (немає лишку bookedBy)", denied === true && (clean(await day(D1))).slot1100.available === false);

  console.log("── 9. Старий слот БЕЗ bookedBy (бронь до цієї версії)");
  await seedDays();
  await adb.ref(`instructors/${IID}/timeslots/${D1}`).update({ "slot1000/available": false, "slot1030/available": false });
  const bL = C.createBooking ? await C.createBooking(UA, { date: D1, time: "10:00", serviceType: "private", durationHours: 1, price: 600, studentName: "X", phone: "1" }) : null;
  await fire(UA, bL, null, await bk(UA, bL));
  await act(UA, bL, () => C.cancelBooking(UA, bL));
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("скасування старого запису: сервер звільняє слоти (клієнт не може — немає bookedBy)", d.slot1000.available === true && d.slot1030.available === true, JSON.stringify([d.slot1000, d.slot1030]));
  await adb.ref(`instructors/${IID}/timeslots/${D1}`).update({ "slot1000/available": false, "slot1030/available": false });
  const bL2 = await C.createBooking(UA, { date: D1, time: "10:00", serviceType: "private", durationHours: 1, price: 600, studentName: "X", phone: "1" });
  await fire(UA, bL2, null, await bk(UA, bL2));
  const okN = await C.claimSlot(D1, "12:00", 1, 30);
  await act(UA, bL2, () => C.cancelBooking(UA, bL2, { isReschedule: true }));
  const b5 = await C.createBooking(UA, { date: D1, time: "12:00", serviceType: "private", durationHours: 1, price: 600, studentName: "X", phone: "1", rescheduledFrom: `${D1} 10:00` });
  await fire(UA, b5, null, await bk(UA, b5));
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("ПЕРЕНОС старого запису (без bookedBy): старе місце звільняється", okN && d.slot1000.available === true && d.slot1030.available === true, `старе місце лишилось зайнятим: ${show(d)}`);

  console.log("── 10. Учень скасовує урок, який адмін раніше переніс");
  await seedDays();
  const b6 = await book(UA, D1, "10:00", 1);
  await act(UA, b6, async () => {
    const ex = await adminCtx(D1); const upd = {};
    aFree(upd, D1, mm("10:00"), 60, ex); aBlock(upd, D1, mm("13:00"), 60, ex, true);
    upd[`bookings/${UA}/${b6}/date`] = D1; upd[`bookings/${UA}/${b6}/time`] = "13:00";
    await update(ref(instDb, `instructors/${IID}`), upd);
  });
  let threw = false;
  try { await act(UA, b6, () => C.cancelBooking(UA, b6)); } catch { threw = true; }
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("cancelBooking не кидає помилку учню, день як був (сервер звільнив нове місце)", !threw && JSON.stringify(d) === JSON.stringify(pristine), JSON.stringify([threw, show(d)]));

  console.log("── 11. «Накладка»: A створює запис на час, зайнятий B, і скасовує його");
  await seedDays();
  await loginAs("b@t.dev"); await C.getUserProfile(UB);
  const bB = await book(UB, D1, "10:00", 1);
  await loginAs("a@t.dev"); await C.getUserProfile(UA);
  const bOver = await C.createBooking(UA, { date: D1, time: "10:00", serviceType: "private", durationHours: 1, price: 1, studentName: "X", phone: "1" }); // без claimSlot
  await fire(UA, bOver, null, await bk(UA, bOver));
  await act(UA, bOver, () => C.cancelBooking(UA, bOver));
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("слоти B лишились зайнятими (скасування накладки їх не звільнило)", d.slot1000.available === false && d.slot1030.available === false && d.slot1000.bookedBy === UB, show(d));
  await loginAs("b@t.dev"); await C.getUserProfile(UB);
  await act(UB, bB, () => C.cancelBooking(UB, bB));
  check("B скасовує свій запис — слоти звільнено", clean(await day(D1)).slot1000.available === true);

  console.log("── 12. Різна тривалість: 1,5 год на сітці 30 хв і 2 год на сітці 60 хв");
  await seedDays();
  await loginAs("a@t.dev"); await C.getUserProfile(UA);
  const pD1 = clean(await day(D1)), pD2 = clean(await day(D2)), pD3 = clean(await day(D3));
  const b15 = await book(UA, D1, "10:00", 1.5);
  d = clean(await day(D1));
  console.log("   D1:", show(d));
  check("1,5 год: зайняті 10:00, 10:30, 11:00 (учень A), 11:30 вільний", ["slot1000", "slot1030", "slot1100"].every((k) => d[k].available === false && d[k].bookedBy === UA) && d.slot1130.available === true);
  check("ціна запису 1,5 год збережена", (await bk(UA, b15)).price === 900, String((await bk(UA, b15)).price));
  await act(UA, b15, () => C.cancelBooking(UA, b15));
  check("скасування 1,5 год — D1 рівно як був", JSON.stringify(clean(await day(D1))) === JSON.stringify(pD1), show(clean(await day(D1))));
  const b2h = await book(UA, D2, "10:00", 2);
  d = clean(await day(D2));
  console.log("   D2:", show(d));
  check("2 год на сітці 60 хв: 10:00 і 11:00 зайняті, 10:30 і 11:30 — phantom", d.slot1000.available === false && d.slot1100.available === false && d.slot1030?.phantom === true && d.slot1130?.phantom === true && d.slot1200.available === true);

  console.log("── 13. Перенос учнем 2-годинного уроку в інший день (D2 10:00 → D3 12:00)");
  const okR = await C.claimSlot(D3, "12:00", 2, 30);
  await act(UA, b2h, () => C.cancelBooking(UA, b2h, { isReschedule: true }));
  const bR = await C.createBooking(UA, { date: D3, time: "12:00", serviceType: "private", durationHours: 2, price: 1200, studentName: "X", phone: "1", rescheduledFrom: `${D2} 10:00` });
  await fire(UA, bR, null, await bk(UA, bR));
  const r2 = clean(await day(D2)), r3 = clean(await day(D3));
  console.log("   D2:", show(r2), "| D3:", show(r3));
  check("D2 повернувся рівно як був (phantom прибрано)", okR && JSON.stringify(r2) === JSON.stringify(pD2), show(r2));
  check("D3 12:00–13:30 зайнято учнем A, 14:00 вільний", ["slot1200", "slot1230", "slot1300", "slot1330"].every((k) => r3[k].available === false && r3[k].bookedBy === UA) && r3.slot1400?.available !== false);
  await act(UA, bR, () => C.cancelBooking(UA, bR));
  check("скасування перенесеного — D3 рівно як був", JSON.stringify(clean(await day(D3))) === JSON.stringify(pD3), show(clean(await day(D3))));

  console.log("── 14. Накладка з уроком інструктора: адмін скасовує запис учня — час уроку інструктора лишається зайнятим");
  await seedDays();
  const pD1b = clean(await day(D1));
  const bA14 = await book(UA, D1, "10:00", 1);                 // учень A 10:00–11:00
  // інструктор ставить свій урок 10:30–11:30 (накладка), як App.jsx: запис під uid інструктора + blockSlots
  const XID = "adminX";
  { const ex = await adminCtx(D1); const upd = {}; aBlock(upd, D1, mm("10:30"), 60, ex);
    upd[`bookings/${IID}/${XID}`] = { date: D1, time: "10:30", startMin: mm("10:30"), durMin: 60, durationHours: 1, status: "confirmed", createdBy: "admin", studentName: "Інструктор" };
    await update(ref(instDb, `instructors/${IID}`), upd); }
  await fire(IID, XID, null, await bk(IID, XID));
  // адмін скасовує запис A — лише статус (як старий клієнт, без звільнення), слоти звільняє сервер
  await act(UA, bA14, () => update(ref(instDb, `instructors/${IID}/bookings/${UA}/${bA14}`), { status: "cancelled", cancelledBy: "admin", cancelledAt: Date.now() }));
  d = clean(await day(D1));
  console.log("   слоти:", show(d));
  check("10:00 (лише запис A) звільнено", d.slot1000.available === true);
  check("10:30 і 11:00 лишились зайнятими — їх займає урок інструктора", d.slot1030.available === false && d.slot1100.available === false, show(d));
  await act(IID, XID, () => update(ref(instDb, `instructors/${IID}/bookings/${IID}/${XID}`), { status: "cancelled", cancelledBy: "admin", cancelledAt: Date.now() }));
  check("після скасування уроку інструктора — D1 рівно як був", JSON.stringify(clean(await day(D1))) === JSON.stringify(pD1b), show(clean(await day(D1))));

  console.log("── 15. Учень, заведений вручну, сам зареєструвався — одна людина, а не дві");
  await seedDays();
  const R = (p) => adb.ref(`instructors/${IID}/${p}`);
  // інструктор завів картку вручну і записав урок (як createStudent + NewBookingModal)
  const MID = "manual1", MB = "b-manual-1";
  await R(`users/${MID}`).set({ name: "Олексій Петрик", phone: "067 123 45 67", discount: 50, notes: "боїться розворотів", type: "private", hours: 3, createdAt: 1 });
  await R("studentColors").update({ [MID]: "pink" });
  { const ex = await adminCtx(D1); const upd = {}; aBlock(upd, D1, mm("11:00"), 60, ex);
    upd[`bookings/${MID}/${MB}`] = { id: MB, date: D1, time: "11:00", startMin: mm("11:00"), durMin: 60, durationHours: 1, status: "confirmed", createdBy: "admin", studentName: "Олексій Петрик", phone: "067 123 45 67" };
    await update(ref(instDb, `instructors/${IID}`), upd); }
  // гість, записаний за телефоном (users/guest_<телефон>) — теж він
  await R("users/guest_380671234567").set({ name: "Олексій", phone: "+380671234567", type: "private", createdAt: 2 });
  // інша людина з таким самим ім'ям, але іншим телефоном — не чіпаємо
  await R("users/manual2").set({ name: "Іван Сидоренко", phone: "050 000 00 00", createdAt: 3 });
  // учень реєструється сам: інший формат телефону, слова імені навпаки
  const SU = "student_reg_1";
  const profile = { name: "Петрик Олексій", phone: "+38 (067) 123-45-67", email: "oleksii@t.dev" };
  await R(`users/${SU}/profile`).set(profile);
  await fns.onNewStudentRegistered.run({ data: { val: () => profile }, params: { iid: IID, uid: SU } });
  const users = (await R("users").get()).val() || {};
  const moved = (await R(`bookings/${SU}/${MB}`).get()).val();
  d = clean(await day(D1));
  check("картку, заведену вручну, і гостя прибрано — лишився один учень", !users[MID] && !users.guest_380671234567 && !!users[SU]);
  check("урок перенесено в акаунт учня", moved?.date === D1 && moved?.time === "11:00" && moved?.mergedFrom === MID && !(await R(`bookings/${MID}`).get()).exists());
  check("знижка, нотатки, години перенесено; ім'я з реєстрації", users[SU]?.discount === 50 && users[SU]?.notes === "боїться розворотів" && users[SU]?.hours === 3 && users[SU]?.profile?.name === "Петрик Олексій");
  check("колір учня в розкладі перенесено", (await R(`studentColors/${SU}`).get()).val() === "pink" && !(await R(`studentColors/${MID}`).get()).exists());
  // сервер отримує подію про «новий» запис — це перенесення, слоти не чіпає
  await fire(SU, MB, null, moved);
  check("слот 11:00 лишився зайнятим", clean(await day(D1)).slot1100.available === false, show(clean(await day(D1))));
  check("інший учень з іншим телефоном не зачеплений", !!users.manual2);
  // кнопка «Об'єднати» для старих дублікатів: вже зареєстрований учень + картка з тим самим email
  await R("users/manual3").set({ name: "Хтось", email: "OLEKSII@t.dev", discount: 0, isVip: true });
  await fns.onMergeStudentsRequest.run({ data: { val: () => ({ at: 1 }) }, params: { iid: IID, reqId: "r1" } });
  const u2 = (await R("users").get()).val() || {};
  check("кнопка «Об'єднати»: дублікат за поштою злито (VIP перенесено)", !u2.manual3 && u2[SU]?.isVip === true && (await R("mergeStudentsRequest/r1/merged").get()).val() === 1);
  // скасування перенесеного уроку адміном звільняє слот як звичайно
  await act(SU, MB, () => update(ref(instDb, `instructors/${IID}/bookings/${SU}/${MB}`), { status: "cancelled", cancelledBy: "admin", cancelledAt: Date.now() }));
  check("скасування перенесеного уроку звільняє 11:00", clean(await day(D1)).slot1100.available === true, show(clean(await day(D1))));

  console.log("── 16. Форма звернення з лендингу");
  const sc = async (body) => { let code = 200, out = null; let done; const fin = new Promise(r => { done = r; });
    const res = { headers: {}, set() { return res; }, setHeader(k, v) { res.headers[k] = v; }, getHeader(k) { return res.headers[k]; }, on() { return res; }, end() { done(); return res; }, status(c) { code = c; res.statusCode = c; return res; }, json(b) { out = b; done(); return res; }, send(b) { out = b; done(); return res; } };
    await fns.submitContact({ method: "POST", body, headers: { "x-forwarded-for": "10.0.0.18" }, ip: "10.0.0.18" }, res); await fin; return { code, out }; };
  const scOk = await sc({ name: "Петро", email: "petro@example.com", message: "Хочу спробувати Juno" });
  const msgs = Object.values((await adb.ref("system/contactMessages").get()).val() || {});
  check("звернення збережено (push власнику не ламає відповідь)", scOk.code === 200 && msgs.some(m => m.name === "Петро" && m.status === "new"), JSON.stringify(scOk));
  check("невалідний email — 400", (await sc({ name: "X", email: "bad", message: "hello there" })).code === 400);
  check("повтор за 30 с з тієї ж IP — 429", (await sc({ name: "Петро", email: "petro@example.com", message: "Ще раз привіт" })).code === 429);

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
