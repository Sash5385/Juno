import { useState, useEffect, useContext, useMemo } from "react";
import { createPortal } from "react-dom";
import { ref, onValue, update, push, remove, get } from "firebase/database";
import { db } from "../firebase";

import { ThemeContext } from "../theme.js";
import { UICss, Field, Btn as UIBtn, useFX, useBackClose } from "../ui";
import { makePalette } from "./id4drive-services";

const M = ["","Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
const fmtS = d => { if(!d) return "—"; const [,m,day]=d.split("-"); return `${parseInt(day)} ${M[parseInt(m)]}`; };
const navTo = tab => window.dispatchEvent(new CustomEvent("id4drive-nav", {detail:tab}));

// Мітки поля "Досвід водіння" — те саме, що учень бачить у себе в анкеті
// (webID4client/src/pages/cabinet/ProfileTab.jsx), тут лише для показу адміну.
const EXPERIENCE_LABELS = {
  no_license: "Не маю посвідчення, збираюсь складати іспит",
  has_license: "Маю посвідчення, не маю досвіду водіння",
  novice: "Початківець",
  basic: "Базовий",
  licensed: "З правами",
};

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
        <Field label="Знижка ₴/год"  value={d.discount||""} onChange={v=>upd("discount",v.replace(/[^\d]/g,""))} placeholder="0" type="text" inputMode="numeric" style={{marginBottom:0}}/>
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
      <Field label="Індивідуальна фікс. ціна ₴/год" value={d.customPrice||""} onChange={v=>upd("customPrice",v.replace(/[^\d]/g,""))} placeholder="Стандартна ціна послуги" type="text" inputMode="numeric" style={{marginBottom:0}}/>
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

// ─── STUDENT CARD (colorway card) ────────────────────────────────
function StudentCard({ s, onSelect, settings }) {
  const theme = useContext(ThemeContext);
  const { BG_DEEP, GREEN, GOLD, RED } = theme;
  const { shade, glow } = useFX();
  // Колір картки учня — той самий, що обраний для послуги цього типу
  // (Автошкола/Приватний) на вкладці «Послуги», а не фіксований GREEN/GOLD.
  const PALETTE = makePalette(theme);
  const colorOf = id => PALETTE.find(p=>p.id===id)?.color || GREEN;
  const matchedSvc = (settings?.services || []).find(sv => sv.type === s.type && sv.active)
                   || (settings?.services || []).find(sv => sv.type === s.type);
  const typeColor = matchedSvc ? colorOf(matchedSvc.colorId) : (s.type === "school" ? GREEN : GOLD);
  const typeLabel = s.type === "school" ? "Автошкола" : "Приватний";
  const ini       = s.name.split(" ").map(w=>w[0]).slice(0,2).join("");
  const barColor  = s.blocked ? RED : typeColor;

  return (
    <div
      onClick={() => onSelect(s)}
      style={{
        position:"relative",overflow:"hidden",borderRadius:13,cursor:"pointer",
        padding:"22px 11px 21px",display:"flex",alignItems:"center",gap:9,
        background:`linear-gradient(155deg,color-mix(in srgb,${barColor} 48%,${BG_DEEP}) 0%,color-mix(in srgb,${barColor} 16%,${BG_DEEP}) 100%)`,
        border:`1px solid color-mix(in srgb,${barColor} 42%,transparent)`,
        boxShadow:`-2px 5px 13px ${shade(0.4)},inset 1px 1px 0 ${glow(0.15)}`,
        opacity:s.blocked?0.85:1,
      }}
    >
      <div style={{position:"absolute",pointerEvents:"none",top:0,right:"6%",width:"55%",height:"45%",zIndex:1,
        background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.18) 0%,transparent 65%)"}}/>

      <div style={{position:"relative",zIndex:2,width:34,height:34,borderRadius:11,flexShrink:0,
        background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:12,fontWeight:900,color:"#fff"}}>{ini}</div>

      <div style={{position:"relative",zIndex:2,flex:1,minWidth:0}}>
        <div style={{fontSize:12.5,fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {s.isVip && "👑 "}{s.name}{s.blocked && <span style={{fontSize:9,marginLeft:6}}>🚫</span>}
        </div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:700,marginTop:1}}>{typeLabel}</div>
      </div>

      <button onClick={e=>{e.stopPropagation();navTo("chats");}} style={{position:"relative",zIndex:2,background:"rgba(0,0,0,0.25)",border:"none",borderRadius:8,cursor:"pointer",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {ICONS.chat}
      </button>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" style={{position:"relative",zIndex:2,flexShrink:0}}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  );
}

// ─── STUDENT DETAIL SHEET ────────────────────────────────────────
const MANEUVER_LABELS = { rozvorot:"Розворот", parking90:"Паркування 90", parking45:"Паркування 45" };

function StudentDetailSheet({ s, onClose, onUpdate, onDelete, onBlock, onRemoveBadge, autoOpenHistory }) {
  const { BG_DEEP, SURF_HI, SURFACE, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, GOLD, RED, SO, SI } = useContext(ThemeContext);
  const { shade, glow, ink } = useFX();
  const [closing,      setClosing]     = useState(false);
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
    get(ref(db, `bookings/${s.id}`)).then(snap => {
      const data = snap.val() || {};
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
    return { count: attended.length, hours: totalMin / 60 };
  })();

  // Перехід із модалки запису ("Історія") — розгорнути історію одразу при відкритті картки
  useEffect(() => {
    if (autoOpenHistory && s && !historyOpen) toggleHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenHistory, s?.id]);

  // Посилання-запрошення: учень переходить по ньому, реєструється сам —
  // Cloud Function onNewStudentRegistered (webid4/functions/index.js)
  // зливає знижку/фікс.ціну/нотатки/години з цієї (створеної вручну)
  // картки у щойно зареєстрований акаунт учня.
  const generateInvite = async () => {
    if (inviteGenerating) return;
    setInviteGenerating(true); setInviteError(null);
    try {
      const inviteRef = await push(ref(db, "invites"), { studentKey: s.id, createdAt: Date.now() });
      setInviteLink(`https://id4drive.pro/auth?invite=${inviteRef.key}`);
      setInviteOpen(true);
    } catch (e) {
      setInviteError("Помилка: " + e.message);
    } finally {
      setInviteGenerating(false);
    }
  };

  // Персональне повідомлення учню: пишемо запит у adminPush/{id}, cloud function onAdminPush
  // читає токен учня й шле FCM (плюс внутрішнє сповіщення в NotifTab).
  const sendPushToStudent = async () => {
    if (!pushBody.trim() || pushSending) return;
    setPushSending(true); setPushError(null);
    try {
      await push(ref(db, "adminPush"), {
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
  const typeLabel = s.type === "school" ? "Автошкола" : "Приватний";
  const phone     = (s.phone||"").replace(/\D/g,"");
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
            width:"100%",maxWidth:480,
            background:`linear-gradient(165deg,color-mix(in srgb,${barColor} 24%,${BG_DEEP}) 0%,${BG_DEEP} 60%)`,
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
              <div style={{fontSize:11,color:typeColor,fontWeight:700,marginTop:2}}>{typeLabel}</div>
            </div>
            <div onClick={_close} style={{
              width:28,height:28,borderRadius:8,background:"rgba(239,68,68,0.18)",
              display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",color:"#ef4444",fontSize:14,fontWeight:800,userSelect:"none",flexShrink:0,
            }}>✕</div>
          </div>

          {/* Body (scrollable) */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 16px calc(28px + env(safe-area-inset-bottom))",display:"flex",flexDirection:"column",gap:10}}>

            {editMode ? (
              <StudentForm
                initial={{name:s.name,phone:s.phone,discount:s.discount??0,customPrice:s.customPrice??"",notes:s.notes||"",type:s.type,isVip:s.isVip||false,noIntervalLimit:s.noIntervalLimit||false}}
                onSave={patch=>{
                  onUpdate(s.id,{...patch, customPrice:patch.customPrice?Number(patch.customPrice):null});
                  setEditMode(false);
                }}
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
            ) : pushOpen ? (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:13,fontWeight:800,color:GOLD}}>📢 Повідомлення учню: {s.name}</div>
                <input value={pushTitle} onChange={e=>{setPushTitle(e.target.value);setPushSent(false);}} placeholder="Заголовок"
                  style={{background:glow(0.04),border:`1px solid ${BORDER}`,outline:"none",color:TEXT,fontSize:13,padding:"9px 12px",borderRadius:10,boxShadow:SI,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
                <textarea value={pushBody} onChange={e=>{setPushBody(e.target.value);setPushSent(false);}} placeholder="Текст сповіщення" rows={3}
                  style={{background:glow(0.04),border:`1px solid ${BORDER}`,outline:"none",color:TEXT,fontSize:13,padding:"9px 12px",borderRadius:10,boxShadow:SI,width:"100%",boxSizing:"border-box",fontFamily:"inherit",resize:"vertical"}}/>
                {pushError && <div style={{fontSize:12,color:"#fca5a5"}}>{pushError}</div>}
                {pushSent && <div style={{fontSize:12,fontWeight:700,color:GREEN}}>✓ Надіслано</div>}
                <div style={{display:"flex",gap:7}}>
                  <button disabled={!pushBody.trim()||pushSending} onClick={sendPushToStudent}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:(!pushBody.trim()||pushSending)?"default":"pointer",opacity:(!pushBody.trim()||pushSending)?0.5:1,background:`linear-gradient(145deg,${GOLD}cc,${GOLD}88)`,color:"#1a1a1a",fontSize:13,fontWeight:800,boxShadow:SO,fontFamily:"inherit"}}>{pushSending?"…":"Надіслати"}</button>
                  <button onClick={()=>{setPushOpen(false);setPushSent(false);setPushError(null);}}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Назад</button>
                </div>
              </div>
            ) : inviteOpen ? (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:13,fontWeight:800,color:GOLD}}>🔗 Запросити: {s.name}</div>
                <div style={{fontSize:11,color:DIM,lineHeight:1.5}}>Учень переходить за посиланням, сам реєструється — знижка/фікс.ціна/нотатки з цієї картки автоматично перенесуться на його акаунт.</div>
                <div style={{background:glow(0.04),border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 12px",fontSize:12,color:TEXT,wordBreak:"break-all"}}>{inviteLink}</div>
                {inviteError && <div style={{fontSize:12,color:"#fca5a5"}}>{inviteError}</div>}
                <div style={{display:"flex",gap:7}}>
                  <button onClick={()=>navigator.clipboard?.writeText(inviteLink).catch(()=>{})}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${GOLD}cc,${GOLD}88)`,color:"#1a1a1a",fontSize:13,fontWeight:800,boxShadow:SO,fontFamily:"inherit"}}>Копіювати</button>
                  <button onClick={()=>{window.location.href=`viber://forward?text=${encodeURIComponent(inviteLink)}`;}}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Вайбер</button>
                  <button onClick={()=>{window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}`,"_blank");}}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Телеграм</button>
                </div>
                <button onClick={()=>{setInviteOpen(false);setInviteError(null);}}
                  style={{padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:DIM,fontSize:13,fontWeight:700,boxShadow:SO,fontFamily:"inherit"}}>Назад</button>
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
                    <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Знижка/год</div>
                    <div style={{fontSize:18,fontWeight:900,color:s.discount>0?GOLD:DIM}}>{s.discount||0}₴</div>
                  </div>
                </div>

                {/* Individual fixed price — показуємо тільки якщо задана */}
                {s.customPrice > 0 && (
                  <div style={{background:"rgba(234,179,8,0.10)",border:"1px solid rgba(234,179,8,0.35)",borderRadius:10,padding:"9px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#eab308"}}>💰 Індивідуальна ціна</div>
                    <div style={{fontSize:14,fontWeight:900,color:"#eab308"}}>{s.customPrice}₴/год</div>
                  </div>
                )}

                {/* Registration date */}
                {s.createdAt && (() => {
                  const d = new Date(s.createdAt);
                  return (
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",gap:5,padding:"0 2px"}}>
                      <span>📅</span>
                      <span>Реєстрація: {d.getDate()} {M[d.getMonth()+1]} {d.getFullYear()}</span>
                    </div>
                  );
                })()}

                {/* Type + progress */}
                <div style={{background:glow(0.04),borderRadius:10,padding:"10px 12px",border:`1px solid ${BORDER}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:s.type==="school"?9:0}}>
                    <span style={{fontSize:11,fontWeight:800,color:typeColor}}>{typeLabel}</span>
                    {s.type==="school" && <span style={{fontSize:10,color:FAINT}}>· {s.hours+(s.hoursOffset||0)}/40 год</span>}
                  </div>
                  {s.type==="school" && <Progress hours={s.hours} offset={s.hoursOffset||0}/>}
                </div>

                {/* Driving experience — заповнюється учнем в анкеті реєстрації */}
                {s.experience && (
                  <div style={{background:glow(0.04),borderRadius:10,padding:"9px 12px",border:`1px solid ${BORDER}`}}>
                    <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Досвід водіння</div>
                    <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{EXPERIENCE_LABELS[s.experience]||s.experience}</div>
                  </div>
                )}

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
                  <ActBtn icon={ICONS.bell}     label="Повідомлення" onClick={()=>{setPushOpen(true);setPushSent(false);setPushError(null);}} color={GOLD}/>
                  <ActBtn icon={ICONS.link}     label="Запросити"  onClick={generateInvite} color={GOLD}/>
                  <ActBtn icon={ICONS.history}  label="Історія"    onClick={toggleHistory} color={BLUE}/>
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

                {/* Filming/video consent */}
                <div style={{display:"flex",alignItems:"center",gap:10,borderRadius:10,padding:"10px 13px",background:glow(0.04),border:`1px solid ${BORDER}`}}>
                  <span style={{fontSize:16,lineHeight:1}}>🎬</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:TEXT}}>Згода на зйомку відео/аудіо</div>
                    <div style={{fontSize:10,color:FAINT,marginTop:2}}>Вказано учнем при реєстрації</div>
                  </div>
                  <span style={{
                    fontSize:11,fontWeight:800,padding:"3px 9px",borderRadius:7,
                    color:s.filmingConsent===undefined?FAINT:(s.filmingConsent?GREEN:RED),
                    background:s.filmingConsent===undefined?glow(0.06):(s.filmingConsent?`${GREEN}1a`:`${RED}1a`),
                  }}>{s.filmingConsent===undefined?"Не вказано":(s.filmingConsent?"Так":"Ні")}</span>
                </div>

                {/* Маневри — статистика спроб/успіху */}
                {Object.keys(s.maneuverCounts||{}).length > 0 && (
                  <div style={{background:glow(0.04),borderRadius:10,padding:"10px 12px",border:`1px solid ${BORDER}`}}>
                    <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🚗 Маневри</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {Object.entries(MANEUVER_LABELS).filter(([key])=>s.maneuverCounts[key]).map(([key,label])=>{
                        const attempts = s.maneuverCounts[key] || 0;
                        const success = s.maneuverSuccessCounts?.[key] || 0;
                        const pct = attempts ? Math.round(success/attempts*100) : 0;
                        return (
                          <div key={key} style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{flex:1,fontSize:12,fontWeight:700,color:TEXT}}>{label}</div>
                            <div style={{fontSize:11,fontWeight:800,color: pct>=70?GREEN:pct>=40?GOLD:RED}}>{success}/{attempts} ({pct}%)</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Медалі — видаються за конкретний урок у модалці бронювання */}
                <div style={{background:glow(0.04),borderRadius:10,padding:"10px 12px",border:`1px solid ${BORDER}`}}>
                  <div style={{fontSize:9,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🏅 Медалі</div>
                  {Object.keys(s.badges||{}).length === 0 ? (
                    <div style={{fontSize:11,color:FAINT}}>Ще немає медалей</div>
                  ) : (
                    <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                      {Object.entries(s.badges).sort((a,b)=>(b[1].awardedAt||0)-(a[1].awardedAt||0)).map(([bid,b])=>(
                        <div key={bid} onClick={()=>onRemoveBadge(s.id,bid)} title="Тап — прибрати" style={{
                          display:"flex",alignItems:"center",gap:5,padding:"5px 9px",borderRadius:20,
                          background:`${GOLD}18`,border:`1px solid ${GOLD}44`,cursor:"pointer",
                        }}>
                          <span style={{fontSize:14}}>{b.icon}</span>
                          <span style={{fontSize:11,fontWeight:700,color:TEXT}}>{b.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                {s.notes && (
                  <div style={{background:glow(0.04),borderRadius:10,padding:"9px 12px",border:`1px solid ${BORDER}`,fontSize:12,color:DIM,lineHeight:1.5}}>📝 {s.notes}</div>
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

      {/* Історія занять — окрема модалка (таймлайн з тривалістю і сумою годин) */}
      {historyOpen && createPortal(
        <div onClick={()=>setHistoryOpen(false)} style={{
          position:"fixed",inset:0,zIndex:260,
          background:shade(0.55),backdropFilter:"blur(8px)",
          display:"flex",alignItems:"flex-end",justifyContent:"center",
        }}>
          <div className="sheet" onClick={e=>e.stopPropagation()} style={{
            width:"100%",maxWidth:480,
            background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${glow(0.08)},0 -16px 60px ${shade(0.8)}`,
            maxHeight:"85vh",overflowY:"auto",
            padding:"12px 16px calc(20px + env(safe-area-inset-bottom))",
            boxSizing:"border-box",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:glow(0.15),margin:"0 auto 14px"}}/>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:800,color:TEXT}}>Історія занять</div>
              <div onClick={()=>setHistoryOpen(false)} style={{
                width:26,height:26,borderRadius:8,background:"rgba(239,68,68,0.18)",
                display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",color:"#ef4444",fontSize:13,fontWeight:800,flexShrink:0,
              }}>✕</div>
            </div>

            {historyLoading ? (
              <div style={{textAlign:"center",padding:"30px 0",color:FAINT,fontSize:12}}>Завантаження…</div>
            ) : (history||[]).length > 0 ? (
              <>
                <div style={{display:"flex",gap:8,marginBottom:16}}>
                  <div style={{flex:1,borderRadius:12,padding:"10px 8px",textAlign:"center",background:`linear-gradient(155deg,color-mix(in srgb,${GREEN} 30%,${BG_DEEP}),${BG_DEEP})`}}>
                    <div style={{fontSize:19,fontWeight:900,color:GREEN}}>{Number.isInteger(historyStats.hours)?historyStats.hours:historyStats.hours.toFixed(1)}</div>
                    <div style={{fontSize:8.5,color:DIM,fontWeight:700,marginTop:2}}>годин пройдено</div>
                  </div>
                  <div style={{flex:1,borderRadius:12,padding:"10px 8px",textAlign:"center",background:`linear-gradient(155deg,color-mix(in srgb,${BLUE} 30%,${BG_DEEP}),${BG_DEEP})`}}>
                    <div style={{fontSize:19,fontWeight:900,color:BLUE}}>{historyStats.count}</div>
                    <div style={{fontSize:8.5,color:DIM,fontWeight:700,marginTop:2}}>занять відвідано</div>
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
                          <span style={{fontSize:9.5,fontWeight:800,padding:"2px 8px",borderRadius:20,flexShrink:0,background:`${dotColor}22`,color:dotColor}}>{fmtHours(getDurMin(b))}</span>
                        </div>
                        <div style={{fontSize:10.5,color:DIM,marginTop:2}}>{b.serviceName||b.svc||"—"} · {statusLabel}</div>
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
export default function StudentsView({ studentJump, onStudentJumpHandled, bookings=[], settings } = {}) {
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
  const [sortMode,     setSortMode]     = useState("name");
  const [loading,      setLoading]      = useState(true);
  const [showNew,      setShowNew]      = useState(false);
  const [autoOpenHistory, setAutoOpenHistory] = useState(false);
  useBackClose(showNew, () => setShowNew(false));

  // Перехід із модалки запису в розкладі ("Профіль"/"Історія") — відкриваємо
  // картку учня, щойно список учнів завантажений
  useEffect(() => {
    if (!studentJump) return;
    const stu = students.find(x => x.id === studentJump.uid);
    if (!stu) return;
    setDetailStudent(stu);
    setAutoOpenHistory(!!studentJump.openHistory);
    onStudentJumpHandled?.();
  }, [studentJump, students]);

  useEffect(() => {
    const unsub = onValue(ref(db, "users"), snap => {
      const data = snap.val() || {};
      setStudents(Object.entries(data).map(([uid, u]) => {
        const p = u.profile || {};
        return {
          id:uid, name:p.name||u.name||"Учень", phone:p.phone||u.phone||"",
          type:p.type||u.type||"private",
          hours:u.hours||0, hoursOffset:u.hoursOffset||0,
          discount:u.discount||0, customPrice:u.customPrice??null, notes:u.notes||"", blocked:u.blocked||false, isVip:u.isVip||false,
          noIntervalLimit:u.noIntervalLimit||false,
          filmingConsent:p.filmingConsent,
          experience:p.experience||u.experience||null,
          createdAt:p.createdAt||u.createdAt||null,
          maneuverCounts:u.maneuverCounts||{}, maneuverSuccessCounts:u.maneuverSuccessCounts||{},
          badges:u.badges||{},
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
    if (next) {
      // Блокування — скасовуємо всі майбутні незавершені записи учня і
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
            const path = `timeslots/${b.date}/slot${hh}${mm}`;
            upd[`${path}/available`] = true; upd[`${path}/time`] = `${hh}:${mm}`; upd[`${path}/phantom`] = null;
          }
          update(ref(db,'/'), upd).catch(()=>{});
        }
        const ks = [...new Set([b._fbKey, b.id].filter(Boolean))];
        ks.forEach(k => update(ref(db, `bookings/${id}/${k}`),
          { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
      });
      get(ref(db,"queue")).then(snap=>{
        const q = snap.val() || {};
        Object.entries(q).forEach(([slotKey, sq]) => {
          if (sq?.entries?.[id]) remove(ref(db,`queue/${slotKey}/entries/${id}`)).catch(()=>{});
        });
      }).catch(()=>{});
    }
  };
  const updateStudent = (id,patch) => {
    setStudents(ss=>ss.map(x=>x.id===id?{...x,...patch}:x));
    update(ref(db,`users/${id}`),patch).catch(()=>{});
  };
  const deleteStudent = id => {
    setStudents(ss=>ss.filter(x=>x.id!==id));
    remove(ref(db,`users/${id}`)).catch(()=>{});
  };
  const removeBadge = (id, badgeId) => {
    remove(ref(db,`users/${id}/badges/${badgeId}`)).catch(()=>{});
  };
  const createStudent = async (data) => {
    const newRef = await push(ref(db,"users"),{
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

  const q    = search.toLowerCase();
  const list = students
    .filter(s=>(!q||(s.name||"").toLowerCase().includes(q)||(s.phone||"").includes(q))&&(filterType==="all"||s.type===filterType))
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

        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {[["name","Алфавіт"],["lastBooking","Останні записи"],["createdAt","Реєстрація"],["lessons","К-сть уроків"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSortMode(k)} style={{
              flexShrink:0,padding:"8px 12px",borderRadius:11,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap",
              background:sortMode===k?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
              color:sortMode===k?"#fff":DIM,boxShadow:SO,
            }}>{l}</button>
          ))}
        </div>

        {list.map(s=>(
          <StudentCard key={s.id} s={s} onSelect={s=>setDetailStudent(s)} settings={settings} />
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
      {showNew && createPortal(
        <div onClick={()=>setShowNew(false)} style={{
          position:"fixed",inset:0,zIndex:200,background:ink(0.6),
          display:"flex",alignItems:"flex-end",justifyContent:"center",
          backdropFilter:"blur(8px)",
        }}>
          <div className="sheet" onClick={e=>e.stopPropagation()} style={{
            position:"relative",
            width:"100%",maxWidth:480,background:BG_DEEP,
            borderRadius:"24px 24px 0 0",
            boxShadow:`0 -2px 0 ${BORDER}, 0 -16px 50px rgba(0,0,0,0.6)`,
            padding:"12px 16px calc(20px + env(safe-area-inset-bottom))",
            maxHeight:"88vh",overflowY:"auto",
          }}>
            <button onClick={()=>setShowNew(false)} style={{
              position:"absolute",top:10,right:12,zIndex:5,
              width:26,height:26,borderRadius:8,border:"none",cursor:"pointer",
              background:"rgba(239,68,68,0.18)",color:"#ef4444",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:13,fontWeight:800,lineHeight:1,
            }}>✕</button>
            <div style={{width:38,height:4,borderRadius:2,background:ink(0.12),margin:"0 auto 14px"}}/>
            <div style={{fontSize:14,fontWeight:800,color:TEXT,marginBottom:12}}>Новий учень</div>
            <StudentForm
              initial={{name:"",phone:"+380",discount:0,customPrice:"",notes:"",type:"private",isVip:false,noIntervalLimit:false}}
              onSave={createStudent} onCancel={()=>setShowNew(false)} saveLabel="Додати"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Student detail sheet */}
      {liveDetail && createPortal(
        <StudentDetailSheet
          s={liveDetail}
          onClose={()=>setDetailStudent(null)}
          onUpdate={updateStudent}
          onDelete={deleteStudent}
          onBlock={block}
          onRemoveBadge={removeBadge}
          autoOpenHistory={autoOpenHistory}
        />,
        document.body
      )}
    </>
  );
}
