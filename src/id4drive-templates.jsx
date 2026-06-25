import { useState, useRef } from "react";

// ─── TOKENS ─────────────────────────────────────────────────────
const BG      = "#1c1d21";
const BG_DEEP = "#161719";
const SURFACE = "#26282c";
const SURF_HI = "#2e3034";
const SURF_LO = "#1f2125";
const BORDER  = "rgba(255,255,255,0.05)";
const TEXT    = "#e8e8ea";
const DIM     = "#8b8d93";
const FAINT   = "#5a5c62";
const ACCENT  = "#ff5a3c";
const ACC_HI  = "#ff7a5c";
const GREEN   = "#7ed957";
const BLUE    = "#5b9bff";
const PURPLE  = "#c084fc";
const GOLD    = "#f7c948";
const RED     = "#ef4444";
const TEAL    = "#2dd4bf";

const SO = "6px 6px 16px rgba(0,0,0,0.45),-3px -3px 10px rgba(255,255,255,0.025)";
const SI = "inset 3px 3px 8px rgba(0,0,0,0.4),inset -2px -2px 6px rgba(255,255,255,0.025)";

// ─── CSS ────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
.pillow{background:linear-gradient(135deg,${SURF_HI} 0%,${SURFACE} 50%,${SURF_LO} 100%);border:1px solid rgba(255,255,255,0.04);border-radius:18px;position:relative;overflow:hidden;box-shadow:-2px 6px 16px rgba(0,0,0,0.45),inset 1px 1px 0 rgba(255,255,255,0.08),inset -1px -1px 0 rgba(0,0,0,0.25)}
.pillow::before{content:'';position:absolute;pointer-events:none;top:0;right:0;width:60%;height:35%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.07) 0%,transparent 70%);border-radius:18px}
.i3{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;position:relative;overflow:hidden;flex-shrink:0;box-shadow:-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2)}
.i3::before{content:'';position:absolute;top:0;right:0;width:60%;height:50%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.35) 0%,transparent 70%);pointer-events:none}
.i3>svg{position:relative;z-index:1}
.toggle{width:46px;height:26px;border-radius:13px;cursor:pointer;position:relative;transition:background .2s;background:${SURF_LO};box-shadow:inset 2px 2px 5px rgba(0,0,0,0.4)}
.toggle.on{background:linear-gradient(165deg,${GREEN},#5fb83d)}
.toggle-thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:10px;background:linear-gradient(135deg,#fff,#ccc);transition:left .2s;box-shadow:-1px 2px 4px rgba(0,0,0,0.3)}
.toggle.on .toggle-thumb{left:23px}
@keyframes fade-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fade-in .2s ease both}
@keyframes modal-in{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
.modal-in{animation:modal-in .25s ease both}
/* bubble preview */
.bubble-preview{
  background:linear-gradient(135deg,#2a5298,#1e3a6e);
  border-radius:14px 14px 4px 14px;
  padding:10px 14px;
  font-size:13px;color:#fff;line-height:1.5;
  box-shadow:-2px 4px 12px rgba(0,0,0,0.35),inset 1px 1px 0 rgba(255,255,255,0.12);
  position:relative;word-break:break-word;
}
.var-chip{
  display:inline-block;background:rgba(91,155,255,0.25);color:${BLUE};
  border-radius:6px;padding:1px 6px;font-size:12px;font-weight:700;
  border:1px solid rgba(91,155,255,0.35);cursor:pointer;
  transition:background .12s;
}
.var-chip:hover{background:rgba(91,155,255,0.4)}
`;

// ─── DATA ────────────────────────────────────────────────────────
const CATEGORIES = [
  { id:"reminder",  label:"Нагадування", emoji:"🔔", color:GOLD   },
  { id:"confirm",   label:"Підтвердження",emoji:"✅", color:GREEN  },
  { id:"cancel",    label:"Скасування",  emoji:"❌", color:RED    },
  { id:"welcome",   label:"Вітання",     emoji:"👋", color:TEAL   },
  { id:"queue",     label:"Черга",       emoji:"⏳", color:PURPLE },
  { id:"custom",    label:"Власні",      emoji:"✏️", color:BLUE   },
];

const CHANNELS = [
  { id:"chat",     label:"Чат",      emoji:"💬", color:BLUE   },
  { id:"sms",      label:"SMS",      emoji:"📱", color:GREEN  },
  { id:"viber",    label:"Viber",    emoji:"📲", color:PURPLE },
  { id:"telegram", label:"Telegram", emoji:"✈️", color:"#2AABEE" },
  { id:"push",     label:"Push",     emoji:"🔔", color:GOLD   },
];

const TRIGGERS = [
  { id:"auto_reminder",  label:"Авто: за N год до уроку" },
  { id:"auto_confirm",   label:"Авто: після підтвердження" },
  { id:"auto_cancel",    label:"Авто: після скасування" },
  { id:"auto_welcome",   label:"Авто: при реєстрації" },
  { id:"auto_queue",     label:"Авто: пропозиція з черги" },
  { id:"manual",         label:"Ручна відправка" },
];

const VARS = ["{ім'я}","{дата}","{час}","{послуга}","{ціна}","{ТСЦ}","{інструктор}"];

const INIT_TEMPLATES = [
  { id:"t1", catId:"reminder", title:"Нагадування за 24 год", channel:"push", trigger:"auto_reminder", active:true,
    body:"Привіт, {ім'я}! 🔔 Нагадуємо про урок завтра {дата} о {час}. Чекаємо на тебе! Якщо потрібно перенести — напиши нам." },
  { id:"t2", catId:"reminder", title:"Нагадування за 2 год",  channel:"sms",  trigger:"auto_reminder", active:true,
    body:"ID4Drive: урок сьогодні о {час}. Адреса: Верховинна 44. Інструктор: {інструктор}" },
  { id:"t3", catId:"confirm",  title:"Підтвердження запису",  channel:"chat", trigger:"auto_confirm",  active:true,
    body:"✅ {ім'я}, твій урок підтверджено!\n📅 {дата} о {час}\n🚗 {послуга} — {ціна} ₴\nЧекаємо!" },
  { id:"t4", catId:"cancel",   title:"Скасування букінгу",    channel:"chat", trigger:"auto_cancel",   active:true,
    body:"❌ {ім'я}, на жаль урок {дата} о {час} скасовано. Якщо хочеш записатись на інший час — напиши нам або відкрий додаток." },
  { id:"t5", catId:"welcome",  title:"Вітання нового учня",   channel:"chat", trigger:"auto_welcome",  active:true,
    body:"👋 Привіт, {ім'я}! Раді бачити тебе в ID4Drive!\nЯ — {інструктор}, твій інструктор.\nЗаписуйся на перший урок і побачимось на дорозі! 🚗" },
  { id:"t6", catId:"queue",    title:"Пропозиція вільного слоту", channel:"push", trigger:"auto_queue", active:true,
    body:"⏳ {ім'я}, з'явився вільний урок {дата} о {час}! Підтвердити запис → відкрий додаток." },
  { id:"t7", catId:"custom",   title:"Прохання про відгук",   channel:"sms",  trigger:"manual",        active:true,
    body:"Привіт, {ім'я}! Як пройшов урок {дата}? Буду вдячний за відгук 🙏" },
  { id:"t8", catId:"custom",   title:"Особливі умови",        channel:"chat", trigger:"manual",        active:false,
    body:"Привіт! Для тебе діє спеціальна пропозиція: {послуга} за {ціна} ₴. Діє тільки цього тижня!" },
];

const STUDENTS = ["Марія Коваль","Іван Петренко","Олена Мороз","Дмитро Сало","Юлія Денисюк"];

// ─── HELPERS ────────────────────────────────────────────────────
function Pill({ label, color, bg }) {
  return <span style={{background:bg,color,padding:"3px 10px",borderRadius:8,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
}
function Toggle({ on, onChange }) {
  return <div className={`toggle ${on?"on":""}`} onClick={()=>onChange(!on)}><div className="toggle-thumb"/></div>;
}
function Inset({ children, style={} }) {
  return <div style={{background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"10px 14px",...style}}>{children}</div>;
}
const chOf  = id => CHANNELS.find(c=>c.id===id)||CHANNELS[0];
const catOf = id => CATEGORIES.find(c=>c.id===id)||CATEGORIES[5];
const trigOf= id => TRIGGERS.find(t=>t.id===id)||TRIGGERS[5];

// render body with colored vars
function BodyPreview({ body, style={} }) {
  const parts = body.split(/(\{[^}]+\})/g);
  return (
    <span style={style}>
      {parts.map((p,i) =>
        p.startsWith("{") && p.endsWith("}")
          ? <span key={i} style={{color:BLUE,fontWeight:700}}>{p}</span>
          : p
      )}
    </span>
  );
}

// ─── SEND MODAL ──────────────────────────────────────────────────
function SendModal({ tpl, onClose }) {
  const [selected, setSelected] = useState([]);
  const [channel, setChannel] = useState(tpl.channel);
  const [preview, setPreview] = useState(tpl.body);
  const ch = chOf(channel);

  const toggle = s => setSelected(sel => sel.includes(s) ? sel.filter(x=>x!==s) : [...sel,s]);

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"flex-end",backdropFilter:"blur(8px)"}}>
      <div onClick={e=>e.stopPropagation()} className="modal-in" style={{
        width:"100%",maxWidth:520,margin:"0 auto",
        background:`linear-gradient(180deg,${SURFACE},${BG})`,
        borderRadius:"24px 24px 0 0",padding:"20px 18px 34px",
        maxHeight:"90vh",overflowY:"auto"
      }}>
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)",margin:"0 auto 18px"}}/>
        <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>Надіслати шаблон</div>
        <div style={{fontSize:12,color:DIM,marginBottom:18}}>«{tpl.title}»</div>

        {/* channel select */}
        <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>КАНАЛ</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
          {CHANNELS.map(c=>(
            <button key={c.id} onClick={()=>setChannel(c.id)} style={{
              padding:"7px 12px",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
              background:channel===c.id?`linear-gradient(165deg,${c.color}99,${c.color}55)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              color:channel===c.id?c.color:DIM,boxShadow:SO
            }}>{c.emoji} {c.label}</button>
          ))}
        </div>

        {/* students */}
        <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>КОМУ НАДІСЛАТИ</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
          <button onClick={()=>setSelected(STUDENTS)} style={{
            padding:"7px 12px",borderRadius:12,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
            background:selected.length===STUDENTS.length?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            color:selected.length===STUDENTS.length?"#fff":DIM,boxShadow:SO
          }}>Всі учні</button>
          {STUDENTS.map(s=>(
            <button key={s} onClick={()=>toggle(s)} style={{
              padding:"7px 12px",borderRadius:12,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
              background:selected.includes(s)?`linear-gradient(165deg,${BLUE}99,${BLUE}44)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              color:selected.includes(s)?BLUE:DIM,boxShadow:SO
            }}>{s}</button>
          ))}
        </div>

        {/* preview bubble */}
        <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>ПОПЕРЕДНІЙ ПЕРЕГЛЯД</div>
        <div style={{marginBottom:6}}>
          <div style={{fontSize:10,color:ch.color,marginBottom:6,fontWeight:700}}>{ch.emoji} {ch.label}</div>
          <div className="bubble-preview">
            <BodyPreview body={preview}/>
          </div>
        </div>

        {/* editable preview */}
        <Inset style={{marginBottom:18,padding:"10px 14px"}}>
          <div style={{fontSize:9,color:FAINT,letterSpacing:1,marginBottom:6}}>РЕДАГУВАТИ ПЕРЕД ВІДПРАВКОЮ</div>
          <textarea value={preview} onChange={e=>setPreview(e.target.value)} rows={4}
            style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit",lineHeight:1.5}}/>
        </Inset>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO}}>Скасувати</button>
          <button onClick={onClose} disabled={selected.length===0} style={{
            flex:2,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
            background:selected.length>0?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            color:selected.length>0?"#fff":FAINT,
            boxShadow:selected.length>0?`-2px 5px 14px rgba(255,90,60,0.45),inset 1px 1px 0 rgba(255,255,255,0.3)`:SO
          }}>
            {ch.emoji} Надіслати {selected.length>0?`(${selected.length})`:""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT FORM MODAL ─────────────────────────────────────────────
function EditModal({ tpl, onSave, onClose }) {
  const isNew = !tpl;
  const [form, setForm] = useState(tpl || {
    id:`t-${Date.now()}`, catId:"custom", title:"", channel:"chat",
    trigger:"manual", active:true, body:""
  });
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  const insertVar = v => setForm(f=>({...f, body: f.body + v}));

  const Chip = ({label,active,onClick,color})=>(
    <button onClick={onClick} style={{
      padding:"6px 12px",borderRadius:10,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
      background:active?`linear-gradient(165deg,${color||ACC_HI},${color||ACCENT}66)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
      color:active?(color||ACC_HI):DIM,boxShadow:SO,
      border:active?`1px solid ${color||ACCENT}55`:"1px solid transparent"
    }}>{label}</button>
  );

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"flex-end",backdropFilter:"blur(8px)"}}>
      <div onClick={e=>e.stopPropagation()} className="modal-in" style={{
        width:"100%",maxWidth:520,margin:"0 auto",
        background:`linear-gradient(180deg,${SURFACE},${BG})`,
        borderRadius:"24px 24px 0 0",padding:"20px 18px 36px",
        maxHeight:"92vh",overflowY:"auto"
      }}>
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)",margin:"0 auto 18px"}}/>
        <div style={{fontSize:16,fontWeight:800,marginBottom:20}}>{isNew?"Новий шаблон":"Редагування шаблону"}</div>

        {/* title */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:6}}>НАЗВА ШАБЛОНУ</div>
          <Inset style={{padding:"4px 14px"}}>
            <input value={form.title} onChange={e=>upd("title",e.target.value)}
              placeholder="Наприклад: Нагадування за 24 год"
              style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:14,fontWeight:700,padding:"10px 0"}}/>
          </Inset>
        </div>

        {/* category */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>КАТЕГОРІЯ</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {CATEGORIES.map(c=>(
              <Chip key={c.id} label={`${c.emoji} ${c.label}`} active={form.catId===c.id} onClick={()=>upd("catId",c.id)} color={c.color}/>
            ))}
          </div>
        </div>

        {/* channel */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>КАНАЛ</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {CHANNELS.map(c=>(
              <Chip key={c.id} label={`${c.emoji} ${c.label}`} active={form.channel===c.id} onClick={()=>upd("channel",c.id)} color={c.color}/>
            ))}
          </div>
        </div>

        {/* trigger */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>УМОВА ВІДПРАВКИ</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {TRIGGERS.map(t=>(
              <button key={t.id} onClick={()=>upd("trigger",t.id)} style={{
                padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",textAlign:"left",
                background:form.trigger===t.id?`linear-gradient(135deg,rgba(91,155,255,0.2),rgba(91,155,255,0.08))`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                color:form.trigger===t.id?BLUE:DIM,fontSize:12,fontWeight:700,
                boxShadow:SO,
                borderLeft:form.trigger===t.id?`3px solid ${BLUE}`:"3px solid transparent"
              }}>
                {t.id==="manual"?"✋":"⚡"} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>ТЕКСТ ПОВІДОМЛЕННЯ</div>
          <div style={{fontSize:10,color:FAINT,marginBottom:6}}>Змінні — клікни щоб вставити:</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {VARS.map(v=>(
              <span key={v} className="var-chip" onClick={()=>insertVar(v)}>{v}</span>
            ))}
          </div>
          <Inset style={{padding:"10px 14px"}}>
            <textarea value={form.body} onChange={e=>upd("body",e.target.value)} rows={5}
              placeholder="Текст повідомлення з {ім'я} та {датою}…"
              style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit",lineHeight:1.5}}/>
          </Inset>
        </div>

        {/* live bubble preview */}
        {form.body.trim() && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:6}}>ПОПЕРЕДНІЙ ПЕРЕГЛЯД</div>
            <div className="bubble-preview"><BodyPreview body={form.body}/></div>
          </div>
        )}

        {/* active */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,padding:"12px 14px",background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:TEXT}}>Активний шаблон</div>
            <div style={{fontSize:11,color:DIM,marginTop:2}}>Вимкнений шаблон не відправляється автоматично</div>
          </div>
          <Toggle on={form.active} onChange={v=>upd("active",v)}/>
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO}}>Скасувати</button>
          <button onClick={()=>{if(form.title.trim()&&form.body.trim())onSave(form);}} style={{
            flex:2,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
            background:form.title.trim()&&form.body.trim()?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            color:form.title.trim()&&form.body.trim()?"#fff":FAINT,
            boxShadow:form.title.trim()&&form.body.trim()?`-2px 5px 14px rgba(255,90,60,0.45),inset 1px 1px 0 rgba(255,255,255,0.3)`:SO
          }}>{isNew?"Створити":"Зберегти"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── TEMPLATE CARD ───────────────────────────────────────────────
function TemplateCard({ tpl, onEdit, onSend, onToggle, onDelete, viewMode }) {
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [inlineEdit, setInlineEdit] = useState(false);
  const [inlineBody, setInlineBody] = useState(tpl.body);

  const cat = catOf(tpl.catId);
  const ch  = chOf(tpl.channel);
  const tr  = trigOf(tpl.trigger);

  const handlePointerDown = () => {
    const t = setTimeout(()=>{ onEdit(tpl); }, 600);
    setLongPressTimer(t);
  };
  const handlePointerUp = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
  };

  if (viewMode === "rows") {
    return (
      <div className="fade-in" style={{
        background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
        borderRadius:14,marginBottom:8,overflow:"hidden",
        boxShadow:SO,opacity:tpl.active?1:0.55,
        borderLeft:`3px solid ${cat.color}`
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px"}}>
          <span style={{fontSize:20,flexShrink:0}}>{cat.emoji}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:800,color:TEXT,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tpl.title}</div>
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              <span style={{fontSize:10,color:ch.color,fontWeight:700}}>{ch.emoji} {ch.label}</span>
              <span style={{fontSize:10,color:FAINT}}>·</span>
              <span style={{fontSize:10,color:tpl.trigger==="manual"?DIM:GOLD,fontWeight:700}}>{tpl.trigger==="manual"?"✋":"⚡"}</span>
            </div>
          </div>
          <Toggle on={tpl.active} onChange={v=>onToggle(tpl.id,v)}/>
          <button onClick={()=>onSend(tpl)} style={{background:"none",border:"none",cursor:"pointer",color:ACCENT,fontSize:18,padding:"0 2px"}}>➤</button>
          <button onClick={()=>onEdit(tpl)} style={{background:"none",border:"none",cursor:"pointer",color:DIM,fontSize:16,padding:"0 2px"}}>✏️</button>
          <button onClick={()=>onDelete(tpl.id)} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:16,padding:"0 2px"}}>🗑</button>
        </div>
      </div>
    );
  }

  // CARD MODE
  return (
    <div
      className="pillow fade-in"
      style={{marginBottom:10,opacity:tpl.active?1:0.6,overflow:"visible"}}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* ROW 1: emoji·title·toggle */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 14px 10px"}}>
        <div style={{
          width:40,height:40,borderRadius:12,flexShrink:0,
          background:`linear-gradient(155deg,${cat.color}99,${cat.color}33)`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
          boxShadow:`-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.15),0 0 10px ${cat.color}33`
        }}>{cat.emoji}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{tpl.title}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <Pill label={`${ch.emoji} ${ch.label}`} color={ch.color} bg={`${ch.color}22`}/>
            <Pill
              label={tpl.trigger==="manual"?"✋ Ручна":"⚡ Авто"}
              color={tpl.trigger==="manual"?DIM:GOLD}
              bg={tpl.trigger==="manual"?"rgba(255,255,255,0.05)":"rgba(247,201,72,0.12)"}
            />
          </div>
        </div>
        <Toggle on={tpl.active} onChange={v=>onToggle(tpl.id,v)}/>
      </div>

      {/* ROW 2: body (inline edit or preview) */}
      <div style={{borderTop:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,padding:"10px 14px"}}>
        {inlineEdit ? (
          <textarea
            autoFocus
            value={inlineBody}
            onChange={e=>setInlineBody(e.target.value)}
            onBlur={()=>{setInlineEdit(false);}}
            onClick={e=>e.stopPropagation()}
            rows={3}
            style={{
              width:"100%",background:"transparent",border:"none",outline:"none",
              color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit",lineHeight:1.5
            }}
          />
        ) : (
          <div onClick={e=>{e.stopPropagation();setInlineEdit(true);}} style={{cursor:"text"}}>
            <div style={{fontSize:13,color:DIM,lineHeight:1.5,marginBottom:6}}>
              <BodyPreview body={tpl.body}/>
            </div>
            <div style={{fontSize:10,color:FAINT,fontStyle:"italic"}}>Клік — редагувати · Утримати — повна форма</div>
          </div>
        )}
      </div>

      {/* ROW 3: actions */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",borderTop:"none"}}>
        <button onClick={e=>{e.stopPropagation();onSend(tpl);}} style={{
          padding:"11px 0",border:"none",borderRight:`1px solid ${BORDER}`,cursor:"pointer",
          background:"transparent",color:ACCENT,fontSize:12,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:5,
          borderRadius:"0 0 0 18px"
        }}>➤ Надіслати</button>
        <button onClick={e=>{e.stopPropagation();onEdit(tpl);}} style={{
          padding:"11px 0",border:"none",borderRight:`1px solid ${BORDER}`,cursor:"pointer",
          background:"transparent",color:BLUE,fontSize:12,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:5
        }}>✏️ Редагувати</button>
        <button onClick={e=>{e.stopPropagation();onDelete(tpl.id);}} style={{
          padding:"11px 0",border:"none",cursor:"pointer",
          background:"transparent",color:RED,fontSize:12,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:5,
          borderRadius:"0 0 18px 0"
        }}>🗑 Видалити</button>
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function TemplatesView() {
  const [templates, setTemplates] = useState(INIT_TEMPLATES);
  const [activeCat, setActiveCat] = useState(null);
  const [search, setSearch]       = useState("");
  const [viewMode, setViewMode]   = useState("cards");
  const [editTpl, setEditTpl]     = useState(null);   // null=closed, false=new, obj=edit
  const [sendTpl, setSendTpl]     = useState(null);

  const onSave = (form) => {
    setTemplates(ts=>{
      const idx = ts.findIndex(t=>t.id===form.id);
      if(idx>=0){const n=[...ts];n[idx]=form;return n;}
      return [...ts,form];
    });
    setEditTpl(null);
  };
  const onToggle = (id,v) => setTemplates(ts=>ts.map(t=>t.id===id?{...t,active:v}:t));
  const onDelete = (id)   => setTemplates(ts=>ts.filter(t=>t.id!==id));

  // filter
  let list = templates.filter(t=>
    (!activeCat || t.catId===activeCat) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()) ||
                t.body.toLowerCase().includes(search.toLowerCase()))
  );

  const autoCount   = templates.filter(t=>t.active&&t.trigger!=="manual").length;
  const manualCount = templates.filter(t=>t.trigger==="manual").length;

  return (
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",flexDirection:"column",gap:12,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── SUMMARY ── */}
        <div style={{display:"flex",gap:8}}>
          {[
            {label:"Всього",    val:templates.length,                            c:TEXT},
            {label:"Авто ⚡",   val:autoCount,                                   c:GOLD},
            {label:"Ручні ✋",  val:manualCount,                                 c:BLUE},
            {label:"Активних",  val:templates.filter(t=>t.active).length,       c:GREEN},
          ].map(s=>(
            <div key={s.label} style={{flex:1,background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"8px 6px",textAlign:"center"}}>
              <div style={{fontSize:15,fontWeight:900,color:s.c}}>{s.val}</div>
              <div style={{fontSize:9,color:FAINT,marginTop:2,letterSpacing:0.5}}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* ── SEARCH + VIEW MODE ── */}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{flex:1,background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,padding:"4px 12px",display:"flex",alignItems:"center",gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук по назві та тексту…"
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,padding:"9px 0",fontSize:13}}/>
            {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:18,padding:0}}>×</button>}
          </div>
          <button onClick={()=>setViewMode(m=>m==="cards"?"rows":"cards")} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>
            <div className="i3" style={{width:38,height:38,background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`}}>
              {viewMode==="cards"
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              }
            </div>
          </button>
        </div>

        {/* ── CATEGORIES ── */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          <button onClick={()=>setActiveCat(null)} style={{
            padding:"7px 14px",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0,
            background:!activeCat?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            color:!activeCat?"#fff":DIM,boxShadow:SO
          }}>Всі ({templates.length})</button>
          {CATEGORIES.map(c=>{
            const count = templates.filter(t=>t.catId===c.id).length;
            if(!count) return null;
            return (
              <button key={c.id} onClick={()=>setActiveCat(activeCat===c.id?null:c.id)} style={{
                padding:"7px 14px",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0,
                background:activeCat===c.id?`linear-gradient(165deg,${c.color}99,${c.color}55)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                color:activeCat===c.id?c.color:DIM,
                boxShadow:SO,
                border:activeCat===c.id?`1px solid ${c.color}55`:"1px solid transparent"
              }}>{c.emoji} {c.label} ({count})</button>
            );
          })}
        </div>

        {/* ── LIST ── */}
        {list.map(tpl=>(
          <TemplateCard
            key={tpl.id} tpl={tpl} viewMode={viewMode}
            onEdit={setEditTpl} onSend={setSendTpl}
            onToggle={onToggle} onDelete={onDelete}
          />
        ))}

        {list.length===0 && (
          <div style={{textAlign:"center",padding:"40px 20px",color:FAINT}}>
            <div style={{fontSize:32,marginBottom:10}}>📝</div>
            <div style={{fontSize:14,fontWeight:700}}>Шаблонів не знайдено</div>
          </div>
        )}

        {/* ── ADD ── */}
        <button onClick={()=>setEditTpl(false)} style={{
          width:"100%",padding:"14px",borderRadius:16,border:"none",cursor:"pointer",
          background:`linear-gradient(165deg,${ACC_HI},${ACCENT})`,color:"#fff",fontSize:13,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`-2px 5px 14px rgba(255,90,60,0.45),inset 1px 1px 0 rgba(255,255,255,0.3)`,marginTop:4
        }}>
          <div className="i3" style={{width:28,height:28,background:"rgba(255,255,255,0.2)"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          Новий шаблон
        </button>

      </div>

      {editTpl !== null && <EditModal tpl={editTpl||null} onSave={onSave} onClose={()=>setEditTpl(null)}/>}
      {sendTpl && <SendModal tpl={sendTpl} onClose={()=>setSendTpl(null)}/>}
    </>
  );
}
