// Вигадані дані салону для демо-режиму (?app=salon&demo=1): жодного звернення до справжнього Firebase.
import { toYMD, addDays, daySlotDocs, DEFAULT_WORK_HOURS, timeToMin, minToTime, slotIdOf } from "../salonLogic.js";

export function buildSalonDemoTree() {
  const now = Date.now(), today = toYMD(new Date()), tomorrow = addDays(today, 1);
  const wh = DEFAULT_WORK_HOURS.map((d) => ({ ...d, off: false, from: "09:00", to: "19:00" }));
  const book = (id, o) => ({ id, serviceId: "s1", serviceName: "Жіноча стрижка", price: 600, durationMin: 60, clientUid: "c1", clientName: "Олена Коваль", phone: "+380501112233", status: "confirmed", paymentMethod: "onsite", createdAt: now - 86400000, ...o });
  const bookings = {
    b1: book("b1", { masterId: "m1", date: today, time: "10:00" }),
    b2: book("b2", { masterId: "m1", date: today, time: "11:30", status: "pending", clientUid: "c2", clientName: "Ірина Шевченко", phone: "+380671234567", serviceId: "s2", serviceName: "Манікюр з покриттям", price: 700, durationMin: 90, paymentMethod: "online" }),
    b3: book("b3", { masterId: "m2", date: today, time: "12:00", clientUid: null, clientName: "Андрій (без акаунта)", phone: "+380931112244", serviceId: "s3", serviceName: "Чоловіча стрижка", price: 450, durationMin: 60, createdBy: "admin" }),
    b4: book("b4", { masterId: "m1", date: tomorrow, time: "14:00", clientUid: "c3", clientName: "Марія Петренко", phone: "+380991234455", serviceId: "s2", serviceName: "Манікюр з покриттям", price: 700, durationMin: 90, paymentMethod: "online", paymentStatus: "deposit_paid", paidAmount: 210, clientNote: "Френч, будь ласка" }),
    b5: book("b5", { masterId: "m2", date: addDays(today, -2), time: "15:00", status: "completed", clientUid: "c1", serviceId: "s3", serviceName: "Чоловіча стрижка", price: 450, paymentStatus: "paid", paidAmount: 450 }),
    b6: book("b6", { masterId: "m1", date: addDays(today, -3), time: "11:00", status: "completed", price: 600 }),
    b7: book("b7", { masterId: "m1", date: addDays(today, -1), time: "16:00", status: "cancelled", cancelledBy: "client", clientUid: "c2", clientName: "Ірина Шевченко" }),
    p1: { id: "p1", masterId: "m1", date: today, time: "14:00", durationMin: 60, status: "personal", clientName: "Обід", createdBy: "master", createdAt: now },
  };
  const timeslots = {};
  for (const mid of ["m1", "m2"]) {
    timeslots[mid] = {};
    for (let i = 0; i < 6; i++) {
      const date = addDays(today, i - 3);
      const day = daySlotDocs({ from: "09:00", to: "19:00" }, 30);
      for (const b of Object.values(bookings)) {
        if (b.masterId !== mid || b.date !== date || b.status === "cancelled") continue;
        for (let m = timeToMin(b.time); m < timeToMin(b.time) + b.durationMin; m += 30) if (day[slotIdOf(minToTime(m))]) day[slotIdOf(minToTime(m))].available = false;
      }
      if (mid === "m2" && i === 4) day.slot1500 = { time: "15:00", available: false, adminBlocked: true };
      timeslots[mid][date] = day;
    }
  }
  return { salons: { "demo-salon": {
    profile: { name: "Beauty Studio", slug: "beauty-studio", phone: "+380441234567", address: "Київ, вул. Хрещатик, 1", about: "Стрижки, манікюр, догляд", timezone: "Europe/Kyiv", slotStep: 30, createdAt: now - 30 * 86400000,
      payment: { enabled: true, hasToken: true, tokenLast4: "a1b2", depositPercent: 30, allowFull: true, holdMinutes: 15, cancelFreeHours: 24, autoConfirm: false } },
    license: { status: "trial", trialEndsAt: now + 9 * 86400000 },
    masters: { m1: { profile: { name: "Анна Мельник", spec: "Майстер манікюру", active: true, order: 0, workHours: wh } }, m2: { profile: { name: "Борис Литвин", spec: "Барбер", active: true, order: 1, workHours: wh } }, m3: { profile: { name: "Клара Бондар", spec: "Колорист", active: false, order: 2, workHours: wh } } },
    masterAuth: { "demo-salon": "m1" }, masterSettings: { m1: { uid: "demo-salon" } },
    services: {
      s1: { name: "Жіноча стрижка", category: "Стрижка", price: 600, duration: 60, masterIds: { m1: true, m2: true }, masterPrices: { m2: 550 }, active: true },
      s2: { name: "Манікюр з покриттям", category: "Манікюр", price: 700, duration: 90, masterIds: { m1: true }, masterPrices: {}, active: true },
      s3: { name: "Чоловіча стрижка", category: "Стрижка", price: 450, duration: 60, masterIds: { m2: true }, masterPrices: {}, active: true },
      s4: { name: "Догляд за бородою", category: "Догляд", price: 300, duration: 30, masterIds: { m2: true }, masterPrices: {}, active: true },
    },
    users: { c1: { profile: { name: "Олена Коваль", phone: "+380501112233" }, notes: "Алергія на аміак" }, c2: { profile: { name: "Ірина Шевченко", phone: "+380671234567" } }, c3: { profile: { name: "Марія Петренко", phone: "+380991234455" } } },
    bookings, timeslots,
    chatMeta: { c1: { name: "Олена Коваль", lastMsg: "Чи можна перенести на 12:00?", lastTs: now - 3600000, unreadForAdmin: 1 } },
    chats: { c1: { x1: { from: "client", text: "Добрий день! Чи можна перенести на 12:00?", ts: now - 3600000, time: "10:00" }, x2: { from: "admin", text: "Так, звісно, зараз перенесу.", ts: now - 3000000, time: "10:10" } } },
    masterChatMeta: { m1: { c2: { name: "Ірина Шевченко", lastMsg: "Дякую!", lastTs: now - 7200000, unreadForMaster: 0 } } },
    masterChats: { m1: { c2: { y1: { from: "master", text: "Чекаю вас о 11:30", ts: now - 8000000, time: "09:00" }, y2: { from: "client", text: "Дякую!", ts: now - 7200000, time: "09:30" } } } },
  } } };
}
