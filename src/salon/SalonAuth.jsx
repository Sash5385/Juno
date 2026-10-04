// Вхід/реєстрація (email+пароль, Google) і онбординг: створити салон або прийняти запрошення майстра.
import { useState, useEffect } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { update, push, get } from "firebase/database";
import { auth, db } from "../firebase.js";
import { ref } from "firebase/database";
import { LOGIN_CSS } from "../loginStyles.js";
import { DEFAULT_WORK_HOURS } from "../salonLogic.js";
import { rootRef } from "./data.js";
import { callFn, errText } from "./api.js";
import { slugify } from "./kit.jsx";

const IOS_STANDALONE = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && (window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches);
const DAY = 86400000;

export function SalonLogin({ inviteCode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [mode, setMode] = useState(inviteCode ? "register" : "login");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const registering = mode === "register";

  const submit = async () => {
    setError(""); setInfo(""); setLoading(true);
    try {
      if (registering) {
        if (password.length < 6) { setError("Пароль — мінімум 6 символів"); return; }
        if (password !== password2) { setError("Паролі не збігаються"); return; }
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      const map = { "auth/network-request-failed": "Помилка мережі — перевірте з'єднання", "auth/too-many-requests": "Забагато спроб — спробуйте пізніше", "auth/email-already-in-use": "Цей email уже зареєстрований — натисніть «Увійти»", "auth/invalid-email": "Некоректний email", "auth/weak-password": "Занадто простий пароль — мінімум 6 символів" };
      setError(map[e.code] || (registering ? "Не вдалося зареєструватись. Спробуйте ще раз" : "Невірний email або пароль"));
    } finally { setLoading(false); }
  };
  const google = async () => {
    setError(""); setLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") { try { await signInWithRedirect(auth, provider); return; } catch { /* нижче */ } }
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") setError("Не вдалося увійти через Google" + (e.code ? ` (${e.code})` : ""));
    } finally { setLoading(false); }
  };
  useEffect(() => { getRedirectResult(auth).catch((e) => setError("Не вдалося увійти через Google" + (e?.code ? ` (${e.code})` : ""))); }, []);
  const reset = async () => {
    setError(""); setInfo("");
    if (!email.trim()) { setError("Введіть email, щоб відновити пароль"); return; }
    try { await sendPasswordResetEmail(auth, email.trim()); setInfo("Лист для відновлення пароля надіслано"); } catch { setError("Не вдалося надіслати лист. Перевірте email"); }
  };

  return (
    <div className="lg-wrap lg-v1">
      <style>{LOGIN_CSS}</style>
      <div className="lg-bg" aria-hidden="true"><i /><i /><i /></div>
      <div className="lg-card">
        <div className="lg-head">
          <div style={{ background: "#fff", borderRadius: 22, padding: "6px 10px", width: 168, margin: "0 auto 8px", boxShadow: "0 4px 18px rgba(0,0,0,0.25)" }}><img src="/juno-logo.png" alt="Juno" width="148" style={{ display: "block", width: "100%", height: "auto" }} /></div>
          <div className="lg-title">{registering ? "Реєстрація" : "Вхід"}</div>
          <div className="lg-sub">{inviteCode ? "Вас запросили як майстра — увійдіть або зареєструйтесь" : registering ? "Реєстрація · 14 днів безкоштовно" : "Вхід для власника і майстрів"}</div>
        </div>
        <div className="lg-body">
          <div className="lg-field"><label className="lg-label" htmlFor="s-email">Email</label>
            <input id="s-email" className="lg-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete="email" /></div>
          <div className="lg-field"><label className="lg-label" htmlFor="s-pass">Пароль</label>
            <input id="s-pass" className="lg-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete={registering ? "new-password" : "current-password"} /></div>
          {registering && <div className="lg-field"><label className="lg-label" htmlFor="s-pass2">Повторіть пароль</label>
            <input id="s-pass2" className="lg-input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete="new-password" /></div>}
          {!registering && <div className="lg-forgot"><button onClick={reset}>Забули пароль?</button></div>}
          {error && <div className="lg-error">{error}</div>}
          {info && <div className="lg-info">{info}</div>}
          <button className="lg-btn" onClick={submit} disabled={loading || !email || !password || (registering && !password2)}>
            {loading ? "Зачекайте..." : registering ? "Зареєструватись" : "Увійти"}
          </button>
          {IOS_STANDALONE ? <div className="lg-note">Вхід через Google недоступний у встановленому застосунку на iPhone. Скористайтесь email і паролем.</div> : (
            <><div className="lg-or">або</div><button className="lg-google" onClick={google} disabled={loading}>Увійти через Google</button></>
          )}
          <div className="lg-switch">{registering ? "Уже є акаунт? " : "Ще немає акаунта? "}
            <button onClick={() => { setMode(registering ? "login" : "register"); setError(""); setInfo(""); setPassword2(""); }}>{registering ? "Увійти" : "Зареєструватись"}</button></div>
        </div>
      </div>
    </div>
  );
}

// Новий акаунт без салону: створити салон (власник) або ввести код запрошення (майстер)
export function Onboarding({ user, inviteCode, onDone }) {
  const [tab, setTab] = useState(inviteCode ? "join" : "create");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [alsoMaster, setAlsoMaster] = useState(true);
  const [myName, setMyName] = useState(user?.displayName || "");
  const [code, setCode] = useState(inviteCode || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    if (!name.trim()) { setError("Вкажіть назву салону"); return; }
    setBusy(true); setError("");
    try {
      const uid = user.uid, now = Date.now();
      let slug = slugify(name);
      if ((await get(rootRef(`salon_slugs/${slug}`))).exists()) slug = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
      const upd = {
        [`salons/${uid}/profile`]: { name: name.trim(), phone: phone.trim(), slug, timezone: "Europe/Kyiv", slotStep: 30, createdAt: now },
        [`salons/${uid}/license/status`]: "trial",
        [`salons/${uid}/license/trialEndsAt`]: now + 14 * DAY,
        [`salon_slugs/${slug}`]: { salonId: uid },
        [`salon_index/${uid}`]: { name: name.trim(), slug, createdAt: now },
      };
      if (alsoMaster) {
        const mid = push(rootRef(`salons/${uid}/masters`)).key;
        upd[`salons/${uid}/masters/${mid}/profile`] = { name: (myName || name).trim(), active: true, order: 0, workHours: DEFAULT_WORK_HOURS, spec: "" };
        upd[`salons/${uid}/masterAuth/${uid}`] = mid;
        upd[`salons/${uid}/masterSettings/${mid}/uid`] = uid;
      }
      await update(ref(db), upd);
      onDone();
    } catch { setError("Не вдалося створити салон. Спробуйте ще раз."); }
    finally { setBusy(false); }
  };
  const join = async () => {
    setBusy(true); setError("");
    try { await callFn("salonClaimMasterInvite", { code: code.trim() }); try { sessionStorage.removeItem("salon_invite"); } catch { /* ignore */ } onDone(); }
    catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="lg-wrap lg-v1">
      <style>{LOGIN_CSS}</style>
      <div className="lg-bg" aria-hidden="true"><i /><i /><i /></div>
      <div className="lg-card">
        <div className="lg-head"><div style={{ fontSize: 40 }}>💈</div><div className="lg-title">Ласкаво просимо</div><div className="lg-sub">{user?.email}</div></div>
        <div className="lg-body">
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[["create", "Створити салон"], ["join", "У мене є код"]].map(([id, l]) => (
              <button key={id} onClick={() => { setTab(id); setError(""); }} style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit", background: tab === id ? "rgba(255,90,60,.35)" : "rgba(255,255,255,.06)", color: "#fff" }}>{l}</button>
            ))}
          </div>
          {tab === "create" ? (
            <>
              <div className="lg-field"><label className="lg-label" htmlFor="o-name">Назва салону</label><input id="o-name" className="lg-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="lg-field"><label className="lg-label" htmlFor="o-phone">Телефон</label><input id="o-phone" className="lg-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "4px 0 10px", cursor: "pointer" }}>
                <input type="checkbox" checked={alsoMaster} onChange={(e) => setAlsoMaster(e.target.checked)} /> Я також приймаю клієнтів (створити мене майстром)
              </label>
              {alsoMaster && <div className="lg-field"><label className="lg-label" htmlFor="o-my">Ваше ім'я для клієнтів</label><input id="o-my" className="lg-input" value={myName} onChange={(e) => setMyName(e.target.value)} /></div>}
              {error && <div className="lg-error">{error}</div>}
              <button className="lg-btn" onClick={create} disabled={busy || !name.trim()}>{busy ? "Створюю..." : "Створити салон"}</button>
              <div className="lg-note">14 днів безкоштовно, без картки.</div>
            </>
          ) : (
            <>
              <div className="lg-field"><label className="lg-label" htmlFor="o-code">Код запрошення</label><input id="o-code" className="lg-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="отримайте у власника салону" /></div>
              {error && <div className="lg-error">{error}</div>}
              <button className="lg-btn" onClick={join} disabled={busy || !code.trim()}>{busy ? "Перевіряю..." : "Приєднатись як майстер"}</button>
            </>
          )}
          <div className="lg-switch"><button onClick={() => auth.signOut()}>Вийти</button></div>
        </div>
      </div>
    </div>
  );
}
