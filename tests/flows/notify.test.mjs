// Запуск: bash tests/flows/run.sh notify
// Серверні налаштування інструктора: режим черги (Автоматично / Розсилка / Вручну + тумблер «Пропозиція з черги»),
// нагадування #1–#3 («Налаштування → Сповіщення») і тумблер «Повідомлення про скасування».
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const JUNO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.env.GCLOUD_PROJECT = "demo-flow";
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "demo-flow", databaseURL: "http://127.0.0.1:9000/?ns=demo-flow-default-rtdb" });
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
const req = createRequire(resolve(JUNO, "functions/index.js"));
const admin = req("firebase-admin");
const fns = req(resolve(JUNO, "functions/index.js"));
const adb = admin.database();
let failed = 0;
const check = (name, cond, extra = "") => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };

const IID = "inst1", A = "stuA", B = "stuB", C = "stuC";
const R = (p) => adb.ref(`instructors/${IID}/${p}`);
const pad = (n) => String(n).padStart(2, "0");
const kyiv = (ms) => { const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kiev", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms); const [d, t] = f.split(" "); return { date: d, time: t }; };
const fire = async (uid, id, before, after) => { await fns.onBookingChanged.run({ data: { before: { val: () => before }, after: { val: () => after } }, params: { iid: IID, uid, bookingId: id } }); };
const D = kyiv(Date.now() + 5 * 86400000).date;
const reset = async (settings = {}, extra = {}) => {
  await adb.ref("/").set({ instructors: { [IID]: {
    license: { status: "active", expiresAt: Date.now() + 30 * 86400000 },
    admin_settings: { profile: { name: "Інструктор" }, ...settings },
    users: { [A]: { profile: { name: "A", phone: "1" } }, [B]: { profile: { name: "B", phone: "2" } }, [C]: { profile: { name: "C", phone: "3" } } },
    activeStudents: { [A]: true, [B]: true, [C]: true },
    ...extra,
  } } });
};
const status = async (uid) => (await R(`queue/${D}_10:00/entries/${uid}/status`).get()).val();

(async () => {
  console.log("── N1. Режим черги: хто отримує звільнене місце");
  const cancelBooking = async () => {
    await reset(globalThis.__s || {}, {});
    await R(`queue/${D}_10:00/entries`).set({ [B]: { status: "waiting", addedAt: 1, durationHours: 1 }, [C]: { status: "waiting", addedAt: 2, durationHours: 1 } });
    const b = { id: "b1", date: D, time: "10:00", startMin: 600, durMin: 60, durationHours: 1, status: "confirmed", studentName: "A" };
    await R(`bookings/${A}/b1`).set({ ...b, status: "cancelled", cancelledBy: "student" });
    await fire(A, "b1", b, { ...b, status: "cancelled", cancelledBy: "student" });
  };
  globalThis.__s = { queueAutoFifo: true, queueBroadcast: false, queueManual: false }; await cancelBooking();
  check("«Автоматично»: пропозиція лише першому в черзі", (await status(B)) === "offered" && (await status(C)) === "waiting", `${await status(B)} ${await status(C)}`);
  globalThis.__s = { queueAutoFifo: false, queueBroadcast: true, queueManual: false }; await cancelBooking();
  check("«Розсилка»: пропозиція всім у черзі одразу", (await status(B)) === "offered" && (await status(C)) === "offered" && (await R(`queue/${D}_10:00/entries/${C}/broadcast`).get()).val() === true, `${await status(B)} ${await status(C)}`);
  globalThis.__s = { queueAutoFifo: false, queueBroadcast: false, queueManual: true }; await cancelBooking();
  check("«Вручну»: система нікому нічого не пропонує", (await status(B)) === "waiting" && (await status(C)) === "waiting", `${await status(B)} ${await status(C)}`);
  globalThis.__s = { queueAutoFifo: true, queueBroadcast: false, queueManual: false, autoQueueOffer: { enabled: false } }; await cancelBooking();
  check("тумблер «Пропозиція з черги» вимкнено — нікому не пропонує", (await status(B)) === "waiting" && (await status(C)) === "waiting");
  globalThis.__s = {}; await cancelBooking();
  check("без налаштувань — як раніше (першому)", (await status(B)) === "offered" && (await status(C)) === "waiting");

  console.log("── N2. «Розсилка»: хто першим записався — той отримав місце");
  globalThis.__s = { queueAutoFifo: false, queueBroadcast: true, queueManual: false }; await cancelBooking();
  await R(`users/${C}/queueOffers/${D}_10:00`).set({ date: D, time: "10:00", until: Date.now() + 1e6 });
  await R(`timeslots/${D}/slot1000/offeredTo`).set({ [B]: { until: Date.now() + 1e6 }, [C]: { until: Date.now() + 1e6 } });
  const nb = { id: "b2", date: D, time: "10:00", startMin: 600, durMin: 60, durationHours: 1, status: "confirmed", studentName: "B" };
  // вигаданий запис на ВІЛЬНИЙ запропонований слот (слот не зайнято) пропозицій інших не закриває
  const fake = { ...nb, id: "bx", studentName: "Хакер" };
  await R(`bookings/${A}/bx`).set(fake);
  await fire(A, "bx", null, fake);
  check("вигаданий запис на вільний слот не скасовує чужі пропозиції", (await status(C)) === "offered" && (await R(`users/${C}/queueOffers/${D}_10:00`).get()).exists(), String(await status(C)));
  await R(`bookings/${A}/bx`).set(null);
  await R(`timeslots/${D}/slot1000`).update({ time: "10:00", available: false, bookedBy: B, phantom: null });
  await R(`bookings/${B}/b2`).set(nb);
  await fire(B, "b2", null, nb);
  check("переможець B записаний, програвший C знову чекає в черзі", (await status(C)) === "waiting" && !(await R(`users/${C}/queueOffers/${D}_10:00`).get()).exists() && !(await R(`timeslots/${D}/slot1000/offeredTo/${C}`).get()).exists(), String(await status(C)));

  console.log("── N3. Нагадування #1–#3");
  const T = { id: "t1", trigger: "auto_reminder", reminderHours: 2, active: true, channel: "chat", title: "Нагадування", body: "Урок {дата} о {час}" };
  const lesson = async (offsetMin) => { const k = kyiv(Date.now() + offsetMin * 60000); await R(`bookings/${A}/L`).set({ id: "L", date: k.date, time: k.time, startMin: 0, durMin: 60, status: "confirmed", studentName: "A" }); };
  const run = async () => { await (fns.sendLessonReminders.run || fns.sendLessonReminders)({}); };
  const sent = async () => (await R(`sentReminders/${A}/L`).get()).val() || {};
  const chats = async () => Object.values((await R(`chats/${A}`).get()).val() || {}).length;

  await reset({ autoReminders: [{ enabled: true, hoursBefore: 24 }, { enabled: true, hoursBefore: 3 }, { enabled: false, hoursBefore: 1 }], autoRemindersV: 2 }, { admin_data: { templates: [T] } });
  await lesson(172); await run();
  check("«Нагадування за 3 год» (увімкнено): прийшло за ~3 год", sent && (await sent()).r3 === true && (await chats()) === 1, JSON.stringify(await sent()));
  await run();
  check("повторний запуск не дублює", (await chats()) === 1);
  const msg0 = Object.values((await R(`chats/${A}`).get()).val() || {})[0] || {};
  const kyivNow = new Intl.DateTimeFormat("uk", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" }).format(Date.now());
  check("час автоповідомлення в чаті — за Києвом, а не UTC", msg0.time === kyivNow || Math.abs(Number(msg0.time?.slice(0, 2)) - Number(kyivNow.slice(0, 2))) % 24 === 0, `${msg0.time} vs ${kyivNow}`);
  await lesson(115); await R(`sentReminders`).set(null); await run();
  check("стара жорстка «за 2 год» більше не шле, якщо вимкнено в налаштуваннях", !(await sent()).r2 && (await chats()) === 1, JSON.stringify(await sent()));
  await reset({ autoReminders: [{ enabled: false, hoursBefore: 24 }, { enabled: true, hoursBefore: 4 }], autoRemindersV: 2 }, { admin_data: { templates: [{ ...T, body: "Нагадуємо: урок сьогодні о {час}. Не запізнюйтесь, завтра теж." }] } });
  await lesson(235); await run();
  const txt = Object.values((await R(`chats/${A}`).get()).val() || {})[0]?.text || "";
  check("за 4 год: слів «сьогодні»/«завтра» у тексті немає, решта на місці", (await sent()).r4 === true && !/сьогодні|завтра/i.test(txt) && /Нагадуємо: урок о \d\d:\d\d\. Не запізнюйтесь, теж\./.test(txt), txt);
  await reset({ autoReminders: [{ enabled: true, hoursBefore: 24 }, { enabled: true, hoursBefore: 3 }, { enabled: false, hoursBefore: 1 }], autoRemindersV: 2 }, { admin_data: { templates: [T] } });
  await lesson(55); await run();
  check("#3 «за 1 год» вимкнено — нічого не приходить", !(await sent()).r1 && (await chats()) === 0);

  await reset({ autoReminders: [{ enabled: true, hoursBefore: 24 }, { enabled: true, hoursBefore: 3 }, { enabled: true, hoursBefore: 1 }], autoRemindersV: 2 }, { admin_data: { templates: [T] } });
  await lesson(55); await run();
  check("#3 «за 1 год» увімкнено — приходить", (await sent()).r1 === true && (await chats()) === 1, JSON.stringify(await sent()));

  await reset({}, { admin_data: { templates: [T] } });
  await lesson(115); await run();
  check("без налаштувань: за 2 год — як і було", (await sent()).r2 === true);
  await reset({ autoReminders: [{ enabled: true, hoursBefore: 24 }, { enabled: false, hoursBefore: 2 }, { enabled: false, hoursBefore: 1 }] }, { admin_data: { templates: [T] } });
  await lesson(115); await run();
  check("старе типове значення без позначки — за 2 год лишається (як слав сервер раніше)", (await sent()).r2 === true);

  console.log("── N4. «Повідомлення про скасування»");
  const cancelByAdmin = async (settings) => {
    await reset(settings, { admin_data: { templates: [{ id: "t4", trigger: "auto_cancel", active: true, channel: "chat", title: "Скасування", body: "Урок {дата} о {час} скасовано" }] } });
    const b = { id: "b9", date: D, time: "12:00", startMin: 720, durMin: 60, durationHours: 1, status: "confirmed", studentName: "A" };
    await R(`bookings/${A}/b9`).set({ ...b, status: "cancelled", cancelledBy: "admin" });
    await fire(A, "b9", b, { ...b, status: "cancelled", cancelledBy: "admin" });
    return chats9();
  };
  const chats9 = async () => Object.values((await R(`chats/${A}`).get()).val() || {}).length;
  check("увімкнено — учень отримує повідомлення", (await cancelByAdmin({ autoCancel: { enabled: true } })) === 1);
  check("вимкнено — учню нічого не надсилається", (await cancelByAdmin({ autoCancel: { enabled: false } })) === 0);

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
