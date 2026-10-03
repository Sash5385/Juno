// Картка запису: деталі, підтвердження/завершення/скасування, оплата, повернення, перенесення
import { useState, useEffect, useMemo } from "react";
import { get } from "firebase/database";
import { Modal, Btn, Pill, ModalSection, Field, Chip } from "../ui.jsx";
import { useSalon } from "./ctx.js";
import { sref } from "./data.js";
import { confirmBooking, completeBooking, cancelBooking, markPaidOnSite, moveBooking, saveBookingNote, refundBooking } from "./actions.js";
import { errText } from "./api.js";
import { Confirm, Select, Input, Hint, statusOf, PAY, money, dateLabel, useTh } from "./kit.jsx";
import { freeStartTimes, bookingEndMin, minToTime, timeToMin, slotIdOf, isCancelledBooking, toYMD } from "../salonLogic.js";

const Line = ({ k, children }) => {
  const th = useTh();
  return <div style={{ display: "flex", gap: 10, fontSize: 13, padding: "5px 0" }}><div style={{ width: 92, color: th.FAINT, flexShrink: 0 }}>{k}</div><div style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{children}</div></div>;
};

export default function BookingSheet({ booking, onClose }) {
  const ctx = useSalon();
  const th = useTh();
  const { masters, role, salonId, step } = ctx;
  const b = booking;
  const [confirm, setConfirm] = useState(null);
  const [moving, setMoving] = useState(false);
  const [mv, setMv] = useState({ date: b?.date, masterId: b?.masterId, time: b?.time });
  const [day, setDay] = useState({});
  const [note, setNote] = useState(b?.staffNote || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!moving || !mv.masterId || !mv.date) return undefined;
    let dead = false;
    get(sref(salonId, `timeslots/${mv.masterId}/${mv.date}`)).then((s) => { if (!dead) setDay(s.val() || {}); }).catch(() => {});
    return () => { dead = true; };
  }, [moving, salonId, mv.masterId, mv.date]);

  const times = useMemo(() => {
    if (!b) return [];
    const d = { ...day };
    // власні слоти запису вважаємо вільними, щоб можна було зсунути на пів години
    if (mv.masterId === b.masterId && mv.date === b.date) {
      for (let m = timeToMin(b.time); m < bookingEndMin(b); m += step) { const id = slotIdOf(minToTime(m)); if (d[id]) d[id] = { ...d[id], available: true, phantom: false }; }
    }
    return freeStartTimes(d, Number(b.durationMin) || 60, step, { minStart: mv.date === toYMD(new Date()) ? new Date().getHours() * 60 + new Date().getMinutes() : 0 });
  }, [day, mv, b, step]);

  if (!b) return null;
  const st = statusOf(b);
  const closed = isCancelledBooking(b);
  const master = masters.find((m) => m.id === b.masterId);
  const paid = Number(b.paidAmount) || 0;
  const pay = PAY[b.paymentStatus];
  const run = async (fn, okText, after) => {
    setBusy(true);
    try { await fn(); ctx.toast(okText); if (after) after(); } catch (e) { ctx.toast(errText(e), "err"); }
    finally { setBusy(false); setConfirm(null); }
  };

  return (
    <>
      <Modal open onClose={onClose} title={b.clientName || "Запис"} icon="📋"
        footer={!closed && b.status !== "completed" ? (
          <>
            {b.status === "pending" && <Btn flex={2} disabled={busy} onClick={() => run(() => confirmBooking(ctx, b.id), "Підтверджено", onClose)}>✓ Підтвердити</Btn>}
            {b.status === "confirmed" && <Btn flex={2} disabled={busy} onClick={() => run(() => completeBooking(ctx, b.id), "Візит завершено", onClose)}>✓ Візит відбувся</Btn>}
            <Btn variant="ghost" flex={1} disabled={busy} accent={th.RED} onClick={() => setConfirm("cancel")}>Скасувати</Btn>
          </>
        ) : null}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <Pill label={st.label} color={st.color} bg={`color-mix(in srgb, ${st.color} 18%, transparent)`} />
          {pay && <Pill label={pay.label} color={pay.color} bg={`color-mix(in srgb, ${pay.color} 18%, transparent)`} />}
          {b.cancelledBy && <span style={{ fontSize: 11, color: th.DIM }}>скасував: {({ client: "клієнт", admin: "власник", master: "майстер", license: "система", payment_timeout: "не оплачено вчасно", reschedule: "перенесено" })[b.cancelledBy] || b.cancelledBy}</span>}
        </div>
        <Line k="Дата">{dateLabel(b.date)} · {b.time}–{minToTime(bookingEndMin(b))} ({b.durationMin || 60} хв)</Line>
        <Line k="Майстер">{master?.profile?.name || "—"}</Line>
        <Line k="Послуга">{b.serviceName || "—"}</Line>
        <Line k="Вартість">{money(b.price)}{b.paymentMethod === "online" ? " · онлайн" : " · на місці"}</Line>
        {paid > 0 && <Line k="Сплачено">{money(paid)}{paid < Number(b.price) ? ` (залишок ${money(Number(b.price) - paid)})` : ""}</Line>}
        {b.phone && <Line k="Телефон"><a href={`tel:${b.phone}`} style={{ color: th.BLUE, textDecoration: "none", fontWeight: 700 }}>{b.phone}</a></Line>}
        {b.clientNote && <Line k="Побажання клієнта">💬 {b.clientNote}</Line>}
        <Line k="Створено">{b.createdBy === "admin" ? "власником" : b.createdBy === "master" ? "майстром" : "клієнтом онлайн"}</Line>

        <ModalSection label="Нотатка для себе">
          <Field value={note} onChange={setNote} textarea rows={2} placeholder="Видно лише персоналу" />
          {note !== (b.staffNote || "") && <Btn variant="ghost" onClick={() => run(() => saveBookingNote(ctx, b.id, note.trim()), "Збережено")}>Зберегти нотатку</Btn>}
        </ModalSection>

        {!closed && (
          <ModalSection label="Оплата і зміни">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {paid < Number(b.price) && <Btn variant="ghost" disabled={busy} onClick={() => run(() => markPaidOnSite(ctx, b), "Позначено оплаченим")}>💵 Оплачено на місці</Btn>}
              <Btn variant="ghost" onClick={() => setMoving(!moving)}>📅 Перенести</Btn>
            </div>
            {moving && (
              <div style={{ marginTop: 12 }}>
                {role === "owner" && <Select label="Майстер" value={mv.masterId} onChange={(v) => setMv({ ...mv, masterId: v, time: "" })} options={masters.filter((m) => m.profile?.active !== false).map((m) => ({ v: m.id, l: m.profile?.name || "Майстер" }))} />}
                <Input label="Дата" type="date" value={mv.date} onChange={(v) => setMv({ ...mv, date: v, time: "" })} />
                {times.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{times.map((t) => <Chip key={t} active={mv.time === t} color={th.ACCENT} onClick={() => setMv({ ...mv, time: t })}>{t}</Chip>)}</div> : <Hint>Вільних вікон немає.</Hint>}
                <Btn disabled={busy || !mv.time || (mv.time === b.time && mv.date === b.date && mv.masterId === b.masterId)} onClick={() => run(() => moveBooking(ctx, b.id, mv), "Запис перенесено", onClose)}>Перенести запис</Btn>
                <Hint>Клієнт отримає сповіщення про новий час.</Hint>
              </div>
            )}
          </ModalSection>
        )}
        {role === "owner" && paid > 0 && (
          <ModalSection label="Повернення коштів">
            <Btn variant="ghost" accent={th.RED} disabled={busy} onClick={() => setConfirm("refund")}>↩️ Повернути {money(paid)}</Btn>
            <Hint>Повернення на картку клієнта через Monobank. Автоматично повертається при скасуванні вами або майстром, а при скасуванні клієнтом — за вашою політикою.</Hint>
          </ModalSection>
        )}
      </Modal>
      <Confirm open={confirm === "cancel"} danger title="Скасувати запис?" yes="Скасувати запис" no="Ні"
        text={`${b.clientName || "Клієнт"} · ${dateLabel(b.date)} ${b.time}\nКлієнт отримає сповіщення, час звільниться.${paid > 0 ? `\nПередоплату ${money(paid)} буде повернено клієнту автоматично.` : ""}`}
        onNo={() => setConfirm(null)} onYes={() => run(() => cancelBooking(ctx, b.id), "Запис скасовано", onClose)} />
      <Confirm open={confirm === "refund"} danger title="Повернути кошти?" yes="Повернути" no="Ні" text={`Клієнту ${b.clientName || ""} буде повернено ${money(paid)}.`}
        onNo={() => setConfirm(null)} onYes={() => run(() => refundBooking(b.id), "Повернення ініційовано", onClose)} />
    </>
  );
}
