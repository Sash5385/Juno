// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useContext } from "react";
import { MetalIcon } from "../../MetalIcon";
import { update, get } from "firebase/database";
import { iRef, slotRoot } from "../../firebase";
import { blockRangeUpdates, restoreRangeUpdates } from "../../slotRules";
import { bookingAddonTotals } from "../../addons";
import { ThemeContext, GREEN, BLUE, PURPLE, GOLD, RED, ACCENT, ACC_HI, SURF_HI } from "../../theme.js";
import { TAG_PRESETS } from "../../tags";

// Єдині правила timeslots під запис (див. slotRules.js): блокування ставить
// phantom на позиції без власного документа, звільнення видаляє phantom і
// повертає справжні слоти такими, якими вони були ДО запису.
const restoreSlotRange = async (dateStr, startMin, durMin, extra) => {
  const snap = await get(iRef(`${slotRoot()}/${dateStr}`));
  const upd = restoreRangeUpdates(snap.val() || {}, `${slotRoot()}/${dateStr}/`, startMin, durMin, { extra });
  if (Object.keys(upd).length) await update(iRef("/"), upd);
};
const blockSlotRange = async (dateStr, startMin, durMin, opts) => {
  const snap = await get(iRef(`${slotRoot()}/${dateStr}`));
  const upd = blockRangeUpdates(snap.val() || {}, `${slotRoot()}/${dateStr}/`, startMin, durMin, opts);
  if (Object.keys(upd).length) await update(iRef("/"), upd);
};
// Зміна лише тривалості (час початку той самий) — бекенд onBookingChanged реагує тільки
// на зміну date/time, тож timeslots синхронізуємо тут: звільняємо старий діапазон
// (крім нового та зайнятого іншими записами) і блокуємо новий.
const resyncDurSlots = async (dateStr, startMin, oldDur, newDur, keepRanges = []) => {
  if (!dateStr || startMin == null || !oldDur || !newDur || oldDur === newDur) return;
  await restoreSlotRange(dateStr, startMin, oldDur, undefined, [...keepRanges, [startMin, startMin + newDur]]);
  await blockSlotRange(dateStr, startMin, newDur, { bookingStart: true });
};
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

// 50 рівномірно розподілених відтінків для кольорів клієнтів (по колу відтінків,
// фіксовані насиченість/яскравість під темну тему) — з таким запасом кольори
// НЕ повторюються, поки одночасно активних клієнтів менше 50.
const STUDENT_PALETTE = Array.from({ length: 50 }, (_, i) => `hsl(${Math.round(i * 360 / 50)},68%,56%)`);

// Мітки на записі — фіксований список. Автоматично ставиться лише "first" (1-й запис клієнта)
// і "debt" (коли вписана сума боргу); "check"/"exam" — тільки вручну (деталі запису → Мітка,
// або при створенні запису). Автомітки діють лише поки майстер не чіпав мітку вручну.
// Автотег за порядковим номером запису клієнта (серед усіх нескасованих, включно з майбутніми)
const AUTO_TAG_BY_ORDER = { 1: "first" };
// Прибрані мітки (напр. старий "repeat") у вже збережених записах не показуються
const knownTag = (t) => (TAG_PRESETS.some(p => p.id === t) ? t : null);

// Правий клік миші відкриває меню/деталі (ПК). На телефоні довге натискання теж шле contextmenu
// (Android ~0,5 с) — тоді нічого не відкриваємо, інакше модалка вискакувала замість перетягування.
let _lastPtrType = "mouse";
if (typeof window !== "undefined") window.addEventListener("pointerdown", e => { _lastPtrType = e.pointerType || "mouse"; }, true);
const isMouseContext = (e) => (e?.nativeEvent?.pointerType || _lastPtrType) === "mouse";

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
/* Розклад у стилі «Неонове сяйво» (завжди увімкнено) */
.cal-neon .cal-slot-wrap { border-radius: 12px !important; } /* підкладка BG_DEEP лишається непрозорою, щоб плашка суми дня не просвічувала крізь картку */
.cal-neon .slot-base { border-radius: 12px; }
.cal-neon .slot-colored {
  background: color-mix(in srgb, var(--c) 22%, transparent);
  border: 1px solid var(--c);
  box-shadow: 0 0 9px color-mix(in srgb, var(--c) 45%, transparent), inset 0 0 8px color-mix(in srgb, var(--c) 14%, transparent);
}
.cal-neon .slot-colored::before, .cal-neon .slot-colored::after { display: none; }
@keyframes pulse-ring {
  0%,100% { box-shadow: 4px 4px 9px rgba(${SHADE},0.5), -3px -3px 8px rgba(${GLOW},0.28), 0 0 0 0 rgba(255,90,60,0.6); }
  50%     { box-shadow: 4px 4px 9px rgba(${SHADE},0.5), -3px -3px 8px rgba(${GLOW},0.28), 0 0 0 6px rgba(255,90,60,0); }
}

/* легке «дихання» жовтого куточка (коментар клієнта до запису) і значка нотатки дня — щоб їх було помітно */
@keyframes note-corner-glow {
  0%,100% { filter: drop-shadow(-1px -1px 2px rgba(0,0,0,0.35)) drop-shadow(0 0 0 rgba(247,201,72,0)); }
  50%     { filter: drop-shadow(-1px -1px 2px rgba(0,0,0,0.35)) drop-shadow(0 0 2px rgba(247,201,72,1)) drop-shadow(0 0 4.5px rgba(247,201,72,0.9)) drop-shadow(0 0 8px rgba(247,201,72,0.7)); }
}
/* світла пляма у куті картки: сама картка обрізає тінь за межами, тож світло малюємо всередині */
@keyframes note-corner-halo {
  0%,100% { opacity: 0.12; }
  50%     { opacity: 0.5; }
}
@keyframes note-icon-glow {
  0%,100% { box-shadow: 0 1px 3px rgba(0,0,0,0.5), 0 0 0 0 rgba(247,201,72,0); }
  50%     { box-shadow: 0 1px 3px rgba(0,0,0,0.5), 0 0 8px 2px rgba(247,201,72,0.85); }
}
.note-corner-glow { animation: note-corner-glow 2.6s ease-in-out infinite; }
.note-corner-halo { animation: note-corner-halo 2.6s ease-in-out infinite; }
.note-icon-glow   { animation: note-icon-glow 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .note-corner-glow, .note-corner-halo, .note-icon-glow { animation: none; }
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
/* Нижні шторки (оверлей на весь екран, вирівняний донизу) не заходять під системну панель Android / «жест-смужку» */
div[style*="position: fixed"][style*="align-items: flex-end"] { padding-bottom: env(safe-area-inset-bottom, 0px); box-sizing: border-box; }
.drum-scroll::-webkit-scrollbar { display: none; }
`;

// ═══════════════════════════════════════════════════════════════
// 3D ICONS
// ═══════════════════════════════════════════════════════════════
function Icon3D({ name, size=40, color }) {
  return <MetalIcon name={name} size={size} square color={color}/>;
}
const _I3 = (name, color) => (s=40) => <Icon3D name={name} size={s} color={color}/>;
const ICONS = {
  calendar: _I3("calendar","#3b73d9"),
  check: _I3("check","#3f8f27"),
  cross: _I3("cross","#3f4248"),
  car: _I3("tag","#6d3fd0"),
  school: _I3("calendar","#3f8f27"),
  money: _I3("coin","#b45309"),
  user: _I3("user","#334155"),
  users: _I3("users","#5b21b6"),
  clock: _I3("clock","#c2410c"),
  chat: _I3("chat","#047857"),
  bell: _I3("bell","#b45309"),
  settings: _I3("gear","#334155"),
  list: _I3("list","#047857"),
  chart: _I3("chart","#5b21b6"),
  plus: _I3("plus"),
  menu: _I3("list","#475569"),
  refresh: _I3("refresh","#475569"),
};

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════
const initialBookings = [];

const _DLABELS = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
const _DLABELS_FULL = ["Понеділок","Вівторок","Середа","Четвер","П'ятниця","Субота","Неділя"];
const _MLABELS = ["січ","лют","бер","кві","тра","чер","лип","сер","вер","жов","лис","гру"];
const _MLABELS_FULL = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
const EMPTY_LIST = [];
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
    name: "Майстер",
    phone: "",
    address: "",
    experience: 0,
    photo: null,
  },
  // schedule
  workStart: 7,
  workEnd: 20,
  weekends: [6], // 0=Mon..6=Sun
  daysShown: 3,  // 1..30
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
  slotFreedPushEnabled: true, // пуш усім клієнтам, коли слот у найближчі 10 днів звільняється
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
  surcharges: [],
  // services
  services: [
    { id:"sv1", name:"Стандарт", type:"school",  duration:60, price:0, colorId:"green",  active:true, description:"" },
    { id:"sv2", name:"Індивідуальний", type:"private", duration:60, price:0, colorId:"yellow", active:true, description:"" },
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
const fmtDur = (m) => { const h=Math.floor(m/60),min=m%60; return h===0?`${min} хв`:min===0?`${h} год`:`${h} год ${min} хв`; };
const colorOf = (id) => PALETTE.find(p=>p.id===id)?.color || GREEN;

// ═══════════════════════════════════════════════════════════════
// BOOKING DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
// Ціна послуги на конкретну дату запису: якщо задано nextPrice/nextPriceFrom
// і дата запису вже досягла nextPriceFrom — використовуємо нову ціну.
function effectivePrice(svc, dateStr) {
  if (!svc) return 0;
  if (svc.nextPrice != null && svc.nextPriceFrom && dateStr && dateStr >= svc.nextPriceFrom) {
    return svc.nextPrice;
  }
  return svc.price;
}

function computeBookingPrice(b, services) {
  if (b.manualPrice != null) return b.manualPrice;
  // Запис за пакетом: послуга вже оплачена пакетом, платяться лише допуслуги (якщо пакет не вдалося списати — рахуємо як звичайний)
  if (b.packageId && !b.packageError) return bookingAddonTotals(b).price;
  // Ціна, записана в слот при бронюванні (клієнт: тариф + надбавка − знижка/індив. ціна) —
  // джерело істини, поки тривалість не змінилась після запису.
  const _hrs = b.durationHours != null ? b.durationHours : b.durMin / 60;
  if (typeof b.price === "number" && b.price > 0 && Math.round(_hrs * 60) === b.durMin) return b.price;
  // Індивідуальна фікс. ціна клієнта (₴/год у картці клієнта) — виставляється
  // адміном вручну і діє на всі записи цього клієнта замість тарифу послуги;
  // знижка при цьому не застосовується (ціна вже персональна).
  // Допуслуги (знімок у записі): їхні хвилини не множаться на тариф, а ціна додається окремо
  const ax = bookingAddonTotals(b);
  const baseMin = Math.max(0, b.durMin - ax.minutes);
  if (b.customPrice != null) {
    const base = Math.round((b.customPrice / 60) * baseMin);
    return Math.max(0, Math.round(base + ax.price + (b.surcharge || 0)));
  }
  const svc = services.find(s => s.id === b.serviceId)
           || services.find(s => s.active && s.type===(b.serviceType||b.type) && Number(s.duration)===b.durMin);
  const dateStr = b.date || (() => {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + (b.day || 0));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const base = svc
    ? Math.round((effectivePrice(svc, dateStr) / svc.duration) * baseMin) + ax.price
    : b.price && b.durationHours
      ? Math.round((b.price / (b.durationHours * 60)) * b.durMin)
      : (b.price || 0);
  // Знижка клієнта (грн/год, фіксована сума) — діє на годину, тож масштабується
  // на тривалість запису (2 год = знижка ×2). Не застосовується там, де ціну
  // виставлено вручну (manualPrice — свідомий override адміна).
  const discount = (b.discount || 0) * (baseMin / 60);
  return Math.max(0, Math.round(base + (b.surcharge || 0) - discount));
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
const TABS = [
  {id:"schedule",  label:"Записи",     icon:ICONS.calendar},
  {id:"bookings",  label:"Букінги",    icon:ICONS.list},
  {id:"students",  label:"Клієнти",       icon:ICONS.users},
  {id:"services",  label:"Послуги",    icon:ICONS.car},
  {id:"chats",     label:"Чати",       icon:ICONS.chat},
  {id:"templates", label:"Шаблони",    icon:ICONS.bell},
  {id:"stats",     label:"Статистика", icon:ICONS.chart},
  {id:"settings",  label:"Налашт.",    icon:ICONS.settings},
];

export { restoreSlotRange, blockSlotRange, resyncDurSlots, PALETTE, STUDENT_PALETTE, AUTO_TAG_BY_ORDER, knownTag, isMouseContext, makeGlobalCSS, ICONS, initialBookings, _DLABELS, _DLABELS_FULL, _MLABELS, EMPTY_LIST, getDayInfo, DEFAULT_SETTINGS, Card, SectionTitle, Toggle, fmtTime, fmtDur, colorOf, computeBookingPrice, TABS };
