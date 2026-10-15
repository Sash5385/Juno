import { useState, useContext, useMemo } from "react";
import { ThemeContext } from "../theme.js";
import { masterOf } from "../workspace";

// Огляд салону на день: колонка на кожного майстра, записи блоками за часом. Лише перегляд — тап по запису відкриває календар
// цього майстра (там усе редагується як завжди).
const HOUR_H = 52;
const AXIS_W = 40;
const COL_MIN = 112;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const SKIP = new Set(["vip-slot", "personal"]);

export default function AllMastersView({ bookings, staff, settings, onPick }) {
  const { TEXT, DIM, FAINT, SURFACE, BORDER } = useContext(ThemeContext);
  const [date, setDate] = useState(() => new Date());
  const day = ymd(date);
  const ownerIid = (staff.find((m) => m.owner) || {}).id;
  const shift = (n) => { const d = new Date(date); d.setDate(d.getDate() + n); setDate(d); };

  const byMaster = useMemo(() => {
    const map = new Map(staff.map((m) => [m.id, []]));
    for (const b of bookings) {
      if (b.date !== day || SKIP.has(b.type)) continue;
      const list = map.get(masterOf(b, ownerIid));
      if (list) list.push(b);
    }
    return map;
  }, [bookings, staff, day, ownerIid]);

  // Вісь часу: години салону, розширені записами цього дня
  const all = [...byMaster.values()].flat();
  let from = Math.floor((Number(settings.workStart) || 9) * 60 / 60) * 60;
  let to = Math.ceil((Number(settings.workEnd) || 18) * 60 / 60) * 60;
  for (const b of all) { from = Math.min(from, Math.floor(b.startMin / 60) * 60); to = Math.max(to, Math.ceil((b.startMin + b.durMin) / 60) * 60); }
  to = Math.min(to, 24 * 60);
  const hours = Array.from({ length: Math.max(1, (to - from) / 60) }, (_, i) => from + i * 60);
  const total = all.length;
  const isToday = day === ymd(new Date());
  const label = date.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  const nav = { width: 40, height: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT, fontSize: 18, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 };

  return (
    <div style={{ color: TEXT, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button aria-label="Попередній день" onClick={() => shift(-1)} style={nav}>‹</button>
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, textTransform: "capitalize" }}>{label}</div>
          <div style={{ fontSize: 11.5, color: DIM }}>Усі майстри · записів: {total}</div>
        </div>
        <button aria-label="Сьогодні" disabled={isToday} onClick={() => setDate(new Date())} style={{ ...nav, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 600, opacity: isToday ? 0.4 : 1 }}>Сьогодні</button>
        <button aria-label="Наступний день" onClick={() => shift(1)} style={nav}>›</button>
      </div>

      <div style={{ overflowX: "auto", borderRadius: 16, border: `1px solid ${BORDER}`, background: SURFACE, WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", minWidth: AXIS_W + staff.length * COL_MIN }}>
          <div style={{ width: AXIS_W, flexShrink: 0 }}>
            <div style={{ height: 38 }} />
            {hours.map((h) => (<div key={h} style={{ height: HOUR_H, fontSize: 11, color: FAINT, textAlign: "right", paddingRight: 6, boxSizing: "border-box" }}>{fmt(h)}</div>))}
          </div>
          {staff.map((m) => (
            <div key={m.id} style={{ flex: 1, minWidth: COL_MIN, borderLeft: `1px solid ${BORDER}` }}>
              <button onClick={() => onPick(m.id)} style={{ width: "100%", height: 38, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, color: TEXT, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "0 6px" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
              </button>
              <div style={{ position: "relative", height: hours.length * HOUR_H, backgroundImage: `linear-gradient(${BORDER} 1px, transparent 1px)`, backgroundSize: `100% ${HOUR_H}px` }}>
                {(byMaster.get(m.id) || []).map((b) => {
                  const top = ((b.startMin - from) / 60) * HOUR_H;
                  const h = Math.max(22, (b.durMin / 60) * HOUR_H - 2);
                  const blocked = b.type === "block";
                  return (
                    <button key={b.id} onClick={() => onPick(m.id)} title={`${fmt(b.startMin)}–${fmt(b.startMin + b.durMin)}`} style={{
                      position: "absolute", left: 3, right: 3, top, height: h, borderRadius: 9, padding: "3px 6px", textAlign: "left", overflow: "hidden", cursor: "pointer", fontFamily: "inherit", color: TEXT, boxSizing: "border-box",
                      background: blocked ? "rgba(148,163,184,.18)" : `color-mix(in srgb,${m.color} 30%,transparent)`, border: `1px solid ${blocked ? BORDER : `color-mix(in srgb,${m.color} 60%,transparent)`}`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{blocked ? "Блок" : b.name}</div>
                      <div style={{ fontSize: 11, color: DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(b.startMin)}{b.serviceName ? ` · ${b.serviceName}` : ""}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: FAINT, textAlign: "center" }}>Торкніться запису або імені майстра, щоб відкрити його календар</div>
    </div>
  );
}
