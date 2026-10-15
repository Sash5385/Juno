import { useState, useContext } from "react";
import { ThemeContext } from "../theme.js";
import { Btn } from "../ui";

// Макет «29 · Туман» (темне скло) для сторінки «Послуги»: сегменти → сітка 2×N скляних карток → скляна картка з рядками →
// чипи → велика кнопка. Розміри/кольори/шрифти взяті 1-в-1 з макета.
const GL = "blur(16px)";
const FILTERS = [
  { id: "all", label: "Усі" },
  { id: "off", label: "Вимкнені" },
  { id: "arch", label: "Архів" },
];
const TYPES = [
  { id: "", label: "Усі типи" },
  { id: "school", label: "Стандарт" },
  { id: "private", label: "Індивід." },
  { id: "group", label: "Група" },
];

export default function ServicesFog({ services, colorOf, fmt, capOf, isProtected, onEdit, onToggle, onDelete, onAdd, getHandlers }) {
  const theme = useContext(ThemeContext);
  const { TEXT, DIM, SURFACE, SURF_HI, BORDER, ACCENT, ACC_HI, BTN_GRAD, BTN_TX, SO } = theme;
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("");

  const base = services.filter(s => (filter === "arch" ? s.archived : filter === "off" ? !s.active && !s.archived : !s.archived));
  const shown = base.filter(s => !type || (type === "group" ? capOf(s) > 1 : s.type === type && capOf(s) <= 1));
  const activeCount = services.filter(s => s.active && !s.archived).length;
  const archCount = services.filter(s => s.archived).length;
  const stop = e => e.stopPropagation();
  const row = { display: "flex", alignItems: "center", gap: 8, fontSize: 12 };
  const rowSep = { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` };
  const toggle = on => ({ width: 34, height: 20, borderRadius: 99, flexShrink: 0, position: "relative", cursor: "pointer", border: `1px solid ${on ? "transparent" : BORDER}`, background: on ? BTN_GRAD : SURF_HI });
  const thumb = on => ({ position: "absolute", top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: on ? "#fff" : DIM, transition: "left .2s" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* сегменти */}
      <div style={{ display: "flex", background: SURFACE, padding: 3, borderRadius: 12, border: `1px solid ${BORDER}`, backdropFilter: GL, WebkitBackdropFilter: GL }}>
        {FILTERS.map(f => {
          const on = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: on ? SURF_HI : "transparent", color: on ? TEXT : DIM, boxShadow: on ? "0 2px 8px rgba(0,0,0,.12)" : "none" }}>
              {f.label}{f.id === "arch" && archCount ? ` · ${archCount}` : ""}
            </button>
          );
        })}
      </div>

      {/* сітка скляних карток 2×N */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        {shown.map((svc, idx) => {
          const c = colorOf(svc);
          const dimmed = !svc.active || svc.archived;
          return (
            <div key={svc.id} data-drag-idx={idx} onClick={() => onEdit(svc)} style={{
              position: "relative", borderRadius: 12, padding: "8px 10px", minWidth: 0, cursor: "pointer", opacity: dimmed ? 0.55 : 1,
              background: `color-mix(in srgb,${c} 26%,transparent)`, border: `1px solid color-mix(in srgb,${c} 55%,transparent)`,
              backdropFilter: GL, WebkitBackdropFilter: GL, color: TEXT, overflow: "hidden",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, paddingRight: 22, overflowWrap: "anywhere" }}>{svc.name}</div>
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.92, marginTop: 1, overflowWrap: "anywhere" }}>
                {fmt(svc.duration)} · {svc.price || 0} ₴{capOf(svc) > 1 ? ` · група ${capOf(svc)}` : ""}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }} onClick={stop}>
                {!filter.startsWith("arch") && filter === "all" && !type
                  ? <div {...getHandlers(idx)} style={{ cursor: "grab", touchAction: "none", opacity: 0.5, fontSize: 12, lineHeight: 1, padding: "0 4px 0 0" }}>≡</div>
                  : <span />}
                <div onClick={() => onToggle(svc.id, !(svc.active && !svc.archived))} style={toggle(svc.active && !svc.archived)}><div style={thumb(svc.active && !svc.archived)} /></div>
              </div>
              {!isProtected(svc) && (
                <div onClick={e => { stop(e); onDelete(svc); }} style={{ position: "absolute", top: 4, right: 5, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: DIM, cursor: "pointer", background: "rgba(255,255,255,.1)" }}>×</div>
              )}
            </div>
          );
        })}
      </div>
      {shown.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: DIM, fontSize: 12 }}>Немає послуг</div>}

      {/* скляна картка з рядками */}
      <div style={{ borderRadius: 18, background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: SO, padding: "9px 11px", backdropFilter: GL, WebkitBackdropFilter: GL }}>
        <div style={row}><span style={{ flex: 1, fontWeight: 600 }}>Активних послуг</span><span style={{ color: DIM, fontSize: 11 }}>{activeCount}</span></div>
        <div style={{ ...row, ...rowSep }}><span style={{ flex: 1, fontWeight: 600 }}>В архіві</span><span style={{ color: DIM, fontSize: 11 }}>{archCount}</span></div>
      </div>

      {/* чипи типів */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
        {TYPES.map(t => {
          const on = type === t.id;
          return (
            <button key={t.id || "all"} onClick={() => setType(t.id)} style={{ minWidth: 0, fontSize: 11, fontWeight: 600, padding: "9px 2px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              border: `1px solid ${on ? "transparent" : BORDER}`, background: on ? `linear-gradient(145deg,${ACC_HI},${ACCENT})` : SURFACE, color: on ? BTN_TX : DIM, backdropFilter: GL, WebkitBackdropFilter: GL }}>{t.label}</button>
          );
        })}
      </div>

      {/* велика кнопка внизу */}
      <div style={{ position: "sticky", bottom: 10, zIndex: 5, marginTop: 4 }}>
        <Btn variant="primary" onClick={onAdd} style={{ width: "100%", fontWeight: 700, fontSize: 13, padding: 11 }}>Додати послугу</Btn>
      </div>
    </div>
  );
}
