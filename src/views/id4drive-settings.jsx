import { useState, useContext } from "react";
import { ref, get } from "firebase/database";
import { LangContext } from "../App";
import { APP_VERSION } from "../version.js";
import { ThemeContext } from "../theme.js";
import { UICss, useFX } from "../ui";
import { createT } from "../lang";
import { db, registerAdminFCM } from "../firebase";

const ALL_TABS = [
  { id:"schedule",  lk:"nav.schedule"  },
  { id:"bookings",  lk:"nav.bookings"  },
  { id:"students",  lk:"nav.students"  },
  { id:"services",  lk:"nav.services"  },
  { id:"chats",     lk:"nav.chats"     },
  { id:"templates", lk:"nav.templates" },
  { id:"stats",     lk:"nav.stats"     },
  { id:"journal",   lk:"nav.journal"   },
  { id:"settings",  lk:"nav.settings"  },
];

const DAY_NAMES = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

// ─── MODULE-LEVEL ATOMS (stable references → no remount on settings change) ───

function Toggle({ on, onChange }) {
  const { ACC_HI, ACCENT, SURF_LO, BG_DEEP, SI } = useContext(ThemeContext);
  const { shade } = useFX();
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:44,height:24,borderRadius:12,cursor:"pointer",position:"relative",
      background:on?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
      boxShadow:on?`0 0 8px ${ACCENT}44`:SI,transition:"background .2s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:3,left:on?21:3,width:18,height:18,borderRadius:9,
        background:"linear-gradient(135deg,#fff,#ddd)",
        boxShadow:`0 1px 4px ${shade(0.4)}`,transition:"left .2s",
      }}/>
    </div>
  );
}

function SmallToggle({ on, onChange }) {
  const { ACC_HI, ACCENT, SURF_LO, BG_DEEP, SI } = useContext(ThemeContext);
  const { shade } = useFX();
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:32,height:18,borderRadius:9,cursor:"pointer",position:"relative",
      background:on?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
      boxShadow:on?`0 0 6px ${ACCENT}44`:SI,transition:"background .2s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:2,left:on?16:2,width:14,height:14,borderRadius:7,
        background:"linear-gradient(135deg,#fff,#ddd)",
        boxShadow:`0 1px 3px ${shade(0.4)}`,transition:"left .2s",
      }}/>
    </div>
  );
}

function NumInput({ value, onChange, min=0, max=999, suffix="", step=1 }) {
  const { BG_DEEP, SURF_HI, SURFACE, TEXT, SO, SI } = useContext(ThemeContext);
  return (
    <div style={{display:"flex",alignItems:"center",gap:4,background:BG_DEEP,borderRadius:9,boxShadow:SI,padding:"4px 6px"}}>
      <button onClick={()=>onChange(Math.max(min,value-step))} style={{
        width:26,height:26,borderRadius:7,border:"none",cursor:"pointer",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:14,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SO,
      }}>−</button>
      <span style={{fontSize:13,fontWeight:700,color:TEXT,minWidth:32,textAlign:"center"}}>
        {value}{suffix}
      </span>
      <button onClick={()=>onChange(Math.min(max,value+step))} style={{
        width:26,height:26,borderRadius:7,border:"none",cursor:"pointer",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:14,
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

function Row({ label, hint, children, last }) {
  const { BG_DEEP, SURF_LO, TEXT, FAINT, SI } = useContext(ThemeContext);
  return (
    <div style={{
      display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
      padding:"7px 10px",
      borderRadius:10,
      background:`linear-gradient(145deg,${BG_DEEP},${SURF_LO})`,
      boxShadow:SI,
      marginBottom: last ? 0 : 5,
    }}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:600,color:TEXT}}>{label}</div>
        {hint && <div style={{fontSize:10,color:FAINT,marginTop:2}}>{hint}</div>}
      </div>
      <div style={{flexShrink:0}}>{children}</div>
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
      <div style={{fontSize:11,color:DIM,lineHeight:1.6}}>{text}</div>
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
  const bW = compact ? 14 : 20;
  const bH = compact ? 20 : 26;
  const fS = compact ? 11 : 14;
  const dW = compact ? 28 : 36;
  const dS = compact ? 9 : 11;
  return (
    <div style={{display:"flex",alignItems:"center",background:BG_DEEP,borderRadius:7,boxShadow:SI,overflow:"hidden"}}>
      <button onClick={dec} style={{width:bW,height:bH,border:"none",cursor:"pointer",background:"transparent",color:FAINT,fontSize:fS,padding:0,lineHeight:1}}>‹</button>
      <span style={{fontSize:dS,fontWeight:700,color:TEXT,minWidth:dW,textAlign:"center"}}>{disp}</span>
      <button onClick={inc} style={{width:bW,height:bH,border:"none",cursor:"pointer",background:"transparent",color:FAINT,fontSize:fS,padding:0,lineHeight:1}}>›</button>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function SettingsView({ settings, setSettings }) {
  const { BG_DEEP, SURF_HI, SURFACE, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, PURPLE, GOLD, RED, TEAL, SO, SI } = useContext(ThemeContext);
  const lang = useContext(LangContext);
  const t = createT(lang);
  const isKava = settings?.theme === "light";
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

  const uk = lang !== "en";
  const SECTIONS = [
    { id:"schedule",   icon:"🕐", color:BLUE,   title:t('set.schedule.title'), label:uk?"Графік":"Sched." },
    { id:"snap",       icon:"⏱",  color:TEAL,   title:t('set.snap.title'),     label:uk?"Сітка":"Grid"   },
    { id:"restr",      icon:"🔒", color:RED,    title:t('set.restr.title'),    label:uk?"Ліміти":"Limits" },
    { id:"queue",      icon:"✅", color:GREEN,  title:t('set.queue.title'),    label:uk?"Черга":"Queue"  },
    { id:"sticky",     icon:"📌", color:PURPLE, title:t('set.sticky.title'),   label:uk?"Слоти":"Slots"  },
    { id:"auto",       icon:"📨", color:GOLD,   title:t('set.auto.title'),     label:uk?"Авто":"Auto"    },
    { id:"nav",        icon:"📱", color:ACCENT, title:t('set.nav.title'),      label:uk?"Навіг.":"Nav"   },
    { id:"look",       icon:"🎨", color:PURPLE, title:t('set.look.title'),     label:uk?"Тема":"Theme"   },
    { id:"surcharges", icon:"💰", color:GOLD,   title:"Надбавки",              label:uk?"Збори":"Fees"   },
    { id:"push",       icon:"🔔", color:GREEN,  title:"Push-сповіщення",       label:"Push"              },
  ];

  function renderSection(id) {
    switch(id) {

      case "schedule": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.schedule.info_t')} text={t('set.schedule.info')}/>}
          <Row label={t('set.schedule.start')} hint={t('set.schedule.hint_s')}>
            <NumInput value={settings.workStart} onChange={v=>{
              const clamped = Math.min(v, settings.workEnd - 1);
              const updated = weekSchedule.map(d => ({...d, start: d.start === settings.workStart ? clamped : d.start}));
              upd("workStart", clamped);
              upd("weekSchedule", updated);
            }} min={0} max={23} suffix=":00"/>
          </Row>
          <Row label={t('set.schedule.end')} hint={t('set.schedule.hint_e')}>
            <NumInput value={settings.workEnd} onChange={v=>{
              const clamped = Math.max(v, settings.workStart + 1);
              const updated = weekSchedule.map(d => ({...d, end: d.end === settings.workEnd ? clamped : d.end}));
              upd("workEnd", clamped);
              upd("weekSchedule", updated);
            }} min={1} max={24} suffix=":00"/>
          </Row>
          <Row label={t('set.schedule.days')} last>
            <NumInput value={settings.daysShown} onChange={v=>upd("daysShown",v)} min={1} max={30} suffix={` ${t('days')}`}/>
          </Row>
          <div style={{paddingTop:8}}>
            <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Тижневий шаблон</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {DAY_NAMES.map((dayName, i) => {
                const day = weekSchedule[i];
                return (
                  <div key={i} style={{
                    borderRadius:8,padding:"5px 8px",
                    background:day.enabled?`linear-gradient(145deg,${SURF_HI},${SURFACE})`:`linear-gradient(145deg,${BG_DEEP},${SURF_LO})`,
                    boxShadow:day.enabled?SO:SI,
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:20,fontSize:11,fontWeight:800,color:day.enabled?TEXT:FAINT,flexShrink:0}}>{dayName}</span>
                      <SmallToggle on={day.enabled} onChange={v=>updDay(i,{enabled:v})}/>
                      {day.enabled ? (<>
                        <span style={{flex:1}}/>
                        <TimeInput compact value={day.start} onChange={v=>updDay(i,{start:Math.min(v,day.end-0.5)})} min={0} max={23}/>
                        <span style={{fontSize:9,color:FAINT,margin:"0 2px"}}>—</span>
                        <TimeInput compact value={day.end} onChange={v=>updDay(i,{end:Math.max(v,day.start+0.5)})} min={0.5} max={24}/>
                        <span style={{fontSize:12,flexShrink:0,marginLeft:4}}>🍽</span>
                        <SmallToggle on={!!day.lunchEnabled} onChange={v=>updDay(i,{lunchEnabled:v})}/>
                      </>) : (
                        <span style={{fontSize:10,color:FAINT,marginLeft:4}}>Вихідний</span>
                      )}
                    </div>
                    {day.enabled && day.lunchEnabled && (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4,paddingLeft:26}}>
                        <span style={{fontSize:10,color:FAINT,flex:1}}>перерва</span>
                        <TimeInput compact value={day.lunchStart??12} onChange={v=>updDay(i,{lunchStart:Math.min(v,(day.lunchEnd??13)-0.5)})} min={0} max={23}/>
                        <span style={{fontSize:9,color:FAINT,margin:"0 2px"}}>—</span>
                        <TimeInput compact value={day.lunchEnd??13} onChange={v=>updDay(i,{lunchEnd:Math.max(v,(day.lunchStart??12)+0.5)})} min={0.5} max={24}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );

      case "snap": return (
        <div>
          {showHint && <Info color={TEAL} title={t('set.snap.info_t')} text={t('set.snap.info')}/>}
          <div style={{borderRadius:10,padding:"10px",marginBottom:5,background:`linear-gradient(145deg,${BG_DEEP},${SURF_LO})`,boxShadow:SI}}>
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
          <div style={{borderRadius:10,padding:"10px",background:`linear-gradient(145deg,${BG_DEEP},${SURF_LO})`,boxShadow:SI}}>
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
        </div>
      );

      case "restr": return (
        <div>
          {showHint && <Info color={RED} title={t('set.restr.info_t')} text={t('set.restr.info')}/>}
          <Row label={t('set.restr.reschedule')}>
            <Toggle on={settings.studentCanReschedule} onChange={v=>upd("studentCanReschedule",v)}/>
          </Row>
          <Row label={t('set.restr.cancel')}>
            <Toggle on={settings.studentCanCancel} onChange={v=>upd("studentCanCancel",v)}/>
          </Row>
          <Row label={t('set.restr.cutoff')} hint={t('set.restr.cutoff_h')}>
            <NumInput value={settings.bookCutoffHours} onChange={v=>upd("bookCutoffHours",v)} min={0} max={48} suffix={` ${t('hr')}`}/>
          </Row>
          <Row label={t('set.restr.calendar')} hint={t('set.restr.calendar_h')}>
            <NumInput value={settings.calendarOpenDays} onChange={v=>upd("calendarOpenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row label={lang==="en"?"Min interval between bookings":"Мінімальний інтервал між записами"} hint={lang==="en"?"Minimum days between any two bookings for one student. 0 — disabled.":"Мінімум днів між будь-якими двома записами учня. 0 — без обмеження."} last>
            <NumInput value={settings.minBookingIntervalDays ?? 0} onChange={v=>upd("minBookingIntervalDays",v)} min={0} max={30} suffix={` ${t('days')}`}/>
          </Row>
        </div>
      );

      case "queue": return (
        <div>
          {showHint && <Info color={GREEN} title={t('set.queue.info_t')} text={t('set.queue.info')}/>}
          <Row label={t('set.queue.require')} hint={t('set.queue.require_h')}>
            <Toggle on={settings.pendingEnabled} onChange={v=>upd("pendingEnabled",v)}/>
          </Row>
          <Row label={lang==="en"?"Show «Complete» button":"Кнопка «Завершити»"} hint={lang==="en"?"Show a Complete button on confirmed bookings":"Показувати кнопку «Завершити» на підтверджених записах"} last>
            <Toggle on={settings.showCompleteBtn !== false} onChange={v=>upd("showCompleteBtn",v)}/>
          </Row>
          <div style={{paddingTop:10}}>
            <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>{t('set.queue.mode')}</div>
            {[
              {k:"fifo",      label:t('set.queue.fifo'),   hint:t('set.queue.fifo_h')   },
              {k:"broadcast", label:t('set.queue.bc'),     hint:t('set.queue.bc_h')     },
              {k:"manual",    label:t('set.queue.manual'), hint:t('set.queue.manual_h') },
            ].map((o,i,arr)=>(
              <Row key={o.k} label={o.label} hint={o.hint} last={i===arr.length-1}>
                <Radio on={queueMode===o.k} onChange={()=>setQueueMode(o.k)}/>
              </Row>
            ))}
          </div>
        </div>
      );

      case "sticky": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.sticky.info_t')} text={t('set.sticky.info')}/>}
          <Row label={lang==="en"?"Enable feature":"Увімкнути"} hint={lang==="en"?"When off — all adjacent free slots are shown":"Вимкнено — всі вільні слоти видно завжди"}>
            <Toggle on={settings.stickyTimeEnabled !== false} onChange={v=>upd("stickyTimeEnabled",v)}/>
          </Row>
          {settings.stickyTimeEnabled !== false && (
            <div>
              {[
                {v:"before", l:t('set.sticky.before')},
                {v:"after",  l:t('set.sticky.after') },
                {v:"both",   l:t('set.sticky.both')  },
              ].map((o,i,arr)=>(
                <Row key={o.v} label={o.l} last={i===arr.length-1}>
                  <Radio on={settings.stickyTime===o.v} onChange={()=>upd("stickyTime",o.v)}/>
                </Row>
              ))}
            </div>
          )}
        </div>
      );

      case "auto": return (
        <div>
          {showHint && <Info color={GOLD} title={t('set.auto.info_t')} text={t('set.auto.info')}/>}
          <div style={{paddingTop:10,display:"flex",flexDirection:"column",gap:5}}>
            <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>{t('set.auto.reminder')}</div>
            {reminders.map((r,i)=>(
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:8,
                background:`linear-gradient(145deg,${BG_DEEP},${SURF_LO})`,
                borderRadius:10,padding:"7px 10px",boxShadow:SI,
                opacity:r.enabled?1:0.55,
              }}>
                <SmallToggle on={r.enabled} onChange={v=>updReminder(i,{enabled:v})}/>
                <span style={{fontSize:12,color:DIM,flex:1}}>
                  {lang==="en"?"Reminder":"Нагадування"} #{i+1}
                </span>
                <NumInput value={r.hoursBefore} onChange={v=>updReminder(i,{hoursBefore:v})} min={1} max={168} suffix={` ${t('hr')}`}/>
                <span style={{fontSize:11,color:FAINT}}>{t('set.auto.rem_h')}</span>
              </div>
            ))}
          </div>
          <Row label={t('set.auto.confirm')}>
            <Toggle on={!!settings.autoConfirm?.enabled} onChange={v=>setSettings(s=>({...s,autoConfirm:{...(s.autoConfirm||{}),enabled:v}}))}/>
          </Row>
          <Row label={t('set.auto.cancel')}>
            <Toggle on={!!settings.autoCancel?.enabled} onChange={v=>setSettings(s=>({...s,autoCancel:{...(s.autoCancel||{}),enabled:v}}))}/>
          </Row>
          <Row label={t('set.auto.queue')} last>
            <Toggle on={!!settings.autoQueueOffer?.enabled} onChange={v=>setSettings(s=>({...s,autoQueueOffer:{...(s.autoQueueOffer||{}),enabled:v}}))}/>
          </Row>
        </div>
      );

      case "nav": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.nav.info_t')} text={t('set.nav.info')}/>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,paddingTop:4}}>
            {ALL_TABS.map((tab)=>{
              const isOn = settings.navTabs?.includes(tab.id) ?? true;
              const isFixed = tab.id === "settings";
              const toggle = () => {
                if(isFixed) return;
                upd("navTabs", isOn
                  ? (settings.navTabs||ALL_TABS.map(x=>x.id)).filter(x=>x!==tab.id)
                  : [...(settings.navTabs||ALL_TABS.map(x=>x.id)),tab.id]);
              };
              return (
                <div key={tab.id} onClick={toggle} style={{
                  borderRadius:9,padding:"8px 6px",textAlign:"center",
                  cursor:isFixed?"default":"pointer",userSelect:"none",
                  background:isOn?`linear-gradient(145deg,${SURF_HI},${SURFACE})`:`linear-gradient(145deg,${BG_DEEP},${SURF_LO})`,
                  boxShadow:isOn?SO:SI,opacity:isFixed?0.65:1,
                }}>
                  <div style={{fontSize:10,fontWeight:700,color:isOn?TEXT:FAINT,marginBottom:5,lineHeight:1.2}}>{t(tab.lk)}</div>
                  <div style={{
                    width:28,height:16,borderRadius:8,margin:"0 auto",position:"relative",
                    background:isOn?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
                    boxShadow:isOn?`0 0 5px ${ACCENT}44`:SI,
                  }}>
                    <div style={{
                      position:"absolute",top:2,left:isOn?12:2,width:12,height:12,borderRadius:6,
                      background:"linear-gradient(135deg,#fff,#ddd)",transition:"left .2s",
                      boxShadow:"0 1px 3px rgba(0,0,0,0.3)",
                    }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );

      case "look": return (
        <div>
          {showHint && <Info color={PURPLE} title={t('set.look.info_t')} text={t('set.look.info')}/>}
          <Row label={t('set.look.theme')}>
            <div style={{display:"flex",gap:6}}>
              {[["dark","🌙 Темна"],["light","☕ Кава"]].map(([k,l])=>(
                <Chip key={k} label={l} active={settings.theme===k} onClick={()=>upd("theme",k)}/>
              ))}
            </div>
          </Row>
          <Row label={t('set.look.lang')} last>
            <div style={{display:"flex",gap:6}}>
              {[["uk","🇺🇦 УКР"],["en","🇬🇧 ENG"]].map(([k,l])=>(
                <Chip key={k} label={l} active={settings.language===k} onClick={()=>upd("language",k)}/>
              ))}
            </div>
          </Row>
        </div>
      );

      case "surcharges": return (
        <div>
          <div style={{fontSize:12,color:FAINT,marginBottom:12,marginTop:4}}>
            Суми відображаються в меню слота при виборі надбавки.
          </div>
          {(settings.surcharges || []).map((amt, i) => (
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:10,marginBottom:5,
              padding:"10px 12px",borderRadius:10,
              background:`linear-gradient(145deg,${BG_DEEP},${SURF_LO})`,boxShadow:SI,
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
          <button onClick={()=>upd("surcharges", [...(settings.surcharges||[]), 100])} style={{
            width:"100%",padding:"11px",borderRadius:12,border:`1px dashed rgba(255,255,255,0.15)`,cursor:"pointer",
            background:"transparent",color:FAINT,fontSize:13,fontWeight:700,marginTop:2,
          }}>+ Додати надбавку</button>
        </div>
      );

      case "push": return <PushDiag />;

      default: return null;
    }
  }

  const activeSec = SECTIONS.find(s => s.id === active);

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{
        display:"flex", alignItems:"flex-start",
        fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif", color:TEXT,
      }}>

        {/* LEFT SIDEBAR — icon + label buttons */}
        <div style={{
          position:"sticky", top:0,
          display:"flex", flexDirection:"column", gap:6,
          padding:"4px 4px 40px",
          width:66, flexShrink:0,
        }}>
          {SECTIONS.map(sec => {
            const isActive = active === sec.id;
            return (
              <button key={sec.id} onClick={()=>switchSection(sec.id)} style={{
                width:58, borderRadius:14, border:"none", cursor:"pointer",
                background: isActive
                  ? `linear-gradient(145deg,${sec.color}cc,${sec.color}77)`
                  : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                boxShadow: isActive ? `0 0 0 2px ${sec.color}55, ${SO}` : SO,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                gap:2, transition:"all .15s", flexShrink:0, padding:"7px 4px",
              }}>
                <span style={{fontSize:22,lineHeight:1}}>{sec.icon}</span>
                <span style={{fontSize:10,fontWeight:700,lineHeight:1,letterSpacing:0.2,
                  color:isActive?"rgba(255,255,255,0.9)":FAINT}}>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* RIGHT PANEL — section content */}
        <div style={{flex:1, padding:"4px 4px 40px 4px", minWidth:0}}>
          <div style={{
            borderRadius:16,
            boxShadow:`0 0 0 1.5px ${isKava?"rgba(0,0,0,0.14)":"rgba(255,255,255,0.18)"}, 0 8px 28px rgba(0,0,0,0.28)`,
            background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
            padding:"12px 14px 14px",
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
            {renderSection(active)}
          </div>
        </div>
      </div>

      <div style={{textAlign:"center",padding:"8px 0 2px",color:FAINT,fontSize:13,fontWeight:600,letterSpacing:0.5}}>
        {APP_VERSION}
      </div>
      <div style={{height:40}}/>
    </>
  );
}

function PushDiag() {
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, TEXT, DIM, FAINT, GREEN, RED, GOLD, BLUE, SO, SI } = useContext(ThemeContext);
  const [status, setStatus] = useState(null);
  const [busy,   setBusy]   = useState(false);

  async function reRegister() {
    setBusy(true); setStatus(null);
    try {
      const perm = Notification.permission;
      if (perm === "denied") { setStatus({ ok: false, msg: "Нотифікації заблоковано в браузері. Дозволь в налаштуваннях сайту." }); return; }
      await registerAdminFCM();
      const snap = await get(ref(db, "admin/fcmToken"));
      const tok  = snap.val();
      setStatus(tok
        ? { ok: true,  msg: `Токен збережено (${tok.slice(0,16)}…)` }
        : { ok: false, msg: "Токен не збережено — перевір дозвіл у браузері" }
      );
    } catch(e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setBusy(false); }
  }

  async function testLocal() {
    try {
      if (!("Notification" in window)) { setStatus({ ok: false, msg: "Браузер не підтримує нотифікації" }); return; }
      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
      }
      if (perm !== "granted") {
        setStatus({ ok: false, msg: `Дозвіл: "${perm}" — дозволь нотифікації в налаштуваннях браузера` });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("🔔 ID4Drive тест", { body: "Push-нотифікації працюють!", icon: "/favicon.svg" });
      setStatus({ ok: true, msg: "Нотифікація відправлена — перевір системний трей" });
    } catch (e) {
      setStatus({ ok: false, msg: `Помилка: ${e.message}` });
    }
  }

  const perm = typeof Notification !== "undefined" ? Notification.permission : "unknown";
  const permColor = perm === "granted" ? GREEN : perm === "denied" ? RED : GOLD;
  const permLabel = perm === "granted" ? "✅ Дозволено" : perm === "denied" ? "❌ Заблоковано" : "⚠️ Не вирішено";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,padding:"4px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:BG_DEEP,borderRadius:9,boxShadow:SI}}>
        <span style={{fontSize:12,color:DIM}}>Дозвіл браузера</span>
        <span style={{fontSize:12,fontWeight:800,color:permColor}}>{permLabel}</span>
      </div>
      <div style={{display:"flex",gap:7}}>
        <button onClick={reRegister} disabled={busy} style={{
          flex:1,padding:"10px 8px",borderRadius:10,border:"none",cursor:"pointer",
          background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
          color:DIM,fontSize:12,fontWeight:700,boxShadow:SO,opacity:busy?.6:1,
        }}>{busy?"…":"🔄 Оновити токен"}</button>
        <button onClick={testLocal} style={{
          flex:1,padding:"10px 8px",borderRadius:10,border:"none",cursor:"pointer",
          background:`linear-gradient(145deg,rgba(126,217,87,0.18),rgba(126,217,87,0.06))`,
          color:GREEN,fontSize:12,fontWeight:700,boxShadow:SO,
        }}>🔔 Тест пуш</button>
      </div>
      {status && (
        <div style={{
          padding:"9px 12px",borderRadius:9,fontSize:12,fontWeight:600,
          background:status.ok?"rgba(126,217,87,0.12)":"rgba(239,68,68,0.12)",
          color:status.ok?GREEN:RED,border:`1px solid ${status.ok?"rgba(126,217,87,0.3)":"rgba(239,68,68,0.3)"}`,
        }}>{status.msg}</div>
      )}
    </div>
  );
}
