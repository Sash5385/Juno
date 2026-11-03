// Статистика (власник): виручка, записи, скасування — разом і по кожному майстру; топ послуг
import { useState, useMemo } from "react";
import { Card, StatTile, SectionTitle, Chip } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { useBookings } from "../data.js";
import { Empty, Spinner, Row, money, useTh } from "../kit.jsx";
import { toYMD, addDays, aggregateStats, isCancelledBooking, workMinutes, occupancyPct, noShowPct, monthRange, shiftMonth } from "../../salonLogic.js";

const RANGES = [["month", "Місяць"], ["7", "7 днів"], ["30", "30 днів"], ["90", "90 днів"], ["365", "Рік"]];
const MONTHS = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const Metric = ({ label, value, color }) => { const th = useTh(); return <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 800, color: color || th.TEXT }}>{value}</div><div style={{ fontSize: 10.5, color: th.FAINT }}>{label}</div></div>; };

export default function Stats() {
  const ctx = useSalon();
  const th = useTh();
  const today = toYMD(new Date());
  const [days, setDays] = useState("month");
  const [ym, setYm] = useState(today.slice(0, 7));
  const isMonth = days === "month";
  const [mFrom, mTo] = monthRange(ym);
  const from = isMonth ? mFrom : addDays(today, -Number(days));
  const to = isMonth ? mTo : addDays(today, 60);
  const { bookings, loading } = useBookings(ctx, from, to);
  // Місяць — увесь місяць (з майбутніми записами); інші періоди — до сьогодні
  const past = useMemo(() => (isMonth ? bookings : bookings.filter((b) => b.date <= today)), [bookings, today, isMonth]);
  const stats = useMemo(() => aggregateStats(past, ctx.masters.map((m) => m.id)), [past, ctx.masters]);
  const planned = useMemo(() => bookings.filter((b) => b.date >= today && b.status !== "personal" && !isCancelledBooking(b) && b.status !== "completed").reduce((s, b) => s + (Number(b.price) || 0), 0), [bookings, today]);
  const top = useMemo(() => {
    const m = {};
    for (const b of past) if (b.status === "completed" && b.serviceName) { const r = (m[b.serviceName] ||= { name: b.serviceName, n: 0, sum: 0 }); r.n++; r.sum += Number(b.price) || 0; }
    return Object.values(m).sort((a, b) => b.sum - a.sum).slice(0, 5);
  }, [past]);
  const capTo = isMonth ? mTo : today;
  const capOf = (id) => workMinutes(ctx.masters.find((m) => m.id === id)?.profile?.workHours, from, capTo);
  const maxRev = Math.max(1, ...stats.rows.map((r) => r.revenue));
  const nameOf = (id) => ctx.masters.find((m) => m.id === id)?.profile?.name || "—";
  const cancelPct = stats.all.total ? Math.round((stats.all.cancelled / stats.all.total) * 100) : 0;
  return (
    <div>
      <Row gap={6} wrap style={{ marginBottom: 12 }}>{RANGES.map(([id, l]) => <Chip key={id} active={days === id} color={th.ACCENT} onClick={() => setDays(id)}>{l}</Chip>)}</Row>
      {isMonth && (
        <Row gap={8} style={{ marginBottom: 12, justifyContent: "center" }}>
          <Chip color={th.ACCENT} onClick={() => setYm(shiftMonth(ym, -1))}>‹</Chip>
          <div style={{ minWidth: 150, textAlign: "center", fontWeight: 800, fontSize: 14, textTransform: "capitalize" }}>{monthLabel(ym)}</div>
          <Chip color={th.ACCENT} onClick={() => setYm(shiftMonth(ym, 1))}>›</Chip>
        </Row>
      )}
      {loading ? <Spinner /> : stats.all.total === 0 ? <Empty icon="📊" text="За цей період записів немає" /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 14 }}>
            <StatTile value={money(stats.all.revenue)} label="Виручка" color={th.GREEN} />
            <StatTile value={stats.all.total} label="Записів" color={th.BLUE} />
            <StatTile value={`${noShowPct(stats.all)}%`} label={`Неявок (${stats.all.noShow})`} color={noShowPct(stats.all) > 10 ? th.RED : th.GOLD} />
            <StatTile value={`${cancelPct}%`} label="Скасувань" color={cancelPct > 25 ? th.RED : th.GOLD} />
            <StatTile value={money(planned)} label="Заплановано" color={th.TEAL} />
          </div>
          <SectionTitle>По майстрах</SectionTitle>
          {stats.rows.sort((a, b) => b.revenue - a.revenue).map((r) => (
            <Card key={r.masterId} style={{ marginBottom: 8 }}>
              <div style={{ padding: "10px 12px" }}>
                <Row gap={8}><div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(r.masterId)}</div><div style={{ fontWeight: 900 }}>{money(r.revenue)}</div></Row>
                <div style={{ height: 6, borderRadius: 3, background: th.BG_DEEP, margin: "7px 0" }}><div style={{ height: 6, borderRadius: 3, width: `${(r.revenue / maxRev) * 100}%`, background: th.GREEN }} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(70px,1fr))", gap: 8, margin: "4px 0 6px" }}>
                  <Metric label="записів" value={r.total} />
                  <Metric label="візитів" value={r.completed} />
                  <Metric label="неявок" value={r.noShow ? `${r.noShow} (${noShowPct(r)}%)` : 0} color={r.noShow ? th.RED : undefined} />
                  <Metric label="заповненість" value={occupancyPct(r, capOf(r.masterId)) === null ? "—" : `${occupancyPct(r, capOf(r.masterId))}%`} />
                  <Metric label={r.ratingCount ? `оцінок ${r.ratingCount}` : "рейтинг"} value={r.rating ? `★ ${r.rating}` : "—"} color={r.rating ? th.GOLD : undefined} />
                </div>
                <div style={{ fontSize: 11.5, color: th.DIM }}>попереду {r.upcoming} · скасовано {r.cancelled}{r.prepaid ? ` · передоплат ${money(r.prepaid)}` : ""}</div>
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
          <div style={{ fontSize: 11, color: th.FAINT, marginTop: 12 }}>Виручка — сума завершених візитів (не позначені «Візит відбувся» не враховуються). Неявка — запис, позначений «Не з’явився». Заповненість — заброньований час / робочі години майстра (за вирахуванням особистого часу).</div>
        </>
      )}
    </div>
  );
}
