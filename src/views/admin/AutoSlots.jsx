// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useRef, useEffect } from "react";
import { update, get } from "firebase/database";
import { iRef, slotRoot, getActiveMaster, setActiveMaster, getCurrentIid } from "../../firebase";
import { bufferOf } from "../../addons";

// ═══════════════════════════════════════════════════════════════
// SCHEDULE VIEW with drag/resize + pinch-to-zoom + day-count
// ═══════════════════════════════════════════════════════════════
function computeDayUpdatesFor(settings, bookings, dateStr, existing, force = false, overridesParam) {
    const d = new Date(dateStr + "T12:00:00");
    const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    const ov = (overridesParam ?? settings.dateOverrides ?? []).find(o => o.date === dateStr);
    if (ov?.type === "closed") return null;
    const ws = (settings.weekSchedule || [])[dow] || {};
    // Явний override на конкретну дату (напр. "custom", доданий при відкритті
    // шаблонно-закритого дня) має пріоритет над тижневим шаблоном — інакше
    // масова регенерація (generateAllSlots, force=false) знову закриє день.
    if (!force && !ov && ws.enabled === false) return null;
    // When no per-day weekSchedule, fall back to global weekends list
    if (!force && !ov && !ws.start && (settings.weekends || []).includes(dow)) return null;
    const start        = ov?.start ?? ws.start ?? settings.workStart ?? 9;
    const end          = ov?.end   ?? ws.end   ?? settings.workEnd   ?? 18;
    const lunchEnabled = ov?.lunchEnabled ?? ws.lunchEnabled ?? settings.lunchEnabled ?? true;
    const lunchStart   = ov?.lunchStart   ?? ws.lunchStart   ?? settings.lunchStart  ?? 12;
    const lunchEnd     = ov?.lunchEnd     ?? ws.lunchEnd     ?? settings.lunchEnd    ?? 13;
    // Крок сітки — 1 година від старту робочого дня (мінімум годинний запис).
    // Якщо день починається на :30 (напр. 17:30), слоти йдуть 17:30, 18:30...
    // без проміжного 18:00 — тільки старти, розведені рівно на годину.
    const step = 60;
    const updates = {};
    let afterLunch = false;
    for (let min = Math.round(start * 60); min < Math.round(end * 60); min += step) {
      // Слот, що перетинає обід (навіть частково), не створюємо; сітка після
      // обіду стартує рівно з його кінця (обід 12:30–13:00 → ...11:00, 13:00, 14:00).
      if (lunchEnabled && lunchEnd > lunchStart && min < lunchEnd * 60 && min + step > lunchStart * 60) {
        min = lunchEnd * 60 - step;
        afterLunch = true;
        continue;
      }
      // Після обіду слот не повинен виходити за кінець робочого дня.
      if (afterLunch && min + step > end * 60) break;
      const h = String(Math.floor(min / 60)).padStart(2, "0");
      const m = String(min % 60).padStart(2, "0");
      const id = `slot${h}${m}`;
      if (!existing[id]?.adminBlocked) {
        updates[`${slotRoot()}/${dateStr}/${id}/time`] = `${h}:${m}`;
        updates[`${slotRoot()}/${dateStr}/${id}/available`] = true;
      }
    }
    const intervalMin = settings.snapMin ?? 30;
    bookings
      .filter(b => b.date === dateStr && b.status !== "cancelled")
      .forEach(b => {
        const bEnd = b.startMin + b.durMin;
        for (let cur = b.startMin; cur < bEnd + bufferOf(b); cur += intervalMin) {
          const h = String(Math.floor(cur / 60)).padStart(2, "0");
          const m = String(cur % 60).padStart(2, "0");
          const id = `slot${h}${m}`;
          // Перерва після запису: лише слоти, що щойно згенерувались у сітці дня (без phantom і без закритих майстром)
          if (cur >= bEnd && updates[`${slotRoot()}/${dateStr}/${id}/available`] !== true) continue;
          // Слот поза згенерованою сіткою (запис за межами робочих годин) —
          // позначаємо phantom для довідки; при скасуванні все одно стає вільним.
          if (!(`${slotRoot()}/${dateStr}/${id}/available` in updates)) {
            updates[`${slotRoot()}/${dateStr}/${id}/phantom`] = true;
          }
          updates[`${slotRoot()}/${dateStr}/${id}/available`] = false;
          updates[`${slotRoot()}/${dateStr}/${id}/time`] = `${h}:${m}`;
          updates[`${slotRoot()}/${dateStr}/${id}/bookingStart`] = cur === b.startMin;
        }
      });
    let free = 0, blocked = 0;
    Object.entries(updates).forEach(([k, v]) => {
      if (k.endsWith('/available')) { if (v === true) free++; else blocked++; }
    });
    return { updates, free, blocked };
}

const dateStrAhead = (absDay) => {
  const d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + absDay);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// «Автовідкриття слотів». Працює з моменту входу в застосунок, на будь-якій вкладці.
// Дні в межах slotGenDays, де слотів ще немає, заповнюються за тижневим шаблоном; закриті дні очищаються від вільних слотів.
// Кожен день заповнюється один раз (мітка autoSlotsDone/{дата}), тож вручну видалені слоти не повертаються.
export function AutoSlots({ settings, bookings, masterId }) { // masterId — явний майстер салону (режим «Усі»); інакше активний календар
  const busyRef = useRef(false), againRef = useRef(false), runRef = useRef(null), bookingsRef = useRef(bookings);
  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);
  useEffect(() => {
    if (!settings.autoSlots) return;
    const run = async () => {
      if (busyRef.current) { againRef.current = true; return { busy: true }; }
      busyRef.current = true;
      try {
        const target = masterId || getActiveMaster();
        const root = target && target !== getCurrentIid() ? `timeslots_m/${target}` : "timeslots";
        // Салон: у кожного майстра свої мітки днів (autoSlotsDone_m/{майстер}); у власника/«Один майстер» — autoSlotsDone як і раніше
        const doneRoot = root === "timeslots" ? "autoSlotsDone" : `autoSlotsDone_m/${target}`;
        const limit = settings.slotGenDays || 30;
        const days = Array.from({ length: limit + 1 }, (_, d) => dateStrAhead(d));
        const reads = await Promise.all(days.map(dateStr => Promise.all([get(iRef(`${doneRoot}/${dateStr}`)), get(iRef(`${root}/${dateStr}`))])));
        const all = {}, marks = {}, removals = {};
        const freeAuto = (sl) => sl?.available === true && !sl.vipOnly && !sl.privateOnly && !sl.surcharge && !sl.fixedPrice;
        days.forEach((dateStr, i) => {
          const [done, snap] = reads[i];
          const existing = snap.val() || {};
          // computeDayUpdatesFor синхронний і читає slotRoot() — на час виклику вмикаємо потрібного майстра
          const prevMaster = getActiveMaster();
          if (masterId) setActiveMaster(masterId);
          let result;
          try { result = computeDayUpdatesFor(settings, bookingsRef.current, dateStr, existing); } finally { if (masterId) setActiveMaster(prevMaster); }
          if (!result) {
            Object.entries(existing).forEach(([slotId, sl]) => { if (freeAuto(sl)) removals[`${root}/${dateStr}/${slotId}`] = null; });
            if (done.exists()) removals[`${doneRoot}/${dateStr}`] = null;
            return;
          }
          // Підпис сітки дня: змінився шаблон (обід, години) — день перебудовується
          const sig = Object.entries(result.updates).filter(([k]) => k.endsWith("/time")).map(([, v]) => v).sort().join(",");
          if (!done.exists() && snap.exists()) return;           // слоти заводились вручну — не чіпаємо
          if (!done.exists() || (done.val() !== sig && snap.exists())) {
            // вільні слоти поза новою сіткою (напр. годину обіду, яку додали пізніше) прибираємо
            Object.entries(existing).forEach(([slotId, sl]) => {
              const inGrid = `${root}/${dateStr}/${slotId}/time` in result.updates;
              if (!inGrid && freeAuto(sl)) removals[`${root}/${dateStr}/${slotId}`] = null;
            });
            Object.assign(all, result.updates);
            marks[`${doneRoot}/${dateStr}`] = sig;
          }
        });
        // Пачками: RTDB відхиляє один update() з надто великою кількістю ключів під тригерами (TOO_MANY_TRIGGERS)
        const chunked = async (u) => { const e = Object.entries(u); for (let i = 0; i < e.length; i += 400) await update(iRef(), Object.fromEntries(e.slice(i, i + 400))); };
        if (Object.keys(removals).length) await chunked(removals);
        if (Object.keys(all).length) { await chunked(all); await update(iRef(), marks); }
        return { days: Object.keys(marks).length, removed: Object.keys(removals).length };
      } catch (e) { console.error("autoSlots", e); return { error: String(e?.code || e?.message || e).slice(0, 80) }; }
      finally {
        busyRef.current = false;
        if (againRef.current) { againRef.current = false; runRef.current?.(); }
      }
    };
    runRef.current = run;
    // Кнопка «Заповнити зараз» у налаштуваннях: подія з callback, що отримує підсумок
    const onManual = (e) => { run().then(r => e.detail?.cb?.(r)); };
    window.addEventListener("autoslots-run", onManual);
    const t = setTimeout(run, 400);
    return () => { clearTimeout(t); window.removeEventListener("autoslots-run", onManual); };
  }, [settings.autoSlots, settings.slotGenDays, JSON.stringify(settings.weekSchedule), JSON.stringify(settings.dateOverrides)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export { computeDayUpdatesFor };
