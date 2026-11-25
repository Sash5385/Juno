import { useState, useEffect, useContext, useMemo } from "react";
import { ThemeContext } from "../theme.js";
import { Hint } from "../ui";
import { masterOf } from "../workspace";
import { onValue } from "firebase/database";
import { iRef } from "../firebase";
import { useAllCols, allColsEffective } from "../allCols";
import { makeGlobalCSS, computeBookingPrice, STUDENT_PALETTE } from "./admin/shared.jsx";
import { MANUAL_DEFAULT_COLOR } from "../studentColors";
import { money } from "../currency";

// Огляд салону на день: колонка на кожного майстра, записи блоками за часом. Лише перегляд — тап по запису відкриває календар
// цього майстра (там усе редагується як завжди).
const AXIS_W = 40;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const SKIP = new Set(["vip-slot", "personal"]);


export default function AllMastersView({ bookings, staff, settings, onPick, onViewStudent }) {
  const { TEXT, DIM, FAINT, SURFACE, SURF_HI, SURF_LO, BORDER, ACCENT, GREEN, GLOW, SHADE, INK } = useContext(ThemeContext);
  // Поточний час (червона лінія), оновлюється щохвилини
  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  useEffect(() => { const t = setInterval(() => { const n = new Date(); setNowMin(n.getHours() * 60 + n.getMinutes()); }, 60000); return () => clearInterval(t); }, []);
  const [date, setDate] = useState(() => new Date());
  // Колір, обраний у картці клієнта (studentColors/{uid}), має пріоритет над кольором майстра
  const [clientColors, setClientColors] = useState({});
  useEffect(() => onValue(iRef("studentColors"), (s) => setClientColors(s.val() || {})), []);
  // Розмір вікна: масштаб осі часу й ширина колонок залежать від кнопок «години / діб» зверху
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => { const f = () => setWin({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
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

  // Кольори карток — як в індивідуальному розкладі: обраний у картці клієнта → автоколір за порядком появи клієнта
  const autoColor = useMemo(() => {
    const first = new Map();
    for (const b of bookings) {
      if (b.type === "block" || SKIP.has(b.type)) continue;
      const k = b.userId || b.phone || b.name; if (!k) continue;
      const t = b.createdAt ?? 0;
      if (!first.has(k) || t < first.get(k)) first.set(k, t);
    }
    const keys = [...first.keys()].sort((a, c) => (first.get(a) - first.get(c)) || String(a).localeCompare(String(c)));
    const map = {}; keys.forEach((k, i) => { map[k] = STUDENT_PALETTE[i % STUDENT_PALETTE.length]; });
    return map;
  }, [bookings]);
  const colorOfB = (b) => (b.userId && clientColors[b.userId]) || (settings.autoStudentColors === false ? MANUAL_DEFAULT_COLOR : (autoColor[b.userId || b.phone || b.name || b.id] || STUDENT_PALETTE[0]));
  // № запису клієнта (накопичені години на момент запису) — кружечок зліва зверху, як в індивідуальному
  const visitNo = useMemo(() => {
    const by = {};
    for (const b of bookings) { if (b.type === "block" || SKIP.has(b.type) || !b.userId || b.status === "cancelled") continue; (by[b.userId] ||= []).push(b); }
    const map = {};
    Object.values(by).forEach((list) => { list.sort((a, c) => String(a.date).localeCompare(String(c.date)) || a.startMin - c.startMin); let sum = 0; for (const b of list) { sum += (b.durMin || 60) / 60; map[b.id] = Math.round(sum); } });
    return map;
  }, [bookings]);
  const services = settings.services || [];
  // Обід того дня (як в індивідуальному: виняток дня → графік дня тижня → загальні налаштування)
  const lunch = (() => {
    const dow = (new Date(day + "T12:00:00").getDay() + 6) % 7;
    const ov = (settings.dateOverrides || []).find((o) => o.date === day);
    const ws = (settings.weekSchedule || [])[dow] || {};
    return { enabled: ov?.lunchEnabled ?? ws.lunchEnabled ?? settings.lunchEnabled ?? true, start: (ov?.lunchStart ?? ws.lunchStart ?? settings.lunchStart ?? 12) * 60, end: (ov?.lunchEnd ?? ws.lunchEnd ?? settings.lunchEnd ?? 13) * 60 };
  })();

  // Вісь часу: години салону, розширені записами цього дня
  const all = [...byMaster.values()].flat();
  let from = Math.floor((Number(settings.workStart) || 9) * 60 / 60) * 60;
  let to = Math.ceil((Number(settings.workEnd) || 18) * 60 / 60) * 60;
  for (const b of all) { from = Math.min(from, Math.floor(b.startMin / 60) * 60); to = Math.max(to, Math.ceil((b.startMin + b.durMin) / 60) * 60); }
  to = Math.min(to, 24 * 60);
  const hours = Array.from({ length: Math.max(1, (to - from) / 60) }, (_, i) => from + i * 60);
  // «N годин» — скільки годин вміщається на екрані (Авто — весь діапазон записів); «N діб» — скільки колонок майстрів на екрані
  const wantHours = settings.autoHourHeight ? Math.max(6, Math.min(16, hours.length)) : Math.max(1, ((Number(settings.workEnd) || 18) - (Number(settings.workStart) || 9)) * 60 / (Number(settings.hourHeightPx) || 60));
  const HOUR_H = Math.max(26, Math.round(Math.max(240, win.h - 400) / wantHours)); // 400 — шапка, навігація, підсумок дня і підказка
  // Скільки майстрів на екрані: вибір 1–5 (запам'ятовується на пристрої); без вибору — телефон 1, інакше «N діб» зверху.
  // Гортання вбік прилипає до колонки.
  const phone = win.w < 480;
  const colPick = useAllCols(); // вибирається кнопками «N майстр.» у верхній панелі
  const cols = allColsEffective(colPick, staff.length, settings.daysShown, phone);
  const COL_W = Math.max(44, Math.floor((win.w - 36 - AXIS_W) / cols));
  const total = all.length;
  const isToday = day === ymd(new Date());
  const label = date.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  const nav = { width: 40, height: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT, fontSize: 18, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 };

  return (
    // Вкладка розкладу не прокручується (overflow hidden) — свій скрол, щоб підказка внизу не ховалась під нижнім меню
    <div style={{ color: TEXT, display: "flex", flexDirection: "column", gap: 10, height: "100%", overflowY: "auto", paddingBottom: 12, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button aria-label="Попередній день" onClick={() => shift(-1)} style={nav}>‹</button>
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{label.charAt(0).toUpperCase() + label.slice(1)}</div>
          <div style={{ fontSize: 11.5, color: DIM }}>Усі майстри · записів: {total}</div>
        </div>
        <button aria-label="Сьогодні" disabled={isToday} onClick={() => setDate(new Date())} style={{ ...nav, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 600, opacity: isToday ? 0.4 : 1 }}>Сьогодні</button>
        <button aria-label="Наступний день" onClick={() => shift(1)} style={nav}>›</button>
      </div>

      <style>{makeGlobalCSS(SURF_LO, ACCENT, GLOW, SHADE, INK)}</style>
      <div className="cal-neon" style={{ overflowX: "auto", borderRadius: 16, WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory", scrollPaddingLeft: AXIS_W }}>
        <div style={{ display: "flex", minWidth: AXIS_W + staff.length * COL_W }}>
          {/* Вісь часу: години великим, :30 — дрібно; поточний час — червона плашка */}
          <div style={{ width: AXIS_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 3, background: "var(--app-bg, transparent)" }}>
            <div style={{ height: 46 }} />
            <div style={{ position: "relative", height: hours.length * HOUR_H }}>
              {hours.map((h, i) => (
                <div key={h}>
                  <div style={{ position: "absolute", top: i * HOUR_H - 7, right: 6, fontSize: 12, fontWeight: 800, color: TEXT, opacity: 0.85 }}>{`${Math.floor(h / 60)}:00`}</div>
                  {HOUR_H >= 40 && <div style={{ position: "absolute", top: i * HOUR_H + HOUR_H / 2 - 6, right: 6, fontSize: 9.5, color: FAINT }}>{`${Math.floor(h / 60)}:30`}</div>}
                </div>
              ))}
              {isToday && nowMin >= from && nowMin <= to && (
                <div style={{ position: "absolute", left: 2, right: 2, top: ((nowMin - from) / 60) * HOUR_H, transform: "translateY(-50%)", background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 900, lineHeight: 1, borderRadius: 6, padding: "3px 0", textAlign: "center", boxShadow: "0 2px 8px rgba(239,68,68,0.5)", zIndex: 2 }}>{fmt(nowMin)}</div>
              )}
            </div>
          </div>
          {staff.map((m) => {
            const list = byMaster.get(m.id) || [];
            const daySum = list.filter((b) => b.type !== "block" && b.status !== "cancelled" && b.status !== "noshow").reduce((t, b) => t + computeBookingPrice(b, services), 0);
            return (
              <div key={m.id} style={{ flex: 1, minWidth: COL_W, padding: "0 2px", scrollSnapAlign: "start", display: "flex", flexDirection: "column" }}>
                {/* Шапка колонки — як шапка дня */}
                <button onClick={() => onPick(m.id)} style={{ width: "100%", height: 40, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: SURFACE, border: `1px solid color-mix(in srgb,${m.color} 55%,transparent)`, borderRadius: 12, color: TEXT, fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: "0 6px" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                </button>
                <div style={{ position: "relative", height: hours.length * HOUR_H, borderRadius: 12, background: "rgba(0,0,0,0.22)", border: `1px solid ${BORDER}`, overflow: "hidden" }}>
                  {/* Лінії: година — помітніше, :30 — ледь видно */}
                  {Array.from({ length: hours.length * 2 - 1 }, (_, i) => (
                    <div key={i} style={{ position: "absolute", left: 0, right: 0, top: ((i + 1) / 2) * HOUR_H, height: 1, background: (i + 1) % 2 === 0 ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.025)" }} />
                  ))}
                  {lunch.enabled && lunch.end > from && lunch.start < to && (
                    <div style={{ position: "absolute", left: 0, right: 0, top: ((Math.max(lunch.start, from) - from) / 60) * HOUR_H, height: ((Math.min(lunch.end, to) - Math.max(lunch.start, from)) / 60) * HOUR_H, background: "repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(255,255,255,0.04) 6px, rgba(255,255,255,0.04) 12px)", border: "1px solid rgba(96,165,250,0.45)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: FAINT, letterSpacing: 0.5, textTransform: "uppercase" }}>обід</span>
                    </div>
                  )}
                  {isToday && nowMin >= from && nowMin <= to && (
                    <div style={{ position: "absolute", left: 0, right: 0, top: ((nowMin - from) / 60) * HOUR_H, height: 3, zIndex: 1, pointerEvents: "none", background: "#ef4444", boxShadow: "0 2px 6px rgba(239,68,68,0.6)" }} />
                  )}
                  {list.map((b) => {
                    const top = ((b.startMin - from) / 60) * HOUR_H + 1;
                    const h = Math.max(22, (b.durMin / 60) * HOUR_H - 2);
                    const blocked = b.type === "block";
                    const c = colorOfB(b);
                    const price = blocked ? 0 : computeBookingPrice(b, services);
                    const [fName, ...rest] = String(b.name || "").split(" ");
                    const lName = rest.join(" ");
                    const svc = (services.find((x) => x.id === b.serviceId) || {}).name || b.serviceName || "";
                    // Широка колонка — ім'я одним рядком; пріоритет рядків: ім'я → ціна → послуга
                    const wide = COL_W >= 150;
                    const fs = Math.max(8, Math.min(11, Math.floor((COL_W - 10) / 9)));
                    const maxLines = Math.max(1, Math.min(4, Math.floor((h - 14) / (fs * 1.22))));
                    const nameLines = wide || !lName ? [[b.name || "", 800, "rgba(255,255,255,0.95)"]] : [[fName, 800, "rgba(255,255,255,0.95)"], [lName, 700, "rgba(255,255,255,0.8)"]];
                    const priceL = price > 0 ? [[money(price), 900, "rgba(255,255,255,0.9)"]] : [];
                    const svcL = svc ? [[svc, 600, "rgba(255,255,255,0.6)"]] : [];
                    const pick = [...nameLines, ...svcL, ...priceL];
                    const lines = blocked ? [] : (pick.length <= maxLines ? pick : [...nameLines.slice(0, Math.max(1, maxLines - priceL.length)), ...priceL].slice(0, maxLines));
                    return (
                      <button key={b.id} onClick={() => (!blocked && b.userId && onViewStudent ? onViewStudent(b.userId) : onPick(m.id))} title={`${fmt(b.startMin)}–${fmt(b.startMin + b.durMin)}`}
                        className={blocked ? "slot-base" : "slot-base slot-colored"}
                        style={{ "--c": c, position: "absolute", left: 3, right: 3, top, height: h, padding: 0, textAlign: "center", cursor: "pointer", fontFamily: "inherit", zIndex: 2, touchAction: "pan-x pan-y",
                          ...(blocked ? { background: "repeating-linear-gradient(45deg,rgba(148,163,184,.12),rgba(148,163,184,.12) 6px,rgba(148,163,184,.22) 6px,rgba(148,163,184,.22) 12px)", border: `1px solid ${BORDER}` } : {}) }}>
                        {!blocked && visitNo[b.id] != null && h >= 20 && (
                          <span style={{ position: "absolute", top: 3, left: 3, width: 13, height: 13, borderRadius: "50%", background: "rgba(20,20,24,0.85)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.2)", fontSize: 7.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{visitNo[b.id]}</span>
                        )}
                        {!blocked && <span style={{ position: "absolute", top: 3, right: 4, fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{b.time || fmt(b.startMin)}</span>}
                        <span style={{ position: "absolute", top: 13, left: 3, right: 3, bottom: 2, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 1, overflow: "hidden" }}>
                          {blocked ? <span style={{ fontSize: 10, fontWeight: 700, color: DIM }}>Блок</span> : lines.slice(0, maxLines).map(([t, w, col], i) => (
                            <span key={i} style={{ fontSize: fs, fontWeight: w, color: col, lineHeight: 1.2, width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* Підсумок дня майстра */}
                <div style={{ marginTop: 4, minHeight: 22, borderRadius: 7, textAlign: "center", fontSize: 11, fontWeight: 800, lineHeight: "22px", color: daySum > 0 ? GREEN : FAINT, background: `linear-gradient(180deg, color-mix(in srgb, ${SURF_HI} 78%, transparent), color-mix(in srgb, ${SURFACE} 78%, transparent))`, border: `1px solid ${BORDER}` }}>
                  {daySum > 0 ? money(daySum.toLocaleString("uk")) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Hint>Торкніться запису — картка клієнта; імені майстра — його календар</Hint>
    </div>
  );
}
