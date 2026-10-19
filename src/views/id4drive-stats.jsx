import { useState, useEffect, useContext, useRef } from "react";
import { onValue, get, update } from "firebase/database";
import { iRef, auth } from "../firebase";
import { normStaff, masterOf } from "../workspace";
import { LangContext } from "../App";
import { createT } from "../lang";

import { ThemeContext } from "../theme.js";
import { UICss, Card, useFX, ScrollChips } from "../ui";
import { bookingAddonTotals } from "../addons";

const UK_MONTHS     = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
const UK_WEEK_LABELS= ["Пн","Вт","Ср","Чт","Пт","Сб"];

// ─── HELPERS ────────────────────────────────────────────────────
const fmtK = n => n>=1000?`${(n/1000).toFixed(1)}к ₴`:`${n} ₴`;

function getDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function bkType(b) { return b.serviceType || b.type || "private"; }
// Ціна послуги на дату запису: якщо задано nextPrice/nextPriceFrom і дата
// запису вже досягла nextPriceFrom — використовуємо нову ціну (див. id4drive-admin-v5.jsx).
function effectivePrice(svc, dateStr) {
  if (!svc) return 0;
  if (svc.nextPrice != null && svc.nextPriceFrom && dateStr && dateStr >= svc.nextPriceFrom) {
    return svc.nextPrice;
  }
  return svc.price;
}
function bkIncome(b, svcs) {
  if (b.manualPrice != null) return b.manualPrice;
  if (b.packageId && !b.packageError) return bookingAddonTotals(b).price; // послуга оплачена пакетом
  if (typeof b.price === "number" && b.price > 0 && Math.round((b.durationHours != null ? b.durationHours : (b.durMin||60)/60) * 60) === (b.durMin || 60)) return b.price;
  const svc = (svcs||[]).find(s => s.id === b.serviceId);
  const dur = b.durMin || (b.durationHours ? b.durationHours * 60 : 60);
  // Допуслуги: їхні хвилини не множаться на тариф, ціна додається окремо
  const ax = bookingAddonTotals(b);
  if (svc && svc.price && svc.duration) return Math.round((effectivePrice(svc, b.date) / svc.duration) * Math.max(0, dur - ax.minutes)) + ax.price;
  if (b.price && b.durationHours && b.durMin) return Math.round((b.price / (b.durationHours * 60)) * b.durMin);
  return b.price || 0;
}

// Сусідні (без розриву в часі) записи одного клієнта в один день адмінка
// показує ОДНІЄЮ карткою в розкладі — тут так само рахуємо їх ОДНИМ записом,
// а не по кожному окремому Firebase-запису (інакше 2-годинний запис,
// збережений як два сусідні 1-годинні записи, рахувався як "2 записи").
function markMergedContinuations(bookings) {
  const byGroup = {};
  bookings.forEach(b => {
    const st = b.status || "confirmed";
    if ((st !== "confirmed" && st !== "pending") || !b.date || b.startMin == null || !b.durMin) return;
    (byGroup[`${b.date}_${b._uid}`] ||= []).push(b);
  });
  const continuations = new Set();
  Object.values(byGroup).forEach(list => {
    list.sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < list.length; i++) {
      if (list[i].startMin === list[i-1].startMin + list[i-1].durMin) continuations.add(list[i]._key);
    }
  });
  return continuations;
}

function aggregateBuckets(buckets, bookings, getKey, svcs) {
  const map = {};
  buckets.forEach(b => { map[b.key] = { ...b, income:0, lessons:0, hours:0, school:0, private:0, noshow:0, cancel:0 }; });
  const continuations = markMergedContinuations(bookings);
  bookings.forEach(b => {
    const k = getKey(b);
    if (!map[k]) return;
    const st = b.status || "confirmed";
    if (st === "confirmed" || st === "pending") {
      map[k].income += bkIncome(b, svcs);
      // Годин рахуємо по КОЖНОМУ запису (не по злитих записах) — запис може
      // тривати 2-3 години і складатись з кількох сусідніх записів.
      map[k].hours += (b.durMin || (b.durationHours ? b.durationHours*60 : 60)) / 60;
      if (!continuations.has(b._key)) {
        map[k].lessons += 1;
        if (bkType(b) === "school") map[k].school++;
        else map[k].private++;
      }
    } else if (st === "noshow")    { map[k].noshow++; }
    else if (st === "cancelled")  { map[k].cancel++; }
  });
  return buckets.map(b => map[b.key]);
}

function computeDayData(bookings, offsetDays = 0, svcs) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const dateStr = getDateStr(d);
  const buckets = Array.from({length: 10}, (_, i) => {
    const h = 8 + i;
    return { key: `${dateStr}_${h}`, label: `${String(h).padStart(2,'0')}:00` };
  });
  return aggregateBuckets(buckets, bookings, b => {
    if (!b.date || b.date !== dateStr) return '';
    const h = parseInt((b.time || '').split(':')[0], 10);
    return `${b.date}_${h}`;
  }, svcs);
}

function computeWeekData(bookings, offset = 0, svcs) {
  const now = new Date();
  const wd  = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (wd === 0 ? 6 : wd - 1) + offset * 7);
  weekStart.setHours(0, 0, 0, 0);
  const buckets = UK_WEEK_LABELS.map((label, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    return { key: getDateStr(d), label };
  });
  return aggregateBuckets(buckets, bookings, b => b.date || "", svcs);
}

// Бакети по днях довільного місяця (рік/місяць передаються напряму —
// потрібно для навігації календаря вперед/назад, не лише "поточний ± offset").
function computeCalendarMonthData(bookings, year, month, svcs) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const buckets = Array.from({length: daysInMonth}, (_, i) => {
    const d = new Date(year, month, i + 1);
    return { key: getDateStr(d), label: String(i + 1) };
  });
  return aggregateBuckets(buckets, bookings, b => b.date || "", svcs);
}

function computeMonthData(bookings, offsetMonths = 0, svcs) {
  const now = new Date();
  return computeCalendarMonthData(bookings, now.getFullYear(), now.getMonth() + offsetMonths, svcs);
}

function computeYearData(bookings, offsetYears = 0, svcs) {
  const now = new Date();
  const buckets = Array.from({length: 12}, (_, i) => {
    const d = new Date(now.getFullYear() + offsetYears, now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return { key, label: UK_MONTHS[d.getMonth()] };
  });
  return aggregateBuckets(buckets, bookings, b => (b.date||"").slice(0, 7), svcs);
}

function filterByPeriod(bookings, data, period) {
  const keys = new Set(data.map(b => b.key));
  return bookings.filter(b => {
    if (period === 'day') return keys.has(`${b.date}_${parseInt((b.time||'').split(':')[0], 10)}`);
    if (period === 'week' || period === 'month' || period === 'custom') return keys.has(b.date||'');
    return keys.has((b.date||'').slice(0, 7));
  });
}

// Довільний набір обраних днів (не обов'язково суцільний діапазон) —
// з календаря можна вибрати кілька окремих смуг днів довгим тапом+протяжкою.
function computeSelectedDaysData(bookings, selectedDates, svcs) {
  const sorted = [...selectedDates].sort();
  const buckets = sorted.map(dateStr => {
    const d = new Date(dateStr + "T00:00:00");
    return { key: dateStr, label: `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}` };
  });
  return aggregateBuckets(buckets, bookings, b => b.date || '', svcs);
}

function computeTopStudents(bookings, sortBy = 'paid', svcs) {
  const map = {};
  bookings.filter(b => b.status === "confirmed" || b.status === "pending").forEach(b => {
    const name = b.studentName || b.name || "Без імені";
    if (!map[name]) {
      map[name] = {
        name, paid: 0, hours: 0,
        type: bkType(b),
        hue: Math.abs((name.charCodeAt(0)||0)*53 + (name.charCodeAt(1)||0)*17) % 360,
      };
    }
    map[name].paid  += bkIncome(b, svcs);
    map[name].hours += (b.durMin || (b.durationHours ? b.durationHours*60 : 60)) / 60;
  });
  return Object.values(map)
    .sort((a, b) => sortBy === 'lessons' ? b.hours - a.hours : b.paid - a.paid)
    .slice(0, 5)
    .map(s => ({...s, hours: Math.round(s.hours * 10) / 10}));
}

function computePopularSlots(bookings, svcs) {
  const map = {};
  bookings.filter(b => (b.status === "confirmed" || b.status === "pending") && b.time).forEach(b => {
    const h = String(parseInt((b.time||'').split(':')[0], 10)).padStart(2,'0');
    if (!map[h]) map[h] = { hour: `${h}:00`, count: 0, income: 0 };
    map[h].count++;
    map[h].income += bkIncome(b, svcs);
  });
  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6);
}


function periodSum(data) {
  return {
    income:  data.reduce((s, d) => s + d.income,  0),
    lessons: data.reduce((s, d) => s + d.lessons, 0),
    noshow:  data.reduce((s, d) => s + (d.noshow||0), 0),
  };
}

function trendPct(cur, prev) {
  if (!prev) return null; // немає з чим порівнювати — не вигадуємо фальшиві +100%
  return Math.round(((cur - prev) / prev) * 100);
}

// ─── CHIP ────────────────────────────────────────────────────────
const Chip = ({label, active, onClick, color}) => {
  const { ACC_HI, ACCENT, SURF_HI, SURFACE, DIM, SO, FOG, TEXT } = useContext(ThemeContext);
  if (FOG && !color) return (
    <button onClick={onClick} style={{
      flex:"1 1 0", minWidth:0, padding:"9px 0", borderRadius:11, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"inherit", textAlign:"center", whiteSpace:"nowrap",
      background: active ? SURF_HI : "transparent", color: active ? TEXT : DIM, boxShadow: active ? "0 2px 8px rgba(0,0,0,.12)" : "none",
    }}>{label}</button>
  );
  return (
    <button onClick={onClick} style={{
      flex:1, padding:"7px 4px", borderRadius:9, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", textAlign:"center",
      background: active ? `linear-gradient(145deg,${color||ACC_HI},${color?color+"bb":ACCENT})` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
      color: active ? "#fff" : DIM, boxShadow: active ? "none" : SO,
    }}>{label}</button>
  );
};

// ─── MAIN ────────────────────────────────────────────────────────
export default function StatsView() {
  const { BG_DEEP, SURFACE, SURF_HI, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, PURPLE, GOLD, RED, SO, SI } = useContext(ThemeContext);
  const lang = useContext(LangContext);
  const t = createT(lang);
  const [period,     setPeriod]    = useState("month");
  const [bookingsRaw, setBookings] = useState([]);
  const [staff,      setStaff]     = useState([]);   // салон: склад майстрів (порожній — «Один майстер»)
  const [masterFilter, setMasterFilter] = useState(""); // "" — усі майстри
  const [services,   setServices]  = useState([]);
  const [topBy,      setTopBy]     = useState("paid");
  const [selectedDays, setSelectedDays] = useState(() => new Set());
  const today0 = new Date();
  const [calViewY, setCalViewY] = useState(today0.getFullYear());
  const [calViewM, setCalViewM] = useState(today0.getMonth());
  const [calDragPreview, setCalDragPreview] = useState(null); // { start, end } — дні поточного місяця під час протяжки
  const calGridRef = useRef(null);
  const calPressRef = useRef(null); // { day, startX, startY, longPressed, swiping }
  const calHoldTimerRef = useRef(null);
  const [incomeGoal,  setIncomeGoal]  = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput,   setGoalInput]   = useState("");

  const css = `
@keyframes bar-grow{from{height:0%}to{height:var(--h)}}
@keyframes line-draw{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}
.line-anim{animation:line-draw 1s ease both}
@keyframes fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fu{animation:fade-up .2s ease both}
`;

  useEffect(() => {
    return onValue(iRef( "bookings"), snap => {
      const d = snap.val();
      if (!d) { setBookings([]); return; }
      const all = [];
      Object.entries(d).forEach(([uid, userBkgs]) => {
        if (!userBkgs) return;
        Object.entries(userBkgs).forEach(([bkId, raw]) => {
          if (!raw) return;
          all.push({ ...raw, _uid: uid, _key: bkId,
            name: raw.studentName || raw.name || "Без імені",
          });
        });
      });
      setBookings(all);
    }, () => {});
  }, []);

  useEffect(() => {
    const owner = auth.currentUser?.uid || "";
    return onValue(iRef("staff"), snap => setStaff(snap.exists() ? normStaff(snap.val(), owner) : []), () => {});
  }, []);

  useEffect(() => {
    return onValue(iRef( "admin_settings/services"), snap => {
      const d = snap.val();
      setServices(Array.isArray(d) ? d : []);
    }, () => {});
  }, []);

  useEffect(() => {
    get(iRef( "admin_settings/incomeGoal")).then(s => { if (s.exists()) setIncomeGoal(s.val() || 0); }).catch(() => {});
  }, []);

  // Салон: фільтр по майстру (записи без masterId — власника)
  const ownerUid = auth.currentUser?.uid || "";
  const bookings = masterFilter ? bookingsRaw.filter(b => masterOf(b, ownerUid) === masterFilter) : bookingsRaw;
  const periodData = (list) => period === "week"   ? computeWeekData(list, 0, services)
                 : period === "year"   ? computeYearData(list, 0, services)
                 : period === "day"    ? computeDayData(list, 0, services)
                 : period === "custom" ? computeSelectedDaysData(list, selectedDays, services)
                 :                       computeMonthData(list, 0, services);
  const perMaster = staff.length > 1 ? staff.map(m => ({ m, ...periodSum(periodData(bookingsRaw.filter(b => masterOf(b, ownerUid) === m.id))) })) : [];

  const data     = periodData(bookings);

  const prevData = period === "custom" ? data
                 : period === "week"   ? computeWeekData(bookings, -1, services)
                 : period === "year"   ? computeYearData(bookings, -1, services)
                 : period === "day"    ? computeDayData(bookings, -1, services)
                 :                       computeMonthData(bookings, -1, services);

  const cur  = periodSum(data);
  const prev = periodSum(prevData);

  const totalIncome  = cur.income;
  const totalLessons = cur.lessons;
  const totalSchool  = data.reduce((s, d) => s + d.school,  0);
  const totalPrivate = data.reduce((s, d) => s + d.private, 0);
  const totalHours   = Math.round(data.reduce((s, d) => s + (d.hours||0), 0) * 10) / 10;
  const prevHours    = Math.round(prevData.reduce((s, d) => s + (d.hours||0), 0) * 10) / 10;

  const todayStr = getDateStr(new Date());
  const curMonthStr = todayStr.slice(0,7);
  // Поточний — дохід за вже минулі/сьогоднішні дні місяця (реально відбулось).
  // Прогнозований — + вже заброньовані майбутні записи цього місяця (не
  // статистична екстраполяція, а реальні записи, що йдуть наперед).
  const curMonthCurrent = bookings
    .filter(b => (b.status === "confirmed" || b.status === "pending") && (b.date||"").startsWith(curMonthStr) && (b.date||"") <= todayStr)
    .reduce((s, b) => s + bkIncome(b, services), 0);
  const curMonthForecast = bookings
    .filter(b => (b.status === "confirmed" || b.status === "pending") && (b.date||"").startsWith(curMonthStr))
    .reduce((s, b) => s + bkIncome(b, services), 0);

  const periodBookings = filterByPeriod(bookings, data, period);
  const topStudents  = computeTopStudents(periodBookings, topBy, services);
  const popularSlots = computePopularSlots(periodBookings, services);
  const byPeriodLabel= period === "day" ? "По годинах" : period === "year" ? "По місяцях" : "По днях";

  // Календар завжди на екрані (замість модалки/полів дат) — швидкий вибір
  // місяця (тап на назву місяця), тижня чи конкретного дня (тап на день).
  const calMonthData = computeCalendarMonthData(bookings, calViewY, calViewM, services);
  const calFirstDow  = (new Date(calViewY, calViewM, 1).getDay() + 6) % 7;
  const calDaysInMonth = new Date(calViewY, calViewM + 1, 0).getDate();
  const calMonthLabel = new Date(calViewY, calViewM, 1).toLocaleDateString("uk-UA", { month: "long", year: "numeric" }).replace(/\s*р\.?$/i, "");
  const calGoMonth = (delta) => {
    let m = calViewM + delta, y = calViewY;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setCalViewM(m); setCalViewY(y);
  };
  const calTierColor = (n) => n <= 3 ? RED : n <= 6 ? GOLD : GREEN;

  // Швидкий тап на день — перемикає ЛИШЕ цей день (додає/прибирає з вибору),
  // інші раніше обрані дні залишаються — скинути все можна кнопкою "✕ Скинути".
  const calPickDay = (dateStr) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr);
      return next;
    });
    setPeriod("custom");
  };
  // Тап на назву місяця — додає весь видимий місяць до вибору; повторний
  // тап (коли місяць вже повністю обрано) прибирає ці дні назад.
  const calPickMonth = () => {
    const monthDates = Array.from({length: calDaysInMonth}, (_, i) => getDateStr(new Date(calViewY, calViewM, i + 1)));
    const allSelected = monthDates.every(d => selectedDays.has(d));
    setSelectedDays(prev => {
      const next = new Set(prev);
      monthDates.forEach(d => allSelected ? next.delete(d) : next.add(d));
      return next;
    });
    setPeriod("custom");
  };
  // Довгий тап + протяжка додає ЦІЛУ смугу днів до вже обраних (не замінює —
  // так можна зібрати кілька окремих смуг за кілька жестів поспіль).
  const calCommitDragRange = (startDay, endDay) => {
    const lo = Math.min(startDay, endDay), hi = Math.max(startDay, endDay);
    setSelectedDays(prev => {
      const next = new Set(prev);
      for (let d = lo; d <= hi; d++) next.add(getDateStr(new Date(calViewY, calViewM, d)));
      return next;
    });
    setPeriod("custom");
  };
  const calClearSelection = () => setSelectedDays(new Set());

  const CAL_HOLD_MS = 380, CAL_MOVE_TOL = 10, CAL_SWIPE_MIN = 44;
  const calDayFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-cal-day]');
    return el ? parseInt(el.getAttribute('data-cal-day'), 10) : null;
  };
  const calOnPointerDown = (e) => {
    const el = e.target.closest('[data-cal-day]');
    if (!el) return;
    const day = parseInt(el.getAttribute('data-cal-day'), 10);
    calPressRef.current = { day, startX: e.clientX, startY: e.clientY, longPressed: false, swiping: false };
    calHoldTimerRef.current = setTimeout(() => {
      const p = calPressRef.current;
      if (!p || p.swiping) return;
      p.longPressed = true;
      setCalDragPreview({ start: p.day, end: p.day });
    }, CAL_HOLD_MS);
  };
  const calOnPointerMove = (e) => {
    const p = calPressRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
    if (p.longPressed) {
      const day = calDayFromPoint(e.clientX, e.clientY);
      if (day != null) setCalDragPreview(prev => prev ? { ...prev, end: day } : { start: p.day, end: day });
      return;
    }
    if (!p.swiping && (Math.abs(dx) > CAL_MOVE_TOL || Math.abs(dy) > CAL_MOVE_TOL)) {
      if (Math.abs(dx) > Math.abs(dy) * 1.4) { p.swiping = true; clearTimeout(calHoldTimerRef.current); }
      else { calPressRef.current = null; clearTimeout(calHoldTimerRef.current); }
    }
  };
  const calEndGesture = (e) => {
    clearTimeout(calHoldTimerRef.current);
    const p = calPressRef.current;
    calPressRef.current = null;
    if (!p) { setCalDragPreview(null); return; }
    if (p.longPressed) {
      const preview = calDragPreview;
      setCalDragPreview(null);
      if (preview) calCommitDragRange(preview.start, preview.end);
      return;
    }
    if (p.swiping) {
      const dx = (e.clientX ?? p.startX) - p.startX;
      if (dx <= -CAL_SWIPE_MIN) calGoMonth(1);
      else if (dx >= CAL_SWIPE_MIN) calGoMonth(-1);
      return;
    }
    const day = calDayFromPoint(e.clientX ?? p.startX, e.clientY ?? p.startY) ?? p.day;
    calPickDay(getDateStr(new Date(calViewY, calViewM, day)));
  };
  const calOnPointerCancel = () => {
    clearTimeout(calHoldTimerRef.current);
    calPressRef.current = null;
    setCalDragPreview(null);
  };

  const selectedStrips = (() => {
    if (!selectedDays.size) return [];
    const sorted = [...selectedDays].sort();
    const strips = [];
    let curStart = sorted[0], curEnd = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const diff = Math.round((new Date(sorted[i]+"T00:00:00") - new Date(curEnd+"T00:00:00")) / 86400000);
      if (diff === 1) { curEnd = sorted[i]; }
      else { strips.push([curStart, curEnd]); curStart = sorted[i]; curEnd = sorted[i]; }
    }
    strips.push([curStart, curEnd]);
    return strips;
  })();
  const fmtDM = (dateStr) => { const d = new Date(dateStr+"T00:00:00"); return `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`; };

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{display:"flex",flexDirection:"column",gap:8,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── PERIOD ── */}
        <div style={{display:"flex",gap:0,background:SURFACE,padding:3,borderRadius:14,border:`1px solid ${BORDER}`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)"}}>
          {[["day","День"],["week",t('st2.week')],["month",t('st2.month')],["year",t('st2.year')],["custom","Період"]].map(([k,l])=>(
            <Chip key={k} label={l} active={period===k} onClick={()=>setPeriod(k)}/>
          ))}
        </div>

        {/* ── САЛОН: фільтр по майстру ── */}
        {staff.length > 1 && (
          <ScrollChips activeKey={masterFilter}>
            {[{ id:"", name:"Усі майстри", color:ACCENT }, ...staff].map(m => {
              const on = masterFilter === m.id;
              return (
                <button key={m.id || "all"} onClick={()=>setMasterFilter(m.id)} style={{
                  flex:"1 0 auto",justifyContent:"center",display:"flex",alignItems:"center",gap:7,padding:"8px 13px",borderRadius:99,cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:600,whiteSpace:"nowrap",
                  border:`1px solid ${on ? m.color : BORDER}`,background:on?`color-mix(in srgb,${m.color} 26%,transparent)`:SURFACE,color:on?TEXT:DIM,
                }}>
                  {m.id && <span style={{width:10,height:10,borderRadius:"50%",background:m.color}}/>}{m.name}
                </button>
              );
            })}
          </ScrollChips>
        )}

        {/* ── CALENDAR (завжди відкритий — швидкий вибір місяця/тижня/дня) ── */}
        <Card className="fu" style={{padding:"12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:11}}>
            <button onClick={()=>calGoMonth(-1)} style={{
              width:36,height:36,borderRadius:99,border:`1px solid ${BORDER}`,cursor:"pointer",fontFamily:"inherit",
              background:SURF_HI,color:DIM,fontSize:18,fontWeight:700,lineHeight:1,
            }}>‹</button>
            <button onClick={calPickMonth} title="Обрати весь місяць" style={{
              border:"none",cursor:"pointer",fontFamily:"inherit",background:"transparent",
              fontSize:13,fontWeight:800,color:TEXT,textTransform:"capitalize",padding:"0 10px",minHeight:36,borderRadius:8,
            }}>{calMonthLabel}</button>
            <button onClick={()=>calGoMonth(1)} style={{
              width:36,height:36,borderRadius:99,border:`1px solid ${BORDER}`,cursor:"pointer",fontFamily:"inherit",
              background:SURF_HI,color:DIM,fontSize:18,fontWeight:700,lineHeight:1,
            }}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4}}>
            {["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].map(d=>(
              <div key={d} style={{textAlign:"center",fontSize:11,color:DIM,fontWeight:700,textTransform:"uppercase"}}>{d}</div>
            ))}
          </div>
          <div
            ref={calGridRef}
            onPointerDown={calOnPointerDown}
            onPointerMove={calOnPointerMove}
            onPointerUp={calEndGesture}
            onPointerCancel={calOnPointerCancel}
            onPointerLeave={(e)=>{ if (calPressRef.current && !calPressRef.current.longPressed && !calPressRef.current.swiping) calOnPointerCancel(); }}
            style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,touchAction:"pan-y",userSelect:"none"}}
          >
            {Array.from({length:calFirstDow}, (_,i)=><div key={`b${i}`}/>)}
            {Array.from({length:calDaysInMonth}, (_,i)=>{
              const day = i+1;
              const dateStr = getDateStr(new Date(calViewY, calViewM, day));
              const bucket = calMonthData[i];
              const n = bucket ? bucket.lessons : 0;
              const isToday = dateStr === todayStr;
              const isSel = period === "custom" && selectedDays.has(dateStr);
              const inPreview = calDragPreview && day >= Math.min(calDragPreview.start,calDragPreview.end) && day <= Math.max(calDragPreview.start,calDragPreview.end);
              let bg = SURF_HI, color = DIM;
              if (n > 0) { const tier = calTierColor(n); bg = `color-mix(in srgb,${tier} 22%,transparent)`; color = `color-mix(in srgb,${tier} 55%,#fff)`; }
              if (inPreview) { bg = `${ACCENT}45`; color = ACCENT; }
              return (
                <button key={day} data-cal-day={day} style={{
                  height:34, borderRadius:11, cursor:"pointer", fontFamily:"inherit",
                  border: isToday ? `1.5px solid ${ACCENT}` : inPreview ? `1px solid ${ACCENT}` : `1px solid ${BORDER}`,
                  background: isSel ? `linear-gradient(145deg,${ACC_HI},${ACCENT})` : bg,
                  color: isSel ? "#04231f" : color,
                  fontSize:12, fontWeight:700,
                }}>{day}</button>
              );
            })}
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:8}}>
            {[[RED,"мало"],[GOLD,"середньо"],[GREEN,"багато"]].map(([c,l])=>(
              <span key={l} style={{fontSize:11,color:FAINT,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                <i style={{width:8,height:8,borderRadius:3,background:c,display:"inline-block"}}/>{l}
              </span>
            ))}
          </div>
          {period === "custom" && selectedStrips.length > 0 && (
            <div style={{marginTop:9,display:"flex",alignItems:"center",gap:6}}>
              <div style={{flex:1,textAlign:"center",fontSize:11,fontWeight:700,color:ACCENT,background:`${ACCENT}1a`,borderRadius:8,padding:"6px 8px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {selectedStrips.map(([s,e])=> s===e ? fmtDM(s) : `${fmtDM(s)}–${fmtDM(e)}`).join(", ")}
              </div>
              <button onClick={calClearSelection} title="Скинути вибір" style={{
                flexShrink:0, padding:"6px 9px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit",
                background:SURF_HI, color:FAINT, fontSize:11, fontWeight:700,
              }}>✕</button>
            </div>
          )}
        </Card>

        {/* ── KPI 3 ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
          {[
            {label:"Дохід",        value:fmtK(totalIncome),               color:GOLD,  trend:trendPct(cur.income,  prev.income)},
            {label:"Записів",       value:totalLessons,                    color:BLUE,  trend:trendPct(cur.lessons, prev.lessons)},
            {label:"Години",       value:totalHours,                      color:GREEN, trend:trendPct(totalHours, prevHours)},
          ].map((k, i) => (
            <Card key={i} className="fu" style={{
              padding:"10px 9px",
              background:`color-mix(in srgb,${k.color} 18%,transparent)`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
              border:`1px solid color-mix(in srgb,${k.color} 30%,transparent)`,
              textAlign:"center",
            }}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",letterSpacing:0.6,textTransform:"uppercase",fontWeight:600,marginBottom:6}}>{k.label}</div>
              <div style={{fontSize:"min(21px,4.5vw)",fontWeight:800,color:"#fff",letterSpacing:-0.3,lineHeight:1.05,whiteSpace:"nowrap"}}>{k.value}</div>
              {(k.extra || (k.trend != null && k.trend !== 0)) && (
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:5,marginTop:5,flexWrap:"wrap"}}>
                  {k.extra && <span style={{fontSize:11,color:"rgba(255,255,255,0.74)",fontWeight:600}}>{k.extra}</span>}
                  {k.trend != null && k.trend !== 0 && (
                    <span style={{
                      fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:99,
                      color:`color-mix(in srgb,${k.trend>=0?GREEN:RED} 55%,#fff)`,
                      background:k.trend>=0?`${GREEN}1f`:`${RED}1f`,
                    }}>{k.trend>=0?"+":""}{k.trend}%</span>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* ── ПО МАЙСТРАХ (салон, усі майстри) ── */}
        {perMaster.length > 0 && !masterFilter && (
          <Card className="fu" style={{padding:"12px 13px"}}>
            <div style={{fontSize:11,color:DIM,letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>По майстрах</div>
            {perMaster.map(({ m, income, lessons }) => (
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderTop:`1px solid ${BORDER}`}}>
                <span style={{width:11,height:11,borderRadius:"50%",background:m.color,flexShrink:0}}/>
                <span style={{flex:1,minWidth:0,fontSize:14,fontWeight:600,color:TEXT,overflowWrap:"anywhere"}}>{m.name}</span>
                <span style={{fontSize:12,color:DIM}}>{lessons} зап.</span>
                <span style={{fontSize:14,fontWeight:700,color:TEXT,minWidth:70,textAlign:"right"}}>{fmtK(income)}</span>
              </div>
            ))}
          </Card>
        )}

        {/* ── INCOME GOAL ── */}
        <Card className="fu" style={{padding:"12px 13px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:editingGoal?10:incomeGoal?9:4}}>
            <div style={{fontSize:11,color:DIM,letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>🎯 Ціль місяця</div>
            {!editingGoal && (
              <button onClick={()=>{setGoalInput(String(incomeGoal||""));setEditingGoal(true);}} style={{
                padding:"7px 11px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
                background:`${GOLD}22`,color:GOLD,
              }}>{incomeGoal?"✏️":"+ Встановити"}</button>
            )}
          </div>
          {editingGoal ? (
            <div style={{display:"flex",gap:7}}>
              <input autoFocus type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)} placeholder="напр. 30000"
                style={{flex:1,background:BG_DEEP,border:`1px solid ${BORDER}`,borderRadius:9,padding:"8px 12px",color:TEXT,fontSize:14,fontFamily:"inherit",outline:"none",colorScheme:"dark"}}/>
              <button onClick={()=>{
                const val=Math.max(0,parseInt(goalInput,10)||0);
                setIncomeGoal(val);
                update(iRef( "admin_settings"),{incomeGoal:val}).catch(()=>{});
                setEditingGoal(false);
              }} style={{
                padding:"8px 14px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,
                background:`linear-gradient(145deg,${GOLD}44,${GOLD}22)`,color:GOLD,
              }}>OK</button>
              <button onClick={()=>setEditingGoal(false)} style={{
                padding:"8px 10px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,
                background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:FAINT,
              }}>✕</button>
            </div>
          ) : incomeGoal > 0 ? (
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:curMonthForecast>curMonthCurrent?7:11}}>
                <div>
                  <div style={{fontSize:24,fontWeight:900,color:GOLD,lineHeight:1}}>{fmtK(incomeGoal)}</div>
                  <div style={{fontSize:11,color:FAINT,marginTop:3}}>ціль місяця</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:16,fontWeight:800,color:curMonthCurrent>=incomeGoal?GREEN:TEXT,lineHeight:1}}>{fmtK(curMonthCurrent)}</div>
                  <div style={{fontSize:11,color:FAINT,marginTop:3}}>вже зароблено</div>
                </div>
              </div>
              {curMonthForecast > curMonthCurrent && (
                <div style={{fontSize:11,color:ACCENT,fontWeight:700,marginBottom:7}}>
                  прогноз із записами наперед: {fmtK(curMonthForecast)}
                </div>
              )}
              <div style={{height:8,background:BG_DEEP,borderRadius:5,boxShadow:SI,overflow:"hidden",marginBottom:6,position:"relative"}}>
                {curMonthForecast > curMonthCurrent && (
                  <div style={{
                    position:"absolute", inset:0, borderRadius:5,
                    width:`${Math.min(100,Math.round((curMonthForecast/incomeGoal)*100))}%`,
                    background:`${ACCENT}40`,
                  }}/>
                )}
                <div style={{
                  position:"relative", height:"100%",
                  width:`${Math.min(100,Math.round((curMonthCurrent/incomeGoal)*100))}%`,
                  borderRadius:5,
                  background:curMonthCurrent>=incomeGoal?`linear-gradient(90deg,${GREEN},#22c55e)`:`linear-gradient(90deg,${GOLD},${GREEN})`,
                  transition:"width .6s ease",
                }}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:11,fontWeight:800,color:curMonthCurrent>=incomeGoal?GREEN:FAINT}}>
                  {Math.min(100,Math.round((curMonthCurrent/incomeGoal)*100))}%
                </span>
                {curMonthCurrent<incomeGoal
                  ? <span style={{fontSize:11,color:FAINT}}>залишилось {fmtK(incomeGoal-curMonthCurrent)}</span>
                  : <span style={{fontSize:11,color:GREEN,fontWeight:700}}>🎉 Ціль досягнута!</span>
                }
              </div>
            </>
          ) : (
            <div style={{fontSize:11,color:DIM}}>Встановіть ціль доходу на місяць</div>
          )}
        </Card>

        {/* ── РОЗПОДІЛ + ПО ДНЯХ ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          <Card className="fu" style={{
            padding:"12px",
            background:`color-mix(in srgb,${GREEN} 18%,transparent)`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:`1px solid color-mix(in srgb,${GREEN} 24%,transparent)`,
          }}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:7}}>Розподіл</div>
            {(() => {
              const totalRatio = totalSchool + totalPrivate;
              const schoolPct = totalRatio ? Math.round((totalSchool/totalRatio)*100) : 0;
              return (
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {[[GREEN,"Стандарт",totalSchool,schoolPct],[GOLD,"Індивідуальний",totalPrivate,100-schoolPct]].map(([c,l,v,pct])=>(
                    <div key={l} style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",rowGap:2}}>
                      <i style={{width:7,height:7,borderRadius:2,background:c,flexShrink:0}}/>
                      <span style={{flex:"1 1 auto",fontSize:11,color:"rgba(255,255,255,0.85)"}}>{l}</span>
                      <span style={{fontSize:12,fontWeight:900,color:c}}>{v}</span>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.75)",width:30,textAlign:"right",flexShrink:0}}>{pct}%</span>
                    </div>
                  ))}
                  <div style={{display:"flex",height:8,borderRadius:99,overflow:"hidden",marginTop:2}}>
                    <div style={{width:`${totalRatio?schoolPct:50}%`,background:GREEN,transition:"width .5s ease"}}/>
                    <div style={{width:`${totalRatio?100-schoolPct:50}%`,background:GOLD,transition:"width .5s ease"}}/>
                  </div>
                </div>
              );
            })()}
          </Card>

          <Card className="fu" style={{
            padding:"12px",
            background:`color-mix(in srgb,${GOLD} 18%,transparent)`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:`1px solid color-mix(in srgb,${GOLD} 24%,transparent)`,
          }}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:7}}>{byPeriodLabel}</div>
            <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:140,overflowY:"auto",paddingRight:2}}>
              {data.map((d, i) => {
                const maxI = Math.max(...data.map(x => x.income), 1);
                const pct  = d.income / maxI;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:11,color:"rgba(255,255,255,0.74)",fontWeight:700,width:18,textAlign:"right",flexShrink:0}}>{d.label}</span>
                    <div style={{flex:1,height:6,background:"rgba(255,255,255,.1)",borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct*100}%`,borderRadius:3,background:`linear-gradient(90deg,${GOLD},${GREEN})`,transition:"width .5s ease"}}/>
                    </div>
                    <span style={{fontSize:11,color:GOLD,fontWeight:800,width:46,textAlign:"right",flexShrink:0,whiteSpace:"nowrap"}}>{d.income ? fmtK(d.income) : <span style={{color:FAINT}}>—</span>}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ── ПОПУЛЯРНІ СЛОТИ ── */}
        {popularSlots.length > 0 && (
          <Card className="fu" style={{
            padding:"12px 13px",
            background:`color-mix(in srgb,${GOLD} 18%,transparent)`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:`1px solid color-mix(in srgb,${GOLD} 24%,transparent)`,
          }}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Популярні слоти</div>
            {popularSlots.map((s, i) => {
              const maxCount = popularSlots[0].count;
              const pct = s.count / maxCount;
              return (
                <div key={s.hour} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <span style={{fontSize:11,color:i===0?GOLD:FAINT,fontWeight:700,width:36,flexShrink:0}}>{s.hour}</span>
                  <div style={{flex:1,height:8,background:"rgba(255,255,255,.1)",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct*100}%`,borderRadius:3,
                      background:i===0?`linear-gradient(90deg,${GOLD},${GREEN})`:`linear-gradient(90deg,${PURPLE},${ACCENT})`,
                      transition:"width .5s ease"}}/>
                  </div>
                  <span style={{fontSize:11,color:`color-mix(in srgb,${i===0?GOLD:PURPLE} 55%,#fff)`,fontWeight:800,width:44,textAlign:"right",flexShrink:0}}>
                    {s.count} ур.
                  </span>
                </div>
              );
            })}
          </Card>
        )}

        {/* ── ТОП-5 ── */}
        {topStudents.length > 0 && (
          <Card className="fu" style={{padding:"12px 13px 8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:11,color:FAINT,letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>Топ-5 клієнтів</div>
              <div style={{display:"flex",gap:5}}>
                {[["paid","₴"],["lessons","год"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setTopBy(k)} style={{
                    minWidth:36, padding:"7px 11px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit",
                    background:topBy===k?GOLD:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                    color:topBy===k?"#1a1a1a":TEXT, boxShadow:SO,
                  }}>{l}</button>
                ))}
              </div>
            </div>
            {topStudents.map((s, i) => {
              const maxH = topStudents[0][topBy === 'lessons' ? 'hours' : 'paid'];
              const barVal = topBy === 'lessons' ? s.hours : s.paid;
              const medals = [GOLD,"#c7ccd1","#c9814f"];
              return (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:9,
                  padding:"9px 8px",
                  marginBottom: i < topStudents.length-1 ? 4 : 0,
                  borderRadius:11,
                  background: i<3 ? `linear-gradient(155deg,color-mix(in srgb,${medals[i]} 22%,${BG_DEEP}),color-mix(in srgb,${medals[i]} 5%,${BG_DEEP}))` : "transparent",
                  border: i<3 ? `1px solid color-mix(in srgb,${medals[i]} 30%,transparent)` : "none",
                }}>
                  <div style={{
                    width:24, height:24, borderRadius:7, flexShrink:0,
                    background: i<3 ? `linear-gradient(145deg,${medals[i]},${medals[i]}dd)` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:900, color:i<3?"#1a1a1a":"#fff", boxShadow:SO,
                  }}>{i+1}</div>
                  <div style={{
                    width:32, height:32, borderRadius:9, flexShrink:0,
                    background:`linear-gradient(145deg,hsl(${s.hue},60%,27%),hsl(${(s.hue+35)%360},70%,18%))`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:800, color:"#fff", boxShadow:`0 2px 8px hsla(${s.hue},50%,30%,.5)`,
                  }}>{s.name.split(" ").map(w=>w[0]).join("")}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:TEXT,marginBottom:4,overflowWrap:"anywhere"}}>{s.name}</div>
                    <div style={{height:4,background:BG_DEEP,borderRadius:3,boxShadow:SI,overflow:"hidden"}}>
                      <div style={{
                        height:"100%", width:`${(barVal/maxH)*100}%`, borderRadius:3,
                        background: s.type==="school" ? `linear-gradient(90deg,${BLUE},${GREEN})` : `linear-gradient(90deg,${PURPLE},${GOLD})`,
                      }}/>
                    </div>
                  </div>
                  <div style={{flexShrink:0,textAlign:"right"}}>
                    {topBy === 'lessons'
                      ? <><div style={{fontSize:12,fontWeight:800,color:BLUE}}>{s.hours} год</div><div style={{fontSize:11,color:FAINT}}>{fmtK(s.paid)}</div></>
                      : <><div style={{fontSize:12,fontWeight:800,color:GOLD}}>{fmtK(s.paid)}</div><div style={{fontSize:11,color:FAINT}}>{s.hours} год</div></>
                    }
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        <div style={{height:8}}/>
      </div>
    </>
  );
}
