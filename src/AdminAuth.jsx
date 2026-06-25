import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";

const ADMIN_UID = "IjyqouYBDUg5KGzs3U27PUcs8Uj1";

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
      if (u && u.uid === ADMIN_UID) setUser(u);
      else setUser(null);
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
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (cred.user.uid !== ADMIN_UID) { await signOut(auth); setError("Доступ заборонено"); }
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
          <img src="/icon-192.png" alt="ID4Drive" style={{width:72,height:72,borderRadius:"50%",marginBottom:8,boxShadow:"-3px 5px 14px rgba(0,0,0,0.45)"}}/>
          <div style={{ fontSize:20, fontWeight:800, color:TEXT }}>ID4Drive Admin</div>
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
