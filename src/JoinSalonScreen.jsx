import { useState, useEffect, lazy, Suspense } from "react";
const MasterOverrides = lazy(() => import("./views/MasterOverrides"));
import { ref, get, set, remove } from "firebase/database";
import { signOut } from "firebase/auth";
import { db, auth } from "./firebase";
import { BG_DEEP, SURFACE, SURF_HI, BORDER, TEXT, DIM, ACCENT, SO } from "./theme.js";
import { masterRow, colorForUid, forgetWorkspaceInvite } from "./workspace";

const wrap = { minHeight: "100vh", background: BG_DEEP, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, paddingTop: "calc(20px + env(safe-area-inset-top, 0px))", boxSizing: "border-box" };
const card = { background: `linear-gradient(135deg,${SURF_HI},${SURFACE})`, borderRadius: 20, padding: "32px 28px", width: "100%", maxWidth: 400, boxShadow: SO, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif" };
const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${BORDER}`, background: BG_DEEP, color: TEXT, fontSize: 15, fontFamily: "inherit", outline: "none" };
const primary = (off) => ({ width: "100%", padding: 13, borderRadius: 12, border: "none", cursor: off ? "default" : "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 800, color: "#fff", background: off ? "rgba(255,90,60,0.3)" : "linear-gradient(135deg,#ff7a5c,#ff5a3c)" });
const ghost = { background: "none", border: "none", color: DIM, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "0 0 16px", fontFamily: "inherit" };

// Приєднатися до салону за запрошенням: майстер вписує СЕБЕ в склад простору й у staff_index.
export function JoinSalonScreen({ token, onDone, onCancel }) {
  const [info, setInfo] = useState(undefined); // undefined — вантажимо, null — запрошення недійсне, { iid, salonName }
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const inv = (await get(ref(db, `workspace_invites/${token}`))).val();
        if (!inv || !inv.iid || !(inv.expiresAt > Date.now())) return null;
        const salonName = (await get(ref(db, `instructors/${inv.iid}/admin_settings/profile/name`)).catch(() => null))?.val() || "салон";
        return { iid: inv.iid, salonName };
      } catch { return null; }
    })().then((r) => { if (alive) setInfo(r); });
    return () => { alive = false; };
  }, [token]);

  const join = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !info || !name.trim()) return;
    setBusy(true); setErr("");
    try {
      await set(ref(db, `instructors/${info.iid}/staff/${uid}`), { ...masterRow(name, colorForUid(uid)), inviteToken: token });
      await set(ref(db, `staff_index/${uid}`), { iid: info.iid, at: Date.now() });
      forgetWorkspaceInvite();
      onDone({ iid: info.iid, name: name.trim(), salonName: info.salonName });
    } catch { setErr("Не вдалося приєднатися. Перевірте з'єднання або попросіть нове запрошення."); }
    finally { setBusy(false); }
  };

  return (
    <div style={wrap}><div style={card}>
      <button onClick={() => signOut(auth).catch(() => {})} disabled={busy} style={ghost}>← Вийти</button>
      {info === undefined && <div style={{ textAlign: "center", color: DIM }}>Перевіряємо запрошення…</div>}
      {info === null && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Запрошення недійсне</div>
          <div style={{ fontSize: 13, color: DIM, lineHeight: 1.5, marginBottom: 18 }}>Воно закінчилось або було скасоване. Попросіть власника салону створити нове.</div>
          <button onClick={() => { forgetWorkspaceInvite(); onCancel(); }} style={primary(false)}>Налаштувати власний акаунт</button>
        </div>
      )}
      {info && (
        <div>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ fontSize: 13, color: DIM }}>Вас запросили в салон</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{info.salonName}</div>
          </div>
          <div style={{ fontSize: 11, color: DIM, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Ваше ім'я для клієнтів *</div>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Анна Коваленко" style={inp} />
          {err && <div style={{ fontSize: 12, color: ACCENT, margin: "12px 0 0" }}>{err}</div>}
          <button onClick={join} disabled={busy || !name.trim()} style={{ ...primary(busy || !name.trim()), marginTop: 18 }}>{busy ? "Приєднуємо…" : "Приєднатися до салону"}</button>
        </div>
      )}
    </div></div>
  );
}

// Вкладка «Налаштування» для майстра салону: хто я, вихід з акаунта й вихід із салону (власник бачить майстрів у розділі «Майстри»).
export function MasterProfileView({ ws, onLeft }) {
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const leave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setBusy(true);
    try {
      await remove(ref(db, `staff_index/${uid}`));
      await remove(ref(db, `instructors/${ws.iid}/staff/${uid}`));
      onLeft();
    } catch { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: SURFACE, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: 20, color: TEXT, fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif" }}>
      <div style={{ fontSize: 13, color: DIM }}>Ви майстер салону</div>
      <div style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 2px" }}>{ws.salonName || "салон"}</div>
      <div style={{ fontSize: 14, color: DIM, marginBottom: 20 }}>{ws.name}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: DIM, marginBottom: 20 }}>Тут ваш календар і клієнти салону. Налаштування салону, послуги й статистику веде власник.</div>
      <button onClick={() => signOut(auth).catch(() => {})} style={primary(false)}>Вийти з акаунта</button>
      {!sure
        ? <button onClick={() => setSure(true)} style={{ ...ghost, marginTop: 14, paddingBottom: 0 }}>Вийти із салону</button>
        : <div style={{ marginTop: 14, fontSize: 13, color: DIM, lineHeight: 1.5 }}>
            Ваші записи лишаться в салоні, але ви більше не зможете їх бачити. Вийти?
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button onClick={leave} disabled={busy} style={{ ...primary(busy), flex: 1 }}>{busy ? "…" : "Так, вийти"}</button>
              <button onClick={() => setSure(false)} style={{ ...ghost, flex: 1, padding: 12, border: `1px solid ${BORDER}`, borderRadius: 12 }}>Ні</button>
            </div>
          </div>}
    </div>
    <Suspense fallback={null}><MasterOverrides mid={auth.currentUser?.uid} /></Suspense>
    </div>
  );
}
