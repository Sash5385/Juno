import { useState, useEffect, useContext } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import { LangContext } from "../App";
import { createT } from "../lang";

import { ThemeContext } from "../theme.js";
import { UICss, Card, useFX } from "../ui";

const UK_MONTHS     = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
const UK_WEEK_LABELS= ["Пн","Вт","Ср","Чт","Пт","Сб"];

// ─── HELPERS ────────────────────────────────────────────────────
const fmtK = n => n>=1000?`${(n/1000).toFixed(1)}к ₴`:`${n} ₴`;

function getDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function bkType(b) { return b.serviceType || b.type || "private"; }
function bkIncome(b, svcs) {
  const svc = (svcs||[]).find(s => s.id === b.serviceId);
  const dur = b.durMin || (b.durationHours ? b.durationHours * 60 : 60);
  if (svc && svc.price && svc.duration) return Math.round((svc.price / svc.duration) * dur);
  if (b.price && b.durationHours && b.durMin) return Math.round((b.price / (b.durationHours * 60)) * b.durMin);
  return b.price || 0;
}

function aggregateBuckets(buckets, bookings, getKey, svcs) {
  const map = {};
  buckets.forEach(b => { map[b.key] = { ...b, income:0, lessons:0, school:0, private:0, noshow:0, cancel:0 }; });
  bookings.forEach(b => {
    const k = getKey(b);
    if (!map[k]) return;
    const st = b.status || "confirmed";
    if (st === "confirmed" || st === "pending") {
      map[k].income  += bkIncome(b, svcs);
      map[k].lessons += 1;
      if (bkType(b) === "school") map[k].school++;
      else map[k].private++;
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

function computeMonthData(bookings, offsetMonths = 0, svcs) {
  const now = new Date();
  const buckets = Array.from({length: 5}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 4 + i + offsetMonths, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return { key, label: UK_MONTHS[d.getMonth()] };
  });
  return aggregateBuckets(buckets, bookings, b => (b.date||"").slice(0, 7), svcs);
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

function filterByPeriod(bookings, data, period, cfrom, cto) {
  if (period === 'custom') return bookings.filter(b => cfrom && cto && b.date >= cfrom && b.date <= cto);
  const keys = new Set(data.map(b => b.key));
  return bookings.filter(b => {
    if (period === 'day') return keys.has(`${b.date}_${parseInt((b.time||'').split(':')[0], 10)}`);
    if (period === 'week') return keys.has(b.date||'');
    return keys.has((b.date||'').slice(0, 7));
  });
}

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function computeCustomData(bookings, from, to, svcs) {
  if (!from || !to || from > to) return [];
  const fromD = parseLocalDate(from), toD = parseLocalDate(to);
  const diffDays = Math.round((toD - fromD) / 86400000) + 1;
  if (diffDays <= 62) {
    const buckets = Array.from({length: diffDays}, (_, i) => {
      const d = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate() + i);
      const key = getDateStr(d);
      return { key, label: `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}` };
    });
    return aggregateBuckets(buckets, bookings, b => b.date || '', svcs);
  }
  const arr = [];
  const cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
  const end = new Date(toD.getFullYear(), toD.getMonth(), 1);
  while (cur <= end) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
    arr.push({ key, label: UK_MONTHS[cur.getMonth()] });
    cur.setMonth(cur.getMonth() + 1);
  }
  return aggregateBuckets(arr, bookings, b => (b.date||'').slice(0, 7), svcs);
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

function computeMonthForecast(bookings, svcs) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  if (dayOfMonth < 3) return null;
  const monthKey = `${year}-${String(month+1).padStart(2,'0')}`;
  const monthIncome = bookings
    .filter(b => (b.status === 'confirmed' || b.status === 'pending') && (b.date||'').startsWith(monthKey))
    .reduce((s, b) => s + bkIncome(b, svcs), 0);
  return Math.round((monthIncome / dayOfMonth) * daysInMonth);
}

function computeYearForecast(bookings, svcs) {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  if (dayOfYear < 10) return null;
  const yearIncome = bookings
    .filter(b => (b.status === 'confirmed' || b.status === 'pending') && (b.date||'').startsWith(`${now.getFullYear()}`))
    .reduce((s, b) => s + bkIncome(b, svcs), 0);
  return Math.round((yearIncome / dayOfYear) * 365);
}

function periodSum(data) {
  return {
    income:  data.reduce((s, d) => s + d.income,  0),
    lessons: data.reduce((s, d) => s + d.lessons, 0),
    noshow:  data.reduce((s, d) => s + (d.noshow||0), 0),
  };
}

function trendPct(cur, prev) {
  if (!prev && !cur) return 0;
  if (!prev) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function exportCSV(bookings, svcs) {
  const rows = bookings
    .filter(b => b.status === 'confirmed' || b.status === 'pending')
    .sort((a, b) => (b.date||'').localeCompare(a.date||''))
    .map(b => [
      b.date||'', b.time||'',
      (b.studentName||b.name||'').replace(/,/g,' '),
      b.serviceType||'', bkIncome(b, svcs), b.durMin || (b.durationHours ? b.durationHours*60 : 60),
    ].join(','));
  const csv = ['Дата,Час,Учень,Тип,Сума,Хвилин', ...rows].join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `id4drive-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── INSET ───────────────────────────────────────────────────────
const Inset = ({children, style={}}) => {
  const { SURF_HI, SURFACE, SI } = useContext(ThemeContext);
  return (
    <div style={{background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`, borderRadius:10, boxShadow:SI, ...style}}>{children}</div>
  );
};

// ─── SVG LINE CHART ──────────────────────────────────────────────
function LineChart({ data, valueKey, color, height=120 }) {
  const { FAINT } = useContext(ThemeContext);
  const { ink } = useFX();
  const W=320, H=height, P=12;
  const vals = data.map(d => d[valueKey]);
  const max = Math.max(...vals), min = Math.min(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => ({
    x: P + (i / (vals.length - 1)) * (W - P*2),
    y: H - P - ((v - min) / range) * (H - P*2 - 10),
  }));
  const path = pts.map((p, i) => i===0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`).join(" ");
  const area = `${path} L${pts[pts.length-1].x},${H-P} L${pts[0].x},${H-P} Z`;
  const len  = pts.reduce((s, p, i) => i===0 ? 0 : s + Math.hypot(p.x - pts[i-1].x, p.y - pts[i-1].y), 0);
  const gid  = `g${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} style={{overflow:"visible"}}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28"/>
          <stop offset="100%" stopColor={color} stopOpacity=".01"/>
        </linearGradient>
      </defs>
      {[0,.25,.5,.75,1].map(t=>(
        <line key={t} x1={P} y1={P+(1-t)*(H-P*2-10)} x2={W-P} y2={P+(1-t)*(H-P*2-10)} stroke={ink(0.06)} strokeWidth="1"/>
      ))}
      <path d={area} fill={`url(#${gid})`}/>
      <path className="line-anim" d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{"--len":len, strokeDasharray:len}}/>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={color} style={{filter:`drop-shadow(0 0 4px ${color}88)`}}/>
      ))}
      {data.map((d, i) => (
        <text key={i} x={pts[i].x} y={H} textAnchor="middle" fill={FAINT} fontSize="9" fontWeight="700">{d.label}</text>
      ))}
    </svg>
  );
}

// ─── SVG BAR CHART ───────────────────────────────────────────────
function BarChart({ data, valueKey, color, height=120 }) {
  const { FAINT } = useContext(ThemeContext);
  const { ink } = useFX();
  const W=320, H=height, P=12;
  const vals = data.map(d => d[valueKey]);
  const max  = Math.max(...vals) || 1;
  const gap  = (W - P*2) / data.length;
  const bW   = gap * .6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} style={{overflow:"visible"}}>
      <defs>
        {data.map((_, i) => (
          <linearGradient key={i} id={`bg${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".85"/>
            <stop offset="100%" stopColor={color} stopOpacity=".35"/>
          </linearGradient>
        ))}
      </defs>
      {[0,.5,1].map(t=>(
        <line key={t} x1={P} y1={P+(1-t)*(H-P*2-10)} x2={W-P} y2={P+(1-t)*(H-P*2-10)} stroke={ink(0.06)} strokeWidth="1"/>
      ))}
      {data.map((d, i) => {
        const bH = ((d[valueKey]||0) / max) * (H - P*2 - 10);
        const x  = P + i*gap + gap*.2;
        const y  = H - P - 10 - bH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bW} height={bH} rx="4" fill={`url(#bg${i})`}
              style={{filter:`drop-shadow(0 2px 5px ${color}44)`}}/>
            <text x={x+bW/2} y={H} textAnchor="middle" fill={FAINT} fontSize="9" fontWeight="700">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── DONUT ───────────────────────────────────────────────────────
function Donut({ school, total, size=76 }) {
  const { SURF_LO, GREEN, GOLD, TEXT } = useContext(ThemeContext);
  const pct = total ? school/total : 0;
  const r=26, cx=size/2, cy=size/2, c=2*Math.PI*r;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={SURF_LO} strokeWidth="9"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={GREEN} strokeWidth="9"
        strokeDasharray={`${pct*c} ${c}`} strokeDashoffset={c*.75} strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 5px ${GREEN}66)`}}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={GOLD} strokeWidth="9"
        strokeDasharray={`${(1-pct)*c} ${c}`} strokeDashoffset={c*(.75+pct)} strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 5px ${GOLD}66)`}}/>
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={TEXT} fontSize="12" fontWeight="800">{Math.round(pct*100)}%</text>
    </svg>
  );
}

// ─── CHIP ────────────────────────────────────────────────────────
const Chip = ({label, active, onClick, color}) => {
  const { ACC_HI, ACCENT, SURF_HI, SURFACE, DIM, SO } = useContext(ThemeContext);
  return (
    <button onClick={onClick} style={{
      padding:"6px 12px", borderRadius:9, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, flexShrink:0, fontFamily:"inherit",
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
  const [chartType,  setChartType] = useState("line");
  const [metric,     setMetric]    = useState("income");
  const [bookings,   setBookings]  = useState([]);
  const [services,   setServices]  = useState([]);
  const [topBy,      setTopBy]     = useState("paid");
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const css = `
@keyframes bar-grow{from{height:0%}to{height:var(--h)}}
@keyframes line-draw{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}
.line-anim{animation:line-draw 1s ease both}
@keyframes fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fu{animation:fade-up .2s ease both}
`;

  useEffect(() => {
    return onValue(ref(db, "bookings"), snap => {
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
    return onValue(ref(db, "admin_settings/services"), snap => {
      const d = snap.val();
      setServices(Array.isArray(d) ? d : []);
    }, () => {});
  }, []);

  const data     = period === "week"   ? computeWeekData(bookings, 0, services)
                 : period === "year"   ? computeYearData(bookings, 0, services)
                 : period === "day"    ? computeDayData(bookings, 0, services)
                 : period === "custom" ? computeCustomData(bookings, customFrom, customTo, services)
                 :                       computeMonthData(bookings, 0, services);

  const prevData = period === "custom" ? data
                 : period === "week"   ? computeWeekData(bookings, -1, services)
                 : period === "year"   ? computeYearData(bookings, -1, services)
                 : period === "day"    ? computeDayData(bookings, -1, services)
                 :                       computeMonthData(bookings, -5, services);

  const cur  = periodSum(data);
  const prev = periodSum(prevData);

  const totalIncome  = cur.income;
  const totalLessons = cur.lessons;
  const totalSchool  = data.reduce((s, d) => s + d.school,  0);
  const totalPrivate = data.reduce((s, d) => s + d.private, 0);
  const totalNoshow  = cur.noshow;
  const totalCancel  = data.reduce((s, d) => s + (d.cancel||0), 0);
  const avgCheck     = totalLessons ? Math.round(totalIncome / totalLessons) : 0;
  const noshowPct    = totalLessons ? Math.round((totalNoshow / totalLessons) * 100) : 0;
  const prevAvgCheck = prev.lessons ? Math.round(prev.income / prev.lessons) : 0;

  const customDiffDays = customFrom && customTo ? Math.round((new Date(customTo) - new Date(customFrom)) / 86400000) + 1 : 0;
  const periodBookings = filterByPeriod(bookings, data, period, customFrom, customTo);
  const topStudents  = computeTopStudents(periodBookings, topBy, services);
  const popularSlots = computePopularSlots(periodBookings, services);
  const forecast     = period === "year" ? computeYearForecast(bookings, services) : period === "custom" ? null : computeMonthForecast(bookings, services);
  const slotsPerBucket = period === "day" ? 10 : 8;
  const occupancy    = data.length ? Math.min(100, Math.round((cur.lessons / (data.length * slotsPerBucket)) * 100)) : 0;
  const occupancySub = period === "day" ? "сьогодні" : period === "week" ? "цей тиждень" : period === "month" ? "5 місяців" : period === "custom" ? "свій інтервал" : "рік";
  const forecastSub  = period === "year" ? "рік (прогноз)" : period === "custom" ? "—" : "місяць (прогноз)";
  const byPeriodLabel= period === "day" ? "По годинах" : period === "week" ? "По днях" : period === "custom" && customDiffDays <= 62 ? "По днях" : "По місяцях";

  const METRICS = [
    {id:"income",  label:t('income')+' ₴', color:GOLD},
    {id:"lessons", label:t('lessons'),      color:BLUE},
    {id:"school",  label:t('school'),       color:GREEN},
    {id:"private", label:t('private'),      color:PURPLE},
  ];
  const curMetric = METRICS.find(m => m.id === metric);

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{display:"flex",flexDirection:"column",gap:8,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── PERIOD ── */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {[["day","День"],["week",t('st2.week')],["month",t('st2.month')],["year",t('st2.year')],["custom","Свій"]].map(([k,l])=>(
            <Chip key={k} label={l} active={period===k} onClick={()=>setPeriod(k)}/>
          ))}
        </div>
        {period === "custom" && (
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}
              style={{background:SURF_HI,border:`1px solid ${BORDER}`,borderRadius:9,padding:"7px 10px",color:TEXT,fontSize:12,fontFamily:"inherit",boxShadow:SI,flex:1,minWidth:130,colorScheme:"dark"}}/>
            <span style={{color:FAINT,fontSize:14,fontWeight:700}}>—</span>
            <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}
              style={{background:SURF_HI,border:`1px solid ${BORDER}`,borderRadius:9,padding:"7px 10px",color:TEXT,fontSize:12,fontFamily:"inherit",boxShadow:SI,flex:1,minWidth:130,colorScheme:"dark"}}/>
          </div>
        )}

        {/* ── KPI 2×3 ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {[
            {label:"Дохід",        value:fmtK(totalIncome),               sub:"за період",                         color:GOLD,                                       trend:trendPct(cur.income,  prev.income)},
            {label:"Уроків",       value:totalLessons,                    sub:`${totalSchool}а · ${totalPrivate}п`, color:BLUE,                                       trend:trendPct(cur.lessons, prev.lessons)},
            {label:"Серед. чек",   value:fmtK(avgCheck),                  sub:"дохід / урок",                      color:GREEN,                                      trend:trendPct(avgCheck, prevAvgCheck)},
            {label:"No-show",      value:`${noshowPct}%`,                 sub:`скасувань: ${totalCancel}`,          color:noshowPct>5?RED:DIM,                        trend:trendPct(cur.noshow, prev.noshow) * -1},
            {label:"Заповненість", value:`${occupancy}%`,               sub:occupancySub,                        color:occupancy<50?RED:occupancy<80?GOLD:GREEN, trend:0},
            {label:"Прогноз",      value:forecast!=null?fmtK(forecast):"—", sub:forecastSub,                      color:PURPLE,                                   trend:0},
          ].map((k, i) => (
            <Card key={i} className="fu" style={{padding:"12px 13px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>{k.label}</div>
                {k.trend !== 0 && (
                  <span style={{
                    fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:6,
                    color:k.trend>=0?GREEN:RED,
                    background:k.trend>=0?`${GREEN}1f`:`${RED}1f`,
                  }}>{k.trend>=0?"+":""}{k.trend}%</span>
                )}
              </div>
              <div style={{fontSize:22,fontWeight:900,color:k.color,letterSpacing:-0.5,marginBottom:2}}>{k.value}</div>
              <div style={{fontSize:10,color:FAINT}}>{k.sub}</div>
            </Card>
          ))}
        </div>

        {/* ── CHART ── */}
        <Card className="fu" style={{padding:"14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
            <span style={{fontSize:13,fontWeight:800,color:TEXT}}>Динаміка</span>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {METRICS.map(m=>(
                <button key={m.id} onClick={()=>setMetric(m.id)} style={{
                  padding:"4px 8px", borderRadius:7, border:"none", cursor:"pointer", fontSize:10, fontWeight:700, fontFamily:"inherit",
                  background:metric===m.id?`${m.color}22`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                  color:metric===m.id?m.color:FAINT, boxShadow:SO,
                }}>{m.label}</button>
              ))}
              <button onClick={()=>setChartType(t=>t==="line"?"bar":"line")} style={{
                padding:"4px 10px", borderRadius:7, border:"none", cursor:"pointer", fontSize:11, fontFamily:"inherit",
                background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`, color:DIM, boxShadow:SO,
              }}>{chartType==="line"?"📊":"📈"}</button>
            </div>
          </div>
          <Inset style={{padding:"10px 8px 4px"}}>
            {chartType==="line"
              ? <LineChart data={data} valueKey={metric} color={curMetric.color} height={120}/>
              : <BarChart  data={data} valueKey={metric} color={curMetric.color} height={120}/>
            }
          </Inset>
          <div style={{display:"flex",gap:14,marginTop:9,justifyContent:"center",flexWrap:"wrap"}}>
            {METRICS.map(m=>(
              <div key={m.id} onClick={()=>setMetric(m.id)} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
                <div style={{
                  width:7, height:7, borderRadius:4, background:m.color,
                  boxShadow:`0 0 5px ${m.color}88`,
                  transform:metric===m.id?"scale(1.5)":"scale(1)", transition:"transform .15s",
                }}/>
                <span style={{fontSize:10,color:metric===m.id?m.color:FAINT,fontWeight:700}}>{m.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── РОЗПОДІЛ + ПО ДНЯХ ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          <Card className="fu" style={{padding:"12px"}}>
            <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:9}}>Розподіл</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Donut school={totalSchool} total={totalSchool+totalPrivate}/>
              <div style={{flex:1}}>
                {[[GREEN,"Автошкола",totalSchool],[GOLD,"Приватний",totalPrivate]].map(([c,l,v])=>(
                  <div key={l} style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                    <div style={{width:7,height:7,borderRadius:4,background:c,flexShrink:0}}/>
                    <span style={{fontSize:10,color:DIM,flex:1}}>{l}</span>
                    <span style={{fontSize:12,fontWeight:800,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="fu" style={{padding:"12px"}}>
            <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:9}}>{byPeriodLabel}</div>
            {data.map((d, i) => {
              const maxI = Math.max(...data.map(x => x.income), 1);
              const pct  = d.income / maxI;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                  <span style={{fontSize:9,color:FAINT,fontWeight:700,width:16,textAlign:"right",flexShrink:0}}>{d.label}</span>
                  <div style={{flex:1,height:5,background:BG_DEEP,borderRadius:3,boxShadow:SI,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct*100}%`,borderRadius:3,background:`linear-gradient(90deg,${GOLD},${GREEN})`,transition:"width .5s ease"}}/>
                  </div>
                  <span style={{fontSize:9,color:GOLD,fontWeight:800,width:34,textAlign:"right",flexShrink:0}}>{d.income ? fmtK(d.income) : <span style={{color:FAINT}}>—</span>}</span>
                </div>
              );
            })}
          </Card>
        </div>

        {/* ── ПОПУЛЯРНІ СЛОТИ ── */}
        {popularSlots.length > 0 && (
          <Card className="fu" style={{padding:"12px 13px"}}>
            <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Популярні слоти</div>
            {popularSlots.map((s, i) => {
              const maxCount = popularSlots[0].count;
              const pct = s.count / maxCount;
              return (
                <div key={s.hour} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <span style={{fontSize:11,color:i===0?GOLD:FAINT,fontWeight:700,width:36,flexShrink:0}}>{s.hour}</span>
                  <div style={{flex:1,height:6,background:BG_DEEP,borderRadius:3,boxShadow:SI,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct*100}%`,borderRadius:3,
                      background:i===0?`linear-gradient(90deg,${GOLD},${GREEN})`:`linear-gradient(90deg,${PURPLE},${ACCENT})`,
                      transition:"width .5s ease"}}/>
                  </div>
                  <span style={{fontSize:10,color:i===0?GOLD:PURPLE,fontWeight:800,width:44,textAlign:"right",flexShrink:0}}>
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
              <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>Топ-5 учнів</div>
              <div style={{display:"flex",gap:5}}>
                {[["paid","₴"],["lessons","год"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setTopBy(k)} style={{
                    padding:"3px 8px", borderRadius:6, border:"none", cursor:"pointer", fontSize:10, fontWeight:700, fontFamily:"inherit",
                    background:topBy===k?`${GOLD}22`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                    color:topBy===k?GOLD:FAINT, boxShadow:SO,
                  }}>{l}</button>
                ))}
              </div>
            </div>
            {topStudents.map((s, i) => {
              const maxH = topStudents[0][topBy === 'lessons' ? 'hours' : 'paid'];
              const barVal = topBy === 'lessons' ? s.hours : s.paid;
              const medals = [GOLD,"#94a3b8","#fb923c"];
              return (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:9,
                  padding:"9px 0",
                  borderBottom: i < topStudents.length-1 ? `1px solid ${BORDER}` : "none",
                }}>
                  <div style={{
                    width:24, height:24, borderRadius:7, flexShrink:0,
                    background: i<3 ? `linear-gradient(145deg,${medals[i]},${medals[i]}88)` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:10, fontWeight:900, color:i<3?"#1a1a1a":"#fff", boxShadow:SO,
                  }}>{i+1}</div>
                  <div style={{
                    width:32, height:32, borderRadius:9, flexShrink:0,
                    background:`linear-gradient(145deg,hsl(${s.hue},60%,44%),hsl(${(s.hue+35)%360},70%,28%))`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:10, fontWeight:800, color:"#fff", boxShadow:`0 2px 8px hsla(${s.hue},50%,30%,.5)`,
                  }}>{s.name.split(" ").map(w=>w[0]).join("")}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:TEXT,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                    <div style={{height:4,background:BG_DEEP,borderRadius:3,boxShadow:SI,overflow:"hidden"}}>
                      <div style={{
                        height:"100%", width:`${(barVal/maxH)*100}%`, borderRadius:3,
                        background: s.type==="school" ? `linear-gradient(90deg,${BLUE},${GREEN})` : `linear-gradient(90deg,${PURPLE},${GOLD})`,
                      }}/>
                    </div>
                  </div>
                  <div style={{flexShrink:0,textAlign:"right"}}>
                    {topBy === 'lessons'
                      ? <><div style={{fontSize:12,fontWeight:800,color:BLUE}}>{s.hours} год</div><div style={{fontSize:9,color:FAINT}}>{fmtK(s.paid)}</div></>
                      : <><div style={{fontSize:12,fontWeight:800,color:GOLD}}>{fmtK(s.paid)}</div><div style={{fontSize:9,color:FAINT}}>{s.hours} год</div></>
                    }
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {/* ── ЕКСПОРТ ── */}
        <Card className="fu" style={{padding:"12px"}}>
          <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Експорт</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7}}>
            {[
              {label:"Excel", emoji:"📊", color:GREEN, sub:"Статистика",     onClick:()=>exportCSV(bookings, services)},
              {label:"PDF",   emoji:"📄", color:RED,   sub:"Для податкової", onClick:()=>window.print()},
            ].map(e=>(
              <button key={e.label} onClick={e.onClick} style={{
                padding:"11px 6px", borderRadius:11, border:"none", cursor:"pointer", fontFamily:"inherit",
                background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                display:"flex", flexDirection:"column", alignItems:"center", gap:5, boxShadow:SO,
              }}>
                <div style={{
                  width:34, height:34, borderRadius:10,
                  background:`linear-gradient(145deg,${e.color}33,${e.color}11)`,
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
                  boxShadow:`0 2px 8px ${e.color}22`,
                }}>{e.emoji}</div>
                <span style={{fontSize:11,fontWeight:800,color:e.color}}>{e.label}</span>
                <span style={{fontSize:9,color:FAINT}}>{e.sub}</span>
              </button>
            ))}
          </div>
        </Card>

        <div style={{height:8}}/>
      </div>
    </>
  );
}
