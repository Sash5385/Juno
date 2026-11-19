// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useState, useEffect, useContext } from "react";
import { MetalIcon } from "../../MetalIcon";
import { ThemeContext, RED } from "../../theme.js";
import { Hint } from "../../ui";
import { cur as curSym } from "../../currency";
import { PALETTE, makeGlobalCSS, ICONS, Card, SectionTitle, Toggle, colorOf, TABS } from "./shared.jsx";
import { BroadcastModal } from "./ScheduleSheets.jsx";

// ═══════════════════════════════════════════════════════════════
// NUM INPUT — локальний стан, не скаче при наборі
// ═══════════════════════════════════════════════════════════════
function NumInput({ value, onChange, min, max, suffix }) {
  const { BG_DEEP, SURF_LO, TEXT, DIM, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_LO = SURF_LO, TEXT_DIM = DIM, SHADOW_IN = SI;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = (raw) => {
    const n = parseInt(raw ?? draft, 10);
    if (!isNaN(n) && n >= (min ?? -Infinity) && n <= (max ?? Infinity)) onChange(n);
    else setDraft(String(value));
  };
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:6,
      padding:"6px 12px", borderRadius:10,
      background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,
      boxShadow:SHADOW_IN
    }}>
      <input
        type="number" inputMode="numeric"
        value={draft} min={min} max={max}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur(); } }}
        style={{
          width:50, background:"transparent", border:"none", outline:"none",
          color:TEXT, fontSize:14, fontWeight:800, textAlign:"center"
        }}
      />
      {suffix && <span style={{fontSize:11, color:TEXT_DIM, fontWeight:700}}>{suffix}</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS — все настройки
// ═══════════════════════════════════════════════════════════════
function SettingsView({ settings, setSettings }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const upd = (k, v) => setSettings(s => ({...s, [k]:v}));
  const updNested = (k1, k2, v) => setSettings(s => ({...s, [k1]:{...s[k1], [k2]:v}}));

  // ── row helper
  const Row = ({ label, hint, children }) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,padding:"12px 0",borderBottom:`1px solid ${BORDER}`}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{label}</div>
        {hint && <div style={{fontSize:11,color:TEXT_DIM,marginTop:3}}>{hint}</div>}
      </div>
      <div style={{flexShrink:0}}>{children}</div>
    </div>
  );


  return (
    <>
    <style>{makeGlobalCSS(SURF_LO, ACCENT, GLOW, SHADE, INK)}</style>
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* ── PROFILE ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Профіль майстра</SectionTitle>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <MetalIcon name="user" size={80} color="#6d28d9"/>
          <div style={{flex:1}}>
            <input value={settings.profile.name} onChange={e=>updNested("profile","name",e.target.value)}
              style={{background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:17,fontWeight:800,width:"100%",marginBottom:4}}/>
            <input value={settings.profile.phone} onChange={e=>updNested("profile","phone",e.target.value)}
              style={{background:"transparent",border:"none",outline:"none",color:TEXT_DIM,fontSize:12,width:"100%"}}/>
          </div>
        </div>
        <Row label="Адреса">
          <input value={settings.profile.address} onChange={e=>updNested("profile","address",e.target.value)}
            style={{
              background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,
              border:"none",outline:"none",color:TEXT,fontSize:13,
              padding:"8px 12px",borderRadius:10,boxShadow:SHADOW_IN,width:180,textAlign:"right"
            }}/>
        </Row>
        <Row label="Досвід (років)">
          <NumInput value={settings.profile.experience} onChange={v=>updNested("profile","experience",v)} min={0} max={50}/>
        </Row>
      </Card>

      {/* ── SCHEDULE ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Робочий графік</SectionTitle>
        <Row label="Початок дня" hint="Перший доступний слот">
          <NumInput value={settings.workStart} onChange={v=>upd("workStart",v)} min={0} max={23} suffix=":00"/>
        </Row>
        <Row label="Кінець дня" hint="Останній доступний слот">
          <NumInput value={settings.workEnd} onChange={v=>upd("workEnd",v)} min={1} max={24} suffix=":00"/>
        </Row>
        <Row label="Вихідні дні">
          <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:200}}>
            {["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].map((d,i)=>{
              const on = settings.weekends.includes(i);
              return (
                <button key={d} onClick={()=>upd("weekends", on?settings.weekends.filter(x=>x!==i):[...settings.weekends,i])}
                  style={{
                    width:34,height:34,borderRadius:10,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                    background: on?`linear-gradient(145deg,${ACCENT_HI},${ACCENT})`:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
                    color: on?"#fff":TEXT_DIM,
                    boxShadow: on?`inset 1px 1px 0 ${glow(0.25)}`:SHADOW_OUT
                  }}>{d}</button>
              );
            })}
          </div>
        </Row>
        <Row label="Днів відображати в розкладі" hint="Від 1 до 30">
          <NumInput value={settings.daysShown} onChange={v=>upd("daysShown",v)} min={1} max={30} suffix="дн"/>
        </Row>
      </Card>

      {/* ── BREAKS ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Обідня перерва</SectionTitle>
        <Row label="Робити паузу на обід">
          <Toggle on={settings.lunchEnabled} onChange={v=>upd("lunchEnabled",v)}/>
        </Row>
        {settings.lunchEnabled && (
          <>
            <Row label="З">
              <NumInput value={settings.lunchStart} onChange={v=>upd("lunchStart",v)} min={0} max={23} suffix=":00"/>
            </Row>
            <Row label="До">
              <NumInput value={settings.lunchEnd} onChange={v=>upd("lunchEnd",v)} min={1} max={24} suffix=":00"/>
            </Row>
          </>
        )}
      </Card>

      {/* ── SNAP & DISPLAY ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Сітка часу</SectionTitle>
        <div style={{fontSize:12,color:TEXT_DIM,marginBottom:10}}>
          Крок при перетягуванні: <b style={{color:ACCENT}}>{settings.snapMin} хв</b>
        </div>
        <input type="range" min={1} max={60} value={settings.snapMin}
          onChange={e=>upd("snapMin",+e.target.value)}
          style={{width:"100%"}}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4,marginBottom:10}}>
          <span style={{fontSize:10,color:TEXT_FAINT}}>1 хв</span>
          <span style={{fontSize:10,color:TEXT_FAINT}}>60 хв</span>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[1,5,15,30,60].map(v=>(
            <button key={v} onClick={()=>upd("snapMin",v)} style={{
              padding:"6px 12px",borderRadius:10,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
              background: settings.snapMin===v?`linear-gradient(145deg,${ACCENT_HI},${ACCENT})`:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
              color: settings.snapMin===v?"#fff":TEXT_DIM,
              boxShadow: settings.snapMin===v?`inset 1px 1px 0 ${glow(0.25)}`:SHADOW_OUT
            }}>{v} хв</button>
          ))}
        </div>
      </Card>

      {/* ── PENDING ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Підтвердження записів</SectionTitle>
        <Row label="Вимагати підтвердження" hint="Нові записи отримують статус 'Очікує' до твого підтвердження">
          <Toggle on={settings.pendingEnabled} onChange={v=>upd("pendingEnabled",v)}/>
        </Row>
      </Card>

      {/* ── STICKY TIME ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Прилипання вільних слотів</SectionTitle>
        <Hint style={{marginBottom:14}}>
          Якщо є запис на 12:00–14:00, які слоти показувати клієнтові для 1-годинного запису?
        </Hint>
        {[
          {k:"before",l:"Тільки попередні (11:00)"},
          {k:"after", l:"Тільки наступні (14:00)"},
          {k:"both",  l:"Обидва (11:00 і 14:00) — вибір клієнта"},
        ].map(o=>(
          <Row key={o.k} label={o.l}>
            <div onClick={()=>upd("stickyTime",o.k)} style={{
              width:22,height:22,borderRadius:11,cursor:"pointer",
              border:`2px solid ${settings.stickyTime===o.k?ACCENT:TEXT_FAINT}`,
              background: settings.stickyTime===o.k?ACCENT:"transparent",
              boxShadow: settings.stickyTime===o.k?`0 0 8px ${ACCENT}77, inset 1px 1px 0 ${glow(0.3)}`:"none"
            }}/>
          </Row>
        ))}
      </Card>

      {/* ── RESTRICTIONS ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Обмеження для клієнтів</SectionTitle>
        <Row label="Клієнт може переносити свої записи">
          <Toggle on={settings.studentCanReschedule} onChange={v=>upd("studentCanReschedule",v)}/>
        </Row>
        <Row label="Клієнт може скасовувати записи">
          <Toggle on={settings.studentCanCancel} onChange={v=>upd("studentCanCancel",v)}/>
        </Row>
        <Row label="Заборона запису" hint="За скільки годин до слоту клієнт не може записатись">
          <NumInput value={settings.bookCutoffHours} onChange={v=>upd("bookCutoffHours",v)} min={0} max={48} suffix="год"/>
        </Row>
        <Row label="Календар наперед" hint="На скільки днів клієнт бачить вільні слоти">
          <NumInput value={settings.calendarOpenDays} onChange={v=>upd("calendarOpenDays",v)} min={1} max={365} suffix="дн"/>
        </Row>
      </Card>

      {/* ── SERVICES ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Послуги та ціни</SectionTitle>
        {settings.services.map(s=>(
          <div key={s.id} style={{
            padding:"14px",marginBottom:10,borderRadius:14,
            background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,boxShadow:SHADOW_OUT,
            opacity:s.active?1:0.5
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              {/* color preview */}
              <div className="slot-base slot-colored" style={{"--c":colorOf(s.colorId),width:30,height:30,borderRadius:8}}/>
              <input value={s.name}
                onChange={e=>upd("services", settings.services.map(x=>x.id===s.id?{...x,name:e.target.value}:x))}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:14,fontWeight:800}}/>
              <Toggle on={s.active} onChange={v=>upd("services", settings.services.map(x=>x.id===s.id?{...x,active:v}:x))}/>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1,marginBottom:4}}>ХВИЛИН</div>
                <NumInput value={s.duration}
                  onChange={v=>upd("services", settings.services.map(x=>x.id===s.id?{...x,duration:v}:x))}
                  min={5} max={480} suffix="хв"/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1,marginBottom:4}}>ЦІНА</div>
                <NumInput value={s.price}
                  onChange={v=>upd("services", settings.services.map(x=>x.id===s.id?{...x,price:v}:x))}
                  min={0} max={100000} suffix={curSym()}/>
              </div>
            </div>
            <div style={{fontSize:10,color:TEXT_FAINT,letterSpacing:1,marginBottom:6}}>КОЛІР</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {PALETTE.map(p=>(
                <button key={p.id} title={p.name}
                  onClick={()=>upd("services", settings.services.map(x=>x.id===s.id?{...x,colorId:p.id}:x))}
                  style={{
                    width:28,height:28,borderRadius:8,border:s.colorId===p.id?`2px solid ${TEXT}`:"none",
                    cursor:"pointer",background:`linear-gradient(155deg, ${p.color}aa, ${p.color}44)`,
                    boxShadow:`inset 1px 1px 0 ${glow(0.3)}, 0 2px 6px ${shade(0.3)}`
                  }}/>
              ))}
            </div>
          </div>
        ))}
        <button onClick={()=>upd("services",[...settings.services,{
          id:`sv-${Date.now()}`,name:"Нова послуга",type:"private",duration:60,price:0,colorId:"blue",active:true,description:""
        }])} style={{
          width:"100%",padding:"12px",borderRadius:14,border:"none",cursor:"pointer",
          background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
          color:TEXT,fontSize:13,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:SHADOW_OUT
        }}>{ICONS.plus(28)} Додати послугу</button>
      </Card>

      {/* ── CATEGORIES ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Категорії клієнтів</SectionTitle>
        <Hint style={{marginBottom:12}}>
          Категорії для індивідуальних клієнтів. Допомагає відкривати спецслоти для VIP, давати знижки тощо.
        </Hint>
        {settings.categories.map(c=>(
          <div key={c.id} style={{
            display:"flex",alignItems:"center",gap:10,padding:"12px",marginBottom:8,borderRadius:14,
            background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,boxShadow:SHADOW_OUT
          }}>
            <div style={{
              width:14,height:14,borderRadius:4,
              background:colorOf(c.colorId),boxShadow:`0 0 8px ${colorOf(c.colorId)}88`
            }}/>
            <input value={c.name}
              onChange={e=>upd("categories", settings.categories.map(x=>x.id===c.id?{...x,name:e.target.value}:x))}
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,fontWeight:700}}/>
            <select value={c.colorId}
              onChange={e=>upd("categories", settings.categories.map(x=>x.id===c.id?{...x,colorId:e.target.value}:x))}
              style={{
                background:`linear-gradient(135deg,${BG_DEEP},${SURFACE_LO})`,
                color:TEXT,border:"none",outline:"none",padding:"6px 10px",borderRadius:8,fontSize:12
              }}>
              {PALETTE.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button aria-label="Видалити категорію" onClick={()=>upd("categories", settings.categories.filter(x=>x.id!==c.id))}
              style={{background:"none",border:"none",cursor:"pointer",color:RED,fontSize:18}}>×</button>
          </div>
        ))}
        <button onClick={()=>upd("categories",[...settings.categories,{
          id:`cat-${Date.now()}`,name:"Нова категорія",colorId:"blue"
        }])} style={{
          width:"100%",padding:"12px",borderRadius:14,border:"none",cursor:"pointer",
          background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
          color:TEXT,fontSize:13,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:SHADOW_OUT
        }}>{ICONS.plus(28)} Додати категорію</button>
      </Card>

      {/* ── NAVIGATION ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Нижня навігація</SectionTitle>
        <Hint style={{marginBottom:12}}>
          Оберіть вкладки, які відображаються в нижньому меню. «Налашт.» завжди активні.
        </Hint>
        {TABS.map(t=>(
          <Row key={t.id} label={t.label}>
            <Toggle
              on={settings.navTabs?.includes(t.id) ?? true}
              onChange={v=>{
                if(t.id==="settings") return;
                upd("navTabs", v
                  ? [...(settings.navTabs||[]), t.id]
                  : (settings.navTabs||[]).filter(x=>x!==t.id));
              }}/>
          </Row>
        ))}
      </Card>

      {/* ── AUTO MESSAGES ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Автоматичні повідомлення</SectionTitle>
        <Row label="Нагадування за N годин до запису">
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {settings.autoReminder?.enabled && (
              <NumInput value={settings.autoReminder?.hoursBefore ?? 24}
                onChange={v=>updNested("autoReminder","hoursBefore",v)}
                min={1} max={168} suffix="год"/>
            )}
            <Toggle on={!!settings.autoReminder?.enabled} onChange={v=>updNested("autoReminder","enabled",v)}/>
          </div>
        </Row>
        <Row label="Вітання при реєстрації нового клієнта">
          <Toggle on={!!settings.autoWelcome?.enabled} onChange={v=>updNested("autoWelcome","enabled",v)}/>
        </Row>
        <Row label="Повідомлення про підтвердження запису">
          <Toggle on={!!settings.autoConfirm?.enabled} onChange={v=>updNested("autoConfirm","enabled",v)}/>
        </Row>
        <Row label="Повідомлення після скасування">
          <Toggle on={!!settings.autoCancel?.enabled} onChange={v=>updNested("autoCancel","enabled",v)}/>
        </Row>
        <Row label="Пропозиція вільного слоту (черга)">
          <Toggle on={!!settings.autoQueueOffer?.enabled} onChange={v=>updNested("autoQueueOffer","enabled",v)}/>
        </Row>
      </Card>

      {/* ── QUEUE ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Черга очікування — режим роботи</SectionTitle>
        <Hint style={{marginBottom:14}}>
          Коли клієнт скасовує запис, як пропонувати слот тим, хто в черзі?
        </Hint>
        <Row label="FIFO" hint="Автоматично записати першого в черзі (без підтвердження)">
          <Toggle on={settings.queueAutoFifo} onChange={v=>upd("queueAutoFifo",v)}/>
        </Row>
        <Row label="Broadcast" hint="Розіслати всім, хто перший підтвердив — той записаний">
          <Toggle on={settings.queueBroadcast} onChange={v=>upd("queueBroadcast",v)}/>
        </Row>
        <Row label="Ручний" hint="Майстер сам обирає кого запросити">
          <Toggle on={settings.queueManual} onChange={v=>upd("queueManual",v)}/>
        </Row>
      </Card>

      {/* ── APPEARANCE ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Зовнішній вигляд</SectionTitle>
        <Row label="Мова">
          <div style={{display:"flex",gap:6}}>
            {[{k:"uk",l:"УКР"},{k:"en",l:"ENG"}].map(t=>(
              <button key={t.k} onClick={()=>upd("language",t.k)} style={{
                padding:"8px 14px",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                background: settings.language===t.k?`linear-gradient(145deg,${ACCENT_HI},${ACCENT})`:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
                color: settings.language===t.k?"#fff":TEXT_DIM,
                boxShadow: settings.language===t.k?`inset 1px 1px 0 ${glow(0.25)}`:SHADOW_OUT
              }}>{t.l}</button>
            ))}
          </div>
        </Row>
      </Card>

      {/* ── NOTIFICATIONS ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Нотифікації</SectionTitle>
        <Hint style={{marginBottom:14}}>Де показувати нові записи та повідомлення:</Hint>
        {[
          {k:"topbar",l:"У верхньому барі (іконка дзвіночка)"},
          {k:"tab",l:"Окрема вкладка в меню"},
          {k:"profile",l:"У профілі майстра"},
        ].map(o=>(
          <Row key={o.k} label={o.l}>
            <div onClick={()=>upd("notifLocation",o.k)} style={{
              width:22,height:22,borderRadius:11,cursor:"pointer",
              border:`2px solid ${settings.notifLocation===o.k?ACCENT:TEXT_FAINT}`,
              background: settings.notifLocation===o.k?ACCENT:"transparent",
              boxShadow: settings.notifLocation===o.k?`0 0 8px ${ACCENT}77, inset 1px 1px 0 ${glow(0.3)}`:"none"
            }}/>
          </Row>
        ))}
      </Card>

      {/* ── BROADCAST PUSH ── */}
      <Card style={{padding:"20px"}}>
        <SectionTitle>Сповіщення клієнтам</SectionTitle>
        <Hint style={{marginBottom:14}}>Ручна розсилка повідомлень активним клієнтам про вільний слот</Hint>
        <button onClick={()=>setBroadcastOpen(true)} style={{width:"100%",background:`linear-gradient(135deg,${ACCENT},${ACC_HI})`,color:"#fff",border:"none",borderRadius:14,padding:"13px 0",fontSize:14,fontWeight:800,cursor:"pointer"}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="mega" size={20}/>Надіслати сповіщення клієнтам</span>
        </button>
        {broadcastOpen && <BroadcastModal onClose={()=>setBroadcastOpen(false)}/>}
      </Card>

      <div style={{height:30}}/>
    </div>
    </>
  );
}

export { SettingsView };
