// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useState, useEffect, useMemo, useContext } from "react";
import PhoneField from "../../PhoneField.jsx";
import { MetalIcon } from "../../MetalIcon";
import { update, get, onValue, off, push as fbPush } from "firebase/database";
import { iRef, auth, watchBookings } from "../../firebase";
import { ThemeContext, GREEN, SURFACE, SURF_HI } from "../../theme.js";
import { Card, SectionTitle } from "./shared.jsx";

// ═══════════════════════════════════════════════════════════════
// STUDENTS VIEW — список клієнтів з редагуванням даних
// ═══════════════════════════════════════════════════════════════
function StudentsView() {
  const { BG_DEEP, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI, GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow  = a => `rgba(${GLOW},${a})`;
  const ink   = a => `rgba(${INK},${a})`;
  const AH = ACC_HI, FT = FAINT, DM = DIM, SLO = SURF_LO, SO2 = SO, SI2 = SI;

  const [students,     setStudents]     = useState([]);
  const [bookingCounts,setBookingCounts]= useState({});
  const [search,       setSearch]       = useState("");
  const [editing,      setEditing]      = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [savedUid,     setSavedUid]     = useState(null);

  useEffect(() => {
    const r = iRef( "users");
    const unsub = onValue(r, snap => {
      const d = snap.val() || {};
      setStudents(Object.entries(d).map(([uid, u]) => {
        const p = u.profile || {};
        return { uid, name: p.name||u.name||"Клієнт", phone: p.phone||u.phone||"", blocked: !!u.blocked };
      }).filter(s => s.name !== "Клієнт" || s.phone));
    });
    return () => off(r, "value", unsub);
  }, []);

  useEffect(() => {
    return watchBookings(raw => {
      const d = raw || {};
      const counts = {};
      for (const [uid, bks] of Object.entries(d)) {
        counts[uid] = Object.values(bks).filter(b => b.status !== "cancelled").length;
      }
      setBookingCounts(counts);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? students.filter(s => s.name.toLowerCase().includes(q) || s.phone.includes(q)) : [...students];
    return list.sort((a, b) => {
      const ca = bookingCounts[a.uid] || 0, cb = bookingCounts[b.uid] || 0;
      if (ca !== cb) return cb - ca;
      return a.name.localeCompare(b.name, "uk");
    });
  }, [students, search, bookingCounts]);

  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      await update(iRef( `users/${editing.uid}/profile`), {
        name: editing.name.trim(), phone: editing.phone.trim(),
      });
      const bSnap = await get(iRef( `bookings/${editing.uid}`));
      if (bSnap.exists()) {
        const upd = {};
        bSnap.forEach(child => {
          const b = child.val();
          if (b && b.status !== "cancelled") {
            upd[`bookings/${editing.uid}/${child.key}/studentName`] = editing.name.trim();
            upd[`bookings/${editing.uid}/${child.key}/name`] = editing.name.trim();
          }
        });
        if (Object.keys(upd).length) await update(iRef(), upd);
      }
      setSavedUid(editing.uid);
      setTimeout(() => setSavedUid(null), 2500);
      setEditing(null);
    } catch (e) { console.error("saveEdit", e); }
    finally { setSaving(false); }
  };

  const inputSt = {
    width:"100%", boxSizing:"border-box",
    background:`linear-gradient(135deg,${BG_DEEP},${SLO})`,
    border:"none", outline:"none", color:TEXT, fontSize:14,
    padding:"10px 13px", borderRadius:14, boxShadow:SI2, fontFamily:"inherit",
  };
  const btnBase = { border:"none", cursor:"pointer", borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700 };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>

      <div style={{
        display:"flex", alignItems:"center", gap:8,
        padding:"10px 14px", borderRadius:14,
        background:`linear-gradient(135deg,${BG_DEEP},${SLO})`,
        boxShadow:SI2, marginBottom:2,
      }}>
        <span style={{display:"inline-flex"}}><MetalIcon name="search" size={22}/></span>
        <input placeholder="Пошук за ім'ям або телефоном..."
          value={search} onChange={e=>setSearch(e.target.value)}
          style={{flex:1,background:"none",border:"none",outline:"none",color:TEXT,fontSize:14}}/>
        {search && <button aria-label="Очистити пошук" onClick={()=>setSearch("")}
          style={{background:"none",border:"none",cursor:"pointer",color:FT,fontSize:18,padding:0,lineHeight:1}}>×</button>}
      </div>

      <div style={{fontSize:11,color:FT,paddingLeft:4,marginBottom:2}}>{filtered.length} клієнтів</div>

      {filtered.map(s => {
        const isEditing = editing?.uid === s.uid;
        const isSaved   = savedUid === s.uid;
        const cnt = bookingCounts[s.uid] || 0;
        const cntLabel = cnt === 1 ? "1 запис" : cnt < 5 ? `${cnt} записи` : `${cnt} записів`;
        return (
          <Card key={s.uid} style={{padding:"14px 16px"}}>
            {isEditing ? (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:11,color:FT,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:2}}>Редагування</div>
                <input placeholder="Ім'я та прізвище" value={editing.name}
                  onChange={e=>setEditing(v=>({...v,name:e.target.value}))} style={inputSt}/>
                <PhoneField placeholder="+380..." value={editing.phone} onChange={v=>setEditing(x=>({...x,phone:v}))} inputStyle={inputSt}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEditing(null)}
                    style={{...btnBase,flex:1,background:ink(0.06),color:DM}}>Скасувати</button>
                  <button onClick={saveEdit} disabled={saving||!editing.name.trim()}
                    style={{...btnBase,flex:2,background:`linear-gradient(165deg,${AH},${ACCENT})`,color:"#fff",opacity:saving?0.7:1}}>
                    {saving?"Збереження...":"Зберегти"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <MetalIcon square size={40} color={ACCENT}>{s.name.trim()[0]?.toUpperCase()||"?"}</MetalIcon>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:2}}>{s.name}</div>
                  <div style={{fontSize:12,color:DM}}>{s.phone||"телефон не вказано"}</div>
                  {cnt>0 && <div style={{fontSize:11,color:FT,marginTop:2}}>{cntLabel}</div>}
                  {s.blocked && <div style={{fontSize:11,color:"#ef4444",marginTop:2}}>заблокований</div>}
                </div>
                {isSaved && <div style={{fontSize:12,color:GREEN,fontWeight:700,flexShrink:0}}>✓</div>}
                <button onClick={()=>setEditing({uid:s.uid,name:s.name,phone:s.phone})}
                  style={{...btnBase,padding:"7px 12px",fontSize:12,background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,color:DM,boxShadow:SO2}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:4}}><MetalIcon name="edit" size={16}/>Ред.</span>
                </button>
              </div>
            )}
          </Card>
        );
      })}

      {filtered.length===0 && (
        <div style={{textAlign:"center",padding:"30px 0",color:FT,fontSize:13}}>
          {search?"Не знайдено":"Клієнтів поки немає"}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUB for other tabs
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// TEMPLATES VIEW — редагування шаблонів повідомлень + лог
// ═══════════════════════════════════════════════════════════════
function TemplatesView() {
  const { BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI, GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SLO=SURF_LO, DM=DIM, FT=FAINT, AH=ACC_HI, SO2=SO, SI2=SI;

  const ADMIN_UID = auth.currentUser?.uid || "admin";

  const DEFAULTS = {
    booking_confirmed: { title:"✅ Запис підтверджено", body:"{name}, чекаємо тебе {daySlot} 🎯" },
    booking_cancelled: { title:"❌ Запис скасовано",   body:"Запис {dateLabel} о {time} відмінено. Оберіть інший час ↩️" },
    lesson_reminder:   { title:"⏰ Нагадування про запис", body:"{name}, завтра запис о {time} 🚗 Чекаємо!" },
  };
  const TMETA = [
    { type:"booking_confirmed", label:"✅ Підтвердження запису",
      vars:["{name}","{daySlot}","{time}","{date}"],
      sample:{ name:"Маргарита", daySlot:"понеділок 7 липня о 10:00", time:"10:00", date:"2025-07-07", dateLabel:"7 липня" } },
    { type:"booking_cancelled", label:"❌ Скасування запису",
      vars:["{name}","{dateLabel}","{time}","{date}"],
      sample:{ name:"Маргарита", daySlot:"понеділок 7 липня о 14:00", time:"14:00", date:"2025-07-07", dateLabel:"7 липня" } },
    { type:"lesson_reminder",   label:"⏰ Нагадування про запис",
      vars:["{name}","{time}","{date}"],
      sample:{ name:"Маргарита", daySlot:"завтра о 10:00", time:"10:00", date:"2025-07-07", dateLabel:"7 липня" } },
  ];
  const applyV = (str, vars) => (str||"").replace(/\{(\w+)\}/g, (_,k) => vars[k] ?? `{${k}}`);

  const [drafts,   setDrafts]   = useState({ ...DEFAULTS });
  const [saved,    setSaved]    = useState({});
  const [testSent, setTestSent] = useState({});
  const [log,      setLog]      = useState([]);

  useEffect(() => {
    const r = iRef( "pushTemplates");
    const unsub = onValue(r, snap => {
      const data = snap.val() || {};
      setDrafts(prev => {
        const next = { ...prev };
        for (const type of Object.keys(DEFAULTS)) {
          if (data[type]) next[type] = { title: data[type].title || DEFAULTS[type].title, body: data[type].body || DEFAULTS[type].body };
        }
        return next;
      });
    });
    return () => off(r, "value", unsub);
  }, []);

  useEffect(() => {
    const r = iRef( "pushLog");
    const unsub = onValue(r, snap => {
      if (!snap.exists()) { setLog([]); return; }
      const items = [];
      snap.forEach(child => items.push({ id: child.key, ...child.val() }));
      items.sort((a, b) => (b.sentAt||0) - (a.sentAt||0));
      setLog(items.slice(0, 50));
    });
    return () => off(r, "value", unsub);
  }, []);

  const save = async (type) => {
    await update(iRef( `pushTemplates/${type}`), drafts[type]).catch(()=>{});
    setSaved(s => ({ ...s, [type]:true }));
    setTimeout(() => setSaved(s => ({ ...s, [type]:false })), 2000);
  };

  const sendTest = async (type) => {
    const meta  = TMETA.find(m => m.type === type);
    const draft = drafts[type];
    await fbPush(iRef( "adminPush"), {
      uid:   ADMIN_UID,
      title: applyV(draft.title, meta.sample),
      body:  applyV(draft.body,  meta.sample),
      url:   "/cabinet", test: true,
    });
    setTestSent(s => ({ ...s, [type]:true }));
    setTimeout(() => setTestSent(s => ({ ...s, [type]:false })), 3000);
  };

  const fmtTs = ts => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("uk",{day:"numeric",month:"short"}) + " " +
           d.toLocaleTimeString("uk",{hour:"2-digit",minute:"2-digit"});
  };
  const TYPE_LABELS = {
    booking_confirmed:"✅ Підтверд.", booking_cancelled:"❌ Скасування",
    lesson_reminder:"⏰ Нагадування", admin:"💬 Особистий",
    slot_free:"🚗 Вільний слот", queue_offer:"🎉 Черга",
    admin_alert:"🔔 Адміну",
  };

  const inputSt = {
    width:"100%", boxSizing:"border-box",
    background:`linear-gradient(135deg,${BG_DEEP},${SLO})`,
    border:"none", outline:"none", color:TEXT, fontSize:13,
    padding:"10px 13px", borderRadius:14, boxShadow:SI2,
    fontFamily:"inherit", resize:"none",
  };
  const btnBase = { border:"none", cursor:"pointer", borderRadius:10, padding:"7px 14px", fontSize:12, fontWeight:700 };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {TMETA.map(meta => {
        const draft = drafts[meta.type] || DEFAULTS[meta.type];
        return (
          <Card key={meta.type} style={{padding:20}}>
            <SectionTitle right={
              <button onClick={()=>save(meta.type)} style={{
                ...btnBase,
                background:`linear-gradient(165deg,${AH},${ACCENT})`,
                color:"#fff", boxShadow:`inset 1px 1px 0 ${glow(0.25)}`,
                opacity: saved[meta.type] ? 0.7 : 1,
              }}>{saved[meta.type] ? "✓ Збережено" : "Зберегти"}</button>
            }>{meta.label}</SectionTitle>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:FT,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Заголовок</div>
              <input value={draft.title}
                onChange={e=>setDrafts(s=>({...s,[meta.type]:{...s[meta.type],title:e.target.value}}))}
                style={inputSt}/>
            </div>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:FT,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Текст</div>
              <textarea rows={2} value={draft.body}
                onChange={e=>setDrafts(s=>({...s,[meta.type]:{...s[meta.type],body:e.target.value}}))}
                style={inputSt}/>
            </div>

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
              {meta.vars.map(v=>(
                <span key={v}
                  onClick={()=>setDrafts(s=>({...s,[meta.type]:{...s[meta.type],body:s[meta.type].body+v}}))}
                  style={{cursor:"pointer",fontSize:11,fontFamily:"monospace",background:glow(0.07),color:ACCENT,borderRadius:6,padding:"2px 8px",border:`1px solid ${glow(0.14)}`,userSelect:"none"}}
                >{v}</span>
              ))}
              <span style={{fontSize:11,color:FT}}>— вставити змінну</span>
            </div>

            <div style={{padding:"12px 14px",borderRadius:14,background:ink(0.04),border:`1px solid ${ink(0.06)}`,marginBottom:12}}>
              <div style={{fontSize:10,color:FT,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Превью</div>
              <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:2}}>{applyV(draft.title,meta.sample)}</div>
              <div style={{fontSize:12,color:DM,lineHeight:1.4}}>{applyV(draft.body,meta.sample)}</div>
            </div>

            <button onClick={()=>sendTest(meta.type)} style={{
              ...btnBase, width:"100%", padding:"10px 0", fontSize:13,
              background: testSent[meta.type]
                ? `linear-gradient(165deg,${GREEN}cc,${GREEN}88)`
                : `linear-gradient(165deg,${ACCENT},${AH})`,
              color:"#fff",
              boxShadow: testSent[meta.type] ? "none" : `inset 1px 1px 0 ${glow(0.25)},0 2px 8px ${ACCENT}44`,
            }}>{testSent[meta.type] ? "✓ Повідомлення надіслано" : <span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="phone" size={20}/>Надіслати тестове повідомлення</span>}</button>
          </Card>
        );
      })}

      <Card style={{padding:20}}>
        <SectionTitle>Лог надісланих повідомлень</SectionTitle>
        {log.length===0 ? (
          <div style={{fontSize:13,color:DM,textAlign:"center",padding:"20px 0"}}>Поки пусто — повідомлення з'являться тут після відправки</div>
        ) : log.map((item,i)=>(
          <div key={item.id} style={{
            display:"flex",gap:10,padding:"10px 0",alignItems:"flex-start",
            borderBottom: i<log.length-1 ? `1px solid ${BORDER}` : "none",
          }}>
            <div style={{fontSize:11,color:FT,flexShrink:0,minWidth:76,paddingTop:1}}>{fmtTs(item.sentAt)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:TEXT,marginBottom:2}}>{item.title}</div>
              <div style={{fontSize:11,color:DM,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.body}</div>
            </div>
            <div style={{fontSize:11,color:DM,flexShrink:0,textAlign:"right"}}>
              {TYPE_LABELS[item.type]||item.type}
              {item.recipients>1 && <div style={{fontSize:11,color:FT}}>{item.recipients} клієнтів</div>}
              {item.status && item.status!=="sent" && (
                <div style={{fontSize:11,color:"#ef4444",fontWeight:700}}>
                  ⚠ {item.status==="no_token" ? "немає токена" : "не надіслано"}
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function StubView({ title }) {
  const { DIM: TEXT_DIM, FAINT: TEXT_FAINT , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  return (
    <Card style={{padding:30,textAlign:"center"}}>
      <div style={{fontSize:14,color:TEXT_DIM,marginBottom:10}}>{title}</div>
    </Card>
  );
}

export { StudentsView, TemplatesView, StubView };
