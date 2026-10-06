import { useState, useEffect, useContext } from "react";
import { onValue, update, remove } from "firebase/database";
import { iRef } from "../firebase";

import { ThemeContext } from "../theme.js";
import { UICss, Modal, Btn, Chip, StatTile, useFX } from "../ui";

const PALETTE = [
  { id:"green",   color:"#7ed957" }, { id:"yellow",  color:"#f7c948" },
  { id:"blue",    color:"#5b9bff" }, { id:"purple",  color:"#c084fc" },
  { id:"red",     color:"#ff5a3c" }, { id:"teal",    color:"#2dd4bf" },
  { id:"pink",    color:"#f472b6" }, { id:"orange",  color:"#fb923c" },
  { id:"indigo",  color:"#818cf8" }, { id:"lime",    color:"#a3e635" },
];
const colorOf = id => PALETTE.find(p=>p.id===id)?.color || "#7ed957";

const SERVICES = {
  sv1:{ name:"Стандарт 1г", color:"#7ed957", type:"school"  },
  sv2:{ name:"Стандарт 2г", color:"#7ed957", type:"school"  },
  sv3:{ name:"Індивідуальний 1г", color:"#f7c948", type:"private" },
  sv4:{ name:"Індивідуальний 2г", color:"#f7c948", type:"private" },
};

// ─── QUEUE OFFER MODAL ──────────────────────────────────────────
function QueueOfferModal({ cancelledBk, waiting, queueMode, onInvite, onClose, svcsMap }) {
  const { SURF_HI, SURFACE, TEXT, DIM, FAINT, PURPLE, GOLD, SO } = useContext(ThemeContext);
  const [selected, setSelected] = useState(
    queueMode==="fifo"?[waiting[0]?.id]:queueMode==="broadcast"?waiting.map(q=>q.id):[]
  );
  const toggle = id => setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  return (
    <Modal open onClose={onClose} sheet size="md" title="⏳ Слот вільний!"
      footer={<>
        <Btn variant="ghost" flex={1} onClick={onClose}>Пізніше</Btn>
        <Btn variant="primary" accent={PURPLE} flex={1} disabled={selected.length===0}
          onClick={()=>selected.length>0&&onInvite(waiting.filter(q=>selected.includes(q.id)))}>
          👑 Запросити ({selected.length})
        </Btn>
      </>}>
      <div style={{fontSize:12,color:DIM,marginTop:-12,marginBottom:16}}>
        Є <b style={{color:PURPLE}}>{waiting.length}</b> {waiting.length===1?"клієнт":"клієнтів"} в черзі.
        Режим: <b style={{color:GOLD}}>{queueMode==="fifo"?"FIFO":queueMode==="broadcast"?"Broadcast":"Ручний"}</b>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {waiting.map(q=>(
          <div key={q.id} onClick={()=>queueMode==="manual"&&toggle(q.id)} style={{
            display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:11,cursor:queueMode==="manual"?"pointer":"default",boxShadow:SO,
            background:selected.includes(q.id)?`linear-gradient(145deg,rgba(192,132,252,0.2),rgba(124,58,237,0.1))`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
            border:selected.includes(q.id)?`1px solid ${PURPLE}44`:"1px solid transparent",
          }}>
            <div style={{width:4,height:32,borderRadius:3,background:PURPLE,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:TEXT}}>{q.name}</div>
              <div style={{fontSize:10,color:DIM}}>{q.phone} · {(svcsMap||SERVICES)[q.svcId]?.name||q.svcId}</div>
            </div>
            {selected.includes(q.id) && <span style={{fontSize:16}}>✓</span>}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// підпис + колір статусу запису
function statusInfo(status, C) {
  if (status === "confirmed") return { text: "Підтверджено", color: C.GREEN };
  if (status === "pending")   return { text: "Очікує",       color: C.GOLD };
  if (status === "completed") return { text: "Завершено",    color: C.DIM };
  return { text: status || "—", color: C.DIM };
}

// ─── CARDS (стиль застосунку: кольорові градієнтні картки, як у «Клієнти» / «Послуги») ─────
const MON = ["січ","лют","бер","кві","тра","чер","лип","сер","вер","жов","лис","гру"];
const initialsOf = n => (n||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();

function fmtWait(ts, now) {
  if (!ts) return "";
  const mins = Math.max(0, Math.floor((now - ts) / 60000));
  if (mins < 60) return `${mins} хв`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} год` : `${Math.floor(h/24)} дн`;
}

// slotKey "2026-10-05_11:00" → "05.10 · 11:00"
function slotLabel(key) {
  const [d, t] = String(key || "").split("_");
  const p = (d || "").split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}${t ? ` · ${t}` : ""}` : String(key || "").replace("_", " ");
}

function CardShell({ color, children }) {
  const { BG_DEEP } = useContext(ThemeContext);
  const { shade, glow } = useFX();
  return (
    <div className="fade-in" style={{
      position:"relative", flexShrink:0, borderRadius:14, overflow:"hidden",
      background:`linear-gradient(155deg,color-mix(in srgb,${color} 46%,${BG_DEEP}) 0%,color-mix(in srgb,${color} 16%,${BG_DEEP}) 100%)`,
      border:`1px solid color-mix(in srgb,${color} 42%,transparent)`,
      boxShadow:`-2px 5px 13px ${shade(0.45)},inset 1px 1px 0 ${glow(0.15)}`,
    }}>
      <div style={{position:"absolute",pointerEvents:"none",top:0,right:"6%",width:"55%",height:"45%",zIndex:1,
        background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.18) 0%,transparent 65%)"}}/>
      <div style={{position:"relative",zIndex:2}}>{children}</div>
    </div>
  );
}

function Pill({ color, children }) {
  const { shade } = useFX();
  return (
    <span style={{fontSize:9.5,fontWeight:800,color,background:shade(0.35),padding:"2px 8px",borderRadius:7,whiteSpace:"nowrap"}}>{children}</span>
  );
}

function HoursChip({ h }) {
  const { GOLD } = useContext(ThemeContext);
  if (!h) return null;
  return <span style={{padding:"2px 7px",borderRadius:7,background:`${GOLD}26`,border:`1px solid ${GOLD}4d`,fontSize:10.5,fontWeight:900,color:GOLD,whiteSpace:"nowrap"}}>{h} год</span>;
}

function BkCard({ b, st }) {
  const { GOLD } = useContext(ThemeContext);
  const { shade } = useFX();
  const d = (b.date || "").split("-");
  return (
    <CardShell color={st.color}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px"}}>
        <div style={{
          width:40,height:40,borderRadius:11,flexShrink:0,color:"#fff",lineHeight:1,
          background:`linear-gradient(155deg,${st.color},color-mix(in srgb,${st.color} 40%,#000))`,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          boxShadow:`-2px 3px 8px color-mix(in srgb,${st.color} 40%,transparent)`,
        }}>
          <div style={{fontSize:15,fontWeight:900}}>{d[2] || "—"}</div>
          <div style={{fontSize:8.5,fontWeight:800,opacity:0.85,marginTop:2,textTransform:"uppercase"}}>{MON[(+d[1] || 1) - 1]}</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:"#fff",textShadow:`0 1px 3px ${shade(0.5)}`,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {b.time || "—"}{b.phone ? ` · ${b.phone}` : ""}{b.serviceName ? ` · ${b.serviceName}` : ""}{b.price != null ? ` · ${b.price}₴` : ""}
          </div>
          {b.studentNote && (
            <div style={{fontSize:11,color:GOLD,marginTop:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>💬 {b.studentNote}</div>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          <Pill color={st.color}>{st.text}</Pill>
          {b.durationHours > 1 && <HoursChip h={b.durationHours}/>}
        </div>
      </div>
    </CardShell>
  );
}

function QCard({ q, pos, svc, now, onInvite, onRemove }) {
  const { BORDER, GOLD, GREEN, PURPLE, RED, BG_DEEP } = useContext(ThemeContext);
  const { shade } = useFX();
  const color = q.status === "offered" ? GOLD : q.status === "booked" ? GREEN : PURPLE;
  const label = q.status === "offered" ? "Запрошено" : q.status === "booked" ? "Записаний" : "Очікує";
  const hrs = q.durationHours || (svc.name || "").match(/(\d+)г/)?.[1];
  const waiting = q.status === "waiting";
  const btn = { padding:"8px 0",border:"none",cursor:"pointer",background:"transparent",fontSize:11,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:5 };
  return (
    <CardShell color={color}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px"}}>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{
            width:36,height:36,borderRadius:11,color:"#fff",fontSize:13,fontWeight:900,
            background:`linear-gradient(155deg,${color},color-mix(in srgb,${color} 40%,#000))`,
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:`-2px 3px 8px color-mix(in srgb,${color} 40%,transparent)`,
          }}>{initialsOf(q.name)}</div>
          <div style={{
            position:"absolute",top:-5,left:-5,width:15,height:15,borderRadius:5,
            background:BG_DEEP,color,fontSize:8.5,fontWeight:900,
            display:"flex",alignItems:"center",justifyContent:"center",
            border:`1px solid color-mix(in srgb,${color} 45%,transparent)`,
          }}>{pos}</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:"#fff",textShadow:`0 1px 3px ${shade(0.5)}`,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{q.name}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {q.phone}{svc.name ? `${q.phone ? " · " : ""}${svc.name}` : ""}
          </div>
          {(q.slotKey || hrs) && (
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}>
              {q.slotKey && <span style={{padding:"2px 8px",borderRadius:7,background:shade(0.3),fontSize:10.5,fontWeight:800,color:"#fff",whiteSpace:"nowrap"}}>📅 {slotLabel(q.slotKey)}</span>}
              <HoursChip h={hrs}/>
            </div>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          <Pill color={color}>{label}</Pill>
          {q.addedAt ? <div style={{fontSize:9.5,color:"rgba(255,255,255,0.7)"}}>{fmtWait(q.addedAt, now)}</div> : null}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:waiting?"1fr 1fr":"1fr",borderTop:`1px solid ${BORDER}`}}>
        {waiting && (
          <button onClick={onInvite} style={{...btn,borderRight:`1px solid ${BORDER}`,color:PURPLE}}>
            <div className="icon3d" style={{width:22,height:22,background:"linear-gradient(165deg,#c084fc,#7c3aed)",borderRadius:7}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{position:"relative",zIndex:1}}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </div>
            Запросити
          </button>
        )}
        <button onClick={onRemove} style={{...btn,color:`${RED}cc`}}>
          <div className="icon3d" style={{width:22,height:22,background:"linear-gradient(165deg,#f87171,#dc2626)",borderRadius:7}}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{position:"relative",zIndex:1}}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </div>
          Видалити
        </button>
      </div>
    </CardShell>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────
export default function BookingsView({ settings, bookings }) {
  const { SURFACE, SURF_HI, BG_DEEP, BORDER, TEXT, DIM, FAINT, PURPLE, GOLD, GREEN, BLUE, SO, SI } = useContext(ThemeContext);
  const css = `
textarea{color-scheme:dark}
@keyframes expand-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.expand-body{animation:expand-in .18s ease both}
@keyframes bk-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.bk-in{animation:bk-in .2s ease both}
`;
  const [svcsMap,      setSvcsMap]      = useState(SERVICES);
  const [queue,        setQueue]        = useState([]);
  const [queueOpen,    setQueueOpen]    = useState(true);
  const [queueOffer,   setQueueOffer]   = useState(null);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookingsOpen, setBookingsOpen] = useState(false); // спойлер «Записи»
  const [now, setNow] = useState(() => Date.now()); // для «очікує N год» у картках черги
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);

  const filteredBookings = (bookings || [])
    .filter(b => statusFilter === "all" || (b.status || "pending") === statusFilter)
    .filter(b => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (b.name || "").toLowerCase().includes(q) || (b.phone || "").includes(q);
    })
    .sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`));

  useEffect(() => {
    return onValue(iRef("admin_data/services"),snap=>{
      const arr=snap.val(); if(!Array.isArray(arr)) return;
      const map={}; arr.forEach(s=>{if(s?.id)map[s.id]={...s,color:colorOf(s.colorId)};});
      if(Object.keys(map).length) setSvcsMap(map);
    });
  }, []);

  useEffect(() => {
    return onValue(iRef("queue"),snap=>{
      const d=snap.val();
      if(!d){setQueue([]);setQueueOpen(prev=>prev===null?false:prev);return;}
      const arr=[];
      Object.entries(d).forEach(([id,v])=>{
        if(v?.entries){
          Object.entries(v.entries).forEach(([uid,entry])=>{
            arr.push({id:`${id}__${uid}`,_slotKey:id,_uid:uid,_nested:true,
              name:entry.name||'—',phone:entry.phone||'',status:entry.status||'waiting',
              addedAt:entry.addedAt||0,studentType:entry.studentType,durationHours:entry.durationHours,slotKey:id});
          });
        } else { arr.push({id,...v}); }
      });
      arr.sort((a,b)=>(a.order??a.addedAt??0)-(b.order??b.addedAt??0));
      setQueue(arr);
      setQueueOpen(prev=>prev===null?arr.some(q=>q.status==="waiting"):prev);
    },()=>{});
  }, []);

  const removeFromQueue= item => {
    if(typeof item==="string"){remove(iRef(`queue/${item}`));return;}
    if(item._nested)remove(iRef(`queue/${item._slotKey}/entries/${item._uid}`));
    else remove(iRef(`queue/${item.id}`));
  };
  const markOffered = item => {
    const p={status:"offered",offeredAt:Date.now()};
    if(typeof item==="string"){update(iRef(`queue/${item}`),p);return;}
    if(item._nested)update(iRef(`queue/${item._slotKey}/entries/${item._uid}`),p);
    else update(iRef(`queue/${item.id}`),p);
  };
  const queueMode = settings?.queueAutoFifo?"fifo":settings?.queueBroadcast?"broadcast":"manual";

  const activeQueue = queue.filter(q=>q.status!=="archived");
  const cnt = st => activeQueue.filter(q=>q.status===st).length;
  const waitingCount = cnt("waiting");

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{display:"flex",flexDirection:"column",gap:10,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── ЗАПИСИ (спойлер, за замовчуванням згорнуто) ── */}
        <div style={{background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,borderRadius:14,overflow:"hidden",boxShadow:SO,border:`1px solid ${BORDER}`}}>
          <div onClick={()=>setBookingsOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer",userSelect:"none"}}>
            <div style={{width:32,height:32,borderRadius:10,flexShrink:0,background:"linear-gradient(165deg,#5b9bff,#2563eb)",boxShadow:SO,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>📋</div>
            <span style={{flex:1,fontSize:13,fontWeight:800,color:TEXT}}>Записи</span>
            <span style={{fontSize:11,color:DIM,fontWeight:700}}>{(bookings||[]).length}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round" style={{transform:bookingsOpen?"rotate(180deg)":"none",transition:"transform .2s",flexShrink:0}}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          {bookingsOpen && (
            <div className="expand-body" style={{borderTop:`1px solid ${BORDER}`,padding:"12px 12px 12px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{background:BG_DEEP,borderRadius:11,boxShadow:SI,padding:"3px 11px",display:"flex",alignItems:"center",gap:7}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук за ім'ям або телефоном…"
                  style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,padding:"9px 0",fontSize:13,minWidth:0,fontFamily:"inherit"}}/>
                {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:16,padding:0,lineHeight:1}}>×</button>}
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {[["all","Усі"],["pending","Очікує"],["confirmed","Підтверджено"],["completed","Завершено"]].map(([id,label])=>(
                  <Chip key={id} active={statusFilter===id} color={BLUE} onClick={()=>setStatusFilter(id)}>{label}</Chip>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:420,overflowY:"auto",padding:"2px 1px 6px"}}>
                {filteredBookings.length===0 ? (
                  <div style={{textAlign:"center",padding:"18px 0",color:FAINT,fontSize:12}}>
                    {(bookings||[]).length===0 ? "Немає записів" : "Нічого не знайдено"}
                  </div>
                ) : filteredBookings.map(b=>(
                  <BkCard key={b.id} b={b} st={statusInfo(b.status, {GREEN,GOLD,DIM})}/>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── ЧЕРГА ── */}
        <div style={{background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,borderRadius:14,overflow:"hidden",boxShadow:SO,border:`1px solid ${BORDER}`}}>
          <div onClick={()=>setQueueOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer",userSelect:"none"}}>
            <div style={{width:32,height:32,borderRadius:10,flexShrink:0,background:"linear-gradient(165deg,#c084fc,#7c3aed)",boxShadow:SO,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>⏳</div>
            <span style={{flex:1,fontSize:13,fontWeight:800,color:TEXT}}>Черга очікування</span>
            {waitingCount>0 && (
              <span style={{background:"linear-gradient(145deg,#c084fc,#7c3aed)",color:"#fff",borderRadius:8,padding:"1px 8px",fontSize:11,fontWeight:700,boxShadow:"0 0 8px rgba(192,132,252,0.5)"}}>
                {waitingCount} очікує
              </span>
            )}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round" style={{transform:queueOpen?"rotate(180deg)":"none",transition:"transform .2s",flexShrink:0}}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          {queueOpen && (
            <div className="expand-body" style={{borderTop:`1px solid ${BORDER}`,padding:"12px 12px 12px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                <StatTile value={cnt("waiting")} label="Очікують"  color={PURPLE}/>
                <StatTile value={cnt("offered")} label="Запрошено" color={GOLD}/>
                <StatTile value={cnt("booked")}  label="Записані"  color={GREEN}/>
              </div>
              {activeQueue.length===0 ? (
                <div style={{textAlign:"center",padding:"22px 0 12px",color:FAINT}}>
                  <div style={{fontSize:30,marginBottom:6}}>⏳</div>
                  <div style={{fontSize:14,fontWeight:700,color:DIM}}>Черга порожня</div>
                  <div style={{fontSize:12,marginTop:4}}>Клієнти стають у чергу самі в застосунку</div>
                </div>
              ) : activeQueue.map((q,i)=>(
                <QCard key={q.id} q={q} pos={i+1} now={now} svc={(svcsMap||SERVICES)[q.svcId]||{}}
                  onInvite={()=>markOffered(q)} onRemove={()=>removeFromQueue(q)}/>
              ))}
            </div>
          )}
        </div>

      </div>

      {queueOffer && <QueueOfferModal cancelledBk={queueOffer.cancelledBk} waiting={queueOffer.waiting} queueMode={queueMode} svcsMap={svcsMap} onInvite={items=>{items.forEach(item=>markOffered(item));setQueueOffer(null);}} onClose={()=>setQueueOffer(null)}/>}
    </>
  );
}
