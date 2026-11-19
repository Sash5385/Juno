// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useState, useRef, useEffect, useMemo, useContext } from "react";
import { MetalIcon } from "../../MetalIcon";
import { update } from "firebase/database";
import { iRef, slotRoot } from "../../firebase";
import { ThemeContext, GREEN } from "../../theme.js";
import { useFX, useBackClose } from "../../ui";
import FogScope from "../../FogScope";
import { getDayInfo, fmtTime } from "./shared.jsx";

// ═══════════════════════════════════════════════════════════════
// CREATE SLOT SHEET — вільний слот з вибором часу і тривалості
// ═══════════════════════════════════════════════════════════════
function CreateSlotSheetBase({ data, settings, onClose }) {
  const { BG_DEEP, BORDER, TEXT, DIM, FAINT, GLOW, SHADE } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`;
  const TEXT_DIM = DIM, TEXT_FAINT = FAINT;
  const slotStep = settings.slotCreateStep || 30;
  const timeItems = useMemo(() => {
    const arr = [];
    for (let m = Math.round(settings.workStart * 60); m < Math.round(settings.workEnd * 60); m += slotStep)
      arr.push({ label: fmtTime(m), value: m });
    return arr;
  }, [settings.workStart, settings.workEnd, slotStep]);

  const durItems = [
    { label:"1 год",  value:60  },
    { label:"2 год",  value:120 },
    { label:"3 год",  value:180 },
    { label:"4 год",  value:240 },
  ];

  const initTimeIdx = Math.max(0, timeItems.findIndex(t => t.value >= (data.startMin || 0)));
  const [timeIdx, setTimeIdx] = useState(initTimeIdx);
  const [durIdx,  setDurIdx]  = useState(1);
  const [saving,  setSaving]  = useState(false);
  const [closing, setClosing] = useState(false);

  const day = getDayInfo(data.day);
  const _close = () => setClosing(true);
  useBackClose(true, _close); // системна «назад» закриває вікно, а не застосунок

  const handleCreate = async () => {
    setSaving(true);
    const startMin = timeItems[timeIdx]?.value ?? data.startMin;
    const dur = durItems[durIdx].value;
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + data.day);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const updates = {};
    for (let m = startMin; m < startMin + dur; m += 60) {
      const h = String(Math.floor(m / 60)).padStart(2, '0');
      const mn = String(m % 60).padStart(2, '0');
      const id = `slot${h}${mn}`;
      updates[`${slotRoot()}/${dateStr}/${id}/time`] = `${h}:${mn}`;
      updates[`${slotRoot()}/${dateStr}/${id}/available`] = true;
    }
    await update(iRef(), updates).catch(() => {});
    setSaving(false);
    _close();
  };

  return (
    <>
      <style>{`
        @keyframes _cs-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _cs-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _cs-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _cs-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,zIndex:200,background:shade(0.55),
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_cs-bg-out 0.26s ease-in forwards` : `_cs-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{ setClosing(false); onClose(); } : undefined}
          style={{
            position:"relative",
            width:"100%",background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.12)}, 0 -16px 60px ${shade(0.6)}`,
            overflow:"hidden",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_cs-down 0.26s ease-in forwards` : `_cs-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <button aria-label="Закрити" onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"none", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}><MetalIcon name="cross" size={32}/></button>
          <div style={{
            padding:"10px 20px 14px",
            background:shade(0.04),
            borderBottom:`1px solid ${glow(0.08)}`,
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:glow(0.2),margin:"0 auto 12px"}}/>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,textAlign:"center",padding:"0 36px"}}>
              Вільний слот · {day.fullLabel} {day.num}
            </div>
          </div>
          <div style={{padding:"16px 20px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:TEXT_DIM,letterSpacing:1,marginBottom:6,textAlign:"center"}}>ПОЧАТОК</div>
                <DrumRoll items={timeItems} currentIdx={timeIdx} onChange={setTimeIdx} itemH={40} visible={3}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:TEXT_DIM,letterSpacing:1,marginBottom:6,textAlign:"center"}}>ТРИВАЛІСТЬ</div>
                <DrumRoll items={durItems} currentIdx={durIdx} onChange={setDurIdx} itemH={40} visible={3}/>
              </div>
            </div>
            <div className="modal-footer" style={{gap:10,marginBottom:16}}>
            <button onClick={_close} style={{
              padding:14,borderRadius:14,border:`1.5px solid ${BORDER}`,cursor:"pointer",fontFamily:"inherit",
              background:"transparent",color:TEXT_DIM,fontSize:14,fontWeight:800,
            }}>Скасувати</button>
            <button onClick={handleCreate} disabled={saving} style={{
              padding:14,borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
              background:saving?shade(0.06):`linear-gradient(165deg,${GREEN},#16a34a)`,
              color:saving?TEXT_FAINT:"#fff",fontSize:14,fontWeight:800,
              boxShadow:saving?"none":`0 4px 16px rgba(99,211,120,0.4),inset 1px 1px 0 ${glow(0.25)}`,
            }}>{saving ? "Створюємо..." : "Створити"}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
const CreateSlotSheet = (p) => <FogScope><CreateSlotSheetBase {...p}/></FogScope>;
const PersonalEventModal = (p) => <FogScope><PersonalEventModalBase {...p}/></FogScope>;

// ═══════════════════════════════════════════════════════════════
// DRUM ROLL PICKER (iOS-style scroll wheel)
// ═══════════════════════════════════════════════════════════════
function DrumRoll({ items, currentIdx, onChange, label, itemH=42, visible=4 }) {
  const { BG_DEEP, SURF_LO, DIM, FAINT, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, SHADOW_IN = SI;
  const ref = useRef(null);
  const timerRef = useRef(null);
  const containerH = itemH * visible;
  const padV = Math.floor(visible / 2) * itemH;

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = currentIdx * itemH;
  }, [currentIdx, itemH]);

  const handleScroll = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollTop / itemH)));
      onChange(idx);
    }, 80);
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"stretch"}}>
      {label && <div style={{fontSize:11,color:TEXT_FAINT,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,textAlign:"center",marginBottom:5}}>{label}</div>}
      <div style={{position:"relative",height:containerH,borderRadius:14,overflow:"hidden",
        background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,boxShadow:SHADOW_IN}}>
        {/* Center green highlight */}
        <div style={{
          position:"absolute",zIndex:2,pointerEvents:"none",
          top:Math.floor(visible/2)*itemH, left:4, right:4, height:itemH,
          borderRadius:10,
          background:"rgba(126,217,87,0.13)",
          border:"1.5px solid rgba(126,217,87,0.4)"
        }}/>
        {/* Top/bottom fade */}
        <div style={{
          position:"absolute",zIndex:3,inset:0,pointerEvents:"none",
          background:`linear-gradient(to bottom,${BG_DEEP}EE 0%,transparent 36%,transparent 64%,${BG_DEEP}EE 100%)`
        }}/>
        {/* Scrollable list */}
        <div ref={ref} className="drum-scroll" onScroll={handleScroll} style={{
          position:"absolute",inset:0,
          overflowY:"scroll",overflowX:"hidden",
          scrollSnapType:"y mandatory",
          WebkitOverflowScrolling:"touch",
          scrollbarWidth:"none",
          paddingTop:padV, paddingBottom:padV,
        }}>
          {items.map((item,i)=>{
            const dist = Math.abs(i - currentIdx);
            return (
              <div key={i} onClick={()=>{
                ref.current?.scrollTo({top:i*itemH,behavior:"smooth"});
                onChange(i);
              }} style={{
                height:itemH, flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",
                scrollSnapAlign:"center",
                fontSize:dist===0?14:11,
                fontWeight:dist===0?800:500,
                color:dist===0?GREEN:TEXT_DIM,
                opacity:dist===0?1:Math.max(0.2,1-dist*0.3),
                userSelect:"none",cursor:"pointer",
                textAlign:"center",padding:"0 4px",lineHeight:1.3,
              }}>{item.label}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PERSONAL EVENT MODAL — bottom sheet для особистих подій
// ═══════════════════════════════════════════════════════════════
function PersonalEventModalBase({ data, onClose, onConfirm }) {
  const { BG_DEEP, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT } = useContext(ThemeContext);
  const { shade, ink } = useFX();

  const [title,          setTitle]          = useState("");
  const [durMin,         setDurMin]         = useState(60);
  const [note,           setNote]           = useState("");
  const [peDate,         setPeDate]         = useState("");
  const [peTime,         setPeTime]         = useState("");
  const [reminderHours,  setReminderHours]  = useState(null);
  const [closing,        setClosing]        = useState(false);
  const [pendingEvent,   setPendingEvent]   = useState(null);

  useEffect(() => {
    if (data) { setTitle(""); setDurMin(60); setNote(""); setPeDate(data.dateStr); setPeTime(data.time); setReminderHours(null); }
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data && !closing) return null;

  const [hh, mm] = peTime.split(":").map(Number);
  const startMin = hh * 60 + mm;
  const today = new Date(); today.setHours(0,0,0,0);
  const slotDate = new Date(peDate + "T00:00:00");
  const day = Math.round((slotDate - today) / 86400000);
  const canSave = title.trim().length > 0;

  const _close = () => setClosing(true);

  return (
    <>
      <style>{`
        @keyframes _pe-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _pe-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _pe-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _pe-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div onClick={closing ? undefined : _close} style={{
        position:"fixed",inset:0,background:shade(0.55),zIndex:200,
        display:"flex",alignItems:"flex-end",justifyContent:"center",
        backdropFilter:"blur(8px)",
        animation: closing ? `_pe-bg-out 0.26s ease-in forwards` : `_pe-bg-in 0.2s ease-out`,
      }}>
        <div onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{
            setClosing(false);
            setPendingEvent(null);
            if (pendingEvent) onConfirm(pendingEvent);
            else onClose();
          } : undefined}
          style={{
            position:"relative",
            width:"100%",background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 rgba(45,212,191,0.3), 0 -16px 60px ${shade(0.6)}`,
            maxHeight:"85vh",overflowY:"auto",
            WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
            pointerEvents: closing ? "none" : undefined,
            animation: closing ? `_pe-down 0.26s ease-in forwards` : `_pe-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}>
          <button aria-label="Закрити" onClick={_close} style={{
            position:"absolute", top:10, right:12, zIndex:5,
            width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"none", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}><MetalIcon name="cross" size={32}/></button>
          <div style={{
            padding:"10px 18px 14px",
            background:"linear-gradient(145deg,rgba(45,212,191,0.12),rgba(20,184,166,0.05))",
            borderBottom:"1px solid rgba(45,212,191,0.15)",
            borderRadius:"24px 24px 0 0",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:"rgba(45,212,191,0.35)",margin:"0 auto 12px"}}/>
            <div style={{textAlign:"center",padding:"0 36px"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#2dd4bf",marginBottom:2}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="pushpin" size={28}/>Особиста подія</span></div>
            <div style={{fontSize:12,color:DIM}}>{peDate} · {peTime}</div>
            </div>
          </div>

          <div className="win-cols win-gap" style={{padding:"16px 18px 32px",gap:16}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}><MetalIcon name="edit" size={18}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Назва</div>
                <input
                  value={title}
                  onChange={e=>setTitle(e.target.value)}
                  placeholder="Наприклад: Лікар, Справи..."
                  style={{
                    width:"100%",padding:"10px 12px",borderRadius:14,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                />
              </div>
            </div>

            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}><MetalIcon name="calendar" size={18}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Дата</div>
                <input
                  type="date"
                  value={peDate}
                  onChange={e=>setPeDate(e.target.value)}
                  style={{
                    width:"100%",padding:"10px 12px",borderRadius:14,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                />
              </div>
            </div>

            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}><MetalIcon name="clock" size={18}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Час</div>
                <div style={{display:"flex",gap:6}}>
                  <select
                    value={peTime.split(":")[0] || "09"}
                    onChange={e=>setPeTime(`${e.target.value}:${peTime.split(":")[1] || "00"}`)}
                    style={{flex:1,padding:"9px 4px",borderRadius:10,background:SURF_LO,border:`1px solid ${BORDER}`,color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}
                  >
                    {Array.from({length:24},(_,h)=>String(h).padStart(2,"0")).map(h=>(
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    value={peTime.split(":")[1] || "00"}
                    onChange={e=>setPeTime(`${peTime.split(":")[0] || "09"}:${e.target.value}`)}
                    style={{flex:1,padding:"9px 4px",borderRadius:10,background:SURF_LO,border:`1px solid ${BORDER}`,color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}
                  >
                    {["00","05","10","15","20","25","30","35","40","45","50","55"].map(m=>(
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>⏱</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Тривалість</div>
                <div style={{display:"flex",gap:6}}>
                  <select
                    value={String(Math.floor(durMin/60))}
                    onChange={e=>setDurMin(Math.max(15, Number(e.target.value)*60 + (durMin%60)))}
                    style={{
                      flex:1,padding:"9px 4px",borderRadius:10,
                      background:SURF_LO,border:`1px solid ${BORDER}`,
                      color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                    }}
                  >
                    {[0,1,2,3,4,5].map(h=>(
                      <option key={h} value={h}>{h} год</option>
                    ))}
                  </select>
                  <select
                    value={String(durMin%60).padStart(2,"0")}
                    onChange={e=>setDurMin(Math.max(15, Math.floor(durMin/60)*60 + Number(e.target.value)))}
                    style={{
                      flex:1,padding:"9px 4px",borderRadius:10,
                      background:SURF_LO,border:`1px solid ${BORDER}`,
                      color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                    }}
                  >
                    {["00","15","30","45"].map(m=>(
                      <option key={m} value={m}>{m} хв</option>
                    ))}
                  </select>
                </div>
                <div style={{display:"flex",gap:4,marginTop:6}}>
                  {[1,2,3,4,5].map(h=>(
                    <button key={h} onClick={()=>setDurMin(h*60)} style={{
                      flex:1,padding:"5px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
                      background: durMin===h*60 ? "rgba(45,212,191,0.2)" : SURF_HI,
                      color: durMin===h*60 ? "#2dd4bf" : DIM,
                    }}>{`${h}г`}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Нотатка</div>
              <textarea
                value={note}
                onChange={e=>setNote(e.target.value)}
                rows={2}
                placeholder="Деталі..."
                style={{
                  width:"100%",padding:"10px 12px",borderRadius:14,resize:"none",
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              />
            </div>

            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:18,background:"rgba(45,212,191,0.15)",color:"#2dd4bf",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}><MetalIcon name="timer" size={18}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:7}}>Нагадування з будильником</div>
                <select
                  value={reminderHours ?? ""}
                  onChange={e=>setReminderHours(e.target.value === "" ? null : Number(e.target.value))}
                  style={{
                    width:"100%",padding:"10px 12px",borderRadius:14,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                >
                  <option value="">Без нагадування</option>
                  <option value="0.25">За 15 хв</option>
                  <option value="0.5">За 30 хв</option>
                  <option value="1">За 1 годину</option>
                  <option value="2">За 2 години</option>
                  <option value="4">За 4 години</option>
                  <option value="24">За 1 день</option>
                </select>
              </div>
            </div>

            <div className="modal-footer" style={{gap:10,breakInside:"avoid"}}>
            <button onClick={_close} style={{
                padding:"13px 8px",borderRadius:14,border:`1px solid ${BORDER}`,cursor:"pointer",fontFamily:"inherit",
                background:"transparent",color:DIM,fontSize:14,fontWeight:800,
              }}>Скасувати</button>
            <button
              disabled={!canSave}
              onClick={()=>{
                if (!canSave) return;
                setPendingEvent({
                  id: `personal-${Date.now()}`,
                  day, date: peDate,
                  startMin, durMin,
                  name: title.trim(),
                  note: note.trim(),
                  type: "personal",
                  status: "personal",
                  reminderHours,
                  wasAdminBlocked: (peDate === data.dateStr && peTime === data.time) ? !!data.slot?.adminBlocked : false,
                  createdAt: Date.now(),
                  createdBy: "admin",
                });
                _close();
              }}
              style={{
                padding:"13px 8px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
                background: canSave ? "linear-gradient(145deg,#2dd4bf,#14b8a6)" : ink(0.07),
                color: canSave ? "#fff" : FAINT,
                fontSize:14,fontWeight:800,
                boxShadow: canSave ? "0 4px 16px rgba(45,212,191,0.35)" : "none",
              }}
            >Зберегти</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export { CreateSlotSheet, PersonalEventModal };
