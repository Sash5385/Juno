// Генератор ВИДУМАНИХ даних для демо-режиму (скріншоти, реклама). Усі імена, телефони й
// записи вигадані. Дати рахуються від "сьогодні", тож розклад завжди виглядає "живим".
// Структура повторює реальну базу instructors/{iid}/… (див. demoDb.js).
import { DEMO_UID, demoTheme } from "./demoMode.js";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const slotId = (m) => `slot${pad(Math.floor(m / 60))}${pad(m % 60)}`;
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

// Детермінований генератор: кожне відкриття демо дає ту саму картинку
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// name, тип (school — автошкола, private — приватний), досвід, vip, знижка ₴/год, своя ціна ₴/год,
// firstDay — день першого уроку відносно сьогодні (null — навчається давно)
const STUDENTS = [
  { n: "Марія Шевчук",          t: "school",  exp: "no_license"  },
  { n: "Олексій Коваленко",     t: "private", exp: "novice" },
  { n: "Ірина Бондаренко",      t: "school",  exp: "no_license", discount: 50 },
  { n: "Дмитро Мельник",        t: "private", exp: "has_license", vip: true },
  { n: "Софія Ткаченко",        t: "school",  exp: "no_license"  },
  { n: "Андрій Кравченко",      t: "private", exp: "basic" },
  { n: "Наталія Олійник",       t: "school",  exp: "no_license"  },
  { n: "Максим Поліщук",        t: "private", exp: "novice", discount: 100 },
  { n: "Катерина Лисенко",      t: "school",  exp: "no_license", firstDay: 0 },
  { n: "Владислав Гриценко",    t: "private", exp: "has_license" },
  { n: "Анастасія Мороз",       t: "school",  exp: "no_license"  },
  { n: "Богдан Савчук",         t: "private", exp: "basic", vip: true },
  { n: "Юлія Руденко",          t: "school",  exp: "no_license"  },
  { n: "Сергій Павленко",       t: "private", exp: "licensed", customPrice: 700 },
  { n: "Олена Кузьменко",       t: "school",  exp: "no_license", firstDay: 1 },
  { n: "Тарас Іваненко",        t: "private", exp: "novice" },
  { n: "Вікторія Семенко",      t: "school",  exp: "no_license"  },
  { n: "Роман Гончаренко",      t: "private", exp: "has_license" },
  { n: "Дарина Остапенко",      t: "school",  exp: "no_license", firstDay: 2 },
  { n: "Євген Марченко",        t: "private", exp: "basic" },
  { n: "Оксана Бойко",          t: "school",  exp: "no_license"  },
  { n: "Артем Нестеренко",      t: "private", exp: "novice", firstDay: 3 },
  { n: "Людмила Пархоменко",    t: "private", exp: "has_license" },
  { n: "Ярослав Коваль",        t: "private", exp: "basic", firstDay: 4 },
].map((s, i) => ({
  ...s, uid: `demo_u${pad(i + 1)}`, phone: `+3809900000${pad(i + 10)}`,
  firstDay: s.firstDay === undefined ? null : s.firstDay,
}));

const SERVICES = [
  { id: "sv1", name: "Автошкола 1 год", type: "school",  duration: 60,  price: 600,  colorId: "green",  active: true, description: "Урок за програмою автошколи" },
  { id: "sv2", name: "Автошкола 2 год", type: "school",  duration: 120, price: 1100, colorId: "green",  active: true, description: "Подвійний урок" },
  { id: "sv3", name: "Приватний 1 год", type: "private", duration: 60,  price: 800,  colorId: "yellow", active: true, description: "Індивідуальне заняття" },
  { id: "sv5", name: "Приватний 1,5 год", type: "private", duration: 90, price: 1200, colorId: "purple", active: true, description: "Розширений урок" },
  { id: "sv4", name: "Приватний 2 год", type: "private", duration: 120, price: 1500, colorId: "yellow", active: true, description: "Практика з маршрутом" },
];

const NOTES = ["Паркування задом", "Розворот у дворі", "Складний перехрест", "Нічна їзда", "Підйом на гірці", "Маршрут до іспиту"];
const STUDENT_NOTES = ["Чи можна на 10 хв пізніше?", "Буду з навчальними правами", "Хочу відпрацювати паркування"];

// Шаблон дня: Пн–Пт 9–19 з обідом 13–14, Сб 10–16 без обіду, Нд вихідний
function dayTemplate(date) {
  const dow = (date.getDay() + 6) % 7;
  if (dow === 6) return null;
  if (dow === 5) return { starts: [10, 11, 12, 13, 14, 15].map((h) => h * 60), end: 16 * 60, lunch: null };
  return { starts: [9, 10, 11, 14, 15, 16, 17, 18].map((h) => h * 60), end: 19 * 60, lunch: [13 * 60, 14 * 60] };
}

export function buildDemoTree() {
  const rnd = rng(20260210);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const nowTs = Date.now();

  const bookings = {};       // bookings/{uid}/{id}
  const occ = {};            // зайнятість: date → [[from,to]]
  const list = [];           // усі записи для подальших кроків
  let seq = 0;

  const addBooking = (st, date, startMin, durMin, extra = {}) => {
    const id = `demo${String(++seq).padStart(4, "0")}`;
    const svc = st.t === "school"
      ? (durMin >= 120 ? "sv2" : "sv1")
      : (durMin >= 120 ? "sv4" : durMin === 90 ? "sv5" : "sv3");
    const b = {
      id, date, time: hhmm(startMin), startMin, durMin, durationHours: durMin / 60,
      studentName: st.n, name: st.n, phone: st.phone,
      serviceId: svc, serviceType: st.t, type: st.t,
      status: "confirmed", hours: 0,
      createdAt: Math.min(nowTs - seq * 60000, new Date(`${date}T00:00:00`).getTime() - 86400000 * (1 + (seq % 3)) + ((9 + (seq * 7) % 11) * 60 + (seq * 13) % 60) * 60000), createdBy: "admin",
      ...(st.vip ? { isVipOnly: true, categoryId: "cat-vip" } : {}),
      ...extra,
    };
    if (b.status === "pending") delete b.createdBy; // запис створив сам учень
    (bookings[st.uid] ||= {})[id] = b;
    (occ[date] ||= []).push([startMin, startMin + durMin]);
    list.push({ uid: st.uid, b });
    return b;
  };

  // ── уроки: 60 днів історії + 21 день уперед ──────────────────
  const pickFrom = (eligible) => eligible[Math.floor(rnd() * eligible.length)];
  for (let d = -60; d <= 21; d++) {
    const date = addDays(today, d);
    const tpl = dayTemplate(date);
    if (!tpl) continue;
    const dateStr = ymd(date);
    const density = d < -14 ? 0.62 : d < 0 ? 0.82 : d <= 5 ? 0.9 : d <= 10 ? 0.72 : 0.5;
    const usedToday = new Set();
    let busyUntil = 0;
    const forced = STUDENTS.filter((s) => s.firstDay === d);
    for (const start of tpl.starts) {
      if (start < busyUntil) continue;
      let st;
      if (forced.length) st = forced.shift();
      else {
        if (rnd() > density) continue;
        const eligible = STUDENTS.filter((s) => !usedToday.has(s.uid) && (s.firstDay === null || d > s.firstDay));
        if (!eligible.length) continue;
        st = pickFrom(eligible);
      }
      const r = rnd();
      let dur = st.t === "school" ? (r < 0.8 ? 60 : 120) : (r < 0.62 ? 60 : r < 0.82 ? 90 : 120);
      const maxEnd = tpl.lunch && start < tpl.lunch[0] ? tpl.lunch[0] : tpl.end;
      if (start + dur > maxEnd) dur = 60;
      if (start + dur > maxEnd) continue;
      usedToday.add(st.uid);
      busyUntil = start + dur;

      const extra = {};
      if (d < 0) {
        if (rnd() < 0.04) extra.status = "noshow";
        else if (rnd() < 0.5) extra.rating = rnd() < 0.7 ? 5 : 4;
        if (d > -12 && rnd() < 0.035) extra.debtAmount = 300;
      } else if (d >= 2 && rnd() < 0.14) {
        // запис учня, що чекає підтвердження
        extra.status = "pending";
        extra.studentNote = STUDENT_NOTES[Math.floor(rnd() * STUDENT_NOTES.length)];
      }
      if (start >= 17 * 60 && rnd() < 0.3) extra.surcharge = 100;
      if (rnd() < 0.07) extra.note = NOTES[Math.floor(rnd() * NOTES.length)];
      else if (d >= 0 && rnd() < 0.05 && !extra.studentNote) extra.studentNote = STUDENT_NOTES[Math.floor(rnd() * STUDENT_NOTES.length)];
      addBooking(st, dateStr, start, dur, extra);
    }
  }

  // ручні мітки та борг для різноманіття у видимому вікні (іспит / перевірка / повтор / борг)
  const manualTag = (fromDay, tag, privateOnly) => {
    for (let d = fromDay; d < fromDay + 7; d++) {
      const ds = ymd(addDays(today, d));
      const hit = list.find((x) => x.b.date === ds && x.b.status === "confirmed" && !x.b.tag && !x.b.debtAmount
        && x.b.startMin < 17 * 60 && (!privateOnly || x.b.type === "private"));
      if (hit) { hit.b.tag = tag; hit.b.tagManual = true; return; }
    }
  };
  manualTag(1, "check", false);
  manualTag(1, "repeat", false);
  manualTag(2, "exam", true);
  {
    // борг (300 ₴) — на першому занятті сьогодні, а якщо його нема — вчорашньому
    const dbt = [0, -1, -2].map((d) => ymd(addDays(today, d))).map((ds) => list.find((x) => x.b.date === ds && x.uid !== "personal" && !x.b.tag && x.b.status === "confirmed")).find(Boolean);
    if (dbt) dbt.b.debtAmount = 300;
  }

  // особисті події адміна
  const personal = {};
  const addPersonal = (d, title, durMin, note, reminder) => {
    const date = addDays(today, d);
    const tpl = dayTemplate(date);
    if (!tpl) return;
    const dateStr = ymd(date);
    const taken = occ[dateStr] || [];
    const start = tpl.starts.find((s) => !taken.some(([a, b2]) => s < b2 && s + durMin > a));
    if (start == null) return;
    const id = `demo_pe${d + 100}`;
    personal[id] = { id, date: dateStr, time: hhmm(start), startMin: start, durMin, studentName: title, name: title, note, type: "personal", status: "personal", reminderHours: reminder, reminderSent: false, createdAt: nowTs, createdBy: "admin" };
    (occ[dateStr] ||= []).push([start, start + durMin]);
    list.push({ uid: "personal", b: personal[id] });
  };
  addPersonal(1, "Техогляд авто", 60, "СТО на Оболоні", 2);
  addPersonal(4, "Заміна масла", 60, "", null);
  bookings.personal = personal;

  // ── користувачі (учні) ───────────────────────────────────────
  const hoursByUid = {};
  list.forEach(({ uid, b }) => {
    if (uid === "personal") return;
    if (b.date < ymd(today) && b.status !== "noshow") hoursByUid[uid] = (hoursByUid[uid] || 0) + b.durMin / 60;
  });
  const users = {};
  STUDENTS.forEach((s, i) => {
    users[s.uid] = {
      profile: {
        name: s.n, phone: s.phone, type: s.t, experience: s.exp,
        filmingConsent: i % 5 !== 0, createdAt: nowTs - 86400000 * (s.firstDay === null ? 70 : 2),
      },
      hours: Math.round(hoursByUid[s.uid] || 0), hoursOffset: 0,
      discount: s.discount || 0, customPrice: s.customPrice ?? null,
      notes: i === 3 ? "Готується до іспиту в сервісному центрі" : "", blocked: false, isVip: !!s.vip, noIntervalLimit: false,
      maneuverCounts: {}, maneuverSuccessCounts: {}, badges: {},
    };
  });

  // ── слоти календаря (timeslots) ──────────────────────────────
  const timeslots = {};
  const flagRnd = rng(777);
  for (let d = -2; d <= 30; d++) {
    const date = addDays(today, d);
    const tpl = dayTemplate(date);
    if (!tpl) continue;
    const dateStr = ymd(date);
    const day = {};
    tpl.starts.forEach((s) => { day[slotId(s)] = { time: hhmm(s), available: true }; });
    // блокування під записи: наявні слоти стають зайнятими, проміжні позиції — phantom
    list.filter((x) => x.b.date === dateStr).forEach(({ b }) => {
      for (let m = b.startMin; m < b.startMin + b.durMin; m += 30) {
        const id = slotId(m);
        if (day[id]) { day[id].available = false; day[id].time = hhmm(m); }
        else day[id] = { time: hhmm(m), available: false, phantom: true };
        if (m === b.startMin) day[id].bookingStart = true;
        if (b.type === "personal") day[id].personal = true;
      }
    });
    // «фішки» вільних слотів — лише майбутні
    if (d >= 0) {
      Object.keys(day).forEach((id) => {
        const sl = day[id];
        if (sl.available !== true) return;
        const mins = Number(sl.time.slice(0, 2)) * 60 + Number(sl.time.slice(3));
        const r = flagRnd();
        if (r < 0.07) sl.vipOnly = true;
        else if (r < 0.14) sl.privateOnly = true;
        else if (r < 0.2 && mins >= 17 * 60) sl.surcharge = flagRnd() < 0.5 ? 100 : 200;
        else if (r < 0.25) sl.fixedPrice = 900;
        else if (r < 0.3) { sl.available = false; sl.adminBlocked = true; }
      });
    }
    timeslots[dateStr] = day;
  }
  // один слот, який зараз «дивиться» учень (👁)
  const viewDate = ymd(addDays(today, 2));
  const vd = timeslots[viewDate];
  const vId = vd && Object.keys(vd).find((id) => vd[id].available === true && !vd[id].vipOnly && !vd[id].privateOnly && !vd[id].surcharge && !vd[id].fixedPrice);
  if (vId) vd[vId].viewing = { [STUDENTS[4].uid]: nowTs };

  // ── черга: охочі на вже зайняті майбутні слоти ───────────────
  const queue = {};
  const future = list.filter((x) => x.uid !== "personal" && x.b.status === "confirmed" && x.b.durMin === 60 && x.b.date >= ymd(addDays(today, 1)) && x.b.date <= ymd(addDays(today, 4)));
  const qStatuses = [["waiting", "waiting"], ["waiting"], ["waiting", "waiting"], ["offered"], ["waiting"], ["booked"]];
  future.filter((_, i) => i % 3 === 1).slice(0, 6).forEach(({ b }, qi) => {
    const key = `${b.date}_${b.time}`;
    const cands = STUDENTS.filter((s) => s.firstDay === null && s.uid !== list.find((x) => x.b === b)?.uid);
    (qStatuses[qi] || ["waiting"]).forEach((status, k) => {
      const st = cands[(qi * 3 + k * 5) % cands.length];
      (queue[key] ||= { entries: {} }).entries[st.uid] = {
        uid: st.uid, studentType: st.t, durationHours: 1, name: st.n, phone: st.phone,
        addedAt: nowTs - 3600000 * (qi + k + 1), status, order: qi * 2 + k,
      };
    });
  });

  // учениця, очима якої показано клієнтський застосунок, теж стоїть у черзі на один зайнятий слот
  {
    const me = STUDENTS[2];
    const qk = Object.keys(queue).find((k) => !queue[k].entries[me.uid] && !list.some((x) => x.uid === me.uid && `${x.b.date}_${x.b.time}` === k));
    if (qk) queue[qk].entries[me.uid] = { uid: me.uid, studentType: me.t, durationHours: 1, name: me.n, phone: me.phone, addedAt: nowTs - 7200000, status: "waiting", order: 9 };
  }

  // ── нотатки днів ─────────────────────────────────────────────
  const dayNotes = {
    [ymd(addDays(today, 2))]: { notes: { 9: { startMin: 9 * 60, text: "Забрати розпечатані маршрутні листи", notify: true } }, updatedAt: nowTs },
    [ymd(addDays(today, 4))]: { notes: { 15: { startMin: 15 * 60 + 30, text: "Нагадати про оплату за місяць", notify: false } }, updatedAt: nowTs },
  };

  // ── чати: кілька живих діалогів ──────────────────────────────
  const chats = { general: {}, __broadcast__: {} };
  const chatMeta = {};
  const mkMsg = (from, text, minsAgo) => {
    const ts = nowTs - minsAgo * 60000;
    const t = new Date(ts);
    return { from, text, time: `${pad(t.getHours())}:${pad(t.getMinutes())}`, ts };
  };
  const dialogs = [
    [STUDENTS[0], [["student", "Доброго дня! Підкажіть, чи можна перенести завтрашній урок на годину пізніше?", 190], ["admin", "Добрий день, Маріє! Так, ставлю на 11:00 ✅", 170], ["student", "Дякую велике!", 160]], 0],
    [STUDENTS[7], [["student", "Андрію, я трохи запізнюсь, буду за 10 хвилин", 35]], 1],
    [STUDENTS[3], [["admin", "Нагадую: завтра іспитний маршрут о 10:00", 600], ["student", "Прийняв, буду вчасно 👍", 540], ["student", "А документи брати з собою?", 30]], 1],
    [STUDENTS[10], [["student", "Чи є вільні години на суботу?", 300], ["admin", "Так, на 11:00 та 12:00 вільно — записуйтесь у застосунку", 280]], 0],
    [STUDENTS[2], [["admin", "Ірино, на п'ятницю з'явилось вікно о 16:00 — якщо хочете, запишіться в застосунку 🚗", 420], ["student", "Дякую! Вже записалась 😊", 380], ["admin", "Чудово, чекаю на вас!", 370]], 0],
    [STUDENTS[15], [["student", "Дякую за урок! Сьогодні вперше впевнено запаркувався", 1400]], 0],
  ];
  dialogs.forEach(([st, msgs, unread]) => {
    msgs.forEach(([from, text, ago], i) => { (chats[st.uid] ||= {})[`m${String(i).padStart(2, "0")}`] = mkMsg(from, text, ago); });
    chatMeta[st.uid] = { unreadForAdmin: unread };
  });
  [["student", STUDENTS[2], "Всім привіт! Хтось їздить у вихідні?", 900], ["admin", null, "Привіт! У суботу є вільні години — пишіть у чат", 880]].forEach(([from, st, text, ago], i) => {
    const m = mkMsg(from, text, ago);
    chats.general[`g${i}`] = from === "admin" ? { ...m, uid: "__admin__", name: "Інструктор" } : { ...m, uid: st.uid, name: st.n };
  });

  // ── сповіщення учня (кабінет клієнта в демо — це Ірина Бондаренко) ──
  const notifications = {};
  {
    const me = STUDENTS[2];
    const next = list.filter((x) => x.uid === me.uid && x.b.date >= ymd(today)).sort((a, c) => (a.b.date + a.b.time).localeCompare(c.b.date + c.b.time));
    const dl = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
    const mk = (type, title, body, minsAgo) => {
      const ts = nowTs - minsAgo * 60000, t = new Date(ts);
      return { type, title, body, date: `${pad(t.getDate())}.${pad(t.getMonth() + 1)}`, time: `${pad(t.getHours())}:${pad(t.getMinutes())}`, ts };
    };
    const n = (notifications[me.uid] = {});
    n.n1 = mk("admin_message", "Повідомлення від інструктора", "Ірино, на п'ятницю з'явилось вікно о 16:00 — якщо хочете, запишіться в застосунку 🚗", 420);
    if (next[0]) n.n2 = mk("booking_confirmed", "Запис підтверджено ✅", `Урок ${dl(next[0].b.date)} о ${next[0].b.time} підтверджено інструктором.`, 600);
    if (next[1]) n.n3 = mk("lesson_reminder_day", "Завтра урок 📅", `Нагадуємо: ${dl(next[1].b.date)} о ${next[1].b.time} у вас заняття. До зустрічі!`, 1500);
    n.n4 = mk("queue_offer", "Звільнилось місце 🎉", "У черзі на 16:00 з'явилось вільне місце — встигніть забронювати.", 2900);
    n.n5 = mk("system", "Вітаємо! 🎉", "Ваш профіль підключено. Забронюйте урок у вкладці «Запис».", 60 * 24 * 40);
  }

  // ── відгуки ──────────────────────────────────────────────────
  const reviews = {};
  [[0, "Дуже терпляче пояснює, після трьох занять вже не боюсь міста. Рекомендую!", 5], [3, "Чітка підготовка до іспиту, склав з першого разу.", 5], [9, "Зручна система запису — все в телефоні.", 5]].forEach(([si, text, rating], i) => {
    const st = STUDENTS[si];
    (reviews[st.uid] ||= {})[`r${i}`] = { text, rating, name: st.n, createdAt: nowTs - 86400000 * (i + 2), status: "approved" };
  });

  // ── налаштування інструктора ─────────────────────────────────
  const weekday = { enabled: true, start: 9, end: 19, lunchEnabled: true, lunchStart: 13, lunchEnd: 14 };
  const admin_settings = {
    profile: { name: "Андрій Мельник", phone: "+380990000000", address: "Київ, Оболонь", experience: 12, photo: null, slug: "demo", city: "Київ" },
    workStart: 8, workEnd: 20, weekends: [6], daysShown: 5, snapMin: 30, interval: 30, slotCreateStep: 30,
    hourHeightPx: 60, autoHourHeight: true,
    lunchEnabled: true, lunchStart: 13, lunchEnd: 14,
    weekSchedule: [weekday, weekday, weekday, weekday, weekday, { enabled: true, start: 10, end: 16, lunchEnabled: false, lunchStart: 13, lunchEnd: 14 }, { enabled: false, start: 9, end: 18, lunchEnabled: false, lunchStart: 13, lunchEnd: 14 }],
    dateOverrides: [], pendingEnabled: true, lockPastBookings: false,
    theme: demoTheme(), language: "uk",
    queueAutoFifo: true, queueBroadcast: false, queueManual: false,
    studentCanReschedule: true, studentCanCancel: true, bookCutoffHours: 2, calendarOpenDays: 30, schoolCalendarOpenDays: 14, slotGenDays: 30,
    stickyTime: "both", showCompleteBtn: true, showSlotTimes: true, autoStudentColors: true,
    surcharges: [100, 200, 300],
    categories: [{ id: "cat-vip", name: "VIP", colorId: "purple" }, { id: "cat-std", name: "Стандарт", colorId: "blue" }],
    services: SERVICES,
  };

  return {
    instructors: {
      [DEMO_UID]: {
        admin_settings,
        admin_data: { services: SERVICES },
        users, bookings, timeslots, queue, dayNotes, chats, chatMeta, reviews, notifications,
        license: { status: "active", plan: "year", expiresAt: nowTs + 86400000 * 240 },
      },
    },
  };
}
