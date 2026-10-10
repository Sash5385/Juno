import { useState, useEffect, useContext } from "react";
import { ref, get, set, remove } from "firebase/database";
import { db, auth } from "../firebase";
import { ThemeContext } from "../theme.js";
import { useConfirm } from "../ConfirmModal";
import {
  salonSlugFrom, salonSlugValid, salonPublicUrl, inviteUrl, parseInviteToken, newInviteToken, salonMasters, INVITE_DAYS, INVITE_KEY,
} from "../salon";


// Налаштування → Салон: створити салон / запросити майстрів / приєднатись за запрошенням / вийти.
// Членство лежить у salons/{slug}/masters/{iid}; admin_settings.salonSlug лише вказує, в якому ти салоні.
export default function SalonSection({ settings, upd }) {
  const { BORDER, TEXT, DIM, FAINT, GREEN, RED, ACCENT, ACC_HI, SURF_HI, SURFACE, SO } = useContext(ThemeContext);
  const uid = auth.currentUser?.uid;
  const slug = settings.salonSlug || null;
  const [salon, setSalon] = useState(undefined); // undefined — вантажиться, null — немає
  const [names, setNames] = useState({});
  const [name, setName] = useState("");
  const [code, setCode] = useState(() => { try { return localStorage.getItem(INVITE_KEY) || ""; } catch { return ""; } });
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [confirm, confirmNode] = useConfirm();

  const [tick, setTick] = useState(0); // збільшуємо, щоб перечитати салон після змін
  useEffect(() => {
    if (!slug) return undefined;
    let alive = true;
    (async () => {
      let node; let nm = {};
      try {
        node = (await get(ref(db, `salons/${slug}`))).val();
        if (node?.masters) {
          const entries = await Promise.all(Object.keys(node.masters).map(async (iid) => {
            const p = (await get(ref(db, `instructors/${iid}/admin_settings/profile`)).catch(() => null))?.val();
            return [iid, p?.name || "Майстер"];
          }));
          nm = Object.fromEntries(entries);
        }
      } catch { node = null; }
      return { node, nm };
    })().then(({ node, nm }) => {
      if (!alive) return;
      setSalon(node && node.masters && node.masters[uid] ? node : null); // мене прибрали з салону — як ніби його немає
      setNames(nm);
    });
    return () => { alive = false; };
  }, [slug, uid, tick]);

  const copy = (text, key) => { navigator.clipboard?.writeText(text).catch(() => {}); setCopied(key); setTimeout(() => setCopied(""), 1500); };
  const run = async (fn) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg("Не вдалося: " + (e?.message || e)); } finally { setBusy(false); } };

  const createSalon = () => run(async () => {
    const s = salonSlugFrom(name);
    if (!salonSlugValid(s)) { setMsg("Назва занадто коротка або адреса зарезервована — спробуйте іншу."); return; }
    if ((await get(ref(db, `salons/${s}`))).exists()) { setMsg("Салон із такою адресою вже є. Змініть назву."); return; }
    await set(ref(db, `salons/${s}`), { ownerIid: uid, name: name.trim().slice(0, 60), createdAt: Date.now(), masters: { [uid]: "owner" } });
    upd("salonSlug", s);
  });

  const joinSalon = () => run(async () => {
    const token = parseInviteToken(code);
    if (!token) { setMsg("Вставте посилання-запрошення або код."); return; }
    const inv = (await get(ref(db, `salon_invites/${token}`))).val();
    if (!inv || inv.expiresAt < Date.now()) { setMsg("Запрошення недійсне або прострочене."); return; }
    await set(ref(db, `salons/${inv.salon}/masters/${uid}`), token);
    try { localStorage.removeItem(INVITE_KEY); } catch { /* ok */ }
    setCode("");
    upd("salonSlug", inv.salon);
  });

  const makeInvite = () => run(async () => {
    const token = newInviteToken();
    await set(ref(db, `salon_invites/${token}`), { salon: slug, ownerIid: uid, expiresAt: Date.now() + INVITE_DAYS * 86400000 });
    setInvite(token);
  });

  const removeMaster = (iid) => run(async () => {
    if (!(await confirm({ title: `Прибрати «${names[iid] || "майстра"}» із салону?`, text: "Майстер зникне зі сторінки салону, але його акаунт і клієнти залишаться.", okLabel: "Прибрати", danger: true }))) return;
    await remove(ref(db, `salons/${slug}/masters/${iid}`));
    setTick(t => t + 1);
  });

  const leave = () => run(async () => {
    if (!(await confirm({ title: "Вийти із салону?", text: "Вас буде прибрано зі сторінки салону. Приєднатись знову можна за новим запрошенням.", okLabel: "Вийти", danger: true }))) return;
    await remove(ref(db, `salons/${slug}/masters/${uid}`));
    upd("salonSlug", null);
  });

  const box = { padding:"10px 12px", borderRadius:10, border:`1px solid ${BORDER}`, background:"rgba(0,0,0,0.18)", color:TEXT, fontSize:14, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
  const btn = (primary, color) => ({ padding:"10px 14px", borderRadius:11, border:"none", cursor:busy?"default":"pointer", fontSize:13, fontWeight:700, fontFamily:"inherit", opacity:busy?0.6:1,
    background: primary ? `linear-gradient(165deg,${ACC_HI},${ACCENT})` : `linear-gradient(135deg,${SURF_HI},${SURFACE})`, color: primary ? "#fff" : (color || DIM), boxShadow:SO });
  const card = { marginTop:10, padding:"12px", borderRadius:12, background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`, boxShadow:SO };
  const lbl = { fontSize:10, letterSpacing:1, color:FAINT, textTransform:"uppercase", marginBottom:6 };

  // Без салону (slug немає) нічого не вантажимо: показуємо форму створення/приєднання
  if (slug && salon === undefined) return <div style={{padding:"20px 0",textAlign:"center",color:DIM,fontSize:12}}>Завантаження…</div>;

  if (!slug || !salon) {
    return (
      <div>
        <div style={{fontSize:12,color:FAINT,marginBottom:6,lineHeight:1.5}}>
          Салон об'єднує кількох майстрів у спільну сторінку запису: клієнт обирає майстра й записується до нього. Кожен майстер лишається самостійним — свій вхід, розклад, послуги й клієнти.
          {slug && <div style={{color:RED,marginTop:6}}>Вас більше немає в салоні «{slug}».</div>}
        </div>
        <div style={card}>
          <div style={lbl}>Створити салон</div>
          <input value={name} maxLength={60} placeholder="Назва салону" onChange={e=>setName(e.target.value)} style={box}/>
          {name.trim() && <div style={{fontSize:11,color:FAINT,marginTop:5}}>Адреса: {salonPublicUrl(salonSlugFrom(name) || "…")}</div>}
          <button disabled={busy || name.trim().length < 3} onClick={createSalon} style={{...btn(true),marginTop:8,width:"100%"}}>Створити салон</button>
        </div>
        <div style={card}>
          <div style={lbl}>Приєднатись за запрошенням</div>
          <input value={code} placeholder="Посилання або код запрошення" onChange={e=>setCode(e.target.value)} style={box}/>
          <button disabled={busy || !code.trim()} onClick={joinSalon} style={{...btn(false,GREEN),marginTop:8,width:"100%"}}>Приєднатись</button>
        </div>
        {msg && <div style={{marginTop:10,fontSize:12,color:RED,textAlign:"center"}}>{msg}</div>}
      </div>
    );
  }

  const owner = salon.ownerIid === uid;
  const url = salonPublicUrl(slug);
  return (
    <div>
      {confirmNode}
      <div style={{fontSize:16,fontWeight:800,color:TEXT}}>{salon.name}</div>
      <div style={{fontSize:12,color:FAINT,marginTop:2}}>{owner ? "Ви власник салону" : "Ви майстер салону"}</div>
      <div style={card}>
        <div style={lbl}>Сторінка салону для клієнтів</div>
        <div style={{fontSize:12,color:TEXT,wordBreak:"break-all",marginBottom:8}}>{url}</div>
        <button onClick={()=>copy(url,"url")} style={btn(false,GREEN)}>{copied==="url" ? "✓ Скопійовано" : "Скопіювати посилання"}</button>
      </div>
      <div style={card}>
        <div style={lbl}>Майстри ({salonMasters(salon).length})</div>
        {salonMasters(salon).map(m => (
          <div key={m.iid} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0"}}>
            <span style={{flex:1,minWidth:0,color:TEXT,fontSize:14,fontWeight:m.iid===uid?800:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{names[m.iid] || "…"}{m.iid===uid && " (ви)"}</span>
            {m.owner && <span style={{fontSize:10,color:FAINT}}>власник</span>}
            {owner && !m.owner && <button onClick={()=>removeMaster(m.iid)} aria-label="Прибрати" style={{background:"none",border:"none",cursor:"pointer",color:"rgba(248,113,113,0.85)",fontSize:20,lineHeight:1,padding:"0 4px"}}>×</button>}
          </div>
        ))}
      </div>
      {owner && (
        <div style={card}>
          <div style={lbl}>Запросити майстра</div>
          {invite ? (
            <>
              <div style={{fontSize:12,color:TEXT,wordBreak:"break-all",marginBottom:8}}>{inviteUrl(invite)}</div>
              <button onClick={()=>copy(inviteUrl(invite),"inv")} style={btn(true)}>{copied==="inv" ? "✓ Скопійовано" : "Скопіювати запрошення"}</button>
              <div style={{fontSize:11,color:FAINT,marginTop:6}}>Надішліть посилання майстру. Воно діє {INVITE_DAYS} днів: майстер відкриває його, входить у свій акаунт Juno й у Налаштуваннях → Салон натискає «Приєднатись».</div>
            </>
          ) : (
            <button disabled={busy} onClick={makeInvite} style={btn(true)}>Створити запрошення</button>
          )}
        </div>
      )}
      {!owner && <button disabled={busy} onClick={leave} style={{...btn(false,RED),marginTop:12,width:"100%"}}>Вийти із салону</button>}
      {msg && <div style={{marginTop:10,fontSize:12,color:RED,textAlign:"center"}}>{msg}</div>}
    </div>
  );
}
