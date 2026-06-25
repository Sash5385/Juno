import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { ref, get, update, set } from "firebase/database";
import { auth, iRef, db } from "./firebase";

const TRANSLIT = {
  'а':'a','б':'b','в':'v','г':'g','ґ':'g','д':'d','е':'e','є':'ye',
  'ж':'zh','з':'z','и':'y','і':'i','ї':'yi','й':'y','к':'k','л':'l',
  'м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
  'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'yu','я':'ya',
  ' ':'-',
};
const toSlug = (str) => str.toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('')
  .replace(/[^a-z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');

const BG_DEEP = "#161719";
const SURFACE = "#26282c";
const SURF_HI = "#2e3034";
const BORDER  = "rgba(255,255,255,0.05)";
const TEXT    = "#e8e8ea";
const DIM     = "#8b8d93";
const ACCENT  = "#ff5a3c";
const SO = "6px 6px 16px rgba(0,0,0,0.45),-3px -3px 10px rgba(255,255,255,0.025)";

export function useAdminAuth() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    // Fallback: if Firebase Auth doesn't resolve within 6s (IndexedDB blocked, slow network),
    // treat as logged-out so the login screen appears instead of blank white screen.
    const fallback = setTimeout(() => setUser(prev => prev === undefined ? null : prev), 3000);
    const unsub = onAuthStateChanged(auth, u => {
      clearTimeout(fallback);
      setUser(u || null);
    });
    return () => { clearTimeout(fallback); unsub(); };
  }, []);
  return user;
}

export function LoginScreen() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const login = async () => {
    setError(""); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      if (e.code === 'auth/network-request-failed') setError("Помилка мережі — перевірте з'єднання");
      else if (e.code === 'auth/too-many-requests') setError("Забагато спроб — спробуйте пізніше");
      else setError("Невірний email або пароль");
    }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:BG_DEEP, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`, borderRadius:20, padding:"32px 28px", width:"100%", maxWidth:360, boxShadow:SO, border:`1px solid ${BORDER}` }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <img src="/icon-192.png" alt="DrivePad" style={{width:72,height:72,borderRadius:"50%",marginBottom:8,boxShadow:"-3px 5px 14px rgba(0,0,0,0.45)"}}/>
          <div style={{ fontSize:20, fontWeight:800, color:TEXT }}>DrivePad</div>
          <div style={{ fontSize:13, color:DIM, marginTop:4 }}>Вхід для інструктора</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:DIM, marginBottom:6 }}>Email</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}
            style={{ width:"100%", background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:14, outline:"none", boxSizing:"border-box" }}/>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:DIM, marginBottom:6 }}>Пароль</div>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}
            style={{ width:"100%", background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:14, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {error && <div style={{ fontSize:12, color:ACCENT, textAlign:"center", marginBottom:14, padding:"8px", borderRadius:8, background:"rgba(255,90,60,0.1)" }}>{error}</div>}
        <button onClick={login} disabled={loading||!email||!password}
          style={{ width:"100%", padding:"12px", borderRadius:12, background: loading||!email||!password ? "rgba(255,90,60,0.3)" : "linear-gradient(135deg,#ff7a5c,#ff5a3c)", border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor: loading||!email||!password ? "default":"pointer" }}>
          {loading ? "Вхід..." : "Увійти"}
        </button>
      </div>
    </div>
  );
}

const INP = { width:"100%", background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:14, outline:"none", boxSizing:"border-box" };
const LBL = { fontSize:12, color:DIM, marginBottom:6 };

export function InstructorSetupScreen({ onDone }) {
  const [name,       setName]       = useState("");
  const [phone,      setPhone]      = useState("");
  const [address,    setAddress]    = useState("");
  const [experience, setExperience] = useState("");
  const [slug,       setSlug]       = useState("");
  const [slugError,  setSlugError]  = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  const handleNameChange = (v) => {
    setName(v);
    if (!slug || slug === toSlug(name)) setSlug(toSlug(v));
  };

  const handleSlugChange = (v) => {
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-'));
    setSlugError('');
  };

  const canSave = name.trim() && phone.trim() && slug.length >= 3;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(""); setSlugError("");
    try {
      const slugSnap = await get(ref(db, `slugs/${slug}`));
      if (slugSnap.exists()) {
        setSlugError("Цей slug вже зайнятий. Оберіть інший.");
        setSaving(false); return;
      }
      const profile = {
        name:       name.trim(),
        phone:      phone.trim(),
        address:    address.trim() || "",
        experience: Number(experience) || 0,
        slug,
      };
      const iid = auth.currentUser.uid;
      const TRIAL_DAYS = 14;
      await update(iRef(""), {
        "admin_settings/profile": profile,
        "subscription/plan":        "trial",
        "subscription/trialEndsAt": Date.now() + TRIAL_DAYS * 24 * 3600 * 1000,
        "subscription/createdAt":   Date.now(),
      });
      await set(ref(db, `slugs/${slug}`), { iid });
      onDone(profile);
    } catch {
      setError("Помилка збереження. Перевірте з'єднання.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:BG_DEEP, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
      <div style={{ background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`, borderRadius:20, padding:"32px 28px", width:"100%", maxWidth:400, boxShadow:SO, border:`1px solid ${BORDER}` }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <img src="/icon-192.png" alt="DrivePad" style={{width:64,height:64,borderRadius:"50%",marginBottom:10,boxShadow:"-3px 5px 14px rgba(0,0,0,0.45)"}}/>
          <div style={{ fontSize:20, fontWeight:800, color:TEXT }}>Налаштування профілю</div>
          <div style={{ fontSize:13, color:DIM, marginTop:6 }}>Заповніть інформацію про себе — учні побачать її при записі</div>
        </div>

        <div style={{ marginBottom:14 }}>
          <div style={LBL}>Ім'я та прізвище *</div>
          <input value={name} onChange={e=>handleNameChange(e.target.value)} placeholder="Олександр Коваленко" style={INP}/>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={LBL}>Телефон *</div>
          <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+380XXXXXXXXX" type="tel" style={INP}/>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={LBL}>Адреса в посиланні * (мін. 3 символи)</div>
          <div style={{ display:'flex', alignItems:'center', background:BG_DEEP, border:`1px solid ${slugError?ACCENT:BORDER}`, borderRadius:10, overflow:'hidden' }}>
            <span style={{ padding:'10px 8px 10px 14px', color:DIM, fontSize:12, flexShrink:0, userSelect:'none' }}>book/</span>
            <input value={slug} onChange={e=>handleSlugChange(e.target.value)} placeholder="ivan-marchenko"
              style={{ ...INP, border:'none', borderRadius:0, padding:'10px 14px 10px 0', flex:1, minWidth:0 }}/>
          </div>
          {slugError && <div style={{ fontSize:11, color:ACCENT, marginTop:4 }}>{slugError}</div>}
          {!slugError && slug.length >= 3 && <div style={{ fontSize:11, color:DIM, marginTop:4 }}>Посилання: /book/{slug}</div>}
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={LBL}>Місто / Адреса</div>
          <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Київ, вул. Хрещатик" style={INP}/>
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={LBL}>Досвід роботи (років)</div>
          <input value={experience} onChange={e=>setExperience(e.target.value)} placeholder="5" type="number" min="0" max="50" style={INP}/>
        </div>

        {error && <div style={{ fontSize:12, color:ACCENT, textAlign:"center", marginBottom:14, padding:"8px", borderRadius:8, background:"rgba(255,90,60,0.1)" }}>{error}</div>}

        <button onClick={save} disabled={saving||!canSave}
          style={{ width:"100%", padding:"13px", borderRadius:12, background: saving||!canSave ? "rgba(255,90,60,0.3)" : "linear-gradient(135deg,#ff7a5c,#ff5a3c)", border:"none", color:"#fff", fontSize:15, fontWeight:700, cursor: saving||!canSave ? "default":"pointer" }}>
          {saving ? "Зберігаємо..." : "Розпочати роботу →"}
        </button>
      </div>
    </div>
  );
}
