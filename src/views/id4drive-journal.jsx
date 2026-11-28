import React, { useState, useEffect, useContext } from "react";
import { MetalIcon } from "../MetalIcon";
import { createPortal } from "react-dom";
import { onValue } from "firebase/database";
import { iRef, auth } from "../firebase";
import { ThemeContext } from "../theme.js";
import { useBackClose, ScrollChips } from "../ui";
import { normStaff, masterOf } from "../workspace";
import { MonthCalendarSheet } from "./id4drive-admin-v5";
import { money } from "../currency";
import { tr } from "../i18n";

export const JOURNAL_READ_KEY = "journal_read_at";

export function getJournalReadAt() {
  return parseInt(localStorage.getItem(JOURNAL_READ_KEY) || "0", 10);
}

export function setJournalReadAt() {
  localStorage.setItem(JOURNAL_READ_KEY, Date.now().toString());
}


const WD = ["нд","пн","вт","ср","чт","пт","сб"];
const MN = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];

function formatDT(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (isToday)     return time;
  if (isYesterday) return `вчора ${time}`;
  return `${p(d.getDate())}.${p(d.getMonth()+1)} ${time}`;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function buildDayGroups(events) {
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const toKey   = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const toLabel = ts => {
    const d = new Date(ts);
    if (d.toDateString() === today.toDateString())     return "Сьогодні";
    if (d.toDateString() === yesterday.toDateString()) return "Вчора";
    return `${d.getDate()} ${MN[d.getMonth()]}`;
  };
  const map = new Map();
  events.forEach(ev => {
    const key = toKey(ev.ts);
    if (!map.has(key)) map.set(key, { key, label: toLabel(ev.ts), evs: [] });
    map.get(key).evs.push(ev);
  });
  return [...map.values()];
}

const TYPE_PREFIX = { new: "✓", cancel: "✕", reschedule: "↻", new_student: "🆕" };

// Нові реєстрації — окреме джерело даних (users), а не bookings: подія
// "людина вперше з'явилась у застосунку", а не щось про її запис.
function buildStudentEvents(data) {
  const evs = [];
  if (!data) return evs;
  Object.entries(data).forEach(([uid, u]) => {
    if (!u) return;
    const ts = u.profile?.createdAt || u.createdAt;
    if (!ts) return;
    const name = u.profile?.name || u.name || "Новий клієнт";
    const phone = u.profile?.phone || u.phone || "";
    evs.push({ id: `${uid}_reg`, type: "new_student", ts, name, slot: phone, uid, by: "client" });
  });
  return evs;
}

function buildEvents(data, ownerUid) {
  const evs = [];
  if (!data) return evs;
  Object.entries(data).forEach(([uid, userBkgs]) => {
    if (!userBkgs) return;
    Object.entries(userBkgs).forEach(([key, b]) => {
      if (!b || typeof b !== "object") return;
      // Особиста подія адміна — не запис, у журналі відвідувань клієнтів їй не місце.
      if (b.type === "personal") return;
      const rawName = b.studentName || b.name;
      const name = typeof rawName === "string" || typeof rawName === "number" ? String(rawName) : "Без імені";
      // Дата запису коротко, без року: «чт 26.11»
      const dateStr = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date)
        ? `${WD[new Date(b.date + "T12:00:00").getDay()]} ${b.date.slice(8,10)}.${b.date.slice(5,7)}` : "";
      const durH = b.durationHours ?? (b.durMin ? b.durMin / 60 : null);
      const durStr = durH ? tr(` · ${durH} год`) : "";
      // Послуга, ціна і майстер (салон) — щоб запис у журналі було видно повністю
      const svc = b.serviceName ? ` · ${b.serviceName}` : "";
      const price = Number(b.price) > 0 ? ` · ${money(b.price)}` : "";
      const slot = [dateStr, b.time].filter(Boolean).join(" · ") + durStr + svc + price;
      const mid = masterOf(b, ownerUid);
      // Клієнт переніс запис: старий запис скасовано (cancelledBy "reschedule"), новий має rescheduledFrom — показуємо ОДНУ подію «Перенос»
      const [fromDate, fromTime] = String(b.rescheduledFrom || "").split(" ");
      const fromSlot = fromDate ? " " + tr(`(було ${fromDate.slice(8,10)}.${fromDate.slice(5,7)}${fromTime ? " " + fromTime : ""})`) : "";
      if (b.createdAt && b.rescheduledFrom) evs.push({ id: `${key}_reschedule_new`, type: "reschedule", ts: b.createdAt, name, slot: slot + fromSlot, mid, uid, by: "client" });
      else if (b.createdAt) evs.push({ id: `${key}_new`,        type: "new",        ts: b.createdAt,     name, slot, mid, uid, by: b.createdBy === "admin" ? "admin" : "client" });
      if (b.cancelledAt && b.cancelledBy !== "reschedule") evs.push({ id: `${key}_cancel`,     type: "cancel",     ts: b.cancelledAt,   name, slot, mid, uid, by: b.cancelledBy  || "" });
      if (b.rescheduledAt) evs.push({ id: `${key}_reschedule`, type: "reschedule", ts: b.rescheduledAt, name, slot, mid, uid, by: "admin" });
    });
  });
  return evs.sort((a, b) => b.ts - a.ts);
}

const BY_LABEL = { admin: "майстер", client: "клієнт", student: "клієнт", system: "система", license: "система" }; // student — старі скасування клієнтом

function EventDetailSheet({ ev, meta, onClose, theme, onViewStudent, navTo }) {
  const [closing, setClosing] = useState(false);
  const shade = a => `rgba(${theme.SHADE},${a})`;
  const glow  = a => `rgba(${theme.GLOW},${a})`;
  const byLabel = BY_LABEL[ev.by] || ev.by;
  const _close = () => setClosing(true);
  useBackClose(true, _close);

  return (
    <>
      <style>{`
        @keyframes _jd-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _jd-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _jd-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _jd-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div
        onClick={closing ? undefined : _close}
        style={{
          position:"fixed",inset:0,zIndex:200,
          background:shade(0.55),
          backdropFilter:"blur(8px)",
          display:"flex",alignItems:"flex-end",justifyContent:"center",
          animation: closing ? `_jd-bg-out 0.26s ease-in forwards` : `_jd-bg-in 0.2s ease-out`,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          onAnimationEnd={closing ? () => { setClosing(false); onClose(); } : undefined}
          style={{
            width:"100%",
            background:theme.BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.08)},0 -16px 60px ${shade(0.8)}`,
            overflow:"hidden",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_jd-down 0.26s ease-in forwards` : `_jd-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}
        >
          <div style={{width:36,height:4,borderRadius:2,background:glow(0.15),margin:"10px auto 0"}} />

          <div style={{
            padding:"16px 20px 14px",
            position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center",
            borderBottom:`1px solid ${theme.BORDER}`,
          }}>
            <MetalIcon name={meta.icon} size={42}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:11,color:theme.FAINT,marginBottom:2}}>{formatDT(ev.ts)}</div>
              <div style={{fontSize:15,fontWeight:700,color:meta.color}}>{meta.label}</div>
            </div>
            <div
              onClick={_close}
              role="button" aria-label="Закрити"
              style={{
                position:"absolute",top:12,right:14,
                width:32,padding:0,height:32,borderRadius:"50%",
                background:"none",
                display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",color:"#ef4444",fontSize:14,fontWeight:800,userSelect:"none",flexShrink:0,
              }}
            ><MetalIcon name="cross" size={32}/></div>
          </div>

          <div style={{padding:"14px 20px 28px",display:"flex",flexDirection:"column",gap:8}}>
            <InfoRow label="КЛІЄНТ" value={ev.name} valueStyle={{fontSize:16,fontWeight:800,color:theme.TEXT}} theme={theme} />
            {ev.slot && <InfoRow label={ev.type === "new_student" ? "ТЕЛЕФОН" : "ЗАПИС"} value={ev.slot} theme={theme} />}
            {byLabel && <InfoRow label="ДІЯ ВІД" value={byLabel} theme={theme} />}
            {/* Швидка реакція: картка клієнта / написати */}
            {ev.uid && !String(ev.uid).startsWith("guest_") && (onViewStudent || navTo) && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
                {onViewStudent && <button onClick={()=>{ onClose(); setTimeout(()=>onViewStudent(ev.uid), 0); }} style={{minHeight:44,borderRadius:12,border:`1px solid ${theme.BORDER}`,background:theme.SURFACE,color:theme.TEXT,fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}><MetalIcon name="user" size={18}/>Картка клієнта</button>}
                {navTo && <button onClick={()=>{ window.__openChatUid = ev.uid; onClose(); setTimeout(()=>navTo("chats"), 0); }} style={{minHeight:44,borderRadius:12,border:"none",background:`linear-gradient(145deg,${theme.ACC_HI},${theme.ACCENT})`,color:"#fff",fontFamily:"inherit",fontSize:13,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}><MetalIcon name="chat" size={18}/>Написати</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, theme, valueStyle = {} }) {
  const glow = a => `rgba(${theme.GLOW},${a})`;
  return (
    <div style={{
      background:glow(0.04),
      borderRadius:10,
      border:`1px solid ${theme.BORDER}`,
      padding:"10px 14px",
    }}>
      <div style={{fontSize:11,color:theme.FAINT,letterSpacing:1,marginBottom:4}}>{label}</div>
      <div style={{fontSize:14,fontWeight:600,color:theme.DIM,...valueStyle}}>{value}</div>
    </div>
  );
}

export default function JournalView({ onViewStudent, navTo } = {}) {
  const theme = useContext(ThemeContext);
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, DIM, ACCENT } = theme;

  const EVENT_TYPES = {
    new:         { label: "Новий запис", color: theme.GREEN, icon: "calendar" },
    cancel:      { label: "Скасовано",   color: theme.RED,   icon: "cross" },
    reschedule:  { label: "Перенос",     color: theme.GOLD,  icon: "swap" },
    new_student: { label: "Новий клієнт", color: theme.BLUE,  icon: "userPlus" },
  };

  const [bookingsRaw, setBookingsRaw] = useState(null);
  const [staff, setStaff] = useState([]);   // салон: склад майстрів
  const [masterFilter, setMasterFilter] = useState(""); // "" — усі майстри
  const ownerUid = (staff.find(m => m.owner) || {}).id || auth.currentUser?.uid || "";
  const bookingEvents = React.useMemo(() => buildEvents(bookingsRaw, ownerUid), [bookingsRaw, ownerUid]);
  const [studentEvents, setStudentEvents] = useState([]);
  const isSalonJ = staff.length > 1;
  const events = React.useMemo(
    () => [...bookingEvents, ...studentEvents].sort((a, b) => b.ts - a.ts),
    [bookingEvents, studentEvents]
  );
  const [section,    setSection]   = useState("all");   // хто: all | client | admin
  const [period,     setPeriod]    = useState("7");     // today | 7 | 30 | all
  const [q,          setQ]         = useState("");
  const [shown,      setShown]     = useState(50);      // підвантаження порціями — довгий журнал не гальмує
  const [typeFilter, setTypeFilter] = useState("all");
  const [detail,     setDetail]    = useState(null);
  const [prevReadAt] = useState(getJournalReadAt);
  const [showMonthCal, setShowMonthCal] = useState(false);
  const [keyPortalEl, setKeyPortalEl] = useState(null);
  // Лічильник, а не просто boolean — при кожному тапі на кнопку календар
  // монтується заново (key змінюється), навіть якщо попередній стан
  // технічно ще "відкрито" (напр. клієнт прогорнув сторінку і календар
  // візуально загубився). Тап завжди гарантовано відкриває свіжу шторку.
  const [calOpenKey, setCalOpenKey] = useState(0);
  const openMonthCal = () => { setCalOpenKey(k => k + 1); setShowMonthCal(true); };

  useEffect(() => { setKeyPortalEl(document.getElementById('topbar-key-portal')); }, []);

  useEffect(() => {
    setJournalReadAt();
    const unsub = onValue(iRef( "bookings"), snap => {
      setBookingsRaw(snap.val());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const owner = auth.currentUser?.uid || "";
    return onValue(iRef("staff"), snap => setStaff(snap.exists() ? normStaff(snap.val(), owner) : []), () => {});
  }, []);

  useEffect(() => {
    const unsub = onValue(iRef( "users"), snap => {
      const val = snap.val();
      setStudentEvents(buildStudentEvents(val));
    });
    return unsub;
  }, []);

  // Адаптер для MonthCalendarSheet — той самий компонент, що і в Розкладі,
  // очікує "бронювання" з полями day (зсув від сьогодні) і startMin.
  // Журнал натомість зберігає плоскі події (new/cancel/reschedule) з ts —
  // конвертуємо їх у ту саму форму, щоб показати кількість подій за день.
  const calToday = React.useMemo(() => { const d = new Date(); d.setHours(12,0,0,0); return d; }, []);
  const calBookings = React.useMemo(() => events.map(ev => {
    const d = new Date(ev.ts);
    const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    const day = Math.round((dayOnly - calToday) / 86400000);
    return { id: ev.id, day, startMin: d.getHours()*60 + d.getMinutes(), name: ev.name };
  }), [events, calToday]);

  // Скрол стартує лише ПІСЛЯ того, як шторка календаря справді зникла з DOM
  // (showMonthCal стало false — підтверджено React, а не вгадано таймером).
  // Раніше скрол планувався фіксованим таймером (340мс) "навмання".
  const [pendingJump, setPendingJump] = useState(null);
  useEffect(() => {
    if (showMonthCal || !pendingJump) return;
    const target = pendingJump;
    setPendingJump(null);
    requestAnimationFrame(() => {
      const el = document.getElementById(`jgroup-${target}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [showMonthCal, pendingJump]);
  const jumpToDate = (dateStr) => setPendingJump(dateStr);

  // Салон: фільтр по майстру стосується лише подій записів (клієнти спільні)
  const byMaster    = isSalonJ && masterFilter ? events.filter(e => e.type === "new_student" || e.mid === masterFilter) : events;
  const sinceTs     = period === "all" ? 0 : period === "today" ? new Date(new Date().toDateString()).getTime() : Date.now() - Number(period) * 86400000;
  const byPeriod    = byMaster.filter(e => e.ts >= sinceTs && (!q || String(e.name || "").toLowerCase().includes(q.toLowerCase())));
  const bySection   = section === "all" ? byPeriod : byPeriod.filter(e => section === "admin" ? e.by === "admin" : e.by !== "admin");
  const filtered    = typeFilter === "all" ? bySection : bySection.filter(e => e.type === typeFilter);
  const groups      = buildDayGroups(filtered.slice(0, shown));
  const _chip       = { flexShrink:0,minHeight:32,padding:"4px 12px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap" };
  useEffect(() => { setShown(50); }, [period, section, typeFilter, masterFilter, q]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      <style>{`
        .jrow{cursor:pointer;transition:background .1s}
        .jrow:active{background:rgba(255,255,255,0.03)!important}
        .jtiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:12px}
        @media (max-width:399px){.jtiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>

      {/* Пошук + період */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:14,padding:"2px 12px",minHeight:44}}>
        <MetalIcon name="search" size={18}/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Пошук клієнта…" style={{flex:1,minWidth:0,background:"transparent",border:"none",outline:"none",color:theme.TEXT,fontSize:14,fontFamily:"inherit",padding:"9px 0"}}/>
        {q && <button aria-label="Очистити пошук" onClick={()=>setQ("")} style={{background:"none",border:"none",color:DIM,fontSize:16,cursor:"pointer",minWidth:28,minHeight:28}}>×</button>}
      </div>
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:8,paddingBottom:2}}>
        {[["today","Сьогодні"],["7","7 днів"],["30","30 днів"],["all","Усе"]].map(([k,l]) => {
          const on = period === k;
          return <button key={k} onClick={()=>setPeriod(k)} style={{..._chip,background:on?ACCENT:SURFACE,color:on?"#fff":theme.TEXT,border:`1px solid ${on?ACCENT:BORDER}`}}>{l}</button>;
        })}
      </div>
      {/* Хто зробив дію */}
      <div style={{display:"flex",background:SURFACE,borderRadius:12,padding:3,border:`1px solid ${BORDER}`,marginBottom:8}}>
        {[["all","Усі дії"],["client","Клієнти"],["admin","Майстер"]].map(([k,l]) => {
          const on = section === k;
          return <button key={k} onClick={()=>setSection(k)} style={{flex:1,minHeight:34,borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:on?SURF_HI:"transparent",color:on?theme.TEXT:DIM}}>{l}</button>;
        })}
      </div>

      {/* Салон: фільтр по майстру */}
      {isSalonJ && (
        <div style={{marginBottom:8}}>
          <ScrollChips activeKey={masterFilter}>
            {[{ id:"", name:"Усі майстри", color:ACCENT }, ...staff].map(m => {
              const on = masterFilter === m.id;
              return (
                <button key={m.id || "all"} onClick={()=>setMasterFilter(m.id)} style={{
                  flex:"1 0 auto",justifyContent:"center",display:"flex",alignItems:"center",gap:7,padding:"7px 12px",borderRadius:99,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,whiteSpace:"nowrap",
                  border:`1px solid ${on ? m.color : BORDER}`,background:on?`color-mix(in srgb,${m.color} 26%,transparent)`:SURFACE,color:on?theme.TEXT:DIM,
                }}>
                  {m.id && <span style={{width:10,height:10,borderRadius:"50%",background:m.color}}/>}{m.name}
                </button>
              );
            })}
          </ScrollChips>
        </div>
      )}

      {/* Тип події — лічильники за обраний період (тап = фільтр) */}
      <div className="jtiles">
        {[
          ["new",         "Нові записи", theme.GREEN, "checkCircle"],
          ["cancel",      "Скасування",  theme.RED  , "cross"],
          ["reschedule",  "Переноси",    theme.GOLD , "swap"],
          ["new_student", "Нові клієнти", theme.BLUE , "userPlus"],
        ].map(([id, lbl, color, ic]) => {
          const active = typeFilter === id;
          const count  = bySection.filter(e => e.type === id).length;
          return (
            <button key={id} onClick={() => setTypeFilter(active ? "all" : id)} aria-pressed={active} style={{
              border: active ? `1.5px solid ${color}` : `1px solid ${BORDER}`,
              cursor:"pointer",borderRadius:14,padding:"8px 6px",textAlign:"center",fontFamily:"inherit",
              background: active ? `color-mix(in srgb,${color} 22%,transparent)` : SURFACE,
            }}>
              <div style={{fontSize:20,fontWeight:800,color}}>{count}</div>
              <div style={{fontSize:11,fontWeight:600,marginTop:2,color: active ? theme.TEXT : DIM,display:"flex",alignItems:"center",justifyContent:"center",gap:4,whiteSpace:"nowrap"}}><MetalIcon name={ic} size={14}/>{lbl}</div>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div style={{ textAlign:"center", color:DIM, fontSize:13, paddingTop:40 }}>
          {q ? "Нікого не знайдено" : period !== "all" ? "За цей період подій немає" : "Журнал порожній"}
        </div>
      )}

      {/* Day groups */}
      {groups.map(group => {
        const gd = new Date(group.evs[0].ts);
        const dateStr = `${gd.getFullYear()}-${String(gd.getMonth()+1).padStart(2,'0')}-${String(gd.getDate()).padStart(2,'0')}`;
        const all = filtered.filter(e => { const d = new Date(e.ts); return d.toDateString() === gd.toDateString(); });
        const cnt = (t) => all.filter(e => e.type === t).length;
        const sum = [[cnt("new"), "+", theme.GREEN], [cnt("cancel"), "−", theme.RED], [cnt("reschedule"), "⇄", theme.GOLD], [cnt("new_student"), "👤", theme.BLUE]].filter(x => x[0] > 0);
        return (
        <div key={group.key} id={`jgroup-${dateStr}`} style={{marginBottom:12}}>

          {/* Заголовок дня — прилипає при прокрутці; підсумок дня */}
          <div style={{position:"sticky",top:0,zIndex:3,display:"flex",alignItems:"center",gap:8,padding:"6px 4px",marginBottom:4,background:BG_DEEP,borderRadius:10}}>
            <span style={{fontSize:12,fontWeight:800,color:theme.TEXT,letterSpacing:0.6,textTransform:"uppercase",flexShrink:0}}>{group.label}</span>
            <div style={{flex:1}}/>
            {sum.map(([n, sym, c]) => <span key={sym} style={{fontSize:11.5,fontWeight:800,color:c,whiteSpace:"nowrap"}}>{`${sym}${n}`}</span>)}
          </div>

          {/* Події: нейтральні рядки, тип — кольоровим значком */}
          <div style={{borderRadius:14,border:`1px solid ${BORDER}`,background:SURFACE,overflow:"hidden"}}>
          {group.evs.map((ev, i) => {
            const meta    = EVENT_TYPES[ev.type] || { label: ev.type, color: ACCENT, icon: "calendar" };
            const isNew   = ev.ts > prevReadAt;
            const byLabel = BY_LABEL[ev.by] || ev.by;
            const mm = isSalonJ && ev.mid ? staff.find(m => m.id === ev.mid) : null;
            return (
              <div key={ev.id} className="jrow" onClick={() => setDetail(ev)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderTop:i?`1px solid ${BORDER}`:"none",background:isNew?`color-mix(in srgb,${ACCENT} 8%,transparent)`:"transparent"}}>
                <div style={{width:30,height:30,borderRadius:9,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:`color-mix(in srgb,${meta.color} 20%,transparent)`,border:`1px solid color-mix(in srgb,${meta.color} 50%,transparent)`}}>
                  <MetalIcon name={meta.icon} size={18}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                    {mm && <span title={mm.name} style={{width:8,height:8,borderRadius:"50%",background:mm.color,flexShrink:0}}/>}
                    <span style={{fontSize:13.5,fontWeight:isNew?800:700,color:theme.TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.name}</span>
                  </div>
                  <div style={{fontSize:11.5,marginTop:2,color:DIM,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    <span style={{color:meta.color,fontWeight:700}}>{meta.label}</span>
                    {ev.slot && <span>{ev.type === "new_student" ? ` · ${ev.slot}` : ` · на ${ev.slot}`}</span>}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
                  <span style={{fontSize:11,color:DIM,fontVariantNumeric:"tabular-nums"}}>{formatTime(ev.ts)}</span>
                  {byLabel && <span style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:6,color:ev.by==="admin"?theme.GOLD:DIM,border:`1px solid ${BORDER}`}}>{byLabel}</span>}
                </div>
              </div>
            );
          })}
          </div>
        </div>
        );
      })}

      {filtered.length > shown && (
        <button onClick={()=>setShown(n => n + 50)} style={{margin:"4px 0 12px",minHeight:42,borderRadius:12,border:`1px solid ${BORDER}`,background:SURFACE,color:theme.TEXT,fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          {`Показати ще (${filtered.length - shown})`}
        </button>
      )}

      {keyPortalEl && createPortal(
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button
            onClick={openMonthCal}
            title="Місячний календар"
            style={{
              width:32, height:32, borderRadius:11, cursor:"pointer",
              background:"none", padding:0, border:"none",
              display:"flex", alignItems:"center", justifyContent:"center",
              flexShrink:0,
            }}>
            <MetalIcon name="calendar" size={32}/>
          </button>
        </div>
      , keyPortalEl)}

      {showMonthCal && (
        <MonthCalendarSheet
          key={calOpenKey}
          bookings={calBookings}
          onClose={()=>setShowMonthCal(false)}
          onPickDate={(dateStr)=>{ jumpToDate(dateStr); }}
        />
      )}

      {detail && (
        <EventDetailSheet
          ev={detail}
          meta={EVENT_TYPES[detail.type] || { label: detail.type, color: ACCENT, icon: "•" }}
          onClose={() => setDetail(null)}
          theme={theme}
          onViewStudent={onViewStudent}
          navTo={navTo}
        />
      )}
    </div>
  );
}
