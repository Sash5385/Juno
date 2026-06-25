import { useState, useEffect, useRef, useMemo, useContext } from "react";
import { ref, onValue, update, push, remove } from "firebase/database";
import { db } from "../firebase";
import { ThemeContext } from "../theme.js";
import { UICss, Card, Bar, Modal, Field, Chip, Btn, StatTile, Section } from "../ui";

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
  const { BORDER, FAINT, TEXT, DIM, GOLD, GREEN, RED, PURPLE, TEAL } = useContext(ThemeContext);

  const STATUS_CFG = {
    waiting:  { label:"Очікує",       color:PURPLE, bg:`${PURPLE}26` },
    offered:  { label:"Запрошено",    color:GOLD,   bg:`${GOLD}26`   },
    booked:   { label:"Записаний",    color:GREEN,  bg:`${GREEN}26`  },
    archived: { label:"Архів",        color:FAINT,  bg:`${FAINT}26`  },
  };

  const svc = (svcMap || SERVICES)[item.svcId] || {};
  const st  = STATUS_CFG[item.status] || STATUS_CFG.waiting;
  const ini = (item.name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const hrs = getHours(item, svc);

  return (
    <Card className={`drag-item fade-in ${isDragging?"dragging":""}`} style={{ marginBottom:8 }}>
      {/* main row */}
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px"}}>
        <Bar color={st.color}/>
        {/* drag handle */}
        <div {...dragHandleProps} style={{cursor:"grab",touchAction:"none",color:FAINT,fontSize:16,flexShrink:0,lineHeight:1}}>
          ⠿
        </div>
        {/* position badge */}
        <div style={{
          width:22,height:22,borderRadius:6,background:`linear-gradient(145deg,${st.color}44,${st.color}22)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:11,fontWeight:900,color:st.color,flexShrink:0,
        }}>{pos}</div>
        {/* avatar */}
        <div className="icon3d" style={{
          width:34,height:34,borderRadius:10,flexShrink:0,
          background:`linear-gradient(145deg,${PURPLE}44,${PURPLE}18)`,
          fontSize:12,fontWeight:900,color:PURPLE,
        }}>{ini}</div>
        {/* info */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
          <div style={{fontSize:10,color:DIM,marginTop:1}}>
            {item.phone}
            {item.slotKey && <> · <span style={{color:GOLD,fontWeight:700}}>{item.slotKey.replace("_"," ")}</span></>}
            {svc.name && <> · <span style={{color:svc.color}}>{svc.name}</span></>}
            {item.studentType && !svc.name && <> · <span style={{color:TEAL}}>{item.studentType==="school"?"Автошкола":"Приватний"}{item.durationHours ? ` ${item.durationHours}г` : ""}</span></>}
            {item.note && <> · <span style={{color:FAINT,fontStyle:"italic"}}>{item.note}</span></>}
          </div>
        </div>
        {/* wait time */}
        <div style={{fontSize:9,color:FAINT,flexShrink:0,textAlign:"right"}}>
          {fmtWait(item.addedAt)}
        </div>
        {/* hours badge */}
        {hrs && (
          <div style={{
            padding:"4px 7px",borderRadius:7,flexShrink:0,
            background:`${GOLD}26`,border:`1px solid ${GOLD}4d`,
            fontSize:11,fontWeight:900,color:GOLD,whiteSpace:"nowrap",
          }}>{hrs} год</div>
        )}
        {/* status chip */}
        <span style={{background:st.bg,color:st.color,padding:"3px 8px",borderRadius:7,fontSize:10,fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>
          {st.label}
        </span>
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
        <div style={{display:"flex",justifyContent:"flex-end",padding:"4px 12px 8px"}}>
          <button onClick={onDelete} style={{background:"none",border:"none",cursor:"pointer",color:RED,fontSize:11,fontWeight:700}}>🗑 Видалити</button>
        </div>
      )}
    </Card>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function QueueView({ settings }) {
  const { DIM, FAINT, GOLD, GREEN, PURPLE, BLUE, ACCENT, TEAL } = useContext(ThemeContext);
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

  const active   = all.filter(q => q.status !== "archived");
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
          <StatTile value={waiting}  label="Очікують"  color={PURPLE}/>
          <StatTile value={offered}  label="Запрошено" color={GOLD}/>
          <StatTile value={booked_c} label="Записані"  color={GREEN}/>
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
