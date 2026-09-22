import { useState, useRef, useContext, useEffect } from "react";
import { ref, get, set, push, update, increment } from "firebase/database";
import { db } from "../firebase";
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
  { id:"chat",  label:"Чат",  emoji:"💬", color:BLUE   },
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
  { id:"t1", catId:"reminder", title:"Нагадування за 24 год", channel:"chat", trigger:"auto_reminder", reminderHours:24, active:true,
    body:"Привіт, {ім'я}! 🔔 Нагадуємо про урок завтра {дата} о {час}. Чекаємо на тебе! Якщо потрібно перенести — напиши нам." },
  { id:"t2", catId:"reminder", title:"Нагадування за 2 год",  channel:"chat", trigger:"auto_reminder", reminderHours:2, active:true,
    body:"ID4Drive: урок сьогодні о {час}. Адреса: Верховинна 44. Інструктор: {інструктор}" },
  { id:"t3", catId:"confirm",  title:"Підтвердження запису",  channel:"chat", trigger:"auto_confirm",  active:true,
    body:"✅ {ім'я}, твій урок підтверджено!\n📅 {дата} о {час}\n🚗 {послуга} — {ціна} ₴\nЧекаємо!" },
  { id:"t4", catId:"cancel",   title:"Скасування букінгу",    channel:"chat", trigger:"auto_cancel",   active:true,
    body:"❌ {ім'я}, на жаль урок {дата} о {час} скасовано. Якщо хочеш записатись на інший час — напиши нам або відкрий додаток." },
  { id:"t5", catId:"welcome",  title:"Вітання нового учня",   channel:"chat", trigger:"auto_welcome",  active:true,
    body:"👋 Привіт, {ім'я}! Раді бачити тебе в ID4Drive!\nЯ — {інструктор}, твій інструктор.\nЗаписуйся на перший урок і побачимось на дорозі! 🚗" },
  { id:"t6", catId:"queue",    title:"Пропозиція вільного слоту", channel:"chat", trigger:"auto_queue", active:true,
    body:"⏳ {ім'я}, з'явився вільний урок {дата} о {час}! Підтвердити запис → відкрий додаток." },
  { id:"t7", catId:"custom",   title:"Прохання про відгук",   channel:"chat", trigger:"manual",        active:true,
    body:"Привіт, {ім'я}! Як пройшов урок {дата}? Буду вдячний за відгук 🙏" },
  { id:"t8", catId:"custom",   title:"Особливі умови",        channel:"chat", trigger:"manual",        active:false,
    body:"Привіт! Для тебе діє спеціальна пропозиція: {послуга} за {ціна} ₴. Діє тільки цього тижня!" },
];

// Hardcoded list removed — students are loaded from Firebase in SendModal

// ─── HELPERS ────────────────────────────────────────────────────
function Inset({ children, style={} }) {
  const { SURF_HI, SURFACE, SI } = useContext(ThemeContext);
  return <div style={{background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,borderRadius:12,boxShadow:SI,padding:"10px 14px",...style}}>{children}</div>;
}
const chOf  = id => CHANNELS.find(c=>c.id===id)||CHANNELS[0];
const catOf = id => CATEGORIES.find(c=>c.id===id)||CATEGORIES[5];

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
  const ch = chOf(tpl.channel);

  useEffect(() => {
    get(ref(db, "users")).then(snap => {
      const d = snap.val() || {};
      const list = Object.entries(d).map(([uid, u]) => ({
        uid,
        name: u.profile?.name || "Учень",
      }));
      setStudents(list);
    }).catch(() => {});
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
    await Promise.all(selected.map(uid =>
      push(ref(db,`chats/${uid}`),{from:"admin",text:preview,time,ts}).catch(()=>{})
        .then(() => update(ref(db,`chatMeta/${uid}`),{unreadForStudent:increment(1),lastMsg:preview,lastTs:ts}).catch(()=>{}))
    ));
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
      position:"relative",overflow:"hidden",borderRadius:14,marginBottom:8,padding:"9px 11px 8px",cursor:"pointer",
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

      <div style={{position:"relative",zIndex:2,display:"flex",alignItems:"flex-start",gap:8,paddingRight:22}}>
        <span style={{fontSize:18,flexShrink:0,lineHeight:1}}>{cat.emoji}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13.5,fontWeight:800,color:"#fff",textShadow:`0 1px 3px ${shade(0.5)}`,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tpl.title}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.78)",fontWeight:700,marginTop:2,display:"flex",alignItems:"center",gap:5}}>
            <span>{ch.emoji} {ch.label}</span>
            <span>·</span>
            <span>{tpl.trigger==="manual"?"✋ Вручну":"⚡ Авто"}</span>
          </div>
        </div>
      </div>

      <div style={{position:"relative",zIndex:2,display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
        <button onClick={e=>{stop(e);onSend(tpl);}} style={{
          padding:"6px 10px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",
          background:"rgba(0,0,0,0.22)",color:"#fff",fontSize:10.5,fontWeight:700,
          display:"flex",alignItems:"center",gap:5,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Надіслати
        </button>
        <div onClick={stop}><Toggle on={tpl.active} onChange={v=>onToggle(tpl.id,v)}/></div>
      </div>
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
  const saveTimer = useRef(null);

  useEffect(() => {
    get(ref(db, 'admin_data/templates')).then(snap => {
      const d = snap.val();
      if (Array.isArray(d)) setTemplates(d);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      set(ref(db, 'admin_data/templates'), templates).catch(() => {});
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

  const list = templates;

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{display:"flex",flexDirection:"column",gap:8,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── LIST ── */}
        {list.filter(Boolean).map(tpl=>(
          <TemplateCard
            key={tpl.id} tpl={tpl}
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
        <Btn variant="primary" onClick={()=>setEditTpl(false)} style={{width:"100%",marginTop:4}}>
          <div className="icon3d" style={{width:28,height:28,background:"rgba(255,255,255,0.2)",borderRadius:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" style={{position:"relative",zIndex:1}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          Новий шаблон
        </Btn>

      </div>

      {editTpl !== null && <EditModal tpl={editTpl||null} onSave={onSave} onClose={()=>setEditTpl(null)}/>}
      {sendTpl && <SendModal tpl={sendTpl} onClose={()=>setSendTpl(null)}/>}
    </>
  );
}
