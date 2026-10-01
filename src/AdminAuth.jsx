import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, onValue, update, set } from "firebase/database";
import { auth, iRef, db } from "./firebase";
import { licenseState } from "./hooks/useLicense";

// Вендор SaaS (ви) — бачить усіх інструкторів замість власного кабінету.
const VENDOR_EMAIL = "sash5385@gmail.com";
export const isVendor = (user) => user?.email === VENDOR_EMAIL;

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

// Multi-tenant: логін дозволений будь-якому зареєстрованому Firebase-користувачу —
// iid інструктора = його ж auth.uid. Профіль (є він, чи потрібна анкета
// InstructorSetupScreen) перевіряється окремо в App.jsx.
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

// iPhone, застосунок запущено з екрана Домой: вхід через Google тут неможливий (iOS відкриває
// Google в окремому вікні Safari з власним сховищем — результат не повертається в застосунок).
const IOS_STANDALONE = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
  && (window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches);

export function LoginScreen() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  // "login" — вхід, "register" — реєстрація нового інструктора (далі — анкета та пробний період)
  const [mode,      setMode]      = useState("login");
  const [password2, setPassword2] = useState("");
  const [info,      setInfo]      = useState("");
  const registering = mode === "register";

  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    const handleBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    const handleInstalled = () => { setInstallPrompt(null); setInstalled(true); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);
  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  // Проактивний банер "при першому вході" — той самий localStorage-прапорець
  // pwa_install_offered, що й у авторизованому App.jsx, тому пропозиція
  // показується рівно один раз, з якого б із двох екранів людина не почала
  // (логін тут, або одразу кабінет, якщо сесія вже активна).
  const IOS_UA_RE = /iphone|ipad|ipod/i;
  const ios = IOS_UA_RE.test(window.navigator.userAgent);
  const [bannerDismissed, setBannerDismissed] = useState(() => localStorage.getItem('pwa_install_offered') === '1');
  const bannerEligible = !installed && !bannerDismissed && (installPrompt || ios);
  useEffect(() => {
    if (bannerEligible) localStorage.setItem('pwa_install_offered', '1');
  }, [bannerEligible]);

  const login = async () => {
    setError(""); setInfo(""); setLoading(true);
    try {
      if (registering) {
        if (password.length < 6) { setError("Пароль — мінімум 6 символів"); return; }
        if (password !== password2) { setError("Паролі не збігаються"); return; }
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e) {
      if (e.code === 'auth/network-request-failed') setError("Помилка мережі — перевірте з'єднання");
      else if (e.code === 'auth/too-many-requests') setError("Забагато спроб — спробуйте пізніше");
      else if (e.code === 'auth/email-already-in-use') setError("Цей email уже зареєстрований — натисніть «Увійти»");
      else if (e.code === 'auth/invalid-email') setError("Некоректний email");
      else if (e.code === 'auth/weak-password') setError("Занадто простий пароль — мінімум 6 символів");
      else if (registering) setError("Не вдалося зареєструватись. Спробуйте ще раз");
      else setError("Невірний email або пароль");
    }
    finally { setLoading(false); }
  };

  const googleSignIn = async () => {
    setError(""); setInfo(""); setLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        // Мобільні браузери без popup — повний редірект, результат ловить getRedirectResult нижче
        try { await signInWithRedirect(auth, provider); return; } catch { /* нижче показуємо помилку */ }
      }
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') { /* користувач закрив вікно */ }
      else if (e.code === 'auth/network-request-failed') setError("Помилка мережі — перевірте з'єднання");
      else if (e.code === 'auth/unauthorized-domain') setError("Цей домен не дозволено для входу через Google (Firebase → Authentication → Authorized domains)");
      else if (e.code === 'auth/operation-not-allowed') setError("Вхід через Google не увімкнено в Firebase (Authentication → Sign-in method)");
      else setError("Не вдалося увійти через Google" + (e.code ? ` (${e.code})` : ""));
    } finally { setLoading(false); }
  };

  // Повернення з signInWithRedirect: успіх підхоплює onAuthStateChanged, тут — лише помилки
  useEffect(() => {
    getRedirectResult(auth).catch(e => setError("Не вдалося увійти через Google" + (e?.code ? ` (${e.code})` : "")));
  }, []);

  const resetPassword = async () => {
    setError(""); setInfo("");
    if (!email.trim()) { setError("Введіть email, щоб відновити пароль"); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("Лист для відновлення пароля надіслано на вашу пошту");
    } catch (e) {
      setError(e.code === 'auth/invalid-email' ? "Некоректний email" : "Не вдалося надіслати лист. Перевірте email");
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:BG_DEEP, display:"flex", alignItems:"center", justifyContent:"center", paddingTop:"env(safe-area-inset-top, 0px)", paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
      <div style={{ background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`, borderRadius:20, padding:"32px 28px", width:"100%", maxWidth:360, boxShadow:SO, border:`1px solid ${BORDER}` }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <img src="/icon-192.png" alt="DrivePad" style={{width:72,height:72,borderRadius:"50%",marginBottom:8,boxShadow:"-3px 5px 14px rgba(0,0,0,0.45)"}}/>
          <div style={{ fontSize:20, fontWeight:800, color:TEXT }}>DrivePad</div>
          <div style={{ fontSize:13, color:DIM, marginTop:4 }}>{registering ? "Реєстрація інструктора · 14 днів безкоштовно" : "Вхід для інструктора"}</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:DIM, marginBottom:6 }}>Email</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}
            style={{ width:"100%", background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:14, outline:"none", boxSizing:"border-box" }}/>
        </div>
        <div style={{ marginBottom: registering ? 14 : 8 }}>
          <div style={{ fontSize:12, color:DIM, marginBottom:6 }}>Пароль</div>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}
            style={{ width:"100%", background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:14, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {registering && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, color:DIM, marginBottom:6 }}>Повторіть пароль</div>
            <input type="password" value={password2} onChange={e=>setPassword2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}
              style={{ width:"100%", background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:14, outline:"none", boxSizing:"border-box" }}/>
          </div>
        )}
        {!registering && (
          <div style={{ textAlign:"right", marginBottom:16 }}>
            <button onClick={resetPassword} style={{ background:"none", border:"none", color:DIM, fontSize:12, cursor:"pointer", padding:0, textDecoration:"underline" }}>Забули пароль?</button>
          </div>
        )}
        {error && <div style={{ fontSize:12, color:ACCENT, textAlign:"center", marginBottom:14, padding:"8px", borderRadius:8, background:"rgba(255,90,60,0.1)" }}>{error}</div>}
        {info && <div style={{ fontSize:12, color:"#4caf6b", textAlign:"center", marginBottom:14, padding:"8px", borderRadius:8, background:"rgba(76,175,107,0.12)" }}>{info}</div>}
        <button onClick={login} disabled={loading||!email||!password||(registering&&!password2)}
          style={{ width:"100%", padding:"12px", borderRadius:12, background: loading||!email||!password||(registering&&!password2) ? "rgba(255,90,60,0.3)" : "linear-gradient(135deg,#ff7a5c,#ff5a3c)", border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor: loading||!email||!password ? "default":"pointer" }}>
          {loading ? (registering ? "Реєстрація..." : "Вхід...") : (registering ? "Зареєструватись" : "Увійти")}
        </button>
        {IOS_STANDALONE ? (
          <div style={{ marginTop:12, fontSize:11.5, color:DIM, lineHeight:1.5, textAlign:"center" }}>
            Вхід через Google недоступний у встановленому застосунку на iPhone (обмеження iOS). Скористайтесь email і паролем.
          </div>
        ) : (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:10, margin:"14px 0 12px" }}>
              <div style={{ flex:1, height:1, background:BORDER }}/><span style={{ fontSize:11, color:DIM }}>або</span><div style={{ flex:1, height:1, background:BORDER }}/>
            </div>
            <button onClick={googleSignIn} disabled={loading}
              style={{ width:"100%", padding:"11px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:`1px solid ${BORDER}`, color:TEXT, fontSize:14, fontWeight:700, cursor: loading ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.7 2.5 30.2 0 24 0 14.7 0 6.7 5.5 2.8 13.5l7.8 6.1C12.5 13.2 17.8 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.7 37.3 46.5 31.3 46.5 24.5z"/>
                <path fill="#FBBC05" d="M10.6 28.4A14.9 14.9 0 0 1 9.5 24c0-1.5.3-3 .7-4.4l-7.8-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1-.1-.3z"/>
                <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.2 0-11.5-3.7-13.4-9.1l-7.8 6.1C6.7 42.5 14.7 48 24 48z"/>
              </svg>
              Увійти через Google
            </button>
          </>
        )}
        <div style={{ textAlign:"center", marginTop:14, fontSize:13, color:DIM }}>
          {registering ? "Уже є акаунт? " : "Ще немає акаунта? "}
          <button onClick={() => { setMode(registering ? "login" : "register"); setError(""); setInfo(""); setPassword2(""); }}
            style={{ background:"none", border:"none", color:ACCENT, fontSize:13, fontWeight:700, cursor:"pointer", padding:0 }}>
            {registering ? "Увійти" : "Зареєструватись"}
          </button>
        </div>
        {installPrompt && !installed && (
          <button onClick={handleInstallClick} style={{
            width:"100%", marginTop:12, padding:"10px", borderRadius:12,
            background:"rgba(255,255,255,0.05)", border:`1px solid ${BORDER}`,
            color:TEXT, fontSize:13, fontWeight:700, cursor:"pointer",
          }}>
            📲 Встановити застосунок
          </button>
        )}
      </div>
      {bannerEligible && (
        <div style={{
          position:"fixed", left:12, right:12, bottom:"calc(env(safe-area-inset-bottom,0px) + 12px)", zIndex:200,
          background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`, border:`1px solid ${BORDER}`, borderRadius:16,
          padding:"12px 14px", boxShadow:SO, display:"flex", alignItems:"center", gap:10,
        }}>
          <div style={{fontSize:24, flexShrink:0}}>📲</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:800, color:TEXT}}>Встановіть застосунок</div>
            <div style={{fontSize:11, color:DIM, marginTop:2}}>
              {ios && !installPrompt ? 'Поділитися → «На екран Домівка»' : 'Швидкий доступ з головного екрана, без браузера'}
            </div>
          </div>
          {installPrompt && (
            <button onClick={handleInstallClick} style={{
              padding:"8px 14px", borderRadius:10, border:"none", cursor:"pointer",
              fontSize:12, fontWeight:800, color:"#fff", flexShrink:0,
              background:"linear-gradient(135deg,#ff7a5c,#ff5a3c)",
            }}>Встановити</button>
          )}
          <button onClick={()=>setBannerDismissed(true)} aria-label="Закрити" style={{
            width:26, height:26, borderRadius:8, border:"none", cursor:"pointer", flexShrink:0,
            background:"rgba(255,255,255,0.06)", color:DIM, fontSize:14,
          }}>✕</button>
        </div>
      )}
    </div>
  );
}

const INP = { width:"100%", background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:14, outline:"none", boxSizing:"border-box" };
const LBL = { fontSize:12, color:DIM, marginBottom:6 };
const TRIAL_DAYS = 14;
// Адреси, що збігаються з розділами/службовими шляхами застосунку
const RESERVED_SLUGS = ["admin","api","i","book","www","drivepad","login","auth","cabinet","schedule","home","about","settings","support","help","test","demo"];

// Перший вхід нового інструктора — заповнює профіль (учні бачать його при
// записі) і бронює slug для публічної сторінки /book/{slug}. Заводить license
// в trial на TRIAL_DAYS — той самий вузол, що читає useLicense()/checkLicenseExpiry.
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
      const iid = auth.currentUser.uid;
      if (RESERVED_SLUGS.includes(slug)) {
        setSlugError("Ця адреса зарезервована. Оберіть іншу.");
        setSaving(false); return;
      }
      // Адреса має бути унікальною. Спершу швидка перевірка, а потім САМЕ резервування
      // (правила бази не дають перезаписати чужий slug, тож навіть при одночасній
      // реєстрації двох людей другий отримає відмову). Резервуємо ДО запису профілю —
      // щоб профіль із чужою адресою не міг зберегтися. Свій же slug (повторна спроба
      // після збою) дозволений.
      const slugSnap = await get(ref(db, `slugs/${slug}`));
      if (slugSnap.exists() && slugSnap.val()?.iid !== iid) {
        setSlugError("Цей slug вже зайнятий. Оберіть інший.");
        setSaving(false); return;
      }
      try {
        await set(ref(db, `slugs/${slug}`), { iid });
      } catch {
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
      await update(iRef(""), {
        "admin_settings/profile": profile,
        "license/status":      "trial",
        "license/trialEndsAt": Date.now() + TRIAL_DAYS * 24 * 3600 * 1000,
      });
      await set(ref(db, `instructor_index/${iid}`), {
        name: profile.name, phone: profile.phone, slug, createdAt: Date.now(),
      });
      onDone(profile);
    } catch {
      setError("Помилка збереження. Перевірте з'єднання.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:BG_DEEP, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", paddingTop:"calc(20px + env(safe-area-inset-top, 0px))", paddingBottom:"calc(20px + env(safe-area-inset-bottom, 0px))" }}>
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
            <span style={{ padding:'10px 8px 10px 14px', color:DIM, fontSize:12, flexShrink:0, userSelect:'none' }}>i/</span>
            <input value={slug} onChange={e=>handleSlugChange(e.target.value)} placeholder="ivan-marchenko"
              style={{ ...INP, border:'none', borderRadius:0, padding:'10px 14px 10px 0', flex:1, minWidth:0 }}/>
          </div>
          {slugError && <div style={{ fontSize:11, color:ACCENT, marginTop:4 }}>{slugError}</div>}
          {!slugError && slug.length >= 3 && <div style={{ fontSize:11, color:DIM, marginTop:4 }}>Посилання: /i/{slug}</div>}
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

const LICENSE_PERIOD_MS = 31 * 24 * 3600 * 1000;
const LICENSE_YEAR_PERIOD_MS = 366 * 24 * 3600 * 1000;

const fmtD = (ts) => ts ? new Date(ts).toLocaleDateString("uk", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

// Рівень для сортування/фільтрів: 0 — немає ліцензії, 1 — режим читання, 2 — пільгова доба,
// 3 — скоро закінчується (≤3 дн.), 4 — все гаразд.
function licenseInfo(license) {
  if (!license) return { key: "none", text: "немає ліцензії", color: DIM, sort: 9e15, until: null, daysLeft: null };
  const st = licenseState(license);
  const tag = license.status === "trial" ? "trial" : license.status === "suspended" ? "призупинено" : "active";
  const d = st.daysLeft;
  if (st.level === "readonly") return { key: "readonly", text: license.status === "suspended" ? "режим читання (призупинено)" : "режим читання", color: ACCENT, sort: st.until || 0, ...st };
  if (st.level === "grace")    return { key: "grace",    text: "пільгова доба", color: "#f59e0b", sort: st.until || 0, ...st };
  if (st.level === "warning")  return { key: "warning",  text: `${tag} · ${d} дн.`, color: "#e8c547", sort: st.until || 0, ...st };
  return { key: license.status === "trial" ? "trial" : "active", text: st.until ? `${tag} · ${d} дн.` : tag, color: license.status === "trial" ? "#e8c547" : "#4caf6b", sort: st.until || 9e14, ...st };
}

const planLabel = (lic) => lic?.status === "trial" ? "Пробний" : lic?.plan === "yearly" ? "Рік · 2999₴" : lic?.plan === "monthly" ? "Місяць · 299₴" : "—";

function bookingStatusLabel(b) {
  if (b.cancelledBy) return { text: "скасовано", color: ACCENT };
  if (b.status === "confirmed") return { text: "підтверджено", color: "#4caf6b" };
  if (b.status === "pending")   return { text: "очікує", color: "#e8c547" };
  if (b.status === "completed") return { text: "завершено", color: DIM };
  return { text: b.status || "—", color: DIM };
}

// ─── Деталі інструктора в суперадмінці: записи, учні, суми ──────────
const fmtMoney = (n) => `${Math.round(n).toLocaleString("uk")}₴`;
const isCancelled = (b) => b.status === "cancelled" || !!b.cancelledBy;

// Ціна запису: збережена (price) або оцінка за тарифом послуги (estimated=true)
function bookingPrice(b, services) {
  if (b.price != null && b.price !== "") return { value: Number(b.price) || 0, estimated: false };
  const svc = services.find(x => x.id === b.serviceId);
  if (!svc || !svc.duration) return { value: null, estimated: false };
  const durMin = b.durMin || (b.durationHours ? b.durationHours * 60 : svc.duration);
  return { value: Math.round((svc.price || 0) / svc.duration * durMin) + (b.surcharge || 0), estimated: true };
}

function InstructorDetail({ loading, data }) {
  const [tab, setTab] = useState("bookings");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const today = new Date().toLocaleDateString("sv-SE");
  const month = today.slice(0, 7);

  const list = data?.list || [];
  const services = data?.services || [];

  const rows = list.map(b => ({ b, price: bookingPrice(b, services), cancelled: isCancelled(b) }));
  const active = rows.filter(r => !r.cancelled);
  const sum = (arr) => arr.reduce((t, r) => t + (r.price.value || 0), 0);
  const monthRows = active.filter(r => (r.b.date || "").startsWith(month));

  // Учні — з записів (ім'я/телефон/uid у записах є завжди)
  const studentMap = {};
  rows.forEach(r => {
    const key = r.b.uid || r.b.phone || r.b.studentName;
    if (!key) return;
    const st = studentMap[key] || (studentMap[key] = { key, name: r.b.studentName || "Клієнт", phone: r.b.phone || "", count: 0, cancelled: 0, sum: 0, last: "" });
    if (r.cancelled) st.cancelled++; else { st.count++; st.sum += r.price.value || 0; }
    if ((r.b.date || "") > st.last) st.last = r.b.date || "";
    if (!st.phone && r.b.phone) st.phone = r.b.phone;
  });
  const students = Object.values(studentMap).sort((a, b) => b.last.localeCompare(a.last));

  const q = query.trim().toLowerCase();
  const matchQ = (r) => !q || `${r.b.studentName || ""} ${r.b.phone || ""} ${r.b.serviceName || ""}`.toLowerCase().includes(q);
  const shown = rows.filter(r =>
    (filter === "all" ? true
      : filter === "upcoming" ? !r.cancelled && (r.b.date || "") >= today
      : filter === "past" ? !r.cancelled && (r.b.date || "") < today
      : r.cancelled) && matchQ(r));

  const chip = (id, label, cur, set) => (
    <button key={id} onClick={() => set(id)} style={{
      padding:"5px 10px", borderRadius:14, fontSize:11, fontWeight:700, cursor:"pointer",
      border:`1px solid ${cur === id ? ACCENT : BORDER}`,
      background: cur === id ? "rgba(255,90,60,0.15)" : "transparent", color: cur === id ? ACCENT : DIM,
    }}>{label}</button>
  );

  if (loading) return <div style={{ color:DIM, fontSize:12, textAlign:"center", padding:12 }}>Завантаження…</div>;

  return (
    <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${BORDER}` }}>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
        {[["Записів", active.length], ["У цьому місяці", monthRows.length], ["Учнів", students.length],
          ["Сума за місяць", fmtMoney(sum(monthRows))], ["Сума всього", fmtMoney(sum(active))]].map(([l, v]) => (
          <div key={l} style={{ flex:"1 1 80px", padding:"8px 10px", borderRadius:10, background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}` }}>
            <div style={{ fontSize:10, color:DIM }}>{l}</div>
            <div style={{ fontSize:15, fontWeight:800, color:TEXT }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {chip("bookings", `Записи · ${rows.length}`, tab, setTab)}
        {chip("students", `Учні · ${students.length}`, tab, setTab)}
      </div>

      <input value={query} onChange={e => { setQuery(e.target.value); setLimit(50); }} placeholder="Пошук: ім'я, телефон, послуга"
        style={{ width:"100%", boxSizing:"border-box", background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"8px 12px", color:TEXT, fontSize:13, outline:"none", marginBottom:10 }}/>

      {tab === "bookings" && (
        <>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
            {[["all", "Усі"], ["upcoming", "Майбутні"], ["past", "Минулі"], ["cancelled", "Скасовані"]].map(([id, l]) => chip(id, l, filter, id2 => { setFilter(id2); setLimit(50); }))}
          </div>
          {shown.length === 0 && <div style={{ color:DIM, fontSize:12, textAlign:"center", padding:12 }}>Записів нема</div>}
          {shown.slice(0, limit).map(({ b, price }) => {
            const bs = bookingStatusLabel(b);
            return (
              <div key={`${b.uid}-${b.bookingId}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, padding:"8px 0", borderBottom:`1px solid ${BORDER}` }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, color:TEXT, fontWeight:600 }}>{b.studentName || "Клієнт"} <span style={{ color:DIM, fontWeight:400 }}>· {b.serviceName || b.serviceType || ""}</span></div>
                  <div style={{ fontSize:11, color:DIM, marginTop:2 }}>{b.date || "—"} о {b.time || "—"}{b.phone ? ` · ${b.phone}` : ""}</div>
                  {b.studentNote && <div style={{ fontSize:11, color:"#e8c547", marginTop:2 }}>💬 {b.studentNote}</div>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:TEXT }}>{price.value == null ? "—" : `${price.estimated ? "≈" : ""}${fmtMoney(price.value)}`}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:bs.color }}>{bs.text}</div>
                </div>
              </div>
            );
          })}
          {shown.length > limit && (
            <button onClick={() => setLimit(l => l + 50)} style={{ width:"100%", marginTop:8, padding:"8px", borderRadius:8, background:"rgba(255,255,255,0.05)", border:`1px solid ${BORDER}`, color:TEXT, fontSize:12, fontWeight:700, cursor:"pointer" }}>
              Показати ще ({shown.length - limit})
            </button>
          )}
        </>
      )}

      {tab === "students" && (
        <>
          {students.filter(st => !q || `${st.name} ${st.phone}`.toLowerCase().includes(q)).length === 0 && (
            <div style={{ color:DIM, fontSize:12, textAlign:"center", padding:12 }}>Учнів нема</div>
          )}
          {students.filter(st => !q || `${st.name} ${st.phone}`.toLowerCase().includes(q)).map(st => (
            <div key={st.key} onClick={() => { setTab("bookings"); setFilter("all"); setQuery(st.name); }}
              style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, padding:"8px 0", borderBottom:`1px solid ${BORDER}`, cursor:"pointer" }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13, color:TEXT, fontWeight:600 }}>{st.name}</div>
                <div style={{ fontSize:11, color:DIM, marginTop:2 }}>{st.phone || "—"}{st.last ? ` · останній: ${st.last}` : ""}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontSize:13, fontWeight:800, color:TEXT }}>{fmtMoney(st.sum)}</div>
                <div style={{ fontSize:11, color:DIM }}>{st.count} зап.{st.cancelled ? ` · скас. ${st.cancelled}` : ""}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Панель вендора SaaS — список усіх зареєстрованих інструкторів (instructor_index)
// з їх поточним статусом ліцензії, і кнопки ручного продовження/призупинення
// (для інструкторів, що платять поза автоматичними LiqPay/Monobank вебхуками,
// або для пробного продовження).
export function SuperAdminScreen() {
  const [index, setIndex] = useState(null);
  const [licenses, setLicenses] = useState({});
  const [busyIid, setBusyIid] = useState(null);
  // Нічна резервна копія (functions: nightlyBackup) — вмикається тут
  const [backupOn, setBackupOn] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);
  useEffect(() => {
    const u1 = onValue(ref(db, "system/backupEnabled"), snap => setBackupOn(snap.val() === true));
    const u2 = onValue(ref(db, "system/backupStatus"), snap => setBackupStatus(snap.val()));
    return () => { u1(); u2(); };
  }, []);
  const toggleBackup = () => set(ref(db, "system/backupEnabled"), !backupOn).catch(() => alert("Не вдалося змінити налаштування резервної копії"));
  const [expandedIid, setExpandedIid] = useState(null);
  const [bookingsCache, setBookingsCache] = useState({});
  const [loadingBookingsIid, setLoadingBookingsIid] = useState(null);

  useEffect(() => {
    return onValue(ref(db, "instructor_index"), snap => setIndex(snap.val() || {}));
  }, []);

  useEffect(() => {
    if (!index) return;
    const unsubs = Object.keys(index).map(iid =>
      onValue(ref(db, `instructors/${iid}/license`), snap => {
        setLicenses(prev => ({ ...prev, [iid]: snap.val() }));
      })
    );
    return () => unsubs.forEach(u => u());
  }, [index]);

  const extend = async (iid, plan = "month") => {
    setBusyIid(iid);
    const now = Date.now();
    const lic = licenses[iid];
    const base = lic?.status === "active" && lic.expiresAt > now ? lic.expiresAt : now;
    await update(ref(db, `instructors/${iid}/license`), {
      status: "active", provider: "manual", lastPaymentAt: now,
      plan: plan === "year" ? "yearly" : "monthly",
      expiresAt: base + (plan === "year" ? LICENSE_YEAR_PERIOD_MS : LICENSE_PERIOD_MS),
    }).catch(() => {});
    setBusyIid(null);
  };

  const suspend = async (iid) => {
    setBusyIid(iid);
    await update(ref(db, `instructors/${iid}/license`), { status: "suspended" }).catch(() => {});
    setBusyIid(null);
  };

  // Записи (бронювання) інструктора — вантажимо один раз при розгортанні
  // картки і кешуємо, щоб повторний клік не робив зайвий запит.
  const toggleBookings = async (iid) => {
    if (expandedIid === iid) { setExpandedIid(null); return; }
    setExpandedIid(iid);
    if (bookingsCache[iid]) return;
    setLoadingBookingsIid(iid);
    try {
      const [snap, svcSnap] = await Promise.all([
        get(ref(db, `instructors/${iid}/bookings`)),
        get(ref(db, `instructors/${iid}/admin_data/services`)).catch(() => null),
      ]);
      const data = snap.val() || {};
      const services = Object.values(svcSnap?.val() || {});
      const list = [];
      Object.entries(data).forEach(([uid, userBookings]) => {
        if (uid === "personal" || !userBookings || typeof userBookings !== "object") return;
        Object.entries(userBookings).forEach(([bookingId, b]) => {
          if (!b) return;
          list.push({ bookingId, uid, ...b });
        });
      });
      list.sort((a, b) => `${b.date || ""}${b.time || ""}`.localeCompare(`${a.date || ""}${a.time || ""}`));
      setBookingsCache(prev => ({ ...prev, [iid]: { list, services } }));
    } catch {
      setBookingsCache(prev => ({ ...prev, [iid]: { list: [], services: [] } }));
    } finally {
      setLoadingBookingsIid(null);
    }
  };

  const [filter, setFilter] = useState("all");
  const allRows = index
    ? Object.entries(index).map(([iid, info]) => ({ iid, info, li: licenseInfo(licenses[iid]) }))
        // найтерміновіші зверху: режим читання → пільгова доба → скоро закінчується → решта за терміном
        .sort((a, b) => a.li.sort - b.li.sort)
    : [];
  const counts = allRows.reduce((acc, r) => { acc[r.li.key] = (acc[r.li.key] || 0) + 1; return acc; }, {});
  const paying = allRows.filter(r => licenses[r.iid]?.status === "active" && r.li.key !== "readonly" && r.li.key !== "grace");
  const mrr = paying.reduce((sum, r) => sum + (licenses[r.iid]?.plan === "yearly" ? 2999 / 12 : 299), 0);
  const FILTERS = [
    ["all", "Усі", allRows.length],
    ["attention", "Потребують уваги", (counts.warning || 0) + (counts.grace || 0) + (counts.readonly || 0)],
    ["active", "Активні", counts.active || 0],
    ["trial", "Trial", counts.trial || 0],
    ["readonly", "Читання", counts.readonly || 0],
  ];
  const rows = allRows.filter(r =>
    filter === "all" ? true
    : filter === "attention" ? ["warning", "grace", "readonly"].includes(r.li.key)
    : r.li.key === filter);

  return (
    <div style={{ minHeight:"100vh", background:BG_DEEP, padding:"24px 16px", paddingTop:"calc(24px + env(safe-area-inset-top, 0px))", paddingBottom:"calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ maxWidth:640, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:20, fontWeight:800, color:TEXT }}>Суперадмінка · Інструктори</div>
          <button onClick={() => signOut(auth)} style={{ background:"none", border:`1px solid ${BORDER}`, borderRadius:8, color:DIM, padding:"6px 12px", fontSize:12, cursor:"pointer" }}>
            Вийти
          </button>
        </div>

        <div style={{ background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`, borderRadius:16, padding:"14px 16px", marginBottom:14, border:`1px solid ${BORDER}`, boxShadow:SO }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>💾 Нічна резервна копія</div>
              <div style={{ fontSize:11, color:DIM, marginTop:2 }}>
                Щодня о 03:00 — записи, учні, налаштування в Cloud Storage, зберігається 30 днів
              </div>
            </div>
            <button onClick={toggleBackup} disabled={backupOn === null} aria-pressed={!!backupOn}
              style={{ flexShrink:0, width:46, height:26, borderRadius:13, border:"none", cursor:"pointer", position:"relative",
                background: backupOn ? "#4caf6b" : "rgba(255,255,255,0.15)", transition:"background .2s" }}>
              <span style={{ position:"absolute", top:3, left: backupOn ? 23 : 3, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s" }}/>
            </button>
          </div>
          <div style={{ fontSize:11, marginTop:8, color: backupStatus && backupStatus.ok === false ? ACCENT : DIM }}>
            {backupStatus
              ? (backupStatus.ok
                  ? `Остання копія: ${new Date(backupStatus.at).toLocaleString("uk")} · інструкторів: ${backupStatus.instructors} · ${(backupStatus.bytes/1024).toFixed(0)} КБ`
                  : `Помилка останньої копії (${new Date(backupStatus.at).toLocaleString("uk")}): ${backupStatus.error || "—"}`)
              : (backupOn ? "Перша копія буде створена найближчої ночі" : "Вимкнено — копії не створюються")}
          </div>
        </div>

        {index === null && <div style={{ color:DIM, textAlign:"center", padding:40 }}>Завантаження…</div>}
        {index !== null && rows.length === 0 && (
          <div style={{ color:DIM, textAlign:"center", padding:40 }}>Ще немає зареєстрованих інструкторів</div>
        )}

        {index !== null && allRows.length > 0 && (
          <>
            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              {[["Інструкторів", allRows.length], ["Платних", paying.length], ["≈ дохід/міс", `${Math.round(mrr)}₴`]].map(([l, v]) => (
                <div key={l} style={{ flex:"1 1 90px", padding:"10px 12px", borderRadius:12, background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`, border:`1px solid ${BORDER}`, boxShadow:SO }}>
                  <div style={{ fontSize:11, color:DIM }}>{l}</div>
                  <div style={{ fontSize:18, fontWeight:800, color:TEXT }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
              {FILTERS.map(([id, label, n]) => (
                <button key={id} onClick={() => setFilter(id)} style={{
                  padding:"6px 11px", borderRadius:16, fontSize:12, fontWeight:700, cursor:"pointer",
                  border:`1px solid ${filter === id ? ACCENT : BORDER}`,
                  background: filter === id ? "rgba(255,90,60,0.15)" : "transparent",
                  color: filter === id ? ACCENT : DIM,
                }}>{label} · {n}</button>
              ))}
            </div>
          </>
        )}

        {rows.map(({ iid, info, li: st }) => {
          const lic = licenses[iid];
          const busy = busyIid === iid;
          return (
            <div key={iid} style={{ background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`, borderRadius:16, padding:"16px 18px", marginBottom:12, border:`1px solid ${BORDER}`, boxShadow:SO }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:TEXT }}>{info.name || "—"}</div>
                  <div style={{ fontSize:12, color:DIM, marginTop:2 }}>{info.phone || "—"} · /i/{info.slug || "—"}</div>
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:st.color, textAlign:"right" }}>{st.text}</div>
              </div>
              {lic && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 14px", marginTop:10, fontSize:11, color:DIM }}>
                  <span>{lic.status === "trial" ? "Trial до" : "Оплачено до"}: <b style={{ color:TEXT }}>{fmtD(st.until)}</b></span>
                  <span>Тариф: <b style={{ color:TEXT }}>{planLabel(lic)}</b></span>
                  {lic.lastPaymentAt && <span>Остання оплата: <b style={{ color:TEXT }}>{fmtD(lic.lastPaymentAt)}</b>{lic.provider ? ` (${lic.provider})` : ""}</span>}
                </div>
              )}
              <div style={{ display:"flex", gap:6, marginTop:12 }}>
                <button onClick={() => extend(iid, "month")} disabled={busy}
                  style={{ flex:1, padding:"8px", borderRadius:8, background:"rgba(76,175,107,0.15)", border:`1px solid rgba(76,175,107,0.3)`, color:"#4caf6b", fontSize:12, fontWeight:700, cursor: busy?"default":"pointer" }}>
                  + Місяць
                </button>
                <button onClick={() => extend(iid, "year")} disabled={busy}
                  style={{ flex:1, padding:"8px", borderRadius:8, background:"rgba(76,175,107,0.15)", border:`1px solid rgba(76,175,107,0.3)`, color:"#4caf6b", fontSize:12, fontWeight:700, cursor: busy?"default":"pointer" }}>
                  + Рік
                </button>
                <button onClick={() => suspend(iid)} disabled={busy || lic?.status === "suspended"}
                  style={{ flex:1, padding:"8px", borderRadius:8, background:"rgba(255,90,60,0.1)", border:`1px solid rgba(255,90,60,0.25)`, color:ACCENT, fontSize:12, fontWeight:700, cursor: (busy||lic?.status==="suspended")?"default":"pointer", opacity: lic?.status==="suspended"?0.5:1 }}>
                  Призупинити
                </button>
                <button onClick={() => toggleBookings(iid)}
                  style={{ flex:1, padding:"8px", borderRadius:8, background:"rgba(255,255,255,0.05)", border:`1px solid ${BORDER}`, color:TEXT, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  {expandedIid === iid ? "Сховати записи" : "📋 Записи"}
                </button>
              </div>

              {expandedIid === iid && (
                <InstructorDetail loading={loadingBookingsIid === iid} data={bookingsCache[iid]} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
