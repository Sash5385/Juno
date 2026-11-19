// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useContext } from "react";
import { MetalIcon } from "../../MetalIcon";
import { createPortal } from "react-dom";
import { ThemeContext, GREEN, BLUE, GOLD, RED, ACCENT } from "../../theme.js";
import FogScope from "../../FogScope";
import { cur as curSym } from "../../currency";

const ScheduleHelp = (p) => <FogScope><ScheduleHelpBase {...p}/></FogScope>;

// ═══════════════════════════════════════════════════════════════
// NEW BOOKING MODAL — compact bottom sheet
// ═══════════════════════════════════════════════════════════════
// ─── ПІДКАЗКИ ПО РОЗКЛАДУ ─────────────────────────────────────────
// Кнопка «?» над розкладом відкриває довідник: що означає кожен значок і жест на екрані «Записи».
const HelpDot = ({ bg, color = "#0f2e08", size = 20, children }) => (
  <div style={{ width:size, height:size, borderRadius:"50%", background:bg, color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.55, fontWeight:900, flexShrink:0, boxShadow:"0 1px 3px rgba(0,0,0,0.5)" }}>{children}</div>
);
const HelpChip = ({ bg, color = "#fff", children, w = 30 }) => (
  <div style={{ minWidth:w, padding:"3px 6px", borderRadius:8, background:bg, color, fontSize:11, fontWeight:800, textAlign:"center", flexShrink:0 }}>{children}</div>
);
const HelpSq = ({ c, deep, children }) => (
  <div style={{ width:30, height:26, borderRadius:9, background:`linear-gradient(135deg,color-mix(in srgb,${c} 42%,${deep}) 0%,${deep} 100%)`, border:`1px solid color-mix(in srgb,${c} 35%,transparent)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{children}</div>
);
// Підсвічує на екрані елементи з data-help="<key>" (рамка з пульсацією на ~3 с). Якщо такого елемента
// зараз немає (наприклад, нема жодного запису) — показує коротку підказку.
function highlightHelp(key) {
  if (typeof document === "undefined") return;
  if (!document.getElementById("help-ring-css")) {
    const st = document.createElement("style"); st.id = "help-ring-css";
    st.textContent = "@keyframes helpRing{0%,100%{box-shadow:0 0 0 0 rgba(247,201,72,.75),0 0 14px 2px rgba(247,201,72,.65)}50%{box-shadow:0 0 0 7px rgba(247,201,72,0),0 0 22px 6px rgba(247,201,72,.9)}}";
    document.head.appendChild(st);
  }
  const els = key ? [...document.querySelectorAll(`[data-help~="${key}"]`)] : [];
  const vis = els.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 8);
  const toast = (msg) => {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;left:50%;bottom:96px;transform:translateX(-50%);max-width:86vw;padding:10px 14px;border-radius:12px;background:rgba(20,20,24,.95);color:#fff;font-size:13px;font-weight:600;text-align:center;z-index:9600;box-shadow:0 6px 20px rgba(0,0,0,.5)";
    document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
  };
  if (!vis.length) { toast(key ? "Зараз цього елемента немає на екрані — він з’являється за певних умов" : "Для цього пункту підсвітки немає"); return; }
  vis[0].scrollIntoView?.({ block: "nearest", inline: "nearest" });
  setTimeout(() => {
    vis.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const ring = document.createElement("div");
      const pad = 3;
      ring.style.cssText = `position:fixed;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:2px solid #f7c948;border-radius:12px;pointer-events:none;z-index:9500;animation:helpRing 1s ease-in-out 3`;
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 3100);
    });
  }, 250);
}

// Вікно підказок — прозоре «темне скло з бірюзою» (в стилі нижнього меню)
const HELP_GLASS = {
  ov:    { background:"rgba(0,0,0,0.35)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)" },
  panel: { background:"rgba(8,8,12,0.5)", backdropFilter:"blur(26px)", WebkitBackdropFilter:"blur(26px)", border:"1px solid rgba(45,212,191,0.35)" },
  item:  { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(45,212,191,0.25)" },
  ico:   { background:"rgba(45,212,191,0.10)" },
};
function ScheduleHelpBase({ onClose, onPick }) {
  const hv = HELP_GLASS;
  const { BG_DEEP, SURFACE, SURF_HI, BORDER, TEXT, DIM } = useContext(ThemeContext);
  const SECTIONS = [
    { title: "Панель угорі", items: [
      { ico: <HelpChip bg="linear-gradient(165deg,#5b9bff,#2563eb)">Авто</HelpChip>, h: "hours", t: "Авто · 8 · 10 · 12 · 14 годин", d: "Скільки годин робочого дня видно на екрані одночасно. «Авто» сама підбирає висоту під ваш екран." },
      { ico: <MetalIcon name="calendar" size={24}/>, h: "monthcal", t: "Місячний календар", d: "Швидкий перехід на будь-яку дату." },
      { ico: <HelpChip bg={`linear-gradient(165deg,${GOLD},#e6a800)`} color="#1a1200">5</HelpChip>, h: "days", t: "3 · 4 · 5 · 6 · 7 діб", d: "Скільки днів показувати поряд." },
    ] },
    { title: "Шапка дня", items: [
      { ico: <HelpChip bg="rgba(126,217,87,0.18)" color={GREEN} w={34}>Пн</HelpChip>, h: "daycolor", t: "Колір дня", d: "Зелений — робочий день, червоний зі штриховкою — вихідний. Золота рамка — сьогодні." },
      { ico: <div style={{ display:"flex", gap:4 }}><HelpDot bg={`linear-gradient(155deg,#a6e888,${GREEN})`}>✓</HelpDot><HelpDot bg={`linear-gradient(145deg,${SURF_HI},${SURFACE})`} color={DIM}>+</HelpDot></div>, h: "daycorner", t: "✓ або + у куті дня", d: "✓ — у дні є вільні слоти для запису. «+» — слотів немає. Тап по дню створює слоти за графіком (або прибирає їх, якщо вони вже є), подвійний тап — закриває чи відкриває день." },
      { ico: <MetalIcon name="note" size={24}/>, h: "daynote", t: "Нотатка дня", d: "До цього дня є нотатка. Утримайте шапку дня 0,6 с — відкрити або додати нотатку." },
    ] },
    { title: "Сітка розкладу", items: [
      { ico: <HelpChip bg="#ef4444" w={34}>14:51</HelpChip>, h: "nowline", t: "Червона мітка з часом", d: "Поточний час." },
      { ico: <MetalIcon name="pushpin" size={24}/>, t: "Утримати порожнє місце", d: "Меню: додати запис, особиста подія, вільний слот, закрити день." },
      { ico: <div style={{ display:"flex", gap:3 }}><MetalIcon name="user" size={22}/><MetalIcon name="crown" size={22}/></div>, h: "freeicons", t: "Вільний слот: 🚗 · 👑", d: "🚗 — слот лише для приватних клієнтів, 👑 — лише для VIP. Стрічка «900₴» — фіксована ціна слота, «+100₴» — надбавка." },
      { ico: <HelpChip bg="rgba(91,155,255,0.18)" color="#93c5fd" w={44}>ОБІД</HelpChip>, t: "ОБІД", d: "Перерва за налаштуваннями графіка — записів на цей час немає." },
      { ico: <MetalIcon name="eye" size={24}/>, h: "eye", t: "Слот зараз переглядають", d: "Клієнт саме відкрив цей вільний слот у своєму застосунку й обирає час. Позначка зникає, коли він закриє слот або запишеться." },
      { ico: <div style={{ width:36, height:11, borderRadius:7, background:"rgba(126,217,87,0.45)", border:"1px solid rgba(126,217,87,0.75)" }}/>, t: "Зелена ручка внизу слота", d: "Змінює тривалість вільного слота: утримайте ручку 0,6 с і потягніть вгору або вниз. Є лише на вільних слотах майбутніх днів." },
    ] },
    { title: "Картка запису", items: [
      { ico: <div style={{ display:"flex", gap:3 }}><div style={{ width:11, height:20, borderRadius:4, background:"hsl(140,68%,50%)" }}/><div style={{ width:11, height:20, borderRadius:4, background:"hsl(45,68%,52%)" }}/><div style={{ width:11, height:20, borderRadius:4, background:"hsl(5,68%,56%)" }}/></div>, t: "Колір картки = колір клієнта", d: "Кожен клієнт має свій колір, тож розклад читається з одного погляду. У налаштуваннях можна вимкнути «Автокольори» й призначити кольори вручну в картці клієнта." },
      { ico: <HelpDot bg="rgba(0,0,0,0.55)" color="#fff">16</HelpDot>, t: "Число в кружку", d: "Порядковий номер запису цього клієнта." },
      { ico: <div style={{ display:"grid", gridTemplateColumns:"auto auto", gap:"2px 6px" }}><MetalIcon name="star" size={20}/><MetalIcon name="search" size={20}/><MetalIcon name="warn" size={20}/><MetalIcon name="coin" size={20}/></div>, t: "Мітки запису: ⭐ 🔍 🚨 💸", d: "⭐ «1-й запис» ставиться автоматично. 🔍 «Перевірка», 🚨 «Іспит» і 💸 «Борг» — вручну: деталі запису → «Мітка» або під час створення запису. Для боргу можна вписати суму." },
      { ico: <MetalIcon name="crown" size={24}/>, h: "crown", t: "Корона", d: "VIP-клієнт." },
      { ico: <div style={{ display:"flex", alignItems:"center", gap:2, fontSize:12, fontWeight:800, color:GOLD }}><MetalIcon name="user" size={18}/><span>2</span></div>, h: "queue", t: "👤 + число", d: "Скільки клієнтів стоять у черзі на цей час. Якщо запис скасують, слот автоматично запропонують наступному." },
      { ico: <div style={{ width:22, height:22, borderRadius:5, background:"rgba(255,255,255,0.12)", position:"relative", overflow:"hidden", flexShrink:0 }}><div style={{ position:"absolute", right:0, bottom:0, width:0, height:0, borderLeft:"10px solid transparent", borderBottom:`10px solid ${GOLD}` }}/></div>, t: "Жовтий куточок", d: "Клієнт залишив нотатку до запису для майстра. Відкрийте картку, щоб прочитати." },
    ] },
    { title: "Кнопки по краях", items: [
      { ico: <div style={{ display:"flex", gap:3 }}><MetalIcon name="grid" size={22} square color={GREEN}/><MetalIcon name="grid" size={22} square color={RED}/></div>, h: "key", t: "Ключик ▦ (угорі зліва)", s: 0.95, d: "Створює слоти за графіком на найближчі дні або знімає їх усі. Зелений — слотів немає (натискання створить), червоний — слоти вже є (натискання зніме)." },
      { ico: <div style={{ display:"flex", gap:3 }}><MetalIcon name="lock" size={22} square color={GREEN}/><MetalIcon name="lock" size={22} square color={RED}/></div>, h: "lock", t: "Замок (внизу зліва)", s: 0.95, d: "Утримайте 0,7 с: червоний замок — календар заблоковано від змін, зелений — редагування дозволено." },
      { ico: <HelpDot bg={BLUE} color="#fff" size={26}>‹</HelpDot>, h: "todayarrow", t: "Стрілка внизу справа", d: "Повернутися до сьогоднішнього дня. З'являється, коли ви гортаєте далеко від сьогодні." },
      { ico: <HelpChip bg="rgba(126,217,87,0.15)" color={GREEN} w={44}>{`6 000${curSym()}`}</HelpChip>, h: "daysum", t: "Сума внизу колонки", d: "Скільки заробляєте за цей день за записами." },
    ] },
    { title: "Нижнє меню", items: [
      { ico: <div style={{ position:"relative", width:24, height:24, fontSize:18, lineHeight:"24px", textAlign:"center" }}><MetalIcon name="list" size={24}/><span style={{ position:"absolute", top:-4, right:-8, background:ACCENT, color:"#fff", borderRadius:10, padding:"0 5px", fontSize:9, fontWeight:800, lineHeight:"14px" }}>14</span></div>, h: "navbadge", t: "Червоне число на «Журнал» / «Чати»", d: "Журнал — непрочитані події (нові записи, скасування, перенесення). Чати — непрочитані повідомлення від клієнтів." },
    ] },
  ];
  return createPortal(
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:9000, background:"rgba(0,0,0,0.62)", display:"flex", alignItems:"flex-end", justifyContent:"center", ...(hv?.ov||{}) }}>
      <div onClick={e => e.stopPropagation()} style={{
        width:"100%", maxHeight:"92dvh", display:"flex", flexDirection:"column",
        borderRadius:"22px 22px 0 0", border:`1px solid ${BORDER}`, borderBottom:"none",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`, color:TEXT,
        ...(hv?.panel||{}),
      }}>
        <div style={{ position:"relative", textAlign:"center", padding:"16px 48px 12px", flexShrink:0 }}>
          <div style={{ fontSize:17, fontWeight:800 }}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="info" size={28}/>Підказки по розкладу</span></div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.82)", marginTop:3 }}>Що означає кожен значок на екрані «Записи». Натисніть на блок, щоб побачити його на екрані</div>
          <button onClick={onClose} aria-label="Закрити" style={{ position:"absolute", top:12, right:14, width:32, height:32, borderRadius:"50%", border:"none", background:"none", color:"#ef4444", fontSize:13, fontWeight:800, lineHeight:1, cursor:"pointer", padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}><MetalIcon name="cross" size={32}/></button>
        </div>
        <div style={{ overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"2px 14px calc(18px + env(safe-area-inset-bottom, 0px))" }}>
          {SECTIONS.map(sec => (
            <div key={sec.title} style={{ marginBottom:18 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, margin:"6px 0 12px" }}>
                <div style={{ flex:1, height:1, background:`linear-gradient(90deg,transparent,${GOLD}88)` }}/>
                <div style={{ fontSize:12, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase", color:GOLD, textAlign:"center", whiteSpace:"nowrap" }}>{sec.title}</div>
                <div style={{ flex:1, height:1, background:`linear-gradient(270deg,transparent,${GOLD}88)` }}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,290px),1fr))", gap:10 }}>
                {sec.items.map((it, i) => (
                  <div key={i} role="button" tabIndex={0} onClick={() => onPick?.(it.h)} style={{ cursor:"pointer", display:"grid", gridTemplateColumns:"72px 1fr", gap:12, alignItems:"center", padding:"11px 12px", borderRadius:16, background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`, ...(hv?.item||{}), gridColumn: (sec.items.length % 2 === 1 && i === sec.items.length - 1) ? "1 / -1" : undefined }}>
                    <div style={{ height:58, borderRadius:13, background:"rgba(0,0,0,0.22)", border:`1px solid ${BORDER}`, ...(hv?.ico||{}), display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", padding:"0 4px" }}><div style={{ transform:`scale(${it.s ?? 1.2})`, display:"flex", alignItems:"center", justifyContent:"center" }}>{it.ico}</div></div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:TEXT, lineHeight:1.25 }}>{it.t}</div>
                      <div style={{ fontSize:12.5, lineHeight:1.45, color:"rgba(255,255,255,0.82)", marginTop:3 }}>{it.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

export { ScheduleHelp, highlightHelp };
