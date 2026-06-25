import { useState, useRef, useCallback } from "react";

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
const PURPLE  = "#c084fc";
const GOLD    = "#f7c948";
const RED     = "#ef4444";
const TEAL    = "#2dd4bf";

const SO = "6px 6px 16px rgba(0,0,0,0.45),-3px -3px 10px rgba(255,255,255,0.025)";
const SI = "inset 3px 3px 8px rgba(0,0,0,0.4),inset -2px -2px 6px rgba(255,255,255,0.025)";

const PALETTE = [
  { id:"green",   name:"Зелений",    color:GREEN  },
  { id:"yellow",  name:"Жовтий",     color:GOLD   },
  { id:"blue",    name:"Синій",      color:BLUE   },
  { id:"purple",  name:"Фіолетовий", color:PURPLE },
  { id:"red",     name:"Червоний",   color:ACCENT },
  { id:"teal",    name:"Бірюзовий",  color:TEAL   },
  { id:"pink",    name:"Рожевий",    color:"#f472b6" },
  { id:"orange",  name:"Оранжевий",  color:"#fb923c" },
  { id:"indigo",  name:"Індиго",     color:"#818cf8" },
  { id:"lime",    name:"Лайм",       color:"#a3e635" },
];
const colorOf = id => PALETTE.find(p=>p.id===id)?.color || GREEN;

const CATEGORIES = {
  "cat-all": { name:"Всі учні",   color:TEXT   },
  "cat-vip": { name:"VIP",        color:PURPLE },
  "cat-std": { name:"Стандарт",   color:BLUE   },
  "cat-new": { name:"Новачок",    color:TEAL   },
};

// ─── CSS ────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
.pillow{background:linear-gradient(135deg,${SURF_HI} 0%,${SURFACE} 50%,${SURF_LO} 100%);border:1px solid rgba(255,255,255,0.04);border-radius:18px;position:relative;overflow:hidden;box-shadow:-2px 6px 16px rgba(0,0,0,0.45),inset 1px 1px 0 rgba(255,255,255,0.08),inset -1px -1px 0 rgba(0,0,0,0.25)}
.pillow::before{content:'';position:absolute;pointer-events:none;top:0;right:0;width:60%;height:35%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.07) 0%,transparent 70%);border-radius:18px}
.icon3d{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;position:relative;overflow:hidden;flex-shrink:0;box-shadow:-2px 4px 10px rgba(0,0,0,0.5),inset 1px 1px 0 rgba(255,255,255,0.25),inset -1px -1px 0 rgba(0,0,0,0.3)}
.icon3d::before{content:'';position:absolute;top:0;right:0;width:60%;height:50%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.4) 0%,transparent 70%);pointer-events:none}
.icon3d>svg{position:relative;z-index:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))}
.toggle{width:46px;height:26px;border-radius:13px;cursor:pointer;position:relative;transition:background .2s;background:${SURF_LO};box-shadow:inset 2px 2px 5px rgba(0,0,0,0.4)}
.toggle.on{background:linear-gradient(165deg,${GREEN},#5fb83d)}
.toggle-thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:10px;background:linear-gradient(135deg,#fff,#ccc);transition:left .2s;box-shadow:-1px 2px 4px rgba(0,0,0,0.3)}
.toggle.on .toggle-thumb{left:23px}
/* slot preview */
.slot-preview{position:relative;overflow:hidden;border-radius:14px}
.slot-preview::before{content:'';position:absolute;pointer-events:none;top:2px;right:8%;width:50%;height:35%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.22) 0%,transparent 65%);border-radius:50%;filter:blur(1px);z-index:2}
.slot-preview::after{content:'';position:absolute;pointer-events:none;bottom:0;left:0;right:0;height:30%;background:linear-gradient(to bottom,transparent,rgba(0,0,0,0.18));border-radius:0 0 14px 14px;z-index:2}
/* drag */
.drag-item{transition:transform .15s,box-shadow .15s;touch-action:none}
.drag-item.dragging{opacity:0.85;box-shadow:0 16px 40px rgba(0,0,0,0.6),0 0 0 2px ${ACCENT};z-index:50;transform:scale(1.02)}
@keyframes fade-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fade-in .2s ease both}
@keyframes modal-in{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
.modal-in{animation:modal-in .25s ease both}
`;

// ─── MOCK DATA ───────────────────────────────────────────────────
const INIT_SERVICES = [
  { id:"sv1", name:"Автошкола 1 год",  type:"school",  duration:60,  price:600,  colorId:"green",  active:true,  archived:false, description:"Стандартний урок для учнів автошколи", accessCats:["cat-all"], lessons:47, income:28200  },
  { id:"sv2", name:"Автошкола 2 год",  type:"school",  duration:120, price:1100, colorId:"green",  active:true,  archived:false, description:"Подвійний урок для автошколи",          accessCats:["cat-all"], lessons:31, income:34100  },
  { id:"sv3", name:"Приватний 1 год",  type:"private", duration:60,  price:700,  colorId:"yellow", active:true,  archived:false, description:"Приватний урок для будь-якого учня",    accessCats:["cat-all"], lessons:28, income:19600  },
  { id:"sv4", name:"Приватний 2 год",  type:"private", duration:120, price:1300, colorId:"yellow", active:true,  archived:false, description:"Подвійний приватний урок",              accessCats:["cat-vip","cat-std"], lessons:14, income:18200 },
  { id:"sv5", name:"VIP інтенсив",     type:"private", duration:180, price:2200, colorId:"purple", active:true,  archived:false, description:"3-годинний VIP урок для досвідчених",  accessCats:["cat-vip"], lessons:6,  income:13200  },
];

// ─── HELPERS ────────────────────────────────────────────────────
const fmtDur = min => {
  const h = Math.floor(min/60), m = min%60;
  return m ? `${h}г ${m}хв` : `${h} год`;
};

function Pill({ label, color, bg }) {
  return <span style={{background:bg,color,padding:"3px 10px",borderRadius:8,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
}
function Toggle({ on, onChange }) {
  return <div className={`toggle ${on?"on":""}`} onClick={()=>onChange(!on)}><div className="toggle-thumb"/></div>;
}
function Inset({ children, style={} }) {
  return <div style={{background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"10px 14px",...style}}>{children}</div>;
}

// ─── ICONS ──────────────────────────────────────────────────────
const I3 = ({children,gr,s=40,r=14})=>(
  <div className="icon3d" style={{width:s,height:s,background:gr,borderRadius:r}}>{children}</div>
);
const Ic = {
  school: s=><I3 s={s} gr="linear-gradient(165deg,#9ee07a,#5fb83d)"><svg width={s*.6} height={s*.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-5 9 5-9 5-9-5z"/><path d="M7 12v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-5"/></svg></I3>,
  car:    s=><I3 s={s} gr="linear-gradient(165deg,#c084fc,#8b5cf6)"><svg width={s*.6} height={s*.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M3 17V9l3-5h12l3 5v8M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M3 9h18"/></svg></I3>,
  plus:   s=><I3 s={s} gr={`linear-gradient(165deg,${ACC_HI},${ACCENT})`}><svg width={s*.5} height={s*.5} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></I3>,
  edit:   s=><I3 s={s} gr="linear-gradient(165deg,#a78bfa,#6d28d9)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></I3>,
  archive:s=><I3 s={s} gr="linear-gradient(165deg,#fb923c,#ea580c)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></I3>,
  trash:  s=><I3 s={s} gr="linear-gradient(165deg,#f87171,#dc2626)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></I3>,
  drag:   s=><I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.5} height={s*.5} viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg></I3>,
  eye:    s=><I3 s={s} gr="linear-gradient(165deg,#34d399,#059669)"><svg width={s*.6} height={s*.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></I3>,
  lock:   s=><I3 s={s} gr="linear-gradient(165deg,#fcd34d,#d97706)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></I3>,
  grid:   s=><I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></I3>,
  rows:   s=><I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg></I3>,
};

// ─── SLOT PREVIEW MINI ───────────────────────────────────────────
function SlotPreview({ svc, height=80 }) {
  const c = colorOf(svc.colorId);
  return (
    <div className="slot-preview" style={{
      height, padding:"8px 10px",
      background:`linear-gradient(155deg, color-mix(in srgb,${c} 45%,transparent) 0%, color-mix(in srgb,${c} 16%,transparent) 100%)`,
      border:`1px solid color-mix(in srgb,${c} 55%,transparent)`,
      boxShadow:`-2px 5px 14px rgba(0,0,0,0.5),inset 1px 1px 0 rgba(255,255,255,0.18),inset -1px -1px 0 rgba(0,0,0,0.25)`,
      display:"flex",flexDirection:"column",justifyContent:"space-between"
    }}>
      <div style={{fontSize:12,fontWeight:800,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.5)",position:"relative",zIndex:3}}>{svc.name}</div>
      <div style={{fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:700,position:"relative",zIndex:3}}>{fmtDur(svc.duration)} · {svc.price} ₴</div>
    </div>
  );
}

// ─── SERVICE FORM MODAL ──────────────────────────────────────────
function ServiceFormModal({ svc, onSave, onClose }) {
  const isNew = !svc;
  const [form, setForm] = useState(svc || {
    id: `sv-${Date.now()}`,
    name:"", type:"school", duration:60, price:0,
    colorId:"green", active:true, archived:false,
    description:"", accessCats:["cat-all"],
    lessons:0, income:0
  });

  const upd = (k,v) => setForm(f=>({...f,[k]:v}));
  const toggleCat = id => setForm(f=>({
    ...f,
    accessCats: f.accessCats.includes(id)
      ? f.accessCats.filter(c=>c!==id)
      : [...f.accessCats, id]
  }));

  const Chip = ({label,active,onClick,color})=>(
    <button onClick={onClick} style={{
      padding:"7px 14px",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
      background:active?`linear-gradient(165deg,${color||ACC_HI},${color||ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
      color:active?"#fff":DIM,
      boxShadow:active?`inset 1px 1px 0 rgba(255,255,255,0.25)`:SO,
    }}>{label}</button>
  );

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"flex-end",backdropFilter:"blur(8px)"}}>
      <div onClick={e=>e.stopPropagation()} className="modal-in" style={{
        width:"100%",maxWidth:520,margin:"0 auto",
        background:`linear-gradient(180deg,${SURFACE},${BG})`,
        borderRadius:"24px 24px 0 0",padding:"20px 18px 36px",
        maxHeight:"92vh",overflowY:"auto"
      }}>
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)",margin:"0 auto 18px"}}/>
        <div style={{fontSize:17,fontWeight:800,marginBottom:20}}>{isNew?"Нова послуга":"Редагування послуги"}</div>

        {/* live slot preview */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>ПОПЕРЕДНІЙ ПЕРЕГЛЯД СЛОТУ</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <SlotPreview svc={form} height={72}/>
            <SlotPreview svc={{...form, duration:form.duration*2}} height={72}/>
          </div>
          <div style={{fontSize:10,color:FAINT,marginTop:4,textAlign:"center"}}>1 слот · 2 слоти (подвійний)</div>
        </div>

        {/* name */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:6}}>НАЗВА</div>
          <Inset style={{padding:"4px 14px"}}>
            <input value={form.name} onChange={e=>upd("name",e.target.value)}
              placeholder="Назва послуги..."
              style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:15,fontWeight:800,padding:"10px 0"}}/>
          </Inset>
        </div>

        {/* type */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>ТИП</div>
          <div style={{display:"flex",gap:8}}>
            <Chip label="🏫 Автошкола" active={form.type==="school"}  onClick={()=>upd("type","school")} />
            <Chip label="🚗 Приватний" active={form.type==="private"} onClick={()=>upd("type","private")}/>
          </div>
        </div>

        {/* duration + price */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div>
            <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:6}}>ТРИВАЛІСТЬ (хв)</div>
            <Inset style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:6}}>
              <input type="number" value={form.duration} min={5} max={480}
                onChange={e=>upd("duration",+e.target.value)}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:18,fontWeight:800,width:60}}/>
              <span style={{color:DIM,fontSize:11}}>хв</span>
            </Inset>
            <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
              {[30,60,90,120,180].map(v=>(
                <button key={v} onClick={()=>upd("duration",v)} style={{
                  padding:"4px 8px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                  background:form.duration===v?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                  color:form.duration===v?"#fff":DIM, boxShadow:SO
                }}>{v}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:6}}>ЦІНА (₴)</div>
            <Inset style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:6}}>
              <input type="number" value={form.price} min={0}
                onChange={e=>upd("price",+e.target.value)}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:GOLD,fontSize:18,fontWeight:800,width:80}}/>
              <span style={{color:GOLD,fontSize:14,fontWeight:700}}>₴</span>
            </Inset>
          </div>
        </div>

        {/* color */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>КОЛІР СЛОТУ</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {PALETTE.map(p=>(
              <button key={p.id} title={p.name} onClick={()=>upd("colorId",p.id)} style={{
                width:34,height:34,borderRadius:10,border:form.colorId===p.id?`2.5px solid #fff`:"2px solid transparent",
                cursor:"pointer",
                background:`linear-gradient(155deg,${p.color}bb,${p.color}44)`,
                boxShadow:form.colorId===p.id?`0 0 12px ${p.color}88,inset 1px 1px 0 rgba(255,255,255,0.4)`:`inset 1px 1px 0 rgba(255,255,255,0.2),0 2px 6px rgba(0,0,0,0.3)`,
                transform:form.colorId===p.id?"scale(1.12)":"scale(1)",
                transition:"transform .12s,box-shadow .12s"
              }}/>
            ))}
          </div>
        </div>

        {/* description */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:6}}>ОПИС</div>
          <Inset style={{padding:"10px 14px"}}>
            <textarea value={form.description} onChange={e=>upd("description",e.target.value)}
              placeholder="Короткий опис послуги..." rows={2}
              style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit"}}/>
          </Inset>
        </div>

        {/* access cats */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>ДОСТУП (для яких категорій учнів)</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {Object.entries(CATEGORIES).map(([id,c])=>(
              <Chip key={id} label={c.name}
                active={form.accessCats.includes(id)}
                onClick={()=>toggleCat(id)}
                color={c.color}/>
            ))}
          </div>
          {form.accessCats.length===0 && (
            <div style={{fontSize:11,color:ACCENT,marginTop:6}}>⚠ Вибери хоча б одну категорію</div>
          )}
        </div>

        {/* actions */}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{
            flex:1,padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
            background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            color:DIM,fontSize:13,fontWeight:700,boxShadow:SO
          }}>Скасувати</button>
          <button onClick={()=>{ if(form.name.trim()&&form.accessCats.length>0) onSave(form); }} style={{
            flex:2,padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
            background:form.name.trim()&&form.accessCats.length>0
              ?`linear-gradient(165deg,${ACC_HI},${ACCENT})`
              :`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            color:form.name.trim()&&form.accessCats.length>0?"#fff":FAINT,
            fontSize:13,fontWeight:700,
            boxShadow:form.name.trim()?`-2px 5px 14px rgba(255,90,60,0.45),inset 1px 1px 0 rgba(255,255,255,0.3)`:SO
          }}>
            {isNew?"Створити послугу":"Зберегти зміни"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DELETE CONFIRM ──────────────────────────────────────────────
function DeleteConfirm({ svc, onConfirm, onArchive, onClose }) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"flex-end",backdropFilter:"blur(8px)"}}>
      <div onClick={e=>e.stopPropagation()} className="modal-in" style={{
        width:"100%",maxWidth:520,margin:"0 auto",
        background:`linear-gradient(180deg,${SURFACE},${BG})`,
        borderRadius:"24px 24px 0 0",padding:"24px 18px 36px"
      }}>
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)",margin:"0 auto 20px"}}/>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
          <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:6}}>Видалити «{svc.name}»?</div>
          <div style={{fontSize:13,color:DIM}}>Послуга має {svc.lessons} проведених уроків. Вибери дію:</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={()=>{onArchive(svc.id);onClose();}} style={{
            padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
            background:`linear-gradient(165deg,#fb923c,#ea580c)`,color:"#fff",fontSize:13,fontWeight:700,
            boxShadow:`-2px 5px 14px rgba(251,146,60,0.4),inset 1px 1px 0 rgba(255,255,255,0.3)`
          }}>📦 Архівувати (зберегти статистику)</button>
          <button onClick={()=>{onConfirm(svc.id);onClose();}} style={{
            padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
            background:`linear-gradient(165deg,#f87171,#dc2626)`,color:"#fff",fontSize:13,fontWeight:700,
            boxShadow:`-2px 5px 14px rgba(239,68,68,0.4),inset 1px 1px 0 rgba(255,255,255,0.3)`
          }}>🗑 Видалити назавжди</button>
          <button onClick={onClose} style={{
            padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
            background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO
          }}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}

// ─── SERVICE CARD ────────────────────────────────────────────────
function ServiceCard({ svc, isDragging, onEdit, onToggle, onDelete, dragHandleProps }) {
  const c = colorOf(svc.colorId);
  return (
    <div className={`pillow fade-in drag-item ${isDragging?"dragging":""}`}
      style={{marginBottom:10,opacity:svc.archived?0.5:svc.active?1:0.7}}>

      {/* ROW 1: іконка · назва · тип-пілюля · toggle · drag */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 14px 12px"}}>
        <div style={{
          width:46,height:46,borderRadius:13,flexShrink:0,
          background:`linear-gradient(155deg,${c}cc,${c}44)`,
          border:`1.5px solid ${c}55`,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:`-2px 4px 10px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2)`
        }}>
          {svc.type==="school" ? Ic.school(28) : Ic.car(28)}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>
            {svc.name}
          </div>
          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
            <Pill label={svc.type==="school"?"Автошкола":"Приватний"}
              color={svc.type==="school"?GREEN:GOLD}
              bg={svc.type==="school"?"rgba(126,217,87,0.12)":"rgba(247,201,72,0.12)"}/>
            {!svc.active&&!svc.archived && <Pill label="Вимкнена" color={DIM} bg="rgba(255,255,255,0.06)"/>}
            {svc.archived && <Pill label="Архів" color="#fb923c" bg="rgba(251,146,60,0.15)"/>}
          </div>
        </div>
        <Toggle on={svc.active&&!svc.archived} onChange={v=>onToggle(svc.id,v)}/>
        <div {...dragHandleProps} style={{cursor:"grab",touchAction:"none",opacity:0.3,flexShrink:0,paddingLeft:4}}>
          {Ic.drag(22)}
        </div>
      </div>

      {/* ROW 2: 4 метрики — рівні колонки з розділювачами */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderTop:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`}}>
        {[
          {val:fmtDur(svc.duration), label:"Тривалість", c:BLUE},
          {val:`${svc.price} ₴`,     label:"Ціна",       c:GOLD},
          {val:svc.lessons,          label:"Уроків",     c:TEXT},
          {val:`${(svc.income/1000).toFixed(0)}к ₴`,label:"Дохід",c:GREEN},
        ].map((m,i,arr)=>(
          <div key={m.label} style={{
            padding:"10px 0",textAlign:"center",
            borderRight:i<arr.length-1?`1px solid ${BORDER}`:"none"
          }}>
            <div style={{fontSize:13,fontWeight:800,color:m.c}}>{m.val}</div>
            <div style={{fontSize:9,color:FAINT,marginTop:2,letterSpacing:0.5,textTransform:"uppercase"}}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* ROW 3: опис + доступ (тільки якщо є) */}
      {(svc.description||svc.accessCats.length>0) && (
        <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,borderBottom:`1px solid ${BORDER}`}}>
          {svc.description && <div style={{fontSize:12,color:DIM,fontStyle:"italic"}}>"{svc.description}"</div>}
          {svc.accessCats.length>0 && (
            <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:10,color:FAINT,flexShrink:0}}>Доступ:</span>
              {svc.accessCats.map(id=>{const cc=CATEGORIES[id];return cc?<Pill key={id} label={cc.name} color={cc.color} bg={`${cc.color}22`}/>:null;})}
            </div>
          )}
        </div>
      )}

      {/* ROW 4: дві кнопки — рівні, симетричні */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
        <button onClick={()=>onEdit(svc)} style={{
          padding:"11px 0",border:"none",borderRight:`1px solid ${BORDER}`,cursor:"pointer",
          background:"transparent",color:BLUE,fontSize:12,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:6,
          borderRadius:"0 0 0 18px"
        }}>
          {Ic.edit(20)} Редагувати
        </button>
        <button onClick={()=>onDelete(svc)} style={{
          padding:"11px 0",border:"none",cursor:"pointer",
          background:"transparent",color:RED,fontSize:12,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:6,
          borderRadius:"0 0 18px 0"
        }}>
          {Ic.trash(20)} Видалити
        </button>
      </div>
    </div>
  );
}

// ─── ROW MODE ────────────────────────────────────────────────────
function ServiceRow({ svc, onEdit, onToggle, onDelete, dragHandleProps, isDragging }) {
  const c = colorOf(svc.colorId);
  return (
    <div className={`drag-item ${isDragging?"dragging":""}`} style={{
      background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
      borderRadius:14,padding:"10px 12px",marginBottom:8,
      display:"flex",alignItems:"center",gap:10,
      boxShadow:SO,opacity:svc.active&&!svc.archived?1:0.55
    }}>
      <div {...dragHandleProps} style={{cursor:"grab",touchAction:"none"}}>{Ic.drag(24)}</div>
      <div style={{width:8,height:36,borderRadius:4,background:c,boxShadow:`0 0 8px ${c}88`,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:800,color:TEXT,marginBottom:2}}>{svc.name}</div>
        <div style={{fontSize:11,color:DIM}}>{fmtDur(svc.duration)} · {svc.price}₴ · {svc.lessons} уроків</div>
      </div>
      {!svc.active&&<Pill label="Вимк." color={DIM} bg="rgba(255,255,255,0.06)"/>}
      {svc.archived&&<Pill label="Архів" color="#fb923c" bg="rgba(251,146,60,0.15)"/>}
      <Toggle on={svc.active&&!svc.archived} onChange={v=>onToggle(svc.id,v)}/>
      <button onClick={()=>onEdit(svc)} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>{Ic.edit(28)}</button>
      <button onClick={()=>onDelete(svc)} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>{Ic.trash(28)}</button>
    </div>
  );
}

// ─── DRAG REORDER HOOK ───────────────────────────────────────────
function useDragReorder(items, setItems) {
  const dragIdx = useRef(null);
  const overIdx = useRef(null);

  const getHandlers = (idx) => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      dragIdx.current = idx;
      overIdx.current = idx;
    },
    onPointerMove: (e) => {
      if (dragIdx.current === null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest("[data-drag-idx]");
      if (card) {
        const newIdx = parseInt(card.dataset.dragIdx);
        if (newIdx !== overIdx.current) {
          overIdx.current = newIdx;
          setItems(prev => {
            const arr = [...prev];
            const [moved] = arr.splice(dragIdx.current, 1);
            arr.splice(newIdx, 0, moved);
            dragIdx.current = newIdx;
            return arr;
          });
        }
      }
    },
    onPointerUp: () => { dragIdx.current = null; overIdx.current = null; },
  });

  return { getHandlers, dragIdx };
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function ServicesView() {
  const [services, setServices] = useState(INIT_SERVICES);
  const [mode, setMode]         = useState("cards");
  const [showArchived, setShowArchived] = useState(false);
  const [editSvc, setEditSvc]   = useState(null);  // null=closed, false=new, obj=edit
  const [deleteSvc, setDeleteSvc] = useState(null);
  const { getHandlers } = useDragReorder(services, setServices);

  const active   = services.filter(s=>!s.archived);
  const archived = services.filter(s=>s.archived);
  const shown    = showArchived ? services : active;

  const totalLessons = active.filter(s=>s.active).reduce((a,s)=>a+s.lessons,0);
  const totalIncome  = active.filter(s=>s.active).reduce((a,s)=>a+s.income,0);

  const onToggle = (id, val) => setServices(ss=>ss.map(s=>s.id===id?{...s,active:val,archived:false}:s));
  const onSave   = (form) => {
    setServices(ss=>{
      const idx = ss.findIndex(s=>s.id===form.id);
      if (idx>=0) { const n=[...ss]; n[idx]=form; return n; }
      return [...ss, form];
    });
    setEditSvc(null);
  };
  const onArchive = id => setServices(ss=>ss.map(s=>s.id===id?{...s,archived:true,active:false}:s));
  const onDelete  = id => setServices(ss=>ss.filter(s=>s.id!==id));

  return (
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",flexDirection:"column",gap:12,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── SUMMARY ── */}
        <div style={{display:"flex",gap:8}}>
          {[
            {label:"Активних послуг", val:active.filter(s=>s.active).length, c:GREEN},
            {label:"Уроків всього",   val:totalLessons,                      c:BLUE},
            {label:"Дохід ₴",         val:totalIncome.toLocaleString(),       c:GOLD},
          ].map(s=>(
            <div key={s.label} style={{flex:1,background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"8px 10px",textAlign:"center"}}>
              <div style={{fontSize:9,color:FAINT,letterSpacing:1}}>{s.label}</div>
              <div style={{fontSize:15,fontWeight:900,color:s.c,marginTop:2}}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* ── CONTROLS ── */}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{flex:1,fontSize:13,color:DIM}}>
            {active.length} послуг · тягни ☰ для зміни порядку
          </div>
          {archived.length>0 && (
            <button onClick={()=>setShowArchived(v=>!v)} style={{
              padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
              background:showArchived?`linear-gradient(165deg,#fb923c,#ea580c)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              color:showArchived?"#fff":DIM, boxShadow:SO
            }}>📦 Архів ({archived.length})</button>
          )}
          <button onClick={()=>setMode(m=>m==="cards"?"rows":"cards")} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>
            {mode==="cards"?Ic.rows(38):Ic.grid(38)}
          </button>
        </div>

        {/* ── LIST ── */}
        <div onPointerMove={e=>getHandlers(0).onPointerMove(e)} onPointerUp={()=>getHandlers(0).onPointerUp()}>
          {shown.map((svc, idx) => (
            <div key={svc.id} data-drag-idx={idx}>
              {mode==="cards"
                ? <ServiceCard
                    svc={svc}
                    isDragging={false}
                    onEdit={setEditSvc}
                    onToggle={onToggle}
                    onDelete={setDeleteSvc}
                    dragHandleProps={getHandlers(idx)}
                  />
                : <ServiceRow
                    svc={svc}
                    isDragging={false}
                    onEdit={setEditSvc}
                    onToggle={onToggle}
                    onDelete={setDeleteSvc}
                    dragHandleProps={getHandlers(idx)}
                  />
              }
            </div>
          ))}
        </div>

        {shown.length===0 && (
          <div style={{textAlign:"center",padding:"40px 20px",color:FAINT}}>
            <div style={{fontSize:32,marginBottom:10}}>📋</div>
            <div style={{fontSize:14,fontWeight:700}}>Немає послуг</div>
          </div>
        )}

        {/* ── ADD BUTTON ── */}
        <button onClick={()=>setEditSvc(false)} style={{
          width:"100%",padding:"14px",borderRadius:16,border:"none",cursor:"pointer",
          background:`linear-gradient(165deg,${ACC_HI},${ACCENT})`,color:"#fff",fontSize:13,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`-2px 5px 14px rgba(255,90,60,0.45),inset 1px 1px 0 rgba(255,255,255,0.3)`
        }}>
          {Ic.plus(28)} Додати нову послугу
        </button>

      </div>

      {/* ── MODALS ── */}
      {editSvc !== null && (
        <ServiceFormModal
          svc={editSvc||null}
          onSave={onSave}
          onClose={()=>setEditSvc(null)}
        />
      )}
      {deleteSvc && (
        <DeleteConfirm
          svc={deleteSvc}
          onConfirm={onDelete}
          onArchive={onArchive}
          onClose={()=>setDeleteSvc(null)}
        />
      )}
    </>
  );
}
