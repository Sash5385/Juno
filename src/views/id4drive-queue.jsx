import { useState, useEffect, useMemo, useContext } from "react";
import { MetalIcon } from "../MetalIcon";
import { onValue, update, remove } from "firebase/database";
import { useConfirm } from "../ConfirmModal";
import { iRef, auth } from "../firebase";
import { ThemeContext } from "../theme.js";
import { UICss, Section, ScrollChips } from "../ui";
import { normStaff } from "../workspace";

const SERVICES = {
  sv1:{ name:"Стандарт 1г", color:"#7ed957"  },
  sv2:{ name:"Стандарт 2г", color:"#7ed957"  },
  sv3:{ name:"Індивідуальний 1г", color:"#f7c948"  },
  sv4:{ name:"Індивідуальний 2г", color:"#f7c948"  },
};

function fmtWait(ts) {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins} хв`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} год` : `${Math.floor(h/24)} дн`;
}

// slotKey формату `${YYYY-MM-DD}_${H:MM}` (див. webID4client/src/firebase/iRef.js joinQueue)
function isSlotPast(slotKey) {
  if (!slotKey) return false;
  const [datePart, timePart] = String(slotKey).split("~").pop().split("_"); // у календарі майстра ключ має префікс «{masterId}~»
  if (!datePart || !timePart) return false;
  const [h, m] = timePart.split(":").map(Number);
  const dt = new Date(datePart);
  if (isNaN(dt.getTime())) return false;
  dt.setHours(h||0, m||0, 0, 0);
  return dt.getTime() < Date.now();
}

// ─── ДОПОМІЖНЕ ───────────────────────────────────────────────────
const OFFER_MS = 30 * 60 * 1000; // запрошення діє 30 хв (OFFER_WINDOW_MS на сервері)
const parseKey = (slotKey) => {
  const k = String(slotKey || "");
  const i = k.indexOf("~");
  const rest = i > 0 ? k.slice(i + 1) : k;
  const [date, time] = rest.split("_");
  return { master: i > 0 ? k.slice(0, i) : null, date: date || "", time: time || "" };
};
const DOW = ["нд","пн","вт","ср","чт","пт","сб"];
const slotTitle = (date, time) => {
  if (!date) return "Без дати";
  const d = new Date(`${date}T12:00:00`);
  return `${DOW[d.getDay()]} ${date.slice(8,10)}.${date.slice(5,7)} · ${time}`;
};
const navTo = tab => window.dispatchEvent(new CustomEvent("id4drive-nav", { detail: tab }));

// ─── РЯДОК ОЧІКУВАЧА У ГРУПІ СЛОТА ───────────────────────────────
function QueueRow({ item, pos, first, now, svcLabel, onInvite, onReinvite, onCancelInvite, onBooked, onDelete }) {
  const { BORDER, DIM, FAINT, GOLD, GREEN, TEXT, ACC_HI, ACCENT, BTN_TX } = useContext(ThemeContext);
  const offered = item.status === "offered";
  const left = offered && item.offeredAt ? item.offeredAt + OFFER_MS - now : null;
  const btn = (primary) => ({ padding:"7px 11px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, whiteSpace:"nowrap",
    border: primary ? "none" : `1px solid ${BORDER}`, background: primary ? `linear-gradient(145deg,${ACC_HI},${ACCENT})` : "transparent", color: primary ? (BTN_TX || "#fff") : TEXT });
  const icon = { width:32, height:32, borderRadius:10, border:`1px solid ${BORDER}`, background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 };
  return (
    <div style={{ padding:"9px 0", borderTop:pos > 1 ? `1px solid ${BORDER}` : "none" }}>
      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
        <span style={{ width:22, height:22, borderRadius:7, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11.5, fontWeight:900,
          background: first ? `color-mix(in srgb,${GOLD} 30%,transparent)` : "rgba(127,127,127,0.15)", color: first ? GOLD : DIM }}>{pos}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:TEXT, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name || "Клієнт"}</div>
          <div style={{ fontSize:11.5, color:DIM, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {item.phone ? <a href={`tel:${String(item.phone).replace(/[^\d+]/g, "")}`} style={{ color:DIM }}>{item.phone}</a> : null}
            {svcLabel ? `${item.phone ? " · " : ""}${svcLabel}` : ""}
          </div>
          <div style={{ fontSize:11.5, marginTop:2, color: offered ? GOLD : FAINT, fontWeight: offered ? 700 : 500 }}>
            {offered
              ? (left > 0 ? `Запрошено · ще ${Math.ceil(left / 60000)} хв на відповідь` : "Запрошено · час відповіді вийшов")
              : `чекає ${fmtWait(item.addedAt)}`}
          </div>
        </div>
        <button aria-label="Записаний" title="Позначити: записаний" onClick={onBooked} style={icon}><MetalIcon name="checkCircle" size={20}/></button>
        <button aria-label="Видалити з черги" title="Видалити з черги" onClick={onDelete} style={icon}><MetalIcon name="trash" size={20}/></button>
      </div>
      <div style={{ display:"flex", gap:6, marginTop:7, marginLeft:31 }}>
        {!offered && <button onClick={onInvite} style={btn(first)}>Запросити</button>}
        {offered && <button onClick={onReinvite} style={btn(true)}>Запросити ще раз</button>}
        {offered && <button onClick={onCancelInvite} style={btn(false)}>Скасувати запрошення</button>}
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function QueueView({ settings }) {
  const { DIM, FAINT, GOLD, GREEN, PURPLE, BLUE, TEAL, ACCENT, BORDER, SURFACE, TEXT, RED } = useContext(ThemeContext);
  const [confirm, confirmNode] = useConfirm();
  const [all,       setAll]       = useState([]);
  const [staff,     setStaff]     = useState([]);   // салон: склад майстрів
  const [masterFilter, setMasterFilter] = useState(""); // "" — усі майстри
  const [slotState, setSlotState] = useState({}); // `${root}/${date}` → { slotHHMM: slot }
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const owner = auth.currentUser?.uid || "";
    return onValue(iRef("staff"), snap => setStaff(snap.exists() ? normStaff(snap.val(), owner) : []), () => {});
  }, []);
  const isSalonQ = staff.length > 1;
  const ownerUid = (staff.find(m => m.owner) || {}).id || auth.currentUser?.uid || "";
  const masterIdOf = q => parseKey(q.slotKey).master || (typeof q.masterId === "string" && q.masterId) || ownerUid;
  const masterById = id => staff.find(m => m.id === id);

  const colorIdMap = useMemo(() => ({
    green: GREEN, yellow: GOLD, blue: BLUE, purple: PURPLE,
    teal: TEAL, red: "#ff5a3c", pink: "#f472b6", orange: "#fb923c",
  }), [GREEN, GOLD, BLUE, PURPLE, TEAL]);
  const svcMap = useMemo(() => {
    const m = { ...SERVICES };
    (settings?.services || []).forEach(s => { if (s?.id) m[s.id] = { name: s.name, color: colorIdMap[s.colorId] || s.colorId }; });
    return m;
  }, [settings?.services, colorIdMap]);

  // Firebase sync — клієнтська структура queue/${slotKey}/entries/${uid} і стара плоска
  useEffect(() => {
    return onValue(iRef("queue"), snap => {
      const d = snap.val();
      if (!d) { setAll([]); return; }
      const entries = [];
      Object.entries(d).forEach(([key, val]) => {
        if (val?.entries) Object.entries(val.entries).forEach(([uid, e]) => entries.push({ id: `${key}/entries/${uid}`, slotKey: key, uid, ...e }));
        else if (val && typeof val === "object" && !Array.isArray(val)) entries.push({ id: key, ...val });
      });
      entries.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)); // як на сервері: хто раніше став — той перший
      setAll(entries);
    }, () => {});
  }, []);

  const isExpired = q => (q.status === "waiting" || q.status === "offered") && isSlotPast(q.slotKey);
  const shown    = isSalonQ && masterFilter ? all.filter(q => masterIdOf(q) === masterFilter) : all;
  const active   = shown.filter(q => (q.status === "waiting" || q.status === "offered") && !isExpired(q));
  const expired  = shown.filter(q => isExpired(q));
  const archived = shown.filter(q => q.status === "archived" || q.status === "booked");

  // Стан слотів (вільний / зайнятий) для дат, на які є черга
  const slotDates = useMemo(() => [...new Set(active.map(q => { const k = parseKey(q.slotKey); const mid = k.master && k.master !== ownerUid ? k.master : null; return k.date ? `${mid ? `timeslots_m/${mid}` : "timeslots"}/${k.date}` : null; }).filter(Boolean))].sort().join("|"), [active, ownerUid]);
  useEffect(() => {
    const paths = slotDates ? slotDates.split("|") : [];
    const offs = paths.map(p => onValue(iRef(p), snap => setSlotState(prev => ({ ...prev, [p]: snap.val() || {} })), () => {}));
    return () => offs.forEach(f => f && f());
  }, [slotDates]);
  const slotFree = (slotKey) => {
    const k = parseKey(slotKey);
    const mid = k.master && k.master !== ownerUid ? k.master : null;
    const day = slotState[`${mid ? `timeslots_m/${mid}` : "timeslots"}/${k.date}`];
    if (!day) return null;
    const sl = day[`slot${String(k.time).replace(":", "")}`];
    return sl ? !!sl.available : false;
  };

  const groups = useMemo(() => {
    const m = new Map();
    active.forEach(q => { const key = q.slotKey || q.id; if (!m.has(key)) m.set(key, []); m.get(key).push(q); });
    return [...m.entries()].map(([key, items]) => ({ key, ...parseKey(key), items })).sort((a, b) => `${a.date}${a.time.padStart(5, "0")}`.localeCompare(`${b.date}${b.time.padStart(5, "0")}`));
  }, [active]);

  const setSt = (id, p) => update(iRef(`queue/${id}`), p);
  const invite   = id => setSt(id, { status:"offered", offeredAt: Date.now() });
  // Повторне запрошення: сервер реагує на перехід у «offered», тож спершу повертаємо «waiting»
  const reinvite = async id => { await setSt(id, { status:"waiting" }); await setSt(id, { status:"offered", offeredAt: Date.now() }); };
  const cancelInvite = id => setSt(id, { status:"waiting", offeredAt: null });
  const booked   = id => setSt(id, { status:"booked" });
  const archive  = id => setSt(id, { status:"archived" });
  const del = async (item) => {
    if (await confirm({ title:"Видалити з черги?", text:`${item.name || "Клієнт"} більше не чекатиме на цей час.`, okLabel:"Видалити", danger:true })) remove(iRef(`queue/${item.id}`));
  };
  const archiveAllExpired = () => expired.forEach(q => archive(q.id));

  const queueMode = settings?.queueAutoFifo ? "fifo" : settings?.queueBroadcast ? "broadcast" : "manual";
  const modeLabel = queueMode === "fifo" ? "Автоматично — першому в черзі" : queueMode === "broadcast" ? "Розсилка — усім одразу" : "Вручну — ви обираєте кого запросити";
  const waiting = active.filter(q => q.status === "waiting").length;
  const offered = active.filter(q => q.status === "offered").length;
  const card = { borderRadius:16, padding:"11px 13px", background:SURFACE, border:`1px solid ${BORDER}`, backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)" };
  const svcLabelOf = q => { const sv = svcMap[q.svcId]; const h = q.durationHours; return sv?.name || (q.studentType ? (q.studentType === "school" ? "Стандарт" : "Індивідуальний") + (h ? ` ${h} год` : "") : (h ? `${h} год` : "")); };

  return (
    <>
      <UICss/>
      {confirmNode}
      <div style={{display:"flex",flexDirection:"column",gap:10,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── САЛОН: фільтр по майстру ── */}
        {isSalonQ && (
          <ScrollChips activeKey={masterFilter}>
            {[{ id:"", name:"Усі майстри", color:ACCENT }, ...staff].map(m => {
              const on = masterFilter === m.id;
              return (
                <button key={m.id || "all"} onClick={()=>setMasterFilter(m.id)} style={{
                  flex:"1 0 auto",justifyContent:"center",display:"flex",alignItems:"center",gap:7,padding:"8px 13px",borderRadius:99,cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:600,whiteSpace:"nowrap",
                  border:`1px solid ${on ? m.color : BORDER}`,background:on?`color-mix(in srgb,${m.color} 26%,transparent)`:SURFACE,color:on?TEXT:DIM,
                }}>
                  {m.id && <span style={{width:10,height:10,borderRadius:"50%",background:m.color}}/>}{m.name}
                </button>
              );
            })}
          </ScrollChips>
        )}

        {/* ── РЕЖИМ + ПІДСУМОК ── */}
        <button onClick={()=>navTo("settings")} style={{...card,display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontFamily:"inherit",textAlign:"left",color:TEXT}}>
          <MetalIcon name="hourglass" size={30}/>
          <span style={{flex:1,minWidth:0}}>
            <span style={{display:"block",fontSize:13.5,fontWeight:700}}>{modeLabel}</span>
            <span style={{display:"block",fontSize:11.5,color:DIM,marginTop:2}}>{`${waiting} чекають · ${offered} запрошено · змінити режим ›`}</span>
          </span>
        </button>

        {/* ── ГРУПИ ЗА СЛОТАМИ ── */}
        {groups.length === 0 ? (
          <div style={{textAlign:"center",padding:"32px 20px",color:FAINT}}>
            <div style={{marginBottom:8,display:"flex",justifyContent:"center"}}><MetalIcon name="hourglass" size={36}/></div>
            <div style={{fontSize:14,fontWeight:700,color:DIM}}>Черга порожня</div>
            <div style={{fontSize:12,marginTop:4}}>Клієнти стають у чергу на зайнятий час у своєму додатку</div>
          </div>
        ) : groups.map(g => {
          const free = slotFree(g.key);
          const m = isSalonQ ? masterById(g.master || ownerUid) : null;
          return (
            <div key={g.key} style={card}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:14.5,fontWeight:800,color:TEXT}}>{slotTitle(g.date, g.time)}</span>
                {m && <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,color:DIM,minWidth:0}}><span style={{width:8,height:8,borderRadius:"50%",background:m.color,flexShrink:0}}/><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span></span>}
                <span style={{marginLeft:"auto",fontSize:11,fontWeight:800,padding:"3px 8px",borderRadius:99,whiteSpace:"nowrap",
                  background: free ? `color-mix(in srgb,${GREEN} 22%,transparent)` : "rgba(127,127,127,0.15)", color: free ? GREEN : DIM }}>
                  {free === null ? "…" : free ? "● вільний" : "зайнято"}
                </span>
              </div>
              <div style={{fontSize:11.5,color:FAINT,marginBottom:2}}>{`У черзі: ${g.items.length}`}</div>
              {g.items.map((q, idx) => (
                <QueueRow key={q.id} item={q} pos={idx + 1} first={idx === 0} now={now} svcLabel={svcLabelOf(q)}
                  onInvite={()=>invite(q.id)} onReinvite={()=>reinvite(q.id)} onCancelInvite={()=>cancelInvite(q.id)}
                  onBooked={()=>booked(q.id)} onDelete={()=>del(q)}/>
              ))}
            </div>
          );
        })}

        {/* ── МИНУЛІ (час слота вже пройшов) ── */}
        {expired.length > 0 && (
          <Section title={<span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="timer" size={18}/>{`Минулі (${expired.length})`}</span>}>
            <button onClick={archiveAllExpired} style={{width:"100%",padding:"9px",borderRadius:12,border:`1px dashed ${BORDER}`,background:"transparent",color:DIM,fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>Прибрати всі в архів</button>
            {expired.map(q => (
              <div key={q.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderTop:`1px solid ${BORDER}`,fontSize:12.5}}>
                <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:TEXT}}>{q.name || "Клієнт"}</span>
                <span style={{color:FAINT,whiteSpace:"nowrap"}}>{slotTitle(parseKey(q.slotKey).date, parseKey(q.slotKey).time)}</span>
              </div>
            ))}
          </Section>
        )}

        {/* ── АРХІВ ── */}
        {archived.length > 0 && (
          <Section title={<span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="list" size={18}/>{`Архів (${archived.length})`}</span>}>
            {archived.map(q => (
              <div key={q.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderTop:`1px solid ${BORDER}`,fontSize:12.5}}>
                <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:TEXT}}>{q.name || "Клієнт"}</span>
                <span style={{color:q.status==="booked"?GREEN:FAINT,whiteSpace:"nowrap"}}>{q.status==="booked" ? "записаний" : slotTitle(parseKey(q.slotKey).date, parseKey(q.slotKey).time)}</span>
                <button aria-label="Видалити" onClick={()=>remove(iRef(`queue/${q.id}`))} style={{background:"none",border:"none",cursor:"pointer",color:RED,fontSize:18,padding:"0 4px"}}>×</button>
              </div>
            ))}
          </Section>
        )}
      </div>
    </>
  );
}
