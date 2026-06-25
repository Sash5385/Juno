import React, { useState, lazy, Suspense } from "react";

// ─── LAZY VIEWS
const ScheduleView  = lazy(()=>import("./views/id4drive-admin-v5").then(m=>({default:m.ScheduleView})))
const SettingsView  = lazy(()=>import("./views/id4drive-admin-v5").then(m=>({default:m.SettingsView})))
const BookingsView  = lazy(()=>import("./views/id4drive-bookings"))
const StudentsView  = lazy(()=>import("./views/id4drive-students"))
const ServicesView  = lazy(()=>import("./views/id4drive-services"))
const ChatsView     = lazy(()=>import("./views/id4drive-chats"))
const TemplatesView = lazy(()=>import("./views/id4drive-templates"))
const StatsView     = lazy(()=>import("./views/id4drive-stats"))

const Loader = () => <div style={{color: "white", padding: "20px"}}>Завантаження...</div>;

// ─── TOKENS ─────────────────────────────────────────────────────
const BG      = "#1c1d21";
const BG_DEEP = "#161719";
const SURFACE = "#26282c";
const SURF_HI = "#2e3034";
const SURF_LO = "#1f2125";
const BORDER  = "rgba(255,255,255,0.05)";
const TEXT    = "#e8e8ea";
const DIM     = "#8b8d93";
const FAINT   = "#5a5c62";
const ACCENT  = "#ff5a3c";
const ACC_HI  = "#ff7a5c";
const GREEN   = "#7ed957";
const BLUE    = "#5b9bff";
const GOLD    = "#f7c948";

const SO = "6px 6px 16px rgba(0,0,0,0.45),-3px -3px 10px rgba(255,255,255,0.025)";

// ─── CSS ────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body,html{margin:0;padding:0;background:${BG}}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,0.06);border-top-color:${ACCENT};border-radius:50%;animation:spin .8s linear infinite}
@keyframes fade-tab{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.tab-anim{animation:fade-tab .22s ease both}
`;

// ─── INLINE VIEWS (schedule + settings already in v5 — rebuilt here compactly) ──
// Кожна вкладка — окремий компонент нижче або lazy-loaded

// ─── LAZY VIEWS ─────────────────────────────────────────────────
// У реальному проекті це були б:
// const BookingsView  = lazy(()=>import("./id4drive-bookings"));
// Тут — inline заглушки з повідомленням, бо всі компоненти в окремих файлах

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

const TabIcons = {
  schedule: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#5b9bff,#2563eb)":"linear-gradient(135deg,#2e3034,#26282c)"}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
  </I3>,
  bookings: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#34d399,#059669)":"linear-gradient(135deg,#2e3034,#26282c)"}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
  </I3>,
  students: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#c084fc,#7c3aed)":"linear-gradient(135deg,#2e3034,#26282c)"}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 18c0-2 2-4 4-4s3 1 3 3"/></svg>
  </I3>,
  services: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#fb923c,#ea580c)":"linear-gradient(135deg,#2e3034,#26282c)"}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M3 17V9l3-5h12l3 5v8M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 9h18"/></svg>
  </I3>,
  chats: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#34d399,#047857)":"linear-gradient(135deg,#2e3034,#26282c)"}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12c0 5-4 8-9 8-1.5 0-3-.3-4-.7L3 21l1-4C2.5 15.5 2 13.8 2 12c0-5 4-8 9-8s10 3 10 8z"/></svg>
  </I3>,
  templates: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#fcd34d,#d97706)":"linear-gradient(135deg,#2e3034,#26282c)"}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  </I3>,
  stats: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#a78bfa,#6d28d9)":"linear-gradient(135deg,#2e3034,#26282c)"}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="4" y2="10"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="14"/><line x1="22" y1="20" x2="2" y2="20"/></svg>
  </I3>,
  settings: (s,active) => <I3 s={s} r={s*0.3} gr={active?"linear-gradient(165deg,#94a3b8,#334155)":"linear-gradient(135deg,#2e3034,#26282c)"}>
    <svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  </I3>,
};

// ─── TABS CONFIG ─────────────────────────────────────────────────
const TABS = [
  { id:"schedule",  label:"Записи",   badge:null },
  { id:"bookings",  label:"Букінги",  badge:3    },
  { id:"students",  label:"Учні",     badge:null },
  { id:"services",  label:"Послуги",  badge:null },
  { id:"chats",     label:"Чати",     badge:8    },
  { id:"templates", label:"Шаблони",  badge:null },
  { id:"stats",     label:"Статист.", badge:null },
  { id:"settings",  label:"Налашт.",  badge:null },
];

const TAB_TITLES = {
  schedule:"Розклад", bookings:"Букінги", students:"Учні",
  services:"Послуги", chats:"Чати", templates:"Шаблони",
  stats:"Статистика", settings:"Налаштування"
};


// ─── PLACEHOLDER (поки не підключено) ────────────────────────────
function Placeholder({ tab, file }) {
  return (
    <div style={{
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      gap:16,padding:"40px 20px",
      background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
      borderRadius:20,margin:"0 0 12px",
      boxShadow:SO,border:`1px solid ${BORDER}`
    }}>
      {TabIcons[tab]?.(64,true)}
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:6}}>{TAB_TITLES[tab]}</div>
        <div style={{fontSize:12,color:DIM,marginBottom:12}}>Компонент підключається з файлу:</div>
        <div style={{
          fontSize:12,color:ACCENT,fontWeight:700,
          background:"rgba(255,90,60,0.1)",padding:"6px 14px",borderRadius:10,
          border:"1px solid rgba(255,90,60,0.2)",fontFamily:"monospace"
        }}>{file}</div>
      </div>
      <div style={{fontSize:11,color:FAINT,textAlign:"center",maxWidth:280}}>
        У production-версії тут рендериться повний компонент через lazy import
      </div>
    </div>
  );
}

// ─── SCHEDULE MINI (вбудована заглушка з інфо) ───────────────────
function ScheduleInfo() {
  const files = [
    { file:"id4drive-admin-v5.jsx",    comp:"ScheduleView + SettingsView", lines:1304 },
    { file:"id4drive-bookings.jsx",    comp:"BookingsView",                lines:703  },
    { file:"id4drive-students.jsx",    comp:"StudentsView",                lines:683  },
    { file:"id4drive-services.jsx",    comp:"ServicesView",                lines:612  },
    { file:"id4drive-chats.jsx",       comp:"ChatsView",                   lines:647  },
    { file:"id4drive-templates.jsx",   comp:"TemplatesView",               lines:597  },
    { file:"id4drive-stats.jsx",       comp:"StatsView",                   lines:462  },
  ];
  const totalLines = files.reduce((s,f)=>s+f.lines,0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {/* header card */}
      <div style={{
        background:`linear-gradient(135deg,rgba(255,90,60,0.15),rgba(255,90,60,0.05))`,
        borderRadius:20,padding:"20px",
        border:`1px solid rgba(255,90,60,0.25)`,
        boxShadow:SO
      }}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <I3 s={52} r={16} gr="linear-gradient(165deg,#ff7a5c,#ff5a3c)">
            <span style={{fontSize:26,position:"relative",zIndex:1}}>🚗</span>
          </I3>
          <div>
            <div style={{fontSize:20,fontWeight:900,color:TEXT,letterSpacing:-0.5}}>ID4Drive Admin</div>
            <div style={{fontSize:12,color:DIM,marginTop:2}}>Панель управління інструктора</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[
            {label:"Файлів",    val:files.length,        c:BLUE},
            {label:"Рядків",    val:totalLines,          c:GOLD},
            {label:"Вкладок",   val:8,                   c:ACCENT},
          ].map(s=>(
            <div key={s.label} style={{
              background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,
              borderRadius:12,padding:"10px",textAlign:"center",
              boxShadow:"inset 3px 3px 8px rgba(0,0,0,0.4)"
            }}>
              <div style={{fontSize:18,fontWeight:900,color:s.c}}>{s.val}</div>
              <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* files list */}
      <div style={{
        background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
        borderRadius:20,padding:"16px",boxShadow:SO,
        border:`1px solid ${BORDER}`
      }}>
        <div style={{fontSize:10,color:FAINT,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>Структура проекту</div>
        {files.map((f,i)=>(
          <div key={i} style={{
            display:"flex",alignItems:"center",gap:10,
            padding:"10px 12px",marginBottom:6,borderRadius:12,
            background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,
            boxShadow:"inset 2px 2px 6px rgba(0,0,0,0.35)"
          }}>
            {TabIcons[TABS[i]?.id]?.(32,false)}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,color:ACCENT,fontWeight:700,fontFamily:"monospace",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.file}</div>
              <div style={{fontSize:10,color:DIM}}>{f.comp}</div>
            </div>
            <div style={{
              fontSize:10,color:FAINT,fontWeight:700,
              background:`${SURF_HI}`,padding:"2px 8px",borderRadius:8,flexShrink:0
            }}>{f.lines} рядк.</div>
          </div>
        ))}
      </div>

      {/* integration guide */}
      <div style={{
        background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
        borderRadius:20,padding:"16px",boxShadow:SO,
        border:`1px solid ${BORDER}`
      }}>
        <div style={{fontSize:10,color:FAINT,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>Як підключити</div>
        {[
          "1. Завантаж всі .jsx файли в папку /src/views/",
          "2. В App.jsx зроби lazy import кожного компонента",
          "3. Передай спільні settings та setSettings через props або Context",
          "4. Підключи Firebase — замість mock data використай реальні запити",
          "5. Задеплой на Vercel або Firebase Hosting",
        ].map((s,i)=>(
          <div key={i} style={{
            fontSize:12,color:DIM,padding:"8px 12px",marginBottom:4,
            borderRadius:10,background:`rgba(255,255,255,0.02)`,
            borderLeft:`3px solid ${ACCENT}44`
          }}>{s}</div>
        ))}
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ──────────────────────────────────────────────────
function BottomNav({ active, onChange }) {
  return (
    <div style={{
      position:"fixed",bottom:0,left:0,right:0,
      background:`linear-gradient(180deg,${SURFACE},${SURF_LO})`,
      borderTop:`1px solid ${BORDER}`,
      boxShadow:"0 -8px 24px rgba(0,0,0,0.35)",
      zIndex:50,display:"flex",overflowX:"auto",
    }}>
      {TABS.map(t=>(
        <button key={t.id} onClick={()=>onChange(t.id)} style={{
          flex:"0 0 auto",minWidth:72,padding:"8px 4px",
          background:"transparent",border:"none",cursor:"pointer",
          display:"flex",flexDirection:"column",alignItems:"center",gap:3,
          position:"relative"
        }}>
          <div style={{
            transform:active===t.id?"scale(1.08)":"scale(0.9)",
            transition:"transform .15s",
            opacity:active===t.id?1:0.5,
            position:"relative"
          }}>
            {TabIcons[t.id]?.(34,active===t.id)}
            {t.badge && (
              <div style={{
                position:"absolute",top:-4,right:-4,
                background:ACCENT,color:"#fff",borderRadius:10,
                padding:"1px 5px",fontSize:9,fontWeight:800,
                boxShadow:`0 0 8px ${ACCENT}88`,lineHeight:1.4
              }}>{t.badge}</div>
            )}
          </div>
          <span style={{fontSize:9,fontWeight:700,color:active===t.id?ACCENT:FAINT,whiteSpace:"nowrap"}}>{t.label}</span>
          {active===t.id && (
            <div style={{
              position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",
              width:28,height:3,borderRadius:"3px 3px 0 0",
              background:ACCENT,boxShadow:`0 0 8px ${ACCENT}88`
            }}/>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── TOP BAR ─────────────────────────────────────────────────────
function TopBar({ tab }) {
  return (
    <div style={{
      padding:"14px 18px",
      display:"flex",alignItems:"center",justifyContent:"space-between",
      position:"sticky",top:0,
      background:`linear-gradient(180deg,${BG} 60%,rgba(28,29,33,0.9))`,
      backdropFilter:"blur(20px)",zIndex:20,
      borderBottom:`1px solid ${BORDER}`
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <I3 s={34} r={10} gr="linear-gradient(165deg,#ff7a5c,#ff5a3c)">
          <span style={{fontSize:18,position:"relative",zIndex:1}}>🚗</span>
        </I3>
        <div style={{fontSize:17,fontWeight:800,letterSpacing:-0.3,color:TEXT}}>{TAB_TITLES[tab]}</div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {/* notification bell */}
        <button style={{background:"none",border:"none",cursor:"pointer",position:"relative",padding:0}}>
          <I3 s={36} r={10} gr="linear-gradient(135deg,#2e3034,#26282c)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </I3>
          <div style={{
            position:"absolute",top:-2,right:-2,
            background:ACCENT,color:"#fff",borderRadius:10,
            padding:"1px 5px",fontSize:9,fontWeight:800,
            boxShadow:`0 0 8px ${ACCENT}88`
          }}>3</div>
        </button>
        {/* profile */}
        <button style={{background:"none",border:"none",cursor:"pointer",padding:0}}>
          <div style={{
            width:36,height:36,borderRadius:18,
            background:"linear-gradient(165deg,#9ee07a,#5fb83d)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:13,fontWeight:800,color:"#fff",
            boxShadow:"-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2)"
          }}>ОЛ</div>
        </button>
      </div>
    </div>
  );
}

const INITIAL_BOOKINGS = [];

const DEFAULT_SETTINGS = {
  profile: { name:"Олександр", phone:"+380989225442", address:"Київ", experience:8, photo:null },
  workStart:7, workEnd:20, weekends:[6], daysShown:7, snapMin:30, hourHeightPx:60,
  lunchEnabled:true, lunchStart:12, lunchEnd:13, customBlocks:[], pendingEnabled:false,
  theme:"dark", language:"uk", queueAutoFifo:true, queueBroadcast:false, queueManual:false,
  studentCanReschedule:true, studentCanCancel:true, bookCutoffHours:2, calendarOpenDays:30,
  stickyTime:"both", notifLocation:"topbar",
  autoReminder:{enabled:true, hoursBefore:24}, autoWelcome:{enabled:true}, autoConfirm:{enabled:true},
  services: [
    { id:"sv1", name:"Автошкола 1 год", type:"school",  duration:60,  price:600,  colorId:"green",  active:true,  description:"Урок з автошколи" },
    { id:"sv2", name:"Автошкола 2 год", type:"school",  duration:120, price:1100, colorId:"green",  active:true,  description:"" },
    { id:"sv3", name:"Приватний 1 год", type:"private", duration:60,  price:700,  colorId:"yellow", active:true,  description:"" },
    { id:"sv4", name:"Приватний 2 год", type:"private", duration:120, price:1300, colorId:"yellow", active:true,  description:"" },
  ],
  categories: [
    { id:"cat-vip", name:"VIP",      colorId:"purple" },
    { id:"cat-std", name:"Стандарт", colorId:"blue" },
    { id:"cat-new", name:"Новачок",  colorId:"teal" },
  ],
};

// ─── VIEW RENDERER ───────────────────────────────────────────────
function ViewRenderer({ tab, settings, setSettings, bookings, setBookings }) {
  if (tab === "schedule")  return <ScheduleView settings={settings} setSettings={setSettings} bookings={bookings} setBookings={setBookings}/>;
  if (tab === "settings")  return <SettingsView settings={settings} setSettings={setSettings}/>;
  if (tab === "bookings")  return <BookingsView/>;
  if (tab === "students")  return <StudentsView/>;
  if (tab === "services")  return <ServicesView/>;
  if (tab === "chats")     return <ChatsView/>;
  if (tab === "templates") return <TemplatesView/>;
  if (tab === "stats")     return <StatsView/>;
  return null;
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("schedule");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS);

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100vh",background:BG,color:TEXT,
        fontFamily:"ui-sans-serif,-apple-system,BlinkMacSystemFont,system-ui,sans-serif",
        paddingBottom:92
      }}>
        <TopBar tab={tab}/>
        <div className="tab-anim" key={tab} style={{padding:"14px 14px 0"}}>
          <Suspense fallback={<Loader/>}>
            <ViewRenderer tab={tab} settings={settings} setSettings={setSettings} bookings={bookings} setBookings={setBookings}/>
          </Suspense>
        </div>
        <BottomNav active={tab} onChange={setTab}/>
      </div>
    </>
  );
}
