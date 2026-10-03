// Новий запис від персоналу (власник/майстер): майстер → послуга → клієнт → дата/час (лише вільні вікна)
import { useState, useEffect, useMemo } from "react";
import { get } from "firebase/database";
import { Modal, Btn, Field, ModalSection, Chip } from "../ui.jsx";
import { useSalon } from "./ctx.js";
import { sref, useValue, toList } from "./data.js";
import { createBooking } from "./actions.js";
import { Select, Input, Hint, useTh } from "./kit.jsx";
import { freeStartTimes, priceFor, serviceDuration, offersService, toYMD } from "../salonLogic.js";

export default function NewBooking({ open, onClose, defaults = {} }) {
  const ctx = useSalon();
  const th = useTh();
  const { masters, services, role, masterId: myMaster, step, salonId } = ctx;
  const activeMasters = masters.filter((m) => m.profile?.active !== false && (role === "owner" || m.id === myMaster));
  const [masterId, setMasterId] = useState(defaults.masterId || activeMasters[0]?.id || "");
  const [serviceId, setServiceId] = useState("");
  const [custom, setCustom] = useState({ name: "", price: "", duration: "60" });
  const [date, setDate] = useState(defaults.date || toYMD(new Date()));
  const [time, setTime] = useState(defaults.time || "");
  const [manualTime, setManualTime] = useState(false);
  const [clientMode, setClientMode] = useState("new");
  const [clientUid, setClientUid] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [day, setDay] = useState({});
  const [busy, setBusy] = useState(false);

  const users = useValue(() => (role === "owner" && open ? sref(salonId, "users") : null), [role, salonId, open]);
  const clients = useMemo(() => toList(users.value).map((u) => ({ uid: u.id, name: u.profile?.name || "Без імені", phone: u.profile?.phone || "" })).sort((a, b) => a.name.localeCompare(b.name)), [users.value]);

  const myServices = services.filter((s) => offersService(s, masterId));
  const svc = services.find((s) => s.id === serviceId);
  const duration = svc ? serviceDuration(svc) : Number(custom.duration) || 60;
  const [priceTxt, setPriceTxt] = useState("");
  const [durTxt, setDurTxt] = useState("");
  const price = priceTxt !== "" ? Number(priceTxt) : svc ? priceFor(svc, masterId) : Number(custom.price) || 0;
  const dur = durTxt !== "" ? Number(durTxt) || duration : duration;

  useEffect(() => {
    if (!open || !masterId || !date) return undefined;
    let dead = false;
    get(sref(salonId, `timeslots/${masterId}/${date}`)).then((s) => { if (!dead) setDay(s.val() || {}); }).catch(() => {});
    return () => { dead = true; };
  }, [open, salonId, masterId, date]);

  const nowMin = date === toYMD(new Date()) ? new Date().getHours() * 60 + new Date().getMinutes() : 0;
  const times = useMemo(() => freeStartTimes(day, dur, step, { minStart: nowMin }), [day, dur, step, nowMin]);
  const timeOk = !!time && (manualTime || times.includes(time));

  const chosen = clientMode === "existing" ? clients.find((c) => c.uid === clientUid) : null;
  const finalName = chosen ? chosen.name : name.trim();
  const finalPhone = chosen ? chosen.phone : phone.trim();
  const valid = masterId && date && timeOk && finalName && (svc || custom.name.trim());

  const save = async () => {
    setBusy(true);
    try {
      await createBooking(ctx, {
        masterId, serviceId: svc?.id, serviceName: svc ? svc.name : custom.name.trim(), price, durationMin: dur,
        clientUid: chosen?.uid, clientName: finalName, phone: finalPhone, date, time, status: pending ? "pending" : "confirmed",
        paymentMethod: "onsite", clientNote: note.trim() || undefined,
      });
      ctx.toast("Запис створено");
      onClose();
    } catch { ctx.toast("Не вдалося створити запис", "err"); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Новий запис" icon="➕" footer={<><Btn variant="ghost" flex={1} onClick={onClose}>Скасувати</Btn><Btn flex={2} disabled={!valid || busy} onClick={save}>{busy ? "Зберігаю..." : "Створити запис"}</Btn></>}>
      <ModalSection label="Майстер і послуга" first>
        {role === "owner" && <Select label="Майстер" value={masterId} onChange={(v) => { setMasterId(v); setServiceId(""); setTime(""); }} options={activeMasters.map((m) => ({ v: m.id, l: m.profile?.name || "Майстер" }))} />}
        <Select label="Послуга" value={serviceId} onChange={(v) => { setServiceId(v); setPriceTxt(""); setDurTxt(""); setTime(""); }}
          options={[{ v: "", l: myServices.length ? "— Оберіть —" : "— Інша послуга —" }, ...myServices.map((s) => ({ v: s.id, l: `${s.name} · ${priceFor(s, masterId)} ₴ · ${serviceDuration(s)} хв` }))]} />
        {!svc && <Field label="Назва послуги" value={custom.name} onChange={(v) => setCustom({ ...custom, name: v })} placeholder="Наприклад: Стрижка" />}
        <div style={{ display: "flex", gap: 8 }}>
          <Input label="Ціна, ₴" type="number" value={priceTxt !== "" ? priceTxt : String(price || "")} onChange={setPriceTxt} style={{ flex: 1 }} />
          <Input label="Тривалість, хв" type="number" step={step} value={durTxt !== "" ? durTxt : String(duration)} onChange={(v) => { setDurTxt(v); setTime(""); }} style={{ flex: 1 }} />
        </div>
      </ModalSection>
      <ModalSection label="Клієнт">
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <Chip active={clientMode === "new"} color={th.ACCENT} onClick={() => setClientMode("new")}>Новий / без акаунта</Chip>
          {role === "owner" && <Chip active={clientMode === "existing"} color={th.ACCENT} onClick={() => setClientMode("existing")}>З бази</Chip>}
        </div>
        {clientMode === "existing"
          ? <Select label="Клієнт" value={clientUid} onChange={setClientUid} options={[{ v: "", l: clients.length ? "— Оберіть —" : "База порожня" }, ...clients.map((c) => ({ v: c.uid, l: `${c.name}${c.phone ? " · " + c.phone : ""}` }))]} />
          : <><Field label="Ім'я" value={name} onChange={setName} /><Field label="Телефон" type="tel" value={phone} onChange={setPhone} /></>}
      </ModalSection>
      <ModalSection label="Дата і час">
        <Input label="Дата" type="date" value={date} onChange={(v) => { setDate(v); setTime(""); }} />
        {!manualTime && (times.length
          ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{times.map((t) => <Chip key={t} active={time === t} color={th.ACCENT} onClick={() => setTime(t)}>{t}</Chip>)}</div>
          : <Hint>Вільних вікон на цей день немає (або сітка ще не створена).</Hint>)}
        {manualTime && <Input label="Час" type="time" value={time} onChange={setTime} />}
        <button onClick={() => { setManualTime(!manualTime); setTime(""); }} style={{ background: "none", border: "none", color: th.DIM, fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>{manualTime ? "← Обрати з вільних" : "Вказати час вручну (поза сіткою)"}</button>
      </ModalSection>
      <ModalSection label="Додатково">
        <Field label="Нотатка" value={note} onChange={setNote} textarea rows={2} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} /> Залишити «Очікує підтвердження»</label>
      </ModalSection>
    </Modal>
  );
}
