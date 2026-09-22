import React, { useState, useEffect, useContext } from "react";
import { createPortal } from "react-dom";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import { ThemeContext } from "../theme.js";
import { useBackClose } from "../ui";
import { MonthCalendarSheet } from "./id4drive-admin-v5";

export const JOURNAL_READ_KEY = "journal_read_at";

export function getJournalReadAt() {
  return parseInt(localStorage.getItem(JOURNAL_READ_KEY) || "0", 10);
}

export function setJournalReadAt() {
  localStorage.setItem(JOURNAL_READ_KEY, Date.now().toString());
}

export function countJournalUnread(data) {
  const readAt = getJournalReadAt();
  if (!data || !readAt) return 0;
  let count = 0;
  Object.values(data).forEach(userBkgs => {
    if (!userBkgs) return;
    Object.values(userBkgs).forEach(b => {
      if (!b) return;
      if (b.createdAt     && b.createdAt     > readAt) count++;
      if (b.cancelledAt   && b.cancelledAt   > readAt) count++;
      if (b.rescheduledAt && b.rescheduledAt > readAt) count++;
    });
  });
  return count;
}

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

const noun = n => n === 1 ? "подія" : n < 5 ? "події" : "подій";
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
    const name = u.profile?.name || u.name || "Новий учень";
    const phone = u.profile?.phone || u.phone || "";
    evs.push({ id: `${uid}_reg`, type: "new_student", ts, name, slot: phone, by: "" });
  });
  return evs;
}

// Перші входи в клієнтський застосунок (users/{uid}/firstLoginAt) — окремо
// від реєстрації: людина могла зайти й нічого не заповнити, але адмін хоче
// бачити сам факт заходу, а не лише завершену реєстрацію.
function buildLoginEvents(data) {
  const evs = [];
  if (!data) return evs;
  Object.entries(data).forEach(([uid, u]) => {
    if (!u || !u.firstLoginAt) return;
    const name  = u.profile?.name  || u.name  || "";
    const phone = u.profile?.phone || u.phone || "";
    evs.push({ id: uid, ts: u.firstLoginAt, name, phone });
  });
  return evs.sort((a, b) => b.ts - a.ts);
}

const LOGIN_READ_KEY = "journal_logins_read_at";
function getLoginReadAt() { return parseInt(localStorage.getItem(LOGIN_READ_KEY) || "0", 10); }
function setLoginReadAtStorage() { localStorage.setItem(LOGIN_READ_KEY, Date.now().toString()); }

function LoginsSheet({ events, prevReadAt, onClose, theme }) {
  const [closing, setClosing] = useState(false);
  const shade = a => `rgba(${theme.SHADE},${a})`;
  const glow  = a => `rgba(${theme.GLOW},${a})`;
  const _close = () => setClosing(true);
  useBackClose(true, _close);

  return (
    <>
      <style>{`
        @keyframes _ld-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _ld-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _ld-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _ld-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div
        onClick={closing ? undefined : _close}
        style={{
          position:"fixed",inset:0,zIndex:200,
          background:shade(0.55),
          backdropFilter:"blur(8px)",
          display:"flex",alignItems:"flex-end",justifyContent:"center",
          animation: closing ? `_ld-bg-out 0.26s ease-in forwards` : `_ld-bg-in 0.2s ease-out`,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          onAnimationEnd={closing ? () => { setClosing(false); onClose(); } : undefined}
          style={{
            width:"100%",maxWidth:480,maxHeight:"70vh",overflowY:"auto",
            background:theme.BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.08)},0 -16px 60px ${shade(0.8)}`,
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_ld-down 0.26s ease-in forwards` : `_ld-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}
        >
          <div style={{width:36,height:4,borderRadius:2,background:glow(0.15),margin:"10px auto 0"}} />
          <div style={{padding:"16px 20px 14px",borderBottom:`1px solid ${theme.BORDER}`}}>
            <div style={{fontSize:15,fontWeight:800,color:theme.PURPLE}}>Нові входи в застосунок</div>
          </div>
          <div style={{padding:"10px 14px 24px"}}>
            {events.length === 0 && (
              <div style={{textAlign:"center",color:theme.DIM,fontSize:13,padding:"20px 0"}}>Ще ніхто не заходив</div>
            )}
            {events.map(ev => {
              const isNew = ev.ts > prevReadAt;
              return (
                <div key={ev.id} style={{
                  display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                  borderRadius:12,marginBottom:6,
                  background:glow(0.04),
                  border:`1px solid ${theme.BORDER}`,
                }}>
                  <div style={{fontSize:13,fontWeight:800,color:"#fff",width:52,textAlign:"center",flexShrink:0,fontVariantNumeric:"tabular-nums"}}>
                    {formatTime(ev.ts)}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:12.5,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {ev.name || ev.phone || "Новий відвідувач"}
                      </span>
                      {isNew && <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,background:"#fff",boxShadow:"0 0 4px #fff"}}/>}
                    </div>
                    {ev.name && ev.phone && (
                      <div style={{fontSize:10.5,marginTop:2,color:"rgba(255,255,255,0.7)"}}>{ev.phone}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function buildEvents(data) {
  const evs = [];
  if (!data) return evs;
  Object.values(data).forEach(userBkgs => {
    if (!userBkgs) return;
    Object.entries(userBkgs).forEach(([key, b]) => {
      if (!b) return;
      // Особиста подія адміна — не урок, у журналі відвідувань учнів їй не місце.
      if (b.type === "personal") return;
      const name = b.studentName || b.name || "Без імені";
      const dateStr = b.date ? b.date.split("-").reverse().join(".") : "";
      const durH = b.durationHours ?? (b.durMin ? b.durMin / 60 : null);
      const durStr = durH ? ` · ${durH} год` : "";
      const slot = [dateStr, b.time].filter(Boolean).join(" ") + durStr;
      if (b.createdAt)     evs.push({ id: `${key}_new`,        type: "new",        ts: b.createdAt,     name, slot, by: b.createdBy   || "" });
      if (b.cancelledAt)   evs.push({ id: `${key}_cancel`,     type: "cancel",     ts: b.cancelledAt,   name, slot, by: b.cancelledBy  || "" });
      if (b.rescheduledAt) evs.push({ id: `${key}_reschedule`, type: "reschedule", ts: b.rescheduledAt, name, slot, by: "" });
    });
  });
  return evs.sort((a, b) => b.ts - a.ts);
}

const BY_LABEL = { admin: "адмін", client: "учень" };

function EventDetailSheet({ ev, meta, onClose, theme }) {
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
            width:"100%",maxWidth:480,
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
            display:"flex",alignItems:"center",gap:12,
            borderBottom:`1px solid ${theme.BORDER}`,
          }}>
            <div style={{
              width:42,height:42,borderRadius:13,flexShrink:0,
              background:`${meta.color}22`,
              border:`1.5px solid ${meta.color}55`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:20,
            }}>{meta.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:theme.FAINT,marginBottom:2}}>{formatDT(ev.ts)}</div>
              <div style={{fontSize:15,fontWeight:700,color:meta.color}}>{meta.label}</div>
            </div>
            <div
              onClick={_close}
              style={{
                width:28,height:28,borderRadius:8,
                background:"rgba(239,68,68,0.18)",
                display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",color:"#ef4444",fontSize:14,fontWeight:800,userSelect:"none",flexShrink:0,
              }}
            >✕</div>
          </div>

          <div style={{padding:"14px 20px 28px",display:"flex",flexDirection:"column",gap:8}}>
            <InfoRow label="УЧЕНЬ" value={ev.name} valueStyle={{fontSize:16,fontWeight:800,color:theme.TEXT}} theme={theme} />
            {ev.slot && <InfoRow label={ev.type === "new_student" ? "ТЕЛЕФОН" : "ЗАНЯТТЯ"} value={ev.slot} theme={theme} />}
            {byLabel && <InfoRow label="ДІЯ ВІД" value={byLabel} theme={theme} />}
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
      <div style={{fontSize:10,color:theme.FAINT,letterSpacing:1,marginBottom:4}}>{label}</div>
      <div style={{fontSize:14,fontWeight:600,color:theme.DIM,...valueStyle}}>{value}</div>
    </div>
  );
}

export default function JournalView() {
  const theme = useContext(ThemeContext);
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, DIM, FAINT, ACCENT, ACC_HI, SO } = theme;
  const shade = a => `rgba(${theme.SHADE},${a})`;
  const glow  = a => `rgba(${theme.GLOW},${a})`;

  const EVENT_TYPES = {
    new:         { label: "Новий запис", color: theme.GREEN, icon: "📅" },
    cancel:      { label: "Скасовано",   color: theme.RED,   icon: "✗"  },
    reschedule:  { label: "Перенос",     color: theme.GOLD,  icon: "↔"  },
    new_student: { label: "Новий учень", color: theme.BLUE,  icon: "🆕" },
  };

  const [bookingEvents, setBookingEvents] = useState([]);
  const [studentEvents, setStudentEvents] = useState([]);
  const events = React.useMemo(
    () => [...bookingEvents, ...studentEvents].sort((a, b) => b.ts - a.ts),
    [bookingEvents, studentEvents]
  );
  const [section,    setSection]   = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [detail,     setDetail]    = useState(null);
  const [prevReadAt] = useState(getJournalReadAt);
  const [showMonthCal, setShowMonthCal] = useState(false);
  const [keyPortalEl, setKeyPortalEl] = useState(null);
  // Лічильник, а не просто boolean — при кожному тапі на кнопку календар
  // монтується заново (key змінюється), навіть якщо попередній стан
  // технічно ще "відкрито" (напр. учень прогорнув сторінку і календар
  // візуально загубився). Тап завжди гарантовано відкриває свіжу шторку.
  const [calOpenKey, setCalOpenKey] = useState(0);
  const openMonthCal = () => { setCalOpenKey(k => k + 1); setShowMonthCal(true); };

  const [loginEvents, setLoginEvents] = useState([]);
  const [prevLoginReadAt] = useState(getLoginReadAt);
  const [loginsSeen, setLoginsSeen] = useState(false);
  const [showLogins, setShowLogins] = useState(false);
  const loginBadge = loginsSeen ? 0 : loginEvents.filter(e => e.ts > prevLoginReadAt).length;
  const openLogins = () => { setShowLogins(true); setLoginsSeen(true); setLoginReadAtStorage(); };

  useEffect(() => { setKeyPortalEl(document.getElementById('topbar-key-portal')); }, []);

  useEffect(() => {
    setJournalReadAt();
    const unsub = onValue(ref(db, "bookings"), snap => {
      setBookingEvents(buildEvents(snap.val()));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(db, "users"), snap => {
      const val = snap.val();
      setStudentEvents(buildStudentEvents(val));
      setLoginEvents(buildLoginEvents(val));
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

  const unreadCount = events.filter(e => e.ts > prevReadAt).length;
  const bySection   = section === "admin" ? events.filter(e => e.by === "admin") : events;
  const filtered    = typeFilter === "all" ? bySection : bySection.filter(e => e.type === typeFilter);
  const groups      = buildDayGroups(filtered);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      <style>{`
        .jrow{cursor:pointer;transition:background .1s}
        .jrow:active{background:rgba(255,255,255,0.03)!important}
      `}</style>

      {/* Section tabs */}
      <div style={{
        display:"flex",gap:4,marginBottom:12,
        background:BG_DEEP,borderRadius:12,padding:4,
        border:`1px solid ${BORDER}`,
      }}>
        {[
          ["all",   unreadCount > 0 ? `Всі записи · ${unreadCount}` : "Всі записи"],
          ["admin", "Дії адміна"],
        ].map(([id, lbl]) => (
          <button key={id} onClick={() => setSection(id)} style={{
            flex:1,padding:"7px 10px",borderRadius:9,border:"none",
            cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",
            background: section === id ? ACCENT : "transparent",
            color: section === id ? "#fff" : DIM,
            transition:"all .15s",
          }}>{lbl}</button>
        ))}
      </div>

      {/* Type filter — stat tiles */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:6 }}>
        <span style={{fontSize:10,color:FAINT}}>{bySection.length} {noun(bySection.length)}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:12 }}>
        {[
          ["new",         "✓ НОВИЙ",     theme.GREEN],
          ["cancel",      "✕ СКАСОВАНО", theme.RED  ],
          ["reschedule",  "↻ ПЕРЕНОС",   theme.GOLD ],
          ["new_student", "🆕 УЧЕНЬ",    theme.BLUE ],
        ].map(([id, lbl, color]) => {
          const active = typeFilter === id;
          const count  = bySection.filter(e => e.type === id).length;
          return (
            <button key={id} onClick={() => setTypeFilter(active ? "all" : id)} style={{
              border: active ? `1px solid color-mix(in srgb,${color} 45%,transparent)` : "1px solid transparent",
              cursor:"pointer",borderRadius:11,padding:"8px 6px",textAlign:"center",fontFamily:"inherit",
              background: active
                ? `linear-gradient(155deg,color-mix(in srgb,${color} 40%,${BG_DEEP}) 0%,color-mix(in srgb,${color} 14%,${BG_DEEP}) 100%)`
                : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
              boxShadow: active ? "none" : SO,
              transition:"all .15s",
            }}>
              <div style={{fontSize:15,fontWeight:800,color: active ? "#fff" : color}}>{count}</div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:0.5,marginTop:2,color: active ? "rgba(255,255,255,0.8)" : FAINT}}>{lbl}</div>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div style={{ textAlign:"center", color:DIM, fontSize:13, paddingTop:40 }}>
          {section === "admin" ? "Немає дій адміна" : "Журнал порожній"}
        </div>
      )}

      {/* Day groups */}
      {groups.map(group => {
        const gd = new Date(group.evs[0].ts);
        const dateStr = `${gd.getFullYear()}-${String(gd.getMonth()+1).padStart(2,'0')}-${String(gd.getDate()).padStart(2,'0')}`;
        return (
        <div key={group.key} id={`jgroup-${dateStr}`} style={{marginBottom:14}}>

          {/* Day header */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,paddingLeft:2}}>
            <div style={{width:28,height:3,borderRadius:2,background:glow(0.10),flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:800,color:"#fff",letterSpacing:1,textTransform:"uppercase",flexShrink:0}}>{group.label}</span>
            <div style={{flex:1,height:1,background:BORDER}}/>
            <span style={{fontSize:9,color:FAINT,flexShrink:0}}>{group.evs.length} {noun(group.evs.length)}</span>
          </div>

          {/* Events — tinted cards, big time on the left */}
          {group.evs.map(ev => {
            const meta    = EVENT_TYPES[ev.type] || { label: ev.type, color: ACCENT };
            const isNew   = ev.ts > prevReadAt;
            const byLabel = BY_LABEL[ev.by] || ev.by;
            const prefix  = TYPE_PREFIX[ev.type] || "•";

            return (
              <div
                key={ev.id}
                className="jrow"
                onClick={() => setDetail(ev)}
                style={{
                  display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                  borderRadius:13,marginBottom:6,
                  background:`linear-gradient(155deg,color-mix(in srgb,${meta.color} 45%,${BG_DEEP}) 0%,color-mix(in srgb,${meta.color} 15%,${BG_DEEP}) 100%)`,
                  border:`1px solid color-mix(in srgb,${meta.color} 40%,transparent)`,
                }}
              >
                {/* Time */}
                <div style={{fontSize:16,fontWeight:800,color:"#fff",width:52,textAlign:"center",flexShrink:0,fontVariantNumeric:"tabular-nums"}}>
                  {formatTime(ev.ts)}
                </div>

                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{
                      fontSize:12.5,fontWeight:isNew?800:700,color:"#fff",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                    }}>{ev.name}</span>
                    {isNew && <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,background:"#fff",boxShadow:"0 0 4px #fff"}}/>}
                  </div>
                  <div style={{fontSize:10.5,marginTop:2,fontWeight:700,color:"rgba(255,255,255,0.8)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {prefix} {meta.label}
                    {ev.slot && <span> · {ev.slot}</span>}
                    {byLabel && <span> · {byLabel}</span>}
                  </div>
                </div>

                {/* Chevron */}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            );
          })}
        </div>
        );
      })}

      {keyPortalEl && createPortal(
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button
            onClick={openLogins}
            title="Нові входи в застосунок"
            style={{
              position:"relative",
              width:32, height:32, borderRadius:11, cursor:"pointer",
              background:`linear-gradient(135deg,color-mix(in srgb,${theme.PURPLE} 45%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
              border:`1px solid color-mix(in srgb,${theme.PURPLE} 35%,transparent)`,
              display:"flex", alignItems:"center", justifyContent:"center",
              flexShrink:0,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            {loginBadge > 0 && (
              <div style={{
                position:"absolute",top:-4,right:-4,
                background:theme.PURPLE,color:"#fff",borderRadius:10,
                padding:"1px 5px",fontSize:9,fontWeight:800,
                boxShadow:`0 0 8px ${theme.PURPLE}88`,lineHeight:1.4,
              }}>{loginBadge}</div>
            )}
          </button>
          <button
            onClick={openMonthCal}
            title="Місячний календар"
            style={{
              width:32, height:32, borderRadius:11, cursor:"pointer",
              background:`linear-gradient(135deg,color-mix(in srgb,${theme.BLUE} 45%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
              border:`1px solid color-mix(in srgb,${theme.BLUE} 35%,transparent)`,
              display:"flex", alignItems:"center", justifyContent:"center",
              flexShrink:0,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>
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

      {showLogins && (
        <LoginsSheet
          events={loginEvents}
          prevReadAt={prevLoginReadAt}
          onClose={() => setShowLogins(false)}
          theme={theme}
        />
      )}

      {detail && (
        <EventDetailSheet
          ev={detail}
          meta={EVENT_TYPES[detail.type] || { label: detail.type, color: ACCENT, icon: "•" }}
          onClose={() => setDetail(null)}
          theme={theme}
        />
      )}
    </div>
  );
}
