import { useState, useEffect, useContext, useMemo } from "react";
import { MetalIcon } from "../MetalIcon";
import { createPortal } from "react-dom";
import { onValue, update, push, remove, get } from "firebase/database";
import { iRef, auth, getCurrentIid, getUserBookings } from "../firebase";
import { deleteAccountRequest } from "../deleteAccountApi";

import { ThemeContext } from "../theme.js";
import { UICss, Field, Btn as UIBtn, useFX, useBackClose, Hint } from "../ui";
import { makePalette } from "./id4drive-services";
import { STUDENT_COLOR_CHOICES } from "../studentColors";
import { useConfirm } from "../ConfirmModal";
import { normPackages, normPackageTemplates, buildClientPackage, expiresLabel } from "../packages";
import { cur as curSym, money } from "../currency";

const M = ["","Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
const fmtS = d => { if(!d) return "—"; const [,m,day]=d.split("-"); return `${parseInt(day)} ${M[parseInt(m)]}`; };
const navTo = tab => window.dispatchEvent(new CustomEvent("id4drive-nav", {detail:tab}));
// Чат саме з цим клієнтом (ChatsView відкриває його одразу), «Записати» — форма запису з обраним клієнтом
const openChatWith = (uid) => { window.__openChatUid = uid; navTo("chats"); };
const bookFor = (uid) => {
  window.__junoPendingStudent = uid; window.__junoPendingNew = Date.now(); navTo("schedule");
  setTimeout(() => window.dispatchEvent(new CustomEvent("juno:newBooking")), 0);
};
const WD = ["нд","пн","вт","ср","чт","пт","сб"];
const ymd0 = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const dm = (ds) => { const [, m, d] = String(ds).split("-"); return `${d}.${m}`; };
const klientiv = (n) => { const a = n % 100, b = n % 10; return a > 10 && a < 20 ? `${n} клієнтів` : b === 1 ? `${n} клієнт` : b >= 2 && b <= 4 ? `${n} клієнти` : `${n} клієнтів`; };
const SLEEP_DAYS = 60;
const fmtK = (n) => n >= 1000 ? money(`${(n/1000).toFixed(1)}к`, " ") : money(n);
// Підсумок по клієнту з записів: візити (минулі, без скасованих/неявок), останній і наступний, сума, неявки
// Сума запису: ручна ціна → ціна в записі → тариф послуги за тривалістю (як у статистиці, спрощено)
const priceOf = (b, svcs) => {
  if (b.manualPrice != null) return Number(b.manualPrice) || 0;
  if (Number(b.price) > 0) return Number(b.price);
  const svc = (svcs || []).find(x => x.id === b.serviceId);
  const dur = b.durMin || (b.durationHours ? b.durationHours * 60 : 60);
  return svc && svc.price && svc.duration ? Math.round(svc.price / svc.duration * dur) : 0;
};
function statsByClient(bookings, svcs) {
  const today = ymd0(new Date()), now = `${today} ${new Date().toTimeString().slice(0,5)}`;
  const map = {};
  (bookings || []).forEach(b => {
    if (!b.userId || !b.date || b.status === "cancelled") return;
    const r = (map[b.userId] ||= { visits: 0, last: "", next: null, sum: 0, noshow: 0, total: 0 });
    const key = `${b.date} ${String(b.time || "").padStart(5, "0")}`;
    r.total += 1;
    if (key >= now) { if (!r.next || key < `${r.next.date} ${String(r.next.time||"").padStart(5,"0")}`) r.next = b; return; }
    if (b.status === "noshow") { r.noshow += 1; return; }
    r.visits += 1; r.sum += priceOf(b, svcs);
    if (b.date > r.last) { r.last = b.date; r.lastSvc = b.serviceId || ""; r.lastSvcName = b.serviceName || ""; }
  });
  return map;
}
const daysSince = (ds) => ds ? Math.round((new Date(ymd0(new Date()) + "T00:00:00") - new Date(ds + "T00:00:00")) / 86400000) : null;

const Svg = (d, s=18, c="white", w=2) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const ICONS = {
  phone:    Svg(<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.05A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></>),
  viber:    Svg(<><path d="M12 2.5c5.2 0 9 3 9 8.2 0 5-3.8 8.1-9 8.1-.9 0-1.8-.1-2.6-.3L5.5 21v-3.6C3.6 16 3 13.8 3 10.7 3 5.5 6.8 2.5 12 2.5z"/><path d="M9.2 7.6c.4-.4 1-.4 1.3 0l.8 1c.3.4.2.9-.1 1.2l-.4.4c.4 1 1.2 1.8 2.2 2.2l.4-.4c.3-.3.8-.4 1.2-.1l1 .8c.4.3.4.9 0 1.3l-.5.5c-.6.6-1.6.7-2.4.3a8.2 8.2 0 0 1-3.9-3.9c-.4-.8-.3-1.8.3-2.4z"/></>),
  telegram: Svg(<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>),
  chat:     Svg(<><path d="M21 12c0 5-4 8-9 8a16 16 0 0 1-4-.7L3 21l1-4C2.5 15.5 2 13.8 2 12c0-5 4-8 9-8s10 3 10 8z"/></>),
  edit:     Svg(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></>),
  ban:      Svg(<><circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/></>, 18, "white", 2.2),
  unban:    Svg(<><polyline points="20 6 9 17 4 12"/></>, 18, "white", 2.5),
  search:   Svg(<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>, 15, "#5a5c62"),
  trash:    Svg(<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>, 18, "white", 2),
  bell:     Svg(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>),
  history:  Svg(<><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></>),
  link:     Svg(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>),
};

// ─── ACTION BUTTON ───────────────────────────────────────────────
function ActBtn({ icon, label, onClick, color, danger }) {
  const { SURFACE, SURF_HI, BG_DEEP, DIM, SO } = useContext(ThemeContext);
  const tint = danger ? "#ef4444" : color;
  const bg = tint
    ? `linear-gradient(155deg,color-mix(in srgb,${tint} 45%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`
    : `linear-gradient(145deg,${SURF_HI},${SURFACE})`;
  return (
    <button className="act-btn" onClick={onClick} style={{background:bg,boxShadow:SO}}>
      {icon}
      <span style={{color:tint?"#fff":DIM}}>{label}</span>
    </button>
  );
}

// ─── STUDENT FORM (shared: new + edit) ───────────────────────────
function StudentForm({ initial, onSave, onCancel, saveLabel="Зберегти" }) {
  const { BG_DEEP, TEXT, DIM, FAINT, BORDER, SO } = useContext(ThemeContext);
  const [d, setD] = useState(initial);
  const upd = (k,v) => setD(x=>({...x,[k]:v}));
  const valid = (d.name||"").trim();
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
     <div className="win-cols win-gap" style={{gap:9}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
        <Field label="Ім'я"      value={d.name||""}     onChange={v=>upd("name",v)}     placeholder="Ім'я Прізвище" style={{marginBottom:0}}/>
        <Field label="Телефон"   value={d.phone||""}    onChange={v=>upd("phone",v)}    placeholder="+380..." style={{marginBottom:0}}/>
        <Field label={`Знижка ${curSym()}/год`}  value={d.discount||""} onChange={v=>upd("discount",v.replace(/[^\d]/g,""))} placeholder="0" type="text" inputMode="numeric" style={{marginBottom:0}}/>
        <div>
          <div style={{fontSize:11,color:FAINT,letterSpacing:1,marginBottom:5}}>ТИП</div>
          <div style={{display:"flex",gap:6}}>
            {[["private","Індивід."],["school","Стандарт"]].map(([k,l])=>(
              <UIBtn key={k} variant={d.type===k?"primary":"ghost"} flex={1}
                style={{padding:"7px 4px",borderRadius:8,fontSize:11}}
                onClick={()=>upd("type",k)}>{l}</UIBtn>
            ))}
          </div>
        </div>
      </div>
      <Field label={`Індивідуальна фікс. ціна ${curSym()}/год`} value={d.customPrice||""} onChange={v=>upd("customPrice",v.replace(/[^\d]/g,""))} placeholder="Стандартна ціна послуги" type="text" inputMode="numeric" style={{marginBottom:0}}/>
      <div onClick={()=>upd("isVip",!d.isVip)} style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 12px",borderRadius:10,cursor:"pointer",
        background:d.isVip?"rgba(168,85,247,0.12)":BG_DEEP,
        border:d.isVip?"1px solid rgba(168,85,247,0.35)":`1px solid ${BORDER}`,
      }}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:d.isVip?"#c084fc":TEXT}}>VIP клієнт</div>
          <div style={{fontSize:11,color:FAINT,marginTop:2}}>{d.isVip?"Має доступ до VIP слотів":"Без доступу до VIP слотів"}</div>
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
          <div style={{fontSize:11,color:FAINT,marginTop:2}}>{d.noIntervalLimit?"Ігнорує обмеження мінімального інтервалу":"Застосовується загальне обмеження"}</div>
        </div>
        <div style={{width:36,height:20,borderRadius:10,position:"relative",background:d.noIntervalLimit?"linear-gradient(145deg,#eab308,#ca8a04)":"rgba(255,255,255,0.08)",transition:"background .2s",flexShrink:0}}>
          <div style={{position:"absolute",top:2,left:d.noIntervalLimit?18:2,width:16,height:16,borderRadius:8,background:"#fff",transition:"left .2s"}}/>
        </div>
      </div>
      <Field label="Нотатки" value={d.notes||""} onChange={v=>upd("notes",v)} placeholder="Нотатки…" textarea rows={2} style={{marginBottom:0}}/>
     </div>
      <div className="modal-footer" style={{gap:8}}>
        <UIBtn variant="ghost" onClick={onCancel}>Скасувати</UIBtn>
        <UIBtn variant="primary" disabled={!valid} onClick={()=>valid&&onSave(d)}>{saveLabel}</UIBtn>
      </div>
    </div>
  );
}

// ─── STUDENT CARD (colorway card) ────────────────────────────────
function StudentCard({ s, onSelect, settings, st }) {
  const theme = useContext(ThemeContext);
  const { GREEN, GOLD, RED } = theme;
  // Колір картки клієнта — той самий, що обраний для послуги цього типу
  // (Стандарт/Індивідуальний) на вкладці «Послуги», а не фіксований GREEN/GOLD.
  const PALETTE = makePalette(theme);
  const colorOf = id => PALETTE.find(p=>p.id===id)?.color || GREEN;
  const matchedSvc = (settings?.services || []).find(sv => sv.type === s.type && sv.active)
                   || (settings?.services || []).find(sv => sv.type === s.type);
  const typeColor = matchedSvc ? colorOf(matchedSvc.colorId) : (s.type === "school" ? GREEN : GOLD);
  const ini       = s.name.split(" ").map(w=>w[0]).slice(0,2).join("");
  const barColor  = s.blocked ? RED : typeColor;

  return (
    <div
      onClick={() => onSelect(s)}
      style={{
        position:"relative",overflow:"hidden",borderRadius:14,cursor:"pointer",
        padding:"12px 12px",minHeight:64,display:"flex",alignItems:"center",gap:10,
        background:"rgba(255,255,255,0.06)",
        border:s.blocked?`1px solid color-mix(in srgb,${RED} 45%,transparent)`:"1px solid rgba(255,255,255,0.1)",
        backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
        opacity:s.blocked?0.6:1,
      }}
    >
      {s.photo
        ? <div style={{position:"relative",zIndex:2,width:40,height:40,borderRadius:"50%",flexShrink:0,
            background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",
            overflow:"hidden",fontSize:12,fontWeight:900,color:"#fff"}}><img src={s.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/></div>
        : <span style={{position:"relative",zIndex:2,display:"inline-flex",flexShrink:0}}><MetalIcon square size={40} color={barColor}>{ini}</MetalIcon></span>}

      <div style={{position:"relative",zIndex:2,flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",minWidth:0}}>
          {s.isVip && <MetalIcon name="crown" size={16} style={{marginRight:5,flexShrink:0}}/>}<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{s.name}</span>{s.blocked && <MetalIcon name="ban" size={16} style={{marginLeft:6,flexShrink:0}}/>}
        </div>
        <div style={{fontSize:11.5,color:st?.next?GREEN:"rgba(255,255,255,0.75)",fontWeight:st?.next?700:500,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {st?.next
            ? (() => { const d = new Date(st.next.date + "T00:00:00"); return `Наст.: ${WD[d.getDay()]} ${dm(st.next.date)} · ${st.next.time || ""}`; })()
            : st?.last ? `Був ${dm(st.last)} · записів: ${st.visits}` : "Ще не записувався"}
        </div>
      </div>

      {/* Підсумок клієнта справа: візити й сума — заповнює картку, видно цінність клієнта одразу */}
      <div className="sc-stats" style={{position:"relative",zIndex:2,flexShrink:0,textAlign:"right",minWidth:44}}>
        <div style={{fontSize:14,fontWeight:900,color:"#fff",lineHeight:1.1}}>{st?.visits || 0}<span style={{fontSize:10.5,fontWeight:600,color:"rgba(255,255,255,0.6)",marginLeft:2}}>віз.</span></div>
        <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.65)",marginTop:3,whiteSpace:"nowrap"}}>{st?.sum ? fmtK(st.sum) : "—"}</div>
      </div>
      <button aria-label="Чат з клієнтом" onClick={e=>{e.stopPropagation();openChatWith(s.id);}} style={{position:"relative",zIndex:2,background:"rgba(0,0,0,0.25)",border:"none",borderRadius:8,cursor:"pointer",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {ICONS.chat}
      </button>

    </div>
  );
}

// ─── STUDENT DETAIL SHEET ────────────────────────────────────────
function StudentDetailSheet({ settings, s, st, onClose, onUpdate, onDelete, onBlock, autoOpenHistory, slotColor, autoColors, onColorChange }) {
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, GOLD, RED, SO, SI } = useContext(ThemeContext);
  const { shade, glow, ink } = useFX();
  const [closing,      setClosing]     = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const [colorOpen, setColorOpen] = useState(false);
  const [editMode,     setEditMode]    = useState(false);
  const [confirmDel,   setConfirmDel]  = useState(false);
  const [pendingDelete,setPendingDelete] = useState(false);
  const [pushOpen,     setPushOpen]    = useState(false);
  const [pushTitle,    setPushTitle]   = useState("Повідомлення");
  const [pushBody,     setPushBody]    = useState("");
  const [pushSending,  setPushSending] = useState(false);
  const [pushSent,     setPushSent]    = useState(false);
  const [pushError,    setPushError]   = useState(null);
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [history,        setHistory]        = useState(null); // null = ще не завантажено
  const [historyLoading, setHistoryLoading] = useState(false);
  const [inviteOpen,      setInviteOpen]      = useState(false);
  const [inviteLink,      setInviteLink]      = useState("");
  const [inviteGenerating,setInviteGenerating]= useState(false);
  const [inviteError,     setInviteError]     = useState(null);

  const toggleHistory = () => {
    if (historyOpen) { setHistoryOpen(false); return; }
    setHistoryOpen(true);
    if (history !== null) return;
    setHistoryLoading(true);
    getUserBookings(s.id).then(data => {
      const today = new Date(new Date().toDateString());
      const list = Object.entries(data).map(([id, b]) => ({ id, ...b }))
        .filter(b => b.date && new Date(b.date) < today)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.time||'').localeCompare(a.time||''));
      setHistory(list);
    }).catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  };

  const getDurMin = b => b.durMin ?? (b.durationHours ? b.durationHours * 60 : 60);
  const fmtHours = min => {
    const h = (min || 60) / 60;
    return (Number.isInteger(h) ? h : h.toFixed(1)) + " год";
  };
  const historyStats = (() => {
    const attended = (history || []).filter(b => b.status !== "cancelled" && b.status !== "noshow");
    const totalMin = attended.reduce((sum, b) => sum + getDurMin(b), 0);
    return { count: attended.length, hours: totalMin / 60, sum: attended.reduce((t, b) => t + priceOf(b, settings?.services), 0) };
  })();

  // Перехід із модалки запису ("Історія") — розгорнути історію одразу при відкритті картки
  useEffect(() => {
    if (autoOpenHistory && s && !historyOpen) toggleHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenHistory, s?.id]);

  // Посилання-запрошення: клієнт переходить по ньому, реєструється сам —
  // Cloud Function onNewStudentRegistered (webid4/functions/index.js)
  // зливає знижку/фікс.ціну/нотатки/години з цієї (створеної вручну)
  // картки у щойно зареєстрований акаунт клієнта.
  const generateInvite = async () => {
    if (inviteGenerating) return;
    setInviteGenerating(true); setInviteError(null);
    try {
      // Адреса майстра (slug) потрібна, щоб клієнт знав, до кого прив'язати клієнта (?i=slug)
      const slug = (await get(iRef("admin_settings/profile/slug"))).val();
      if (!slug) { setInviteError("Спершу задайте адресу запису в Налаштуваннях"); return; }
      const inviteRef = await push(iRef( "invites"), { studentKey: s.id, createdAt: Date.now() });
      setInviteLink(`https://aldemi.com.ua/junoclient/auth?i=${encodeURIComponent(slug)}&invite=${inviteRef.key}`);
      setInviteOpen(true);
    } catch (e) {
      setInviteError("Помилка: " + e.message);
    } finally {
      setInviteGenerating(false);
    }
  };

  // Персональне повідомлення клієнту: пишемо запит у adminPush/{id}, cloud function onAdminPush
  // читає токен клієнта й шле FCM (плюс внутрішнє сповіщення в NotifTab).
  const sendPushToStudent = async () => {
    if (!pushBody.trim() || pushSending) return;
    setPushSending(true); setPushError(null);
    try {
      await push(iRef( "adminPush"), {
        uid: s.id,
        title: pushTitle.trim() || "Повідомлення",
        body: pushBody.trim(),
        createdAt: Date.now(),
      });
      setPushSent(true);
      setPushBody("");
    } catch (e) {
      setPushError("Помилка: " + e.message);
    } finally {
      setPushSending(false);
    }
  };

  const typeColor = s.type === "school" ? GREEN : GOLD;
  const phone     = (s.phone||"").replace(/\D/g,"");
  const svcName   = (b) => ((settings?.services || []).find(x => x.id === b.serviceId) || {}).name || b.serviceName || b.svc || "—";
  const ini       = s.name.split(" ").map(w=>w[0]).slice(0,2).join("");
  const barColor  = s.blocked ? RED : typeColor;

  const _close = () => setClosing(true);
  useBackClose(true, _close);

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
            width:"100%",
            background:`linear-gradient(165deg,color-mix(in srgb,${barColor} 24%,${BG_DEEP}) 0%,${BG_DEEP} 60%)`,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.08)},0 -16px 60px ${shade(0.8)}`,
            display:"flex",flexDirection:"column",
            maxHeight:"min(92vh, calc(100dvh - 48px - env(safe-area-inset-top, 0px)))",overflow:"hidden",
            pointerEvents:closing?"none":undefined,
            animation:closing ? `_sd-down 0.26s ease-in forwards` : `_sd-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
          }}
        >
          {/* Handle */}
          <div style={{width:36,height:4,borderRadius:2,background:glow(0.15),margin:"10px auto 0",flexShrink:0}} />

          {/* Header */}
          <div style={{
            position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"12px 52px 12px",textAlign:"center",
            borderBottom:`1px solid ${BORDER}`,flexShrink:0,
          }}>
            {s.photo
              ? <div style={{width:42,height:42,borderRadius:13,flexShrink:0,overflow:"hidden"}}><img src={s.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/></div>
              : <MetalIcon square size={42} color={barColor}>{ini}</MetalIcon>}
            <div style={{minWidth:0,maxWidth:"100%"}}>
              <div style={{fontSize:16,fontWeight:800,color:s.blocked?DIM:TEXT,overflowWrap:"anywhere"}}>
                {s.name}{s.blocked && <MetalIcon name="ban" size={16} style={{marginLeft:6}}/>}
              </div>
              {/* Хто це — одним рядком: VIP · постійний/новий · остання послуга */}
              {(() => {
                const lastSvc = st?.last ? (((settings?.services||[]).find(x => x.id === st.lastSvc) || {}).name || st.lastSvcName) : "";
                const chips = [
                  ...(s.isVip ? [["👑 VIP", "#c084fc"]] : []),
                  ...(s.blocked ? [["заблоковано", "#f87171"]] : []),
                  [(st?.visits || 0) >= 2 ? "постійний" : "новий", (st?.visits || 0) >= 2 ? GREEN : BLUE],
                  ...(lastSvc ? [[lastSvc, DIM]] : []),
                ];
                return (
                  <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:5,marginTop:6}}>
                    {chips.map(([t, c]) => <span key={t} style={{fontSize:11,fontWeight:700,color:c,padding:"2px 8px",borderRadius:99,border:`1px solid color-mix(in srgb,${c} 45%,transparent)`,background:`color-mix(in srgb,${c} 12%,transparent)`,whiteSpace:"nowrap",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>{t}</span>)}
                  </div>
                );
              })()}

            </div>
            <div onClick={_close} role="button" aria-label="Закрити" style={{
              position:"absolute",top:12,right:14,
              width:32,padding:0,height:32,borderRadius:"50%",background:"none",
              display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",color:"#ef4444",fontSize:14,fontWeight:800,userSelect:"none",flexShrink:0,
            }}><MetalIcon name="cross" size={32}/></div>
          </div>

          {/* Body (scrollable) */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 16px calc(28px + env(safe-area-inset-bottom))",display:"flex",flexDirection:"column",gap:10}}>

            {editMode ? (
              <StudentForm
                initial={{name:s.name,phone:s.phone,discount:s.discount??0,customPrice:s.customPrice??"",notes:s.notes||"",type:s.type,isVip:s.isVip||false,noIntervalLimit:s.noIntervalLimit||false}}
                onSave={patch=>{
                  onUpdate(s.id,{...patch, discount:Number(patch.discount)||0, customPrice:patch.customPrice?Number(patch.customPrice):null});
                  setEditMode(false);
                }}
                onCancel={()=>setEditMode(false)}
              />
            ) : confirmDel ? (
              <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:14,padding:"18px 14px 14px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
                <MetalIcon name="trash" size={30}/>
                <div style={{fontSize:15,fontWeight:800,color:"#fca5a5"}}>Видалити клієнта?</div>
                <div style={{fontSize:12.5,color:DIM,maxWidth:420}}>{`${s.name} зникне зі списку разом з історією записів. Цю дію не можна скасувати.`}</div>
                <div className="modal-footer" style={{gap:8,width:"100%",marginTop:6}}>
                  <button onClick={()=>setConfirmDel(false)} style={{padding:"11px",borderRadius:14,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:13,fontWeight:700,fontFamily:"inherit"}}>Скасувати</button>
                  <button onClick={()=>{setPendingDelete(true);_close();}} style={{padding:"11px",borderRadius:14,border:"1px solid rgba(239,68,68,0.45)",cursor:"pointer",background:"linear-gradient(145deg,rgba(239,68,68,.5),rgba(185,28,28,.4))",color:"#fff",fontSize:13,fontWeight:800,fontFamily:"inherit"}}>Видалити</button>
                </div>
              </div>
            ) : pushOpen ? (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:15,fontWeight:800,color:GOLD}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="mega" size={20}/>Повідомлення клієнту</span></div><div style={{fontSize:12,color:DIM,marginTop:2,overflowWrap:"anywhere"}}>{s.name}</div></div>
                <input value={pushTitle} onChange={e=>{setPushTitle(e.target.value);setPushSent(false);}} placeholder="Заголовок"
                  style={{background:glow(0.04),border:`1px solid ${BORDER}`,outline:"none",color:TEXT,fontSize:13,padding:"9px 12px",borderRadius:10,boxShadow:SI,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
                <textarea value={pushBody} onChange={e=>{setPushBody(e.target.value);setPushSent(false);}} placeholder="Текст сповіщення" rows={3}
                  style={{background:glow(0.04),border:`1px solid ${BORDER}`,outline:"none",color:TEXT,fontSize:13,padding:"9px 12px",borderRadius:10,boxShadow:SI,width:"100%",boxSizing:"border-box",fontFamily:"inherit",resize:"vertical"}}/>
                {pushError && <div style={{fontSize:12,color:"#fca5a5"}}>{pushError}</div>}
                {pushSent && <div style={{fontSize:12,fontWeight:700,color:GREEN}}>✓ Надіслано</div>}
                <div className="modal-footer" style={{gap:8}}>
                  <button onClick={()=>{setPushOpen(false);setPushSent(false);setPushError(null);}}
                    style={{padding:"11px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Скасувати</button>
                  <button disabled={!pushBody.trim()||pushSending} onClick={sendPushToStudent}
                    style={{padding:"11px",borderRadius:10,border:"none",cursor:(!pushBody.trim()||pushSending)?"default":"pointer",opacity:(!pushBody.trim()||pushSending)?0.5:1,background:`linear-gradient(145deg,${GOLD}cc,${GOLD}88)`,color:"#1a1a1a",fontSize:13,fontWeight:800,boxShadow:SO,fontFamily:"inherit"}}>{pushSending?"…":"Надіслати"}</button>
                </div>
              </div>
            ) : inviteOpen ? (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:15,fontWeight:800,color:GOLD}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="link" size={20}/>Запросити клієнта</span></div><div style={{fontSize:12,color:DIM,marginTop:2,overflowWrap:"anywhere"}}>{s.name}</div></div>
                <Hint>Клієнт реєструється за посиланням, а знижка, ціна й нотатки з картки переносяться на його акаунт.</Hint>
                <div style={{background:glow(0.04),border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 12px",fontSize:12,color:TEXT,wordBreak:"break-all"}}>{inviteLink}</div>
                {inviteError && <div style={{fontSize:12,color:"#fca5a5"}}>{inviteError}</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3, minmax(0,1fr))",gap:7}}>
                  <button onClick={()=>navigator.clipboard?.writeText(inviteLink).catch(()=>{})}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${GOLD}cc,${GOLD}88)`,color:"#1a1a1a",fontSize:13,fontWeight:800,boxShadow:SO,fontFamily:"inherit"}}>Копіювати</button>
                  <button onClick={()=>{window.location.href=`viber://forward?text=${encodeURIComponent(inviteLink)}`;}}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Вайбер</button>
                  <button onClick={()=>{window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}`,"_blank");}}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Телеграм</button>
                </div>
                <button onClick={()=>{setInviteOpen(false);setInviteError(null);}}
                  style={{padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Закрити</button>
              </div>
            ) : (
              <div className="win-cols win-gap">
                {/* Підсумок: 4 однакові плитки — значення зверху, підпис знизу */}
                {(() => {
                  const ds = st?.last ? daysSince(st.last) : null;
                  const lastV = ds === 0 ? "сьогодні" : ds === 1 ? "вчора" : st?.last ? dm(st.last) : "—";
                  const nd = st?.next ? new Date(st.next.date + "T12:00:00") : null;
                  // Кожна плитка: назва зверху · значення · уточнення знизу (однакова висота)
                  const tiles = [
                    ["Візитів", String(st?.visits ?? 0), st?.noshow ? `неявок ${st.noshow}` : " ", TEXT],
                    ["Останній", lastV, ds != null && ds > 1 ? `${ds} дн. тому` : " ", TEXT],
                    ["Наступний", nd ? `${WD[nd.getDay()]} ${dm(st.next.date)}` : "—", nd ? (st.next.time || " ") : " ", nd ? GREEN : DIM],
                    ["Сума", fmtK(st?.sum || 0), " ", GOLD],
                  ];
                  return (
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:6}}>
                      {tiles.map(([t, v, sub, c], i) => (
                        <div key={i} style={{background:glow(0.04),border:`1px solid ${BORDER}`,borderRadius:12,padding:"7px 3px",textAlign:"center",minWidth:0}}>
                          <div style={{fontSize:"min(9.5px, 2.65vw)",fontWeight:700,letterSpacing:0.2,textTransform:"uppercase",color:FAINT,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t}</div>
                          <div style={{fontSize:"min(14px, 3.6vw)",fontWeight:900,color:c,marginTop:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{v}</div>
                          <div style={{fontSize:10.5,color:i===0&&st?.noshow?RED:DIM,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minHeight:13}}>{sub}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Телефон на всю ширину: тап — дзвінок; копіювати; знижка/індив. ціна — бейджами */}
                <div style={{background:glow(0.04),border:`1px solid ${BORDER}`,borderRadius:12,display:"flex",alignItems:"center",gap:8,padding:"6px 6px 6px 12px",minHeight:52}}>
                  <a href={s.phone ? `tel:${s.phone}` : undefined} style={{flex:1,minWidth:0,textDecoration:"none",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{display:"inline-flex",color:GREEN}}>{ICONS.phone}</span>
                    <span style={{minWidth:0}}>
                      <span style={{display:"block",fontSize:15,fontWeight:800,color:TEXT,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.phone || "—"}</span>
                      <span style={{display:"block",fontSize:10.5,color:(s.discount>0||s.customPrice>0)?GOLD:DIM,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {s.customPrice > 0 ? `своя ціна ${money(s.customPrice)}/год` : s.discount > 0 ? `знижка −${money(s.discount)}/год` : "натисніть, щоб подзвонити"}
                      </span>
                    </span>
                  </a>
                  {s.phone && <button aria-label="Копіювати номер" onClick={()=>navigator.clipboard?.writeText(s.phone).catch(()=>{})} style={{flexShrink:0,width:40,height:40,borderRadius:10,border:`1px solid ${BORDER}`,background:"transparent",color:DIM,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                  </button>}
                </div>

                {/* Зв'язок: 4 рівні кнопки */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:6}}>
                  <ActBtn icon={ICONS.viber}    label="Viber"    onClick={()=>{window.location.href=`viber://chat?number=%2B${phone}`;}} color="#7c5cf0"/>
                  <ActBtn icon={ICONS.telegram} label="Telegram" onClick={()=>{window.open(`https://t.me/+${phone}`,"_blank");}} color="#2aa3e0"/>
                  <ActBtn icon={ICONS.chat}     label="Чат"      onClick={()=>{openChatWith(s.id);_close();}} color={BLUE}/>
                  <ActBtn icon={ICONS.bell}     label="Push" onClick={()=>{setPushOpen(true);setPushSent(false);setPushError(null);}} color={GOLD}/>
                </div>
                {/* Головне: 3 рівні кнопки, «Записати» — акцентна */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:6}}>
                  <button className="act-btn" onClick={()=>{bookFor(s.id);_close();}} disabled={s.blocked} style={{
                    background:s.blocked?SURF_HI:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,boxShadow:SO,cursor:s.blocked?"default":"pointer"}}>
                    <MetalIcon name="calendar" size={20}/><span style={{color:s.blocked?DIM:"#fff"}}>Записати</span>
                  </button>
                  <ActBtn icon={ICONS.history}  label="Історія"   onClick={toggleHistory}/>
                  <ActBtn icon={ICONS.link}     label="Запросити" onClick={generateInvite}/>
                </div>

                {/* Нотатки — завжди видно */}
                <button onClick={()=>setEditMode(true)} style={{background:glow(0.04),border:`1px solid ${BORDER}`,borderRadius:12,display:"flex",alignItems:"flex-start",gap:9,padding:"10px 12px",textAlign:"left",cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
                  <MetalIcon name="note" size={20}/>
                  <span style={{flex:1,minWidth:0}}>
                    <span style={{display:"block",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:FAINT,marginBottom:2}}>Нотатки</span>
                    <span style={{display:"block",fontSize:12.5,color:s.notes?TEXT:DIM,lineHeight:1.45,overflowWrap:"anywhere"}}>{s.notes || "Додати нотатку: побажання, алергії, деталі…"}</span>
                  </span>
                </button>

                {/* Налаштування — одна картка-список */}
                <div style={{background:glow(0.04),border:`1px solid ${BORDER}`,borderRadius:12,overflow:"hidden"}}>
                  <div onClick={()=>onUpdate(s.id,{isVip:!s.isVip})} role="switch" aria-checked={!!s.isVip} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer"}}>
                    <MetalIcon name="crown" size={22}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:700,color:s.isVip?"#c084fc":TEXT}}>VIP клієнт</div>
                      <div style={{fontSize:11,color:FAINT}}>{s.isVip?"Має доступ до VIP слотів":"Без доступу до VIP слотів"}</div>
                    </div>
                    <div style={{width:36,height:20,borderRadius:10,position:"relative",background:s.isVip?"linear-gradient(145deg,#a855f7,#7c3aed)":ink(0.08),transition:"background .2s",flexShrink:0}}>
                      <div style={{position:"absolute",top:2,left:s.isVip?18:2,width:16,height:16,borderRadius:8,background:"#fff",transition:"left .2s"}}/>
                    </div>
                  </div>
                  <div onClick={()=>setColorOpen(true)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer",borderTop:`1px solid ${BORDER}`}}>
                    <span style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:slotColor||"transparent",border:slotColor?"none":`1.5px dashed ${DIM}`}}/>
                    <div style={{flex:1,fontSize:12.5,fontWeight:700,color:TEXT}}>Колір у розкладі</div>
                    <span style={{fontSize:12,color:DIM}}>{slotColor ? "свій" : autoColors ? "автоматично" : "—"} ›</span>
                  </div>
                  {s.createdAt && (() => { const d = new Date(s.createdAt); return (
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderTop:`1px solid ${BORDER}`}}>
                      <MetalIcon name="calendar" size={20}/>
                      <div style={{flex:1,fontSize:12.5,fontWeight:700,color:TEXT}}>Клієнт з</div>
                      <span style={{fontSize:12,color:DIM}}>{d.toLocaleDateString("uk-UA",{day:"numeric",month:"short",year:"numeric"})}</span>
                    </div>); })()}
                </div>

                {colorOpen && createPortal(
                  <div onClick={()=>setColorOpen(false)} style={{
                    position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.6)",
                    display:"flex",alignItems:"center",justifyContent:"center",padding:16,
                  }}>
                    <div onClick={e=>e.stopPropagation()} style={{
                      width:"100%",maxWidth:360,padding:16,borderRadius:16,
                      background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,border:`1px solid ${BORDER}`,boxShadow:SO,
                    }}>
                      <div style={{position:"relative",textAlign:"center",padding:"0 36px",marginBottom:14}}>
                        <div style={{fontSize:15,fontWeight:800,color:TEXT}}>Колір слота</div>
                        <button aria-label="Закрити" onClick={()=>setColorOpen(false)} style={{position:"absolute",top:12,right:14,width:32,height:32,borderRadius:"50%",border:"none",cursor:"pointer",background:"none",color:"#ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,lineHeight:1,padding:0}}><MetalIcon name="cross" size={32}/></button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:6}}>
                        {STUDENT_COLOR_CHOICES.map((c,ci)=>(
                          <button key={c} aria-label={`Колір ${ci+1}`} onClick={()=>{onColorChange(c);setColorOpen(false);}} style={{
                            aspectRatio:"1",borderRadius:"50%",cursor:"pointer",padding:0,background:c,
                            border:slotColor===c?`2.5px solid ${TEXT}`:"2px solid transparent",
                            boxShadow:slotColor===c?`0 0 8px ${c}`:"none",
                          }}/>
                        ))}
                      </div>
                      <button onClick={()=>{onColorChange(null);setColorOpen(false);}} style={{
                        width:"100%",marginTop:12,padding:"9px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",
                        background:"transparent",border:`1px dashed ${BORDER}`,color:DIM,fontSize:12,fontWeight:700,
                      }}>∅ Без кольору</button>
                    </div>
                  </div>,
                  document.body
                )}

                {confirmNode}
                {/* Пакети (абонементи) клієнта: додає майстер із заготовок (Налаштування → Пакети) */}
                {(() => {
                  const pkgs = normPackages(s.packages);
                  const tpls = normPackageTemplates(settings?.packages);
                  return (
                    <div style={{background:glow(0.04),borderRadius:10,padding:"9px 12px",border:`1px solid ${BORDER}`,fontSize:12,color:DIM,lineHeight:1.6}}>
                      <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:FAINT,marginBottom:3}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="ticket" size={18}/>Пакети</span></div>
                      {pkgs.length === 0 && <div style={{color:FAINT}}>Немає пакетів</div>}
                      {pkgs.map(p => (
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <b style={{color:TEXT,fontWeight:700}}>{p.name}</b>: {p.left} з {p.total}
                            <span style={{color:FAINT}}> · {expiresLabel(p)}</span>
                          </div>
                          <button onClick={async()=>{ if (await confirm({ title:`Видалити пакет «${p.name}»?`, text:`Залишок ${p.left} з ${p.total} буде втрачено.`, okLabel:"Видалити", danger:true })) remove(iRef(`users/${s.id}/packages/${p.id}`)).catch(()=>{}); }} aria-label="Видалити пакет" style={{background:"none",border:"none",cursor:"pointer",color:"rgba(248,113,113,0.85)",fontSize:18,lineHeight:1,padding:"0 4px"}}>×</button>
                        </div>
                      ))}
                      {tpls.length > 0 ? (
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
                          {tpls.map(t => (
                            <button key={t.id} onClick={()=>{ const pk = buildClientPackage(t); update(iRef(`users/${s.id}/packages/${pk.id}`), pk).catch(()=>{}); }} style={{padding:"6px 10px",borderRadius:8,border:`1px dashed ${GREEN}`,background:"transparent",color:GREEN,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{`+ Пакет «${t.name}»`}</button>
                          ))}
                        </div>
                      ) : (
                        <Hint>Заготовки пакетів створюються в Налаштування → Пакети.</Hint>
                      )}
                    </div>
                  );
                })()}

                {/* Анкета клієнта (відповіді з Налаштування → Анкета) */}
                {s.intake?.length > 0 && (
                  <div style={{background:glow(0.04),borderRadius:10,padding:"9px 12px",border:`1px solid ${BORDER}`,fontSize:12,color:DIM,lineHeight:1.6}}>
                    <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:FAINT,marginBottom:3}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="clipboard" size={18}/>Анкета</span></div>
                    {s.intake.map((it,i)=>(
                      <div key={it.id||i}><span style={{color:FAINT}}>{it.label}:</span> <b style={{color:TEXT,fontWeight:700}}>{it.value}</b></div>
                    ))}
                  </div>
                )}

                {/* Керування: редагувати / заблокувати — порівну; видалити — окремо */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:2}}>
                  <button onClick={()=>setEditMode(true)} style={{minHeight:42,borderRadius:11,border:`1px solid ${BORDER}`,background:glow(0.04),color:TEXT,fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>Редагувати</button>
                  <button onClick={async()=>{ if (s.blocked || await confirm({ title:"Заблокувати клієнта?", text:`${s.name} не зможе записуватись, а майбутні записи буде скасовано.`, okLabel:"Заблокувати", danger:true, icon:"ban" })) onBlock(s.id); }} style={{minHeight:42,borderRadius:11,border:`1px solid ${s.blocked?"rgba(74,222,128,0.35)":"rgba(239,68,68,0.3)"}`,background:"transparent",color:s.blocked?GREEN:"#f87171",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>{s.blocked ? "Розблокувати" : "Заблокувати"}</button>
                </div>
                <button onClick={()=>setConfirmDel(true)} style={{
                  width:"100%",minHeight:40,borderRadius:11,border:"none",
                  cursor:"pointer",background:"transparent",color:"#fca5a5",
                  fontSize:12.5,fontWeight:700,fontFamily:"inherit",
                }}>Видалити клієнта</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Історія записів — окрема модалка (таймлайн з тривалістю і сумою годин) */}
      {historyOpen && createPortal(
        <div onClick={()=>setHistoryOpen(false)} style={{
          position:"fixed",inset:0,zIndex:260,
          background:shade(0.55),backdropFilter:"blur(8px)",
          display:"flex",alignItems:"flex-end",justifyContent:"center",
        }}>
          <div className="sheet" onClick={e=>e.stopPropagation()} style={{
            position:"relative",width:"100%",
            background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.08)},0 -16px 60px ${shade(0.8)}`,
            maxHeight:"85vh",overflowY:"auto",
            padding:"12px 16px calc(20px + env(safe-area-inset-bottom))",
            boxSizing:"border-box",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:glow(0.15),margin:"0 auto 14px"}}/>
            <div style={{position:"relative",textAlign:"center",padding:"0 40px",marginBottom:14}}>
              <div style={{fontSize:16,fontWeight:800,color:TEXT}}>Історія записів</div>
              <div style={{fontSize:12,color:DIM,marginTop:2,overflowWrap:"anywhere"}}>{s.name}</div>
              <button aria-label="Закрити" onClick={()=>setHistoryOpen(false)} style={{position:"absolute",top:12,right:14,width:32,height:32,borderRadius:"50%",border:"none",cursor:"pointer",background:"none",color:"#ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,lineHeight:1,padding:0}}><MetalIcon name="cross" size={32}/></button>
            </div>

            {historyLoading ? (
              <div style={{textAlign:"center",padding:"30px 0",color:FAINT,fontSize:12}}>Завантаження…</div>
            ) : (history||[]).length > 0 ? (
              <>
                <div style={{display:"flex",gap:8,marginBottom:16}}>
                  <div style={{flex:1,borderRadius:14,padding:"10px 8px",textAlign:"center",background:`linear-gradient(155deg,color-mix(in srgb,${GREEN} 30%,${BG_DEEP}),${BG_DEEP})`}}>
                    <div style={{fontSize:19,fontWeight:900,color:GREEN}}>{Number.isInteger(historyStats.hours)?historyStats.hours:historyStats.hours.toFixed(1)}</div>
                    <div style={{fontSize:11,color:DIM,fontWeight:700,marginTop:2}}>годин</div>
                  </div>
                  <div style={{flex:1,borderRadius:14,padding:"10px 8px",textAlign:"center",background:`linear-gradient(155deg,color-mix(in srgb,${BLUE} 30%,${BG_DEEP}),${BG_DEEP})`}}>
                    <div style={{fontSize:19,fontWeight:900,color:BLUE}}>{historyStats.count}</div>
                    <div style={{fontSize:11,color:DIM,fontWeight:700,marginTop:2}}>візитів</div>
                  </div>
                  <div style={{flex:1,borderRadius:14,padding:"10px 8px",textAlign:"center",background:`linear-gradient(155deg,color-mix(in srgb,${GOLD} 30%,${BG_DEEP}),${BG_DEEP})`}}>
                    <div style={{fontSize:19,fontWeight:900,color:GOLD,whiteSpace:"nowrap"}}>{money(historyStats.sum)}</div>
                    <div style={{fontSize:11,color:DIM,fontWeight:700,marginTop:2}}>сума</div>
                  </div>
                </div>

                <div style={{position:"relative",paddingLeft:20}}>
                  <div style={{position:"absolute",left:5,top:4,bottom:4,width:2,background:`linear-gradient(${GREEN},${GREEN} 75%,${RED})`}}/>
                  {history.map((b,i)=>{
                    const cancelled = b.status==="cancelled"||b.status==="noshow";
                    const dotColor = cancelled?RED:GREEN;
                    const statusLabel = b.status==="cancelled"?"скасовано":b.status==="noshow"?"неявка":"відвідано";
                    return (
                      <div key={b.id||i} style={{position:"relative",paddingBottom:i===history.length-1?0:16}}>
                        <div style={{position:"absolute",left:-20,top:2,width:11,height:11,borderRadius:"50%",background:dotColor,boxShadow:`0 0 0 3px ${BG_DEEP}`}}/>
                        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8}}>
                          <span style={{fontSize:12,fontWeight:800,color:TEXT}}>{fmtS(b.date)}{b.time?`, ${b.time}`:""}</span>
                          <span style={{fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:20,flexShrink:0,background:`${dotColor}22`,color:dotColor}}>{fmtHours(getDurMin(b))}</span>
                        </div>
                        <div style={{fontSize:11,color:DIM,marginTop:2}}>{`${svcName(b)} · ${statusLabel}`}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{textAlign:"center",padding:"30px 0",color:FAINT,fontSize:12}}>Записів ще немає</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
// overlayOnly — лише картка клієнта поверх поточного екрана (з огляду «Усі майстри»), без списку й без переходу на вкладку
export default function StudentsView({ studentJump, onStudentJumpHandled, bookings=[], settings, overlayOnly = false } = {}) {
  const { BG_DEEP, SURFACE, SURF_HI, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, SHEET, BTN_TX } = useContext(ThemeContext);
  const { ink } = useFX();

  const css = `
@keyframes ex{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.ex{animation:ex .16s ease both}
.act-btn{border:none;cursor:pointer;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:9px 4px;transition:transform .1s,filter .1s;font-family:inherit}
.act-btn:active{transform:scale(.92);filter:brightness(.8)}
.act-btn span{font-size:11px;font-weight:700;letter-spacing:0}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.sheet{animation:sheetUp .24s cubic-bezier(.32,.72,0,1) both}
.lbl-short{display:none}
@media (max-width:379px){.lbl-long{display:none}.lbl-short{display:inline}}
`;

  const [students,     setStudents]     = useState([]);
  const [detailStudent,setDetailStudent] = useState(null);
  const [search,       setSearch]       = useState("");
  const [filterType,   setFilterType]   = useState("all");
  const [sortMode,     setSortMode]     = useState("name");
  const [loading,      setLoading]      = useState(true);
  const [showNew,      setShowNew]      = useState(false);
  const [autoOpenHistory, setAutoOpenHistory] = useState(false);
  useBackClose(showNew, () => setShowNew(false));

  // Перехід із модалки запису в розкладі ("Профіль"/"Історія") — відкриваємо
  // картку клієнта, щойно список клієнтів завантажений
  useEffect(() => {
    if (!studentJump) return;
    const stu = students.find(x => x.id === studentJump.uid);
    if (!stu) return;
    setDetailStudent(stu);
    setAutoOpenHistory(!!studentJump.openHistory);
    onStudentJumpHandled?.();
  }, [studentJump, students]);

  const [studentColors, setStudentColors] = useState({});
  useEffect(() => onValue(iRef("studentColors"), snap => setStudentColors(snap.val() || {})), []);

  useEffect(() => {
    const unsub = onValue(iRef( "users"), snap => {
      const data = snap.val() || {};
      setStudents(Object.entries(data).map(([uid, u]) => {
        const p = u.profile || {};
        return {
          id:uid, name:p.name||u.name||"Клієнт", phone:p.phone||u.phone||"",
          type:p.type||u.type||"private",
          hours:u.hours||0,
          discount:u.discount||0, customPrice:u.customPrice??null, notes:u.notes||"", blocked:u.blocked||false, isVip:u.isVip||false,
          noIntervalLimit:u.noIntervalLimit||false,
          photo:p.photo||null,
          packages:u.packages||null,
          intake:Array.isArray(u.intake?.items)?u.intake.items:(u.intake?.items?Object.values(u.intake.items):[]),
          createdAt:p.createdAt||u.createdAt||null,
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
    update(iRef(`users/${id}`),{blocked:next}).catch(()=>{});
    if (next) {
      // Блокування — скасовуємо всі майбутні незавершені записи клієнта і
      // прибираємо його з активних черг, щоб він не отримав слот в обхід.
      const today = new Date(); today.setHours(0,0,0,0);
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      (bookings||[]).filter(b => b.userId === id && b.status !== "cancelled" && b.date >= todayStr).forEach(b => {
        if (b.date && b.startMin !== undefined) {
          const durMin = b.durMin || 60;
          const upd = {};
          for (let i = 0; i < durMin; i += 30) {
            const sm = b.startMin + i;
            const hh = String(Math.floor(sm/60)).padStart(2,'0'), mm = String(sm%60).padStart(2,'0');
            // Слоти лежать у календарі того майстра, до якого запис (салон: timeslots_m/{masterId})
            const root = b.masterId && b.masterId !== getCurrentIid() ? `timeslots_m/${b.masterId}` : "timeslots";
            const path = `${root}/${b.date}/slot${hh}${mm}`;
            upd[`${path}/available`] = true; upd[`${path}/time`] = `${hh}:${mm}`; upd[`${path}/phantom`] = null;
          }
          update(iRef('/'), upd).catch(()=>{});
        }
        const ks = [...new Set([b._fbKey, b.id].filter(Boolean))];
        ks.forEach(k => update(iRef( `bookings/${id}/${k}`),
          { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
      });
      get(iRef("queue")).then(snap=>{
        const q = snap.val() || {};
        Object.entries(q).forEach(([slotKey, sq]) => {
          if (sq?.entries?.[id]) remove(iRef(`queue/${slotKey}/entries/${id}`)).catch(()=>{});
        });
      }).catch(()=>{});
    }
  };
  const updateStudent = (id,patch) => {
    setStudents(ss=>ss.map(x=>x.id===id?{...x,...patch}:x));
    // Ім'я/телефон/тип показуються з profile/* (його пише й сам клієнт) — дублюємо туди, інакше правка майстра «не зберігається»
    const prof = {};
    ["name","phone","type"].forEach(k => { if (patch[k] !== undefined) prof[`profile/${k}`] = patch[k]; });
    update(iRef(`users/${id}`),{...patch, ...prof}).catch(()=>{});
  };
  // Повне видалення клієнта на сервері: скасовує майбутні записи (слоти звільняються), прибирає записи, чат, сповіщення, черги
  const deleteStudent = id => {
    setStudents(ss=>ss.filter(x=>x.id!==id));
    // через then: без авторизації (демо) помилка йде в catch → локальне видалення, а не падіння сторінки
    Promise.resolve().then(() => deleteAccountRequest({ type:"student", iid:auth.currentUser.uid, uid:id }))
      .catch(() => remove(iRef(`users/${id}`)).catch(()=>{}));
  };
  const createStudent = async (data) => {
    const newRef = await push(iRef("users"),{
      name:data.name.trim(), phone:data.phone.trim(), type:data.type,
      discount:Number(data.discount)||0, notes:data.notes.trim(), blocked:false,
      isVip:data.isVip||false, hours:0,
      ...(data.customPrice ? {customPrice:Number(data.customPrice)} : {}),
      createdAt:Date.now(),
    });
    setShowNew(false);
  };

  const studentStats = useMemo(() => {
    const map = {};
    (bookings || []).forEach(b => {
      if (b.status === "cancelled" || !b.userId) return;
      const cur = map[b.userId] || { lastKey: "", lessons: 0 };
      cur.lessons += 1;
      const key = `${b.date || ""} ${b.time || ""}`;
      if (key > cur.lastKey) cur.lastKey = key;
      map[b.userId] = cur;
    });
    return map;
  }, [bookings]);

  const cStats = useMemo(() => statsByClient(bookings, settings?.services), [bookings, settings?.services]);
  // Сегменти замість типів «Стандарт/Індивідуальний»: нові, постійні, давно не були, VIP, заблоковані
  const NEW_MS = 30 * 86400000;
  const SEGMENTS = [
    ["all", "Всі", () => true],
    ["new", "Нові", (s) => (s.createdAt && Date.now() - s.createdAt < NEW_MS) || ((cStats[s.id]?.visits || 0) <= 1 && !cStats[s.id]?.next && (cStats[s.id]?.total || 0) > 0)],
    ["regular", "Постійні", (s) => (cStats[s.id]?.visits || 0) >= 2],
    ["sleep", "Давно не були", (s) => { const st = cStats[s.id]; return !!st?.last && !st.next && daysSince(st.last) > SLEEP_DAYS; }],
    ["vip", "VIP", (s) => s.isVip],
    ["blocked", "Заблоковані", (s) => s.blocked],
  ];
  const segFn = (SEGMENTS.find(x => x[0] === filterType) || SEGMENTS[0])[2];
  const q    = search.toLowerCase();
  const list = students
    .filter(s=>(!q||(s.name||"").toLowerCase().includes(q)||(s.phone||"").includes(q))&&segFn(s))
    .sort((a,b)=>{
      if (sortMode === "lastBooking") {
        const ka = studentStats[a.id]?.lastKey || "";
        const kb = studentStats[b.id]?.lastKey || "";
        return kb.localeCompare(ka);
      }
      if (sortMode === "createdAt") return (b.createdAt||0) - (a.createdAt||0);
      if (sortMode === "lessons") {
        const la = studentStats[a.id]?.lessons || 0;
        const lb = studentStats[b.id]?.lessons || 0;
        return lb - la;
      }
      return (a.name||"").localeCompare(b.name||"");
    });

  const liveDetail = detailStudent ? students.find(x=>x.id===detailStudent.id) : null;

  if (overlayOnly) return (
    <>
      <style>{css}</style>
      {/* Student detail sheet */}
      {liveDetail && createPortal(
        <StudentDetailSheet
          settings={settings}
          s={liveDetail}
          st={cStats[liveDetail.id]}
          onClose={()=>setDetailStudent(null)}
          onUpdate={updateStudent}
          onDelete={deleteStudent}
          onBlock={block}
          autoOpenHistory={autoOpenHistory}
          slotColor={studentColors[liveDetail.id] || null}
          autoColors={settings?.autoStudentColors !== false}
          onColorChange={c=>update(iRef("studentColors"), { [liveDetail.id]: c || null }).catch(()=>{})}
        />,
        document.body
      )}
    </>
  );

  return (
    <>
      <UICss/>
      <style>{css + "@media (max-width:359px){.sc-stats{display:none!important}}"}</style>
      <div style={{display:"flex",flexDirection:"column",gap:8,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        <div style={{background:SURFACE,border:`1px solid ${BORDER}`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:16,padding:"2px 14px",minHeight:48,display:"flex",alignItems:"center",gap:8}}>
          {ICONS.search}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ім'я або телефон…"
            style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,padding:"11px 0",fontSize:14,minWidth:0,fontFamily:"inherit"}}/>
          {search && <button aria-label="Очистити пошук" onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:16,padding:0,lineHeight:1,minWidth:28,minHeight:28}}>×</button>}
        </div>

        {/* Сегменти */}
        {(() => {
          // Сегменти рівною сіткою на всю ширину: число зверху, назва знизу (≤4 — один ряд, 5–6 — по 3 у ряд)
          const segs = SEGMENTS.map(([k,l,fn]) => [k, l, k === "all" ? students.length : students.filter(fn).length]).filter(([k,,n]) => k === "all" || n || filterType === k);
          const cols = segs.length <= 4 ? segs.length : 3;
          return (
            <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`,gap:6}}>
              {segs.map(([k,l,n])=>{
                const on = filterType===k;
                return (
                  <button key={k} onClick={()=>setFilterType(k)} style={{
                    minWidth:0,padding:"6px 4px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:1,
                    background:on?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:SURFACE,color:on?(BTN_TX||"#fff"):TEXT,border:`1px solid ${on?"transparent":BORDER}`}}>
                    <span style={{fontSize:16,fontWeight:900,lineHeight:1.1}}>{n}</span>
                    <span style={{fontSize:"min(11px, 3vw)",fontWeight:700,opacity:on?1:0.75,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Кількість · сортування · додати */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <label style={{display:"flex",minWidth:0,position:"relative"}} aria-label="Сортування">
            <span aria-hidden style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:DIM,pointerEvents:"none"}}>⇅</span>
            <select value={sortMode} onChange={e=>setSortMode(e.target.value)} style={{width:"100%",minWidth:0,height:38,borderRadius:12,border:`1px solid ${BORDER}`,background:SURFACE,color:TEXT,fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"0 8px 0 28px",colorScheme:"dark"}}>
              {[["name","Алфавіт"],["lastBooking","Останні записи"],["createdAt","Реєстрація"],["lessons","К-сть записів"]].map(([k,l])=><option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <button onClick={()=>setShowNew(true)} aria-label="Додати клієнта" style={{height:38,padding:"0 12px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:800,
            background:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,color:BTN_TX||"#fff"}}>+ Клієнт</button>
        </div>

        <div className="pc-grid">
        {list.map(s=>(
          <StudentCard key={s.id} s={s} st={cStats[s.id]} onSelect={s=>setDetailStudent(s)} settings={settings} />
        ))}
        </div>

        {loading && (
          <div style={{textAlign:"center",padding:"40px 20px",color:FAINT,fontSize:13}}>
            <div style={{width:24,height:24,border:`2px solid ${ink(0.06)}`,borderTopColor:ACCENT,borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 10px"}}/>
            Завантаження…
          </div>
        )}
        {!loading && list.length===0 && (
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{opacity:.5,marginBottom:8,display:"flex",justifyContent:"center"}}><MetalIcon name="users" size={44}/></div>
            <div style={{fontSize:14,fontWeight:700,color:DIM}}>{search?"Нікого не знайдено":"Ще немає клієнтів"}</div>
          </div>
        )}
        <div aria-hidden="true" style={{height:12,flexShrink:0}}/>
      </div>

      {/* New student sheet */}
      {showNew && createPortal(
        <div onClick={()=>setShowNew(false)} style={{
          position:"fixed",inset:0,zIndex:200,background:ink(0.6),
          display:"flex",alignItems:"flex-end",justifyContent:"center",
          backdropFilter:"blur(8px)",
        }}>
          <div className="sheet" onClick={e=>e.stopPropagation()} style={{
            position:"relative",
            width:"100%",background:SHEET||BG_DEEP,
            borderRadius:"28px 28px 0 0",
            boxShadow:`0 -2px 0 ${BORDER}, 0 -16px 50px rgba(0,0,0,0.6)`,
            padding:"12px 16px calc(20px + env(safe-area-inset-bottom))",
            maxHeight:"88vh",overflowY:"auto",
          }}>
            <button aria-label="Закрити" onClick={()=>setShowNew(false)} style={{position:"absolute",top:12,right:14,width:32,height:32,borderRadius:"50%",border:"none",cursor:"pointer",background:"none",color:"#ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,lineHeight:1,padding:0}}><MetalIcon name="cross" size={32}/></button>
            <div style={{width:38,height:4,borderRadius:2,background:ink(0.12),margin:"0 auto 14px"}}/>
            <div style={{fontSize:16,fontWeight:800,color:TEXT,margin:"0 40px 14px",textAlign:"center"}}>Новий клієнт</div>
            <StudentForm
              initial={{name:"",phone:"+380",discount:0,customPrice:"",notes:"",type:"private",isVip:false,noIntervalLimit:false}}
              onSave={createStudent} onCancel={()=>setShowNew(false)} saveLabel="Створити"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Student detail sheet */}
      {liveDetail && createPortal(
        <StudentDetailSheet
          settings={settings}
          s={liveDetail}
          st={cStats[liveDetail.id]}
          onClose={()=>setDetailStudent(null)}
          onUpdate={updateStudent}
          onDelete={deleteStudent}
          onBlock={block}
          autoOpenHistory={autoOpenHistory}
          slotColor={studentColors[liveDetail.id] || null}
          autoColors={settings?.autoStudentColors !== false}
          onColorChange={c=>update(iRef("studentColors"), { [liveDetail.id]: c || null }).catch(()=>{})}
        />,
        document.body
      )}
    </>
  );
}
