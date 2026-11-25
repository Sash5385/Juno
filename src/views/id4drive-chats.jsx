import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { MetalIcon } from "../MetalIcon";
import { onValue, push, update, set, increment, remove, get } from "firebase/database";
import { iRef, auth, isMasterSession, watchChatMeta, watchChatMetaM } from "../firebase";
import { LangContext } from "../App";
import { DEMO, DEMO_USER } from "../demo/demoMode";

import { ThemeContext } from "../theme.js";
import { UICss, useFX } from "../ui";
import { useConfirm } from "../ConfirmModal";

const QUICK = ["Підтверджую запис ✅","Запис скасовано ❌","Нагадую: завтра","Будь ласка, підтвердіть","До зустрічі 👋"];
const HUES = [160, 220, 30, 280, 340, 200, 40, 300, 100, 180];
// Колір аватарки — хеш усього uid (раніше лише перша літера → майже всі однакові)
const hueForUid = (uid) => { let h = 0; for (const ch of String(uid || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; };
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
// Час у списку: сьогодні — 09:10, учора — «вчора», цього року — 23.11, інакше 23.11.25
const fmtWhen = (ts, time) => {
  if (!ts) return time || "";
  const d = new Date(ts), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (ymdOf(d) === ymdOf(now)) return time || d.toLocaleTimeString("uk", {hour:"2-digit", minute:"2-digit"});
  if (ymdOf(d) === ymdOf(y)) return "вчора";
  const dm = `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`;
  return d.getFullYear() === now.getFullYear() ? dm : `${dm}.${String(d.getFullYear()).slice(2)}`;
};
// Роздільник дня в переписці
const dayLabel = (ts) => {
  const d = new Date(ts), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (ymdOf(d) === ymdOf(now)) return "Сьогодні";
  if (ymdOf(d) === ymdOf(y)) return "Вчора";
  return d.toLocaleDateString("uk-UA", { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
};
// «24 клієнти» / «5 клієнтів» / «1 клієнт»
const klientiv = (n) => { const a = n % 100, b = n % 10; return a > 10 && a < 20 ? `${n} клієнтів` : b === 1 ? `${n} клієнт` : b >= 2 && b <= 4 ? `${n} клієнти` : `${n} клієнтів`; };
const WD = ["нд","пн","вт","ср","чт","пт","сб"];
// Тред чату: "" = «Салон» (chats/{uid}, власник), інакше id майстра (chats_m/{mid}/{uid}). Ключ повідомлень/непрочитаних: uid або "mid/uid".
const tKey = (uid, tk) => tk ? `${tk}/${uid}` : uid;
const chatPath = (uid, tk) => tk ? `chats_m/${tk}/${uid}` : `chats/${uid}`;
const metaPath = (uid, tk) => tk ? `chatMeta_m/${tk}/${uid}` : `chatMeta/${uid}`;
const nowTime = () => new Date().toLocaleTimeString("uk", {hour:"2-digit", minute:"2-digit"});

// ─── AVATAR ──────────────────────────────────────────────────────
const Ava = ({ name, hue, size=36, online, isBroadcast }) => {
  const { GREEN, BG } = useContext(ThemeContext);
  if (isBroadcast) return (
    <MetalIcon name="mega" color="#6d28d9" square size={size}/>
  );
  const ini = (name || "?").split(" ").map(w=>w[0]).slice(0,2).join("");
  return (
    <div style={{position:"relative",flexShrink:0}}>
      <MetalIcon square size={size} color={`hsl(${hue} 70% 38%)`}>{ini}</MetalIcon>
      {online && <div style={{position:"absolute",bottom:1,right:1,width:9,height:9,borderRadius:5,background:GREEN,border:`2px solid ${BG}`}}/>}
    </div>
  );
};

// ─── CONVERSATION ────────────────────────────────────────────────
function Conversation({ contact, messages, onSend, isBroadcast, unreadForStudent = 0 }) {
  const { BORDER, BG_DEEP, SURF_LO, SURF_HI, SURFACE, FAINT, DIM, GOLD, SI, SO, ACC_HI, ACCENT, TEXT } = useContext(ThemeContext);
  const { shade } = useFX();
  const [text, setText] = useState("");
  const [quick, setQuick] = useState(false);
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { setText(""); }, [contact.id]);
  // Скрол лише всередині вікна повідомлень (listRef), а не scrollIntoView —
  // той підіймається по всіх предках і смикав всю сторінку вниз при
  // кожному відкритті діалогу чи новому повідомленні.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!text.trim()) return;
    onSend(contact.id, text.trim());
    setText("");
    taRef.current?.focus();
  };

  const borderCol = isBroadcast ? "rgba(168,85,247,0.2)" : BORDER;
  const sendBg = isBroadcast
    ? "linear-gradient(145deg,rgba(168,85,247,0.9),rgba(109,40,217,0.9))"
    : `linear-gradient(145deg,${ACC_HI},${ACCENT})`;

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,background:BG_DEEP}}>
      {isBroadcast && (
        <div style={{padding:"8px 12px",background:"rgba(168,85,247,0.06)",borderBottom:`1px solid ${borderCol}`}}>
          <div style={{fontSize:11,color:"rgba(168,85,247,0.9)",fontWeight:700,letterSpacing:0.3}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}>
              <MetalIcon name="mega" color="#6d28d9" square size={18}/>
              Повідомлення отримають усі клієнти
            </span>
          </div>
        </div>
      )}
      <div ref={listRef} style={{flex:1,minHeight:0,overflowY:"auto",padding:"10px 0",display:"flex",flexDirection:"column",gap:3}}>
        {(messages||[]).length === 0 && (
          <div style={{textAlign:"center",padding:"30px 20px",color:FAINT,fontSize:12}}>Немає повідомлень</div>
        )}
        {(messages||[]).map((m, i, arr) => {
          // Роздільник дня перед першим повідомленням кожної дати
          const sep = m.ts && (i === 0 || !arr[i-1].ts || ymdOf(new Date(arr[i-1].ts)) !== ymdOf(new Date(m.ts)))
            ? <div key={`d${m.id}`} style={{display:"flex",justifyContent:"center",padding:"8px 0 4px"}}><span style={{fontSize:11,fontWeight:700,color:DIM,padding:"3px 10px",borderRadius:99,background:SURF_HI}}>{dayLabel(m.ts)}</span></div>
            : null;
          if (m.type==="sys") return [sep, (
            <div key={m.id} style={{display:"flex",justifyContent:"center",padding:"2px 0"}}>
              <span className="bubble-sys msg-in" style={{padding:"4px 12px",fontSize:11,color:DIM}}>{m.text}</span>
            </div>
          )];
          const isMe = m.from==="admin";
          // Прочитано клієнтом: останні unreadForStudent повідомлень майстра — ще ні (✓), решта — так (✓✓)
          let ticks = "";
          if (isMe && !isBroadcast && !m.broadcast) {
            const after = arr.slice(i + 1).filter(x => x.from === "admin" && !x.broadcast).length;
            ticks = after < unreadForStudent ? " ✓" : " ✓✓";
          }
          return [sep, (
            <div key={m.id} className="msg-in" style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",padding:"1px 10px"}}>
              <div className={isMe?(m.broadcast?"bubble-broadcast":"bubble-out"):"bubble-in"} style={{maxWidth:"72%",padding:"8px 12px"}}>
                {isMe && m.senderName && !m.broadcast && <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.75)",marginBottom:2}}>{m.senderName}</div>}
                <div style={{fontSize:13,color:isMe?"#fff":TEXT,lineHeight:1.4,wordBreak:"break-word"}}>{m.text}</div>
                <div style={{fontSize:11,color:isMe?"rgba(255,255,255,0.75)":FAINT,marginTop:3,textAlign:"right",whiteSpace:"nowrap"}}>
                  {m.time}{ticks && <span aria-label={ticks.length > 2 ? "Прочитано" : "Надіслано"} style={{marginLeft:3,color:ticks.length > 2 ? "#93c5fd" : "rgba(255,255,255,0.6)",fontWeight:700}}>{ticks.trim()}</span>}
                </div>
              </div>
            </div>
          )];
        })}
        <div ref={bottomRef}/>
      </div>

      {quick && (
        <div style={{display:"flex",gap:6,padding:"6px 10px",overflowX:"auto",borderTop:`1px solid ${borderCol}`}}>
          {QUICK.map((q,i)=>(
            <button key={i} onClick={()=>{setText(q);setQuick(false);taRef.current?.focus();}} style={{
              background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,border:"none",borderRadius:8,
              padding:"5px 10px",cursor:"pointer",color:DIM,fontSize:11,fontWeight:600,
              whiteSpace:"nowrap",boxShadow:SO,fontFamily:"inherit",
            }}>{q}</button>
          ))}
        </div>
      )}

      <div style={{padding:"8px 10px calc(8px + env(safe-area-inset-bottom, 0px))",borderTop:`1px solid ${borderCol}`,background:SURF_LO,display:"flex",alignItems:"flex-end",gap:7}}>
        <button onClick={()=>setQuick(v=>!v)} aria-label="Швидкі відповіді" style={{background:"none",border:"none",cursor:"pointer",color:quick?GOLD:FAINT,fontSize:16,width:32,height:32,padding:0,flexShrink:0}}><MetalIcon name="bolt" size={24}/></button>
        <div style={{flex:1,background:BG_DEEP,borderRadius:10,boxShadow:SI,padding:"8px 12px",display:"flex",alignItems:"flex-end",gap:8}}>
          <textarea ref={taRef} className="msg-input" value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={isBroadcast?"Повідомлення всім клієнтам…":"Повідомлення…"} rows={1}/>
          <button onClick={send} disabled={!text.trim()} aria-label="Надіслати" style={{
            width:36,height:36,borderRadius:8,border:"none",flexShrink:0,
            cursor:text.trim()?"pointer":"default",
            background:text.trim()?sendBg:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:text.trim()?`0 3px 10px ${shade(0.2)}`:SO,transition:"all .15s",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
const BROADCAST_ID = "__broadcast__";

export default function ChatsView({ bookings = [], onViewStudent, navTo } = {}) {
  const { SURFACE, SURF_HI, BORDER, TEXT, DIM, FAINT, ACCENT, SO, BTN_TX, BG, BG_DEEP, GREEN } = useContext(ThemeContext);
  const [confirm, confirmNode] = useConfirm();
  const { shade, ink } = useFX();

  const css = `
.bubble-out{
  background:linear-gradient(135deg,#2a5298,#1a3a70);
  border-radius:16px 16px 3px 16px;
  box-shadow:0 2px 8px ${shade(0.3)};
}
.bubble-in{
  background:linear-gradient(135deg,${SURF_HI},${SURFACE});
  border-radius:16px 16px 16px 3px;
  box-shadow:0 2px 8px ${shade(0.2)};
}
.bubble-sys{
  background:${ink(0.07)};
  border-radius:10px;
  border:1px solid ${BORDER};
}
.bubble-broadcast{
  background:linear-gradient(135deg,rgba(168,85,247,0.25),rgba(124,58,237,0.15));
  border-radius:16px 16px 3px 16px;
  border:1px solid rgba(168,85,247,0.3);
}
.chat-row{cursor:pointer;transition:background .12s;user-select:none}
.chat-row:active{background:${ink(0.04)}}
.chat-row.open{background:linear-gradient(135deg,rgba(91,155,255,0.1),rgba(91,155,255,0.04))}
.chat-row.broadcast-open{background:linear-gradient(135deg,rgba(168,85,247,0.12),rgba(124,58,237,0.06))}
.msg-input{background:transparent;border:none;outline:none;color:${TEXT};font-size:13px;resize:none;font-family:inherit;flex:1;padding:0;line-height:1.4;max-height:80px;overflow-y:auto}
@keyframes drop{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
.drop{animation:drop .18s ease both}
@keyframes msg-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
.msg-in{animation:msg-in .15s ease both}
@keyframes del-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.del-confirm{animation:del-shake .25s ease}
`;

  const [contacts,      setContacts]      = useState([]);
  const [messages,      setMessages]      = useState({});
  const [broadcastMsgs, setBroadcastMsgs] = useState([]);
  const [openId,        setOpenId]        = useState(null);
  const [search,      setSearch]      = useState("");
  const [loading,     setLoading]     = useState(true);
  const [unreadMeta,  setUnreadMeta]  = useState({});
  const [stuUnread,   setStuUnread]   = useState({});      // скільки повідомлень майстра клієнт ще не прочитав: { uid | "mid/uid": n }
  const [onlyWaiting, setOnlyWaiting] = useState(false);   // фільтр «Без відповіді»: останнім писав клієнт
  // Салон із кількома майстрами: треди клієнта з майстрами (chats_m). threadMsgs/unreadM — за ключем "mid/uid".
  const [threadMsgs,  setThreadMsgs]  = useState({});
  const [unreadM,     setUnreadM]     = useState({});
  const [mcMap,       setMcMap]       = useState({});      // власник: masterClients { mid: { uid: true } }
  const [staffNames,  setStaffNames]  = useState({});      // { mid: ім'я }
  const [ownerName,   setOwnerName]   = useState("");
  const [filterTk,    setFilterTk]    = useState("");      // власник: "" = усі, інакше id майстра
  const [pickedTk,    setPickedTk]    = useState({});      // { uid: обраний тред }
  const threadUnsubs = useRef({});
  const msgUnsubs = useRef({});
  // Відкриття конкретного чату з картки запису (віяло 💬): uid передається через window.__openChatUid
  const pendingUidRef = useRef(null);
  const toggleRef = useRef(null);
  useEffect(() => { pendingUidRef.current = window.__openChatUid || null; window.__openChatUid = null; }, []);
  // Майстер салону: бачить лише чати зі своїми клієнтами (masterClients), без розсилки і видалення чатів
  const isMaster = isMasterSession();
  const myUid = auth.currentUser?.uid || (DEMO ? DEMO_USER.uid : "");
  const [myName, setMyName] = useState("");
  const [myClients, setMyClients] = useState(null);
  const [err, setErr] = useState("");
  const errTimer = useRef(null);
  const showErr = (m) => { setErr(m); clearTimeout(errTimer.current); errTimer.current = setTimeout(() => setErr(""), 6000); };
  useEffect(() => () => clearTimeout(errTimer.current), []);
  useEffect(() => {
    if (!isMaster) return undefined;
    if (!myUid) { setMyClients(new Set()); return undefined; } // без uid — порожній список, а не вічне завантаження
    get(iRef(`staff/${myUid}/name`)).then(sn => setMyName(String(sn.val() || ""))).catch(() => {});
    return onValue(iRef(`masterClients/${myUid}`), sn => setMyClients(new Set(Object.keys(sn.val() || {}))),
      () => { setMyClients(new Set()); showErr("Немає доступу до чатів. Спробуйте перезайти."); });
  }, [isMaster, myUid]);

  // Власник: індекс masterClients (хто з майстрами має запис) + імена майстрів. Майстер: його тред — завжди chats_m/{його uid}/{клієнт}.
  useEffect(() => {
    if (isMaster || !myUid) return undefined;
    get(iRef("admin_settings/profile/name")).then(sn => setOwnerName(String(sn.val() || ""))).catch(() => {});
    const u1 = onValue(iRef("masterClients"), sn => setMcMap(sn.val() || {}), () => {});
    const u2 = onValue(iRef("staff"), sn => {
      const n = {}; Object.entries(sn.val() || {}).forEach(([id, v]) => { if (v && v.name) n[id] = String(v.name); });
      setStaffNames(n);
    }, () => {});
    return () => { u1(); u2(); };
  }, [isMaster, myUid]);
  const mcPairs = isMaster
    ? [...(myClients || [])].map(uid => [myUid, uid])
    : Object.entries(mcMap).flatMap(([mid, byUid]) => Object.keys(byUid || {}).map(uid => [mid, uid]));
  const mcKey = mcPairs.map(p => p.join("/")).join(",");
  const masterIds = isMaster ? [] : Object.keys(mcMap).filter(mid => Object.keys(mcMap[mid] || {}).length);
  // Треди клієнта: власник — «Салон» + кожен майстер, у якого є запис; майстер — лише свій
  const threadsOf = (uid) => isMaster ? [myUid] : ["", ...masterIds.filter(mid => mcMap[mid]?.[uid])];
  const threadName = (tk) => tk ? (staffNames[tk] || "Майстер") : "Салон";
  const OWN = "__own"; // фільтр «власник»: лише тред «Салон» (chats/{uid})
  const defaultTk = (uid) => isMaster ? myUid : (pickedTk[uid] ?? (filterTk && filterTk !== OWN && mcMap[filterTk]?.[uid] ? filterTk : ""));
  const unreadOf = (uid, tk) => tk ? (unreadM[tKey(uid, tk)] || 0) : (unreadMeta[uid] || 0);
  // Непрочитані клієнта: за фільтром — лише тред цього майстра, інакше сума всіх тредів
  const unreadRow = (uid) => filterTk ? unreadOf(uid, filterTk === OWN ? "" : filterTk)
    : threadsOf(uid).reduce((s, tk) => s + unreadOf(uid, tk), 0);

  // Лічильник непрочитаних — з chatMeta/{uid}/unreadForAdmin (той самий
  // authoritative-джерело, що й бейдж у BottomNav). Раніше рахували локально
  // в підписці на повідомлення, звіряючись зі значенням openId, захопленим
  // у замиканні при першому підписі — те замикання ніколи не оновлювалось,
  // тому перевірка "чат зараз відкритий" майже завжди була хибною, і бейдж
  // міг знову з'явитись navіть під час читання чату.
  useEffect(() => {
    const unsub = watchChatMeta(data => {
      const map = {};
      const su = {};
      Object.entries(data).forEach(([uid, m]) => { map[uid] = m?.unreadForAdmin || 0; su[uid] = m?.unreadForStudent || 0; });
      setUnreadMeta(map);
      setStuUnread(prev => ({ ...Object.fromEntries(Object.entries(prev).filter(([k]) => k.includes("/"))), ...su }));
    }, () => {});
    const unsubM = watchChatMetaM(data => {
      const map = {};
      const su = {};
      Object.entries(data).forEach(([k, m]) => { map[k] = m?.unreadForAdmin || 0; su[k] = m?.unreadForStudent || 0; });
      setUnreadM(map);
      setStuUnread(prev => ({ ...Object.fromEntries(Object.entries(prev).filter(([k]) => !k.includes("/"))), ...su }));
    }, () => {});
    return () => { unsub(); unsubM(); };
  }, []);

  // ── Load students ─────────────────────────────────────────────
  useEffect(() => {
    if (isMaster && myClients === null) return undefined; // чекаємо список клієнтів майстра
    const unsub = onValue(iRef( "users"), snap => {
      const data = snap.val() || {};
      const list = Object.entries(data)
        .filter(([uid]) => !isMaster || myClients.has(uid))
        .map(([uid, u]) => {
          const p = u.profile || {};
          return { id:uid, name:p.name||"", phone:p.phone||"", hue:hueForUid(uid), online:false, lastMsg:"", lastTime:"", lastTs:0 };
        })
        .filter(c => c.name || c.phone);
      setContacts(list);
      const pu = pendingUidRef.current;
      if (pu && list.some(c => c.id === pu)) { pendingUidRef.current = null; setTimeout(() => toggleRef.current?.(pu), 0); }
      setLoading(false);
    }, () => { setLoading(false); showErr("Не вдалося завантажити клієнтів. Перевірте з'єднання."); });
    return unsub;
  }, [isMaster, myClients]);

  // ── Subscribe messages ────────────────────────────────────────
  useEffect(() => {
    const currentIds = new Set(contacts.map(c => c.id));
    Object.keys(msgUnsubs.current).forEach(uid => {
      if (!currentIds.has(uid)) { msgUnsubs.current[uid]?.(); delete msgUnsubs.current[uid]; }
    });
    if (!isMaster) contacts.forEach(c => {
      if (msgUnsubs.current[c.id]) return;
      const r = iRef( `chats/${c.id}`);
      const unsub = onValue(r, snap => {
        const msgs = Object.entries(snap.val()||{}).map(([id,m])=>({...m,id})).sort((a,b)=>(a.ts||0)-(b.ts||0)||(a.id>b.id?1:-1));
        setMessages(prev => ({...prev, [c.id]: msgs}));
        if (msgs.length > 0) {
          const last = msgs[msgs.length-1];
          setContacts(cs => cs.map(ct => ct.id===c.id
            ? {...ct, lastMsg:last.text, lastTime:last.time, lastTs:last.ts||0, lastFrom:last.from||""}
            : ct));
        }
      }, () => showErr("Немає доступу до чату з цим клієнтом."));
      msgUnsubs.current[c.id] = unsub;
    });
    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.length]);

  useEffect(() => () => { Object.values(msgUnsubs.current).forEach(u=>u?.()); Object.values(threadUnsubs.current).forEach(u=>u?.()); }, []);

  // ── Треди з майстрами: chats_m/{mid}/{uid} ────────────────────
  useEffect(() => {
    const want = new Set(mcPairs.map(p => p.join("/")));
    Object.keys(threadUnsubs.current).forEach(k => {
      if (!want.has(k)) { threadUnsubs.current[k]?.(); delete threadUnsubs.current[k]; }
    });
    mcPairs.forEach(([mid, uid]) => {
      const k = `${mid}/${uid}`;
      if (threadUnsubs.current[k]) return;
      threadUnsubs.current[k] = onValue(iRef(`chats_m/${k}`), snap => {
        const msgs = Object.entries(snap.val()||{}).map(([id,m])=>({...m,id})).sort((a,b)=>(a.ts||0)-(b.ts||0)||(a.id>b.id?1:-1));
        setThreadMsgs(prev => ({...prev, [k]: msgs}));
        if (msgs.length > 0) {
          const last = msgs[msgs.length-1];
          setContacts(cs => cs.map(ct => ct.id===uid && (last.ts||0) >= (ct.lastTs||0)
            ? {...ct, lastMsg:last.text, lastTime:last.time, lastTs:last.ts||0, lastFrom:last.from||""} : ct));
        }
      }, () => showErr("Немає доступу до чату з цим клієнтом."));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcKey]);

  // ── Broadcast history ─────────────────────────────────────────
  useEffect(() => {
    if (isMaster) return undefined;
    const unsub = onValue(iRef( "chats/__broadcast__"), snap => {
      const msgs = Object.entries(snap.val()||{}).map(([id,m])=>({...m,id})).sort((a,b)=>(a.ts||0)-(b.ts||0)||(a.id>b.id?1:-1));
      setBroadcastMsgs(msgs);
    }, () => {});
    return unsub;
  }, [isMaster]);

  // ── Broadcast free-slot ───────────────────────────────────────
  const applyFreeSlotBroadcast = useCallback((msg, time) => {
    contacts.forEach(c => {
      push(iRef( `chats/${c.id}`), {from:"admin",text:msg,time,ts:Date.now(),broadcast:true}).catch(()=>{});
    });
    localStorage.removeItem("id4drive-free-slot");
  }, [contacts]);

  useEffect(() => {
    const pending = localStorage.getItem("id4drive-free-slot");
    if (pending) { try { const {msg,time}=JSON.parse(pending); if(msg) applyFreeSlotBroadcast(msg,time); } catch { /* ignore */ } }
    const handler = e => { const {msg,time}=e.detail||{}; if(msg) applyFreeSlotBroadcast(msg,time); };
    window.addEventListener("id4drive-free-slot", handler);
    return () => window.removeEventListener("id4drive-free-slot", handler);
  }, [applyFreeSlotBroadcast]);

  // ── Actions ───────────────────────────────────────────────────
  // Діалог відкривається на весь екран; системна «Назад» (Android) закриває його, а не застосунок
  const histRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggle = id => {
    setMenuOpen(false);
    setOpenId(prev => prev===id ? null : id);
    if (id !== BROADCAST_ID) markRead(id, defaultTk(id));
  };
  const closeChat = () => { if (histRef.current) { histRef.current = false; window.history.back(); } else setOpenId(null); };
  useEffect(() => {
    if (!openId) return undefined;
    if (!histRef.current) { window.history.pushState({ junoChat: 1 }, ""); histRef.current = true; }
    const onPop = () => { histRef.current = false; setOpenId(null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openId]);
  useEffect(() => () => { if (histRef.current) { histRef.current = false; window.history.back(); } }, []);
  toggleRef.current = toggle;
  // Позначити тред прочитаним (лише його, інші треди клієнта лишаються з лічильниками)
  const markRead = (uid, tk) => {
    if (tk) setUnreadM(m => ({...m, [tKey(uid, tk)]:0}));
    else setUnreadMeta(m => ({...m, [uid]:0}));
    set(iRef(`${metaPath(uid, tk)}/unreadForAdmin`), 0).catch(()=>{});
  };
  const pickThread = (uid, tk) => { setPickedTk(p => ({...p, [uid]: tk})); markRead(uid, tk); };
  const sendFailed = () => showErr("Не вдалося надіслати повідомлення. Перевірте з'єднання або доступ до чату.");

  const handleSend = (contactId, text, tk = "") => {
    const time = nowTime(); const ts = Date.now();
    const msg = {from:"admin",text,time,ts};
    if (isMaster) { msg.masterId = myUid; if (myName) msg.senderName = myName; } // клієнт бачить, хто з майстрів відповів
    else if (tk) { msg.masterId = tk; if (ownerName) msg.senderName = ownerName; } // власник пише в тред майстра — підписуємось власним іменем
    if (contactId === BROADCAST_ID) {
      push(iRef("chats/__broadcast__"),{...msg,broadcast:true}).catch(()=>{});
      contacts.forEach(c => {
        push(iRef(`chats/${c.id}`),{...msg,broadcast:true}).catch(()=>{});
        update(iRef(`chatMeta/${c.id}`),{unreadForStudent:increment(1),lastMsg:text,lastTs:ts}).catch(()=>{});
      });
    } else {
      push(iRef(chatPath(contactId, tk)),msg).catch(sendFailed);
      update(iRef(metaPath(contactId, tk)),{unreadForStudent:increment(1),lastMsg:text,lastTs:ts}).catch(()=>{});
    }
  };

  // Видалити переписку «Салон» з клієнтом — лише з меню діалогу і з підтвердженням (клієнт лишається в списку клієнтів)
  const handleDelete = async (id, name) => {
    if (isMaster) return;
    if (!(await confirm({ title: `Видалити переписку з ${name || "клієнтом"}?`, text: "Усі повідомлення цього чату буде видалено без можливості відновлення.", okLabel: "Видалити", danger: true }))) return;
    closeChat();
    setContacts(cs => cs.map(c => c.id===id ? {...c, lastMsg:"", lastTime:"", lastTs:0, lastFrom:""} : c));
    setMessages(prev => ({...prev, [id]: []}));
    remove(iRef( `chats/${id}`)).catch(()=>{});
    remove(iRef( `chatMeta/${id}`)).catch(()=>{});
  };

  // Активні чати — з непрочитаними та/або нещодавнім листуванням — зверху списку.
  // Без пошуку — лише клієнти з перепискою; пошук знаходить будь-кого, щоб почати новий чат
  const hasChat = (c) => (c.lastTs||0) > 0 || unreadRow(c.id) > 0;
  const filtered      = contacts
    .filter(c => !filterTk || (filterTk === OWN ? (messages[c.id]||[]).length > 0 : mcMap[filterTk]?.[c.id]))
    .filter(c => search ? ((c.name||"").toLowerCase().includes(search.toLowerCase()) || (c.phone||"").includes(search)) : hasChat(c))
    .filter(c => !onlyWaiting || (c.lastFrom && c.lastFrom !== "admin"))
    .sort((a,b) => (unreadRow(b.id)>0)-(unreadRow(a.id)>0) || (b.lastTs||0)-(a.lastTs||0));
  const totalUnread   = filtered.reduce((s,c)=>s+unreadRow(c.id), 0);

  return (
    <>
      <UICss/>
      <style>{css}</style>
      {confirmNode}
      <div style={{fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {err && (
          <div role="alert" style={{marginBottom:9,padding:"9px 12px",borderRadius:14,fontSize:12,fontWeight:600,color:"#fca5a5",background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.35)",overflowWrap:"anywhere"}}>{err}</div>
        )}

        {/* ── SEARCH ── */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
          <div style={{flex:1,background:SURFACE,border:`1px solid ${BORDER}`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:16,padding:"2px 14px",minHeight:48,display:"flex",alignItems:"center",gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук або новий чат…"
              style={{flex:1,minWidth:0,background:"transparent",border:"none",outline:"none",color:TEXT,padding:"11px 0",fontSize:14,fontFamily:"inherit"}}/>
            {search && <button aria-label="Очистити пошук" onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:16,padding:0,lineHeight:1,minWidth:28,minHeight:28}}>×</button>}
          </div>
        </div>

        {/* ── ФІЛЬТРИ: майстри (власник салону) + «Без відповіді» ── */}
        <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:9,paddingBottom:2}}>
          {(!isMaster && masterIds.length > 0 ? ["", OWN, ...masterIds] : [""]).map(tk => {
            const on = filterTk === tk;
            const n = tk ? contacts.reduce((s,c)=>s+unreadOf(c.id, tk === OWN ? "" : tk),0) : 0;
            return (
              <button key={tk||"all"} onClick={()=>setFilterTk(tk)} style={{
                flexShrink:0,minHeight:32,padding:"4px 12px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap",
                background:on?ACCENT:SURFACE,color:on?(BTN_TX||"#fff"):TEXT,border:`1px solid ${on?ACCENT:BORDER}`}}>
                {tk === OWN ? (ownerName || "Салон") : tk ? threadName(tk) : "Усі"}{n > 0 ? ` · ${n}` : ""}
              </button>
            );
          })}
          <button onClick={()=>setOnlyWaiting(v=>!v)} aria-pressed={onlyWaiting} style={{
            flexShrink:0,minHeight:32,padding:"4px 12px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap",
            background:onlyWaiting?GREEN:SURFACE,color:onlyWaiting?"#06210f":TEXT,border:`1px solid ${onlyWaiting?GREEN:BORDER}`}}>
            Без відповіді
          </button>
        </div>

        {/* ── BROADCAST ── */}
        {!search && !isMaster && !onlyWaiting && (
          <div className="chat-row" onClick={()=>toggle(BROADCAST_ID)} style={{
            display:"flex",alignItems:"center",gap:9,padding:"9px 12px",marginBottom:6,
            background:`color-mix(in srgb,#a855f7 26%,transparent)`,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            borderRadius:14,boxShadow:SO,border:`1px solid color-mix(in srgb,#a855f7 38%,transparent)`}}>
            <Ava name="Розсилка" hue={270} size={36} isBroadcast/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:2}}>Розсилка</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.8)"}}>Повідомлення всім клієнтам</div>
            </div>
            <div style={{flexShrink:0,fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:700}}>{klientiv(contacts.length)}</div>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div style={{textAlign:"center",padding:"40px",color:FAINT,fontSize:13}}>
            <div style={{width:24,height:24,border:`2px solid ${BORDER}`,borderTopColor:ACCENT,borderRadius:"50%",
              animation:"spin .8s linear infinite",margin:"0 auto 10px"}}/>
            Завантаження клієнтів…
          </div>
        )}

        {/* ── СПИСОК ЧАТІВ ── */}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(c => {
            const cUnread = unreadRow(c.id);
            const waiting = c.lastFrom && c.lastFrom !== "admin";
            return (
              <div key={c.id} className="chat-row" onClick={()=>toggle(c.id)} style={{
                display:"flex",alignItems:"center",gap:9,padding:"9px 12px",
                background:"rgba(255,255,255,0.06)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
                borderRadius:14,boxShadow:SO,border:`1px solid ${cUnread?"rgba(91,155,255,0.45)":"rgba(255,255,255,0.1)"}`}}>
                <Ava name={c.name} hue={c.hue} size={36} online={c.online}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#fff",overflowWrap:"anywhere",marginBottom:2}}>{c.name || c.phone}</div>
                  <div style={{fontSize:11,color:cUnread?"#fff":"rgba(255,255,255,0.75)",fontWeight:cUnread?600:400,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflowWrap:"anywhere"}}>
                    {c.lastMsg ? `${c.lastFrom === "admin" ? "Ви: " : ""}${c.lastMsg}` : (c.phone || "Почати переписку")}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                  <span style={{fontSize:11,color:cUnread?"#93c5fd":"rgba(255,255,255,0.7)",fontWeight:cUnread?700:400}}>{fmtWhen(c.lastTs, c.lastTime)}</span>
                  {cUnread > 0
                    ? <span style={{background:ACCENT,color:BTN_TX||"#fff",borderRadius:8,padding:"1px 6px",fontSize:11,fontWeight:800}}>{cUnread}</span>
                    : waiting ? <span style={{fontSize:10,fontWeight:700,color:GREEN}}>чекає</span> : null}
                </div>
              </div>
            );
          })}

          {!loading && filtered.length===0 && (
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{opacity:.5,marginBottom:8,display:"flex",justifyContent:"center"}}><MetalIcon name="chat" size={44}/></div>
              <div style={{fontSize:14,fontWeight:700,color:DIM}}>
                {search ? "Нікого не знайдено" : onlyWaiting ? "Усім відповіли" : contacts.length ? "Поки немає переписок" : "Немає клієнтів в системі"}
              </div>
              <div style={{fontSize:12,color:FAINT,marginTop:6}}>
                {contacts.length ? "Щоб написати клієнту, знайдіть його в пошуку" : "Клієнти з'являться після реєстрації в застосунку"}
              </div>
            </div>
          )}
        </div>

        {/* ── ДІАЛОГ НА ВЕСЬ ЕКРАН ── */}
        {openId && (() => {
          const isB = openId === BROADCAST_ID;
          const c = isB ? null : contacts.find(x => x.id === openId);
          if (!isB && !c) return null;
          const tk = isB ? "" : defaultTk(c.id);
          const cMsgs = isB ? broadcastMsgs : ((tk ? threadMsgs[tKey(c.id, tk)] : messages[c.id]) || []);
          const cThreads = isB ? [] : threadsOf(c.id);
          const now = ymdOf(new Date()) + " " + new Date().toTimeString().slice(0, 5);
          const next = isB ? null : bookings
            .filter(b => b.userId === c.id && b.status !== "cancelled" && b.date && `${b.date} ${String(b.time||"").padStart(5,"0")}` >= now)
            .sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`))[0];
          const nextTxt = next ? (() => { const d = new Date(next.date + "T00:00:00"); return `Наступний запис: ${WD[d.getDay()]} ${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")} · ${next.time}`; })() : "";
          const phone = String(c?.phone || "").replace(/[^\d+]/g, "");
          const narrowHdr = window.innerWidth < 380; // вузький екран: без аватарки й телефону в шапці — місце для імені
          const act = { width:narrowHdr?32:36,height:narrowHdr?32:36,borderRadius:12,border:`1px solid ${BORDER}`,background:SURFACE,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,padding:0,textDecoration:"none" };
          return (
            <div role="dialog" aria-label={isB ? "Розсилка" : (c.name || c.phone)} style={{position:"fixed",inset:0,zIndex:1500,display:"flex",flexDirection:"column",background:BG || BG_DEEP}}>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"calc(8px + env(safe-area-inset-top, 0px)) 10px 8px",borderBottom:`1px solid ${BORDER}`,background:SURFACE}}>
                <button onClick={closeChat} aria-label="Назад" style={{...act,border:"none",background:"transparent",fontSize:22,color:TEXT}}>‹</button>
                {narrowHdr ? null : isB ? <Ava name="Розсилка" hue={270} size={34} isBroadcast/> : <Ava name={c.name} hue={c.hue} size={34}/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:TEXT,lineHeight:1.2,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflowWrap:"anywhere"}}>{isB ? "Розсилка" : (c.name || c.phone)}</div>
                  {(isB || !narrowHdr) && <div style={{fontSize:11,color:DIM,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {isB ? `Отримають ${klientiv(contacts.length)}` : (c.phone || "")}
                  </div>}
                </div>
                {!isB && onViewStudent && <button aria-label="Картка клієнта" onClick={()=>{closeChat();setTimeout(()=>onViewStudent(c.id),0);}} style={act}><MetalIcon name="user" size={22}/></button>}
                {!isB && navTo && <button aria-label="Записати" onClick={()=>{window.__junoPendingStudent=c.id;window.__junoPendingNew=Date.now();closeChat();setTimeout(()=>{navTo("schedule");window.dispatchEvent(new CustomEvent("juno:newBooking"));},0);}} style={act}><MetalIcon name="calendar" size={22}/></button>}
                {!isB && phone && <a href={`tel:${phone}`} aria-label="Подзвонити" style={act}><MetalIcon name="phone" size={22}/></a>}
                {!isB && !isMaster && (
                  <div style={{position:"relative",flexShrink:0}}>
                    <button aria-label="Ще дії" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)} style={{...act,width:30,border:"none",background:"transparent",color:TEXT,fontSize:20,fontWeight:800}}>⋮</button>
                    {menuOpen && <>
                      <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:1}}/>
                      <div role="menu" style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:2,minWidth:200,borderRadius:12,border:`1px solid ${BORDER}`,background:BG_DEEP,boxShadow:"0 10px 30px rgba(0,0,0,.5)",padding:4}}>
                        <button role="menuitem" onClick={()=>{setMenuOpen(false);handleDelete(c.id, c.name);}} style={{width:"100%",minHeight:40,textAlign:"left",padding:"0 12px",border:"none",borderRadius:9,background:"transparent",color:"#f87171",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>Видалити переписку</button>
                      </div>
                    </>}
                  </div>
                )}
              </div>
              {nextTxt && (
                <div style={{padding:"6px 14px",fontSize:12,fontWeight:700,color:GREEN,background:`color-mix(in srgb,${GREEN} 10%,transparent)`,borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:6}}>
                  <MetalIcon name="calendar" size={16}/>{nextTxt}
                </div>
              )}
              {cThreads.length > 1 && (
                <div style={{display:"flex",gap:6,overflowX:"auto",padding:"6px 10px",borderBottom:`1px solid ${BORDER}`,background:SURFACE}}>
                  {cThreads.map(t => {
                    const on = t === tk, n = unreadOf(c.id, t);
                    return (
                      <button key={t||"salon"} onClick={()=>pickThread(c.id, t)} style={{
                        flexShrink:0,minHeight:30,padding:"3px 11px",borderRadius:15,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap",
                        background:on?ACCENT:"rgba(255,255,255,0.12)",color:on?(BTN_TX||"#fff"):"#fff",border:"1px solid rgba(255,255,255,0.25)"}}>
                        {threadName(t)}{n > 0 ? ` · ${n}` : ""}
                      </button>
                    );
                  })}
                </div>
              )}
              {isB
                ? <Conversation key={BROADCAST_ID} contact={{id:BROADCAST_ID,name:"Розсилка"}} messages={broadcastMsgs} onSend={handleSend} isBroadcast/>
                : <Conversation key={`${c.id}|${tk}`} contact={c} messages={cMsgs} unreadForStudent={stuUnread[tKey(c.id, tk)] || 0} onSend={(id, text) => handleSend(id, text, tk)}/>}
            </div>
          );
        })()}
      </div>
    </>
  );
}
