import { useState, useEffect, useContext } from "react";
import { createPortal } from "react-dom";
import { ref, onValue, update, push, remove, get } from "firebase/database";
import { db } from "../firebase";

import { ThemeContext } from "../theme.js";
import { UICss, Field, Btn as UIBtn, useFX } from "../ui";

const M = ["","Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
const fmtS = d => { if(!d) return "—"; const [,m,day]=d.split("-"); return `${parseInt(day)} ${M[parseInt(m)]}`; };
const navTo = tab => window.dispatchEvent(new CustomEvent("id4drive-nav", {detail:tab}));

const Svg = (d, s=18, c="white", w=2) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const ICONS = {
  phone:    Svg(<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.05A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></>),
  viber:    Svg(<><path d="M21 12c0 5-4 8-9 8a16 16 0 0 1-4-.7L3 21l1-4C2.5 15.5 2 13.8 2 12c0-5 4-8 9-8s10 3 10 8z"/></>),
  telegram: Svg(<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>),
  chat:     Svg(<><path d="M21 12c0 5-4 8-9 8a16 16 0 0 1-4-.7L3 21l1-4C2.5 15.5 2 13.8 2 12c0-5 4-8 9-8s10 3 10 8z"/></>),
  edit:     Svg(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></>),
  ban:      Svg(<><circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/></>, 18, "white", 2.2),
  unban:    Svg(<><polyline points="20 6 9 17 4 12"/></>, 18, "white", 2.5),
  search:   Svg(<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>, 15, "#5a5c62"),
  trash:    Svg(<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>, 18, "white", 2),
};

// ─── ACTION BUTTON ───────────────────────────────────────────────
function ActBtn({ icon, label, onClick, color, danger }) {
  const { SURFACE, SURF_HI, DIM, SO } = useContext(ThemeContext);
  const bg = danger
    ? "linear-gradient(145deg,rgba(239,68,68,.2),rgba(185,28,28,.12))"
    : color ? `linear-gradient(145deg,${color}22,${color}11)` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`;
  return (
    <button className="act-btn" onClick={onClick} style={{background:bg,boxShadow:SO}}>
      {icon}
      <span style={{color:danger?"#fca5a5":color||DIM}}>{label}</span>
    </button>
  );
}

// ─── PROGRESS BAR ────────────────────────────────────────────────
function Progress({ hours, offset }) {
  const { BG_DEEP, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, SI } = useContext(ThemeContext);
  const { glow } = useFX();
  const total = hours + (offset || 0);
  const pct = Math.min((total / 40) * 100, 100);
  const done = pct >= 100;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:11,color:DIM}}>Прогрес автошколи</span>
        <span style={{fontSize:11,fontWeight:800,color:done?ACCENT:GREEN}}>{total}/40 год · {Math.round(pct)}%</span>
      </div>
      <div style={{height:5,background:BG_DEEP,borderRadius:3,boxShadow:SI,overflow:"hidden"}}>
        {offset > 0 ? (
          <div style={{position:"relative",height:"100%",width:`${pct}%`,borderRadius:3,
            background:done?`linear-gradient(90deg,${ACC_HI},${ACCENT})`:`linear-gradient(90deg,${BLUE},${GREEN})`,
            boxShadow:`0 0 6px ${done?ACCENT:GREEN}44`,overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,
              width:`${Math.min((offset/total)*100,100)}%`,background:glow(0.18)}}/>
          </div>
        ) : (
          <div style={{height:"100%",width:`${pct}%`,borderRadius:3,
            background:done?`linear-gradient(90deg,${ACC_HI},${ACCENT})`:`linear-gradient(90deg,${BLUE},${GREEN})`,
            boxShadow:`0 0 6px ${done?ACCENT:GREEN}44`}}/>
        )}
      </div>
      {offset > 0 && <div style={{fontSize:9,color:FAINT,marginTop:3}}>з них {offset} год додано · {hours} год тут</div>}
    </div>
  );
}

// ─── STUDENT FORM (shared: new + edit) ───────────────────────────
function StudentForm({ initial, onSave, onCancel, saveLabel="Зберегти" }) {
  const { BG_DEEP, TEXT, DIM, FAINT, BORDER, SO } = useContext(ThemeContext);
  const [d, setD] = useState(initial);
  const upd = (k,v) => setD(x=>({...x,[k]:v}));
  const valid = (d.name||"").trim();
  return (
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
        <Field label="Ім'я"      value={d.name||""}     onChange={v=>upd("name",v)}     placeholder="Ім'я Прізвище" style={{marginBottom:0}}/>
        <Field label="Телефон"   value={d.phone||""}    onChange={v=>upd("phone",v)}    placeholder="+380..." style={{marginBottom:0}}/>
        <Field label="Знижка %"  value={d.discount||""} onChange={v=>upd("discount",v)} placeholder="0" type="number" style={{marginBottom:0}}/>
        <div>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:5}}>ТИП</div>
          <div style={{display:"flex",gap:6}}>
            {[["private","Приват."],["school","Автошк."]].map(([k,l])=>(
              <UIBtn key={k} variant={d.type===k?"primary":"ghost"} flex={1}
                style={{padding:"7px 4px",borderRadius:8,fontSize:11}}
                onClick={()=>upd("type",k)}>{l}</UIBtn>
            ))}
          </div>
        </div>
      </div>
      {d.type==="school" && (
        <div>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:5}}>ТСЦ</div>
          <div style={{display:"flex",gap:6}}>
            {[["ТСЦ 8041","8041"],["ТСЦ 8042","8042"]].map(([val,lbl])=>(
              <UIBtn key={val} variant={d.tsc===val?"primary":"ghost"} flex={1}
                style={{padding:"7px 4px",borderRadius:8,fontSize:11}}
                onClick={()=>upd("tsc",val)}>{lbl}</UIBtn>
            ))}
          </div>
        </div>
      )}
      <div onClick={()=>upd("isVip",!d.isVip)} style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 12px",borderRadius:10,cursor:"pointer",
        background:d.isVip?"rgba(168,85,247,0.12)":BG_DEEP,
        border:d.isVip?"1px solid rgba(168,85,247,0.35)":`1px solid ${BORDER}`,
      }}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:d.isVip?"#c084fc":TEXT}}>VIP учень</div>
          <div style={{fontSize:10,color:FAINT,marginTop:2}}>{d.isVip?"Має доступ до VIP слотів":"Без доступу до VIP слотів"}</div>
        </div>
        <div style={{width:36,height:20,borderRadius:10,position:"relative",background:d.isVip?"linear-gradient(145deg,#a855f7,#7c3aed)":"rgba(255,255,255,0.08)",transition:"background .2s",flexShrink:0}}>
          <div style={{position:"absolute",top:2,left:d.isVip?18:2,width:16,height:16,borderRadius:8,background:"#fff",transition:"left .2s"}}/>
        </div>
      </div>
      <div onClick={()=>upd("noIntervalLimit",!d.noIntervalLimit)} style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 12px",borderRadius:10,cursor:"pointer",
        background:d.noIntervalLimit?"rgba(234,179,8,0.10)":BG_DEEP,
        border:d.noIntervalLimit?"1px solid rgba(234,179,8,0.35)":`1px solid ${BORDER}`,
      }}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:d.noIntervalLimit?"#eab308":TEXT}}>Без ліміту частоти записів</div>
          <div style={{fontSize:10,color:FAINT,marginTop:2}}>{d.noIntervalLimit?"Ігнорує обмеження мінімального інтервалу":"Застосовується загальне обмеження"}</div>
        </div>
        <div style={{width:36,height:20,borderRadius:10,position:"relative",background:d.noIntervalLimit?"linear-gradient(145deg,#eab308,#ca8a04)":"rgba(255,255,255,0.08)",transition:"background .2s",flexShrink:0}}>
          <div style={{position:"absolute",top:2,left:d.noIntervalLimit?18:2,width:16,height:16,borderRadius:8,background:"#fff",transition:"left .2s"}}/>
        </div>
      </div>
      <Field label="Нотатки" value={d.notes||""} onChange={v=>upd("notes",v)} placeholder="Нотатки…" textarea rows={2} style={{marginBottom:0}}/>
      <div style={{display:"flex",gap:7}}>
        <UIBtn variant="primary" flex={1} disabled={!valid} onClick={()=>valid&&onSave(d)}>{saveLabel}</UIBtn>
        <UIBtn variant="ghost"   flex={1} onClick={onCancel}>Скасувати</UIBtn>
      </div>
    </div>
  );
}

// ─── STUDENT CARD (collapsed row only) ──────────────────────────
function StudentCard({ s, onSelect }) {
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, TEXT, DIM, FAINT, GREEN, GOLD, RED, SI } = useContext(ThemeContext);
  const typeColor = s.type === "school" ? GREEN : GOLD;
  const typeLabel = s.type === "school" ? "Автошкола" : "Приватний";
  const ini       = s.name.split(" ").map(w=>w[0]).slice(0,2).join("");
  const barColor  = s.blocked ? RED : typeColor;

  return (
    <div
      onClick={() => onSelect(s)}
      style={{
        background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`, borderRadius:12, boxShadow:SI,
        border:`1px solid ${BORDER}`, opacity:s.blocked?0.8:1,
        display:"flex", overflow:"hidden", cursor:"pointer",
      }}
    >
      <div style={{width:4,background:barColor,flexShrink:0}} />
      <div style={{flex:1,padding:"9px 10px 9px 12px",display:"flex",alignItems:"center",gap:9,minWidth:0}}>
        <div className="icon3d" style={{
          width:36,height:36,borderRadius:11,flexShrink:0,
          background:`linear-gradient(145deg,${barColor}44,${barColor}18)`,
          fontSize:13,fontWeight:900,color:barColor,
        }}>{ini}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:s.blocked?DIM:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {s.name}{s.blocked && <span style={{fontSize:9,color:RED,fontWeight:700,marginLeft:6}}>🚫</span>}
          </div>
          <div style={{fontSize:10,color:typeColor,fontWeight:700,marginTop:2}}>{typeLabel}{s.tsc ? ` · ${s.tsc}` : ""}</div>
        </div>
        <button onClick={e=>{e.stopPropagation();navTo("chats");}} style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0}}>
          <div className="icon3d" style={{width:26,height:26,background:"linear-gradient(145deg,rgba(91,155,255,.35),rgba(37,99,235,.2))",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {ICONS.chat}
          </div>
        </button>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>
  );
}

// ─── STUDENT DETAIL SHEET ────────────────────────────────────────
function StudentDetailSheet({ s, onClose, onUpdate, onDelete, onBlock }) {
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, GOLD, RED, SO, SI } = useContext(ThemeContext);
  const { shade, glow, ink } = useFX();
  const [closing,      setClosing]     = useState(false);
  const [editMode,     setEditMode]    = useState(false);
  const [confirmDel,   setConfirmDel]  = useState(false);
  const [pendingDelete,setPendingDelete] = useState(false);

  const typeColor = s.type === "school" ? GREEN : GOLD;
  const typeLabel = s.type === "school" ? "Автошкола" : "Приватний";
  const phone     = (s.phone||"").replace(/\D/g,"");
  const ini       = s.name.split(" ").map(w=>w[0]).slice(0,2).join("");
  const barColor  = s.blocked ? RED : typeColor;

  const _close = () => setClosing(true);

  return (
    <>
      <style>{`
        @keyframes _sd-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes _sd-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
        @keyframes _sd-bg-in{from{opacity:0}to{opacity:1}}
        @keyframes _sd-bg-out{from{opacity:1}to{opacity:0}}
      `}</style>
      <div
        onClick={closing ? undefined : _close}
        style={{
          position:"fixed",inset:0,zIndex:200,
          background:shade(0.55),backdropFilter:"blur(8px)",
          display:"flex",alignItems:"flex-end",justifyContent:"center",
          animation:closing ? `_sd-bg-out 0.26s ease-in forwards` : `_sd-bg-in 0.2s ease-out`,
        }}
      >
        <div
          onClick={e=>e.stopPropagation()}
          onAnimationEnd={closing ? ()=>{
            setClosing(false);
            if (pendingDelete) onDelete(s.id);
            onClose();
          } : undefined}
          style={{
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.08)},0 -16px 60px ${shade(0.8)}`,
            display:"flex",flexDirection:"column",
            maxHeight:"92vh",overflow:"hidden",
            pointerEvents:closing?"none":undefined,
            animation:closing ? `_sd-down 0.26s ease-in forwards` : `_sd-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}
        >
          {/* Handle */}
          <div style={{width:36,height:4,borderRadius:2,background:glow(0.15),margin:"10px auto 0",flexShrink:0}} />

          {/* Header */}
          <div style={{
            display:"flex",alignItems:"center",gap:10,padding:"14px 16px 12px",
            borderBottom:`1px solid ${BORDER}`,flexShrink:0,
          }}>
            <div className="icon3d" style={{
              width:42,height:42,borderRadius:13,flexShrink:0,
              background:`linear-gradient(145deg,${barColor}44,${barColor}18)`,
              fontSize:15,fontWeight:900,color:barColor,
            }}>{ini}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:800,color:s.blocked?DIM:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {s.name}{s.blocked && <span style={{fontSize:10,color:RED,marginLeft:6}}>🚫</span>}
              </div>
              <div style={{fontSize:11,color:typeColor,fontWeight:700,marginTop:2}}>{typeLabel}{s.tsc ? ` · ${s.tsc}` : ""}</div>
            </div>
            <div onClick={_close} style={{
              width:28,height:28,borderRadius:8,background:glow(0.07),
              display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",color:FAINT,fontSize:14,userSelect:"none",flexShrink:0,
            }}>✕</div>
          </div>

          {/* Body (scrollable) */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 16px 28px",display:"flex",flexDirection:"column",gap:10}}>

            {editMode ? (
              <StudentForm
                initial={{name:s.name,phone:s.phone,discount:s.discount??0,notes:s.notes||"",type:s.type,tsc:s.tsc||"",isVip:s.isVip||false,noIntervalLimit:s.noIntervalLimit||false}}
                onSave={patch=>{onUpdate(s.id,patch);setEditMode(false);}}
                onCancel={()=>setEditMode(false)}
              />
            ) : confirmDel ? (
              <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:12,padding:"14px 14px",display:"flex",flexDirection:"column",gap:9}}>
                <div style={{fontSize:13,fontWeight:800,color:"#fca5a5"}}>Видалити учня назавжди?</div>
                <div style={{fontSize:12,color:DIM}}>Цю дію не можна скасувати.</div>
                <div style={{display:"flex",gap:7}}>
                  <button onClick={()=>{setPendingDelete(true);_close();}} style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:"linear-gradient(145deg,rgba(239,68,68,.5),rgba(185,28,28,.4))",color:"#fff",fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Так, видалити</button>
                  <button onClick={()=>setConfirmDel(false)} style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Скасувати</button>
                </div>
              </div>
            ) : (
              <>
                {/* Phone + discount */}
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,background:glow(0.04),borderRadius:10,padding:"9px 12px",border:`1px solid ${BORDER}`}}>
                    <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Телефон</div>
                    <div style={{fontSize:14,fontWeight:700,color:TEXT}}>{s.phone||"—"}</div>
                  </div>
                  <div style={{width:88,background:glow(0.04),borderRadius:10,padding:"9px 12px",border:`1px solid ${BORDER}`,textAlign:"center"}}>
                    <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Знижка</div>
                    <div style={{fontSize:18,fontWeight:900,color:s.discount>0?GOLD:DIM}}>{s.discount||0}%</div>
                  </div>
                </div>

                {/* Type + progress */}
                <div style={{background:glow(0.04),borderRadius:10,padding:"10px 12px",border:`1px solid ${BORDER}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:s.type==="school"?9:0}}>
                    <span style={{fontSize:11,fontWeight:800,color:typeColor}}>{typeLabel}</span>
                    {s.type==="school" && <span style={{fontSize:10,color:FAINT}}>· {s.hours+(s.hoursOffset||0)}/40 год</span>}
                  </div>
                  {s.type==="school" && <Progress hours={s.hours} offset={s.hoursOffset||0}/>}
                </div>

                {/* Hours offset (school only) */}
                {s.type==="school" && (
                  <div style={{background:glow(0.04),borderRadius:10,padding:"10px 12px",border:`1px solid ${BORDER}`}}>
                    <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>Додати години</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <button onClick={()=>onUpdate(s.id,{hoursOffset:Math.max(0,(s.hoursOffset||0)-1)})}
                        style={{width:32,height:32,borderRadius:9,border:"none",cursor:"pointer",flexShrink:0,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:20,fontWeight:700,boxShadow:SO,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,fontFamily:"inherit"}}>−</button>
                      <div style={{flex:1,textAlign:"center"}}>
                        <span style={{fontSize:22,fontWeight:900,color:(s.hoursOffset||0)>0?GREEN:FAINT}}>{s.hoursOffset||0}</span>
                        <span style={{fontSize:11,color:FAINT,marginLeft:5}}>год</span>
                      </div>
                      <button onClick={()=>onUpdate(s.id,{hoursOffset:Math.min(39,(s.hoursOffset||0)+1)})}
                        style={{width:32,height:32,borderRadius:9,border:"none",cursor:"pointer",flexShrink:0,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:20,fontWeight:700,boxShadow:SO,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,fontFamily:"inherit"}}>+</button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
                  <ActBtn icon={ICONS.phone}    label="Дзвонити"   onClick={()=>{window.location.href=`tel:${s.phone}`;}}                    color={GREEN}/>
                  <ActBtn icon={ICONS.viber}    label="Вайбер"     onClick={()=>{window.location.href=`viber://chat?number=%2B${phone}`;}}    color={BLUE}/>
                  <ActBtn icon={ICONS.telegram} label="Телеграм"   onClick={()=>{window.open(`https://t.me/+${phone}`,"_blank");}}            color="#5b9bff"/>
                  <ActBtn icon={ICONS.chat}     label="Чат"        onClick={()=>{navTo("chats");_close();}}                                   color={BLUE}/>
                  <ActBtn icon={ICONS.edit}     label="Редагувати" onClick={()=>setEditMode(true)}/>
                  <ActBtn icon={s.blocked?ICONS.unban:ICONS.ban} label={s.blocked?"Розблок.":"Заблок."} onClick={()=>onBlock(s.id)} danger={!s.blocked}/>
                </div>

                {/* VIP toggle */}
                <div onClick={()=>onUpdate(s.id,{isVip:!s.isVip})} style={{
                  display:"flex",alignItems:"center",gap:10,cursor:"pointer",borderRadius:10,padding:"10px 13px",
                  background:s.isVip?"rgba(168,85,247,0.12)":glow(0.04),
                  border:s.isVip?"1px solid rgba(168,85,247,0.35)":`1px solid ${BORDER}`,
                }}>
                  <span style={{fontSize:16,lineHeight:1}}>👑</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:s.isVip?"#c084fc":TEXT}}>VIP учень</div>
                    <div style={{fontSize:10,color:FAINT,marginTop:2}}>{s.isVip?"Має доступ до VIP слотів":"Без доступу до VIP слотів"}</div>
                  </div>
                  <div style={{width:36,height:20,borderRadius:10,position:"relative",background:s.isVip?"linear-gradient(145deg,#a855f7,#7c3aed)":ink(0.08),transition:"background .2s",flexShrink:0}}>
                    <div style={{position:"absolute",top:2,left:s.isVip?18:2,width:16,height:16,borderRadius:8,background:"#fff",transition:"left .2s"}}/>
                  </div>
                </div>

                {/* Notes */}
                {s.notes && (
                  <div style={{background:glow(0.04),borderRadius:10,padding:"9px 12px",border:`1px solid ${BORDER}`,fontSize:12,color:DIM,lineHeight:1.5}}>📝 {s.notes}</div>
                )}

                {/* Booking history */}
                {(s.bookings||[]).length > 0 && (
                  <div>
                    <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Історія записів</div>
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {(s.bookings||[]).map((b,i)=>{
                        const [c,bg] = b.status==="confirmed"?[GREEN,`${GREEN}1a`]:b.status==="noshow"?[RED,`${RED}1a`]:[ACCENT,`${ACCENT}1a`];
                        const icon = b.status==="confirmed"?"✓":b.status==="noshow"?"✕":"⏳";
                        return (
                          <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,borderRadius:9,padding:"7px 11px",boxShadow:SO}}>
                            <span style={{fontSize:11,color:DIM,fontWeight:700,minWidth:48}}>{fmtS(b.date)}</span>
                            <span style={{fontSize:11,color:BLUE,fontWeight:700,minWidth:34}}>{b.time}</span>
                            <span style={{flex:1,fontSize:11,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.svc}</span>
                            <span style={{fontSize:10,fontWeight:800,padding:"2px 7px",borderRadius:5,background:bg,color:c}}>{icon}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Delete */}
                <button onClick={()=>setConfirmDel(true)} style={{
                  width:"100%",padding:"11px",borderRadius:11,border:"1px solid rgba(239,68,68,0.25)",
                  cursor:"pointer",background:"rgba(239,68,68,0.08)",color:"#fca5a5",
                  fontSize:13,fontWeight:700,fontFamily:"inherit",marginTop:4,
                }}>Видалити учня</button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function StudentsView() {
  const { BG_DEEP, SURFACE, SURF_HI, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, SO, SI } = useContext(ThemeContext);
  const { ink } = useFX();

  const css = `
@keyframes ex{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.ex{animation:ex .16s ease both}
.act-btn{border:none;cursor:pointer;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:9px 4px;transition:transform .1s,filter .1s;font-family:inherit}
.act-btn:active{transform:scale(.92);filter:brightness(.8)}
.act-btn span{font-size:9px;font-weight:700;letter-spacing:.2px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.sheet{animation:sheetUp .24s cubic-bezier(.32,.72,0,1) both}
`;

  const [students,     setStudents]     = useState([]);
  const [detailStudent,setDetailStudent] = useState(null);
  const [search,       setSearch]       = useState("");
  const [filterType,   setFilterType]   = useState("all");
  const [loading,      setLoading]      = useState(true);
  const [showNew,      setShowNew]      = useState(false);

  useEffect(() => {
    const unsub = onValue(ref(db, "users"), snap => {
      const data = snap.val() || {};
      setStudents(Object.entries(data).map(([uid, u]) => {
        const p = u.profile || {};
        return {
          id:uid, name:p.name||u.name||"Учень", phone:p.phone||u.phone||"",
          type:p.type||u.type||"private", tsc:p.tsc||u.tsc||"",
          hours:u.hours||0, hoursOffset:u.hoursOffset||0,
          discount:u.discount||0, notes:u.notes||"", blocked:u.blocked||false, isVip:u.isVip||false,
          noIntervalLimit:u.noIntervalLimit||false,
        };
      }));
      setLoading(false);
    });
    return unsub;
  }, []);

  const block = id => {
    const s=students.find(x=>x.id===id); if(!s) return;
    const next=!s.blocked;
    setStudents(ss=>ss.map(x=>x.id===id?{...x,blocked:next}:x));
    update(ref(db,`users/${id}`),{blocked:next}).catch(()=>{});
  };
  const updateStudent = (id,patch) => {
    setStudents(ss=>ss.map(x=>x.id===id?{...x,...patch}:x));
    update(ref(db,`users/${id}`),patch).catch(()=>{});
    if (patch.tsc !== undefined) {
      get(ref(db,`bookings/${id}`)).then(snap => {
        const bkgs = snap.val();
        if (!bkgs) return;
        const updates = {};
        Object.keys(bkgs).forEach(bkId => { updates[`bookings/${id}/${bkId}/tsc`] = patch.tsc; });
        update(ref(db), updates).catch(()=>{});
      }).catch(()=>{});
    }
  };
  const deleteStudent = id => {
    setStudents(ss=>ss.filter(x=>x.id!==id));
    remove(ref(db,`users/${id}`)).catch(()=>{});
  };
  const createStudent = async (data) => {
    const newRef = await push(ref(db,"users"),{
      name:data.name.trim(), phone:data.phone.trim(), type:data.type,
      discount:Number(data.discount)||0, notes:data.notes.trim(), blocked:false,
      isVip:data.isVip||false, hours:0,
      tsc:data.type==="school"?(data.tsc||""):"",
    });
    setShowNew(false);
  };

  const q    = search.toLowerCase();
  const list = students
    .filter(s=>(!q||(s.name||"").toLowerCase().includes(q)||(s.phone||"").includes(q))&&(filterType==="all"||s.type===filterType))
    .sort((a,b)=>(a.name||"").localeCompare(b.name||""));

  const liveDetail = detailStudent ? students.find(x=>x.id===detailStudent.id) : null;

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{display:"flex",flexDirection:"column",gap:8,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        <div style={{display:"flex",alignItems:"center",marginBottom:2}}>
          <div style={{fontSize:15,fontWeight:800,color:TEXT}}>Учні</div>
        </div>

        <div style={{background:BG_DEEP,borderRadius:11,boxShadow:SI,padding:"3px 11px",display:"flex",alignItems:"center",gap:7}}>
          {ICONS.search}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ім'я або телефон…"
            style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,padding:"9px 0",fontSize:13,minWidth:0,fontFamily:"inherit"}}/>
          {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:16,padding:0,lineHeight:1}}>×</button>}
        </div>

        <div style={{display:"flex",gap:7}}>
          {[["all","Всі"],["school","Автошкола"],["private","Приватний"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFilterType(k)} style={{
              flex:1,padding:"9px 4px",borderRadius:11,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
              background:filterType===k?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
              color:filterType===k?"#fff":DIM,boxShadow:SO,
            }}>{l}</button>
          ))}
        </div>

        {list.map(s=>(
          <StudentCard key={s.id} s={s} onSelect={s=>setDetailStudent(s)} />
        ))}

        {loading && (
          <div style={{textAlign:"center",padding:"40px 20px",color:FAINT,fontSize:13}}>
            <div style={{width:24,height:24,border:`2px solid ${ink(0.06)}`,borderTopColor:ACCENT,borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 10px"}}/>
            Завантаження…
          </div>
        )}
        {!loading && list.length===0 && (
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:36,opacity:.3,marginBottom:8}}>👥</div>
            <div style={{fontSize:14,fontWeight:700,color:DIM}}>{search?"Нікого не знайдено":"Ще немає учнів"}</div>
          </div>
        )}
      </div>

      {createPortal(
        <button onClick={()=>setShowNew(true)} aria-label="Додати учня" style={{
          position:"fixed",right:18,bottom:104,zIndex:45,
          display:"flex",alignItems:"center",gap:6,
          background:`linear-gradient(145deg,#5b9bff,#2563eb)`,
          border:"none",borderRadius:999,padding:"13px 18px",cursor:"pointer",
          fontSize:14,fontWeight:800,color:"#fff",fontFamily:"inherit",
          boxShadow:`0 6px 20px rgba(37,99,235,0.55), 0 2px 8px rgba(0,0,0,0.4)`,
        }}>
          <span style={{fontSize:20,lineHeight:1,marginTop:-2}}>+</span>
          Учень
        </button>,
        document.body
      )}

      {/* New student sheet */}
      {showNew && (
        <div onClick={()=>setShowNew(false)} style={{
          position:"fixed",inset:0,zIndex:200,background:ink(0.6),
          display:"flex",alignItems:"flex-end",justifyContent:"center",
          backdropFilter:"blur(8px)",
        }}>
          <div className="sheet" onClick={e=>e.stopPropagation()} style={{
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${BORDER}, 0 -16px 50px rgba(0,0,0,0.6)`,
            padding:"12px 16px calc(20px + env(safe-area-inset-bottom))",
            maxHeight:"88vh",overflowY:"auto",
          }}>
            <div style={{width:38,height:4,borderRadius:2,background:ink(0.12),margin:"0 auto 14px"}}/>
            <div style={{fontSize:14,fontWeight:800,color:TEXT,marginBottom:12}}>Новий учень</div>
            <StudentForm
              initial={{name:"",phone:"+380",discount:0,notes:"",type:"private",isVip:false,noIntervalLimit:false,tsc:""}}
              onSave={createStudent} onCancel={()=>setShowNew(false)} saveLabel="Додати"
            />
          </div>
        </div>
      )}

      {/* Student detail sheet */}
      {liveDetail && (
        <StudentDetailSheet
          s={liveDetail}
          onClose={()=>setDetailStudent(null)}
          onUpdate={updateStudent}
          onDelete={deleteStudent}
          onBlock={block}
        />
      )}
    </>
  );
}
