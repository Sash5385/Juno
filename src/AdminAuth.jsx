import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, onValue, update, set, remove } from "firebase/database";
import { auth, iRef, db } from "./firebase";
import { licenseState } from "./hooks/useLicense";
import { LOGIN_CSS } from "./loginStyles";
import { APP_VERSION } from "./version";

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
    <div className="lg-wrap lg-v1">
      <style>{LOGIN_CSS}</style>
      <div className="lg-bg" aria-hidden="true"><i/><i/><i/></div>
      <div className="lg-card">
        <div className="lg-head">
          <img className="lg-logo" src="/icon-192.png" alt="DrivePad"/>
          <div className="lg-title">DrivePad</div>
          <div className="lg-sub">{registering ? "Реєстрація інструктора · 14 днів безкоштовно" : "Вхід для інструктора"}</div>
        </div>
        <div className="lg-body">
          <div className="lg-field">
            <label className="lg-label" htmlFor="lg-email">Email</label>
            <input id="lg-email" className="lg-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} autoComplete="email"/>
          </div>
          <div className="lg-field">
            <label className="lg-label" htmlFor="lg-pass">Пароль</label>
            <input id="lg-pass" className="lg-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} autoComplete={registering ? "new-password" : "current-password"}/>
          </div>
          {registering && (
            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-pass2">Повторіть пароль</label>
              <input id="lg-pass2" className="lg-input" type="password" value={password2} onChange={e=>setPassword2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} autoComplete="new-password"/>
            </div>
          )}
          {!registering && <div className="lg-forgot"><button onClick={resetPassword}>Забули пароль?</button></div>}
          {error && <div className="lg-error">{error}</div>}
          {info && <div className="lg-info">{info}</div>}
          <button className="lg-btn" onClick={login} disabled={loading||!email||!password||(registering&&!password2)}>
            {loading ? (registering ? "Реєстрація..." : "Вхід...") : (registering ? "Зареєструватись" : "Увійти")}
          </button>
          {IOS_STANDALONE ? (
            <div className="lg-note">Вхід через Google недоступний у встановленому застосунку на iPhone (обмеження iOS). Скористайтесь email і паролем.</div>
          ) : (
            <>
              <div className="lg-or">або</div>
              <button className="lg-google" onClick={googleSignIn} disabled={loading}>
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
          <div className="lg-switch">
            {registering ? "Уже є акаунт? " : "Ще немає акаунта? "}
            <button onClick={() => { setMode(registering ? "login" : "register"); setError(""); setInfo(""); setPassword2(""); }}>
              {registering ? "Увійти" : "Зареєструватись"}
            </button>
          </div>
          {installPrompt && !installed && (
            <button className="lg-install" onClick={handleInstallClick}>📲 Встановити застосунок</button>
          )}
        </div>
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

const DAY_MS = 86400000;
const dayKey = (ts) => new Date(ts).toLocaleDateString("sv-SE");
// Коли запис створено: createdAt або (запасний варіант) дата уроку
const bookingCreatedTs = (b) => b.createdAt || (b.date ? new Date(`${b.date}T12:00:00`).getTime() : 0);
const INACTIVE_DAYS = 14;

// Кількість нових записів по днях за останні `days` днів
function bookingsPerDay(lists, days = 30) {
  const buckets = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) buckets[dayKey(now - i * DAY_MS)] = 0;
  lists.forEach(list => list.forEach(b => {
    if (b.uid === "personal" || isCancelled(b)) return;
    const k = dayKey(bookingCreatedTs(b));
    if (k in buckets) buckets[k]++;
  }));
  return Object.entries(buckets).map(([k, v]) => ({ label: k.slice(5).replace("-", "."), value: v }));
}

function BarChart({ data, height = 56 }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:2, height }}>
        {data.map((d, i) => (
          <div key={i} title={`${d.label}: ${d.value}`} style={{
            flex:1, minWidth:2, height: Math.max(2, (d.value / max) * height), borderRadius:2,
            background: d.value ? "#4caf6b" : "rgba(255,255,255,0.08)",
          }}/>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:DIM, marginTop:3 }}>
        <span>{data[0]?.label}</span><span>макс. {max} за день</span><span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
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

      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:10, color:DIM, marginBottom:4 }}>Нові записи за 30 днів</div>
        <BarChart data={bookingsPerDay([list], 30)} />
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
  const [backupRequestedAt, setBackupRequestedAt] = useState(0);
  // Звернення з форми на лендингу (function submitContact → system/contactMessages)
  const [messages, setMessages] = useState([]);
  useEffect(() => onValue(ref(db, "system/contactMessages"), snap => {
    const v = snap.val() || {};
    setMessages(Object.entries(v).map(([id, m]) => ({ id, ...m })).sort((a, b) => b.at - a.at));
  }), []);
  const newMessages = messages.filter(m => m.status !== "done").length;
  // Копія "зараз": чекаємо, поки статус оновиться пізніше за запит (максимум 10 хв)
  const backupPending = backupRequestedAt > (backupStatus?.at || 0) && Date.now() - backupRequestedAt < 10 * 60000;
  const backupNow = () => set(ref(db, "system/backupRequest"), Date.now()).catch(() => alert("Не вдалося запустити копію"));
  useEffect(() => {
    const u1 = onValue(ref(db, "system/backupEnabled"), snap => setBackupOn(snap.val() === true));
    const u2 = onValue(ref(db, "system/backupStatus"), snap => setBackupStatus(snap.val()));
    const u3 = onValue(ref(db, "system/backupRequest"), snap => setBackupRequestedAt(snap.val() || 0));
    return () => { u1(); u2(); u3(); };
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

  // Зменшити термін на місяць (скасувати помилково додану оплату). Для trial — trialEndsAt.
  const shrink = async (iid) => {
    const lic = licenses[iid];
    const field = lic?.status === "trial" ? "trialEndsAt" : "expiresAt";
    if (!lic || !lic[field]) return;
    if (!window.confirm("Зменшити термін підписки на місяць?")) return;
    setBusyIid(iid);
    await update(ref(db, `instructors/${iid}/license`), { [field]: lic[field] - LICENSE_PERIOD_MS }).catch(() => {});
    setBusyIid(null);
  };

  const suspend = async (iid) => {
    if (!window.confirm("Призупинити підписку? Інструктор перейде в режим читання одразу.")) return;
    setBusyIid(iid);
    await update(ref(db, `instructors/${iid}/license`), { status: "suspended" }).catch(() => {});
    setBusyIid(null);
  };

  // Записи (бронювання) інструктора — вантажимо один раз при розгортанні
  // картки і кешуємо, щоб повторний клік не робив зайвий запит.
  const fetchInstructorBookings = async (iid) => {
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
      return { list, services };
    } catch {
      return { list: [], services: [] };
    }
  };

  const toggleBookings = async (iid) => {
    if (expandedIid === iid) { setExpandedIid(null); return; }
    setExpandedIid(iid);
    if (bookingsCache[iid]) return;
    setLoadingBookingsIid(iid);
    const res = await fetchInstructorBookings(iid);
    setBookingsCache(prev => ({ ...prev, [iid]: res }));
    setLoadingBookingsIid(null);
  };

  // Статистика по всіх інструкторах: вантажимо записи тих, кого ще нема в кеші (по 5 паралельно)
  const [statsLoading, setStatsLoading] = useState(false);
  const loadAllStats = async () => {
    setStatsLoading(true);
    const missing = Object.keys(index || {}).filter(id => !bookingsCache[id]);
    for (let i = 0; i < missing.length; i += 5) {
      const chunk = missing.slice(i, i + 5);
      const results = await Promise.all(chunk.map(id => fetchInstructorBookings(id)));
      setBookingsCache(prev => { const n = { ...prev }; chunk.forEach((id, k) => { n[id] = results[k]; }); return n; });
    }
    setStatsLoading(false);
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
  const statsReady = allRows.length > 0 && allRows.every(r => bookingsCache[r.iid]);
  // Неактивний: акаунт старший за INACTIVE_DAYS, а нових записів за цей час не було
  const isInactive = (iid, info) => {
    const c = bookingsCache[iid];
    if (!c) return false;
    if ((info?.createdAt || 0) > Date.now() - INACTIVE_DAYS * DAY_MS) return false;
    const last = Math.max(0, ...c.list.filter(b => !isCancelled(b)).map(bookingCreatedTs));
    return last < Date.now() - INACTIVE_DAYS * DAY_MS;
  };
  const inactiveCount = statsReady ? allRows.filter(r => isInactive(r.iid, r.info)).length : null;
  const payments = [];
  Object.entries(licenses).forEach(([iid, lic]) => {
    Object.entries(lic?.paymentLog || {}).forEach(([key, p]) => {
      payments.push({ key, iid, name: index?.[iid]?.name || "—", ...p });
    });
  });
  payments.sort((a, b) => b.at - a.at);
  const FILTERS = [
    ["all", "Усі", allRows.length],
    ["attention", "Потребують уваги", (counts.warning || 0) + (counts.grace || 0) + (counts.readonly || 0)],
    ["active", "Активні", counts.active || 0],
    ["trial", "Trial", counts.trial || 0],
    ["readonly", "Читання", counts.readonly || 0],
    ["inactive", "Неактивні", inactiveCount == null ? "?" : inactiveCount],
  ];
  const rows = allRows.filter(r =>
    filter === "all" ? true
    : filter === "attention" ? ["warning", "grace", "readonly"].includes(r.li.key)
    : filter === "inactive" ? isInactive(r.iid, r.info)
    : r.li.key === filter);

  const TABS = [
    ["overview", "🏠", "Огляд", "#5b9bff"],
    ["instructors", "👥", "Інструктори", "#4caf6b"],
    ["payments", "💳", "Платежі", "#f7c948"],
    ["messages", "📨", "Звернення", "#2dd4bf"],
    ["service", "⚙️", "Сервіс", "#c084fc"],
  ];
  const [section, setSection] = useState(() => { try { return sessionStorage.getItem("sa_tab") || "overview"; } catch { return "overview"; } });
  const go = (id, f) => {
    setSection(id);
    if (f) setFilter(f);
    try { sessionStorage.setItem("sa_tab", id); } catch { /* sessionStorage недоступний */ }
    window.scrollTo?.({ top: 0 });
  };
  const tint = (c, pct = 34) => `linear-gradient(135deg,color-mix(in srgb,${c} ${pct}%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`;
  const tile = (label, value, color, sub, onClick) => (
    <div key={label} onClick={onClick} style={{
      flex:"1 1 140px", padding:"12px 14px", borderRadius:14, cursor: onClick ? "pointer" : "default",
      background: tint(color), border:`1px solid color-mix(in srgb,${color} 45%,transparent)`, boxShadow:SO,
    }}>
      <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)" }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", marginTop:2 }}>{sub}</div>}
    </div>
  );
  const panel = (color, children, extra = {}) => (
    <div style={{ background: tint(color, 18), borderRadius:16, padding:"14px 16px", marginBottom:14, border:`1px solid color-mix(in srgb,${color} 30%,transparent)`, boxShadow:SO, ...extra }}>{children}</div>
  );
  const attentionRows = allRows.filter(r => ["warning", "grace", "readonly"].includes(r.li.key));
  const payTotal = payments.filter(p => !p.reversedAt).reduce((t, p) => t + (p.periodMs > 40 * DAY_MS ? 2999 : 299), 0);

  return (
    <div style={{ minHeight:"100vh", background:BG_DEEP, paddingBottom:"calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ position:"sticky", top:0, zIndex:30, background:BG_DEEP, padding:"calc(12px + env(safe-area-inset-top, 0px)) 16px 10px", borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:18, fontWeight:800, color:TEXT }}>🛰️ Суперадмінка</div>
            <button onClick={() => signOut(auth)} style={{ background:"none", border:`1px solid ${BORDER}`, borderRadius:8, color:DIM, padding:"5px 11px", fontSize:12, cursor:"pointer" }}>Вийти</button>
          </div>
          <div style={{ display:"flex", gap:6, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
            {TABS.map(([id, icon, label, color]) => {
              const on = section === id;
              const badge = id === "instructors" ? allRows.length : id === "payments" ? payments.length : id === "messages" ? (newMessages || null) : id === "overview" && attentionRows.length ? attentionRows.length : null;
              return (
                <button key={id} onClick={() => go(id)} style={{
                  flex:"1 0 auto", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                  padding:"8px 12px", borderRadius:12, fontSize:13, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap",
                  border:`1.5px solid ${on ? color : "transparent"}`,
                  background: on ? `color-mix(in srgb,${color} 22%,${BG_DEEP})` : "rgba(255,255,255,0.04)",
                  color: on ? color : DIM,
                }}>
                  <span>{icon}</span>{label}
                  {badge != null && <span style={{ fontSize:10, padding:"1px 6px", borderRadius:9, background: on ? color : "rgba(255,255,255,0.12)", color: on ? "#0b0b0d" : TEXT }}>{badge}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:"0 auto", padding:"16px 16px 0" }}>
        {index === null && <div style={{ color:DIM, textAlign:"center", padding:40 }}>Завантаження…</div>}

        {section === "overview" && index !== null && (
          <>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
              {tile("Інструкторів", allRows.length, "#5b9bff", `trial: ${counts.trial || 0}`, () => go("instructors", "all"))}
              {tile("Платних", paying.length, "#4caf6b", "активні підписки", () => go("instructors", "active"))}
              {tile("≈ Дохід / міс", `${Math.round(mrr)}₴`, "#f7c948", "за тарифами 299 / 2999")}
              {tile("Потребують уваги", attentionRows.length, attentionRows.length ? "#ff5a3c" : "#4caf6b", "закінчуються / прострочені", () => go("instructors", "attention"))}
              {tile("Неактивні", inactiveCount == null ? "?" : inactiveCount, "#c084fc", `без записів ${INACTIVE_DAYS}+ дн.`, () => go("instructors", "inactive"))}
              {tile("Платежів", payments.length, "#2dd4bf", payments.length ? `≈ ${payTotal}₴ за тарифами` : "журнал з v01.10.8", () => go("payments"))}
            </div>

            {panel("#4caf6b", <>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom: statsReady ? 10 : 0 }}>
                <div style={{ fontSize:14, fontWeight:800, color:TEXT }}>📊 Нові записи за 30 днів</div>
                {!statsReady && (
                  <button onClick={loadAllStats} disabled={statsLoading || !allRows.length}
                    style={{ padding:"6px 12px", borderRadius:8, background:"rgba(76,175,107,0.2)", border:"1px solid rgba(76,175,107,0.45)", color:"#4caf6b", fontSize:12, fontWeight:700, cursor: statsLoading ? "default" : "pointer" }}>
                    {statsLoading ? "Завантаження…" : "Завантажити"}
                  </button>
                )}
              </div>
              {statsReady ? (() => {
                const data = bookingsPerDay(allRows.map(r => bookingsCache[r.iid].list), 30);
                const total30 = data.reduce((t, d) => t + d.value, 0);
                return (<>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginBottom:6 }}>Усього нових записів: <b style={{ color:TEXT }}>{total30}</b></div>
                  <BarChart data={data} height={70} />
                </>);
              })() : <div style={{ fontSize:11, color:"rgba(255,255,255,0.55)", marginTop:6 }}>Завантажує записи всіх інструкторів один раз — потрібно для графіка та «Неактивні».</div>}
            </>)}

            {panel(attentionRows.length ? "#ff5a3c" : "#4caf6b", <>
              <div style={{ fontSize:14, fontWeight:800, color:TEXT, marginBottom:8 }}>{attentionRows.length ? "⚠️ Потребують уваги" : "✅ Усе гаразд — нема прострочених підписок"}</div>
              {attentionRows.slice(0, 8).map(({ iid, info, li: st }) => (
                <div key={iid} onClick={() => go("instructors", "attention")} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"7px 0", borderTop:`1px solid ${BORDER}`, cursor:"pointer" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:TEXT }}>{info.name || "—"}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:st.color, textAlign:"right" }}>{st.text}</div>
                </div>
              ))}
            </>)}
          </>
        )}

        {section === "instructors" && index !== null && (
          <>
            {allRows.length === 0 && <div style={{ color:DIM, textAlign:"center", padding:40 }}>Ще немає зареєстрованих інструкторів</div>}
            {allRows.length > 0 && (
              <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
                {FILTERS.map(([id, label, n]) => {
                  const col = { all:"#5b9bff", attention:"#ff5a3c", active:"#4caf6b", trial:"#f7c948", readonly:"#ef4444", inactive:"#c084fc" }[id];
                  const on = filter === id;
                  return (
                    <button key={id} onClick={() => setFilter(id)} style={{
                      padding:"6px 11px", borderRadius:16, fontSize:12, fontWeight:700, cursor:"pointer",
                      border:`1px solid ${on ? col : BORDER}`,
                      background: on ? `color-mix(in srgb,${col} 22%,${BG_DEEP})` : "transparent",
                      color: on ? col : DIM,
                    }}>{label} · {n}</button>
                  );
                })}
              </div>
            )}
        {rows.map(({ iid, info, li: st }) => {
          const lic = licenses[iid];
          const busy = busyIid === iid;
          return (
            <div key={iid} style={{ background:`linear-gradient(135deg,color-mix(in srgb,${st.color} 14%,${SURF_HI}),${SURFACE})`, borderRadius:16, padding:"16px 18px", marginBottom:12, border:`1px solid color-mix(in srgb,${st.color} 28%,transparent)`, borderLeft:`5px solid ${st.color}`, boxShadow:SO }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:TEXT }}>{info.name || "—"}</div>
                  <div style={{ fontSize:12, color:DIM, marginTop:2 }}>{info.phone || "—"} · /i/{info.slug || "—"}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:st.color }}>{st.text}</div>
                  {isInactive(iid, info) && <div style={{ fontSize:10, color:"#e8c547", marginTop:2 }}>💤 без нових записів {INACTIVE_DAYS}+ дн.</div>}
                </div>
              </div>
              {lic && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 14px", marginTop:10, fontSize:11, color:DIM }}>
                  <span>{lic.status === "trial" ? "Trial до" : "Оплачено до"}: <b style={{ color:TEXT }}>{fmtD(st.until)}</b></span>
                  <span>Тариф: <b style={{ color:TEXT }}>{planLabel(lic)}</b></span>
                  {lic.lastPaymentAt && <span>Остання оплата: <b style={{ color:TEXT }}>{fmtD(lic.lastPaymentAt)}</b>{lic.provider ? ` (${lic.provider})` : ""}</span>}
                </div>
              )}
              <div style={{ display:"flex", gap:6, marginTop:12, flexWrap:"wrap" }}>
                <button onClick={() => extend(iid, "month")} disabled={busy}
                  style={{ flex:"1 1 70px", padding:"8px", borderRadius:8, background:"rgba(76,175,107,0.15)", border:`1px solid rgba(76,175,107,0.3)`, color:"#4caf6b", fontSize:12, fontWeight:700, cursor: busy?"default":"pointer" }}>
                  + Місяць
                </button>
                <button onClick={() => extend(iid, "year")} disabled={busy}
                  style={{ flex:"1 1 70px", padding:"8px", borderRadius:8, background:"rgba(76,175,107,0.15)", border:`1px solid rgba(76,175,107,0.3)`, color:"#4caf6b", fontSize:12, fontWeight:700, cursor: busy?"default":"pointer" }}>
                  + Рік
                </button>
                <button onClick={() => shrink(iid)} disabled={busy || !lic || !(lic.status === "trial" ? lic.trialEndsAt : lic.expiresAt)}
                  style={{ flex:"1 1 70px", padding:"8px", borderRadius:8, background:"rgba(247,201,72,0.12)", border:"1px solid rgba(247,201,72,0.35)", color:"#f7c948", fontSize:12, fontWeight:700, cursor: busy?"default":"pointer" }}>
                  − Місяць
                </button>
                <button onClick={() => suspend(iid)} disabled={busy || lic?.status === "suspended"}
                  style={{ flex:"1 1 70px", padding:"8px", borderRadius:8, background:"rgba(255,90,60,0.1)", border:`1px solid rgba(255,90,60,0.25)`, color:ACCENT, fontSize:12, fontWeight:700, cursor: (busy||lic?.status==="suspended")?"default":"pointer", opacity: lic?.status==="suspended"?0.5:1 }}>
                  Призупинити
                </button>
                <button onClick={() => toggleBookings(iid)}
                  style={{ flex:"1 1 70px", padding:"8px", borderRadius:8, background:"rgba(91,155,255,0.15)", border:"1px solid rgba(91,155,255,0.35)", color:"#5b9bff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  {expandedIid === iid ? "Сховати записи" : "📋 Записи"}
                </button>
              </div>

              {expandedIid === iid && (
                <InstructorDetail loading={loadingBookingsIid === iid} data={bookingsCache[iid]} />
              )}
            </div>
          );
        })}
          </>
        )}

        {section === "payments" && (
          <>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
              {tile("Платежів", payments.length, "#2dd4bf", "у журналі")}
              {tile("≈ Сума", `${payTotal}₴`, "#f7c948", "за тарифами, без повернених")}
              {tile("Повернень", payments.filter(p => p.reversedAt).length, "#ff5a3c")}
            </div>
            {panel("#f7c948", <>
              {payments.length === 0 && <div style={{ fontSize:12, color:DIM }}>Поки немає платежів у журналі (він ведеться з оновлення v01.10.8).</div>}
              {payments.slice(0, 50).map(p => (
                <div key={`${p.iid}-${p.key}`} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"8px 0", borderBottom:`1px solid ${BORDER}`, opacity: p.reversedAt ? 0.55 : 1 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, color:TEXT, fontWeight:700 }}>{p.name}</div>
                    <div style={{ fontSize:11, color:DIM }}>{new Date(p.at).toLocaleString("uk")} · {p.provider}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:TEXT }}>{p.periodMs > 40 * DAY_MS ? "Рік · 2999₴" : "Місяць · 299₴"}</div>
                    <div style={{ fontSize:11, fontWeight:700, color: p.reversedAt ? ACCENT : "#4caf6b" }}>{p.reversedAt ? "повернено" : "до " + fmtD(p.newExpiresAt)}</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize:10, color:DIM, marginTop:8 }}>Сума в журналі — тарифна; тестові платежі по 1₴ показані за тарифом.</div>
            </>)}
          </>
        )}

        {section === "messages" && (
          <>
            {messages.length === 0 && panel("#2dd4bf", <div style={{ fontSize:13, color:"rgba(255,255,255,0.65)" }}>Поки немає звернень з форми на лендингу.</div>)}
            {messages.slice(0, 100).map(m => (
              <div key={m.id}>{panel(m.status === "done" ? "#5a5c62" : "#2dd4bf", <>
                <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"flex-start" }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:800, color:TEXT }}>{m.name}</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginTop:2 }}>
                      <a href={`mailto:${m.email}`} style={{ color:"#2dd4bf" }}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ""} · {new Date(m.at).toLocaleString("uk")}
                    </div>
                  </div>
                  <div style={{ fontSize:11, fontWeight:800, color: m.status === "done" ? DIM : "#2dd4bf", flexShrink:0 }}>{m.status === "done" ? "оброблено" : "нове"}</div>
                </div>
                <div style={{ fontSize:13, color:TEXT, marginTop:10, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{m.message}</div>
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button onClick={() => update(ref(db, `system/contactMessages/${m.id}`), { status: m.status === "done" ? "new" : "done" }).catch(() => {})}
                    style={{ flex:1, padding:"8px", borderRadius:8, background:"rgba(45,212,191,0.15)", border:"1px solid rgba(45,212,191,0.4)", color:"#2dd4bf", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    {m.status === "done" ? "↩ Повернути в нові" : "✓ Оброблено"}
                  </button>
                  <button onClick={() => { if (window.confirm("Видалити звернення?")) remove(ref(db, `system/contactMessages/${m.id}`)).catch(() => {}); }}
                    style={{ padding:"8px 14px", borderRadius:8, background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.4)", color:"#f87171", fontSize:12, fontWeight:700, cursor:"pointer" }}>Видалити</button>
                </div>
              </>, { marginBottom:12 })}</div>
            ))}
          </>
        )}

        {section === "service" && (
          <>
            {panel("#c084fc", <>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:TEXT }}>💾 Нічна резервна копія</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:2 }}>
                    Щодня о 03:00 — записи, учні, налаштування в Cloud Storage, зберігається 30 днів
                  </div>
                </div>
                <button onClick={toggleBackup} disabled={backupOn === null} aria-pressed={!!backupOn}
                  style={{ flexShrink:0, width:46, height:26, borderRadius:13, border:"none", cursor:"pointer", position:"relative",
                    background: backupOn ? "#4caf6b" : "rgba(255,255,255,0.15)", transition:"background .2s" }}>
                  <span style={{ position:"absolute", top:3, left: backupOn ? 23 : 3, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s" }}/>
                </button>
              </div>
              <div style={{ fontSize:11, marginTop:8, color: backupStatus && backupStatus.ok === false ? ACCENT : "rgba(255,255,255,0.6)" }}>
                {backupStatus
                  ? (backupStatus.ok
                      ? `Остання копія: ${new Date(backupStatus.at).toLocaleString("uk")} · інструкторів: ${backupStatus.instructors} · ${(backupStatus.bytes/1024).toFixed(0)} КБ`
                      : `Помилка останньої копії (${new Date(backupStatus.at).toLocaleString("uk")}): ${backupStatus.error || "—"}`)
                  : (backupOn ? "Перша копія буде створена найближчої ночі" : "Вимкнено — копії не створюються")}
              </div>
              <button onClick={backupNow} disabled={backupPending}
                style={{ marginTop:12, width:"100%", padding:"11px", borderRadius:12, cursor: backupPending ? "default" : "pointer", fontSize:13, fontWeight:800,
                  background: backupPending ? "rgba(255,255,255,0.08)" : "rgba(192,132,252,0.18)", border:"1px solid rgba(192,132,252,0.5)", color:"#c084fc" }}>
                {backupPending ? "⏳ Копія створюється…" : "💾 Зробити копію зараз"}
              </button>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", marginTop:6 }}>Працює незалежно від тумблера. Файли: Storage → backups/дата/</div>
            </>)}
            {panel("#5b9bff", <>
              <div style={{ fontSize:14, fontWeight:800, color:TEXT, marginBottom:6 }}>ℹ️ Акаунт</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", lineHeight:1.7 }}>
                Вхід: <b style={{ color:TEXT }}>{auth.currentUser?.email || "—"}</b><br/>
                Версія застосунку: <b style={{ color:TEXT }}>{APP_VERSION}</b>
              </div>
              <button onClick={() => signOut(auth)} style={{ marginTop:12, width:"100%", padding:"11px", borderRadius:12, background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.4)", color:"#f87171", fontSize:13, fontWeight:800, cursor:"pointer" }}>Вийти з акаунта</button>
            </>)}
          </>
        )}
      </div>
    </div>
  );
}
