// Майстри (власник): профіль, робочі години, запрошення в застосунок, прив'язка логіну
import { useState } from "react";
import { update, push } from "firebase/database";
import { Card, Modal, Btn, Field, Toggle, ModalSection, Pill } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { sref, useValue, regridMaster, resetGridMark } from "../data.js";
import { callFn, errText } from "../api.js";
import { Empty, Input, Row, Hint, Confirm, initials, useTh } from "../kit.jsx";
import { normWorkHours, DEFAULT_WORK_HOURS } from "../../salonLogic.js";
import { useSubscription } from "../subscription.js";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export default function Masters() {
  const ctx = useSalon();
  const th = useTh();
  const [edit, setEdit] = useState(null);
  const settings = useValue(() => sref(ctx.salonId, "masterSettings"), [ctx.salonId]);
  const auths = useValue(() => sref(ctx.salonId, "masterAuth"), [ctx.salonId]);
  const linked = (id) => settings.value?.[id]?.uid || null;
  // Ліміт активних майстрів за тарифом (сервер ховає зайвих у salonOnMasterWritten, UI не дає їх додати)
  const { info } = useSubscription({ reloadKey: `${ctx.license?.lastPaymentId || ""}` });
  const active = ctx.masters.filter((m) => m.profile?.active !== false).length;
  const limit = info?.masterLimit || null;
  const full = limit != null && active >= limit;
  return (
    <div>
      <Btn style={{ marginBottom: full ? 6 : 14 }} onClick={() => setEdit({ name: "", spec: "", active: !full, workHours: DEFAULT_WORK_HOURS })}>＋ Додати майстра</Btn>
      {full && <div onClick={() => ctx.go("settings")} style={{ fontSize: 12, color: th.GOLD, marginBottom: 14, cursor: "pointer" }}>Ліміт тарифу: {limit} {limit === 1 ? "майстер" : "майстрів"}. Новий майстер збережеться прихованим — підвищте тариф в Налаштуваннях → Підписка →</div>}
      {ctx.masters.length === 0 && <Empty icon="💇" text="Додайте майстрів — клієнти оберуть, до кого записатись" />}
      {ctx.masters.map((m) => {
        const p = m.profile || {};
        const wh = normWorkHours(p.workHours);
        const workDays = wh.map((d, i) => (d.off ? null : DAYS[i])).filter(Boolean).join(" ");
        return (
          <Card key={m.id} onClick={() => setEdit({ id: m.id, ...p, workHours: wh })} style={{ marginBottom: 8, cursor: "pointer", opacity: p.active === false ? 0.55 : 1 }}>
            <Row gap={10} style={{ padding: "10px 12px" }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: `color-mix(in srgb, ${th.PURPLE} 28%, transparent)`, color: th.PURPLE, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 }}>{initials(p.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || "Майстер"}</div>
                <div style={{ fontSize: 12, color: th.DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.spec || "—"} · {workDays || "вихідні"}</div>
                <Row gap={6} wrap style={{ marginTop: 5 }}>
                  {p.active === false && <Pill label="Прихований" color={th.DIM} bg="rgba(148,163,184,0.16)" />}
                  <Pill label={linked(m.id) ? (linked(m.id) === ctx.user.uid ? "Це ви" : "Є вхід") : "Без входу"} color={linked(m.id) ? th.GREEN : th.GOLD} bg={linked(m.id) ? "rgba(126,217,87,0.15)" : "rgba(247,201,72,0.15)"} />
                </Row>
              </div>
            </Row>
          </Card>
        );
      })}
      {edit && <MasterSheet master={edit} limitFull={full} onClose={() => setEdit(null)} linkedUid={edit.id ? linked(edit.id) : null} ownerBound={!!auths.value?.[ctx.user.uid]} />}
    </div>
  );
}

function MasterSheet({ master, limitFull, onClose, linkedUid, ownerBound }) {
  const ctx = useSalon();
  const th = useTh();
  const [m, setM] = useState(master);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(null);
  const [unlink, setUnlink] = useState(false);
  const isNew = !master.id;
  const setDay = (i, patch) => setM({ ...m, workHours: m.workHours.map((d, k) => (k === i ? { ...d, ...patch } : d)) });

  const save = async () => {
    setBusy(true);
    try {
      const id = m.id || push(sref(ctx.salonId, "masters")).key;
      // Сервер лишає в межах ліміту найстаріших за activatedAt/createdAt; повернення прихованого в роботу — нова активація
      const wasActive = !isNew && master.active !== false;
      const active = m.active !== false && (wasActive || !limitFull);
      const now = Date.now();
      const profile = { name: m.name.trim(), spec: (m.spec || "").trim(), active, order: m.order ?? ctx.masters.length, workHours: m.workHours, createdAt: m.createdAt || now, activatedAt: active ? (wasActive && m.activatedAt ? m.activatedAt : now) : m.activatedAt || null };
      await update(sref(ctx.salonId, `masters/${id}`), { profile });
      resetGridMark(ctx.salonId);
      const n = await regridMaster({ salonId: ctx.salonId, master: { id, profile }, step: ctx.step });
      ctx.toast(m.active !== false && !active ? "Збережено прихованим: ліміт тарифу" : n ? "Збережено, розклад оновлено" : "Збережено");
      onClose();
    } catch { ctx.toast("Не вдалося зберегти", "err"); } finally { setBusy(false); }
  };
  const makeInvite = async () => {
    setBusy(true);
    try { setInvite(await callFn("salonCreateMasterInvite", { masterId: m.id })); } catch (e) { ctx.toast(errText(e), "err"); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(invite.link); ctx.toast("Посилання скопійовано"); } catch { ctx.toast("Не вдалося скопіювати", "err"); } };
  const share = () => navigator.share?.({ title: "Запрошення в салон", text: `Запрошення майстра: ${invite.link}`, url: invite.link }).catch(() => {});
  const bindMe = async () => {
    setBusy(true);
    try { await update(sref(ctx.salonId, ""), { [`masterAuth/${ctx.user.uid}`]: m.id, [`masterSettings/${m.id}/uid`]: ctx.user.uid }); ctx.toast("Готово: цей календар — ваш"); } catch { ctx.toast("Не вдалося", "err"); } finally { setBusy(false); }
  };
  const doUnlink = async () => {
    try { await update(sref(ctx.salonId, ""), { [`masterAuth/${linkedUid}`]: null, [`masterSettings/${m.id}/uid`]: null, [`masterTokens/${m.id}`]: null }); ctx.toast("Вхід майстра вимкнено"); } catch { ctx.toast("Не вдалося", "err"); }
    setUnlink(false);
  };

  return (
    <>
      <Modal open onClose={onClose} title={isNew ? "Новий майстер" : m.name || "Майстер"} icon="💇" footer={<><Btn variant="ghost" flex={1} onClick={onClose}>Закрити</Btn><Btn flex={2} disabled={!m.name.trim() || busy} onClick={save}>{busy ? "Зберігаю..." : "Зберегти"}</Btn></>}>
        <Field label="Ім'я" value={m.name} onChange={(v) => setM({ ...m, name: v })} placeholder="Анна" />
        <Field label="Спеціалізація" value={m.spec || ""} onChange={(v) => setM({ ...m, spec: v })} placeholder="Барбер, майстер манікюру…" />
        <Row gap={10} style={{ marginBottom: 6 }}><div style={{ flex: 1, fontSize: 13 }}>Приймає клієнтів<div style={{ fontSize: 11, color: th.DIM }}>Вимкніть, щоб сховати майстра від клієнтів</div></div><Toggle on={m.active !== false} onChange={(v) => setM({ ...m, active: v })} /></Row>
        <ModalSection label="Робочі години">
          {m.workHours.map((d, i) => (
            <Row key={i} gap={8} style={{ marginBottom: 6 }}>
              <div style={{ width: 28, fontSize: 13, fontWeight: 800 }}>{DAYS[i]}</div>
              <Toggle on={!d.off} onChange={(v) => setDay(i, { off: !v })} />
              {d.off ? <div style={{ fontSize: 12, color: th.FAINT, flex: 1 }}>вихідний</div> : (
                <>
                  <TimeBox value={d.from} onChange={(v) => setDay(i, { from: v })} />
                  <span style={{ color: th.DIM }}>–</span>
                  <TimeBox value={d.to} onChange={(v) => setDay(i, { to: v })} />
                </>
              )}
            </Row>
          ))}
          <Hint>Після збереження розклад на 45 днів перебудується: вільні слоти, що вже не в графіку, зникнуть; записи й блокування не чіпаються.</Hint>
        </ModalSection>
        {!isNew && (
          <ModalSection label="Вхід у застосунок">
            {linkedUid ? (
              <>
                <div style={{ fontSize: 13, marginBottom: 8 }}>✅ {linkedUid === ctx.user.uid ? "Цей календар прив'язаний до вашого акаунта." : "Майстер увійшов у свій кабінет."}</div>
                {linkedUid !== ctx.user.uid && <Btn variant="ghost" accent={th.RED} onClick={() => setUnlink(true)}>Вимкнути вхід</Btn>}
              </>
            ) : (
              <>
                <Hint>Майстер бачитиме лише свій календар і записи, а не налаштування салону.</Hint>
                <Btn variant="ghost" disabled={busy} onClick={makeInvite}>🔗 Створити запрошення</Btn>
                {!ownerBound && <Btn variant="ghost" disabled={busy} style={{ marginTop: 8 }} onClick={bindMe}>🙋 Це я (мій календар)</Btn>}
              </>
            )}
            {invite && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: th.BG_DEEP, border: `1px solid ${th.BORDER}` }}>
                <div style={{ fontSize: 12, color: th.DIM, marginBottom: 6 }}>Надішліть майстру це посилання (діє до {new Date(invite.expiresAt).toLocaleString("uk", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}, одноразове):</div>
                <div style={{ fontSize: 12, wordBreak: "break-all", fontWeight: 700, marginBottom: 8 }}>{invite.link}</div>
                <Row gap={8}><Btn flex={1} variant="ghost" onClick={copy}>Копіювати</Btn>{navigator.share && <Btn flex={1} onClick={share}>Поділитись</Btn>}</Row>
                <div style={{ fontSize: 11, color: th.FAINT, marginTop: 8 }}>Або код вручну: {invite.code}</div>
              </div>
            )}
          </ModalSection>
        )}
        {!isNew && <Hint>Видалити майстра не можна, щоб не втратити історію записів — вимкніть «Приймає клієнтів».</Hint>}
      </Modal>
      <Confirm open={unlink} danger title="Вимкнути вхід?" text="Майстер більше не зможе користуватись своїм кабінетом, доки ви не створите нове запрошення." yes="Вимкнути" no="Ні" onNo={() => setUnlink(false)} onYes={doUnlink} />
    </>
  );
}

function TimeBox({ value, onChange }) {
  return <Input type="time" value={value} onChange={onChange} style={{ marginBottom: 0, flex: 1, minWidth: 0 }} />;
}
