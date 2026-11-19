// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useState, useEffect, useMemo, useContext } from "react";
import PhoneField from "../../PhoneField.jsx";
import { MetalIcon } from "../../MetalIcon";
import { update, onValue, off } from "firebase/database";
import { iRef, auth, getActiveMaster } from "../../firebase";
import { normStaff } from "../../workspace";
import { normPackages, pickPackage } from "../../packages";
import { isGroupService, capacityOf, groupKeyOf } from "../../groups";
import { normAddons, bufferOf, bookingAddonTotals, pickAddons, addonsTotals, addonsSnapshot, addonsLabel } from "../../addons";
import { ThemeContext, GREEN, BLUE, PURPLE, GOLD } from "../../theme.js";
import { useBackClose } from "../../ui";
import FogScope from "../../FogScope";
import { isSalon } from "../../workspace.js";
import { TAG_PRESETS, AUTO_TAG_IDS } from "../../tags";
import { TagIcon } from "../../TagIcon";
import { cur as curSym, money } from "../../currency";
import { knownTag, _DLABELS, _DLABELS_FULL, _MLABELS, getDayInfo, fmtTime, colorOf, computeBookingPrice } from "./shared.jsx";

const BookingModalFog = (p) => <FogScope><BookingModal {...p}/></FogScope>;
const NewBookingModalFog = (p) => <FogScope><NewBookingModal {...p}/></FogScope>;

// Вибір тривалості: пігулки + «−/+» (крок 15 хв) для довільного значення
function DurPicker({ value, onChange, dark, min = 15, max = 480 }) {
  const { SURF_LO, DIM, SO } = useContext(ThemeContext);
  const PRESETS = [30, 45, 60, 90, 120];
  const set = (v) => onChange(Math.min(max, Math.max(min, v)));
  const pill = (active) => ({
    flex:"1 1 auto", minWidth:44, padding:"9px 6px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit",
    textAlign:"center", fontSize:13, fontWeight:active?800:500, transition:"all .12s",
    background: active ? (dark ? GREEN : "linear-gradient(165deg,#2f6fe0,#1d4ed8)") : (dark ? "rgba(0,0,0,0.22)" : SURF_LO),
    color: active ? (dark ? "#0a0d0a" : "#fff") : (dark ? "rgba(255,255,255,.75)" : DIM),
    boxShadow: active ? (dark ? "none" : `0 4px 12px ${BLUE}55`) : (dark ? "none" : SO),
  });
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
      <button type="button" onClick={()=>set(value - 15)} aria-label="Мінус 15 хвилин" style={{...pill(false),flex:"0 0 auto",minWidth:40,fontSize:16,fontWeight:800}}>−</button>
      {PRESETS.map(m => (
        <button type="button" key={m} onClick={()=>set(m)} style={pill(value === m)}>{m}</button>
      ))}
      <button type="button" onClick={()=>set(value + 15)} aria-label="Плюс 15 хвилин" style={{...pill(false),flex:"0 0 auto",minWidth:40,fontSize:16,fontWeight:800}}>+</button>
      {!PRESETS.includes(value) && (
        <div style={{...pill(true),flex:"0 0 auto",cursor:"default"}}>{value} {"хв"}</div>
      )}
    </div>
  );
}

function BookingModal({ booking, onClose, onAction, settings, bookings, onViewStudent, mergeInfo, autoTag }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const [queueEntries, setQueueEntries] = useState([]);
  const [closing, setClosing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draftPrice, setDraftPrice] = useState("");
  const [draftDur, setDraftDur] = useState("");
  const [editRate, setEditRate] = useState(0);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [debtInput, setDebtInput] = useState("");
  useEffect(() => { setDebtInput(booking?.debtAmount ? String(booking.debtAmount) : ""); }, [booking?.id]);
  useEffect(() => {
    if (!booking) return;
    setClosing(false);
    setEditOpen(false);
    const dateStr = booking.date || (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() + booking.day);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const hh = String(Math.floor(booking.startMin/60)).padStart(2,'0');
    const mm = String(booking.startMin%60).padStart(2,'0');
    const slotKey = `${dateStr}_${hh}:${mm}`;
    const r = iRef( `queue/${slotKey}/entries`);
    const unsub = onValue(r, snap => {
      if (!snap.exists()) { setQueueEntries([]); return; }
      const entries = Object.values(snap.val())
        .filter(e => e.status === 'waiting')
        .sort((a,b) => (a.addedAt||0) - (b.addedAt||0));
      setQueueEntries(entries);
    });
    return () => unsub();
  }, [booking]);

  useEffect(() => {
    if (!booking) return;
    setTagPickerOpen(false);
  }, [booking]);

  // booking може стати null синхронно (напр. cancel обнуляє вибір), поки closing=true.
  // Guard "!booking && !closing" пропускав такий кадр далі й падав на booking.serviceId
  // (сірий екран). Достатньо: немає booking — нічого не рендеримо. Анімацію закриття це
  // не ламає — при звичайному закритті booking лишається до кінця анімації (onClose на animationEnd).
  useBackClose(!!booking, () => setClosing(true)); // системна «назад» закриває вікно, а не застосунок (до раннього return — порядок хуків)
  if (!booking) return null;

  // Минулий запис при увімкненому settings.lockPastBookings — заборонено
  // редагувати ціну/тривалість і скасовувати (перенос теж заблокований —
  // окремо, на рівні drag у ScheduleView).
  const isPastLocked = (() => {
    if (!settings.lockPastBookings) return false;
    const dateStr = booking.date || (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() + booking.day);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const endMs = new Date(dateStr + "T00:00:00").getTime() + (booking.startMin + (booking.durMin||60)) * 60000;
    return endMs <= Date.now();
  })();
  // Запис уже почався — можна позначити «Не прийшов» (status "noshow" рахується у статистиці неявок)
  const hasStarted = (() => {
    const dateStr = booking.date || (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() + booking.day);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    return new Date(dateStr + "T00:00:00").getTime() + (booking.startMin || 0) * 60000 <= Date.now();
  })();
  const isNoshow = booking.status === "noshow";

  const bSvcs = settings.services || [];
  const bType = booking.serviceType || booking.type;
  const svc   = bSvcs.find(s => s.id === booking.serviceId)
             || bSvcs.find(s => s.active && s.type===bType && Number(s.duration)===booking.durMin)
             || bSvcs.find(s => s.type===bType && Number(s.duration)===booking.durMin)
             || bSvcs.find(s => s.active && s.type===bType)
             || bSvcs.find(s => s.type===bType);
  const c     = colorOf(svc?.colorId);
  const day = booking.date
    ? (() => { const d = new Date(booking.date + "T12:00:00"); const dow = (d.getDay()+6)%7; return { num:d.getDate(), month:_MLABELS[d.getMonth()], label:_DLABELS[dow], fullLabel:_DLABELS_FULL[dow], wk:dow>=5 }; })()
    : getDayInfo(booking.day);
  // Сусідні записи цього клієнта об'єднані на картці розкладу — тут показуємо
  // сумарну ціну й тривалість (booking сам лишається одним "чесним" записом
  // для дій: скасувати/неявка/повтор/редагування діють лише на нього).
  const durMinDisplay = mergeInfo ? mergeInfo.durMin : booking.durMin;
  const discountAmtDisplay = (booking.discount && booking.customPrice == null) ? Math.round(booking.discount * booking.durMin / 60) : 0;
  const price = mergeInfo ? mergeInfo.price : computeBookingPrice(booking, settings.services);
  const ini   = booking.name.trim().split(" ").slice(0, 2).map(w => w[0]).join("");
  // Порядковий номер цього запису серед усіх записів клієнта (без особистих подій
  // і скасованих) — бейдж у шапці картки запису.
  const lessonNumber = (() => {
    if (booking.type === "personal") return null;
    const studentLessons = (bookings || [])
      .filter(x => x.userId === booking.userId && x.status !== "cancelled" && x.type !== "personal")
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.startMin - b.startMin));
    const idx = studentLessons.findIndex(x => x.id === booking.id);
    return idx >= 0 ? idx + 1 : studentLessons.length + 1;
  })();
  const typeLabel = (isSalon(settings) && booking.serviceName) ? <span style={{display:"inline-flex",alignItems:"center",gap:5}}><MetalIcon name="tag" size={16}/>{booking.serviceName}</span> : booking.type === "school" ? <span style={{display:"inline-flex",alignItems:"center",gap:5}}><MetalIcon name="clipboard" size={16}/>Стандарт</span> : <span style={{display:"inline-flex",alignItems:"center",gap:5}}><MetalIcon name="user" size={16}/>Індивідуальний</span>; // салон: назва послуги замість типу

  const sameDayBookings = (bookings || []).filter(x =>
    x.id !== booking.id && x.status !== "cancelled" &&
    (booking.date ? x.date === booking.date : x.day === booking.day)
  );
  const otherDayTotal = sameDayBookings.reduce((sum, x) => sum + computeBookingPrice(x, settings.services), 0);
  const nextStart = sameDayBookings
    .filter(x => x.startMin > booking.startMin)
    .reduce((min, x) => Math.min(min, x.startMin), Infinity);
  const maxDurMin = nextStart === Infinity ? 360 : Math.max(15, nextStart - booking.startMin);
  // Конфлікт нової тривалості: перетин з наступним записом або вихід за робочі години
  const _wantDur = parseInt(draftDur, 10) || booking.durMin;
  const durConflict = !editOpen ? null
    : (nextStart !== Infinity && booking.startMin + _wantDur > nextStart) ? "Час зайнятий"
    : (settings.workEnd != null && booking.startMin + _wantDur > settings.workEnd * 60 && _wantDur > booking.durMin) ? "Поза робочим часом"
    : null;

  const openEdit = () => {
    // Редагування завжди діє лише на цей окремий запис — навіть якщо картка
    // об'єднана, стартуємо від його власної (не сумарної) ціни.
    const ownPrice = mergeInfo ? computeBookingPrice(booking, settings.services) : price;
    setDraftPrice(String(ownPrice));
    setDraftDur(String(booking.durMin));
    setEditRate(booking.durMin > 0 ? ownPrice / booking.durMin : 0);
    setEditOpen(true);
  };
  const onDurChange = (v) => {
    setDraftDur(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && editRate) setDraftPrice(String(Math.round(editRate * n)));
  };
  const saveEdit = () => {
    if (durConflict) return;
    const p = Math.max(0, parseInt(draftPrice, 10) || 0);
    const d = Math.min(maxDurMin, Math.max(15, parseInt(draftDur, 10) || booking.durMin));
    // Ручну ціну фіксуємо лише якщо майстер справді змінив суму; збіглася з розрахунковою (тариф, надбавка, знижка) — лишаємо авто,
    // щоб ціна далі сама відстежувала знижку/зміну тарифу.
    const autoP = computeBookingPrice({ ...booking, manualPrice: null, durMin: d }, settings.services);
    onAction("editBooking", { ...booking, manualPrice: (p === autoP && d === booking.durMin) ? null : p, durMin: d, durationHours: d / 60 });
    setEditOpen(false);
  };

  const IcoPhone = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 4.14 6.18 2 2 0 0 1 6.12 4h3a2 2 0 0 1 2 1.72c.13 1 .37 1.98.72 2.91a2 2 0 0 1-.45 2.11L10 12a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.93.35 1.91.59 2.91.72A2 2 0 0 1 22 16.92z"/></svg>;
  const IcoChat  = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
  const IcoProfile = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>;
  const IcoHistory = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>;

  const _close = () => setClosing(true);

  return (
    <>
      <style>{`
        @keyframes _bm-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _bm-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _bm-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _bm-bg-out{from{opacity:1}to{opacity:0}}
        ._bm-press{transition:transform .12s ease,opacity .12s ease}
        ._bm-press:active{transform:scale(0.94);opacity:0.85}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,zIndex:200,
        background:shade(0.55),
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_bm-bg-out 0.26s ease-in forwards` : `_bm-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            position:"relative",
            width:"100%",background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${c}66, 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing
              ? `_bm-down 0.26s ease-in forwards`
              : `_bm-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <button aria-label="Закрити" onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"none", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}><MetalIcon name="cross" size={32}/></button>

          {/* Header: handle + student info */}
          <div style={{
            padding:"10px 16px 14px",
            background:`linear-gradient(145deg,${c}22,${c}0d)`,
            borderBottom:`1px solid ${c}28`,
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:`${c}66`,margin:"0 auto 12px"}}/>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"0 36px",textAlign:"center"}}>{/* по центру; праворуч — кнопка ✕ */}
              <div style={{
                width:40,height:40,borderRadius:12,flexShrink:0,
                background:`linear-gradient(145deg,${c},color-mix(in srgb,${c} 55%,#000))`,
                boxShadow:`0 0 0 2px ${c}44`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:15,fontWeight:900,color:"#fff",
              }}>{ini}</div>
              <div style={{minWidth:0,maxWidth:"100%"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,flexWrap:"wrap"}}>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{booking.name}</div>
                  {lessonNumber != null && (
                    <span style={{
                      fontSize:11,fontWeight:800,padding:"2px 7px",borderRadius:99,flexShrink:0,
                      background:`${BLUE}1f`,color:BLUE,
                    }}>{isSalon(settings) ? null : <MetalIcon name="user" size={16} style={{marginRight:4}}/>}{`${lessonNumber}-й запис`}</span>
                  )}
                </div>
                <div style={{fontSize:11.5,color:c,fontWeight:700,marginTop:2}}>{typeLabel}</div>
              </div>
            </div>
          </div>

          <div className="win-cols" style={{padding:"0 0 4px"}}>
          {/* Action buttons: 4 однакові кнопки в ряд */}
          <div style={{padding:"10px 10px 4px",display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:6}}>
            <button onClick={() => onAction("call", booking)} style={{
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,minWidth:0,
              padding:"9px 2px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`${GREEN}1f`,color:GREEN,fontSize:11.5,fontWeight:800,
            }}>{IcoPhone} Дзвонити</button>
            <button onClick={() => onAction("chat", booking)} style={{
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,minWidth:0,
              padding:"9px 2px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`rgba(${GLOW},0.1)`,color:BLUE,fontSize:11.5,fontWeight:800,
            }}>{IcoChat} Чат</button>
            <button onClick={() => onViewStudent?.(booking.userId, false)} style={{
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,minWidth:0,
              padding:"9px 2px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`${PURPLE}1f`,color:PURPLE,fontSize:11.5,fontWeight:800,
            }}>{IcoProfile} Профіль</button>
            <button onClick={() => onViewStudent?.(booking.userId, true)} style={{
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,minWidth:0,
              padding:"9px 2px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:`${GOLD}1f`,color:GOLD,fontSize:11.5,fontWeight:800,
            }}>{IcoHistory} Історія</button>
          </div>

          {/* Ціна/час — синя колірна картка (редагувати + дата/час/ціна разом) */}
          {booking.studentNote && (
            <div style={{
              margin:"12px 14px 0",padding:"10px 14px",borderRadius:14,
              background:`${GOLD}14`,border:`1px solid ${GOLD}4d`,
            }}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:.5,color:GOLD,marginBottom:3}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="chat" size={18}/>Коментар клієнта</span></div>
              <div style={{fontSize:13,color:TEXT,lineHeight:1.4,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{booking.studentNote}</div>
            </div>
          )}
          <div style={{
            margin:"12px 14px 0",padding:"12px 14px",borderRadius:16,
            background:`linear-gradient(155deg,color-mix(in srgb,${BLUE} 40%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
            border:`1px solid color-mix(in srgb,${BLUE} 38%,transparent)`,
          }}>
            {!editOpen && !isPastLocked && (
              <button onClick={openEdit} style={{
                width:"100%",padding:"10px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
                background:"rgba(0,0,0,0.22)",color:"#fff",fontSize:13,fontWeight:800,
                display:"flex",alignItems:"center",justifyContent:"center",gap:7,marginBottom:12,
              }}><MetalIcon name="edit" size={16}/>Редагувати ціну і час</button>
            )}

            {/* Edit sheet: ціна/тривалість */}
            {editOpen && (
              <div style={{marginBottom:12}}>
                <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:GOLD,marginBottom:10}}>
                  Разом за день: {money(otherDayTotal + (parseInt(draftPrice,10)||0))}
                </div>
                <div style={{display:"flex",gap:10,marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:DIM,textTransform:"uppercase",marginBottom:5,textAlign:"center"}}>Тривалість, хв</div>
                    <input type="number" min={15} max={maxDurMin} step={5} value={draftDur}
                      onChange={e=>onDurChange(e.target.value)}
                      style={{width:"100%",textAlign:"center",padding:"9px 6px",borderRadius:10,border:"1px solid rgba(255,255,255,0.18)",background:"rgba(0,0,0,0.22)",color:"#fff",fontSize:14,fontWeight:800,fontFamily:"inherit"}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:DIM,textTransform:"uppercase",marginBottom:5,textAlign:"center"}}>{`Ціна, ${curSym()}`}</div>
                    <input type="number" min={0} step={50} value={draftPrice}
                      onChange={e=>setDraftPrice(e.target.value)}
                      style={{width:"100%",textAlign:"center",padding:"9px 6px",borderRadius:10,border:"1px solid rgba(255,255,255,0.18)",background:"rgba(0,0,0,0.22)",color:"#fff",fontSize:14,fontWeight:800,fontFamily:"inherit"}}/>
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <DurPicker value={parseInt(draftDur,10)||booking.durMin} onChange={v=>onDurChange(String(v))}/>
                </div>
                {durConflict && (
                  <div style={{fontSize:12,color:"#ef4444",textAlign:"center",marginBottom:8,fontWeight:700}}>{durConflict}</div>
                )}
                <div style={{fontSize:11,color:DIM,textAlign:"center",marginBottom:10}}>
                  {`Макс. тривалість зараз: ${maxDurMin} хв · ціна перераховується автоматично при зміні тривалості`}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEditOpen(false)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",background:"rgba(0,0,0,0.22)",color:DIM,fontSize:12.5,fontWeight:700}}>Скасувати</button>
                  <button onClick={saveEdit} disabled={!!durConflict} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",opacity:durConflict?0.45:1,background:GREEN,color:"#0a0d0a",fontSize:12.5,fontWeight:800}}>Зберегти</button>
                </div>
              </div>
            )}

            {/* Info grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr"}}>
              {[
                { label:"Дата",  val:`${day.num} ${day.month}`, sub:day.label },
                { label:"Час",   val:`${fmtTime(booking.startMin)}`, sub:`–${fmtTime(booking.startMin+durMinDisplay)}` },
                { label:"Ціна",  val:`${money(price)}`, sub: mergeInfo ? `${mergeInfo.count} записи, ${durMinDisplay} хв` : booking.surcharge && discountAmtDisplay ? `+${money(booking.surcharge)} / −${money(discountAmtDisplay)}` : booking.surcharge ? `+${money(booking.surcharge)}` : discountAmtDisplay ? `−${money(discountAmtDisplay)} знижка` : (svc ? `${svc.duration} хв` : "—"), gold: !!booking.surcharge && !mergeInfo },
              ].map(({ label, val, sub, gold }, i) => (
                <div key={i} style={{
                  padding:"4px 6px",
                  display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",
                  borderRight: i < 2 ? "1px solid rgba(255,255,255,0.18)" : "none",
                }}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:DIM,textTransform:"uppercase",marginBottom:5}}>{label}</div>
                  <div style={{fontSize:15,fontWeight:900,color: gold ? GOLD : "#fff",lineHeight:1}}>{val}</div>
                  <div style={{fontSize:11,color: gold ? `${GOLD}cc` : "rgba(255,255,255,.65)",marginTop:3,fontWeight:600}}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Група: учасники (тап — відкрити окремий запис учасника) */}
          {booking.groupKey && (() => {
            const members = (bookings || []).filter(x => x.groupKey === booking.groupKey && x.status !== "cancelled");
            return (
              <div style={{margin:"10px 14px 0",padding:"10px 14px",borderRadius:14,background:`rgba(${GLOW},0.06)`,border:`1px solid ${BORDER}`,fontSize:12,color:TEXT}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:FAINT,textTransform:"uppercase",marginBottom:5}}><MetalIcon name="users" size={16} style={{marginRight:5}}/>Група: {members.length}{booking.groupCap ? ` з ${booking.groupCap}` : ""}</div>
                {members.map(m => (
                  <div key={m.id} onClick={() => m.id !== booking.id && onAction("openMember", m)} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",cursor:m.id===booking.id?"default":"pointer"}}>
                    <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:m.id===booking.id?800:600}}>{m.name}</span>
                    <span style={{color:DIM}}>{m.phone}</span>
                    {m.id !== booking.id && <span style={{color:FAINT}}>›</span>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Допуслуги й перерва запису (з послуги на момент запису) */}
          {(normAddons(booking.addons).length > 0 || bufferOf(booking) > 0 || booking.packageId) && (
            <div style={{margin:"10px 14px 0",padding:"10px 14px",borderRadius:14,background:`rgba(${GLOW},0.06)`,border:`1px solid ${BORDER}`,fontSize:12,color:TEXT,lineHeight:1.5}}>
              {normAddons(booking.addons).length > 0 && (() => {
                const ax = bookingAddonTotals(booking);
                return (
                  <div><MetalIcon name="plus" size={16} style={{marginRight:5}}/><b>{addonsLabel(normAddons(booking.addons))}</b>
                    <span style={{color:DIM}}> · +{money(ax.price)}{ax.minutes>0?` · +${ax.minutes} хв`:""}</span>
                  </div>
                );
              })()}
              {bufferOf(booking) > 0 && <div style={{color:DIM}}><MetalIcon name="timer" size={16} style={{marginRight:5}}/>Перерва після запису: {bufferOf(booking)} хв</div>}
              {booking.packageId && <div><MetalIcon name="ticket" size={16} style={{marginRight:5}}/>{booking.packageError ? <span style={{color:ACCENT}}>Пакет «{booking.packageName}» не списано: {booking.packageError}</span> : <>З пакета «{booking.packageName}»</>}</div>}
            </div>
          )}

          {/* Мітка — booking.tag/tagManual, якщо ручна; інакше показуємо автотег
              (за порядком запису/сумою боргу), рахований у батьківському компоненті. */}
          {(() => {
            const displayTag = knownTag(booking.tagManual ? (booking.tag || null) : (booking.tag || autoTag || null));
            const isAuto = !booking.tagManual && !booking.tag && !!autoTag;
            return (
              <div style={{
                margin:"10px 14px",padding:"12px 14px",borderRadius:16,
                background:`linear-gradient(155deg,color-mix(in srgb,${GOLD} 38%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                border:`1px solid color-mix(in srgb,${GOLD} 36%,transparent)`,
              }}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:"rgba(255,255,255,.8)",textTransform:"uppercase"}}>
                    <MetalIcon name="tag" size={16} style={{marginRight:5}}/>Мітка {isAuto && <span style={{color:"rgba(255,255,255,.6)",textTransform:"none",letterSpacing:0}}>(авто)</span>}
                  </div>
                  <div onClick={() => setTagPickerOpen(o => !o)} style={{
                    fontSize:11,fontWeight:800,color:"#fff",cursor:"pointer",padding:"2px 8px",
                    borderRadius:8,background:"rgba(0,0,0,0.25)",
                  }}>{tagPickerOpen ? "Закрити" : (displayTag ? "Змінити" : "+ Додати")}</div>
                </div>
                {displayTag && !tagPickerOpen && (() => {
                  const tp = TAG_PRESETS.find(t=>t.id===displayTag);
                  if (!tp) return null;
                  const label = displayTag === "debt" && booking.debtAmount > 0 ? `${tp.label} ${money(booking.debtAmount)}` : tp.label;
                  return (
                    <div onClick={()=>onAction("setTag",{...booking,tag:null})} title="Тап — прибрати" style={{
                      display:"inline-flex",alignItems:"center",gap:5,padding:"5px 9px",borderRadius:20,
                      background:"rgba(0,0,0,0.22)",border:"1px solid rgba(255,255,255,0.25)",cursor:"pointer",
                    }}>
                      <span style={{fontSize:14,display:"inline-flex"}}><TagIcon tag={tp} size={14}/></span>
                      <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{label}</span>
                    </div>
                  );
                })()}
                {displayTag === "debt" && !tagPickerOpen && (
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:7}}>
                    <input
                      type="number" inputMode="decimal" min="0"
                      placeholder={`Сума боргу, ${curSym()}`}
                      value={debtInput}
                      onChange={e=>setDebtInput(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter") onAction("setTag",{...booking,tag:"debt",debtAmount:Number(debtInput)||0}); }}
                      style={{
                        flex:1,padding:"7px 10px",borderRadius:10,
                        border:"1px solid rgba(255,255,255,0.18)",background:"rgba(0,0,0,0.22)",color:"#fff",
                        fontSize:12,outline:"none",boxSizing:"border-box",
                      }}
                    />
                    <button onClick={()=>onAction("setTag",{...booking,tag:"debt",debtAmount:Number(debtInput)||0})} style={{
                      padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
                      background:"rgba(0,0,0,0.25)",color:"#fff",fontSize:12,fontWeight:800,
                    }}>Зберегти</button>
                  </div>
                )}
                {tagPickerOpen && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7,paddingTop:displayTag?8:0}}>
                    {TAG_PRESETS.map(tp=>(
                      <button key={tp.id} onClick={()=>{ onAction("setTag",{...booking,tag: displayTag===tp.id?null:tp.id}); setTagPickerOpen(false); }} style={{
                        display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                        padding:"9px 4px",borderRadius:14,cursor:"pointer",fontFamily:"inherit",
                        border: displayTag===tp.id ? "1.5px solid rgba(255,255,255,0.6)" : "1px solid rgba(255,255,255,0.18)",
                        background: displayTag===tp.id ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.22)",
                      }}>
                        <span style={{fontSize:15,display:"inline-flex"}}><TagIcon tag={tp} size={14}/></span>
                        <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.85)"}}>{tp.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{marginTop:8,fontSize:11,lineHeight:1.4,color:"rgba(255,255,255,.55)"}}>
                  Видно на картці в розкладі. «1-й запис» ставиться сам.
                </div>
              </div>
            );
          })()}

          {/* Queue */}
          {queueEntries.length > 0 && (
            <div style={{padding:"10px 14px",borderBottom:`1px solid ${ink(0.06)}`}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:GOLD,textTransform:"uppercase",marginBottom:6}}>
                <MetalIcon name="hourglass" size={16} style={{marginRight:5}}/>Черга ({queueEntries.length})
              </div>
              {queueEntries.map((e, i) => (
                <div key={e.uid||i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom: i < queueEntries.length-1 ? `1px solid ${ink(0.04)}` : "none"}}>
                  <div style={{width:16,height:16,borderRadius:5,background:ink(0.07),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:GOLD,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name || "—"}</div>
                    {e.phone && <div style={{fontSize:11,color:DIM}}>{e.phone}</div>}
                  </div>
                  {e.uid && (() => {
                    const dateStr = booking.date || (() => {
                      const d = new Date(); d.setHours(0,0,0,0);
                      d.setDate(d.getDate() + (booking.day || 0));
                      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    })();
                    const hh = String(Math.floor(booking.startMin/60)).padStart(2,'0');
                    const mm = String(booking.startMin%60).padStart(2,'0');
                    const slotKey = `${dateStr}_${hh}:${mm}`;
                    return (
                      <button aria-label="Прибрати з черги" onClick={() => update(iRef(), {
                        [`queue/${slotKey}/entries/${e.uid}`]: null,
                        [`userQueue/${e.uid}/${slotKey}`]: null,
                      }).catch(()=>{})}
                        style={{width:22,height:22,borderRadius:7,border:"none",cursor:"pointer",flexShrink:0,
                          background:"rgba(239,68,68,0.15)",color:"rgba(248,113,113,0.9)",fontSize:11,fontWeight:800,
                          display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}

          </div>{/* /win-cols */}

          {/* Низ: «Не прийшов» і «Скасувати запис» — пара однакових кнопок (на ПК — по центру) */}
          {!isPastLocked || hasStarted || isNoshow ? (
          <div className="modal-footer" style={{gap:8,padding:"12px 14px 16px",marginTop:8,borderTop:`1px solid ${ink(0.05)}`}}>
          {/* Неявка: лише для запису, що вже почався; повторний тап повертає «прийшов» */}
          {(hasStarted || isNoshow) && (
            <button onClick={() => { onAction(isNoshow ? "attended" : "noshow", booking); _close(); }} style={{
              width:"100%",margin:0,padding:"12px 10px",borderRadius:14,cursor:"pointer",fontFamily:"inherit",
              border:`1px solid ${isNoshow ? `${GREEN}55` : "rgba(239,68,68,0.35)"}`,
              background:isNoshow ? `${GREEN}14` : "rgba(239,68,68,0.10)",
              color:isNoshow ? GREEN : "#fca5a5",fontSize:13,fontWeight:800,
            }}>{isNoshow ? "↺ Клієнт прийшов" : <span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="ban" size={20}/>Не прийшов</span>}</button>
          )}

          {!isPastLocked && (
            <button onClick={() => { onAction("cancel", booking); _close(); }} style={{
              width:"100%",padding:"12px 10px",borderRadius:14,cursor:"pointer",fontFamily:"inherit",
              border:"1px solid rgba(239,68,68,0.35)",background:"rgba(239,68,68,0.10)",
              color:"#fca5a5",fontSize:13,fontWeight:800,
            }}>Скасувати запис</button>
          )}
          </div>
          ) : null}

          {/* Минулий запис: замість скасування — пояснення */}
          {isPastLocked && (
            <div style={{
              width:"100%",padding:"10px",textAlign:"center",
              borderTop:`1px solid ${ink(0.05)}`,
              color:TEXT_FAINT,fontSize:11,fontWeight:600,
              marginTop:4,marginBottom:20,
            }}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="lock" size={18}/>Минулий запис — змінити чи скасувати не можна</span></div>
          )}

        </div>
      </div>
    </>
  );
}

function NewBookingModal({ data, onClose, onConfirm, settings, bookings = [] }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const timeStep = data?.freeSnap ? 5 : (settings.snapMin || 30);
  const timeItems = useMemo(()=>{
    const arr=[];
    for(let m=Math.round(settings.workStart*60); m<Math.round(settings.workEnd*60); m+=timeStep)
      arr.push({label:fmtTime(m), value:m});
    return arr;
  },[settings.workStart, settings.workEnd, timeStep]);

  const activeServices = useMemo(()=>
    settings.services.filter(s=>s.active)
  ,[settings.services]);

  const [search,     setSearch]     = useState("");
  const [selStudent, setSelStudent] = useState(null);
  const [phone,      setPhone]      = useState("");
  const [newName,    setNewName]    = useState("");
  const [newPhone,   setNewPhone]   = useState("");
  const [dateOffset, setDateOffset] = useState(0);
  const [timeVal,    setTimeVal]    = useState(null);
  const [svcId,      setSvcId]      = useState(null);
  const [durSel,     setDurSel]     = useState(null); // null = тривалість послуги
  const [addonIds,   setAddonIds]   = useState([]);
  const [usePkg,     setUsePkg]     = useState(true);
  const [note,       setNote]       = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [newTag,     setNewTag]     = useState(null); // ручна мітка: id довільної мітки
  const [students,   setStudents]   = useState([]);
  const [closing,    setClosing]    = useState(false);
  const [staffM,     setStaffM]     = useState([]); // салон: склад майстрів (для рядка «Майстер»)
  useEffect(()=>onValue(iRef("staff"), snap => setStaffM(snap.exists() ? normStaff(snap.val(), auth.currentUser?.uid || "") : []), ()=>{}),[]);
  const activeM = staffM.length>1 ? staffM.find(m=>m.id===getActiveMaster()) : null;

  useEffect(()=>{
    const r = iRef( "users");
    const handler = onValue(r, snap => {
      const d = snap.val() || {};
      setStudents(Object.entries(d).map(([uid, u]) => {
        const p = u.profile || {};
        return { id:uid, name:p.name||u.name||"Клієнт", phone:p.phone||u.phone||"", packages:normPackages(u.packages) };
      }).filter(s=>s.name!=="Клієнт"||s.phone));
    });
    return () => off(r, "value", handler);
  }, []);

  useEffect(()=>{
    if(data){
      const snapped = timeItems.find(t=>t.value>=(data.startMin??settings.workStart*60));
      setTimeVal(snapped?.value ?? timeItems[0]?.value ?? null);
      setDateOffset(Math.max(0, data.day??0));
      setSearch(""); setSelStudent(null); setPhone("");
      setNewName(""); setNewPhone(""); setNote("");
      setDebtAmount("");
      setSvcId(null); setDurSel(null);
      setAddonIds([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[!!data]);

  const sortedStudents = useMemo(() => {
    const lastBooked = {};
    bookings.forEach(b => {
      if (b.userId && b.createdAt && (!lastBooked[b.userId] || b.createdAt > lastBooked[b.userId]))
        lastBooked[b.userId] = b.createdAt;
    });
    return [...students].sort((a, b) => {
      const la = lastBooked[a.id] || 0;
      const lb = lastBooked[b.id] || 0;
      if (la || lb) return lb - la;
      return a.name.localeCompare(b.name, "uk");
    });
  }, [students, bookings]);

  if(!data && !closing) return null;

  const isNewStudent = selStudent?.id === "new";
  const selSvc    = activeServices.find(s=>s.id===svcId) ?? null;
  // Допуслуги вибраної послуги: ціна додається до запису, хвилини — до його тривалості
  const svcAddons = normAddons(selSvc?.addons);
  const chosenAddons = pickAddons(selSvc, addonIds);
  const axTotals = addonsTotals(chosenAddons);
  const totalDur = selSvc ? selSvc.duration + axTotals.minutes : 0;
  // Пакет клієнта, який можна списати на цю послугу в обрану дату
  const pkgDateStr = (() => { const d0 = new Date(); d0.setHours(0,0,0,0); d0.setDate(d0.getDate() + dateOffset); return `${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,"0")}-${String(d0.getDate()).padStart(2,"0")}`; })();
  const availPkg = (selSvc && selStudent && selStudent.id !== "new") ? pickPackage(selStudent.packages || [], selSvc.id, pkgDateStr) : null;
  const pkgOn = !!availPkg && usePkg;
  const finalName = isNewStudent ? newName.trim() : selStudent ? selStudent.name : search.trim();
  const finalPhone= isNewStudent ? newPhone.trim() : phone || (selStudent?.phone ?? "");
  const dur = durSel ?? (selSvc ? totalDur : 60);
  const nbDateStr = (() => {
    const t = new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate() + dateOffset);
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  })();
  const nbPrice = selSvc ? (durSel == null ? selSvc.price : Math.round(selSvc.price / selSvc.duration * Math.max(0, dur - axTotals.minutes))) : 0;
  // Перетин з активним записом того дня (скасовані та vip-слоти не рахуємо) або вихід за робочі години
  const durOutside = !!selSvc && timeVal != null && timeVal + dur > settings.workEnd * 60;
  const durBusy = !!selSvc && timeVal != null && bookings.some(x =>
    x.status !== "cancelled" && x.type !== "vip-slot" && x.startMin != null && x.durMin &&
    (x.date || (() => { const t = new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate() + (x.day || 0)); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; })()) === nbDateStr &&
    timeVal < x.startMin + x.durMin && timeVal + dur > x.startMin);
  const readyToConfirm = finalName.length > 1 && !!selSvc && timeVal != null && !durOutside && !durBusy;
  const canConfirm  = readyToConfirm && !!finalPhone;
  const missingPhone = readyToConfirm && !finalPhone;

  const dayChips = Array.from({length:14},(_,i)=>{
    const info = getDayInfo(i);
    return { lbl: i===0?"Сьогодні":i===1?"Завтра":`${info.label} ${info.num}`, info, i };
  });

  const q        = search.toLowerCase().trim();
  const filtered = q ? sortedStudents.filter(s=>s.name.toLowerCase().includes(q)||s.phone.includes(q)) : sortedStudents;

  const SL = ({children})=>(
    <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:TEXT_FAINT,
      textTransform:"uppercase",marginBottom:7}}>{children}</div>
  );

  const _close = () => setClosing(true);

  const handleConfirm = () => {
    if(!canConfirm) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(today); d.setDate(d.getDate() + dateOffset);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    onConfirm({
      id:`b-${Date.now()}`,
      day:dateOffset, date:dateStr, startMin:timeVal, durMin:dur,
      name:finalName, phone:finalPhone, serviceId:selSvc.id,
      type:selSvc.type||"private", status:"confirmed",
      hoursDone:0, categoryId:null, isVipOnly:false,
      userId: (!isNewStudent && selStudent?.id) ? selStudent.id : null,
      ...(note.trim() && { note:note.trim() }),
      ...(Number(debtAmount) > 0 && { debtAmount: Number(debtAmount) }),
      ...(newTag && { tag: newTag, tagManual: true }),
      ...(chosenAddons.length && { addons: addonsSnapshot(chosenAddons), addonsPrice: axTotals.price }),
      ...(bufferOf(selSvc) > 0 && { bufferMin: bufferOf(selSvc) }),
      ...(pkgOn && { packageId: availPkg.id, packageName: availPkg.name }),
      ...(isGroupService(selSvc) && { groupKey: groupKeyOf(dateStr, fmtTime(timeVal)), groupCap: capacityOf(selSvc) }),
    });
    _close();
  };

  return (
    <>
      <style>{`
        @keyframes _nb-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _nb-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _nb-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _nb-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,zIndex:200,
        background:shade(0.55),
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_nb-bg-out 0.26s ease-in forwards` : `_nb-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            position:"relative",
            width:"100%",background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 rgba(34,197,94,0.3), 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing
              ? `_nb-down 0.26s ease-in forwards`
              : `_nb-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <button aria-label="Закрити" onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"none", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}><MetalIcon name="cross" size={32}/></button>

          {/* Header */}
          <div style={{
            padding:"10px 18px 14px",
            background:"linear-gradient(145deg,rgba(34,197,94,0.12),rgba(22,163,74,0.05))",
            borderBottom:"1px solid rgba(34,197,94,0.15)",
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:"rgba(34,197,94,0.35)",margin:"0 auto 12px"}}/>
            <div style={{padding:"0 36px",textAlign:"center"}}>
            <div style={{fontSize:17,fontWeight:800,color:"#22c55e"}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="plusCircle" size={28}/>Новий запис</span></div>
            {activeM && <div style={{marginTop:6,fontSize:12,fontWeight:600,color:TEXT_DIM,display:"flex",alignItems:"center",justifyContent:"center",gap:6,minWidth:0}}>Майстер: <span style={{width:9,height:9,borderRadius:"50%",background:activeM.color,flexShrink:0}}/><span style={{color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeM.name}</span></div>}
            </div>
          </div>

          <div className="win-cols win-gap" style={{padding:"16px 16px 0",gap:16}}>

          {/* КЛІЄНТ */}
          <div>
            <SL>Клієнт</SL>
            {isNewStudent ? (
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"7px 12px",borderRadius:10,
                  background:`${GREEN}18`,border:`1.5px solid ${GREEN}44`}}>
                  <div style={{fontSize:12,fontWeight:700,color:GREEN}}>Новий клієнт</div>
                  <button aria-label="Скасувати вибір клієнта" onClick={()=>{setSelStudent(null);setNewName("");setNewPhone("");}}
                    style={{background:"none",border:"none",cursor:"pointer",color:TEXT_FAINT,fontSize:20,padding:0,lineHeight:1}}>×</button>
                </div>
                <input type="text" placeholder="Ім'я та прізвище" value={newName}
                  onChange={e=>setNewName(e.target.value)}
                  style={{padding:"10px 12px",borderRadius:10,border:`1.5px solid ${BORDER}`,
                    background:SURFACE_LO,color:TEXT,fontSize:14,fontWeight:600,outline:"none"}}/>
                <PhoneField placeholder="+380..." value={newPhone} onChange={setNewPhone} inputStyle={{padding:"10px 12px",borderRadius:10,border:`1.5px solid ${BORDER}`,
                    background:SURFACE_LO,color:TEXT,fontSize:14,fontWeight:600,outline:"none"}}/>
              </div>
            ) : selStudent ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"10px 13px",borderRadius:13,
                background:`${GREEN}20`,border:`1.5px solid ${GREEN}50`}}>
                <div>
                  <div style={{fontSize:14,fontWeight:800,color:TEXT}}>{selStudent.name}</div>
                  <div style={{fontSize:11,color:TEXT_DIM,marginTop:1}}>{selStudent.phone}</div>
                </div>
                <button aria-label="Скасувати вибір клієнта" onClick={()=>{setSelStudent(null);setPhone("");setSearch("");}}
                  style={{background:"none",border:"none",cursor:"pointer",color:TEXT_FAINT,fontSize:20,padding:"0 4px",lineHeight:1}}>×</button>
              </div>
            ) : (
              <>
                <div style={{display:"flex",alignItems:"center",gap:8,
                  padding:"9px 12px",borderRadius:14,marginBottom:6,
                  background:SURFACE_LO,border:`1.5px solid ${BORDER}`}}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={TEXT_FAINT} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>
                  <input type="text" placeholder="Пошук за ім'ям..."
                    value={search} onChange={e=>setSearch(e.target.value)}
                    style={{flex:1,background:"none",border:"none",outline:"none",color:TEXT,fontSize:14,fontWeight:600}}/>
                  {search && <button aria-label="Очистити пошук" onClick={()=>setSearch("")}
                    style={{background:"none",border:"none",cursor:"pointer",color:TEXT_FAINT,fontSize:16,padding:0,lineHeight:1}}>×</button>}
                </div>
                <div style={{borderRadius:14,overflow:"hidden",border:`1px solid ${BORDER}`,maxHeight:164,overflowY:"auto"}}>
                  {!q && (
                    <div onClick={()=>{setSelStudent({id:"new",name:"",phone:""});setNewName("");setNewPhone("");}}
                      style={{display:"flex",alignItems:"center",gap:9,padding:"9px 13px",cursor:"pointer",
                        borderBottom:`1px solid ${BORDER}`,background:BG_DEEP}}>
                      <div style={{width:20,height:20,borderRadius:10,flexShrink:0,
                        background:`${GREEN}33`,border:`1.5px solid ${GREEN}55`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:14,color:GREEN,fontWeight:800,lineHeight:1}}>+</div>
                      <div style={{fontSize:13,fontWeight:700,color:GREEN}}>Новий клієнт</div>
                    </div>
                  )}
                  {filtered.map(s=>(
                    <div key={s.id} onClick={()=>{setSelStudent(s);setPhone(s.phone);setSearch("");}}
                      style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        padding:"9px 13px",cursor:"pointer",borderBottom:`1px solid ${BORDER}`,background:BG_DEEP}}>
                      <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{s.name}</div>
                      <div style={{fontSize:11,color:TEXT_FAINT}}>{s.phone.slice(-7)}</div>
                    </div>
                  ))}
                  {q && !filtered.length && (
                    <div style={{padding:"11px 13px",fontSize:12,color:TEXT_FAINT,textAlign:"center",background:BG_DEEP}}>Не знайдено</div>
                  )}
                  {q.length>1 && !filtered.find(s=>s.name.toLowerCase()===q) && (
                    <div onClick={()=>{setSelStudent({id:"new",name:"",phone:""});setNewName(search.trim());setNewPhone("");setSearch("");}}
                      style={{display:"flex",alignItems:"center",gap:9,padding:"9px 13px",cursor:"pointer",background:BG_DEEP}}>
                      <div style={{width:20,height:20,borderRadius:10,flexShrink:0,
                        background:`${GREEN}33`,border:`1.5px solid ${GREEN}55`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:14,color:GREEN,fontWeight:800,lineHeight:1}}>+</div>
                      <div style={{fontSize:13,fontWeight:700,color:GREEN}}>Додати «{search.trim()}»</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ДАТА */}
          <div>
            <SL>Дата</SL>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2,scrollbarWidth:"none"}}>
              {dayChips.map(({lbl,info,i})=>{
                const active = i===dateOffset;
                return (
                  <button key={i} onClick={()=>setDateOffset(i)} style={{
                    flexShrink:0,padding:"7px 11px",borderRadius:10,border:"none",cursor:"pointer",
                    background:active?`linear-gradient(165deg,${GOLD},#e6a800)`:SURFACE_LO,
                    color:active?"#1a1200":info.wk?ACCENT:TEXT_DIM,
                    fontSize:11,fontWeight:active?800:600,
                    boxShadow:active?`0 4px 12px ${GOLD}55`:SHADOW_OUT,
                    transition:"all .12s",
                  }}>
                    <div>{lbl}</div>
                    {i>1&&<div style={{fontSize:11,opacity:0.9,marginTop:1}}>{info.month}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ЧАС */}
          <div>
            <SL>Час початку</SL>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {timeItems.map(t=>{
                const active = t.value===timeVal;
                return (
                  <button key={t.value} onClick={()=>setTimeVal(t.value)} style={{
                    padding:"9px 10px",borderRadius:10,border:"none",cursor:"pointer",minWidth:54,flex:"1 1 auto",textAlign:"center",
                    background:active?`linear-gradient(165deg,#2f6fe0,#1d4ed8)`:SURFACE_LO,
                    color:active?"#fff":TEXT_DIM,
                    fontSize:13,fontWeight:active?800:500,
                    boxShadow:active?`0 4px 12px ${BLUE}55`:SHADOW_OUT,
                    transition:"all .12s",
                  }}>{t.label}</button>
                );
              })}
            </div>
          </div>

          {/* ПОСЛУГА */}
          <div>
            <SL>Послуга</SL>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {activeServices.map(s=>{
                const active = s.id===svcId;
                const c = colorOf(s.colorId || (s.type==="school"?"green":"yellow"));
                return (
                  <button key={s.id} onClick={()=>{ if (s.id!==svcId) { setSvcId(s.id); setAddonIds([]); } setDurSel(null); }} style={{
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"10px 13px",borderRadius:14,cursor:"pointer",
                    background:active?`${c}1a`:SURFACE_LO,
                    border:active?`1.5px solid ${c}55`:`1.5px solid transparent`,
                    boxShadow:active?`0 4px 14px ${c}2a`:SHADOW_OUT,
                    transition:"all .12s",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <div style={{width:9,height:9,borderRadius:"50%",background:c,flexShrink:0}}/>
                      <div style={{fontSize:13,fontWeight:active?800:600,color:active?TEXT:TEXT_DIM,textAlign:"left"}}>{s.name}</div>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:active?c:TEXT_FAINT,whiteSpace:"nowrap"}}>
                      {money(s.price)} · {s.duration} хв
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selSvc && isGroupService(selSvc) && (
            <div style={{padding:"9px 13px",borderRadius:14,background:`${BLUE}14`,border:`1px solid ${BLUE}30`,fontSize:12,color:TEXT_DIM,lineHeight:1.5}}>
              <MetalIcon name="users" size={18} style={{marginRight:5}}/>Групова послуга, до {capacityOf(selSvc)} місць. Запис приєднається до наявної групи на цей час або створить нову; якщо місць немає — його буде відхилено.
            </div>
          )}

          {/* ДОПУСЛУГИ — якщо в послуги вони є */}
          {selSvc && svcAddons.length > 0 && (
            <div>
              <SL>Допуслуги</SL>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {svcAddons.map(a=>{
                  const on = addonIds.includes(a.id);
                  return (
                    <button key={a.id} type="button" onClick={()=>setAddonIds(ids=>on?ids.filter(x=>x!==a.id):[...ids,a.id])} style={{
                      padding:"8px 11px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",textAlign:"left",
                      border: on ? `1.5px solid ${GOLD}` : `1.5px solid ${BORDER}`,
                      background: on ? `${GOLD}1f` : SURFACE_LO,
                      color: on ? TEXT : TEXT_DIM, fontSize:12, fontWeight:on?800:600,
                    }}>
                      {on?"✓ ":"+ "}{a.name}
                      <span style={{opacity:0.75,fontWeight:600}}> · {money(a.price)}{a.minutes>0?` · +${a.minutes} хв`:""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ПАКЕТ клієнта */}
          {availPkg && (
            <button type="button" onClick={()=>setUsePkg(v=>!v)} style={{
              display:"flex",alignItems:"center",gap:10,textAlign:"left",padding:"10px 13px",borderRadius:14,cursor:"pointer",fontFamily:"inherit",
              border: pkgOn ? `1.5px solid ${GREEN}` : `1.5px solid ${BORDER}`,
              background: pkgOn ? `${GREEN}1a` : SURFACE_LO, color:TEXT,fontSize:13,fontWeight:700,
            }}>
              <span style={{display:"inline-flex"}}><MetalIcon name="ticket" size={22}/></span>
              <span style={{flex:1}}>Списати з пакета «{availPkg.name}» <span style={{color:TEXT_DIM,fontWeight:600}}>(лишилось {availPkg.left})</span></span>
              <span style={{color:pkgOn?GREEN:TEXT_FAINT}}>{pkgOn?"✓":"○"}</span>
            </button>
          )}

          {/* ТРИВАЛІСТЬ */}
          {selSvc && (
            <div>
              <SL>{"Тривалість, хв"}</SL>
              <DurPicker value={dur} onChange={v=>setDurSel(v)}/>
            </div>
          )}

          {/* ЦІНА PREVIEW */}
          {selSvc && (
            <div style={{
              display:"flex",alignItems:"center",gap:10,
              padding:"10px 13px",borderRadius:14,
              background:`${GOLD}14`,border:`1px solid ${GOLD}30`,
            }}>
              <span style={{display:"inline-flex"}}><MetalIcon name="coin" size={22}/></span>
              <div style={{fontSize:15,fontWeight:800,color:GOLD}}>{money((pkgOn ? 0 : nbPrice) + axTotals.price)}</div>
              <div style={{fontSize:12,color:TEXT_DIM}}>· {dur} хв</div>
              {timeVal!=null && (
                <div style={{marginLeft:"auto",fontSize:12,color:TEXT_DIM}}>
                  {fmtTime(timeVal)} → {fmtTime(timeVal + dur)}
                </div>
              )}
            </div>
          )}

          {(durBusy || durOutside) && (
            <div style={{fontSize:12,color:"#ef4444",textAlign:"center",marginTop:-8}}>
              {durBusy ? "Час зайнятий" : "Поза робочим часом"}
            </div>
          )}

          {/* ПРИМІТКА */}
          <input
            type="text"
            placeholder="Примітка"
            value={note}
            onChange={e=>setNote(e.target.value)}
            style={{
              padding:"10px 13px",borderRadius:14,
              border:`1.5px solid ${BORDER}`,
              background:SURFACE_LO,color:TEXT,fontSize:13,outline:"none",
            }}
          />

          {/* СУМА БОРГУ — якщо вказано, запис автоматично отримає мітку "Борг" */}
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder={`Сума боргу, ${curSym()}`}
            value={debtAmount}
            onChange={e=>setDebtAmount(e.target.value)}
            style={{
              padding:"10px 13px",borderRadius:14,
              border:`1.5px solid ${BORDER}`,
              background:SURFACE_LO,color:TEXT,fontSize:13,outline:"none",
            }}
          />

          {/* МІТКА — вручну: Перевірка / Важливо ("1-й запис" ставиться сама, борг — сумою вище) */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {TAG_PRESETS.filter(t => !AUTO_TAG_IDS.includes(t.id)).map(tp => {
              const on = newTag === tp.id;
              return (
                <button key={tp.id} type="button" onClick={()=>setNewTag(on ? null : tp.id)} style={{
                  flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                  padding:"10px 6px",borderRadius:14,cursor:"pointer",fontFamily:"inherit",
                  border: on ? `1.5px solid ${tp.color}` : `1.5px solid ${BORDER}`,
                  background: on ? `color-mix(in srgb,${tp.color} 22%,${SURFACE_LO})` : SURFACE_LO,
                  color:TEXT,fontSize:13,fontWeight:700,
                }}><span style={{display:"inline-flex"}}><TagIcon tag={tp} size={14}/></span>{tp.label}</button>
              );
            })}
          </div>

          {missingPhone && (
            <div style={{fontSize:12,color:ACCENT,textAlign:"center",marginTop:-4}}>
              Вкажіть телефон клієнта, щоб зберегти запис
            </div>
          )}

          {/* Кнопка підтвердження */}
          <div className="modal-footer" style={{gap:10,marginBottom:20,breakInside:"avoid"}}>
          <button onClick={_close} style={{
            padding:"14px 8px",borderRadius:14,border:`1.5px solid ${BORDER}`,cursor:"pointer",fontFamily:"inherit",
            background:SURFACE_LO,color:TEXT_DIM,fontSize:15,fontWeight:800,
          }}>Скасувати</button>
          <button disabled={!canConfirm} onClick={handleConfirm} style={{
            padding:"14px 8px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
            background:canConfirm?`linear-gradient(160deg,${GREEN},#4ade80)`:SURFACE_LO,
            color:canConfirm?"#fff":TEXT_FAINT,
            fontSize:15,fontWeight:800,letterSpacing:0.2,
            boxShadow:canConfirm?`0 6px 20px ${GREEN}55`:SHADOW_OUT,
            transition:"all .2s",
          }}>Створити</button>
          </div>

        </div>
        </div>
      </div>
    </>
  );
}

export { BookingModalFog, NewBookingModalFog };
