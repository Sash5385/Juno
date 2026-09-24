import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, onValue, update, set } from "firebase/database";
import { auth, iRef, db } from "./firebase";

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

export function LoginScreen() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

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
    <div style={{ minHeight:"100vh", background:BG_DEEP, display:"flex", alignItems:"center", justifyContent:"center", paddingTop:"env(safe-area-inset-top, 0px)", paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
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
      await update(iRef(""), {
        "admin_settings/profile": profile,
        "license/status":      "trial",
        "license/trialEndsAt": Date.now() + TRIAL_DAYS * 24 * 3600 * 1000,
      });
      await set(ref(db, `slugs/${slug}`), { iid });
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

function licenseStatusLabel(license) {
  if (!license) return { text: "немає ліцензії", color: DIM };
  const now = Date.now();
  if (license.status === "suspended") return { text: "призупинено", color: ACCENT };
  if (license.status === "trial") {
    const left = Math.ceil(((license.trialEndsAt || 0) - now) / 86400000);
    return left > 0 ? { text: `trial · ${left} дн.`, color: "#e8c547" } : { text: "trial сплив", color: ACCENT };
  }
  if (license.status === "active") {
    const left = Math.ceil(((license.expiresAt || 0) - now) / 86400000);
    return left > 0 ? { text: `active · ${left} дн.`, color: "#4caf6b" } : { text: "active сплив", color: ACCENT };
  }
  return { text: license.status || "?", color: DIM };
}

function bookingStatusLabel(b) {
  if (b.cancelledBy) return { text: "скасовано", color: ACCENT };
  if (b.status === "confirmed") return { text: "підтверджено", color: "#4caf6b" };
  if (b.status === "pending")   return { text: "очікує", color: "#e8c547" };
  if (b.status === "completed") return { text: "завершено", color: DIM };
  return { text: b.status || "—", color: DIM };
}

// Панель вендора SaaS — список усіх зареєстрованих інструкторів (instructor_index)
// з їх поточним статусом ліцензії, і кнопки ручного продовження/призупинення
// (для інструкторів, що платять поза автоматичними LiqPay/Monobank вебхуками,
// або для пробного продовження).
export function SuperAdminScreen() {
  const [index, setIndex] = useState(null);
  const [licenses, setLicenses] = useState({});
  const [busyIid, setBusyIid] = useState(null);
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

  const extend = async (iid) => {
    setBusyIid(iid);
    const now = Date.now();
    const lic = licenses[iid];
    const base = lic?.status === "active" && lic.expiresAt > now ? lic.expiresAt : now;
    await update(ref(db, `instructors/${iid}/license`), {
      status: "active", provider: "manual", lastPaymentAt: now,
      expiresAt: base + LICENSE_PERIOD_MS,
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
      const snap = await get(ref(db, `instructors/${iid}/bookings`));
      const data = snap.val() || {};
      const list = [];
      Object.entries(data).forEach(([uid, userBookings]) => {
        if (uid === "personal" || !userBookings || typeof userBookings !== "object") return;
        Object.entries(userBookings).forEach(([bookingId, b]) => {
          if (!b) return;
          list.push({ bookingId, uid, ...b });
        });
      });
      list.sort((a, b) => `${b.date || ""}${b.time || ""}`.localeCompare(`${a.date || ""}${a.time || ""}`));
      setBookingsCache(prev => ({ ...prev, [iid]: list }));
    } catch {
      setBookingsCache(prev => ({ ...prev, [iid]: [] }));
    } finally {
      setLoadingBookingsIid(null);
    }
  };

  const rows = index ? Object.entries(index).sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0)) : [];

  return (
    <div style={{ minHeight:"100vh", background:BG_DEEP, padding:"24px 16px", paddingTop:"calc(24px + env(safe-area-inset-top, 0px))", paddingBottom:"calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ maxWidth:640, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:20, fontWeight:800, color:TEXT }}>Суперадмінка · Інструктори</div>
          <button onClick={() => signOut(auth)} style={{ background:"none", border:`1px solid ${BORDER}`, borderRadius:8, color:DIM, padding:"6px 12px", fontSize:12, cursor:"pointer" }}>
            Вийти
          </button>
        </div>

        {index === null && <div style={{ color:DIM, textAlign:"center", padding:40 }}>Завантаження…</div>}
        {index !== null && rows.length === 0 && (
          <div style={{ color:DIM, textAlign:"center", padding:40 }}>Ще немає зареєстрованих інструкторів</div>
        )}

        {rows.map(([iid, info]) => {
          const lic = licenses[iid];
          const st = licenseStatusLabel(lic);
          const busy = busyIid === iid;
          return (
            <div key={iid} style={{ background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`, borderRadius:16, padding:"16px 18px", marginBottom:12, border:`1px solid ${BORDER}`, boxShadow:SO }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:TEXT }}>{info.name || "—"}</div>
                  <div style={{ fontSize:12, color:DIM, marginTop:2 }}>{info.phone || "—"} · /i/{info.slug || "—"}</div>
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:st.color, whiteSpace:"nowrap" }}>{st.text}</div>
              </div>
              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <button onClick={() => extend(iid)} disabled={busy}
                  style={{ flex:1, padding:"8px", borderRadius:8, background:"rgba(76,175,107,0.15)", border:`1px solid rgba(76,175,107,0.3)`, color:"#4caf6b", fontSize:12, fontWeight:700, cursor: busy?"default":"pointer" }}>
                  + Продовжити на місяць
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
                <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${BORDER}` }}>
                  {loadingBookingsIid === iid && <div style={{ color:DIM, fontSize:12, textAlign:"center", padding:12 }}>Завантаження…</div>}
                  {loadingBookingsIid !== iid && (bookingsCache[iid]?.length ?? 0) === 0 && (
                    <div style={{ color:DIM, fontSize:12, textAlign:"center", padding:12 }}>Записів нема</div>
                  )}
                  {loadingBookingsIid !== iid && bookingsCache[iid]?.map(b => {
                    const bs = bookingStatusLabel(b);
                    return (
                      <div key={`${b.uid}-${b.bookingId}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, padding:"8px 0", borderBottom:`1px solid ${BORDER}` }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:13, color:TEXT, fontWeight:600 }}>{b.studentName || "Клієнт"} <span style={{color:DIM, fontWeight:400}}>· {b.serviceName || b.serviceType || ""}</span></div>
                          <div style={{ fontSize:11, color:DIM, marginTop:2 }}>{b.date || "—"} о {b.time || "—"}{b.phone ? ` · ${b.phone}` : ""}</div>
                        </div>
                        <div style={{ fontSize:11, fontWeight:700, color:bs.color, whiteSpace:"nowrap" }}>{bs.text}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
