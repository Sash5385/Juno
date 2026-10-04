// Налаштування: профіль салону, онлайн-оплата Monobank і політика скасування, сповіщення, вигляд, акаунт
import { useState } from "react";
import { update, get } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth, db } from "../../firebase.js";
import { ref } from "firebase/database";
import { Section, Btn, Field, Toggle, Chip, Card } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { rootRef, sref } from "../data.js";
import { callFn, errText } from "../api.js";
import { CLIENT_URL } from "../env.js";
import { APP_VERSION } from "../../version.js";
import { Select, Input, Row, Hint, Confirm, useTh, slugify, dateLabel } from "../kit.jsx";
import Subscription from "./Subscription.jsx";
import PhotoField from "../PhotoField.jsx";
import { removeSalonImage } from "../photo.js";
import { normWorkHours, DEFAULT_CANCEL_FREE_HOURS } from "../../salonLogic.js";

const TZ = ["Europe/Kyiv", "Europe/Warsaw", "Europe/Berlin", "Europe/London", "Europe/Chisinau", "Asia/Tbilisi"];
const STEPS = [15, 30, 60];
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export default function Settings() {
  const ctx = useSalon();
  const th = useTh();
  const owner = ctx.role === "owner";
  const lic = ctx.license;
  const until = lic ? (lic.status === "trial" ? lic.trialEndsAt : lic.expiresAt) : null;
  const me = ctx.masters.find((m) => m.id === ctx.masterId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {owner ? (
        <>
          <Section title="Салон" icon="💈" defaultOpen><ProfileForm /></Section>
          <Section title="Підписка" icon="🧾"><Subscription /></Section>
          <Section title="Онлайн-оплата та скасування" icon="💳"><PaymentForm key={`${!!ctx.payment.enabled}-${!!ctx.payment.hasToken}`} /></Section>
        </>
      ) : (
        <Section title="Мій профіль" icon="💇" defaultOpen>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{me?.profile?.name}</div>
          <div style={{ fontSize: 12, color: th.DIM, marginBottom: 10 }}>{me?.profile?.spec || "—"}</div>
          {normWorkHours(me?.profile?.workHours).map((d, i) => <div key={i} style={{ display: "flex", fontSize: 13, padding: "3px 0" }}><div style={{ width: 36, fontWeight: 800 }}>{DAYS[i]}</div><div style={{ color: d.off ? th.FAINT : th.TEXT }}>{d.off ? "вихідний" : `${d.from} – ${d.to}`}</div></div>)}
          <Hint>Робочі години змінює власник салону.</Hint>
        </Section>
      )}
      <Section title="Сповіщення" icon="🔔" defaultOpen={ctx.pushPerm === "default"}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>{ctx.pushPerm === "granted" ? "✅ Увімкнено на цьому пристрої" : ctx.pushPerm === "denied" ? "⛔ Заблоковано в налаштуваннях браузера" : ctx.pushPerm === "unsupported" ? "Цей браузер не підтримує сповіщення" : "Вимкнено"}</div>
        {ctx.pushPerm === "default" && <Btn onClick={ctx.enablePush}>🔔 Увімкнути сповіщення</Btn>}
        <Hint>Нові записи, скасування, оплати й повідомлення клієнтів приходитимуть на цей пристрій.</Hint>
        {owner && (
          <Row gap={10} style={{ marginTop: 10 }}>
            <div style={{ flex: 1, fontSize: 13 }}>Повідомляти клієнтів, коли звільняється час<div style={{ fontSize: 11, color: th.DIM }}>Через 5 хв після скасування, якщо час досі вільний (найближчі 10 днів)</div></div>
            <Toggle on={ctx.profile.slotFreedPush !== false} onChange={(v) => update(sref(ctx.salonId, "profile"), { slotFreedPush: v }).catch(() => ctx.toast("Не вдалося зберегти", "err"))} />
          </Row>
        )}
      </Section>
      <Section title="Вигляд" icon="🎨">
        <Row gap={8}><Chip active={ctx.mode === "dark"} color={th.ACCENT} onClick={() => ctx.setThemeMode("dark")}>Темна</Chip><Chip active={ctx.mode === "light"} color={th.ACCENT} onClick={() => ctx.setThemeMode("light")}>Світла (кава)</Chip></Row>
      </Section>
      <Section title="Акаунт" icon="👤">
        <div style={{ fontSize: 13, marginBottom: 4 }}>{ctx.user.email}</div>
        {owner && lic && <div style={{ fontSize: 12, color: th.DIM, marginBottom: 8 }}>{lic.status === "trial" ? "Пробний період" : lic.status === "suspended" ? "Підписку призупинено" : "Підписка активна"}{until ? ` до ${dateLabel(new Date(until).toISOString().slice(0, 10))}` : ""}</div>}
        <Btn variant="ghost" accent={th.RED} onClick={() => signOut(auth)}>Вийти</Btn>
        {owner && <DeleteSalon />}
        <div style={{ fontSize: 11, color: th.FAINT, textAlign: "center", marginTop: 12 }}>Версія {APP_VERSION}</div>
      </Section>
    </div>
  );
}

function DeleteSalon() {
  const ctx = useSalon();
  const th = useTh();
  const [ask, setAsk] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    try { await callFn("salonDeleteAccount", { type: "owner" }); ctx.toast("Салон видалено"); signOut(auth); } catch (e) { ctx.toast(errText(e), "err"); setBusy(false); }
  };
  return (
    <>
      <Btn variant="ghost" accent={th.RED} style={{ marginTop: 8 }} onClick={() => setAsk(true)}>Видалити салон і акаунт</Btn>
      <Confirm open={ask} danger title="Видалити салон?" yes={busy ? "Видаляю…" : "Видалити назавжди"} no="Скасувати" onNo={() => { setAsk(false); setWord(""); }} onYes={() => word.trim().toUpperCase() === "ВИДАЛИТИ" && !busy && del()}
        text={<><div style={{ marginBottom: 8 }}>Буде видалено салон, майстрів, клієнтів, записи, чати, фото та ваш акаунт. Архів зберігається на сервері лише для служби підтримки. Скасувати неможливо.</div><Field label="Для підтвердження введіть: ВИДАЛИТИ" value={word} onChange={setWord} /></>} />
    </>
  );
}

function ProfileForm() {
  const ctx = useSalon();
  const th = useTh();
  const p = ctx.profile;
  const [f, setF] = useState({ name: p.name || "", phone: p.phone || "", address: p.address || "", about: p.about || "", timezone: p.timezone || "Europe/Kyiv", slotStep: String(ctx.step), slug: p.slug || "" });
  const [busy, setBusy] = useState(false);
  const link = `${CLIENT_URL}/s/${p.slug || ""}`;
  const save = async () => {
    setBusy(true);
    try {
      const slug = slugify(f.slug);
      const upd = { [`salons/${ctx.salonId}/profile/name`]: f.name.trim(), [`salons/${ctx.salonId}/profile/phone`]: f.phone.trim(), [`salons/${ctx.salonId}/profile/address`]: f.address.trim(),
        [`salons/${ctx.salonId}/profile/about`]: f.about.trim(), [`salons/${ctx.salonId}/profile/timezone`]: f.timezone, [`salons/${ctx.salonId}/profile/slotStep`]: Number(f.slotStep), [`salon_index/${ctx.salonId}/name`]: f.name.trim() };
      if (slug !== p.slug) {
        if ((await get(rootRef(`salon_slugs/${slug}`))).exists()) { ctx.toast("Це посилання вже зайняте — оберіть інше", "err"); return; }
        if (p.slug) upd[`salon_slugs/${p.slug}`] = null;
        upd[`salon_slugs/${slug}`] = { salonId: ctx.salonId };
        upd[`salons/${ctx.salonId}/profile/slug`] = slug;
        upd[`salon_index/${ctx.salonId}/slug`] = slug;
      }
      await update(ref(db), upd);
      ctx.toast(Number(f.slotStep) !== ctx.step ? "Збережено. Крок сітки застосується до нових днів — перезбережіть майстрів, щоб оновити розклад" : "Збережено");
    } catch { ctx.toast("Не вдалося зберегти", "err"); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); ctx.toast("Посилання скопійовано"); } catch { ctx.toast("Не вдалося скопіювати", "err"); } };
  const setLogo = async (url) => {
    try { await update(sref(ctx.salonId, "profile"), { logo: url }); if (p.logo && p.logo !== url) removeSalonImage(ctx.salonId, p.logo); ctx.toast(url ? "Логотип збережено" : "Логотип прибрано"); }
    catch { ctx.toast("Не вдалося зберегти логотип", "err"); }
  };
  return (
    <>
      <PhotoField kind="logo" url={p.logo} name={p.name} size={72} radius={20} label="Логотип салону" onUploaded={setLogo} onRemove={() => setLogo(null)} />
      <Field label="Назва" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <Field label="Телефон" type="tel" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
      <Field label="Адреса" value={f.address} onChange={(v) => setF({ ...f, address: v })} />
      <Field label="Про салон" value={f.about} onChange={(v) => setF({ ...f, about: v })} textarea rows={2} />
      <Row gap={8}>
        <Select label="Часовий пояс" value={f.timezone} onChange={(v) => setF({ ...f, timezone: v })} options={TZ.map((z) => ({ v: z, l: z.replace("_", " ") }))} style={{ flex: 2 }} />
        <Select label="Крок сітки" value={f.slotStep} onChange={(v) => setF({ ...f, slotStep: v })} options={STEPS.map((s) => ({ v: String(s), l: `${s} хв` }))} style={{ flex: 1 }} />
      </Row>
      <Input label="Посилання для запису" value={f.slug} onChange={(v) => setF({ ...f, slug: v })} />
      <Card inset style={{ padding: "9px 12px", marginBottom: 10 }}><div style={{ fontSize: 12, wordBreak: "break-all", color: th.DIM }}>{link}</div></Card>
      <Row gap={8}><Btn flex={1} variant="ghost" onClick={copy}>Копіювати посилання</Btn><Btn flex={1} disabled={busy || !f.name.trim() || !f.slug.trim()} onClick={save}>{busy ? "Зберігаю..." : "Зберегти"}</Btn></Row>
      <Hint>Це посилання клієнти відкривають, щоб записатись. Додайте його в Instagram, Google Maps, QR-код.</Hint>
    </>
  );
}

function PaymentForm() {
  const ctx = useSalon();
  const th = useTh();
  const pay = ctx.payment;
  const [token, setToken] = useState("");
  const [f, setF] = useState({ enabled: !!pay.enabled, depositPercent: String(pay.depositPercent ?? 30), allowFull: pay.allowFull !== false, holdMinutes: String(pay.holdMinutes ?? 15), cancelFreeHours: String(pay.cancelFreeHours ?? DEFAULT_CANCEL_FREE_HOURS), autoConfirm: !!pay.autoConfirm });
  const [busy, setBusy] = useState(false);
  const call = async (body, ok) => {
    setBusy(true);
    try { await callFn("salonSavePaymentSettings", body); ctx.toast(ok); return true; } catch (e) { ctx.toast(errText(e), "err"); return false; } finally { setBusy(false); }
  };
  const connect = async () => { if (await call({ monobankToken: token.trim() }, "Monobank підключено")) setToken(""); };
  const save = () => call({ enabled: f.enabled, depositPercent: Number(f.depositPercent) || 0, allowFull: f.allowFull, holdMinutes: Number(f.holdMinutes) || 15, cancelFreeHours: Number(f.cancelFreeHours) || 0, autoConfirm: f.autoConfirm }, "Налаштування збережено");
  return (
    <>
      <div style={{ fontSize: 13, marginBottom: 8 }}>{pay.hasToken ? `✅ Monobank підключено (токен …${pay.tokenLast4 || ""})` : "Monobank не підключено"}</div>
      <Field label={pay.hasToken ? "Замінити токен" : "Токен Monobank Acquiring"} type="password" value={token} onChange={setToken} placeholder="Вставте токен мерчанта" />
      <Row gap={8} style={{ marginBottom: 6 }}>
        <Btn flex={1} variant="ghost" disabled={busy || token.trim().length < 20} onClick={connect}>Підключити</Btn>
        {pay.hasToken && <Btn flex={1} variant="ghost" accent={th.RED} disabled={busy} onClick={() => call({ removeToken: true }, "Токен видалено")}>Видалити</Btn>}
      </Row>
      <Hint>Гроші клієнтів надходять напряму на ваш рахунок Monobank, платформа комісію не бере. Токен зберігається лише на сервері. Отримати його можна в кабінеті Monobank для бізнесу (еквайринг).</Hint>
      <Row gap={10} style={{ margin: "8px 0 4px" }}><div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Приймати оплату онлайн</div><Toggle on={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} /></Row>
      <Row gap={8} style={{ marginTop: 10 }}>
        <Input label="Передоплата, %" type="number" value={f.depositPercent} onChange={(v) => setF({ ...f, depositPercent: v })} style={{ flex: 1 }} />
        <Input label="Тримати слот, хв" type="number" value={f.holdMinutes} onChange={(v) => setF({ ...f, holdMinutes: v })} style={{ flex: 1 }} />
      </Row>
      <Row gap={10} style={{ marginBottom: 12 }}><div style={{ flex: 1, fontSize: 13 }}>Дозволити повну оплату<div style={{ fontSize: 11, color: th.DIM }}>Клієнт може оплатити весь візит наперед</div></div><Toggle on={f.allowFull} onChange={(v) => setF({ ...f, allowFull: v })} /></Row>
      <Row gap={10} style={{ marginBottom: 12 }}><div style={{ flex: 1, fontSize: 13 }}>Підтверджувати після оплати<div style={{ fontSize: 11, color: th.DIM }}>Оплачений запис стає «Підтверджено» автоматично</div></div><Toggle on={f.autoConfirm} onChange={(v) => setF({ ...f, autoConfirm: v })} /></Row>
      <Input label="Безкоштовне скасування — за скільки годин" type="number" value={f.cancelFreeHours} onChange={(v) => setF({ ...f, cancelFreeHours: v })} />
      <Hint>Клієнт скасував раніше цього терміну — передоплату повертаємо автоматично; пізніше — вона лишається у вас. Якщо скасовуєте ви чи майстер — повертається завжди. 0 = можна скасувати до самого початку.</Hint>
      <Btn disabled={busy} onClick={save}>{busy ? "Зберігаю..." : "Зберегти налаштування"}</Btn>
    </>
  );
}
