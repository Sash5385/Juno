// Статистика (власник): виручка, записи, скасування — разом і по кожному майстру; топ послуг
import { useState, useMemo } from "react";
import { Card, StatTile, SectionTitle, Chip } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { useBookings } from "../data.js";
import { Empty, Spinner, Row, money, useTh } from "../kit.jsx";
import { toYMD, addDays, aggregateStats, isCancelledBooking } from "../../salonLogic.js";

const RANGES = [["7", "7 днів"], ["30", "30 днів"], ["90", "90 днів"], ["365", "Рік"]];

export default function Stats() {
  const ctx = useSalon();
  const th = useTh();
  const today = toYMD(new Date());
  const [days, setDays] = useState("30");
  const from = addDays(today, -Number(days));
  const { bookings, loading } = useBookings(ctx, from, addDays(today, 60));
  const past = useMemo(() => bookings.filter((b) => b.date <= today), [bookings, today]);
  const stats = useMemo(() => aggregateStats(past, ctx.masters.map((m) => m.id)), [past, ctx.masters]);
  const planned = useMemo(() => bookings.filter((b) => b.date >= today && b.status !== "personal" && !isCancelledBooking(b) && b.status !== "completed").reduce((s, b) => s + (Number(b.price) || 0), 0), [bookings, today]);
  const top = useMemo(() => {
    const m = {};
    for (const b of past) if (b.status === "completed" && b.serviceName) { const r = (m[b.serviceName] ||= { name: b.serviceName, n: 0, sum: 0 }); r.n++; r.sum += Number(b.price) || 0; }
    return Object.values(m).sort((a, b) => b.sum - a.sum).slice(0, 5);
  }, [past]);
  const maxRev = Math.max(1, ...stats.rows.map((r) => r.revenue));
  const nameOf = (id) => ctx.masters.find((m) => m.id === id)?.profile?.name || "—";
  const cancelPct = stats.all.total ? Math.round((stats.all.cancelled / stats.all.total) * 100) : 0;
  return (
    <div>
      <Row gap={6} wrap style={{ marginBottom: 12 }}>{RANGES.map(([id, l]) => <Chip key={id} active={days === id} color={th.ACCENT} onClick={() => setDays(id)}>{l}</Chip>)}</Row>
      {loading ? <Spinner /> : stats.all.total === 0 ? <Empty icon="📊" text="За цей період записів немає" /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 14 }}>
            <StatTile value={money(stats.all.revenue)} label="Виручка" color={th.GREEN} />
            <StatTile value={stats.all.completed} label="Візитів" color={th.BLUE} />
            <StatTile value={`${cancelPct}%`} label="Скасувань" color={cancelPct > 25 ? th.RED : th.GOLD} />
            <StatTile value={money(planned)} label="Заплановано" color={th.TEAL} />
          </div>
          <SectionTitle>По майстрах</SectionTitle>
          {stats.rows.sort((a, b) => b.revenue - a.revenue).map((r) => (
            <Card key={r.masterId} style={{ marginBottom: 8 }}>
              <div style={{ padding: "10px 12px" }}>
                <Row gap={8}><div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(r.masterId)}</div><div style={{ fontWeight: 900 }}>{money(r.revenue)}</div></Row>
                <div style={{ height: 6, borderRadius: 3, background: th.BG_DEEP, margin: "7px 0" }}><div style={{ height: 6, borderRadius: 3, width: `${(r.revenue / maxRev) * 100}%`, background: th.GREEN }} /></div>
                <div style={{ fontSize: 11.5, color: th.DIM }}>візитів {r.completed} · попереду {r.upcoming} · скасовано {r.cancelled}{r.prepaid ? ` · передоплат ${money(r.prepaid)}` : ""}</div>
              </div>
            </Card>
          ))}
          {top.length > 0 && <>
            <SectionTitle style={{ marginTop: 14 }}>Топ послуг за виручкою</SectionTitle>
            <Card><div style={{ padding: "4px 12px" }}>{top.map((t, i) => (
              <Row key={t.name} gap={8} style={{ padding: "8px 0", borderTop: i ? `1px solid ${th.BORDER}` : "none", fontSize: 13 }}>
                <div style={{ width: 18, color: th.FAINT, fontWeight: 800 }}>{i + 1}</div><div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ color: th.DIM, fontSize: 12 }}>{t.n}×</div><div style={{ fontWeight: 800, width: 78, textAlign: "right" }}>{money(t.sum)}</div>
              </Row>))}</div></Card>
          </>}
          <div style={{ fontSize: 11, color: th.FAINT, marginTop: 12 }}>Виручка — сума завершених візитів. Записи, які ще не позначені «Візит відбувся», у ній не враховуються.</div>
        </>
      )}
    </div>
  );
}
