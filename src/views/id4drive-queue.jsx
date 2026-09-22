import { useState, useEffect, useRef, useMemo, useContext } from "react";
import { ref, onValue, update, push, remove } from "firebase/database";
import { db } from "../firebase";
import { ThemeContext } from "../theme.js";
import { UICss, Modal, Field, Chip, Btn, Section, useFX } from "../ui";

const SERVICES = {
  sv1:{ name:"Автошкола 1г", color:"#7ed957"  },
  sv2:{ name:"Автошкола 2г", color:"#7ed957"  },
  sv3:{ name:"Приватний 1г", color:"#f7c948"  },
  sv4:{ name:"Приватний 2г", color:"#f7c948"  },
};

function fmtWait(ts) {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins} хв`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} год` : `${Math.floor(h/24)} дн`;
}

// slotKey формату `${YYYY-MM-DD}_${H:MM}` (див. webID4client/src/firebase/db.js joinQueue)
function isSlotPast(slotKey) {
  if (!slotKey) return false;
  const [datePart, timePart] = slotKey.split("_");
  if (!datePart || !timePart) return false;
  const [h, m] = timePart.split(":").map(Number);
  const dt = new Date(datePart);
  if (isNaN(dt.getTime())) return false;
  dt.setHours(h||0, m||0, 0, 0);
  return dt.getTime() < Date.now();
}

// ─── DRAG REORDER ────────────────────────────────────────────────
function useDragReorder(items, onReorder) {
  const dragIdx  = useRef(null);
  const overIdx  = useRef(null);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const getHandlers = (idx) => ({
    onPointerDown: (e) => { e.stopPropagation(); dragIdx.current = idx; overIdx.current = idx; },
    onPointerMove: (e) => {
      if (dragIdx.current === null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest("[data-drag-idx]");
      if (card) {
        const newIdx = parseInt(card.dataset.dragIdx);
        if (newIdx !== overIdx.current) {
          const arr = [...itemsRef.current];
          const [moved] = arr.splice(dragIdx.current, 1);
          arr.splice(newIdx, 0, moved);
          dragIdx.current  = newIdx;
          overIdx.current  = newIdx;
          itemsRef.current = arr;
          onReorder(arr);
        }
      }
    },
    onPointerUp: () => { dragIdx.current = null; overIdx.current = null; },
  });
  return { getHandlers };
}

// ─── ADD TO QUEUE MODAL ──────────────────────────────────────────
function AddModal({ onSave, onClose }) {
  const { PURPLE, FAINT } = useContext(ThemeContext);
  const [form, setForm] = useState({ name:"", phone:"", svcId:"sv1", note:"" });
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));
  const valid = form.name.trim() && form.phone.trim();
  return (
    <Modal open onClose={onClose} sheet size="lg" title="⏳ Додати до черги"
      footer={<>
        <Btn variant="ghost" flex={1} onClick={onClose}>Скасувати</Btn>
        <Btn variant="primary" accent={PURPLE} flex={1} disabled={!valid} onClick={()=>valid&&onSave(form)}>Додати до черги</Btn>
      </>}>
      <Field label="Ім'я учня" value={form.name}  onChange={v=>upd("name",v)}  placeholder="Ім'я Прізвище"/>
      <Field label="Телефон"   value={form.phone} onChange={v=>upd("phone",v)} placeholder="+380..."/>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:6}}>ПОСЛУГА</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.entries(SERVICES).map(([id,s])=>(
            <Chip key={id} active={form.svcId===id} color={s.color} onClick={()=>upd("svcId",id)}>{s.name}</Chip>
          ))}
        </div>
      </div>
      <Field label="Нотатка" value={form.note} onChange={v=>upd("note",v)} placeholder="Побажання, зручний час…"/>
    </Modal>
  );
}

// ─── QUEUE ITEM ROW ──────────────────────────────────────────────
function getHours(item, svc) {
  if (item.durationHours) return item.durationHours;
  const m = (svc.name || "").match(/(\d+)г/);
  return m ? parseInt(m[1]) : null;
}

function QueueRow({ item, pos, onInvite, onBooked, onArchive, onDelete, dragHandleProps, isDragging, svcMap }) {
  const { BORDER, FAINT, GOLD, GREEN, PURPLE, RED, BG_DEEP } = useContext(ThemeContext);
  const { shade, glow } = useFX();

  const STATUS_CFG = {
    waiting:  { label:"Очікує",    color:PURPLE },
    offered:  { label:"Запрошено", color:GOLD   },
    booked:   { label:"Записаний", color:GREEN  },
    archived: { label:"Архів",     color:FAINT  },
  };

  const svc = (svcMap || SERVICES)[item.svcId] || {};
  const st  = STATUS_CFG[item.status] || STATUS_CFG.waiting;
  const hrs = getHours(item, svc);
  const svcLabel = svc.name || (item.studentType && (item.studentType==="school"?"Автошкола":"Приватний"));
  const initials = (item.name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();

  return (
    <div className={`drag-item fade-in ${isDragging?"dragging":""}`} style={{
      position:"relative", borderRadius:14, marginBottom:8, overflow:"hidden",
      background:`linear-gradient(155deg,color-mix(in srgb,${st.color} 50%,${BG_DEEP}) 0%,color-mix(in srgb,${st.color} 18%,${BG_DEEP}) 100%)`,
      border:`1px solid color-mix(in srgb,${st.color} 45%,transparent)`,
      boxShadow:`-2px 5px 13px ${shade(0.45)},inset 1px 1px 0 ${glow(0.15)}`,
    }}>
      <div style={{position:"absolute",pointerEvents:"none",top:0,right:"6%",width:"55%",height:"45%",zIndex:1,
        background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.18) 0%,transparent 65%)"}}/>

      {/* avatar info row */}
      <div {...dragHandleProps} style={{position:"relative",zIndex:2,display:"flex",alignItems:"center",gap:10,padding:"9px 11px",cursor:"grab",touchAction:"none"}}>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{
            width:36,height:36,borderRadius:11,
            background:`linear-gradient(155deg,${st.color},color-mix(in srgb,${st.color} 40%,#000))`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:13,fontWeight:900,color:"#fff",
            boxShadow:`-2px 3px 8px color-mix(in srgb,${st.color} 40%,transparent)`,
          }}>{initials}</div>
          <div style={{
            position:"absolute",top:-5,left:-5,width:15,height:15,borderRadius:5,
            background:BG_DEEP,color:st.color,fontSize:8.5,fontWeight:900,
            display:"flex",alignItems:"center",justifyContent:"center",
            border:`1px solid color-mix(in srgb,${st.color} 45%,transparent)`,
          }}>{pos}</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:"#fff",textShadow:`0 1px 3px ${shade(0.5)}`,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</div>
          <div style={{fontSize:10,color:FAINT,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {item.phone}
            {svcLabel && ` · ${svcLabel}${hrs ? ` ${hrs}г` : ""}`}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:9.5,fontWeight:800,color:st.color}}>{st.label}</div>
          <div style={{fontSize:9.5,color:FAINT,marginTop:2}}>{fmtWait(item.addedAt)}</div>
        </div>
      </div>

      {/* actions row */}
      {item.status !== "archived" && (
        <div style={{display:"grid",gridTemplateColumns:`repeat(${item.status==="waiting"?4:item.status==="offered"?3:2},1fr)`,borderTop:`1px solid ${BORDER}`}}>
          {item.status === "waiting" && (
            <button onClick={onInvite} style={{padding:"8px 0",border:"none",borderRight:`1px solid ${BORDER}`,cursor:"pointer",background:"transparent",color:PURPLE,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
              <div className="icon3d" style={{width:22,height:22,background:"linear-gradient(165deg,#c084fc,#7c3aed)",borderRadius:7}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{position:"relative",zIndex:1}}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
              Запросити
            </button>
          )}
          {(item.status === "waiting" || item.status === "offered") && (
            <button onClick={onBooked} style={{padding:"8px 0",border:"none",borderRight:`1px solid ${BORDER}`,cursor:"pointer",background:"transparent",color:GREEN,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
              <div className="icon3d" style={{width:22,height:22,background:"linear-gradient(165deg,#9ee07a,#5fb83d)",borderRadius:7}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" style={{position:"relative",zIndex:1}}><polyline points="5 12 10 17 19 8"/></svg>
              </div>
              Записаний
            </button>
          )}
          <button onClick={onArchive} style={{padding:"8px 0",border:"none",borderRight:`1px solid ${BORDER}`,cursor:"pointer",background:"transparent",color:FAINT,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <div className="icon3d" style={{width:22,height:22,background:`linear-gradient(165deg,#5a5e66,#3a3e44)`,borderRadius:7}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" style={{position:"relative",zIndex:1}}><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            </div>
            Архів
          </button>
          <button onClick={onDelete} style={{padding:"8px 0",border:"none",cursor:"pointer",background:"transparent",color:`${RED}cc`,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <div className="icon3d" style={{width:22,height:22,background:`linear-gradient(165deg,#f87171,#dc2626)`,borderRadius:7}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{position:"relative",zIndex:1}}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </div>
            Відмінити
          </button>
        </div>
      )}
      {item.status === "archived" && (
        <div style={{display:"flex",justifyContent:"flex-end",padding:"4px 10px 7px",borderTop:`1px solid ${BORDER}`}}>
          <button onClick={onDelete} style={{background:"none",border:"none",cursor:"pointer",color:RED,fontSize:11,fontWeight:700}}>🗑 Видалити</button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function QueueView({ settings }) {
  const { DIM, FAINT, GOLD, GREEN, PURPLE, BLUE, ACCENT, TEAL, BG_DEEP } = useContext(ThemeContext);
  const [all,       setAll]       = useState([]);
  const [showAdd,   setShowAdd]   = useState(false);

  const colorIdMap = useMemo(() => ({
    green: GREEN, yellow: GOLD, blue: BLUE, purple: PURPLE,
    teal: TEAL, red: "#ff5a3c", pink: "#f472b6", orange: "#fb923c",
  }), [GREEN, GOLD, BLUE, PURPLE, TEAL]);

  const svcMap = useMemo(() => {
    const m = { ...SERVICES };
    (settings?.services || []).forEach(s => {
      if (s?.id) m[s.id] = { name: s.name, color: colorIdMap[s.colorId] || s.colorId };
    });
    return m;
  }, [settings?.services, colorIdMap]);

  // Firebase sync — підтримує і клієнтську структуру queue/${slotKey}/entries/${uid}
  useEffect(() => {
    return onValue(ref(db, "queue"), snap => {
      const d = snap.val();
      if (!d) { setAll([]); return; }
      const entries = [];
      Object.entries(d).forEach(([key, val]) => {
        if (val?.entries) {
          // Клієнтська структура: queue/${slotKey}/entries/${uid}
          Object.entries(val.entries).forEach(([uid, e]) => {
            entries.push({ id: `${key}/entries/${uid}`, slotKey: key, uid, ...e });
          });
        } else if (val && typeof val === "object" && !Array.isArray(val)) {
          // Стара плоска структура (ручне додавання адміном)
          entries.push({ id: key, ...val });
        }
      });
      entries.sort((a,b) => (a.order ?? a.addedAt ?? 0) - (b.order ?? b.addedAt ?? 0));
      setAll(entries);
    }, ()=>{});
  }, []);

  // drag reorder
  const { getHandlers } = useDragReorder(all, newArr => {
    setAll(newArr);
    newArr.forEach((item,i) => update(ref(db,`queue/${item.id}`),{order:i}));
  });

  const isExpired = q => q.status === "waiting" && isSlotPast(q.slotKey);
  const active   = all.filter(q => q.status !== "archived" && !isExpired(q));
  const expired  = all.filter(q => q.status !== "archived" && isExpired(q));
  const archived = all.filter(q => q.status === "archived");

  const setStatus = (id, status) => update(ref(db,`queue/${id}`),{status});
  const invite    = id => setStatus(id,"offered");
  const booked    = id => setStatus(id,"booked");
  const archive   = id => setStatus(id,"archived");
  const del       = id => remove(ref(db,`queue/${id}`));
  const add       = form => push(ref(db,"queue"),{...form,addedAt:Date.now(),status:"waiting",order:all.length});

  const queueMode = settings?.queueAutoFifo ? "fifo"
    : settings?.queueBroadcast ? "broadcast" : "manual";

  const waiting  = active.filter(q=>q.status==="waiting").length;
  const offered  = active.filter(q=>q.status==="offered").length;
  const booked_c = active.filter(q=>q.status==="booked").length;

  return (
    <>
      <UICss/>
      <div style={{display:"flex",flexDirection:"column",gap:10,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif"}}>

        {/* ── STATS ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[
            {value:waiting,  label:"Очікують",  color:PURPLE},
            {value:offered,  label:"Запрошено", color:GOLD},
            {value:booked_c, label:"Записані",  color:GREEN},
          ].map((s,i)=>(
            <div key={i} style={{
              borderRadius:11, padding:"10px 6px", textAlign:"center",
              background:`linear-gradient(155deg,color-mix(in srgb,${s.color} 22%,${BG_DEEP}),color-mix(in srgb,${s.color} 6%,${BG_DEEP}))`,
              border:`1px solid color-mix(in srgb,${s.color} 32%,transparent)`,
            }}>
              <div style={{fontSize:18,fontWeight:900,color:"#fff"}}>{s.value}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.6)",marginTop:2,letterSpacing:0.5}}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* ── MODE BADGE ── */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:`linear-gradient(145deg,${PURPLE}1a,${PURPLE}0d)`,borderRadius:10,border:`1px solid ${PURPLE}30`}}>
          <span style={{fontSize:13}}>⚙️</span>
          <span style={{fontSize:12,color:DIM}}>Режим черги:</span>
          <span style={{fontSize:12,fontWeight:800,color:PURPLE}}>
            {queueMode==="fifo"?"FIFO — перший автоматично":queueMode==="broadcast"?"Broadcast — всім одразу":"Ручний — вибір вручну"}
          </span>
        </div>

        {/* ── ACTIVE QUEUE ── */}
        <div
          onPointerMove={e=>getHandlers(0).onPointerMove(e)}
          onPointerUp={()=>getHandlers(0).onPointerUp()}
        >
          {active.length === 0 ? (
            <div style={{textAlign:"center",padding:"32px 20px",color:FAINT}}>
              <div style={{fontSize:32,marginBottom:8}}>⏳</div>
              <div style={{fontSize:14,fontWeight:700,color:DIM}}>Черга порожня</div>
              <div style={{fontSize:12,marginTop:4}}>Додайте учнів нижче</div>
            </div>
          ) : active.map((item, idx) => (
            <div key={item.id} data-drag-idx={idx}>
              <QueueRow
                item={item}
                pos={idx+1}
                isDragging={false}
                svcMap={svcMap}
                onInvite={()=>invite(item.id)}
                onBooked={()=>booked(item.id)}
                onArchive={()=>archive(item.id)}
                onDelete={()=>del(item.id)}
                dragHandleProps={getHandlers(idx)}
              />
            </div>
          ))}
        </div>

        {/* ── ADD BUTTON ── */}
        <Btn variant="primary" accent={PURPLE} onClick={()=>setShowAdd(true)} style={{width:"100%"}}>
          <div className="icon3d" style={{width:26,height:26,background:`${PURPLE}33`,borderRadius:8}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" style={{position:"relative",zIndex:1}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          Додати до черги
        </Btn>

        {/* ── МИНУЛІ (час слота вже пройшов) ── */}
        {expired.length > 0 && (
          <Section title={`⏱ Минулі (${expired.length})`}>
            {expired.map(item=>(
              <QueueRow
                key={item.id} item={item} pos="—" isDragging={false}
                svcMap={svcMap}
                onInvite={()=>invite(item.id)}
                onBooked={()=>booked(item.id)}
                onArchive={()=>archive(item.id)}
                onDelete={()=>del(item.id)}
                dragHandleProps={{}}
              />
            ))}
          </Section>
        )}

        {/* ── ARCHIVE ── */}
        {archived.length > 0 && (
          <Section title={`📦 Архів (${archived.length})`}>
            {archived.map(item=>(
              <QueueRow
                key={item.id} item={item} pos="—" isDragging={false}
                svcMap={svcMap}
                onInvite={()=>{}} onBooked={()=>{}} onArchive={()=>{}}
                onDelete={()=>del(item.id)}
                dragHandleProps={{}}
              />
            ))}
          </Section>
        )}

      </div>

      {showAdd && <AddModal onSave={form=>{add(form);setShowAdd(false);}} onClose={()=>setShowAdd(false)}/>}
    </>
  );
}
