import { useState, useRef, useContext, useEffect } from "react";
import { MetalIcon } from "../MetalIcon";
import { get, set, push, update, increment } from "firebase/database";
import { iRef } from "../firebase";
import { tr } from "../i18n";

import { ThemeContext, GOLD, GREEN, RED, TEAL, BLUE, PURPLE } from "../theme.js";
import { UICss, Modal, Chip, Btn, Toggle, Pill, useFX, Hint } from "../ui";
import { money } from "../currency";

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
  display:inline-block;background:rgba(91,155,255,0.25);color:#b3d0ff;
  border-radius:6px;padding:6px 8px;font-size:12px;font-weight:700;
  border:1px solid rgba(91,155,255,0.35);cursor:pointer;
  transition:background .12s;
  flex:1 1 auto;text-align:center;
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

// Імена гліфів MetalIcon для категорій / емодзі / каналів / тригерів
const CAT_ICON = { reminder:"bell", confirm:"check", cancel:"cross", welcome:"smile", queue:"hourglass", custom:"edit" };
const EMOJI_ICON = { "🔔":"bell", "✅":"check", "❌":"cross", "👋":"smile", "⏳":"hourglass", "⭐":"star" };
const CH_ICON = { chat:"chat", push:"bell" };
const TRIG_ICON = { manual:"pointer", auto:"bolt" };
const IL = { display:"inline-flex", alignItems:"center", gap:5 };

const CHANNELS = [
  { id:"chat",  label:"Чат",        emoji:"💬", color:BLUE },
  { id:"push",  label:"Сповіщення", emoji:"🔔", color:GOLD },
];

const TRIGGERS = [
  { id:"auto_reminder",  label:"Авто: за N год до запису" },
  { id:"auto_confirm",   label:"Авто: після підтвердження" },
  { id:"auto_cancel",    label:"Авто: після скасування" },
  { id:"auto_welcome",   label:"Авто: при реєстрації" },
  { id:"auto_queue",     label:"Авто: пропозиція з черги" },
  { id:"manual",         label:"Ручна відправка" },
];

const VARS = ["{ім'я}","{дата}","{час}","{послуга}","{ціна}","{майстер}"];

const INIT_TEMPLATES = [
  { id:"t1", catId:"reminder", title:"Нагадування за 24 год", channel:"chat", trigger:"auto_reminder", reminderHours:24, active:true,
    body:"Привіт, {ім'я}! 🔔 Нагадуємо про запис завтра {дата} о {час}. Чекаємо на тебе! Якщо потрібно перенести — напиши нам." },
  { id:"t2", catId:"reminder", title:"Нагадування за 2 год",  channel:"chat", trigger:"auto_reminder", reminderHours:2, active:true,
    body:"🔔 Нагадуємо: запис сьогодні о {час}. Майстер: {майстер}" },
  { id:"t3", catId:"confirm",  title:"Підтвердження запису",  channel:"chat", trigger:"auto_confirm",  active:true,
    body:"✅ {ім'я}, твій запис підтверджено!\n📅 {дата} о {час}\n💼 {послуга} — {ціна} ₴\nЧекаємо!" },
  { id:"t4", catId:"cancel",   title:"Скасування запису",     channel:"chat", trigger:"auto_cancel",   active:true,
    body:"❌ {ім'я}, на жаль запис {дата} о {час} скасовано. Якщо хочеш записатись на інший час — напиши нам або відкрий додаток." },
  { id:"t5", catId:"welcome",  title:"Вітання нового клієнта",   channel:"chat", trigger:"auto_welcome",  active:true,
    body:"👋 Привіт, {ім'я}! Раді бачити тебе в Juno!\nЯ — {майстер}, твій майстер.\nОбирай зручний час і записуйся онлайн — будемо раді тебе бачити! 🙂" },
  { id:"t6", catId:"queue",    title:"Пропозиція вільного слоту", channel:"chat", trigger:"auto_queue", active:true,
    body:"⏳ {ім'я}, з'явився вільний час {дата} о {час}! Щоб записатись — відкрий додаток." },
  { id:"t7", catId:"custom",   title:"Прохання про відгук",   channel:"chat", trigger:"manual",        active:true,
    body:"Привіт, {ім'я}! Як пройшов запис {дата}? Буду вдячний за відгук 🙏" },
  { id:"t9", catId:"reminder", title:"Запис перенесено",      channel:"chat", trigger:"auto_reschedule", active:true,
    body:"🔄 {ім'я}, твій запис перенесено на {дата} о {час} (було {стара дата} о {старий час}). До зустрічі!" },
  { id:"t10", catId:"custom",  title:"Дякуємо за перший візит", channel:"chat", trigger:"auto_thanks", active:false,
    body:"💛 {ім'я}, дякуємо, що завітав! Сподіваємось, усе сподобалось. Будемо раді бачити тебе знову — записатись можна в додатку." },
  { id:"t11", catId:"custom",  title:"Давно не були",          channel:"chat", trigger:"auto_winback", active:false, days:60,
    body:"👋 {ім'я}, давно не бачились! Сумуємо 🙂 Обирай зручний час — записатись можна в додатку." },
  { id:"t12", catId:"custom",  title:"З днем народження",      channel:"chat", trigger:"auto_birthday", active:false,
    body:"🎉 {ім'я}, з днем народження! Бажаємо радості й гарного настрою. Чекаємо на тебе!" },
  { id:"t8", catId:"custom",   title:"Особливі умови",        channel:"chat", trigger:"manual",        active:false,
    body:"Привіт! Для тебе діє спеціальна пропозиція: {послуга} за {ціна} ₴. Діє тільки цього тижня!" },
];

const OLD_T5B = "👋 Привіт, {ім'я}! Раді бачити тебе в Juno!\nЯ — {майстер}, твій майстер.\nЗаписуйся на перший запис — будемо раді тебе бачити! 🙂";
const OLD_T6B = "⏳ {ім'я}, з'явився вільний запис {дата} о {час}! Підтвердити запис → відкрий додаток.";
// Звертання «на Ви»: ті самі стандартні шаблони ввічливою формою (перемикач у шапці). Змінені майстром тексти не чіпаємо.
const VY = {
  t1:"Добрий день, {ім'я}! 🔔 Нагадуємо про запис завтра {дата} о {час}. Чекаємо на Вас! Якщо потрібно перенести — напишіть нам.",
  t2:"🔔 Нагадуємо: Ваш запис сьогодні о {час}. Майстер: {майстер}",
  t3:"✅ {ім'я}, Ваш запис підтверджено!\n📅 {дата} о {час}\n💼 {послуга} — {ціна} ₴\nЧекаємо на Вас!",
  t4:"❌ {ім'я}, на жаль, запис {дата} о {час} скасовано. Якщо бажаєте записатись на інший час — напишіть нам або відкрийте додаток.",
  t5:"👋 Вітаємо, {ім'я}! Раді бачити Вас у Juno!\nЯ — {майстер}, Ваш майстер.\nОбирайте зручний час і записуйтесь онлайн — будемо раді Вас бачити! 🙂",
  t6:"⏳ {ім'я}, з'явився вільний час {дата} о {час}! Щоб записатись — відкрийте додаток.",
  t7:"Добрий день, {ім'я}! Як пройшов Ваш запис {дата}? Будемо вдячні за відгук 🙏",
  t9:"🔄 {ім'я}, Ваш запис перенесено на {дата} о {час} (було {стара дата} о {старий час}). До зустрічі!",
  t10:"💛 {ім'я}, дякуємо, що завітали! Сподіваємось, усе сподобалось. Будемо раді бачити Вас знову — записатись можна в додатку.",
  t11:"👋 {ім'я}, давно не бачились! Будемо раді Вас бачити — оберіть зручний час у додатку.",
  t12:"🎉 {ім'я}, вітаємо з днем народження! Бажаємо радості й гарного настрою. Чекаємо на Вас!",
};
const TY = Object.fromEntries(Object.keys(VY).map(id => [id, (INIT_TEMPLATES.find(t => t.id === id) || {}).body]));
const old2 = "ID4Drive: запис сьогодні о {час}. Адреса: Верховинна 44. Майстер: {інструктор}";
const new2 = INIT_TEMPLATES.find(t => t.id === "t2").body;
const OLD_T5 = INIT_TEMPLATES.find(t => t.id === "t5").body.replace("в Juno!", "в ID4Drive!");
const DP_T5 = INIT_TEMPLATES.find(t => t.id === "t5").body.replace("в Juno!", "в DrivePad!"); // попередня назва: стандартний текст оновлюємо

// ─── ПРОСТИЙ РЕЖИМ: стандартні шаблони t1–t7 показуємо як «ситуації» ───
const STD_IDS = ["t1","t2","t3","t4","t5","t6","t7","t9","t10","t11","t12"];
const STD_INFO = {
  t3: { emoji:"✅", title:"Підтвердження запису",  hint:"Коли ви підтвердили запис клієнта",  color:GREEN  },
  t4: { emoji:"❌", title:"Скасування запису",      hint:"Коли запис скасовано",            color:RED    },
  t5: { emoji:"👋", title:"Вітання нового клієнта",    hint:"Після реєстрації клієнта в застосунку", color:TEAL },
  t6: { emoji:"⏳", title:"Вільний слот із черги",  hint:"Коли слот звільнився і хтось чекає в черзі", color:PURPLE },
  t7: { emoji:"⭐", title:"Прохання про відгук",    hint:"Надсилаєте вручну — оберіть кому",   color:BLUE   },
  t9: { emoji:"🔄", title:"Запис перенесено",       hint:"Коли запис перенесли на інший час", color:BLUE },
  t10:{ emoji:"💛", title:"Дякуємо за перший візит", hint:"Через годину після першого візиту клієнта", color:GOLD },
  t11:{ emoji:"👋", title:"Давно не були",           hint:"Коли клієнт не записувався N днів", color:TEAL },
  t12:{ emoji:"🎉", title:"З днем народження",       hint:"Зранку в день народження (дата з анкети клієнта)", color:PURPLE },
};
const VAR_LABELS = [
  { v:"{ім'я}", label:"Ім'я клієнта" }, { v:"{дата}", label:"Дата" }, { v:"{час}", label:"Час" },
  { v:"{послуга}", label:"Послуга" }, { v:"{ціна}", label:"Ціна" }, { v:"{майстер}", label:"Майстер" },
];
const VAR_RESCHED = [{ v:"{стара дата}", label:"Стара дата" }, { v:"{старий час}", label:"Старий час" }];
let SAMPLE_MASTER = ""; // ім'я майстра з профілю — для прикладу; порожнє → речення з {майстер} прибирається
// приклад для попереднього перегляду
const sampleVars = () => ({ "ім'я":tr("Олексій"), "дата":new Date(2026,9,5).toLocaleDateString("uk",{day:"numeric",month:"long",weekday:"short"}), "час":"14:00", "послуга":tr("Стандарт"), "ціна":"900", "майстер":SAMPLE_MASTER, "інструктор":SAMPLE_MASTER, "стара дата":new Date(2026,9,3).toLocaleDateString("uk",{day:"numeric",month:"long",weekday:"short"}), "старий час":"12:00" });
// приклад для попереднього перегляду: спершу переклад шаблону (з {змінними}), потім підстановка зразків
// ключі словника зберігають переноси як «\\n», тож шукаємо переклад із такою формою
const trBody = b => { const e = String(b || "").replace(/\n/g, "\\n"); const r = tr(e); return r === e ? String(b || "") : r.replace(/\\n/g, "\n"); };
const renderSample = body => renderVars(trBody(body), sampleVars());

// Hardcoded list removed — students are loaded from Firebase in SendModal

// ─── HELPERS ────────────────────────────────────────────────────
function Inset({ children, style={} }) {
  const { SURF_HI, SURFACE, SI } = useContext(ThemeContext);
  return <div style={{background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,borderRadius:14,boxShadow:SI,padding:"10px 14px",...style}}>{children}</div>;
}
const chOf  = id => CHANNELS.find(c=>c.id===id)||CHANNELS[0];
const catOf = id => CATEGORIES.find(c=>c.id===id)||CATEGORIES[5];

// підставити {ім'я}/{дата}/{час}/... у тексті (той самий підхід, що й у
// functions/index.js renderTemplateBody — невідома змінна лишається як є)
function renderVars(body, vars={}) {
  let s = body || "";
  // Відома змінна без значення (напр. ім'я майстра не заповнене) — прибираємо речення з нею, а не лишаємо «{майстер}»
  for (const k of ["майстер","інструктор"]) if (k in vars && !vars[k]) s = s.replace(new RegExp(`[ \\t]*[^.!?\\n]*\\{${k}\\}[^.!?\\n]*[.!?]?`, "g"), "").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
  // «{ціна} ₴» у шаблоні → сума у валюті майстра («$600», «600 €»)
  if (vars["ціна"] != null && vars["ціна"] !== "") s = s.replace(/\{ціна\}( ?)₴/g, (_, sp) => money(vars["ціна"], sp));
  return s.replace(/\{[^}]+\}/g, m => {
    const key = m.slice(1,-1);
    return vars[key] != null && vars[key] !== "" ? String(vars[key]) : m;
  });
}

// найближчий активний (не скасований, у майбутньому) запис клієнта — для
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
    else if (next.manualPrice != null) vars["ціна"] = String(next.manualPrice);
    // Записи, створені майстром, часто мають лише serviceId — беремо назву й ціну з послуг
    if ((!vars["послуга"] || !vars["ціна"]) && next.serviceId) {
      const svcs = (await get(iRef("admin_settings/services"))).val();
      const svc = (Array.isArray(svcs) ? svcs : Object.values(svcs || {})).find(x => x && x.id === next.serviceId);
      if (svc) {
        if (!vars["послуга"] && svc.name) vars["послуга"] = svc.name;
        if (!vars["ціна"] && svc.price != null) vars["ціна"] = String(svc.price);
      }
    }
    return vars;
  } catch { return {}; }
}

// render body with colored vars
function BodyPreview({ body, style={} }) {
  if (!body) return null;
  const parts = trBody(body).split(/(\{[^}]+\})/g);
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
  const [preview,   setPreview]   = useState(trBody(tpl.body));
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [instructorName, setInstructorName] = useState("");
  const ch = chOf(tpl.channel);

  useEffect(() => {
    // Клієнти — від останнього візиту до найдавнішого: кого просити про відгук, видно одразу
    Promise.all([get(iRef("users")), get(iRef("bookings")).catch(() => null)]).then(([snap, bsnap]) => {
      const d = snap.val() || {};
      const today = new Date().toISOString().slice(0, 10);
      const last = {};
      Object.entries(bsnap?.val() || {}).forEach(([uid, bks]) => Object.values(bks || {}).forEach(b => {
        if (b && b.date && b.date <= today && b.status !== "cancelled" && !b.cancelledBy && (!last[uid] || b.date > last[uid])) last[uid] = b.date;
      }));
      const list = Object.entries(d).map(([uid, u]) => ({ uid, name: u.profile?.name || "Клієнт", last: last[uid] || "" }))
        .sort((a, b) => (b.last || "").localeCompare(a.last || ""));
      setStudents(list);
    }).catch(() => {});
    get(iRef("admin_settings/profile/name")).then(snap => setInstructorName(snap.val() || "")).catch(() => {});
  }, []);

  const allIds   = students.map(s => s.uid);
  const toggleSel = uid => setSelected(sel => sel.includes(uid) ? sel.filter(x=>x!==uid) : [...sel,uid]);
  const selBtn = (active, color) => ({
    padding:"7px 12px",borderRadius:14,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
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
      const vars = { "ім'я": student?.name || "Клієнт", "майстер": instructorName, "інструктор": instructorName, ...(await nextBookingVars(uid)) };
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
          {sent ? <span style={IL}><MetalIcon name={CAT_ICON.confirm} color={GREEN} square size={16}/>Надіслано!</span> : sending ? "Надсилаємо…" : <span style={IL}><MetalIcon name={CH_ICON[ch.id]} color={ch.color} square size={16}/>{`Надіслати${selected.length>0?` (${selected.length})`:""}`}</span>}
        </Btn>
      </>}>
      <div style={{fontSize:12,color:DIM,marginTop:-12,marginBottom:18}}>«{tpl.title}»</div>

      {/* students */}
      <div style={{fontSize:11,color:FAINT,letterSpacing:1,marginBottom:8}}>КОМУ НАДІСЛАТИ</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {students.length === 0
          ? <span style={{fontSize:11,color:FAINT}}>Завантаження клієнтів…</span>
          : <>
            {(() => { const wk = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10); const recent = students.filter(s => s.last && s.last >= wk).map(s => s.uid); return recent.length > 0 && (
              <button onClick={()=>setSelected(recent)} style={selBtn(recent.length && recent.every(u=>selected.includes(u)) && selected.length===recent.length, GREEN)}>{`Були за 7 днів (${recent.length})`}</button>
            ); })()}
            <button onClick={()=>setSelected(allIds)} style={selBtn(selected.length===students.length&&students.length>0, ACCENT)}>Всі клієнти</button>
            {students.map(s=>(
              <button key={s.uid} onClick={()=>toggleSel(s.uid)} style={selBtn(selected.includes(s.uid), BLUE)}>{s.name}{s.last ? <span style={{opacity:0.6,fontWeight:500}}> · {s.last.slice(8,10)}.{s.last.slice(5,7)}</span> : null}</button>
            ))}
          </>
        }
      </div>

      {/* preview bubble */}
      <div style={{fontSize:11,color:FAINT,letterSpacing:1,marginBottom:8}}>ПОПЕРЕДНІЙ ПЕРЕГЛЯД</div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:11,color:ch.color,marginBottom:6,fontWeight:700,...IL}}><MetalIcon name={CH_ICON[ch.id]} color={ch.color} square size={14}/>{ch.label}</div>
        <div className="bubble-preview">
          <BodyPreview body={preview}/>
        </div>
      </div>

      {/* editable preview */}
      <Inset style={{marginBottom:0,padding:"10px 14px"}}>
        <div style={{fontSize:11,color:FAINT,letterSpacing:1,marginBottom:6}}>РЕДАГУВАТИ ПЕРЕД ВІДПРАВКОЮ</div>
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
        <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,marginBottom:6}}>НАЗВА ШАБЛОНУ</div>
        <Inset style={{padding:"4px 14px"}}>
          <input value={form.title} onChange={e=>upd("title",e.target.value)} placeholder="Наприклад: Нагадування за 24 год"
            style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:15,fontWeight:800,padding:"10px 0",fontFamily:"inherit"}}/>
        </Inset>
      </div>

      {/* category */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,marginBottom:8}}>КАТЕГОРІЯ</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(118px,1fr))",gap:6}}>
          {CATEGORIES.map(c=>(
            <Chip key={c.id} active={form.catId===c.id} color={c.color} onClick={()=>upd("catId",c.id)}><span style={IL}><MetalIcon name={CAT_ICON[c.id]} color={c.color} square size={16}/>{c.label}</span></Chip>
          ))}
        </div>
      </div>

      {/* channel */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,marginBottom:8}}>КАНАЛ ВІДПРАВКИ</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6}}>
          {CHANNELS.map(c=>(
            <Chip key={c.id} active={(form.channel||"chat")===c.id} color={c.color} onClick={()=>upd("channel",c.id)}><span style={IL}><MetalIcon name={CH_ICON[c.id]} color={c.color} square size={16}/>{c.label}</span></Chip>
          ))}
        </div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",marginTop:6}}>
          {(form.channel||"chat")==="push" ? "Лише сповіщення, без запису в чат" : "Повідомлення в чат (клієнт також отримає push)"}
        </div>
      </div>

      {/* trigger */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,marginBottom:8}}>УМОВА ВІДПРАВКИ</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {TRIGGERS.map(t=>(
            <button key={t.id} onClick={()=>upd("trigger",t.id)} style={{
              padding:"10px 14px",borderRadius:14,border:"none",cursor:"pointer",textAlign:"left",fontFamily:"inherit",
              background:form.trigger===t.id?`linear-gradient(135deg,${BLUE}33,${BLUE}14)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              color:form.trigger===t.id?BLUE:DIM,fontSize:12,fontWeight:700,
              borderLeft:form.trigger===t.id?`3px solid ${BLUE}`:"3px solid transparent"
            }}>
              <span style={IL}><MetalIcon name={TRIG_ICON[t.id==="manual"?"manual":"auto"]} color={t.id==="manual"?BLUE:GOLD} square size={16}/>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* reminder hours — тільки для auto_reminder: за скільки годин слати */}
      {form.trigger==="auto_reminder" && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,marginBottom:8}}>ЗА СКІЛЬКИ ГОДИН ДО ЗАПИСУ</div>
          <div style={{display:"flex",gap:6}}>
            {[24,2].map(h=>(
              <button key={h} onClick={()=>upd("reminderHours",h)} style={{
                padding:"10px 14px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",flex:1,
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
        <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,marginBottom:8}}>ТЕКСТ ПОВІДОМЛЕННЯ</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",marginBottom:6}}>Змінні — клікни щоб вставити:</div>
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
          <div style={{fontSize:11,color:"rgba(255,255,255,0.74)",letterSpacing:1,marginBottom:6}}>ПОПЕРЕДНІЙ ПЕРЕГЛЯД</div>
          <div className="bubble-preview"><BodyPreview body={form.body}/></div>
        </div>
      )}

      {/* active */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:0,padding:"12px 14px",background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,borderRadius:14,boxShadow:SI}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:TEXT}}>Активний шаблон</div>
          <Hint style={{marginTop:2}}>Вимкнений шаблон не відправляється автоматично</Hint>
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
      background:`color-mix(in srgb,${cat.color} 26%,transparent)`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
      border:`1px solid color-mix(in srgb,${cat.color} 45%,transparent)`,
      boxShadow:`-2px 5px 13px ${shade(0.45)},inset 1px 1px 0 ${glow(0.15)}`,
      opacity:dimmed?0.55:1,
    }}>
      <div style={{position:"absolute",pointerEvents:"none",top:0,right:"6%",width:"55%",height:"45%",zIndex:1,
        background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.18) 0%,transparent 65%)"}}/>

      <button aria-label="Видалити шаблон" onClick={e=>{stop(e);onDelete(tpl.id);}} style={{
        position:"absolute",top:4,right:4,zIndex:3,width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
        background:RED,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:`0 2px 6px ${shade(0.4)}`,
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <div style={{position:"relative",zIndex:2,display:"flex",alignItems:"flex-start",gap:7,paddingRight:26}}>
        <MetalIcon name={CAT_ICON[cat.id]||"edit"} color={cat.color} square size={28}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:"#fff",textShadow:`0 1px 3px ${shade(0.5)}`,overflowWrap:"anywhere"}}>{tpl.title}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.78)",fontWeight:700,marginTop:1.5,display:"flex",alignItems:"center",gap:5}}>
            <span style={{...IL,gap:4}}><MetalIcon name={CH_ICON[ch.id]} color={ch.color} square size={13}/>{ch.label}</span>
            <span>·</span>
            <span style={{...IL,gap:4}}><MetalIcon name={TRIG_ICON[tpl.trigger==="manual"?"manual":"auto"]} color={tpl.trigger==="manual"?BLUE:GOLD} square size={13}/>{tpl.trigger==="manual"?"Вручну":"Авто"}</span>
          </div>
        </div>
      </div>

      <div style={{position:"relative",zIndex:2,display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:7}}>
        <button onClick={e=>{stop(e);onSend(tpl);}} style={{
          padding:"5px 9px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",
          background:"rgba(0,0,0,0.22)",color:"#fff",fontSize:11,fontWeight:700,
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
function SimpleEditModal({ tpl, stdBody, onSave, onClose }) {
  const { DIM, SURF_HI, SURFACE, BG_DEEP, BLUE, TEXT, FAINT } = useContext(ThemeContext);
  const [body, setBody] = useState(tpl.body || "");
  const [hours, setHours] = useState(tpl.reminderHours ?? 24);
  const [days, setDays] = useState(tpl.days || 60);
  const [testState, setTestState] = useState(null);
  const isWinback = tpl.trigger === "auto_winback";
  const taRef = useRef(null);
  const isReminder = tpl.trigger === "auto_reminder";
  const std = stdBody && stdBody(tpl.id) ? { body: stdBody(tpl.id) } : INIT_TEMPLATES.find(x => x.id === tpl.id);
  const title = isReminder ? "Нагадування перед записом" : (STD_INFO[tpl.id]?.title || tpl.title);
  const accent = isReminder ? GOLD : (STD_INFO[tpl.id]?.color || BLUE);

  const insertVar = v => {
    const el = taRef.current;
    const a = el ? el.selectionStart : body.length;
    const b = el ? el.selectionEnd : body.length;
    setBody(body.slice(0, a) + v + body.slice(b));
    setTimeout(() => { if (el) { el.focus(); el.setSelectionRange(a + v.length, a + v.length); } }, 0);
  };
  const label = { fontSize:11, color:"rgba(255,255,255,0.74)", letterSpacing:1, marginBottom:8 };
  const valid = body.trim().length > 0;

  return (
    <Modal open onClose={onClose} sheet={false} size="lg" title={title}
      footer={<>
        <Btn variant="ghost" flex={1} onClick={onClose}>Скасувати</Btn>
        <Btn variant="primary" flex={1} disabled={!valid}
          onClick={()=>onSave({ ...tpl, body, ...(isReminder ? { reminderHours: hours } : {}), ...(isWinback ? { days } : {}) })}>Зберегти</Btn>
      </>}>
      <div style={{
        margin:"-14px -20px 0",padding:"16px 20px 20px",
        background:`linear-gradient(165deg,color-mix(in srgb,${accent} 26%,${BG_DEEP}) 0%,${BG_DEEP} 65%)`,
      }}>
        {isReminder && (
          <div style={{marginBottom:14}}>
            <div style={label}>ЗА СКІЛЬКИ ГОДИН ДО ЗАПИСУ</div>
            <div style={{display:"flex",gap:6}}>
              {[48,24,12,3,2,1].map(h=>(
                <button key={h} onClick={()=>setHours(h)} style={{
                  padding:"10px 14px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",flex:1,
                  background:hours===h?`linear-gradient(135deg,${BLUE}33,${BLUE}14)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                  color:hours===h?BLUE:DIM,fontSize:12,fontWeight:700,
                  borderLeft:hours===h?`3px solid ${BLUE}`:"3px solid transparent"
                }}>{h} год</button>
              ))}
            </div>
          </div>
        )}
        {isWinback && (
          <div style={{marginBottom:14}}>
            <div style={label}>ЧЕРЕЗ СКІЛЬКИ ДНІВ БЕЗ ЗАПИСУ</div>
            <div style={{display:"flex",gap:6}}>
              {[30,45,60,90,120].map(d=>(
                <button key={d} onClick={()=>setDays(d)} style={{
                  padding:"10px 0",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",flex:1,
                  background:days===d?`linear-gradient(135deg,${BLUE}33,${BLUE}14)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                  color:days===d?BLUE:DIM,fontSize:12,fontWeight:700,
                }}>{d} дн</button>
              ))}
            </div>
          </div>
        )}

        <div style={label}>ТЕКСТ ПОВІДОМЛЕННЯ</div>
        <Inset style={{padding:"10px 14px",marginBottom:10}}>
          <textarea ref={taRef} value={body} onChange={e=>setBody(e.target.value)} rows={5}
            style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13,resize:"none",fontFamily:"inherit",lineHeight:1.5}}/>
        </Inset>

        <Hint style={{marginBottom:6}}>Натисніть, щоб вставити в текст — підставиться автоматично:</Hint>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:5,marginBottom:16}}>
          {[...VAR_LABELS, ...(tpl.trigger === "auto_reschedule" ? VAR_RESCHED : [])].map(x=>(
            <span key={x.v} className="var-chip" onClick={()=>insertVar(x.v)}>{x.label}</span>
          ))}
        </div>

        {body.trim() && (
          <div style={{marginBottom:14}}>
            <div style={{...label,marginBottom:6}}>ТАК ПОБАЧИТЬ КЛІЄНТ (приклад)</div>
            <div style={{borderRadius:16,padding:"10px 12px",background:"rgba(0,0,0,0.35)",border:"1px solid rgba(255,255,255,0.12)",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10.5,color:"rgba(255,255,255,0.6)",marginBottom:4}}><MetalIcon name="bell" size={14}/>JUNO · зараз</div>
              <div style={{fontSize:12.5,fontWeight:800,color:"#fff"}}>{title}</div>
              <div style={{fontSize:12.5,color:"rgba(255,255,255,0.88)",whiteSpace:"pre-wrap",display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{renderSample(body)}</div>
            </div>
            <div className="bubble-preview" style={{whiteSpace:"pre-wrap"}}>{renderSample(body)}</div>
            <button onClick={async()=>{ setTestState("sending"); try { await push(iRef("templateTest"), { title, body: renderSample(body) }); setTestState("sent"); } catch { setTestState("err"); } setTimeout(()=>setTestState(null), 4000); }}
              disabled={testState==="sending"}
              style={{marginTop:8,width:"100%",padding:"10px",borderRadius:12,border:"1px solid rgba(255,255,255,0.18)",background:"transparent",color:"#fff",fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              {testState==="sent" ? "✓ Надіслано на ваші пристрої" : testState==="err" ? "Не вдалося надіслати" : testState==="sending" ? "Надсилаємо…" : "🧪 Надіслати тест собі"}
            </button>
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
// Нейтральна картка (як у решті застосунку): колір лише в іконці; ✎ — підказка, що текст можна змінити
function SimpleRow({ emoji, title, hint, color, active, onToggle, onEdit, snippet, action, children }) {
  const { TEXT, DIM, BORDER, SURFACE } = useContext(ThemeContext);
  const stop = e => e.stopPropagation();
  return (
    <div className="fade-in" onClick={onEdit} style={{
      position:"relative",overflow:"hidden",borderRadius:16,padding:"12px 13px",cursor:onEdit?"pointer":"default",
      background:SURFACE,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
      border:`1px solid ${BORDER}`,opacity:active===false?0.6:1,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {EMOJI_ICON[emoji]
          ? <MetalIcon name={EMOJI_ICON[emoji]} color={color} square size={32}/>
          : <span style={{width:32,height:32,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,background:`color-mix(in srgb,${color} 22%,transparent)`}}>{emoji}</span>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14.5,fontWeight:700,color:TEXT}}>{title}</div>
          <div style={{fontSize:11.5,color:DIM,fontWeight:500,marginTop:1}}>{hint}</div>
        </div>
        {onToggle && <div onClick={stop}><Toggle on={active} onChange={onToggle}/></div>}
        {action}
      </div>
      {snippet && (
        <div style={{display:"flex",gap:8,alignItems:"flex-start",marginTop:9,padding:"8px 10px",borderRadius:10,background:"rgba(127,127,127,0.10)"}}>
          <div style={{flex:1,minWidth:0,fontSize:12.5,lineHeight:1.45,color:TEXT,opacity:0.9,whiteSpace:"pre-line",
            display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{snippet}</div>
          {onEdit && <span aria-hidden style={{fontSize:13,color:DIM,flexShrink:0}}>✎</span>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function TemplatesView() {
  const { TEXT, FAINT, DIM, BORDER, SURFACE, ACC_HI, ACCENT, BTN_TX } = useContext(ThemeContext);
  const css = makeCSS();
  const [templates, setTemplates] = useState(INIT_TEMPLATES);
  const [loaded, setLoaded] = useState(false);
  const [editTpl, setEditTpl] = useState(null);
  const [sendTpl, setSendTpl] = useState(null);
  const [simpleTpl, setSimpleTpl] = useState(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tone, setToneState] = useState("ty");
  const [, setMasterName] = useState("");
  const saveTimer = useRef(null);

  useEffect(() => {
    get(iRef("admin_settings/profile/name")).then(sn => { SAMPLE_MASTER = sn.val() || ""; setMasterName(SAMPLE_MASTER); }).catch(() => {});
    get(iRef("admin_settings/tplTone")).then(sn => { if (sn.val() === "vy") setToneState("vy"); }).catch(() => {});
    get(iRef( 'admin_data/templates')).then(snap => {
      const d = snap.val();
      if (Array.isArray(d)) {
        const fixed = d.map(x => {
          if (!x || typeof x.body !== "string") return x;
          // прибираємо стару назву / застарілі формулювання з незмінених стандартних текстів
          if (x.id === "t2" && x.body === old2) return { ...x, body: new2 };
          if (x.id === "t5" && (x.body === OLD_T5 || x.body === DP_T5 || x.body === OLD_T5B)) return { ...x, body: INIT_TEMPLATES.find(t => t.id === "t5").body };
          if (x.id === "t6" && x.body === OLD_T6B) return { ...x, body: INIT_TEMPLATES.find(t => t.id === "t6").body };
          return x;
        });
        // нові стандартні ситуації (перенесення, подяка, давно не були, день народження) — додаємо, якщо їх ще немає
        const have = new Set(fixed.filter(Boolean).map(x => x.id));
        const add = INIT_TEMPLATES.filter(x => ["t9","t10","t11","t12"].includes(x.id) && !have.has(x.id));
        setTemplates([...fixed, ...add]);
      }
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

  // Звертання «на ти / на Ви»: міняємо лише стандартні (не змінені майстром) тексти
  const setTone = (v) => {
    if (v === tone) return;
    setToneState(v);
    update(iRef("admin_settings"), { tplTone: v }).catch(() => {});
    setTemplates(ts => ts.map(x => {
      if (!x || !VY[x.id]) return x;
      if (v === "vy" && x.body === TY[x.id]) return { ...x, body: VY[x.id] };
      if (v === "ty" && x.body === VY[x.id]) return { ...x, body: TY[x.id] };
      return x;
    }));
  };
  const stdBody = id => (tone === "vy" ? VY[id] : TY[id]) || (INIT_TEMPLATES.find(x => x.id === id) || {}).body;

  const onSave = (form) => {
    setTemplates(ts=>{
      const idx = ts.findIndex(t=>t.id===form.id);
      if(idx>=0){const n=[...ts];n[idx]=form;return n;}
      return [...ts,form];
    });
    setEditTpl(null);
  };
  const onToggle = (id,v) => setTemplates(ts=>ts.map(t=>t&&t.id===id?{...t,active:v}:t));
  const onDelete = (id)   => setTemplates(ts=>ts.filter(t=>t&&t.id!==id));

  const list = templates.filter(Boolean);
  const stdOf = id => list.find(x => x.id === id);
  const isRem = x => x.trigger === "auto_reminder" && (x.id === "t1" || x.id === "t2" || String(x.id).startsWith("rm"));
  const customList = list.filter(x => !STD_IDS.includes(x.id) && !isRem(x));
  const missingStd = INIT_TEMPLATES.filter(x => STD_IDS.includes(x.id) && !stdOf(x.id));
  const restoreStd = () => setTemplates(ts => [...ts.filter(Boolean), ...missingStd]);
  const onSimpleSave = (form) => {
    setTemplates(ts => ts.map(x => x && x.id === form.id ? form : x));
    setSimpleTpl(null);
  };
  const snip = tpl => renderSample(tpl.body);
  const reminders = list.filter(isRem).sort((a, b) => (b.reminderHours ?? 24) - (a.reminderHours ?? 24));
  const addReminder = () => setTemplates(ts => [...ts, { id:"rm"+Date.now().toString(36), catId:"reminder", title:"Нагадування", channel:"chat", trigger:"auto_reminder", reminderHours:1, active:true, body: stdBody("t2") }]);
  const hrsLabel = h => `За ${h} год до запису`;

  const segBtn = on => ({ flex:1, padding:"7px 0", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
    background:on?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:"transparent", color:on?(BTN_TX||"#fff"):DIM });

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{display:"flex",flexDirection:"column",gap:8,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── ШАПКА: звертання + підказка за (i) ── */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:DIM,fontWeight:700,whiteSpace:"nowrap"}}>Звертання:</span>
          <div style={{flex:1,display:"flex",gap:4,padding:3,borderRadius:12,border:`1px solid ${BORDER}`,background:SURFACE}}>
            <button onClick={()=>setTone("ty")} style={segBtn(tone==="ty")}>на «ти»</button>
            <button onClick={()=>setTone("vy")} style={segBtn(tone==="vy")}>на «Ви»</button>
          </div>
          <button onClick={()=>setShowInfo(v=>!v)} aria-label="Підказка" style={{width:36,height:36,borderRadius:12,border:"none",cursor:"pointer",background:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><MetalIcon name="info" size={26}/></button>
        </div>
        {showInfo && <Hint>Що і коли надсилається клієнтам. Вимкніть непотрібне або натисніть на картку, щоб змінити текст. Звертання змінює лише стандартні тексти — ваші власні лишаються як є.</Hint>}

        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <SimpleRow emoji="🔔" title="Нагадування перед записом" color={GOLD}
            hint="Автоматично перед кожним записом (до 3 нагадувань)">
            <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:9}} onClick={e=>e.stopPropagation()}>
              {reminders.map(r=>(
                <div key={r.id} onClick={()=>setSimpleTpl(r)} style={{
                  display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:12,cursor:"pointer",
                  background:"rgba(127,127,127,0.10)",opacity:r.active?1:0.55,
                }}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:TEXT,display:"flex",gap:6}}><span>{hrsLabel(r.reminderHours ?? 24)}</span><span style={{color:DIM,fontWeight:500}}>✎</span></div>
                    <div style={{fontSize:12,color:TEXT,opacity:0.85,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{snip(r)}</div>
                  </div>
                  {String(r.id).startsWith("rm") && <button aria-label="Видалити нагадування" onClick={e=>{e.stopPropagation();onDelete(r.id);}} style={{background:"none",border:"none",color:"#f87171",fontSize:20,cursor:"pointer",padding:"0 4px"}}>×</button>}
                  <div onClick={e=>e.stopPropagation()}><Toggle on={r.active} onChange={v=>onToggle(r.id,v)}/></div>
                </div>
              ))}
              {reminders.length < 3 && (
                <button onClick={addReminder} style={{padding:"9px",borderRadius:12,border:`1px dashed ${BORDER}`,background:"transparent",color:DIM,fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Додати нагадування</button>
              )}
            </div>
          </SimpleRow>
          {["t3","t9","t4","t5","t6","t10","t11","t12","t7"].map(stdOf).filter(Boolean).map(tpl=>{
            const info = STD_INFO[tpl.id];
            const manual = tpl.trigger === "manual";
            const hint = tpl.id === "t11" ? `Коли клієнт не записувався ${tpl.days || 60} днів` : info.hint;
            return (
              <SimpleRow key={tpl.id} emoji={info.emoji} title={info.title} hint={hint} color={info.color}
                active={tpl.active} snippet={snip(tpl)}
                onEdit={()=>setSimpleTpl(tpl)}
                onToggle={manual ? undefined : (v=>onToggle(tpl.id,v))}
                action={manual ? (
                  <button onClick={e=>{e.stopPropagation();setSendTpl(tpl);}} style={{
                    padding:"8px 13px",border:"none",borderRadius:99,cursor:"pointer",fontFamily:"inherit",
                    background:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,color:BTN_TX||"#fff",fontSize:12,fontWeight:700,flexShrink:0,
                  }}>Кому надіслати</button>
                ) : null}/>
            );
          })}
        </div>

        {/* ── ДОДАТКОВО: свої шаблони, канали, умови ── */}
        <div style={{marginTop:4}}>
          <button onClick={()=>setAdvOpen(o=>!o)} style={{
            width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 13px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",textAlign:"left",
            background:SURFACE,border:`1px solid ${BORDER}`,color:TEXT,
          }}>
            <MetalIcon name="gear" size={28}/>
            <span style={{flex:1,minWidth:0}}>
              <span style={{display:"block",fontSize:14.5,fontWeight:700}}>Додатково</span>
              <span style={{display:"block",fontSize:11.5,color:DIM,marginTop:1}}>Свої шаблони, канали, умови відправки</span>
            </span>
            <span style={{color:DIM,fontSize:20,transform:advOpen?"rotate(90deg)":"none",transition:"transform .2s"}}>›</span>
          </button>

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
                <MetalIcon name="plus" size={22}/>
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
      {simpleTpl && <SimpleEditModal tpl={simpleTpl} stdBody={stdBody} onSave={onSimpleSave} onClose={()=>setSimpleTpl(null)}/>}
      {sendTpl && <SendModal tpl={sendTpl} onClose={()=>setSendTpl(null)}/>}
    </>
  );
}
