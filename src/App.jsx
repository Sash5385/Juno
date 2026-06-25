import React, { useState, useEffect, lazy, Suspense, createContext, useContext } from "react";
import { ref, onValue, update, push, remove, get } from "firebase/database";
import { db, registerAdminFCM, onAdminForegroundMessage } from "./firebase";
import { useAdminAuth, LoginScreen } from "./AdminAuth";
import { useAppUpdate } from "./hooks/useAppUpdate"
import { setGlobalLang, createT } from "./lang";
import { ThemeContext, getTheme } from "./theme.js";
import { APP_VERSION } from "./version.js";

export const LangContext = createContext('uk');

// ─── LAZY VIEWS
const ScheduleView  = lazy(()=>import("./views/id4drive-admin-v5").then(m=>({default:m.ScheduleView})))
const SettingsView  = lazy(()=>import("./views/id4drive-settings"))
const BookingsView  = lazy(()=>import("./views/id4drive-bookings"))
const StudentsView  = lazy(()=>import("./views/id4drive-students"))
const ServicesView  = lazy(()=>import("./views/id4drive-services"))
const ChatsView     = lazy(()=>import("./views/id4drive-chats"))
const TemplatesView = lazy(()=>import("./views/id4drive-templates"))
const StatsView     = lazy(()=>import("./views/id4drive-stats"))
const QueueView     = lazy(()=>import("./views/id4drive-queue"))
const JournalView   = lazy(()=>import("./views/id4drive-journal"))

const Loader = () => (
  <ThemeContext.Consumer>
    {(theme) => <div style={{color: theme.TEXT, padding: "20px"}}>Завантаження...</div>}
  </ThemeContext.Consumer>
);

import { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, GOLD, SO } from "./theme.js";

// ─── CSS ────────────────────────────────────────────────────────
const makeCSS = (theme) => {
  const scrollThumb = theme.BG_IMAGE
    ? `rgba(92,42,26,0.25)` // kava
    : `rgba(255,255,255,0.1)`;
  const spinnerBorder = theme.BG_IMAGE
    ? `rgba(92,42,26,0.12)`
    : `rgba(255,255,255,0.06)`;
  return `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body,html{margin:0;padding:0;background:${theme.BG}${theme.BG_IMAGE ? `;background-image:${theme.BG_IMAGE};background-size:cover;background-position:center top;background-attachment:fixed;background-repeat:no-repeat` : ""}}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:${scrollThumb};border-radius:3px}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:32px;height:32px;border:3px solid ${spinnerBorder};border-top-color:${theme.ACCENT};border-radius:50%;animation:spin .8s linear infinite}
@keyframes fade-tab{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.tab-anim{animation:fade-tab .22s ease both}
`;
};

// ─── ICONS (3D pillow) ───────────────────────────────────────────
const I3 = ({children,gr,s=36,r=12})=>(
  <div style={{
    width:s,height:s,borderRadius:r,background:gr,
    display:"inline-flex",alignItems:"center",justifyContent:"center",
    position:"relative",overflow:"hidden",flexShrink:0,
    boxShadow:"-2px 3px 8px rgba(0,0,0,0.45),inset 1px 1px 0 rgba(255,255,255,0.22),inset -1px -1px 0 rgba(0,0,0,0.3)"
  }}>
    <div style={{position:"absolute",top:0,right:0,width:"60%",height:"50%",background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.38) 0%,transparent 70%)",pointerEvents:"none"}}/>
    <div style={{position:"relative",zIndex:1}}>{children}</div>
  </div>
);

const INACTIVE_DARK = "linear-gradient(135deg,#2e3034,#26282c)";
const INACTIVE_KAVA = "linear-gradient(135deg,#6b3a22,#4a2210)";

const makeTabIcons = (inactiveGr) => ({
  schedule: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#5b9bff,#2563eb)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
  </I3>,
  bookings: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#34d399,#059669)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
  </I3>,
  students: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#c084fc,#7c3aed)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 18c0-2 2-4 4-4s3 1 3 3"/></svg>
  </I3>,
  services: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#fb923c,#ea580c)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M3 17V9l3-5h12l3 5v8M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 9h18"/></svg>
  </I3>,
  chats: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#34d399,#047857)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12c0 5-4 8-9 8-1.5 0-3-.3-4-.7L3 21l1-4C2.5 15.5 2 13.8 2 12c0-5 4-8 9-8s10 3 10 8z"/></svg>
  </I3>,
  templates: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#fcd34d,#d97706)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  </I3>,
  stats: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#a78bfa,#6d28d9)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="4" y2="10"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="14"/><line x1="22" y1="20" x2="2" y2="20"/></svg>
  </I3>,
  settings: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#94a3b8,#334155)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  </I3>,
  queue: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#c084fc,#7c3aed)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
  </I3>,
  journal: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#22d3ee,#0891b2)":inactiveGr}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="13" height="18" rx="2"/><line x1="8" y1="8" x2="13" y2="8"/><line x1="8" y1="12" x2="13" y2="12"/><line x1="8" y1="16" x2="11" y2="16"/><circle cx="18" cy="17" r="3.5"/><path d="M18 15.5V17l1 1"/></svg>
  </I3>,
});

const TabIcons = makeTabIcons(INACTIVE_DARK);

// ─── TABS CONFIG ─────────────────────────────────────────────────
const TAB_IDS = [
  { id:"schedule",  lk:"nav.schedule",  badge:null },
  { id:"journal",   lk:"nav.journal",   badge:null },
  { id:"queue",     lk:"nav.queue",     badge:null },
  { id:"bookings",  lk:"nav.bookings",  badge:null },
  { id:"students",  lk:"nav.students",  badge:null },
  { id:"services",  lk:"nav.services",  badge:null },
  { id:"chats",     lk:"nav.chats",     badge:null },
  { id:"templates", lk:"nav.templates", badge:null },
  { id:"stats",     lk:"nav.stats",     badge:null },
  { id:"settings",  lk:"nav.settings",  badge:null },
];

const TAB_TITLES = {
  schedule:"Розклад", bookings:"Букінги", queue:"Черга", students:"Учні",
  services:"Послуги", chats:"Чати", templates:"Шаблони",
  stats:"Статистика", journal:"Журнал", settings:"Налаштування"
};


// ─── BOTTOM NAV ──────────────────────────────────────────────────
function BottomNav({ active, onChange, settings, chatUnread, journalUnread }) {
  const lang = useContext(LangContext);
  const tl = createT(lang);
  const theme = useContext(ThemeContext);
  const isKava = settings?.theme === "light";
  const tabIcons = isKava ? makeTabIcons(INACTIVE_KAVA) : TabIcons;
  const visible = TAB_IDS.filter(t => settings?.navTabs?.includes(t.id) ?? true);

  const navBg = isKava
    ? `linear-gradient(180deg,#d9c4a0,#ccb48c)`
    : "linear-gradient(180deg,#3a3b40,#2e2f34)";
  const navBorder = isKava
    ? `1px solid ${theme.BORDER}`
    : "1px solid rgba(255,255,255,0.08)";
  const navShadow = isKava
    ? `0 8px 32px rgba(92,42,26,0.18), 0 2px 8px rgba(92,42,26,0.12)`
    : "0 12px 40px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4), 0 -1px 0 rgba(255,255,255,0.05)";
  const labelInactive = isKava ? theme.DIM : FAINT;

  return (
    <div style={{
      flexShrink:0,
      padding:`0 3px calc(10px + env(safe-area-inset-bottom, 0px))`,
      background: isKava ? "#d4ba96" : "transparent",
      zIndex:50,
      pointerEvents:"none",
    }}>
      <div style={{
        background:navBg,
        borderRadius:26,
        border:navBorder,
        boxShadow:navShadow,
        display:"flex", overflow:"hidden",
        pointerEvents:"auto",
      }}>
        {visible.map(t=>(
          <button key={t.id} onClick={()=>onChange(t.id)} style={{
            flex:"1 1 0",minWidth:0,padding:"13px 4px 11px",
            background:"transparent",border:"none",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:5,
            position:"relative"
          }}>
            <div style={{
              transform:active===t.id?"scale(1.1)":"scale(0.94)",
              transition:"transform .15s",
              opacity:active===t.id?1:0.52,
              position:"relative"
            }}>
              {tabIcons[t.id]?.(34,active===t.id)}
              {(t.id === 'chats' ? chatUnread : t.id === 'journal' ? journalUnread : t.badge) > 0 && (
                <div style={{
                  position:"absolute",top:-4,right:-4,
                  background:theme.ACCENT,color:"#fff",borderRadius:10,
                  padding:"1px 5px",fontSize:9,fontWeight:800,
                  boxShadow:`0 0 8px ${theme.ACCENT}88`,lineHeight:1.4
                }}>{t.id === 'chats' ? chatUnread : t.id === 'journal' ? journalUnread : t.badge}</div>
              )}
            </div>
            <span style={{fontSize:9,fontWeight:700,color:active===t.id?theme.ACCENT:labelInactive,whiteSpace:"nowrap"}}>{tl(t.lk)}</span>
            {active===t.id && (
              <div style={{
                position:"absolute",bottom:5,left:"50%",transform:"translateX(-50%)",
                width:28,height:3,borderRadius:2,
                background:theme.ACCENT,boxShadow:`0 0 10px ${theme.ACCENT}99`
              }}/>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── QUEUE STRIP ─────────────────────────────────────────────────
function QueueStrip({ tab, onChange }) {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    return onValue(ref(db, "queue"), snap => {
      const d = snap.val();
      if (!d) { setWaiting(0); return; }
      setWaiting(Object.values(d).filter(q=>q.status==="waiting").length);
    }, ()=>{});
  }, []);

  if (waiting === 0 && tab === "queue") return null;

  return (
    <div
      onClick={()=>onChange("queue")}
      style={{
        position:"sticky", top:37, zIndex:19,
        display:"flex", alignItems:"center", gap:8,
        padding:"7px 14px",
        background: tab==="queue"
          ? `linear-gradient(90deg,rgba(192,132,252,0.25),rgba(124,58,237,0.15))`
          : `linear-gradient(90deg,rgba(192,132,252,0.18),rgba(124,58,237,0.08))`,
        borderBottom:`1px solid rgba(192,132,252,0.25)`,
        backdropFilter:"blur(12px)",
        cursor:"pointer",
      }}
    >
      <span style={{fontSize:14}}>⏳</span>
      <span style={{fontSize:11,fontWeight:700,color:"#c084fc",flex:1}}>
        Черга очікування
      </span>
      {waiting > 0 && (
        <span style={{
          background:"linear-gradient(145deg,#c084fc,#7c3aed)",
          color:"#fff",borderRadius:8,padding:"1px 8px",
          fontSize:11,fontWeight:800,
          boxShadow:"0 0 8px rgba(192,132,252,0.5)",
        }}>{waiting} очікує</span>
      )}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  );
}

// ─── TAB INSTRUCTIONS ───────────────────────────────────────────
const INSTRUCTIONS = {
  schedule: "Розклад уроків. Клік на порожнє місце — записати учня, VIP-слот або заблокувати час. Утримати слот — видалити.",
  bookings: "Список записів учнів. Натисніть на картку — деталі, телефон, кнопки дій. Черга авто-відкривається якщо є очікуючі.",
  queue:    "Черга очікування. Перетягуй ⠿ для зміни пріоритету. Запросити → статус «Запрошено». Архів зберігає історію.",
  students: "Список учнів. Клік на картку — телефон, знижка, прогрес, записи. Пошук і фільтр за типом.",
  services: "Типи уроків з ціною і тривалістю. Перемикач — вкл/вимк. ☰ — порядок. ✏️ — редагувати.",
  chats:    "Листування з учнями. Клік на контакт — розгортає чат. ⚡ — швидкі відповіді.",
  templates:"Шаблони повідомлень. ➤ надіслати · ✏️ редагувати · 🗑 видалити.",
  stats:    "Статистика уроків, доходу і учнів за обраний період.",
  journal:  "Журнал змін графіку. Нові записи, скасування, перенесення — з датою та часом події.",
  settings: "Налаштування розкладу, послуг, черги та автоматичних повідомлень.",
};

// ─── TOP BAR ─────────────────────────────────────────────────────
function TopBar({ tab, onChange, settings, setSettings }) {
  const lang = useContext(LangContext);
  const tl = createT(lang);
  const tabLabel = tl(TAB_IDS.find(x=>x.id===tab)?.lk || tab);
  const [showInfo, setShowInfo] = useState(false);
  const instruction = INSTRUCTIONS[tab];

  // reset when tab changes
  useEffect(() => { setShowInfo(false); }, [tab]);

  const btnBase = {
    flex:"1 1 0",minWidth:0,padding:"4px 2px",borderRadius:9,border:"none",cursor:"pointer",
    transition:"all .15s",
    display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1,gap:1,
  };

  const theme = useContext(ThemeContext);
  const isKava = settings?.theme === "light";
  const topBgEnd = isKava
    ? `${theme.BG}ee`
    : "rgba(28,29,33,0.9)";
  const btnInactive = isKava
    ? `rgba(92,42,26,0.12)`
    : `rgba(255,255,255,0.08)`;
  const btnInactiveColor = isKava ? theme.DIM : "rgba(255,255,255,0.55)";

  return (
    <div style={{position:"sticky",top:0,zIndex:20}}>
      <div style={{
        padding:`calc(4px + env(safe-area-inset-top, 0px)) 8px 4px`,
        display:"flex",alignItems:"center",
        background:`linear-gradient(180deg,${theme.BG} 60%,${topBgEnd})`,
        backdropFilter:"blur(20px)",
        borderBottom:`1px solid ${showInfo ? "transparent" : theme.BORDER}`,
        minHeight:42,
      }}>
        {tab==="schedule" && settings && setSettings ? (
          <>
            {/* Left: годин buttons */}
            <div style={{flex:1,display:"flex",gap:3,alignItems:"center"}}>
              {[6,8,9,10,12].map(n=>{
                const totalH = (settings.workEnd - settings.workStart) * 60;
                const targetHpx = Math.round(totalH / n);
                const active = Math.abs(settings.hourHeightPx - targetHpx) < 5;
                return (
                  <button key={`h${n}`} onClick={()=>setSettings(s=>({...s,hourHeightPx:Math.round((s.workEnd-s.workStart)*60/n)}))} style={{
                    ...btnBase,
                    background:active?`linear-gradient(165deg,#5b9bff,#2563eb)`:btnInactive,
                    color:active?"#fff":btnInactiveColor,
                    boxShadow:active?`0 3px 8px rgba(91,155,255,0.5)`:"none",
                  }}>
                    <span style={{fontSize:15,fontWeight:800}}>{n}</span>
                    <span style={{fontSize:8,fontWeight:600,opacity:0.8}}>годин</span>
                  </button>
                );
              })}
            </div>

            {/* Center: logo */}
            <div style={{flex:"0 0 auto",display:"flex",justifyContent:"center",alignItems:"center",padding:"0 6px"}}>
              <img src="/icon-192.png" alt="ID4Drive" style={{width:26,height:26,borderRadius:"50%",flexShrink:0,boxShadow:"-2px 3px 8px rgba(0,0,0,0.45)"}}/>
            </div>

            {/* Right: діб buttons */}
            <div style={{flex:1,display:"flex",gap:3,alignItems:"center"}}>
              {[3,5,6,7,10].map(n=>{
                const active = settings.daysShown===n;
                return (
                  <button key={n} onClick={()=>setSettings(s=>({...s,daysShown:n}))} style={{
                    ...btnBase,
                    background:active?`linear-gradient(165deg,${theme.GOLD},#e6a800)`:btnInactive,
                    color:active?"#1a1200":btnInactiveColor,
                    boxShadow:active?`0 3px 8px ${theme.GOLD}55`:"none",
                  }}>
                    <span style={{fontSize:15,fontWeight:800}}>{n}</span>
                    <span style={{fontSize:8,fontWeight:600,opacity:0.8}}>діб</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
            <img src="/icon-192.png" alt="ID4Drive" style={{width:22,height:22,borderRadius:"50%",flexShrink:0,boxShadow:"-2px 3px 8px rgba(0,0,0,0.45)"}}/>
            <div style={{fontSize:13,fontWeight:800,letterSpacing:-0.3,color:theme.TEXT}}>{tabLabel}</div>
          </div>
        )}
      </div>
      {showInfo && instruction && (
        <div style={{
          padding:"8px 14px 10px",
          background:`linear-gradient(180deg,${theme.BG},${topBgEnd})`,
          backdropFilter:"blur(20px)",
          borderBottom:`1px solid ${theme.BORDER}`,
          fontSize:12,color:theme.DIM,lineHeight:1.55,
        }}>
          <span style={{color:theme.GOLD,fontWeight:700,marginRight:6}}>💡</span>{instruction}
        </div>
      )}
    </div>
  );
}

const INITIAL_BOOKINGS = [];

const DEFAULT_SETTINGS = {
  profile: { name:"Олександр", phone:"+380989225442", address:"Київ", experience:8, photo:null },
  workStart:7, workEnd:20, weekends:[6], daysShown:6, snapMin:30, slotCreateStep:30, hourHeightPx:60,
  lunchEnabled:true, lunchStart:12, lunchEnd:13, customBlocks:[], pendingEnabled:false,
  theme:"dark", language:"uk", queueAutoFifo:true, queueBroadcast:false, queueManual:false,
  studentCanReschedule:true, studentCanCancel:true, bookCutoffHours:2, calendarOpenDays:30,
  stickyTime:"both", notifLocation:"topbar", showCompleteBtn:true,
  navTabs:["schedule","journal","bookings","students","services","chats","templates","stats","settings"],
  autoReminders:[
    {enabled:true,  hoursBefore:24},
    {enabled:false, hoursBefore:2},
    {enabled:false, hoursBefore:1},
  ],
  autoWelcome:{enabled:true}, autoConfirm:{enabled:true},
  autoCancel:{enabled:true}, autoQueueOffer:{enabled:true},
  services: [
    { id:"sv1", name:"Автошкола 1 год", type:"school",  duration:60,  price:700,  colorId:"green",  active:true,  description:"" },
    { id:"sv2", name:"Автошкола 2 год", type:"school",  duration:120, price:1400, colorId:"green",  active:true,  description:"" },
    { id:"sv3", name:"Приватний 1 год", type:"private", duration:60,  price:1000, colorId:"yellow", active:true,  description:"" },
    { id:"sv4", name:"Приватний 2 год", type:"private", duration:120, price:2000, colorId:"yellow", active:true,  description:"" },
  ],
  categories: [
    { id:"cat-vip", name:"VIP",      colorId:"purple" },
    { id:"cat-std", name:"Стандарт", colorId:"blue" },
  ],
};

// ─── VIEW RENDERER ───────────────────────────────────────────────
function ViewRenderer({ tab, settings, setSettings, bookings, setBookings, onSlotClick, onEmptySlotClick, openInfos, toggleInfo, activeDragIds, navTo, slotExistsRef, openSlotsRef }) {
  if (tab === "schedule")  return <ScheduleView settings={settings} setSettings={setSettings} bookings={bookings} setBookings={setBookings} onSlotClick={onSlotClick} onEmptySlotClick={onEmptySlotClick} activeDragIds={activeDragIds} navTo={navTo} slotExistsRef={slotExistsRef} openSlotsRef={openSlotsRef}/>;
  if (tab === "settings")  return <SettingsView settings={settings} setSettings={setSettings}/>;
  if (tab === "bookings")  return <BookingsView settings={settings}/>;
  if (tab === "queue")     return <QueueView settings={settings}/>;
  if (tab === "students")  return <StudentsView/>;
  if (tab === "services")  return <ServicesView/>;
  if (tab === "chats")     return <ChatsView/>;
  if (tab === "templates") return <TemplatesView/>;
  if (tab === "stats")     return <StatsView/>;
  if (tab === "journal")   return <JournalView/>;
  return null;
}

// ─── DATE HELPERS ────────────────────────────────────────────────
// Convert Firebase date string ("2026-05-27") → day index where 0 = today
function dateToDayIdx(dateStr) {
  if (!dateStr) return -1;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}
// Convert day index (0=today) → date string "YYYY-MM-DD"
function dayIdxToDate(dayIdx) {
  const d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + dayIdx);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {
  const adminUser = useAdminAuth();
  const { needRefresh, updateServiceWorker, isUpdating } = useAppUpdate()
  const [tab,        setTab]      = useState(() => localStorage.getItem("admin_tab") || "schedule");
  const [tabVisits,  setTabVisits]= useState({});
  const [openInfos,  setOpenInfos]= useState({});
  const [settings,   setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [bookings,   setBookings] = useState(INITIAL_BOOKINGS);
  const [selectedBooking,  setSelectedBooking]  = useState(null);
  const [newBookingData,   setNewBookingData]    = useState(null);
  const [chatUnread,    setChatUnread]    = useState(0);
  const [journalUnread, setJournalUnread] = useState(0);
  const usersMapRef = React.useRef({});
  const rawBookingsSnapRef = React.useRef(null);

  const switchTab = t => {
    setTab(t);
    localStorage.setItem("admin_tab", t);
    setTabVisits(v => ({...v, [t]: (v[t]||0) + 1}));
    setOpenInfos({});
    if (t === 'chats') {
      setChatUnread(0);
      if ('clearAppBadge' in navigator) navigator.clearAppBadge();
    }
    if (t === 'journal') setJournalUnread(0);
  };
  const toggleInfo = key => setOpenInfos(s => ({...s, [key]: !s[key]}));

  // Initialize journal read timestamp on first ever app load
  useEffect(() => {
    if (!localStorage.getItem("journal_read_at")) {
      localStorage.setItem("journal_read_at", Date.now().toString());
    }
  }, []);

  // Tab navigation via custom event (from child components)
  useEffect(() => {
    const nav = e => switchTab(e.detail);
    window.addEventListener("id4drive-nav", nav);
    return () => window.removeEventListener("id4drive-nav", nav);
  }, []);

  // Network version check — bypasses SW cache. On mismatch, fully reset the
  // service worker + caches so a stuck client can never get wedged on old code.
  useEffect(() => {
    const hardReset = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch {}
      window.location.reload();
    };
    const check = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        const { version } = await res.json();
        if (version && version !== APP_VERSION) {
          const flag = 'vreset_' + version;
          if (sessionStorage.getItem(flag)) return; // guard against reload loops
          sessionStorage.setItem(flag, '1');
          hardReset();
        }
      } catch {}
    };
    const t0 = setTimeout(check, 10 * 1000);
    const id = setInterval(check, 60 * 1000);
    return () => { clearTimeout(t0); clearInterval(id); };
  }, []);

  // Subscribe to unread chat count from chatMeta
  useEffect(() => {
    if (!adminUser) return;
    const r = ref(db, 'chatMeta');
    const unsub = onValue(r, snap => {
      const data = snap.val() || {};
      const total = Object.values(data).reduce((s, m) => s + (m?.unreadForAdmin || 0), 0);
      setChatUnread(total);
      if (total > 0 && 'setAppBadge' in navigator) navigator.setAppBadge(total);
      else if ('clearAppBadge' in navigator) navigator.clearAppBadge();
    });
    return unsub;
  }, [adminUser]);

  // Clear badge when app comes into focus
  useEffect(() => {
    const onFocus = () => {
      if (tab === 'chats' && 'clearAppBadge' in navigator) navigator.clearAppBadge();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tab]);

  // Register FCM token on login and every time tab becomes visible (handles token rotation)
  useEffect(() => {
    if (!adminUser) return;
    registerAdminFCM().catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") registerAdminFCM().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [adminUser]);

  // Show foreground push notifications (when admin tab is open)
  useEffect(() => {
    if (!adminUser) return;
    return onAdminForegroundMessage((payload) => {
      const title = payload.notification?.title || "ID4Drive";
      const body  = payload.notification?.body  || "";
      if (Notification.permission === "granted" && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, {
            body,
            icon: "/favicon.svg",
            tag: "admin-" + Date.now(),
            requireInteraction: true,
          });
        });
      }
    });
  }, [adminUser]);

  // Sync services from admin_data/services → settings.services (source of truth for colors)
  useEffect(() => {
    if (!adminUser) return;
    return onValue(ref(db, "admin_data/services"), snap => {
      const arr = snap.val();
      if (Array.isArray(arr) && arr.length > 0) {
        setSettings(s => ({ ...s, services: arr }));
      }
    });
  }, [adminUser]);

  // Load settings from Firebase on login
  useEffect(() => {
    if (!adminUser) { setSettingsLoaded(false); return; }
    get(ref(db, 'admin_settings')).then(snap => {
      const d = snap.val();
      if (d) {
        const { services: _ignoredServices, ...dRest } = d;
        setSettings(s => ({
          ...s,
          ...dRest,
          snapMin: d.interval ?? d.snapMin ?? s.snapMin,
          profile: d.profile ? { ...s.profile, ...d.profile } : s.profile,
          // services come exclusively from admin_data/services listener — do not overwrite here
          categories:  Array.isArray(d.categories)  ? d.categories  : s.categories,
          weekends:    Array.isArray(d.weekends)     ? d.weekends    : s.weekends,
          navTabs: Array.isArray(d.navTabs)
          ? (d.navTabs.includes('journal') ? d.navTabs : (() => {
              const arr = [...d.navTabs];
              const idx = arr.indexOf('schedule');
              arr.splice(idx >= 0 ? idx + 1 : 0, 0, 'journal');
              return arr;
            })())
          : s.navTabs,
          autoReminders: Array.isArray(d.autoReminders) ? d.autoReminders : s.autoReminders,
          weekSchedule:  Array.isArray(d.weekSchedule)  ? d.weekSchedule  : s.weekSchedule,
          dateOverrides: Array.isArray(d.dateOverrides)  ? d.dateOverrides : s.dateOverrides,
        }));
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, [adminUser]);

  // Sync all settings to Firebase (guarded until load completes to avoid overwriting with defaults)
  const settingsSyncTimer = React.useRef(null);
  useEffect(() => {
    if (!adminUser || !settingsLoaded) return;
    clearTimeout(settingsSyncTimer.current);
    settingsSyncTimer.current = setTimeout(() => {
      update(ref(db, 'admin_settings'), {
        lunchEnabled:    settings.lunchEnabled    ?? true,
        lunchStart:      settings.lunchStart      ?? 12,
        lunchEnd:        settings.lunchEnd        ?? 13,
        workStart:       settings.workStart       ?? 9,
        workEnd:         settings.workEnd         ?? 18,
        interval:        settings.snapMin         ?? 30,
        snapMin:         settings.snapMin         ?? 30,
        slotCreateStep:  settings.slotCreateStep  ?? 30,
        queueAutoFifo:   settings.queueAutoFifo   ?? true,
        queueBroadcast:  settings.queueBroadcast  ?? false,
        queueManual:     settings.queueManual     ?? false,
        weekSchedule:    settings.weekSchedule    ?? null,
        dateOverrides:   settings.dateOverrides   ?? [],
        services:        settings.services        ?? [],
        categories:      settings.categories      ?? [],
        profile:         settings.profile,
        weekends:        settings.weekends        ?? [],
        daysShown:       settings.daysShown       ?? 6,
        hourHeightPx:    settings.hourHeightPx    ?? 60,
        pendingEnabled:  settings.pendingEnabled  ?? false,
        studentCanReschedule: settings.studentCanReschedule ?? true,
        studentCanCancel:     settings.studentCanCancel     ?? true,
        bookCutoffHours:      settings.bookCutoffHours      ?? 2,
        calendarOpenDays:     settings.calendarOpenDays     ?? 30,
        stickyTime:      settings.stickyTime      ?? "both",
        notifLocation:   settings.notifLocation   ?? "topbar",
        navTabs:         settings.navTabs         ?? [],
        autoReminders:   settings.autoReminders   ?? [],
        autoWelcome:     settings.autoWelcome,
        autoConfirm:     settings.autoConfirm,
        autoCancel:      settings.autoCancel,
        autoQueueOffer:  settings.autoQueueOffer,
        language:        settings.language        ?? "uk",
        theme:           settings.theme           ?? "dark",
        customBlocks:    settings.customBlocks    ?? [],
        showCompleteBtn:      settings.showCompleteBtn      ?? true,
        stickyTimeEnabled:    settings.stickyTimeEnabled    ?? true,
        minBookingIntervalDays: settings.minBookingIntervalDays ?? 0,
      }).catch(() => {});
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, adminUser, settingsLoaded]);

  // Load bookings from Firebase
  const processBookingsSnap = React.useCallback((data) => {
    if (!data) return;
    const all = [];
    Object.entries(data).forEach(([uid, userBkgs]) => {
      if (!userBkgs || typeof userBkgs !== 'object') return;
      Object.entries(userBkgs).forEach(([key, b]) => {
        if (b.status === 'cancelled') return;
        const umap = usersMapRef.current[uid] || {};
        const tsc = b.tsc || umap.profile?.tsc || umap.tsc || "";
        all.push({
          ...b,
          id:        b.id || key,
          _fbKey:    key,
          userId:    uid,
          day:       dateToDayIdx(b.date),
          startMin:  b.startMin ?? (parseInt((b.time||"0:0").split(":")[0])*60 + parseInt((b.time||"0:0").split(":")[1])),
          durMin:    b.durMin   ?? (b.durationHours ? b.durationHours*60 : 60),
          name:      b.studentName || b.name || "Без імені",
          type:      b.serviceType || b.type || "private",
          tsc,
        });
      });
    });
    const allIds = new Set(all.map(fb => fb.id));
    setBookings(prev => {
      const prevMap = new Map(prev.map(b => [b.id, b]));
      return all
        .filter(fb => !pendingDeletesRef.current.has(fb.id))
        .map(fb =>
          (moveSaveTimers.current[fb.id] || activeDragIds.current.has(fb.id))
            ? (prevMap.get(fb.id) || fb)
            : fb
        )
        .concat(
          prev.filter(b =>
            !allIds.has(b.id) &&
            !pendingDeletesRef.current.has(b.id) &&
            b.status !== 'cancelled' &&
            (moveSaveTimers.current[b.id] || activeDragIds.current.has(b.id))
          )
        );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep users map fresh — reprocess bookings when it updates so TSC is always current
  useEffect(() => {
    if (!adminUser) return;
    return onValue(ref(db, "users"), snap => {
      usersMapRef.current = snap.val() || {};
      if (rawBookingsSnapRef.current) processBookingsSnap(rawBookingsSnapRef.current);
    });
  }, [adminUser, processBookingsSnap]);

  useEffect(() => {
    if (!adminUser) {
      Object.values(moveSaveTimers.current).forEach(clearTimeout);
      moveSaveTimers.current = {};
      return;
    }
    return onValue(ref(db, "bookings"), snap => {
      const data = snap.val();
      rawBookingsSnapRef.current = data;
      processBookingsSnap(data);
      const readAt = parseInt(localStorage.getItem("journal_read_at") || "0", 10);
      if (readAt && data) {
        let cnt = 0;
        Object.values(data).forEach(u => { if (u) Object.values(u).forEach(b => {
          if (!b) return;
          if (b.createdAt     && b.createdAt     > readAt) cnt++;
          if (b.cancelledAt   && b.cancelledAt   > readAt) cnt++;
          if (b.rescheduledAt && b.rescheduledAt > readAt) cnt++;
        }); });
        setJournalUnread(cnt);
      }
    });
  }, [adminUser, processBookingsSnap]);

  // Debounce map for move/resize saves (avoids Firebase write on every pointermove)
  const moveSaveTimers = React.useRef({});
  // Original positions captured at drag start — used for slot restoration
  const moveOriginals = React.useRef({});
  // Tracks bookings currently being dragged/resized (set at onPointerDown, before first save timer)
  const activeDragIds = React.useRef(new Set());
  // Map of existing Firebase timeslot nodes: { dateStr: Set<"HH:MM"> }
  const slotExistsRef = React.useRef({});
  // Map of open slot data (including surcharge): { dateStr: { "HH:MM": { surcharge, ... } } }
  const openSlotsRef = React.useRef({});
const pendingDeletesRef = React.useRef(new Set());

  const handleSetBookings = fn => {
    setBookings(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      const prevMap = new Map(prev.map(b => [b.id, b]));
      const nextIds  = new Set(next.map(b => b.id));
      const bookingPatches = new Map(); // id → partial fields to merge after forEach

      // Під час drag пропускаємо всю Firebase-логіку крім debounce-таймера позиції.
      // Це запобігає випадковим delete/create операціям під час кожного pointermove.
      const dragging = activeDragIds.current.size > 0;
      const bookingDateOf = (x) => Number.isInteger(x.day) ? dayIdxToDate(x.day) : x.date;
      // Аудит: хто і коли змінив слот — пишемо в сам слот для дебагу
      // (видно, чому слот став доступним/недоступним).
      const auditBy = adminUser?.uid || "admin";

      // Годинний слот H зайнятий, якщо запис перетинає [H:00, H+1:00). Перебираємо
      // всі години, які перекриває запис (а не лише позицію startMin), щоб слот,
      // накритий навіть наполовину (напр. запис о :30), теж ставав недоступним.
      // acc !== null → пишемо в спільний об'єкт (атомарний запис разом з бронюванням),
      // інакше робимо самостійний update.
      const blockSlots = (date, startMin, durMin, onlyExisting = false, acc = null) => {
        if (!date) return;
        const existsForDate = slotExistsRef.current[date];
        const endMin = startMin + durMin;
        const upd = acc || {};
        const now = Date.now();
        for (let cur = Math.floor(startMin / 60) * 60; cur < endMin; cur += 60) {
          const h = String(Math.floor(cur / 60)).padStart(2, "0");
          const m = "00";
          // При переносі (onlyExisting) позначаємо зайнятими лише вже згенеровані
          // слоти — не створюємо нові вузли в днях без розкладу, інакше
          // перетягування «спавнить» вільні слоти в чужих днях.
          if (onlyExisting && !existsForDate?.has(`${h}:${m}`)) continue;
          const key = `timeslots/${date}/slot${h}${m}`;
          upd[`${key}/available`] = false;
          upd[`${key}/time`] = `${h}:${m}`;
          upd[`${key}/lastChangedBy`] = auditBy;
          upd[`${key}/lastChangedAt`] = now;
        }
        if (!acc && Object.keys(upd).length) update(ref(db, "/"), upd).catch(() => {});
      };

      const freeSlots = (date, startMin, durMin, acc = null) => {
        if (!date) return;
        const existsForDate = slotExistsRef.current[date];
        const endMin = startMin + durMin;
        const upd = acc || {};
        const now = Date.now();
        for (let cur = Math.floor(startMin / 60) * 60; cur < endMin; cur += 60) {
          const slotEnd = cur + 60;
          // Не звільняємо годину, яку все ще перекриває інший активний запис
          // (інакше слот, поділений між двома записами, помилково став би вільним).
          const stillTaken = next.some(x =>
            x.status !== "cancelled" && bookingDateOf(x) === date &&
            x.startMin < slotEnd && x.startMin + x.durMin > cur);
          if (stillTaken) continue;
          const h = String(Math.floor(cur / 60)).padStart(2, "0");
          const m = "00";
          const key = `timeslots/${date}/slot${h}${m}`;
          if (existsForDate?.has(`${h}:${m}`)) {
            upd[`${key}/available`] = true;
            upd[`${key}/lastChangedBy`] = auditBy;
            upd[`${key}/lastChangedAt`] = now;
          } else {
            upd[key] = null;
          }
        }
        if (!acc && Object.keys(upd).length) update(ref(db, "/"), upd).catch(() => {});
      };

      if (!dragging) {
        // 1. Deleted bookings → mark cancelled in Firebase + free timeslots
        prev.forEach(b => {
          if (!nextIds.has(b.id) && b.userId && b.id) {
            pendingDeletesRef.current.add(b.id);
            freeSlots(b.date, b.startMin, b.durMin);
            Promise.resolve().then(() => {
              const keys = [...new Set([b._fbKey, b.id].filter(Boolean))];
              const now = Date.now();
              Promise.all(keys.map(k =>
                update(ref(db, `bookings/${b.userId}/${k}`), { status:'cancelled', cancelledAt:now, cancelledBy:'admin' }).catch(() =>
                  remove(ref(db, `bookings/${b.userId}/${k}`)).catch(() => {})
                )
              )).finally(() => setTimeout(() => pendingDeletesRef.current.delete(b.id), 3000));
            });
          }
        });
      }

      next.forEach(b => {
        const p = prevMap.get(b.id);

        if (!dragging) {
          // 2. New admin-created bookings (no userId) → save under admin UID + block timeslots
          if (!p && !b.userId && b.id && adminUser) {
            const hh = String(Math.floor(b.startMin / 60)).padStart(2, "0");
            const mm = String(b.startMin % 60).padStart(2, "0");
            const date = dayIdxToDate(b.day);
            update(ref(db, `bookings/${adminUser.uid}/${b.id}`), {
              ...b,
              userId: adminUser.uid,
              date,
              time: `${hh}:${mm}`,
              durationHours: b.durMin / 60,
            }).catch(() => {});
            blockSlots(date, b.startMin, b.durMin);
            bookingPatches.set(b.id, { userId: adminUser.uid, date });
            return;
          }
        }

        if (!b.userId || !b.id || !p) return;

        if (!dragging) {
          // 3. Status change → save immediately
          if (p.status !== b.status) {
            const patch = { status: b.status };
            if (b.status === 'cancelled') {
              patch.cancelledBy = 'admin';
              patch.cancelledAt = Date.now();
              freeSlots(b.date, b.startMin, b.durMin);
              Promise.resolve().then(() => setBookings(bs => bs.filter(x => x.id !== b.id)));
            }
            update(ref(db, `bookings/${b.userId}/${b._fbKey || b.id}`), patch).catch(() => {});
            return;
          }
        }

        // 4. Move/resize → debounce (працює і під час drag, і після)
        if (p.startMin !== b.startMin || p.durMin !== b.durMin || p.day !== b.day) {
          // Capture original position only once (first detection), before any intermediate frames
          if (!moveSaveTimers.current[b.id]) {
            moveOriginals.current[b.id] = { startMin: p.startMin, durMin: p.durMin, day: p.day, date: p.date };
          }
          clearTimeout(moveSaveTimers.current[b.id]);
          const doSaveMove = () => {
            // Defer write until drag is fully released (activeDragIds cleared after 700ms)
            if (activeDragIds.current.has(b.id)) {
              moveSaveTimers.current[b.id] = setTimeout(doSaveMove, 800);
              return;
            }
            const hh = String(Math.floor(b.startMin / 60)).padStart(2, "0");
            const mm = String(b.startMin % 60).padStart(2, "0");
            const newDate = dayIdxToDate(b.day);
            // Recalculate surcharge for the new slot position
            const newSlotsForDate = openSlotsRef.current[newDate] || {};
            let newSurcharge = 0;
            for (let i = 0; i < b.durMin / 60; i++) {
              const slotMin = b.startMin + i * 60;
              const sh = String(Math.floor(slotMin / 60)).padStart(2, "0");
              const sm = String(slotMin % 60).padStart(2, "0");
              newSurcharge += newSlotsForDate[`${sh}:${sm}`]?.surcharge || 0;
            }
            const oldSurcharge = b.surcharge || 0;
            const discountFactor = 1 - (b.discountPct || 0) / 100;
            // Атомарність: звільнення старих слотів + блокування нових + оновлення
            // запису одним update(). Якщо Firebase відхилить — не запишеться нічого,
            // тож не буде стану «слот вільний, але запис уже там» чи навпаки.
            // Стару дату беремо з orig.day (надійний абсолютний індекс), а не з
            // orig.date — поле date під час drag не оновлюється і при повторному
            // перетягуванні залишається застарілим, через що звільнявся не той день.
            const upd = {};
            const orig = moveOriginals.current[b.id];
            const origDate = orig ? dayIdxToDate(orig.day) : null;
            if (orig && origDate && (origDate !== newDate || orig.startMin !== b.startMin || orig.durMin !== b.durMin)) {
              freeSlots(origDate, orig.startMin, orig.durMin, upd);
            }
            blockSlots(newDate, b.startMin, b.durMin, true, upd);
            const bp = `bookings/${b.userId}/${b._fbKey || b.id}`;
            upd[`${bp}/startMin`]      = b.startMin;
            upd[`${bp}/durMin`]        = b.durMin;
            upd[`${bp}/durationHours`] = b.durMin / 60;
            upd[`${bp}/day`]           = b.day;
            upd[`${bp}/date`]          = newDate;
            upd[`${bp}/time`]          = `${hh}:${mm}`;
            upd[`${bp}/rescheduledAt`] = Date.now();
            if (b.price != null) {
              upd[`${bp}/price`] = b.price + Math.round((newSurcharge - oldSurcharge) * discountFactor);
              if (newSurcharge) upd[`${bp}/surcharge`] = newSurcharge;
            }
            update(ref(db, "/"), upd).catch(() => {
              // Відкат: атомарний запис не пройшов, тож у Firebase нічого не
              // змінилось. Повертаємо картку на старе місце, щоб UI не розходився з БД.
              if (orig) {
                setBookings(bs => bs.map(x => x.id === b.id
                  ? { ...x, startMin: orig.startMin, durMin: orig.durMin, day: orig.day, date: dayIdxToDate(orig.day) }
                  : x));
              }
              console.warn("[move] save failed — reverted booking", b.id);
            }).finally(() => {
              delete moveSaveTimers.current[b.id];
              delete moveOriginals.current[b.id];
            });
          };
          moveSaveTimers.current[b.id] = setTimeout(doSaveMove, 50);
        }
      });

      return bookingPatches.size > 0
        ? next.map(b => { const p = bookingPatches.get(b.id); return p ? { ...b, ...p } : b; })
        : next;
    });
  };

  const lang = settings.language || 'uk';
  useEffect(() => { setGlobalLang(lang); }, [lang]);

  const theme = getTheme(settings.theme);
  const css = makeCSS(theme);

  if (adminUser === undefined) return null;
  if (adminUser === null) return <LoginScreen/>;

  return (
    <ThemeContext.Provider value={theme}>
    <LangContext.Provider value={lang}>
    <>
      <style>{css}</style>
      <div style={{
        height:"100dvh",background:"transparent",color:theme.TEXT,
        fontFamily:"ui-sans-serif,-apple-system,BlinkMacSystemFont,system-ui,sans-serif",
        display:"flex",flexDirection:"column"
      }}>
        <TopBar tab={tab} onChange={switchTab} settings={settings} setSettings={setSettings}/>
        <div className="tab-anim" key={`${tab}-${tabVisits[tab]||0}`} style={{
          flex:1, minHeight:0,
          overflowY: tab==="schedule" ? "hidden" : "auto",
          padding: tab==="schedule" ? "0 3px 11px" : "14px 14px 14px",
          display: tab==="schedule" ? "flex" : "block",
          flexDirection:"column",
          background: theme.BG_IMAGE ? "#d4ba96" : "transparent",
        }}>
          <Suspense fallback={<Loader/>}>
            <ViewRenderer tab={tab} settings={settings} setSettings={setSettings} bookings={bookings} setBookings={handleSetBookings} onSlotClick={setSelectedBooking} onEmptySlotClick={setNewBookingData} openInfos={openInfos} toggleInfo={toggleInfo} activeDragIds={activeDragIds} navTo={switchTab} slotExistsRef={slotExistsRef} openSlotsRef={openSlotsRef}/>
          </Suspense>
        </div>
        <BottomNav active={tab} onChange={switchTab} settings={settings} chatUnread={chatUnread} journalUnread={journalUnread}/>
      </div>
      {needRefresh && (
        <div className={`update-banner${isUpdating ? ' update-banner--loading' : ''}`} onClick={updateServiceWorker}>
          {isUpdating
            ? <><span className="update-spinner" /> Оновлення...</>
            : 'Доступне оновлення — натисніть щоб оновити'
          }
        </div>
      )}
    </>
    </LangContext.Provider>
    </ThemeContext.Provider>
  );
}
