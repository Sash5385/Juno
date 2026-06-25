import { useState, useRef, useEffect } from "react";

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

const SO = "6px 6px 16px rgba(0,0,0,0.45),-3px -3px 10px rgba(255,255,255,0.025)";
const SI = "inset 3px 3px 8px rgba(0,0,0,0.4),inset -2px -2px 6px rgba(255,255,255,0.025)";

// ─── CSS ────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
body,html{margin:0;padding:0}

/* bubble tails */
.bubble-out{
  background:linear-gradient(135deg,#2a5298,#1e3a6e);
  border-radius:18px 18px 4px 18px;
  box-shadow:-2px 4px 12px rgba(0,0,0,0.35),inset 1px 1px 0 rgba(255,255,255,0.12);
  position:relative;
}
.bubble-in{
  background:linear-gradient(135deg,${SURF_HI},${SURFACE});
  border-radius:18px 18px 18px 4px;
  box-shadow:-2px 4px 12px rgba(0,0,0,0.3),inset 1px 1px 0 rgba(255,255,255,0.06);
  position:relative;
}
.bubble-system{
  background:rgba(255,255,255,0.04);
  border-radius:12px;
  border:1px solid ${BORDER};
}

/* contact row hover */
.contact-row{transition:background .15s;cursor:pointer}
.contact-row:hover{background:rgba(255,255,255,0.04)}
.contact-row.active{background:linear-gradient(135deg,rgba(91,155,255,0.15),rgba(91,155,255,0.05));border-right:2px solid ${BLUE}}

/* input */
.msg-input{background:transparent;border:none;outline:none;color:${TEXT};font-size:14px;resize:none;font-family:inherit;flex:1;padding:0;line-height:1.4;max-height:96px;overflow-y:auto}

/* icon3d */
.i3{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;position:relative;overflow:hidden;flex-shrink:0;box-shadow:-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2)}
.i3::before{content:'';position:absolute;top:0;right:0;width:60%;height:50%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.35) 0%,transparent 70%);pointer-events:none}
.i3>svg{position:relative;z-index:1}

@keyframes fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.msg-anim{animation:fade-up .18s ease both}

@keyframes reaction-pop{0%{transform:scale(0.5)}70%{transform:scale(1.2)}100%{transform:scale(1)}}
.reaction-pop{animation:reaction-pop .2s ease both}

/* unread badge */
.unread-dot{width:8px;height:8px;border-radius:4px;background:${ACCENT};box-shadow:0 0 6px ${ACCENT}88;flex-shrink:0}
.unread-badge{background:${ACCENT};color:#fff;border-radius:10px;padding:2px 7px;font-size:10px;font-weight:800;box-shadow:0 0 8px ${ACCENT}66;flex-shrink:0}

/* channel chips */
.ch-chip{padding:5px 12px;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:700;transition:all .15s}
`;

// ─── MOCK DATA ───────────────────────────────────────────────────
const CONTACTS = [
  { id:"c1", name:"Марія Коваль",   phone:"+380671234567", avatar:"МК", hue:160,
    channel:"chat", unread:2, online:true,  lastMsg:"Дякую! До зустрічі", lastTime:"15:30",
    messages:[
      {id:"m1",from:"student",text:"Доброго дня! Коли наступний урок?",time:"10:00",status:"read"},
      {id:"m2",from:"instructor",text:"Привіт! Завтра о 10:00 — підтверджую 👍",time:"10:02",status:"read"},
      {id:"m3",from:"student",text:"Чудово, я буду. Чи можна взяти 2 год?",time:"10:05",status:"read"},
      {id:"m4",from:"instructor",text:"Так, 2 год вільно. Записую тебе на 10:00–12:00",time:"10:06",status:"read"},
      {id:"m5",from:"student",text:"Дякую! До зустрічі",time:"15:30",status:"read",reactions:["👍"]},
    ]
  },
  { id:"c2", name:"Іван Петренко",  phone:"+380509876543", avatar:"ІП", hue:220,
    channel:"viber", unread:5, online:false, lastMsg:"Можна перенести на п'ятницю?", lastTime:"13:15",
    messages:[
      {id:"m1",from:"student",text:"Доброго ранку",time:"09:00",status:"read"},
      {id:"m2",from:"instructor",text:"Доброго! Чим можу допомогти?",time:"09:05",status:"read"},
      {id:"m3",from:"student",text:"Можна перенести на п'ятницю?",time:"13:15",status:"delivered"},
      {id:"m4",from:"student",text:"О 14:00 якщо є місце",time:"13:16",status:"delivered"},
      {id:"m5",type:"system",text:"Іван Петренко: Пропустив урок 20.05",time:"вчора"},
    ]
  },
  { id:"c3", name:"Олена Мороз",    phone:"+380631112233", avatar:"ОМ", hue:30,
    channel:"sms",  unread:0, online:false, lastMsg:"Ок, зрозуміла 👌",  lastTime:"вчора",
    messages:[
      {id:"m1",from:"instructor",text:"Нагадую: урок завтра о 9:00 на ТСЦ 8042",time:"вчора 18:00",status:"read"},
      {id:"m2",from:"student",text:"Ок, зрозуміла 👌",time:"вчора 18:05",status:"read"},
    ]
  },
  { id:"c4", name:"Дмитро Сало",    phone:"+380961234567", avatar:"ДС", hue:280,
    channel:"chat", unread:1, online:true,  lastMsg:"Пришли рахунок",    lastTime:"14:00",
    messages:[
      {id:"m1",from:"student",text:"Привіт, коли оплачувати?",time:"13:50",status:"read"},
      {id:"m2",from:"instructor",text:"Можна на місці або на картку",time:"13:55",status:"read"},
      {id:"m3",from:"student",text:"Пришли рахунок",time:"14:00",status:"delivered"},
    ]
  },
  { id:"c5", name:"Юлія Денисюк",   phone:"+380935023739", avatar:"ЮД", hue:340,
    channel:"telegram", unread:0, online:true,  lastMsg:"Супер, чекаю!",      lastTime:"12:00",
    messages:[
      {id:"m1",from:"instructor",text:"Юліє, завтра перший урок! Зустрічаємось о 15:00",time:"12:00",status:"read"},
      {id:"m2",from:"student",text:"Супер, чекаю!",time:"12:01",status:"read",reactions:["🎉","❤️"]},
    ]
  },
];

const QUICK_REPLIES = [
  "Підтверджую урок ✅",
  "Урок скасовано ❌",
  "Нагадую: завтра о {час}",
  "Будь ласка, підтвердіть присутність",
  "Оплата: {ціна} ₴",
  "До зустрічі! 👋",
];

const REACTIONS = ["👍","❤️","😄","🎉","👌","🔥","✅","😮"];

const CHANNEL_ICONS = {
  chat:     { label:"Чат",      color:BLUE,   emoji:"💬" },
  sms:      { label:"SMS",      color:GREEN,  emoji:"📱" },
  viber:    { label:"Viber",    color:PURPLE, emoji:"📲" },
  telegram: { label:"Telegram", color:"#2AABEE", emoji:"✈️" },
};

// ─── HELPERS ────────────────────────────────────────────────────
function Avatar({ name, hue, size=40, online }) {
  return (
    <div style={{position:"relative",flexShrink:0}}>
      <div style={{
        width:size, height:size, borderRadius:size/2,
        background:`linear-gradient(165deg,hsl(${hue},60%,45%),hsl(${hue+30},70%,30%))`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:size*0.3,fontWeight:800,color:"#fff",
        boxShadow:`-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2)`
      }}>
        {name.split(" ").map(w=>w[0]).slice(0,2).join("")}
      </div>
      {online && (
        <div style={{
          position:"absolute",bottom:1,right:1,
          width:10,height:10,borderRadius:5,
          background:GREEN,border:`2px solid ${BG}`,
          boxShadow:`0 0 6px ${GREEN}88`
        }}/>
      )}
    </div>
  );
}

function ChannelBadge({ channel, size=18 }) {
  const ch = CHANNEL_ICONS[channel] || CHANNEL_ICONS.chat;
  return (
    <span style={{
      fontSize:size*0.65, background:`${ch.color}22`,
      color:ch.color, padding:"2px 6px", borderRadius:6,
      fontWeight:700, fontSize:10, whiteSpace:"nowrap"
    }}>{ch.emoji} {ch.label}</span>
  );
}

const fmtStatus = s => s==="read"?"✓✓":s==="delivered"?"✓✓":"✓";
const fmtStatusColor = s => s==="read"?BLUE:DIM;

// ─── CONTACT LIST ────────────────────────────────────────────────
function ContactList({ contacts, activeId, onSelect, search, setSearch }) {
  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );
  const totalUnread = contacts.reduce((s,c)=>s+c.unread,0);

  return (
    <div style={{
      display:"flex",flexDirection:"column",
      background:`linear-gradient(180deg,${SURFACE},${SURF_LO})`,
      borderRight:`1px solid ${BORDER}`,
      height:"100%",overflow:"hidden"
    }}>
      {/* header */}
      <div style={{padding:"14px 12px 10px",borderBottom:`1px solid ${BORDER}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontSize:15,fontWeight:800,color:TEXT,flex:1}}>Чати</span>
          {totalUnread>0 && <span className="unread-badge">{totalUnread}</span>}
        </div>
        {/* search */}
        <div style={{
          display:"flex",alignItems:"center",gap:6,
          background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,
          borderRadius:10,boxShadow:SI,padding:"6px 10px"
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Пошук…"
            style={{background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:12,flex:1}}/>
        </div>
      </div>

      {/* list */}
      <div style={{flex:1,overflowY:"auto"}}>
        {filtered.map(c => (
          <div key={c.id}
            className={`contact-row ${activeId===c.id?"active":""}`}
            onClick={()=>onSelect(c.id)}
            style={{padding:"10px 12px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:8}}
          >
            <Avatar name={c.name} hue={c.hue} size={40} online={c.online}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                <span style={{fontSize:13,fontWeight:700,color:TEXT,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                <span style={{fontSize:10,color:FAINT,flexShrink:0}}>{c.lastTime}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:11,color:DIM,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.lastMsg}</span>
                {c.unread>0
                  ? <span className="unread-badge">{c.unread}</span>
                  : <span className="unread-dot" style={{opacity:0.3}}/>
                }
              </div>
              <div style={{marginTop:3}}>
                <ChannelBadge channel={c.channel}/>
              </div>
            </div>
          </div>
        ))}
        {filtered.length===0 && (
          <div style={{padding:"30px 12px",textAlign:"center",color:FAINT,fontSize:12}}>Нічого не знайдено</div>
        )}
      </div>
    </div>
  );
}

// ─── REACTION PICKER ─────────────────────────────────────────────
function ReactionPicker({ onPick, onClose }) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200}}>
      <div onClick={e=>e.stopPropagation()} style={{
        position:"absolute",bottom:"100%",right:0,
        background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
        borderRadius:16,padding:"8px 10px",
        display:"flex",gap:4,
        boxShadow:`0 -8px 24px rgba(0,0,0,0.5),inset 1px 1px 0 rgba(255,255,255,0.08)`,
        border:`1px solid ${BORDER}`
      }}>
        {REACTIONS.map(r=>(
          <button key={r} onClick={()=>{onPick(r);onClose();}} style={{
            background:"none",border:"none",cursor:"pointer",
            fontSize:22,padding:"2px",borderRadius:8,
            transition:"transform .1s"
          }}
          onMouseEnter={e=>e.target.style.transform="scale(1.3)"}
          onMouseLeave={e=>e.target.style.transform="scale(1)"}
          >{r}</button>
        ))}
      </div>
    </div>
  );
}

// ─── MESSAGE BUBBLE ──────────────────────────────────────────────
function Bubble({ msg, isOut, onReact }) {
  const [hover, setHover] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  if (msg.type==="system") {
    return (
      <div style={{display:"flex",justifyContent:"center",padding:"4px 0"}}>
        <div className="bubble-system msg-anim" style={{padding:"5px 14px",fontSize:11,color:DIM}}>{msg.text}</div>
      </div>
    );
  }

  return (
    <div
      className="msg-anim"
      style={{
        display:"flex",justifyContent:isOut?"flex-end":"flex-start",
        padding:"2px 12px",position:"relative"
      }}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>{setHover(false);}}
    >
      <div style={{maxWidth:"72%",position:"relative"}}>
        {/* hover actions */}
        {hover && (
          <div style={{
            position:"absolute",
            [isOut?"left":"right"]:"100%",
            top:"50%",transform:"translateY(-50%)",
            display:"flex",gap:4,padding:"0 6px",
            zIndex:10
          }}>
            <button onClick={()=>setShowPicker(true)} style={{
              background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              border:"none",borderRadius:8,padding:"5px",cursor:"pointer",
              fontSize:14,boxShadow:SO
            }}>😊</button>
          </div>
        )}

        {/* reaction picker */}
        {showPicker && (
          <div style={{position:"relative"}}>
            <ReactionPicker onPick={r=>onReact(msg.id,r)} onClose={()=>setShowPicker(false)}/>
          </div>
        )}

        {/* bubble */}
        <div className={isOut?"bubble-out":"bubble-in"} style={{padding:"9px 13px"}}>
          {/* image placeholder */}
          {msg.image && (
            <div style={{
              width:"100%",height:120,borderRadius:10,marginBottom:6,
              background:`linear-gradient(135deg,${SURF_HI},${BG_DEEP})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:24
            }}>🖼</div>
          )}
          <div style={{fontSize:13,color:isOut?"#fff":TEXT,lineHeight:1.45,wordBreak:"break-word"}}>{msg.text}</div>
          <div style={{
            display:"flex",alignItems:"center",gap:4,marginTop:4,
            justifyContent:"flex-end"
          }}>
            <span style={{fontSize:10,color:isOut?"rgba(255,255,255,0.55)":FAINT}}>{msg.time}</span>
            {isOut && <span style={{fontSize:11,color:fmtStatusColor(msg.status)}}>{fmtStatus(msg.status)}</span>}
          </div>
        </div>

        {/* reactions */}
        {msg.reactions && msg.reactions.length>0 && (
          <div style={{
            display:"flex",gap:3,marginTop:4,
            justifyContent:isOut?"flex-end":"flex-start",flexWrap:"wrap"
          }}>
            {[...new Set(msg.reactions)].map((r,i)=>(
              <span key={i} className="reaction-pop" style={{
                background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                borderRadius:10,padding:"2px 6px",fontSize:12,
                boxShadow:SO,border:`1px solid ${BORDER}`,
                cursor:"pointer"
              }} onClick={()=>onReact(msg.id,r)}>
                {r} <span style={{fontSize:10,color:DIM}}>{msg.reactions.filter(x=>x===r).length}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CHANNEL PICKER ──────────────────────────────────────────────
function ChannelPicker({ current, onChange }) {
  const [open, setOpen] = useState(false);
  const ch = CHANNEL_ICONS[current] || CHANNEL_ICONS.chat;
  return (
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(v=>!v)} style={{
        background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
        border:"none",borderRadius:10,padding:"7px 10px",cursor:"pointer",
        display:"flex",alignItems:"center",gap:5,
        boxShadow:SO,color:ch.color,fontSize:11,fontWeight:700
      }}>
        {ch.emoji} {ch.label} ▾
      </button>
      {open && (
        <div style={{
          position:"absolute",bottom:"110%",left:0,
          background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
          borderRadius:14,boxShadow:`0 -8px 24px rgba(0,0,0,0.5)`,
          border:`1px solid ${BORDER}`,overflow:"hidden",zIndex:50,minWidth:130
        }}>
          {Object.entries(CHANNEL_ICONS).map(([k,v])=>(
            <button key={k} onClick={()=>{onChange(k);setOpen(false);}} style={{
              width:"100%",padding:"10px 14px",border:"none",cursor:"pointer",
              background:k===current?`rgba(91,155,255,0.1)`:"transparent",
              color:v.color,fontSize:12,fontWeight:700,textAlign:"left",
              display:"flex",alignItems:"center",gap:8,
              borderBottom:`1px solid ${BORDER}`
            }}>
              {v.emoji} {v.label}
              {k===current && <span style={{marginLeft:"auto",color:GREEN}}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── QUICK REPLIES ───────────────────────────────────────────────
function QuickReplies({ onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(v=>!v)} style={{
        background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
        border:"none",borderRadius:10,padding:"7px 10px",cursor:"pointer",
        color:GOLD,fontSize:12,fontWeight:700,boxShadow:SO
      }}>⚡</button>
      {open && (
        <div style={{
          position:"absolute",bottom:"110%",right:0,
          background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
          borderRadius:14,boxShadow:`0 -8px 24px rgba(0,0,0,0.5)`,
          border:`1px solid ${BORDER}`,overflow:"hidden",zIndex:50,minWidth:220
        }}>
          <div style={{padding:"8px 12px",fontSize:10,color:FAINT,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${BORDER}`}}>Швидкі відповіді</div>
          {QUICK_REPLIES.map((r,i)=>(
            <button key={i} onClick={()=>{onSelect(r);setOpen(false);}} style={{
              width:"100%",padding:"9px 14px",border:"none",cursor:"pointer",
              background:"transparent",color:TEXT,fontSize:12,textAlign:"left",
              borderBottom:i<QUICK_REPLIES.length-1?`1px solid ${BORDER}`:"none",
              transition:"background .15s"
            }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >{r}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CHAT PANEL ──────────────────────────────────────────────────
function ChatPanel({ contact, onBack }) {
  const [messages, setMessages] = useState(contact.messages);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState(contact.channel);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);

  const send = () => {
    if (!text.trim()) return;
    const msg = {id:`m${Date.now()}`,from:"instructor",text:text.trim(),time:new Date().toLocaleTimeString("uk",{hour:"2-digit",minute:"2-digit"}),status:"sent"};
    setMessages(m=>[...m,msg]);
    setText("");
    textareaRef.current?.focus();
  };

  const onReact = (msgId, reaction) => {
    setMessages(ms=>ms.map(m=>{
      if (m.id!==msgId) return m;
      const existing = m.reactions||[];
      const has = existing.includes(reaction);
      return {...m, reactions: has ? existing.filter(r=>r!==reaction) : [...existing, reaction]};
    }));
  };

  const handleKey = (e) => {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const filtered = searchQ ? messages.filter(m=>m.text?.toLowerCase().includes(searchQ.toLowerCase())) : messages;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>

      {/* ── HEADER ── */}
      <div style={{
        padding:"10px 14px",borderBottom:`1px solid ${BORDER}`,
        background:`linear-gradient(180deg,${SURFACE},${SURF_LO})`,
        display:"flex",alignItems:"center",gap:10,flexShrink:0
      }}>
        {/* back (mobile) */}
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:BLUE,fontSize:20,padding:"0 4px 0 0",display:"flex"}}>‹</button>
        <Avatar name={contact.name} hue={contact.hue} size={36} online={contact.online}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:800,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{contact.name}</div>
          <div style={{fontSize:10,color:contact.online?GREEN:FAINT}}>{contact.online?"онлайн":"офлайн"} · {contact.phone}</div>
        </div>
        {/* actions */}
        <button onClick={()=>window.location.href=`tel:${contact.phone}`} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>
          <div className="i3" style={{width:34,height:34,background:"linear-gradient(165deg,#34d399,#059669)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.82 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.09 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </div>
        </button>
        <button onClick={()=>setShowSearch(v=>!v)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>
          <div className="i3" style={{width:34,height:34,background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
        </button>
      </div>

      {/* ── SEARCH BAR ── */}
      {showSearch && (
        <div style={{padding:"8px 14px",background:SURF_LO,borderBottom:`1px solid ${BORDER}`,display:"flex",gap:8,alignItems:"center"}}>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} autoFocus
            placeholder="Пошук по повідомленнях…"
            style={{flex:1,background:"transparent",border:"none",outline:"none",color:TEXT,fontSize:13}}/>
          {searchQ && <span style={{fontSize:11,color:DIM}}>{filtered.length} знайдено</span>}
          <button onClick={()=>{setShowSearch(false);setSearchQ("");}} style={{background:"none",border:"none",cursor:"pointer",color:FAINT,fontSize:18}}>×</button>
        </div>
      )}

      {/* ── MESSAGES ── */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 0",display:"flex",flexDirection:"column",gap:4}}>
        {/* date separator */}
        <div style={{textAlign:"center",padding:"4px 0"}}>
          <span style={{fontSize:11,color:FAINT,background:SURF_LO,padding:"3px 12px",borderRadius:10}}>Сьогодні</span>
        </div>

        {(searchQ ? filtered : messages).map(msg=>(
          <Bubble key={msg.id} msg={msg} isOut={msg.from==="instructor"} onReact={onReact}/>
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* ── INPUT ── */}
      <div style={{
        padding:"10px 12px",borderTop:`1px solid ${BORDER}`,
        background:`linear-gradient(180deg,${SURF_LO},${BG_DEEP})`,
        flexShrink:0
      }}>
        {/* channel + quick replies row */}
        <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
          <ChannelPicker current={channel} onChange={setChannel}/>
          <QuickReplies onSelect={t=>setText(t)}/>
          {/* attach */}
          <button style={{
            background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            border:"none",borderRadius:10,padding:"7px 10px",cursor:"pointer",
            color:DIM,fontSize:14,fontWeight:700,boxShadow:SO
          }}>📎</button>
        </div>

        {/* text input row */}
        <div style={{
          display:"flex",alignItems:"flex-end",gap:8,
          background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,
          borderRadius:14,boxShadow:SI,padding:"10px 12px"
        }}>
          <textarea
            ref={textareaRef}
            className="msg-input"
            value={text}
            onChange={e=>setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Написати повідомлення…"
            rows={1}
          />
          <button onClick={send} disabled={!text.trim()} style={{
            width:36,height:36,borderRadius:10,border:"none",cursor:text.trim()?"pointer":"default",
            background:text.trim()?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
            color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:text.trim()?`-2px 4px 10px rgba(255,90,60,0.4),inset 1px 1px 0 rgba(255,255,255,0.3)`:SO,
            flexShrink:0,transition:"all .15s"
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div style={{fontSize:10,color:FAINT,marginTop:5,textAlign:"center"}}>Enter — надіслати · Shift+Enter — новий рядок</div>
      </div>
    </div>
  );
}

// ─── EMPTY STATE ─────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:FAINT}}>
      <div style={{fontSize:48}}>💬</div>
      <div style={{fontSize:14,fontWeight:700,color:DIM}}>Вибери контакт</div>
      <div style={{fontSize:12}}>щоб відкрити чат</div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function ChatsView() {
  const [contacts, setContacts] = useState(CONTACTS);
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const active = contacts.find(c=>c.id===activeId);

  const handleSelect = (id) => {
    setActiveId(id);
    setMobileShowChat(true);
    // mark as read
    setContacts(cs=>cs.map(c=>c.id===id?{...c,unread:0}:c));
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        display:"flex",height:"calc(100vh - 130px)",
        fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",
        color:TEXT,
        background:BG,
        borderRadius:20,overflow:"hidden",
        boxShadow:SO,border:`1px solid ${BORDER}`
      }}>

        {/* ── LEFT: CONTACT LIST ── */}
        <div style={{
          width:"40%",minWidth:200,maxWidth:280,flexShrink:0,
          display: mobileShowChat ? "none" : "flex",
          flexDirection:"column"
        }}>
          <ContactList
            contacts={contacts}
            activeId={activeId}
            onSelect={handleSelect}
            search={search}
            setSearch={setSearch}
          />
        </div>

        {/* ── RIGHT: CHAT ── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {active
            ? <ChatPanel
                contact={active}
                onBack={()=>setMobileShowChat(false)}
              />
            : <EmptyState/>
          }
        </div>

      </div>
    </>
  );
}
