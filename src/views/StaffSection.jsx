import { useState, useEffect, useContext, lazy, Suspense } from "react";
import { onValue, update, set, remove } from "firebase/database";
import { iRef, db, auth } from "../firebase";
import { ref } from "firebase/database";
import { ThemeContext } from "../theme.js";
import { useConfirm } from "../ConfirmModal";
const MasterOverrides = lazy(() => import("./MasterOverrides"));
import {
  ACCOUNT_SALON, MAX_MASTERS, MASTER_COLORS, accountTypeOf, normStaff, ownerRow,
  newWorkspaceToken, workspaceInviteUrl, WS_INVITE_DAYS,
} from "../workspace";

// Налаштування → Майстри: перетворити акаунт на салон, запросити майстрів посиланням, змінити ім'я/колір, прибрати майстра.
// Склад: instructors/{iid}/staff/{uid}; запрошення: workspace_invites/{token}; індекс входу майстра: staff_index/{uid}.
export default function StaffSection({ settings, upd }) {
  const { BORDER, TEXT, DIM, FAINT, RED, ACCENT, ACC_HI, SURF_HI, SURFACE, BTN_TX } = useContext(ThemeContext);
  const uid = auth.currentUser?.uid;
  const salon = accountTypeOf(settings) === ACCOUNT_SALON;
  const [staff, setStaff] = useState([]);
  const [edit, setEdit] = useState(null); // { id, name, color }
  const [ovFor, setOvFor] = useState(null); // майстер, чиї графік і ціни відкриті
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirm, confirmNode] = useConfirm();

  useEffect(() => {
    if (!salon) return undefined;
    return onValue(iRef("staff"), (snap) => setStaff(normStaff(snap.val(), uid)), () => setStaff(normStaff(null, uid)));
  }, [salon, uid]);

  const run = async (fn) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg("Не вдалося: " + (e?.message || e)); } finally { setBusy(false); } };
  const btn = (primary, color) => ({
    padding: "11px 16px", borderRadius: 14, border: primary ? "none" : `1px solid ${BORDER}`, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700,
    background: primary ? `linear-gradient(145deg,${ACC_HI},${ACCENT})` : SURF_HI, color: primary ? (BTN_TX || "#fff") : (color || TEXT),
  });
  const box = { width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 14, border: `1px solid ${BORDER}`, background: SURF_HI, color: TEXT, fontFamily: "inherit", fontSize: 14, outline: "none" };

  const becomeSalon = async () => {
    const ok = await confirm({
      title: "Перетворити на салон?",
      text: "Акаунт стане робочим простором із кількома майстрами. Ваші записи, клієнти й послуги лишаться, ви — власник. Повернути назад не можна.",
      okLabel: "Перетворити",
    });
    if (!ok) return;
    await run(async () => {
      const name = settings.profile?.name || "Власник";
      await update(iRef(""), { "admin_settings/accountType": ACCOUNT_SALON, [`staff/${uid}`]: ownerRow(name) });
      upd("accountType", ACCOUNT_SALON);
    });
  };

  const makeInvite = () => run(async () => {
    if (staff.length >= MAX_MASTERS) throw new Error(`Не більше ${MAX_MASTERS} майстрів`);
    const token = newWorkspaceToken();
    await set(ref(db, `workspace_invites/${token}`), { iid: uid, expiresAt: Date.now() + WS_INVITE_DAYS * 86400000 });
    setInvite(token);
  });
  const copy = () => { navigator.clipboard?.writeText(workspaceInviteUrl(invite)).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const saveEdit = () => run(async () => {
    const name = edit.name.trim().slice(0, 60);
    if (!name) throw new Error("Вкажіть ім'я");
    await update(iRef(`staff/${edit.id}`), { name, color: edit.color });
    setEdit(null);
  });
  const removeMaster = async (m) => {
    const ok = await confirm({ title: `Прибрати «${m.name}»?`, text: "Майстер більше не зможе входити в салон. Його запис у складі буде видалено.", okLabel: "Прибрати", danger: true });
    if (!ok) return;
    await run(async () => {
      await remove(ref(db, `staff_index/${m.id}`)).catch(() => {});
      await remove(iRef(`staff/${m.id}`));
    });
  };

  const lbl = { fontSize: 11, color: DIM, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 };

  if (!salon) {
    return (
      <div>
        {confirmNode}
        <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.5 }}>Зараз ви працюєте самі: один календар, свої клієнти.</div>
        <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.5, marginTop: 8 }}>
          Якщо до вас приєднаються інші майстри, перетворіть акаунт на салон: у кожного буде свій календар, а клієнти, послуги й статистика — спільні. Власник бачить усе, майстер — лише своє.
        </div>
        <button disabled={busy} onClick={becomeSalon} style={{ ...btn(true), marginTop: 16, width: "100%" }}>Перетворити на салон</button>
        {msg && <div style={{ fontSize: 12, color: RED, marginTop: 10 }}>{msg}</div>}
      </div>
    );
  }

  return (
    <div>
      {confirmNode}
      <div style={lbl}>Майстри салону · {staff.length}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {staff.map((m) => (
          <div key={m.id} style={{ borderRadius: 14, border: `1px solid ${BORDER}`, background: SURFACE, padding: "10px 12px" }}>
            {edit?.id === m.id ? (
              <div>
                <input value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={box} aria-label="Ім'я майстра" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
                  {MASTER_COLORS.map((c) => (
                    <button key={c} aria-label={`Колір ${c}`} onClick={() => setEdit({ ...edit, color: c })} style={{ width: 30, height: 30, borderRadius: "50%", cursor: "pointer", background: c, border: edit.color === c ? `3px solid ${TEXT}` : "3px solid transparent" }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={busy} onClick={saveEdit} style={{ ...btn(true), flex: 1 }}>Зберегти</button>
                  <button onClick={() => setEdit(null)} style={{ ...btn(false), flex: 1 }}>Скасувати</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                  <div style={{ fontSize: 11.5, color: FAINT }}>{m.owner ? "власник" : "майстер"}</div>
                </div>
                {!m.owner && <button onClick={() => setOvFor(ovFor === m.id ? null : m.id)} style={{ ...btn(false), padding: "8px 12px", fontSize: 12 }}>{ovFor === m.id ? "Сховати" : "Графік і ціни"}</button>}
                <button onClick={() => setEdit({ id: m.id, name: m.name, color: m.color })} style={{ ...btn(false), padding: "8px 12px", fontSize: 12 }}>Змінити</button>
                {!m.owner && <button aria-label={`Прибрати ${m.name}`} onClick={() => removeMaster(m)} style={{ ...btn(false, RED), padding: "8px 12px", fontSize: 12 }}>✕</button>}
              </div>
            )}
            {ovFor === m.id && !m.owner && <div style={{ marginTop: 12 }}><Suspense fallback={null}><MasterOverrides mid={m.id} /></Suspense></div>}
          </div>
        ))}
      </div>

      <div style={{ ...lbl, marginTop: 18 }}>Запросити майстра</div>
      {invite ? (
        <div style={{ borderRadius: 14, border: `1px solid ${BORDER}`, background: SURFACE, padding: "12px 14px" }}>
          <div style={{ fontSize: 12.5, color: TEXT, wordBreak: "break-all", lineHeight: 1.45 }}>{workspaceInviteUrl(invite)}</div>
          <button onClick={copy} style={{ ...btn(true), width: "100%", marginTop: 10 }}>{copied ? "✓ Скопійовано" : "Скопіювати посилання"}</button>
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 8, lineHeight: 1.45 }}>Надішліть посилання майстру. Воно діє {WS_INVITE_DAYS} днів. Майстер відкриє його, зареєструється або увійде й приєднається до салону.</div>
        </div>
      ) : (
        <button disabled={busy} onClick={makeInvite} style={{ ...btn(true), width: "100%" }}>Створити запрошення</button>
      )}
      {msg && <div style={{ fontSize: 12, color: RED, marginTop: 10 }}>{msg}</div>}
    </div>
  );
}
