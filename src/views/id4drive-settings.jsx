import { useState, useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { get, update, onValue, off } from "firebase/database";
import { uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { signOut } from "firebase/auth";
import { deleteAccountRequest } from "../deleteAccountApi";
import { iRef, iStorageRef, iGalleryStorageRef, auth } from "../firebase";
import { LangContext } from "../App";
import { ThemeContext } from "../theme.js";
import { UICss, useFX } from "../ui";
import { createT } from "../lang";
import { useLicense, licenseState } from "../hooks/useLicense";
import { LicensePayPanel } from "../LicensePay";
import { useMosaicSwitch, MosaicOverlay } from "../mosaic";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DAY_NAMES = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

// ─── SECTION RAIL ICONS — той самий "3D pillow" стиль іконок, що й у
// BottomNav (App.jsx: makeTabIcons/I3): кольоровий градієнт при активній
// вкладці, темний неактивний фон, глянцевий блік зверху-справа. ───
const SEC_INACTIVE_GR = { dark:"linear-gradient(135deg,#2e3034,#26282c)", kava:"linear-gradient(135deg,#6b3a22,#4a2210)" };
const SEC_ICON_SVG = {
  schedule:   <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  snap:       <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  restr:      <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  queue:      <><circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/></>,
  sticky:     <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.3"/></>,
  auto:       <><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></>,
  surcharges: <><circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M15 9.7c0-1.1-1.2-2-3-2s-3 .9-3 1.9 1.3 1.5 3 1.8c1.7.3 3 .8 3 1.9s-1.2 1.9-3 1.9-3-.9-3-2"/></>,
  push:       <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
  reviews:    <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
  profile:    <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></>,
};
function SecIcon({ id, color, active, isKava, size=34 }) {
  const gr = active ? color : (isKava ? SEC_INACTIVE_GR.kava : SEC_INACTIVE_GR.dark);
  return (
    <div style={{
      width:size, height:size, borderRadius:size*0.3, background:gr,
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden", flexShrink:0,
      boxShadow:"-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2),inset -1px -1px 0 rgba(0,0,0,0.25)",
    }}>
      <div style={{position:"absolute",top:0,right:0,width:"60%",height:"50%",background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.35) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <svg width={size*0.55} height={size*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"relative",zIndex:1}}>
        {SEC_ICON_SVG[id]}
      </svg>
    </div>
  );
}

// ─── MODULE-LEVEL ATOMS (stable references → no remount on settings change) ───

function Toggle({ on, onChange, color }) {
  const { ACC_HI, ACCENT, SURF_LO, BG_DEEP, SI } = useContext(ThemeContext);
  const { shade } = useFX();
  const c = color || ACCENT;
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:44,height:24,borderRadius:12,cursor:"pointer",position:"relative",
      background:on?`linear-gradient(145deg,color-mix(in srgb,${c} 85%,#fff),${c})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
      boxShadow:on?`0 0 8px ${c}44`:SI,transition:"background .2s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:3,left:on?21:3,width:18,height:18,borderRadius:9,
        background:"linear-gradient(135deg,#fff,#ddd)",
        boxShadow:`0 1px 4px ${shade(0.4)}`,transition:"left .2s",
      }}/>
    </div>
  );
}

function SmallToggle({ on, onChange, color }) {
  const { ACC_HI, ACCENT, SURF_LO, BG_DEEP, SI } = useContext(ThemeContext);
  const { shade } = useFX();
  const c = color || ACCENT;
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:32,height:18,borderRadius:9,cursor:"pointer",position:"relative",
      background:on?`linear-gradient(145deg,color-mix(in srgb,${c} 85%,#fff),${c})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
      boxShadow:on?`0 0 6px ${c}44`:SI,transition:"background .2s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:2,left:on?16:2,width:14,height:14,borderRadius:7,
        background:"linear-gradient(135deg,#fff,#ddd)",
        boxShadow:`0 1px 3px ${shade(0.4)}`,transition:"left .2s",
      }}/>
    </div>
  );
}

function NumInput({ value, onChange, min=0, max=999, suffix="", step=1, compact }) {
  const { BG_DEEP, SURF_HI, SURFACE, TEXT, SO, SI } = useContext(ThemeContext);
  const bs = compact ? 22 : 26;
  return (
    <div style={{display:"flex",alignItems:"center",gap:4,background:BG_DEEP,borderRadius:9,boxShadow:SI,padding: compact ? "3px 5px" : "4px 6px"}}>
      <button onClick={()=>onChange(Math.max(min,value-step))} style={{
        width:bs,height:bs,borderRadius:7,border:"none",cursor:"pointer",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:compact?12:14,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SO,
      }}>−</button>
      <span style={{fontSize:compact?11:13,fontWeight:700,color:TEXT,minWidth:compact?26:32,textAlign:"center"}}>
        {value}{suffix}
      </span>
      <button onClick={()=>onChange(Math.min(max,value+step))} style={{
        width:bs,height:bs,borderRadius:7,border:"none",cursor:"pointer",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:compact?12:14,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SO,
      }}>+</button>
    </div>
  );
}

function Radio({ on, onChange }) {
  const { ACCENT, FAINT } = useContext(ThemeContext);
  return (
    <div onClick={onChange} style={{
      width:20,height:20,borderRadius:10,cursor:"pointer",flexShrink:0,
      border:`2px solid ${on?ACCENT:FAINT}`,
      background:on?ACCENT:"transparent",
      boxShadow:on?`0 0 8px ${ACCENT}55`:"none",
      transition:"all .15s",
    }}/>
  );
}

function Row({ label, hint, children, last, color, compact }) {
  const { BG_DEEP, ACCENT } = useContext(ThemeContext);
  const c = color || ACCENT;
  return (
    <div style={{
      display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
      padding: compact ? "6px 10px" : "9px 12px",
      borderRadius:11,
      background:`linear-gradient(135deg,color-mix(in srgb,${c} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
      border:`1px solid color-mix(in srgb,${c} 35%,transparent)`,
      marginBottom: last ? 0 : (compact ? 4 : 6),
    }}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:compact?12:13,fontWeight:700,color:"#fff"}}>{label}</div>
        {hint && <div style={{fontSize:compact?9:10,color:"rgba(255,255,255,0.6)",marginTop:compact?1:2,lineHeight:1.35}}>{hint}</div>}
      </div>
      <div style={{flexShrink:0}}>{children}</div>
    </div>
  );
}

// Кольорова картка-групувальник для «Профілю» — той самий градієнт-тінт
// і бордер, що в Row (Сповіщення/Ліміти), тільки як контейнер на кілька полів.
function ProfileCard({ color, icon, title, children }) {
  const { BG_DEEP } = useContext(ThemeContext);
  return (
    <div style={{
      borderRadius:14,padding:"12px 14px",marginBottom:12,
      background:`linear-gradient(135deg,color-mix(in srgb,${color} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
      border:`1px solid color-mix(in srgb,${color} 35%,transparent)`,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:15}}>{icon}</span>
        <span style={{fontSize:12,fontWeight:800,color:"#fff"}}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick }) {
  const { ACC_HI, ACCENT, SURF_HI, SURFACE, DIM, SO } = useContext(ThemeContext);
  return (
    <button onClick={onClick} style={{
      padding:"6px 12px",borderRadius:9,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
      background:active?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
      color:active?"#fff":DIM,boxShadow:active?"none":SO,
    }}>{label}</button>
  );
}

function Info({ title, text, color }) {
  const { BLUE, DIM } = useContext(ThemeContext);
  const c = color || BLUE;
  return (
    <div style={{
      background:`linear-gradient(145deg,${c}0d,${c}05)`,
      border:`1px solid ${c}30`,
      borderRadius:10,padding:"10px 12px",marginTop:2,marginBottom:10,
    }}>
      <div style={{fontSize:11,fontWeight:700,color:c,marginBottom:4}}>💡 {title}</div>
      <div style={{fontSize:11,color:DIM,lineHeight:1.6,whiteSpace:"pre-line"}}>{text}</div>
    </div>
  );
}

function TimeInput({ value, onChange, min=0, max=24, compact=false }) {
  const { BG_DEEP, TEXT, FAINT, SI } = useContext(ThemeContext);
  const v = Number(value) || 0;
  const h = Math.floor(v);
  const m = (v % 1 >= 0.5) ? 30 : 0;
  const disp = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  const dec = () => { const n = Math.round((v - 0.5) * 2) / 2; onChange(Math.max(min, n)); };
  const inc = () => { const n = Math.round((v + 0.5) * 2) / 2; onChange(Math.min(max, n)); };
  const bW = compact ? 14 : 32;
  const bH = compact ? 20 : 38;
  const fS = compact ? 11 : 22;
  const dW = compact ? 28 : 64;
  const dS = compact ? 9 : 18;
  return (
    <div style={{display:"flex",alignItems:"center",background:BG_DEEP,borderRadius:7,boxShadow:SI,overflow:"hidden"}}>
      <button onClick={dec} style={{width:bW,height:bH,border:"none",cursor:"pointer",background:"transparent",color:FAINT,fontSize:fS,padding:0,lineHeight:1}}>‹</button>
      <span style={{fontSize:dS,fontWeight:700,color:TEXT,minWidth:dW,textAlign:"center"}}>{disp}</span>
      <button onClick={inc} style={{width:bW,height:bH,border:"none",cursor:"pointer",background:"transparent",color:FAINT,fontSize:fS,padding:0,lineHeight:1}}>›</button>
    </div>
  );
}

// ─── БАРАБАН ЧАСУ — крупний вибір часу прокруткою (scroll-snap) ──────────
// Крок хвилин 30: календар (сітка, підписи, лінії) побудований на півгодинних
// рядках, дробові 15/10/5 хв зламали б вирівнювання сітки.
const WHEEL_ITEM = 40;
const WHEEL_H = Array.from({length:25},(_,i)=>String(i).padStart(2,"0"));
const WHEEL_M = ["00","30"];

function WheelCol({ items, index, onIndex, rows = 5, width = 48 }) {
  const { TEXT, FAINT } = useContext(ThemeContext);
  const ref = useRef(null);
  const timer = useRef(null);
  const [live, setLive] = useState(index);
  const [tick, setTick] = useState(0);
  const pad = ((rows - 1) / 2) * WHEEL_ITEM;
  useEffect(() => {
    const el = ref.current;
    if (el && Math.abs(el.scrollTop - index * WHEEL_ITEM) > 1) el.scrollTo({ top: index * WHEEL_ITEM });
    setLive(index);
  }, [index, tick]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / WHEEL_ITEM)));
    setLive(i);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (i !== index) onIndex(i); setTick(t => t + 1); }, 140);
  };
  const mask = "linear-gradient(transparent,#000 28%,#000 72%,transparent)";
  return (
    <div style={{position:"relative",zIndex:1,width,height:rows*WHEEL_ITEM,flexShrink:0}}>
      <style>{`.wheel-col::-webkit-scrollbar{display:none}`}</style>
      <div ref={ref} className="wheel-col" onScroll={onScroll} style={{
        height:"100%",overflowY:"scroll",scrollSnapType:"y mandatory",scrollbarWidth:"none",
        overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",
        maskImage:mask,WebkitMaskImage:mask,
      }}>
        <div style={{height:pad}}/>
        {items.map((it, i) => {
          const o = i - live;
          const a = Math.abs(o);
          return (
            <div key={i} onClick={()=>ref.current?.scrollTo({top:i*WHEEL_ITEM,behavior:"smooth"})} style={{
              height:WHEEL_ITEM,scrollSnapAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:a===0?30:a===1?22:18,fontWeight:800,cursor:"pointer",userSelect:"none",
              fontVariantNumeric:"tabular-nums",
              transform:`perspective(240px) rotateX(${Math.max(-70,Math.min(70,-o*28))}deg)`,
              color:a===0?TEXT:FAINT,opacity:a===0?1:a===1?0.6:0.28,
            }}>{it}</div>
          );
        })}
        <div style={{height:pad}}/>
      </div>
    </div>
  );
}

function TimeWheel({ label, value, onChange, min = 0, max = 24, rows = 5, color }) {
  const { DIM, TEXT, GREEN, BG_DEEP } = useContext(ThemeContext);
  const c = color || GREEN;
  const v = Math.min(max, Math.max(min, Number(value) || 0));
  const h = Math.floor(v);
  const m = v % 1 >= 0.5 ? 1 : 0;
  const set = (nh, nm) => onChange(Math.min(max, Math.max(min, nh + nm * 0.5)));
  const pad = ((rows - 1) / 2) * WHEEL_ITEM;
  return (
    <div style={{textAlign:"center"}}>
      <div style={{display:"inline-block",fontSize:11,fontWeight:800,letterSpacing:1.2,color:c,marginBottom:6,
        padding:"3px 12px",borderRadius:999,background:`color-mix(in srgb,${c} 14%,transparent)`}}>{label}</div>
      <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",gap:2,padding:"0 4px"}}>
        <div style={{position:"absolute",left:0,right:0,top:pad,height:WHEEL_ITEM,pointerEvents:"none",borderRadius:14,
          background:`linear-gradient(135deg,color-mix(in srgb,${c} 32%,${BG_DEEP}),color-mix(in srgb,${c} 10%,${BG_DEEP}))`,
          border:`1px solid color-mix(in srgb,${c} 55%,transparent)`,
          boxShadow:`0 0 18px color-mix(in srgb,${c} 28%,transparent), inset 0 1px 0 rgba(255,255,255,.12)`}}/>
        <WheelCol items={WHEEL_H} index={h} onIndex={i=>set(i,m)} rows={rows}/>
        <span style={{position:"relative",zIndex:1,fontSize:28,fontWeight:800,color:TEXT,marginTop:-3}}>:</span>
        <WheelCol items={WHEEL_M} index={m} onIndex={i=>set(h,i)} rows={rows}/>
      </div>
    </div>
  );
}

// Старти слотів дня — та сама логіка, що й у генерації слотів (id4drive-admin):
// крок 60 хв, слот, що перетинає обід, пропускається, після обіду сітка йде від його кінця.
function daySlotStarts(d) {
  const lS = (d.lunchStart ?? 12) * 60, lE = (d.lunchEnd ?? 13) * 60;
  const useL = !!d.lunchEnabled && lE > lS;
  const out = [];
  let after = false;
  for (let m = d.start * 60; m < d.end * 60; m += 60) {
    if (useL && m < lE && m + 60 > lS) { m = lE - 60; after = true; continue; }
    if (after && m + 60 > d.end * 60) break;
    out.push(m);
  }
  return out;
}

function WeekScheduleEditor({ weekSchedule, updDay, setWeek }) {
  const { BG_DEEP, SURF_HI, SURFACE, TEXT, DIM, FAINT, GREEN, RED, GOLD, ACCENT, SI, SO } = useContext(ThemeContext);
  const [sel, setSel] = useState(0);
  const day = weekSchedule[sel];
  const lS = day.lunchStart ?? 12, lE = day.lunchEnd ?? 13;
  const fmt = x => `${String(Math.floor(x)).padStart(2,"0")}:${x % 1 >= 0.5 ? "30" : "00"}`;
  const hrs = d => d.enabled ? Math.max(0, d.end - d.start - (d.lunchEnabled ? Math.max(0, (d.lunchEnd ?? 13) - (d.lunchStart ?? 12)) : 0)) : 0;
  const total = weekSchedule.reduce((s, d) => s + hrs(d), 0);
  const pct = x => `${(Math.max(0, Math.min(24, x)) / 24) * 100}%`;
  const slots = day.enabled ? daySlotStarts(day) : [];
  const gaps = [];
  slots.forEach((m, i) => {
    const nx = slots[i + 1];
    if (nx == null) return;
    const g0 = m + 60;
    // сам обід — не «прогалина»: вільним лишається лише відрізок до початку обіду
    const g1 = day.lunchEnabled && lS * 60 >= g0 && lS * 60 < nx ? lS * 60 : nx;
    if (g1 - g0 >= 30) gaps.push([g0, g1]);
  });
  const copyAll = () => setWeek(weekSchedule.map(d => d.enabled
    ? {...d, start: day.start, end: day.end, lunchEnabled: !!day.lunchEnabled, lunchStart: lS, lunchEnd: lE}
    : d));
  return (
    <div style={{paddingTop:10}}>
      <div style={{fontSize:11,color:"#fff",letterSpacing:1.2,textTransform:"uppercase",marginBottom:10,textAlign:"center"}}>Тижневий шаблон</div>
      <div style={{display:"flex",gap:5,marginBottom:10}}>
        {DAY_NAMES.map((n, i) => {
          const d = weekSchedule[i];
          const col = d.enabled ? GREEN : RED;
          const on = i === sel;
          return (
            <button key={i} onClick={()=>setSel(i)} style={{
              flex:1,minWidth:0,padding:"9px 0 8px",borderRadius:14,cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,
              background:on
                ?`linear-gradient(160deg,color-mix(in srgb,${col} 70%,#fff),${col})`
                :`linear-gradient(160deg,color-mix(in srgb,${col} ${d.enabled?28:16}%,${BG_DEEP}),${BG_DEEP})`,
              border:`1px solid color-mix(in srgb,${col} ${on?90:30}%,transparent)`,
              boxShadow:on?`0 4px 14px color-mix(in srgb,${col} 45%,transparent)`:"none",
              transform:on?"translateY(-2px)":"none",transition:"all .15s",
            }}>
              <span style={{fontSize:14,fontWeight:800,color:on?"#0b1a08":d.enabled?"#fff":FAINT}}>{n}</span>
              <span style={{fontSize:10,fontWeight:700,color:on?"#0b1a08":FAINT}}>{d.enabled ? `${hrs(d)}г` : "—"}</span>
            </button>
          );
        })}
      </div>
      <div style={{borderRadius:20,padding:"14px 10px 12px",background:`linear-gradient(160deg,${SURF_HI},${SURFACE})`,boxShadow:SO,
        border:"1px solid rgba(255,255,255,.06)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 4px"}}>
          <div>
            <div style={{fontSize:day.enabled?28:20,fontWeight:800,color:day.enabled?TEXT:FAINT,letterSpacing:-.5,lineHeight:1.1}}>
              {day.enabled ? <>{fmt(day.start)} <span style={{color:GREEN}}>→</span> {fmt(day.end)}</> : "Вихідний день"}
            </div>
            <div style={{fontSize:12,color:DIM,marginTop:3}}>
              {DAY_NAMES[sel]}{day.enabled ? ` · ${hrs(day)} год роботи${day.lunchEnabled?` · перерва ${fmt(lS)}–${fmt(lE)}`:""}` : ""}
            </div>
          </div>
          <Toggle color={day.enabled?GREEN:RED} on={day.enabled} onChange={v=>updDay(sel,{enabled:v})}/>
        </div>
        {day.enabled && (<>
          <div style={{margin:"12px 4px 4px"}}>
            <div style={{position:"relative",height:12,borderRadius:6,background:BG_DEEP,boxShadow:SI,overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,bottom:0,left:pct(day.start),width:`calc(${pct(day.end)} - ${pct(day.start)})`,
                background:`linear-gradient(90deg,${GREEN},color-mix(in srgb,${GREEN} 60%,#34d399))`,borderRadius:6}}/>
              {day.lunchEnabled && <div style={{position:"absolute",top:0,bottom:0,left:pct(lS),width:`calc(${pct(lE)} - ${pct(lS)})`,background:GOLD}}/>}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:FAINT,marginTop:3}}>
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-around",flexWrap:"wrap",gap:6,marginTop:6}}>
            <TimeWheel label="ПОЧАТОК" value={day.start} onChange={v=>updDay(sel,{start:v})} min={0} max={day.end-0.5}/>
            <TimeWheel label="КІНЕЦЬ" value={day.end} onChange={v=>updDay(sel,{end:v})} min={day.start+0.5} max={24}/>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14,padding:"11px 12px",borderRadius:14,
            background:`linear-gradient(135deg,color-mix(in srgb,${GOLD} 22%,${BG_DEEP}),${BG_DEEP})`,border:`1px solid color-mix(in srgb,${GOLD} 35%,transparent)`}}>
            <span style={{fontSize:15,fontWeight:800,color:TEXT}}>🍽 Перерва{day.lunchEnabled?` · ${fmt(lS)}–${fmt(lE)}`:""}</span>
            <Toggle color={day.lunchEnabled?GREEN:RED} on={!!day.lunchEnabled} onChange={v=>updDay(sel,{lunchEnabled:v})}/>
          </div>
          {day.lunchEnabled && (
            <div style={{display:"flex",justifyContent:"space-around",flexWrap:"wrap",gap:6,marginTop:10}}>
              <TimeWheel label="ПЕРЕРВА З" color={GOLD} rows={3} value={lS} onChange={v=>updDay(sel,{lunchStart:v})} min={0} max={lE-0.5}/>
              <TimeWheel label="ПЕРЕРВА ДО" color={GOLD} rows={3} value={lE} onChange={v=>updDay(sel,{lunchEnd:v})} min={lS+0.5} max={24}/>
            </div>
          )}
          <div style={{marginTop:14,padding:"0 4px"}}>
            <div style={{fontSize:11,fontWeight:800,letterSpacing:1.2,color:DIM,marginBottom:6}}>СЛОТИ ДНЯ · {slots.length}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {slots.map(m => (
                <span key={m} style={{fontSize:12,fontWeight:800,padding:"4px 8px",borderRadius:8,color:TEXT,
                  background:`color-mix(in srgb,${GREEN} 18%,${BG_DEEP})`,border:`1px solid color-mix(in srgb,${GREEN} 35%,transparent)`}}>{fmt(m/60)}</span>
              ))}
            </div>
            {gaps.map((g, i) => (
              <div key={i} style={{fontSize:11,color:GOLD,marginTop:6}}>⚠ {fmt(g[0]/60)}–{fmt(g[1]/60)} без слота (не вміщається урок 1 год)</div>
            ))}
          </div>
        </>)}
      </div>
      {day.enabled && (
        <button onClick={copyAll} style={{width:"100%",marginTop:10,padding:"13px",borderRadius:14,cursor:"pointer",fontSize:13,fontWeight:800,
          color:"#fff",background:`linear-gradient(135deg,color-mix(in srgb,${ACCENT} 80%,#000),${ACCENT})`,border:"none",
          boxShadow:`0 4px 14px color-mix(in srgb,${ACCENT} 35%,transparent)`}}>
          Копіювати {DAY_NAMES[sel]} на всі робочі дні
        </button>
      )}
      <div style={{textAlign:"center",fontSize:12,color:DIM,marginTop:10}}>Усього <b style={{color:TEXT}}>{total} год</b> на тиждень</div>
    </div>
  );
}

// Стискаємо фото до maxSize по довшій стороні перед завантаженням у Storage —
// прямий телефонний JPG може важити 5-10 МБ, а на публічному лендингу таке
// вантажити марно.
// ─── КАДРУВАННЯ ФОТО ПЕРЕД ЗАВАНТАЖЕННЯМ ─────────────────────────
// Перетягніть фото пальцем і збільште щипком (або повзунком / кнопками +/−), щоб обличчя
// не обрізалось. Що видно в рамці — те й збережеться (квадрат; для аватара рамка кругла).
function PhotoCropModal({ file, round, outSize, title, onCancel, onDone }) {
  const { BG_DEEP, SURF_HI, SURFACE, TEXT, DIM, FAINT, GOLD, BORDER } = useContext(ThemeContext);
  const [img, setImg] = useState(null);
  const [err, setErr] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const F = Math.min(340, (typeof window !== "undefined" ? window.innerWidth : 360) - 84);
  const ptrs = useRef(new Map());
  const gest = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setErr(true);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const s0 = img ? F / Math.min(img.width, img.height) : 1; // масштаб «заповнити рамку»
  const sc = s0 * zoom;
  const dw = img ? img.width * sc : F, dh = img ? img.height * sc : F;
  const clamp = (o, z = zoom) => {
    if (!img) return o;
    const w = img.width * s0 * z, h = img.height * s0 * z;
    const mx = Math.max(0, (w - F) / 2), my = Math.max(0, (h - F) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const setZ = (z) => { const nz = Math.min(4, Math.max(1, z)); setZoom(nz); setOff(o => clamp(o, nz)); };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gest.current = { type: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
    } else {
      gest.current = { type: "drag", x: e.clientX, y: e.clientY, o: off };
    }
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gest.current;
    if (!g) return;
    if (g.type === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.d > 0) setZ(g.z * (d / g.d));
    } else if (g.type === "drag" && ptrs.current.size === 1) {
      setOff(clamp({ x: g.o.x + (e.clientX - g.x), y: g.o.y + (e.clientY - g.y) }));
    }
  };
  const onUp = (e) => {
    ptrs.current.delete(e.pointerId);
    gest.current = ptrs.current.size === 1
      ? { type: "drag", x: [...ptrs.current.values()][0].x, y: [...ptrs.current.values()][0].y, o: off }
      : null;
  };

  const save = () => {
    if (!img || saving) return;
    setSaving(true);
    const canvas = document.createElement("canvas");
    canvas.width = outSize; canvas.height = outSize;
    const left = F / 2 - dw / 2 + off.x, top = F / 2 - dh / 2 + off.y; // положення фото відносно рамки (px екрана)
    canvas.getContext("2d").drawImage(img, -left / sc, -top / sc, F / sc, F / sc, 0, 0, outSize, outSize);
    canvas.toBlob((blob) => { if (blob) onDone(blob); else { setSaving(false); setErr(true); } }, "image/jpeg", 0.88);
  };

  const circBtn = { width:48, height:48, borderRadius:14, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:24, fontWeight:800, color:TEXT, background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`, display:"flex", alignItems:"center", justifyContent:"center", padding:0, flexShrink:0 };
  return createPortal(
    <div style={{ position:"fixed", inset:0, zIndex:9700, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, boxSizing:"border-box" }}>
      <div style={{ width:"100%", maxWidth:400, background:BG_DEEP, borderRadius:20, border:`1px solid ${BORDER}`, padding:"16px 16px 18px", boxSizing:"border-box", maxHeight:"96dvh", overflowY:"auto" }}>
        <div style={{ fontSize:16, fontWeight:800, color:TEXT, textAlign:"center", marginBottom:4 }}>{title}</div>
        <div style={{ fontSize:12.5, color:DIM, textAlign:"center", marginBottom:14, lineHeight:1.4 }}>Перетягніть фото і збільште двома пальцями — що в рамці, те й побачать учні</div>
        {err ? (
          <div style={{ color:"#fca5a5", fontSize:13, textAlign:"center", padding:"30px 0" }}>Не вдалося відкрити фото. Спробуйте інший файл.</div>
        ) : (
          <div
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onWheel={(e) => setZ(zoom * (e.deltaY < 0 ? 1.1 : 0.9))}
            style={{ width:F, height:F, margin:"0 auto 14px", position:"relative", overflow:"hidden", borderRadius: round ? "50%" : 16, background:"#000", touchAction:"none", cursor:"grab", border:`2px solid ${GOLD}`, boxSizing:"content-box", userSelect:"none" }}>
            {img && <img src={img.src} alt="" draggable={false} style={{ position:"absolute", left: F/2 - dw/2 + off.x, top: F/2 - dh/2 + off.y, width:dw, height:dh, maxWidth:"none", pointerEvents:"none", userSelect:"none" }}/>}
            {!img && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:FAINT, fontSize:13 }}>Завантаження…</div>}
          </div>
        )}
        {!err && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <button onClick={() => setZ(zoom - 0.25)} aria-label="Зменшити" style={circBtn}>−</button>
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZ(Number(e.target.value))} style={{ flex:1, height:32 }}/>
            <button onClick={() => setZ(zoom + 0.25)} aria-label="Збільшити" style={circBtn}>+</button>
          </div>
        )}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onCancel} disabled={saving} style={{ flex:1, padding:"14px", borderRadius:14, border:`1px solid ${BORDER}`, background:"rgba(255,255,255,0.05)", color:TEXT, fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Скасувати</button>
          <button onClick={save} disabled={!img || saving || err} style={{ flex:2, padding:"14px", borderRadius:14, border:"none", background:`linear-gradient(145deg,${GOLD}cc,${GOLD}88)`, color:"#1a1a1a", fontSize:15, fontWeight:800, cursor:"pointer", fontFamily:"inherit", opacity:(!img||err)?0.5:1 }}>{saving ? "Зберігаю…" : "Зберегти"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Leaflet — імперативно, без react-leaflet: карта створюється один раз у
// useEffect на порожньому div, маркер перетягується/ставиться кліком.
function LocationMap({ lat, lng, onPick, flyTo }) {
  const { ACCENT } = useContext(ThemeContext);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const start = [lat || 50.4501, lng || 30.5234];
    const map = L.map(mapEl.current, { attributionControl: false }).setView(start, (lat && lng) ? 15 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${ACCENT};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
      iconSize: [26, 26], iconAnchor: [13, 26],
    });
    const marker = L.marker(start, { draggable: true, icon }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); onPick(p.lat, p.lng); });
    map.on("click", (e) => { marker.setLatLng(e.latlng); onPick(e.latlng.lat, e.latlng.lng); });
    mapRef.current = map; markerRef.current = marker;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- карта створюється один раз; зміни lat/lng ззовні (після drag/click) ігноруємо навмисно
  }, []);

  // Пошук адреси (окремий блок нижче) не чіпає lat/lng-пропси напряму (вони
  // навмисно ігноруються вище) — тому переліт мапи на знайдену точку йде
  // через окремий тригер flyTo {lat,lng,ts}, щоб спрацьовувало навіть коли
  // координати знайденої адреси збігаються з попередніми (ts завжди новий).
  useEffect(() => {
    if (!flyTo || !mapRef.current || !markerRef.current) return;
    const ll = [flyTo.lat, flyTo.lng];
    markerRef.current.setLatLng(ll);
    mapRef.current.setView(ll, 15);
  }, [flyTo]);

  return <div ref={mapEl} style={{ width: "100%", height: 220, borderRadius: 14, overflow: "hidden" }} />;
}

// Повноекранний перегляд фото (портал) — пінч-зум двома пальцями, подвійний
// тап для швидкого зуму, свайп вліво/вправо для гортання між усіма фото
// (коли не наближено). Без сторонніх бібліотек, чисті touch-події.
function PhotoViewer({ photos, index, onClose }) {
  const [i, setI] = useState(index);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const g = useRef({ mode: null, startDist: 0, startScale: 1, startX: 0, startY: 0, startTx: 0, startTy: 0, lastTap: 0 });

  useEffect(() => { setScale(1); setTx(0); setTy(0); }, [i]);

  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      g.current.mode = "pinch";
      g.current.startDist = dist(e.touches[0], e.touches[1]);
      g.current.startScale = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - g.current.lastTap < 280) {
        setScale(s => s > 1 ? 1 : 2.5); setTx(0); setTy(0);
        g.current.mode = null; g.current.lastTap = 0;
        return;
      }
      g.current.lastTap = now;
      g.current.mode = scale > 1 ? "pan" : "swipe";
      g.current.startX = e.touches[0].clientX;
      g.current.startY = e.touches[0].clientY;
      g.current.startTx = tx; g.current.startTy = ty;
    }
  };
  const onTouchMove = (e) => {
    if (g.current.mode === "pinch" && e.touches.length === 2) {
      const d = dist(e.touches[0], e.touches[1]);
      setScale(Math.min(4, Math.max(1, g.current.startScale * (d / g.current.startDist))));
    } else if (g.current.mode === "pan" && e.touches.length === 1) {
      setTx(g.current.startTx + (e.touches[0].clientX - g.current.startX));
      setTy(g.current.startTy + (e.touches[0].clientY - g.current.startY));
    } else if (g.current.mode === "swipe" && e.touches.length === 1) {
      setTx(e.touches[0].clientX - g.current.startX);
    }
  };
  const onTouchEnd = () => {
    if (g.current.mode === "swipe") {
      if (tx > 60 && i > 0) setI(v => v - 1);
      else if (tx < -60 && i < photos.length - 1) setI(v => v + 1);
      setTx(0);
    } else if (scale < 1.05) { setScale(1); setTx(0); setTy(0); }
    g.current.mode = null;
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.94)", touchAction: "none" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button onClick={onClose} aria-label="Закрити" style={{
        position: "absolute", top: "calc(14px + env(safe-area-inset-top,0px))", right: 14, zIndex: 1,
        width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)",
        color: "#fff", fontSize: 18, cursor: "pointer",
      }}>×</button>
      {photos.length > 1 && (
        <div style={{
          position: "absolute", top: "calc(18px + env(safe-area-inset-top,0px))", left: 0, right: 0,
          textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700,
        }}>{i + 1} / {photos.length}</div>
      )}
      <div
        style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        <img src={photos[i]} alt="" draggable={false} style={{
          maxWidth: "92%", maxHeight: "85vh", objectFit: "contain", userSelect: "none",
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: g.current.mode ? "none" : "transform .2s",
        }} />
      </div>
    </div>,
    document.body
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
// Вузли instructors/{iid}, що стираються при повному скиданні. НЕ чіпаємо: license, users (зв'язок з учнями), fcmTokens, invites.
const RESET_PATHS = ["bookings","bookings_by_phone","timeslots","slotBookings","queue","admin_settings","admin_data","chats","chatMeta","dayNotes","studentColors","reviews","pushTemplates","adminPush","templatePush","push_tasks","pushLog"];

export default function SettingsView({ settings, setSettings }) {
  const { BG_DEEP, SURF_HI, SURFACE, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, PURPLE, GOLD, RED, TEAL, SO, SI } = useContext(ThemeContext);
  const lang = useContext(LangContext);
  const t = createT(lang);
  const isKava = settings?.theme === "light";

  // Реальна висота нижнього навбару (BottomNav у App.jsx, id="app-bottomnav"),
  // щоб друга пігулка (SECTION RAIL) сідала точно над ним через fixed+portal —
  // "мертво", без залежності від position:sticky в скрол-контейнері вкладки.
  const [navH, setNavH] = useState(64);
  useEffect(() => {
    const el = document.getElementById('app-bottomnav');
    if (!el) return;
    const measure = () => setNavH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const css = `
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;background:${BG_DEEP};outline:none;box-shadow:${SI}}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:9px;background:linear-gradient(145deg,${ACC_HI},${ACCENT});cursor:pointer;box-shadow:0 2px 6px rgba(255,90,60,0.5)}
select{color-scheme:${isKava?"light":"dark"}}
`;
  const upd = (k, v) => setSettings(s=>({...s,[k]:v}));

  // ── weekSchedule helpers ──────────────────────────────────────
  const weekSchedule = settings.weekSchedule || DAY_NAMES.map((_,i) => ({
    enabled: i < 6, start: i===5?10:9, end: i===5?15:18,
    lunchEnabled: i<5, lunchStart:12, lunchEnd:13,
  }));
  const updDay = (i, patch) => upd("weekSchedule", weekSchedule.map((d,idx) => idx===i ? {...d,...patch} : d));

  const queueMode = settings.queueAutoFifo ? "fifo" : settings.queueBroadcast ? "broadcast" : "manual";
  const setQueueMode = m => setSettings(s=>({
    ...s,
    queueAutoFifo:    m==="fifo",
    queueBroadcast:   m==="broadcast",
    queueManual:      m==="manual",
  }));

  const reminders = settings.autoReminders || [
    {enabled:true, hoursBefore:24},
    {enabled:false,hoursBefore:2},
    {enabled:false,hoursBefore:1},
  ];
  const updReminder = (idx, patch) => upd("autoReminders", reminders.map((r,i)=>i===idx?{...r,...patch}:r));

  const [active, setActive] = useState("schedule");
  const [showHint, setShowHint] = useState(false);
  const switchSection = (id) => { setActive(id); setShowHint(false); };
  const license = useLicense(auth.currentUser?.uid);

  // slug для посилання-запису учнів (задається один раз при онбордингу,
  // AdminAuth.jsx → InstructorSetupScreen) — тут лише читаємо для показу
  const [bookingSlug, setBookingSlug] = useState(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  const [rstOpen, setRstOpen] = useState(false);
  const [rstText, setRstText] = useState("");
  const [rstBusy, setRstBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [slugCopied,  setSlugCopied]  = useState(false);
  useEffect(() => {
    get(iRef("admin_settings/profile/slug")).then(snap => setBookingSlug(snap.val() || "")).catch(() => {});
  }, []);
  const bookingLink = bookingSlug ? `https://juno-booking-client.web.app/i/${bookingSlug}` : "";
  const copyBookingLink = () => {
    if (!bookingLink) return;
    navigator.clipboard?.writeText(bookingLink).catch(() => {});
    setSlugCopied(true);
    setTimeout(() => setSlugCopied(false), 1500);
  };


  // ── відгуки учнів ────────────────────────────────────────────
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    const r = iRef( "reviews");
    const handler = onValue(r, snap => {
      const data = snap.val() || {};
      const list = [];
      Object.entries(data).forEach(([uid, userReviews]) => {
        Object.entries(userReviews || {}).forEach(([id, v]) => list.push({ id, uid, ...v }));
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setReviews(list);
    });
    return () => off(r, "value", handler);
  }, []);
  const toggleReviewHidden = (review) => {
    update(iRef( `reviews/${review.uid}/${review.id}`), { status: review.status === "hidden" ? "approved" : "hidden" }).catch(() => {});
  };

  // ── профіль інструктора (фото, умови, telegram, точка зустрічі) ──
  // На відміну від `settings` (автозберігається дебаунсом вище), тут окрема
  // локальна копія admin_settings/profile — вантажимо раз, зберігаємо кнопкою.
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    get(iRef("admin_settings/profile")).then(snap => setProfile(snap.val() || {})).catch(() => setProfile({}));
  }, []);
  const updProfile = (k, v) => setProfile(p => ({ ...(p || {}), [k]: v }));
  const allProfilePhotos = [profile?.photoUrl, ...((profile?.galleryPhotos||[]).map(p=>p.url))].filter(Boolean);

  // ── пошук адреси для мітки на карті (Nominatim/OSM — той самий провайдер,
  // що й тайли карти вище, ключ не потрібен) ─────────────────────────────
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressError, setAddressError] = useState(null);
  const [mapFlyTo, setMapFlyTo] = useState(null);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const addressDebounceRef = useRef(null);
  const profileLoadedRef = useRef(false);
  useEffect(() => {
    if (profile && !profileLoadedRef.current) {
      profileLoadedRef.current = true;
      if (profile.address) setAddressQuery(profile.address);
    }
  }, [profile]);
  useEffect(() => () => clearTimeout(addressDebounceRef.current), []);

  const pickAddressSuggestion = (r) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    updProfile("meetLat", lat);
    updProfile("meetLng", lng);
    updProfile("address", r.display_name);
    setAddressQuery(r.display_name);
    setAddressSuggestions([]);
    setSuggestionsOpen(false);
    setMapFlyTo({ lat, lng, ts: Date.now() });
  };

  // Підказки з'являються поки набирають текст (дебаунс 450мс, від 3 символів) —
  // клік по варіанту одразу ставить мітку. Enter/кнопка "Знайти" лишились як
  // запасний варіант, якщо підказки ще не встигли підвантажитись.
  const fetchAddressSuggestions = async (q) => {
    setAddressSearching(true);
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=uk&q=${encodeURIComponent(q)}`);
      const results = await resp.json();
      setAddressSuggestions(results || []);
      setSuggestionsOpen((results || []).length > 0);
    } catch {
      // мовчки — підказки не критичні, лишається ручний пошук
    } finally {
      setAddressSearching(false);
    }
  };

  const onAddressInputChange = (val) => {
    setAddressQuery(val);
    setAddressError(null);
    clearTimeout(addressDebounceRef.current);
    const q = val.trim();
    if (q.length < 3) { setAddressSuggestions([]); setSuggestionsOpen(false); return; }
    addressDebounceRef.current = setTimeout(() => fetchAddressSuggestions(q), 450);
  };

  const searchAddress = async () => {
    const q = addressQuery.trim();
    if (!q || addressSearching) return;
    if (addressSuggestions.length > 0) { pickAddressSuggestion(addressSuggestions[0]); return; }
    setAddressSearching(true); setAddressError(null);
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=uk&q=${encodeURIComponent(q)}`);
      const results = await resp.json();
      if (!results?.length) { setAddressError("Адресу не знайдено. Спробуйте уточнити запит."); return; }
      pickAddressSuggestion(results[0]);
    } catch {
      setAddressError("Не вдалося виконати пошук. Перевірте з'єднання.");
    } finally {
      setAddressSearching(false);
    }
  };

  // Зворотне геокодування — коли мітку ставлять/тягнуть прямо на карті,
  // адреса під картою на лендингу (Landing.jsx: instructorAddress) теж
  // повинна оновитись, а не лишатись від попереднього пошуку чи порожньою.
  const reverseGeocodeAddress = async (lat, lng) => {
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=uk&lat=${lat}&lon=${lng}`);
      const data = await resp.json();
      if (data?.display_name) { updProfile("address", data.display_name); setAddressQuery(data.display_name); }
    } catch {}
  };

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const saveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    await update(iRef("admin_settings/profile"), profile || {}).catch(() => {});
    setProfileSaving(false); setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1500);
  };

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const photoInputRef = useRef(null);
  const [cropFile, setCropFile] = useState(null); // { file, kind: "avatar" | "gallery" } — фото, що кадрується
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCropFile({ file, kind: "avatar" });
  };
  const uploadAvatarBlob = async (blob) => {
    setPhotoUploading(true); setPhotoError(null);
    try {
      await uploadBytes(iStorageRef(), blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(iStorageRef());
      const withBuster = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
      updProfile("photoUrl", withBuster);
      await update(iRef("admin_settings/profile"), { photoUrl: withBuster }).catch(() => {});
    } catch {
      setPhotoError("Не вдалося завантажити фото. Перевірте з'єднання і спробуйте ще раз.");
    } finally {
      setPhotoUploading(false);
    }
  };

  // Фотоколаж лендингу (до 10 фото) — profile.galleryPhotos: масив URL,
  // кожне фото свій файл у Storage (instructors/{iid}/gallery/{id}.jpg),
  // тому додавання/видалення одного не чіпає решту.
  // Перегляд фото профілю (аватар + фотоколаж) на весь екран з пінч-зумом
  // і свайпом між усіма фото — відкривається тапом по будь-якій мініатюрі.
  const [viewerOpen, setViewerOpen] = useState(null); // { photos, index } | null
  const openViewer = (photos, index) => setViewerOpen({ photos, index });

  const GALLERY_MAX = 9;
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryError, setGalleryError] = useState(null);
  const galleryInputRef = useRef(null);
  const handleGalleryAdd = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if ((profile?.galleryPhotos || []).length >= GALLERY_MAX) return;
    setCropFile({ file, kind: "gallery" });
  };
  const uploadGalleryBlob = async (blob) => {
    const current = profile?.galleryPhotos || [];
    if (current.length >= GALLERY_MAX) return;
    setGalleryUploading(true); setGalleryError(null);
    try {
      const name = `${Date.now()}.jpg`;
      await uploadBytes(iGalleryStorageRef(name), blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(iGalleryStorageRef(name));
      const next = [...current, { url, name }];
      updProfile("galleryPhotos", next);
      await update(iRef("admin_settings/profile"), { galleryPhotos: next }).catch(() => {});
    } catch {
      setGalleryError("Не вдалося завантажити фото. Перевірте з'єднання і спробуйте ще раз.");
    } finally {
      setGalleryUploading(false);
    }
  };
  const handleGalleryDelete = async (name) => {
    const next = (profile?.galleryPhotos || []).filter(p => p.name !== name);
    updProfile("galleryPhotos", next);
    await update(iRef("admin_settings/profile"), { galleryPhotos: next }).catch(() => {});
    try { await deleteObject(iGalleryStorageRef(name)); } catch {}
  };

  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    const handleBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    const handleInstalled = () => { setInstallPrompt(null); setInstalled(true); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);
  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  // Реальна висота самої пігулки SECTION RAIL — спейсер у потоці має бути
  // точно такий, інакше фіксована пігулка перекриває низ контенту секції
  // (накладка при скролі до кінця довгих секцій).
  const railRef = useRef(null);
  const [railH, setRailH] = useState(90);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const measure = () => setRailH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  const uk = lang !== "en";
  const SECTIONS = [
    { id:"schedule",   icon:"🕐", color:BLUE,   title:t('set.schedule.title'), label:uk?"Графік":"Sched." },
    { id:"snap",       icon:"⏱",  color:TEAL,   title:t('set.snap.title'),     label:uk?"Сітка":"Grid"   },
    { id:"restr",      icon:"🔒", color:RED,    title:t('set.restr.title'),    label:uk?"Ліміти":"Limits" },
    { id:"queue",      icon:"✅", color:GREEN,  title:t('set.queue.title'),    label:uk?"Черга":"Queue"  },
    { id:"sticky",     icon:"📌", color:PURPLE, title:t('set.sticky.title'),   label:uk?"Слоти":"Slots"  },
    { id:"surcharges", icon:"💰", color:GOLD,   title:"Надбавки",              label:uk?"Збори":"Fees"   },
    { id:"push",       icon:"🔔", color:GREEN,  title:"Сповіщення",            label:"Сповіщення"        },
    { id:"reviews",    icon:"⭐", color:GOLD,   title:"Відгуки учнів",         label:"Відгуки"           },
    { id:"profile",    icon:"👤", color:BLUE,   title:"Профіль інструктора",   label:"Профіль"           },
  ];

  function renderSection(id) {
    const secColor = SECTIONS.find(s=>s.id===id)?.color || ACCENT;
    const svColor = (on) => on ? GREEN : RED;
    switch(id) {

      case "schedule": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.schedule.info_t')} text={t('set.schedule.info')}/>}
          <Row label={t('set.schedule.start')} hint={t('set.schedule.hint_s')}>
            <TimeInput value={settings.workStart} onChange={v=>{
              const clamped = Math.min(v, settings.workEnd - 0.5);
              const updated = weekSchedule.map(d => ({...d, start: d.start === settings.workStart ? clamped : d.start}));
              upd("workStart", clamped);
              upd("weekSchedule", updated);
            }} min={0} max={23.5}/>
          </Row>
          <Row label={t('set.schedule.end')} hint={t('set.schedule.hint_e')}>
            <TimeInput value={settings.workEnd} onChange={v=>{
              const clamped = Math.max(v, settings.workStart + 0.5);
              const updated = weekSchedule.map(d => ({...d, end: d.end === settings.workEnd ? clamped : d.end}));
              upd("workEnd", clamped);
              upd("weekSchedule", updated);
            }} min={0.5} max={24}/>
          </Row>
          <Row label={t('set.schedule.days')}>
            <NumInput value={settings.daysShown} onChange={v=>upd("daysShown",v)} min={1} max={30} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact color={svColor(settings.lockPastBookings)} label="Блокувати минулі записи" hint="Заборонити редагувати, переносити й скасовувати записи, що вже минули — вони підсвічуються тьмяніше">
            <Toggle color={svColor(settings.lockPastBookings)} on={!!settings.lockPastBookings} onChange={v=>upd("lockPastBookings",v)}/>
          </Row>
          <Row compact last color={svColor(settings.showHelpBtn !== false)} label="Кнопка підказок «?»" hint="Показувати кнопку довідника у верхньому правому куті розкладу">
            <Toggle color={svColor(settings.showHelpBtn !== false)} on={settings.showHelpBtn !== false} onChange={v=>upd("showHelpBtn",v)}/>
          </Row>
          <WeekScheduleEditor weekSchedule={weekSchedule} updDay={updDay} setWeek={v=>upd("weekSchedule",v)}/>
        </div>
      );

      case "snap": return (
        <div>
          {showHint && <Info color={TEAL} title={t('set.snap.info_t')} text={t('set.snap.info')}/>}
          <div style={{borderRadius:10,padding:"10px",marginBottom:5,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,color:DIM}}>{t('set.snap.label')}</span>
              <span style={{fontSize:13,fontWeight:800,color:ACCENT}}>{settings.snapMin} {t('min')}</span>
            </div>
            <input type="range" min={1} max={60} value={settings.snapMin} onChange={e=>upd("snapMin",+e.target.value)}/>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
              {[1,5,10,15,30,60].map(v=>(
                <Chip key={v} label={`${v} ${t('min')}`} active={settings.snapMin===v} onClick={()=>upd("snapMin",v)}/>
              ))}
            </div>
          </div>
          <div style={{borderRadius:10,padding:"10px",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,color:DIM}}>Крок слота (довгий тап)</span>
              <span style={{fontSize:13,fontWeight:800,color:TEAL}}>{settings.slotCreateStep ?? 30} хв</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[5,10,15,30,60].map(v=>(
                <Chip key={v} label={`${v} хв`} active={(settings.slotCreateStep??30)===v} onClick={()=>upd("slotCreateStep",v)}/>
              ))}
            </div>
          </div>
          <div style={{borderRadius:10,padding:"10px",marginTop:5,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,color:DIM}}>Час у слоті</div>
              <div style={{fontSize:10,color:DIM,opacity:0.7,marginTop:2}}>Показувати "з–до" всередині слотів у графіку</div>
            </div>
            <Toggle color={svColor(settings.showSlotTimes !== false)} on={settings.showSlotTimes !== false} onChange={v=>upd("showSlotTimes",v)}/>
          </div>
          <div style={{borderRadius:10,padding:"10px",marginTop:5,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,color:DIM}}>Автокольори учнів</div>
              <div style={{fontSize:10,color:DIM,opacity:0.7,marginTop:2}}>Увімкнено — кольори слотів розподіляються автоматично. Вимкнено — колір задається вручну в картці учня</div>
            </div>
            <Toggle color={svColor(settings.autoStudentColors !== false)} on={settings.autoStudentColors !== false} onChange={v=>upd("autoStudentColors",v)}/>
          </div>
        </div>
      );

      case "restr": return (
        <div>
          {showHint && <Info color={RED} title={t('set.restr.info_t')} text={t('set.restr.info')}/>}
          <Row compact color={svColor(settings.studentCanReschedule)} label={t('set.restr.reschedule')}>
            <Toggle color={svColor(settings.studentCanReschedule)} on={settings.studentCanReschedule} onChange={v=>upd("studentCanReschedule",v)}/>
          </Row>
          <Row compact color={svColor(settings.studentCanCancel)} label={t('set.restr.cancel')}>
            <Toggle color={svColor(settings.studentCanCancel)} on={settings.studentCanCancel} onChange={v=>upd("studentCanCancel",v)}/>
          </Row>
          <Row compact label={t('set.restr.cutoff')} hint={t('set.restr.cutoff_h')}>
            <NumInput compact value={settings.bookCutoffHours} onChange={v=>upd("bookCutoffHours",v)} min={0} max={48} suffix={` ${t('hr')}`}/>
          </Row>
          <Row compact label={t('set.restr.slotGen')} hint={
            <>
              {t('set.restr.slotGen_h')}{" "}
              <span style={{
                display:"inline-flex",alignItems:"center",justifyContent:"center",
                width:20,height:14,borderRadius:5,verticalAlign:"middle",
                background:`linear-gradient(135deg,color-mix(in srgb,${GREEN} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                border:`1px solid color-mix(in srgb,${GREEN} 35%,transparent)`,
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>
                </svg>
              </span>
            </>
          }>
            <NumInput compact value={settings.slotGenDays ?? 30} onChange={v=>upd("slotGenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={t('set.restr.calendar')} hint={t('set.restr.calendar_h')}>
            <NumInput compact value={settings.calendarOpenDays} onChange={v=>upd("calendarOpenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={t('set.restr.schoolCalendar')} hint={t('set.restr.schoolCalendar_h')}>
            <NumInput compact value={settings.schoolCalendarOpenDays ?? 14} onChange={v=>upd("schoolCalendarOpenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={lang==="en"?"Min interval between bookings":"Мінімальний інтервал між записами"} hint={lang==="en"?"Minimum days between any two bookings for one student. 0 — disabled.":"Мінімум днів між будь-якими двома записами учня. 0 — без обмеження."} last>
            <NumInput compact value={settings.minBookingIntervalDays ?? 0} onChange={v=>upd("minBookingIntervalDays",v)} min={0} max={30} suffix={` ${t('days')}`}/>
          </Row>
        </div>
      );

      case "queue": return (
        <div>
          {showHint && <Info color={GREEN} title={t('set.queue.info_t')} text={t('set.queue.info')}/>}
          <div style={{paddingTop:2}}>
            <div style={{fontSize:9,color:"#fff",letterSpacing:1,textTransform:"uppercase",marginBottom:8,textAlign:"center"}}>{t('set.queue.mode')}</div>
            {[
              {k:"fifo",      label:t('set.queue.fifo'),   hint:t('set.queue.fifo_h')   },
              {k:"broadcast", label:t('set.queue.bc'),     hint:t('set.queue.bc_h')     },
              {k:"manual",    label:t('set.queue.manual'), hint:t('set.queue.manual_h') },
            ].map((o,i,arr)=>(
              <Row color={svColor(queueMode===o.k)} key={o.k} label={o.label} hint={o.hint} last={i===arr.length-1}>
                <Radio on={queueMode===o.k} onChange={()=>setQueueMode(o.k)}/>
              </Row>
            ))}
          </div>
        </div>
      );

      case "sticky": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.sticky.info_t')} text={t('set.sticky.info')}/>}
          <Row color={svColor(settings.stickyTimeEnabled === true)} label={lang==="en"?"Enable feature":"Увімкнути"} hint={lang==="en"?"When off — all adjacent free slots are shown":"Вимкнено — всі вільні слоти видно завжди"}>
            <Toggle color={svColor(settings.stickyTimeEnabled === true)} on={settings.stickyTimeEnabled === true} onChange={v=>upd("stickyTimeEnabled",v)}/>
          </Row>
          {settings.stickyTimeEnabled === true && (
            <div>
              {[
                {v:"before", l:t('set.sticky.before')},
                {v:"after",  l:t('set.sticky.after') },
                {v:"both",   l:t('set.sticky.both')  },
              ].map((o,i,arr)=>(
                <Row color={svColor(settings.stickyTime===o.v)} key={o.v} label={o.l} last={i===arr.length-1}>
                  <Radio on={settings.stickyTime===o.v} onChange={()=>upd("stickyTime",o.v)}/>
                </Row>
              ))}
            </div>
          )}
        </div>
      );

      case "surcharges": return (
        <div>
          {showHint && <Info color={GOLD}
            title={lang==="en"?"Surcharges":"Надбавки"}
            text={lang==="en"
              ? "A surcharge is an extra paid option for a lesson, for example «driving range trip» or «harder route».\n\n• Each surcharge is a fixed amount in UAH. Add as many options as you need; remove one with the «×» button.\n• How to use: open the slot menu in the schedule and add the surcharge to a booking.\n• The student immediately sees the total price including the surcharge."
              : "Надбавка — це додаткова платна опція до уроку. Наприклад, «виїзд на автодром» або «складніший маршрут».\n\n• Кожна надбавка — це фіксована сума в гривнях. Додайте стільки варіантів, скільки потрібно; зайвий можна видалити кнопкою «×».\n• Як користуватись: у розкладі відкрийте меню слота й додайте потрібну надбавку до запису.\n• Учень одразу бачить підсумкову ціну вже з надбавкою."}
          />}
          <div style={{fontSize:12,color:FAINT,marginBottom:12}}>
            Суми відображаються в меню слота при виборі надбавки.
          </div>
          {(settings.surcharges || []).map((amt, i) => (
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:10,marginBottom:5,
              padding:"10px 12px",borderRadius:10,
              background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO,
            }}>
              <span style={{fontSize:13,color:GOLD,fontWeight:700,flex:1}}>Надбавка {i+1}</span>
              <NumInput
                value={amt}
                onChange={v=>upd("surcharges", (settings.surcharges||[]).map((x,j)=>j===i?v:x))}
                min={50} max={99999} suffix="₴" step={50}
              />
              <button onClick={()=>upd("surcharges", (settings.surcharges||[]).filter((_,j)=>j!==i))} style={{
                background:"none",border:"none",cursor:"pointer",
                color:"rgba(248,113,113,0.8)",fontSize:20,lineHeight:1,padding:"0 4px",
              }}>×</button>
            </div>
          ))}
          {(settings.surcharges||[]).length < 5 ? (
            <button onClick={()=>upd("surcharges", [...(settings.surcharges||[]), 0])} style={{
              width:"100%",padding:"11px",borderRadius:12,border:`1px dashed ${GREEN}88`,cursor:"pointer",
              background:"transparent",color:GREEN,fontSize:13,fontWeight:700,marginTop:2,
            }}>+ Додати надбавку</button>
          ) : (
            <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.4)",padding:"6px 0"}}>
              Максимум 5 надбавок
            </div>
          )}
        </div>
      );

      case "push": return (
        <div>
          {showHint && <Info color={GREEN}
            title={lang==="en"?"Student notifications":"Сповіщення учням"}
            text={lang==="en"
              ? "These are messages the system sends to students by itself, without you. You can change the texts on the «Templates» tab.\n\n• Reminders — how many hours before a lesson the student gets a reminder. You can set up to three, for example 24 and 2 hours. The switch on the left turns each one on or off. Reminders reduce missed lessons.\n• Cancellation message — the student gets a message if their booking was cancelled.\n• Queue offer — when a place frees up, a student from the queue automatically gets an offer to book (the first one or everyone, depending on the queue mode).\n• Slot freed notification — when a place frees up in the next 10 days, all students find out at once."
              : "Це повідомлення, які система надсилає учням сама, без вашої участі. Самі тексти повідомлень можна змінити на вкладці «Шаблони».\n\n• Нагадування — за скільки годин до уроку учень отримає нагадування. Можна задати до трьох, наприклад за 24 і за 2 години. Перемикач зліва вмикає або вимикає кожне окремо. Нагадування зменшують кількість пропущених уроків.\n• Повідомлення про скасування — учень отримає повідомлення, якщо його запис скасували.\n• Пропозиція з черги — коли звільняється місце, учень із черги автоматично отримує пропозицію записатись (першому або всім, залежно від режиму черги).\n• Сповіщення при звільненні слоту — коли в найближчі 10 днів звільняється місце, про це одразу дізнаються всі учні."}
          />}
          <div style={{paddingTop:10,display:"flex",flexDirection:"column",gap:5}}>
            <div style={{fontSize:9,color:"#fff",letterSpacing:1,textTransform:"uppercase",marginBottom:2,textAlign:"center"}}>{t('set.auto.reminder')}</div>
            {reminders.map((r,i)=>(
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:8,
                background:`linear-gradient(135deg,color-mix(in srgb,${svColor(r.enabled)} ${r.enabled?38:22}%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                border:`1px solid color-mix(in srgb,${svColor(r.enabled)} ${r.enabled?35:25}%,transparent)`,
                borderRadius:10,padding:"7px 10px",
              }}>
                <SmallToggle color={svColor(r.enabled)} on={r.enabled} onChange={v=>updReminder(i,{enabled:v})}/>
                <span style={{fontSize:12,color:DIM,flex:1}}>
                  {lang==="en"?"Reminder":"Нагадування"} #{i+1}
                </span>
                <NumInput value={r.hoursBefore} onChange={v=>updReminder(i,{hoursBefore:v})} min={1} max={168} suffix={` ${t('hr')}`}/>
                <span style={{fontSize:11,color:FAINT}}>{t('set.auto.rem_h')}</span>
              </div>
            ))}
          </div>
          <Row color={svColor(!!settings.autoCancel?.enabled)} label={t('set.auto.cancel')}>
            <Toggle color={svColor(!!settings.autoCancel?.enabled)} on={!!settings.autoCancel?.enabled} onChange={v=>setSettings(s=>({...s,autoCancel:{...(s.autoCancel||{}),enabled:v}}))}/>
          </Row>
          <Row color={svColor(!!settings.autoQueueOffer?.enabled)} label={t('set.auto.queue')}>
            <Toggle color={svColor(!!settings.autoQueueOffer?.enabled)} on={!!settings.autoQueueOffer?.enabled} onChange={v=>setSettings(s=>({...s,autoQueueOffer:{...(s.autoQueueOffer||{}),enabled:v}}))}/>
          </Row>
          <Row color={svColor(settings.slotFreedPushEnabled !== false)} label={lang==="en"?"Notify on freed slot":"Сповіщення при звільненні слоту"} hint={lang==="en"?"Notify all students when a slot within the next 10 days becomes free":"Сповіщення усім учням, коли в найближчі 10 днів звільняється слот"} last>
            <Toggle color={svColor(settings.slotFreedPushEnabled !== false)} on={settings.slotFreedPushEnabled !== false} onChange={v=>upd("slotFreedPushEnabled",v)}/>
          </Row>
        </div>
      );

      case "reviews": return (
        <div>
          {showHint && <Info color={GOLD} title="Відгуки учнів" text={"Учні лишають відгук самі після завершеного уроку. Відгук одразу з’являється на вашій сторінці запису, його бачать усі відвідувачі.\n\nВидалити або змінити відгук не можна. Але його можна сховати кнопкою «Сховати» — тоді його не буде видно на сайті. Передумали — натисніть «Показати»."}/>}
          {reviews.length === 0 ? (
            <div style={{textAlign:"center",padding:"24px 12px",color:DIM,fontSize:12}}>Поки що немає відгуків</div>
          ) : reviews.map(rv => (
            <div key={`${rv.uid}_${rv.id}`} style={{
              padding:"10px 12px",borderRadius:11,marginBottom:6,
              background:SURF_LO,boxShadow:SI,opacity:rv.status==="hidden"?0.5:1,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:13,fontWeight:800,color:TEXT}}>{rv.studentName || "Учень"}</div>
                <div style={{color:GOLD,fontSize:12,letterSpacing:1}}>{"★".repeat(rv.rating||0)}{"☆".repeat(5-(rv.rating||0))}</div>
              </div>
              {rv.text && <div style={{fontSize:12,color:DIM,lineHeight:1.5,marginBottom:6}}>{rv.text}</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:10,color:FAINT}}>{rv.createdAt ? new Date(rv.createdAt).toLocaleDateString("uk-UA") : ""}</div>
                <button onClick={()=>toggleReviewHidden(rv)} style={{
                  padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                  background:rv.status==="hidden"?`linear-gradient(145deg,${GREEN},${GREEN})`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                  color:rv.status==="hidden"?"#fff":DIM,boxShadow:rv.status==="hidden"?"none":SO,
                }}>{rv.status==="hidden"?"Показати":"Сховати"}</button>
              </div>
            </div>
          ))}
        </div>
      );

      case "profile": return (
        <div>
          {showHint && <Info color={BLUE} title="Профіль інструктора" text={"Це ваша візитка. Усе, що тут заповнено, учні бачать на сторінці запису.\n\n• Фото профілю — ваше фото (JPG або PNG, до 5 МБ).\n• Портфоліо — розповідь про себе та свої переваги (до 1500 символів). Показується угорі сторінки запису, довгий текст згортається кнопкою «Читати далі».\n• Фотоколаж — до 9 фото (учні за кермом, з іспиту, з авто). На сторінці запису вони змінюються одне за одним у колажі.\n• Телефон — на нього працюють кнопки дзвінка, Viber, WhatsApp і Telegram на сторінці запису. Вводьте номер у форматі +380XXXXXXXXX.\n• Умови відвідування — ваші правила (наприклад, про скасування, запізнення, документи). Порожнє поле — блок на сайті просто не показується.\n• Локація на карті — знайдіть адресу або поставте мітку на карті: учні побачать, де вас знайти.\n• Посилання для запису — надішліть його учням, щоб вони записувались самі. Кнопка «Встановити додаток» додає DrivePad на головний екран телефону."}/>}

          <ProfileCard color={ACCENT} icon="🧑‍🏫" title="ФОТО ПРОФІЛЮ">
            {/* PHOTO */}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
              <div
                onClick={()=>profile?.photoUrl && openViewer(allProfilePhotos, 0)}
                style={{width:64,height:64,borderRadius:"50%",overflow:"hidden",background:BG_DEEP,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SO,cursor:profile?.photoUrl?"pointer":"default"}}
              >
                {profile?.photoUrl
                  ? <img src={profile.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  : <span style={{fontSize:26}}>🧑‍🏫</span>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <button onClick={()=>photoInputRef.current?.click()} disabled={photoUploading} style={{
                  padding:"9px 14px",borderRadius:10,border:"none",cursor:photoUploading?"default":"pointer",fontSize:12,fontWeight:700,
                  background:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,color:"#fff",boxShadow:SO,opacity:photoUploading?0.6:1,
                }}>{photoUploading?"Завантаження…":"Завантажити фото"}</button>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{display:"none"}}/>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",marginTop:6}}>JPG/PNG, до 5 МБ — покажеться учням на сторінці запису</div>
                {photoError && <div style={{fontSize:11,color:RED,marginTop:4}}>{photoError}</div>}
              </div>
            </div>

            {/* GALLERY — фотоколаж на сторінці запису (Landing.jsx), до 9 фото */}
            <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)",letterSpacing:0.5,marginBottom:6}}>ФОТОКОЛАЖ НА СТОРІНЦІ ЗАПИСУ ({(profile?.galleryPhotos||[]).length}/{GALLERY_MAX})</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8,marginBottom:6}}>
              {(profile?.galleryPhotos||[]).map((p, idx) => (
                <div key={p.name} onClick={()=>openViewer(allProfilePhotos, (profile?.photoUrl?1:0)+idx)} style={{position:"relative",width:"100%",aspectRatio:"1",borderRadius:10,overflow:"hidden",boxShadow:SO,cursor:"pointer"}}>
                  <img src={p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  <button onClick={(e)=>{e.stopPropagation();handleGalleryDelete(p.name);}} style={{
                    position:"absolute",top:3,right:3,width:20,height:20,borderRadius:"50%",border:"none",cursor:"pointer",
                    background:"rgba(0,0,0,0.6)",color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,
                  }}>×</button>
                </div>
              ))}
              {(profile?.galleryPhotos||[]).length < GALLERY_MAX && (
                <button onClick={()=>galleryInputRef.current?.click()} disabled={galleryUploading} style={{
                  width:"100%",aspectRatio:"1",borderRadius:10,border:`1px dashed rgba(255,255,255,0.25)`,cursor:galleryUploading?"default":"pointer",
                  background:"transparent",color:"rgba(255,255,255,0.7)",fontSize:11,fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
                }}>
                  <span style={{fontSize:20,lineHeight:1}}>{galleryUploading?"…":"+"}</span>
                  {!galleryUploading && "Додати"}
                </button>
              )}
              <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleGalleryAdd} style={{display:"none"}}/>
            </div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.55)"}}>Фото учнів за кермом, з іспиту, з авто — на сторінці запису вони показуються анімованим колажем.</div>
            {galleryError && <div style={{fontSize:11,color:RED,marginTop:6}}>{galleryError}</div>}
          </ProfileCard>

          {/* ПОРТФОЛІО — текст про себе й переваги, показується на сторінці запису угорі */}
          <ProfileCard color={GOLD} icon="⭐" title="ПОРТФОЛІО">
            <textarea
              value={profile?.about ?? ""}
              onChange={e=>updProfile("about", e.target.value.slice(0, 1500))}
              maxLength={1500}
              rows={7}
              placeholder="Розкажіть про себе: досвід, авто, підхід до навчання, чим ви кращі за інших, чому варто обрати саме вас…"
              style={{width:"100%",boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:12,padding:"10px 12px",borderRadius:10,boxShadow:SI,resize:"vertical",fontFamily:"inherit",lineHeight:1.5,marginBottom:6}}
            />
            <div style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:10,color:"rgba(255,255,255,0.55)"}}>
              <span>Це бачать учні угорі сторінки запису. Довгий текст згортається кнопкою «Читати далі». Порожнє поле — блок не показується.</span>
              <span style={{flexShrink:0}}>{(profile?.about ?? "").length}/1500</span>
            </div>
          </ProfileCard>

          {/* КОНТАКТИ — телефон, джерело для кнопок дзвінка/Viber/WhatsApp/Telegram на лендингу */}
          <ProfileCard color={BLUE} icon="📞" title="КОНТАКТИ">
            <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)",letterSpacing:0.5,marginBottom:5}}>ТЕЛЕФОН</div>
            <input
              value={profile?.phone ?? ""}
              onChange={e=>updProfile("phone", e.target.value)}
              placeholder="+380XXXXXXXXX"
              type="tel"
              style={{width:"100%",boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:13,padding:"10px 12px",borderRadius:10,boxShadow:SI,fontFamily:"inherit",marginBottom:6}}
            />
            <div style={{fontSize:10,color:"rgba(255,255,255,0.55)"}}>Дзвінок, Viber, WhatsApp і Telegram на сторінці запису працюють через цей номер.</div>
          </ProfileCard>

          {/* УМОВИ */}
          <ProfileCard color={PURPLE} icon="📄" title="УМОВИ ВІДВІДУВАННЯ">
            <textarea
              value={profile?.terms ?? ""}
              onChange={e=>updProfile("terms", e.target.value)}
              rows={7}
              placeholder="Наприклад: скасування пізніше ніж за 24 год оплачується повністю; запізнення не продовжує заняття; при собі мати документ, що посвідчує особу…"
              style={{width:"100%",boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:12,padding:"10px 12px",borderRadius:10,boxShadow:SI,resize:"vertical",fontFamily:"inherit",lineHeight:1.5,marginBottom:6}}
            />
            <div style={{fontSize:10,color:"rgba(255,255,255,0.55)"}}>Порожнє поле — блок «Умови відвідування» просто не покажеться на сайті.</div>
          </ProfileCard>

          {/* ЛОКАЦІЯ */}
          <ProfileCard color={TEAL} icon="📍" title="ЛОКАЦІЯ НА КАРТІ">
            <LocationMap
              lat={profile?.meetLat}
              lng={profile?.meetLng}
              flyTo={mapFlyTo}
              onPick={(lat,lng)=>{ updProfile("meetLat", lat); updProfile("meetLng", lng); reverseGeocodeAddress(lat, lng); }}
            />
            <div style={{position:"relative",marginTop:8}}>
              <div style={{display:"flex",gap:8}}>
                <div style={{position:"relative",flex:1,minWidth:0}}>
                  <input
                    value={addressQuery}
                    onChange={e=>onAddressInputChange(e.target.value)}
                    onFocus={()=>{ if(addressSuggestions.length) setSuggestionsOpen(true); }}
                    onBlur={()=>setTimeout(()=>setSuggestionsOpen(false),150)}
                    onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); searchAddress(); } }}
                    placeholder="Пошук адреси…"
                    style={{width:"100%",boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:13,padding:"10px 30px 10px 12px",borderRadius:10,boxShadow:SI,fontFamily:"inherit"}}
                  />
                  {addressQuery && (
                    <button
                      onMouseDown={e=>e.preventDefault()}
                      onClick={()=>{ setAddressQuery(""); setAddressSuggestions([]); setSuggestionsOpen(false); setAddressError(null); }}
                      aria-label="Очистити"
                      style={{
                        position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",
                        width:20,height:20,borderRadius:"50%",border:"none",cursor:"pointer",
                        background:"rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.75)",
                        fontSize:12,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",
                      }}
                    >×</button>
                  )}
                </div>
                <button onClick={searchAddress} disabled={addressSearching} style={{
                  padding:"0 16px",borderRadius:10,border:"none",cursor:addressSearching?"default":"pointer",fontSize:13,fontWeight:800,flexShrink:0,
                  background:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,color:"#fff",
                }}>{addressSearching?"…":"Знайти"}</button>
              </div>
              {suggestionsOpen && addressSuggestions.length > 0 && (
                <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:20,background:SURFACE,borderRadius:10,boxShadow:SO,overflow:"hidden",maxHeight:240,overflowY:"auto"}}>
                  {addressSuggestions.map((r,idx)=>(
                    <div
                      key={r.place_id ?? idx}
                      onMouseDown={e=>{ e.preventDefault(); pickAddressSuggestion(r); }}
                      style={{padding:"12px",fontSize:15,color:"#fff",cursor:"pointer",borderBottom:idx<addressSuggestions.length-1?`1px solid ${BORDER}`:"none"}}
                    >{r.display_name}</div>
                  ))}
                </div>
              )}
            </div>
            {addressError && <div style={{fontSize:10,color:RED,marginTop:8}}>{addressError}</div>}
            <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",marginTop:8}}>Знайдіть адресу нижче, клікніть на карту або перетягніть мітку — учні побачать саме цю точку і адресу на сторінці запису.</div>
          </ProfileCard>

          <button onClick={saveProfile} disabled={profileSaving} style={{
            width:"100%",padding:"12px",borderRadius:12,border:"none",cursor:profileSaving?"default":"pointer",fontSize:14,fontWeight:800,
            background:profileSaved?`linear-gradient(145deg,${GREEN},${GREEN})`:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,color:"#fff",boxShadow:SO,
          }}>{profileSaved?"✓ Збережено":profileSaving?"Зберігаємо…":"Зберегти профіль"}</button>

          {cropFile && (
            <PhotoCropModal
              file={cropFile.file}
              round={cropFile.kind === "avatar"}
              outSize={cropFile.kind === "avatar" ? 800 : 1000}
              title={cropFile.kind === "avatar" ? "Фото профілю" : "Фото для колажу"}
              onCancel={() => setCropFile(null)}
              onDone={(blob) => { const k = cropFile.kind; setCropFile(null); (k === "avatar" ? uploadAvatarBlob : uploadGalleryBlob)(blob); }}
            />
          )}
          {viewerOpen && (
            <PhotoViewer photos={viewerOpen.photos} index={viewerOpen.index} onClose={()=>setViewerOpen(null)}/>
          )}
        </div>
      );

      default: return null;
    }
  }

  const [displayedSection, mosaicPhase] = useMosaicSwitch(active);
  const activeSec = SECTIONS.find(s => s.id === displayedSection);

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{
        display:"flex", flexDirection:"column", gap:10,
        fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif", color:TEXT,
      }}>

        {/* PANEL — section content */}
        <div style={{padding:"4px 4px 0", minWidth:0}}>
          <div style={{
            position:"relative",
            borderRadius:16,
            boxShadow:`0 0 0 1.5px ${isKava?"rgba(0,0,0,0.14)":"rgba(255,255,255,0.18)"}, 0 8px 28px rgba(0,0,0,0.28)`,
            background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
            padding:"12px 14px 14px",
            overflow:"hidden",
          }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              {activeSec && (
                <div style={{fontSize:14,fontWeight:800,color:activeSec.color,display:"flex",alignItems:"center",gap:8}}>
                  <span>{activeSec.icon}</span>
                  <span>{activeSec.title}</span>
                </div>
              )}
              <button onClick={()=>setShowHint(v=>!v)} style={{
                width:28,height:28,borderRadius:8,border:"none",cursor:"pointer",flexShrink:0,
                background:showHint?`${GOLD}33`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:SO,transition:"all .15s",
              }}>💡</button>
            </div>
            {renderSection(displayedSection)}
            <MosaicOverlay phase={mosaicPhase} tileColor={SURFACE}/>
          </div>
        </div>

        {/* SECTION RAIL — друга пігулка, візуально ідентична нижньому навбару
            (BottomNav у App.jsx: "скляні чипи" — той самий напівпрозорий фон,
            радіус, бордер, тінь; активна секція підсвічена зеленою заливкою
            чипу, без окремої рискою — так само як таби внизу).
            Рендериться через portal у document.body з position:fixed і
            bottom:navH (реальна виміряна висота #app-bottomnav) — тому
            дійсно "мертво" прибита над навбаром і не рухається під час
            скролу вмісту секції (на відміну від sticky, який пінився лише
            всередині скрол-контейнера вкладки). Спейсер після версії
            (не тут!) звільняє місце в потоці — якщо покласти його одразу
            після PANEL, версія й 40px-спейсер підуть услід за ним і
            опиняться рівно під фіксованою пігулкою, невидимі. */}
      </div>

      {createPortal(
        <div ref={railRef} style={{
          position:"fixed", left:0, right:0, bottom:navH, zIndex:50,
          padding:"6px 3px 0", pointerEvents:"none",
        }}>
          <div style={{
            background: isKava ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)",
            backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
            borderRadius:16,
            border:`1px solid ${BORDER}`,
            boxShadow: isKava
              ? "0 8px 24px rgba(92,42,26,0.14)"
              : "0 8px 24px rgba(0,0,0,0.45)",
            display:"flex", gap:2, padding:3,
            pointerEvents:"auto",
          }}>
            {SECTIONS.map(sec => {
              const isActive = active === sec.id;
              return (
                <button key={sec.id} onClick={()=>switchSection(sec.id)} title={sec.title} style={{
                  flex:"1 1 0", minWidth:0, padding:"8px 2px 7px",
                  background: isActive ? `color-mix(in srgb, ${GREEN} 18%, transparent)` : "transparent",
                  border:"none", cursor:"pointer", borderRadius:11,
                  display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                  position:"relative", fontFamily:"inherit",
                }}>
                  <SecIcon id={sec.id} color={sec.color} active={isActive} isKava={isKava}/>
                  <span style={{
                    fontSize:9, fontWeight:700,
                    color: isActive ? GREEN : (isKava ? DIM : FAINT),
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%",
                  }}>{sec.label}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {installPrompt && !installed && (
        <button onClick={handleInstallClick} style={{
          display:"block", margin:"12px auto 0", background:"rgba(255,255,255,0.05)",
          border:`1px solid ${BORDER}`, color:TEXT, cursor:"pointer",
          padding:"10px 24px", borderRadius:14, fontSize:13, fontWeight:700,
        }}>📲 Встановити додаток</button>
      )}
      {active === "profile" && bookingSlug && (
        <div style={{
          margin:"12px 14px 0", padding:"12px 14px", borderRadius:14,
          background:`linear-gradient(135deg,color-mix(in srgb,${ACCENT} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
          border:`1px solid color-mix(in srgb,${ACCENT} 35%,transparent)`,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:15}}>🔗</span>
            <span style={{fontSize:12, fontWeight:800, color:"#fff"}}>ПОСИЛАННЯ ДЛЯ ЗАПИСУ УЧНІВ</span>
          </div>
          <div style={{background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"9px 12px", fontSize:12, color:TEXT, wordBreak:"break-all"}}>{bookingLink}</div>
          <button onClick={copyBookingLink} style={{
            marginTop:8, width:"100%", padding:"10px", borderRadius:10, border:"none", cursor:"pointer",
            background: slugCopied ? "linear-gradient(135deg,#4ade80,#34d399)" : `linear-gradient(135deg,${ACC_HI},${ACCENT})`,
            color: slugCopied ? "#0a2e1a" : "#fff", fontSize:13, fontWeight:800,
          }}>{slugCopied ? "✓ Скопійовано" : "Копіювати"}</button>
        </div>
      )}
      {active === "profile" && (
      <div style={{
        margin:"10px 14px 0", padding:"12px 14px", borderRadius:14,
        background:`linear-gradient(135deg,color-mix(in srgb,${GOLD} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
        border:`1px solid color-mix(in srgb,${GOLD} 35%,transparent)`,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:15}}>💳</span>
          <span style={{fontSize:12, fontWeight:800, color:"#fff"}}>ОПЛАТА ПІДПИСКИ</span>
        </div>
        <LicensePayPanel/>
      </div>
      )}
      {active === "profile" && license && (() => {
        // eslint-disable-next-line react-hooks/purity -- лише для відображення "днів залишилось", не впливає на логіку
        const now = Date.now();
        const untilTs = license.status === "trial" ? license.trialEndsAt : license.expiresAt;
        const daysLeft = untilTs ? Math.ceil((untilTs - now) / 86400000) : null;
        const lvl = licenseState(license).level;
        const blocked = lvl === "readonly";
        const statusColor = blocked ? RED : (lvl === "grace" || lvl === "warning" ? GOLD : GREEN);
        const statusLabel = blocked ? "Режим читання" : lvl === "grace" ? "Пільгова доба — оплатіть" : license.status === "trial" ? "Пробний період" : "Активна";
        const fmtDate = ts => ts ? new Date(ts).toLocaleDateString("uk", { day:"numeric", month:"long", year:"numeric" }) : "—";
        const providerLabel = { liqpay:"LiqPay", monobank:"Monobank", manual:"вручну (підтримка)" }[license.provider] || null;
        const rows = [
          ["Ім'я",  profile?.name || "—"],
          ["Телефон", profile?.phone || "—"],
          ["Email входу", auth.currentUser?.email || "—"],
        ];
        if (license.status === "trial") {
          rows.push(["Пробний період до", fmtDate(license.trialEndsAt)]);
          if (daysLeft != null) rows.push(["Залишилось днів", blocked ? "0 (сплив)" : String(daysLeft)]);
        } else {
          rows.push(["Оплачено до", fmtDate(license.expiresAt)]);
          if (daysLeft != null) rows.push(["Залишилось днів", blocked ? "0 (сплив)" : String(daysLeft)]);
          if (license.lastPaymentAt) rows.push(["Востаннє оплачено", fmtDate(license.lastPaymentAt)]);
          if (providerLabel) rows.push(["Спосіб оплати", providerLabel]);
          rows.push(["Тариф", license.plan === "yearly" ? "Рік · 2999₴" : "Місяць · 299₴"]);
        }
        return (
          <div style={{
            margin:"10px 14px 0", padding:"12px 14px", borderRadius:14,
            background:`linear-gradient(135deg,color-mix(in srgb,${GREEN} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
            border:`1px solid color-mix(in srgb,${GREEN} 35%,transparent)`,
          }}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:15}}>🔔</span>
              <span style={{fontSize:12, fontWeight:800, color:"#fff"}}>ПІДПИСКА</span>
            </div>
            <div style={{fontSize:14, fontWeight:700, color:statusColor}}>{statusLabel}</div>
            {blocked && (
              <div style={{fontSize:12, color:"rgba(255,255,255,0.6)", marginTop:2}}>Акаунт у режимі читання. Оплатіть підписку нижче, щоб відновити роботу.</div>
            )}
            <div style={{marginTop:10, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", gap:5}}>
              {rows.map(([label, value]) => (
                <div key={label} style={{display:"flex", justifyContent:"space-between", gap:10, fontSize:12}}>
                  <span style={{color:"rgba(255,255,255,0.55)"}}>{label}</span>
                  <span style={{color:"#fff", fontWeight:700, textAlign:"right"}}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {active === "profile" && (
        <div style={{margin:"10px 14px 0"}}>
          <button onClick={() => { if (window.confirm("Вийти з акаунта?")) signOut(auth).catch(() => {}); }} style={{
            width:"100%", padding:"12px", borderRadius:12, cursor:"pointer", fontFamily:"inherit",
            background:"rgba(239,68,68,0.10)", border:"1px solid rgba(239,68,68,0.35)",
            color:"#f87171", fontSize:13, fontWeight:800,
          }}>Вийти з акаунта</button>
          <div style={{fontSize:11, color:"rgba(255,255,255,0.4)", textAlign:"center", marginTop:6}}>{auth.currentUser?.email || ""}</div>
          <div style={{marginTop:14, textAlign:"center"}}>
            {!rstOpen ? (
              <button onClick={() => setRstOpen(true)} style={{background:"none",border:"none",color:"#f87171",fontSize:12,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>Повне скидання даних (тест)</button>
            ) : (
              <div style={{padding:"14px",borderRadius:14,border:"1px solid rgba(239,68,68,0.4)",background:"rgba(239,68,68,0.08)",textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:800,color:"#f87171",marginBottom:6}}>Скинути все до початкового стану?</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.65)",lineHeight:1.5,marginBottom:10}}>
                  Буде видалено розклад і слоти, усі записи, чергу, чати, нотатки, налаштування та послуги. Акаунт, підписка і зв'язок з учнями залишаються. Після скидання все як у нового інструктора. Щоб підтвердити, введіть слово <b style={{color:"#fff"}}>СКИНУТИ</b>.
                </div>
                <input value={rstText} onChange={e=>setRstText(e.target.value)} placeholder="СКИНУТИ"
                  style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.18)",background:"rgba(0,0,0,0.3)",color:"#fff",fontSize:14,outline:"none",marginBottom:10}}/>
                <div style={{display:"flex",gap:8}}>
                  <button disabled={rstBusy || rstText.trim().toUpperCase()!=="СКИНУТИ"} onClick={async()=>{
                    setRstBusy(true);
                    try {
                      const wipe = {};
                      RESET_PATHS.forEach(k => { wipe[k] = null; });
                      await update(iRef(""), wipe);
                      window.location.reload();
                    } catch { setRstBusy(false); alert("Не вдалося скинути дані. Спробуйте пізніше."); }
                  }} style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:(rstBusy||rstText.trim().toUpperCase()!=="СКИНУТИ")?"rgba(239,68,68,0.25)":"#ef4444",color:"#fff",fontWeight:800,fontSize:13}}>{rstBusy?"Скидання…":"Скинути все"}</button>
                  <button disabled={rstBusy} onClick={()=>{setRstOpen(false);setRstText("");}} style={{padding:"10px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,0.18)",background:"transparent",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Скасувати</button>
                </div>
              </div>
            )}
          </div>
          <div style={{marginTop:14, textAlign:"center"}}>
            {!delOpen ? (
              <button onClick={() => setDelOpen(true)} style={{background:"none",border:"none",color:"#f87171",fontSize:12,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>Видалити акаунт</button>
            ) : (
              <div style={{padding:"14px",borderRadius:14,border:"1px solid rgba(239,68,68,0.4)",background:"rgba(239,68,68,0.08)",textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:800,color:"#f87171",marginBottom:6}}>Видалити акаунт назавжди?</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.65)",lineHeight:1.5,marginBottom:10}}>
                  Буде видалено ваш профіль, розклад, усіх учнів, записи, чати та сторінку запису. Оплачена підписка не повертається, а автосписання LiqPay (якщо є) потрібно скасувати окремо. Неможливо скасувати.
                  Щоб підтвердити, введіть слово <b style={{color:"#fff"}}>ВИДАЛИТИ</b>.
                </div>
                <input value={delText} onChange={e=>setDelText(e.target.value)} placeholder="ВИДАЛИТИ"
                  style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.18)",background:"rgba(0,0,0,0.3)",color:"#fff",fontSize:14,outline:"none",marginBottom:10}}/>
                <div style={{display:"flex",gap:8}}>
                  <button disabled={deleting || delText.trim().toUpperCase()!=="ВИДАЛИТИ"} onClick={async()=>{
                    setDeleting(true);
                    try { await deleteAccountRequest({ type:"instructor", iid:auth.currentUser.uid }); try{localStorage.clear();}catch{/* ignore */} await signOut(auth).catch(()=>{}); window.location.href="/"; }
                    catch { setDeleting(false); alert("Не вдалося видалити акаунт. Спробуйте пізніше."); }
                  }} style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:(deleting||delText.trim().toUpperCase()!=="ВИДАЛИТИ")?"rgba(239,68,68,0.25)":"#ef4444",color:"#fff",fontWeight:800,fontSize:13}}>{deleting?"Видалення…":"Видалити"}</button>
                  <button disabled={deleting} onClick={()=>{setDelOpen(false);setDelText("");}} style={{padding:"10px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,0.18)",background:"transparent",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Скасувати</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{height:railH + 16}}/>
    </>
  );
}

