// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useState, useRef, useEffect, useMemo, useContext } from "react";
import { MetalIcon } from "../../MetalIcon";
import { createPortal } from "react-dom";
import { update, remove, push as fbPush } from "firebase/database";
import { iRef } from "../../firebase";
import { ThemeContext, GOLD } from "../../theme.js";
import { useFX, useBackClose, Hint } from "../../ui";
import FogScope from "../../FogScope";
import { fmtTime } from "./shared.jsx";

// ═══════════════════════════════════════════════════════════════
// BROADCAST MODAL — ручна розсилка повідомлень клієнтам
// ═══════════════════════════════════════════════════════════════
function BroadcastModalBase({ initialDate, initialSlot, onClose }) {
  const { BG_DEEP, SURFACE, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI, GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow = a => `rgba(${GLOW},${a})`, shade = a => `rgba(${SHADE},${a})`, ink = a => `rgba(${INK},${a})`;
  const SHADOW_IN = SI;

  const [date, setDate]       = useState(initialDate || "");
  const [slot1, setSlot1]     = useState(initialSlot || "");
  const [slot2, setSlot2]     = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [sendError, setSendError] = useState(null);
  const [closing, setClosing] = useState(false);

  const slotsArr = [slot1, slot2].filter(Boolean);
  const canSend  = !!(date && slot1 && !sending);
  const _close   = () => setClosing(true);
  useBackClose(true, _close); // системна «назад» закриває вікно, а не застосунок

  const preview = (() => {
    if (!date || !slot1) return null;
    try {
      const fmt = new Date(date + "T00:00:00").toLocaleDateString("uk", { day: "numeric", month: "long", weekday: "short" });
      return `${fmt} о ${slotsArr.join(" та ")}${comment ? " — " + comment : ""}`;
    } catch { return null; }
  })();

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await fbPush(iRef( "push_tasks"), { date, slots: slotsArr, comment: comment || null, createdAt: Date.now(), status: "pending" });
      setSent(true);
    } catch (e) { setSendError("Помилка: " + e.message); }
    finally { setSending(false); }
  };

  const inp = { background: `linear-gradient(135deg,${BG_DEEP},${SURF_LO})`, border: `1px solid ${BORDER}`, outline: "none", color: TEXT, fontSize: 13, padding: "9px 12px", borderRadius: 10, boxShadow: SHADOW_IN, width: "100%", boxSizing: "border-box" };

  return (
    <>
      <style>{`
        @keyframes _br-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _br-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _br-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _br-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,zIndex:9999,
        background:shade(0.55),
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_br-bg-out 0.26s ease-in forwards` : `_br-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            position:"relative",
            width:"100%",background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 rgba(192,132,252,0.3), 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing
              ? `_br-down 0.26s ease-in forwards`
              : `_br-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
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
            background:"linear-gradient(145deg,rgba(192,132,252,0.12),rgba(168,85,247,0.05))",
            borderBottom:"1px solid rgba(192,132,252,0.15)",
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:"rgba(192,132,252,0.4)",margin:"0 auto 12px"}}/>
            <div style={{fontSize:17,fontWeight:800,color:"#c084fc",textAlign:"center",margin:"0 40px"}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="mega" size={30}/>Розсилка клієнтам</span></div>
          </div>

          <div className="win-cols" style={{padding:"16px 18px 32px"}}>
            {sent ? (
              <div style={{ textAlign:"center", padding:"20px 0" }}>
                <div style={{ marginBottom:8 }}><MetalIcon name="checkCircle" size={40}/></div>
                <div style={{ fontSize:16, fontWeight:800, color:TEXT }}>Надіслано!</div>
                <div style={{ fontSize:12, color:DIM, marginTop:6 }}>Сповіщення отримають активні клієнти</div>
                <button onClick={_close} style={{ marginTop:20, background:"rgba(192,132,252,0.15)", color:"#c084fc", border:"none", borderRadius:14, padding:"10px 28px", fontSize:13, fontWeight:700, cursor:"pointer" }}>Закрити</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:600 }}>Дата</div>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp}/>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:600 }}>Слот 1</div>
                    <input type="time" value={slot1} onChange={e => setSlot1(e.target.value)} style={inp}/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:600 }}>Слот 2</div>
                    <input type="time" value={slot2} onChange={e => setSlot2(e.target.value)} style={inp}/>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:600 }}>Коментар</div>
                  <input value={comment} onChange={e => setComment(e.target.value)} placeholder="напр. «записуйся поки є місце»" style={{ ...inp, fontSize:12 }} maxLength={60}/>
                </div>
                {preview && (
                  <div style={{ background:"rgba(192,132,252,0.07)", border:"1px solid rgba(192,132,252,0.2)", borderRadius:10, padding:"10px 12px", marginBottom:14 }}>
                    <div style={{ fontSize:11, color:DIM, marginBottom:4, fontWeight:700, letterSpacing:0.5 }}>ПРЕВ'Ю ПУШУ</div>
                    <div style={{ fontSize:12, color:TEXT, fontWeight:700 }}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="user" size={18}/>Є вільний слот!</span></div>
                    <div style={{ fontSize:11, color:DIM, marginTop:3 }}>{preview}</div>
                  </div>
                )}
                {sendError && (
                  <div style={{ fontSize:12, color:"#ef4444", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:8, padding:"8px 12px", marginBottom:10 }}>{sendError}</div>
                )}
                <div className="modal-footer" style={{ gap:10, breakInside:"avoid" }}>
                  <button onClick={_close} style={{ background:"transparent", color:DIM, border:`1px solid ${BORDER}`, borderRadius:14, padding:"12px 8px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Скасувати</button>
                  <button onClick={handleSend} disabled={!canSend} style={{ fontFamily:"inherit", background:canSend?"rgba(192,132,252,0.18)":"rgba(192,132,252,0.06)", color:canSend?"#c084fc":DIM, border:"none", borderRadius:14, padding:"12px 8px", fontSize:14, fontWeight:700, cursor:canSend?"pointer":"default", transition:"all 0.2s" }}>
                    {sending ? "Надсилаємо…" : "Надіслати"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// MONTH CALENDAR SHEET — bottom-sheet monthly overview, tap a day to jump
// ═══════════════════════════════════════════════════════════════
function MonthCalendarSheetBase({ bookings, onClose, onPickDate }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, TEXT, DIM, GOLD, GREEN, BLUE, RED } = useContext(ThemeContext);
  const { glow, shade, ink } = useFX();
  const isLight = BG_DEEP !== "#161719";
  const [closing, setClosing] = useState(false);
  const today0 = useRef((() => { const d = new Date(); d.setHours(12,0,0,0); return d; })()).current;
  const [viewY, setViewY] = useState(today0.getFullYear());
  const [viewM, setViewM] = useState(today0.getMonth());
  const [slideDir, setSlideDir] = useState(0);

  // Закриття покладається на onAnimationEnd — якщо CSS-подія з якоїсь
  // причини не спрацює (напр. вимкнена анімація у WebView), напівпрозорий
  // оверлей (zIndex 200, на весь екран) лишиться "приклеєним" і глушитиме
  // тапи по всій сторінці, включно з кнопкою відкриття цієї ж модалки.
  // Форсуємо закриття через таймер незалежно від animationend.
  const closeTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);
  const close = () => {
    setClosing(true);
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(onClose, 320);
  };

  // Мапа день → сумарні хвилини записів (не кількість записів — щоб два
  // двогодинні записи рахувались як 4 год, а не як "2").
  const counts = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") continue;
      const d = new Date(today0); d.setDate(d.getDate() + b.day);
      if (d.getFullYear() === viewY && d.getMonth() === viewM) {
        map[d.getDate()] = (map[d.getDate()] || 0) + (b.durMin || 60);
      }
    }
    return map;
  }, [bookings, viewY, viewM, today0]);

  const firstDow = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const monthLabel = new Date(viewY, viewM, 1).toLocaleDateString("uk-UA", { month: "long", year: "numeric" }).replace(/\s*р\.?$/i, "");
  const isCurMonth = viewY === today0.getFullYear() && viewM === today0.getMonth();

  const touchRef = useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => { const t = e.touches[0]; touchRef.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) goMonth(dx < 0 ? 1 : -1);
  };

  const tierColor = (n) => {
    if (n <= 3) return RED;
    if (n <= 6) return GOLD;
    return GREEN;
  };

  const goMonth = (delta) => {
    let m = viewM + delta, y = viewY;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setSlideDir(delta);
    setViewM(m); setViewY(y);
  };

  const pick = (day) => {
    const dateStr = `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onPickDate(dateStr);
    close();
  };

  const [heldDay, setHeldDay] = useState(null);
  const [heldClosing, setHeldClosing] = useState(false);
  const holdTimerRef = useRef(null);
  const heldRef = useRef(false);

  const getDayBookings = (d) => bookings
    .filter(b => {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") return false;
      const dt = new Date(today0); dt.setDate(dt.getDate() + b.day);
      return dt.getFullYear() === viewY && dt.getMonth() === viewM && dt.getDate() === d;
    })
    .sort((a, b) => (a.startMin || 0) - (b.startMin || 0));

  const startHold = (d) => {
    clearTimeout(holdTimerRef.current);
    heldRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      heldRef.current = true;
      setHeldDay(d);
    }, 400);
  };
  const endHold = () => {
    clearTimeout(holdTimerRef.current);
    if (heldRef.current) {
      setHeldClosing(true);
      setTimeout(() => { setHeldDay(null); setHeldClosing(false); heldRef.current = false; }, 180);
    }
  };

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Портал у document.body — шторка не повинна залежати від того, чи
  // якийсь предок (сторінка, вкладка, обгортка) має transform/filter/
  // will-change: будь-який з них перетворює predka на containing block
  // для position:fixed, і шторка тоді "прилипає" до скрол-контейнера
  // замість вікна (двічі вже ловили цей клас багів у різних предках).
  return createPortal(
    <>
      <style>{`
        @keyframes _mc-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _mc-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _mc-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _mc-bg-out{from{opacity:1}to{opacity:0}}
        @keyframes _mc-slide-next{from{transform:translateX(28px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes _mc-slide-prev{from{transform:translateX(-28px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes _mc-glass-in{
          from{ transform:translateX(var(--tx)) scale(.7); opacity:0; box-shadow:0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.35); }
          to{ transform:translateX(var(--tx)) scale(1); opacity:1; box-shadow:0 0 0 1.5px var(--glow-c), 0 0 22px var(--glow-soft), 0 10px 30px rgba(0,0,0,0.5); }
        }
        @keyframes _mc-glass-out{
          from{ transform:translateX(var(--tx)) scale(1); opacity:1; box-shadow:0 0 0 1.5px var(--glow-c), 0 0 22px var(--glow-soft), 0 10px 30px rgba(0,0,0,0.5); }
          to{ transform:translateX(var(--tx)) scale(.82); opacity:0; box-shadow:0 0 0 1px rgba(255,255,255,0.04), 0 4px 14px rgba(0,0,0,0.3); }
        }
      `}</style>
      <div onClick={closing ? undefined : close} style={{
        position:"fixed", inset:0, zIndex:200, background:shade(0.55),
        display:"flex", alignItems:"flex-end", justifyContent:"center",
        backdropFilter:"blur(8px)",
        pointerEvents: closing ? "none" : undefined,
        animation: closing ? `_mc-bg-out 0.26s ease-in forwards` : `_mc-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? onClose : undefined}
          style={{
            position:"relative", width:"100%",
            background:`radial-gradient(130% 90% at 50% 0%, color-mix(in srgb, ${BLUE} 22%, transparent), transparent 60%), ${BG}`,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.08)}, 0 -16px 60px ${shade(0.8)}`,
            display:"flex", flexDirection:"column", overflowX:"hidden", overflowY:"auto", maxHeight:"92vh",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_mc-down 0.26s ease-in forwards` : `_mc-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
            paddingBottom:"env(safe-area-inset-bottom, 0px)",
          }}>
          <button aria-label="Закрити" onClick={close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"none", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}><MetalIcon name="cross" size={32}/></button>

          <div style={{padding:"14px 16px 6px"}} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div style={{width:38, height:4, borderRadius:2, background:ink(0.1), margin:"0 auto 14px"}}/>
            <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap:14, marginBottom:14}}>
              <button aria-label="Попередній місяць" onClick={()=>goMonth(-1)} style={{
                width:30, height:30, borderRadius:9, border:"none", cursor:"pointer",
                background:ink(0.06), color:TEXT, fontSize:16, fontWeight:800,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>‹</button>
              <div style={{fontSize:15, fontWeight:800, color:TEXT, textTransform:"capitalize", minWidth:150, textAlign:"center"}}>{monthLabel}</div>
              <button aria-label="Наступний місяць" onClick={()=>goMonth(1)} style={{
                width:30, height:30, borderRadius:9, border:"none", cursor:"pointer",
                background:ink(0.06), color:TEXT, fontSize:16, fontWeight:800,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>›</button>
            </div>

            <div key={`${viewY}-${viewM}`} style={{
              maxWidth:560, margin:"0 auto",
              animation: slideDir > 0 ? `_mc-slide-next 0.22s ease-out` : slideDir < 0 ? `_mc-slide-prev 0.22s ease-out` : "none",
            }}>
              <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6}}>
                {["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].map(wd => (
                  <div key={wd} style={{fontSize:11, fontWeight:700, color:TEXT, opacity:0.78, textAlign:"center", textTransform:"uppercase"}}>{wd}</div>
                ))}
              </div>

              <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, paddingBottom:20}}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={`e${i}`}/>;
                  const n = (counts[d] || 0) / 60; // години
                  const c = tierColor(n);
                  const t = Math.min(n, 8) / 8;
                  const fillH = Math.round(t * 100);
                  const isToday = isCurMonth && d === today0.getDate();
                  const isHeld = heldDay === d;
                  const row = Math.floor(i / 7);
                  const openUp = row > 0;
                  const col = i % 7;
                  const alignLeft = col <= 1;
                  const alignRight = col >= 5;
                  const horiz = alignLeft ? { left: 0 } : alignRight ? { right: 0 } : { left: "50%" };
                  const tx = alignLeft || alignRight ? "0%" : "-50%";
                  const hAlign = alignLeft ? "left" : alignRight ? "right" : "center";
                  return (
                    <div key={d} style={{position:"relative"}}>
                      <button
                        onClick={()=>{ if (!heldRef.current) pick(d); }}
                        onPointerDown={()=>startHold(d)}
                        onPointerUp={endHold}
                        onPointerLeave={endHold}
                        onPointerCancel={endHold}
                        style={{
                          width:"100%", aspectRatio:"1", borderRadius:9, border:"none", cursor:"pointer",
                          background: ink(0.04),
                          boxShadow: isToday ? `inset 0 0 0 1.4px ${GOLD}` : "none",
                          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                          fontSize:12, fontWeight:800, color:TEXT,
                          position:"relative", overflow:"hidden", zIndex: isHeld ? 30 : 1,
                          transform: isHeld ? "scale(1.18)" : "scale(1)",
                          transition:"transform .18s ease",
                          WebkitUserSelect:"none", userSelect:"none", touchAction:"manipulation",
                        }}>
                        {n > 0 && (
                          <div style={{
                            position:"absolute", bottom:0, left:0, right:0, height:`${fillH}%`,
                            background:`linear-gradient(0deg, color-mix(in srgb, ${c} 42%, transparent), color-mix(in srgb, ${c} 16%, transparent))`,
                          }}/>
                        )}
                        <span style={{position:"relative", zIndex:1}}>{d}</span>
                        {n > 0 && <span style={{position:"relative", zIndex:1, fontSize:11, fontWeight:700, opacity:0.95, marginTop:1}}>{Number.isInteger(n) ? n : n.toFixed(1)}г</span>}
                      </button>
                      {isHeld && (
                        <div style={{
                          position:"absolute", ...horiz, [openUp ? "bottom" : "top"]:"calc(100% + 16px)",
                          transformOrigin: `${openUp ? "bottom" : "top"} ${hAlign}`,
                          zIndex:31, width:210, maxWidth:"72vw",
                          background:`color-mix(in srgb, ${SURF_HI} 68%, transparent)`,
                          backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
                          borderRadius:14,
                          padding:"13px 14px", pointerEvents:"none",
                          "--glow-c": c, "--glow-soft": `color-mix(in srgb, ${c} 45%, transparent)`, "--tx": tx,
                          animation: heldClosing ? `_mc-glass-out 0.24s ease-in forwards` : `_mc-glass-in 0.4s cubic-bezier(0.25,1,0.4,1) forwards`,
                        }}>
                          <div style={{fontSize:13, fontWeight:800, color:TEXT, marginBottom:6}}>
                            {d} {monthLabel.split(" ")[0]}
                          </div>
                          {(() => {
                            const list = getDayBookings(d);
                            if (!list.length) return <div style={{fontSize:11.5, color:DIM}}>Немає записів</div>;
                            return list.slice(0, 6).map((b, idx) => (
                              <div key={b.id || idx} style={{fontSize:11.5, color:TEXT, lineHeight:1.65, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                                <span style={{color:DIM, fontWeight:700}}>{fmtTime(b.startMin)}</span> {b.name || "Подія"}
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  , document.body);
}

// ═══════════════════════════════════════════════════════════════
// DAY NOTES MODAL — нотатка дня: вибір годин + текст
// ═══════════════════════════════════════════════════════════════
const _fmtHM = (min) => `${String(Math.floor(min/60)).padStart(2,"0")}:${String(min%60).padStart(2,"0")}`;

function DayNotesModalBase({ dateStr, dayLabel, dayNum, dayMonth, note, settings, onClose }) {
  const { BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, SO, SI } = useContext(ThemeContext);
  const { glow, shade } = useFX();
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingHour, setEditingHour] = useState(null);
  const _close = () => setClosing(true);
  useBackClose(true, _close); // системна «назад» закриває вікно, а не застосунок

  const hours = [];
  for (let h = settings.workStart; h < settings.workEnd; h++) hours.push(h);

  const [rows, setRows] = useState(() => {
    const saved = note?.notes || {};
    const init = {};
    hours.forEach(h => {
      const s = saved[h];
      init[h] = s ? { startMin: s.startMin, text: s.text || "", notify: !!s.notify } : { startMin: h*60, text: "", notify: false };
    });
    return init;
  });

  const clampMin = (m) => Math.max(Math.round(settings.workStart*60), Math.min(Math.round(settings.workEnd*60) - 1, m));
  const setRow = (h, patch) => setRows(rs => ({ ...rs, [h]: { ...rs[h], ...patch } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const notesOut = {};
      hours.forEach(h => {
        const r = rows[h];
        if (r.text.trim() || r.notify) {
          notesOut[h] = { startMin: r.startMin, text: r.text.trim(), notify: r.notify };
        }
      });
      if (!Object.keys(notesOut).length) {
        await remove(iRef( `dayNotes/${dateStr}`));
      } else {
        await update(iRef( `dayNotes/${dateStr}`), { notes: notesOut, updatedAt: Date.now() });
      }
      _close();
    } catch (e) { /* ignore */ } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try { await remove(iRef( `dayNotes/${dateStr}`)); _close(); }
    catch (e) { /* ignore */ } finally { setSaving(false); }
  };

  const hasAnyNote = !!note;

  return (
    <>
      <style>{`
        @keyframes _dn-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _dn-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _dn-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _dn-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed", inset:0, zIndex:9999,
        background:shade(0.55), backdropFilter:"blur(8px)",
        display:"flex", alignItems:"flex-end", justifyContent:"center",
        animation: closing ? `_dn-bg-out 0.26s ease-in forwards` : `_dn-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            position:"relative",
            width:"100%", background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${GOLD}33, 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh", overflowY:"auto",
            padding:"12px 16px calc(20px + env(safe-area-inset-bottom))",
            boxSizing:"border-box",
            animation: closing ? `_dn-down 0.26s ease-in forwards` : `_dn-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <div style={{width:36,height:4,borderRadius:2,background:glow(0.15),margin:"0 auto 12px"}}/>
          <button aria-label="Закрити" onClick={_close} style={{
            position:"absolute", top:12, right:14, zIndex:5,
            width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"none", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}><MetalIcon name="cross" size={32}/></button>
          <div style={{textAlign:"center",padding:"0 36px",marginBottom:6}}>
            <div style={{fontSize:16,fontWeight:800,color:TEXT}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="note" size={28}/>Нотатки — {dayLabel}, {dayNum} {dayMonth}</span></div>
          </div>
          <Hint style={{marginBottom:14}}>
            Натисніть на час, щоб уточнити його. Дзвіночок вмикає нагадування.
          </Hint>

          <div className="win-cols win-gap" style={{marginBottom:18}}>
            {hours.map(h=>{
              const r = rows[h];
              const isEditing = editingHour === h;
              return (
                <div key={h} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  {isEditing ? (
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,flexBasis:"100%",flexWrap:"wrap"}}>
                      <button onClick={()=>setRow(h,{startMin:clampMin(r.startMin-60)})} aria-label="Мінус година" style={{
                        width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",
                        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:22,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0,
                      }}>−</button>
                      <div style={{width:34,textAlign:"center",fontSize:20,fontWeight:800,color:TEXT,fontVariantNumeric:"tabular-nums"}}>
                        {String(Math.floor(r.startMin/60)).padStart(2,"0")}
                      </div>
                      <button onClick={()=>setRow(h,{startMin:clampMin(r.startMin+60)})} aria-label="Плюс година" style={{
                        width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",
                        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:22,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0,
                      }}>+</button>
                      <span style={{color:FAINT,fontSize:20,fontWeight:800}}>:</span>
                      <button onClick={()=>setRow(h,{startMin:clampMin(r.startMin-1)})} aria-label="Мінус хвилина" style={{
                        width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",
                        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:22,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0,
                      }}>−</button>
                      <div style={{width:34,textAlign:"center",fontSize:20,fontWeight:800,color:TEXT,fontVariantNumeric:"tabular-nums"}}>
                        {String(r.startMin%60).padStart(2,"0")}
                      </div>
                      <button onClick={()=>setRow(h,{startMin:clampMin(r.startMin+1)})} aria-label="Плюс хвилина" style={{
                        width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",
                        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:22,fontWeight:800,
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0,
                      }}>+</button>
                      <div onClick={()=>setEditingHour(null)} style={{
                        width:44,height:44,borderRadius:12,background:`${GOLD}33`,color:GOLD,
                        display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:20,fontWeight:800,flexShrink:0,marginLeft:4,
                      }}>✓</div>
                    </div>
                  ) : (
                    <div onClick={()=>setEditingHour(h)} style={{
                      width:58, minHeight:44, display:"flex", alignItems:"center", flexShrink:0, cursor:"pointer", fontSize:15, fontWeight:800, color:GOLD,
                      fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap",
                    }}>{_fmtHM(r.startMin)}</div>
                  )}
                  <input value={r.text} onChange={e=>setRow(h,{text:e.target.value})} placeholder="—"
                    style={{
                      flex:1, minWidth:0, minHeight:44, boxSizing:"border-box",
                      background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,
                      border:`1px solid ${BORDER}`, outline:"none", color:TEXT, fontSize:16,
                      padding:"10px 12px", borderRadius:14, boxShadow:SI, fontFamily:"inherit",
                    }}/>
                  <div onClick={()=>setRow(h,{notify:!r.notify})} title={r.notify?"Нагадування увімкнено":"Нагадування вимкнено"} style={{
                    width:44, height:44, borderRadius:12, flexShrink:0, cursor:"pointer",
                    background: r.notify ? `${GOLD}2a` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
                    boxShadow: r.notify ? "none" : SO,
                  }}>{r.notify ? <MetalIcon name="bell" size={28}/> : <MetalIcon name="bell" size={28} style={{opacity:0.45}}/>}</div>
                </div>
              );
            })}
          </div>

          <div className="modal-footer" style={{gap:10}}>
            <button onClick={_close} style={{
              padding:"15px 8px", borderRadius:14, border:`1px solid ${BORDER}`, cursor:"pointer",
              background:"transparent", color:DIM, fontSize:15, fontWeight:800, fontFamily:"inherit",
            }}>Скасувати</button>
            <button onClick={handleSave} disabled={saving} style={{
              padding:"15px 8px", borderRadius:14, border:"none", cursor:"pointer",
              background:`linear-gradient(145deg,${GOLD}cc,${GOLD}88)`, color:"#1a1a1a",
              fontSize:15, fontWeight:800, fontFamily:"inherit", boxShadow:SO,
            }}>{saving ? "Збереження…" : "Зберегти"}</button>
          </div>
          {hasAnyNote && (
            <div style={{display:"flex",justifyContent:"center",marginTop:10}}>
              <button onClick={handleDelete} disabled={saving} style={{
                padding:"12px 20px", borderRadius:14, border:"1px solid rgba(239,68,68,0.25)",
                cursor:"pointer", background:"rgba(239,68,68,0.08)", color:"#fca5a5",
                fontSize:14, fontWeight:700, fontFamily:"inherit",
              }}>Видалити всі</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const BroadcastModal = (p) => <FogScope><BroadcastModalBase {...p}/></FogScope>;
const MonthCalendarSheet = (p) => <FogScope><MonthCalendarSheetBase {...p}/></FogScope>;
const DayNotesModal = (p) => <FogScope><DayNotesModalBase {...p}/></FogScope>;

export { BroadcastModal, MonthCalendarSheet, DayNotesModal };
