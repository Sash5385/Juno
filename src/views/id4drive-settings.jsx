import { useState, useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ref, get, update, onValue, off } from "firebase/database";
import { db } from "../firebase";
import { LangContext } from "../App";
import { APP_VERSION } from "../version.js";
import { ThemeContext } from "../theme.js";
import { UICss, useFX } from "../ui";
import { createT } from "../lang";
import { useLicense } from "../hooks/useLicense";

const DAY_NAMES = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

// ─── SECTION RAIL ICONS — той самий "3D pillow" стиль іконок, що й у
// BottomNav (App.jsx: makeTabIcons/I3): кольоровий градієнт при активній
// вкладці, темний неактивний фон, глянцевий блік зверху-справа. ───
const SEC_INACTIVE_GR = { dark:"linear-gradient(135deg,#2e3034,#26282c)", kava:"linear-gradient(135deg,#6b3a22,#4a2210)" };
const SEC_ICON_SVG = {
  schedule:   <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  snap:       <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  restr:      <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  queue:      <><circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/></>,
  sticky:     <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.3"/></>,
  auto:       <><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></>,
  surcharges: <><circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M15 9.7c0-1.1-1.2-2-3-2s-3 .9-3 1.9 1.3 1.5 3 1.8c1.7.3 3 .8 3 1.9s-1.2 1.9-3 1.9-3-.9-3-2"/></>,
  push:       <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
  reviews:    <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
};
function SecIcon({ id, color, active, isKava, size=34 }) {
  const gr = active ? color : (isKava ? SEC_INACTIVE_GR.kava : SEC_INACTIVE_GR.dark);
  return (
    <div style={{
      width:size, height:size, borderRadius:size*0.3, background:gr,
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden", flexShrink:0,
      boxShadow:"-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2),inset -1px -1px 0 rgba(0,0,0,0.25)",
    }}>
      <div style={{position:"absolute",top:0,right:0,width:"60%",height:"50%",background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.35) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <svg width={size*0.55} height={size*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"relative",zIndex:1}}>
        {SEC_ICON_SVG[id]}
      </svg>
    </div>
  );
}

// ─── MODULE-LEVEL ATOMS (stable references → no remount on settings change) ───

function Toggle({ on, onChange, color }) {
  const { ACC_HI, ACCENT, SURF_LO, BG_DEEP, SI } = useContext(ThemeContext);
  const { shade } = useFX();
  const c = color || ACCENT;
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:44,height:24,borderRadius:12,cursor:"pointer",position:"relative",
      background:on?`linear-gradient(145deg,color-mix(in srgb,${c} 85%,#fff),${c})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
      boxShadow:on?`0 0 8px ${c}44`:SI,transition:"background .2s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:3,left:on?21:3,width:18,height:18,borderRadius:9,
        background:"linear-gradient(135deg,#fff,#ddd)",
        boxShadow:`0 1px 4px ${shade(0.4)}`,transition:"left .2s",
      }}/>
    </div>
  );
}

function SmallToggle({ on, onChange, color }) {
  const { ACC_HI, ACCENT, SURF_LO, BG_DEEP, SI } = useContext(ThemeContext);
  const { shade } = useFX();
  const c = color || ACCENT;
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:32,height:18,borderRadius:9,cursor:"pointer",position:"relative",
      background:on?`linear-gradient(145deg,color-mix(in srgb,${c} 85%,#fff),${c})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
      boxShadow:on?`0 0 6px ${c}44`:SI,transition:"background .2s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:2,left:on?16:2,width:14,height:14,borderRadius:7,
        background:"linear-gradient(135deg,#fff,#ddd)",
        boxShadow:`0 1px 3px ${shade(0.4)}`,transition:"left .2s",
      }}/>
    </div>
  );
}

function NumInput({ value, onChange, min=0, max=999, suffix="", step=1, compact }) {
  const { BG_DEEP, SURF_HI, SURFACE, TEXT, SO, SI } = useContext(ThemeContext);
  const bs = compact ? 22 : 26;
  return (
    <div style={{display:"flex",alignItems:"center",gap:4,background:BG_DEEP,borderRadius:9,boxShadow:SI,padding: compact ? "3px 5px" : "4px 6px"}}>
      <button onClick={()=>onChange(Math.max(min,value-step))} style={{
        width:bs,height:bs,borderRadius:7,border:"none",cursor:"pointer",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:compact?12:14,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SO,
      }}>−</button>
      <span style={{fontSize:compact?11:13,fontWeight:700,color:TEXT,minWidth:compact?26:32,textAlign:"center"}}>
        {value}{suffix}
      </span>
      <button onClick={()=>onChange(Math.min(max,value+step))} style={{
        width:bs,height:bs,borderRadius:7,border:"none",cursor:"pointer",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:compact?12:14,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SO,
      }}>+</button>
    </div>
  );
}

function Radio({ on, onChange }) {
  const { ACCENT, FAINT } = useContext(ThemeContext);
  return (
    <div onClick={onChange} style={{
      width:20,height:20,borderRadius:10,cursor:"pointer",flexShrink:0,
      border:`2px solid ${on?ACCENT:FAINT}`,
      background:on?ACCENT:"transparent",
      boxShadow:on?`0 0 8px ${ACCENT}55`:"none",
      transition:"all .15s",
    }}/>
  );
}

function Row({ label, hint, children, last, color, compact }) {
  const { BG_DEEP, ACCENT } = useContext(ThemeContext);
  const c = color || ACCENT;
  return (
    <div style={{
      display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
      padding: compact ? "6px 10px" : "9px 12px",
      borderRadius:11,
      background:`linear-gradient(135deg,color-mix(in srgb,${c} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
      border:`1px solid color-mix(in srgb,${c} 35%,transparent)`,
      marginBottom: last ? 0 : (compact ? 4 : 6),
    }}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:compact?12:13,fontWeight:700,color:"#fff"}}>{label}</div>
        {hint && <div style={{fontSize:compact?9:10,color:"rgba(255,255,255,0.6)",marginTop:compact?1:2,lineHeight:1.35}}>{hint}</div>}
      </div>
      <div style={{flexShrink:0}}>{children}</div>
    </div>
  );
}

function Chip({ label, active, onClick }) {
  const { ACC_HI, ACCENT, SURF_HI, SURFACE, DIM, SO } = useContext(ThemeContext);
  return (
    <button onClick={onClick} style={{
      padding:"6px 12px",borderRadius:9,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
      background:active?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
      color:active?"#fff":DIM,boxShadow:active?"none":SO,
    }}>{label}</button>
  );
}

function Info({ title, text, color }) {
  const { BLUE, DIM } = useContext(ThemeContext);
  const c = color || BLUE;
  return (
    <div style={{
      background:`linear-gradient(145deg,${c}0d,${c}05)`,
      border:`1px solid ${c}30`,
      borderRadius:10,padding:"10px 12px",marginTop:2,marginBottom:10,
    }}>
      <div style={{fontSize:11,fontWeight:700,color:c,marginBottom:4}}>💡 {title}</div>
      <div style={{fontSize:11,color:DIM,lineHeight:1.6}}>{text}</div>
    </div>
  );
}

function TimeInput({ value, onChange, min=0, max=24, compact=false }) {
  const { BG_DEEP, TEXT, FAINT, SI } = useContext(ThemeContext);
  const v = Number(value) || 0;
  const h = Math.floor(v);
  const m = (v % 1 >= 0.5) ? 30 : 0;
  const disp = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  const dec = () => { const n = Math.round((v - 0.5) * 2) / 2; onChange(Math.max(min, n)); };
  const inc = () => { const n = Math.round((v + 0.5) * 2) / 2; onChange(Math.min(max, n)); };
  const bW = compact ? 14 : 20;
  const bH = compact ? 20 : 26;
  const fS = compact ? 11 : 14;
  const dW = compact ? 28 : 36;
  const dS = compact ? 9 : 11;
  return (
    <div style={{display:"flex",alignItems:"center",background:BG_DEEP,borderRadius:7,boxShadow:SI,overflow:"hidden"}}>
      <button onClick={dec} style={{width:bW,height:bH,border:"none",cursor:"pointer",background:"transparent",color:FAINT,fontSize:fS,padding:0,lineHeight:1}}>‹</button>
      <span style={{fontSize:dS,fontWeight:700,color:TEXT,minWidth:dW,textAlign:"center"}}>{disp}</span>
      <button onClick={inc} style={{width:bW,height:bH,border:"none",cursor:"pointer",background:"transparent",color:FAINT,fontSize:fS,padding:0,lineHeight:1}}>›</button>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function SettingsView({ settings, setSettings }) {
  const { BG_DEEP, SURF_HI, SURFACE, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, PURPLE, GOLD, RED, TEAL, SO, SI } = useContext(ThemeContext);
  const lang = useContext(LangContext);
  const t = createT(lang);
  const isKava = settings?.theme === "light";

  // Реальна висота нижнього навбару (BottomNav у App.jsx, id="app-bottomnav"),
  // щоб друга пігулка (SECTION RAIL) сідала точно над ним через fixed+portal —
  // "мертво", без залежності від position:sticky в скрол-контейнері вкладки.
  const [navH, setNavH] = useState(64);
  useEffect(() => {
    const el = document.getElementById('app-bottomnav');
    if (!el) return;
    const measure = () => setNavH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const css = `
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;background:${BG_DEEP};outline:none;box-shadow:${SI}}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:9px;background:linear-gradient(145deg,${ACC_HI},${ACCENT});cursor:pointer;box-shadow:0 2px 6px rgba(255,90,60,0.5)}
select{color-scheme:${isKava?"light":"dark"}}
`;
  const upd = (k, v) => setSettings(s=>({...s,[k]:v}));

  // ── weekSchedule helpers ──────────────────────────────────────
  const weekSchedule = settings.weekSchedule || DAY_NAMES.map((_,i) => ({
    enabled: i < 6, start: i===5?10:9, end: i===5?15:18,
    lunchEnabled: i<5, lunchStart:12, lunchEnd:13,
  }));
  const updDay = (i, patch) => upd("weekSchedule", weekSchedule.map((d,idx) => idx===i ? {...d,...patch} : d));

  const queueMode = settings.queueAutoFifo ? "fifo" : settings.queueBroadcast ? "broadcast" : "manual";
  const setQueueMode = m => setSettings(s=>({
    ...s,
    queueAutoFifo:    m==="fifo",
    queueBroadcast:   m==="broadcast",
    queueManual:      m==="manual",
  }));

  const reminders = settings.autoReminders || [
    {enabled:true, hoursBefore:24},
    {enabled:false,hoursBefore:2},
    {enabled:false,hoursBefore:1},
  ];
  const updReminder = (idx, patch) => upd("autoReminders", reminders.map((r,i)=>i===idx?{...r,...patch}:r));

  const [active, setActive] = useState("schedule");
  const [showHint, setShowHint] = useState(false);
  const switchSection = (id) => { setActive(id); setShowHint(false); };
  const license = useLicense();

  // ── відгуки учнів ────────────────────────────────────────────
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    const r = ref(db, "reviews");
    const handler = onValue(r, snap => {
      const data = snap.val() || {};
      const list = [];
      Object.entries(data).forEach(([uid, userReviews]) => {
        Object.entries(userReviews || {}).forEach(([id, v]) => list.push({ id, uid, ...v }));
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setReviews(list);
    });
    return () => off(r, "value", handler);
  }, []);
  const toggleReviewHidden = (review) => {
    update(ref(db, `reviews/${review.uid}/${review.id}`), { status: review.status === "hidden" ? "approved" : "hidden" }).catch(() => {});
  };

  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    const handleBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    const handleInstalled = () => { setInstallPrompt(null); setInstalled(true); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);
  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  // Реальна висота самої пігулки SECTION RAIL — спейсер у потоці має бути
  // точно такий, інакше фіксована пігулка перекриває низ контенту секції
  // (накладка при скролі до кінця довгих секцій).
  const railRef = useRef(null);
  const [railH, setRailH] = useState(90);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const measure = () => setRailH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  // Дістає date/startMin/durMin з сирого запису бронювання так само, як це
  // робить основний рендер розкладу (processBookingsRef у ScheduleView) —
  // клієнтські самозаписи мають лише time+durationHours, а не startMin/durMin
  // напряму. БЕЗ цього фолбека будь-яка перевірка "чи покритий цей слот
  // реальним записом" хибно вважає такі записи неіснуючими.
  const deriveBooking = (raw) => {
    if (!raw || !raw.date) return null;
    let startMin = raw.startMin;
    if (startMin == null && raw.time) {
      const [hh, mm] = raw.time.split(":").map(Number);
      if (!Number.isNaN(hh) && !Number.isNaN(mm)) startMin = hh * 60 + mm;
    }
    let durMin = raw.durMin;
    if (!durMin) durMin = raw.durationHours ? raw.durationHours * 60 : (startMin != null ? 60 : null);
    if (startMin == null || !durMin) return null;
    return { date: raw.date, startMin, durMin };
  };
  const collectBookingsByDate = (bookingsRoot) => {
    const bkByDate = {};
    Object.values(bookingsRoot || {}).forEach(userBookings => {
      Object.values(userBookings || {}).forEach(raw => {
        if (!raw || raw.status === "cancelled") return;
        const b = deriveBooking(raw);
        if (!b) return;
        (bkByDate[b.date] || (bkByDate[b.date] = [])).push(b);
      });
    });
    return bkByDate;
  };

  // Одноразова ручна очистка "осиротілих" зайнятих слотів — timeslots-документи
  // з available:false, що лишились у базі без жодного реального активного
  // запису, що їх покриває (залишки після тестів перетягування слотів тощо).
  // Навмисно блоковані (adminBlocked/vipOnly/surcharge) слоти не чіпаємо —
  // це не артефакти, а свідомо виставлені стани.
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const runCleanupOrphanedSlots = async () => {
    if (!window.confirm("Видалити всі \"зайняті\" слоти в базі, які не належать жодному активному запису? Дію не можна скасувати.")) return;
    setCleaning(true);
    setCleanResult(null);
    try {
      const [timeslotsSnap, bookingsSnap] = await Promise.all([
        get(ref(db, "timeslots")),
        get(ref(db, "bookings")),
      ]);
      const timeslots = timeslotsSnap.val() || {};
      const bkByDate = collectBookingsByDate(bookingsSnap.val());
      const updates = {};
      let removed = 0;
      Object.entries(timeslots).forEach(([date, slotMap]) => {
        const dayBk = bkByDate[date] || [];
        Object.entries(slotMap || {}).forEach(([slotId, slot]) => {
          if (!slot || slot.available !== false) return;
          if (slot.adminBlocked || slot.vipOnly || slot.surcharge) return;
          const [h, m] = (slot.time || "").split(":").map(Number);
          if (Number.isNaN(h) || Number.isNaN(m)) return;
          const sMin = h * 60 + m;
          const covered = dayBk.some(b => b.startMin <= sMin && sMin < b.startMin + b.durMin);
          if (!covered) {
            updates[`timeslots/${date}/${slotId}`] = null;
            removed++;
          }
        });
      });
      if (removed > 0) await update(ref(db, "/"), updates);
      setCleanResult(removed);
    } catch {
      setCleanResult("Помилка");
    } finally {
      setCleaning(false);
    }
  };

  // Аварійне відновлення: перезаписує позначки зайнятості (available:false +
  // bookingStart) для КОЖНОГО активного бронювання в базі — виправляє шкоду
  // від попередньої версії кнопки очистки, яка хибно видаляла зайняті слоти
  // клієнтських самозаписів (не мали startMin/durMin напряму). Нічого не
  // видаляє — лише дописує/підтверджує зайнятість, безпечно повторювати.
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const runRestoreOccupiedMarkers = async () => {
    if (!window.confirm("Відновити позначки зайнятості для всіх активних записів у базі?")) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const bookingsSnap = await get(ref(db, "bookings"));
      const bkByDate = collectBookingsByDate(bookingsSnap.val());
      const updates = {};
      let marked = 0;
      Object.entries(bkByDate).forEach(([date, dayBk]) => {
        dayBk.forEach(b => {
          for (let cur = b.startMin; cur < b.startMin + b.durMin; cur += 30) {
            const hh = String(Math.floor(cur / 60)).padStart(2, "0");
            const mm = String(cur % 60).padStart(2, "0");
            updates[`timeslots/${date}/slot${hh}${mm}/available`] = false;
            updates[`timeslots/${date}/slot${hh}${mm}/time`] = `${hh}:${mm}`;
            updates[`timeslots/${date}/slot${hh}${mm}/bookingStart`] = cur === b.startMin;
            marked++;
          }
        });
      });
      if (marked > 0) await update(ref(db, "/"), updates);
      setRestoreResult(marked);
    } catch {
      setRestoreResult("Помилка");
    } finally {
      setRestoring(false);
    }
  };

  const uk = lang !== "en";
  const SECTIONS = [
    { id:"schedule",   icon:"🕐", color:BLUE,   title:t('set.schedule.title'), label:uk?"Графік":"Sched." },
    { id:"snap",       icon:"⏱",  color:TEAL,   title:t('set.snap.title'),     label:uk?"Сітка":"Grid"   },
    { id:"restr",      icon:"🔒", color:RED,    title:t('set.restr.title'),    label:uk?"Ліміти":"Limits" },
    { id:"queue",      icon:"✅", color:GREEN,  title:t('set.queue.title'),    label:uk?"Черга":"Queue"  },
    { id:"sticky",     icon:"📌", color:PURPLE, title:t('set.sticky.title'),   label:uk?"Слоти":"Slots"  },
    { id:"auto",       icon:"📨", color:GOLD,   title:t('set.auto.title'),     label:uk?"Авто":"Auto"    },
    { id:"surcharges", icon:"💰", color:GOLD,   title:"Надбавки",              label:uk?"Збори":"Fees"   },
    { id:"push",       icon:"🔔", color:GREEN,  title:"Сповіщення",            label:"Сповіщення"        },
    { id:"reviews",    icon:"⭐", color:GOLD,   title:"Відгуки учнів",         label:"Відгуки"           },
  ];

  function renderSection(id) {
    const secColor = SECTIONS.find(s=>s.id===id)?.color || ACCENT;
    const svColor = (on) => on ? GREEN : RED;
    switch(id) {

      case "schedule": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.schedule.info_t')} text={t('set.schedule.info')}/>}
          <Row label={t('set.schedule.start')} hint={t('set.schedule.hint_s')}>
            <TimeInput value={settings.workStart} onChange={v=>{
              const clamped = Math.min(v, settings.workEnd - 0.5);
              const updated = weekSchedule.map(d => ({...d, start: d.start === settings.workStart ? clamped : d.start}));
              upd("workStart", clamped);
              upd("weekSchedule", updated);
            }} min={0} max={23.5}/>
          </Row>
          <Row label={t('set.schedule.end')} hint={t('set.schedule.hint_e')}>
            <TimeInput value={settings.workEnd} onChange={v=>{
              const clamped = Math.max(v, settings.workStart + 0.5);
              const updated = weekSchedule.map(d => ({...d, end: d.end === settings.workEnd ? clamped : d.end}));
              upd("workEnd", clamped);
              upd("weekSchedule", updated);
            }} min={0.5} max={24}/>
          </Row>
          <Row label={t('set.schedule.days')}>
            <NumInput value={settings.daysShown} onChange={v=>upd("daysShown",v)} min={1} max={30} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact last color={svColor(settings.lockPastBookings)} label="Блокувати минулі записи" hint="Заборонити редагувати, переносити й скасовувати записи, що вже минули — вони підсвічуються тьмяніше">
            <Toggle color={svColor(settings.lockPastBookings)} on={!!settings.lockPastBookings} onChange={v=>upd("lockPastBookings",v)}/>
          </Row>
          <div style={{paddingTop:8}}>
            <div style={{fontSize:9,color:"#fff",letterSpacing:1,textTransform:"uppercase",marginBottom:6,textAlign:"center"}}>Тижневий шаблон</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {DAY_NAMES.map((dayName, i) => {
                const day = weekSchedule[i];
                return (
                  <div key={i} style={{
                    borderRadius:8,padding:"5px 8px",
                    background:day.enabled?`linear-gradient(135deg,color-mix(in srgb,${GREEN} 38%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`:`linear-gradient(135deg,color-mix(in srgb,${RED} 22%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                    border:day.enabled?`1px solid color-mix(in srgb,${GREEN} 32%,transparent)`:`1px solid color-mix(in srgb,${RED} 25%,transparent)`,
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:20,fontSize:11,fontWeight:800,color:day.enabled?"#fff":FAINT,flexShrink:0}}>{dayName}</span>
                      <SmallToggle color={svColor(day.enabled)} on={day.enabled} onChange={v=>updDay(i,{enabled:v})}/>
                      {day.enabled ? (<>
                        <span style={{flex:1}}/>
                        <TimeInput compact value={day.start} onChange={v=>updDay(i,{start:Math.min(v,day.end-0.5)})} min={0} max={23}/>
                        <span style={{fontSize:9,color:FAINT,margin:"0 2px"}}>—</span>
                        <TimeInput compact value={day.end} onChange={v=>updDay(i,{end:Math.max(v,day.start+0.5)})} min={0.5} max={24}/>
                        <span style={{fontSize:12,flexShrink:0,marginLeft:4}}>🍽</span>
                        <SmallToggle color={svColor(!!day.lunchEnabled)} on={!!day.lunchEnabled} onChange={v=>updDay(i,{lunchEnabled:v})}/>
                      </>) : (
                        <span style={{fontSize:10,color:FAINT,marginLeft:4}}>Вихідний</span>
                      )}
                    </div>
                    {day.enabled && day.lunchEnabled && (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4,paddingLeft:26}}>
                        <span style={{fontSize:10,color:FAINT,flex:1}}>перерва</span>
                        <TimeInput compact value={day.lunchStart??12} onChange={v=>updDay(i,{lunchStart:Math.min(v,(day.lunchEnd??13)-0.5)})} min={0} max={23}/>
                        <span style={{fontSize:9,color:FAINT,margin:"0 2px"}}>—</span>
                        <TimeInput compact value={day.lunchEnd??13} onChange={v=>updDay(i,{lunchEnd:Math.max(v,(day.lunchStart??12)+0.5)})} min={0.5} max={24}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );

      case "snap": return (
        <div>
          {showHint && <Info color={TEAL} title={t('set.snap.info_t')} text={t('set.snap.info')}/>}
          <div style={{borderRadius:10,padding:"10px",marginBottom:5,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,color:DIM}}>{t('set.snap.label')}</span>
              <span style={{fontSize:13,fontWeight:800,color:ACCENT}}>{settings.snapMin} {t('min')}</span>
            </div>
            <input type="range" min={1} max={60} value={settings.snapMin} onChange={e=>upd("snapMin",+e.target.value)}/>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
              {[1,5,10,15,30,60].map(v=>(
                <Chip key={v} label={`${v} ${t('min')}`} active={settings.snapMin===v} onClick={()=>upd("snapMin",v)}/>
              ))}
            </div>
          </div>
          <div style={{borderRadius:10,padding:"10px",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,color:DIM}}>Крок слота (довгий тап)</span>
              <span style={{fontSize:13,fontWeight:800,color:TEAL}}>{settings.slotCreateStep ?? 30} хв</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[5,10,15,30,60].map(v=>(
                <Chip key={v} label={`${v} хв`} active={(settings.slotCreateStep??30)===v} onClick={()=>upd("slotCreateStep",v)}/>
              ))}
            </div>
          </div>
          <div style={{borderRadius:10,padding:"10px",marginTop:5,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO}}>
            <div style={{fontSize:12,color:DIM,marginBottom:8}}>
              Видаляє "зайняті" слоти в базі, які не належать жодному активному
              запису (залишки після тестів/помилок) — по всіх датах одразу.
            </div>
            <button onClick={runCleanupOrphanedSlots} disabled={cleaning} style={{
              width:"100%", padding:"10px", borderRadius:9, border:"none",
              cursor: cleaning ? "default" : "pointer",
              background: cleaning ? `linear-gradient(145deg,${SURF_HI},${SURFACE})` : `linear-gradient(145deg,${RED},${RED}cc)`,
              color:"#fff", fontSize:13, fontWeight:800,
            }}>
              {cleaning ? "Очищення..." : "🧹 Очистити сирітські слоти"}
            </button>
            {cleanResult !== null && (
              <div style={{fontSize:11, color:DIM, marginTop:6, textAlign:"center"}}>
                {cleanResult === "Помилка" ? "Помилка при очищенні" : `Видалено: ${cleanResult}`}
              </div>
            )}
          </div>
          <div style={{borderRadius:10,padding:"10px",marginTop:5,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO}}>
            <div style={{fontSize:12,color:DIM,marginBottom:8}}>
              Відновлює позначки зайнятості для всіх активних записів у базі —
              нічого не видаляє, лише дописує/підтверджує зайнятість.
            </div>
            <button onClick={runRestoreOccupiedMarkers} disabled={restoring} style={{
              width:"100%", padding:"10px", borderRadius:9, border:"none",
              cursor: restoring ? "default" : "pointer",
              background: restoring ? `linear-gradient(145deg,${SURF_HI},${SURFACE})` : `linear-gradient(145deg,${GREEN},${GREEN}cc)`,
              color:"#fff", fontSize:13, fontWeight:800,
            }}>
              {restoring ? "Відновлення..." : "🔄 Відновити позначки зайнятості"}
            </button>
            {restoreResult !== null && (
              <div style={{fontSize:11, color:DIM, marginTop:6, textAlign:"center"}}>
                {restoreResult === "Помилка" ? "Помилка при відновленні" : `Позначено: ${restoreResult}`}
              </div>
            )}
          </div>
        </div>
      );

      case "restr": return (
        <div>
          {showHint && <Info color={RED} title={t('set.restr.info_t')} text={t('set.restr.info')}/>}
          <Row compact color={svColor(settings.studentCanReschedule)} label={t('set.restr.reschedule')}>
            <Toggle color={svColor(settings.studentCanReschedule)} on={settings.studentCanReschedule} onChange={v=>upd("studentCanReschedule",v)}/>
          </Row>
          <Row compact color={svColor(settings.studentCanCancel)} label={t('set.restr.cancel')}>
            <Toggle color={svColor(settings.studentCanCancel)} on={settings.studentCanCancel} onChange={v=>upd("studentCanCancel",v)}/>
          </Row>
          <Row compact label={t('set.restr.cutoff')} hint={t('set.restr.cutoff_h')}>
            <NumInput compact value={settings.bookCutoffHours} onChange={v=>upd("bookCutoffHours",v)} min={0} max={48} suffix={` ${t('hr')}`}/>
          </Row>
          <Row compact label={t('set.restr.slotGen')} hint={t('set.restr.slotGen_h')}>
            <NumInput compact value={settings.slotGenDays ?? 30} onChange={v=>upd("slotGenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={t('set.restr.calendar')} hint={t('set.restr.calendar_h')}>
            <NumInput compact value={settings.calendarOpenDays} onChange={v=>upd("calendarOpenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={t('set.restr.schoolCalendar')} hint={t('set.restr.schoolCalendar_h')}>
            <NumInput compact value={settings.schoolCalendarOpenDays ?? 14} onChange={v=>upd("schoolCalendarOpenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={lang==="en"?"Min interval between bookings":"Мінімальний інтервал між записами"} hint={lang==="en"?"Minimum days between any two bookings for one student. 0 — disabled.":"Мінімум днів між будь-якими двома записами учня. 0 — без обмеження."} last>
            <NumInput compact value={settings.minBookingIntervalDays ?? 0} onChange={v=>upd("minBookingIntervalDays",v)} min={0} max={30} suffix={` ${t('days')}`}/>
          </Row>
        </div>
      );

      case "queue": return (
        <div>
          {showHint && <Info color={GREEN} title={t('set.queue.info_t')} text={t('set.queue.info')}/>}
          <div style={{paddingTop:2}}>
            <div style={{fontSize:9,color:"#fff",letterSpacing:1,textTransform:"uppercase",marginBottom:8,textAlign:"center"}}>{t('set.queue.mode')}</div>
            {[
              {k:"fifo",      label:t('set.queue.fifo'),   hint:t('set.queue.fifo_h')   },
              {k:"broadcast", label:t('set.queue.bc'),     hint:t('set.queue.bc_h')     },
              {k:"manual",    label:t('set.queue.manual'), hint:t('set.queue.manual_h') },
            ].map((o,i,arr)=>(
              <Row color={svColor(queueMode===o.k)} key={o.k} label={o.label} hint={o.hint} last={i===arr.length-1}>
                <Radio on={queueMode===o.k} onChange={()=>setQueueMode(o.k)}/>
              </Row>
            ))}
          </div>
        </div>
      );

      case "sticky": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.sticky.info_t')} text={t('set.sticky.info')}/>}
          <Row color={svColor(settings.stickyTimeEnabled !== false)} label={lang==="en"?"Enable feature":"Увімкнути"} hint={lang==="en"?"When off — all adjacent free slots are shown":"Вимкнено — всі вільні слоти видно завжди"}>
            <Toggle color={svColor(settings.stickyTimeEnabled !== false)} on={settings.stickyTimeEnabled !== false} onChange={v=>upd("stickyTimeEnabled",v)}/>
          </Row>
          {settings.stickyTimeEnabled !== false && (
            <div>
              {[
                {v:"before", l:t('set.sticky.before')},
                {v:"after",  l:t('set.sticky.after') },
                {v:"both",   l:t('set.sticky.both')  },
              ].map((o,i,arr)=>(
                <Row color={svColor(settings.stickyTime===o.v)} key={o.v} label={o.l} last={i===arr.length-1}>
                  <Radio on={settings.stickyTime===o.v} onChange={()=>upd("stickyTime",o.v)}/>
                </Row>
              ))}
            </div>
          )}
        </div>
      );

      case "auto": return (
        <div>
          {showHint && <Info color={GOLD} title={t('set.auto.info_t')} text={t('set.auto.info')}/>}
          <div style={{paddingTop:10,display:"flex",flexDirection:"column",gap:5}}>
            <div style={{fontSize:9,color:"#fff",letterSpacing:1,textTransform:"uppercase",marginBottom:2,textAlign:"center"}}>{t('set.auto.reminder')}</div>
            {reminders.map((r,i)=>(
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:8,
                background:`linear-gradient(135deg,color-mix(in srgb,${svColor(r.enabled)} ${r.enabled?38:22}%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                border:`1px solid color-mix(in srgb,${svColor(r.enabled)} ${r.enabled?35:25}%,transparent)`,
                borderRadius:10,padding:"7px 10px",
              }}>
                <SmallToggle color={svColor(r.enabled)} on={r.enabled} onChange={v=>updReminder(i,{enabled:v})}/>
                <span style={{fontSize:12,color:DIM,flex:1}}>
                  {lang==="en"?"Reminder":"Нагадування"} #{i+1}
                </span>
                <NumInput value={r.hoursBefore} onChange={v=>updReminder(i,{hoursBefore:v})} min={1} max={168} suffix={` ${t('hr')}`}/>
                <span style={{fontSize:11,color:FAINT}}>{t('set.auto.rem_h')}</span>
              </div>
            ))}
          </div>
          <Row color={svColor(!!settings.autoCancel?.enabled)} label={t('set.auto.cancel')}>
            <Toggle color={svColor(!!settings.autoCancel?.enabled)} on={!!settings.autoCancel?.enabled} onChange={v=>setSettings(s=>({...s,autoCancel:{...(s.autoCancel||{}),enabled:v}}))}/>
          </Row>
          <Row color={svColor(!!settings.autoQueueOffer?.enabled)} label={t('set.auto.queue')} last>
            <Toggle color={svColor(!!settings.autoQueueOffer?.enabled)} on={!!settings.autoQueueOffer?.enabled} onChange={v=>setSettings(s=>({...s,autoQueueOffer:{...(s.autoQueueOffer||{}),enabled:v}}))}/>
          </Row>
        </div>
      );

      case "surcharges": return (
        <div>
          {showHint && <Info color={GOLD}
            title={lang==="en"?"Surcharges & payment":"Надбавки і оплата"}
            text={lang==="en"
              ? "Configure extra paid add-ons the instructor can attach to a booking right from the schedule slot menu (e.g. \"driving range\", \"harder route\", etc.) — the student then sees the total price including the surcharge. \"Payment card\" is the card number shown to the student in \"My bookings\" with a copy button, so they can pay by transfer. Each \"Surcharge\" below is a fixed amount in UAH that can be quickly added to a lesson's price — add as many as you need, or remove one with the \"×\" button."
              : "Тут налаштовуються додаткові платні опції, які інструктор може додати до запису прямо в меню слота розкладу (наприклад, «виїзд на автодром», «складніший маршрут» тощо) — учень одразу бачить підсумкову суму з надбавкою. «Картка для оплати» — реквізити, які показуються учню в розділі «Мої записи» з кнопкою копіювання, щоб він міг оплатити переказом. Кожна «Надбавка» нижче — це фіксована сума в гривнях, яку можна швидко додати до вартості уроку; додай стільки варіантів, скільки потрібно, або видали кнопкою «×»."}
          />}
          <Row label="Картка для оплати" hint="Показується учням у «Моїх записах» з кнопкою копіювання">
            <input
              value={settings.paymentCard || ""}
              onChange={e=>upd("paymentCard", e.target.value)}
              placeholder="0000 0000 0000 0000"
              style={{
                background:`linear-gradient(145deg,${BG_DEEP},${SURF_LO})`,
                border:"none",outline:"none",color:TEXT,fontSize:13,fontWeight:700,
                padding:"8px 12px",borderRadius:10,boxShadow:SI,width:170,textAlign:"right",
                fontFamily:"inherit",
              }}/>
          </Row>
          <div style={{fontSize:12,color:FAINT,marginBottom:12,marginTop:12}}>
            Суми відображаються в меню слота при виборі надбавки.
          </div>
          {(settings.surcharges || []).map((amt, i) => (
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:10,marginBottom:5,
              padding:"10px 12px",borderRadius:10,
              background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO,
            }}>
              <span style={{fontSize:13,color:GOLD,fontWeight:700,flex:1}}>Надбавка {i+1}</span>
              <NumInput
                value={amt}
                onChange={v=>upd("surcharges", (settings.surcharges||[]).map((x,j)=>j===i?v:x))}
                min={50} max={99999} suffix="₴" step={50}
              />
              <button onClick={()=>upd("surcharges", (settings.surcharges||[]).filter((_,j)=>j!==i))} style={{
                background:"none",border:"none",cursor:"pointer",
                color:"rgba(248,113,113,0.8)",fontSize:20,lineHeight:1,padding:"0 4px",
              }}>×</button>
            </div>
          ))}
          <button onClick={()=>upd("surcharges", [...(settings.surcharges||[]), 100])} style={{
            width:"100%",padding:"11px",borderRadius:12,border:`1px dashed ${GREEN}88`,cursor:"pointer",
            background:"transparent",color:GREEN,fontSize:13,fontWeight:700,marginTop:2,
          }}>+ Додати надбавку</button>
        </div>
      );

      case "push": return (
        <div>
          {showHint && <Info color={GREEN}
            title={lang==="en"?"Student notifications":"Сповіщення учням"}
            text={lang==="en"
              ? "When a slot frees up within the next 10 days (a student cancelled or rescheduled), every student with notifications enabled gets one. Turn off the toggle below to stop these broadcasts. The \"Test notification\" button checks whether this browser can show notifications on this device at all."
              : "Коли в найближчі 10 днів звільняється слот (учень скасував або переніс запис), усім учням з увімкненими сповіщеннями надсилається сповіщення. Вимкни тумблер нижче, щоб зупинити ці розсилки. Кнопка «Тест повідомлення» перевіряє, чи браузер взагалі показує сповіщення на цьому пристрої."}
          />}
          <Row color={svColor(settings.slotFreedPushEnabled !== false)} label={lang==="en"?"Notify on freed slot":"Сповіщення при звільненні слоту"} hint={lang==="en"?"Notify all students when a slot within the next 10 days becomes free":"Сповіщення усім учням, коли в найближчі 10 днів звільняється слот"} last>
            <Toggle color={svColor(settings.slotFreedPushEnabled !== false)} on={settings.slotFreedPushEnabled !== false} onChange={v=>upd("slotFreedPushEnabled",v)}/>
          </Row>
          <PushDiag />
        </div>
      );

      case "reviews": return (
        <div>
          {showHint && <Info color={GOLD} title="Відгуки учнів" text="Учні лишають відгук автоматично після завершеного уроку. Відгук одразу зʼявляється на сайті — сховати можна кнопкою нижче, видалити не можна."/>}
          {reviews.length === 0 ? (
            <div style={{textAlign:"center",padding:"24px 12px",color:DIM,fontSize:12}}>Поки що немає відгуків</div>
          ) : reviews.map(rv => (
            <div key={`${rv.uid}_${rv.id}`} style={{
              padding:"10px 12px",borderRadius:11,marginBottom:6,
              background:SURF_LO,boxShadow:SI,opacity:rv.status==="hidden"?0.5:1,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:13,fontWeight:800,color:TEXT}}>{rv.studentName || "Учень"}</div>
                <div style={{color:GOLD,fontSize:12,letterSpacing:1}}>{"★".repeat(rv.rating||0)}{"☆".repeat(5-(rv.rating||0))}</div>
              </div>
              {rv.text && <div style={{fontSize:12,color:DIM,lineHeight:1.5,marginBottom:6}}>{rv.text}</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:10,color:FAINT}}>{rv.createdAt ? new Date(rv.createdAt).toLocaleDateString("uk-UA") : ""}</div>
                <button onClick={()=>toggleReviewHidden(rv)} style={{
                  padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                  background:rv.status==="hidden"?`linear-gradient(145deg,${GREEN},${GREEN})`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                  color:rv.status==="hidden"?"#fff":DIM,boxShadow:rv.status==="hidden"?"none":SO,
                }}>{rv.status==="hidden"?"Показати":"Сховати"}</button>
              </div>
            </div>
          ))}
        </div>
      );

      default: return null;
    }
  }

  const activeSec = SECTIONS.find(s => s.id === active);

  const forceUpdate = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(regs.map(r => r.unregister()));
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  };

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{
        display:"flex", flexDirection:"column", gap:10,
        fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif", color:TEXT,
      }}>

        {/* PANEL — section content */}
        <div style={{padding:"4px 4px 0", minWidth:0}}>
          <div style={{
            borderRadius:16,
            boxShadow:`0 0 0 1.5px ${isKava?"rgba(0,0,0,0.14)":"rgba(255,255,255,0.18)"}, 0 8px 28px rgba(0,0,0,0.28)`,
            background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
            padding:"12px 14px 14px",
          }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              {activeSec && (
                <div style={{fontSize:14,fontWeight:800,color:activeSec.color,display:"flex",alignItems:"center",gap:8}}>
                  <span>{activeSec.icon}</span>
                  <span>{activeSec.title}</span>
                </div>
              )}
              <button onClick={()=>setShowHint(v=>!v)} style={{
                width:28,height:28,borderRadius:8,border:"none",cursor:"pointer",flexShrink:0,
                background:showHint?`${GOLD}33`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:SO,transition:"all .15s",
              }}>💡</button>
            </div>
            {renderSection(active)}
          </div>
        </div>

        {/* SECTION RAIL — друга пігулка, візуально ідентична нижньому навбару
            (BottomNav у App.jsx: "скляні чипи" — той самий напівпрозорий фон,
            радіус, бордер, тінь; активна секція підсвічена зеленою заливкою
            чипу, без окремої рискою — так само як таби внизу).
            Рендериться через portal у document.body з position:fixed і
            bottom:navH (реальна виміряна висота #app-bottomnav) — тому
            дійсно "мертво" прибита над навбаром і не рухається під час
            скролу вмісту секції (на відміну від sticky, який пінився лише
            всередині скрол-контейнера вкладки). Спейсер після версії
            (не тут!) звільняє місце в потоці — якщо покласти його одразу
            після PANEL, версія й 40px-спейсер підуть услід за ним і
            опиняться рівно під фіксованою пігулкою, невидимі. */}
      </div>

      {createPortal(
        <div ref={railRef} style={{
          position:"fixed", left:0, right:0, bottom:navH, zIndex:50,
          padding:"6px 3px 0", pointerEvents:"none",
        }}>
          <div style={{
            background: isKava ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)",
            backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
            borderRadius:16,
            border:`1px solid ${BORDER}`,
            boxShadow: isKava
              ? "0 8px 24px rgba(92,42,26,0.14)"
              : "0 8px 24px rgba(0,0,0,0.45)",
            display:"flex", gap:2, padding:3,
            pointerEvents:"auto",
          }}>
            {SECTIONS.map(sec => {
              const isActive = active === sec.id;
              return (
                <button key={sec.id} onClick={()=>switchSection(sec.id)} title={sec.title} style={{
                  flex:"1 1 0", minWidth:0, padding:"8px 2px 7px",
                  background: isActive ? `color-mix(in srgb, ${GREEN} 18%, transparent)` : "transparent",
                  border:"none", cursor:"pointer", borderRadius:11,
                  display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                  position:"relative", fontFamily:"inherit",
                }}>
                  <SecIcon id={sec.id} color={sec.color} active={isActive} isKava={isKava}/>
                  <span style={{
                    fontSize:9, fontWeight:700,
                    color: isActive ? GREEN : (isKava ? DIM : FAINT),
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%",
                  }}>{sec.label}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {installPrompt && !installed && (
        <button onClick={handleInstallClick} style={{
          display:"block", margin:"12px auto 0", background:"rgba(255,255,255,0.05)",
          border:`1px solid ${BORDER}`, color:TEXT, cursor:"pointer",
          padding:"10px 24px", borderRadius:14, fontSize:13, fontWeight:700,
        }}>📲 Встановити додаток</button>
      )}
      {license && (() => {
        // eslint-disable-next-line react-hooks/purity -- лише для відображення "днів залишилось", не впливає на логіку
        const now = Date.now();
        const untilTs = license.status === "trial" ? license.trialEndsAt : license.expiresAt;
        const daysLeft = untilTs ? Math.ceil((untilTs - now) / 86400000) : null;
        const blocked = license.status === "suspended" || (daysLeft != null && daysLeft < 0);
        const statusColor = blocked ? RED : (daysLeft != null && daysLeft <= 3 ? GOLD : GREEN);
        const statusLabel = blocked ? "Призупинено" : license.status === "trial" ? "Пробний період" : "Активна";
        return (
          <div style={{
            margin:"12px 14px 0", padding:"12px 14px", borderRadius:14,
            background:SURF_HI, border:`1px solid ${BORDER}`, boxShadow:SI,
          }}>
            <div style={{fontSize:11, fontWeight:800, color:DIM, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4}}>Підписка</div>
            <div style={{fontSize:14, fontWeight:700, color:statusColor}}>{statusLabel}</div>
            {daysLeft != null && !blocked && (
              <div style={{fontSize:12, color:DIM, marginTop:2}}>Залишилось днів: {daysLeft}</div>
            )}
            {blocked && (
              <div style={{fontSize:12, color:DIM, marginTop:2}}>Зверніться до ID4Drive для продовження доступу.</div>
            )}
          </div>
        );
      })()}
      <div onClick={forceUpdate} style={{textAlign:"center",padding:"8px 0 2px",color:FAINT,fontSize:13,fontWeight:600,letterSpacing:0.5,cursor:"pointer"}}>
        {APP_VERSION}
      </div>
      <div style={{height:railH + 16}}/>
    </>
  );
}

function PushDiag() {
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, TEXT, DIM, FAINT, GREEN, RED, GOLD, BLUE, SO, SI } = useContext(ThemeContext);
  const [status, setStatus] = useState(null);

  async function testLocal() {
    try {
      if (!("Notification" in window)) { setStatus({ ok: false, msg: "Браузер не підтримує нотифікації" }); return; }
      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
      }
      if (perm !== "granted") {
        setStatus({ ok: false, msg: `Дозвіл: "${perm}" — дозволь нотифікації в налаштуваннях браузера` });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("🔔 ID4Drive тест", { body: "Сповіщення працюють!", icon: "/favicon.svg" });
      setStatus({ ok: true, msg: "Нотифікація відправлена — перевір системний трей" });
    } catch (e) {
      setStatus({ ok: false, msg: `Помилка: ${e.message}` });
    }
  }

  const perm = typeof Notification !== "undefined" ? Notification.permission : "unknown";
  const permColor = perm === "granted" ? GREEN : perm === "denied" ? RED : GOLD;
  const permLabel = perm === "granted" ? "✅ Дозволено" : perm === "denied" ? "❌ Заблоковано" : "⚠️ Не вирішено";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,padding:"4px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:BG_DEEP,borderRadius:9,boxShadow:SI}}>
        <span style={{fontSize:12,color:DIM}}>Дозвіл браузера</span>
        <span style={{fontSize:12,fontWeight:800,color:permColor}}>{permLabel}</span>
      </div>
      <div style={{display:"flex",gap:7}}>
        <button onClick={testLocal} style={{
          flex:1,padding:"10px 8px",borderRadius:10,border:"none",cursor:"pointer",
          background:`linear-gradient(145deg,rgba(126,217,87,0.18),rgba(126,217,87,0.06))`,
          color:GREEN,fontSize:12,fontWeight:700,boxShadow:SO,
        }}>🔔 Тест повідомлення</button>
      </div>
      {status && (
        <div style={{
          padding:"9px 12px",borderRadius:9,fontSize:12,fontWeight:600,
          background:status.ok?"rgba(126,217,87,0.12)":"rgba(239,68,68,0.12)",
          color:status.ok?GREEN:RED,border:`1px solid ${status.ok?"rgba(126,217,87,0.3)":"rgba(239,68,68,0.3)"}`,
        }}>{status.msg}</div>
      )}
    </div>
  );
}
