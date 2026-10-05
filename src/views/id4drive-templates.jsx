import { useState, useRef, useContext, useEffect } from "react";
import { get, set, push, update, increment } from "firebase/database";
import { iRef } from "../firebase";
import { LangContext } from "../App";
import { createT } from "../lang";

import { ThemeContext, GOLD, GREEN, RED, TEAL, BLUE, PURPLE, BG_DEEP } from "../theme.js";
import { UICss, Modal, Chip, Btn, Toggle, Pill, useFX } from "../ui";

// ─── CSS (template-specific only; base lives in UICss) ───────────
const makeCSS = () => `
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
  { id:"chat",  label:"Чат",        emoji:"💬", color:BLUE },
  { id:"push",  label:"Сповіщення", emoji:"🔔", color:GOLD },
];

const TRIGGERS = [
  { id:"auto_reminder",  label:"Авто: за N год до уроку" },
  { id:"auto_confirm",   label:"Авто: після підтвердження" },
  { id:"auto_cancel",    label:"Авто: після скасування" },
  { id:"auto_welcome",   label:"Авто: при реєстрації" },
  { id:"auto_queue",     label:"Авто: пропозиція з черги" },
  { id:"manual",         label:"Ручна відправка" },
];

const VARS = ["{ім'я}","{дата}","{час}","{послуга}","{ціна}","{інструктор}"];

const INIT_TEMPLATES = [
  { id:"t1", catId:"reminder", title:"Нагадування за 24 год", channel:"chat", trigger:"auto_reminder", reminderHours:24, active:true,
    body:"Привіт, {ім'я}! 🔔 Нагадуємо про урок завтра {дата} о {час}. Чекаємо на тебе! Якщо потрібно перенести — напиши нам." },
  { id:"t2", catId:"reminder", title:"Нагадування за 2 год",  channel:"chat", trigger:"auto_reminder", reminderHours:2, active:true,
    body:"🔔 Нагадуємо: урок сьогодні о {час}. Адреса: Верховинна 44. Інструктор: {інструктор}" },
  { id:"t3", catId:"confirm",  title:"Підтвердження запису",  channel:"chat", trigger:"auto_confirm",  active:true,
    body:"✅ {ім'я}, твій урок підтверджено!\n📅 {дата} о {час}\n🚗 {послуга} — {ціна} ₴\nЧекаємо!" },
  { id:"t4", catId:"cancel",   title:"Скасування запису",     channel:"chat", trigger:"auto_cancel",   active:true,
    body:"❌ {ім'я}, на жаль урок {дата} о {час} скасовано. Якщо хочеш записатись на інший час — напиши нам або відкрий додаток." },
  { id:"t5", catId:"welcome",  title:"Вітання нового учня",   channel:"chat", trigger:"auto_welcome",  active:true,
    body:"👋 Привіт, {ім'я}! Раді бачити тебе в DrivePad!\nЯ — {інструктор}, твій інструктор.\nЗаписуйся на перший урок і побачимось на дорозі! 🚗" },
  { id:"t6", catId:"queue",    title:"Пропозиція вільного слоту", channel:"chat", trigger:"auto_queue", active:true,
    body:"⏳ {ім'я}, з'явився вільний урок {дата} о {час}! Підтвердити запис → відкрий додаток." },
  { id:"t7", catId:"custom",   title:"Прохання про відгук",   channel:"chat", trigger:"manual",        active:true,
    body:"Привіт, {ім'я}! Як пройшов урок {дата}? Буду вдячний за відгук 🙏" },
  { id:"t8", catId:"custom",   title:"Особливі умови",        channel:"chat", trigger:"manual",        active:false,
    body:"Привіт! Для тебе діє спеціальна пропозиція: {послуга} за {ціна} ₴. Діє тільки цього тижня!" },
];

const old2 = "ID4Drive: урок сьогодні о {час}. Адреса: Верховинна 44. Інструктор: {інструктор}";
const new2 = INIT_TEMPLATES.find(t => t.id === "t2").body;
const OLD_T5 = INIT_TEMPLATES.find(t => t.id === "t5").body.replace("в DrivePad!", "в ID4Drive!");

// ─── ПРОСТИЙ РЕЖИМ: стандартні шаблони t1–t7 показуємо як «ситуації» ───
const STD_IDS = ["t1","t2","t3","t4","t5","t6","t7"];
const STD_INFO = {
  t3: { emoji:"✅", title:"Підтвердження запису",  hint:"Коли ви підтвердили запис учня",  color:GREEN  },
  t4: { emoji:"❌", title:"Скасування запису",      hint:"Коли запис скасовано",            color:RED    },
  t5: { emoji:"👋", title:"Вітання нового учня",    hint:"Після реєстрації учня в застосунку", color:TEAL },
  t6: { emoji:"⏳", title:"Вільний слот із черги",  hint:"Коли слот звільнився і хтось чекає в черзі", color:PURPLE },
  t7: { emoji:"⭐", title:"Прохання про відгук",    hint:"Надсилаєте вручну після уроку",   color:BLUE   },
};
const VAR_LABELS = [
  { v:"{ім'я}", label:"Ім'я учня" }, { v:"{дата}", label:"Дата" }, { v:"{час}", label:"Час" },
  { v:"{послуга}", label:"Послуга" }, { v:"{ціна}", label:"Ціна" }, { v:"{інструктор}", label:"Інструктор" },
];
// приклад для попереднього перегляду
const SAMPLE_VARS = { "ім'я":"Олексій", "дата":"5 жовтня, пн", "час":"14:00", "послуга":"Автошкола", "ціна":"900", "інструктор":"Ваш інструктор" };

// Hardcoded list removed — students are loaded from Firebase in SendModal

// ─── HELPERS ────────────────────────────────────────────────────
function Inset({ children, style={} }) {
  const { SURF_HI, SURFACE, SI } = useContext(ThemeContext);
  return <div style={{background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,borderRadius:12,boxShadow:SI,padding:"10px 14px",...style}}>{children}</div>;
}
const chOf  = id => CHANNELS.find(c=>c.id===id)||CHANNELS[0];
const catOf = id => CATEGORIES.find(c=>c.id===id)||CATEGORIES[5];

// підставити {ім'я}/{дата}/{час}/... у тексті (той самий підхід, що й у
// functions/index.js renderTemplateBody — невідома змінна лишається як є)
function renderVars(body, vars={}) {
  return (body||"").replace(/\{[^}]+\}/g, m => {
    const key = m.slice(1,-1);
    return vars[key] != null && vars[key] !== "" ? String(vars[key]) : m;
  });
}

// найближчий активний (не скасований, у майбутньому) запис учня — для
// автопідстановки {дата}/{час}/{послуга}/{ціна} при ручній відправці шаблону
async function nextBookingVars(uid) {
  try {
    const snap = await get(iRef(`bookings/${uid}`));
    const list = Object.values(snap.val() || {});
    const now = Date.now();
    let next = null;
    for (const b of list) {
      if (!b || b.status === "cancelled" || b.cancelledBy || !b.date || !b.time) continue;
      const [h,m] = b.time.split(":").map(Number);
      const ms = new Date(`${b.date}T00:00:00`).getTime() + (h*60+m)*60000;
      if (ms <= now) continue;
      if (!next || ms < next.ms) next = { ...b, ms };
    }
    if (!next) return {};
    const vars = {
      "дата": new Date(`${next.date}T00:00:00`).toLocaleDateString("uk",{day:"numeric",month:"long",weekday:"short"}),
      "час": next.time,
    };
    if (next.serviceName || next.service) vars["послуга"] = next.serviceName || next.service;
    if (next.price != null) vars["ціна"] = String(next.price);
    return vars;
  } catch { return {}; }
}

// render body with colored vars
function BodyPreview({ body, style={} }) {
  if (!body) return null;
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
  const { DIM, FAINT, SURF_HI, SURFACE, ACC_HI, ACCENT, SO, TEXT, GREEN } = useContext(ThemeContext);
  const [students,  setStudents]  = useState([]);
  const [selected,  setSelected]  = useState([]);
  const [preview,   setPreview]   = useState(tpl.body);
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [instructorName, setInstructorName] = useState("");
  const ch = chOf(tpl.channel);

  useEffect(() => {
    get(iRef( "users")).then(snap => {
      const d = snap.val() || {};
      const list = Object.entries(d).map(([uid, u]) => ({
        uid,
        name: u.profile?.name || "Учень",
      }));
      setStudents(list);
    }).catch(() => {});
    get(iRef("admin_settings/profile/name")).then(snap => setInstructorName(snap.val() || "")).catch(() => {});
  }, []);

  const allIds   = students.map(s => s.uid);
  const toggleSel = uid => setSelected(sel => sel.includes(uid) ? sel.filter(x=>x!==uid) : [...sel,uid]);
  const selBtn = (active, color) => ({
    padding:"7px 12px",borderRadius:12,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
    background:active?`linear-gradient(165deg,${color}99,${color}44)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
    color:active?color:DIM,boxShadow:SO,
  });

  const handleSend = async () => {
    if (!selected.length || sending) return;
    setSending(true);
    const time = new Date().toLocaleTimeString("uk",{hour:"2-digit",minute:"2-digit"});
    const ts   = Date.now();
    await Promise.all(selected.map(async uid => {
      const student = students.find(s=>s.uid===uid);
      const vars = { "ім'я": student?.name || "Учень", "інструктор": instructorName, ...(await nextBookingVars(uid)) };
      const text = renderVars(preview, vars);
      if (tpl.channel === "push") {
        // Лише push, без запису в чат — onTemplatePush на бекенді відправить
        // і одразу приберe тимчасовий вузол.
        return push(iRef(`templatePush/${uid}`),{title:tpl.title||"Повідомлення",body:text,ts}).catch(()=>{});
      }
      return push(iRef(`chats/${uid}`),{from:"admin",text,time,ts}).catch(()=>{})
        .then(() => update(iRef(`chatMeta/${uid}`),{unreadForStudent:increment(1),lastMsg:text,lastTs:ts}).catch(()=>{}));
    }));
    setSending(false);
    setSent(true);
    setTimeout(onClose, 1200);
  };

  return (
    <Modal open onClose={onClose} sheet size="lg" title="Надіслати шаблон"
      footer={<>
        <Btn variant="ghost" flex={1} onClick={onClose}>Скасувати</Btn>
        <Btn variant="primary" flex={1} disabled={selected.length===0||sending||sent}
          onClick={handleSend}>
          {sent ? "✅ Надіслано!" : sending ? "Надсилаємо…" : `${ch.emoji} Надіслати${selected.length>0?` (${selected.length})`:""}`}
        </Btn>
      </>}>
      <div style={{fontSize:12,color:DIM,marginTop:-12,marginBottom:18}}>«{tpl.title}»</div>

      {/* students */}
      <div style={{fontSize:10,color:FAINT,letterSpacing:1,marginBottom:8}}>КОМУ НАДІСЛАТИ</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {students.length === 0
          ? <span style={{fontSize:11,color:FAINT}}>Завантаження учнів…</span>
          : <>
            <button onClick={()=>setSelected(allIds)} style={selBtn(selected.length===students.length&&students.length>0, ACCENT)}>Всі учні</button>
            {students.map(s=>(
              <button key={s.uid} onClick={()=>toggleSel(s.uid)} style={selBtn(selected.includes(s.uid), BLUE)}>{s.name}</button>
            ))}
          </>
        }
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
      <Inset style={{marginBottom:0,padding:"10px 14px"}}>
        <div style={{fontSize:9,color:FAINT,letterSpacing:1,marginBottom:6}}>РЕДАГУВАТИ ПЕРЕД ВІДПРАВКОЮ</div>
        <textarea value={preview} onChange={e=>setPreview(e.target.value)} rows={4}
          style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit",lineHeight:1.5}}/>
      </Inset>
    </Modal>
  );
}

// ─── EDIT FORM MODAL ─────────────────────────────────────────────
function EditModal({ tpl, onSave, onClose }) {
  const { DIM, SURF_HI, SURFACE, BG_DEEP, SI, BLUE, TEXT } = useContext(ThemeContext);
  const isNew = !tpl;
  const [form, setForm] = useState(tpl || {
    id:`t-${Date.now()}`, catId:"custom", title:"", channel:"chat",
    trigger:"manual", active:true, body:""
  });
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));
  const insertVar = v => setForm(f=>({...f, body: f.body + v}));
  const valid = (form.title||'').trim() && (form.body||'').trim();
  const accentColor = catOf(form.catId).color;

  return (
    <Modal open onClose={onClose} sheet size="lg" title={isNew?"Новий шаблон":"Редагування шаблону"}
      footer={<>
        <Btn variant="ghost" flex={1} onClick={onClose}>Скасувати</Btn>
        <Btn variant="primary" flex={1} disabled={!valid} onClick={()=>{ if(valid) onSave(form); }}>{isNew?"Створити":"Зберегти"}</Btn>
      </>}>
      <div style={{
        margin:"-14px -20px 0",padding:"16px 20px 20px",transition:"background .2s",
        background:`linear-gradient(165deg,color-mix(in srgb,${accentColor} 26%,${BG_DEEP}) 0%,${BG_DEEP} 65%)`,
      }}>
      {/* title */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:1,marginBottom:6}}>НАЗВА ШАБЛОНУ</div>
        <Inset style={{padding:"4px 14px"}}>
          <input value={form.title} onChange={e=>upd("title",e.target.value)} placeholder="Наприклад: Нагадування за 24 год"
            style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:15,fontWeight:800,padding:"10px 0",fontFamily:"inherit"}}/>
        </Inset>
      </div>

      {/* category */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:1,marginBottom:8}}>КАТЕГОРІЯ</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {CATEGORIES.map(c=>(
            <Chip key={c.id} active={form.catId===c.id} color={c.color} onClick={()=>upd("catId",c.id)}>{c.emoji} {c.label}</Chip>
          ))}
        </div>
      </div>

      {/* channel */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:1,marginBottom:8}}>КАНАЛ ВІДПРАВКИ</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6}}>
          {CHANNELS.map(c=>(
            <Chip key={c.id} active={(form.channel||"chat")===c.id} color={c.color} onClick={()=>upd("channel",c.id)}>{c.emoji} {c.label}</Chip>
          ))}
        </div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:6}}>
          {(form.channel||"chat")==="push" ? "Лише сповіщення, без запису в чат" : "Повідомлення в чат (учень також отримає push)"}
        </div>
      </div>

      {/* trigger */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:1,marginBottom:8}}>УМОВА ВІДПРАВКИ</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {TRIGGERS.map(t=>(
            <button key={t.id} onClick={()=>upd("trigger",t.id)} style={{
              padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",textAlign:"left",fontFamily:"inherit",
              background:form.trigger===t.id?`linear-gradient(135deg,${BLUE}33,${BLUE}14)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              color:form.trigger===t.id?BLUE:DIM,fontSize:12,fontWeight:700,
              borderLeft:form.trigger===t.id?`3px solid ${BLUE}`:"3px solid transparent"
            }}>
              {t.id==="manual"?"✋":"⚡"} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* reminder hours — тільки для auto_reminder: за скільки годин слати */}
      {form.trigger==="auto_reminder" && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:1,marginBottom:8}}>ЗА СКІЛЬКИ ГОДИН ДО УРОКУ</div>
          <div style={{display:"flex",gap:6}}>
            {[24,2].map(h=>(
              <button key={h} onClick={()=>upd("reminderHours",h)} style={{
                padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",flex:1,
                background:(form.reminderHours??24)===h?`linear-gradient(135deg,${BLUE}33,${BLUE}14)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                color:(form.reminderHours??24)===h?BLUE:DIM,fontSize:12,fontWeight:700,
                borderLeft:(form.reminderHours??24)===h?`3px solid ${BLUE}`:"3px solid transparent"
              }}>{h===24?"За 24 год":"За 2 год"}</button>
            ))}
          </div>
        </div>
      )}

      {/* body */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:1,marginBottom:8}}>ТЕКСТ ПОВІДОМЛЕННЯ</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",marginBottom:6}}>Змінні — клікни щоб вставити:</div>
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
          <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:1,marginBottom:6}}>ПОПЕРЕДНІЙ ПЕРЕГЛЯД</div>
          <div className="bubble-preview"><BodyPreview body={form.body}/></div>
        </div>
      )}

      {/* active */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:0,padding:"12px 14px",background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,borderRadius:12,boxShadow:SI}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:TEXT}}>Активний шаблон</div>
          <div style={{fontSize:11,color:DIM,marginTop:2}}>Вимкнений шаблон не відправляється автоматично</div>
        </div>
        <Toggle on={form.active} onChange={v=>upd("active",v)}/>
      </div>
      </div>
    </Modal>
  );
}

// ─── TEMPLATE CARD (colorway card) ────────────────────────────────
function TemplateCard({ tpl, onEdit, onSend, onToggle, onDelete }) {
  const { shade, glow } = useFX();
  const cat = catOf(tpl.catId);
  const ch  = chOf(tpl.channel);
  const dimmed = !tpl.active;
  const stop = e => e.stopPropagation();

  return (
    <div className="fade-in" onClick={()=>onEdit(tpl)} style={{
      position:"relative",overflow:"hidden",borderRadius:13,padding:"8px 10px 7px",cursor:"pointer",
      background:`linear-gradient(155deg,color-mix(in srgb,${cat.color} 50%,${BG_DEEP}) 0%,color-mix(in srgb,${cat.color} 18%,${BG_DEEP}) 100%)`,
      border:`1px solid color-mix(in srgb,${cat.color} 45%,transparent)`,
      boxShadow:`-2px 5px 13px ${shade(0.45)},inset 1px 1px 0 ${glow(0.15)}`,
      opacity:dimmed?0.55:1,
    }}>
      <div style={{position:"absolute",pointerEvents:"none",top:0,right:"6%",width:"55%",height:"45%",zIndex:1,
        background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.18) 0%,transparent 65%)"}}/>

      <button onClick={e=>{stop(e);onDelete(tpl.id);}} style={{
        position:"absolute",top:6,right:6,zIndex:3,width:20,height:20,borderRadius:"50%",border:"none",cursor:"pointer",
        background:RED,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:`0 2px 6px ${shade(0.4)}`,
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <div style={{position:"relative",zIndex:2,display:"flex",alignItems:"flex-start",gap:7,paddingRight:22}}>
        <span style={{fontSize:16,flexShrink:0,lineHeight:1}}>{cat.emoji}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:"#fff",textShadow:`0 1px 3px ${shade(0.5)}`,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tpl.title}</div>
          <div style={{fontSize:9.5,color:"rgba(255,255,255,0.78)",fontWeight:700,marginTop:1.5,display:"flex",alignItems:"center",gap:5}}>
            <span>{ch.emoji} {ch.label}</span>
            <span>·</span>
            <span>{tpl.trigger==="manual"?"✋ Вручну":"⚡ Авто"}</span>
          </div>
        </div>
      </div>

      <div style={{position:"relative",zIndex:2,display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:7}}>
        <button onClick={e=>{stop(e);onSend(tpl);}} style={{
          padding:"5px 9px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",
          background:"rgba(0,0,0,0.22)",color:"#fff",fontSize:10,fontWeight:700,
          display:"flex",alignItems:"center",gap:4.5,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Надіслати
        </button>
        <div onClick={stop}><Toggle on={tpl.active} onChange={v=>onToggle(tpl.id,v)}/></div>
      </div>
    </div>
  );
}

// ─── ПРОСТИЙ РЕДАКТОР: лише години (де треба), текст, вставка змінних, перегляд ───
function SimpleEditModal({ tpl, onSave, onClose }) {
  const { DIM, SURF_HI, SURFACE, BG_DEEP, BLUE, TEXT, FAINT } = useContext(ThemeContext);
  const [body, setBody] = useState(tpl.body || "");
  const [hours, setHours] = useState(tpl.reminderHours ?? 24);
  const taRef = useRef(null);
  const isReminder = tpl.trigger === "auto_reminder";
  const std = INIT_TEMPLATES.find(x => x.id === tpl.id);
  const title = isReminder ? "Нагадування перед уроком" : (STD_INFO[tpl.id]?.title || tpl.title);
  const accent = isReminder ? GOLD : (STD_INFO[tpl.id]?.color || BLUE);

  const insertVar = v => {
    const el = taRef.current;
    const a = el ? el.selectionStart : body.length;
    const b = el ? el.selectionEnd : body.length;
    setBody(body.slice(0, a) + v + body.slice(b));
    setTimeout(() => { if (el) { el.focus(); el.setSelectionRange(a + v.length, a + v.length); } }, 0);
  };
  const label = { fontSize:10, color:"rgba(255,255,255,0.55)", letterSpacing:1, marginBottom:8 };
  const valid = body.trim().length > 0;

  return (
    <Modal open onClose={onClose} sheet={false} size="lg" title={title}
      footer={<>
        <Btn variant="ghost" flex={1} onClick={onClose}>Скасувати</Btn>
        <Btn variant="primary" flex={1} disabled={!valid}
          onClick={()=>onSave({ ...tpl, body, ...(isReminder ? { reminderHours: hours } : {}) })}>Зберегти</Btn>
      </>}>
      <div style={{
        margin:"-14px -20px 0",padding:"16px 20px 20px",
        background:`linear-gradient(165deg,color-mix(in srgb,${accent} 26%,${BG_DEEP}) 0%,${BG_DEEP} 65%)`,
      }}>
        {isReminder && (
          <div style={{marginBottom:14}}>
            <div style={label}>ЗА СКІЛЬКИ ГОДИН ДО УРОКУ</div>
            <div style={{display:"flex",gap:6}}>
              {[24,2].map(h=>(
                <button key={h} onClick={()=>setHours(h)} style={{
                  padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",flex:1,
                  background:hours===h?`linear-gradient(135deg,${BLUE}33,${BLUE}14)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                  color:hours===h?BLUE:DIM,fontSize:12,fontWeight:700,
                  borderLeft:hours===h?`3px solid ${BLUE}`:"3px solid transparent"
                }}>{h===24?"За 24 год":"За 2 год"}</button>
              ))}
            </div>
          </div>
        )}

        <div style={label}>ТЕКСТ ПОВІДОМЛЕННЯ</div>
        <Inset style={{padding:"10px 14px",marginBottom:10}}>
          <textarea ref={taRef} value={body} onChange={e=>setBody(e.target.value)} rows={5}
            style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit",lineHeight:1.5}}/>
        </Inset>

        <div style={{fontSize:10.5,color:"rgba(255,255,255,0.55)",marginBottom:6}}>Натисніть, щоб вставити в текст — підставиться автоматично:</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16}}>
          {VAR_LABELS.map(x=>(
            <span key={x.v} className="var-chip" onClick={()=>insertVar(x.v)}>{x.label}</span>
          ))}
        </div>

        {body.trim() && (
          <div style={{marginBottom:14}}>
            <div style={{...label,marginBottom:6}}>ТАК ПОБАЧИТЬ УЧЕНЬ (приклад)</div>
            <div className="bubble-preview" style={{whiteSpace:"pre-wrap"}}>{renderVars(body, SAMPLE_VARS)}</div>
          </div>
        )}

        {std && std.body !== body && (
          <button onClick={()=>setBody(std.body)} style={{
            background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:11.5,fontWeight:700,
            fontFamily:"inherit",padding:"4px 0",textDecoration:"underline",
          }}>Повернути стандартний текст</button>
        )}
      </div>
    </Modal>
  );
}

// ─── РЯДОК «СИТУАЦІЇ» у простому режимі ────────────────────────────
function SimpleRow({ emoji, title, hint, color, active, onToggle, onEdit, snippet, action, children }) {
  const { shade, glow } = useFX();
  const stop = e => e.stopPropagation();
  return (
    <div className="fade-in" onClick={onEdit} style={{
      position:"relative",overflow:"hidden",borderRadius:14,padding:"11px 13px",cursor:"pointer",
      background:`linear-gradient(155deg,color-mix(in srgb,${color} 38%,${BG_DEEP}) 0%,color-mix(in srgb,${color} 14%,${BG_DEEP}) 100%)`,
      border:`1px solid color-mix(in srgb,${color} 40%,transparent)`,
      boxShadow:`-2px 5px 13px ${shade(0.45)},inset 1px 1px 0 ${glow(0.15)}`,
      opacity:active===false?0.6:1,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:9}}>
        <span style={{fontSize:20,flexShrink:0,lineHeight:1}}>{emoji}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{title}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:600,marginTop:1}}>{hint}</div>
        </div>
        {onToggle && <div onClick={stop}><Toggle on={active} onChange={onToggle}/></div>}
        {action}
      </div>
      {snippet && (
        <div style={{
          marginTop:8,fontSize:11.5,lineHeight:1.4,color:"rgba(255,255,255,0.6)",
          display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",
        }}>{snippet}</div>
      )}
      {children}
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function TemplatesView() {
  const { TEXT, FAINT } = useContext(ThemeContext);
  const css = makeCSS();
  const lang = useContext(LangContext);
  const t = createT(lang);
  const [templates, setTemplates] = useState(INIT_TEMPLATES);
  const [loaded, setLoaded] = useState(false);
  const [editTpl, setEditTpl] = useState(null);
  const [sendTpl, setSendTpl] = useState(null);
  const [simpleTpl, setSimpleTpl] = useState(null);
  const [advOpen, setAdvOpen] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    get(iRef( 'admin_data/templates')).then(snap => {
      const d = snap.val();
      if (Array.isArray(d)) setTemplates(d.map(x => {
        if (!x || typeof x.body !== "string") return x;
        // прибираємо стару назву з незмінених стандартних текстів
        if (x.id === "t2" && x.body === old2) return { ...x, body: new2 };
        if (x.id === "t5" && x.body === OLD_T5) return { ...x, body: INIT_TEMPLATES.find(t => t.id === "t5").body };
        return x;
      }));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      set(iRef( 'admin_data/templates'), templates).catch(() => {});
    }, 800);
  }, [templates, loaded]);

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

  const list = templates.filter(Boolean);
  const stdOf = id => list.find(x => x.id === id);
  const customList = list.filter(x => !STD_IDS.includes(x.id));
  const missingStd = INIT_TEMPLATES.filter(x => STD_IDS.includes(x.id) && !stdOf(x.id));
  const restoreStd = () => setTemplates(ts => [...ts.filter(Boolean), ...missingStd]);
  const onSimpleSave = (form) => {
    setTemplates(ts => ts.map(x => x && x.id === form.id ? form : x));
    setSimpleTpl(null);
  };
  const snip = tpl => renderVars(tpl.body, SAMPLE_VARS);
  const reminders = ["t1","t2"].map(stdOf).filter(Boolean);

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{display:"flex",flexDirection:"column",gap:8,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── ПРОСТИЙ РЕЖИМ: що і коли надсилається ── */}
        <div style={{fontSize:12,color:FAINT,padding:"0 2px 2px"}}>
          Що і коли надсилається учням. Вимкніть непотрібне або натисніть, щоб змінити текст.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {reminders.length > 0 && (
            <SimpleRow emoji="🔔" title="Нагадування перед уроком" color={GOLD}
              hint="Надсилається автоматично перед кожним уроком"
              onEdit={()=>setSimpleTpl(reminders[0])}>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:9}} onClick={e=>e.stopPropagation()}>
                {reminders.map(r=>(
                  <div key={r.id} onClick={()=>setSimpleTpl(r)} style={{
                    display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:10,cursor:"pointer",
                    background:"rgba(0,0,0,0.22)",opacity:r.active?1:0.55,
                  }}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:800,color:"#fff"}}>За {r.reminderHours ?? 24} год до уроку</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{snip(r)}</div>
                    </div>
                    <div onClick={e=>e.stopPropagation()}><Toggle on={r.active} onChange={v=>onToggle(r.id,v)}/></div>
                  </div>
                ))}
              </div>
            </SimpleRow>
          )}
          {["t3","t4","t5","t6","t7"].map(stdOf).filter(Boolean).map(tpl=>{
            const info = STD_INFO[tpl.id];
            const manual = tpl.trigger === "manual";
            return (
              <SimpleRow key={tpl.id} emoji={info.emoji} title={info.title} hint={info.hint} color={info.color}
                active={tpl.active} snippet={snip(tpl)}
                onEdit={()=>setSimpleTpl(tpl)}
                onToggle={manual ? undefined : (v=>onToggle(tpl.id,v))}
                action={manual ? (
                  <button onClick={e=>{e.stopPropagation();setSendTpl(tpl);}} style={{
                    padding:"7px 11px",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"inherit",
                    background:"rgba(0,0,0,0.28)",color:"#fff",fontSize:11,fontWeight:800,flexShrink:0,
                  }}>Надіслати</button>
                ) : null}/>
            );
          })}
        </div>

        {/* ── ДОДАТКОВО: свої шаблони, канали, умови ── */}
        <div style={{marginTop:6}}>
          <div onClick={()=>setAdvOpen(o=>!o)} style={{
            display:"flex",alignItems:"center",gap:9,padding:"12px 13px",borderRadius:14,cursor:"pointer",
            background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
          }}>
            <span style={{fontSize:18}}>⚙️</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:800,color:TEXT}}>Додатково</div>
              <div style={{fontSize:11,color:FAINT,marginTop:1}}>Свої шаблони, канали, умови відправки</div>
            </div>
            <span style={{color:FAINT,fontSize:12}}>{advOpen?"▲":"▼"}</span>
          </div>

          {advOpen && (
            <div style={{display:"flex",flexDirection:"column",gap:7,marginTop:8}}>
              {customList.map(tpl=>(
                <TemplateCard
                  key={tpl.id} tpl={tpl}
                  onEdit={setEditTpl} onSend={setSendTpl}
                  onToggle={onToggle} onDelete={onDelete}
                />
              ))}
              {customList.length===0 && (
                <div style={{textAlign:"center",padding:"14px 10px",color:FAINT,fontSize:12}}>Своїх шаблонів ще немає</div>
              )}
              <Btn variant="primary" onClick={()=>setEditTpl(false)} style={{width:"100%",marginTop:4}}>
                <div className="icon3d" style={{width:28,height:28,background:"rgba(255,255,255,0.2)",borderRadius:8}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" style={{position:"relative",zIndex:1}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                Новий шаблон
              </Btn>
              {missingStd.length > 0 && (
                <button onClick={restoreStd} style={{
                  background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:11.5,fontWeight:700,
                  fontFamily:"inherit",padding:"6px 0",textDecoration:"underline",
                }}>Відновити стандартні шаблони ({missingStd.length})</button>
              )}
            </div>
          )}
        </div>

      </div>

      {editTpl !== null && <EditModal tpl={editTpl||null} onSave={onSave} onClose={()=>setEditTpl(null)}/>}
      {simpleTpl && <SimpleEditModal tpl={simpleTpl} onSave={onSimpleSave} onClose={()=>setSimpleTpl(null)}/>}
      {sendTpl && <SendModal tpl={sendTpl} onClose={()=>setSendTpl(null)}/>}
    </>
  );
}
