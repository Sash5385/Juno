255,255,255,0.05)";
const TEXT = "#e8e8ea";
const TEXT_DIM = "#8b8d93";
const TEXT_FAINT = "#5a5c62";
const ACCENT = "#ff5a3c";
const ACCENT_HI = "#ff7a5c";
const GREEN = "#7ed957";
const BLUE = "#5b9bff";
const PURPLE = "#c084fc";
const GOLD = "#f7c948";
const RED = "#ef4444";

const SHADOW_OUT = "6px 6px 16px rgba(0,0,0,0.45), -3px -3px 10px rgba(255,255,255,0.025)";
const SHADOW_IN = "inset 3px 3px 8px rgba(0,0,0,0.4), inset -2px -2px 6px rgba(255,255,255,0.025)";

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
const GLOBAL_CSS = `
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body, html, #root { margin:0; padding:0; }

/* ─── 3D PILLOW SLOTS (from v4, color via CSS var) ─── */
.slot-base {
  position: relative; overflow: hidden;
  border-radius: 14px;
  transition: box-shadow .2s, transform .15s;
  cursor: grab; user-select: none;
}
.slot-base::before {
  content:''; position:absolute; pointer-events:none;
  top: 2px; right: 8%;
  width: 50%; height: 35%;
  background: radial-gradient(ellipse at top right, rgba(255,255,255,0.22) 0%, transparent 65%);
  border-radius: 50%;
  filter: blur(1px);
}
.slot-base::after {
  content:''; position:absolute; pointer-events:none;
  bottom: 0; left: 0; right: 0; height: 35%;
  background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.18));
  border-radius: 0 0 14px 14px;
}
.slot-base:active { cursor: grabbing; }
.slot-colored {
  background: linear-gradient(155deg, color-mix(in srgb, var(--c) 50%, transparent) 0%, color-mix(in srgb, var(--c) 18%, transparent) 100%);
  border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);

  box-shadow:
    -2px 5px 14px rgba(0,0,0,0.5),
    inset 1px 1px 0 rgba(255,255,255,0.18),
    inset -1px -1px 0 rgba(0,0,0,0.25);
}
.slot-pending-ring {
  animation: pulse-ring 2s infinite;
}
@keyframes pulse-ring {
  0%,100% { box-shadow: -2px 5px 14px rgba(0,0,0,0.5), inset 1px 1px 0 rgba(255,255,255,0.18), inset -1px -1px 0 rgba(0,0,0,0.25), 0 0 0 0 rgba(255,90,60,0.6); }
  50%     { box-shadow: -2px 5px 14px rgba(0,0,0,0.5), inset 1px 1px 0 rgba(255,255,255,0.18), inset -1px -1px 0 rgba(0,0,0,0.25), 0 0 0 6px rgba(255,90,60,0); }
}

/* resize handles */
.slot-handle {
  position: absolute; left: 8px; right: 8px; height: 8px;
  cursor: ns-resize; z-index: 5;
}
.slot-handle::after {
  content:''; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width: 30px; height: 3px; border-radius: 2px;
  background: rgba(255,255,255,0.5);
  box-shadow: 0 0 4px rgba(0,0,0,0.3);
}
.slot-handle.top { top: 0; }
.slot-handle.bottom { bottom: 0; }

/* 3D icons (from v4) */
.icon3d {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 14px;
  position: relative; overflow: hidden;
  flex-shrink: 0;
  box-shadow:
    -2px 4px 10px rgba(0,0,0,0.5),
    inset 1px 1px 0 rgba(255,255,255,0.25),
    inset -1px -1px 0 rgba(0,0,0,0.3);
}
.icon3d::before {
  content:''; position:absolute; top:0; right:0;
  width:60%; height:50%;
  background: radial-gradient(ellipse at top right, rgba(255,255,255,0.4) 0%, transparent 70%);
  pointer-events: none;
}
.icon3d > svg { position: relative; z-index: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4)); }

/* Toggle switch */
.toggle {
  width: 46px; height: 26px; border-radius: 13px; cursor: pointer;
  position: relative; transition: background .2s;
  background: ${SURFACE_LO};
  box-shadow: inset 2px 2px 5px rgba(0,0,0,0.4);
}
.toggle.on {
  background: linear-gradient(165deg, ${GREEN}, #5fb83d);
  box-shadow: inset 1px 1px 0 rgba(255,255,255,0.2);
}
.toggle-thumb {
  position: absolute; top: 3px; left: 3px;
  width: 20px; height: 20px; border-radius: 10px;
  background: linear-gradient(135deg, #fff, #ccc);
  transition: left .2s;
  box-shadow: -1px 2px 4px rgba(0,0,0,0.3), inset 1px 1px 0 rgba(255,255,255,0.6);
}
.toggle.on .toggle-thumb { left: 23px; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
::-webkit-scrollbar-track { background: transparent; }
.schedule-scroll::-webkit-scrollbar { height: 24px; }
.schedule-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 8px; min-width: 60px; }
input[type="range"] { accent-color: ${ACCENT}; }
.tabular { font-variant-numeric: tabular-nums; }
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
const initialBookings = [
  { id:"b1", day:0, startMin:8*60,  durMin:120, name:"Марія Коваль",   phone:"+380671234567", type:"school",  tsc:"ТСЦ 8041",   hoursDone:12, status:"confirmed", serviceId:"sv1" },
  { id:"b2", day:0, startMin:11*60, durMin:60,  name:"Іван Петренко",  phone:"+380509876543", type:"private", tsc:"",              hoursDone:5,  status:"pending",   serviceId:"sv3", categoryId:"cat-std" },
  { id:"b3", day:0, startMin:14*60, durMin:120, name:"Олена Мороз",    phone:"+380631112233", type:"school",  tsc:"ТСЦ 8042",  hoursDone:38, status:"confirmed", serviceId:"sv1" },
  { id:"b4", day:1, startMin:9*60,  durMin:60,  name:"Дмитро Сало",    phone:"+380961234567", type:"private", tsc:"",              hoursDone:9,  status:"confirmed", serviceId:"sv3", categoryId:"cat-vip" },
  { id:"b5", day:1, startMin:13*60, durMin:60,  name:"Тетяна Кравець", phone:"+380731234567", type:"school",  tsc:"ТСЦ 8041",   hoursDone:40, status:"confirmed", serviceId:"sv1" },
  { id:"b6", day:2, startMin:10*60, durMin:120, name:"Антон Білий",    phone:"+380501112233", type:"school",  tsc:"ТСЦ 8041", hoursDone:22, status:"confirmed", serviceId:"sv1" },
  { id:"b7", day:2, startMin:15*60, durMin:120, name:"Юлія Денисюк",   phone:"+380935023739", type:"private", tsc:"",              hoursDone:3,  status:"pending",   serviceId:"sv4", categoryId:"cat-new" },
  { id:"b8", day:3, startMin:8*60,  durMin:60,  name:"Сергій Гук",     phone:"+380961234500", type:"private", tsc:"",              hoursDone:14, status:"confirmed", serviceId:"sv3", categoryId:"cat-std" },
  { id:"b9", day:3, startMin:11*60, durMin:120, name:"Наталія Бондар", phone:"+380671112244", type:"school",  tsc:"ТСЦ 8042",  hoursDone:18, status:"confirmed", serviceId:"sv1" },
  { id:"b10",day:4, startMin:9*60,  durMin:120, name:"Андрій Чорний",  phone:"+380501234500", type:"school",  tsc:"ТСЦ 8041",   hoursDone:30, status:"confirmed", serviceId:"sv1" },
  { id:"b11",day:4, startMin:14*60, durMin:60,  name:"Ірина Лесник",   phone:"+380967240853", type:"private", tsc:"",              hoursDone:1,  status:"pending",   serviceId:"sv3", categoryId:"cat-new" },
  { id:"b12",day:5, startMin:10*60, durMin:120, name:"Ангеліна Коник", phone:"+380681746071", type:"private", tsc:"",              hoursDone:6,  status:"confirmed", serviceId:"sv4", categoryId:"cat-vip" },
];

const DAYS_DATA = [
  { num:25, label:"Пн", wk:false },
  { num:26, label:"Вт", wk:false },
  { num:27, label:"Ср", wk:false },
  { num:28, label:"Чт", wk:false },
  { num:29, label:"Пт", wk:false },
  { num:30, label:"Сб", wk:true  },
  { num:31, label:"Нд", wk:true  },
];

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
  daysShown: 7,  // 1..30
  snapMin: 30,
  hourHeightPx: 60, // resizable via pinch
  // breaks
  lunchEnabled: true,
  lunchStart: 12,
  lunchEnd: 13,
  customBlocks: [],
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
  // sticky time
  stickyTime: "both",       // before | after | both
  // notifications display
  notifLocation: "topbar",  // topbar | tab | profile
  // auto messages
  autoReminder: { enabled:true, hoursBefore:24 },
  autoWelcome: { enabled:true },
  autoConfirm: { enabled:true },
  autoCancel: { enabled:true },
  autoQueueOffer: { enabled:true },
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
  const M = {
    pending:["Очікує",ACCENT,"rgba(255,90,60,0.15)"],
    confirmed:["Підтверджено",GREEN,"rgba(126,217,87,0.15)"],
    cancelled:["Скасовано","#888","rgba(255,255,255,0.07)"],
    noshow:["Не прийшов",RED,"rgba(239,68,68,0.18)"],
  };
  const [l,c,b] = M[s] || M.confirmed;
  return <Pill label={l} color={c} bg={b}/>;
}
const fmtTime = (m) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const colorOf = (id) => PALETTE.find(p=>p.id===id)?.color || GREEN;

// ═══════════════════════════════════════════════════════════════
// SCHEDULE VIEW with drag/resize + pinch-to-zoom + day-count
// ═══════════════════════════════════════════════════════════════
function ScheduleView({ settings, setSettings, onSlotClick, bookings, setBookings, activeDragIds }) {
  const [drag, setDrag] = useState(null);
  const gridRef = useRef(null);
  const [pinch, setPinch] = useState(null);

  const PX_PER_MIN = settings.hourHeightPx / 60;
  const TIME_COL_W = 54;
  const COL_W = settings.daysShown <= 3 ? 200 : settings.daysShown <= 7 ? 110 : 70;
  const totalMin = (settings.workEnd - settings.workStart) * 60;
  const gridHeight = totalMin * PX_PER_MIN;

  const minToPx = (m) => (m - settings.workStart*60) * PX_PER_MIN;
  const snap = (m) => Math.round(m / settings.snapMin) * settings.snapMin;

  const onPointerDown = (e, b, mode) => {
    e.preventDefault(); e.stopPropagation();
    if (activeDragIds) activeDragIds.current.add(b.id);
    setDrag({
      id:b.id, mode,
      startClientY:e.clientY, startClientX:e.clientX,
      startMinutes:b.startMin, startDur:b.durMin, startDay:b.day,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const dy = e.clientY - drag.startClientY;
      const dxRaw = e.clientX - drag.startClientX;
      const deltaMin = dy / PX_PER_MIN;
      setBookings(bs => bs.map(b => {
        if (b.id !== drag.id) return b;
        if (drag.mode === "move") {
          const newDay = Math.max(0, Math.min(DAYS_DATA.length-1, drag.startDay + Math.round(dxRaw/(COL_W+6))));
          let s = snap(drag.startMinutes + deltaMin);
          s = Math.max(settings.workStart*60, Math.min(settings.workEnd*60 - b.durMin, s));
          return {...b, startMin:s, day:newDay};
        } else if (drag.mode === "bottom") {
          let d = snap(drag.startDur + deltaMin);
          d = Math.max(settings.snapMin, Math.min(settings.workEnd*60 - b.startMin, d));
          return {...b, durMin:d};
        } else if (drag.mode === "top") {
          let s = snap(drag.startMinutes + deltaMin);
          const maxS = drag.startMinutes + drag.startDur - settings.snapMin;
          s = Math.max(settings.workStart*60, Math.min(maxS, s));
          const diff = s - drag.startMinutes;
          return {...b, startMin:s, durMin: drag.startDur - diff};
        }
        return b;
      }));
    };
    const onUp = () => {
      if (activeDragIds) activeDragIds.current.delete(drag.id);
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, settings.snapMin, settings.workStart, settings.workEnd, PX_PER_MIN, COL_W, setBookings, activeDragIds]);

  // Pinch zoom: 2 fingers vertically -> change hourHeightPx
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
      const newH = Math.max(30, Math.min(160, Math.round(pinch.startH * ratio)));
      setSettings(s => ({...s, hourHeightPx: newH}));
    }
  };
  const onTouchEnd = () => setPinch(null);

  // mouse wheel + ctrl = zoom
  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSettings(s => ({...s, hourHeightPx: Math.max(30, Math.min(160, s.hourHeightPx - Math.sign(e.deltaY) * 6))}));
    }
  };

  const hours = [];
  for (let h = settings.workStart; h <= settings.workEnd; h++) hours.push(h);

  const days = DAYS_DATA.slice(0, settings.daysShown);

  // service color helper
  const slotColor = (b) => {
    const svc = settings.services.find(s=>s.id===b.serviceId);
    return colorOf(svc?.colorId);
  };

  return (
    <Card style={{padding:"10px 10px 0", display:"flex", flexDirection:"column", flex:1, minHeight:0}}>
      {/* Day headers */}
      <div style={{display:"flex", paddingLeft:TIME_COL_W, gap:6, marginBottom:8, overflowX:"auto", flexShrink:0}}>
        {days.map((d,i)=>(
          <div key={i} className="pillow" style={{
            width:COL_W, padding:"8px 0", textAlign:"center",
            background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
            borderRadius:12, boxShadow:SHADOW_OUT, flexShrink:0
          }}>
            <div style={{fontSize:20,fontWeight:800,color:d.wk?ACCENT:TEXT,letterSpacing:-0.5}}>{d.num}</div>
            <div style={{fontSize:10,color:TEXT_DIM,marginTop:1}}>{d.label}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        className="schedule-scroll"
        style={{display:"flex", overflowX:"auto", overflowY:"auto", flex:1, minHeight:0, touchAction:"pan-x pan-y"}}
      >
        <div style={{width:TIME_COL_W, flexShrink:0, position:"relative", height:gridHeight}}>
          {hours.map(h=>(
            <div key={h} style={{
              position:"absolute", top:(h-settings.workStart)*60*PX_PER_MIN - 6,
              right:8, fontSize:11, color:TEXT_FAINT, fontWeight:700
            }}>{String(h).padStart(2,"0")}:00</div>
          ))}
        </div>

        {days.map((day,dayIdx)=>(
          <div key={dayIdx} style={{
            width:COL_W, flexShrink:0, height:gridHeight,
            position:"relative", marginRight:6, padding:"0 4px",
            background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,
            borderRadius:14, boxShadow:SHADOW_IN
          }}>
            {/* hour lines */}
            {hours.slice(0,-1).map(h=>(
              <div key={h} style={{
                position:"absolute",left:0,right:0,
                top:(h-settings.workStart+1)*60*PX_PER_MIN,
                height:1, background:"rgba(255,255,255,0.04)"
              }}/>
            ))}

            {/* lunch block */}
            {settings.lunchEnabled && day.label !== "Нд" && (
              <div style={{
                position:"absolute",
                top:minToPx(settings.lunchStart*60),
                left:4, right:4,
                height:(settings.lunchEnd - settings.lunchStart)*60*PX_PER_MIN,
                background:`repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(255,255,255,0.04) 6px, rgba(255,255,255,0.04) 12px)`,
                borderRadius:8, pointerEvents:"none",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:9,color:TEXT_FAINT,fontWeight:700,letterSpacing:1
              }}>ОБІД</div>
            )}

            {/* bookings */}
            {bookings.filter(b=>b.day===dayIdx).map(b=>{
              const top = minToPx(b.startMin);
              const height = b.durMin * PX_PER_MIN;
              const c = slotColor(b);
              const isPending = b.status==="pending" && settings.pendingEnabled;
              return (
                <div key={b.id}
                  className={`slot-base slot-colored ${isPending?"slot-pending-ring":""}`}
                  onPointerDown={e=>onPointerDown(e,b,"move")}
                  onClick={(e)=>{ if(!drag) onSlotClick(b); }}
                  style={{
                    "--c": c,
                    position:"absolute", top:top+2, left:4, right:4,
                    height:height-4, padding:"7px 9px",
                    display:"flex", flexDirection:"column", gap:2,
                    zIndex: drag?.id===b.id?10:2
                  }}>
                  <div className="slot-handle top" onPointerDown={e=>onPointerDown(e,b,"top")}/>
                  <div style={{
                    fontSize:11, fontWeight:800, color:"#fff",
                    lineHeight:1.15, textShadow:"0 1px 2px rgba(0,0,0,0.5)",
                    zIndex:2, position:"relative"
                  }}>{b.name}</div>
                  {b.type==="school" ? (
                    <>
                      {b.tsc && <div style={{
                        fontSize:9, color:"rgba(255,255,255,0.9)", lineHeight:1.1,
                        zIndex:2, position:"relative", textShadow:"0 1px 2px rgba(0,0,0,0.5)"
                      }}>{b.tsc}</div>}
                      <div style={{
                        fontSize:9, color:"rgba(255,255,255,0.85)", fontWeight:700,
                        zIndex:2, position:"relative", textShadow:"0 1px 2px rgba(0,0,0,0.5)"
                      }} className="tabular">
                        {b.hoursDone}/40 год
                      </div>
                    </>
                  ) : null}
                  <div style={{
                    fontSize:10, color:"rgba(255,255,255,0.8)",
                    marginTop:"auto", zIndex:2, position:"relative",
                    fontWeight:700, textShadow:"0 1px 2px rgba(0,0,0,0.5)"
                  }} className="tabular">
                    {fmtTime(b.startMin)}–{fmtTime(b.startMin+b.durMin)}
                  </div>
                  <div className="slot-handle bottom" onPointerDown={e=>onPointerDown(e,b,"bottom")}/>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer / info */}
      <div style={{
        display:"flex",gap:16,marginTop:14,paddingLeft:TIME_COL_W,
        fontSize:11,color:TEXT_FAINT,flexWrap:"wrap",flexShrink:0,
        paddingBottom:6
      }}>
        <span>↕ Тягни за блок щоб перемістити</span>
        <span>↕ Тягни за край щоб змінити час</span>
        <span>⤡ Ctrl+коліщатко або pinch — масштаб годин</span>
        <span style={{marginLeft:"auto"}}>snap: <b style={{color:ACCENT}}>{settings.snapMin}хв</b> · висота: <b style={{color:ACCENT}}>{settings.hourHeightPx}px/год</b></span>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// BOOKING DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
function BookingModal({ booking, onClose, onAction, settings }) {
  if (!booking) return null;
  const svc = settings.services.find(s=>s.id===booking.serviceId);
  const cat = booking.categoryId ? settings.categories.find(c=>c.id===booking.categoryId) : null;

  const Btn = ({ icon, label, onClick, color }) => (
    <button onClick={onClick} style={{
      flex:"1 1 100px", padding:"12px 8px", borderRadius:12, border:"none", cursor:"pointer",
      background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
      color: color||TEXT, fontSize:11, fontWeight:700,
      display:"flex",flexDirection:"column",alignItems:"center",gap:6,
      boxShadow:SHADOW_OUT
    }}>
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div onClick={onClose} style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,
      display:"flex",alignItems:"flex-end",justifyContent:"center",
      backdropFilter:"blur(8px)"
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"100%",maxWidth:520,background:`linear-gradient(180deg,${SURFACE},${BG})`,
        borderRadius:"24px 24px 0 0", padding:"22px 20px 30px",
        boxShadow:"0 -10px 40px rgba(0,0,0,0.6)",
        maxHeight:"90vh", overflowY:"auto"
      }}>
        {/* drag handle */}
        <div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.15)",margin:"0 auto 16px"}}/>

        {/* header */}
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
          {ICONS.user(54)}
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:800,color:TEXT}}>{booking.name}</div>
            <div style={{fontSize:12,color:TEXT_DIM,marginTop:2}}>{booking.phone}</div>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {statusPill(booking.status)}
              {cat && <Pill label={cat.name} color={colorOf(cat.colorId)} bg={`${colorOf(cat.colorId)}22`}/>}
              {booking.type==="school" && (
                <Pill label={`${booking.hoursDone}/40 год`} color={booking.hoursDone>=40?ACCENT:GREEN} bg="rgba(255,255,255,0.05)"/>
              )}
            </div>
          </div>
        </div>

        {/* info grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
          <div style={{padding:"10px 12px",borderRadius:12,boxShadow:SHADOW_IN,background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`}}>
            <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1}}>ДАТА</div>
            <div style={{fontSize:14,fontWeight:700,marginTop:3}}>25 трав 2026</div>
          </div>
          <div style={{padding:"10px 12px",borderRadius:12,boxShadow:SHADOW_IN,background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`}}>
            <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1}}>ЧАС</div>
            <div style={{fontSize:14,fontWeight:700,marginTop:3,color:BLUE}} className="tabular">
              {fmtTime(booking.startMin)}–{fmtTime(booking.startMin+booking.durMin)}
            </div>
          </div>
          <div style={{padding:"10px 12px",borderRadius:12,boxShadow:SHADOW_IN,background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`}}>
            <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1}}>ПОСЛУГА</div>
            <div style={{fontSize:13,fontWeight:700,marginTop:3,color:svc?colorOf(svc.colorId):TEXT}}>{svc?.name || "—"}</div>
          </div>
          <div style={{padding:"10px 12px",borderRadius:12,boxShadow:SHADOW_IN,background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`}}>
            <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1}}>ЦІНА</div>
            <div style={{fontSize:14,fontWeight:700,marginTop:3,color:GOLD}}>{svc?.price || 0} ₴</div>
          </div>
          {booking.tsc && (
            <div style={{padding:"10px 12px",borderRadius:12,boxShadow:SHADOW_IN,background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,gridColumn:"span 2"}}>
              <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1}}>ТСЦ</div>
              <div style={{fontSize:13,fontWeight:700,marginTop:3}}>{booking.tsc}</div>
            </div>
          )}
        </div>

        {/* notes (instructor private) */}
        <div style={{padding:"10px 12px",borderRadius:12,boxShadow:SHADOW_IN,background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,marginBottom:16}}>
          <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1,marginBottom:6}}>НОТАТКИ ІНСТРУКТОРА (ПРИВАТНІ)</div>
          <textarea placeholder="Додай нотатку про учня..." rows={2} style={{
            width:"100%",background:"transparent",border:"none",outline:"none",
            color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit"
          }}/>
        </div>

        {/* actions grid */}
        <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1,marginBottom:8}}>ДІЇ</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
          {booking.status==="pending" && <Btn icon={ICONS.check(34)} label="Підтвердити" color={GREEN} onClick={()=>onAction("confirm",booking)}/>}
          <Btn icon={ICONS.clock(34)} label="Перенести" onClick={()=>onAction("reschedule",booking)}/>
          <Btn icon={
            <Icon3D size={34} gradient="linear-gradient(165deg,#34d399,#047857)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </Icon3D>
          } label="Дзвонити" onClick={()=>onAction("call",booking)}/>
          <Btn icon={ICONS.chat(34)} label="Чат" onClick={()=>onAction("chat",booking)}/>
          <Btn icon={ICONS.bell(34)} label="SMS" onClick={()=>onAction("sms",booking)}/>
          <Btn icon={ICONS.calendar(34)} label="Повторити" onClick={()=>onAction("repeat",booking)}/>
          <Btn icon={ICONS.cross(34)} label="Не прийшов" color={RED} onClick={()=>onAction("noshow",booking)}/>
          <Btn icon={
            <Icon3D size={34} gradient="linear-gradient(165deg,#ef4444,#b91c1c)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </Icon3D>
          } label="Скасувати" color={RED} onClick={()=>onAction("cancel",booking)}/>
        </div>

        {/* close */}
        <button onClick={onClose} style={{
          width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
          background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
          color:TEXT_DIM,fontSize:13,fontWeight:700,
          boxShadow:SHADOW_OUT,marginTop:8
        }}>Закрити</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS — все настройки
// ═══════════════════════════════════════════════════════════════
function SettingsView({ settings, setSettings }) {
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

  const NumInput = ({ value, onChange, min, max, suffix }) => (
    <div style={{
      display:"flex",alignItems:"center",gap:6,
      padding:"6px 12px",borderRadius:10,
      background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,
      boxShadow:SHADOW_IN
    }}>
      <input type="number" value={value} min={min} max={max}
        onChange={e=>onChange(Number(e.target.value))}
        style={{
          width:50,background:"transparent",border:"none",outline:"none",
          color:TEXT,fontSize:14,fontWeight:800,textAlign:"center"
        }}/>
      {suffix && <span style={{fontSize:11,color:TEXT_DIM,fontWeight:700}}>{suffix}</span>}
    </div>
  );

  return (
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
                    boxShadow: on?`inset 1px 1px 0 rgba(255,255,255,0.25)`:SHADOW_OUT
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
              boxShadow: settings.snapMin===v?`inset 1px 1px 0 rgba(255,255,255,0.25)`:SHADOW_OUT
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
              boxShadow: settings.stickyTime===o.k?`0 0 8px ${ACCENT}77, inset 1px 1px 0 rgba(255,255,255,0.3)`:"none"
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
                    boxShadow:`inset 1px 1px 0 rgba(255,255,255,0.3), 0 2px 6px rgba(0,0,0,0.3)`
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

      {/* ── AUTO MESSAGES ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Автоматичні повідомлення</SectionTitle>
        <Row label="Нагадування за N годин до уроку">
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {settings.autoReminder.enabled && (
              <NumInput value={settings.autoReminder.hoursBefore}
                onChange={v=>updNested("autoReminder","hoursBefore",v)}
                min={1} max={168} suffix="год"/>
            )}
            <Toggle on={settings.autoReminder.enabled} onChange={v=>updNested("autoReminder","enabled",v)}/>
          </div>
        </Row>
        <Row label="Вітання при реєстрації нового учня">
          <Toggle on={settings.autoWelcome.enabled} onChange={v=>updNested("autoWelcome","enabled",v)}/>
        </Row>
        <Row label="Повідомлення про підтвердження букінгу">
          <Toggle on={settings.autoConfirm.enabled} onChange={v=>updNested("autoConfirm","enabled",v)}/>
        </Row>
        <Row label="Повідомлення після скасування">
          <Toggle on={settings.autoCancel.enabled} onChange={v=>updNested("autoCancel","enabled",v)}/>
        </Row>
        <Row label="Пропозиція вільного слоту (черга)">
          <Toggle on={settings.autoQueueOffer.enabled} onChange={v=>updNested("autoQueueOffer","enabled",v)}/>
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
                boxShadow: settings.theme===t.k?`inset 1px 1px 0 rgba(255,255,255,0.25)`:SHADOW_OUT
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
                boxShadow: settings.language===t.k?`inset 1px 1px 0 rgba(255,255,255,0.25)`:SHADOW_OUT
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
              boxShadow: settings.notifLocation===o.k?`0 0 8px ${ACCENT}77, inset 1px 1px 0 rgba(255,255,255,0.3)`:"none"
            }}/>
          </Row>
        ))}
      </Card>

      <div style={{height:30}}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUB for other tabs
// ═══════════════════════════════════════════════════════════════
function StubView({ title }) {
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
  const [tab, setTab] = useState("schedule");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [bookings, setBookings] = useState(initialBookings);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const handleAction = (action, b) => {
    if (action === "confirm")  setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x));
    if (action === "cancel")   setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"cancelled"}:x));
    if (action === "noshow")   setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"noshow"}:x));
    if (action === "call")     window.location.href = `tel:${b.phone}`;
    if (action === "sms")      window.location.href = `sms:${b.phone}`;
    // chat, reschedule, repeat — заглушки до фідбеку
    setSelectedBooking(null);
  };

  const renderView = () => {
    switch(tab) {
      case "schedule":  return <ScheduleView settings={settings} setSettings={setSettings}
                                onSlotClick={setSelectedBooking}
                                bookings={bookings} setBookings={setBookings}/>;
      case "settings":  return <SettingsView settings={settings} setSettings={setSettings}/>;
      default: return <StubView title={TITLES[tab]}/>;
    }
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{
        height:"100dvh", background:BG, color:TEXT,
        fontFamily:"ui-sans-serif,-apple-system,BlinkMacSystemFont,system-ui,sans-serif",
        display:"flex", flexDirection:"column"
      }}>
        {/* TOP BAR */}
        <div style={{
          padding:"14px 18px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          flexShrink:0,
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
        <div style={{
          flex:1, minHeight:0,
          overflowY: tab==="schedule" ? "hidden" : "auto",
          padding: tab==="schedule" ? "8px 8px 0" : "16px 14px 16px",
          display: tab==="schedule" ? "flex" : "block",
          flexDirection:"column",
          boxSizing:"border-box"
        }}>{renderView()}</div>

        {/* FAB on schedule */}
        {tab==="schedule" && (
          <button style={{
            position:"fixed",bottom:96,right:18,
            width:60,height:60,borderRadius:30,
            background:`linear-gradient(165deg,${ACCENT_HI},${ACCENT})`,
            color:"#fff",border:"none",fontSize:30,cursor:"pointer",
            boxShadow:`0 8px 24px rgba(255,90,60,0.5),0 4px 8px rgba(0,0,0,0.3),inset 1px 1px 0 rgba(255,255,255,0.3)`,
            display:"flex",alignItems:"center",justifyContent:"center",
            zIndex:25
          }}>+</button>
        )}

        {/* BOTTOM NAV — 8 tabs scrollable */}
        <div style={{
          flexShrink:0,
          background:`linear-gradient(180deg,${SURFACE},${SURFACE_LO})`,
          borderTop:`1px solid ${BORDER}`,
          boxShadow:"0 -8px 24px rgba(0,0,0,0.35)",
          zIndex:30, overflowX:"auto",
          display:"flex"
        }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:"0 0 auto", minWidth:78,
              padding:"8px 6px",
              background:"transparent",border:"none",cursor:"pointer",
              color: tab===t.id?ACCENT:TEXT_FAINT,
              display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              position:"relative"
            }}>
              <div style={{
                transform: tab===t.id?"scale(1.05)":"scale(0.92)",
                transition:"transform .15s",
                opacity:tab===t.id?1:0.55
              }}>{t.icon(34)}</div>
              <span style={{fontSize:9,fontWeight:700}}>{t.label}</span>
              {tab===t.id && (
                <div style={{
                  position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",
                  width:30,height:3,borderRadius:"3px 3px 0 0",background:ACCENT,
                  boxShadow:`0 0 8px ${ACCENT}88`
                }}/>
              )}
            </button>
          ))}
        </div>

        {/* MODAL */}
        <BookingModal booking={selectedBooking} onClose={()=>setSelectedBooking(null)}
          onAction={handleAction} settings={settings}/>
      </div>
    </>
  );
}
