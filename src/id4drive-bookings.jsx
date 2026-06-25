import { useState, useRef } from "react";

// ─── TOKENS (v3 skin) ───────────────────────────────────────────
const BG       = "#1c1d21";
const BG_DEEP  = "#161719";
const SURFACE  = "#26282c";
const SURF_HI  = "#2e3034";
const SURF_LO  = "#1f2125";
const BORDER   = "rgba(255,255,255,0.05)";
const TEXT     = "#e8e8ea";
const DIM      = "#8b8d93";
const FAINT    = "#5a5c62";
const ACCENT   = "#ff5a3c";
const ACC_HI   = "#ff7a5c";
const GREEN    = "#7ed957";
const BLUE     = "#5b9bff";
const PURPLE   = "#c084fc";
const GOLD     = "#f7c948";
const RED      = "#ef4444";

const SO  = "6px 6px 16px rgba(0,0,0,0.45),-3px -3px 10px rgba(255,255,255,0.025)";
const SI  = "inset 3px 3px 8px rgba(0,0,0,0.4),inset -2px -2px 6px rgba(255,255,255,0.025)";

const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
.icon3d{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;position:relative;overflow:hidden;flex-shrink:0;box-shadow:-2px 4px 10px rgba(0,0,0,0.5),inset 1px 1px 0 rgba(255,255,255,0.25),inset -1px -1px 0 rgba(0,0,0,0.3)}
.icon3d::before{content:'';position:absolute;top:0;right:0;width:60%;height:50%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.4) 0%,transparent 70%);pointer-events:none}
.icon3d>svg{position:relative;z-index:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))}
.pillow{background:linear-gradient(135deg,${SURF_HI} 0%,${SURFACE} 50%,${SURF_LO} 100%);border:1px solid rgba(255,255,255,0.04);border-radius:18px;box-shadow:-2px 6px 16px rgba(0,0,0,0.45),-4px 8px 24px rgba(0,0,0,0.3),2px -2px 6px rgba(255,255,255,0.025),inset 1px 1px 0 rgba(255,255,255,0.08),inset -1px -1px 0 rgba(0,0,0,0.25);position:relative;overflow:hidden}
.pillow::before{content:'';position:absolute;pointer-events:none;top:0;right:0;width:60%;height:35%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.07) 0%,transparent 70%);border-radius:18px}
.toggle{width:46px;height:26px;border-radius:13px;cursor:pointer;position:relative;transition:background .2s;background:${SURF_LO};box-shadow:inset 2px 2px 5px rgba(0,0,0,0.4)}
.toggle.on{background:linear-gradient(165deg,${GREEN},#5fb83d)}
.toggle-thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:10px;background:linear-gradient(135deg,#fff,#ccc);transition:left .2s;box-shadow:-1px 2px 4px rgba(0,0,0,0.3)}
.toggle.on .toggle-thumb{left:23px}
@keyframes slide-in-left{from{transform:translateX(-40px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slide-in-right{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.anim-card{animation:fade-in .22s ease both}
`;

// ─── ICONS ─────────────────────────────────────────────────────
const I3 = ({ children, gr, s=40, r=12 }) => (
  <div className="icon3d" style={{width:s,height:s,background:gr,borderRadius:r}}>{children}</div>
);
const Ic = {
  school: s => <I3 s={s} gr="linear-gradient(165deg,#9ee07a,#5fb83d)"><svg width={s*.6} height={s*.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-5 9 5-9 5-9-5z"/><path d="M7 12v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-5"/></svg></I3>,
  car:    s => <I3 s={s} gr="linear-gradient(165deg,#c084fc,#8b5cf6)"><svg width={s*.6} height={s*.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M3 17V9l3-5h12l3 5v8M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M3 9h18"/></svg></I3>,
  check:  s => <I3 s={s} gr="linear-gradient(165deg,#9ee07a,#5fb83d)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12 10 17 19 8"/></svg></I3>,
  cross:  s => <I3 s={s} gr="linear-gradient(165deg,#7a7e85,#3f4248)"><svg width={s*.45} height={s*.45} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></I3>,
  phone:  s => <I3 s={s} gr="linear-gradient(165deg,#34d399,#059669)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.82 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.09 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></I3>,
  chat:   s => <I3 s={s} gr="linear-gradient(165deg,#5b9bff,#2563eb)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12c0 5-4 8-9 8-1.5 0-3-.3-4-.7L3 21l1-4c-1-1.5-1.5-3.2-1.5-5C2.5 7 6.5 4 12 4s9.5 3 9.5 8z"/></svg></I3>,
  clock:  s => <I3 s={s} gr="linear-gradient(165deg,#fb923c,#ea580c)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg></I3>,
  sms:    s => <I3 s={s} gr="linear-gradient(165deg,#fcd34d,#d97706)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></I3>,
  repeat: s => <I3 s={s} gr="linear-gradient(165deg,#a78bfa,#6d28d9)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></I3>,
  noshow: s => <I3 s={s} gr="linear-gradient(165deg,#f87171,#dc2626)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg></I3>,
  trash:  s => <I3 s={s} gr="linear-gradient(165deg,#f87171,#dc2626)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></I3>,
  sort:   s => <I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/></svg></I3>,
  filter: s => <I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></I3>,
  grid:   s => <I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></I3>,
  table:  s => <I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg></I3>,
};

// ─── COLOR PALETTE (same as id4drive-services) ──────────────────
const PALETTE = [
  { id:"green",   color:GREEN  },
  { id:"yellow",  color:GOLD   },
  { id:"blue",    color:BLUE   },
  { id:"purple",  color:PURPLE },
  { id:"red",     color:ACCENT },
  { id:"orange",  color:"#fb923c" },
];
const colorOf = id => PALETTE.find(p=>p.id===id)?.color || GREEN;

// ─── MOCK DATA ──────────────────────────────────────────────────
const SERVICES_DEFAULT = {
  sv1:{ name:"Автошкола 1г", color:GREEN  },
  sv2:{ name:"Автошкола 2г", color:GREEN  },
  sv3:{ name:"Приватний 1г", color:GOLD   },
  sv4:{ name:"Приватний 2г", color:GOLD   },
};
const CATEGORIES = {
  "cat-vip":{ name:"VIP",      color:PURPLE },
  "cat-std":{ name:"Стандарт", color:BLUE   },
  "cat-new":{ name:"Новачок",  color:"#2dd4bf" },
};

const RAW = [
  { id:"b01", date:"2026-05-23", startMin:8*60,  durMin:120, name:"Марія Коваль",    phone:"+380671234567", type:"school",  tsc:"ТСЦ 8041",      svcId:"sv1", catId:null,      status:"pending",   hours:12 },
  { id:"b02", date:"2026-05-23", startMin:11*60, durMin:60,  name:"Іван Петренко",   phone:"+380509876543", type:"private", tsc:"",                 svcId:"sv3", catId:"cat-std", status:"pending",   hours:5  },
  { id:"b03", date:"2026-05-23", startMin:14*60, durMin:120, name:"Олена Мороз",     phone:"+380631112233", type:"school",  tsc:"ТСЦ 8042",      svcId:"sv1", catId:null,      status:"confirmed", hours:38 },
  { id:"b04", date:"2026-05-24", startMin:9*60,  durMin:60,  name:"Дмитро Сало",     phone:"+380961234567", type:"private", tsc:"",                 svcId:"sv3", catId:"cat-vip", status:"confirmed", hours:9  },
  { id:"b05", date:"2026-05-24", startMin:13*60, durMin:60,  name:"Тетяна Кравець",  phone:"+380731234567", type:"school",  tsc:"ТСЦ 8041",      svcId:"sv2", catId:null,      status:"confirmed", hours:40 },
  { id:"b06", date:"2026-05-25", startMin:10*60, durMin:120, name:"Антон Білий",     phone:"+380501112233", type:"school",  tsc:"ТСЦ 8041",  svcId:"sv1", catId:null,      status:"confirmed", hours:22 },
  { id:"b07", date:"2026-05-25", startMin:15*60, durMin:120, name:"Юлія Денисюк",    phone:"+380935023739", type:"private", tsc:"",                 svcId:"sv4", catId:"cat-new", status:"pending",   hours:3  },
  { id:"b08", date:"2026-05-26", startMin:8*60,  durMin:60,  name:"Сергій Гук",      phone:"+380961234500", type:"private", tsc:"",                 svcId:"sv3", catId:"cat-std", status:"confirmed", hours:14 },
  { id:"b09", date:"2026-05-26", startMin:11*60, durMin:120, name:"Наталія Бондар",  phone:"+380671112244", type:"school",  tsc:"ТСЦ 8042",      svcId:"sv2", catId:null,      status:"noshow",    hours:18 },
  { id:"b10", date:"2026-05-27", startMin:9*60,  durMin:120, name:"Андрій Чорний",   phone:"+380501234500", type:"school",  tsc:"ТСЦ 8041",      svcId:"sv1", catId:null,      status:"confirmed", hours:30 },
  { id:"b11", date:"2026-05-27", startMin:14*60, durMin:60,  name:"Ірина Лесник",    phone:"+380967240853", type:"private", tsc:"",                 svcId:"sv3", catId:"cat-new", status:"cancelled", hours:1  },
  { id:"b12", date:"2026-05-28", startMin:10*60, durMin:120, name:"Ангеліна Коник",  phone:"+380681746071", type:"private", tsc:"",                 svcId:"sv4", catId:"cat-vip", status:"confirmed", hours:6  },
];

const fmtTime = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const fmtDate = d => {
  const [,, day] = d.split("-");
  const months = ["","Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
  const m = parseInt(d.split("-")[1]);
  return `${parseInt(day)} ${months[m]}`;
};
const priceOf = b => {
  if (b.price != null) return b.price;
  const s = SERVICES[b.svcId];
  if (!s) return 0;
  const base = (b.durMin/60) * (b.type==="school"?600:700);
  return b.discountPct > 0 ? Math.round(base * (1 - b.discountPct/100)) : base;
};

// ─── SHARED ─────────────────────────────────────────────────────
function Pill({ label, color, bg }) {
  return <span style={{background:bg,color,padding:"3px 10px",borderRadius:8,fontSize:11,fontWeight:700,letterSpacing:0.4,whiteSpace:"nowrap"}}>{label}</span>;
}
function StatusPill({ status }) {
  const M = {
    pending:  [ACCENT,"rgba(255,90,60,0.15)","Очікує"],
    confirmed:[GREEN, "rgba(126,217,87,0.15)","Підтверджено"],
    cancelled:[FAINT, "rgba(255,255,255,0.07)","Скасовано"],
    noshow:   [RED,   "rgba(239,68,68,0.18)", "Не прийшов"],
  };
  const [c,b,l] = M[status]||M.confirmed;
  return <Pill label={l} color={c} bg={b}/>;
}
function Toggle({ on, onChange }) {
  return <div className={`toggle ${on?"on":""}`} onClick={()=>onChange(!on)}><div className="toggle-thumb"/></div>;
}
function Inset({ children, style={} }) {
  return <div style={{background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"10px 14px",...style}}>{children}</div>;
}

// ─── SWIPE CARD ─────────────────────────────────────────────────
function SwipeCard({ b, onConfirm, onCancel, onClick }) {
  const ref = useRef(null);
  const state = useRef({ startX:0, dx:0, swiping:false });
  const [dx, setDx] = useState(0);

  const start = (x) => { state.current = { startX:x, dx:0, swiping:true }; };
  const move  = (x) => {
    if (!state.current.swiping) return;
    const d = x - state.current.startX;
    state.current.dx = d;
    setDx(d);
  };
  const end = () => {
    state.current.swiping = false;
    if (dx < -80) onCancel(b.id);
    else if (dx > 80) onConfirm(b.id);
    setDx(0);
  };

  const svc = SERVICES[b.svcId];
  const cat = b.catId ? CATEGORIES[b.catId] : null;
  const price = priceOf(b);

  const absX = Math.abs(dx);
  const opacity = Math.min(absX / 60, 1);

  return (
    <div style={{position:"relative",overflow:"hidden",borderRadius:18,marginBottom:10}}>
      {/* behind-left: cancel (red) */}
      <div style={{
        position:"absolute",inset:0,background:`linear-gradient(90deg,transparent,rgba(239,68,68,0.25))`,
        display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:20,
        opacity: dx < 0 ? opacity : 0
      }}>
        <span style={{color:RED,fontWeight:800,fontSize:13}}>Скасувати ✕</span>
      </div>
      {/* behind-right: confirm (green) */}
      <div style={{
        position:"absolute",inset:0,background:`linear-gradient(90deg,rgba(126,217,87,0.25),transparent)`,
        display:"flex",alignItems:"center",justifyContent:"flex-start",paddingLeft:20,
        opacity: dx > 0 ? opacity : 0
      }}>
        <span style={{color:GREEN,fontWeight:800,fontSize:13}}>✓ Підтвердити</span>
      </div>

      {/* card */}
      <div
        className="pillow anim-card"
        ref={ref}
        onClick={() => Math.abs(dx) < 10 && onClick(b)}
        onPointerDown={e=>start(e.clientX)}
        onPointerMove={e=>move(e.clientX)}
        onPointerUp={end}
        onPointerLeave={end}
        style={{
          padding:"16px 16px",
          transform:`translateX(${Math.max(-120,Math.min(120,dx))}px)`,
          transition: state.current.swiping ? "none" : "transform .3s ease",
          cursor:"pointer", touchAction:"pan-y"
        }}
      >
        <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
          {b.type==="school" ? Ic.school(44) : Ic.car(44)}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:15,fontWeight:800,color:TEXT}}>{b.name}</span>
              <StatusPill status={b.status}/>
              {cat && <Pill label={cat.name} color={cat.color} bg={`${cat.color}22`}/>}
            </div>
            <div style={{fontSize:12,color:DIM,marginBottom:8}}>{b.phone}{b.tsc?` · ${b.tsc}`:""}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Inset style={{padding:"5px 10px"}}>
                <span style={{fontSize:12,color:BLUE,fontWeight:700}}>📅 {fmtDate(b.date)}</span>
              </Inset>
              <Inset style={{padding:"5px 10px"}}>
                <span style={{fontSize:12,color:BLUE,fontWeight:700}}>{fmtTime(b.startMin)}–{fmtTime(b.startMin+b.durMin)}</span>
              </Inset>
              {svc && <Inset style={{padding:"5px 10px"}}>
                <span style={{fontSize:12,color:svc.color,fontWeight:700}}>{svc.name}</span>
              </Inset>}
              <Inset style={{padding:"5px 10px"}}>
                <span style={{fontSize:12,color:GOLD,fontWeight:700}}>{price} ₴</span>
              </Inset>
            </div>
            {b.type==="school" && (
              <div style={{marginTop:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:10,color:FAINT}}>{b.hours}/40 год</span>
                  <span style={{fontSize:10,color:b.hours>=40?ACCENT:GREEN,fontWeight:700}}>{Math.round((b.hours/40)*100)}%</span>
                </div>
                <div style={{height:4,background:`linear-gradient(135deg,${BG_DEEP},${SURF_HI})`,borderRadius:3,boxShadow:SI,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(100,(b.hours/40)*100)}%`,background:b.hours>=40?`linear-gradient(90deg,${ACC_HI},${ACCENT})`:`linear-gradient(90deg,${BLUE},${GREEN})`,borderRadius:3,boxShadow:`0 0 8px ${b.hours>=40?ACCENT:GREEN}55`}}/>
                </div>
              </div>
            )}
          </div>
          {/* quick actions for pending */}
          {b.status==="pending" && (
            <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
              <button onClick={e=>{e.stopPropagation();onConfirm(b.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>{Ic.check(38)}</button>
              <button onClick={e=>{e.stopPropagation();onCancel(b.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>{Ic.cross(38)}</button>
            </div>
          )}
        </div>
        {/* swipe hint */}
        {b.status==="pending" && (
          <div style={{marginTop:8,fontSize:10,color:FAINT,display:"flex",justifyContent:"space-between"}}>
            <span>→ потягни для підтвердження</span>
            <span>скасування ←</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TABLE ROW ──────────────────────────────────────────────────
function TableView({ list, onConfirm, onCancel, onRowClick }) {
  const cols = ["Учень","Дата","Час","Послуга","Статус","Сума","Дії"];
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
        <thead>
          <tr style={{borderBottom:`1px solid ${BORDER}`}}>
            {cols.map(c=>(
              <th key={c} style={{padding:"10px 12px",textAlign:"left",fontSize:10,color:FAINT,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700}}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((b,i)=>{
            const svc = SERVICES[b.svcId];
            return (
              <tr key={b.id} onClick={()=>onRowClick(b)} style={{
                borderBottom:`1px solid ${BORDER}`,
                background:i%2===0?"transparent":"rgba(255,255,255,0.01)",
                cursor:"pointer",transition:"background .15s"
              }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
              onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"rgba(255,255,255,0.01)"}
              >
                <td style={{padding:"10px 12px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{b.name}</div>
                  <div style={{fontSize:11,color:DIM}}>{b.phone}</div>
                </td>
                <td style={{padding:"10px 12px",fontSize:12,color:DIM,whiteSpace:"nowrap"}}>{fmtDate(b.date)}</td>
                <td style={{padding:"10px 12px",fontSize:12,color:BLUE,fontWeight:700,whiteSpace:"nowrap"}} className="tabular">{fmtTime(b.startMin)}</td>
                <td style={{padding:"10px 12px"}}>
                  {svc && <Pill label={svc.name} color={svc.color} bg={`${svc.color}22`}/>}
                </td>
                <td style={{padding:"10px 12px"}}><StatusPill status={b.status}/></td>
                <td style={{padding:"10px 12px",fontSize:13,color:GOLD,fontWeight:700}} className="tabular">{priceOf(b)} ₴</td>
                <td style={{padding:"10px 12px"}}>
                  {b.status==="pending" && (
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={e=>{e.stopPropagation();onConfirm(b.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>{Ic.check(30)}</button>
                      <button onClick={e=>{e.stopPropagation();onCancel(b.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>{Ic.cross(30)}</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── BOOKING MODAL ──────────────────────────────────────────────
function BookingModal({ b, onClose, onConfirm, onCancel, onNoshow }) {
  if (!b) return null;
  const svc = SERVICES[b.svcId];
  const cat = b.catId ? CATEGORIES[b.catId] : null;
  const actions = [
    { icon:Ic.check(36),  label:"Підтвердити", color:GREEN,  show:b.status==="pending", fn:()=>onConfirm(b.id) },
    { icon:Ic.clock(36),  label:"Перенести",   color:TEXT,   show:true, fn:onClose },
    { icon:Ic.phone(36),  label:"Дзвонити",    color:GREEN,  show:true, fn:()=>window.location.href=`tel:${b.phone}` },
    { icon:Ic.chat(36),   label:"Чат",         color:BLUE,   show:true, fn:onClose },
    { icon:Ic.sms(36),    label:"SMS",         color:GOLD,   show:true, fn:()=>window.location.href=`sms:${b.phone}` },
    { icon:Ic.repeat(36), label:"Повторити",   color:PURPLE, show:true, fn:onClose },
    { icon:Ic.noshow(36), label:"Не прийшов",  color:RED,    show:true, fn:()=>onNoshow(b.id) },
    { icon:Ic.trash(36),  label:"Скасувати",   color:RED,    show:b.status!=="cancelled", fn:()=>onCancel(b.id) },
  ].filter(a=>a.show);

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(8px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"100%",maxWidth:520,
        background:`linear-gradient(180deg,${SURFACE},${BG})`,
        borderRadius:"24px 24px 0 0",padding:"20px 18px 32px",
        boxShadow:"0 -12px 48px rgba(0,0,0,0.6)",maxHeight:"90vh",overflowY:"auto"
      }}>
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)",margin:"0 auto 18px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
          {b.type==="school" ? Ic.school(56) : Ic.car(56)}
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:800}}>{b.name}</div>
            <div style={{fontSize:12,color:DIM,marginTop:3}}>{b.phone}</div>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              <StatusPill status={b.status}/>
              {cat && <Pill label={cat.name} color={cat.color} bg={`${cat.color}22`}/>}
            </div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}}>
          {[
            ["ДАТА",    fmtDate(b.date), TEXT],
            ["ЧАС",     `${fmtTime(b.startMin)}–${fmtTime(b.startMin+b.durMin)}`, BLUE],
            ["ПОСЛУГА", svc?.name||"—", svc?.color||TEXT],
            ["СУМА",    `${priceOf(b)} ₴`, GOLD],
            ...(b.tsc ? [["ТСЦ", b.tsc, TEXT]] : []),
            ...(b.type==="school" ? [[`ПРОГРЕС`, `${b.hours}/40 год`, b.hours>=40?ACCENT:GREEN]] : []),
          ].map(([label,val,c])=>(
            <Inset key={label} style={{padding:"10px 12px"}}>
              <div style={{fontSize:9,color:FAINT,letterSpacing:1,marginBottom:4}}>{label}</div>
              <div style={{fontSize:14,fontWeight:800,color:c}}>{val}</div>
            </Inset>
          ))}
        </div>

        <Inset style={{marginBottom:14}}>
          <div style={{fontSize:9,color:FAINT,letterSpacing:1,marginBottom:6}}>НОТАТКИ ІНСТРУКТОРА</div>
          <textarea placeholder="Приватна нотатка..." rows={2} style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit"}}/>
        </Inset>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {actions.map((a,i)=>(
            <button key={i} onClick={()=>{a.fn();if(a.label!=="Дзвонити"&&a.label!=="SMS")onClose();}} style={{
              background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              border:"none",borderRadius:14,padding:"12px 6px",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:6,
              boxShadow:SO
            }}>
              {a.icon}
              <span style={{fontSize:10,color:a.color,fontWeight:700}}>{a.label}</span>
            </button>
          ))}
        </div>

        <button onClick={onClose} style={{
          width:"100%",marginTop:14,padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
          background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO
        }}>Закрити</button>
      </div>
    </div>
  );
}

// ─── FILTER / SORT SHEET ────────────────────────────────────────
function FilterSheet({ filters, setFilters, sortBy, setSortBy, groupBy, setGroupBy, onClose }) {
  const Chip = ({ label, active, onClick }) => (
    <button onClick={onClick} style={{
      padding:"7px 14px",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
      background:active?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
      color:active?"#fff":DIM,
      boxShadow:active?`inset 1px 1px 0 rgba(255,255,255,0.25)`:SO
    }}>{label}</button>
  );
  const Row = ({label,children}) => (
    <div style={{marginBottom:16}}>
      <div style={{fontSize:10,color:FAINT,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>{label}</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{children}</div>
    </div>
  );

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split("T")[0];

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:90,display:"flex",alignItems:"flex-end",backdropFilter:"blur(8px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"100%",maxWidth:520,margin:"0 auto",
        background:`linear-gradient(180deg,${SURFACE},${BG})`,
        borderRadius:"24px 24px 0 0",padding:"20px 18px 36px",
        maxHeight:"90vh",overflowY:"auto"
      }}>
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)",margin:"0 auto 20px"}}/>
        <div style={{fontSize:16,fontWeight:800,marginBottom:20}}>Фільтр та сортування</div>

        <Row label="Статус">
          {["all","pending","confirmed","cancelled","noshow"].map(s=>(
            <Chip key={s} label={s==="all"?"Всі":{pending:"Очікує",confirmed:"Підтверджено",cancelled:"Скасовано",noshow:"Не прийшов"}[s]}
              active={filters.status===s} onClick={()=>setFilters(f=>({...f,status:s}))}/>
          ))}
        </Row>
        <Row label="Тип">
          {[["all","Всі"],["school","Автошкола"],["private","Приватний"]].map(([k,l])=>(
            <Chip key={k} label={l} active={filters.type===k} onClick={()=>setFilters(f=>({...f,type:k}))}/>
          ))}
        </Row>
        <Row label="Послуга">
          <Chip label="Всі" active={!filters.svcId} onClick={()=>setFilters(f=>({...f,svcId:null}))}/>
          {Object.entries(SERVICES).map(([id,s])=>(
            <Chip key={id} label={s.name} active={filters.svcId===id} onClick={()=>setFilters(f=>({...f,svcId:id}))}/>
          ))}
        </Row>
        <Row label="Категорія учня">
          <Chip label="Всі" active={!filters.catId} onClick={()=>setFilters(f=>({...f,catId:null}))}/>
          {Object.entries(CATEGORIES).map(([id,c])=>(
            <Chip key={id} label={c.name} active={filters.catId===id} onClick={()=>setFilters(f=>({...f,catId:id}))}/>
          ))}
        </Row>
        <Row label="Дата">
          {[
            ["all",   "Всі"],
            ["today", "Сьогодні"],
            ["tmrw",  "Завтра"],
            ["week",  "Цей тиждень"],
            ["month", "Цей місяць"],
          ].map(([k,l])=>(
            <Chip key={k} label={l} active={filters.datePreset===k} onClick={()=>setFilters(f=>({...f,datePreset:k}))}/>
          ))}
        </Row>

        <Row label="Сортування">
          {[
            ["date-asc",  "Дата ↑"],
            ["date-desc", "Дата ↓"],
            ["name-asc",  "Ім'я А-Я"],
            ["price-desc","Сума ↓"],
          ].map(([k,l])=>(
            <Chip key={k} label={l} active={sortBy===k} onClick={()=>setSortBy(k)}/>
          ))}
        </Row>
        <Row label="Групування">
          {[
            [null,    "Без групування"],
            ["date",  "По датах"],
            ["status","По статусу"],
            ["type",  "По типу"],
          ].map(([k,l])=>(
            <Chip key={k||"none"} label={l} active={groupBy===k} onClick={()=>setGroupBy(k)}/>
          ))}
        </Row>

        <button onClick={onClose} style={{
          width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
          background:`linear-gradient(165deg,${ACC_HI},${ACCENT})`,color:"#fff",fontSize:13,fontWeight:700,
          boxShadow:`-2px 5px 14px rgba(255,90,60,0.45),inset 1px 1px 0 rgba(255,255,255,0.3)`,
          marginTop:4
        }}>Застосувати</button>
      </div>
    </div>
  );
}

// ─── MAIN BOOKINGS VIEW ─────────────────────────────────────────
export default function BookingsView({ onSlotClick, settings }) {
  const SERVICES = settings?.services?.length
    ? Object.fromEntries(settings.services.map(s => [s.id, { name: s.name, color: colorOf(s.colorId) }]))
    : SERVICES_DEFAULT;
  const [data, setData] = useState(RAW);
  const [mode, setMode] = useState("cards"); // cards | table
  const [filters, setFilters] = useState({ status:"all", type:"all", svcId:null, catId:null, datePreset:"all" });
  const [sortBy, setSortBy] = useState("date-asc");
  const [groupBy, setGroupBy] = useState("date");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(null);

  const confirm = id => { setData(d=>d.map(b=>b.id===id?{...b,status:"confirmed"}:b)); setSelected(null); };
  const cancel  = id => { setData(d=>d.map(b=>b.id===id?{...b,status:"cancelled"}:b)); setSelected(null); };
  const noshow  = id => { setData(d=>d.map(b=>b.id===id?{...b,status:"noshow"}:b));   setSelected(null); };

  // apply filters
  const applyDate = (b) => {
    const today = new Date().toISOString().split("T")[0];
    const tmrw  = new Date(Date.now()+86400000).toISOString().split("T")[0];
    if (filters.datePreset==="today") return b.date===today;
    if (filters.datePreset==="tmrw")  return b.date===tmrw;
    if (filters.datePreset==="week") {
      const d = new Date(b.date), now = new Date();
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      const end   = new Date(start); end.setDate(start.getDate()+6);
      return d>=start && d<=end;
    }
    if (filters.datePreset==="month") return b.date.startsWith(new Date().toISOString().slice(0,7));
    return true;
  };

  let list = data.filter(b =>
    (filters.status==="all" || b.status===filters.status) &&
    (filters.type==="all"   || b.type===filters.type) &&
    (!filters.svcId || b.svcId===filters.svcId) &&
    (!filters.catId || b.catId===filters.catId) &&
    applyDate(b) &&
    (!search || b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.phone.includes(search) || b.tsc.toLowerCase().includes(search.toLowerCase()) ||
      b.date.includes(search))
  );

  // sort
  list = [...list].sort((a,b)=>{
    if (sortBy==="date-asc")  return a.date.localeCompare(b.date)||a.startMin-b.startMin;
    if (sortBy==="date-desc") return b.date.localeCompare(a.date)||a.startMin-b.startMin;
    if (sortBy==="name-asc")  return a.name.localeCompare(b.name);
    if (sortBy==="price-desc")return priceOf(b)-priceOf(a);
    return 0;
  });

  // summary
  const totalPrice = list.reduce((s,b)=>s+priceOf(b),0);
  const totalHours = list.reduce((s,b)=>s+(b.durMin/60),0);
  const pendingCount = list.filter(b=>b.status==="pending").length;

  // group
  const grouped = (() => {
    if (!groupBy) return [{ key:null, items:list }];
    const map = {};
    list.forEach(b=>{
      let k;
      if (groupBy==="date")   k = b.date;
      if (groupBy==="status") k = b.status;
      if (groupBy==="type")   k = b.type==="school"?"Автошкола":"Приватний";
      if (!map[k]) map[k]=[];
      map[k].push(b);
    });
    return Object.entries(map).map(([key,items])=>({ key, items }));
  })();

  const groupLabel = (key) => {
    if (groupBy==="date")   return fmtDate(key)+" "+key.split("-")[2];
    if (groupBy==="status") return {pending:"Очікують",confirmed:"Підтверджено",cancelled:"Скасовано",noshow:"Не прийшов"}[key]||key;
    return key;
  };

  const activeFiltersCount = [
    filters.status!=="all",filters.type!=="all",!!filters.svcId,!!filters.catId,filters.datePreset!=="all"
  ].filter(Boolean).length;

  return (
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",flexDirection:"column",gap:12,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── PENDING BANNER ── */}
        {pendingCount>0 && (
          <div className="pillow" style={{
            padding:"14px 16px",
            background:`linear-gradient(135deg,rgba(255,90,60,0.2),rgba(255,90,60,0.08))`,
            borderColor:"rgba(255,90,60,0.35)"
          }}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{
                width:42,height:42,borderRadius:12,
                background:`linear-gradient(165deg,${ACC_HI},${ACCENT})`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:18,fontWeight:900,color:"#fff",flexShrink:0,
                boxShadow:`-2px 4px 10px rgba(255,90,60,0.4),inset 1px 1px 0 rgba(255,255,255,0.3)`
              }}>{pendingCount}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:800,color:TEXT}}>Потрібна дія</div>
                <div style={{fontSize:12,color:DIM}}>
                  {pendingCount} {pendingCount===1?"букінг":"букінги"} очікують підтвердження
                </div>
              </div>
              <button onClick={()=>setFilters(f=>({...f,status:"pending"}))} style={{
                background:`linear-gradient(165deg,${ACC_HI},${ACCENT})`,
                border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer",
                color:"#fff",fontSize:12,fontWeight:700,
                boxShadow:`-2px 4px 10px rgba(255,90,60,0.4),inset 1px 1px 0 rgba(255,255,255,0.3)`
              }}>Показати</button>
            </div>
          </div>
        )}

        {/* ── SEARCH + CONTROLS ── */}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Inset style={{flex:1,padding:"4px 12px",display:"flex",alignItems:"center",gap:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук по імені, тел, ТСЦ, даті…"
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,padding:"10px 0",fontSize:14}}/>
            {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:18,padding:0}}>×</button>}
          </Inset>
          <button onClick={()=>setShowFilters(true)} style={{position:"relative",background:"none",border:"none",cursor:"pointer",padding:0}}>
            {Ic.filter(40)}
            {activeFiltersCount>0 && (
              <span style={{
                position:"absolute",top:-4,right:-4,
                background:ACCENT,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:9,fontWeight:800
              }}>{activeFiltersCount}</span>
            )}
          </button>
          <button onClick={()=>setMode(m=>m==="cards"?"table":"cards")} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>
            {mode==="cards" ? Ic.table(40) : Ic.grid(40)}
          </button>
        </div>

        {/* ── SUMMARY TOP ── */}
        <div style={{display:"flex",gap:8}}>
          {[
            {label:"Записів",  val:list.length, c:TEXT},
            {label:"Годин",    val:totalHours.toFixed(1), c:BLUE},
            {label:"Сума ₴",   val:totalPrice.toLocaleString(), c:GOLD},
          ].map(s=>(
            <Inset key={s.label} style={{flex:1,padding:"8px 10px",textAlign:"center"}}>
              <div style={{fontSize:10,color:FAINT,letterSpacing:1}}>{s.label}</div>
              <div style={{fontSize:16,fontWeight:900,color:s.c,marginTop:2}}>{s.val}</div>
            </Inset>
          ))}
        </div>

        {/* ── LIST ── */}
        {mode==="cards" ? (
          grouped.map(({key,items})=>(
            <div key={key||"all"}>
              {key && (
                <div style={{
                  fontSize:11,color:FAINT,fontWeight:800,letterSpacing:1.5,
                  textTransform:"uppercase",padding:"10px 4px 6px",
                  display:"flex",alignItems:"center",gap:8
                }}>
                  <div style={{flex:1,height:1,background:BORDER}}/>
                  {groupLabel(key)}
                  <span style={{
                    background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                    padding:"2px 8px",borderRadius:8,fontSize:10,color:DIM,
                    boxShadow:SO
                  }}>{items.length}</span>
                  <div style={{flex:1,height:1,background:BORDER}}/>
                </div>
              )}
              {items.map(b=>(
                <SwipeCard key={b.id} b={b} onConfirm={confirm} onCancel={cancel} onClick={setSelected}/>
              ))}
            </div>
          ))
        ) : (
          <div className="pillow" style={{padding:0,overflow:"hidden"}}>
            <TableView list={list} onConfirm={confirm} onCancel={cancel} onRowClick={setSelected}/>
          </div>
        )}

        {/* empty */}
        {list.length===0 && (
          <div style={{textAlign:"center",padding:"40px 20px",color:FAINT}}>
            <div style={{fontSize:32,marginBottom:10}}>📭</div>
            <div style={{fontSize:14,fontWeight:700}}>Нічого не знайдено</div>
            <div style={{fontSize:12,marginTop:4}}>Спробуй змінити фільтри</div>
          </div>
        )}

        {/* ── SUMMARY BOTTOM ── */}
        {list.length>0 && (
          <div className="pillow" style={{padding:"14px 16px"}}>
            <div style={{fontSize:10,color:FAINT,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Підсумок по вибірці</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[
                {label:"Всього записів", val:list.length,              c:TEXT},
                {label:"Годин",          val:totalHours.toFixed(1)+"г",c:BLUE},
                {label:"Сума ₴",         val:totalPrice.toLocaleString()+" ₴", c:GOLD},
                {label:"Підтверджено",   val:list.filter(b=>b.status==="confirmed").length, c:GREEN},
                {label:"Очікують",       val:list.filter(b=>b.status==="pending").length,   c:ACCENT},
                {label:"Скасовано",      val:list.filter(b=>b.status==="cancelled"||b.status==="noshow").length, c:RED},
              ].map(s=>(
                <Inset key={s.label} style={{padding:"10px 10px"}}>
                  <div style={{fontSize:9,color:FAINT,letterSpacing:1}}>{s.label}</div>
                  <div style={{fontSize:16,fontWeight:900,color:s.c,marginTop:2}}>{s.val}</div>
                </Inset>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* FILTER SHEET */}
      {showFilters && (
        <FilterSheet
          filters={filters} setFilters={setFilters}
          sortBy={sortBy} setSortBy={setSortBy}
          groupBy={groupBy} setGroupBy={setGroupBy}
          onClose={()=>setShowFilters(false)}
        />
      )}

      {/* BOOKING MODAL */}
      <BookingModal b={selected} onClose={()=>setSelected(null)} onConfirm={confirm} onCancel={cancel} onNoshow={noshow}/>
    </>
  );
}
