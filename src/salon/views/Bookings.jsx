// Список записів: майбутні / очікують підтвердження / минулі / скасовані + пошук
import { useState, useMemo } from "react";
import { Card, Bar, Chip, Pill, Field } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { useBookings } from "../data.js";
import BookingSheet from "../BookingSheet.jsx";
import { Empty, Spinner, statusOf, PAY, money, dateLabel, useTh, Row } from "../kit.jsx";
import { toYMD, addDays, bookingSort, isCancelledBooking } from "../../salonLogic.js";

const FILTERS = [["up", "Майбутні"], ["pending", "Очікують"], ["past", "Минулі"], ["cancelled", "Скасовані"]];

export default function Bookings() {
  const ctx = useSalon();
  const th = useTh();
  const today = toYMD(new Date());
  const [filter, setFilter] = useState("up");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const { bookings, loading } = useBookings(ctx, addDays(today, -30), addDays(today, 180));
  const masterName = (id) => ctx.masters.find((m) => m.id === id)?.profile?.name || "";

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return bookings.filter((b) => b.status !== "personal").filter((b) => {
      const c = isCancelledBooking(b);
      if (filter === "cancelled") return c;
      if (c) return false;
      if (filter === "pending") return b.status === "pending";
      if (filter === "past") return b.date < today || b.status === "completed";
      return b.date >= today && b.status !== "completed";
    }).filter((b) => !s || `${b.clientName || ""} ${b.phone || ""} ${b.serviceName || ""}`.toLowerCase().includes(s))
      .sort((a, b) => (filter === "past" || filter === "cancelled" ? -bookingSort(a, b) : bookingSort(a, b)));
  }, [bookings, filter, q, today]);

  const pendingCnt = bookings.filter((b) => b.status === "pending" && !isCancelledBooking(b)).length;
  return (
    <div>
      <Row gap={6} wrap style={{ marginBottom: 10 }}>
        {FILTERS.map(([id, l]) => <Chip key={id} active={filter === id} color={th.ACCENT} onClick={() => setFilter(id)}>{l}{id === "pending" && pendingCnt ? ` · ${pendingCnt}` : ""}</Chip>)}
      </Row>
      <Field value={q} onChange={setQ} placeholder="Пошук: ім'я, телефон, послуга" style={{ marginBottom: 12 }} />
      {loading ? <Spinner /> : list.length === 0 ? <Empty icon="📋" text="Записів немає" /> : list.map((b) => {
        const st = statusOf(b), pay = PAY[b.paymentStatus];
        return (
          <Card key={b.id} onClick={() => setSelected(b)} style={{ marginBottom: 8, cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 10, padding: "10px 12px" }}>
              <Bar color={st.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.clientName || "Клієнт"}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{dateLabel(b.date)} {b.time}</div>
                </div>
                <div style={{ fontSize: 12, color: th.DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.serviceName || "—"} · {money(b.price)}{ctx.role === "owner" && masterName(b.masterId) ? ` · ${masterName(b.masterId)}` : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                  <Pill label={st.label} color={st.color} bg={`color-mix(in srgb, ${st.color} 18%, transparent)`} />
                  {pay && <Pill label={pay.label} color={pay.color} bg={`color-mix(in srgb, ${pay.color} 18%, transparent)`} />}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
      {selected && <BookingSheet booking={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
