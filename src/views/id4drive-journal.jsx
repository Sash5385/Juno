import React, { useState, useEffect, useContext } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import { ThemeContext } from "../theme.js";

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
const TYPE_PREFIX = { new: "✓", cancel: "✕", reschedule: "↻" };

function buildEvents(data) {
  const evs = [];
  if (!data) return evs;
  Object.values(data).forEach(userBkgs => {
    if (!userBkgs) return;
    Object.entries(userBkgs).forEach(([key, b]) => {
      if (!b) return;
      const name = b.studentName || b.name || "Без імені";
      const dateStr = b.date ? b.date.split("-").reverse().join(".") : "";
      const slot = [dateStr, b.time].filter(Boolean).join(" ");
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
                background:glow(0.07),
                display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",color:theme.FAINT,fontSize:14,userSelect:"none",flexShrink:0,
              }}
            >✕</div>
          </div>

          <div style={{padding:"14px 20px 28px",display:"flex",flexDirection:"column",gap:8}}>
            <InfoRow label="УЧЕНЬ" value={ev.name} valueStyle={{fontSize:16,fontWeight:800,color:theme.TEXT}} theme={theme} />
            {ev.slot && <InfoRow label="ЗАНЯТТЯ" value={ev.slot} theme={theme} />}
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
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SI, SO } = theme;
  const shade = a => `rgba(${theme.SHADE},${a})`;
  const glow  = a => `rgba(${theme.GLOW},${a})`;

  const EVENT_TYPES = {
    new:        { label: "Новий запис", color: theme.GREEN, icon: "📅" },
    cancel:     { label: "Скасовано",   color: theme.RED,   icon: "✗"  },
    reschedule: { label: "Перенос",     color: theme.GOLD,  icon: "↔"  },
  };

  const [events,     setEvents]    = useState([]);
  const [section,    setSection]   = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [detail,     setDetail]    = useState(null);
  const [prevReadAt] = useState(getJournalReadAt);

  useEffect(() => {
    setJournalReadAt();
    const unsub = onValue(ref(db, "bookings"), snap => {
      setEvents(buildEvents(snap.val()));
    });
    return unsub;
  }, []);

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

      {/* Type filter chips */}
      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
        {[
          ["all",        "Всі",         DIM         ],
          ["new",        "✓ Новий",     theme.GREEN ],
          ["cancel",     "✕ Скасовано", theme.RED   ],
          ["reschedule", "↻ Перенос",   theme.GOLD  ],
        ].map(([id, lbl, color]) => {
          const active = typeFilter === id;
          return (
            <button key={id} onClick={() => setTypeFilter(id)} style={{
              padding:"5px 11px",borderRadius:12,
              border:`1.5px solid ${active ? color : "transparent"}`,
              cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
              background: active ? `${color}22` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
              color: active ? color : DIM,
              boxShadow: SO,
              transition:"all .15s",
            }}>{lbl}</button>
          );
        })}
        <div style={{flex:1}}/>
        <span style={{fontSize:10,color:FAINT}}>{filtered.length} {noun(filtered.length)}</span>
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div style={{ textAlign:"center", color:DIM, fontSize:13, paddingTop:40 }}>
          {section === "admin" ? "Немає дій адміна" : "Журнал порожній"}
        </div>
      )}

      {/* Day groups */}
      {groups.map(group => (
        <div key={group.key} style={{marginBottom:14}}>

          {/* Day header */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,paddingLeft:2}}>
            <div style={{width:28,height:3,borderRadius:2,background:glow(0.10),flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:800,color:FAINT,letterSpacing:1,textTransform:"uppercase",flexShrink:0}}>{group.label}</span>
            <div style={{flex:1,height:1,background:BORDER}}/>
            <span style={{fontSize:9,color:FAINT,flexShrink:0}}>{group.evs.length} {noun(group.evs.length)}</span>
          </div>

          {/* Group panel */}
          <div style={{
            background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,borderRadius:16,
            border:`1px solid ${BORDER}`,overflow:"hidden",
            boxShadow:SI,
          }}>
            {group.evs.map((ev, i) => {
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
                    display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                    borderBottom: i < group.evs.length-1 ? `1px solid rgba(255,255,255,0.04)` : "none",
                  }}
                >
                  {/* Colored dot */}
                  <div style={{
                    width:8,height:8,borderRadius:"50%",flexShrink:0,
                    background:meta.color,
                    boxShadow:`0 0 6px ${meta.color}77`,
                  }}/>

                  {/* Info */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{
                        fontSize:12,fontWeight:isNew?800:700,color:TEXT,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      }}>{ev.name}</span>
                      {isNew && <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,background:meta.color,boxShadow:`0 0 4px ${meta.color}`}}/>}
                    </div>
                    <div style={{fontSize:10,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <span style={{color:meta.color,fontWeight:700}}>{prefix} {meta.label}</span>
                      {ev.slot && <span style={{color:FAINT}}> · {ev.slot}</span>}
                      {byLabel && <span style={{color:FAINT}}> · {byLabel}</span>}
                    </div>
                  </div>

                  {/* Time */}
                  <span style={{fontSize:10,color:FAINT,flexShrink:0}}>{formatTime(ev.ts)}</span>

                  {/* Chevron */}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      ))}

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
