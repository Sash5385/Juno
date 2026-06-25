import { useState, useRef, useEffect, useLayoutEffect, useMemo, useContext } from "react";
import { ref, update, get, onValue, off, remove, push as fbPush } from "firebase/database";
import { db } from "../firebase";

import { ThemeContext, GREEN, BLUE, PURPLE, GOLD, RED, TEAL, ACCENT, ACC_HI, SURFACE, SURF_HI, TEXT } from "../theme.js";
import { useFX } from "../ui";
// module-level aliases for vars used in ICONS (arrow fns, cannot use hooks)
const ACCENT_HI  = ACC_HI;
const SURFACE_HI = SURF_HI;

// Palette for service colors
const PALETTE = [
  { id:"green",  name:"Зелений",   color:GREEN },
  { id:"yellow", name:"Жовтий",    color:GOLD },
  { id:"blue",   name:"Синій",     color:BLUE },
  { id:"purple", name:"Фіолетовий",color:PURPLE },
  { id:"red",    name:"Червоний",  color:ACCENT },
  { id:"teal",   name:"Бірюзовий", color:"#2dd4bf" },
  { id:"pink",   name:"Рожевий",   color:"#f472b6" },
  { id:"orange", name:"Оранжевий", color:"#fb923c" },
];

// ═══════════════════════════════════════════════════════════════
// GLOBAL CSS (slots from v4, rest v3)
// ═══════════════════════════════════════════════════════════════
const makeGlobalCSS = (SURFACE_LO, ACCENT, GLOW, SHADE, INK) => `
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
body, html, #root { margin:0; padding:0; }

/* ─── 3D PILLOW SLOTS (from v4, color via CSS var) ─── */
.slot-base {
  position: relative; overflow: hidden;
  border-radius: 8px;
  transition: box-shadow .2s, transform .15s;
  cursor: grab; user-select: none;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}
.slot-base::before {
  content:''; position:absolute; pointer-events:none;
  top: 2px; right: 8%;
  width: 50%; height: 35%;
  background: radial-gradient(ellipse at top right, rgba(${GLOW},0.22) 0%, transparent 65%);
  border-radius: 50%;
  filter: blur(1px);
}
.slot-base::after {
  content:''; position:absolute; pointer-events:none;
  bottom: 0; left: 0; right: 0; height: 35%;
  background: linear-gradient(to bottom, transparent, rgba(${SHADE},0.18));
  border-radius: 0 0 8px 8px;
}
.slot-base:active { cursor: grabbing; }
.slot-colored {
  background: linear-gradient(155deg, var(--c) 0%, color-mix(in srgb, var(--c) 68%, #000000) 100%);
  border: 1.5px solid color-mix(in srgb, var(--c) 88%, #000000);
  box-shadow:
    -2px 5px 14px rgba(${SHADE},0.5),
    inset 1px 1px 0 rgba(${GLOW},0.22),
    inset -1px -1px 0 rgba(${SHADE},0.20);
}
.slot-pending-ring {
  animation: pulse-ring 2s infinite;
}
@keyframes pulse-ring {
  0%,100% { box-shadow: -2px 5px 14px rgba(${SHADE},0.5), inset 1px 1px 0 rgba(${GLOW},0.18), inset -1px -1px 0 rgba(${SHADE},0.25), 0 0 0 0 rgba(255,90,60,0.6); }
  50%     { box-shadow: -2px 5px 14px rgba(${SHADE},0.5), inset 1px 1px 0 rgba(${GLOW},0.18), inset -1px -1px 0 rgba(${SHADE},0.25), 0 0 0 6px rgba(255,90,60,0); }
}

/* resize handles — invisible hit area, no visual bar */
.slot-handle {
  position: absolute; left: 0; right: 0; height: 12px;
  cursor: ns-resize; z-index: 5;
  touch-action: none;
}
.slot-handle.top { top: 0; }
.slot-handle.bottom { bottom: 0; }

/* corner glint — top-right specular highlight, like light on a rounded button */
@keyframes shine-corner {
  0%   { opacity: 0; transform: scale(0.7); }
  35%  { opacity: 1; transform: scale(1); }
  65%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.8); }
}
.shine-layer {
  position:absolute; inset:0;
  pointer-events:none; overflow:hidden;
  border-radius:inherit; z-index:6;
}
.shine-layer::after {
  content:'';
  position:absolute;
  top:-25%; right:-15%;
  width:65%; height:65%;
  background: radial-gradient(ellipse at 70% 30%, rgba(${GLOW},0.72) 0%, rgba(${GLOW},0.22) 45%, transparent 70%);
  border-radius: 50%;
  filter: blur(3px);
  opacity: 0;
}
.shine-active .shine-layer::after {
  animation: shine-corner 0.9s ease-in-out forwards;
}

/* hold-to-drag: ripple expands exactly over 1s, synced with timer */
@keyframes hold-charge {
  0%   { box-shadow: -2px 5px 14px rgba(${SHADE},0.5), inset 1px 1px 0 rgba(${GLOW},0.18), inset -1px -1px 0 rgba(${SHADE},0.25), 0 0 0 0px rgba(${GLOW},0.55); transform: scale(1); }
  60%  { transform: scale(0.96); }
  100% { box-shadow: -2px 5px 14px rgba(${SHADE},0.5), inset 1px 1px 0 rgba(${GLOW},0.18), inset -1px -1px 0 rgba(${SHADE},0.25), 0 0 0 10px rgba(${GLOW},0); transform: scale(0.96); }
}
.slot-holding {
  animation: hold-charge 1s ease-out forwards;
}

/* 3D icons (from v4) */
.icon3d {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 14px;
  position: relative; overflow: hidden;
  flex-shrink: 0;
  box-shadow:
    -2px 4px 10px rgba(${SHADE},0.5),
    inset 1px 1px 0 rgba(${GLOW},0.25),
    inset -1px -1px 0 rgba(${SHADE},0.3);
}
.icon3d::before {
  content:''; position:absolute; top:0; right:0;
  width:60%; height:50%;
  background: radial-gradient(ellipse at top right, rgba(${GLOW},0.4) 0%, transparent 70%);
  pointer-events: none;
}
.icon3d > svg { position: relative; z-index: 1; filter: drop-shadow(0 1px 2px rgba(${SHADE},0.4)); }

/* Toggle switch */
.toggle {
  width: 46px; height: 26px; border-radius: 13px; cursor: pointer;
  position: relative; transition: background .2s;
  background: ${SURFACE_LO};
  box-shadow: inset 2px 2px 5px rgba(${SHADE},0.4);
}
.toggle.on {
  background: linear-gradient(165deg, ${GREEN}, #5fb83d);
  box-shadow: inset 1px 1px 0 rgba(${GLOW},0.2);
}
.toggle-thumb {
  position: absolute; top: 3px; left: 3px;
  width: 20px; height: 20px; border-radius: 10px;
  background: linear-gradient(135deg, #fff, #ccc);
  transition: left .2s;
  box-shadow: -1px 2px 4px rgba(${SHADE},0.3), inset 1px 1px 0 rgba(${GLOW},0.6);
}
.toggle.on .toggle-thumb { left: 23px; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: rgba(${INK},0.1); border-radius: 3px; }
::-webkit-scrollbar-track { background: transparent; }
.schedule-scroll::-webkit-scrollbar { height: 24px; }
.schedule-scroll::-webkit-scrollbar-thumb { background: rgba(${INK},0.2); border-radius: 8px; min-width: 60px; }
input[type="range"] { accent-color: ${ACCENT}; }
.tabular { font-variant-numeric: tabular-nums; }
.drum-scroll::-webkit-scrollbar { display: none; }
`;

// ═══════════════════════════════════════════════════════════════
// 3D ICONS
// ═══════════════════════════════════════════════════════════════
function Icon3D({ children, gradient, size=40, radius }) {
  return (
    <div className="icon3d" style={{
      width: size, height: size,
      background: gradient,
      borderRadius: radius ?? 14,
    }}>{children}</div>
  );
}
const ICONS = {
  calendar: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#5b9bff,#3b73d9)">
      <svg width={s*0.55} height={s*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
        <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>
      </svg>
    </Icon3D>
  ),
  check: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#9ee07a,#5fb83d)">
      <svg width={s*0.55} height={s*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="5 12 10 17 19 8"/>
      </svg>
    </Icon3D>
  ),
  cross: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#7a7e85,#3f4248)">
      <svg width={s*0.45} height={s*0.45} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
        <line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>
      </svg>
    </Icon3D>
  ),
  car: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#c084fc,#8b5cf6)">
      <svg width={s*0.6} height={s*0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17h14M3 17V9l3-5h12l3 5v8M5 17a2 2 0 1 0 4 0 2 2 0 1 0 -4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0 -4 0M3 9h18"/>
      </svg>
    </Icon3D>
  ),
  school: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#9ee07a,#5fb83d)">
      <svg width={s*0.6} height={s*0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10l9-5 9 5-9 5-9-5z"/><path d="M7 12v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-5"/>
      </svg>
    </Icon3D>
  ),
  money: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#fcd34d,#d97706)">
      <svg width={s*0.55} height={s*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 2v20M16 6h-6a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8"/>
      </svg>
    </Icon3D>
  ),
  user: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#94a3b8,#475569)">
      <svg width={s*0.55} height={s*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
      </svg>
    </Icon3D>
  ),
  users: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#c084fc,#7c3aed)">
      <svg width={s*0.6} height={s*0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
        <circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 18c0-2 2-4 4-4s3 1 3 3"/>
      </svg>
    </Icon3D>
  ),
  clock: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#fb923c,#ea580c)">
      <svg width={s*0.55} height={s*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>
      </svg>
    </Icon3D>
  ),
  chat: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#34d399,#059669)">
      <svg width={s*0.55} height={s*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12c0 5-4 8-9 8-1.5 0-3-.3-4-.7L3 21l1-4c-1-1.5-1.5-3.2-1.5-5 0-5 4-8 9-8s9.5 3 9.5 8z"/>
      </svg>
    </Icon3D>
  ),
  bell: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#fcd34d,#f59e0b)">
      <svg width={s*0.55} height={s*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>
      </svg>
    </Icon3D>
  ),
  settings: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#94a3b8,#334155)">
      <svg width={s*0.6} height={s*0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </Icon3D>
  ),
  list: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#34d399,#047857)">
      <svg width={s*0.6} height={s*0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>
      </svg>
    </Icon3D>
  ),
  chart: (s=40) => (
    <Icon3D size={s} gradient="linear-gradient(165deg,#a78bfa,#6d28d9)">
      <svg width={s*0.6} height={s*0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="20" x2="4" y2="10"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="14"/><line x1="22" y1="20" x2="2" y2="20"/>
      </svg>
    </Icon3D>
  ),
  plus: (s=40) => (
    <Icon3D size={s} gradient={`linear-gradient(165deg,${ACCENT_HI},${ACCENT})`}>
      <svg width={s*0.5} height={s*0.5} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </Icon3D>
  ),
  menu: (s=40) => (
    <Icon3D size={s} gradient={`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`}>
      <svg width={s*0.5} height={s*0.5} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2.4" strokeLinecap="round">
        <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
      </svg>
    </Icon3D>
  ),
  refresh: (s=40) => (
    <Icon3D size={s} gradient={`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`}>
      <svg width={s*0.5} height={s*0.5} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L23 10"/>
      </svg>
    </Icon3D>
  ),
};

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════
const initialBookings = [];

const _DLABELS = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
const _DLABELS_FULL = ["Понеділок","Вівторок","Середа","Четвер","П'ятниця","Субота","Неділя"];
const _MLABELS = ["січ","лют","бер","кві","тра","чер","лип","сер","вер","жов","лис","гру"];
const getDayInfo = (offsetFromToday) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetFromToday);
  const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  return { num: d.getDate(), month: _MLABELS[d.getMonth()], year: d.getFullYear(), label: _DLABELS[dow], fullLabel: _DLABELS_FULL[dow], wk: dow >= 5 };
};


// ═══════════════════════════════════════════════════════════════
// DEFAULT SETTINGS
// ═══════════════════════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  // profile
  profile: {
    name: "Олександр",
    phone: "+380989225442",
    address: "Київ, Верховинна 44",
    experience: 8,
    photo: null,
  },
  // schedule
  workStart: 7,
  workEnd: 20,
  weekends: [6], // 0=Mon..6=Sun
  daysShown: 5,  // 1..30
  snapMin: 30,
  hourHeightPx: 60, // resizable via pinch
  // breaks
  lunchEnabled: true,
  lunchStart: 12,
  lunchEnd: 13,
  customBlocks: [],
  // per-day schedule (Option C)
  weekSchedule: [
    { enabled:true,  start:9,  end:18, lunchEnabled:true,  lunchStart:12, lunchEnd:13 }, // Пн
    { enabled:true,  start:9,  end:18, lunchEnabled:true,  lunchStart:12, lunchEnd:13 }, // Вт
    { enabled:true,  start:9,  end:18, lunchEnabled:true,  lunchStart:12, lunchEnd:13 }, // Ср
    { enabled:true,  start:9,  end:18, lunchEnabled:true,  lunchStart:12, lunchEnd:13 }, // Чт
    { enabled:true,  start:9,  end:18, lunchEnabled:true,  lunchStart:12, lunchEnd:13 }, // Пт
    { enabled:true,  start:10, end:15, lunchEnabled:false, lunchStart:12, lunchEnd:13 }, // Сб
    { enabled:false, start:9,  end:18, lunchEnabled:true,  lunchStart:12, lunchEnd:13 }, // Нд
  ],
  // date overrides (Option B+C)
  dateOverrides: [], // [{ date:"2024-06-20", type:"closed"|"custom", start?:9, end?:18, lunchEnabled?:false, reason?:"" }]
  // pending
  pendingEnabled: false, // toggle: requires confirmation
  // visual
  theme: "dark",     // dark | light
  language: "uk",    // uk | en
  // queue (waiting list)
  queueAutoFifo: true,
  queueBroadcast: false,
  queueManual: false,
  // restrictions
  studentCanReschedule: true,
  studentCanCancel: true,
  bookCutoffHours: 2,       // min hours before slot for booking
  calendarOpenDays: 30,     // how many days ahead visible to students
  minBookingIntervalDays: 0, // min days between any two bookings (0 = disabled)
  // sticky time
  stickyTime: "both",       // before | after | both
  // notifications display
  notifLocation: "topbar",  // topbar | tab | profile
  // bottom nav visibility
  navTabs: ["schedule","bookings","students","services","chats","templates","stats","settings"],
  // auto messages
  autoReminder: { enabled:true, hoursBefore:24 },
  autoWelcome: { enabled:true },
  autoConfirm: { enabled:true },
  autoCancel: { enabled:true },
  autoQueueOffer: { enabled:true },
  // surcharges
  surcharges: [100, 200, 300],
  // services
  services: [
    { id:"sv1", name:"Автошкола 1 год", type:"school",  duration:60,  price:600,  colorId:"green",  active:true,  description:"Урок з автошколи" },
    { id:"sv2", name:"Автошкола 2 год", type:"school",  duration:120, price:1100, colorId:"green",  active:true,  description:"" },
    { id:"sv3", name:"Приватний 1 год", type:"private", duration:60,  price:700,  colorId:"yellow", active:true,  description:"" },
    { id:"sv4", name:"Приватний 2 год", type:"private", duration:120, price:1300, colorId:"yellow", active:true,  description:"" },
  ],
  // categories
  categories: [
    { id:"cat-vip", name:"VIP",       colorId:"purple" },
    { id:"cat-std", name:"Стандарт",  colorId:"blue" },
    { id:"cat-new", name:"Новачок",   colorId:"teal" },
  ],
};

// ═══════════════════════════════════════════════════════════════
// SHARED UI HELPERS
// ═══════════════════════════════════════════════════════════════
function Card({ children, style={}, inset=false }) {
  const { SURFACE, BORDER, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SHADOW_OUT = SO, SHADOW_IN = SI;
  return (
    <div style={{
      background: SURFACE, borderRadius:20,
      boxShadow: inset ? SHADOW_IN : SHADOW_OUT,
      border:`1px solid ${BORDER}`,
      ...style
    }}>{children}</div>
  );
}
function SectionTitle({ children, right }) {
  const { FAINT: TEXT_FAINT , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:11,color:TEXT_FAINT,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>{children}</div>
      {right}
    </div>
  );
}
function Toggle({ on, onChange }) {
  return (
    <div className={`toggle ${on?"on":""}`} onClick={()=>onChange(!on)}>
      <div className="toggle-thumb"/>
    </div>
  );
}
function Pill({ label, color, bg }) {
  return <span style={{
    background:bg, color, padding:"3px 10px",
    borderRadius:8, fontSize:11, fontWeight:700, letterSpacing:0.4
  }}>{label}</span>;
}
function statusPill(s) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { ACCENT , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const M = {
    pending:["Очікує",ACCENT,"rgba(255,90,60,0.15)"],
    confirmed:["Підтверджено",GREEN,"rgba(126,217,87,0.15)"],
    cancelled:["Скасовано","#888",`${ink(0.07)}`],
    noshow:["Не прийшов",RED,"rgba(239,68,68,0.18)"],
  };
  const [l,c,b] = M[s] || M.confirmed;
  return <Pill label={l} color={c} bg={b}/>;
}
const fmtTime = (m) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const fmtDur = (m) => { const h=Math.floor(m/60),min=m%60; return h===0?`${min}хв`:min===0?`${h}год`:`${h}год ${min}хв`; };
const colorOf = (id) => PALETTE.find(p=>p.id===id)?.color || GREEN;

// ═══════════════════════════════════════════════════════════════
// BROADCAST MODAL — ручна розсилка пушу учням
// ═══════════════════════════════════════════════════════════════
function BroadcastModal({ initialDate, initialSlot, onClose }) {
  const { BG_DEEP, SURFACE, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI, GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow = a => `rgba(${GLOW},${a})`, shade = a => `rgba(${SHADE},${a})`, ink = a => `rgba(${INK},${a})`;
  const SHADOW_IN = SI;

  const [date, setDate]       = useState(initialDate || "");
  const [slot1, setSlot1]     = useState(initialSlot || "");
  const [slot2, setSlot2]     = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [sendError, setSendError] = useState(null);
  const [closing, setClosing] = useState(false);

  const slotsArr = [slot1, slot2].filter(Boolean);
  const canSend  = !!(date && slot1 && !sending);
  const _close   = () => setClosing(true);

  const preview = (() => {
    if (!date || !slot1) return null;
    try {
      const fmt = new Date(date + "T00:00:00").toLocaleDateString("uk", { day: "numeric", month: "long", weekday: "short" });
      return `${fmt} о ${slotsArr.join(" та ")}${comment ? " — " + comment : ""}`;
    } catch { return null; }
  })();

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await fbPush(ref(db, "push_tasks"), { date, slots: slotsArr, comment: comment || null, createdAt: Date.now(), status: "pending" });
      setSent(true);
    } catch (e) { setSendError("Помилка: " + e.message); }
    finally { setSending(false); }
  };

  const inp = { background: `linear-gradient(135deg,${BG_DEEP},${SURF_LO})`, border: `1px solid ${BORDER}`, outline: "none", color: TEXT, fontSize: 13, padding: "9px 12px", borderRadius: 10, boxShadow: SHADOW_IN, width: "100%", boxSizing: "border-box" };

  return (
    <>
      <style>{`
        @keyframes _br-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _br-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _br-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _br-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,zIndex:9999,
        background:shade(0.55),
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_br-bg-out 0.26s ease-in forwards` : `_br-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 rgba(192,132,252,0.3), 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing
              ? `_br-down 0.26s ease-in forwards`
              : `_br-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>

          {/* Header */}
          <div style={{
            padding:"10px 18px 14px",
            background:"linear-gradient(145deg,rgba(192,132,252,0.12),rgba(168,85,247,0.05))",
            borderBottom:"1px solid rgba(192,132,252,0.15)",
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:"rgba(192,132,252,0.4)",margin:"0 auto 12px"}}/>
            <div style={{fontSize:17,fontWeight:800,color:"#c084fc"}}>📣 Розсилка учням</div>
          </div>

          <div style={{padding:"16px 18px 32px"}}>
            {sent ? (
              <div style={{ textAlign:"center", padding:"20px 0" }}>
                <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:16, fontWeight:800, color:TEXT }}>Надіслано!</div>
                <div style={{ fontSize:12, color:DIM, marginTop:6 }}>Сповіщення отримають активні учні</div>
                <button onClick={_close} style={{ marginTop:20, background:"rgba(192,132,252,0.15)", color:"#c084fc", border:"none", borderRadius:12, padding:"10px 28px", fontSize:13, fontWeight:700, cursor:"pointer" }}>Закрити</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:600 }}>Дата</div>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp}/>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:600 }}>Слот 1 *</div>
                    <input type="time" value={slot1} onChange={e => setSlot1(e.target.value)} style={inp}/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:600 }}>Слот 2 (необов.)</div>
                    <input type="time" value={slot2} onChange={e => setSlot2(e.target.value)} style={inp}/>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:600 }}>Коментар (необов.)</div>
                  <input value={comment} onChange={e => setComment(e.target.value)} placeholder="напр. «записуйся поки є місце»" style={{ ...inp, fontSize:12 }} maxLength={60}/>
                </div>
                {preview && (
                  <div style={{ background:"rgba(192,132,252,0.07)", border:"1px solid rgba(192,132,252,0.2)", borderRadius:10, padding:"10px 12px", marginBottom:14 }}>
                    <div style={{ fontSize:10, color:DIM, marginBottom:4, fontWeight:700, letterSpacing:0.5 }}>ПРЕВ'Ю ПУШУ</div>
                    <div style={{ fontSize:12, color:TEXT, fontWeight:700 }}>🚗 Є вільний слот!</div>
                    <div style={{ fontSize:11, color:DIM, marginTop:3 }}>{preview}</div>
                  </div>
                )}
                {sendError && (
                  <div style={{ fontSize:12, color:"#ef4444", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:8, padding:"8px 12px", marginBottom:10 }}>{sendError}</div>
                )}
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={_close} style={{ flex:1, background:"transparent", color:DIM, border:`1px solid ${BORDER}`, borderRadius:12, padding:"11px 0", fontSize:13, cursor:"pointer" }}>Скасувати</button>
                  <button onClick={handleSend} disabled={!canSend} style={{ flex:2, background:canSend?"rgba(192,132,252,0.18)":"rgba(192,132,252,0.06)", color:canSend?"#c084fc":DIM, border:"none", borderRadius:12, padding:"11px 0", fontSize:13, fontWeight:700, cursor:canSend?"pointer":"default", transition:"all 0.2s" }}>
                    {sending ? "Надсилаємо…" : "📣 Надіслати"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE VIEW with drag/resize + pinch-to-zoom + day-count
// ═══════════════════════════════════════════════════════════════
function ScheduleView({ settings, setSettings, onSlotClick, onEmptySlotClick, bookings, setBookings, activeDragIds, navTo, slotExistsRef, openSlotsRef }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI, STRIPE_A, STRIPE_B, GLOW, SHADE, INK } = useContext(ThemeContext);
  const isLight = BG !== "#1c1d21";
  const { glow, shade, ink } = useFX();
  const GRID_H      = isLight ? "rgba(0,0,0,0.09)"        : "rgba(255,255,255,0.07)";
  const GRID_HH     = isLight ? "rgba(0,0,0,0.04)"        : "rgba(255,255,255,0.025)";
  const FREE_BG     = isLight ? "rgba(58,140,30,0.10)"    : "rgba(99,211,120,0.10)";
  const FREE_BD     = isLight ? "rgba(58,140,30,0.38)"    : "rgba(99,211,120,0.38)";
  const FREE_CLR    = isLight ? "rgba(58,140,30,0.85)"    : "rgba(99,211,120,0.78)";
  const STICKY_BG   = isLight ? "rgba(58,140,30,0.16)"    : "rgba(99,211,120,0.15)";
  const STICKY_BD   = isLight ? "rgba(58,140,30,0.65)"    : "rgba(99,211,120,0.45)";
  const STICKY_CLR  = isLight ? "rgba(58,140,30,0.92)"    : "rgba(99,211,120,0.9)";
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const [dragId, setDragId] = useState(null);
  const [holdId, setHoldId] = useState(null);
  const [quickCancelId, setQuickCancelId] = useState(null);
  const quickCancelRef = useRef(null);
  const [cancellingSet, setCancellingSet] = useState(new Set());
  const cancelTimers = useRef({});
  const [windowW, setWindowW] = useState(window.innerWidth);
  const [windowH, setWindowH] = useState(window.innerHeight);
  const PAST_DAYS = 30;
  const VBUF = 5;
  const [dayOffset, setDayOffset] = useState(-PAST_DAYS);
  const dragRef = useRef(null);
  const calcRef = useRef({});
  const setBookingsRef = useRef(null);
  const gridRef = useRef(null);
  const headerScrollRef = useRef(null);
  const headersInnerRef = useRef(null);
  const holdTimerRef = useRef(null);
  const pendingDragRef = useRef(null);
  const dragEndedRef = useRef(false);
  const resizeReadyRef = useRef(null);
  const swipeRef = useRef(null);
  const gridWrapRef = useRef(null);
  const vRangeRef   = useRef({ s: Math.max(0, PAST_DAYS - VBUF), e: PAST_DAYS + 30 });
  const [vRange, setVRange] = useState({ s: Math.max(0, PAST_DAYS - VBUF), e: PAST_DAYS + 30 });
  const xVisibleRef = useRef(false);
  const xJustShownRef = useRef(false);
  const snapTimerRef = useRef(null);
  const timeColRef = useRef(null);
  const [pinch, setPinch] = useState(null);
  const [shineId, setShineId] = useState(null);
  const slotHoldTimerRef = useRef(null);
  const slotHoldFiredRef = useRef(false);
  const [openSlots, setOpenSlots] = useState({}); // { "2025-06-01": ["07:00","08:00",...] }
  const [viewingSlots, setViewingSlots] = useState({});
  const pendingSlotSnapRef = useRef(null);
  const [genLoadingDays, setGenLoadingDays] = useState(new Set());
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [genToast, setGenToast] = useState(null); // { absDay, free, blocked }
  const genToastTimer = useRef(null);
  useEffect(() => () => clearTimeout(genToastTimer.current), []);
  const [queueMap, setQueueMap] = useState({}); // { "YYYY-MM-DD_HH:MM": count }

  useEffect(() => {
    const r = ref(db, "queue");
    const unsub = onValue(r, snap => {
      const val = snap.val() || {};
      const map = {};
      Object.entries(val).forEach(([slotKey, slotData]) => {
        if (!slotData?.entries) return;
        const count = Object.values(slotData.entries).filter(e => e.status === 'waiting').length;
        if (count > 0) map[slotKey] = count;
      });
      setQueueMap(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const r = ref(db, "timeslots");
    const unsub = onValue(r, snap => {
      const val = snap.val() || {};
      const slots = {};
      const viewing = {};
      const exists = {};
      Object.entries(val).forEach(([date, dateSlots]) => {
        const slotMap = {};
        const viewTimes = [];
        const slotSet = new Set();
        Object.entries(dateSlots).forEach(([slotKey, slot]) => {
          // Derive time from key (slot1000 → '10:00') as fallback when time field is missing
          const m = slotKey.match(/^slot(\d{2})(\d{2})$/);
          const slotTime = slot.time || (m ? `${m[1]}:${m[2]}` : null);
          if (slotTime) {
            slotSet.add(slotTime);
            if (slot.available !== false || slot.adminBlocked || slot.vipOnly || slot.surcharge) {
              slotMap[slotTime] = { available: slot.available !== false, adminBlocked: !!slot.adminBlocked, vipOnly: !!slot.vipOnly, surcharge: slot.surcharge || null };
            }
          }
          if (slot.viewing && Object.keys(slot.viewing).length > 0) viewTimes.push(slotTime);
        });
        if (Object.keys(slotMap).length) slots[date] = slotMap;
        if (viewTimes.length) viewing[date] = viewTimes;
        if (slotSet.size) exists[date] = slotSet;
      });
      if (slotExistsRef) slotExistsRef.current = exists;
      if (openSlotsRef) openSlotsRef.current = slots;
      if (activeDragIds?.current?.size > 0) {
        pendingSlotSnapRef.current = { slots, viewing };
      } else {
        setOpenSlots(slots);
        setViewingSlots(viewing);
      }
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const absDayToDateStr = (absDay) => {
    const d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() + absDay);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // Сейф-нет: будь-який доступний слот, накритий активним записом (хоча б
  // частково), робимо недоступним у БД, щоб клієнт не зміг його забронювати.
  // Тільки блокує — звільнення слотів виконує App.jsx при зміні/скасуванні.
  useEffect(() => {
    if (activeDragIds?.current?.size > 0) return;
    // Дебаунс: bookings/openSlots можуть оновлюватись пачкою (стрім із Firebase,
    // перетягування). Чекаємо паузу, щоб зробити один запис, а не кілька підряд.
    const t = setTimeout(() => {
      if (activeDragIds?.current?.size > 0) return;
      const bkByDate = {};
      bookings.forEach(b => {
        if (b.status === "cancelled") return;
        if (b.startMin == null || !b.durMin) return;
        const d = Number.isInteger(b.day) ? absDayToDateStr(b.day) : b.date;
        if (!d) return;
        (bkByDate[d] || (bkByDate[d] = [])).push(b);
      });
      const upd = {};
      Object.entries(openSlots).forEach(([date, slotMap]) => {
        const dayBk = bkByDate[date];
        if (!dayBk) return;
        Object.entries(slotMap).forEach(([time, slot]) => {
          if (!slot.available) return;
          const [h, m] = time.split(":").map(Number);
          const sMin = h * 60 + m;
          if (dayBk.some(b => b.startMin < sMin + 60 && b.startMin + b.durMin > sMin)) {
            const hh = String(h).padStart(2, "0");
            const mm = String(m).padStart(2, "0");
            upd[`timeslots/${date}/slot${hh}${mm}/available`] = false;
          }
        });
      });
      if (Object.keys(upd).length) update(ref(db, "/"), upd).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [bookings, openSlots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returns {free, blocked} counts, or null if day is skipped
  const computeDayUpdates = (dateStr, existing, force = false) => {
    const d = new Date(dateStr + "T12:00:00");
    const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    const ov = (settings.dateOverrides || []).find(o => o.date === dateStr);
    if (ov?.type === "closed") return null;
    const ws = (settings.weekSchedule || [])[dow] || {};
    if (!force && ws.enabled === false) return null;
    // When no per-day weekSchedule, fall back to global weekends list
    if (!force && !ws.start && (settings.weekends || []).includes(dow)) return null;
    const start        = ov?.start ?? ws.start ?? settings.workStart ?? 9;
    const end          = ov?.end   ?? ws.end   ?? settings.workEnd   ?? 18;
    const lunchEnabled = ov?.lunchEnabled ?? ws.lunchEnabled ?? settings.lunchEnabled ?? true;
    const lunchStart   = ov?.lunchStart   ?? ws.lunchStart   ?? settings.lunchStart  ?? 12;
    const lunchEnd     = ov?.lunchEnd     ?? ws.lunchEnd     ?? settings.lunchEnd    ?? 13;
    const step = 60;
    const updates = {};
    for (let min = start * 60; min < end * 60; min += step) {
      if (lunchEnabled && min >= lunchStart * 60 && min < lunchEnd * 60) continue;
      const h = String(Math.floor(min / 60)).padStart(2, "0");
      const m = String(min % 60).padStart(2, "0");
      const id = `slot${h}${m}`;
      if (!existing[id]?.adminBlocked) {
        updates[`timeslots/${dateStr}/${id}/time`] = `${h}:${m}`;
        updates[`timeslots/${dateStr}/${id}/available`] = true;
      }
    }
    const intervalMin = settings.snapMin ?? 30;
    bookings
      .filter(b => b.date === dateStr && b.status !== "cancelled")
      .forEach(b => {
        const bEnd = b.startMin + b.durMin;
        for (let cur = b.startMin; cur < bEnd; cur += intervalMin) {
          const h = String(Math.floor(cur / 60)).padStart(2, "0");
          const m = String(cur % 60).padStart(2, "0");
          const id = `slot${h}${m}`;
          updates[`timeslots/${dateStr}/${id}/available`] = false;
          updates[`timeslots/${dateStr}/${id}/time`] = `${h}:${m}`;
        }
      });
    let free = 0, blocked = 0;
    Object.entries(updates).forEach(([k, v]) => {
      if (k.endsWith('/available')) { if (v === true) free++; else blocked++; }
    });
    return { updates, free, blocked };
  };

  const generateDaySlots = async (absDay) => {
    const dateStr = absDayToDateStr(absDay);
    setGenLoadingDays(s => new Set([...s, absDay]));
    try {
      await remove(ref(db, `timeslots/${dateStr}`));
      const result = computeDayUpdates(dateStr, {}, true);
      if (result && Object.keys(result.updates).length) {
        await update(ref(db, "/"), result.updates);
      }
      clearTimeout(genToastTimer.current);
      setGenToast({ absDay, free: result?.free ?? 0, blocked: result?.blocked ?? 0 });
      genToastTimer.current = setTimeout(() => setGenToast(null), 3000);
    } finally {
      setGenLoadingDays(s => { const ns = new Set(s); ns.delete(absDay); return ns; });
    }
  };

  const clearDaySlots = async (absDay) => {
    const dateStr = absDayToDateStr(absDay);
    await remove(ref(db, `timeslots/${dateStr}`));
  };

  const generateAllSlots = async () => {
    setIsGeneratingAll(true);
    try {
      const limit = settings.calendarOpenDays || 30;
      const allUpdates = {};
      // Clear timeslots for all active days first, then write fresh state
      const clearUpdates = {};
      for (let d = 0; d <= limit; d++) {
        clearUpdates[`timeslots/${absDayToDateStr(d)}`] = null;
      }
      await update(ref(db, "/"), clearUpdates);
      // Now compute and write fresh slots (pass {} — no existing adminBlocked to preserve)
      for (let d = 0; d <= limit; d++) {
        const dateStr = absDayToDateStr(d);
        const result = computeDayUpdates(dateStr, {});
        if (result) Object.assign(allUpdates, result.updates);
      }
      if (Object.keys(allUpdates).length) await update(ref(db, "/"), allUpdates);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  // Клік: вільний ↔ зайнятий (2 стани)
  const toggleSlotFree = (dateStr, time, slot) => {
    const slotId = `slot${time.replace(":", "")}`;
    if (slot.adminBlocked) {
      update(ref(db, `timeslots/${dateStr}/${slotId}`), { available: true, adminBlocked: false, time }).catch(() => {});
    } else {
      update(ref(db, `timeslots/${dateStr}/${slotId}`), { available: false, adminBlocked: true, vipOnly: false, surcharge: null, time }).catch(() => {});
    }
  };

  // Довгий тап: VIP, надбавка або скидання
  const applySlotOption = (dateStr, time, option) => {
    const slotId = `slot${time.replace(":", "")}`;
    const currentSlot = slotOptions?.slot || {};
    const isClosed = currentSlot.available === false;
    if (option === "vip") {
      if (isClosed) {
        // Закритий VIP — залишаємо закритим, додаємо VIP прапор
        update(ref(db, `timeslots/${dateStr}/${slotId}`), { vipOnly: true }).catch(() => {});
      } else {
        update(ref(db, `timeslots/${dateStr}/${slotId}`), { available: true, adminBlocked: false, vipOnly: true }).catch(() => {});
      }
    } else if (option === "reset") {
      if (isClosed) {
        update(ref(db, `timeslots/${dateStr}/${slotId}`), { vipOnly: false, surcharge: null }).catch(() => {});
      } else {
        update(ref(db, `timeslots/${dateStr}/${slotId}`), { available: true, adminBlocked: false, vipOnly: false, surcharge: null }).catch(() => {});
      }
    } else if (option === "surcharge_remove") {
      update(ref(db, `timeslots/${dateStr}/${slotId}`), { surcharge: null }).catch(() => {});
    } else {
      update(ref(db, `timeslots/${dateStr}/${slotId}`), { surcharge: option }).catch(() => {});
    }
    setSlotOptions(null);
  };

  // Скидаємо transform після зміни dayOffset (контент оновився — повертаємо в 0)
  useLayoutEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "";
  }, [dayOffset]);

  const computeVRange = () => {
    const el = gridRef.current;
    if (!el) return;
    const { COL_W: cw, N_DAYS: nd } = calcRef.current;
    if (!cw || !nd) return;
    const stride = cw + 4;
    const sl = el.scrollLeft;
    const firstVis = Math.floor(sl / stride);
    const lastVis  = Math.ceil((sl + el.clientWidth) / stride);
    const s = Math.max(0, firstVis - VBUF);
    const e = Math.min(nd - 1, lastVis + VBUF);
    if (s !== vRangeRef.current.s || e !== vRangeRef.current.e) {
      vRangeRef.current = { s, e };
      setVRange({ s, e });
    }
  };

  // Скролимо до сьогодні при зміні daysShown (включаючи завантаження settings з Firebase)
  useEffect(() => {
    if (!gridRef.current) return;
    const colW = calcRef.current.COL_W || 70;
    const left = PAST_DAYS * (colW + 4);
    gridRef.current.scrollLeft = left;
    if (headersInnerRef.current) headersInnerRef.current.style.transform = `translateX(-${left}px)`;
    computeVRange();
  }, [settings.daysShown]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { computeVRange(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [bubbleData, setBubbleData] = useState(null);
  const [addSlotPos, setAddSlotPos] = useState(null); // { dateStr, startMin, clientX, clientY }
  const [formData, setFormData] = useState(null);
  const [createSlotData, setCreateSlotData] = useState(null); // {day, startMin}
  const [localSelectedBooking, setLocalSelectedBooking] = useState(null);
  const [todayDir, setTodayDir] = useState(null);
  const emptyHoldTimerRef = useRef(null);
  const emptyHoldPosRef   = useRef(null);
  const dayLongPressRef   = useRef(null);
  const dayLongFiredRef   = useRef(false);
  const [scheduleLocked, setScheduleLocked] = useState(() => localStorage.getItem("scheduleLocked") === "1");
  const lockHoldTimerRef  = useRef(null);
  const lockHoldFiredRef  = useRef(false);

  const handleLockDown = (e) => {
    e.preventDefault();
    lockHoldFiredRef.current = false;
    lockHoldTimerRef.current = setTimeout(() => {
      lockHoldFiredRef.current = true;
      navigator.vibrate?.([30, 40, 60]);
      setScheduleLocked(v => { const next = !v; localStorage.setItem("scheduleLocked", next ? "1" : "0"); return next; });
    }, 700);
  };
  const handleLockUp = () => clearTimeout(lockHoldTimerRef.current);

  const toggleDayBlocked = (dateStr) => {
    setSettings(s => {
      const overrides = s.dateOverrides || [];
      const existing  = overrides.find(o => o.date === dateStr);
      if (existing?.type === 'closed') {
        return { ...s, dateOverrides: overrides.filter(o => o.date !== dateStr) };
      }
      const rest = overrides.filter(o => o.date !== dateStr);
      return { ...s, dateOverrides: [...rest, { date: dateStr, type: 'closed' }] };
    });
  };

  // Shine glint animation — one booking at a time, random, every 3s
  const bookingsRef = useRef(bookings);
  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);
  useEffect(() => { setBookingsRef.current = setBookings; }, [setBookings]);
  // quickCancelRef тепер оновлюється напряму в holdTimer/onMove (без затримки ре-рендеру)
  useEffect(() => {
    const timer = setInterval(() => {
      const bks = bookingsRef.current;
      if (!bks.length) return;
      const b = bks[Math.floor(Math.random() * bks.length)];
      setShineId(b.id);
      setTimeout(() => setShineId(id => id === b.id ? null : id), 950);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const TIME_COL_W = 34;
  const HEADER_H = 64;
  const currentYear = new Date().getFullYear();
  const N_DAYS = PAST_DAYS + 365;
  const COL_W = Math.max(40, Math.floor((windowW - 16 - TIME_COL_W - (settings.daysShown - 1) * 4) / Math.max(1, settings.daysShown)));
  const allDaySchedules = (settings.weekSchedule || []).filter(d => d.start != null);
  const effectiveWorkStart = allDaySchedules.length
    ? Math.min(settings.workStart, ...allDaySchedules.map(d => d.start))
    : settings.workStart;
  const effectiveWorkEnd = allDaySchedules.length
    ? Math.max(settings.workEnd, ...allDaySchedules.map(d => d.end ?? settings.workEnd))
    : settings.workEnd;
  const totalMin = Math.max(60, (effectiveWorkEnd - effectiveWorkStart) * 60);
  // Авто-підлаштування: вся висота розкладу = доступна висота viewport
  // hourHeightPx / 60 використовується як zoom-множник (pinch)
  const availGridH = Math.max(120, windowH - 156 - HEADER_H - 4);
  const autoPxPerMin = availGridH / totalMin;
  const PX_PER_MIN = autoPxPerMin * (settings.hourHeightPx / 60);
  const gridHeight = totalMin * PX_PER_MIN;
  const days = Array.from({length: N_DAYS}, (_, i) => getDayInfo(dayOffset + i));

  // Keep calc values fresh for always-on window listeners (avoids stale closure)
  calcRef.current = { PX_PER_MIN, snapMin: settings.snapMin, workStart: effectiveWorkStart, workEnd: effectiveWorkEnd, COL_W, dayOffset, daysShown: settings.daysShown, N_DAYS };

  const minToPx = (m) => (m - effectiveWorkStart*60) * PX_PER_MIN;

  const onPointerDown = (e, b, mode) => {
    if (scheduleLocked) return;
    e.preventDefault(); e.stopPropagation();
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    const isBlock = b.type === "block";
    // Зберігаємо початкові позиції всіх сегментів — потрібно для відновлення слотів в onUp
    const dragIds = b._mergedIds ? [b.id, ...b._mergedIds] : [b.id];
    const origPositions = bookings
      .filter(x => dragIds.includes(x.id))
      .map(x => ({ id: x.id, startMin: x.startMin, durMin: x.durMin, day: x.day }));
    const dragData = { id:b.id, mergedIds:b._mergedIds||null, mode, isBlock, startClientY:e.clientY, startClientX:e.clientX, startMinutes:b.startMin, startDur:b.durMin, startDay:b.day, origPositions };
    activeDragIds?.current?.add(b.id);
    if (b._mergedIds) b._mergedIds.forEach(id => activeDragIds?.current?.add(id));

    if (mode === "top" || mode === "bottom") {
      navigator.vibrate?.(6);
      pendingDragRef.current = dragData;
      holdTimerRef.current = setTimeout(() => {
        if (!pendingDragRef.current || pendingDragRef.current.id !== b.id) return;
        resizeReadyRef.current = b.id;
        navigator.vibrate?.([15, 20, 35]);
      }, 500);
      return;
    }

    navigator.vibrate?.(6);
    pendingDragRef.current = dragData;
    if (!isBlock) {
      // Звичайні слоти: 700мс утримання → значок скасування + розблокування drag
      setHoldId(b.id);
      holdTimerRef.current = setTimeout(() => {
        if (!pendingDragRef.current) return;
        setHoldId(null);
        quickCancelRef.current = b.id;   // встановлюємо ref одразу (не чекаємо ре-рендер)
        setQuickCancelId(b.id);          // оновлюємо стан для відображення іконки
        xVisibleRef.current = true;
        xJustShownRef.current = true;
        setTimeout(() => { xJustShownRef.current = false; }, 400);
        navigator.vibrate?.([30, 40, 60]);
      }, 700);
    }
    // Блоки: жодного hold-таймера — drag активується одразу при русі >4px в onMove
  };

  // Listeners always attached — dragRef gives instant access without useEffect re-fire
  useEffect(() => {
    const onMove = (e) => {
      if (swipeRef.current) {
        const prevX = swipeRef.current.endX;
        const prevY = swipeRef.current.endY;
        swipeRef.current.endX = e.clientX;
        swipeRef.current.endY = e.clientY;
        if (!dragRef.current && !pendingDragRef.current && swipeRef.current.manualScroll && gridRef.current) {
          const dx = prevX - e.clientX;
          const dy = prevY - e.clientY;
          if (Math.abs(dx) >= Math.abs(dy)) {
            gridRef.current.scrollLeft += dx;
          } else {
            gridRef.current.scrollTop += dy;
          }
        }
      }
      if (pendingDragRef.current) {
        const pd = pendingDragRef.current;
        const moved = Math.hypot(e.clientY - pd.startClientY, e.clientX - pd.startClientX);
        if (pd.mode === "top" || pd.mode === "bottom" || pd.isBlock) {
          if ((pd.mode === "top" || pd.mode === "bottom") && resizeReadyRef.current !== pd.id) {
            // Hold не спрацював — скасовуємо resize якщо палець рухається (scroll wins)
            if (moved > 8) {
              clearTimeout(holdTimerRef.current);
              pendingDragRef.current = null;
              if (swipeRef.current) swipeRef.current.manualScroll = true;
            }
            return;
          }
          // Блок або resize після hold: активуємо drag при русі >4px
          if (moved > 4) {
            clearTimeout(holdTimerRef.current);
            dragRef.current = {...pd};
            pendingDragRef.current = null;
            resizeReadyRef.current = null;
            setDragId(pd.id);
            navigator.vibrate?.(18);
          }
          return;
        }
        // Звичайний move: drag тільки якщо hold вже спрацював (quickCancelRef встановлено)
        if (moved > 8) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          if (quickCancelRef.current !== null) {
            // Hold був — дозволяємо drag
            dragRef.current = {...pd};
            pendingDragRef.current = null;
            quickCancelRef.current = null;
            xVisibleRef.current = false;
            setQuickCancelId(null);
            setHoldId(null);
            setDragId(pd.id);
            navigator.vibrate?.(55);
          } else {
            // Hold не відбувся — ручний скрол grid
            pendingDragRef.current = null;
            setHoldId(null);
            if (swipeRef.current) swipeRef.current.manualScroll = true;
          }
        }
        return;
      }
      if (!dragRef.current) return;
      const drag = dragRef.current;
      const { PX_PER_MIN, snapMin, workStart, workEnd, COL_W, dayOffset, N_DAYS } = calcRef.current;
      const snap = (m) => Math.round(m / snapMin) * snapMin;
      const dy = e.clientY - drag.startClientY;
      const dxRaw = e.clientX - drag.startClientX;
      const deltaMin = dy / PX_PER_MIN;
      const setBookingsFn = setBookingsRef.current || setBookings;
      const allDragIds = drag.mergedIds ? new Set(drag.mergedIds) : new Set([drag.id]);
      setBookingsFn(bs => {
        const baseBooking = bs.find(b => b.id === drag.id);
        if (!baseBooking) return bs;

        if (drag.mode === "move") {
          // Цільовий день — від абсолютної позиції вказівника над сіткою (стійко до скролу),
          // а не від зсуву dxRaw, який ламається при горизонтальному скролі сітки.
          let newDay;
          const gridEl = gridRef.current;
          if (gridEl) {
            const rect = gridEl.getBoundingClientRect();
            // Subtract any leftover swipe transform so column calc stays accurate
            const wrapTx = (() => {
              const t = gridWrapRef.current?.style.transform;
              const m = t && t.match(/translateX\((-?[\d.]+)px\)/);
              return m ? parseFloat(m[1]) : 0;
            })();
            const xInContent = e.clientX - rect.left + gridEl.scrollLeft - wrapTx;
            newDay = dayOffset + Math.floor(xInContent / (COL_W + 4));
          } else {
            newDay = drag.startDay + Math.round(dxRaw / (COL_W + 4));
          }
          // Clamp to today..future — dragging to past days not allowed
          newDay = Math.max(0, Math.min(dayOffset + N_DAYS - 1, newDay));

          // Уся об'єднана картка рухається як єдина жорстка група (зберігаючи зсуви сегментів)
          const segIds = drag.mergedIds && drag.mergedIds.length ? [drag.id, ...drag.mergedIds] : [drag.id];
          const segs = bs.filter(b => segIds.includes(b.id));
          if (!segs.length) return bs;
          const baseStart = snap(drag.startMinutes + deltaMin);
          const targets = segs.map(b => ({
            id: b.id, durMin: b.durMin,
            s: baseStart + (b.startMin - baseBooking.startMin),
          }));
          // Зсув групи в межі робочих годин (без стиснення відносних позицій)
          const minS = Math.min(...targets.map(t => t.s));
          const maxE = Math.max(...targets.map(t => t.s + t.durMin));
          let shift = 0;
          if (minS < workStart * 60) shift = workStart * 60 - minS;
          if (maxE + shift > workEnd * 60) shift = Math.min(shift, workEnd * 60 - maxE);
          targets.forEach(t => { t.s += shift; });
          // Атомарна перевірка накладання — якщо хоч один сегмент конфліктує, тримаємо всю групу
          const overlap = targets.some(t => bs.some(x =>
            !segIds.includes(x.id) && x.day === newDay &&
            t.s < x.startMin + x.durMin && t.s + t.durMin > x.startMin));
          if (overlap) return bs;
          const tMap = new Map(targets.map(t => [t.id, t.s]));
          return bs.map(b => tMap.has(b.id) ? { ...b, startMin: tMap.get(b.id), day: newDay } : b);
        }

        return bs.map(b => {
          if (b.id !== drag.id) return b; // resize торкається лише первинного сегмента
          if (drag.mode === "bottom") {
            let d = snap(drag.startDur + deltaMin);
            const nextStart = bs.filter(x=>!allDragIds.has(x.id)&&x.day===b.day&&x.startMin>b.startMin)
              .reduce((mn,x)=>Math.min(mn,x.startMin), workEnd*60);
            d = Math.max(60, Math.min(d, nextStart - b.startMin));
            return {...b, durMin:d};
          } else if (drag.mode === "top") {
            let s = snap(drag.startMinutes + deltaMin);
            const maxS = drag.startMinutes + drag.startDur - 60;
            const floorStart = bs.filter(x=>!allDragIds.has(x.id)&&x.day===b.day&&x.startMin+x.durMin<=drag.startMinutes)
              .reduce((mx,x)=>Math.max(mx,x.startMin+x.durMin), workStart*60);
            s = Math.max(floorStart, Math.min(maxS, s));
            const diff = s - drag.startMinutes;
            return {...b, startMin:s, durMin: drag.startDur - diff};
          }
          return b;
        });
      });
    };
    const onUp = () => {
      const wasDragging = !!dragRef.current;
      const endedId = dragRef.current?.id ?? pendingDragRef.current?.id;
      const endedMergedIds = dragRef.current?.mergedIds ?? pendingDragRef.current?.mergedIds ?? null;

      dragRef.current = null;
      setDragId(null);
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      pendingDragRef.current = null;
      setHoldId(null);
      resizeReadyRef.current = null;
      if (!xVisibleRef.current) {
        quickCancelRef.current = null;
        setQuickCancelId(null);
      }
      if (wasDragging) {
        dragEndedRef.current = true;
        setTimeout(() => { dragEndedRef.current = false; }, 400);
      }
      // Remove from activeDragIds after save debounce window, then flush any deferred slot snap
      if (endedId) setTimeout(() => {
        activeDragIds?.current?.delete(endedId);
        endedMergedIds?.forEach(id => activeDragIds?.current?.delete(id));
        if (pendingSlotSnapRef.current && activeDragIds?.current?.size === 0) {
          const { slots, viewing } = pendingSlotSnapRef.current;
          setOpenSlots(slots);
          setViewingSlots(viewing);
          pendingSlotSnapRef.current = null;
        }
      }, 700);
      swipeRef.current = null;
      // Reset any leftover swipe transform so it doesn't skew drag column calculations
      if (gridWrapRef.current) {
        gridWrapRef.current.style.transition = "none";
        gridWrapRef.current.style.transform = "";
      }
    };
    const onResize = () => { setWindowW(window.innerWidth); setWindowH(window.innerHeight); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", onResize);
      clearTimeout(holdTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const touchesRef = useRef([]);
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      touchesRef.current = [e.touches[0].clientY, e.touches[1].clientY];
      setPinch({ startDist: Math.abs(e.touches[0].clientY - e.touches[1].clientY), startH: settings.hourHeightPx });
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinch) {
      const dist = Math.abs(e.touches[0].clientY - e.touches[1].clientY);
      const ratio = dist / pinch.startDist;
      setSettings(s => ({...s, hourHeightPx: Math.max(30, Math.min(160, Math.round(pinch.startH * ratio)))}));
    }
  };
  const onTouchEnd = () => setPinch(null);

  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSettings(s => ({...s, hourHeightPx: Math.max(30, Math.min(160, s.hourHeightPx - Math.sign(e.deltaY) * 6))}));
    }
  };

  const hours = [];
  for (let h = settings.workStart; h <= settings.workEnd; h++) hours.push(h);

  const slotColor = (b) => {
    const svc = settings.services.find(s=>s.id===b.serviceId)
             || settings.services.find(s=>s.active && s.type===(b.serviceType||b.type) && Number(s.duration)===b.durMin);
    return colorOf(svc?.colorId);
  };

  const handleColumnClick = (e, absDay) => {
    if (dragRef.current || dragEndedRef.current || pendingDragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const yRel = e.clientY - rect.top;
    const { snapMin, workStart, PX_PER_MIN } = calcRef.current;
    const rawMin = workStart * 60 + yRel / PX_PER_MIN;
    const minute = Math.round(rawMin / snapMin) * snapMin;
    const bData = { day: absDay, startMin: minute, clientX: e.clientX, clientY: e.clientY, dateStr: absDayToDateStr(absDay) };
    setBubbleData(bData);
  };

  const handleAction = (action, b) => {
    if (action === "confirm") setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x));
    if (action === "cancel") {
      // Відновити timeslots
      const cancelOne = (mb) => {
        if (mb.startMin !== undefined && mb.durMin) {
          const dateStr = mb.date || absDayToDateStr(mb.day);
          const upd = {};
          for (let i = 0; i < mb.durMin; i += 60) {
            const sm = mb.startMin + i;
            const hh = String(Math.floor(sm/60)).padStart(2,'0'), mm = String(sm%60).padStart(2,'0');
            upd[`timeslots/${dateStr}/slot${hh}${mm}/available`] = true;
          }
          if (Object.keys(upd).length) update(ref(db,'/'), upd).catch(()=>{});
        }
        // Позначити cancelled у Firebase (обидва можливих ключі)
        if (mb.userId) {
          const ks = [...new Set([mb._fbKey, mb.id].filter(Boolean))];
          ks.forEach(k => update(ref(db, `bookings/${mb.userId}/${k}`),
            { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
        }
      };
      const allToCancel = b._mergedIds
        ? bookings.filter(x => b._mergedIds.includes(x.id))
        : [b];
      allToCancel.forEach(cancelOne);
      // Затемнення 2с → видалення з локального стану
      setCancellingSet(s=>new Set([...s, b.id]));
      cancelTimers.current[b.id] = setTimeout(()=>{
        setCancellingSet(s=>{ const ns=new Set(s); ns.delete(b.id); return ns; });
        const idsC = b._mergedIds || [b.id];
        setBookings(bs=>bs.filter(x=>!idsC.includes(x.id)));
        delete cancelTimers.current[b.id];
      }, 2000);
    }
    if (action === "noshow")  setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"noshow"}:x));
    if (action === "delete")  setBookings(bs=>bs.filter(x=>x.id!==b.id));
    if (action === "repeat")  setBookings(bs=>[...bs,{...b, id:`b-${Date.now()}`, day:b.day+7, status:"confirmed"}]);
    if (action === "chat")     { navTo?.("chats"); return; }
    if (action === "call")     window.location.href=`tel:${b.phone}`;
    if (action === "sms")      window.location.href=`sms:${b.phone}`;
    if (action === "viber")    window.location.href=`viber://chat?number=%2B${b.phone.replace(/\D/g,"")}`;
    if (action === "telegram") window.location.href=`https://t.me/${b.phone.replace(/\D/g,"")}`;
    if (action === "toggleVip") {
      const next = !b.isVipOnly;
      setBookings(bs=>bs.map(x=>x.id===b.id?{...x,isVipOnly:next,categoryId:next?"cat-vip":null}:x));
      setLocalSelectedBooking(prev=>prev?{...prev,isVipOnly:next,categoryId:next?"cat-vip":null}:null);
      return;
    }
    setLocalSelectedBooking(null);
  };
  const [blockModal, setBlockModal] = useState(null); // {id, day, startMin, durMin}
  const [blockModalClosing, setBlockModalClosing] = useState(false);
  const [broadcastInit, setBroadcastInit] = useState(null);

  const handleBlock = ({ day, startMin }) => {
    setBookings(bs=>[...bs,{
      id:`block-${Date.now()}`, day, startMin, durMin:60,
      name:"ЗАБЛОКОВАНО", phone:"", type:"block", tsc:"",
      hoursDone:0, status:"blocked", serviceId:""
    }]);
  };

  const handleVipSlot = ({ day, startMin }) => {
    const dateStr = absDayToDateStr(day);
    const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
    const mm = String(startMin % 60).padStart(2, "0");
    update(ref(db, `timeslots/${dateStr}/slot${hh}${mm}`), {
      time: `${hh}:${mm}`, available: true, vipOnly: true,
    }).catch(() => {});
  };

  const [vipSlotModal, setVipSlotModal] = useState(null);
  const [vipSlotModalClosing, setVipSlotModalClosing] = useState(false);
  const [slotOptions, setSlotOptions] = useState(null); // { dateStr, time, startTime, slot }
  const [slotClosing, setSlotClosing] = useState(false);
  const [personalEventData, setPersonalEventData] = useState(null); // { dateStr, time }
  const [longTapMenu, setLongTapMenu] = useState(null); // { dateStr, startMin, clientX, clientY }
  const [ltmClosing, setLtmClosing] = useState(false);
  const [ltmScatter, setLtmScatter] = useState(false);
  const [personalEventView, setPersonalEventView] = useState(null); // booking object for viewing

  const isStickySlot = (dateStr, time) => {
    if (!settings.stickyTimeEnabled) return true;
    const [h, m] = time.split(":").map(Number);
    const slotMin = h * 60 + m;
    const today = new Date(); today.setHours(0,0,0,0);
    const absDay = Math.round((new Date(dateStr + "T12:00:00") - today) / 86400000);
    const dayBkgs = bookings.filter(b => b.day === absDay && b.type !== "block" && b.type !== "vip-slot" && b.type !== "personal");
    const adjBefore = dayBkgs.some(b => b.startMin === slotMin + 60);
    const adjAfter  = dayBkgs.some(b => b.startMin + b.durMin === slotMin);
    if (settings.stickyTime === "before") return adjBefore;
    if (settings.stickyTime === "after")  return adjAfter;
    return adjBefore || adjAfter;
  };

  return (
    <>
    <style>{makeGlobalCSS(SURF_LO, ACCENT, GLOW, SHADE, INK)}</style>
    <Card style={{padding:"6px 3px 0", overflow:"hidden", flex:1, minHeight:0, display:"flex", flexDirection:"column"}}>
      <div style={{display:"flex", flex:1, minHeight:0, overflow:"hidden", position:"relative"}}>

        {/* TIME COLUMN — fixed left, never scrolls */}
        <div style={{
          width:TIME_COL_W, flexShrink:0, zIndex:10,
          display:"flex", flexDirection:"column",
          borderRight:`1px solid ${ink(0.07)}`,
        }}>
          {/* Кнопка «Згенерувати всі слоти» — у кутовому спейсері */}
          <div style={{height:HEADER_H + 4, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center"}}>
            <button
              onClick={isGeneratingAll ? undefined : generateAllSlots}
              title={`Згенерувати слоти на ${settings.calendarOpenDays||30} днів за графіком`}
              style={{
                width:28, height:28, borderRadius:8, border:"none", cursor: isGeneratingAll?"default":"pointer",
                background: isGeneratingAll ? "rgba(99,211,120,0.12)" : "rgba(99,211,120,0.18)",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"background .15s",
              }}>
              {isGeneratingAll
                ? <div style={{width:12,height:12,borderRadius:"50%",border:"2px solid rgba(99,211,120,0.3)",borderTopColor:"rgba(99,211,120,0.9)",animation:"spin .7s linear infinite"}}/>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(99,211,120,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              }
            </button>
          </div>
          <div style={{overflow:"hidden", flex:1, position:"relative"}}>
            <div ref={timeColRef} style={{position:"absolute", top:0, left:0, right:0, height:gridHeight}}>
              {Array.from({length:(effectiveWorkEnd-effectiveWorkStart)*2+1},(_,i)=>{
                const totalMins = i*30;
                const h = effectiveWorkStart + Math.floor(totalMins/60);
                const m = totalMins % 60;
                if (h > effectiveWorkEnd) return null;
                return m === 0 ? (
                  <div key={i} style={{
                    position:"absolute", top:Math.max(2, totalMins*PX_PER_MIN - 5),
                    left:0, right:0, textAlign:"center",
                    fontSize:10, fontWeight:700, lineHeight:1, color:TEXT_DIM,
                  }}>{h}:00</div>
                ) : (
                  <div key={i} style={{
                    position:"absolute", top:totalMins*PX_PER_MIN - 3,
                    left:0, right:0, textAlign:"center",
                    fontSize:7, fontWeight:600, lineHeight:1,
                    color:"rgba(139,141,147,0.5)",
                  }}>{h}:30</div>
                );
              })}
            </div>
          </div>
          {/* Замок — в нижній частині стовпця часу, вирівняний із сум-рядком */}
          <div
            onPointerDown={handleLockDown}
            onPointerUp={handleLockUp}
            onPointerCancel={handleLockUp}
            onContextMenu={e=>e.preventDefault()}
            style={{
              height:30, flexShrink:0, marginBottom:10,
              display:"flex", alignItems:"center", justifyContent:"center",
              WebkitUserSelect:"none", userSelect:"none", touchAction:"none", cursor:"pointer",
            }}
          >
            {scheduleLocked ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{filter:"drop-shadow(0 0 5px rgba(239,68,68,0.5))"}}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(99,211,120,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
              </svg>
            )}
          </div>
        </div>

        {/* SCROLLABLE GRID — horizontal + vertical */}
        <div
          ref={gridRef}
          onPointerDownCapture={e=>{
            swipeRef.current={startX:e.clientX,startY:e.clientY,endX:e.clientX,endY:e.clientY,startTime:Date.now()};
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          onScroll={e=>{
            if (timeColRef.current)
              timeColRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
            computeVRange();
            const el = e.currentTarget;
            const cw = calcRef.current.COL_W;
            if (cw) {
              const todayX = PAST_DAYS * (cw + 4);
              const sl = el.scrollLeft;
              if (sl > todayX + cw) setTodayDir("left");
              else if (sl + el.clientWidth < todayX) setTodayDir("right");
              else setTodayDir(null);
            }
          }}
          onContextMenu={e=>e.preventDefault()}
          className="schedule-scroll"
          style={{flex:1, overflowX:"auto", overflowY:"auto", touchAction:"pan-x pan-y", WebkitOverflowScrolling:"touch", userSelect:"none", WebkitUserSelect:"none"}}
        >
          <div ref={gridWrapRef} style={{display:"flex", paddingTop:2}}>
          {vRange.s > 0 && <div style={{width:vRange.s*(COL_W+4), flexShrink:0}}/>}
          {days.slice(vRange.s, vRange.e+1).map((day,_i)=>{
            const colIdx = vRange.s + _i;
            const absDay = dayOffset + colIdx;
            const dateStrCol = absDayToDateStr(absDay);
            // Записи цього дня — для приховування вільних слотів, які запис накрив
            // (навіть наполовину): такий слот не показуємо й не пропонуємо клієнту.
            const colBookings = bookings.filter(b => b.day === absDay && b.status !== "cancelled");
            const slotCovered = (mn) => colBookings.some(b => b.startMin < mn + 60 && b.startMin + b.durMin > mn);
            const isOpenCol = Object.entries(openSlots[dateStrCol] || {}).some(([t, s]) => {
              if (!s.available) return false;
              const [hh, mm] = t.split(":").map(Number);
              return !slotCovered(hh * 60 + mm);
            });
            const _dow = (new Date(dateStrCol + "T12:00:00").getDay() + 6) % 7;
            const _ov  = (settings.dateOverrides || []).find(o => o.date === dateStrCol);
            const _ws  = (settings.weekSchedule  || [])[_dow] || {};
            const colLunch = {
              enabled: _ov?.lunchEnabled ?? _ws.lunchEnabled ?? settings.lunchEnabled ?? true,
              start:   _ov?.lunchStart   ?? _ws.lunchStart   ?? settings.lunchStart   ?? 12,
              end:     _ov?.lunchEnd     ?? _ws.lunchEnd     ?? settings.lunchEnd     ?? 13,
            };
            const isToday = absDay === 0;
            const isPastDay = absDay < 0;
            const isLoadingCol = genLoadingDays.has(absDay);
            const hasAnySlotsCol = !!(openSlots[dateStrCol] && Object.keys(openSlots[dateStrCol]).length);
            const isClosedDay = _ov?.type === 'closed';
            return (
            <div key={absDay} style={{
              display:"flex", flexDirection:"column", flexShrink:0,
              width:COL_W, marginRight:colIdx<N_DAYS-1?4:0,
            }}>
              {/* DATE HEADER — sticky top, moves with column horizontally */}
              <div
                onClick={e=>{ e.stopPropagation(); if(scheduleLocked) return; if(dayLongFiredRef.current){dayLongFiredRef.current=false;return;} if(isPastDay || isLoadingCol || isClosedDay) return; hasAnySlotsCol ? clearDaySlots(absDay) : generateDaySlots(absDay); }}
                onPointerDown={e=>{ if(scheduleLocked || isPastDay) return; clearTimeout(dayLongPressRef.current); dayLongFiredRef.current=false; dayLongPressRef.current=setTimeout(()=>{ dayLongFiredRef.current=true; toggleDayBlocked(dateStrCol); }, 600); }}
                onPointerUp={()=>clearTimeout(dayLongPressRef.current)}
                onPointerLeave={()=>clearTimeout(dayLongPressRef.current)}
                style={{
                  position:"sticky", top:0, zIndex:12,
                  height:HEADER_H, flexShrink:0, marginBottom:4,
                  display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"space-between",
                  padding:"3px 2px 3px", borderRadius:10, cursor: isPastDay ? "default" : "pointer",
                  opacity: isPastDay ? 0.35 : 1, overflow:"visible",
                  background: isClosedDay ? `rgba(220,60,60,0.13)` : isToday ? `rgba(247,201,72,0.18)` : isOpenCol ? (isLight ? `rgba(58,140,30,0.12)` : `rgba(99,211,120,0.13)`) : (isLight ? `rgba(0,0,0,0.07)` : `rgba(0,0,0,0.18)`),
                  boxShadow: isClosedDay ? `inset 0 0 0 1.5px rgba(220,60,60,0.7)` : isToday ? `inset 0 0 0 1.5px rgba(247,201,72,0.55)` : isOpenCol ? (isLight ? `inset 0 0 0 1px rgba(58,140,30,0.5)` : `inset 0 0 0 1px rgba(99,211,120,0.35)`) : "none",
                }}>
                <div style={{fontSize:9, fontWeight:700, lineHeight:1.2,
                  color: isClosedDay ? RED : isToday ? GOLD : isOpenCol ? GREEN : TEXT_FAINT,
                  letterSpacing:0.3, overflow:"hidden", whiteSpace:"nowrap",
                  maxWidth:"100%", textOverflow:"ellipsis",
                }}>{day.fullLabel}</div>
                <div style={{fontSize:14, fontWeight:800, lineHeight:1.2,
                  color: isClosedDay ? RED : isToday ? GOLD : isOpenCol ? GREEN : DIM,
                }}>{day.num}</div>
                <div style={{fontSize:8, fontWeight:700, lineHeight:1,
                  color: isClosedDay ? RED : isToday ? GOLD : isOpenCol ? GREEN : FAINT,
                  letterSpacing:0.2,
                }}>{day.month}{day.year !== currentYear ? ` ${day.year}` : ""}</div>
                <div style={{fontSize:9, lineHeight:1, opacity: isClosedDay ? 1 : 0.7,
                  color: isClosedDay ? RED : isLoadingCol ? FAINT : isOpenCol ? GREEN : FAINT,
                }}>{isPastDay ? "" : isClosedDay ? "🔒" : isLoadingCol ? "…" : isOpenCol ? "✓" : "＋"}</div>
                {genToast?.absDay === absDay && (
                  <div style={{position:"absolute", bottom:-18, left:"50%", transform:"translateX(-50%)",
                    background: genToast.free > 0 ? "rgba(99,211,120,0.92)" : "rgba(220,80,80,0.92)",
                    color:"#fff", fontSize:9, fontWeight:700, borderRadius:6, padding:"2px 5px",
                    whiteSpace:"nowrap", zIndex:20, pointerEvents:"none",
                  }}>
                    {genToast.free > 0 ? `+${genToast.free}` : `0 / ${genToast.blocked}б`}
                  </div>
                )}
              </div>

              {/* SLOT CONTENT */}
              <div
                onClick={e=>{ if(xJustShownRef.current){ xJustShownRef.current=false; return; } if(quickCancelId){ xVisibleRef.current=false; setQuickCancelId(null); } }}
                onPointerDown={e=>{
                  if (scheduleLocked || isPastDay) return;
                  if (e.button > 0) return;
                  if (dragRef.current || pendingDragRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rawMin = calcRef.current.workStart * 60 + (e.clientY - rect.top) / calcRef.current.PX_PER_MIN;
                  const minute = Math.round(rawMin / 30) * 30;
                  emptyHoldPosRef.current = { startY: e.clientY, day: absDay, startMin: minute, dateStr: dateStrCol };
                  emptyHoldTimerRef.current = setTimeout(() => {
                    if (!emptyHoldPosRef.current) return;
                    navigator.vibrate?.(30);
                    setLtmClosing(false); setLtmScatter(false);
                    setLongTapMenu({ dateStr: dateStrCol, startMin: minute, selectedMin: minute, clientX: e.clientX, clientY: e.clientY, isClosedDay });
                    emptyHoldPosRef.current = null;
                  }, 480);
                }}
                onPointerMove={e=>{
                  if (!emptyHoldPosRef.current) return;
                  if (Math.abs(e.clientY - emptyHoldPosRef.current.startY) > 8) {
                    clearTimeout(emptyHoldTimerRef.current);
                    emptyHoldPosRef.current = null;
                  }
                }}
                onPointerUp={e=>{
                  const pos = emptyHoldPosRef.current;
                  clearTimeout(emptyHoldTimerRef.current);
                  emptyHoldPosRef.current = null;
                  // Короткий клік (hold не спрацював) → одразу створити вільний слот
                  if (pos && !dragEndedRef.current) {
                    const hasConflict = Object.keys(openSlots[pos.dateStr] || {}).some(t => {
                      const [th, tm] = t.split(':').map(Number);
                      const diff = Math.abs(th * 60 + tm - pos.startMin);
                      return diff > 0 && diff < 60;
                    });
                    if (hasConflict) {
                      navigator.vibrate?.(80);
                    } else {
                      const hh = String(Math.floor(pos.startMin/60)).padStart(2,'0');
                      const mm = String(pos.startMin%60).padStart(2,'0');
                      update(ref(db, `timeslots/${pos.dateStr}/slot${hh}${mm}`), {
                        available: true, time: `${hh}:${mm}`
                      }).catch(()=>{});
                    }
                  }
                }}
                onPointerCancel={()=>{ clearTimeout(emptyHoldTimerRef.current); emptyHoldPosRef.current = null; }}
                onPointerLeave={()=>{ clearTimeout(emptyHoldTimerRef.current); emptyHoldPosRef.current = null; }}
                onContextMenu={e=>e.preventDefault()}
                style={{
                  width:COL_W, height:gridHeight,
                  position:"relative", padding:"0 4px",
                  background: isLight ? `linear-gradient(135deg,${SURF_LO},${BG_DEEP})` : `linear-gradient(135deg,${BG_DEEP},rgba(0,0,0,0.55))`,
                  borderRadius:14, boxShadow:SHADOW_IN, cursor: isPastDay || isClosedDay ? "default" : "cell",
                  userSelect:"none", WebkitUserSelect:"none", WebkitTouchCallout:"none",
                  opacity: isPastDay ? 0.38 : 1,
                }}>

              {/* Open/blocked/surcharge/VIP slot indicators */}
              {(()=>{
                const sortedMins = Object.keys(openSlots[dateStrCol] || {})
                  .map(t => { const [hh, mm] = t.split(':').map(Number); return hh*60+mm; })
                  .sort((a, b) => a - b);
                return Object.entries(openSlots[dateStrCol] || {}).map(([time, slot]) => {
                const [h, m] = time.split(":").map(Number);
                const startMin = h * 60 + m;
                if (startMin < effectiveWorkStart * 60 || startMin >= effectiveWorkEnd * 60) return null;
                // Вільний/доступний слот, накритий записом (хоча б частково), не показуємо.
                if (slot.available && slotCovered(startMin)) return null;
                const nextMin = sortedMins.find(t => t > startMin) ?? (startMin + 60);
                const slotHeightMin = Math.min(60, nextMin - startMin, effectiveWorkEnd * 60 - startMin);
                const isVip = slot.vipOnly;
                const isBlocked = slot.adminBlocked;
                const hasSurcharge = !!slot.surcharge;
                const hasViewer = (viewingSlots[dateStrCol] || []).includes(time);
                const isSticky = (isVip || isBlocked || hasSurcharge) ? true : isStickySlot(dateStrCol, time);
                const bg = isVip ? "rgba(168,85,247,0.15)" : isBlocked ? "rgba(239,68,68,0.15)" : hasSurcharge ? "rgba(247,201,72,0.15)" : isSticky ? STICKY_BG : FREE_BG;
                const borderColor = isVip ? "rgba(168,85,247,0.55)" : isBlocked ? "rgba(239,68,68,0.5)" : hasSurcharge ? (isLight ? "rgba(140,110,0,0.65)" : "rgba(247,201,72,0.6)") : isSticky ? STICKY_BD : FREE_BD;
                const color = isVip ? "rgba(168,85,247,0.9)" : isBlocked ? "rgba(239,68,68,0.85)" : hasSurcharge ? (isLight ? "rgba(100,75,0,0.9)" : "rgba(247,201,72,0.95)") : isSticky ? STICKY_CLR : FREE_CLR;
                return (
                  <div key={`os-${time}`}
                    onPointerDown={e=>{
                      if (scheduleLocked || isPastDay || isClosedDay) return;
                      e.stopPropagation();
                      slotHoldFiredRef.current = false;
                      slotHoldTimerRef.current = setTimeout(()=>{
                        slotHoldFiredRef.current = true;
                        navigator.vibrate?.(40);
                        setSlotOptions({ dateStr: dateStrCol, time, startTime: time, slot });
                      }, 600);
                    }}
                    onPointerUp={()=>clearTimeout(slotHoldTimerRef.current)}
                    onPointerCancel={()=>clearTimeout(slotHoldTimerRef.current)}
                    onClick={e=>{
                      e.stopPropagation();
                      if (isPastDay || isClosedDay || slotHoldFiredRef.current) return;
                      toggleSlotFree(dateStrCol, time, slot);
                    }}
                    style={{
                      position:"absolute", left:0, right:0,
                      top: minToPx(startMin) + 1,
                      height: slotHeightMin * PX_PER_MIN - 2,
                      opacity: isSticky ? 0.90 : 0.82,
                      background: bg,
                      border: `1.5px solid ${borderColor}`,
                      borderRadius:8, cursor:"pointer", zIndex:1,
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center",
                      padding:0,
                    }}>
                    {hasSurcharge && <span style={{position:"absolute", top:3, left:4, fontSize:9, fontWeight:800, color:"rgba(247,201,72,0.95)", lineHeight:1}}>+{slot.surcharge}₴</span>}
                    {(isVip || slot.vipOnly) && <span style={{position:"absolute", top:3, right:4, fontSize:10, lineHeight:1}}>👑</span>}

                    {hasViewer && <span style={{position:"absolute", bottom:3, right:4, fontSize:8, lineHeight:1, opacity:0.8}}>👁</span>}
                    {isBlocked && (() => { const qc = queueMap[`${dateStrCol}_${time}`]; return qc > 0 ? (
                      <div style={{position:"absolute", bottom:2, right:4, display:"flex", alignItems:"center", gap:1}}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill={GOLD}><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
                        <span style={{fontSize:7, fontWeight:800, color:GOLD, lineHeight:1}}>{qc}</span>
                      </div>
                    ) : null; })()}
                  </div>
                );
              });
            })()}

              {/* 30-min grid lines */}
              {Array.from({length:(effectiveWorkEnd-effectiveWorkStart)*2-1},(_,i)=>{
                const isHour=(i+1)%2===0;
                return <div key={i} style={{
                  position:"absolute",left:0,right:0,
                  top:(i+1)*30*PX_PER_MIN,
                  height:1,
                  background:isHour ? GRID_H : GRID_HH
                }}/>;
              })}

              {/* Lunch block */}
              {colLunch.enabled && (
                <div style={{
                  position:"absolute",
                  top:minToPx(colLunch.start*60), left:0, right:0,
                  height:(colLunch.end - colLunch.start)*60*PX_PER_MIN,
                  background: isLight ? `repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(0,0,0,0.05) 6px, rgba(0,0,0,0.05) 12px)` : `repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(255,255,255,0.04) 6px, rgba(255,255,255,0.04) 12px)`,
                  border:`2px solid #1d4ed8`,
                  borderRadius:8, pointerEvents:"none",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,
                }}>
                  <svg viewBox="0 0 272.7 238.5" style={{width:Math.min(24,(colLunch.end-colLunch.start)*60*PX_PER_MIN*0.45),opacity:0.9,marginTop:6}} fill="#FFC72C">
                    <path d="m195.8 17.933c23.3 0 42.2 98.3 42.2 219.7h34c0-130.7-34.3-236.5-76.3-236.5-24 0-45.2 31.7-59.2 81.5-14-49.8-35.2-81.5-59-81.5-42 0-76.2 105.7-76.2 236.4h34c0-121.4 18.7-219.6 42-219.6s42.2 90.8 42.2 202.8h33.8c0-112 19-202.8 42.3-202.8" stroke="rgba(0,0,0,0.85)" strokeWidth="16" paintOrder="stroke"/>
                  </svg>
                  <span style={{fontSize:7,fontWeight:700,color:TEXT_FAINT,letterSpacing:0.5,textTransform:"uppercase"}}>обід</span>
                </div>
              )}

              {/* Viewing indicators — only for TAKEN slots (open slots already show 👁 inside) */}
              {(viewingSlots[dateStrCol] || []).filter(time => {
                const s = openSlots[dateStrCol]?.[time];
                if (s && !s.adminBlocked) return false;
                const [h, m] = time.split(":").map(Number);
                const sm = h * 60 + m;
                return sm >= effectiveWorkStart * 60 && sm < effectiveWorkEnd * 60;
              }).map(time => {
                const [h, m] = time.split(":").map(Number);
                const topPx = minToPx(h * 60 + m);
                return (
                  <div key={`v-${time}`} style={{
                    position:"absolute", left:2, right:2,
                    top:topPx, height:60*PX_PER_MIN,
                    background:"rgba(247,201,72,0.10)",
                    borderLeft:"2px solid rgba(247,201,72,0.5)",
                    borderRadius:6, pointerEvents:"none",
                    display:"flex", alignItems:"center", paddingLeft:5,
                    gap:3,
                  }}>
                    <span style={{fontSize:8, color:"rgba(247,201,72,0.7)", fontWeight:700, letterSpacing:0.5}}>👁 {time}</span>
                  </div>
                );
              })}

              {/* Bookings */}
              {bookings.filter(b=>b.day===absDay).sort((a,b)=>a.startMin-b.startMin).map(b=>{
                if (b.status === "cancelled") return null;
                const wsMin = effectiveWorkStart * 60;
                const weMin = effectiveWorkEnd * 60;
                if (b.startMin >= weMin || b.startMin + b.durMin <= wsMin) return null;
                const visStart = Math.max(b.startMin, wsMin);
                const visEnd   = Math.min(b.startMin + b.durMin, weMin);
                const top    = minToPx(visStart);
                const height = (visEnd - visStart) * PX_PER_MIN;
                const c = slotColor(b);
                const isPending = b.status==="pending" && settings.pendingEnabled;
                const isCancelling = cancellingSet.has(b.id);
                const isBlock = b.type === "block";
                const isVipSlot = b.type === "vip-slot";
                const isPersonal = b.type === "personal";
                const slotTimeStr = String(Math.floor(b.startMin/60)).padStart(2,'0')+':'+String(b.startMin%60).padStart(2,'0');
                const queueCount = b.date ? (queueMap[`${b.date}_${slotTimeStr}`] || 0) : 0;
                const isDimmed = !isBlock && !isVipSlot && !isPersonal && (b.status==="noshow" || isCancelling);
                const svc = settings.services.find(s=>s.id===b.serviceId)
                         || settings.services.find(s=>s.active && s.type===(b.serviceType||b.type) && Number(s.duration)===b.durMin);
                const basePrice = svc
                  ? Math.round((svc.price / svc.duration) * b.durMin)
                  : b.price && b.durationHours
                    ? Math.round((b.price / (b.durationHours * 60)) * b.durMin)
                    : (b.price || 0);
                const price = basePrice + (b.surcharge || 0);
                return (
                  /* Обгортка — overflow:visible щоб значок не обрізався */
                  <div key={b.id} style={{
                    position:"absolute", top:top+1, left:0, right:0,
                    height:height-2, overflow:"visible",
                    zIndex: dragId===b.id?10:2,
                    background: BG_DEEP,
                    borderRadius: 8,
                  }}>
                    {/* Сам слот */}
                    <div
                      className={`slot-base ${(isBlock||isPersonal)?"":"slot-colored"} ${!isBlock&&!isPersonal&&isPending?"slot-pending-ring":""} ${!isBlock&&!isPersonal&&holdId===b.id?"slot-holding":""} ${!isBlock&&!isPersonal&&shineId===b.id&&!isDimmed?"shine-active":""}`}
                      onPointerDown={e=>onPointerDown(e,b,"move")}
                      onContextMenu={e=>e.preventDefault()}
                      onClick={e=>{
                        e.stopPropagation();
                        if(xJustShownRef.current){ xJustShownRef.current=false; return; }
                        if(quickCancelId){ xVisibleRef.current=false; setQuickCancelId(null); return; }
                        if(dragEndedRef.current) return;
                        if(isVipSlot){ setVipSlotModal(b); return; }
                        if(isBlock){ setBlockModal(b); return; }
                        if(isPersonal){ setPersonalEventView(b); return; }
                        if(isCancelling){
                          clearTimeout(cancelTimers.current[b.id]);
                          delete cancelTimers.current[b.id];
                          setCancellingSet(s=>{ const ns=new Set(s); ns.delete(b.id); return ns; });
                          return;
                        }
                        if(!dragRef.current){ setLocalSelectedBooking(b); onSlotClick?.(b); }
                      }}
                      style={isVipSlot ? {
                        position:"relative", width:"100%", height:"100%",
                        borderRadius:8,
                        background:"rgba(168,85,247,0.13)",
                        border:"1.5px solid rgba(168,85,247,0.5)",
                        display:"flex", flexDirection:"column",
                        alignItems:"flex-start", justifyContent:"center",
                        padding:"0 7px", overflow:"hidden",
                      } : isPersonal ? {
                        position:"relative", width:"100%", height:"100%",
                        borderRadius:8,
                        background:"rgba(45,212,191,0.12)",
                        border:"1.5px solid rgba(45,212,191,0.4)",
                        display:"flex", flexDirection:"column",
                        alignItems:"flex-start", justifyContent:"center",
                        padding:"0 7px", overflow:"hidden",
                      } : isBlock ? {
                        position:"relative", width:"100%", height:"100%",
                        borderRadius:8,
                        background:`repeating-linear-gradient(45deg,${STRIPE_A},${STRIPE_A} 6px,${STRIPE_B} 6px,${STRIPE_B} 12px)`,
                        border:`1px solid ${ink(0.08)}`,
                        boxShadow:`inset 0 1px 0 ${glow(0.04)}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        overflow:"hidden",
                      } : {
                        "--c": c,
                        position:"relative", width:"100%", height:"100%",
                        padding:"2px 6px",
                        display:"flex", flexDirection:"column",
                        opacity: isDimmed ? 0.38 : 1,
                        filter: isDimmed ? "grayscale(0.6)" : "none",
                        transition:"opacity 0.4s, filter 0.4s",
                      }}>
                      <div className="slot-handle top" onPointerDown={e=>onPointerDown(e,b,"top")}/>
                      {!isBlock && !isVipSlot && !isPersonal && <div className="shine-layer"/>}
                      {isVipSlot && height >= 14 && (
                        <span style={{fontSize:11, lineHeight:1}}>👑</span>
                      )}
                      {isPersonal && height >= 14 && (() => {
                        const maxFs = Math.min(11, Math.floor(COL_W / 5.5));
                        const nameLines = b.name ? b.name.split(" ") : ["Подія"];
                        const fs = Math.max(6, Math.min(maxFs, Math.floor((height - 8) / (Math.min(nameLines.length, 2) * 1.3 + 1))));
                        return (
                          <div style={{
                            position:"absolute", top:2, left:4, right:2, bottom:2,
                            display:"flex", flexDirection:"column", justifyContent:"center",
                            gap:1, overflow:"hidden",
                          }}>
                            <span style={{fontSize:Math.min(fs+1,11), lineHeight:1}}>📌</span>
                            {nameLines.slice(0,2).map((word,i)=>(
                              <div key={i} style={{
                                fontSize:fs, fontWeight:700, color:"#2dd4bf",
                                lineHeight:1.2, whiteSpace:"normal",
                                wordBreak:"break-word", overflowWrap:"anywhere",
                                textShadow:"none",
                              }}>{word}</div>
                            ))}
                          </div>
                        );
                      })()}
                      {isBlock && height >= 18 && (() => {
                        const sz = Math.min(height * 0.62, 36);
                        return (
                          <svg width={sz} height={sz} viewBox="0 0 100 100" style={{opacity:0.55,flexShrink:0}}>
                            <polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30"
                              fill="#ef4444" stroke="#ff6b6b" strokeWidth="3"/>
                            <rect x="20" y="43" width="60" height="14" rx="7" fill="white"/>
                          </svg>
                        );
                      })()}
                      {!isBlock && !isVipSlot && !isPersonal && height >= 12 && (() => {
                        const [fName, ...lParts] = b.name.split(' ');
                        const lName = lParts.join(' ');
                        const si = a => `rgba(${INK === "255,255,255" ? "0,0,0" : INK},${a})`;
                        const priceColor = b.surcharge ? GOLD : si(0.9);
                        const priceText = price > 0 ? `${price}₴` : null;
                        // TSC замінює "Автошкола" коли є — завжди 4 рядки
                        const typeLabel = b.type==="school"
                          ? (b.tsc || "Автошкола")
                          : "Приватний";
                        const allLines = [
                          { text: fName,     w: 800, c: si(0.95) },
                          ...(lName          ? [{ text: lName,     w: 700, c: si(0.80) }] : []),
                          { text: typeLabel, w: 600, c: si(0.58) },
                          ...(priceText      ? [{ text: priceText, w: 900, c: priceColor }] : []),
                        ];
                        const availH = height - 6;
                        const availW = COL_W - 8;
                        const maxLinesByH = Math.max(1, Math.floor(availH / 10));
                        const maxLinesByW = COL_W < 44 ? 2 : COL_W < 58 ? 3 : 4;
                        const maxLines = Math.min(maxLinesByH, maxLinesByW);
                        const lines = allLines.slice(0, maxLines);
                        // font size small enough that all lines fit width without truncation
                        const fsByW = Math.max(6, Math.min(...lines.map(ln =>
                          Math.floor(availW / (ln.text.length * 0.65))
                        )));
                        const fsByH = Math.max(6, Math.floor(availH / (lines.length * 1.4)));
                        const fs = Math.min(11, fsByW, fsByH);
                        return (
                          <div style={{
                            position:"absolute", top:2, left:2, right:2, bottom:2,
                            display:"flex", flexDirection:"column", justifyContent:"center",
                            alignItems:"center", gap:1,
                            overflow:"hidden", zIndex:2,
                          }}>
                            {lines.map((ln, i) => (
                              <div key={i} style={{
                                fontSize: fs, fontWeight: ln.w, color: ln.c,
                                lineHeight: 1.2, textAlign:"center",
                                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                                width:"100%",
                                textShadow:"none",
                              }}>{ln.text}</div>
                            ))}
                          </div>
                        );
                      })()}
                      {/* VIP crown badge for regular bookings marked as VIP */}
                      {b.isVipOnly && !isVipSlot && height >= 14 && (
                        <div style={{
                          position:"absolute", top:2, right:2, zIndex:4,
                          fontSize:Math.min(11, Math.max(7, height/7)),
                          lineHeight:1, pointerEvents:"none",
                          filter:`drop-shadow(0 1px 3px ${shade(0.7)})`,
                        }}>👑</div>
                      )}
                      {/* Queue badge */}
                      {queueCount > 0 && !isBlock && !isVipSlot && height >= 14 && (
                        <div style={{
                          position:"absolute", bottom:3, left:3, zIndex:4,
                          background:`${shade(0.55)}`, borderRadius:5,
                          padding:"1px 4px", display:"flex", alignItems:"center", gap:2,
                          pointerEvents:"none",
                        }}>
                          <svg width="7" height="7" viewBox="0 0 24 24" fill={GOLD}><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
                          <span style={{fontSize:7, fontWeight:800, color:GOLD, lineHeight:1}}>{queueCount}</span>
                        </div>
                      )}
                      <div className="slot-handle bottom" onPointerDown={e=>onPointerDown(e,b,"bottom")}/>

                    </div>

                    {/* ── Значок скасування (довге натискання) — поза slot-base щоб не обрізатись ── */}
                    {quickCancelId===b.id && (
                      <div
                        onPointerDown={e=>e.stopPropagation()}
                        onClick={e=>{
                          e.stopPropagation();
                          xVisibleRef.current = false;
                          setQuickCancelId(null);
                          // Відновити слоти одразу
                          if (b.startMin !== undefined && b.durMin) {
                            const dateStr = b.date || absDayToDateStr(b.day);
                            const slotUpd = {};
                            for (let i = 0; i < b.durMin; i += 30) {
                              const slotMin = b.startMin + i;
                              const hh = String(Math.floor(slotMin/60)).padStart(2,'0');
                              const mm = String(slotMin%60).padStart(2,'0');
                              const path = `timeslots/${dateStr}/slot${hh}${mm}`;
                              if (i % 60 === 0) { slotUpd[`${path}/available`]=true; slotUpd[`${path}/time`]=`${hh}:${mm}`; }
                              else { slotUpd[path] = null; }
                            }
                            update(ref(db,'/'), slotUpd).catch(()=>{});
                          }
                          // Прямий запис cancelled у Firebase одразу (не покладаємось на 2с-таймер)
                          const idsCancel = b._mergedIds || [b.id];
                          idsCancel.forEach(id => {
                            const mb = bookingsRef.current?.find(x => x.id === id) || (id === b.id ? b : null);
                            if (!mb?.userId) return;
                            const ks = [...new Set([mb._fbKey, mb.id].filter(Boolean))];
                            ks.forEach(k => update(ref(db, `bookings/${mb.userId}/${k}`),
                              { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
                          });
                          // Починаємо 2с відлік — затемнення → видалення
                          setCancellingSet(s=>new Set([...s, b.id]));
                          cancelTimers.current[b.id] = setTimeout(()=>{
                            setCancellingSet(s=>{ const ns=new Set(s); ns.delete(b.id); return ns; });
                            const idsX = b._mergedIds || [b.id];
                            setBookings(bs=>bs.filter(x=>!idsX.includes(x.id)));
                            delete cancelTimers.current[b.id];
                          }, 2000);
                        }}
                        style={{
                          position:"absolute", top:-11, right:-11, zIndex:30,
                          width:30, height:30, borderRadius:"50%",
                          background:"linear-gradient(145deg,#f87171,#b91c1c)",
                          boxShadow:"0 0 0 3px rgba(30,30,40,0.85), 0 4px 12px #b91c1c99",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          cursor:"pointer",
                        }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="#fff" strokeWidth="3.2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>

              {/* Daily income sum — sticky bottom, moves with column natively (no scroll lag) */}
              {(() => {
                const daySum = bookings
                  .filter(b=>b.day===absDay && b.type!=="block" && b.type!=="vip-slot" && b.type!=="personal" && b.status!=="cancelled" && b.status!=="noshow")
                  .reduce((s,b)=>{
                    const svc=(settings.services||[]).find(sv=>sv.id===b.serviceId||sv.id===b.svcId);
                    const price = svc
                      ? Math.round((svc.price/svc.duration)*b.durMin)
                      : b.price && b.durationHours
                        ? Math.round((b.price/(b.durationHours*60))*b.durMin)
                        : (b.price||0);
                    return s+price;
                  },0);
                if (daySum<=0) return null;
                return (
                  <div style={{
                    position:"sticky", bottom:0, zIndex:11,
                    flexShrink:0, marginTop:4,
                    background:`linear-gradient(180deg,${SURF_HI},${SURFACE})`,
                    borderRadius:7,
                    border:`1px solid ${ink(0.08)}`,
                    boxShadow:`0 2px 6px ${shade(0.35)}`,
                    padding:"2px 4px",
                    textAlign:"center",
                    fontSize:10, fontWeight:800,
                    color:GREEN, letterSpacing:0.2,
                    lineHeight:1.4,
                  }}>{daySum.toLocaleString("uk")}₴</div>
                );
              })()}
            </div>
            );
          })}
          {(N_DAYS-1-vRange.e)>0 && <div style={{width:(N_DAYS-1-vRange.e)*(COL_W+4)-4, flexShrink:0}}/>}
          </div>
        </div>

      {/* TODAY BUTTON */}
      {todayDir && (
        <button
          onClick={()=>{
            const el = gridRef.current;
            const cw = calcRef.current.COL_W;
            if (el && cw) el.scrollTo({ left: PAST_DAYS * (cw + 4), behavior:"smooth" });
          }}
          style={{
            position:"absolute",
            bottom:4,
            right:8,
            zIndex:20,
            padding:"5px 12px",
            borderRadius:20,
            border:"none",
            background:BLUE,
            color:"#fff",
            fontSize:12,
            fontWeight:700,
            cursor:"pointer",
            display:"flex",
            alignItems:"center",
            gap:5,
            boxShadow:"0 2px 10px rgba(0,0,0,0.3)",
            letterSpacing:0.2,
            touchAction:"none",
          }}
        >
          {todayDir==="left" && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M7 1L3 5l4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
          Сьогодні
          {todayDir==="right" && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
        </button>
      )}
      </div>{/* /outer flex */}

    </Card>

    <BookingModal booking={localSelectedBooking} onClose={()=>setLocalSelectedBooking(null)}
      onAction={handleAction} settings={settings}/>

    {/* ── Модалка блокування ── */}
    {(blockModal || blockModalClosing) && (() => {
      const _closeBlock = () => setBlockModalClosing(true);
      return (
        <>
          <style>{`
            @keyframes _bl-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
            @keyframes _bl-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
            @keyframes _bl-bg-in{from{opacity:0}to{opacity:1}}
            @keyframes _bl-bg-out{from{opacity:1}to{opacity:0}}
          `}</style>
          <div onClick={blockModalClosing ? undefined : _closeBlock} style={{
            position:"fixed",inset:0,zIndex:200,background:shade(0.55),
            display:"flex",alignItems:"flex-end",justifyContent:"center",
            backdropFilter:"blur(8px)",
            animation: blockModalClosing ? `_bl-bg-out 0.26s ease-in forwards` : `_bl-bg-in 0.2s ease-out`,
          }}>
            <div onClick={e=>e.stopPropagation()}
              onAnimationEnd={blockModalClosing ? ()=>{ setBlockModalClosing(false); setBlockModal(null); } : undefined}
              style={{
                width:"100%",maxWidth:480,background:BG_DEEP,
                borderRadius:"24px 24px 0 0",
                boxShadow:`0 -2px 0 ${glow(0.08)}, 0 -16px 60px ${shade(0.8)}`,
                display:"flex",flexDirection:"column",overflow:"hidden",
                pointerEvents: blockModalClosing ? "none" : undefined,
                animation: blockModalClosing ? `_bl-down 0.26s ease-in forwards` : `_bl-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
              }}>
              {/* Hero */}
              <div style={{
                padding:"14px 16px 18px",
                background:`repeating-linear-gradient(45deg,${STRIPE_A},${STRIPE_A} 8px,${STRIPE_B} 8px,${STRIPE_B} 16px)`,
                position:"relative",
              }}>
                <div style={{width:38,height:4,borderRadius:2,background:`${ink(0.1)}`,margin:"0 auto 14px"}}/>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{
                    width:50,height:50,borderRadius:25,flexShrink:0,
                    background:`${ink(0.06)}`,border:`1.5px solid ${ink(0.1)}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ink(0.35)} strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{fontSize:18,fontWeight:900,color:`${ink(0.5)}`,letterSpacing:-0.4}}>Заблоковано</div>
                    <div style={{fontSize:12,color:`${ink(0.25)}`,marginTop:3}}>
                      {getDayInfo(blockModal.day).fullLabel} · {fmtTime(blockModal.startMin)} · {fmtDur(blockModal.durMin)}
                    </div>
                  </div>
                </div>
              </div>
              {/* Buttons */}
              <div style={{padding:"14px 16px 28px",display:"flex",flexDirection:"column",gap:10}}>
                <button onClick={()=>{
                  setBookings(bs=>bs.filter(x=>x.id!==blockModal.id));
                  _closeBlock();
                }} style={{
                  width:"100%",padding:"14px",borderRadius:18,border:"none",cursor:"pointer",
                  background:`linear-gradient(160deg,${GREEN},#4ade80)`,
                  color:"#fff",fontSize:14,fontWeight:800,
                  boxShadow:`0 6px 20px ${GREEN}55`,
                }}>
                  🔓 Розблокувати
                </button>
                <button onClick={_closeBlock} style={{
                  width:"100%",padding:"13px",borderRadius:18,border:"none",cursor:"pointer",
                  background:"linear-gradient(145deg,#f87171,#b91c1c)",
                  color:"#fff",fontSize:13,fontWeight:700,
                  boxShadow:"0 4px 14px #b91c1c66",
                }}>Закрити</button>
              </div>
            </div>
          </div>
        </>
      );
    })()}

    {addSlotPos && (
      <div onClick={()=>setAddSlotPos(null)} style={{position:"fixed",inset:0,zIndex:150}}>
        <div onClick={e=>e.stopPropagation()} style={{
          position:"absolute",
          top: Math.max(60, Math.min(addSlotPos.clientY - 50, window.innerHeight - 110)),
          left: Math.max(10, Math.min(addSlotPos.clientX - 10, window.innerWidth - 180)),
          width:168,
          background:`linear-gradient(135deg,${SURFACE},${BG_DEEP})`,
          borderRadius:14, padding:"10px 12px",
          boxShadow:"0 8px 32px rgba(0,0,0,0.65),inset 1px 1px 0 rgba(255,255,255,0.08)",
          border:`1px solid ${BORDER}`
        }}>
          <div style={{fontSize:18,fontWeight:900,color:TEXT,marginBottom:8,letterSpacing:0.5}}>
            {fmtTime(addSlotPos.startMin)}
          </div>
          <button onClick={()=>{
            const hh = String(Math.floor(addSlotPos.startMin/60)).padStart(2,'0');
            const mm = String(addSlotPos.startMin%60).padStart(2,'0');
            update(ref(db, `timeslots/${addSlotPos.dateStr}/slot${hh}${mm}`), {
              available: true, time: `${hh}:${mm}`
            }).catch(()=>{});
            setAddSlotPos(null);
          }} style={{
            width:"100%",padding:"9px 12px",borderRadius:10,border:"none",cursor:"pointer",
            background:`linear-gradient(165deg,rgba(99,211,120,0.9),rgba(34,197,94,0.85))`,
            color:"#fff",fontSize:12,fontWeight:800,
            boxShadow:`0 4px 12px rgba(99,211,120,0.35)`,
          }}>+ Вільний слот</button>
        </div>
      </div>
    )}

    {bubbleData && (
      <div onClick={()=>setBubbleData(null)} style={{position:"fixed",inset:"0 0 80px 0",zIndex:100}}>
        <div onClick={e=>e.stopPropagation()} style={{
          position:"absolute",
          top: Math.max(60, Math.min(bubbleData.clientY - 50, window.innerHeight - 120)),
          left: Math.max(10, Math.min(bubbleData.clientX - 10, window.innerWidth - 180)),
          width:168,
          background:`linear-gradient(135deg,${SURFACE},${BG_DEEP})`,
          borderRadius:14, padding:"10px 12px",
          boxShadow:`0 8px 32px ${shade(0.65)},inset 1px 1px 0 ${glow(0.08)}`,
          border:`1px solid ${BORDER}`
        }}>
          <div style={{fontSize:18,fontWeight:900,color:TEXT,marginBottom:8,letterSpacing:0.5}}>
            {fmtTime(bubbleData.startMin)}
            <span style={{fontSize:10,fontWeight:600,color:TEXT_DIM,marginLeft:6}}>
              {getDayInfo(bubbleData.day).label} {getDayInfo(bubbleData.day).num}
            </span>
          </div>
          <button onClick={()=>{setFormData(bubbleData);setBubbleData(null);}} style={{
            width:"100%",padding:"9px 12px",borderRadius:10,border:"none",cursor:"pointer",
            background:`linear-gradient(165deg,#f59e0b,#d97706)`,
            color:"#fff",fontSize:12,fontWeight:800,
            boxShadow:`0 4px 12px rgba(245,158,11,0.4)`,
          }}>👤 Записати учня</button>
          <button onClick={()=>{
            const sh = String(Math.floor(bubbleData.startMin/60)).padStart(2,'0');
            const sn = String(bubbleData.startMin%60).padStart(2,'0');
            setPersonalEventData({ dateStr: bubbleData.dateStr || absDayToDateStr(bubbleData.day), time: `${sh}:${sn}` });
            setBubbleData(null);
          }} style={{
            marginTop:8, width:"100%",padding:"9px 12px",borderRadius:10,cursor:"pointer",
            background:"rgba(45,212,191,0.12)",
            color:"#2dd4bf",fontSize:12,fontWeight:800,
            border:"1px solid rgba(45,212,191,0.3)",
          }}>📌 Особиста подія</button>
        </div>
      </div>
    )}

    {(longTapMenu || ltmClosing || ltmScatter) && (()=>{
      const _menu = longTapMenu || {};
      const _closeLtm = () => setLtmClosing(true);
      const _scatterLtm = (cb) => {
        setLtmScatter(true);
        setTimeout(() => { setLtmScatter(false); setLongTapMenu(null); if(cb) cb(); }, 400);
      };
      const _ltmD = _menu.dateStr ? new Date(_menu.dateStr + "T12:00:00") : new Date();
      const _ltmLabel = _ltmD.toLocaleDateString("uk", { weekday:"short", day:"numeric", month:"short" });
      const _anyClose = ltmClosing || ltmScatter;
      return (
      <>
        <style>{`
          @keyframes _ltm-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
          @keyframes _ltm-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
          @keyframes _ltm-bg-in{from{opacity:0}to{opacity:1}}
          @keyframes _ltm-bg-out{from{opacity:1}to{opacity:0}}
          @keyframes _ltm-sc-sheet{from{opacity:1}to{opacity:0}}
          @keyframes _ltm-sc-l{from{transform:translate(0,0) rotate(0);opacity:1}to{transform:translate(-180px,70px) rotate(-22deg);opacity:0}}
          @keyframes _ltm-sc-c{from{transform:translate(0,0) scale(1);opacity:1}to{transform:translate(0,-90px) scale(0.3);opacity:0}}
          @keyframes _ltm-sc-r{from{transform:translate(0,0) rotate(0);opacity:1}to{transform:translate(180px,70px) rotate(22deg);opacity:0}}
          @keyframes _ltm-sc-chips{from{transform:translateY(0);opacity:1}to{transform:translateY(-50px);opacity:0}}
        `}</style>
        <div onClick={_anyClose ? undefined : _closeLtm} style={{
          position:"fixed",inset:0,zIndex:200,
          background:`${shade(0.55)}`,
          display:"flex",alignItems:"flex-end",
          animation: _anyClose ? `_ltm-bg-out 0.38s ease-in forwards` : `_ltm-bg-in 0.2s ease-out`,
        }}>
          <div onClick={e=>e.stopPropagation()}
            onAnimationEnd={ltmClosing ? ()=>{ setLtmClosing(false); setLongTapMenu(null); } : undefined}
            style={{
              width:"100%",
              background:`linear-gradient(180deg,${SURFACE},${BG_DEEP})`,
              borderRadius:"20px 20px 0 0",
              padding:"10px 16px 32px",
              boxShadow:`0 -8px 40px ${shade(0.6)},inset 0 1px 0 ${glow(0.08)}`,
              border:`1px solid ${BORDER}`,borderBottom:"none",
              pointerEvents: _anyClose ? "none" : undefined,
              animation: ltmClosing
                ? `_ltm-down 0.26s ease-in forwards`
                : ltmScatter
                  ? `_ltm-sc-sheet 0.38s ease-in forwards`
                  : `_ltm-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
            }}>
            {/* handle */}
            <div style={{width:36,height:4,borderRadius:2,background:ink(0.18),margin:"0 auto 14px"}}/>
            {/* header — time chips */}
            {!ltmClosing && <div style={{marginBottom:16,
              ...(ltmScatter ? {animation:`_ltm-sc-chips 0.25s ease-in forwards`} : {}),
            }}>
              <div style={{fontSize:11,color:TEXT_FAINT,fontWeight:600,marginBottom:8}}>{_ltmLabel}</div>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                {[-60,-30,0,30,60].map(delta=>{
                  const _cm = _menu.startMin + delta;
                  if (_cm < 0 || _cm > 23*60+30) return null;
                  const _isActive = _cm === (_menu.selectedMin ?? _menu.startMin);
                  return (
                    <button key={delta} onClick={()=>setLongTapMenu(prev=>({...prev,selectedMin:_cm}))} style={{
                      flex:1,padding:"8px 2px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
                      background: _isActive ? ink(0.14) : "transparent",
                      color: _isActive ? TEXT : TEXT_FAINT,
                      fontSize: _isActive ? 18 : 13,
                      fontWeight: _isActive ? 900 : 500,
                      letterSpacing: _isActive ? 0.3 : 0,
                      border: _isActive ? `1px solid ${ink(0.22)}` : `1px solid ${ink(0.07)}`,
                      transition: ltmScatter ? "none" : "all 0.15s",
                      textAlign:"center",
                    }}>
                      {fmtTime(_cm)}
                    </button>
                  );
                })}
              </div>
            </div>}
            {/* buttons row */}
            {!ltmClosing && <div style={{display:"flex",gap:10}}>
              {!_menu.isClosedDay && (
                <button onClick={()=>{
                  const _sm = _menu.selectedMin ?? _menu.startMin;
                  const _hh = String(Math.floor(_sm/60)).padStart(2,'0');
                  const _mm = String(_sm%60).padStart(2,'0');
                  update(ref(db, `timeslots/${_menu.dateStr}/slot${_hh}${_mm}`), { available: true, time: `${_hh}:${_mm}` }).catch(()=>{});
                  _closeLtm();
                }} style={{
                  flex:1,padding:"16px 8px",borderRadius:16,border:"none",cursor:"pointer",fontFamily:"inherit",
                  background:`linear-gradient(160deg,rgba(99,211,120,0.22),rgba(34,197,94,0.14))`,
                  color:GREEN,fontSize:12,fontWeight:800,
                  display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                  border:`1px solid rgba(99,211,120,0.28)`,
                  ...(ltmScatter ? {animation:`_ltm-sc-l 0.32s ease-in forwards`} : {}),
                }}>
                  <span style={{fontSize:24}}>🕐</span>
                  Вільний слот
                </button>
              )}
              <button onClick={()=>{
                setPersonalEventData({ dateStr: _menu.dateStr, time: fmtTime(_menu.selectedMin ?? _menu.startMin) });
                _scatterLtm();
              }} style={{
                flex:1,padding:"16px 8px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",
                background:"rgba(45,212,191,0.1)",
                color:"#2dd4bf",fontSize:12,fontWeight:800,
                display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                border:"1px solid rgba(45,212,191,0.22)",
                ...(ltmScatter ? {animation:`_ltm-sc-c 0.28s ease-in forwards`} : {}),
              }}>
                <span style={{fontSize:24}}>📌</span>
                Особиста подія
              </button>
              <button onClick={()=>{
                toggleDayBlocked(_menu.dateStr);
                _closeLtm();
              }} style={{
                flex:1,padding:"16px 8px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",
                background:"rgba(239,68,68,0.09)",
                color:"#f87171",fontSize:12,fontWeight:800,
                display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                border:"1px solid rgba(239,68,68,0.2)",
                ...(ltmScatter ? {animation:`_ltm-sc-r 0.32s ease-in forwards`} : {}),
              }}>
                <span style={{fontSize:24}}>{_menu.isClosedDay ? "🔓" : "🔒"}</span>
                {_menu.isClosedDay ? "Відкрити" : "Закрити"} день
              </button>
            </div>}
          </div>
        </div>
      </>
      );
    })()}

    {/* ── Меню опцій слота (довгий тап на вільний слот) — bottom sheet ── */}
    {(slotOptions || slotClosing) && (()=>{
      const _so = slotOptions || {};
      const _closeSO = () => setSlotClosing(true);
      const _soStartMin = _so.startTime
        ? (([h,m]) => h*60+m)(_so.startTime.split(":").map(Number))
        : 0;
      const _soSelMin = _so.selectedMin ?? _soStartMin;
      return (
      <>
        <style>{`
          @keyframes _so-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
          @keyframes _so-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
          @keyframes _so-bg-in{from{opacity:0}to{opacity:1}}
          @keyframes _so-bg-out{from{opacity:1}to{opacity:0}}
        `}</style>
        <div onClick={slotClosing ? undefined : _closeSO} style={{
          position:"fixed",inset:0,zIndex:200,
          background:`${shade(0.55)}`,
          display:"flex",alignItems:"flex-end",justifyContent:"center",
          backdropFilter:"blur(8px)",
          animation: slotClosing ? `_so-bg-out 0.26s ease-in forwards` : `_so-bg-in 0.2s ease-out`,
        }}>
          <div onClick={e=>e.stopPropagation()}
            onAnimationEnd={slotClosing ? ()=>{ setSlotClosing(false); setSlotOptions(null); } : undefined}
            style={{
              width:"100%",maxWidth:480,
              background:BG_DEEP,
              borderRadius:"24px 24px 0 0",
              boxShadow:`0 -2px 0 rgba(34,197,94,0.3), 0 -16px 60px ${shade(0.6)}`,
              maxHeight:"85vh",overflowY:"auto",
              WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
              pointerEvents: slotClosing ? "none" : undefined,
              animation: slotClosing
                ? `_so-down 0.26s ease-in forwards`
                : `_so-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
            }}>
            {/* header (includes handle) */}
            <div style={{
              padding:"10px 18px 14px",
              background:"linear-gradient(145deg,rgba(34,197,94,0.12),rgba(22,163,74,0.05))",
              borderBottom:"1px solid rgba(34,197,94,0.15)",
              borderRadius:"24px 24px 0 0",
            }}>
              <div style={{width:36,height:4,borderRadius:2,background:"rgba(34,197,94,0.35)",margin:"0 auto 12px"}}/>
              <div style={{fontSize:18,fontWeight:800,color:"#22c55e"}}>🟢 Вільний слот</div>
              <div style={{fontSize:12,color:TEXT_FAINT}}>{_so.dateStr} · {fmtTime(_soSelMin)}</div>
            </div>
            {/* time chips */}
            <div style={{padding:"12px 16px 4px"}}>
              <div style={{fontSize:11,color:TEXT_FAINT,fontWeight:600,marginBottom:8}}>Оберіть час</div>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                {[-60,-30,0,30,60].map(delta=>{
                  const _cm = _soStartMin + delta;
                  if (_cm < 0 || _cm > 23*60+59) return null;
                  const _isActive = _cm === _soSelMin;
                  return (
                    <button key={delta} onClick={()=>setSlotOptions(prev=>({...prev, selectedMin:_cm}))} style={{
                      flex:1,padding:"8px 2px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
                      background: _isActive ? ink(0.14) : "transparent",
                      color: _isActive ? TEXT : TEXT_FAINT,
                      fontSize: _isActive ? 18 : 13,
                      fontWeight: _isActive ? 900 : 500,
                      border: _isActive ? `1px solid ${ink(0.22)}` : `1px solid ${ink(0.07)}`,
                      transition:"all 0.15s",
                      textAlign:"center",
                    }}>
                      {fmtTime(_cm)}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* actions */}
            <div style={{padding:"8px 10px 12px",display:"flex",flexDirection:"column",gap:5}}>
              {/* Додати букінг */}
              <button onClick={()=>{
                const today = new Date(); today.setHours(0,0,0,0);
                const slotDate = new Date(_so.dateStr + "T00:00:00");
                const day = Math.round((slotDate - today) / (1000 * 60 * 60 * 24));
                setFormData({ startMin: _soSelMin, day });
                setSlotOptions(null);
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(245,158,11,0.09)",borderRadius:12,
                color:"#f59e0b",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span>👤</span> Додати букінг
              </button>
              {/* Особиста подія */}
              <button onClick={()=>{
                setPersonalEventData({ dateStr: _so.dateStr, time: fmtTime(_soSelMin), slot: _so.slot });
                setSlotOptions(null);
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(45,212,191,0.09)",borderRadius:12,
                color:"#2dd4bf",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span>📌</span> Особиста подія
              </button>
              {/* Розіслати учням */}
              <button onClick={()=>{
                setBroadcastInit({ date: _so.dateStr, slot: fmtTime(_soSelMin) });
                setSlotOptions(null);
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(129,140,248,0.09)",borderRadius:12,
                color:"#818cf8",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span>📣</span> Розіслати учням
              </button>
              {/* VIP слот */}
              <button onClick={()=>applySlotOption(_so.dateStr, fmtTime(_soSelMin), "vip")} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(192,132,252,0.09)",borderRadius:12,
                color:"#c084fc",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span>👑</span> VIP слот
                {_so.slot?.vipOnly && <span style={{marginLeft:"auto",fontSize:11,color:"#c084fc",opacity:0.7}}>✓ активний</span>}
              </button>
            </div>
            {/* Надбавки — чіпи */}
            <div style={{padding:"4px 16px 32px"}}>
              <div style={{fontSize:11,color:TEXT_FAINT,fontWeight:600,marginBottom:8}}>Надбавка</div>
              <div style={{display:"flex",gap:6}}>
                {(settings.surcharges?.length ? settings.surcharges : [100,200,300]).map(amt=>{
                  const _isActive = _so.slot?.surcharge === amt;
                  return (
                    <button key={amt} onClick={()=>applySlotOption(_so.dateStr, fmtTime(_soSelMin), amt)} style={{
                      flex:1,padding:"9px 4px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
                      background: _isActive ? "rgba(245,158,11,0.22)" : "transparent",
                      color: _isActive ? "#f59e0b" : GOLD,
                      fontSize:14,fontWeight:700,
                      border: _isActive ? `1px solid rgba(245,158,11,0.5)` : `1px solid ${ink(0.1)}`,
                      textAlign:"center",
                      transition:"all 0.15s",
                    }}>
                      +{amt}₴
                    </button>
                  );
                })}
              </div>
              {/* Скинути — тільки якщо є що скидати */}
              {(_so.slot?.vipOnly || _so.slot?.surcharge) && (
                <button onClick={()=>applySlotOption(_so.dateStr, fmtTime(_soSelMin), "reset")} style={{
                  width:"100%",padding:"12px 0 0",border:"none",cursor:"pointer",
                  background:"none",color:TEXT_FAINT,fontSize:13,fontWeight:600,
                }}>Скинути</button>
              )}
            </div>
          </div>
        </div>
      </>
      );
    })()}

    {/* ── VIP слот модалка ── */}
    {(vipSlotModal || vipSlotModalClosing) && (() => {
      const _closeVip = () => setVipSlotModalClosing(true);
      return (
        <>
          <style>{`
            @keyframes _vip-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
            @keyframes _vip-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
            @keyframes _vip-bg-in{from{opacity:0}to{opacity:1}}
            @keyframes _vip-bg-out{from{opacity:1}to{opacity:0}}
          `}</style>
          <div onClick={vipSlotModalClosing ? undefined : _closeVip} style={{
            position:"fixed",inset:0,zIndex:200,background:shade(0.55),
            display:"flex",alignItems:"flex-end",justifyContent:"center",
            backdropFilter:"blur(8px)",
            animation: vipSlotModalClosing ? `_vip-bg-out 0.26s ease-in forwards` : `_vip-bg-in 0.2s ease-out`,
          }}>
            <div onClick={e=>e.stopPropagation()}
              onAnimationEnd={vipSlotModalClosing ? ()=>{ setVipSlotModalClosing(false); setVipSlotModal(null); } : undefined}
              style={{
                width:"100%",maxWidth:480,background:BG_DEEP,
                borderRadius:"24px 24px 0 0",
                boxShadow:`0 -2px 0 rgba(168,85,247,0.4), 0 -16px 60px ${shade(0.8)}`,
                display:"flex",flexDirection:"column",overflow:"hidden",
                pointerEvents: vipSlotModalClosing ? "none" : undefined,
                animation: vipSlotModalClosing ? `_vip-down 0.26s ease-in forwards` : `_vip-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
              }}>
              <div style={{
                padding:"16px 16px 18px",
                background:"linear-gradient(145deg,rgba(168,85,247,0.18),rgba(124,58,237,0.08))",
                borderBottom:"1px solid rgba(168,85,247,0.2)",
              }}>
                <div style={{width:38,height:4,borderRadius:2,background:`${ink(0.1)}`,margin:"0 auto 14px"}}/>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{
                    width:52,height:52,borderRadius:26,flexShrink:0,
                    background:"linear-gradient(145deg,#a855f7,#7c3aed)",
                    boxShadow:"0 0 0 3px rgba(168,85,247,0.3), 0 6px 20px rgba(168,85,247,0.4)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,
                  }}>👑</div>
                  <div>
                    <div style={{fontSize:18,fontWeight:900,color:PURPLE}}>VIP Слот</div>
                    <div style={{fontSize:12,color:TEXT_DIM,marginTop:3}}>
                      {getDayInfo(vipSlotModal.day).fullLabel} · {fmtTime(vipSlotModal.startMin)} · {fmtDur(vipSlotModal.durMin)}
                    </div>
                    <div style={{fontSize:11,color:TEXT_FAINT,marginTop:4}}>
                      Тільки для учнів категорії VIP
                    </div>
                  </div>
                </div>
              </div>
              <div style={{padding:"14px 16px 32px",display:"flex",flexDirection:"column",gap:10}}>
                <button onClick={()=>{
                  const v = vipSlotModal;
                  const dateStr = v._dateStr || absDayToDateStr(v.day);
                  const hh = String(Math.floor(v.startMin / 60)).padStart(2, "0");
                  const mm = String(v.startMin % 60).padStart(2, "0");
                  update(ref(db, `timeslots/${dateStr}/slot${hh}${mm}`), { vipOnly: false }).catch(() => {});
                  _closeVip();
                }} style={{
                  width:"100%",padding:"14px",borderRadius:18,border:"none",cursor:"pointer",
                  background:`linear-gradient(160deg,${GREEN},#4ade80)`,
                  color:"#fff",fontSize:14,fontWeight:800,
                  boxShadow:`0 6px 20px ${GREEN}55`,
                }}>🗑 Видалити VIP слот</button>
                <button onClick={_closeVip} style={{
                  width:"100%",padding:"13px",borderRadius:18,border:"none",cursor:"pointer",
                  background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
                  color:TEXT_DIM,fontSize:13,fontWeight:700,boxShadow:SHADOW_OUT,
                }}>Закрити</button>
              </div>
            </div>
          </div>
        </>
      );
    })()}

    <NewBookingModal data={formData} onClose={()=>setFormData(null)}
      onConfirm={b=>{
        if (b.id) {
          const fbData = {
            id: b.id, date: b.date || "", time: fmtTime(b.startMin),
            startMin: b.startMin, durMin: b.durMin, durationHours: b.durMin / 60,
            studentName: b.name, name: b.name, phone: b.phone,
            serviceId: b.serviceId, serviceType: b.type, type: b.type,
            status: b.status, tsc: b.tsc || "", hours: b.hoursDone || 0,
            createdAt: Date.now(), createdBy: "admin",
            ...(b.note && { note: b.note }),
          };
          if (b.userId) {
            update(ref(db, `bookings/${b.userId}/${b.id}`), fbData).catch(()=>{});
          } else {
            const phone = (b.phone || '').replace(/\D/g, '');
            if (phone) {
              update(ref(db, `bookings_by_phone/${phone}/${b.id}`), fbData).catch(()=>{});
              for (let i = 0; i < b.durMin; i += 30) {
                const slotMin = b.startMin + i;
                const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
                const sm = String(slotMin % 60).padStart(2, '0');
                update(ref(db, `slotBookings/${b.date}/slot${sh}${sm}`), {phone, bookingId: b.id}).catch(()=>{});
              }
            }
          }
        }
        if (b.date && b.startMin !== undefined && b.durMin) {
          const slotUpd = {};
          for (let i = 0; i < b.durMin; i += 30) {
            const slotMin = b.startMin + i;
            const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
            const sm = String(slotMin % 60).padStart(2, '0');
            slotUpd[`timeslots/${b.date}/slot${sh}${sm}/available`] = false;
            slotUpd[`timeslots/${b.date}/slot${sh}${sm}/time`] = `${sh}:${sm}`;
          }
          update(ref(db, '/'), slotUpd).catch(() => {});
        }
        setFormData(null);
      }}
      settings={{...settings, workStart: effectiveWorkStart, workEnd: effectiveWorkEnd}}
      bookings={bookings}/>

    {createSlotData && <CreateSlotSheet data={createSlotData} settings={settings} onClose={()=>setCreateSlotData(null)}/>}

    <PersonalEventModal
      data={personalEventData}
      onClose={()=>setPersonalEventData(null)}
      onConfirm={b=>{
        setBookings(bs => [...bs, b]);
        setPersonalEventData(null);
      }}
    />

    {/* Перегляд особистої події */}
    {personalEventView && (
      <div onClick={()=>setPersonalEventView(null)} style={{
        position:"fixed",inset:0,zIndex:200,background:`${shade(0.6)}`,
        display:"flex",alignItems:"center",justifyContent:"center",
        backdropFilter:"blur(8px)",
      }}>
        <div onClick={e=>e.stopPropagation()} style={{
          width:280,background:BG_DEEP,
          borderRadius:20,overflow:"hidden",
          boxShadow:`0 8px 40px ${shade(0.7)}, 0 0 0 1.5px rgba(45,212,191,0.3)`,
        }}>
          <div style={{
            padding:"14px 16px 12px",
            background:"rgba(45,212,191,0.1)",
            borderBottom:"1px solid rgba(45,212,191,0.15)",
          }}>
            <div style={{fontSize:13,fontWeight:800,color:"#2dd4bf"}}>
              📌 {personalEventView.name}
            </div>
            <div style={{fontSize:11,color:`${ink(0.45)}`,marginTop:3}}>
              {personalEventView.date} · {fmtTime(personalEventView.startMin)} · {personalEventView.durMin}хв
            </div>
          </div>
          {personalEventView.note && (
            <div style={{padding:"10px 16px",fontSize:13,color:`${ink(0.7)}`,lineHeight:1.5}}>
              {personalEventView.note}
            </div>
          )}
          <button
            onClick={()=>{
              setBookings(bs => bs.filter(b => b.id !== personalEventView.id));
              setPersonalEventView(null);
            }}
            style={{
              width:"100%",padding:"12px",border:"none",cursor:"pointer",
              borderTop:`1px solid ${ink(0.06)}`,
              background:"none",color:"#f87171",fontSize:13,fontWeight:700,
            }}
          >
            Видалити подію
          </button>
        </div>
      </div>
    )}
    {broadcastInit && <BroadcastModal initialDate={broadcastInit.date} initialSlot={broadcastInit.slot} onClose={() => setBroadcastInit(null)}/>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// CREATE SLOT SHEET — вільний слот з вибором часу і тривалості
// ═══════════════════════════════════════════════════════════════
function CreateSlotSheet({ data, settings, onClose }) {
  const { BG_DEEP, BORDER, TEXT, DIM, FAINT, GLOW, SHADE } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`;
  const TEXT_DIM = DIM, TEXT_FAINT = FAINT;
  const slotStep = settings.slotCreateStep || 30;
  const timeItems = useMemo(() => {
    const arr = [];
    for (let m = settings.workStart * 60; m < settings.workEnd * 60; m += slotStep)
      arr.push({ label: fmtTime(m), value: m });
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.workStart, settings.workEnd, slotStep]);

  const durItems = [
    { label:"1 год",  value:60  },
    { label:"2 год",  value:120 },
    { label:"3 год",  value:180 },
    { label:"4 год",  value:240 },
  ];

  const initTimeIdx = Math.max(0, timeItems.findIndex(t => t.value >= (data.startMin || 0)));
  const [timeIdx, setTimeIdx] = useState(initTimeIdx);
  const [durIdx,  setDurIdx]  = useState(1);
  const [saving,  setSaving]  = useState(false);
  const [closing, setClosing] = useState(false);

  const day = getDayInfo(data.day);
  const _close = () => setClosing(true);

  const handleCreate = async () => {
    setSaving(true);
    const startMin = timeItems[timeIdx]?.value ?? data.startMin;
    const dur = durItems[durIdx].value;
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + data.day);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const updates = {};
    for (let m = startMin; m < startMin + dur; m += 60) {
      const h = String(Math.floor(m / 60)).padStart(2, '0');
      const mn = String(m % 60).padStart(2, '0');
      const id = `slot${h}${mn}`;
      updates[`timeslots/${dateStr}/${id}/time`] = `${h}:${mn}`;
      updates[`timeslots/${dateStr}/${id}/available`] = true;
    }
    await update(ref(db, '/'), updates).catch(() => {});
    setSaving(false);
    _close();
  };

  return (
    <>
      <style>{`
        @keyframes _cs-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _cs-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _cs-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _cs-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,zIndex:200,background:shade(0.55),
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_cs-bg-out 0.26s ease-in forwards` : `_cs-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.12)}, 0 -16px 60px ${shade(0.6)}`,
            overflow:"hidden",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_cs-down 0.26s ease-in forwards` : `_cs-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <div style={{
            padding:"10px 20px 14px",
            background:shade(0.04),
            borderBottom:`1px solid ${glow(0.08)}`,
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:glow(0.2),margin:"0 auto 12px"}}/>
            <div style={{fontSize:15,fontWeight:700,color:TEXT}}>
              Вільний слот · {day.fullLabel} {day.num}
            </div>
          </div>
          <div style={{padding:"16px 20px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:TEXT_DIM,letterSpacing:1,marginBottom:6,textAlign:"center"}}>ПОЧАТОК</div>
                <DrumRoll items={timeItems} currentIdx={timeIdx} onChange={setTimeIdx} itemH={40} visible={3}/>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:TEXT_DIM,letterSpacing:1,marginBottom:6,textAlign:"center"}}>ТРИВАЛІСТЬ</div>
                <DrumRoll items={durItems} currentIdx={durIdx} onChange={setDurIdx} itemH={40} visible={3}/>
              </div>
            </div>
            <div style={{textAlign:"center",fontSize:12,color:TEXT_DIM,marginBottom:14}}>
              {fmtTime(timeItems[timeIdx]?.value ?? 0)} — {fmtTime((timeItems[timeIdx]?.value ?? 0) + durItems[durIdx].value)}
            </div>
            <button onClick={handleCreate} disabled={saving} style={{
              width:"100%",padding:14,borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:saving?shade(0.06):`linear-gradient(165deg,${GREEN},#16a34a)`,
              color:saving?TEXT_FAINT:"#fff",fontSize:14,fontWeight:800,
              boxShadow:saving?"none":`0 4px 16px rgba(99,211,120,0.4),inset 1px 1px 0 ${glow(0.25)}`,
              marginBottom:16,
            }}>{saving ? "Створюємо..." : "✓ Створити слот"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// BOOKING DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
function BookingModal({ booking, onClose, onAction, settings }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const [queueEntries, setQueueEntries] = useState([]);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!booking) return;
    setClosing(false);
    const dateStr = booking.date || (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() + booking.day);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const hh = String(Math.floor(booking.startMin/60)).padStart(2,'0');
    const mm = String(booking.startMin%60).padStart(2,'0');
    const slotKey = `${dateStr}_${hh}:${mm}`;
    const r = ref(db, `queue/${slotKey}/entries`);
    const unsub = onValue(r, snap => {
      if (!snap.exists()) { setQueueEntries([]); return; }
      const entries = Object.values(snap.val())
        .filter(e => e.status === 'waiting')
        .sort((a,b) => (a.addedAt||0) - (b.addedAt||0));
      setQueueEntries(entries);
    });
    return () => unsub();
  }, [booking]);

  if (!booking && !closing) return null;

  const svc   = settings.services.find(s => s.id === booking.serviceId)
             || settings.services.find(s => s.active && s.type===(booking.serviceType||booking.type) && Number(s.duration)===booking.durMin);
  const c     = colorOf(svc?.colorId);
  const day = booking.date
    ? (() => { const d = new Date(booking.date + "T12:00:00"); const dow = (d.getDay()+6)%7; return { num:d.getDate(), month:_MLABELS[d.getMonth()], label:_DLABELS[dow], fullLabel:_DLABELS_FULL[dow], wk:dow>=5 }; })()
    : getDayInfo(booking.day);
  const basePrice = svc
    ? Math.round((svc.price / svc.duration) * booking.durMin)
    : booking.price && booking.durationHours
      ? Math.round((booking.price / (booking.durationHours * 60)) * booking.durMin)
      : (booking.price || 0);
  const price = basePrice + (booking.surcharge || 0);
  const ini   = booking.name.trim().split(" ").slice(0, 2).map(w => w[0]).join("");
  const typeLabel = booking.type === "school" ? "🎓 Автошкола" : "🚗 Приватний";

  const IcoPhone = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 4.14 6.18 2 2 0 0 1 6.12 4h3a2 2 0 0 1 2 1.72c.13 1 .37 1.98.72 2.91a2 2 0 0 1-.45 2.11L10 12a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.93.35 1.91.59 2.91.72A2 2 0 0 1 22 16.92z"/></svg>;
  const IcoChat  = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;

  const _close = () => setClosing(true);

  return (
    <>
      <style>{`
        @keyframes _bm-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _bm-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _bm-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _bm-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,zIndex:200,
        background:shade(0.55),
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_bm-bg-out 0.26s ease-in forwards` : `_bm-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${c}66, 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing
              ? `_bm-down 0.26s ease-in forwards`
              : `_bm-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>

          {/* Header: handle + student info */}
          <div style={{
            padding:"10px 16px 14px",
            background:`linear-gradient(145deg,${c}22,${c}0d)`,
            borderBottom:`1px solid ${c}28`,
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:`${c}66`,margin:"0 auto 12px"}}/>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{
                width:40,height:40,borderRadius:12,flexShrink:0,
                background:`linear-gradient(145deg,${c},color-mix(in srgb,${c} 55%,#000))`,
                boxShadow:`0 0 0 2px ${c}44`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:15,fontWeight:900,color:"#fff",
              }}>{ini}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{booking.name}</div>
                <div style={{fontSize:10,color:c,fontWeight:700,marginTop:1}}>{typeLabel}</div>
              </div>
            </div>
          </div>

          {/* Info grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:ink(0.04)}}>
            {[
              { label:"Дата",  val:`${day.num} ${day.month}`, sub:day.label },
              { label:"Час",   val:`${fmtTime(booking.startMin)}`, sub:`–${fmtTime(booking.startMin+booking.durMin)}` },
              { label:"Ціна",  val:`${price}₴`, sub: booking.surcharge ? `+${booking.surcharge}₴` : (svc ? `${svc.duration}хв` : "—"), gold: !!booking.surcharge },
            ].map(({ label, val, sub, gold }, i) => (
              <div key={i} style={{
                padding:"11px 6px",background:BG_DEEP,
                display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",
                borderRight: i < 2 ? `1px solid ${ink(0.05)}` : "none",
              }}>
                <div style={{fontSize:8,fontWeight:700,letterSpacing:1,color:TEXT_FAINT,textTransform:"uppercase",marginBottom:5}}>{label}</div>
                <div style={{fontSize:14,fontWeight:900,color: gold ? GOLD : TEXT,lineHeight:1}}>{val}</div>
                <div style={{fontSize:9,color: gold ? `${GOLD}99` : TEXT_FAINT,marginTop:3,fontWeight:600}}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Queue */}
          {queueEntries.length > 0 && (
            <div style={{padding:"10px 14px",borderBottom:`1px solid ${ink(0.06)}`}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:GOLD,textTransform:"uppercase",marginBottom:6}}>
                ⏳ Черга ({queueEntries.length})
              </div>
              {queueEntries.map((e, i) => (
                <div key={e.uid||i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom: i < queueEntries.length-1 ? `1px solid ${ink(0.04)}` : "none"}}>
                  <div style={{width:16,height:16,borderRadius:5,background:ink(0.07),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:GOLD,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name || "—"}</div>
                    {e.phone && <div style={{fontSize:10,color:DIM}}>{e.phone}</div>}
                  </div>
                  {e.uid && (() => {
                    const dateStr = booking.date || (() => {
                      const d = new Date(); d.setHours(0,0,0,0);
                      d.setDate(d.getDate() + (booking.day || 0));
                      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    })();
                    const hh = String(Math.floor(booking.startMin/60)).padStart(2,'0');
                    const mm = String(booking.startMin%60).padStart(2,'0');
                    const slotKey = `${dateStr}_${hh}:${mm}`;
                    return (
                      <button onClick={() => remove(ref(db, `queue/${slotKey}/entries/${e.uid}`)).catch(()=>{})}
                        style={{width:22,height:22,borderRadius:7,border:"none",cursor:"pointer",flexShrink:0,
                          background:"rgba(239,68,68,0.15)",color:"rgba(248,113,113,0.9)",fontSize:11,fontWeight:800,
                          display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{padding:"10px 10px 4px",display:"flex",gap:8}}>
            <button onClick={() => onAction("call", booking)} style={{
              flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              padding:"11px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:"rgba(52,211,153,0.12)",color:"#34d399",fontSize:13,fontWeight:800,
            }}>{IcoPhone} Дзвонити</button>
            <button onClick={() => onAction("chat", booking)} style={{
              flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              padding:"11px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`rgba(${GLOW},0.1)`,color:BLUE,fontSize:13,fontWeight:800,
            }}>{IcoChat} Чат</button>
          </div>

          {/* Cancel link */}
          <button onClick={() => { onAction("cancel", booking); _close(); }} style={{
            width:"100%",padding:"10px",border:"none",cursor:"pointer",
            background:"none",borderTop:`1px solid ${ink(0.05)}`,
            color:"rgba(248,113,113,0.7)",fontSize:11,fontWeight:600,
            marginTop:4,marginBottom:20,
          }}>Скасувати запис</button>

        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// DRUM ROLL PICKER (iOS-style scroll wheel)
// ═══════════════════════════════════════════════════════════════
function DrumRoll({ items, currentIdx, onChange, label, itemH=42, visible=4 }) {
  const { BG_DEEP, SURF_LO, DIM, FAINT, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, SHADOW_IN = SI;
  const ref = useRef(null);
  const timerRef = useRef(null);
  const containerH = itemH * visible;
  const padV = Math.floor(visible / 2) * itemH;

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = currentIdx * itemH;
  }, [currentIdx, itemH]);

  const handleScroll = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollTop / itemH)));
      onChange(idx);
    }, 80);
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"stretch"}}>
      {label && <div style={{fontSize:9,color:TEXT_FAINT,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,textAlign:"center",marginBottom:5}}>{label}</div>}
      <div style={{position:"relative",height:containerH,borderRadius:14,overflow:"hidden",
        background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,boxShadow:SHADOW_IN}}>
        {/* Center green highlight */}
        <div style={{
          position:"absolute",zIndex:2,pointerEvents:"none",
          top:Math.floor(visible/2)*itemH, left:4, right:4, height:itemH,
          borderRadius:10,
          background:"rgba(126,217,87,0.13)",
          border:"1.5px solid rgba(126,217,87,0.4)"
        }}/>
        {/* Top/bottom fade */}
        <div style={{
          position:"absolute",zIndex:3,inset:0,pointerEvents:"none",
          background:`linear-gradient(to bottom,${BG_DEEP}EE 0%,transparent 36%,transparent 64%,${BG_DEEP}EE 100%)`
        }}/>
        {/* Scrollable list */}
        <div ref={ref} className="drum-scroll" onScroll={handleScroll} style={{
          position:"absolute",inset:0,
          overflowY:"scroll",overflowX:"hidden",
          scrollSnapType:"y mandatory",
          WebkitOverflowScrolling:"touch",
          scrollbarWidth:"none",
          paddingTop:padV, paddingBottom:padV,
        }}>
          {items.map((item,i)=>{
            const dist = Math.abs(i - currentIdx);
            return (
              <div key={i} onClick={()=>{
                ref.current?.scrollTo({top:i*itemH,behavior:"smooth"});
                onChange(i);
              }} style={{
                height:itemH, flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",
                scrollSnapAlign:"center",
                fontSize:dist===0?14:11,
                fontWeight:dist===0?800:500,
                color:dist===0?GREEN:TEXT_DIM,
                opacity:dist===0?1:Math.max(0.2,1-dist*0.3),
                userSelect:"none",cursor:"pointer",
                textAlign:"center",padding:"0 4px",lineHeight:1.3,
              }}>{item.label}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PERSONAL EVENT MODAL — bottom sheet для особистих подій
// ═══════════════════════════════════════════════════════════════
function PersonalEventModal({ data, onClose, onConfirm }) {
  const { BG_DEEP, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT } = useContext(ThemeContext);
  const { shade, ink } = useFX();

  const [title,        setTitle]        = useState("");
  const [durMin,       setDurMin]       = useState(60);
  const [note,         setNote]         = useState("");
  const [closing,      setClosing]      = useState(false);
  const [pendingEvent, setPendingEvent] = useState(null);

  useEffect(() => {
    if (data) { setTitle(""); setDurMin(60); setNote(""); }
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data && !closing) return null;

  const [hh, mm] = data.time.split(":").map(Number);
  const startMin = hh * 60 + mm;
  const today = new Date(); today.setHours(0,0,0,0);
  const slotDate = new Date(data.dateStr + "T00:00:00");
  const day = Math.round((slotDate - today) / 86400000);
  const canSave = title.trim().length > 0;

  const DUR_OPTIONS = [
    { label:"30хв", value:30 },
    { label:"1г",   value:60 },
    { label:"1.5г", value:90 },
    { label:"2г",   value:120 },
    { label:"3г",   value:180 },
  ];

  const _close = () => setClosing(true);

  return (
    <>
      <style>{`
        @keyframes _pe-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _pe-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _pe-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _pe-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,background:shade(0.55),zIndex:200,
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_pe-bg-out 0.26s ease-in forwards` : `_pe-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{
            setClosing(false);
            setPendingEvent(null);
            if (pendingEvent) onConfirm(pendingEvent);
            else onClose();
          } : undefined}
          style={{
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 rgba(45,212,191,0.3), 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_pe-down 0.26s ease-in forwards` : `_pe-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <div style={{
            padding:"10px 18px 14px",
            background:"linear-gradient(145deg,rgba(45,212,191,0.12),rgba(20,184,166,0.05))",
            borderBottom:"1px solid rgba(45,212,191,0.15)",
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:"rgba(45,212,191,0.35)",margin:"0 auto 12px"}}/>
            <div style={{fontSize:18,fontWeight:800,color:"#2dd4bf",marginBottom:2}}>📌 Особиста подія</div>
            <div style={{fontSize:12,color:DIM}}>{data.dateStr} · {data.time}</div>
          </div>

          <div style={{padding:"16px 18px 32px",display:"flex",flexDirection:"column",gap:18}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Назва</div>
              <input
                value={title}
                onChange={e=>setTitle(e.target.value)}
                placeholder="Наприклад: Лікар, Справи..."
                style={{
                  width:"100%",padding:"10px 12px",borderRadius:12,
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              />
            </div>

            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Тривалість</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {DUR_OPTIONS.map(o=>(
                  <button key={o.value} onClick={()=>setDurMin(o.value)} style={{
                    padding:"6px 14px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",
                    background: durMin===o.value ? "rgba(45,212,191,0.2)" : SURF_HI,
                    color: durMin===o.value ? "#2dd4bf" : DIM,
                    outline: durMin===o.value ? "1.5px solid rgba(45,212,191,0.5)" : "none",
                  }}>{o.label}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Нотатка (необов'язково)</div>
              <textarea
                value={note}
                onChange={e=>setNote(e.target.value)}
                rows={2}
                placeholder="Деталі..."
                style={{
                  width:"100%",padding:"10px 12px",borderRadius:12,resize:"none",
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              />
            </div>

            <button
              disabled={!canSave}
              onClick={()=>{
                if (!canSave) return;
                setPendingEvent({
                  id: `personal-${Date.now()}`,
                  day, date: data.dateStr,
                  startMin, durMin,
                  name: title.trim(),
                  note: note.trim(),
                  type: "personal",
                  status: "personal",
                  tsc: "",
                  wasAdminBlocked: !!data.slot?.adminBlocked,
                  createdAt: Date.now(),
                  createdBy: "admin",
                });
                _close();
              }}
              style={{
                width:"100%",padding:"13px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
                background: canSave ? "linear-gradient(145deg,#2dd4bf,#14b8a6)" : ink(0.07),
                color: canSave ? "#fff" : FAINT,
                fontSize:14,fontWeight:800,
                boxShadow: canSave ? "0 4px 16px rgba(45,212,191,0.35)" : "none",
              }}
            >Зберегти</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// NEW BOOKING MODAL — compact bottom sheet
// ═══════════════════════════════════════════════════════════════
function NewBookingModal({ data, onClose, onConfirm, settings, bookings = [] }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const timeStep = data?.freeSnap ? 5 : (settings.snapMin || 30);
  const timeItems = useMemo(()=>{
    const arr=[];
    for(let m=settings.workStart*60; m<settings.workEnd*60; m+=timeStep)
      arr.push({label:fmtTime(m), value:m});
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[settings.workStart, settings.workEnd, timeStep]);

  const activeServices = useMemo(()=>
    settings.services.filter(s=>s.active)
  ,[settings.services]);

  const [search,     setSearch]     = useState("");
  const [selStudent, setSelStudent] = useState(null);
  const [phone,      setPhone]      = useState("");
  const [newName,    setNewName]    = useState("");
  const [newPhone,   setNewPhone]   = useState("");
  const [dateOffset, setDateOffset] = useState(0);
  const [timeVal,    setTimeVal]    = useState(null);
  const [svcId,      setSvcId]      = useState(null);
  const [note,       setNote]       = useState("");
  const [tsc,        setTsc]        = useState("");
  const [students,   setStudents]   = useState([]);
  const [closing,    setClosing]    = useState(false);

  useEffect(()=>{
    const r = ref(db, "users");
    const handler = onValue(r, snap => {
      const d = snap.val() || {};
      setStudents(Object.entries(d).map(([uid, u]) => {
        const p = u.profile || {};
        return { id:uid, name:p.name||u.name||"Учень", phone:p.phone||u.phone||"", tsc:p.tsc||u.tsc||"" };
      }).filter(s=>s.name!=="Учень"||s.phone));
    });
    return () => off(r, "value", handler);
  }, []);

  useEffect(()=>{
    if(data){
      const snapped = timeItems.find(t=>t.value>=(data.startMin??settings.workStart*60));
      setTimeVal(snapped?.value ?? timeItems[0]?.value ?? null);
      setDateOffset(Math.max(0, data.day??0));
      setSearch(""); setSelStudent(null); setPhone("");
      setNewName(""); setNewPhone(""); setNote(""); setTsc("");
      setSvcId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[!!data]);

  const sortedStudents = useMemo(() => {
    const lastBooked = {};
    bookings.forEach(b => {
      if (b.userId && b.createdAt && (!lastBooked[b.userId] || b.createdAt > lastBooked[b.userId]))
        lastBooked[b.userId] = b.createdAt;
    });
    return [...students].sort((a, b) => {
      const la = lastBooked[a.id] || 0;
      const lb = lastBooked[b.id] || 0;
      if (la || lb) return lb - la;
      return a.name.localeCompare(b.name, "uk");
    });
  }, [students, bookings]);

  if(!data && !closing) return null;

  const isNewStudent = selStudent?.id === "new";
  const selSvc    = activeServices.find(s=>s.id===svcId) ?? null;
  const finalName = isNewStudent ? newName.trim() : selStudent ? selStudent.name : search.trim();
  const finalPhone= isNewStudent ? newPhone.trim() : phone || (selStudent?.phone ?? "");
  const canConfirm= finalName.length > 1 && !!selSvc && timeVal != null;

  const dayChips = Array.from({length:14},(_,i)=>{
    const info = getDayInfo(i);
    return { lbl: i===0?"Сьогодні":i===1?"Завтра":`${info.label} ${info.num}`, info, i };
  });

  const q        = search.toLowerCase().trim();
  const filtered = q ? sortedStudents.filter(s=>s.name.toLowerCase().includes(q)||s.phone.includes(q)) : sortedStudents;

  const SL = ({children})=>(
    <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:TEXT_FAINT,
      textTransform:"uppercase",marginBottom:7}}>{children}</div>
  );

  const _close = () => setClosing(true);

  const handleConfirm = () => {
    if(!canConfirm) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(today); d.setDate(d.getDate() + dateOffset);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    onConfirm({
      id:`b-${Date.now()}`,
      day:dateOffset, date:dateStr, startMin:timeVal, durMin:selSvc.duration,
      name:finalName, phone:finalPhone, serviceId:selSvc.id,
      type:selSvc.type||"private", status:"confirmed",
      tsc: selSvc?.type==="school" ? tsc.trim() : "", hoursDone:0, categoryId:null, isVipOnly:false,
      userId: (!isNewStudent && selStudent?.id) ? selStudent.id : null,
      ...(note.trim() && { note:note.trim() }),
    });
    _close();
  };

  return (
    <>
      <style>{`
        @keyframes _nb-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _nb-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _nb-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _nb-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,zIndex:200,
        background:shade(0.55),
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_nb-bg-out 0.26s ease-in forwards` : `_nb-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 rgba(34,197,94,0.3), 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing
              ? `_nb-down 0.26s ease-in forwards`
              : `_nb-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>

          {/* Header */}
          <div style={{
            padding:"10px 18px 14px",
            background:"linear-gradient(145deg,rgba(34,197,94,0.12),rgba(22,163,74,0.05))",
            borderBottom:"1px solid rgba(34,197,94,0.15)",
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:"rgba(34,197,94,0.35)",margin:"0 auto 12px"}}/>
            <div style={{fontSize:17,fontWeight:800,color:"#22c55e"}}>➕ Новий запис</div>
          </div>

          <div style={{padding:"16px 16px 0",display:"flex",flexDirection:"column",gap:16}}>

          {/* УЧЕНЬ */}
          <div>
            <SL>Учень</SL>
            {isNewStudent ? (
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"7px 12px",borderRadius:11,
                  background:`${GREEN}18`,border:`1.5px solid ${GREEN}44`}}>
                  <div style={{fontSize:12,fontWeight:700,color:GREEN}}>Новий учень</div>
                  <button onClick={()=>{setSelStudent(null);setNewName("");setNewPhone("");}}
                    style={{background:"none",border:"none",cursor:"pointer",color:TEXT_FAINT,fontSize:20,padding:0,lineHeight:1}}>×</button>
                </div>
                <input type="text" placeholder="Ім'я та прізвище" value={newName}
                  onChange={e=>setNewName(e.target.value)}
                  style={{padding:"10px 12px",borderRadius:11,border:`1.5px solid ${BORDER}`,
                    background:SURFACE_LO,color:TEXT,fontSize:14,fontWeight:600,outline:"none"}}/>
                <input type="tel" placeholder="+380..." value={newPhone}
                  onChange={e=>setNewPhone(e.target.value)}
                  style={{padding:"10px 12px",borderRadius:11,border:`1.5px solid ${BORDER}`,
                    background:SURFACE_LO,color:TEXT,fontSize:14,fontWeight:600,outline:"none"}}/>
              </div>
            ) : selStudent ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"10px 13px",borderRadius:13,
                background:`${GREEN}20`,border:`1.5px solid ${GREEN}50`}}>
                <div>
                  <div style={{fontSize:14,fontWeight:800,color:TEXT}}>{selStudent.name}</div>
                  <div style={{fontSize:11,color:TEXT_DIM,marginTop:1}}>{selStudent.phone}</div>
                </div>
                <button onClick={()=>{setSelStudent(null);setPhone("");setSearch("");}}
                  style={{background:"none",border:"none",cursor:"pointer",color:TEXT_FAINT,fontSize:20,padding:"0 4px",lineHeight:1}}>×</button>
              </div>
            ) : (
              <>
                <div style={{display:"flex",alignItems:"center",gap:8,
                  padding:"9px 12px",borderRadius:12,marginBottom:6,
                  background:SURFACE_LO,border:`1.5px solid ${BORDER}`}}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={TEXT_FAINT} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>
                  <input type="text" placeholder="Пошук за ім'ям..."
                    value={search} onChange={e=>setSearch(e.target.value)}
                    style={{flex:1,background:"none",border:"none",outline:"none",color:TEXT,fontSize:14,fontWeight:600}}/>
                  {search && <button onClick={()=>setSearch("")}
                    style={{background:"none",border:"none",cursor:"pointer",color:TEXT_FAINT,fontSize:16,padding:0,lineHeight:1}}>×</button>}
                </div>
                <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${BORDER}`,maxHeight:164,overflowY:"auto"}}>
                  {!q && (
                    <div onClick={()=>{setSelStudent({id:"new",name:"",phone:""});setNewName("");setNewPhone("");}}
                      style={{display:"flex",alignItems:"center",gap:9,padding:"9px 13px",cursor:"pointer",
                        borderBottom:`1px solid ${BORDER}`,background:BG_DEEP}}>
                      <div style={{width:20,height:20,borderRadius:10,flexShrink:0,
                        background:`${GREEN}33`,border:`1.5px solid ${GREEN}55`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:14,color:GREEN,fontWeight:800,lineHeight:1}}>+</div>
                      <div style={{fontSize:13,fontWeight:700,color:GREEN}}>Новий учень</div>
                    </div>
                  )}
                  {filtered.slice(0,6).map(s=>(
                    <div key={s.id} onClick={()=>{setSelStudent(s);setPhone(s.phone);setSearch("");if(s.tsc)setTsc(s.tsc);}}
                      style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        padding:"9px 13px",cursor:"pointer",borderBottom:`1px solid ${BORDER}`,background:BG_DEEP}}>
                      <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{s.name}</div>
                      <div style={{fontSize:11,color:TEXT_FAINT}}>{s.phone.slice(-7)}</div>
                    </div>
                  ))}
                  {q && !filtered.length && (
                    <div style={{padding:"11px 13px",fontSize:12,color:TEXT_FAINT,textAlign:"center",background:BG_DEEP}}>Не знайдено</div>
                  )}
                  {q.length>1 && !filtered.find(s=>s.name.toLowerCase()===q) && (
                    <div onClick={()=>{setSelStudent({id:"new",name:"",phone:""});setNewName(search.trim());setNewPhone("");setSearch("");}}
                      style={{display:"flex",alignItems:"center",gap:9,padding:"9px 13px",cursor:"pointer",background:BG_DEEP}}>
                      <div style={{width:20,height:20,borderRadius:10,flexShrink:0,
                        background:`${GREEN}33`,border:`1.5px solid ${GREEN}55`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:14,color:GREEN,fontWeight:800,lineHeight:1}}>+</div>
                      <div style={{fontSize:13,fontWeight:700,color:GREEN}}>Додати «{search.trim()}»</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ДАТА */}
          <div>
            <SL>Дата</SL>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2,scrollbarWidth:"none"}}>
              {dayChips.map(({lbl,info,i})=>{
                const active = i===dateOffset;
                return (
                  <button key={i} onClick={()=>setDateOffset(i)} style={{
                    flexShrink:0,padding:"7px 11px",borderRadius:11,border:"none",cursor:"pointer",
                    background:active?`linear-gradient(165deg,${GOLD},#e6a800)`:SURFACE_LO,
                    color:active?"#1a1200":info.wk?ACCENT:TEXT_DIM,
                    fontSize:11,fontWeight:active?800:600,
                    boxShadow:active?`0 4px 12px ${GOLD}55`:SHADOW_OUT,
                    transition:"all .12s",
                  }}>
                    <div>{lbl}</div>
                    {i>1&&<div style={{fontSize:9,opacity:0.65,marginTop:1}}>{info.month}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ЧАС */}
          <div>
            <SL>Час початку</SL>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {timeItems.map(t=>{
                const active = t.value===timeVal;
                return (
                  <button key={t.value} onClick={()=>setTimeVal(t.value)} style={{
                    padding:"7px 10px",borderRadius:10,border:"none",cursor:"pointer",minWidth:54,
                    background:active?`linear-gradient(165deg,${BLUE},#1d4ed8)`:SURFACE_LO,
                    color:active?"#fff":TEXT_DIM,
                    fontSize:13,fontWeight:active?800:500,
                    boxShadow:active?`0 4px 12px ${BLUE}55`:SHADOW_OUT,
                    transition:"all .12s",
                  }}>{t.label}</button>
                );
              })}
            </div>
          </div>

          {/* ПОСЛУГА */}
          <div>
            <SL>Послуга</SL>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {activeServices.map(s=>{
                const active = s.id===svcId;
                const c = colorOf(s.colorId || (s.type==="school"?"green":"yellow"));
                return (
                  <button key={s.id} onClick={()=>setSvcId(s.id)} style={{
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"10px 13px",borderRadius:12,cursor:"pointer",
                    background:active?`${c}1a`:SURFACE_LO,
                    border:active?`1.5px solid ${c}55`:`1.5px solid transparent`,
                    boxShadow:active?`0 4px 14px ${c}2a`:SHADOW_OUT,
                    transition:"all .12s",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <div style={{width:9,height:9,borderRadius:"50%",background:c,flexShrink:0}}/>
                      <div style={{fontSize:13,fontWeight:active?800:600,color:active?TEXT:TEXT_DIM,textAlign:"left"}}>{s.name}</div>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:active?c:TEXT_FAINT,whiteSpace:"nowrap"}}>
                      {s.price}₴ · {s.duration}хв
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ТСЦ — тільки для послуг автошколи */}
          {selSvc?.type === "school" && (
            <div>
              <SL>ТСЦ (центр)</SL>
              <input
                type="text"
                placeholder="Наприклад: ТСЦ Оболонь"
                value={tsc}
                onChange={e=>setTsc(e.target.value)}
                style={{
                  width:"100%", padding:"10px 13px", borderRadius:12,
                  border:`1.5px solid ${BORDER}`,
                  background:SURFACE_LO, color:TEXT, fontSize:13,
                  outline:"none", boxSizing:"border-box", fontFamily:"inherit",
                }}
              />
            </div>
          )}

          {/* ЦІНА PREVIEW */}
          {selSvc && (
            <div style={{
              display:"flex",alignItems:"center",gap:10,
              padding:"10px 13px",borderRadius:12,
              background:`${GOLD}14`,border:`1px solid ${GOLD}30`,
            }}>
              <span style={{fontSize:15}}>💰</span>
              <div style={{fontSize:15,fontWeight:800,color:GOLD}}>{selSvc.price}₴</div>
              <div style={{fontSize:12,color:TEXT_DIM}}>· {selSvc.duration} хв</div>
              {timeVal!=null && (
                <div style={{marginLeft:"auto",fontSize:12,color:TEXT_DIM}}>
                  {fmtTime(timeVal)} → {fmtTime(timeVal + selSvc.duration)}
                </div>
              )}
            </div>
          )}

          {/* ПРИМІТКА */}
          <input
            type="text"
            placeholder="Примітка (необов'язково)..."
            value={note}
            onChange={e=>setNote(e.target.value)}
            style={{
              padding:"10px 13px",borderRadius:12,
              border:`1.5px solid ${BORDER}`,
              background:SURFACE_LO,color:TEXT,fontSize:13,outline:"none",
            }}
          />

          {/* Кнопка підтвердження */}
          <button disabled={!canConfirm} onClick={handleConfirm} style={{
            width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
            background:canConfirm?`linear-gradient(160deg,${GREEN},#4ade80)`:SURFACE_LO,
            color:canConfirm?"#fff":TEXT_FAINT,
            fontSize:15,fontWeight:800,letterSpacing:0.2,
            boxShadow:canConfirm?`0 6px 20px ${GREEN}55`:SHADOW_OUT,
            transition:"all .2s",marginBottom:20,
          }}>✓ Записати</button>

        </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// NUM INPUT — локальний стан, не скаче при наборі
// ═══════════════════════════════════════════════════════════════
function NumInput({ value, onChange, min, max, suffix }) {
  const { BG_DEEP, SURF_LO, TEXT, DIM, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_LO = SURF_LO, TEXT_DIM = DIM, SHADOW_IN = SI;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = (raw) => {
    const n = parseInt(raw ?? draft, 10);
    if (!isNaN(n) && n >= (min ?? -Infinity) && n <= (max ?? Infinity)) onChange(n);
    else setDraft(String(value));
  };
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:6,
      padding:"6px 12px", borderRadius:10,
      background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,
      boxShadow:SHADOW_IN
    }}>
      <input
        type="number" inputMode="numeric"
        value={draft} min={min} max={max}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur(); } }}
        style={{
          width:50, background:"transparent", border:"none", outline:"none",
          color:TEXT, fontSize:14, fontWeight:800, textAlign:"center"
        }}
      />
      {suffix && <span style={{fontSize:11, color:TEXT_DIM, fontWeight:700}}>{suffix}</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS — все настройки
// ═══════════════════════════════════════════════════════════════
function SettingsView({ settings, setSettings }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const upd = (k, v) => setSettings(s => ({...s, [k]:v}));
  const updNested = (k1, k2, v) => setSettings(s => ({...s, [k1]:{...s[k1], [k2]:v}}));

  // ── row helper
  const Row = ({ label, hint, children }) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,padding:"12px 0",borderBottom:`1px solid ${BORDER}`}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{label}</div>
        {hint && <div style={{fontSize:11,color:TEXT_DIM,marginTop:3}}>{hint}</div>}
      </div>
      <div style={{flexShrink:0}}>{children}</div>
    </div>
  );


  return (
    <>
    <style>{makeGlobalCSS(SURF_LO, ACCENT, GLOW, SHADE, INK)}</style>
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* ── PROFILE ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Профіль інструктора</SectionTitle>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <div className="icon3d" style={{
            width:80,height:80,borderRadius:40,
            background:`linear-gradient(165deg,${PURPLE},#6d28d9)`
          }}>
            <svg width={42} height={42} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" style={{position:"relative",zIndex:1}}>
              <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
            </svg>
          </div>
          <div style={{flex:1}}>
            <input value={settings.profile.name} onChange={e=>updNested("profile","name",e.target.value)}
              style={{background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:17,fontWeight:800,width:"100%",marginBottom:4}}/>
            <input value={settings.profile.phone} onChange={e=>updNested("profile","phone",e.target.value)}
              style={{background:"transparent",border:"none",outline:"none",color:TEXT_DIM,fontSize:12,width:"100%"}}/>
          </div>
        </div>
        <Row label="Адреса">
          <input value={settings.profile.address} onChange={e=>updNested("profile","address",e.target.value)}
            style={{
              background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,
              border:"none",outline:"none",color:TEXT,fontSize:13,
              padding:"8px 12px",borderRadius:10,boxShadow:SHADOW_IN,width:180,textAlign:"right"
            }}/>
        </Row>
        <Row label="Досвід (років)">
          <NumInput value={settings.profile.experience} onChange={v=>updNested("profile","experience",v)} min={0} max={50}/>
        </Row>
      </Card>

      {/* ── SCHEDULE ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Робочий графік</SectionTitle>
        <Row label="Початок дня" hint="Перший доступний слот">
          <NumInput value={settings.workStart} onChange={v=>upd("workStart",v)} min={0} max={23} suffix=":00"/>
        </Row>
        <Row label="Кінець дня" hint="Останній доступний слот">
          <NumInput value={settings.workEnd} onChange={v=>upd("workEnd",v)} min={1} max={24} suffix=":00"/>
        </Row>
        <Row label="Вихідні дні">
          <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:200}}>
            {["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].map((d,i)=>{
              const on = settings.weekends.includes(i);
              return (
                <button key={d} onClick={()=>upd("weekends", on?settings.weekends.filter(x=>x!==i):[...settings.weekends,i])}
                  style={{
                    width:34,height:34,borderRadius:10,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                    background: on?`linear-gradient(165deg,${ACCENT_HI},${ACCENT})`:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
                    color: on?"#fff":TEXT_DIM,
                    boxShadow: on?`inset 1px 1px 0 ${glow(0.25)}`:SHADOW_OUT
                  }}>{d}</button>
              );
            })}
          </div>
        </Row>
        <Row label="Днів відображати в розкладі" hint="Від 1 до 30">
          <NumInput value={settings.daysShown} onChange={v=>upd("daysShown",v)} min={1} max={30} suffix="дн"/>
        </Row>
      </Card>

      {/* ── BREAKS ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Обідня перерва</SectionTitle>
        <Row label="Робити паузу на обід">
          <Toggle on={settings.lunchEnabled} onChange={v=>upd("lunchEnabled",v)}/>
        </Row>
        {settings.lunchEnabled && (
          <>
            <Row label="З">
              <NumInput value={settings.lunchStart} onChange={v=>upd("lunchStart",v)} min={0} max={23} suffix=":00"/>
            </Row>
            <Row label="До">
              <NumInput value={settings.lunchEnd} onChange={v=>upd("lunchEnd",v)} min={1} max={24} suffix=":00"/>
            </Row>
          </>
        )}
      </Card>

      {/* ── SNAP & DISPLAY ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Сітка часу</SectionTitle>
        <div style={{fontSize:12,color:TEXT_DIM,marginBottom:10}}>
          Крок при перетягуванні: <b style={{color:ACCENT}}>{settings.snapMin} хв</b>
        </div>
        <input type="range" min={1} max={60} value={settings.snapMin}
          onChange={e=>upd("snapMin",+e.target.value)}
          style={{width:"100%"}}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4,marginBottom:10}}>
          <span style={{fontSize:10,color:TEXT_FAINT}}>1 хв</span>
          <span style={{fontSize:10,color:TEXT_FAINT}}>60 хв</span>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[1,5,15,30,60].map(v=>(
            <button key={v} onClick={()=>upd("snapMin",v)} style={{
              padding:"6px 12px",borderRadius:10,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
              background: settings.snapMin===v?`linear-gradient(165deg,${ACCENT_HI},${ACCENT})`:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
              color: settings.snapMin===v?"#fff":TEXT_DIM,
              boxShadow: settings.snapMin===v?`inset 1px 1px 0 ${glow(0.25)}`:SHADOW_OUT
            }}>{v} хв</button>
          ))}
        </div>
      </Card>

      {/* ── PENDING ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Підтвердження букінгів</SectionTitle>
        <Row label="Вимагати підтвердження" hint="Нові букінги отримують статус 'Очікує' до твого підтвердження">
          <Toggle on={settings.pendingEnabled} onChange={v=>upd("pendingEnabled",v)}/>
        </Row>
      </Card>

      {/* ── STICKY TIME ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Прилипання вільних слотів</SectionTitle>
        <div style={{fontSize:12,color:TEXT_DIM,marginBottom:14}}>
          Якщо є запис на 12:00–14:00, які слоти показувати учневі для 1-годинного уроку?
        </div>
        {[
          {k:"before",l:"Тільки попередні (11:00)"},
          {k:"after", l:"Тільки наступні (14:00)"},
          {k:"both",  l:"Обидва (11:00 і 14:00) — вибір учня"},
        ].map(o=>(
          <Row key={o.k} label={o.l}>
            <div onClick={()=>upd("stickyTime",o.k)} style={{
              width:22,height:22,borderRadius:11,cursor:"pointer",
              border:`2px solid ${settings.stickyTime===o.k?ACCENT:TEXT_FAINT}`,
              background: settings.stickyTime===o.k?ACCENT:"transparent",
              boxShadow: settings.stickyTime===o.k?`0 0 8px ${ACCENT}77, inset 1px 1px 0 ${glow(0.3)}`:"none"
            }}/>
          </Row>
        ))}
      </Card>

      {/* ── RESTRICTIONS ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Обмеження для учнів</SectionTitle>
        <Row label="Учень може переносити свої букінги">
          <Toggle on={settings.studentCanReschedule} onChange={v=>upd("studentCanReschedule",v)}/>
        </Row>
        <Row label="Учень може скасовувати букінги">
          <Toggle on={settings.studentCanCancel} onChange={v=>upd("studentCanCancel",v)}/>
        </Row>
        <Row label="Заборона запису" hint="За скільки годин до слоту учень не може записатись">
          <NumInput value={settings.bookCutoffHours} onChange={v=>upd("bookCutoffHours",v)} min={0} max={48} suffix="год"/>
        </Row>
        <Row label="Календар наперед" hint="На скільки днів учень бачить вільні слоти">
          <NumInput value={settings.calendarOpenDays} onChange={v=>upd("calendarOpenDays",v)} min={1} max={365} suffix="дн"/>
        </Row>
      </Card>

      {/* ── SERVICES ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Послуги та ціни</SectionTitle>
        {settings.services.map(s=>(
          <div key={s.id} style={{
            padding:"14px",marginBottom:10,borderRadius:14,
            background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,boxShadow:SHADOW_OUT,
            opacity:s.active?1:0.5
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              {/* color preview */}
              <div className="slot-base slot-colored" style={{"--c":colorOf(s.colorId),width:30,height:30,borderRadius:8}}/>
              <input value={s.name}
                onChange={e=>upd("services", settings.services.map(x=>x.id===s.id?{...x,name:e.target.value}:x))}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:14,fontWeight:800}}/>
              <Toggle on={s.active} onChange={v=>upd("services", settings.services.map(x=>x.id===s.id?{...x,active:v}:x))}/>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1,marginBottom:4}}>ХВИЛИН</div>
                <NumInput value={s.duration}
                  onChange={v=>upd("services", settings.services.map(x=>x.id===s.id?{...x,duration:v}:x))}
                  min={5} max={480} suffix="хв"/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1,marginBottom:4}}>ЦІНА</div>
                <NumInput value={s.price}
                  onChange={v=>upd("services", settings.services.map(x=>x.id===s.id?{...x,price:v}:x))}
                  min={0} max={100000} suffix="₴"/>
              </div>
            </div>
            <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1,marginBottom:6}}>КОЛІР</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {PALETTE.map(p=>(
                <button key={p.id} title={p.name}
                  onClick={()=>upd("services", settings.services.map(x=>x.id===s.id?{...x,colorId:p.id}:x))}
                  style={{
                    width:28,height:28,borderRadius:8,border:s.colorId===p.id?`2px solid ${TEXT}`:"none",
                    cursor:"pointer",background:`linear-gradient(155deg, ${p.color}aa, ${p.color}44)`,
                    boxShadow:`inset 1px 1px 0 ${glow(0.3)}, 0 2px 6px ${shade(0.3)}`
                  }}/>
              ))}
            </div>
          </div>
        ))}
        <button onClick={()=>upd("services",[...settings.services,{
          id:`sv-${Date.now()}`,name:"Нова послуга",type:"private",duration:60,price:0,colorId:"blue",active:true,description:""
        }])} style={{
          width:"100%",padding:"12px",borderRadius:14,border:"none",cursor:"pointer",
          background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
          color:TEXT,fontSize:13,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:SHADOW_OUT
        }}>{ICONS.plus(28)} Додати послугу</button>
      </Card>

      {/* ── CATEGORIES ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Категорії учнів</SectionTitle>
        <div style={{fontSize:12,color:TEXT_DIM,marginBottom:12}}>
          Категорії для приватних учнів. Допомагає відкривати спецслоти для VIP, давати знижки тощо.
        </div>
        {settings.categories.map(c=>(
          <div key={c.id} style={{
            display:"flex",alignItems:"center",gap:10,padding:"12px",marginBottom:8,borderRadius:12,
            background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,boxShadow:SHADOW_OUT
          }}>
            <div style={{
              width:14,height:14,borderRadius:4,
              background:colorOf(c.colorId),boxShadow:`0 0 8px ${colorOf(c.colorId)}88`
            }}/>
            <input value={c.name}
              onChange={e=>upd("categories", settings.categories.map(x=>x.id===c.id?{...x,name:e.target.value}:x))}
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,fontWeight:700}}/>
            <select value={c.colorId}
              onChange={e=>upd("categories", settings.categories.map(x=>x.id===c.id?{...x,colorId:e.target.value}:x))}
              style={{
                background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,
                color:TEXT,border:"none",outline:"none",padding:"6px 10px",borderRadius:8,fontSize:12
              }}>
              {PALETTE.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={()=>upd("categories", settings.categories.filter(x=>x.id!==c.id))}
              style={{background:"none",border:"none",cursor:"pointer",color:RED,fontSize:18}}>×</button>
          </div>
        ))}
        <button onClick={()=>upd("categories",[...settings.categories,{
          id:`cat-${Date.now()}`,name:"Нова категорія",colorId:"blue"
        }])} style={{
          width:"100%",padding:"12px",borderRadius:14,border:"none",cursor:"pointer",
          background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
          color:TEXT,fontSize:13,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:SHADOW_OUT
        }}>{ICONS.plus(28)} Додати категорію</button>
      </Card>

      {/* ── NAVIGATION ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Нижня навігація</SectionTitle>
        <div style={{fontSize:12,color:TEXT_DIM,marginBottom:12}}>
          Оберіть вкладки, які відображаються в нижньому меню. «Налашт.» завжди активні.
        </div>
        {TABS.map(t=>(
          <Row key={t.id} label={t.label}>
            <Toggle
              on={settings.navTabs?.includes(t.id) ?? true}
              onChange={v=>{
                if(t.id==="settings") return;
                upd("navTabs", v
                  ? [...(settings.navTabs||[]), t.id]
                  : (settings.navTabs||[]).filter(x=>x!==t.id));
              }}/>
          </Row>
        ))}
      </Card>

      {/* ── AUTO MESSAGES ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Автоматичні повідомлення</SectionTitle>
        <Row label="Нагадування за N годин до уроку">
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {settings.autoReminder?.enabled && (
              <NumInput value={settings.autoReminder?.hoursBefore ?? 24}
                onChange={v=>updNested("autoReminder","hoursBefore",v)}
                min={1} max={168} suffix="год"/>
            )}
            <Toggle on={!!settings.autoReminder?.enabled} onChange={v=>updNested("autoReminder","enabled",v)}/>
          </div>
        </Row>
        <Row label="Вітання при реєстрації нового учня">
          <Toggle on={!!settings.autoWelcome?.enabled} onChange={v=>updNested("autoWelcome","enabled",v)}/>
        </Row>
        <Row label="Повідомлення про підтвердження букінгу">
          <Toggle on={!!settings.autoConfirm?.enabled} onChange={v=>updNested("autoConfirm","enabled",v)}/>
        </Row>
        <Row label="Повідомлення після скасування">
          <Toggle on={!!settings.autoCancel?.enabled} onChange={v=>updNested("autoCancel","enabled",v)}/>
        </Row>
        <Row label="Пропозиція вільного слоту (черга)">
          <Toggle on={!!settings.autoQueueOffer?.enabled} onChange={v=>updNested("autoQueueOffer","enabled",v)}/>
        </Row>
      </Card>

      {/* ── QUEUE ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Черга очікування — режим роботи</SectionTitle>
        <div style={{fontSize:12,color:TEXT_DIM,marginBottom:14}}>
          Коли учень скасовує запис, як пропонувати слот тим, хто в черзі?
        </div>
        <Row label="FIFO" hint="Автоматично запросити першого в черзі">
          <Toggle on={settings.queueAutoFifo} onChange={v=>upd("queueAutoFifo",v)}/>
        </Row>
        <Row label="Broadcast" hint="Розіслати всім, хто перший підтвердив — той записаний">
          <Toggle on={settings.queueBroadcast} onChange={v=>upd("queueBroadcast",v)}/>
        </Row>
        <Row label="Ручний" hint="Інструктор сам обирає кого запросити">
          <Toggle on={settings.queueManual} onChange={v=>upd("queueManual",v)}/>
        </Row>
      </Card>

      {/* ── APPEARANCE ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Зовнішній вигляд</SectionTitle>
        <Row label="Тема">
          <div style={{display:"flex",gap:6}}>
            {[{k:"dark",l:"Темна"},{k:"light",l:"Світла"}].map(t=>(
              <button key={t.k} onClick={()=>upd("theme",t.k)} style={{
                padding:"8px 14px",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                background: settings.theme===t.k?`linear-gradient(165deg,${ACCENT_HI},${ACCENT})`:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
                color: settings.theme===t.k?"#fff":TEXT_DIM,
                boxShadow: settings.theme===t.k?`inset 1px 1px 0 ${glow(0.25)}`:SHADOW_OUT
              }}>{t.l}</button>
            ))}
          </div>
        </Row>
        <Row label="Мова">
          <div style={{display:"flex",gap:6}}>
            {[{k:"uk",l:"УКР"},{k:"en",l:"ENG"}].map(t=>(
              <button key={t.k} onClick={()=>upd("language",t.k)} style={{
                padding:"8px 14px",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                background: settings.language===t.k?`linear-gradient(165deg,${ACCENT_HI},${ACCENT})`:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
                color: settings.language===t.k?"#fff":TEXT_DIM,
                boxShadow: settings.language===t.k?`inset 1px 1px 0 ${glow(0.25)}`:SHADOW_OUT
              }}>{t.l}</button>
            ))}
          </div>
        </Row>
      </Card>

      {/* ── NOTIFICATIONS ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Нотифікації</SectionTitle>
        <div style={{fontSize:12,color:TEXT_DIM,marginBottom:14}}>Де показувати нові букінги та повідомлення:</div>
        {[
          {k:"topbar",l:"У верхньому барі (іконка дзвіночка)"},
          {k:"tab",l:"Окрема вкладка в меню"},
          {k:"profile",l:"У профілі інструктора"},
        ].map(o=>(
          <Row key={o.k} label={o.l}>
            <div onClick={()=>upd("notifLocation",o.k)} style={{
              width:22,height:22,borderRadius:11,cursor:"pointer",
              border:`2px solid ${settings.notifLocation===o.k?ACCENT:TEXT_FAINT}`,
              background: settings.notifLocation===o.k?ACCENT:"transparent",
              boxShadow: settings.notifLocation===o.k?`0 0 8px ${ACCENT}77, inset 1px 1px 0 ${glow(0.3)}`:"none"
            }}/>
          </Row>
        ))}
      </Card>

      {/* ── BROADCAST PUSH ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Сповіщення учням</SectionTitle>
        <div style={{fontSize:12,color:DIM,marginBottom:14}}>Ручна розсилка пушу активним учням про вільний слот</div>
        <button onClick={()=>setBroadcastOpen(true)} style={{width:"100%",background:`linear-gradient(135deg,${ACCENT},${ACC_HI})`,color:"#fff",border:"none",borderRadius:14,padding:"13px 0",fontSize:14,fontWeight:800,cursor:"pointer"}}>
          📣 Надіслати сповіщення учням
        </button>
        {broadcastOpen && <BroadcastModal onClose={()=>setBroadcastOpen(false)}/>}
      </Card>

      <div style={{height:30}}/>
    </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUB for other tabs
// ═══════════════════════════════════════════════════════════════
function StubView({ title }) {
  const { DIM: TEXT_DIM, FAINT: TEXT_FAINT , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  return (
    <Card style={{padding:30,textAlign:"center"}}>
      <div style={{fontSize:14,color:TEXT_DIM,marginBottom:10}}>{title}</div>
      <div style={{fontSize:12,color:TEXT_FAINT}}>Допишемо після твого фідбеку на Розклад + Налаштування</div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
const TABS = [
  {id:"schedule",  label:"Записи",     icon:ICONS.calendar},
  {id:"bookings",  label:"Букінги",    icon:ICONS.list},
  {id:"students",  label:"Учні",       icon:ICONS.users},
  {id:"services",  label:"Послуги",    icon:ICONS.car},
  {id:"chats",     label:"Чати",       icon:ICONS.chat},
  {id:"templates", label:"Шаблони",    icon:ICONS.bell},
  {id:"stats",     label:"Статистика", icon:ICONS.chart},
  {id:"settings",  label:"Налашт.",    icon:ICONS.settings},
];
const TITLES = {
  schedule:"Розклад", bookings:"Букінги", students:"Учні",
  services:"Послуги", chats:"Чати", templates:"Шаблони",
  stats:"Статистика", settings:"Налаштування"
};

export default function App() {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const css = makeGlobalCSS(SURF_LO, ACCENT, GLOW, SHADE, INK);
  const [tab, setTab] = useState("schedule");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [bookings, setBookings] = useState(initialBookings);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [newBookingData, setNewBookingData] = useState(null);
  const saveTimerRef = useRef(null);

  // Load settings from Firebase on mount
  useEffect(() => {
    get(ref(db, "admin_settings")).then(snap => {
      if (snap.exists()) {
        setSettings(s => ({ ...s, ...snap.val() }));
      }
    }).catch(() => {});
  }, []);

  // Users map for TSC cross-reference
  const usersMapRef = useRef({});
  const rawBookingsDataRef = useRef(null);

  // processBookingsRef holds the latest version so async effect callbacks always use current setBookings/usersMapRef
  const processBookingsRef = useRef(null);
  processBookingsRef.current = (d) => {
    if (!d) { setBookings([]); return; }
    const today = new Date(); today.setHours(0,0,0,0);
    const all = [];
    Object.entries(d).forEach(([uid, userBkgs]) => {
      if (!userBkgs) return;
      Object.entries(userBkgs).forEach(([bkId, raw]) => {
        if (!raw) return;
        const timeStr = raw.time || (raw.startMin != null ? fmtTime(raw.startMin) : "00:00");
        const [hh, mm] = timeStr.split(":").map(Number);
        const dateStr = raw.date || "";
        let day = 0;
        if (dateStr) {
          const bkDate = new Date(dateStr + "T00:00:00");
          day = Math.round((bkDate - today) / 86400000);
        }
        all.push({
          ...raw,
          id:       raw.id || bkId,
          _fbKey:   bkId,
          userId:   uid,
          day,
          date:     dateStr,
          startMin: raw.startMin ?? (hh * 60 + mm),
          durMin:   raw.durMin ?? (raw.durationHours ? raw.durationHours * 60 : 60),
          name:     raw.studentName || raw.name || "Учень",
          phone:    raw.phone || "",
          type:     raw.serviceType || raw.type || "private",
          status:   raw.status || "confirmed",
          tsc:      raw.tsc || usersMapRef.current[uid]?.profile?.tsc || usersMapRef.current[uid]?.tsc || "",
          hoursDone: raw.hours || raw.hoursDone || 0,
          categoryId: raw.categoryId || null,
          isVipOnly:  raw.isVipOnly || false,
        });
      });
    });
    setBookings(all);
  };

  useEffect(() => {
    return onValue(ref(db, "users"), snap => {
      usersMapRef.current = snap.val() || {};
      // Re-process already-loaded bookings so TSC cross-reference applies after users arrive
      if (rawBookingsDataRef.current !== null) {
        processBookingsRef.current(rawBookingsDataRef.current);
      }
    });
  }, []);

  // Load bookings from Firebase (realtime)
  useEffect(() => {
    const r = ref(db, "bookings");
    const handler = onValue(r, snap => {
      rawBookingsDataRef.current = snap.val();
      processBookingsRef.current(snap.val());
    });
    return () => off(r, "value", handler);
  }, []);

  // Save settings to Firebase with 1s debounce
  const setSettingsAndSave = (updater) => {
    setSettings(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        update(ref(db, "admin_settings"), next).catch(() => {});
      }, 1000);
      return next;
    });
  };

  const handleAction = (action, b) => {
    if (action === "confirm")  setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x));
    if (action === "cancel") {
      if (b.userId && b.id) {
        if (b.date && b.startMin !== undefined && b.durMin) {
          const upd = {};
          for (let i = 0; i < b.durMin; i += 30) {
            const sm = b.startMin + i;
            const hh = String(Math.floor(sm/60)).padStart(2,'0'), mm = String(sm%60).padStart(2,'0');
            const path = `timeslots/${b.date}/slot${hh}${mm}`;
            if (i % 60 === 0) { upd[`${path}/available`] = true; upd[`${path}/time`] = `${hh}:${mm}`; }
            else { upd[path] = null; }
          }
          if (Object.keys(upd).length) update(ref(db,'/'), upd).catch(()=>{});
        }
        // Скасовуємо обидва можливі вузли (дубль міг з'явитись від старого коду)
        const keys = [...new Set([b._fbKey, b.id].filter(Boolean))];
        keys.forEach(k => update(ref(db, `bookings/${b.userId}/${k}`), { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
        setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"cancelled"}:x));
      } else {
        setBookings(bs=>bs.filter(x=>x.id!==b.id));
      }
    }
    if (action === "noshow")   setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"noshow"}:x));
    if (action === "call")     window.location.href = `tel:${b.phone}`;
    if (action === "sms")      window.location.href = `sms:${b.phone}`;
    setSelectedBooking(null);
  };

  const handleNewBooking = (b) => {
    if (b.id) {
      const fbData = {
        id: b.id, date: b.date || "", time: fmtTime(b.startMin),
        startMin: b.startMin, durMin: b.durMin, durationHours: b.durMin / 60,
        studentName: b.name, name: b.name, phone: b.phone,
        serviceId: b.serviceId, serviceType: b.type, type: b.type,
        status: b.status, tsc: b.tsc || "", hours: b.hoursDone || 0,
        createdAt: Date.now(), createdBy: "admin",
        ...(b.note && { note: b.note }),
      };
      if (b.userId) {
        update(ref(db, `bookings/${b.userId}/${b.id}`), fbData).catch(()=>{});
      } else {
        const phone = (b.phone || '').replace(/\D/g, '');
        if (phone) {
          update(ref(db, `bookings_by_phone/${phone}/${b.id}`), fbData).catch(()=>{});
          for (let i = 0; i < b.durMin; i += 30) {
            const slotMin = b.startMin + i;
            const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
            const sm = String(slotMin % 60).padStart(2, '0');
            update(ref(db, `slotBookings/${b.date}/slot${sh}${sm}`), {phone, bookingId: b.id}).catch(()=>{});
          }
        }
      }
    }
    if (b.date && b.startMin !== undefined && b.durMin) {
      const slotUpd = {};
      for (let i = 0; i < b.durMin; i += 30) {
        const slotMin = b.startMin + i;
        const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
        const sm = String(slotMin % 60).padStart(2, '0');
        slotUpd[`timeslots/${b.date}/slot${sh}${sm}/available`] = false;
        slotUpd[`timeslots/${b.date}/slot${sh}${sm}/time`] = `${sh}:${sm}`;
      }
      update(ref(db, '/'), slotUpd).catch(() => {});
    }
    // onValue listener will update setBookings automatically; skip local push to avoid duplicate
  };

  const renderView = () => {
    switch(tab) {
      case "schedule":  return <ScheduleView settings={settings} setSettings={setSettingsAndSave}
                                onSlotClick={setSelectedBooking}
                                onEmptySlotClick={setNewBookingData}
                                bookings={bookings} setBookings={setBookings}/>;
      case "settings":  return <SettingsView settings={settings} setSettings={setSettingsAndSave}/>;
      default: return <StubView title={TITLES[tab]}/>;
    }
  };

  return (
    <>
      <style>{css}</style>
      <div style={{
        minHeight:"100vh", background:BG, color:TEXT,
        fontFamily:"ui-sans-serif,-apple-system,BlinkMacSystemFont,system-ui,sans-serif",
        paddingBottom:100
      }}>
        {/* TOP BAR */}
        <div style={{
          padding:"14px 18px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          position:"sticky",top:0,
          background:`linear-gradient(180deg,${BG} 60%,rgba(28,29,33,0.92))`,
          backdropFilter:"blur(20px)", zIndex:20,
          borderBottom:`1px solid ${BORDER}`
        }}>
          <button style={{padding:0,background:"transparent",border:"none",cursor:"pointer"}}>{ICONS.menu(42)}</button>
          <div style={{fontSize:17,fontWeight:800,letterSpacing:-0.3}}>{TITLES[tab]}</div>
          {settings.notifLocation==="topbar"
            ? <button style={{padding:0,background:"transparent",border:"none",cursor:"pointer",position:"relative"}}>
                {ICONS.bell(42)}
                <span style={{
                  position:"absolute",top:-2,right:-2,
                  background:ACCENT,color:"#fff",borderRadius:10,
                  padding:"1px 6px",fontSize:9,fontWeight:800,
                  boxShadow:`0 0 8px ${ACCENT}88`
                }}>3</span>
              </button>
            : <button style={{padding:0,background:"transparent",border:"none",cursor:"pointer"}}>{ICONS.refresh(42)}</button>
          }
        </div>

        {/* CONTENT */}
        <div style={{padding:"16px 14px 0"}}>{renderView()}</div>

        {/* FAB on schedule */}
        {tab==="schedule" && (
          <button style={{
            position:"fixed",bottom:118,right:18,
            width:60,height:60,borderRadius:30,
            background:`linear-gradient(165deg,${ACCENT_HI},${ACCENT})`,
            color:"#fff",border:"none",fontSize:30,cursor:"pointer",
            boxShadow:`0 8px 24px rgba(255,90,60,0.5),0 4px 8px ${shade(0.3)},inset 1px 1px 0 ${glow(0.3)}`,
            display:"flex",alignItems:"center",justifyContent:"center",
            zIndex:25
          }}>+</button>
        )}

        {/* BOTTOM NAV */}
        <div style={{
          position:"fixed",bottom:0,left:0,right:0,
          padding:"0 16px 14px",
          background:"transparent",
          zIndex:30,
          pointerEvents:"none",
        }}>
          <div style={{
            background:`linear-gradient(180deg,${SURFACE},${SURFACE_LO})`,
            borderRadius:26,
            border:`1px solid ${ink(0.08)}`,
            boxShadow:`0 -1px 0 ${glow(0.05)}, 0 12px 40px ${shade(0.65)}, 0 4px 16px ${shade(0.4)}`,
            display:"flex", overflow:"hidden",
            pointerEvents:"auto",
            justifyContent:"center", gap:0,
          }}>
          {TABS.filter(t=>settings.navTabs?.includes(t.id)??true).map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:"1 1 0", minWidth:0, maxWidth:90,
              padding:"12px 6px 10px",
              background:"transparent",border:"none",cursor:"pointer",
              color: tab===t.id?ACCENT:TEXT_FAINT,
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,
              position:"relative",
            }}>
              <div style={{
                transform: tab===t.id?"scale(1.1)":"scale(0.95)",
                transition:"transform .15s",
                opacity:tab===t.id?1:0.52,
              }}>{t.icon(33)}</div>
              <span style={{fontSize:9,fontWeight:700,letterSpacing:0.2}}>{t.label}</span>
              {tab===t.id && (
                <div style={{
                  position:"absolute",bottom:5,left:"50%",transform:"translateX(-50%)",
                  width:28,height:3,borderRadius:2,background:ACCENT,
                  boxShadow:`0 0 10px ${ACCENT}99`
                }}/>
              )}
            </button>
          ))}
          </div>
        </div>

        {/* MODALS */}
        <BookingModal booking={selectedBooking} onClose={()=>setSelectedBooking(null)}
          onAction={handleAction} settings={settings}/>
        <NewBookingModal data={newBookingData} onClose={()=>setNewBookingData(null)}
          onConfirm={handleNewBooking} bookings={bookings} settings={(() => {
            const sched = (settings.weekSchedule || []).filter(d => d.start != null);
            const eStart = sched.length ? Math.min(settings.workStart, ...sched.map(d=>d.start)) : settings.workStart;
            const eEnd   = sched.length ? Math.max(settings.workEnd,   ...sched.map(d=>d.end ?? settings.workEnd)) : settings.workEnd;
            return {...settings, workStart: eStart, workEnd: eEnd};
          })()}/>
      </div>
    </>
  );
}

export { ScheduleView, SettingsView };
