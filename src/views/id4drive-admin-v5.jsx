import { useState, useRef, useEffect, useLayoutEffect, useMemo, useContext } from "react";
import { createPortal } from "react-dom";
import { update, get, onValue, off, remove, push as fbPush, increment } from "firebase/database";
import { iRef, auth } from "../firebase";

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
  { id:"indigo", name:"Індиго",    color:"#818cf8" },
  { id:"lime",   name:"Лайм",      color:"#a3e635" },
];

// 50 рівномірно розподілених відтінків для кольорів учнів (по колу відтінків,
// фіксовані насиченість/яскравість під темну тему) — з таким запасом кольори
// НЕ повторюються, поки одночасно активних учнів менше 50.
const STUDENT_PALETTE = Array.from({ length: 50 }, (_, i) => `hsl(${Math.round(i * 360 / 50)},68%,56%)`);

// Мітки на записі — фіксований список, обираються в модалці бронювання.
// "exam"/"first"/"debt" також можуть виставлятись автоматично (див. getAutoTag) —
// але лише поки інструктор жодного разу не чіпав мітку цього запису вручну.
const TAG_PRESETS = [
  { id:"exam",   icon:"🚨", label:"Іспит",     color: RED },
  { id:"check",  icon:"🔍", label:"Перевірка", color: TEAL },
  { id:"first",  icon:"⭐", label:"1-й урок",  color: BLUE },
  { id:"debt",   icon:"💸", label:"Борг",      color: GOLD },
  { id:"repeat", icon:"🔁", label:"Повтор",    color: GREEN },
];
// Автотег за порядковим номером запису учня (серед усіх нескасованих, включно з майбутніми)
const AUTO_TAG_BY_ORDER = { 1: "first", 20: "check", 40: "exam" };

// Медалі за урок — присвоюються прямо в модалці бронювання (прив'язані до booking.id)
const BADGE_PRESETS = [
  { icon:"🏅", label:"Молодець" },
  { icon:"🥇", label:"Найкращий учень" },
  { icon:"⭐", label:"Відмінна їзда" },
  { icon:"🎯", label:"Точне паркування" },
  { icon:"🚦", label:"Знавець ПДР" },
  { icon:"🏆", label:"Готовий до іспиту" },
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
    4px 4px 9px rgba(${SHADE},0.5),
    -3px -3px 8px rgba(${GLOW},0.28);
}
.slot-pending-ring {
  animation: pulse-ring 2s infinite;
}
@keyframes pulse-ring {
  0%,100% { box-shadow: 4px 4px 9px rgba(${SHADE},0.5), -3px -3px 8px rgba(${GLOW},0.28), 0 0 0 0 rgba(255,90,60,0.6); }
  50%     { box-shadow: 4px 4px 9px rgba(${SHADE},0.5), -3px -3px 8px rgba(${GLOW},0.28), 0 0 0 6px rgba(255,90,60,0); }
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
.schedule-scroll::-webkit-scrollbar { display: none; }
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
const _MLABELS_FULL = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
const getDayInfo = (offsetFromToday) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetFromToday);
  const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  return { num: d.getDate(), month: _MLABELS[d.getMonth()], monthFull: _MLABELS_FULL[d.getMonth()], year: d.getFullYear(), label: _DLABELS[dow], fullLabel: _DLABELS_FULL[dow], wk: dow >= 5 };
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
  lockPastBookings: false, // заборонити редагувати/переносити/скасовувати минулі записи (вони підсвічуються тьмяніше)
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
  // push
  slotFreedPushEnabled: true, // пуш усім учням, коли слот у найближчі 10 днів звільняється
  // restrictions
  studentCanReschedule: true,
  studentCanCancel: true,
  bookCutoffHours: 2,       // min hours before slot for booking
  calendarOpenDays: 30,     // how many days ahead visible to private-lesson students
  schoolCalendarOpenDays: 14, // how many days ahead visible to school (автошкола) students
  slotGenDays: 30,          // how many days ahead the "generate slots" button auto-fills
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
// BROADCAST MODAL — ручна розсилка повідомлень учням
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
      await fbPush(iRef( "push_tasks"), { date, slots: slotsArr, comment: comment || null, createdAt: Date.now(), status: "pending" });
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
            position:"relative",
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
          <button onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
            background:"rgba(239,68,68,0.18)", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}>✕</button>

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
// MONTH CALENDAR SHEET — bottom-sheet monthly overview, tap a day to jump
// ═══════════════════════════════════════════════════════════════
function MonthCalendarSheet({ bookings, onClose, onPickDate }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, TEXT, DIM, FAINT, GOLD, GREEN, BLUE, RED } = useContext(ThemeContext);
  const { glow, shade, ink } = useFX();
  const isLight = BG_DEEP !== "#161719";
  const [closing, setClosing] = useState(false);
  const today0 = useRef((() => { const d = new Date(); d.setHours(12,0,0,0); return d; })()).current;
  const [viewY, setViewY] = useState(today0.getFullYear());
  const [viewM, setViewM] = useState(today0.getMonth());
  const [slideDir, setSlideDir] = useState(0);

  // Закриття покладається на onAnimationEnd — якщо CSS-подія з якоїсь
  // причини не спрацює (напр. вимкнена анімація у WebView), напівпрозорий
  // оверлей (zIndex 200, на весь екран) лишиться "приклеєним" і глушитиме
  // тапи по всій сторінці, включно з кнопкою відкриття цієї ж модалки.
  // Форсуємо закриття через таймер незалежно від animationend.
  const closeTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);
  const close = () => {
    setClosing(true);
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(onClose, 320);
  };

  // Мапа день → сумарні хвилини уроків (не кількість записів — щоб два
  // двогодинні уроки рахувались як 4 год, а не як "2").
  const counts = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") continue;
      const d = new Date(today0); d.setDate(d.getDate() + b.day);
      if (d.getFullYear() === viewY && d.getMonth() === viewM) {
        map[d.getDate()] = (map[d.getDate()] || 0) + (b.durMin || 60);
      }
    }
    return map;
  }, [bookings, viewY, viewM, today0]);

  const firstDow = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const monthLabel = new Date(viewY, viewM, 1).toLocaleDateString("uk-UA", { month: "long", year: "numeric" }).replace(/\s*р\.?$/i, "");
  const isCurMonth = viewY === today0.getFullYear() && viewM === today0.getMonth();

  const touchRef = useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => { const t = e.touches[0]; touchRef.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) goMonth(dx < 0 ? 1 : -1);
  };

  const tierColor = (n) => {
    if (n <= 3) return RED;
    if (n <= 6) return GOLD;
    return GREEN;
  };

  const goMonth = (delta) => {
    let m = viewM + delta, y = viewY;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setSlideDir(delta);
    setViewM(m); setViewY(y);
  };

  const pick = (day) => {
    const dateStr = `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onPickDate(dateStr);
    close();
  };

  const [heldDay, setHeldDay] = useState(null);
  const [heldClosing, setHeldClosing] = useState(false);
  const holdTimerRef = useRef(null);
  const heldRef = useRef(false);

  const getDayBookings = (d) => bookings
    .filter(b => {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") return false;
      const dt = new Date(today0); dt.setDate(dt.getDate() + b.day);
      return dt.getFullYear() === viewY && dt.getMonth() === viewM && dt.getDate() === d;
    })
    .sort((a, b) => (a.startMin || 0) - (b.startMin || 0));

  const startHold = (d) => {
    clearTimeout(holdTimerRef.current);
    heldRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      heldRef.current = true;
      setHeldDay(d);
    }, 400);
  };
  const endHold = () => {
    clearTimeout(holdTimerRef.current);
    if (heldRef.current) {
      setHeldClosing(true);
      setTimeout(() => { setHeldDay(null); setHeldClosing(false); heldRef.current = false; }, 180);
    }
  };

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Портал у document.body — шторка не повинна залежати від того, чи
  // якийсь предок (сторінка, вкладка, обгортка) має transform/filter/
  // will-change: будь-який з них перетворює predka на containing block
  // для position:fixed, і шторка тоді "прилипає" до скрол-контейнера
  // замість вікна (двічі вже ловили цей клас багів у різних предках).
  return createPortal(
    <>
      <style>{`
        @keyframes _mc-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _mc-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _mc-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _mc-bg-out{from{opacity:1}to{opacity:0}}
        @keyframes _mc-slide-next{from{transform:translateX(28px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes _mc-slide-prev{from{transform:translateX(-28px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes _mc-glass-in{
          from{ transform:translateX(var(--tx)) scale(.7); opacity:0; box-shadow:0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.35); }
          to{ transform:translateX(var(--tx)) scale(1); opacity:1; box-shadow:0 0 0 1.5px var(--glow-c), 0 0 22px var(--glow-soft), 0 10px 30px rgba(0,0,0,0.5); }
        }
        @keyframes _mc-glass-out{
          from{ transform:translateX(var(--tx)) scale(1); opacity:1; box-shadow:0 0 0 1.5px var(--glow-c), 0 0 22px var(--glow-soft), 0 10px 30px rgba(0,0,0,0.5); }
          to{ transform:translateX(var(--tx)) scale(.82); opacity:0; box-shadow:0 0 0 1px rgba(255,255,255,0.04), 0 4px 14px rgba(0,0,0,0.3); }
        }
      `}</style>
      <div onClick={closing ? undefined : close} style={{
        position:"fixed", inset:0, zIndex:200, background:shade(0.55),
        display:"flex", alignItems:"flex-end", justifyContent:"center",
        backdropFilter:"blur(8px)",
        pointerEvents: closing ? "none" : undefined,
        animation: closing ? `_mc-bg-out 0.26s ease-in forwards` : `_mc-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? onClose : undefined}
          style={{
            position:"relative", width:"100%", maxWidth:480,
            background:`radial-gradient(130% 90% at 50% 0%, color-mix(in srgb, ${BLUE} 22%, transparent), transparent 60%), ${BG}`,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.08)}, 0 -16px 60px ${shade(0.8)}`,
            display:"flex", flexDirection:"column", overflow:"hidden",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_mc-down 0.26s ease-in forwards` : `_mc-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
            paddingBottom:"env(safe-area-inset-bottom, 0px)",
          }}>
          <button onClick={close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
            background:"rgba(239,68,68,0.18)", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}>✕</button>

          <div style={{padding:"14px 16px 6px"}} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div style={{width:38, height:4, borderRadius:2, background:ink(0.1), margin:"0 auto 14px"}}/>
            <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap:14, marginBottom:14}}>
              <button onClick={()=>goMonth(-1)} style={{
                width:30, height:30, borderRadius:9, border:"none", cursor:"pointer",
                background:ink(0.06), color:TEXT, fontSize:16, fontWeight:800,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>‹</button>
              <div style={{fontSize:15, fontWeight:800, color:TEXT, textTransform:"capitalize", minWidth:150, textAlign:"center"}}>{monthLabel}</div>
              <button onClick={()=>goMonth(1)} style={{
                width:30, height:30, borderRadius:9, border:"none", cursor:"pointer",
                background:ink(0.06), color:TEXT, fontSize:16, fontWeight:800,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>›</button>
            </div>

            <div key={`${viewY}-${viewM}`} style={{
              animation: slideDir > 0 ? `_mc-slide-next 0.22s ease-out` : slideDir < 0 ? `_mc-slide-prev 0.22s ease-out` : "none",
            }}>
              <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6}}>
                {["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].map(wd => (
                  <div key={wd} style={{fontSize:9, fontWeight:700, color:FAINT, textAlign:"center", textTransform:"uppercase"}}>{wd}</div>
                ))}
              </div>

              <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, paddingBottom:20}}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={`e${i}`}/>;
                  const n = (counts[d] || 0) / 60; // години
                  const c = tierColor(n);
                  const t = Math.min(n, 8) / 8;
                  const fillH = Math.round(t * 100);
                  const isToday = isCurMonth && d === today0.getDate();
                  const isHeld = heldDay === d;
                  const row = Math.floor(i / 7);
                  const openUp = row > 0;
                  const col = i % 7;
                  const alignLeft = col <= 1;
                  const alignRight = col >= 5;
                  const horiz = alignLeft ? { left: 0 } : alignRight ? { right: 0 } : { left: "50%" };
                  const tx = alignLeft || alignRight ? "0%" : "-50%";
                  const hAlign = alignLeft ? "left" : alignRight ? "right" : "center";
                  return (
                    <div key={d} style={{position:"relative"}}>
                      <button
                        onClick={()=>{ if (!heldRef.current) pick(d); }}
                        onPointerDown={()=>startHold(d)}
                        onPointerUp={endHold}
                        onPointerLeave={endHold}
                        onPointerCancel={endHold}
                        style={{
                          width:"100%", aspectRatio:"1", borderRadius:9, border:"none", cursor:"pointer",
                          background: ink(0.04),
                          boxShadow: isToday ? `inset 0 0 0 1.4px ${GOLD}` : "none",
                          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                          fontSize:12, fontWeight:800, color:TEXT,
                          position:"relative", overflow:"hidden", zIndex: isHeld ? 30 : 1,
                          transform: isHeld ? "scale(1.18)" : "scale(1)",
                          transition:"transform .18s ease",
                          WebkitUserSelect:"none", userSelect:"none", touchAction:"manipulation",
                        }}>
                        {n > 0 && (
                          <div style={{
                            position:"absolute", bottom:0, left:0, right:0, height:`${fillH}%`,
                            background:`linear-gradient(0deg, color-mix(in srgb, ${c} 55%, transparent), color-mix(in srgb, ${c} 22%, transparent))`,
                          }}/>
                        )}
                        <span style={{position:"relative", zIndex:1}}>{d}</span>
                        {n > 0 && <span style={{position:"relative", zIndex:1, fontSize:7, fontWeight:700, opacity:0.75, marginTop:1}}>{Number.isInteger(n) ? n : n.toFixed(1)}г</span>}
                      </button>
                      {isHeld && (
                        <div style={{
                          position:"absolute", ...horiz, [openUp ? "bottom" : "top"]:"calc(100% + 16px)",
                          transformOrigin: `${openUp ? "bottom" : "top"} ${hAlign}`,
                          zIndex:31, width:210, maxWidth:"72vw",
                          background:`color-mix(in srgb, ${SURF_HI} 68%, transparent)`,
                          backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
                          borderRadius:14,
                          padding:"13px 14px", pointerEvents:"none",
                          "--glow-c": c, "--glow-soft": `color-mix(in srgb, ${c} 45%, transparent)`, "--tx": tx,
                          animation: heldClosing ? `_mc-glass-out 0.24s ease-in forwards` : `_mc-glass-in 0.4s cubic-bezier(0.25,1,0.4,1) forwards`,
                        }}>
                          <div style={{fontSize:13, fontWeight:800, color:TEXT, marginBottom:6}}>
                            {d} {monthLabel.split(" ")[0]}
                          </div>
                          {(() => {
                            const list = getDayBookings(d);
                            if (!list.length) return <div style={{fontSize:11.5, color:DIM}}>Немає записів</div>;
                            return list.slice(0, 6).map((b, idx) => (
                              <div key={b.id || idx} style={{fontSize:11.5, color:TEXT, lineHeight:1.65, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                                <span style={{color:DIM, fontWeight:700}}>{fmtTime(b.startMin)}</span> {b.name || "Подія"}
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  , document.body);
}

// ═══════════════════════════════════════════════════════════════
// DAY NOTES MODAL — нотатка дня: вибір годин + текст
// ═══════════════════════════════════════════════════════════════
const _fmtHM = (min) => `${String(Math.floor(min/60)).padStart(2,"0")}:${String(min%60).padStart(2,"0")}`;

function DayNotesModal({ dateStr, dayLabel, dayNum, dayMonth, note, settings, onClose }) {
  const { BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, SO, SI } = useContext(ThemeContext);
  const { glow, shade } = useFX();
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingHour, setEditingHour] = useState(null);
  const _close = () => setClosing(true);

  const hours = [];
  for (let h = settings.workStart; h < settings.workEnd; h++) hours.push(h);

  const [rows, setRows] = useState(() => {
    const saved = note?.notes || {};
    const init = {};
    hours.forEach(h => {
      const s = saved[h];
      init[h] = s ? { startMin: s.startMin, text: s.text || "", notify: !!s.notify } : { startMin: h*60, text: "", notify: false };
    });
    return init;
  });

  const clampMin = (m) => Math.max(settings.workStart*60, Math.min(settings.workEnd*60 - 1, m));
  const setRow = (h, patch) => setRows(rs => ({ ...rs, [h]: { ...rs[h], ...patch } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const notesOut = {};
      hours.forEach(h => {
        const r = rows[h];
        if (r.text.trim() || r.notify) {
          notesOut[h] = { startMin: r.startMin, text: r.text.trim(), notify: r.notify };
        }
      });
      if (!Object.keys(notesOut).length) {
        await remove(iRef( `dayNotes/${dateStr}`));
      } else {
        await update(iRef( `dayNotes/${dateStr}`), { notes: notesOut, updatedAt: Date.now() });
      }
      _close();
    } catch (e) { /* ignore */ } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try { await remove(iRef( `dayNotes/${dateStr}`)); _close(); }
    catch (e) { /* ignore */ } finally { setSaving(false); }
  };

  const hasAnyNote = !!note;

  return (
    <>
      <style>{`
        @keyframes _dn-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _dn-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _dn-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _dn-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed", inset:0, zIndex:9999,
        background:shade(0.55), backdropFilter:"blur(8px)",
        display:"flex", alignItems:"flex-end", justifyContent:"center",
        animation: closing ? `_dn-bg-out 0.26s ease-in forwards` : `_dn-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            width:"100%", maxWidth:480, background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${GOLD}33, 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh", overflowY:"auto",
            padding:"12px 16px calc(20px + env(safe-area-inset-bottom))",
            boxSizing:"border-box",
            animation: closing ? `_dn-down 0.26s ease-in forwards` : `_dn-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <div style={{width:36,height:4,borderRadius:2,background:glow(0.15),margin:"0 auto 12px"}}/>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:800,color:TEXT}}>📝 Нотатки — {dayLabel}, {dayNum} {dayMonth}</div>
            <div onClick={_close} style={{
              width:26,height:26,borderRadius:8,background:"rgba(239,68,68,0.18)",
              display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",color:"#ef4444",fontSize:13,fontWeight:800,flexShrink:0,
            }}>✕</div>
          </div>
          <div style={{fontSize:10.5,color:DIM,marginBottom:12,lineHeight:1.4}}>
            Тап на час — обрати точний інтервал у межах години. Дзвіночок — увімкнути пуш-нагадування.
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
            {hours.map(h=>{
              const r = rows[h];
              const isEditing = editingHour === h;
              return (
                <div key={h} style={{display:"flex",alignItems:"center",gap:8}}>
                  {isEditing ? (
                    <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                      <button onClick={()=>setRow(h,{startMin:clampMin(r.startMin-60)})} style={{
                        width:18,height:22,borderRadius:5,border:"none",cursor:"pointer",fontFamily:"inherit",
                        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:12,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0,
                      }}>−</button>
                      <div style={{width:24,textAlign:"center",fontSize:11,fontWeight:800,color:TEXT,fontVariantNumeric:"tabular-nums"}}>
                        {String(Math.floor(r.startMin/60)).padStart(2,"0")}
                      </div>
                      <button onClick={()=>setRow(h,{startMin:clampMin(r.startMin+60)})} style={{
                        width:18,height:22,borderRadius:5,border:"none",cursor:"pointer",fontFamily:"inherit",
                        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:12,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0,
                      }}>+</button>
                      <span style={{color:FAINT,fontSize:10}}>:</span>
                      <button onClick={()=>setRow(h,{startMin:clampMin(r.startMin-1)})} style={{
                        width:18,height:22,borderRadius:5,border:"none",cursor:"pointer",fontFamily:"inherit",
                        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:12,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0,
                      }}>−</button>
                      <div style={{width:24,textAlign:"center",fontSize:11,fontWeight:800,color:TEXT,fontVariantNumeric:"tabular-nums"}}>
                        {String(r.startMin%60).padStart(2,"0")}
                      </div>
                      <button onClick={()=>setRow(h,{startMin:clampMin(r.startMin+1)})} style={{
                        width:18,height:22,borderRadius:5,border:"none",cursor:"pointer",fontFamily:"inherit",
                        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:12,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0,
                      }}>+</button>
                      <div onClick={()=>setEditingHour(null)} style={{
                        width:22,height:22,borderRadius:6,background:`${GOLD}33`,color:GOLD,
                        display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11,fontWeight:800,flexShrink:0,marginLeft:2,
                      }}>✓</div>
                    </div>
                  ) : (
                    <div onClick={()=>setEditingHour(h)} style={{
                      width:44, flexShrink:0, cursor:"pointer", fontSize:10.5, fontWeight:800, color:GOLD,
                      fontVariantNumeric:"tabular-nums", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
                    }}>{_fmtHM(r.startMin)}</div>
                  )}
                  <input value={r.text} onChange={e=>setRow(h,{text:e.target.value})} placeholder="—"
                    style={{
                      flex:1, minWidth:0, boxSizing:"border-box",
                      background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,
                      border:`1px solid ${BORDER}`, outline:"none", color:TEXT, fontSize:12,
                      padding:"7px 9px", borderRadius:8, boxShadow:SI, fontFamily:"inherit",
                    }}/>
                  <div onClick={()=>setRow(h,{notify:!r.notify})} title={r.notify?"Нагадування увімкнено":"Нагадування вимкнено"} style={{
                    width:26, height:26, borderRadius:8, flexShrink:0, cursor:"pointer",
                    background: r.notify ? `${GOLD}2a` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,
                    boxShadow: r.notify ? "none" : SO,
                  }}>{r.notify ? "🔔" : "🔕"}</div>
                </div>
              );
            })}
          </div>

          <div style={{display:"flex",gap:8}}>
            {hasAnyNote && (
              <button onClick={handleDelete} disabled={saving} style={{
                flex:1, padding:"11px", borderRadius:12, border:"1px solid rgba(239,68,68,0.25)",
                cursor:"pointer", background:"rgba(239,68,68,0.08)", color:"#fca5a5",
                fontSize:13, fontWeight:700, fontFamily:"inherit",
              }}>Видалити всі</button>
            )}
            <button onClick={handleSave} disabled={saving} style={{
              flex:2, padding:"11px", borderRadius:12, border:"none", cursor:"pointer",
              background:`linear-gradient(145deg,${GOLD}cc,${GOLD}88)`, color:"#1a1a1a",
              fontSize:13, fontWeight:800, fontFamily:"inherit", boxShadow:SO,
            }}>{saving ? "Збереження…" : "Зберегти"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE VIEW with drag/resize + pinch-to-zoom + day-count
// ═══════════════════════════════════════════════════════════════
function ScheduleView({ settings, setSettings, onSlotClick, onEmptySlotClick, bookings, setBookings, activeDragIds, navTo, slotExistsRef, openSlotsRef, jumpTarget, setJumpTarget, onViewStudent }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, BLUE, GREEN, RED, SO, SI, STRIPE_A, STRIPE_B, GLOW, SHADE, INK } = useContext(ThemeContext);
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
  const [showMonthCal, setShowMonthCal] = useState(false);
  // Лічильник, а не просто boolean — при кожному тапі на кнопку календар
  // монтується заново (key змінюється), навіть якщо попередній стан
  // технічно ще "відкрито" (напр. учень прогорнув сторінку і календар
  // візуально загубився). Тап завжди гарантовано відкриває свіжу шторку.
  const [calOpenKey, setCalOpenKey] = useState(0);
  const openMonthCal = () => { setCalOpenKey(k => k + 1); setShowMonthCal(true); };
  const [keyPortalEl, setKeyPortalEl] = useState(null);
  useEffect(() => { setKeyPortalEl(document.getElementById('topbar-key-portal')); }, []);

  // Лінія поточного часу в сітці розкладу (тільки в колонці сьогодні) — оновлюємо раз на хвилину
  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours()*60 + n.getMinutes(); });
  useEffect(() => {
    const timer = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours()*60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const [dragId, setDragId] = useState(null);
  const [holdId, setHoldId] = useState(null);
  const [quickCancelId, setQuickCancelId] = useState(null);
  const quickCancelRef = useRef(null);
  const [cancellingSet, setCancellingSet] = useState(new Set());
  const cancelTimers = useRef({});
  // Кумулятивні години учня на момент кожного уроку (для кружечка № уроку в слоті)
  const cumulativeHoursMap = useMemo(() => {
    const byUser = {};
    for (const b of bookings) {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") continue;
      if (!b.userId) continue;
      (byUser[b.userId] ||= []).push(b);
    }
    const map = {};
    Object.values(byUser).forEach(list => {
      list.sort((a, b2) => a.day - b2.day || a.startMin - b2.startMin);
      let sum = 0;
      for (const b of list) {
        sum += (b.durMin || 60) / 60;
        map[b.id] = Math.round(sum);
      }
    });
    return map;
  }, [bookings]);
  // Порядковий номер запису учня серед УСІХ його нескасованих записів (включно
  // з майбутніми) — основа для автоматичних міток (1-й урок / перевірка / іспит).
  const studentOrderMap = useMemo(() => {
    const byStudent = {};
    for (const b of bookings) {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") continue;
      if (b.status === "cancelled") continue;
      const key = b.userId || b.phone;
      if (!key) continue;
      (byStudent[key] ||= []).push(b);
    }
    const map = {};
    Object.values(byStudent).forEach(list => {
      list.sort((a, b2) => a.day - b2.day || a.startMin - b2.startMin);
      list.forEach((b, i) => { map[b.id] = i + 1; });
    });
    return map;
  }, [bookings]);
  // Автоматична мітка — лише поки інструктор жодного разу не чіпав мітку цього
  // запису вручну (booking.tagManual); ручний вибір/зняття завжди має пріоритет.
  const getAutoTag = (b) => {
    if (b.debtAmount > 0) return "debt";
    return AUTO_TAG_BY_ORDER[studentOrderMap[b.id]] || null;
  };
  const effectiveTag = (b) => (b.tagManual ? (b.tag || null) : (b.tag || getAutoTag(b)));
  // Сусідні записи одного учня раніше об'єднувались в одну картку — вимкнено
  // на прямий запит: кожен запис тепер своя окрема картка (можна тягати й
  // ресайзити кожну годину окремо). Дані в Firebase й завжди були окремими
  // записами, тут міняється лише відображення.
  const mergeInfoMap = {};
  const [windowW, setWindowW] = useState(window.innerWidth);
  const [windowH, setWindowH] = useState(window.innerHeight);
  const PAST_DAYS = 365;
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
  const momentumRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const handleActionRef = useRef(null);
  const gridWrapRef = useRef(null);

  // Один запис scrollLeft/scrollTop за кадр замість запису на кожен pointermove.
  // pointermove на деяких пристроях (120Hz+ тачскрини) спрацьовує частіше за
  // рендер екрана — прямий запис у DOM на кожну подію змушує браузер рахувати
  // layout частіше, ніж він фізично може намалювати, і рух виглядає менш
  // плавним за нативний скрол (той керується композитором, без цього завалу).
  // Ця петля просто застосовує ОСТАННЄ обчислене значення раз на кадр.
  useEffect(() => {
    let raf;
    const apply = () => {
      const p = pendingScrollRef.current;
      if (p && gridRef.current) {
        if (p.axis === "x") gridRef.current.scrollLeft = p.value;
        else gridRef.current.scrollTop = p.value;
        pendingScrollRef.current = null;
      }
      raf = requestAnimationFrame(apply);
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, []);
  const vRangeRef   = useRef({ s: Math.max(0, PAST_DAYS - VBUF), e: PAST_DAYS + 30 });
  const [vRange, setVRange] = useState({ s: Math.max(0, PAST_DAYS - VBUF), e: PAST_DAYS + 30 });
  // Реально видимий діапазон днів (без буфера VBUF) — для авто-висоти годин.
  const visDayRangeRef = useRef({ s: PAST_DAYS, e: PAST_DAYS + 30 });
  const [visDayRange, setVisDayRange] = useState(visDayRangeRef.current);
  // Час першого запису, до якого треба проскролити після перерахунку
  // авто-висоти — щоб усі записи були видно одразу, без ручного скролу.
  const autoScrollToMinRef = useRef(null);
  const xVisibleRef = useRef(false);
  const xJustShownRef = useRef(false);
  const snapTimerRef = useRef(null);
  const timeColRef = useRef(null);
  const [pinch, setPinch] = useState(null);
  const [shineId, setShineId] = useState(null);
  const slotHoldTimerRef = useRef(null);
  const slotHoldFiredRef = useRef(false);
  const slotPressRef = useRef(null); // { dateStr, time, slot, startY, lastY } — до озброєння drag довгим тапом
  const slotClaimedRef = useRef(false); // дотик уже "заявлений" дочірнім вільним слотом — батьківський порожній фон не має відкривати своє меню "новий слот"
  const freeDragRef = useRef(null); // { dateStr, time, slot, startClientY, startMin, moved, newStart }
  const [freeDragPreview, setFreeDragPreview] = useState(null); // { dateStr, time, newStart }
  const resizeHoldTimerRef = useRef(null);
  const resizeHoldPosRef = useRef(null); // { startY, lastY } — до озброєння resize довгим тапом
  const freeResizeRef = useRef(null); // { dateStr, time, startClientY, startDur, maxDur, moved, newDur }
  const [freeResizePreview, setFreeResizePreview] = useState(null); // { dateStr, time, newDur }
  const [openSlots, setOpenSlots] = useState({}); // { "2025-06-01": ["07:00","08:00",...] }
  const [viewingSlots, setViewingSlots] = useState({});
  const pendingSlotSnapRef = useRef(null);
  const pendingSlotSnapTimerRef = useRef(null);
  const [genLoadingDays, setGenLoadingDays] = useState(new Set());
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [queueMap, setQueueMap] = useState({}); // { "YYYY-MM-DD_HH:MM": count }

  useEffect(() => {
    const r = iRef( "queue");
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
    const r = iRef( "dayNotes");
    const unsub = onValue(r, snap => setDayNotes(snap.val() || {}));
    return () => unsub();
  }, []);

  useEffect(() => {
    const r = iRef( "timeslots");
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
            // phantom-вузли (створені лише під запис) не належать сітці дня
            if (!slot.phantom) slotSet.add(slotTime);
            if (slot.available !== false || slot.adminBlocked || slot.vipOnly || slot.privateOnly || slot.surcharge || slot.fixedPrice) {
              slotMap[slotTime] = { available: slot.available !== false, adminBlocked: !!slot.adminBlocked, vipOnly: !!slot.vipOnly, privateOnly: !!slot.privateOnly, surcharge: slot.surcharge || null, fixedPrice: slot.fixedPrice || null, durMin: slot.durMin || 60 };
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
        // Запобіжник: якщо activeDragIds "зависне" непорожнім (застарілий id, що
        // ніколи не видалився — напр. після швидкого дотику одразу до двох
        // записів), відкладене оновлення слотів інакше НІКОЛИ не застосується,
        // і новостворені/розблоковані слоти (ключик, тап на день) не з'являлись
        // би, доки не перезайти в застосунок. Форсуємо застосування через 1.5с,
        // навіть якщо drag формально ще "активний".
        clearTimeout(pendingSlotSnapTimerRef.current);
        pendingSlotSnapTimerRef.current = setTimeout(() => {
          if (!pendingSlotSnapRef.current) return;
          const { slots: s, viewing: v } = pendingSlotSnapRef.current;
          pendingSlotSnapRef.current = null;
          setOpenSlots(s);
          setViewingSlots(v);
        }, 1500);
      } else {
        clearTimeout(pendingSlotSnapTimerRef.current);
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
          const coveringBk = dayBk.find(b => b.startMin < sMin + (settings.snapMin || 30) && b.startMin + b.durMin > sMin);
          if (coveringBk) {
            const hh = String(h).padStart(2, "0");
            const mm = String(m).padStart(2, "0");
            upd[`timeslots/${date}/slot${hh}${mm}/available`] = false;
          }
        });
      });
      // Дозаповнюємо прапорець bookingStart для КОЖНОГО завантаженого запису —
      // true на реальному старті, false на кожному проміжному 30-хв маркері
      // (не лише true на старті!) — інакше проміжні маркери старих бронювань
      // лишались зовсім без прапорця (undefined) і клієнт однаково показував
      // їх окремо. Так старі бронювання (зроблені до появи цього прапорця)
      // отримують його повністю заднім числом при кожному перегляді дня, без
      // окремої міграції.
      Object.entries(bkByDate).forEach(([date, dayBk]) => {
        dayBk.forEach(b => {
          for (let cur = b.startMin; cur < b.startMin + b.durMin; cur += 30) {
            const hh = String(Math.floor(cur / 60)).padStart(2, "0");
            const mm = String(cur % 60).padStart(2, "0");
            upd[`timeslots/${date}/slot${hh}${mm}/bookingStart`] = cur === b.startMin;
          }
        });
      });
      if (Object.keys(upd).length) update(iRef(), upd).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [bookings, openSlots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returns {free, blocked} counts, or null if day is skipped
  const computeDayUpdates = (dateStr, existing, force = false, overridesParam) => {
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
    // Крок сітки — 1 година від старту робочого дня (мінімум годинний урок).
    // Якщо день починається на :30 (напр. 17:30), слоти йдуть 17:30, 18:30...
    // без проміжного 18:00 — тільки старти, розведені рівно на годину.
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
          // Слот поза згенерованою сіткою (запис за межами робочих годин) —
          // позначаємо phantom для довідки; при скасуванні все одно стає вільним.
          if (!(`timeslots/${dateStr}/${id}/available` in updates)) {
            updates[`timeslots/${dateStr}/${id}/phantom`] = true;
          }
          updates[`timeslots/${dateStr}/${id}/available`] = false;
          updates[`timeslots/${dateStr}/${id}/time`] = `${h}:${m}`;
          updates[`timeslots/${dateStr}/${id}/bookingStart`] = cur === b.startMin;
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
      await remove(iRef( `timeslots/${dateStr}`));
      const result = computeDayUpdates(dateStr, {}, true);
      if (result && Object.keys(result.updates).length) {
        await update(iRef(), result.updates);
      }
    } finally {
      setGenLoadingDays(s => { const ns = new Set(s); ns.delete(absDay); return ns; });
    }
  };

  const clearDaySlots = async (absDay) => {
    const dateStr = absDayToDateStr(absDay);
    setGenLoadingDays(s => new Set([...s, absDay]));
    try {
      // Прибираємо лише справді вільні (available:true) слоти — те, що
      // додав автозаповнення. Слоти, зайняті записом чи вручну заблоковані
      // адміном (available:false), не чіпаємо, щоб не "звільнити" зайнятий час.
      const snap = await get(iRef( `timeslots/${dateStr}`));
      const day = snap.val() || {};
      const upd = {};
      Object.entries(day).forEach(([slotId, slot]) => {
        if (slot?.available === true) upd[`timeslots/${dateStr}/${slotId}`] = null;
      });
      if (Object.keys(upd).length) await update(iRef(), upd);
    } finally {
      setGenLoadingDays(s => { const ns = new Set(s); ns.delete(absDay); return ns; });
    }
  };

  // Firebase RTDB відхиляє ОДИН update() з надто великою кількістю ключів
  // помилкою TOO_MANY_TRIGGERS, якщо на шляху висять Cloud Functions-тригери
  // (timeslots/{date}/{slotId} — onSlotFreed тощо): весь запис атомарно
  // відхиляється повністю, тому "Ключик" на великих slotGenDays міг генерувати
  // слоти, які одразу зникають (клієнт оптимістично показував їх, а сервер
  // відкидав весь запис). Розбиваємо на пачки — кожна пачка своя атомарна
  // транзакція, у межах ліміту тригерів.
  const CHUNK_SIZE = 400;
  const chunkedUpdate = async (updates) => {
    const entries = Object.entries(updates);
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      await update(iRef(), Object.fromEntries(entries.slice(i, i + CHUNK_SIZE)));
    }
  };
  // Видалення ЦІЛОГО дня (`timeslots/{date} = null`) прибирає одразу десятки
  // дочірніх слот-записів — на кожному з яких висить той самий Cloud Function
  // тригер. Один multi-path update() з N такими піддеревами зачіпає стільки ж
  // реальних записів, скільки й генерація, і так само може впертися у
  // TOO_MANY_TRIGGERS — рахувати треба кількість реальних записів під ключами,
  // а не кількість самих ключів. Тому видаляємо дні ПО ОДНОМУ послідовно.
  const clearDaysRange = async (limit) => {
    for (let d = 0; d <= limit; d++) {
      await remove(iRef( `timeslots/${absDayToDateStr(d)}`));
    }
  };

  const generateAllSlots = async () => {
    setIsGeneratingAll(true);
    try {
      const limit = settings.slotGenDays || 30;
      const allUpdates = {};
      // Clear timeslots for all active days first, then write fresh state
      await clearDaysRange(limit);
      // Now compute and write fresh slots (pass {} — no existing adminBlocked to preserve)
      // force НЕ передаємо: масова регенерація має поважати weekSchedule.enabled
      // (дні вихідного за тижневим шаблоном лишаються закритими). force=true —
      // тільки для generateDaySlots (явний клік по конкретному дню = ручний override).
      for (let d = 0; d <= limit; d++) {
        const dateStr = absDayToDateStr(d);
        const result = computeDayUpdates(dateStr, {});
        if (result) Object.assign(allUpdates, result.updates);
      }
      if (Object.keys(allUpdates).length) await chunkedUpdate(allUpdates);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  // Чи є вже згенеровані слоти в межах діапазону автовиставлення (для тумблера ключика)
  const hasAnyGeneratedSlots = () => {
    const limit = settings.slotGenDays || 30;
    for (let d = 0; d <= limit; d++) {
      const dateStr = absDayToDateStr(d);
      if (openSlots[dateStr] && Object.keys(openSlots[dateStr]).length) return true;
    }
    return false;
  };

  // Другий тап ключика — зняти всі згенеровані слоти назад
  const clearAllSlots = async () => {
    setIsGeneratingAll(true);
    try {
      const limit = settings.slotGenDays || 30;
      await clearDaysRange(limit);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  // Клік: вільний ↔ зайнятий (2 стани)
  // Цикл тапів по вільному слоту: вільний (зелений) → заблокований (червоний) → прибрати повністю.
  const toggleSlotFree = (dateStr, time, slot) => {
    const slotId = `slot${time.replace(":", "")}`;
    if (slot.adminBlocked) {
      update(iRef( `timeslots/${dateStr}/${slotId}`), { available: true, adminBlocked: false, time }).catch(() => {});
    } else {
      update(iRef( `timeslots/${dateStr}/${slotId}`), { available: false, adminBlocked: true, vipOnly: false, privateOnly: false, surcharge: null, time }).catch(() => {});
    }
  };

  // Повне видалення слота — прибирає запис із Firebase, комірка зникає з сітки
  const deleteSlot = (dateStr, time) => {
    const slotId = `slot${time.replace(":", "")}`;
    remove(iRef( `timeslots/${dateStr}/${slotId}`)).catch(() => {});
  };

  // Довгий тап: VIP, приватний, надбавка або скидання
  const applySlotOption = (dateStr, time, option) => {
    const slotId = `slot${time.replace(":", "")}`;
    const currentSlot = slotOptions?.slot || {};
    const isClosed = currentSlot.available === false;
    if (option === "vip") {
      if (isClosed) {
        // Закритий VIP — залишаємо закритим, додаємо VIP прапор
        update(iRef( `timeslots/${dateStr}/${slotId}`), { vipOnly: true }).catch(() => {});
      } else {
        update(iRef( `timeslots/${dateStr}/${slotId}`), { available: true, adminBlocked: false, vipOnly: true }).catch(() => {});
      }
    } else if (option === "private") {
      if (isClosed) {
        update(iRef( `timeslots/${dateStr}/${slotId}`), { privateOnly: true }).catch(() => {});
      } else {
        update(iRef( `timeslots/${dateStr}/${slotId}`), { available: true, adminBlocked: false, privateOnly: true }).catch(() => {});
      }
    } else if (option === "reset") {
      if (isClosed) {
        update(iRef( `timeslots/${dateStr}/${slotId}`), { vipOnly: false, privateOnly: false, surcharge: null, fixedPrice: null }).catch(() => {});
      } else {
        update(iRef( `timeslots/${dateStr}/${slotId}`), { available: true, adminBlocked: false, vipOnly: false, privateOnly: false, surcharge: null, fixedPrice: null }).catch(() => {});
      }
    } else if (option === "surcharge_remove") {
      update(iRef( `timeslots/${dateStr}/${slotId}`), { surcharge: null }).catch(() => {});
    } else if (option && typeof option === "object" && option.fixedPrice != null) {
      // Фіксована ціна повністю замінює тарифну — незалежна від VIP/Приватний слот,
      // тому не чіпаємо ці прапорці, лише available/adminBlocked за тим самим
      // патерном, що й VIP/Приватний слот.
      if (isClosed) {
        update(iRef( `timeslots/${dateStr}/${slotId}`), { fixedPrice: option.fixedPrice }).catch(() => {});
      } else {
        update(iRef( `timeslots/${dateStr}/${slotId}`), { available: true, adminBlocked: false, fixedPrice: option.fixedPrice }).catch(() => {});
      }
    } else if (option === "fixedPrice_remove") {
      update(iRef( `timeslots/${dateStr}/${slotId}`), { fixedPrice: null }).catch(() => {});
    } else {
      update(iRef( `timeslots/${dateStr}/${slotId}`), { surcharge: option }).catch(() => {});
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
    const vs = Math.max(0, firstVis);
    const ve = Math.min(nd - 1, lastVis);
    if (vs !== visDayRangeRef.current.s || ve !== visDayRangeRef.current.e) {
      visDayRangeRef.current = { s: vs, e: ve };
      setVisDayRange({ s: vs, e: ve });
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
  const dayClickTimerRef  = useRef(null);
  const dayLastClickRef   = useRef(null); // { absDay, time } — для розпізнавання подвійного тапу
  const [dayNotesModal, setDayNotesModal] = useState(null); // { dateStr, dayLabel, dayNum, dayMonth }
  const [dayNotes, setDayNotes] = useState({}); // { "YYYY-MM-DD": { hours:[9,10], text:"...", updatedAt } }
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
    const overrides = settings.dateOverrides || [];
    const existing  = overrides.find(o => o.date === dateStr);
    // Ефективний статус "закрито" має враховувати не лише явний override,
    // а й тижневий шаблон (weekSchedule.enabled / weekends) — інакше день,
    // вимкнений лише шаблоном (напр. неділя за замовчуванням), на перший
    // дубль-тап помилково йшов гілкою "закрити" (без override це no-op:
    // слотів і так немає), і реально відкривався лише з другого разу.
    const dow = (new Date(dateStr + "T12:00:00").getDay() + 6) % 7;
    const ws  = (settings.weekSchedule || [])[dow] || {};
    const templateClosed = ws.enabled === false || (!ws.start && (settings.weekends || []).includes(dow));
    const wasClosed = existing ? existing.type === 'closed' : templateClosed;
    const newOverrides = wasClosed
      ? (!existing && templateClosed
          // Відкриваємо шаблонно-закритий день без override — фіксуємо явний
          // "custom" override, інакше подальша масова регенерація (force=false)
          // знову закриє день за шаблоном.
          ? [...overrides.filter(o => o.date !== dateStr), { date: dateStr, type: 'custom' }]
          : overrides.filter(o => o.date !== dateStr))
      : [...overrides.filter(o => o.date !== dateStr), { date: dateStr, type: 'closed' }];
    setSettings(s => ({ ...s, dateOverrides: newOverrides }));
    if (wasClosed) {
      // Відкриваємо день — перегенеровуємо слоти за поточним розкладом.
      const result = computeDayUpdates(dateStr, {}, true, newOverrides);
      if (result && Object.keys(result.updates).length) update(iRef(), result.updates).catch(()=>{});
    } else {
      // Закриваємо день — прибираємо вже згенеровані слоти. Інакше стара
      // сітка (available:true) лишається в Firebase і день і далі показує
      // "відкриті" слоти та їх видно клієнту, попри позначку "закрито".
      remove(iRef( `timeslots/${dateStr}`)).catch(()=>{});
    }
  };

  // Shine glint animation — one booking at a time, random, every 3s
  const bookingsRef = useRef(bookings);
  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);
  useEffect(() => { setBookingsRef.current = setBookings; }, [setBookings]);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
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

  // Deep-link з push-сповіщення: прокрутити до дати/запису та підсвітити
  useEffect(() => {
    if (!jumpTarget?.date) return;
    const el = gridRef.current;
    const cw = calcRef.current.COL_W;
    if (!el || !cw) return;
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const absDay = Math.round((new Date(jumpTarget.date + "T12:00:00") - today) / 86400000);
    el.scrollTo({ left: Math.max(0, (PAST_DAYS + absDay) * (cw + 4)), behavior: "smooth" });
    const match = bookingsRef.current.find(b =>
      b.day === absDay &&
      (!jumpTarget.time || b.time === jumpTarget.time) &&
      (!jumpTarget.bookingId || b.id === jumpTarget.bookingId)
    );
    if (match) {
      setShineId(match.id);
      setTimeout(() => setShineId(id => id === match.id ? null : id), 3000);
    }
  }, [jumpTarget]);

  const TIME_COL_W = 44;
  const HEADER_H = 42;
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

  // Сигнатура часового діапазону видимих записів/слотів (не самих об'єктів) —
  // щоб авто-висота перераховувалась, коли з'являється запис ПІЗНІШЕ/РАНІШЕ
  // за вже порахований діапазон (інакше новий пізній запис "вилазив" за межі
  // екрана, доки користувач не проскролить дні туди-сюди). Зміна ціни/статусу
  // тощо на span не впливає — висота під час звичайного редагування не стрибає.
  const autoSpanKey = useMemo(() => {
    if (!settings.autoHourHeight) return null;
    const dayFrom = dayOffset + visDayRange.s;
    const dayTo   = dayOffset + visDayRange.e;
    let minStart = Infinity, maxEnd = -Infinity;
    bookings.forEach(b => {
      if (b.status === "cancelled") return;
      if (b.day < dayFrom || b.day > dayTo) return;
      minStart = Math.min(minStart, b.startMin);
      maxEnd   = Math.max(maxEnd, b.startMin + b.durMin);
    });
    for (let d = dayFrom; d <= dayTo; d++) {
      const daySlots = openSlots[absDayToDateStr(d)];
      if (!daySlots) continue;
      Object.entries(daySlots).forEach(([time, slot]) => {
        if (!slot.available) return;
        const [hh, mm] = time.split(':').map(Number);
        const sMin = hh * 60 + mm;
        minStart = Math.min(minStart, sMin);
        maxEnd   = Math.max(maxEnd, sMin + (slot.durMin || 60));
      });
    }
    return minStart === Infinity ? null : `${minStart}-${maxEnd}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, openSlots, dayOffset, visDayRange.s, visDayRange.e, settings.autoHourHeight]);

  // Авто-висота годин ("Авто" замість фіксованих 6/8/9/10/12): підлаштовуємо
  // hourHeightPx під діапазон "перший запис — останній запис" видимих днів
  // (6..16 годин). Рахуємо при зміні видимого діапазону днів (скрол) АБО
  // коли змінюється сам часовий діапазон записів (autoSpanKey) — напр. додали
  // пізній запис. Просте редагування (ціна/статус), що span не міняє, висоту
  // не перераховує — щоб вона не "стрибала" під час звичайної роботи.
  useEffect(() => {
    if (!settings.autoHourHeight) return;
    const dayFrom = dayOffset + visDayRange.s;
    const dayTo   = dayOffset + visDayRange.e;
    let minStart = Infinity, maxEnd = -Infinity;
    bookings.forEach(b => {
      if (b.status === "cancelled") return;
      if (b.day < dayFrom || b.day > dayTo) return;
      minStart = Math.min(minStart, b.startMin);
      maxEnd   = Math.max(maxEnd, b.startMin + b.durMin);
    });
    // Порожні (вільні, ще не заброньовані) слоти теж входять у діапазон —
    // "Авто" має показувати не лише зайняті години, а й доступні для запису.
    for (let d = dayFrom; d <= dayTo; d++) {
      const daySlots = openSlots[absDayToDateStr(d)];
      if (!daySlots) continue;
      Object.entries(daySlots).forEach(([time, slot]) => {
        if (!slot.available) return;
        const [hh, mm] = time.split(':').map(Number);
        const sMin = hh * 60 + mm;
        minStart = Math.min(minStart, sMin);
        maxEnd   = Math.max(maxEnd, sMin + (slot.durMin || 60));
      });
    }
    if (minStart === Infinity) return; // немає ні записів, ні слотів у видимому діапазоні — висоту не чіпаємо
    const spanHours = Math.ceil((maxEnd - minStart) / 60);
    const n = Math.max(6, Math.min(16, spanHours));
    const el = gridRef.current;
    if (!el) return;
    // availGridH (windowH - 156 - HEADER_H - 4) — лише ОЦІНКА видимої висоти
    // за розміром вікна; на реальному пристрої вона не завжди точно збігається
    // з фактичним контейнером (адресний рядок браузера, safe-area тощо), через
    // що записи то знизу, то зверху вилазили за межі екрана. Тому висоту рядка
    // рахуємо від РЕАЛЬНО виміряного el.clientHeight, а не від оцінки.
    // Реально виміряний offset до верху сітки годин (замість оцінкових
    // paddingTop+HEADER_H+marginBottom — на практиці лишався залишковий
    // здвиг у кілька px, накопичувався в помітну похибку).
    const timeCol = timeColRef.current;
    const headerOffsetReal = timeCol
      ? timeCol.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
      : (2 + HEADER_H + 10);
    const BOTTOM_BUFFER = 56; // місце під плашку суми дня знизу + запас на неточність вимірювання
    const usableH = Math.max(200, el.clientHeight - headerOffsetReal - BOTTOM_BUFFER);
    const autoPxPerMinBase = availGridH / totalMin; // той самий множник, що й у реальному PX_PER_MIN
    const targetHpx = Math.max(60, Math.round(usableH / (n * autoPxPerMinBase)));
    // Мета "Авто" — бачити ВСІ записи одразу, без ручного скролу (не просто
    // підібрати висоту рядка). Тому разом зі зміною hourHeightPx запам'ятовуємо
    // час першого запису — окремий ефект нижче проскролить до нього, коли
    // DOM вже перерахує розмітку під нову висоту.
    setSettings(s => {
      if (Math.abs((s.hourHeightPx || 60) - targetHpx) < 1) return s;
      autoScrollToMinRef.current = minStart;
      return { ...s, hourHeightPx: targetHpx };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visDayRange.s, visDayRange.e, settings.autoHourHeight, autoSpanKey]);

  // Прокрутка до першого запису — спрацьовує тільки після авто-перерахунку
  // висоти (autoScrollToMinRef виставляється лише вище), не після ручного
  // pinch-zoom чи кнопок 8/9/10/12.
  useLayoutEffect(() => {
    const targetMin = autoScrollToMinRef.current;
    if (targetMin == null) return;
    autoScrollToMinRef.current = null;
    const el = gridRef.current;
    if (!el) return;
    // minToPx рахує позицію ВІДНОСНО "SLOT CONTENT" (сітки годин), а
    // scrollTop — відносно всього скрольованого контейнера. Раніше офсет
    // між ними рахувався константами (paddingTop колонок + HEADER_H +
    // marginBottom) — теоретично правильно, але на практиці лишався
    // залишковий здвиг у кілька-кільканадцять px (сабпіксельні заокруглення,
    // тіні/бордери шапки тощо). Тому міряємо offset НАПРЯМУ з DOM: timeColRef
    // — це якраз елемент з top:0 у точці, де minToPx()=0.
    const timeCol = timeColRef.current;
    const gridOffsetTop = timeCol
      ? timeCol.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
      : (2 + HEADER_H + 10); // резервне значення, якщо ref ще не змонтований
    const y = gridOffsetTop + (targetMin - effectiveWorkStart * 60) * PX_PER_MIN;
    // Шапка дати "плаває" (position:sticky) поверх контенту під час скролу —
    // верхні HEADER_H px видимої області завжди перекриті нею. Тому відступ
    // зверху має бути не просто "трохи" (8px), а щонайменше HEADER_H, інакше
    // перший запис ховається під шапкою.
    el.scrollTop = Math.max(0, y - HEADER_H - 8);
  }, [settings.hourHeightPx]); // eslint-disable-line react-hooks/exhaustive-deps

  const minToPx = (m) => (m - effectiveWorkStart*60) * PX_PER_MIN;

  const onPointerDown = (e, b, mode) => {
    if (scheduleLocked) {
      // Замочок закритий — редагування заборонене, але дотик на записі/блоці все одно
      // мусить дозволяти свайп-гортання розкладу (не лише порожні ділянки сітки).
      e.stopPropagation();
      pendingDragRef.current = { id:b.id, startClientY:e.clientY, startClientX:e.clientX, locked:true };
      return;
    }
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
        // Швидкість пальця (px/ms, згладжена) — щоб на pointerup "докрутити" сітку
        // за інерцією замість миттєвої зупинки. Порожнє місце скролиться нативно
        // (браузер сам додає інерцію); картки уроків мають touch-action:none і
        // скролляться вручну через scrollLeft/scrollTop нижче — без цього трекінгу
        // ручний скрол зупинявся різко, на відміну від нативного.
        const _now = performance.now();
        if (swipeRef.current.lastT != null) {
          const _dt = _now - swipeRef.current.lastT;
          if (_dt > 0) {
            const rawVx = (e.clientX - swipeRef.current.lastX) / _dt;
            const rawVy = (e.clientY - swipeRef.current.lastY) / _dt;
            swipeRef.current.vx = (swipeRef.current.vx ?? 0) * 0.7 + rawVx * 0.3;
            swipeRef.current.vy = (swipeRef.current.vy ?? 0) * 0.7 + rawVy * 0.3;
          }
        }
        swipeRef.current.lastT = _now;
        swipeRef.current.lastX = e.clientX;
        swipeRef.current.lastY = e.clientY;
        swipeRef.current.endX = e.clientX;
        swipeRef.current.endY = e.clientY;
        if (!dragRef.current && !pendingDragRef.current && swipeRef.current.manualScroll && gridRef.current) {
          // Абсолютний розрахунок від "якоря" (позиція й scrollLeft/scrollTop
          // у момент, коли manualScroll щойно увімкнувся) — а не накопичення
          // через += по кожній крихітній dx/dy. При += будь-яка втрачена/
          // об'єднана подія pointermove назавжди "губить" частину відстані;
          // тут же кожна подія наново рахує ПОВНУ відстань від якоря, тож
          // рідкісні події не шкодять фінальному результату.
          if (swipeRef.current.scrollAnchorX == null) {
            swipeRef.current.scrollAnchorX = e.clientX;
            swipeRef.current.scrollAnchorY = e.clientY;
            swipeRef.current.scrollStartLeft = gridRef.current.scrollLeft;
            swipeRef.current.scrollStartTop = gridRef.current.scrollTop;
          }
          const totalDx = swipeRef.current.scrollAnchorX - e.clientX;
          const totalDy = swipeRef.current.scrollAnchorY - e.clientY;
          if (Math.abs(totalDx) >= Math.abs(totalDy)) {
            pendingScrollRef.current = { axis: "x", value: swipeRef.current.scrollStartLeft + totalDx };
          } else {
            pendingScrollRef.current = { axis: "y", value: swipeRef.current.scrollStartTop + totalDy };
          }
        }
      }
      if (pendingDragRef.current) {
        const pd = pendingDragRef.current;
        const dxTotal = e.clientX - pd.startClientX;
        const dyTotal = e.clientY - pd.startClientY;
        const moved = Math.hypot(dyTotal, dxTotal);
        // Замочок закритий — жодного drag/resize, дозволяємо лише гортання свайпом
        // (у будь-якому напрямку, бо конкуруючого "редагування" тут немає).
        if (pd.locked) {
          if (moved > 8) {
            pendingDragRef.current = null;
            if (swipeRef.current) swipeRef.current.manualScroll = true;
          }
          return;
        }
        // Явно горизонтальний свайп (гортання дня свайпом) — завжди перемикаємось на ручний
        // скрол сітки, незалежно від того, чи почався дотик на записі/блоці/ручці ресайзу.
        // Раніше блоки й ручки ресайзу взагалі не мали шляху до скролу — свайп по них
        // одразу активував drag/resize навіть при суто горизонтальному русі.
        if (moved > 10 && Math.abs(dxTotal) > Math.abs(dyTotal) * 1.7) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          pendingDragRef.current = null;
          resizeReadyRef.current = null;
          quickCancelRef.current = null;
          xVisibleRef.current = false;
          setQuickCancelId(null);
          setHoldId(null);
          if (swipeRef.current) swipeRef.current.manualScroll = true;
          return;
        }
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
            // Утримання вже спрацювало — рішучий горизонтальний свайп (не вертикальний,
            // той лишається за drag/перенесенням) трактуємо як швидку дію замість
            // перетягування: вліво = скасувати, вправо = підтвердити. Спрацьовує лише
            // ПІСЛЯ hold, тому не конкурує з миттєвим свайпом-скролом по картці.
            if (Math.abs(dxTotal) > 30 && Math.abs(dxTotal) > Math.abs(dyTotal) * 1.5) {
              pendingDragRef.current = null;
              quickCancelRef.current = null;
              xVisibleRef.current = false;
              setQuickCancelId(null);
              setHoldId(null);
              const bk = (bookingsRef.current || []).find(x => x.id === pd.id);
              if (bk && !pd.isBlock) {
                navigator.vibrate?.(dxTotal < 0 ? [20, 30, 20] : 40);
                handleActionRef.current?.(dxTotal < 0 ? "cancel" : "confirm", bk);
              }
              return;
            }
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
      const draggedMeta = dragRef.current;
      const endedId = draggedMeta?.id ?? pendingDragRef.current?.id;
      const endedMergedIds = draggedMeta?.mergedIds ?? pendingDragRef.current?.mergedIds ?? null;

      // Особиста подія: drag "move" лише пересуває картку локально (React
      // state) — Firebase досі показує СТАРИЙ час заблокованим, а НОВИЙ час
      // лишається вільним/бронювальним для студента. Синхронізуємо тут.
      if (wasDragging && draggedMeta.mode === "move" && !draggedMeta.isBlock) {
        const finalB = (bookingsRef.current || []).find(b => b.id === draggedMeta.id);
        if (finalB && finalB.type === "personal" &&
            (finalB.day !== draggedMeta.startDay || finalB.startMin !== draggedMeta.startMinutes)) {
          const oldDateStr = absDayToDateStr(draggedMeta.startDay);
          const newDateStr = absDayToDateStr(finalB.day);
          // Старий час прибираємо повністю (а не звільняємо і не позначаємо
          // заблокованим) — жодної кольорової клітинки там лишатись не має,
          // ніби особистої події там ніколи й не було.
          const oldUpd = {};
          for (let i = 0; i < draggedMeta.startDur; i += 30) {
            const m = draggedMeta.startMinutes + i;
            const sh = String(Math.floor(m / 60)).padStart(2, "0");
            const sm = String(m % 60).padStart(2, "0");
            oldUpd[`timeslots/${oldDateStr}/slot${sh}${sm}`] = null;
          }
          if (Object.keys(oldUpd).length) update(iRef(), oldUpd).catch(() => {});
          blockPersonalSlots(newDateStr, finalB.startMin, finalB.durMin);
          const hh = String(Math.floor(finalB.startMin / 60)).padStart(2, "0");
          const mm = String(finalB.startMin % 60).padStart(2, "0");
          const key = finalB._fbKey || finalB.id;
          // Час змінився — старе "reminderSent" від попереднього часу більше
          // не діє, інакше нагадування-будильник на новий час взагалі не
          // прийде (sendPersonalEventReminders пропускає reminderSent:true).
          update(iRef( `bookings/personal/${key}`), { date: newDateStr, time: `${hh}:${mm}`, startMin: finalB.startMin, reminderSent: false }).catch(() => {});
        } else if (finalB && finalB.type !== "personal" &&
                   !(draggedMeta.mergedIds && draggedMeta.mergedIds.length)) {
          // Реальний одиночний запис учня (НЕ злитий merged-блок з кількох
          // записів — для тих поки лишаємо стару поведінку, див. нижче чому) —
          // перетягування раніше міняло лише локальний React-стан і НІЧОГО не
          // писало в Firebase, тому onBookingChanged на бекенді (пуш студенту
          // + блокування нового слоту) не спрацьовував. Синхронізацію
          // timeslots і сам пуш бере на себе бекенд — тут достатньо записати
          // нові date/time/startMin.
          //
          // Merged-блок (кілька окремих бронювань, злитих візуально в одну
          // картку — напр. учень бронював 3 окремі години поспіль) свідомо
          // НЕ зберігаємо тут: запис одразу в кілька bookingId одночасно
          // запускає onBookingChanged кілька разів паралельно, і в проді це
          // одного разу залишило по собі купу сирітських заблокованих
          // 30-хвилинних слотів на весь вечір. Поки не протестовано safely —
          // для merged drag міняється лише локальний стан, як було раніше.
          const seg = (bookingsRef.current || []).find(b => b.id === draggedMeta.id);
          if (seg && seg.userId &&
              (seg.day !== draggedMeta.startDay || seg.startMin !== draggedMeta.startMinutes)) {
            const newDateStr = absDayToDateStr(seg.day);
            const key = seg._fbKey || seg.id;
            update(iRef( `bookings/${seg.userId}/${key}`), {
              date: newDateStr, time: fmtTime(seg.startMin), startMin: seg.startMin,
            }).catch(() => {});
          }
        }
      }

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
      // Інерція для ручного (JS) скролу карток — без цього доскрол по записах
      // зупинявся миттєво на відміну від нативного скролу по порожньому місцю.
      if (swipeRef.current?.manualScroll && gridRef.current) {
        const sr = gridRef.current;
        const totalDx = swipeRef.current.scrollAnchorX != null ? swipeRef.current.scrollAnchorX - swipeRef.current.endX : 0;
        const totalDy = swipeRef.current.scrollAnchorY != null ? swipeRef.current.scrollAnchorY - swipeRef.current.endY : 0;
        const axis = Math.abs(totalDx) >= Math.abs(totalDy) ? "x" : "y";
        let v = axis === "x" ? (swipeRef.current.vx || 0) : (swipeRef.current.vy || 0);
        if (momentumRef.current) cancelAnimationFrame(momentumRef.current);
        v = Math.max(-2.5, Math.min(2.5, v)); // клемп викидів швидкості (рідкісні згруповані pointermove)
        if (Math.abs(v) > 0.02) {
          // Згасання прив'язане до РЕАЛЬНОГО часу (Math.pow(decay, dt)), а не до кадру
          // (v *= const щокадрово) — інакше на нерівному фреймрейті (просідання ФПС)
          // ефективна швидкість гальмування стрибає і рух відчувається ривками.
          const DECAY_PER_MS = 0.9965;
          let lastT = performance.now();
          const step = (t) => {
            const dt = t - lastT;
            lastT = t;
            if (axis === "x") sr.scrollLeft -= v * dt;
            else sr.scrollTop -= v * dt;
            v *= Math.pow(DECAY_PER_MS, dt);
            momentumRef.current = Math.abs(v) > 0.02 ? requestAnimationFrame(step) : null;
          };
          momentumRef.current = requestAnimationFrame(step);
        }
      }
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

  // Обідня перерва того дня, в хвилинах — для перевірки при перетягуванні/
  // розтягуванні вільних слотів (settingsRef, бо effects нижче мають [] deps).
  const lunchForDate = (dateStr) => {
    const s = settingsRef.current;
    const dow = (new Date(dateStr + "T12:00:00").getDay() + 6) % 7;
    const ov = (s.dateOverrides || []).find(o => o.date === dateStr);
    const ws = (s.weekSchedule || [])[dow] || {};
    return {
      enabled: ov?.lunchEnabled ?? ws.lunchEnabled ?? s.lunchEnabled ?? true,
      start:   (ov?.lunchStart ?? ws.lunchStart ?? s.lunchStart ?? 12) * 60,
      end:     (ov?.lunchEnd   ?? ws.lunchEnd   ?? s.lunchEnd   ?? 13) * 60,
    };
  };

  // Перетягування вільних (зелених) слотів вгору/вниз по колонці дня — крок з Кроку часу (snapMin).
  // Заблоковані/VIP/з надбавкою слоти не рухаємо (freeDragRef активується лише для звичайних вільних).
  useEffect(() => {
    const onMove = (e) => {
      const fd = freeDragRef.current;
      if (!fd) return;
      const dy = e.clientY - fd.startClientY;
      const dx = e.clientX - (fd.startClientX ?? e.clientX);
      // Довгий тап відбувся, але після нього палець поїхав радше горизонтально,
      // ніж вертикально (звичайний свайп гортання днів, а не намір тягнути
      // слот) — відпускаємо жест повністю й передаємо керування ручному скролу.
      // РАНІШЕ горизонтальна гілка вимагала dx>1.7dy (асиметрично суворіше, ніж
      // вертикальна, якій було досить dy>10 незалежно від dx) — повільний свайп,
      // що встигав "озброїти" перетягування до 8px зсуву в pre-arm перевірці,
      // тут знову губився. Тепер обидві гілки симетричні: просто яка вісь більша.
      if (!fd.moved && Math.hypot(dx, dy) > 10) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          freeDragRef.current = null;
          setFreeDragPreview(null);
          if (swipeRef.current) swipeRef.current.manualScroll = true;
          return;
        }
        fd.moved = true;
        clearTimeout(slotHoldTimerRef.current);
        navigator.vibrate?.(15);
      }
      if (!fd.moved) return;
      const { PX_PER_MIN, snapMin, workStart, workEnd } = calcRef.current;
      const deltaMin = dy / PX_PER_MIN;
      let ns = Math.round((fd.startMin + deltaMin) / snapMin) * snapMin;
      ns = Math.max(workStart * 60, Math.min(ns, workEnd * 60 - 60));
      fd.newStart = ns;
      setFreeDragPreview({ dateStr: fd.dateStr, time: fd.time, newStart: ns });
    };
    const onUp = () => {
      const fd = freeDragRef.current;
      if (!fd) return;
      freeDragRef.current = null;
      setFreeDragPreview(null);
      if (!fd.moved) {
        // Довгий тап спрацював, але пальцем так і не поворухнули — це не
        // переміщення, а запит на модалку опцій слота (VIP/надбавка/скидання).
        setSlotOptions({ dateStr: fd.dateStr, time: fd.time, startTime: fd.time, slot: fd.slot });
        return;
      }
      slotHoldFiredRef.current = true; // не даємо onClick одразу перемкнути слот після drag
      setTimeout(() => { slotHoldFiredRef.current = false; }, 60);
      const h = String(Math.floor(fd.newStart / 60)).padStart(2, "0");
      const m = String(fd.newStart % 60).padStart(2, "0");
      const newTime = `${h}:${m}`;
      if (newTime === fd.time) return;
      const durMin = fd.durMin || 60;
      const newEnd = fd.newStart + durMin;
      const bks = bookingsRef.current || [];
      const occupiedByBooking = bks.some(b => b.date === fd.dateStr && b.startMin < newEnd && b.startMin + b.durMin > fd.newStart);
      if (occupiedByBooking) { navigator.vibrate?.([10,10,10]); return; }
      // Не даємо перетягнути вільний слот на/через обідню перерву того дня.
      const lunch = lunchForDate(fd.dateStr);
      if (lunch.enabled && fd.newStart < lunch.end && newEnd > lunch.start) { navigator.vibrate?.([10,10,10]); return; }
      // Перенесений слот (особливо розтягнутий на кілька годин) може накрити
      // собою інші вільні документи на новому місці — так само, як і
      // розтягування, поглинаємо їх (видаляємо окремі записи); якщо на шляху
      // VIP/блокування/надбавка — рух забороняємо. РАНІШЕ перевірявся лише
      // рівно новий час (newTime), тож "проковтнуті" по дорозі старі годинні
      // документи лишались у базі — і саме вони, а не сам перенесений слот,
      // обрізали видиму висоту до найближчого з них при рендері.
      const daySlots = (openSlotsRef?.current || {})[fd.dateStr] || {};
      const absorbedTimes = [];
      let blocked = false;
      Object.keys(daySlots).forEach(t => {
        if (t === fd.time) return;
        const [h2, m2] = t.split(":").map(Number);
        const tm = h2 * 60 + m2;
        if (tm >= fd.newStart && tm < newEnd) {
          const s2 = daySlots[t];
          const s2Free = s2 && s2.available && !s2.vipOnly && !s2.privateOnly && !s2.adminBlocked && !s2.surcharge && !s2.fixedPrice;
          if (s2Free) absorbedTimes.push(t); else blocked = true;
        }
      });
      if (blocked) { navigator.vibrate?.([10,10,10]); return; }
      const oldSlotId = `slot${fd.time.replace(":", "")}`;
      const newSlotId = `slot${h}${m}`;
      const updates = {};
      updates[`timeslots/${fd.dateStr}/${oldSlotId}`] = null;
      updates[`timeslots/${fd.dateStr}/${newSlotId}/available`] = true;
      updates[`timeslots/${fd.dateStr}/${newSlotId}/time`] = newTime;
      updates[`timeslots/${fd.dateStr}/${newSlotId}/durMin`] = durMin;
      absorbedTimes.forEach(t => { updates[`timeslots/${fd.dateStr}/slot${t.replace(":", "")}`] = null; });
      update(iRef(), updates).catch(() => {});
      navigator.vibrate?.(20);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Розтягування вільного слота (зміна тривалості) — ручка знизу, крок з Кроку часу (snapMin).
  useEffect(() => {
    const onMove = (e) => {
      const fr = freeResizeRef.current;
      if (!fr) return;
      const dy = e.clientY - fr.startClientY;
      const dx = e.clientX - (fr.startClientX ?? e.clientX);
      // Той самий поріг, що й для перетягування слота — захист від випадкового
      // розтягування через легке тремтіння пальця під час тапу. Якщо рух радше
      // горизонтальний — це свайп днів, що "просочився" через довгий тап на
      // маленькій ручці ресайзу коротких слотів: відпускаємо й передаємо скролу.
      if (!fr.moved && Math.hypot(dx, dy) > 10) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          freeResizeRef.current = null;
          setFreeResizePreview(null);
          if (swipeRef.current) swipeRef.current.manualScroll = true;
          return;
        }
        fr.moved = true;
        navigator.vibrate?.(15);
      }
      if (!fr.moved) return;
      const { PX_PER_MIN, snapMin } = calcRef.current;
      const deltaMin = dy / PX_PER_MIN;
      let nd = Math.round((fr.startDur + deltaMin) / snapMin) * snapMin;
      nd = Math.max(snapMin, Math.min(nd, fr.maxDur));
      fr.newDur = nd;
      setFreeResizePreview({ dateStr: fr.dateStr, time: fr.time, newDur: nd });
    };
    const onUp = () => {
      const fr = freeResizeRef.current;
      if (!fr) return;
      freeResizeRef.current = null;
      setFreeResizePreview(null);
      if (!fr.moved) {
        // Довгий тап на ручці ресайзу спрацював, але пальцем так і не
        // поворухнули — так само, як і довгий тап по самому слоту, це запит
        // на модалку опцій, а не розтягування. РАНІШЕ тут просто нічого не
        // відбувалось — довгий тап у нижній частині короткого слота (де ця
        // ручка займає велику частку висоти) "губився" без відкриття модалки.
        setSlotOptions({ dateStr: fr.dateStr, time: fr.time, startTime: fr.time, slot: fr.slot });
        return;
      }
      if (fr.newDur === fr.startDur) return;
      const [hh, mm] = fr.time.split(":").map(Number);
      const startMin = hh * 60 + mm;
      const newEnd = startMin + fr.newDur;
      // Не даємо розтягнути вільний слот через обідню перерву того дня.
      const lunch = lunchForDate(fr.dateStr);
      if (lunch.enabled && startMin < lunch.end && newEnd > lunch.start) { navigator.vibrate?.([10,10,10]); return; }
      const slotId = `slot${fr.time.replace(":", "")}`;
      const updates = { [`timeslots/${fr.dateStr}/${slotId}/durMin`]: fr.newDur };
      // Ріст поглинає наступні вільні слоти, у які «в’їхав» новий розмір, —
      // прибираємо їхні окремі документи, щоб не лишалось «розрізаних» дублікатів.
      const daySlots = (openSlotsRef?.current || {})[fr.dateStr] || {};
      const absorbedTimes = [];
      Object.keys(daySlots).forEach(t => {
        if (t === fr.time) return;
        const [h2, m2] = t.split(":").map(Number);
        const tm = h2 * 60 + m2;
        if (tm > startMin && tm < newEnd) {
          updates[`timeslots/${fr.dateStr}/slot${t.replace(":", "")}`] = null;
          absorbedTimes.push(t);
        }
      });
      // Оптимістично оновлюємо локальний стан одразу — інакше слот на мить
      // «стрибає» назад до старої висоти, поки Firebase не підтвердить запис.
      setOpenSlots(prev => {
        const day = { ...(prev[fr.dateStr] || {}) };
        if (day[fr.time]) day[fr.time] = { ...day[fr.time], durMin: fr.newDur };
        absorbedTimes.forEach(t => delete day[t]);
        return { ...prev, [fr.dateStr]: day };
      });
      if (openSlotsRef) {
        const day = { ...(openSlotsRef.current[fr.dateStr] || {}) };
        if (day[fr.time]) day[fr.time] = { ...day[fr.time], durMin: fr.newDur };
        absorbedTimes.forEach(t => delete day[t]);
        openSlotsRef.current = { ...openSlotsRef.current, [fr.dateStr]: day };
      }
      setFreeResizePreview(null);
      update(iRef(), updates).catch(() => {});
      navigator.vibrate?.(20);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const hours = [];
  for (let h = settings.workStart; h <= settings.workEnd; h++) hours.push(h);

  // Колір картки — стабільний за учнем, і РІЗНІ учні гарантовано отримують
  // РІЗНІ кольори (поки їх < 50): порядок призначення визначається часом
  // першого запису учня (createdAt), а не хешем — хеш у 10-кольоровій палітрі
  // неминуче колізив уже на кількох учнях.
  const studentColorMap = useMemo(() => {
    const firstSeen = new Map();
    for (const b of bookings) {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") continue;
      const key = b.userId || b.phone || b.name;
      if (!key) continue;
      const t = b.createdAt ?? 0;
      if (!firstSeen.has(key) || t < firstSeen.get(key)) firstSeen.set(key, t);
    }
    const keys = [...firstSeen.keys()].sort((a, c) => (firstSeen.get(a) - firstSeen.get(c)) || a.localeCompare(c));
    const map = {};
    keys.forEach((k, i) => { map[k] = STUDENT_PALETTE[i % STUDENT_PALETTE.length]; });
    return map;
  }, [bookings]);
  const studentColor = (b) => {
    const key = b.userId || b.phone || b.name || b.id;
    return studentColorMap[key] || STUDENT_PALETTE[0];
  };
  const slotColor = (b) => studentColor(b);

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
    if (action === "confirm") { setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x)); return; }
    if (action === "cancel") {
      // Відновити timeslots
      const cancelOne = async (mb) => {
        if (mb.startMin !== undefined && mb.durMin) {
          const dateStr = mb.date || absDayToDateStr(mb.day);
          // Позиції, де вже існував реальний слот-документ до бронювання
          // (напр. сам розтягнутий на кілька годин слот), відновлюємо вільними
          // з їхньою власною тривалістю. А phantom-документи — створені лише
          // під це бронювання (markSlotsUnavailable ставить phantom:true для
          // позицій без свого доку) — прибираємо повністю, а не робимо
          // окремим вільним слотом: інакше розтягнутий слот після скасування
          // розпадається на кілька коротших замість одного, як було раніше.
          try {
            const daySnap = await get(iRef( `timeslots/${dateStr}`));
            const day = daySnap.val() || {};
            const upd = {};
            for (let i = 0; i < mb.durMin; i += 30) {
              const sm = mb.startMin + i;
              const hh = String(Math.floor(sm/60)).padStart(2,'0'), mm = String(sm%60).padStart(2,'0');
              const slotId = `slot${hh}${mm}`;
              const path = `timeslots/${dateStr}/${slotId}`;
              if (day[slotId]?.phantom) {
                upd[path] = null;
              } else {
                upd[`${path}/available`] = true; upd[`${path}/time`] = `${hh}:${mm}`; upd[`${path}/phantom`] = null;
              }
            }
            await update(iRef('/'), upd);
          } catch {}
        }
        // Позначити cancelled у Firebase (обидва можливих ключі)
        if (mb.userId) {
          const ks = [...new Set([mb._fbKey, mb.id].filter(Boolean))];
          ks.forEach(k => update(iRef( `bookings/${mb.userId}/${k}`),
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
      return;
    }
    if (action === "noshow")  { setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"noshow"}:x)); return; }
    if (action === "delete")  setBookings(bs=>bs.filter(x=>x.id!==b.id));
    if (action === "repeat")  setBookings(bs=>[...bs,{...b, id:`b-${Date.now()}`, day:b.day+7, status:"confirmed"}]);
    if (action === "chat")     { navTo?.("chats"); return; }
    if (action === "call")     window.location.href=`tel:${b.phone}`;
    if (action === "sms")      window.location.href=`sms:${b.phone}`;
    if (action === "viber")    window.location.href=`viber://chat?number=%2B${b.phone.replace(/\D/g,"")}`;
    if (action === "telegram") window.location.href=`https://t.me/${b.phone.replace(/\D/g,"")}`;
    if (action === "setTag") {
      // Ручний вибір/зняття мітки — позначаємо tagManual, щоб автоматична
      // логіка (порядок уроку/борг) більше НІКОЛИ не перезаписувала цей запис.
      // debtAmount передається лише коли інструктор явно вписав/змінив суму
      // боргу вручну — інакше залишаємо попереднє значення в Firebase як є.
      const patch = { tag: b.tag || null, tagManual: true };
      if (b.debtAmount !== undefined) patch.debtAmount = b.debtAmount || null;
      setBookings(bs=>bs.map(x=>x.id===b.id?{...x,...patch}:x));
      setLocalSelectedBooking(prev=>prev?{...prev,...patch}:null);
      if (b.userId) {
        const key = b._fbKey || b.id;
        update(iRef( `bookings/${b.userId}/${key}`), patch).catch(()=>{});
      }
      return;
    }
    if (action === "toggleVip") {
      const next = !b.isVipOnly;
      setBookings(bs=>bs.map(x=>x.id===b.id?{...x,isVipOnly:next,categoryId:next?"cat-vip":null}:x));
      setLocalSelectedBooking(prev=>prev?{...prev,isVipOnly:next,categoryId:next?"cat-vip":null}:null);
      return;
    }
    if (action === "editBooking") {
      const patch = {};
      if (b.manualPrice !== undefined) patch.manualPrice = b.manualPrice;
      if (b.durMin !== undefined) { patch.durMin = b.durMin; patch.durationHours = b.durationHours; }
      setBookings(bs=>bs.map(x=>x.id===b.id?{...x,...patch}:x));
      setLocalSelectedBooking(prev=>prev?{...prev,...patch}:null);
      if (b.userId) {
        const key = b._fbKey || b.id;
        update(iRef( `bookings/${b.userId}/${key}`), patch).catch(()=>{});
      }
      return;
    }
    setLocalSelectedBooking(null);
  };
  // handleAction переоголошується щорендеру — тримаємо свіже посилання в ref
  // для listeners, підписаних один раз (useEffect з deps:[]), щоб не звертатись
  // до застарілого closure зі свайп-жесту на картці.
  useEffect(() => { handleActionRef.current = handleAction; });
  const [blockModal, setBlockModal] = useState(null); // {id, day, startMin, durMin}
  const [blockModalClosing, setBlockModalClosing] = useState(false);
  const [broadcastInit, setBroadcastInit] = useState(null);

  const handleBlock = ({ day, startMin }) => {
    setBookings(bs=>[...bs,{
      id:`block-${Date.now()}`, day, startMin, durMin:60,
      name:"ЗАБЛОКОВАНО", phone:"", type:"block",
      hoursDone:0, status:"blocked", serviceId:""
    }]);
  };

  // Блокуємо/звільняємо timeslots під особистою подією — так само, як для
  // звичайного бронювання, щоб студент не міг записатись на цей час.
  const blockPersonalSlots = (dateStr, startMin, durMin) => {
    const upd = {};
    for (let i = 0; i < durMin; i += 30) {
      const m = startMin + i;
      const sh = String(Math.floor(m / 60)).padStart(2, "0"), sm = String(m % 60).padStart(2, "0");
      upd[`timeslots/${dateStr}/slot${sh}${sm}/available`] = false;
      upd[`timeslots/${dateStr}/slot${sh}${sm}/time`] = `${sh}:${sm}`;
      upd[`timeslots/${dateStr}/slot${sh}${sm}/bookingStart`] = i === 0;
      // Позначаємо, що зайнятість — від особистої події адміна, а не уроку:
      // клієнтський календар (classifyDay) виключає такі слоти з підрахунку,
      // щоб особиста подія не "підсвічувала" день як зайнятий учням.
      upd[`timeslots/${dateStr}/slot${sh}${sm}/personal`] = true;
    }
    update(iRef(), upd).catch(() => {});
  };
  const unblockPersonalSlots = (dateStr, startMin, durMin) => {
    const upd = {};
    for (let i = 0; i < durMin; i += 30) {
      const m = startMin + i;
      const sh = String(Math.floor(m / 60)).padStart(2, "0"), sm = String(m % 60).padStart(2, "0");
      upd[`timeslots/${dateStr}/slot${sh}${sm}/available`] = true;
      upd[`timeslots/${dateStr}/slot${sh}${sm}/time`] = `${sh}:${sm}`;
      upd[`timeslots/${dateStr}/slot${sh}${sm}/phantom`] = null;
      upd[`timeslots/${dateStr}/slot${sh}${sm}/personal`] = null;
    }
    update(iRef(), upd).catch(() => {});
  };

  const savePersonalEventEdit = () => {
    const ev = personalEventView;
    if (!ev || !peEditTitle.trim()) return;
    const [nh, nm] = peEditTime.split(":").map(Number);
    const newStartMin = nh * 60 + nm;
    const oldDate = ev.date || absDayToDateStr(ev.day);
    const timeChanged = peEditDate !== oldDate || newStartMin !== ev.startMin || peEditDur !== ev.durMin;
    if (timeChanged) {
      unblockPersonalSlots(oldDate, ev.startMin, ev.durMin);
    }
    // Завжди перезаписуємо (навіть без зміни часу) — так відкрити й зберегти
    // подію без правок теж проставляє personal:true на її таймслоти, якщо
    // вона була створена до появи цього прапорця.
    blockPersonalSlots(peEditDate, newStartMin, peEditDur);
    const reminderChanged = timeChanged || peEditReminderHours !== (ev.reminderHours || null);
    const patch = {
      date: peEditDate, time: peEditTime, startMin: newStartMin, durMin: peEditDur,
      studentName: peEditTitle.trim(), name: peEditTitle.trim(), note: peEditNote.trim(),
      reminderHours: peEditReminderHours || null,
      ...(reminderChanged ? { reminderSent: false } : {}),
    };
    const key = ev._fbKey || ev.id;
    update(iRef( `bookings/personal/${key}`), patch).catch(() => {});
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(peEditDate); d.setHours(0, 0, 0, 0);
    const newDay = Math.round((d - today) / 86400000);
    setBookings(bs => bs.map(x => x.id === ev.id ? { ...x, ...patch, day: newDay } : x));
    setPersonalEventView(null);
  };

  const deletePersonalEvent = () => {
    const ev = personalEventView;
    if (!ev) return;
    unblockPersonalSlots(ev.date || absDayToDateStr(ev.day), ev.startMin, ev.durMin);
    const key = ev._fbKey || ev.id;
    remove(iRef( `bookings/personal/${key}`)).catch(() => {});
    setBookings(bs => bs.filter(x => x.id !== ev.id));
    setPersonalEventView(null);
  };

  const handleVipSlot = ({ day, startMin }) => {
    const dateStr = absDayToDateStr(day);
    const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
    const mm = String(startMin % 60).padStart(2, "0");
    update(iRef( `timeslots/${dateStr}/slot${hh}${mm}`), {
      time: `${hh}:${mm}`, available: true, vipOnly: true,
    }).catch(() => {});
  };

  const [vipSlotModal, setVipSlotModal] = useState(null);
  const [vipSlotModalClosing, setVipSlotModalClosing] = useState(false);
  const [slotOptions, setSlotOptions] = useState(null); // { dateStr, time, startTime, slot }
  const [slotClosing, setSlotClosing] = useState(false);
  const [fixedPriceEditing, setFixedPriceEditing] = useState(false);
  const [fixedPriceInput, setFixedPriceInput] = useState("");
  const [personalEventData, setPersonalEventData] = useState(null); // { dateStr, time }
  const [longTapMenu, setLongTapMenu] = useState(null); // { dateStr, startMin, clientX, clientY }
  const [ltmClosing, setLtmClosing] = useState(false);
  const [ltmScatter, setLtmScatter] = useState(false);
  const [personalEventView, setPersonalEventView] = useState(null); // booking object for viewing
  // Поля форми редагування особистої події (заповнюються при відкритті personalEventView)
  const [peEditTitle,         setPeEditTitle]         = useState("");
  const [peEditDur,           setPeEditDur]           = useState(60);
  const [peEditNote,          setPeEditNote]          = useState("");
  const [peEditDate,          setPeEditDate]          = useState("");
  const [peEditReminderHours, setPeEditReminderHours] = useState(null);
  const [peEditTime,  setPeEditTime]  = useState("");

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
    <Card style={{
      padding:"6px 3px 0", overflow:"hidden", flex:1, minHeight:0, display:"flex", flexDirection:"column",
      // Той самий скляний фон, що й у нижньому навбарі — замість суцільного SURFACE.
      background: isLight ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)",
      boxShadow: isLight ? "0 8px 24px rgba(92,42,26,0.14)" : "0 8px 24px rgba(0,0,0,0.45)",
    }}>
      <div style={{display:"flex", flex:1, minHeight:0, overflow:"hidden", position:"relative"}}>

        {/* TIME COLUMN — fixed left, never scrolls */}
        <div
          onPointerDown={e=>{
            // Стовпчик часу — не нащадок gridRef, тому onPointerDownCapture на
            // gridRef сюди не долітає — ініціалізуємо swipeRef вручну.
            swipeRef.current = {
              startX:e.clientX, startY:e.clientY, endX:e.clientX, endY:e.clientY, startTime:Date.now(),
              scrollAnchorX: e.clientX, scrollStartLeft: gridRef.current?.scrollLeft ?? 0,
            };
          }}
          onPointerMove={e=>{
            const sr = swipeRef.current;
            if (!sr) return;
            sr.endX = e.clientX;
            sr.endY = e.clientY;
            // Стовпчик часу керує ЛИШЕ горизонтальним гортанням днів — вертикальний
            // скрол годин і так синхронізується автоматично з основної сітки
            // (onScroll ставить transform на timeColRef). Абсолютний розрахунок
            // від якоря (а не += по кожній крихітній dx) — стійкий до рідкісних/
            // згрупованих подій pointermove, які інакше "губили" би частину
            // відстані й свайп днями виглядав як "не працює".
            if (gridRef.current) pendingScrollRef.current = { axis: "x", value: sr.scrollStartLeft + (sr.scrollAnchorX - e.clientX) };
          }}
          style={{
          width:TIME_COL_W, flexShrink:0, zIndex:10,
          display:"flex", flexDirection:"column",
          borderRight:`1px solid ${ink(0.07)}`,
        }}>
          {/* Кнопка «Ключик» — генерувати/зняти всі слоти (перенесено з шапки, календар — тепер у шапці).
              Стиль — та сама плашка, що й замочок знизу (11px-квадрат, градієнт, рамка), піктограма — сітка 2×2. */}
          <div style={{height:HEADER_H + 4, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center"}}>
            {(() => {
              const slotsOn = hasAnyGeneratedSlots();
              const c = slotsOn ? RED : GREEN;
              return (
                <button
                  onClick={isGeneratingAll ? undefined : (slotsOn ? clearAllSlots : generateAllSlots)}
                  title={slotsOn
                    ? `Зняти всі слоти (${settings.slotGenDays||30} днів)`
                    : `Згенерувати слоти на ${settings.slotGenDays||30} днів за графіком`}
                  style={{
                    width:48, height:32, border:"none", cursor: isGeneratingAll?"default":"pointer",
                    background:"transparent", display:"flex", alignItems:"center", justifyContent:"center",
                    flexShrink:0,
                  }}>
                  <div style={{
                    width:48, height:32, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
                    background:`linear-gradient(135deg,color-mix(in srgb,${c} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                    border:`1px solid color-mix(in srgb,${c} 35%,transparent)`,
                    transition:"background .15s",
                  }}>
                    {isGeneratingAll
                      ? <div style={{width:14,height:14,borderRadius:"50%",border:`2px solid color-mix(in srgb,${c} 30%,transparent)`,borderTopColor:c,animation:"spin .7s linear infinite"}}/>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>
                        </svg>
                    }
                  </div>
                </button>
              );
            })()}
          </div>
          <div style={{overflow:"hidden", flex:1, position:"relative"}}>
            <div ref={timeColRef} style={{position:"absolute", top:0, left:0, right:0, height:gridHeight}}>
              {Array.from({length:(effectiveWorkEnd-effectiveWorkStart)*2+1},(_,i)=>{
                const totalMins = i*30;
                // absMin — абсолютна хвилина від півночі: effectiveWorkStart тепер
                // може бути дробовим (напр. 8.5 = 8:30), тож просте "workStart+h"
                // давало биту мітку типу "8.5:00" замість "09:00".
                const absMin = effectiveWorkStart*60 + totalMins;
                const h = Math.floor(absMin/60);
                const m = absMin % 60;
                if (absMin > effectiveWorkEnd*60) return null;
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
              {nowMin >= effectiveWorkStart*60 && nowMin <= effectiveWorkEnd*60 && (
                <div style={{
                  position:"absolute", left:2, right:2, top:minToPx(nowMin),
                  transform:"translateY(-50%)",
                  background:"#ef4444", color:"#fff",
                  fontSize:9, fontWeight:900, lineHeight:1,
                  borderRadius:6, padding:"3px 0", textAlign:"center",
                  boxShadow:"0 2px 8px rgba(239,68,68,0.5)",
                }}>{String(Math.floor(nowMin/60)).padStart(2,"0")}:{String(nowMin%60).padStart(2,"0")}</div>
              )}
            </div>
          </div>
          {/* Замок — в нижній частині стовпця часу, вирівняний із сум-рядком */}
          <div
            onPointerDown={handleLockDown}
            onPointerUp={handleLockUp}
            onPointerCancel={handleLockUp}
            onContextMenu={e=>e.preventDefault()}
            style={{
              height:36, flexShrink:0, marginBottom:10,
              display:"flex", alignItems:"center", justifyContent:"center",
              WebkitUserSelect:"none", userSelect:"none", touchAction:"none", cursor:"pointer",
            }}
          >
            <div style={{
              width:32, height:32, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
              background: scheduleLocked
                ? `linear-gradient(135deg,color-mix(in srgb,${RED} 48%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`
                : `linear-gradient(135deg,color-mix(in srgb,${GREEN} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
              border: scheduleLocked
                ? `1px solid color-mix(in srgb,${RED} 40%,transparent)`
                : `1px solid color-mix(in srgb,${GREEN} 35%,transparent)`,
              transition:"background .15s",
            }}>
              {scheduleLocked ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{filter:"drop-shadow(0 0 4px rgba(239,68,68,0.6))"}}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* SCROLLABLE GRID — horizontal + vertical */}
        <div
          ref={gridRef}
          onPointerDownCapture={e=>{
            if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); momentumRef.current = null; }
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
          style={{flex:1, overflowX:"auto", overflowY:"auto", touchAction:"pan-x pan-y", WebkitOverflowScrolling:"touch", userSelect:"none", WebkitUserSelect:"none", scrollbarWidth:"none", willChange:"scroll-position"}}
        >
          <div ref={gridWrapRef} style={{display:"flex", paddingTop:2}}>
          {vRange.s > 0 && <div style={{width:vRange.s*(COL_W+4), flexShrink:0}}/>}
          {days.slice(vRange.s, vRange.e+1).map((day,_i)=>{
            const colIdx = vRange.s + _i;
            const absDay = dayOffset + colIdx;
            const dateStrCol = absDayToDateStr(absDay);
            // Записи цього дня — для приховування вільних слотів, які запис накрив
            // (навіть наполовину): такий слот не показуємо й не пропонуємо клієнту.
            // Порівнюємо за абсолютною датою (b.date), а не відносним b.day — той
            // рахується один раз від "сьогодні" в момент обробки снепшоту з Firebase
            // і застаріває, якщо застосунок лишається відкритим через опівніч без
            // нових bookings-подій: вільний слот тоді хибно лишався "накритим"
            // записом, що вже фактично посунувся на інший відносний день.
            const colBookings = bookings.filter(b => b.date === dateStrCol && b.status !== "cancelled");
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
            // Ефективний статус дня: явний dateOverride головніший за тижневий
            // шаблон (той самий критерій, що й у computeDayUpdates/toggleDayBlocked).
            // Раніше isClosedDay дивився лише на override, тому шаблонно-закритий
            // день без override (напр. неділя) вважався "не закритим" для кліків,
            // контекстного меню та кольору заголовка, а override, що відкриває
            // такий день, і далі показувався б червоним.
            const isWorkDay = _ov ? _ov.type !== 'closed' : (_ws.enabled !== false && !(!_ws.start && (settings.weekends || []).includes(_dow)));
            const isClosedDay = !isWorkDay;
            return (
            <div key={absDay} style={{
              display:"flex", flexDirection:"column", flexShrink:0,
              width:COL_W, marginRight:colIdx<N_DAYS-1?4:0,
            }}>
              {/* DATE HEADER — sticky top, moves with column horizontally */}
              <div
                onClick={e=>{
                  e.stopPropagation();
                  if(scheduleLocked) return;
                  if(dayLongFiredRef.current){dayLongFiredRef.current=false;return;}
                  if(isPastDay || isLoadingCol) return;
                  const now = Date.now();
                  if (dayLastClickRef.current && dayLastClickRef.current.absDay === absDay && now - dayLastClickRef.current.time < 350) {
                    // Подвійний тап — закрити/відкрити день
                    clearTimeout(dayClickTimerRef.current);
                    dayLastClickRef.current = null;
                    navigator.vibrate?.([20,20,20]);
                    toggleDayBlocked(dateStrCol);
                    return;
                  }
                  dayLastClickRef.current = { absDay, time: now };
                  clearTimeout(dayClickTimerRef.current);
                  dayClickTimerRef.current = setTimeout(()=>{
                    dayLastClickRef.current = null;
                    if (isClosedDay) return;
                    hasAnySlotsCol ? clearDaySlots(absDay) : generateDaySlots(absDay);
                  }, 300);
                }}
                onPointerDown={e=>{ if(scheduleLocked) return; clearTimeout(dayLongPressRef.current); dayLongFiredRef.current=false; dayLongPressRef.current=setTimeout(()=>{ dayLongFiredRef.current=true; navigator.vibrate?.(30); setDayNotesModal({ dateStr: dateStrCol, dayLabel: day.fullLabel, dayNum: day.num, dayMonth: day.monthFull }); }, 600); }}
                onPointerUp={()=>clearTimeout(dayLongPressRef.current)}
                onPointerLeave={()=>clearTimeout(dayLongPressRef.current)}
                style={{
                  position:"sticky", top:0, zIndex:12,
                  height:HEADER_H, flexShrink:0, marginBottom:10,
                  display:"flex", flexDirection:"column", gap:1,
                  alignItems:"center", justifyContent:"center",
                  padding:"2px 4px", borderRadius:10, cursor: isPastDay ? "default" : "pointer",
                  opacity: isPastDay ? 0.35 : 1, overflow:"visible",
                  // Робочі дні за розкладом — зелені, неробочі — червоні (isWorkDay,
                  // не просто субота/неділя по календарю).
                  // Заблокований день — та сама діагональна штриховка, що й у заблокованих
                  // слотах сітки (STRIPE_A/STRIPE_B) — узгоджена мова "заблоковано" в межах UI.
                  background: isClosedDay ? `repeating-linear-gradient(45deg,${STRIPE_A},${STRIPE_A} 5px,${STRIPE_B} 5px,${STRIPE_B} 10px)` : `linear-gradient(155deg, color-mix(in srgb, color-mix(in srgb, ${isWorkDay ? GREEN : RED} 22%, ${BG_DEEP}) 78%, transparent) 0%, color-mix(in srgb, ${BG_DEEP} 78%, transparent) 100%)`,
                  backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
                  boxShadow: `3px 3px 7px rgba(${SHADE},0.4), -2px -2px 6px rgba(${GLOW},0.06)${isToday ? `, inset 0 0 0 1.5px ${GOLD}99` : isClosedDay ? `, inset 0 0 0 1.5px rgba(220,60,60,0.8)` : ""}`,
                }}>
                <div style={{fontSize:8.5, fontWeight:700, lineHeight:1.2,
                  color: isWorkDay ? GREEN : RED,
                  letterSpacing:0.3, overflow:"hidden", whiteSpace:"nowrap",
                  maxWidth:"100%", textOverflow:"ellipsis",
                }}>{day.fullLabel}</div>
                <div style={{fontSize:10.5, fontWeight:800, lineHeight:1.2, color:TEXT,
                  overflow:"hidden", whiteSpace:"nowrap", maxWidth:"100%", textOverflow:"ellipsis",
                }}>
                  {day.num} {day.monthFull}{day.year !== currentYear ? ` ${day.year}` : ""}
                </div>
                {!isPastDay && !isClosedDay && !isLoadingCol && (
                  <div style={{
                    position:"absolute", top:2, right:2, width:14, height:14, borderRadius:"50%",
                    background: isOpenCol ? `linear-gradient(155deg,#a6e888,${GREEN})` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                    boxShadow:"0 1px 3px rgba(0,0,0,0.5)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {isOpenCol ? (
                      <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="#0f2e08" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 13 10 18 19 7"/></svg>
                    ) : (
                      <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="3.5" strokeLinecap="round"><line x1="12" y1="6" x2="12" y2="18"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
                    )}
                  </div>
                )}
                {!isPastDay && isLoadingCol && (
                  <div style={{position:"absolute", top:3, right:4, fontSize:8, lineHeight:1, color:FAINT}}>…</div>
                )}
                {dayNotes[dateStrCol] && (
                  <div style={{
                    position:"absolute", top:2, left:2, width:14, height:14, borderRadius:"50%",
                    background:`linear-gradient(155deg,#ffe28a,${GOLD})`,
                    boxShadow:"0 1px 3px rgba(0,0,0,0.5)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="#3a2800" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 3v5h5"/><path d="M6 3h8l5 5v13H6z"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
                    </svg>
                  </div>
                )}
              </div>

              {/* SLOT CONTENT */}
              <div
                onClick={e=>{ if(xJustShownRef.current){ xJustShownRef.current=false; return; } if(quickCancelId){ xVisibleRef.current=false; setQuickCancelId(null); } }}
                onPointerDown={e=>{
                  // Дотик уже "заявлений" дочірнім вільним слотом (без stopPropagation,
                  // щоб не заважати нативному touch-action панорамуванню) — не відкриваємо
                  // меню "новий слот" поверх уже існуючого.
                  if (slotClaimedRef.current) { slotClaimedRef.current = false; return; }
                  if (scheduleLocked || isPastDay) return;
                  if (e.button > 0) return;
                  if (dragRef.current || pendingDragRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rawMin = calcRef.current.workStart * 60 + (e.clientY - rect.top) / calcRef.current.PX_PER_MIN;
                  // Округлення вниз (а не до найближчого) — тап у будь-якому місці
                  // 30-хвилинного рядка має відповідати ЙОГО початку, а не сусідньому,
                  // інакше дотик у нижній половині рядка показував час на 30хв пізніше.
                  const minute = Math.floor(rawMin / 30) * 30;
                  // Обідня перерва — не пропонувати створення нового слота/запису,
                  // навіть якщо адмін довго тисне саме в цей проміжок часу. Раніше
                  // затемнення обіду було суто візуальним (pointerEvents:"none"),
                  // тож довгий тап під ним усе одно відкривав меню створення.
                  if (colLunch.enabled && minute >= colLunch.start * 60 && minute < colLunch.end * 60) return;
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
                  // Короткий клік по порожній клітинці нічого не створює —
                  // випадковий дотик (скрол/промах) не повинен спавнити слот.
                  // Відкрити слот можна лише через довгий тап (меню з підтвердженням).
                  clearTimeout(emptyHoldTimerRef.current);
                  emptyHoldPosRef.current = null;
                }}
                onPointerCancel={()=>{ clearTimeout(emptyHoldTimerRef.current); emptyHoldPosRef.current = null; }}
                onPointerLeave={()=>{ clearTimeout(emptyHoldTimerRef.current); emptyHoldPosRef.current = null; }}
                onContextMenu={e=>e.preventDefault()}
                style={{
                  width:COL_W, height:gridHeight,
                  position:"relative", padding:"0 4px",
                  background: isLight ? `linear-gradient(135deg,${SURF_LO},${BG_DEEP})` : `linear-gradient(135deg,color-mix(in srgb,${BG_DEEP} 50%,transparent),rgba(0,0,0,0.275))`,
                  borderRadius:14, boxShadow:SHADOW_IN, cursor: isPastDay ? "default" : "cell",
                  userSelect:"none", WebkitUserSelect:"none", WebkitTouchCallout:"none",
                  opacity: isPastDay ? 0.38 : 1,
                }}>

              {/* Лінія поточного часу — тільки в колонці сьогодні */}
              {isToday && nowMin >= effectiveWorkStart*60 && nowMin <= effectiveWorkEnd*60 && (
                <div style={{
                  position:"absolute", left:0, right:0, top:minToPx(nowMin),
                  height:3, zIndex:5, pointerEvents:"none",
                  background:"#ef4444", boxShadow:"0 2px 6px rgba(239,68,68,0.6)",
                }}/>
              )}

              {/* Open/blocked/surcharge/VIP slot indicators — рендеримо і на
                  закритому дні: якщо там є реальні слоти (адмін вручну відкрив
                  один слот через довгий тап → "Вільний слот"), вони мають бути
                  видні й керовані, а не "невидимі" в адмінці попри те, що клієнт
                  їх все одно бачить (timeslots/{date} читається без фільтра по
                  статусу дня). На звичайному закритому дні тут просто пусто. */}
              {(()=>{
                const daySlots = openSlots[dateStrCol] || {};
                const sortedMins = Object.keys(daySlots)
                  .map(t => { const [hh, mm] = t.split(':').map(Number); return hh*60+mm; })
                  .sort((a, b) => a - b);
                return Object.entries(daySlots).map(([time, slot]) => {
                const [h, m] = time.split(":").map(Number);
                const startMin = h * 60 + m;
                if (startMin < effectiveWorkStart * 60 || startMin >= effectiveWorkEnd * 60) return null;
                // Вільний/доступний слот, накритий записом (хоча б частково), не показуємо.
                if (slot.available && slotCovered(startMin)) return null;
                // Якщо після цього слота більше немає документів (наприклад, усі поглинуті
                // розтягуванням) — межею є кінець робочого дня, а не штучні +60 хв.
                const nextMin = sortedMins.find(t => t > startMin) ?? (effectiveWorkEnd * 60);
                const slotDurMin = slot.durMin || 60;
                const slotHeightMin = Math.min(slotDurMin, nextMin - startMin, effectiveWorkEnd * 60 - startMin);
                const isVip = slot.vipOnly;
                const isBlocked = slot.adminBlocked;
                const hasSurcharge = !!slot.surcharge;
                const hasFixedPrice = !!slot.fixedPrice;
                const isPrivateOnly = !!slot.privateOnly;
                const hasViewer = (viewingSlots[dateStrCol] || []).includes(time);
                const isSticky = (isVip || isBlocked || hasSurcharge || isPrivateOnly || hasFixedPrice) ? true : isStickySlot(dateStrCol, time);
                const bg = isVip ? "rgba(168,85,247,0.15)" : isBlocked ? "rgba(239,68,68,0.15)" : isPrivateOnly ? "rgba(234,179,8,0.15)" : hasSurcharge ? "rgba(247,201,72,0.15)" : hasFixedPrice ? "rgba(74,222,128,0.15)" : isSticky ? STICKY_BG : FREE_BG;
                const borderColor = isVip ? "rgba(168,85,247,0.55)" : isBlocked ? "rgba(239,68,68,0.5)" : isPrivateOnly ? (isLight ? "rgba(140,110,0,0.65)" : "rgba(234,179,8,0.6)") : hasSurcharge ? (isLight ? "rgba(140,110,0,0.65)" : "rgba(247,201,72,0.6)") : hasFixedPrice ? "rgba(74,222,128,0.6)" : isSticky ? STICKY_BD : FREE_BD;
                const color = isVip ? "rgba(168,85,247,0.9)" : isBlocked ? "rgba(239,68,68,0.85)" : isPrivateOnly ? (isLight ? "rgba(100,75,0,0.9)" : "rgba(234,179,8,0.95)") : hasSurcharge ? (isLight ? "rgba(100,75,0,0.9)" : "rgba(247,201,72,0.95)") : hasFixedPrice ? "rgba(74,222,128,0.95)" : isSticky ? STICKY_CLR : FREE_CLR;
                const emptyShadow = isLight
                  ? "inset 2px 2px 5px rgba(0,0,0,0.16), inset -2px -2px 5px rgba(255,255,255,0.55)"
                  : "inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(255,255,255,0.10)";
                const isPlainFree = slot.available && !isVip && !isBlocked && !hasSurcharge && !isPrivateOnly && !hasFixedPrice;
                const isBeingDragged = freeDragPreview && freeDragPreview.dateStr===dateStrCol && freeDragPreview.time===time;
                const displayStartMin = isBeingDragged ? freeDragPreview.newStart : startMin;
                // Розтягування вниз може поглинати наступні вільні слоти підряд (без запису,
                // блокування, VIP чи надбавки) — межа росту не обмежена одним нижнім слотом,
                // а йде до першого «непоглинаючого» слота/запису або кінця робочого дня.
                let resizeLimitMin = effectiveWorkEnd * 60;
                if (isPlainFree) {
                  for (const t of sortedMins) {
                    if (t <= startMin) continue;
                    const hh2 = String(Math.floor(t / 60)).padStart(2, "0");
                    const mm2 = String(t % 60).padStart(2, "0");
                    const s2 = daySlots[`${hh2}:${mm2}`];
                    const s2Free = s2 && s2.available && !s2.vipOnly && !s2.privateOnly && !s2.adminBlocked && !s2.surcharge && !s2.fixedPrice;
                    if (!s2Free || slotCovered(t)) { resizeLimitMin = t; break; }
                  }
                }
                const maxDurMin = Math.max(settings.snapMin || 30, Math.min(resizeLimitMin - startMin, effectiveWorkEnd * 60 - startMin));
                const isBeingResized = freeResizePreview && freeResizePreview.dateStr===dateStrCol && freeResizePreview.time===time;
                const displayHeightMin = isBeingResized ? freeResizePreview.newDur : slotHeightMin;
                return (
                  <div key={`os-${time}`}
                    onPointerDown={e=>{
                      // isClosedDay НЕ блокує тут: слот, який реально існує на
                      // закритому дні (адмін відкрив вручну через довгий тап →
                      // "Вільний слот"), має лишатись керованим — інакше його
                      // неможливо було б ні скасувати, ні відредагувати без
                      // повного відкриття всього дня.
                      if (isPastDay) return;
                      // Заявляємо дотик БЕЗ stopPropagation — він, судячи з усього,
                      // заважає нативному touch-action панорамуванню на реальних
                      // мобільних браузерах (так само, як і в кейсі з заблокованим
                      // розкладом раніше). Батьківський порожній фон перевіряє
                      // slotClaimedRef і сам не відкриває своє меню "новий слот".
                      slotClaimedRef.current = true;
                      // preventDefault (без stopPropagation) — сигналізує браузеру, що
                      // цей дотик веде JS, а не нативне panning; touch-action:none нижче
                      // вже цього вимагає, тут лише явно про всяк випадок.
                      e.preventDefault();
                      if (scheduleLocked) {
                        // Замочок закритий — жодного drag/resize/модалки, лише дозволяємо
                        // будь-якому руху одразу передати керування ручному скролу. РАНІШЕ
                        // тут був голий return без цієї гілки — і саме тому свайп по
                        // вільному слоту знову не працював взагалі, поки розклад заблокований
                        // (touch-action:none блокує нативне панорамування, а керувати ручним
                        // скролом було нічому).
                        slotPressRef.current = { dateStr: dateStrCol, time, slot, startX: e.clientX, startY: e.clientY, lastY: e.clientY, locked: true };
                        return;
                      }
                      slotHoldFiredRef.current = false;
                      slotPressRef.current = { dateStr: dateStrCol, time, slot, startX: e.clientX, startY: e.clientY, lastY: e.clientY };
                      slotHoldTimerRef.current = setTimeout(()=>{
                        const sp = slotPressRef.current;
                        if (!sp) return;
                        slotHoldFiredRef.current = true;
                        navigator.vibrate?.(40);
                        if (isPlainFree) {
                          // Довгий тап "озброює" перетягування — з цього моменту рух пальця
                          // рухає слот; просте відпускання без руху відкриє модалку опцій
                          // (window onUp нижче, коли freeDragRef.moved лишився false).
                          freeDragRef.current = { dateStr: dateStrCol, time, slot, startClientY: sp.lastY, startClientX: sp.lastX ?? sp.startX, startMin, durMin: slotDurMin, moved: false, newStart: startMin };
                        } else {
                          setSlotOptions({ dateStr: dateStrCol, time, startTime: time, slot });
                        }
                      }, 600);
                    }}
                    onPointerMove={e=>{
                      const sp = slotPressRef.current;
                      if (!sp || slotHoldFiredRef.current) return; // після озброєння рухом керує freeDragRef
                      sp.lastY = e.clientY;
                      sp.lastX = e.clientX;
                      const dx = e.clientX - sp.startX;
                      const dy = e.clientY - sp.startY;
                      if (sp.locked) {
                        // Замочок закритий: жодного перетягування слота — будь-який рух
                        // (в будь-якому напрямку) одразу віддає жест ручному скролу.
                        if (Math.hypot(dx, dy) > 8) {
                          slotPressRef.current = null;
                          if (swipeRef.current) swipeRef.current.manualScroll = true;
                        }
                        return;
                      }
                      // Довгий тап ще не спрацював — будь-який достатній рух означає, що
                      // це НЕ утримання слота, тож завжди звільняємо жест і передаємо
                      // керування ручному скролу (сам скрол розбереться з віссю: dx>=dy —
                      // горизонтально, інакше вертикально), так само, як і в записів/locked.
                      // РАНІШЕ тут вимагалась ЯВНА горизонтальна перевага (dx>1.7dy), і рух
                      // із помітною вертикальною складовою просто "губився" без будь-якої
                      // передачі керування — свайп виглядав неробочим для звичайних, не
                      // ідеально горизонтальних дотиків.
                      if (Math.hypot(dx, dy) > 8) {
                        clearTimeout(slotHoldTimerRef.current);
                        slotPressRef.current = null;
                        if (swipeRef.current) swipeRef.current.manualScroll = true;
                      }
                    }}
                    onPointerUp={()=>{
                      const sp = slotPressRef.current;
                      // Короткий тап по звичайному вільному слоту — одразу позначає
                      // його приватним (жовтий), без проміжної модалки: відкриття
                      // модалки саме тут провокувало "привида-клік" на щойно
                      // змонтований оверлей (React встигав вставити його в DOM ще до
                      // приходу відкладеного click від того ж дотику), який миттєво
                      // її закривав.
                      const wasQuickTap = sp && !sp.locked && !slotHoldFiredRef.current;
                      clearTimeout(slotHoldTimerRef.current);
                      slotPressRef.current = null;
                      if (wasQuickTap && isPlainFree) {
                        navigator.vibrate?.(15);
                        applySlotOption(dateStrCol, time, "private");
                      }
                    }}
                    onPointerCancel={()=>{ clearTimeout(slotHoldTimerRef.current); slotPressRef.current = null; }}
                    onClick={e=>{
                      e.stopPropagation();
                      if (isPastDay || slotHoldFiredRef.current || isPlainFree) return;
                      toggleSlotFree(dateStrCol, time, slot);
                    }}
                    style={{
                      position:"absolute", left:0, right:0,
                      top: minToPx(displayStartMin) + 1,
                      height: displayHeightMin * PX_PER_MIN - 2,
                      opacity: isBeingDragged || isBeingResized ? 0.95 : isSticky ? 0.90 : 0.82,
                      background: bg,
                      border: `1.5px solid ${borderColor}`,
                      boxShadow: isBeingDragged || isBeingResized ? `0 4px 14px rgba(0,0,0,0.35)` : emptyShadow,
                      borderRadius:8, cursor: isPlainFree ? "grab" : "pointer", zIndex: isBeingDragged || isBeingResized ? 6 : 1,
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center",
                      padding:0,
                      transition: isBeingDragged || isBeingResized ? "none" : undefined,
                      // touch-action:none — нативне panning тут показало себе ненадійним
                      // (несистемно то скролило, то ні на тій самій білдці). "Смиканий"
                      // без інерції ручний JS-скрол, зате завжди детерміновано працює.
                      // На минулих днях onPointerDown одразу виходить (isPastDay) —
                      // drag/resize там не вмикаються, тож touch-action:none лишав би
                      // дотик по порожньому слоту "мертвим": ні нативне panning, ні
                      // ручний скрол. Тому там дозволяємо нативне panning як завжди.
                      // Закритий день (isClosedDay) тут НЕ виключаємо — слот, вручну
                      // відкритий на закритому дні, має лишатись повністю керованим.
                      touchAction: (isPlainFree && !isPastDay) ? "none" : "manipulation",
                      WebkitTouchCallout:"none", WebkitUserDrag:"none",
                      WebkitUserSelect:"none", userSelect:"none",
                    }}>
                    {hasFixedPrice ? (
                      <div style={{position:"absolute", top:0, left:0, width:34, height:34, overflow:"hidden", pointerEvents:"none"}}>
                        <div style={{
                          position:"absolute", top:6, left:-11, width:56, textAlign:"center",
                          transform:"rotate(-45deg)",
                          background:"rgba(74,222,128,0.95)", color:"#062910",
                          fontSize:8, fontWeight:800, lineHeight:1.5,
                          boxShadow:"0 1px 3px rgba(0,0,0,0.3)",
                        }}>{slot.fixedPrice}₴</div>
                      </div>
                    ) : hasSurcharge && <span style={{position:"absolute", top:3, left:4, fontSize:9, fontWeight:800, color:"rgba(247,201,72,0.95)", lineHeight:1}}>+{slot.surcharge}₴</span>}
                    {(isVip || slot.vipOnly) && <span style={{position:"absolute", top:3, right:4, fontSize:10, lineHeight:1}}>👑</span>}
                    {isPrivateOnly && <span style={{position:"absolute", top:3, right:4, fontSize:10, lineHeight:1}}>🚗</span>}

                    {hasViewer && <span style={{position:"absolute", bottom:3, right:4, fontSize:8, lineHeight:1, opacity:0.8}}>👁</span>}
                    {isBlocked && (() => { const qc = queueMap[`${dateStrCol}_${time}`]; return qc > 0 ? (
                      <div style={{position:"absolute", bottom:2, right:4, display:"flex", alignItems:"center", gap:1}}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill={GOLD}><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
                        <span style={{fontSize:7, fontWeight:800, color:GOLD, lineHeight:1}}>{qc}</span>
                      </div>
                    ) : null; })()}
                    {(isPlainFree || isPrivateOnly || isBlocked) && (displayHeightMin !== 60 || isBeingResized) && (
                      <span style={{
                        position:"absolute", top:3, left:"50%", transform:"translateX(-50%)",
                        fontSize:8, fontWeight:800, color, background:"rgba(0,0,0,0.25)",
                        padding:"1px 5px", borderRadius:5, lineHeight:1.3, whiteSpace:"nowrap", pointerEvents:"none",
                      }}>
                        {displayHeightMin % 60 === 0 ? `${displayHeightMin/60} год` : displayHeightMin < 60 ? `${displayHeightMin} хв` : `${Math.floor(displayHeightMin/60)}г ${displayHeightMin%60}хв`}
                      </span>
                    )}
                    {isPlainFree && !isPastDay && (
                      <div
                        onPointerDown={e=>{
                          if (scheduleLocked) return;
                          e.stopPropagation(); e.preventDefault();
                          clearTimeout(slotHoldTimerRef.current);
                          resizeHoldPosRef.current = { startX: e.clientX, startY: e.clientY, lastY: e.clientY };
                          resizeHoldTimerRef.current = setTimeout(()=>{
                            const rp = resizeHoldPosRef.current;
                            if (!rp) return;
                            navigator.vibrate?.(20);
                            freeResizeRef.current = { dateStr: dateStrCol, time, slot, startClientY: rp.lastY, startClientX: rp.startX, startDur: slotDurMin, maxDur: maxDurMin, moved: false, newDur: slotDurMin };
                          }, 600);
                        }}
                        onPointerMove={e=>{
                          const rp = resizeHoldPosRef.current;
                          if (!rp || freeResizeRef.current) return;
                          rp.lastY = e.clientY;
                          const dx = e.clientX - rp.startX;
                          const dy = e.clientY - rp.startY;
                          // Маленька ручка ресайзу на короткому слоті займає велику частку
                          // всієй висоти — дотик, що мав би бути свайпом днів, часто
                          // потрапляє саме сюди. Та сама симетрична перевірка ("яка вісь
                          // більша"), що й на самому слоті, передає керування скролу.
                          if (Math.hypot(dx, dy) > 8) {
                            clearTimeout(resizeHoldTimerRef.current);
                            resizeHoldPosRef.current = null;
                            if (Math.abs(dx) >= Math.abs(dy) && swipeRef.current) {
                              swipeRef.current.manualScroll = true;
                            }
                          }
                        }}
                        onPointerUp={()=>{
                          clearTimeout(resizeHoldTimerRef.current);
                          resizeHoldPosRef.current = null;
                          // Не покладаємось лише на window-рівневий pointerup (нижче) — на
                          // деяких WebView він іноді не долітає з цієї вкладеної ручки.
                          // Тримали без руху — відкриваємо модалку опцій прямо тут.
                          const fr = freeResizeRef.current;
                          if (fr && !fr.moved) {
                            freeResizeRef.current = null;
                            setFreeResizePreview(null);
                            setSlotOptions({ dateStr: fr.dateStr, time: fr.time, startTime: fr.time, slot: fr.slot });
                          } else if (!fr) {
                            // Короткий тап без утримання (ручка resize стоїть поверх слота
                            // й перехоплює дотик з onClick.stopPropagation нижче) — той самий
                            // ефект, що й тап деінде на вільному слоті.
                            toggleSlotFree(dateStrCol, time, slot);
                          }
                        }}
                        onPointerCancel={()=>{ clearTimeout(resizeHoldTimerRef.current); resizeHoldPosRef.current = null; }}
                        onClick={e=>e.stopPropagation()}
                        style={{
                          // Хіт-зона лишається ВСЕРЕДИНІ меж слота (bottom:0) — слоти йдуть впритул
                          // один до одного, і зона, що стирчить за межі власного div, потрапляє під
                          // сусідній слот у DOM-порядку та стає непроклацуваною. Пігулка (pointer-events:none)
                          // може візуально стирчати нижче — на перехоплення подій це вже не впливає.
                          position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)",
                          width:44, height:"10%",
                          display:"flex", alignItems:"flex-end", justifyContent:"center",
                          cursor:"ns-resize", touchAction:"none", zIndex:7,
                        }}
                      >
                        <div style={{width:26, height:8, borderRadius:5, background:borderColor, boxShadow:"0 2px 4px rgba(0,0,0,0.4)", pointerEvents:"none", transform:"translateY(5px)"}}/>
                      </div>
                    )}
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
              {bookings.filter(b=>b.day===absDay).sort((a,b)=>a.startMin-b.startMin).map(origB=>{
                if (origB.status === "cancelled") return null;
                // Сусідній (без розриву) запис того ж учня — "поглинутий" сусідньою карткою, не рендеримо окремо.
                const mi = mergeInfoMap[origB.id];
                if (mi?.hidden) return null;
                // Для першого запису об'єднаної групи — синтетична копія лише для геометрії/ціни картки
                // (клік відкриває деталі саме origB, щоб модалка й дії лишались "чесними" для одного запису).
                const b = mi?.mergedIds?.length
                  ? { ...origB, durMin: mi.mergedDurMin, _mergedIds: mi.mergedIds, _mergedPrice: mi.mergedPrice }
                  : origB;
                const wsMin = effectiveWorkStart * 60;
                const weMin = effectiveWorkEnd * 60;
                if (b.startMin >= weMin || b.startMin + b.durMin <= wsMin) return null;
                const visStart = Math.max(b.startMin, wsMin);
                const visEnd   = Math.min(b.startMin + b.durMin, weMin);
                const top    = minToPx(visStart);
                const height = (visEnd - visStart) * PX_PER_MIN;
                // На стиснутих слотах фіксовані 12px-хендли зверху+знизу (24px разом)
                // перекривали весь запис, не лишаючи місця для тапу "відкрити модалку" —
                // звужуємо хендли пропорційно висоті (разом ~1/3 слоту), лишаючи
                // тапабельний центр 2/3 висоти.
                const handleH = Math.min(12, Math.max(4, Math.floor(height / 6)));
                const c = slotColor(b);
                const isPending = b.status==="pending" && settings.pendingEnabled;
                const isCancelling = cancellingSet.has(b.id);
                const isBlock = b.type === "block";
                const isVipSlot = b.type === "vip-slot";
                const isPersonal = b.type === "personal";
                const slotTimeStr = String(Math.floor(b.startMin/60)).padStart(2,'0')+':'+String(b.startMin%60).padStart(2,'0');
                const queueCount = b.date ? (queueMap[`${b.date}_${slotTimeStr}`] || 0) : 0;
                const isPast = absDay < 0 || (absDay === 0 && b.startMin + b.durMin <= nowMin);
                const isLockedPast = settings.lockPastBookings && !isBlock && !isVipSlot && !isPersonal && isPast;
                const isDimmed = !isBlock && !isVipSlot && !isPersonal && (b.status==="noshow" || isCancelling || isLockedPast);
                const price = b._mergedPrice != null ? b._mergedPrice : computeBookingPrice(b, settings.services);
                return (
                  /* Обгортка — overflow:visible щоб значок не обрізався */
                  <div key={b.id} style={{
                    position:"absolute", top:top+1, left:0, right:0,
                    height:height-2, overflow:"visible",
                    zIndex: dragId===b.id?10:2,
                    background: BG_DEEP,
                    borderRadius: 8,
                  }}>
                    {/* Мітка (іспит/перевірка/1-й урок/борг/повтор) — бейдж-пігулка у
                        верхньому правому куті картки, під кутом (як цінник на маркерах карт).
                        Автоматична (за порядком уроку/сумою боргу), поки не змінена вручну.
                        Розмір шрифту/відступів і сама наявність тексту (проти лише іконки)
                        масштабуються під ширину колонки, щоб охайно виглядало і на
                        вузьких мобільних колонках, і на широких десктопних. */}
                    {!isBlock && !isVipSlot && !isPersonal && height >= 14 && (() => {
                      const curTag = effectiveTag(b);
                      if (!curTag) return null;
                      const tp = TAG_PRESETS.find(t => t.id === curTag);
                      if (!tp) return null;
                      const label = curTag === "debt" && b.debtAmount > 0 ? `${tp.label} ${b.debtAmount}₴` : tp.label;
                      const tagFs = Math.max(6, Math.min(9, Math.round(COL_W / 11)));
                      const showText = COL_W >= 34;
                      return (
                        <div style={{
                          position:"absolute", top:Math.round(tagFs * 0.9), right:2, zIndex:8,
                          pointerEvents:"none",
                        }}>
                          <div style={{
                            fontSize:tagFs, fontWeight:900, color:"#fff", lineHeight:1.3,
                            padding: showText ? `${Math.max(1, Math.round(tagFs*0.25))}px ${Math.max(5, Math.round(tagFs*0.85))}px` : "2px 3px",
                            borderRadius:999,
                            background:`linear-gradient(135deg, color-mix(in srgb, ${tp.color} 90%, #fff), ${tp.color})`,
                            boxShadow:"0 4px 10px rgba(0,0,0,0.45)",
                            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                            maxWidth: Math.max(18, COL_W - 6),
                            transform:"rotate(9deg)", transformOrigin:"top right",
                          }}>{showText ? `${tp.icon} ${label}` : tp.icon}</div>
                        </div>
                      );
                    })()}
                    {/* Сам слот */}
                    <div
                      className={`slot-base ${(isBlock||isPersonal)?"":"slot-colored"} ${!isBlock&&!isPersonal&&isPending?"slot-pending-ring":""} ${!isBlock&&!isPersonal&&holdId===b.id?"slot-holding":""} ${!isBlock&&!isPersonal&&shineId===b.id&&!isDimmed?"shine-active":""}`}
                      onPointerDown={e=>{
                        if (isLockedPast) {
                          // Заблокований минулий запис — редагування/перенесення заборонено,
                          // але свайп по картці все одно мусить гортати дні (як і по
                          // порожньому місцю), інакше день з минулими уроками "мертвий"
                          // для свайпу. Той самий шлях, що й для scheduleLocked.
                          e.stopPropagation();
                          pendingDragRef.current = { id:b.id, startClientY:e.clientY, startClientX:e.clientX, locked:true };
                          return;
                        }
                        onPointerDown(e,b,"move");
                      }}
                      onContextMenu={e=>e.preventDefault()}
                      onClick={e=>{
                        e.stopPropagation();
                        if(xJustShownRef.current){ xJustShownRef.current=false; return; }
                        if(quickCancelId){ xVisibleRef.current=false; setQuickCancelId(null); return; }
                        if(dragEndedRef.current) return;
                        if(isVipSlot){ setVipSlotModal(b); return; }
                        if(isBlock){ setBlockModal(b); return; }
                        if(isPersonal){
                          setPersonalEventView(b);
                          setPeEditTitle(b.name || "");
                          setPeEditDur(b.durMin || 60);
                          setPeEditNote(b.note || "");
                          setPeEditDate(b.date || absDayToDateStr(b.day));
                          setPeEditTime(fmtTime(b.startMin));
                          setPeEditReminderHours(b.reminderHours || null);
                          return;
                        }
                        if(isCancelling){
                          clearTimeout(cancelTimers.current[b.id]);
                          delete cancelTimers.current[b.id];
                          setCancellingSet(s=>{ const ns=new Set(s); ns.delete(b.id); return ns; });
                          return;
                        }
                        if(!dragRef.current){ setLocalSelectedBooking(origB); onSlotClick?.(origB); }
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
                        alignItems:"center", justifyContent:"center",
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
                      {/* Ресайз відключений на об'єднаній картці — невідомо, який із поглинутих записів стискати/розтягувати */}
                      {!b._mergedIds && !isLockedPast && <div className="slot-handle top" style={{height:handleH}} onPointerDown={e=>onPointerDown(e,b,"top")}/>}
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
                            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                            gap:1, overflow:"hidden", textAlign:"center",
                          }}>
                            <span style={{fontSize:Math.min(fs+1,11), lineHeight:1}}>📌</span>
                            {nameLines.slice(0,2).map((word,i)=>(
                              <div key={i} style={{
                                fontSize:fs, fontWeight:700, color:"#2dd4bf",
                                lineHeight:1.2, whiteSpace:"normal", textAlign:"center",
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
                        const typeLabel = b.type==="school" ? "Автошкола" : "Приватний";
                        const allLines = [
                          { text: fName,     w: 800, c: si(0.95) },
                          ...(lName          ? [{ text: lName,     w: 700, c: si(0.80) }] : []),
                          { text: typeLabel, w: 600, c: si(0.58) },
                          ...(priceText      ? [{ text: priceText, w: 900, c: priceColor, shadow: !!b.surcharge }] : []),
                        ];
                        // Верхні 9px зарезервовані під час старту уроку (праворуч зверху) —
                        // інакше прізвище/ім'я могли заходити під нього при малому зумі.
                        const availH = height - 15;
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
                            position:"absolute", top:11, left:2, right:2, bottom:2,
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
                                // Надбавка (GOLD) інакше зливається з жовтим кольором слоту —
                                // темна обводка тримає контраст на будь-якому фоні картки.
                                textShadow: ln.shadow ? "0 0 3px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.7)" : "none",
                              }}>{ln.text}</div>
                            ))}
                          </div>
                        );
                      })()}
                      {/* № уроку — кумулятивні години учня на момент цього уроку */}
                      {!isBlock && !isVipSlot && !isPersonal && cumulativeHoursMap[b.id] != null && height >= 20 && (
                        <div style={{
                          position:"absolute", top:2, left:2, zIndex:4,
                          width:10, height:10, borderRadius:"50%",
                          background:"rgba(20,20,24,0.85)", color:"rgba(255,255,255,0.75)",
                          border:"1px solid rgba(255,255,255,0.2)",
                          fontSize:6, fontWeight:900, lineHeight:1,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          pointerEvents:"none",
                        }}>{cumulativeHoursMap[b.id]}</div>
                      )}
                      {/* Час початку уроку — праворуч зверху. Опущено нижче, якщо на картці
                          є мітка (бейдж-пігулка), щоб час не перекривався нею. */}
                      {!isBlock && !isVipSlot && !isPersonal && height >= 14 && (
                        <div style={{
                          position:"absolute", top:effectiveTag(b) ? 16 : 2, right:3, zIndex:4,
                          fontSize:Math.min(8, Math.max(6, height/9)),
                          fontWeight:800, lineHeight:1, color:"rgba(0,0,0,0.8)",
                          pointerEvents:"none",
                          textShadow:"0 0 3px rgba(255,255,255,0.9), 0 0 1px rgba(255,255,255,0.9)",
                        }}>{b.time || fmtTime(b.startMin)}</div>
                      )}
                      {/* VIP crown badge for regular bookings marked as VIP — ліворуч зверху,
                          трохи правіше кружечка з к-стю уроків, щоб не перекривались */}
                      {b.isVipOnly && !isVipSlot && height >= 14 && (
                        <div style={{
                          position:"absolute", top:1, left: cumulativeHoursMap[b.id] != null && height >= 20 ? 13 : 2, zIndex:4,
                          fontSize:Math.min(11, Math.max(7, height/7)),
                          lineHeight:1, pointerEvents:"none",
                          filter:`drop-shadow(0 1px 3px ${shade(0.7)})`,
                        }}>👑</div>
                      )}
                      {/* Бейдж будильника — показує, що на подію виставлено нагадування */}
                      {isPersonal && b.reminderHours && height >= 14 && (
                        <div style={{
                          position:"absolute", top:3, right:3, zIndex:4,
                          fontSize:9, lineHeight:1,
                          filter:`drop-shadow(0 1px 2px ${shade(0.6)})`,
                          pointerEvents:"none",
                        }}>🔔</div>
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
                      {!b._mergedIds && !isLockedPast && <div className="slot-handle bottom" style={{height:handleH}} onPointerDown={e=>onPointerDown(e,b,"bottom")}/>}

                    </div>

                    {/* ── Значок скасування (довге натискання) — поза slot-base щоб не обрізатись ── */}
                    {quickCancelId===b.id && (
                      <div
                        onPointerDown={e=>e.stopPropagation()}
                        onClick={e=>{
                          e.stopPropagation();
                          xVisibleRef.current = false;
                          setQuickCancelId(null);
                          // Відновити слоти одразу як вільні (включно з phantom —
                          // раніше видалялись, і адмінка "губила" цей час зовсім)
                          if (b.startMin !== undefined && b.durMin) {
                            const dateStr = b.date || absDayToDateStr(b.day);
                            const slotUpd = {};
                            for (let i = 0; i < b.durMin; i += 30) {
                              const slotMin = b.startMin + i;
                              const hh = String(Math.floor(slotMin/60)).padStart(2,'0');
                              const mm = String(slotMin%60).padStart(2,'0');
                              const path = `timeslots/${dateStr}/slot${hh}${mm}`;
                              slotUpd[`${path}/available`]=true; slotUpd[`${path}/time`]=`${hh}:${mm}`; slotUpd[`${path}/phantom`]=null; slotUpd[`${path}/bookingStart`]=null;
                            }
                            update(iRef('/'), slotUpd).catch(()=>{});
                          }
                          // Прямий запис cancelled у Firebase одразу (не покладаємось на 2с-таймер)
                          const idsCancel = b._mergedIds || [b.id];
                          idsCancel.forEach(id => {
                            const mb = bookingsRef.current?.find(x => x.id === id) || (id === b.id ? b : null);
                            if (!mb?.userId) return;
                            const ks = [...new Set([mb._fbKey, mb.id].filter(Boolean))];
                            ks.forEach(k => update(iRef( `bookings/${mb.userId}/${k}`),
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
                  .reduce((s,b)=>s+computeBookingPrice(b, settings.services||[]),0);
                if (daySum<=0) return null;
                return (
                  <div style={{
                    // zIndex нижче за картки запису (zIndex:2, рядок ~2653) — щоб
                    // плашка суми лежала ПІД записами, а не ховала їх текст/ціну
                    // при скролі вниз, і показувалась лише над порожнім фоном.
                    position:"sticky", bottom:0, zIndex:1,
                    flexShrink:0, marginTop:4,
                    background:`linear-gradient(180deg, color-mix(in srgb, ${SURF_HI} 78%, transparent), color-mix(in srgb, ${SURFACE} 78%, transparent))`,
                    backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
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
          title="Сьогодні"
          style={{
            position:"absolute",
            bottom:4,
            right:8,
            zIndex:20,
            width:44,
            height:44,
            borderRadius:"50%",
            border:"none",
            background:BLUE,
            color:"#fff",
            cursor:"pointer",
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            boxShadow:"0 2px 10px rgba(0,0,0,0.3)",
            touchAction:"none",
          }}
        >
          {todayDir==="left" && <svg width="14" height="14" viewBox="0 0 10 10"><path d="M7 1L3 5l4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
          {todayDir==="right" && <svg width="14" height="14" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
        </button>
      )}
      </div>{/* /outer flex */}

    </Card>

    {/* Кнопка «📅 Місячний календар» — портується в шапку (по центру, замість лого; ключик — тепер у стовпці часу) */}
    {keyPortalEl && createPortal(
      <button
        onClick={openMonthCal}
        title="Місячний календар"
        style={{
          width:32, height:32, borderRadius:11, cursor:"pointer",
          background:`linear-gradient(135deg,color-mix(in srgb,${BLUE} 45%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
          border:`1px solid color-mix(in srgb,${BLUE} 35%,transparent)`,
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"background .15s", flexShrink:0,
        }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>
      </button>
    , keyPortalEl)}

    {showMonthCal && (
      <MonthCalendarSheet
        key={calOpenKey}
        bookings={bookings}
        onClose={()=>setShowMonthCal(false)}
        onPickDate={(dateStr)=>{ if (setJumpTarget) setJumpTarget({ date: dateStr, ts: Date.now() }); }}
      />
    )}

    <BookingModal booking={localSelectedBooking} onClose={()=>setLocalSelectedBooking(null)}
      onAction={handleAction} settings={settings} bookings={bookings} onViewStudent={onViewStudent}
      autoTag={localSelectedBooking ? getAutoTag(localSelectedBooking) : null}
      mergeInfo={(() => {
        const mi = localSelectedBooking && mergeInfoMap[localSelectedBooking.id];
        if (!mi?.mergedIds?.length) return null;
        return { durMin: mi.mergedDurMin, price: mi.mergedPrice, count: mi.mergedIds.length + 1 };
      })()}/>

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
                position:"relative",
                width:"100%",maxWidth:480,background:BG_DEEP,
                borderRadius:"24px 24px 0 0",
                boxShadow:`0 -2px 0 ${glow(0.08)}, 0 -16px 60px ${shade(0.8)}`,
                display:"flex",flexDirection:"column",overflow:"hidden",
                pointerEvents: blockModalClosing ? "none" : undefined,
                animation: blockModalClosing ? `_bl-down 0.26s ease-in forwards` : `_bl-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
              }}>
              <button onClick={_closeBlock} style={{
                position:"absolute", top:10, right:12, zIndex:5,
                width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
                background:"rgba(239,68,68,0.18)", color:"#ef4444",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontWeight:800, lineHeight:1,
              }}>✕</button>
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
            update(iRef( `timeslots/${addSlotPos.dateStr}/slot${hh}${mm}`), {
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
              position:"relative",
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
            {!_anyClose && (
              <button onClick={_closeLtm} style={{
                position:"absolute", top:8, right:12, zIndex:5,
                width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
                background:"rgba(239,68,68,0.18)", color:"#ef4444",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontWeight:800, lineHeight:1,
              }}>✕</button>
            )}
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
              {/* "Вільний слот" доступна і на закритому дні — адмін може вручну
                  відкрити окремий слот, не відкриваючи весь день: клієнт бачить
                  слоти напряму з timeslots/{date} незалежно від статусу дня. */}
              <button onClick={()=>{
                  const _sm = _menu.selectedMin ?? _menu.startMin;
                  const _hh = String(Math.floor(_sm/60)).padStart(2,'0');
                  const _mm = String(_sm%60).padStart(2,'0');
                  // lunchOverride — сигнал клієнтському застосунку не ховати
                  // цей слот своїм окремим фільтром обідньої перерви (він
                  // фільтрує за часом незалежно від того, чи слот реально
                  // існує в базі) — адмін відкрив його вручну саме на цей час.
                  update(iRef( `timeslots/${_menu.dateStr}/slot${_hh}${_mm}`), { available: true, time: `${_hh}:${_mm}`, lunchOverride: true }).catch(()=>{});
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
                const _sm = _menu.selectedMin ?? _menu.startMin;
                const today = new Date(); today.setHours(0,0,0,0);
                const dayOffset = Math.round((new Date(_menu.dateStr + "T12:00:00") - today) / 86400000);
                setFormData({ day: Math.max(0, dayOffset), startMin: _sm });
                _scatterLtm();
              }} style={{
                flex:1,padding:"16px 8px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",
                background:"rgba(99,102,241,0.1)",
                color:"#818cf8",fontSize:12,fontWeight:800,
                display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                border:"1px solid rgba(99,102,241,0.22)",
                ...(ltmScatter ? {animation:`_ltm-sc-c 0.28s ease-in forwards`} : {}),
              }}>
                <span style={{fontSize:24}}>📝</span>
                Додати запис
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
      const _closeSO = () => { setFixedPriceEditing(false); setSlotClosing(true); };
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
              position:"relative",
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
            <button onClick={_closeSO} style={{
              position:"absolute", top:10, right:12, zIndex:5,
              width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
              background:"rgba(239,68,68,0.18)", color:"#ef4444",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:13, fontWeight:800, lineHeight:1,
            }}>✕</button>
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
              {/* Додати запис */}
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
                <span>👤</span> Додати запис
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
              {/* Приватний слот */}
              <button onClick={()=>applySlotOption(_so.dateStr, fmtTime(_soSelMin), "private")} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(234,179,8,0.09)",borderRadius:12,
                color:"#eab308",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span>🚗</span> Приватний слот
                {_so.slot?.privateOnly && <span style={{marginLeft:"auto",fontSize:11,color:"#eab308",opacity:0.7}}>✓ активний</span>}
              </button>
              {/* Фіксована ціна — повністю замінює тарифну ціну послуги для цього слота */}
              <button onClick={()=>{
                setFixedPriceInput(_so.slot?.fixedPrice != null ? String(_so.slot.fixedPrice) : "");
                setFixedPriceEditing(v=>!v);
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(74,222,128,0.09)",borderRadius:12,
                color:GREEN,fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span>💰</span> Фіксована ціна
                {_so.slot?.fixedPrice != null && <span style={{marginLeft:"auto",fontSize:11,color:GREEN,opacity:0.8}}>{_so.slot.fixedPrice}₴</span>}
              </button>
              {fixedPriceEditing && (
                <div style={{display:"flex",gap:8,padding:"2px 2px 6px"}}>
                  <input type="number" min={0} step={50} autoFocus value={fixedPriceInput}
                    onChange={e=>setFixedPriceInput(e.target.value)}
                    placeholder="Сума, ₴"
                    style={{flex:1,padding:"10px 12px",borderRadius:10,border:`1px solid ${ink(0.12)}`,background:BG_DEEP,color:TEXT,fontSize:14,fontWeight:700,fontFamily:"inherit"}}/>
                  {_so.slot?.fixedPrice != null && (
                    <button onClick={()=>{ applySlotOption(_so.dateStr, fmtTime(_soSelMin), "fixedPrice_remove"); setFixedPriceEditing(false); }} style={{
                      padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
                      background:"rgba(239,68,68,0.12)",color:"#f87171",fontSize:13,fontWeight:700,
                    }}>Скинути</button>
                  )}
                  <button onClick={()=>{
                    const n = Math.max(0, parseInt(fixedPriceInput, 10) || 0);
                    if (!fixedPriceInput || n <= 0) return;
                    applySlotOption(_so.dateStr, fmtTime(_soSelMin), { fixedPrice: n });
                    setFixedPriceEditing(false);
                  }} style={{
                    padding:"10px 16px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
                    background:GREEN,color:"#062910",fontSize:13,fontWeight:800,
                  }}>Застосувати</button>
                </div>
              )}
              {/* Заблокувати / Розблокувати слот */}
              <button onClick={()=>{
                toggleSlotFree(_so.dateStr, fmtTime(_soSelMin), _so.slot);
                _closeSO();
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background: _so.slot?.adminBlocked ? "rgba(34,197,94,0.09)" : "rgba(239,68,68,0.09)",
                borderRadius:12,
                color: _so.slot?.adminBlocked ? GREEN : "#f87171",
                fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span>{_so.slot?.adminBlocked ? "🔓" : "🚫"}</span>
                {_so.slot?.adminBlocked ? "Розблокувати слот" : "Заблокувати слот"}
              </button>
              {/* Видалити слот повністю */}
              <button onClick={()=>{
                deleteSlot(_so.dateStr, fmtTime(_soSelMin));
                _closeSO();
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(239,68,68,0.09)",borderRadius:12,
                color:"#f87171",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span>🗑️</span> Видалити слот
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
              {(_so.slot?.vipOnly || _so.slot?.privateOnly || _so.slot?.surcharge || _so.slot?.fixedPrice) && (
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
                position:"relative",
                width:"100%",maxWidth:480,background:BG_DEEP,
                borderRadius:"24px 24px 0 0",
                boxShadow:`0 -2px 0 rgba(168,85,247,0.4), 0 -16px 60px ${shade(0.8)}`,
                display:"flex",flexDirection:"column",overflow:"hidden",
                pointerEvents: vipSlotModalClosing ? "none" : undefined,
                animation: vipSlotModalClosing ? `_vip-down 0.26s ease-in forwards` : `_vip-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
              }}>
              <button onClick={_closeVip} style={{
                position:"absolute", top:10, right:12, zIndex:5,
                width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
                background:"rgba(239,68,68,0.18)", color:"#ef4444",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontWeight:800, lineHeight:1,
              }}>✕</button>
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
                  update(iRef( `timeslots/${dateStr}/slot${hh}${mm}`), { vipOnly: false }).catch(() => {});
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
            status: b.status, hours: b.hoursDone || 0,
            createdAt: Date.now(), createdBy: "admin",
            ...(b.note && { note: b.note }),
          };
          if (b.userId) {
            update(iRef( `bookings/${b.userId}/${b.id}`), fbData).catch(()=>{});
          } else {
            // Клієнт без акаунту (гість) — пишемо в той самий bookings/ дерево під
            // синтетичним guest_<телефон> uid, а не в окремий bookings_by_phone.
            // Інакше запис невидимий для власного розкладу/списків адмінки і не
            // отримує жодної логіки з onBookingChanged (блокування слоту, синк
            // з Google Calendar, звільнення черги тощо).
            const phone = (b.phone || '').replace(/\D/g, '');
            if (phone) {
              update(iRef( `bookings/guest_${phone}/${b.id}`), fbData).catch(()=>{});
              // Дзеркалимо у users/, звідки читається вкладка "Учні" — інакше
              // гість видно тільки в розкладі/бронюваннях, а не в списку учнів.
              const studentRef = iRef( `users/guest_${phone}`);
              get(studentRef).then(s => {
                if (s.exists()) {
                  update(studentRef, { name: b.name, phone: b.phone }).catch(()=>{});
                } else {
                  update(studentRef, {
                    name: b.name, phone: b.phone, type: b.type || "private",
                    discount: 0, notes: "", blocked: false, isVip: false, hours: 0,
                    createdAt: Date.now(),
                  }).catch(()=>{});
                }
              }).catch(()=>{});
            }
          }
        }
        if (b.date && b.startMin !== undefined && b.durMin) {
          // Миттєво блокуємо слоти в UI, не чекаючи round-trip через onBookingChanged.
          const slotUpd = {};
          for (let i = 0; i < b.durMin; i += 30) {
            const slotMin = b.startMin + i;
            const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
            const sm = String(slotMin % 60).padStart(2, '0');
            slotUpd[`timeslots/${b.date}/slot${sh}${sm}/available`] = false;
            slotUpd[`timeslots/${b.date}/slot${sh}${sm}/time`] = `${sh}:${sm}`;
            // Явний прапорець реального старту бронювання — клієнт показує лише
            // його, а не кожен 30-хвилинний блок. Без цього при записах впритул
            // одне до одного неможливо відрізнити "продовження" від "нового старту"
            // лише за відстанню між позначками.
            slotUpd[`timeslots/${b.date}/slot${sh}${sm}/bookingStart`] = i === 0;
          }
          update(iRef(), slotUpd).catch(() => {});
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
        const fbData = {
          id: b.id, date: b.date, time: fmtTime(b.startMin),
          startMin: b.startMin, durMin: b.durMin,
          studentName: b.name, name: b.name, note: b.note || "",
          type: "personal", status: "personal",
          reminderHours: b.reminderHours || null, reminderSent: false,
          createdAt: Date.now(), createdBy: "admin",
        };
        update(iRef( `bookings/personal/${b.id}`), fbData).catch(() => {});
        blockPersonalSlots(b.date, b.startMin, b.durMin);
        setBookings(bs => [...bs, { ...b, userId: "personal", _fbKey: b.id }]);
        setPersonalEventData(null);
      }}
    />

    {/* Редагування особистої події */}
    {personalEventView && (
      <div onClick={()=>setPersonalEventView(null)} style={{
        position:"fixed",inset:0,zIndex:200,background:`${shade(0.6)}`,
        display:"flex",alignItems:"center",justifyContent:"center",
        backdropFilter:"blur(8px)",
      }}>
        <div onClick={e=>e.stopPropagation()} style={{
          width:300,background:BG_DEEP,
          borderRadius:20,overflow:"hidden",
          boxShadow:`0 8px 40px ${shade(0.7)}, 0 0 0 1.5px rgba(45,212,191,0.3)`,
        }}>
          <div style={{
            padding:"14px 16px 12px",
            background:"rgba(45,212,191,0.1)",
            borderBottom:"1px solid rgba(45,212,191,0.15)",
          }}>
            <div style={{fontSize:13,fontWeight:800,color:"#2dd4bf"}}>📌 Особиста подія</div>
          </div>
          <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Назва</div>
              <input
                value={peEditTitle}
                onChange={e=>setPeEditTitle(e.target.value)}
                style={{
                  width:"100%",padding:"9px 11px",borderRadius:11,
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              />
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Дата</div>
                <input
                  type="date"
                  value={peEditDate}
                  onChange={e=>setPeEditDate(e.target.value)}
                  style={{
                    width:"100%",padding:"9px 11px",borderRadius:11,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                />
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Час</div>
                <div style={{display:"flex",gap:6}}>
                  <select
                    value={peEditTime.split(":")[0] || "09"}
                    onChange={e=>setPeEditTime(`${e.target.value}:${peEditTime.split(":")[1] || "00"}`)}
                    style={{
                      flex:1,padding:"9px 4px",borderRadius:11,
                      background:SURF_LO,border:`1px solid ${BORDER}`,
                      color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                    }}
                  >
                    {Array.from({length:24},(_,h)=>String(h).padStart(2,"0")).map(h=>(
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    value={peEditTime.split(":")[1] || "00"}
                    onChange={e=>setPeEditTime(`${peEditTime.split(":")[0] || "09"}:${e.target.value}`)}
                    style={{
                      flex:1,padding:"9px 4px",borderRadius:11,
                      background:SURF_LO,border:`1px solid ${BORDER}`,
                      color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                    }}
                  >
                    {["00","05","10","15","20","25","30","35","40","45","50","55"].map(m=>(
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Тривалість</div>
              <div style={{display:"flex",gap:6}}>
                <select
                  value={String(Math.floor(peEditDur/60))}
                  onChange={e=>setPeEditDur(Math.max(15, Number(e.target.value)*60 + (peEditDur%60)))}
                  style={{
                    flex:1,padding:"9px 4px",borderRadius:11,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                >
                  {[0,1,2,3,4,5].map(h=>(
                    <option key={h} value={h}>{h} год</option>
                  ))}
                </select>
                <select
                  value={String(peEditDur%60).padStart(2,"0")}
                  onChange={e=>setPeEditDur(Math.max(15, Math.floor(peEditDur/60)*60 + Number(e.target.value)))}
                  style={{
                    flex:1,padding:"9px 4px",borderRadius:11,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                >
                  {["00","15","30","45"].map(m=>(
                    <option key={m} value={m}>{m} хв</option>
                  ))}
                </select>
              </div>
              <div style={{display:"flex",gap:4,marginTop:6}}>
                {[1,2,3,4,5].map(h=>(
                  <button key={h} onClick={()=>setPeEditDur(h*60)} style={{
                    flex:1,padding:"5px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
                    background: peEditDur===h*60 ? "rgba(45,212,191,0.2)" : SURFACE,
                    color: peEditDur===h*60 ? "#2dd4bf" : DIM,
                  }}>{h}г</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Нотатка</div>
              <textarea
                value={peEditNote}
                onChange={e=>setPeEditNote(e.target.value)}
                rows={2}
                style={{
                  width:"100%",padding:"9px 11px",borderRadius:11,resize:"none",
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              />
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>⏰ Нагадування з будильником</div>
              <select
                value={peEditReminderHours ?? ""}
                onChange={e=>setPeEditReminderHours(e.target.value === "" ? null : Number(e.target.value))}
                style={{
                  width:"100%",padding:"9px 11px",borderRadius:11,
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              >
                <option value="">Без нагадування</option>
                <option value="0.25">За 15 хв</option>
                <option value="0.5">За 30 хв</option>
                <option value="1">За 1 годину</option>
                <option value="2">За 2 години</option>
                <option value="4">За 4 години</option>
                <option value="24">За 1 день</option>
              </select>
            </div>
            <button
              disabled={!peEditTitle.trim()}
              onClick={savePersonalEventEdit}
              style={{
                width:"100%",padding:"12px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",
                background: peEditTitle.trim() ? "linear-gradient(145deg,#2dd4bf,#14b8a6)" : ink(0.07),
                color: peEditTitle.trim() ? "#fff" : FAINT,
                fontSize:14,fontWeight:800,
              }}
            >Зберегти</button>
          </div>
          <button
            onClick={deletePersonalEvent}
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
    {dayNotesModal && (
      <DayNotesModal
        dateStr={dayNotesModal.dateStr}
        dayLabel={dayNotesModal.dayLabel}
        dayNum={dayNotesModal.dayNum}
        dayMonth={dayNotesModal.dayMonth}
        note={dayNotes[dayNotesModal.dateStr]}
        settings={settings}
        onClose={() => setDayNotesModal(null)}
      />
    )}
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
    await update(iRef(), updates).catch(() => {});
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
            position:"relative",
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.12)}, 0 -16px 60px ${shade(0.6)}`,
            overflow:"hidden",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_cs-down 0.26s ease-in forwards` : `_cs-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <button onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
            background:"rgba(239,68,68,0.18)", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}>✕</button>
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
// Ціна послуги на конкретну дату уроку: якщо задано nextPrice/nextPriceFrom
// і дата уроку вже досягла nextPriceFrom — використовуємо нову ціну.
function effectivePrice(svc, dateStr) {
  if (!svc) return 0;
  if (svc.nextPrice != null && svc.nextPriceFrom && dateStr && dateStr >= svc.nextPriceFrom) {
    return svc.nextPrice;
  }
  return svc.price;
}

function computeBookingPrice(b, services) {
  if (b.manualPrice != null) return b.manualPrice;
  // Індивідуальна фікс. ціна учня (₴/год у картці учня) — виставляється
  // адміном вручну і діє на всі уроки цього учня замість тарифу послуги;
  // знижка при цьому не застосовується (ціна вже персональна).
  if (b.customPrice != null) {
    const base = Math.round((b.customPrice / 60) * b.durMin);
    return Math.max(0, Math.round(base + (b.surcharge || 0)));
  }
  const svc = services.find(s => s.id === b.serviceId)
           || services.find(s => s.active && s.type===(b.serviceType||b.type) && Number(s.duration)===b.durMin);
  const dateStr = b.date || (() => {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + (b.day || 0));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const base = svc
    ? Math.round((effectivePrice(svc, dateStr) / svc.duration) * b.durMin)
    : b.price && b.durationHours
      ? Math.round((b.price / (b.durationHours * 60)) * b.durMin)
      : (b.price || 0);
  // Знижка учня (грн/год, фіксована сума) — діє на годину, тож масштабується
  // на тривалість запису (2 год = знижка ×2). Не застосовується там, де ціну
  // виставлено вручну (manualPrice — свідомий override адміна).
  const discount = (b.discount || 0) * (b.durMin / 60);
  return Math.max(0, Math.round(base + (b.surcharge || 0) - discount));
}

function BookingModal({ booking, onClose, onAction, settings, bookings, onViewStudent, mergeInfo, autoTag }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const [queueEntries, setQueueEntries] = useState([]);
  const [closing, setClosing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draftPrice, setDraftPrice] = useState("");
  const [draftDur, setDraftDur] = useState("");
  const [editRate, setEditRate] = useState(0);
  const [maneuverState, setManeuverState] = useState({});
  const [maneuverCounts, setManeuverCounts] = useState({});
  const [maneuverResults, setManeuverResults] = useState({});
  const [allBadges, setAllBadges] = useState({});
  const [badgePickerOpen, setBadgePickerOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [debtInput, setDebtInput] = useState("");
  useEffect(() => { setDebtInput(booking?.debtAmount ? String(booking.debtAmount) : ""); }, [booking?.id]);
  const [filmingConsent, setFilmingConsent] = useState(null);
  useEffect(() => {
    if (!booking || !booking.userId) { setFilmingConsent(null); return; }
    const r = iRef( `users/${booking.userId}/profile/filmingConsent`);
    const unsub = onValue(r, snap => setFilmingConsent(snap.exists() ? snap.val() : null));
    return () => unsub();
  }, [booking]);
  useEffect(() => {
    if (!booking) return;
    setClosing(false);
    setEditOpen(false);
    const dateStr = booking.date || (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() + booking.day);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const hh = String(Math.floor(booking.startMin/60)).padStart(2,'0');
    const mm = String(booking.startMin%60).padStart(2,'0');
    const slotKey = `${dateStr}_${hh}:${mm}`;
    const r = iRef( `queue/${slotKey}/entries`);
    const unsub = onValue(r, snap => {
      if (!snap.exists()) { setQueueEntries([]); return; }
      const entries = Object.values(snap.val())
        .filter(e => e.status === 'waiting')
        .sort((a,b) => (a.addedAt||0) - (b.addedAt||0));
      setQueueEntries(entries);
    });
    return () => unsub();
  }, [booking]);

  // Маневри: залипаюча відмітка "відпрацьовано в цьому уроці" (на бронюванні) +
  // накопичувальний лічильник за весь час (на профілі учня).
  useEffect(() => {
    if (!booking) return;
    setManeuverState(booking.maneuvers || {});
    setManeuverResults(booking.maneuverResults || {});
    setBadgePickerOpen(false);
    setTagPickerOpen(false);
    if (!booking.userId) { setManeuverCounts({}); setAllBadges({}); return; }
    const r = iRef( `users/${booking.userId}/maneuverCounts`);
    const unsub = onValue(r, snap => setManeuverCounts(snap.val() || {}));
    const rb = iRef( `users/${booking.userId}/badges`);
    const unsubB = onValue(rb, snap => setAllBadges(snap.val() || {}));
    return () => { unsub(); unsubB(); };
  }, [booking]);

  const toggleManeuver = (key) => {
    if (!booking || maneuverState[key]) return;
    setManeuverState(s => ({ ...s, [key]: true }));
    setManeuverResults(s => ({ ...s, [key]: "success" }));
    update(iRef( `bookings/${booking.userId}/${booking.id}/maneuvers`), { [key]: true }).catch(()=>{});
    update(iRef( `bookings/${booking.userId}/${booking.id}/maneuverResults`), { [key]: "success" }).catch(()=>{});
    update(iRef( `users/${booking.userId}/maneuverCounts`), { [key]: increment(1) }).catch(()=>{});
    update(iRef( `users/${booking.userId}/maneuverSuccessCounts`), { [key]: increment(1) }).catch(()=>{});
  };

  // Перемикач "вдало/невдало" — доступний лише для вже відпрацьованого в
  // цьому уроці маневру. За замовчуванням маневр рахується вдалим (щоб не
  // додавати зайвий тап на типовий кейс); адмін може позначити невдалу спробу.
  const toggleManeuverResult = (key) => {
    if (!booking || !maneuverState[key]) return;
    const next = (maneuverResults[key] || "success") === "success" ? "fail" : "success";
    setManeuverResults(s => ({ ...s, [key]: next }));
    update(iRef( `bookings/${booking.userId}/${booking.id}/maneuverResults`), { [key]: next }).catch(()=>{});
    update(iRef( `users/${booking.userId}/maneuverSuccessCounts`), { [key]: increment(next === "success" ? 1 : -1) }).catch(()=>{});
  };

  // Медаль за конкретний урок — прив'язана до booking.id, тому клієнт може
  // показати її саме біля цього завершеного запису, а не загальним списком.
  const awardBookingBadge = (icon, label) => {
    if (!booking) return;
    fbPush(iRef( `users/${booking.userId}/badges`), { icon, label, awardedAt: Date.now(), bookingId: booking.id }).catch(()=>{});
    setBadgePickerOpen(false);
  };
  const removeBookingBadge = (badgeId) => {
    if (!booking) return;
    remove(iRef( `users/${booking.userId}/badges/${badgeId}`)).catch(()=>{});
  };

  // booking може стати null синхронно (напр. cancel обнуляє вибір), поки closing=true.
  // Guard "!booking && !closing" пропускав такий кадр далі й падав на booking.serviceId
  // (сірий екран). Достатньо: немає booking — нічого не рендеримо. Анімацію закриття це
  // не ламає — при звичайному закритті booking лишається до кінця анімації (onClose на animationEnd).
  if (!booking) return null;

  // Минулий запис при увімкненому settings.lockPastBookings — заборонено
  // редагувати ціну/тривалість і скасовувати (перенос теж заблокований —
  // окремо, на рівні drag у ScheduleView).
  const isPastLocked = (() => {
    if (!settings.lockPastBookings) return false;
    const dateStr = booking.date || (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() + booking.day);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const endMs = new Date(dateStr + "T00:00:00").getTime() + (booking.startMin + (booking.durMin||60)) * 60000;
    return endMs <= Date.now();
  })();

  const bSvcs = settings.services || [];
  const bType = booking.serviceType || booking.type;
  const svc   = bSvcs.find(s => s.id === booking.serviceId)
             || bSvcs.find(s => s.active && s.type===bType && Number(s.duration)===booking.durMin)
             || bSvcs.find(s => s.type===bType && Number(s.duration)===booking.durMin)
             || bSvcs.find(s => s.active && s.type===bType)
             || bSvcs.find(s => s.type===bType);
  const c     = colorOf(svc?.colorId);
  const day = booking.date
    ? (() => { const d = new Date(booking.date + "T12:00:00"); const dow = (d.getDay()+6)%7; return { num:d.getDate(), month:_MLABELS[d.getMonth()], label:_DLABELS[dow], fullLabel:_DLABELS_FULL[dow], wk:dow>=5 }; })()
    : getDayInfo(booking.day);
  // Сусідні записи цього учня об'єднані на картці розкладу — тут показуємо
  // сумарну ціну й тривалість (booking сам лишається одним "чесним" записом
  // для дій: скасувати/неявка/повтор/редагування діють лише на нього).
  const durMinDisplay = mergeInfo ? mergeInfo.durMin : booking.durMin;
  const discountAmtDisplay = (booking.discount && booking.customPrice == null) ? Math.round(booking.discount * booking.durMin / 60) : 0;
  const price = mergeInfo ? mergeInfo.price : computeBookingPrice(booking, settings.services);
  const ini   = booking.name.trim().split(" ").slice(0, 2).map(w => w[0]).join("");
  // Порядковий номер цього уроку серед усіх уроків учня (без особистих подій
  // і скасованих) — бейдж у шапці картки запису.
  const lessonNumber = (() => {
    if (booking.type === "personal") return null;
    const studentLessons = (bookings || [])
      .filter(x => x.userId === booking.userId && x.status !== "cancelled" && x.type !== "personal")
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.startMin - b.startMin));
    const idx = studentLessons.findIndex(x => x.id === booking.id);
    return idx >= 0 ? idx + 1 : studentLessons.length + 1;
  })();
  const typeLabel = booking.type === "school" ? "🎓 Автошкола" : "🚗 Приватний";

  const sameDayBookings = (bookings || []).filter(x =>
    x.id !== booking.id && x.status !== "cancelled" &&
    (booking.date ? x.date === booking.date : x.day === booking.day)
  );
  const otherDayTotal = sameDayBookings.reduce((sum, x) => sum + computeBookingPrice(x, settings.services), 0);
  const nextStart = sameDayBookings
    .filter(x => x.startMin > booking.startMin)
    .reduce((min, x) => Math.min(min, x.startMin), Infinity);
  const maxDurMin = nextStart === Infinity ? 360 : Math.max(15, nextStart - booking.startMin);

  const openEdit = () => {
    // Редагування завжди діє лише на цей окремий запис — навіть якщо картка
    // об'єднана, стартуємо від його власної (не сумарної) ціни.
    const ownPrice = mergeInfo ? computeBookingPrice(booking, settings.services) : price;
    setDraftPrice(String(ownPrice));
    setDraftDur(String(booking.durMin));
    setEditRate(booking.durMin > 0 ? ownPrice / booking.durMin : 0);
    setEditOpen(true);
  };
  const onDurChange = (v) => {
    setDraftDur(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && editRate) setDraftPrice(String(Math.round(editRate * n)));
  };
  const saveEdit = () => {
    const p = Math.max(0, parseInt(draftPrice, 10) || 0);
    const d = Math.min(maxDurMin, Math.max(15, parseInt(draftDur, 10) || booking.durMin));
    onAction("editBooking", { ...booking, manualPrice: p, durMin: d, durationHours: d / 60 });
    setEditOpen(false);
  };

  const IcoPhone = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 4.14 6.18 2 2 0 0 1 6.12 4h3a2 2 0 0 1 2 1.72c.13 1 .37 1.98.72 2.91a2 2 0 0 1-.45 2.11L10 12a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.93.35 1.91.59 2.91.72A2 2 0 0 1 22 16.92z"/></svg>;
  const IcoChat  = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
  const IcoProfile = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>;
  const IcoHistory = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>;

  const _close = () => setClosing(true);

  return (
    <>
      <style>{`
        @keyframes _bm-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _bm-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _bm-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _bm-bg-out{from{opacity:1}to{opacity:0}}
        ._bm-press{transition:transform .12s ease,opacity .12s ease}
        ._bm-press:active{transform:scale(0.94);opacity:0.85}
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
            position:"relative",
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
          <button onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
            background:"rgba(239,68,68,0.18)", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}>✕</button>

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
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <div style={{fontSize:15,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{booking.name}</div>
                  {lessonNumber != null && (
                    <span style={{
                      fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:99,flexShrink:0,
                      background:`${BLUE}1f`,color:BLUE,
                    }}>🚗 {lessonNumber}-й урок</span>
                  )}
                </div>
                <div style={{fontSize:10,color:c,fontWeight:700,marginTop:1}}>{typeLabel}</div>
              </div>
            </div>
            {filmingConsent != null && (
              <div style={{
                display:"flex", alignItems:"center", gap:6, marginTop:8,
                background:`${filmingConsent ? GREEN : RED}1f`,
                border:`1px solid ${filmingConsent ? GREEN : RED}44`,
                borderRadius:8, padding:"5px 9px",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={filmingConsent ? GREEN : RED} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>
                  <circle cx="12" cy="13" r="3.2"/>
                  {!filmingConsent && <line x1="2" y1="2" x2="22" y2="22"/>}
                </svg>
                <span style={{fontSize:10.5,fontWeight:700,color:filmingConsent ? GREEN : RED}}>{filmingConsent ? "Дозвіл на зйомку відео/аудіо" : "Зйомка заборонена"}</span>
              </div>
            )}
          </div>

          {/* Кнопка редагування ціни/тривалості */}
          {!editOpen && !isPastLocked && (
            <div style={{padding:"10px 16px 0"}}>
              <button onClick={openEdit} style={{
                width:"100%",padding:"10px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",
                background:`${GREEN}1f`,color:GREEN,fontSize:13,fontWeight:800,
                display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              }}>✎ Редагувати ціну і час</button>
            </div>
          )}

          {/* Edit sheet: ціна/тривалість */}
          {editOpen && (
            <div style={{padding:"12px 16px",background:ink(0.03),borderBottom:`1px solid ${ink(0.06)}`}}>
              <div style={{textAlign:"center",fontSize:10,fontWeight:700,color:GOLD,marginBottom:10}}>
                Разом за день: {otherDayTotal + (parseInt(draftPrice,10)||0)}₴
              </div>
              <div style={{display:"flex",gap:10,marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:TEXT_FAINT,textTransform:"uppercase",marginBottom:5,textAlign:"center"}}>Тривалість, хв</div>
                  <input type="number" min={15} max={maxDurMin} step={5} value={draftDur}
                    onChange={e=>onDurChange(e.target.value)}
                    style={{width:"100%",textAlign:"center",padding:"9px 6px",borderRadius:10,border:`1px solid ${ink(0.1)}`,background:BG_DEEP,color:TEXT,fontSize:14,fontWeight:800,fontFamily:"inherit"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:TEXT_FAINT,textTransform:"uppercase",marginBottom:5,textAlign:"center"}}>Ціна, ₴</div>
                  <input type="number" min={0} step={50} value={draftPrice}
                    onChange={e=>setDraftPrice(e.target.value)}
                    style={{width:"100%",textAlign:"center",padding:"9px 6px",borderRadius:10,border:`1px solid ${ink(0.1)}`,background:BG_DEEP,color:TEXT,fontSize:14,fontWeight:800,fontFamily:"inherit"}}/>
                </div>
              </div>
              <div style={{fontSize:9,color:TEXT_FAINT,textAlign:"center",marginBottom:10}}>
                Макс. тривалість зараз: {maxDurMin}хв · ціна перераховується автоматично при зміні тривалості
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setEditOpen(false)} style={{flex:1,padding:"9px",borderRadius:11,border:"none",cursor:"pointer",fontFamily:"inherit",background:ink(0.06),color:TEXT_DIM,fontSize:12.5,fontWeight:700}}>Скасувати</button>
                <button onClick={saveEdit} style={{flex:1,padding:"9px",borderRadius:11,border:"none",cursor:"pointer",fontFamily:"inherit",background:GREEN,color:"#0a0d0a",fontSize:12.5,fontWeight:800}}>Зберегти</button>
              </div>
            </div>
          )}

          {/* Info grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:ink(0.04)}}>
            {[
              { label:"Дата",  val:`${day.num} ${day.month}`, sub:day.label },
              { label:"Час",   val:`${fmtTime(booking.startMin)}`, sub:`–${fmtTime(booking.startMin+durMinDisplay)}` },
              { label:"Ціна",  val:`${price}₴`, sub: mergeInfo ? `${mergeInfo.count} записи, ${durMinDisplay}хв` : booking.surcharge && discountAmtDisplay ? `+${booking.surcharge}₴ / −${discountAmtDisplay}₴` : booking.surcharge ? `+${booking.surcharge}₴` : discountAmtDisplay ? `−${discountAmtDisplay}₴ знижка` : (svc ? `${svc.duration}хв` : "—"), gold: !!booking.surcharge && !mergeInfo },
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

          {/* Маневри */}
          <div style={{padding:"10px 14px 0"}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:TEXT_FAINT,textTransform:"uppercase",marginBottom:6}}>
              🚗 Маневри
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {[
                { key:"rozvorot",   label:"Розворот" },
                { key:"parking90",  label:"Паркування 90" },
                { key:"parking45",  label:"Паркування 45" },
              ].map(m => {
                const active = !!maneuverState[m.key];
                const count = maneuverCounts[m.key] || 0;
                const isSuccess = (maneuverResults[m.key] || "success") === "success";
                return (
                  <div key={m.key} style={{position:"relative"}}>
                    <button onClick={() => toggleManeuver(m.key)} style={{
                      width:"100%", fontFamily:"inherit",
                      background: active ? `linear-gradient(155deg,${PURPLE},color-mix(in srgb,${PURPLE} 55%,#000))` : BG_DEEP,
                      border:`1.5px solid ${active ? PURPLE : ink(0.1)}`,
                      borderRadius:12, padding:"10px 4px",
                      textAlign:"center", fontSize:10.5, fontWeight:700,
                      color: active ? "#fff" : TEXT_DIM,
                      cursor: active ? "default" : "pointer",
                      boxShadow: active ? `0 3px 12px ${PURPLE}66` : "none",
                    }}>
                      {m.label}
                    </button>
                    <div style={{
                      position:"absolute", top:-7, right:-6,
                      background:GOLD, color:"#1a1200", fontSize:9, fontWeight:900,
                      width:18, height:18, borderRadius:"50%",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      border:`2px solid ${BG_DEEP}`, pointerEvents:"none",
                    }}>{count}</div>
                    {active && (
                      <div onClick={() => toggleManeuverResult(m.key)} style={{
                        position:"absolute", bottom:-7, right:-6,
                        background: isSuccess ? GREEN : RED, color:"#fff", fontSize:10, fontWeight:900,
                        width:18, height:18, borderRadius:"50%",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        border:`2px solid ${BG_DEEP}`, cursor:"pointer",
                      }} title={isSuccess ? "Вдало (тап — позначити невдало)" : "Невдало (тап — позначити вдало)"}>
                        {isSuccess ? "✓" : "✕"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Медаль за урок — прив'язана до цього booking, видно учню біля завершеного запису */}
          <div style={{padding:"10px 14px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:TEXT_FAINT,textTransform:"uppercase"}}>
                🏅 Медаль за урок
              </div>
              <div onClick={() => setBadgePickerOpen(o => !o)} style={{
                fontSize:11,fontWeight:800,color:GOLD,cursor:"pointer",padding:"2px 8px",
                borderRadius:8,background:`${GOLD}22`,
              }}>{badgePickerOpen ? "Закрити" : "+ Додати"}</div>
            </div>
            {Object.entries(allBadges).filter(([,b])=>b.bookingId===booking.id).length > 0 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:badgePickerOpen?8:0}}>
                {Object.entries(allBadges).filter(([,b])=>b.bookingId===booking.id).map(([bid,b])=>(
                  <div key={bid} onClick={()=>removeBookingBadge(bid)} title="Тап — прибрати" style={{
                    display:"flex",alignItems:"center",gap:5,padding:"5px 9px",borderRadius:20,
                    background:`${GOLD}18`,border:`1px solid ${GOLD}44`,cursor:"pointer",
                  }}>
                    <span style={{fontSize:14}}>{b.icon}</span>
                    <span style={{fontSize:11,fontWeight:700,color:TEXT}}>{b.label}</span>
                  </div>
                ))}
              </div>
            )}
            {badgePickerOpen && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,paddingBottom:4}}>
                {BADGE_PRESETS.map((bp,i)=>(
                  <button key={i} onClick={()=>awardBookingBadge(bp.icon,bp.label)} style={{
                    display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                    padding:"9px 4px",borderRadius:12,border:`1px solid ${ink(0.1)}`,cursor:"pointer",
                    background:BG_DEEP,fontFamily:"inherit",
                  }}>
                    <span style={{fontSize:18}}>{bp.icon}</span>
                    <span style={{fontSize:9,fontWeight:700,color:TEXT_DIM,textAlign:"center",lineHeight:1.2}}>{bp.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Мітка — booking.tag/tagManual, якщо ручна; інакше показуємо автотег
              (за порядком уроку/сумою боргу), рахований у батьківському компоненті. */}
          {(() => {
            const displayTag = booking.tagManual ? (booking.tag || null) : (booking.tag || autoTag || null);
            const isAuto = !booking.tagManual && !booking.tag && !!autoTag;
            return (
              <div style={{padding:"10px 14px",borderBottom:`1px solid ${ink(0.06)}`}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:TEXT_FAINT,textTransform:"uppercase"}}>
                    🏷️ Мітка {isAuto && <span style={{color:TEXT_FAINT,textTransform:"none",letterSpacing:0}}>(авто)</span>}
                  </div>
                  <div onClick={() => setTagPickerOpen(o => !o)} style={{
                    fontSize:11,fontWeight:800,color:GOLD,cursor:"pointer",padding:"2px 8px",
                    borderRadius:8,background:`${GOLD}22`,
                  }}>{tagPickerOpen ? "Закрити" : (displayTag ? "Змінити" : "+ Додати")}</div>
                </div>
                {displayTag && !tagPickerOpen && (() => {
                  const tp = TAG_PRESETS.find(t=>t.id===displayTag);
                  if (!tp) return null;
                  const label = displayTag === "debt" && booking.debtAmount > 0 ? `${tp.label} ${booking.debtAmount}₴` : tp.label;
                  return (
                    <div onClick={()=>onAction("setTag",{...booking,tag:null})} title="Тап — прибрати" style={{
                      display:"inline-flex",alignItems:"center",gap:5,padding:"5px 9px",borderRadius:20,
                      background:`${tp.color}18`,border:`1px solid ${tp.color}44`,cursor:"pointer",
                    }}>
                      <span style={{fontSize:14}}>{tp.icon}</span>
                      <span style={{fontSize:11,fontWeight:700,color:TEXT}}>{label}</span>
                    </div>
                  );
                })()}
                {displayTag === "debt" && !tagPickerOpen && (
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:7}}>
                    <input
                      type="number" inputMode="decimal" min="0"
                      placeholder="Сума боргу, ₴"
                      value={debtInput}
                      onChange={e=>setDebtInput(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter") onAction("setTag",{...booking,tag:"debt",debtAmount:Number(debtInput)||0}); }}
                      style={{
                        flex:1,padding:"7px 10px",borderRadius:10,
                        border:`1px solid ${ink(0.1)}`,background:BG_DEEP,color:TEXT,
                        fontSize:12,outline:"none",boxSizing:"border-box",
                      }}
                    />
                    <button onClick={()=>onAction("setTag",{...booking,tag:"debt",debtAmount:Number(debtInput)||0})} style={{
                      padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
                      background:`${GOLD}22`,color:GOLD,fontSize:12,fontWeight:800,
                    }}>Зберегти</button>
                  </div>
                )}
                {tagPickerOpen && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7,paddingTop:displayTag?8:0}}>
                    {TAG_PRESETS.map(tp=>(
                      <button key={tp.id} onClick={()=>{ onAction("setTag",{...booking,tag: displayTag===tp.id?null:tp.id}); setTagPickerOpen(false); }} style={{
                        display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                        padding:"9px 4px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",
                        border: displayTag===tp.id ? `1.5px solid ${tp.color}` : `1px solid ${ink(0.1)}`,
                        background: displayTag===tp.id ? `${tp.color}22` : BG_DEEP,
                      }}>
                        <span style={{fontSize:15}}>{tp.icon}</span>
                        <span style={{fontSize:11,fontWeight:700,color:TEXT_DIM}}>{tp.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

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
                      <button onClick={() => update(iRef(), {
                        [`queue/${slotKey}/entries/${e.uid}`]: null,
                        [`userQueue/${e.uid}/${slotKey}`]: null,
                      }).catch(()=>{})}
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
          <div style={{padding:"10px 10px 0",display:"flex",gap:8}}>
            <button onClick={() => onAction("call", booking)} style={{
              flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              padding:"11px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`${GREEN}1f`,color:GREEN,fontSize:13,fontWeight:800,
            }}>{IcoPhone} Дзвонити</button>
            <button onClick={() => onAction("chat", booking)} style={{
              flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              padding:"11px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`rgba(${GLOW},0.1)`,color:BLUE,fontSize:13,fontWeight:800,
            }}>{IcoChat} Чат</button>
          </div>
          <div style={{padding:"8px 10px 4px",display:"flex",gap:8}}>
            <button onClick={() => onViewStudent?.(booking.userId, false)} style={{
              flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              padding:"11px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`${PURPLE}1f`,color:PURPLE,fontSize:13,fontWeight:800,
            }}>{IcoProfile} Профіль</button>
            <button onClick={() => onViewStudent?.(booking.userId, true)} style={{
              flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              padding:"11px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`${GOLD}1f`,color:GOLD,fontSize:13,fontWeight:800,
            }}>{IcoHistory} Історія</button>
          </div>

          {/* Cancel link */}
          {isPastLocked ? (
            <div style={{
              width:"100%",padding:"10px",textAlign:"center",
              borderTop:`1px solid ${ink(0.05)}`,
              color:TEXT_FAINT,fontSize:10.5,fontWeight:600,
              marginTop:4,marginBottom:20,
            }}>🔒 Минулий запис — редагування й скасування заблоковано</div>
          ) : (
            <button onClick={() => { onAction("cancel", booking); _close(); }} style={{
              width:"100%",padding:"10px",border:"none",cursor:"pointer",
              background:"none",borderTop:`1px solid ${ink(0.05)}`,
              color:"rgba(248,113,113,0.7)",fontSize:11,fontWeight:600,
              marginTop:4,marginBottom:20,
            }}>Скасувати запис</button>
          )}

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

  const [title,          setTitle]          = useState("");
  const [durMin,         setDurMin]         = useState(60);
  const [note,           setNote]           = useState("");
  const [peDate,         setPeDate]         = useState("");
  const [peTime,         setPeTime]         = useState("");
  const [reminderHours,  setReminderHours]  = useState(null);
  const [closing,        setClosing]        = useState(false);
  const [pendingEvent,   setPendingEvent]   = useState(null);

  useEffect(() => {
    if (data) { setTitle(""); setDurMin(60); setNote(""); setPeDate(data.dateStr); setPeTime(data.time); setReminderHours(null); }
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data && !closing) return null;

  const [hh, mm] = peTime.split(":").map(Number);
  const startMin = hh * 60 + mm;
  const today = new Date(); today.setHours(0,0,0,0);
  const slotDate = new Date(peDate + "T00:00:00");
  const day = Math.round((slotDate - today) / 86400000);
  const canSave = title.trim().length > 0;

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
            position:"relative",
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 rgba(45,212,191,0.3), 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_pe-down 0.26s ease-in forwards` : `_pe-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <button onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
            background:"rgba(239,68,68,0.18)", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}>✕</button>
          <div style={{
            padding:"10px 18px 14px",
            background:"linear-gradient(145deg,rgba(45,212,191,0.12),rgba(20,184,166,0.05))",
            borderBottom:"1px solid rgba(45,212,191,0.15)",
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:"rgba(45,212,191,0.35)",margin:"0 auto 12px"}}/>
            <div style={{fontSize:18,fontWeight:800,color:"#2dd4bf",marginBottom:2}}>📌 Особиста подія</div>
            <div style={{fontSize:12,color:DIM}}>{peDate} · {peTime}</div>
          </div>

          <div style={{padding:"16px 18px 32px",display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>✎</div>
              <div style={{flex:1,minWidth:0}}>
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
            </div>

            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>📅</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Дата</div>
                <input
                  type="date"
                  value={peDate}
                  onChange={e=>setPeDate(e.target.value)}
                  style={{
                    width:"100%",padding:"10px 12px",borderRadius:12,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                />
              </div>
            </div>

            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🕐</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Час</div>
                <div style={{display:"flex",gap:6}}>
                  <select
                    value={peTime.split(":")[0] || "09"}
                    onChange={e=>setPeTime(`${e.target.value}:${peTime.split(":")[1] || "00"}`)}
                    style={{flex:1,padding:"9px 4px",borderRadius:10,background:SURF_LO,border:`1px solid ${BORDER}`,color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}
                  >
                    {Array.from({length:24},(_,h)=>String(h).padStart(2,"0")).map(h=>(
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    value={peTime.split(":")[1] || "00"}
                    onChange={e=>setPeTime(`${peTime.split(":")[0] || "09"}:${e.target.value}`)}
                    style={{flex:1,padding:"9px 4px",borderRadius:10,background:SURF_LO,border:`1px solid ${BORDER}`,color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}
                  >
                    {["00","05","10","15","20","25","30","35","40","45","50","55"].map(m=>(
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>⏱</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Тривалість</div>
                <div style={{display:"flex",gap:6}}>
                  <select
                    value={String(Math.floor(durMin/60))}
                    onChange={e=>setDurMin(Math.max(15, Number(e.target.value)*60 + (durMin%60)))}
                    style={{
                      flex:1,padding:"9px 4px",borderRadius:10,
                      background:SURF_LO,border:`1px solid ${BORDER}`,
                      color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                    }}
                  >
                    {[0,1,2,3,4,5].map(h=>(
                      <option key={h} value={h}>{h} год</option>
                    ))}
                  </select>
                  <select
                    value={String(durMin%60).padStart(2,"0")}
                    onChange={e=>setDurMin(Math.max(15, Math.floor(durMin/60)*60 + Number(e.target.value)))}
                    style={{
                      flex:1,padding:"9px 4px",borderRadius:10,
                      background:SURF_LO,border:`1px solid ${BORDER}`,
                      color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                    }}
                  >
                    {["00","15","30","45"].map(m=>(
                      <option key={m} value={m}>{m} хв</option>
                    ))}
                  </select>
                </div>
                <div style={{display:"flex",gap:4,marginTop:6}}>
                  {[1,2,3,4,5].map(h=>(
                    <button key={h} onClick={()=>setDurMin(h*60)} style={{
                      flex:1,padding:"5px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
                      background: durMin===h*60 ? "rgba(45,212,191,0.2)" : SURF_HI,
                      color: durMin===h*60 ? "#2dd4bf" : DIM,
                    }}>{h}г</button>
                  ))}
                </div>
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

            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>⏰</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Нагадування з будильником</div>
                <select
                  value={reminderHours ?? ""}
                  onChange={e=>setReminderHours(e.target.value === "" ? null : Number(e.target.value))}
                  style={{
                    width:"100%",padding:"10px 12px",borderRadius:12,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                >
                  <option value="">Без нагадування</option>
                  <option value="0.25">За 15 хв</option>
                  <option value="0.5">За 30 хв</option>
                  <option value="1">За 1 годину</option>
                  <option value="2">За 2 години</option>
                  <option value="4">За 4 години</option>
                  <option value="24">За 1 день</option>
                </select>
              </div>
            </div>

            <button
              disabled={!canSave}
              onClick={()=>{
                if (!canSave) return;
                setPendingEvent({
                  id: `personal-${Date.now()}`,
                  day, date: peDate,
                  startMin, durMin,
                  name: title.trim(),
                  note: note.trim(),
                  type: "personal",
                  status: "personal",
                  reminderHours,
                  wasAdminBlocked: (peDate === data.dateStr && peTime === data.time) ? !!data.slot?.adminBlocked : false,
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
  const [debtAmount, setDebtAmount] = useState("");
  const [students,   setStudents]   = useState([]);
  const [closing,    setClosing]    = useState(false);

  useEffect(()=>{
    const r = iRef( "users");
    const handler = onValue(r, snap => {
      const d = snap.val() || {};
      setStudents(Object.entries(d).map(([uid, u]) => {
        const p = u.profile || {};
        return { id:uid, name:p.name||u.name||"Учень", phone:p.phone||u.phone||"" };
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
      setNewName(""); setNewPhone(""); setNote("");
      setDebtAmount("");
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
  const readyToConfirm = finalName.length > 1 && !!selSvc && timeVal != null;
  const canConfirm  = readyToConfirm && !!finalPhone;
  const missingPhone = readyToConfirm && !finalPhone;

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
      hoursDone:0, categoryId:null, isVipOnly:false,
      userId: (!isNewStudent && selStudent?.id) ? selStudent.id : null,
      ...(note.trim() && { note:note.trim() }),
      ...(Number(debtAmount) > 0 && { debtAmount: Number(debtAmount) }),
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
            position:"relative",
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
          <button onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
            background:"rgba(239,68,68,0.18)", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}>✕</button>

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
                  {filtered.map(s=>(
                    <div key={s.id} onClick={()=>{setSelStudent(s);setPhone(s.phone);setSearch("");}}
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

          {/* СУМА БОРГУ — якщо вказано, запис автоматично отримає мітку "Борг" */}
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="Сума боргу, ₴ (необов'язково)..."
            value={debtAmount}
            onChange={e=>setDebtAmount(e.target.value)}
            style={{
              padding:"10px 13px",borderRadius:12,
              border:`1.5px solid ${BORDER}`,
              background:SURFACE_LO,color:TEXT,fontSize:13,outline:"none",
            }}
          />

          {missingPhone && (
            <div style={{fontSize:12,color:ACCENT,textAlign:"center",marginTop:-4}}>
              Вкажіть телефон учня, щоб зберегти запис
            </div>
          )}

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
        <SectionTitle>Підтвердження записів</SectionTitle>
        <Row label="Вимагати підтвердження" hint="Нові записи отримують статус 'Очікує' до твого підтвердження">
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
        <Row label="Учень може переносити свої записи">
          <Toggle on={settings.studentCanReschedule} onChange={v=>upd("studentCanReschedule",v)}/>
        </Row>
        <Row label="Учень може скасовувати записи">
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
        <Row label="Повідомлення про підтвердження запису">
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
        <Row label="FIFO" hint="Автоматично записати першого в черзі (без підтвердження)">
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
        <div style={{fontSize:12,color:TEXT_DIM,marginBottom:14}}>Де показувати нові записи та повідомлення:</div>
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
        <div style={{fontSize:12,color:DIM,marginBottom:14}}>Ручна розсилка повідомлень активним учням про вільний слот</div>
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
// STUDENTS VIEW — список учнів з редагуванням даних
// ═══════════════════════════════════════════════════════════════
function StudentsView() {
  const { BG_DEEP, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI, GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow  = a => `rgba(${GLOW},${a})`;
  const ink   = a => `rgba(${INK},${a})`;
  const AH = ACC_HI, FT = FAINT, DM = DIM, SLO = SURF_LO, SO2 = SO, SI2 = SI;

  const [students,     setStudents]     = useState([]);
  const [bookingCounts,setBookingCounts]= useState({});
  const [search,       setSearch]       = useState("");
  const [editing,      setEditing]      = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [savedUid,     setSavedUid]     = useState(null);

  useEffect(() => {
    const r = iRef( "users");
    const unsub = onValue(r, snap => {
      const d = snap.val() || {};
      setStudents(Object.entries(d).map(([uid, u]) => {
        const p = u.profile || {};
        return { uid, name: p.name||u.name||"Учень", phone: p.phone||u.phone||"", blocked: !!u.blocked };
      }).filter(s => s.name !== "Учень" || s.phone));
    });
    return () => off(r, "value", unsub);
  }, []);

  useEffect(() => {
    const r = iRef( "bookings");
    const unsub = onValue(r, snap => {
      const d = snap.val() || {};
      const counts = {};
      for (const [uid, bks] of Object.entries(d)) {
        counts[uid] = Object.values(bks).filter(b => b.status !== "cancelled").length;
      }
      setBookingCounts(counts);
    });
    return () => off(r, "value", unsub);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? students.filter(s => s.name.toLowerCase().includes(q) || s.phone.includes(q)) : [...students];
    return list.sort((a, b) => {
      const ca = bookingCounts[a.uid] || 0, cb = bookingCounts[b.uid] || 0;
      if (ca !== cb) return cb - ca;
      return a.name.localeCompare(b.name, "uk");
    });
  }, [students, search, bookingCounts]);

  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      await update(iRef( `users/${editing.uid}/profile`), {
        name: editing.name.trim(), phone: editing.phone.trim(),
      });
      const bSnap = await get(iRef( `bookings/${editing.uid}`));
      if (bSnap.exists()) {
        const upd = {};
        bSnap.forEach(child => {
          const b = child.val();
          if (b && b.status !== "cancelled") {
            upd[`bookings/${editing.uid}/${child.key}/studentName`] = editing.name.trim();
            upd[`bookings/${editing.uid}/${child.key}/name`] = editing.name.trim();
          }
        });
        if (Object.keys(upd).length) await update(iRef(), upd);
      }
      setSavedUid(editing.uid);
      setTimeout(() => setSavedUid(null), 2500);
      setEditing(null);
    } catch (e) { console.error("saveEdit", e); }
    finally { setSaving(false); }
  };

  const inputSt = {
    width:"100%", boxSizing:"border-box",
    background:`linear-gradient(135deg,${BG_DEEP},${SLO})`,
    border:"none", outline:"none", color:TEXT, fontSize:14,
    padding:"10px 13px", borderRadius:12, boxShadow:SI2, fontFamily:"inherit",
  };
  const btnBase = { border:"none", cursor:"pointer", borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700 };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>

      <div style={{
        display:"flex", alignItems:"center", gap:8,
        padding:"10px 14px", borderRadius:14,
        background:`linear-gradient(135deg,${BG_DEEP},${SLO})`,
        boxShadow:SI2, marginBottom:2,
      }}>
        <span style={{fontSize:15}}>🔍</span>
        <input placeholder="Пошук за ім'ям або телефоном..."
          value={search} onChange={e=>setSearch(e.target.value)}
          style={{flex:1,background:"none",border:"none",outline:"none",color:TEXT,fontSize:14}}/>
        {search && <button onClick={()=>setSearch("")}
          style={{background:"none",border:"none",cursor:"pointer",color:FT,fontSize:18,padding:0,lineHeight:1}}>×</button>}
      </div>

      <div style={{fontSize:11,color:FT,paddingLeft:4,marginBottom:2}}>{filtered.length} учнів</div>

      {filtered.map(s => {
        const isEditing = editing?.uid === s.uid;
        const isSaved   = savedUid === s.uid;
        const cnt = bookingCounts[s.uid] || 0;
        const cntLabel = cnt === 1 ? "1 запис" : cnt < 5 ? `${cnt} записи` : `${cnt} записів`;
        return (
          <Card key={s.uid} style={{padding:"14px 16px"}}>
            {isEditing ? (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:11,color:FT,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:2}}>Редагування</div>
                <input placeholder="Ім'я та прізвище" value={editing.name}
                  onChange={e=>setEditing(v=>({...v,name:e.target.value}))} style={inputSt}/>
                <input placeholder="+380..." type="tel" value={editing.phone}
                  onChange={e=>setEditing(v=>({...v,phone:e.target.value}))} style={inputSt}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEditing(null)}
                    style={{...btnBase,flex:1,background:ink(0.06),color:DM}}>Скасувати</button>
                  <button onClick={saveEdit} disabled={saving||!editing.name.trim()}
                    style={{...btnBase,flex:2,background:`linear-gradient(165deg,${AH},${ACCENT})`,color:"#fff",opacity:saving?0.7:1}}>
                    {saving?"Збереження...":"Зберегти"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{
                  width:40,height:40,borderRadius:20,flexShrink:0,
                  background:`linear-gradient(135deg,${glow(0.15)},${glow(0.05)})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:16,fontWeight:800,color:ACCENT,
                  boxShadow:`inset 0 0 0 1.5px ${glow(0.2)}`,
                }}>{s.name.trim()[0]?.toUpperCase()||"?"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:2}}>{s.name}</div>
                  <div style={{fontSize:12,color:DM}}>{s.phone||"телефон не вказано"}</div>
                  {cnt>0 && <div style={{fontSize:11,color:FT,marginTop:2}}>{cntLabel}</div>}
                  {s.blocked && <div style={{fontSize:11,color:"#ef4444",marginTop:2}}>заблокований</div>}
                </div>
                {isSaved && <div style={{fontSize:12,color:GREEN,fontWeight:700,flexShrink:0}}>✓</div>}
                <button onClick={()=>setEditing({uid:s.uid,name:s.name,phone:s.phone})}
                  style={{...btnBase,padding:"7px 12px",fontSize:12,background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,color:DM,boxShadow:SO2}}>
                  ✏️ Ред.
                </button>
              </div>
            )}
          </Card>
        );
      })}

      {filtered.length===0 && (
        <div style={{textAlign:"center",padding:"30px 0",color:FT,fontSize:13}}>
          {search?"Не знайдено":"Учнів поки немає"}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUB for other tabs
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// TEMPLATES VIEW — редагування шаблонів повідомлень + лог
// ═══════════════════════════════════════════════════════════════
function TemplatesView() {
  const { BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI, GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SLO=SURF_LO, DM=DIM, FT=FAINT, AH=ACC_HI, SO2=SO, SI2=SI;

  const ADMIN_UID = auth.currentUser?.uid || "admin";

  const DEFAULTS = {
    booking_confirmed: { title:"✅ Запис підтверджено", body:"{name}, чекаємо тебе {daySlot} 🎯" },
    booking_cancelled: { title:"❌ Запис скасовано",   body:"Запис {dateLabel} о {time} відмінено. Оберіть інший час ↩️" },
    lesson_reminder:   { title:"⏰ Нагадування про урок", body:"{name}, завтра урок о {time} 🚗 Чекаємо!" },
  };
  const TMETA = [
    { type:"booking_confirmed", label:"✅ Підтвердження запису",
      vars:["{name}","{daySlot}","{time}","{date}"],
      sample:{ name:"Маргарита", daySlot:"понеділок 7 липня о 10:00", time:"10:00", date:"2025-07-07", dateLabel:"7 липня" } },
    { type:"booking_cancelled", label:"❌ Скасування запису",
      vars:["{name}","{dateLabel}","{time}","{date}"],
      sample:{ name:"Маргарита", daySlot:"понеділок 7 липня о 14:00", time:"14:00", date:"2025-07-07", dateLabel:"7 липня" } },
    { type:"lesson_reminder",   label:"⏰ Нагадування про урок",
      vars:["{name}","{time}","{date}"],
      sample:{ name:"Маргарита", daySlot:"завтра о 10:00", time:"10:00", date:"2025-07-07", dateLabel:"7 липня" } },
  ];
  const applyV = (str, vars) => (str||"").replace(/\{(\w+)\}/g, (_,k) => vars[k] ?? `{${k}}`);

  const [drafts,   setDrafts]   = useState({ ...DEFAULTS });
  const [saved,    setSaved]    = useState({});
  const [testSent, setTestSent] = useState({});
  const [log,      setLog]      = useState([]);

  useEffect(() => {
    const r = iRef( "pushTemplates");
    const unsub = onValue(r, snap => {
      const data = snap.val() || {};
      setDrafts(prev => {
        const next = { ...prev };
        for (const type of Object.keys(DEFAULTS)) {
          if (data[type]) next[type] = { title: data[type].title || DEFAULTS[type].title, body: data[type].body || DEFAULTS[type].body };
        }
        return next;
      });
    });
    return () => off(r, "value", unsub);
  }, []);

  useEffect(() => {
    const r = iRef( "pushLog");
    const unsub = onValue(r, snap => {
      if (!snap.exists()) { setLog([]); return; }
      const items = [];
      snap.forEach(child => items.push({ id: child.key, ...child.val() }));
      items.sort((a, b) => (b.sentAt||0) - (a.sentAt||0));
      setLog(items.slice(0, 50));
    });
    return () => off(r, "value", unsub);
  }, []);

  const save = async (type) => {
    await update(iRef( `pushTemplates/${type}`), drafts[type]).catch(()=>{});
    setSaved(s => ({ ...s, [type]:true }));
    setTimeout(() => setSaved(s => ({ ...s, [type]:false })), 2000);
  };

  const sendTest = async (type) => {
    const meta  = TMETA.find(m => m.type === type);
    const draft = drafts[type];
    await fbPush(iRef( "adminPush"), {
      uid:   ADMIN_UID,
      title: applyV(draft.title, meta.sample),
      body:  applyV(draft.body,  meta.sample),
      url:   "/cabinet", test: true,
    });
    setTestSent(s => ({ ...s, [type]:true }));
    setTimeout(() => setTestSent(s => ({ ...s, [type]:false })), 3000);
  };

  const fmtTs = ts => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("uk",{day:"numeric",month:"short"}) + " " +
           d.toLocaleTimeString("uk",{hour:"2-digit",minute:"2-digit"});
  };
  const TYPE_LABELS = {
    booking_confirmed:"✅ Підтверд.", booking_cancelled:"❌ Скасування",
    lesson_reminder:"⏰ Нагадування", admin:"💬 Особистий",
    slot_free:"🚗 Вільний слот", queue_offer:"🎉 Черга",
    admin_alert:"🔔 Адміну",
  };

  const inputSt = {
    width:"100%", boxSizing:"border-box",
    background:`linear-gradient(135deg,${BG_DEEP},${SLO})`,
    border:"none", outline:"none", color:TEXT, fontSize:13,
    padding:"10px 13px", borderRadius:12, boxShadow:SI2,
    fontFamily:"inherit", resize:"none",
  };
  const btnBase = { border:"none", cursor:"pointer", borderRadius:10, padding:"7px 14px", fontSize:12, fontWeight:700 };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {TMETA.map(meta => {
        const draft = drafts[meta.type] || DEFAULTS[meta.type];
        return (
          <Card key={meta.type} style={{padding:20}}>
            <SectionTitle right={
              <button onClick={()=>save(meta.type)} style={{
                ...btnBase,
                background:`linear-gradient(165deg,${AH},${ACCENT})`,
                color:"#fff", boxShadow:`inset 1px 1px 0 ${glow(0.25)}`,
                opacity: saved[meta.type] ? 0.7 : 1,
              }}>{saved[meta.type] ? "✓ Збережено" : "Зберегти"}</button>
            }>{meta.label}</SectionTitle>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:FT,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Заголовок</div>
              <input value={draft.title}
                onChange={e=>setDrafts(s=>({...s,[meta.type]:{...s[meta.type],title:e.target.value}}))}
                style={inputSt}/>
            </div>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:FT,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Текст</div>
              <textarea rows={2} value={draft.body}
                onChange={e=>setDrafts(s=>({...s,[meta.type]:{...s[meta.type],body:e.target.value}}))}
                style={inputSt}/>
            </div>

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
              {meta.vars.map(v=>(
                <span key={v}
                  onClick={()=>setDrafts(s=>({...s,[meta.type]:{...s[meta.type],body:s[meta.type].body+v}}))}
                  style={{cursor:"pointer",fontSize:11,fontFamily:"monospace",background:glow(0.07),color:ACCENT,borderRadius:6,padding:"2px 8px",border:`1px solid ${glow(0.14)}`,userSelect:"none"}}
                >{v}</span>
              ))}
              <span style={{fontSize:11,color:FT}}>— вставити змінну</span>
            </div>

            <div style={{padding:"12px 14px",borderRadius:14,background:ink(0.04),border:`1px solid ${ink(0.06)}`,marginBottom:12}}>
              <div style={{fontSize:10,color:FT,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Превью</div>
              <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:2}}>{applyV(draft.title,meta.sample)}</div>
              <div style={{fontSize:12,color:DM,lineHeight:1.4}}>{applyV(draft.body,meta.sample)}</div>
            </div>

            <button onClick={()=>sendTest(meta.type)} style={{
              ...btnBase, width:"100%", padding:"10px 0", fontSize:13,
              background: testSent[meta.type]
                ? `linear-gradient(165deg,${GREEN}cc,${GREEN}88)`
                : `linear-gradient(165deg,${ACCENT},${AH})`,
              color:"#fff",
              boxShadow: testSent[meta.type] ? "none" : `inset 1px 1px 0 ${glow(0.25)},0 2px 8px ${ACCENT}44`,
            }}>{testSent[meta.type] ? "✓ Повідомлення надіслано" : "📲 Надіслати тестове повідомлення"}</button>
          </Card>
        );
      })}

      <Card style={{padding:20}}>
        <SectionTitle>Лог надісланих повідомлень</SectionTitle>
        {log.length===0 ? (
          <div style={{fontSize:13,color:DM,textAlign:"center",padding:"20px 0"}}>Поки пусто — повідомлення з'являться тут після відправки</div>
        ) : log.map((item,i)=>(
          <div key={item.id} style={{
            display:"flex",gap:10,padding:"10px 0",alignItems:"flex-start",
            borderBottom: i<log.length-1 ? `1px solid ${BORDER}` : "none",
          }}>
            <div style={{fontSize:11,color:FT,flexShrink:0,minWidth:76,paddingTop:1}}>{fmtTs(item.sentAt)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:TEXT,marginBottom:2}}>{item.title}</div>
              <div style={{fontSize:11,color:DM,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.body}</div>
            </div>
            <div style={{fontSize:11,color:DM,flexShrink:0,textAlign:"right"}}>
              {TYPE_LABELS[item.type]||item.type}
              {item.recipients>1 && <div style={{fontSize:10,color:FT}}>{item.recipients} учнів</div>}
              {item.status && item.status!=="sent" && (
                <div style={{fontSize:10,color:"#ef4444",fontWeight:700}}>
                  ⚠ {item.status==="no_token" ? "немає токена" : "не надіслано"}
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

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
    get(iRef( "admin_settings")).then(snap => {
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
          discount: usersMapRef.current[uid]?.discount || 0,
          customPrice: usersMapRef.current[uid]?.customPrice ?? null,
        });
      });
    });
    setBookings(all);
  };

  useEffect(() => {
    return onValue(iRef( "users"), snap => {
      usersMapRef.current = snap.val() || {};
      // Re-process already-loaded bookings so TSC cross-reference applies after users arrive
      if (rawBookingsDataRef.current !== null) {
        processBookingsRef.current(rawBookingsDataRef.current);
      }
    });
  }, []);

  // Load bookings from Firebase (realtime)
  useEffect(() => {
    const r = iRef( "bookings");
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
        update(iRef( "admin_settings"), next).catch(() => {});
      }, 1000);
      return next;
    });
  };

  const handleAction = (action, b) => {
    if (action === "confirm")  setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x));
    if (action === "cancel") {
      if (b.userId && b.id) {
        if (b.date && b.startMin !== undefined && b.durMin) {
          // Відновлюємо лише слоти сітки; phantom-вузли видаляємо
          get(iRef( `timeslots/${b.date}`)).then(s => {
            const day = s.val() || {};
            const upd = {};
            for (let i = 0; i < b.durMin; i += 30) {
              const sm = b.startMin + i;
              const hh = String(Math.floor(sm/60)).padStart(2,'0'), mm = String(sm%60).padStart(2,'0');
              const path = `timeslots/${b.date}/slot${hh}${mm}`;
              const node = day[`slot${hh}${mm}`];
              if (!node || node.phantom) { upd[path] = null; continue; }
              upd[`${path}/available`] = true; upd[`${path}/time`] = `${hh}:${mm}`; upd[`${path}/bookingStart`] = null;
            }
            if (Object.keys(upd).length) update(iRef('/'), upd).catch(()=>{});
          }).catch(()=>{});
        }
        // Скасовуємо обидва можливі вузли (дубль міг з'явитись від старого коду)
        const keys = [...new Set([b._fbKey, b.id].filter(Boolean))];
        keys.forEach(k => update(iRef( `bookings/${b.userId}/${k}`), { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
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
        ...(b.debtAmount > 0 && { debtAmount: b.debtAmount }),
      };
      if (b.userId) {
        update(iRef( `bookings/${b.userId}/${b.id}`), fbData).catch(()=>{});
      } else {
        const phone = (b.phone || '').replace(/\D/g, '');
        if (phone) {
          update(iRef( `bookings_by_phone/${phone}/${b.id}`), fbData).catch(()=>{});
          for (let i = 0; i < b.durMin; i += 30) {
            const slotMin = b.startMin + i;
            const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
            const sm = String(slotMin % 60).padStart(2, '0');
            update(iRef( `slotBookings/${b.date}/slot${sh}${sm}`), {phone, bookingId: b.id}).catch(()=>{});
          }
        }
      }
    }
    if (b.date && b.startMin !== undefined && b.durMin) {
      // Вузли поза сіткою дня позначаємо phantom — при скасуванні видаляться
      get(iRef( `timeslots/${b.date}`)).then(s => {
        const day = s.val() || {};
        const slotUpd = {};
        for (let i = 0; i < b.durMin; i += 30) {
          const slotMin = b.startMin + i;
          const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
          const sm = String(slotMin % 60).padStart(2, '0');
          const id = `slot${sh}${sm}`;
          if (!day[id]) slotUpd[`timeslots/${b.date}/${id}/phantom`] = true;
          slotUpd[`timeslots/${b.date}/${id}/available`] = false;
          slotUpd[`timeslots/${b.date}/${id}/time`] = `${sh}:${sm}`;
          // Явний прапорець реального старту бронювання — клієнт показує лише
          // його, а не кожен 30-хвилинний блок.
          slotUpd[`timeslots/${b.date}/${id}/bookingStart`] = i === 0;
        }
        update(iRef(), slotUpd).catch(() => {});
      }).catch(() => {});
    }
    // onValue listener will update setBookings automatically; skip local push to avoid duplicate
  };

  const renderView = () => {
    switch(tab) {
      case "schedule":  return <ScheduleView settings={settings} setSettings={setSettingsAndSave}
                                onSlotClick={setSelectedBooking}
                                onEmptySlotClick={setNewBookingData}
                                bookings={bookings} setBookings={setBookings}/>;
      case "settings":   return <SettingsView settings={settings} setSettings={setSettingsAndSave}/>;
      case "students":   return <StudentsView/>;
      case "templates":  return <TemplatesView/>;
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
          onAction={handleAction} settings={settings}
          autoTag={selectedBooking ? getAutoTag(selectedBooking) : null}/>
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

export { ScheduleView, SettingsView, MonthCalendarSheet };
