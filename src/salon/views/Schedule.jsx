// Календар дня: записи по майстрах, вільні/заблоковані слоти, новий запис, особистий час, вихідний
import { useState, useMemo } from "react";
import { Card, Bar, Btn, Chip, Pill, Modal, Field, SectionTitle } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { useBookings, useDaySlots } from "../data.js";
import { createBooking, blockSlot, unblockSlot, blockDay, unblockDay } from "../actions.js";
import NewBooking from "../NewBooking.jsx";
import BookingSheet from "../BookingSheet.jsx";
import { Empty, Input, Row, Spinner, statusOf, PAY, money, dateLabel, useTh } from "../kit.jsx";
import { toYMD, addDays, bookingSort, bookingEndMin, minToTime, timeToMin, isCancelledBooking } from "../../salonLogic.js";

const realSlots = (day) => Object.entries(day || {}).filter(([, s]) => s && s.time && !s.phantom).sort((a, b) => a[1].time.localeCompare(b[1].time));

export default function Schedule() {
  const ctx = useSalon();
  const th = useTh();
  const { masters, role, masterId, salonId } = ctx;
  const [date, setDate] = useState(() => toYMD(new Date()));
  const [filter, setFilter] = useState(role === "master" ? masterId : "all");
  const [selected, setSelected] = useState(null);
  const [newOpen, setNewOpen] = useState(null);
  const [slotMenu, setSlotMenu] = useState(null);
  const [personal, setPersonal] = useState(null);

  const active = masters.filter((m) => m.profile?.active !== false && (role === "owner" || m.id === masterId));
  const shown = filter === "all" ? active : active.filter((m) => m.id === filter);
  const slots = useDaySlots(shown.map((m) => m.id), salonId, date);
  const { bookings, loading } = useBookings(ctx, date, date);
  const today = toYMD(new Date());

  const byMaster = useMemo(() => {
    const out = {};
    for (const b of bookings) if (b.date === date) (out[b.masterId] ||= []).push(b);
    for (const k of Object.keys(out)) out[k].sort(bookingSort);
    return out;
  }, [bookings, date]);

  const single = shown.length === 1 ? shown[0] : null;
  const daySlots = single ? slots[single.id] : null;
  const freeCnt = realSlots(daySlots).filter(([, s]) => s.available !== false).length;
  const blockedCnt = realSlots(daySlots).filter(([, s]) => s.adminBlocked).length;

  const act = async (fn, okText) => { try { await fn(); if (okText) ctx.toast(okText); } catch { ctx.toast("Не вдалося виконати", "err"); } setSlotMenu(null); };

  return (
    <div>
      <Row gap={6} style={{ marginBottom: 10 }}>
        <button onClick={() => setDate(addDays(date, -1))} style={navBtn(th)} aria-label="Попередній день">‹</button>
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>{dateLabel(date)}</div>
          <div style={{ fontSize: 11, color: th.DIM }}>{date === today ? "сьогодні" : date}</div>
        </div>
        <button onClick={() => setDate(addDays(date, 1))} style={navBtn(th)} aria-label="Наступний день">›</button>
      </Row>
      <Row gap={6} wrap style={{ marginBottom: 10 }}>
        {date !== today && <Chip color={th.ACCENT} onClick={() => setDate(today)}>Сьогодні</Chip>}
        <div style={{ flex: 1, minWidth: 130 }}><Input type="date" value={date} onChange={(v) => v && setDate(v)} style={{ marginBottom: 0 }} /></div>
      </Row>
      {role === "owner" && active.length > 1 && (
        <Row gap={6} wrap style={{ marginBottom: 10 }}>
          <Chip active={filter === "all"} color={th.ACCENT} onClick={() => setFilter("all")}>Усі майстри</Chip>
          {active.map((m) => <Chip key={m.id} active={filter === m.id} color={th.ACCENT} onClick={() => setFilter(m.id)}>{m.profile?.name || "Майстер"}</Chip>)}
        </Row>
      )}
      <Row gap={8} wrap style={{ marginBottom: 14 }}>
        <Btn flex={1} disabled={!active.length} onClick={() => setNewOpen({ masterId: single?.id || active[0]?.id, date })}>＋ Запис</Btn>
        <Btn flex={1} variant="ghost" disabled={!single} onClick={() => setPersonal({ title: "", from: "13:00", to: "14:00" })}>⏸ Особистий час</Btn>
        {single && (freeCnt > 0
          ? <Btn flex={1} variant="ghost" onClick={() => act(async () => { await blockDay(ctx, single.id, date, daySlots); }, "День закрито для запису")}>🚫 Вихідний</Btn>
          : blockedCnt > 0 && <Btn flex={1} variant="ghost" onClick={() => act(async () => { await unblockDay(ctx, single.id, date, daySlots); }, "День відкрито")}>↩️ Відкрити день</Btn>)}
      </Row>

      {loading ? <Spinner /> : !active.length ? <Empty icon="💇" text="Спершу додайте майстра на вкладці «Майстри»" /> : shown.map((m) => {
        const list = byMaster[m.id] || [];
        const sl = realSlots(slots[m.id]);
        const free = sl.filter(([, s]) => s.available !== false);
        const blocked = sl.filter(([, s]) => s.adminBlocked);
        return (
          <div key={m.id} style={{ marginBottom: 18 }}>
            <SectionTitle right={<span style={{ fontSize: 11, color: th.DIM }}>{list.filter((b) => !isCancelledBooking(b) && b.status !== "personal").length} записів · вільно {free.length}</span>}>{shown.length > 1 ? `💇 ${m.profile?.name || "Майстер"}` : "Записи дня"}</SectionTitle>
            {list.length === 0 && <Card inset style={{ padding: "12px 14px", fontSize: 12.5, color: th.DIM }}>{sl.length ? "Записів немає" : "Вихідний або сітка слотів не створена"}</Card>}
            {list.map((b) => <BookingCard key={b.id} b={b} onClick={() => b.status === "personal" ? setSelected(b) : setSelected(b)} />)}
            {(free.length > 0 || blocked.length > 0) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: th.FAINT, letterSpacing: 1, marginBottom: 6 }}>ВІЛЬНІ СЛОТИ · ТАПНІТЬ, ЩОБ ЗАПИСАТИ АБО ЗАБЛОКУВАТИ</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sl.filter(([, s]) => s.available !== false || s.adminBlocked).map(([id, s]) => (
                    <button key={id} onClick={() => setSlotMenu({ masterId: m.id, id, slot: s })} style={{ padding: "7px 11px", borderRadius: 9, border: `1px solid ${th.BORDER}`, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                      background: s.adminBlocked ? `repeating-linear-gradient(45deg,${th.STRIPE_A},${th.STRIPE_A} 5px,${th.STRIPE_B} 5px,${th.STRIPE_B} 10px)` : th.SURF_HI, color: s.adminBlocked ? th.DIM : th.TEXT }}>{s.adminBlocked ? "🔒 " : ""}{s.time}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {selected && <BookingSheet booking={selected} onClose={() => setSelected(null)} />}
      {newOpen && <NewBooking open onClose={() => setNewOpen(null)} defaults={newOpen} />}
      <Modal open={!!slotMenu} onClose={() => setSlotMenu(null)} title={slotMenu ? `Слот ${slotMenu.slot.time}` : ""} icon="🕒">
        {slotMenu && (slotMenu.slot.adminBlocked
          ? <Btn onClick={() => act(() => unblockSlot(ctx, slotMenu.masterId, date, slotMenu.id), "Слот відкрито")}>↩️ Розблокувати</Btn>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Btn onClick={() => { setNewOpen({ masterId: slotMenu.masterId, date, time: slotMenu.slot.time }); setSlotMenu(null); }}>＋ Записати клієнта на {slotMenu.slot.time}</Btn>
            <Btn variant="ghost" onClick={() => act(() => blockSlot(ctx, slotMenu.masterId, date, slotMenu.id), "Слот заблоковано")}>🔒 Заблокувати цей час</Btn>
          </div>)}
      </Modal>
      <Modal open={!!personal} onClose={() => setPersonal(null)} title="Особистий час" icon="⏸"
        footer={<><Btn variant="ghost" flex={1} onClick={() => setPersonal(null)}>Скасувати</Btn><Btn flex={2} disabled={!personal || timeToMin(personal.to) <= timeToMin(personal.from)} onClick={async () => {
          try { await createBooking(ctx, { masterId: single.id, status: "personal", date, time: personal.from, durationMin: timeToMin(personal.to) - timeToMin(personal.from), clientName: personal.title || "Особистий час" }); ctx.toast("Час заблоковано"); setPersonal(null); }
          catch { ctx.toast("Не вдалося зберегти", "err"); }
        }}>Заблокувати</Btn></>}>
        {personal && <>
          <Field label="Назва" value={personal.title} onChange={(v) => setPersonal({ ...personal, title: v })} placeholder="Обід, лікар, перерва…" />
          <Row gap={8}><Input label="З" type="time" value={personal.from} onChange={(v) => setPersonal({ ...personal, from: v })} style={{ flex: 1 }} /><Input label="До" type="time" value={personal.to} onChange={(v) => setPersonal({ ...personal, to: v })} style={{ flex: 1 }} /></Row>
        </>}
      </Modal>
    </div>
  );
}

const navBtn = (th) => ({ width: 44, height: 44, borderRadius: 12, border: `1px solid ${th.BORDER}`, background: th.SURF_HI, color: th.TEXT, fontSize: 22, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 });

function BookingCard({ b, onClick }) {
  const th = useTh();
  const st = statusOf(b);
  const pay = PAY[b.paymentStatus];
  const personal = b.status === "personal";
  return (
    <Card onClick={onClick} style={{ marginBottom: 8, cursor: "pointer", opacity: isCancelledBooking(b) ? 0.55 : 1 }}>
      <div style={{ display: "flex", gap: 10, padding: "10px 12px" }}>
        <Bar color={personal ? "#94a3b8" : st.color} />
        <div style={{ minWidth: 54, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{b.time}</div>
          <div style={{ fontSize: 10.5, color: th.DIM }}>до {minToTime(bookingEndMin(b))}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{personal ? `⏸ ${b.clientName || "Особистий час"}` : b.clientName || "Клієнт"}</div>
          {!personal && <div style={{ fontSize: 12, color: th.DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.serviceName || "—"} · {money(b.price)}</div>}
          {!personal && <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
            <Pill label={st.label} color={st.color} bg={`color-mix(in srgb, ${st.color} 18%, transparent)`} />
            {pay && <Pill label={pay.label} color={pay.color} bg={`color-mix(in srgb, ${pay.color} 18%, transparent)`} />}
            {b.paymentMethod === "online" && !pay && !isCancelledBooking(b) && <Pill label="Чекає оплати" color="#f59e0b" bg="rgba(245,158,11,0.16)" />}
          </div>}
        </div>
      </div>
    </Card>
  );
}
