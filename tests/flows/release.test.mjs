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
await seed();
await loginAs("a@t.dev");
// 1) claim 1-годинного уроку, запис не створився → слоти повертаються (існуючий слот — вільним, phantom — видаляється)
const D = D1;
check("claim 10:00 ok", await C.claimSlot(D, "10:00", 1, 30));
check("слоти зайняті після claim", /X/.test(show(clean(await day(D)))) && (await day(D)).slot1000.available === false, show(await day(D)));
await C.releaseClaimedSlots(D, "10:00", 1, 30);
const d1 = await day(D);
check("slot1000 знову вільний, без bookedBy", d1.slot1000.available === true && !d1.slot1000.bookedBy, JSON.stringify(d1.slot1000));
check("slot1030 знову вільний", d1.slot1030.available === true && !d1.slot1030.bookedBy, JSON.stringify(d1.slot1030));
// 2) phantom-слот (немає в графіку) видаляється
await adb.ref(`instructors/${IID}/timeslots/${D}/slot1000`).remove();
check("claim phantom ok", await C.claimSlot(D, "10:00", 1, 30));
check("phantom створено", (await day(D)).slot1000?.phantom === true);
await C.releaseClaimedSlots(D, "10:00", 1, 30);
check("phantom видалено після release", (await day(D)).slot1000 === undefined, JSON.stringify((await day(D)).slot1000));
// 3) release не чіпає слоти ІНШОГО учня
await seedDays();
await loginAs("b@t.dev");
check("B займає 11:00", await C.claimSlot(D, "11:00", 1, 30));
await loginAs("a@t.dev");
await C.releaseClaimedSlots(D, "11:00", 1, 30);
const d3 = await day(D);
check("слот B не звільнено чужим release", d3.slot1100.available === false && d3.slot1100.bookedBy === UB, JSON.stringify(d3.slot1100));
console.log(failed ? `FAILED: ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
