import { useState, useRef } from "react";

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

// ─── CSS ────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
.pillow{background:linear-gradient(135deg,${SURF_HI} 0%,${SURFACE} 50%,${SURF_LO} 100%);border:1px solid rgba(255,255,255,0.04);border-radius:18px;position:relative;overflow:hidden;box-shadow:-2px 6px 16px rgba(0,0,0,0.45),-4px 8px 24px rgba(0,0,0,0.3),inset 1px 1px 0 rgba(255,255,255,0.08),inset -1px -1px 0 rgba(0,0,0,0.25)}
.pillow::before{content:'';position:absolute;pointer-events:none;top:0;right:0;width:60%;height:35%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.07) 0%,transparent 70%);border-radius:18px}
.icon3d{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;position:relative;overflow:hidden;flex-shrink:0;box-shadow:-2px 4px 10px rgba(0,0,0,0.5),inset 1px 1px 0 rgba(255,255,255,0.25),inset -1px -1px 0 rgba(0,0,0,0.3)}
.icon3d::before{content:'';position:absolute;top:0;right:0;width:60%;height:50%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.4) 0%,transparent 70%);pointer-events:none}
.icon3d>svg{position:relative;z-index:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))}
.toggle{width:46px;height:26px;border-radius:13px;cursor:pointer;position:relative;transition:background .2s;background:${SURF_LO};box-shadow:inset 2px 2px 5px rgba(0,0,0,0.4)}
.toggle.on{background:linear-gradient(165deg,${GREEN},#5fb83d)}
.toggle-thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:10px;background:linear-gradient(135deg,#fff,#ccc);transition:left .2s;box-shadow:-1px 2px 4px rgba(0,0,0,0.3)}
.toggle.on .toggle-thumb{left:23px}
@keyframes expand{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
.expand-anim{animation:expand .22s ease both}
@keyframes fade-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fade-in .2s ease both}
`;

// ─── ICONS ──────────────────────────────────────────────────────
const I3 = ({ children, gr, s = 40, r = 14 }) => (
  <div className="icon3d" style={{ width: s, height: s, background: gr, borderRadius: r }}>{children}</div>
);
const Ic = {
  user:    s => <I3 s={s} gr="linear-gradient(165deg,#94a3b8,#475569)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg></I3>,
  phone:   s => <I3 s={s} gr="linear-gradient(165deg,#34d399,#059669)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.82 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.09 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></I3>,
  chat:    s => <I3 s={s} gr="linear-gradient(165deg,#5b9bff,#2563eb)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12c0 5-4 8-9 8-1.5 0-3-.3-4-.7L3 21l1-4C2.5 15.5 2 13.8 2 12c0-5 4-8 9-8s10 3 10 8z"/></svg></I3>,
  sms:     s => <I3 s={s} gr="linear-gradient(165deg,#fcd34d,#d97706)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></I3>,
  plus:    s => <I3 s={s} gr={`linear-gradient(165deg,${ACC_HI},${ACCENT})`}><svg width={s*.5} height={s*.5} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></I3>,
  edit:    s => <I3 s={s} gr="linear-gradient(165deg,#a78bfa,#6d28d9)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></I3>,
  ban:     s => <I3 s={s} gr="linear-gradient(165deg,#f87171,#dc2626)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/></svg></I3>,
  trash:   s => <I3 s={s} gr="linear-gradient(165deg,#f87171,#dc2626)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></I3>,
  export:  s => <I3 s={s} gr="linear-gradient(165deg,#2dd4bf,#0d9488)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></I3>,
  history: s => <I3 s={s} gr="linear-gradient(165deg,#fb923c,#ea580c)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L23 10"/></svg></I3>,
  grid:    s => <I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></I3>,
  list:    s => <I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg></I3>,
  filter:  s => <I3 s={s} gr={`linear-gradient(135deg,${SURF_HI},${SURFACE})`}><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></I3>,
  star:    s => <I3 s={s} gr="linear-gradient(165deg,#fbbf24,#d97706)"><svg width={s*.6} height={s*.6} viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18 6 22 7 15 2 10 9 9"/></svg></I3>,
  note:    s => <I3 s={s} gr="linear-gradient(165deg,#60a5fa,#1d4ed8)"><svg width={s*.55} height={s*.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></I3>,
};

// ─── MOCK DATA ───────────────────────────────────────────────────
const CATEGORIES = {
  "cat-vip": { name:"VIP",      color:PURPLE },
  "cat-std": { name:"Стандарт", color:BLUE   },
  "cat-new": { name:"Новачок",  color:TEAL   },
};
const STUDENTS = [];

// ─── HELPERS ────────────────────────────────────────────────────
const fmtDate = d => { if(!d)return"—"; const [y,m,day]=d.split("-"); const M=["","Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"]; return `${parseInt(day)} ${M[parseInt(m)]} ${y}`; };
const fmtShort = d => { if(!d)return"—"; const [,m,day]=d.split("-"); const M=["","Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"]; return `${parseInt(day)} ${M[parseInt(m)]}`; };

function Pill({ label, color, bg }) {
  return <span style={{background:bg,color,padding:"3px 10px",borderRadius:8,fontSize:11,fontWeight:700,letterSpacing:0.4,whiteSpace:"nowrap"}}>{label}</span>;
}
function Toggle({ on, onChange }) {
  return <div className={`toggle ${on?"on":""}`} onClick={()=>onChange(!on)}><div className="toggle-thumb"/></div>;
}
function Inset({ children, style={} }) {
  return <div style={{background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"10px 14px",...style}}>{children}</div>;
}
function AvatarCircle({ name, size=52, blocked }) {
  const initials = name.split(" ").map(w=>w[0]).slice(0,2).join("");
  const hue = name.charCodeAt(0) * 7 % 360;
  return (
    <div style={{
      width:size, height:size, borderRadius:size/2, flexShrink:0,
      background: blocked ? `linear-gradient(135deg,#3f4248,#26282c)` : `linear-gradient(165deg,hsl(${hue},60%,45%),hsl(${hue+30},70%,30%))`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.32, fontWeight:800, color:"#fff",
      boxShadow:`-2px 4px 10px rgba(0,0,0,0.5),inset 1px 1px 0 rgba(255,255,255,0.2)`,
      position:"relative"
    }}>
      {initials}
      {blocked && (
        <div style={{
          position:"absolute", inset:0, borderRadius:size/2,
          background:"rgba(239,68,68,0.25)",
          border:"2px solid rgba(239,68,68,0.6)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:size*0.35, color:RED
        }}>🚫</div>
      )}
    </div>
  );
}

// ─── SWIPE CARD (compact) ────────────────────────────────────────
function SwipeStudentCard({ s, expanded, onToggle, onBlock, onUpdate }) {
  const ref = useRef(null);
  const state = useRef({ startX:0, swiping:false });
  const [dx, setDx] = useState(0);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(s.notes);
  const [newTag, setNewTag] = useState("");
  const [tags, setTags] = useState(s.tags);

  const start = x => { state.current = { startX:x, swiping:true }; };
  const move  = x => {
    if (!state.current.swiping) return;
    setDx(x - state.current.startX);
  };
  const end = () => {
    state.current.swiping = false;
    if (dx < -80) onBlock(s.id);
    setDx(0);
  };

  const cat = s.catId ? CATEGORIES[s.catId] : null;
  const pct = s.type==="school" ? Math.min((s.hours/40)*100,100) : null;

  return (
    <div style={{marginBottom:10}}>
      {/* swipe bg */}
      <div style={{position:"relative",overflow:"hidden",borderRadius:18}}>
        <div style={{
          position:"absolute",inset:0,
          background:`linear-gradient(90deg,transparent,rgba(239,68,68,0.25))`,
          display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:20,
          opacity: dx < 0 ? Math.min(Math.abs(dx)/60,1) : 0
        }}>
          <span style={{color:RED,fontWeight:800,fontSize:13}}>{s.blocked?"Розблокувати ✓":"Заблокувати 🚫"}</span>
        </div>

        {/* card */}
        <div
          className="pillow fade-in"
          ref={ref}
          onPointerDown={e=>start(e.clientX)}
          onPointerMove={e=>move(e.clientX)}
          onPointerUp={end}
          onPointerLeave={end}
          style={{
            padding:"16px",
            transform:`translateX(${Math.max(-100,Math.min(0,dx))}px)`,
            transition:state.current.swiping?"none":"transform .3s ease",
            opacity: s.blocked ? 0.7 : 1,
            touchAction:"pan-y"
          }}
        >
          {/* ── HEADER ROW ── */}
          <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
            <AvatarCircle name={s.name} size={52} blocked={s.blocked}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{fontSize:15,fontWeight:800,color:TEXT}}>{s.name}</span>
                {s.blocked && <Pill label="Заблоковано" color={RED} bg="rgba(239,68,68,0.15)"/>}
                {cat && <Pill label={cat.name} color={cat.color} bg={`${cat.color}22`}/>}
                <Pill
                  label={s.type==="school"?"Автошкола":"Приватний"}
                  color={s.type==="school"?GREEN:GOLD}
                  bg={s.type==="school"?"rgba(126,217,87,0.15)":"rgba(247,201,72,0.15)"}
                />
              </div>
              <div style={{fontSize:12,color:DIM,marginBottom:6}}>
                {s.phone}{s.tsc?` · ${s.tsc}`:""}
              </div>

              {/* stats row */}
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:pct!==null?8:0}}>
                <Inset style={{padding:"4px 10px"}}>
                  <span style={{fontSize:11,color:BLUE,fontWeight:700}}>📚 {s.hours}г</span>
                </Inset>
                <Inset style={{padding:"4px 10px"}}>
                  <span style={{fontSize:11,color:GOLD,fontWeight:700}}>{s.totalPaid.toLocaleString()} ₴</span>
                </Inset>
                <Inset style={{padding:"4px 10px"}}>
                  <span style={{fontSize:11,color:s.noshow>0?RED:GREEN,fontWeight:700}}>
                    {s.noshow>0?`⚠ ${s.noshow} no-show`:"✓ Без пропусків"}
                  </span>
                </Inset>
                <Inset style={{padding:"4px 10px"}}>
                  <span style={{fontSize:11,color:GOLD,fontWeight:700}}>★ {s.rating}</span>
                </Inset>
                <Inset style={{padding:"4px 10px"}}>
                  <span style={{fontSize:11,color:DIM}}>🕐 {fmtShort(s.lastLesson)}</span>
                </Inset>
              </div>

              {/* progress bar (school only) */}
              {pct !== null && (
                <div style={{marginBottom:4}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:10,color:FAINT}}>{s.hours}/40 год автошколи</span>
                    <span style={{fontSize:10,color:pct>=100?ACCENT:GREEN,fontWeight:700}}>{Math.round(pct)}%</span>
                  </div>
                  <div style={{height:5,background:`linear-gradient(135deg,${BG_DEEP},${SURF_HI})`,borderRadius:4,boxShadow:SI,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,borderRadius:4,
                      background:pct>=100?`linear-gradient(90deg,${ACC_HI},${ACCENT})`:`linear-gradient(90deg,${BLUE},${GREEN})`,
                      boxShadow:`0 0 8px ${pct>=100?ACCENT:GREEN}55`
                    }}/>
                  </div>
                </div>
              )}
            </div>

            {/* expand toggle */}
            <button onClick={()=>onToggle(s.id)} style={{
              background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              border:"none",borderRadius:10,width:32,height:32,cursor:"pointer",
              color:TEXT,fontSize:14,boxShadow:SO,flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",
              transform:expanded?"rotate(180deg)":"none",
              transition:"transform .25s"
            }}>▾</button>
          </div>

          {/* ── EXPANDED PROFILE ── */}
          {expanded && (
            <div className="expand-anim" style={{marginTop:16,display:"flex",flexDirection:"column",gap:12}}>

              {/* quick actions */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {[
                  {icon:Ic.phone(34),label:"Дзвонити",fn:()=>window.location.href=`tel:${s.phone}`},
                  {icon:Ic.sms(34),  label:"SMS",      fn:()=>window.location.href=`sms:${s.phone}`},
                  {icon:Ic.chat(34), label:"Чат",      fn:()=>{}},
                  {icon:Ic.plus(34), label:"Запис",    fn:()=>{}},
                  {icon:Ic.edit(34), label:"Редаг.",   fn:()=>{}},
                  {icon:Ic.ban(34),  label:s.blocked?"Розблок.":"Заблок.", fn:()=>onBlock(s.id)},
                  {icon:Ic.history(34),label:"Історія",fn:()=>{}},
                  {icon:Ic.export(34), label:"Експорт",fn:()=>{}},
                ].map((a,i)=>(
                  <button key={i} onClick={a.fn} style={{
                    background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                    border:"none",borderRadius:12,padding:"10px 4px",cursor:"pointer",
                    display:"flex",flexDirection:"column",alignItems:"center",gap:5,
                    boxShadow:SO
                  }}>
                    {a.icon}
                    <span style={{fontSize:9,color:DIM,fontWeight:700}}>{a.label}</span>
                  </button>
                ))}
              </div>

              {/* personal info grid */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
                {[
                  ["АДРЕСА",     s.address||"—",      TEXT],
                  ["ДАТА НАРОДЖ.",fmtDate(s.born),   DIM],
                  ["ПАСПОРТ",    s.passport||"—",    DIM],
                  ["ПОСВІДЧЕННЯ",s.license||"—",     DIM],
                  ["КАТЕГОРІЯ",  cat?.name||"—",     cat?.color||DIM],
                  ["ТСЦ",        s.tsc||"—",         DIM],
                ].map(([label,val,c])=>(
                  <Inset key={label} style={{padding:"9px 11px"}}>
                    <div style={{fontSize:9,color:FAINT,letterSpacing:1,marginBottom:3}}>{label}</div>
                    <div style={{fontSize:13,fontWeight:700,color:c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{val}</div>
                  </Inset>
                ))}
              </div>

              {/* notes */}
              <Inset style={{padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:9,color:FAINT,letterSpacing:1}}>НОТАТКИ ІНСТРУКТОРА (ПРИВАТНІ)</div>
                  <button onClick={()=>setEditNotes(!editNotes)} style={{background:"none",border:"none",cursor:"pointer",color:BLUE,fontSize:11,fontWeight:700}}>{editNotes?"Зберегти":"Редагувати"}</button>
                </div>
                {editNotes ? (
                  <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
                    style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit"}}/>
                ) : (
                  <div style={{fontSize:13,color:notes?TEXT:FAINT,fontStyle:notes?"normal":"italic"}}>
                    {notes||"Немає нотаток…"}
                  </div>
                )}
              </Inset>

              {/* tags */}
              <div>
                <div style={{fontSize:9,color:FAINT,letterSpacing:1,marginBottom:8}}>ТЕГИ</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  {tags.map((t,i)=>(
                    <div key={i} style={{
                      display:"flex",alignItems:"center",gap:4,
                      background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                      padding:"4px 10px",borderRadius:10,boxShadow:SO
                    }}>
                      <span style={{fontSize:12,color:DIM,fontWeight:600}}>#{t}</span>
                      <button onClick={()=>setTags(ts=>ts.filter((_,j)=>j!==i))}
                        style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:14,padding:0,lineHeight:1}}>×</button>
                    </div>
                  ))}
                  <div style={{display:"flex",alignItems:"center",gap:4,background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:10,padding:"4px 10px",boxShadow:SI}}>
                    <input value={newTag} onChange={e=>setNewTag(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"&&newTag.trim()){setTags(ts=>[...ts,newTag.trim()]);setNewTag("");}}}
                      placeholder="+ тег" style={{background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:12,width:60}}/>
                  </div>
                </div>
              </div>

              {/* booking history */}
              <div>
                <div style={{fontSize:9,color:FAINT,letterSpacing:1,marginBottom:8}}>ІСТОРІЯ БУКІНГІВ</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {s.bookings.map((b,i)=>(
                    <div key={i} style={{
                      display:"flex",alignItems:"center",gap:10,
                      background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                      borderRadius:12,padding:"9px 12px",boxShadow:SO
                    }}>
                      <div style={{fontSize:12,color:DIM,fontWeight:700,minWidth:64}}>{fmtShort(b.date)}</div>
                      <div style={{fontSize:12,color:BLUE,fontWeight:700,minWidth:40}}>{b.time}</div>
                      <div style={{flex:1,fontSize:12,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.svc}</div>
                      <div style={{fontSize:12,color:GOLD,fontWeight:700}}>{b.price}₴</div>
                      <div style={{
                        fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6,
                        background:b.status==="confirmed"?"rgba(126,217,87,0.15)":b.status==="noshow"?"rgba(239,68,68,0.15)":"rgba(255,90,60,0.15)",
                        color:b.status==="confirmed"?GREEN:b.status==="noshow"?RED:ACCENT
                      }}>
                        {b.status==="confirmed"?"✓":b.status==="noshow"?"✕":"⏳"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* hint */}
              <div style={{fontSize:10,color:FAINT,textAlign:"center"}}>← потягни вліво щоб {s.blocked?"розблокувати":"заблокувати"}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ROW MODE ───────────────────────────────────────────────────
function RowMode({ list, expanded, onToggle, onBlock }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {list.map(s => {
        const cat = s.catId ? CATEGORIES[s.catId] : null;
        const pct = s.type==="school" ? Math.min((s.hours/40)*100,100) : null;
        return (
          <div key={s.id} className="fade-in" style={{
            background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            borderRadius:14,overflow:"hidden",opacity:s.blocked?0.6:1,
            boxShadow:SO
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer"}}
              onClick={()=>onToggle(s.id)}>
              <AvatarCircle name={s.name} size={38} blocked={s.blocked}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{s.name}</span>
                  {cat && <Pill label={cat.name} color={cat.color} bg={`${cat.color}22`}/>}
                  {s.blocked && <Pill label="🚫" color={RED} bg="rgba(239,68,68,0.1)"/>}
                </div>
                <div style={{fontSize:11,color:DIM}}>{s.phone}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                <span style={{fontSize:12,color:GOLD,fontWeight:700}}>{s.totalPaid.toLocaleString()}₴</span>
                {pct!==null && <div style={{width:40,height:4,background:`linear-gradient(135deg,${BG_DEEP},${SURF_HI})`,borderRadius:3,overflow:"hidden",boxShadow:SI}}>
                  <div style={{height:"100%",width:`${pct}%`,background:pct>=100?ACCENT:GREEN,borderRadius:3}}/>
                </div>}
                <span style={{fontSize:12,color:TEXT_FAINT_FIX,transform:expanded.has(s.id)?"rotate(180deg)":"none",transition:"transform .25s",display:"inline-block"}}>▾</span>
              </div>
            </div>
            {expanded.has(s.id) && (
              <div className="expand-anim" style={{padding:"0 12px 12px",borderTop:`1px solid ${BORDER}`}}>
                <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                  <button onClick={()=>window.location.href=`tel:${s.phone}`} style={quickBtnStyle}>{Ic.phone(28)}<span style={quickLblStyle}>Дзвонити</span></button>
                  <button style={quickBtnStyle}>{Ic.chat(28)}<span style={quickLblStyle}>Чат</span></button>
                  <button style={quickBtnStyle}>{Ic.plus(28)}<span style={quickLblStyle}>Запис</span></button>
                  <button onClick={()=>onBlock(s.id)} style={quickBtnStyle}>{Ic.ban(28)}<span style={quickLblStyle}>{s.blocked?"Розблок.":"Заблок."}</span></button>
                </div>
                {s.notes && <div style={{marginTop:10,fontSize:12,color:DIM,fontStyle:"italic"}}>📝 {s.notes}</div>}
                <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                  {s.tags.map((t,i)=>(
                    <span key={i} style={{fontSize:11,color:FAINT,background:`${SURF_HI}`,padding:"3px 8px",borderRadius:8}}>#{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
const TEXT_FAINT_FIX = FAINT;
const quickBtnStyle = {
  background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
  border:"none",borderRadius:10,padding:"8px 12px",cursor:"pointer",
  display:"flex",alignItems:"center",gap:6,boxShadow:SO
};
const quickLblStyle = { fontSize:11,color:DIM,fontWeight:700 };

// ─── FILTER SHEET ────────────────────────────────────────────────
function FilterSheet({ f, setF, sort, setSort, group, setGroup, onClose }) {
  const Chip = ({ label, active, onClick }) => (
    <button onClick={onClick} style={{
      padding:"7px 14px",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
      background:active?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
      color:active?"#fff":DIM, boxShadow:active?`inset 1px 1px 0 rgba(255,255,255,0.25)`:SO
    }}>{label}</button>
  );
  const Section = ({label,children}) => (
    <div style={{marginBottom:16}}>
      <div style={{fontSize:10,color:FAINT,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>{label}</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{children}</div>
    </div>
  );
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:90,display:"flex",alignItems:"flex-end",backdropFilter:"blur(8px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"100%",maxWidth:520,margin:"0 auto",
        background:`linear-gradient(180deg,${SURFACE},${BG})`,
        borderRadius:"24px 24px 0 0",padding:"20px 18px 36px",maxHeight:"90vh",overflowY:"auto"
      }}>
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)",margin:"0 auto 20px"}}/>
        <div style={{fontSize:16,fontWeight:800,marginBottom:20}}>Фільтр та сортування</div>
        <Section label="Тип">
          {[["all","Всі"],["school","Автошкола"],["private","Приватний"]].map(([k,l])=>(
            <Chip key={k} label={l} active={f.type===k} onClick={()=>setF(x=>({...x,type:k}))}/>
          ))}
        </Section>
        <Section label="Статус">
          {[["all","Всі"],["active","Активні"],["inactive","Неактивні"],["blocked","Заблоковані"]].map(([k,l])=>(
            <Chip key={k} label={l} active={f.status===k} onClick={()=>setF(x=>({...x,status:k}))}/>
          ))}
        </Section>
        <Section label="Категорія">
          <Chip label="Всі" active={!f.catId} onClick={()=>setF(x=>({...x,catId:null}))}/>
          {Object.entries(CATEGORIES).map(([id,c])=>(
            <Chip key={id} label={c.name} active={f.catId===id} onClick={()=>setF(x=>({...x,catId:id}))}/>
          ))}
        </Section>
        <Section label="ТСЦ">
          <Chip label="Всі" active={!f.tsc} onClick={()=>setF(x=>({...x,tsc:null}))}/>
          {[...new Set(STUDENTS.filter(s=>s.tsc).map(s=>s.tsc))].map(t=>(
            <Chip key={t} label={t} active={f.tsc===t} onClick={()=>setF(x=>({...x,tsc:t}))}/>
          ))}
        </Section>
        <Section label="Сортування">
          {[["name","Ім'я А-Я"],["hours-desc","Годин ↓"],["lastLesson","Останній урок"],["paid-desc","Сума ↓"]].map(([k,l])=>(
            <Chip key={k} label={l} active={sort===k} onClick={()=>setSort(k)}/>
          ))}
        </Section>
        <Section label="Групування">
          {[[null,"Без групування"],["alpha","Літера"],["tsc","ТСЦ"],["cat","Категорія"],["type","Тип"]].map(([k,l])=>(
            <Chip key={k||"none"} label={l} active={group===k} onClick={()=>setGroup(k)}/>
          ))}
        </Section>
        <button onClick={onClose} style={{
          width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
          background:`linear-gradient(165deg,${ACC_HI},${ACCENT})`,color:"#fff",fontSize:13,fontWeight:700,
          boxShadow:`-2px 5px 14px rgba(255,90,60,0.45),inset 1px 1px 0 rgba(255,255,255,0.3)`
        }}>Застосувати</button>
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function StudentsView() {
  const [students, setStudents] = useState(STUDENTS);
  const [mode, setMode]         = useState("cards");
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch]     = useState("");
  const [filters, setFilters]   = useState({ type:"all", status:"all", catId:null, tsc:null });
  const [sort, setSort]         = useState("name");
  const [group, setGroup]       = useState("alpha");
  const [showF, setShowF]       = useState(false);

  const toggleExpand = id => setExpanded(e => {
    const n = new Set(e);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const blockToggle = id => setStudents(ss => ss.map(s => s.id===id ? {...s, blocked:!s.blocked, active:s.blocked} : s));

  // search (includes notes)
  const q = search.toLowerCase();
  let list = students.filter(s =>
    (!q || s.name.toLowerCase().includes(q) || s.phone.includes(q) ||
     s.tsc.toLowerCase().includes(q) || s.notes.toLowerCase().includes(q) ||
     s.tags.some(t=>t.toLowerCase().includes(q)) ||
     (s.catId && CATEGORIES[s.catId]?.name.toLowerCase().includes(q))) &&
    (filters.type==="all"    || s.type===filters.type) &&
    (filters.status==="all"  || (filters.status==="active"&&s.active&&!s.blocked) ||
                                (filters.status==="inactive"&&!s.active&&!s.blocked) ||
                                (filters.status==="blocked"&&s.blocked)) &&
    (!filters.catId || s.catId===filters.catId) &&
    (!filters.tsc   || s.tsc===filters.tsc)
  );

  // sort
  list = [...list].sort((a,b) => {
    if (sort==="name")       return a.name.localeCompare(b.name);
    if (sort==="hours-desc") return b.hours - a.hours;
    if (sort==="lastLesson") return (b.lastLesson||"").localeCompare(a.lastLesson||"");
    if (sort==="paid-desc")  return b.totalPaid - a.totalPaid;
    return 0;
  });

  // group
  const grouped = (() => {
    if (!group) return [{key:null, items:list}];
    const map = {};
    list.forEach(s => {
      let k;
      if (group==="alpha") k = s.name[0].toUpperCase();
      if (group==="tsc")   k = s.tsc || "Без ТСЦ";
      if (group==="cat")   k = s.catId ? CATEGORIES[s.catId]?.name : "Без категорії";
      if (group==="type")  k = s.type==="school" ? "Автошкола" : "Приватний";
      if (!map[k]) map[k] = [];
      map[k].push(s);
    });
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([key,items])=>({key,items}));
  })();

  const activeFiltersCount = [filters.type!=="all",filters.status!=="all",!!filters.catId,!!filters.tsc].filter(Boolean).length;
  const totalHours = list.reduce((s,x)=>s+x.hours,0);
  const totalPaid  = list.reduce((s,x)=>s+x.totalPaid,0);

  return (
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",flexDirection:"column",gap:12,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── SEARCH + CONTROLS ── */}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{flex:1,background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"4px 12px",display:"flex",alignItems:"center",gap:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ім'я, тел, ТСЦ, нотатки, теги…"
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,padding:"10px 0",fontSize:14}}/>
            {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:18,padding:0}}>×</button>}
          </div>
          <button onClick={()=>setShowF(true)} style={{position:"relative",background:"none",border:"none",cursor:"pointer",padding:0}}>
            {Ic.filter(40)}
            {activeFiltersCount>0 && <span style={{position:"absolute",top:-4,right:-4,background:ACCENT,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:9,fontWeight:800}}>{activeFiltersCount}</span>}
          </button>
          <button onClick={()=>setMode(m=>m==="cards"?"rows":"cards")} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>
            {mode==="cards" ? Ic.list(40) : Ic.grid(40)}
          </button>
        </div>

        {/* ── SUMMARY ── */}
        <div style={{display:"flex",gap:8}}>
          {[
            {label:"Учнів",  val:list.length,             c:TEXT},
            {label:"Годин",  val:totalHours,              c:BLUE},
            {label:"Сума ₴", val:totalPaid.toLocaleString(), c:GOLD},
            {label:"Заблок.",val:list.filter(s=>s.blocked).length, c:RED},
          ].map(s=>(
            <div key={s.label} style={{flex:1,background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"8px 10px",textAlign:"center"}}>
              <div style={{fontSize:9,color:FAINT,letterSpacing:1}}>{s.label}</div>
              <div style={{fontSize:15,fontWeight:900,color:s.c,marginTop:2}}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* ── LIST ── */}
        {grouped.map(({key, items}) => (
          <div key={key||"all"}>
            {key && (
              <div style={{fontSize:11,color:FAINT,fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",padding:"8px 4px 4px",display:"flex",alignItems:"center",gap:8}}>
                <div style={{flex:1,height:1,background:BORDER}}/>
                {key}
                <span style={{background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,padding:"2px 8px",borderRadius:8,fontSize:10,color:DIM,boxShadow:SO}}>{items.length}</span>
                <div style={{flex:1,height:1,background:BORDER}}/>
              </div>
            )}
            {mode==="cards"
              ? items.map(s=>(
                  <SwipeStudentCard key={s.id} s={s}
                    expanded={expanded.has(s.id)}
                    onToggle={toggleExpand}
                    onBlock={blockToggle}
                    onUpdate={()=>{}}
                  />
                ))
              : <RowMode list={items} expanded={expanded} onToggle={toggleExpand} onBlock={blockToggle}/>
            }
          </div>
        ))}

        {list.length===0 && (
          <div style={{textAlign:"center",padding:"40px 20px",color:FAINT}}>
            <div style={{fontSize:32,marginBottom:10}}>👥</div>
            <div style={{fontSize:14,fontWeight:700}}>Нікого не знайдено</div>
            <div style={{fontSize:12,marginTop:4}}>Спробуй змінити фільтри або пошук</div>
          </div>
        )}

        {/* ── ADD BUTTON ── */}
        <button style={{
          width:"100%",padding:"14px",borderRadius:16,border:"none",cursor:"pointer",
          background:`linear-gradient(165deg,${ACC_HI},${ACCENT})`,color:"#fff",fontSize:13,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`-2px 5px 14px rgba(255,90,60,0.45),inset 1px 1px 0 rgba(255,255,255,0.3)`,
          marginTop:4
        }}>
          {Ic.plus(28)} Додати учня
        </button>

      </div>

      {showF && <FilterSheet f={filters} setF={setFilters} sort={sort} setSort={setSort} group={group} setGroup={setGroup} onClose={()=>setShowF(false)}/>}
    </>
  );
}
