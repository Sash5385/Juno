// Запуск: node tests/flows/booking-rules.test.mjs  (потрібен клонований Juno-client поруч або CLIENT_DIR=...)
// Обмеження учня з «Налаштування → Ліміти», спільні для запису і переносу (Juno-client/src/utils/bookingRules.js).
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const CLIENT = process.env.CLIENT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../../../Juno-client");
const R = await import(pathToFileURL(resolve(CLIENT, "src/utils/bookingRules.js")).href);
let failed = 0;
const check = (n, c, x = "") => { if (!c) failed++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };

const bks = [{ id: "a", date: "2026-10-20", status: "confirmed" }, { id: "b", date: "2026-10-25", status: "cancelled" }];
check("інтервал 0 — без обмеження", R.minIntervalConflict("2026-10-20", bks, 0) === null);
check("інтервал 3 дні: той самий день — конфлікт", R.minIntervalConflict("2026-10-20", bks, 3)?.id === "a");
check("інтервал 3 дні: через 2 дні — конфлікт", R.minIntervalConflict("2026-10-22", bks, 3)?.id === "a");
check("інтервал 3 дні: через 3 дні — можна", R.minIntervalConflict("2026-10-23", bks, 3) === null);
check("інтервал 3 дні: за 2 дні до — конфлікт", R.minIntervalConflict("2026-10-18", bks, 3)?.id === "a");
check("скасований запис не рахується", R.minIntervalConflict("2026-10-25", bks, 3) === null);
check("при переносі власний запис не заважає", R.minIntervalConflict("2026-10-21", bks, 3, "a") === null);
check("перехід через місяць рахується правильно", R.minIntervalConflict("2026-11-01", [{ id: "x", date: "2026-10-30", status: "confirmed" }], 3)?.id === "x" && R.minIntervalConflict("2026-11-02", [{ id: "x", date: "2026-10-30", status: "confirmed" }], 3) === null);

const today = new Date(2026, 9, 10);
check("горизонт приватних 30 днів", R.maxBookDate(today, true, { calendarOpenDays: 30 }).getDate() === 9 && R.maxBookDate(today, true, { calendarOpenDays: 30 }).getMonth() === 10);
check("горизонт автошколи 14 днів", R.maxBookDate(today, false, { schoolCalendarOpenDays: 14 }).getDate() === 24);
check("без налаштувань: 30 / 14", R.maxBookDate(today, true, {}).getTime() > R.maxBookDate(today, false, {}).getTime());

const now = new Date(2026, 9, 10, 12, 0).getTime();
check("заборона запису за 2 год: слот через 1 год закритий", R.withinCutoff(new Date(2026, 9, 10), "13:00", 2, now) === true);
check("слот через 3 год — відкритий", R.withinCutoff(new Date(2026, 9, 10), "15:00", 2, now) === false);
check("0 годин — без обмеження", R.withinCutoff(new Date(2026, 9, 10), "12:30", 0, now) === false);

check("перенос вимкнено інструктором — кнопки нема", R.rescheduleState(100, { studentCanReschedule: false }, 24).show === false);
check("перенос за 30 год до уроку (строк 24) — можна", (() => { const s = R.rescheduleState(30, {}, 24); return s.show && !s.locked; })());
check("перенос за 3 год до уроку (строк 24) — заблоковано, як і скасування", (() => { const s = R.rescheduleState(3, {}, 24); return s.show && s.locked; })());

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
