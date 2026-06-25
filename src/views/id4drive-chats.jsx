import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { ref, onValue, push, update, set, increment, remove } from "firebase/database";
import { db } from "../firebase";
import { LangContext } from "../App";

import { ThemeContext } from "../theme.js";
import { UICss, useFX } from "../ui";

const QUICK = ["Підтверджую урок ✅","Урок скасовано ❌","Нагадую: завтра","Будь ласка, підтвердіть","До зустрічі 👋"];
const HUES = [160, 220, 30, 280, 340, 200, 40, 300, 100, 180];
const hueForUid = (uid) => HUES[(uid || "").charCodeAt(0) % HUES.length];
const nowTime = () => new Date().toLocaleTimeString("uk", {hour:"2-digit", minute:"2-digit"});

// ─── AVATAR ──────────────────────────────────────────────────────
const Ava = ({ name, hue, size=36, online, isBroadcast }) => {
  const { GREEN, BG } = useContext(ThemeContext);
  if (isBroadcast) return (
    <div style={{width:size,height:size,borderRadius:size/2,
      background:"linear-gradient(145deg,rgba(168,85,247,0.8),rgba(109,40,217,0.9))",
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.45,flexShrink:0,
      boxShadow:"0 2px 10px rgba(168,85,247,0.5)"}}>📢</div>
  );
  const ini = (name || "?").split(" ").map(w=>w[0]).slice(0,2).join("");
  return (
    <div style={{position:"relative",flexShrink:0}}>
      <div style={{width:size,height:size,borderRadius:size/2,
        background:`linear-gradient(145deg,hsl(${hue},60%,44%),hsl(${(hue+35)%360},70%,28%))`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:size*.3,fontWeight:800,color:"#fff",
        boxShadow:`0 2px 8px hsla(${hue},50%,30%,.5)`}}>{ini}</div>
      {online && <div style={{position:"absolute",bottom:1,right:1,width:9,height:9,borderRadius:5,background:GREEN,border:`2px solid ${BG}`}}/>}
    </div>
  );
};

// ─── CONVERSATION ────────────────────────────────────────────────
function Conversation({ contact, messages, onSend, isBroadcast }) {
  const { BORDER, BG_DEEP, SURF_LO, SURF_HI, SURFACE, FAINT, DIM, GOLD, SI, SO, ACC_HI, ACCENT, TEXT } = useContext(ThemeContext);
  const { shade } = useFX();
  const [text, setText] = useState("");
  const [quick, setQuick] = useState(false);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { setText(""); }, [contact.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);

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
    <div className="drop" style={{display:"flex",flexDirection:"column",borderTop:`1px solid ${borderCol}`,background:BG_DEEP}}>
      {isBroadcast && (
        <div style={{padding:"8px 12px",background:"rgba(168,85,247,0.06)",borderBottom:`1px solid ${borderCol}`}}>
          <div style={{fontSize:11,color:"rgba(168,85,247,0.9)",fontWeight:700,letterSpacing:0.3}}>
            📢 Повідомлення отримають усі учні
          </div>
        </div>
      )}
      <div style={{height:isBroadcast?220:260,overflowY:"auto",padding:"10px 0",display:"flex",flexDirection:"column",gap:3}}>
        {(messages||[]).length === 0 && (
          <div style={{textAlign:"center",padding:"30px 20px",color:FAINT,fontSize:12}}>Немає повідомлень</div>
        )}
        {(messages||[]).map(m => {
          if (m.type==="sys") return (
            <div key={m.id} style={{display:"flex",justifyContent:"center",padding:"2px 0"}}>
              <span className="bubble-sys msg-in" style={{padding:"4px 12px",fontSize:10,color:DIM}}>{m.text}</span>
            </div>
          );
          const isMe = m.from==="admin";
          return (
            <div key={m.id} className="msg-in" style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",padding:"1px 10px"}}>
              <div className={isMe?(m.broadcast?"bubble-broadcast":"bubble-out"):"bubble-in"} style={{maxWidth:"72%",padding:"8px 12px"}}>
                <div style={{fontSize:13,color:isMe?"#fff":TEXT,lineHeight:1.4,wordBreak:"break-word"}}>{m.text}</div>
                <div style={{fontSize:9,color:isMe?"rgba(255,255,255,0.5)":FAINT,marginTop:3,textAlign:"right"}}>{m.time}</div>
              </div>
            </div>
          );
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

      <div style={{padding:"8px 10px",borderTop:`1px solid ${borderCol}`,background:SURF_LO,display:"flex",alignItems:"flex-end",gap:7}}>
        <button onClick={()=>setQuick(v=>!v)} style={{background:"none",border:"none",cursor:"pointer",color:quick?GOLD:FAINT,fontSize:16,padding:"4px",flexShrink:0}}>⚡</button>
        <div style={{flex:1,background:BG_DEEP,borderRadius:11,boxShadow:SI,padding:"8px 12px",display:"flex",alignItems:"flex-end",gap:8}}>
          <textarea ref={taRef} className="msg-input" value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={isBroadcast?"Повідомлення всім учням…":"Повідомлення…"} rows={1}/>
          <button onClick={send} disabled={!text.trim()} style={{
            width:32,height:32,borderRadius:8,border:"none",flexShrink:0,
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
const GENERAL_ID   = "__general__";

export default function ChatsView() {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, SO, SI } = useContext(ThemeContext);
  const { shade, glow, ink } = useFX();

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
  const [generalMsgs,   setGeneralMsgs]   = useState([]);
  const [broadcastMsgs, setBroadcastMsgs] = useState([]);
  const [openId,        setOpenId]        = useState(null);
  const [search,      setSearch]      = useState("");
  const [deletingId,  setDeletingId]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const msgUnsubs = useRef({});

  // ── Load students ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = onValue(ref(db, "users"), snap => {
      const data = snap.val() || {};
      const list = Object.entries(data)
        .map(([uid, u]) => {
          const p = u.profile || {};
          return { id:uid, name:p.name||"", phone:p.phone||"", hue:hueForUid(uid), online:false, unread:0, lastMsg:"", lastTime:"" };
        })
        .filter(c => c.name || c.phone);
      setContacts(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Subscribe messages ────────────────────────────────────────
  useEffect(() => {
    const currentIds = new Set(contacts.map(c => c.id));
    Object.keys(msgUnsubs.current).forEach(uid => {
      if (!currentIds.has(uid)) { msgUnsubs.current[uid]?.(); delete msgUnsubs.current[uid]; }
    });
    contacts.forEach(c => {
      if (msgUnsubs.current[c.id]) return;
      const r = ref(db, `chats/${c.id}`);
      const unsub = onValue(r, snap => {
        const msgs = Object.entries(snap.val()||{}).map(([id,m])=>({...m,id})).sort((a,b)=>(a.ts||0)-(b.ts||0)||(a.id>b.id?1:-1));
        setMessages(prev => ({...prev, [c.id]: msgs}));
        if (msgs.length > 0) {
          const last = msgs[msgs.length-1];
          setContacts(cs => cs.map(ct => ct.id===c.id
            ? {...ct, lastMsg:last.text, lastTime:last.time, unread:openId===c.id?0:(ct.unread||0)+(last.from!=='admin'?1:0)}
            : ct));
        }
      });
      msgUnsubs.current[c.id] = unsub;
    });
    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.length]);

  useEffect(() => () => Object.values(msgUnsubs.current).forEach(u=>u?.()), []);

  // ── General chat ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = onValue(ref(db, "chats/general"), snap => {
      const msgs = Object.entries(snap.val()||{}).map(([id,m])=>({...m,id})).sort((a,b)=>(a.ts||0)-(b.ts||0)||(a.id>b.id?1:-1));
      setGeneralMsgs(msgs);
    });
    return unsub;
  }, []);

  // ── Broadcast history ─────────────────────────────────────────
  useEffect(() => {
    const unsub = onValue(ref(db, "chats/__broadcast__"), snap => {
      const msgs = Object.entries(snap.val()||{}).map(([id,m])=>({...m,id})).sort((a,b)=>(a.ts||0)-(b.ts||0)||(a.id>b.id?1:-1));
      setBroadcastMsgs(msgs);
    });
    return unsub;
  }, []);

  // ── Broadcast free-slot ───────────────────────────────────────
  const applyFreeSlotBroadcast = useCallback((msg, time) => {
    contacts.forEach(c => {
      push(ref(db, `chats/${c.id}`), {from:"admin",text:msg,time,ts:Date.now(),broadcast:true}).catch(()=>{});
    });
    localStorage.removeItem("id4drive-free-slot");
  }, [contacts]);

  useEffect(() => {
    const pending = localStorage.getItem("id4drive-free-slot");
    if (pending) { try { const {msg,time}=JSON.parse(pending); if(msg) applyFreeSlotBroadcast(msg,time); } catch(_){} }
    const handler = e => { const {msg,time}=e.detail||{}; if(msg) applyFreeSlotBroadcast(msg,time); };
    window.addEventListener("id4drive-free-slot", handler);
    return () => window.removeEventListener("id4drive-free-slot", handler);
  }, [applyFreeSlotBroadcast]);

  // ── Actions ───────────────────────────────────────────────────
  const toggle = id => {
    if (deletingId) { setDeletingId(null); return; }
    setOpenId(prev => prev===id ? null : id);
    if (id !== BROADCAST_ID && id !== GENERAL_ID) {
      setContacts(cs => cs.map(c => c.id===id ? {...c,unread:0} : c));
      set(ref(db, `chatMeta/${id}/unreadForAdmin`), 0).catch(()=>{});
    }
  };

  const handleSend = (contactId, text) => {
    const time = nowTime(); const ts = Date.now();
    const msg = {from:"admin",text,time,ts};
    if (contactId === BROADCAST_ID) {
      push(ref(db,"chats/__broadcast__"),{...msg,broadcast:true}).catch(()=>{});
      contacts.forEach(c => {
        push(ref(db,`chats/${c.id}`),{...msg,broadcast:true}).catch(()=>{});
        update(ref(db,`chatMeta/${c.id}`),{unreadForStudent:increment(1),lastMsg:text,lastTs:ts}).catch(()=>{});
      });
    } else if (contactId === GENERAL_ID) {
      push(ref(db,"chats/general"),{from:"admin",uid:"__admin__",name:"Інструктор",text,time,ts}).catch(()=>{});
    } else {
      push(ref(db,`chats/${contactId}`),msg).catch(()=>{});
      update(ref(db,`chatMeta/${contactId}`),{unreadForStudent:increment(1),lastMsg:text,lastTs:ts}).catch(()=>{});
    }
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (deletingId === id) {
      setContacts(cs => cs.filter(c=>c.id!==id));
      if (openId===id) setOpenId(null);
      setDeletingId(null);
      msgUnsubs.current[id]?.(); delete msgUnsubs.current[id];
      setMessages(prev => { const n={...prev}; delete n[id]; return n; });
      remove(ref(db, `chats/${id}`)).catch(()=>{});
      remove(ref(db, `chatMeta/${id}`)).catch(()=>{});
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(di => di===id ? null : di), 3000);
    }
  };

  const filtered      = contacts.filter(c => (c.name||"").toLowerCase().includes(search.toLowerCase()) || (c.phone||"").includes(search));
  const totalUnread   = contacts.reduce((s,c)=>s+c.unread, 0);
  const broadcastOpen = openId === BROADCAST_ID;
  const generalOpen   = openId === GENERAL_ID;

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── SEARCH ── */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
          <div style={{flex:1,background:BG_DEEP,borderRadius:11,boxShadow:SI,padding:"4px 11px",display:"flex",alignItems:"center",gap:7}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук учня…"
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,padding:"8px 0",fontSize:13,fontFamily:"inherit"}}/>
            {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:16,padding:0,lineHeight:1}}>×</button>}
          </div>
          {totalUnread > 0 && (
            <div style={{background:ACCENT,color:"#fff",borderRadius:10,padding:"3px 9px",fontSize:11,fontWeight:800,flexShrink:0,boxShadow:`0 0 8px ${ACCENT}66`}}>
              {totalUnread}
            </div>
          )}
        </div>

        {/* ── BROADCAST ── */}
        {!search && (
          <div style={{background:"linear-gradient(155deg,rgba(168,85,247,0.12),rgba(109,40,217,0.06))",
            borderRadius:13,overflow:"hidden",marginBottom:6,boxShadow:SO,
            border:`1px solid ${broadcastOpen?"rgba(168,85,247,0.4)":"rgba(168,85,247,0.2)"}`}}>
            <div className={`chat-row${broadcastOpen?" broadcast-open":""}`} onClick={()=>toggle(BROADCAST_ID)}
              style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px"}}>
              <div style={{width:4,alignSelf:"stretch",borderRadius:3,background:"linear-gradient(to bottom,#a855f7,#7c3aed)",flexShrink:0}}/>
              <Ava name="Загальний" hue={270} size={36} isBroadcast/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontSize:13,fontWeight:800,color:"rgba(196,148,255,0.95)"}}>📢 Загальний</span>
                  <span style={{fontSize:9,color:"rgba(168,85,247,0.8)",fontWeight:700,letterSpacing:0.3}}>BROADCAST</span>
                </div>
                <div style={{fontSize:11,color:DIM}}>Надіслати повідомлення всім учням</div>
              </div>
              <div style={{flexShrink:0,textAlign:"right"}}>
                <div style={{fontSize:9,color:"rgba(168,85,247,0.6)",fontWeight:700}}>{contacts.length} учнів</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round"
                style={{flexShrink:0,transform:broadcastOpen?"rotate(180deg)":"none",transition:"transform .22s"}}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            {broadcastOpen && (
              <Conversation key={BROADCAST_ID}
                contact={{id:BROADCAST_ID,name:"Загальний",messages:broadcastMsgs}}
                messages={broadcastMsgs} onSend={handleSend} isBroadcast/>
            )}
          </div>
        )}

        {/* ── GENERAL CHAT ── */}
        {!search && (
          <div style={{background:"linear-gradient(155deg,rgba(91,155,255,0.12),rgba(37,99,235,0.06))",
            borderRadius:13,overflow:"hidden",marginBottom:6,boxShadow:SO,
            border:`1px solid ${generalOpen?"rgba(91,155,255,0.4)":"rgba(91,155,255,0.2)"}`}}>
            <div className={`chat-row${generalOpen?" open":""}`} onClick={()=>toggle(GENERAL_ID)}
              style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px"}}>
              <div style={{width:4,alignSelf:"stretch",borderRadius:3,background:"linear-gradient(to bottom,#5b9bff,#2563eb)",flexShrink:0}}/>
              <div style={{width:36,height:36,borderRadius:18,background:"linear-gradient(145deg,#5b9bff,#2563eb)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>👥</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontSize:13,fontWeight:800,color:"rgba(147,197,253,0.95)"}}>👥 Загальний чат</span>
                  <span style={{fontSize:9,color:"rgba(91,155,255,0.8)",fontWeight:700,letterSpacing:0.3}}>ГРУПП. ЧАТ</span>
                </div>
                <div style={{fontSize:11,color:DIM}}>
                  {generalMsgs.length > 0 ? generalMsgs[generalMsgs.length-1].text : "Чат учнів між собою"}
                </div>
              </div>
              <div style={{flexShrink:0,textAlign:"right"}}>
                <div style={{fontSize:9,color:"rgba(91,155,255,0.6)",fontWeight:700}}>{generalMsgs.length} повід.</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round"
                style={{flexShrink:0,transform:generalOpen?"rotate(180deg)":"none",transition:"transform .22s"}}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            {generalOpen && (
              <Conversation key={GENERAL_ID}
                contact={{id:GENERAL_ID,name:"Загальний чат"}}
                messages={generalMsgs.map(m=>({...m,from:m.uid==="__admin__"?"admin":"student",text:m.uid==="__admin__"?m.text:`${m.name}: ${m.text}`}))}
                onSend={handleSend}/>
            )}
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div style={{textAlign:"center",padding:"40px",color:FAINT,fontSize:13}}>
            <div style={{width:24,height:24,border:`2px solid ${BORDER}`,borderTopColor:ACCENT,borderRadius:"50%",
              animation:"spin .8s linear infinite",margin:"0 auto 10px"}}/>
            Завантаження учнів…
          </div>
        )}

        {/* ── PERSONAL CHATS ── */}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(c => {
            const isOpen     = openId === c.id;
            const isDeleting = deletingId === c.id;
            const cMsgs      = messages[c.id] || [];
            return (
              <div key={c.id} style={{
                background:`linear-gradient(155deg,${SURF_HI},${SURFACE})`,
                borderRadius:13,overflow:"hidden",boxShadow:SO,
                border:`1px solid ${isDeleting?"rgba(239,68,68,0.5)":isOpen?"rgba(91,155,255,0.25)":BORDER}`,
                transition:"border-color .2s",
              }}>
                <div className={`chat-row${isOpen?" open":""}`} onClick={()=>toggle(c.id)}
                  style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px"}}>
                  <div style={{width:4,alignSelf:"stretch",borderRadius:3,background:`hsl(${c.hue},60%,55%)`,flexShrink:0}}/>
                  <Ava name={c.name} hue={c.hue} size={36} online={c.online}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:13,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name || c.phone}</span>
                    </div>
                    <div style={{fontSize:11,color:DIM,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {c.lastMsg || c.phone || "Немає повідомлень"}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                    <span style={{fontSize:10,color:FAINT}}>{c.lastTime}</span>
                    {c.unread > 0
                      ? <span style={{background:ACCENT,color:"#fff",borderRadius:9,padding:"1px 6px",fontSize:10,fontWeight:800}}>{c.unread}</span>
                      : <span style={{width:8,height:8,borderRadius:4,background:BORDER,display:"inline-block"}}/>
                    }
                  </div>
                  <button onClick={e=>handleDelete(e,c.id)}
                    className={isDeleting?"del-confirm":""}
                    style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",
                      padding:"4px 6px",borderRadius:8,marginLeft:2,
                      color:isDeleting?"#f87171":FAINT,fontSize:isDeleting?11:14,fontWeight:isDeleting?700:400,transition:"color .2s"}}>
                    {isDeleting?"Видалити?":(
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    )}
                  </button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round"
                    style={{flexShrink:0,transform:isOpen?"rotate(180deg)":"none",transition:"transform .22s"}}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>

                {isOpen && (
                  <Conversation key={c.id} contact={c} messages={cMsgs} onSend={handleSend}/>
                )}
              </div>
            );
          })}

          {!loading && filtered.length===0 && (
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:36,opacity:.3,marginBottom:8}}>💬</div>
              <div style={{fontSize:14,fontWeight:700,color:DIM}}>
                {search ? "Нікого не знайдено" : "Немає учнів в системі"}
              </div>
              <div style={{fontSize:12,color:FAINT,marginTop:6}}>Учні з'являться після реєстрації в застосунку</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
