// ═══════════════════════════════════════════════════════════════
// ID4Drive · Shared UI design system
// Single source of truth for windows: panels, modals, fields, buttons.
// Panel look = gradient SURF_HI→SURFACE. Coffee-correct via glow/shade/ink.
// ═══════════════════════════════════════════════════════════════
import { useState, useContext } from "react";
import { ThemeContext } from "./theme.js";

// ── design tokens ──────────────────────────────────────────────
export const RADIUS = { pill: 7, chip: 8, control: 10, avatar: 10, card: 14, button: 14, modal: 24 };
export const GAP    = { xs: 6, sm: 8, md: 10, lg: 12 };
export const PAD    = { card: "12px 14px", control: "10px 14px", button: "13px", tile: "10px 8px", sheet: "20px 18px 36px", popup: "20px" };
export const SCRIM  = 0.75; // modal dimmer opacity (warm-brown on coffee)

// theme-derived effect helpers (light specular / dark shadow / contrast ink)
export function useFX() {
  const { GLOW, SHADE, INK } = useContext(ThemeContext);
  return {
    glow:  a => `rgba(${GLOW},${a})`,
    shade: a => `rgba(${SHADE},${a})`,
    ink:   a => `rgba(${INK},${a})`,
  };
}
export const panel = (SURF_HI, SURFACE) => `linear-gradient(155deg,${SURF_HI},${SURFACE})`;
export const softA = (c, a) => `color-mix(in srgb, ${c} ${Math.round(a*100)}%, transparent)`;

// ── shared global CSS (icon3d, animations, scrollbar) ──────────
export function UICss() {
  const { GLOW, SHADE, BORDER, SURF_LO, GREEN } = useContext(ThemeContext);
  return <style>{`
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-thumb{background:${BORDER};border-radius:3px}
::-webkit-scrollbar-track{background:transparent}
.icon3d{display:inline-flex;align-items:center;justify-content:center;border-radius:${RADIUS.avatar}px;position:relative;overflow:hidden;flex-shrink:0;box-shadow:-2px 4px 10px rgba(${SHADE},0.5),inset 1px 1px 0 rgba(${GLOW},0.25),inset -1px -1px 0 rgba(${SHADE},0.3)}
.icon3d::before{content:'';position:absolute;top:0;right:0;width:60%;height:50%;background:radial-gradient(ellipse at top right,rgba(${GLOW},0.4) 0%,transparent 70%);pointer-events:none}
.icon3d>svg{position:relative;z-index:1;filter:drop-shadow(0 1px 2px rgba(${SHADE},0.4))}
.ui-toggle{width:46px;height:26px;border-radius:13px;cursor:pointer;position:relative;transition:background .2s;background:${SURF_LO};box-shadow:inset 2px 2px 5px rgba(${SHADE},0.4);flex-shrink:0}
.ui-toggle.on{background:linear-gradient(165deg,${GREEN},color-mix(in srgb,${GREEN} 70%,#000))}
.ui-toggle-thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:10px;background:linear-gradient(135deg,#fff,#ccc);transition:left .2s;box-shadow:-1px 2px 4px rgba(${SHADE},0.3)}
.ui-toggle.on .ui-toggle-thumb{left:23px}
.drag-item{transition:transform .12s,box-shadow .12s;touch-action:none}
.drag-item.dragging{opacity:.85;box-shadow:0 16px 40px rgba(${SHADE},0.6);z-index:50;transform:scale(1.01)}
@keyframes fade-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fade-in .18s ease both}
@keyframes modal-sheet-in{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes modal-pop-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.modal-sheet-in{animation:modal-sheet-in .38s cubic-bezier(0.34,1.56,0.64,1) both}
.modal-pop-in{animation:modal-pop-in .18s ease both}
.modal-footer>*{flex:1}
`}</style>;
}

// ── Card: the canonical panel (gradient) ───────────────────────
export function Card({ children, style = {}, onClick, inset = false, className }) {
  const { SURF_HI, SURFACE, BG_DEEP, BORDER, SO, SI } = useContext(ThemeContext);
  return (
    <div onClick={onClick} className={className} style={{
      background: inset ? BG_DEEP : panel(SURF_HI, SURFACE),
      borderRadius: RADIUS.card,
      border: `1px solid ${BORDER}`,
      boxShadow: inset ? SI : SO,
      overflow: "hidden",
      ...style,
    }}>{children}</div>
  );
}

// thin left accent strip (status/type colour)
export function Bar({ color, style = {} }) {
  return <div style={{ width: 4, alignSelf: "stretch", borderRadius: 3, background: color, flexShrink: 0, ...style }} />;
}

// on/off switch (uses .ui-toggle from UICss)
export function Toggle({ on, onChange }) {
  return <div className={`ui-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}><div className="ui-toggle-thumb" /></div>;
}

// small status/label badge
export function Pill({ label, color, bg, style = {} }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: RADIUS.chip, fontSize: 11, fontWeight: 700, color, background: bg, whiteSpace: "nowrap", ...style }}>{label}</span>;
}

// ── SectionTitle: row heading ──────────────────────────────────
export function SectionTitle({ children, right, style = {} }) {
  const { TEXT } = useContext(ThemeContext);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, ...style }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: -0.2, color: TEXT }}>{children}</div>
      {right}
    </div>
  );
}

// ── Section: collapsible panel ─────────────────────────────────
export function Section({ title, icon, children, right, defaultOpen = false }) {
  const { SURF_HI, SURFACE, SURF_LO, BORDER, TEXT, FAINT, SO } = useContext(ThemeContext);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: panel(SURF_HI, SURFACE), borderRadius: RADIUS.card, overflow: "hidden", boxShadow: SO, border: `1px solid ${BORDER}` }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: PAD.card, cursor: "pointer", userSelect: "none" }}>
        {icon != null && (
          <div style={{ width: 32, height: 32, borderRadius: RADIUS.control, flexShrink: 0, background: `linear-gradient(145deg,${SURF_HI},${SURF_LO})`, boxShadow: SO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{icon}</div>
        )}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: TEXT }}>{title}</span>
        {right}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && <div style={{ borderTop: `1px solid ${BORDER}`, padding: PAD.card }}>{children}</div>}
    </div>
  );
}

// ── Field: labelled input / textarea ───────────────────────────
export function Field({ label, value, onChange, placeholder, type = "text", textarea = false, rows = 3, style = {} }) {
  const { BG_DEEP, BORDER, TEXT, FAINT } = useContext(ThemeContext);
  const base = { width: "100%", background: BG_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: PAD.control, color: TEXT, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  return (
    <div style={{ marginBottom: 12, ...style }}>
      {label && <div style={{ fontSize: 10, color: FAINT, letterSpacing: 1, marginBottom: 5 }}>{label.toUpperCase()}</div>}
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...base, resize: "vertical" }} />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} />}
    </div>
  );
}

// ── Chip: selectable colour chip ───────────────────────────────
export function Chip({ active, color, onClick, children }) {
  const { SURF_HI, SURFACE, DIM, SO } = useContext(ThemeContext);
  return (
    <button onClick={onClick} style={{
      padding: "7px 12px", borderRadius: RADIUS.chip + 1, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
      background: active ? `linear-gradient(145deg,${color}55,${color}22)` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
      color: active ? color : DIM, boxShadow: SO,
    }}>{children}</button>
  );
}

// ── Btn: primary (accent) / ghost ──────────────────────────────
export function Btn({ children, onClick, variant = "primary", accent, disabled = false, flex, style = {} }) {
  const { SURF_HI, SURFACE, DIM, FAINT, ACCENT, SO } = useContext(ThemeContext);
  const { glow } = useFX();
  const c = accent || ACCENT;
  const base = { border: "none", cursor: disabled ? "default" : "pointer", borderRadius: RADIUS.button, padding: PAD.button, fontSize: 13, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, ...(flex != null ? { flex } : {}), ...style };
  if (variant === "primary" && !disabled) {
    return (
      <button onClick={onClick} style={{ ...base,
        background: `linear-gradient(165deg,${c},color-mix(in srgb,${c} 65%,#000))`,
        color: "#fff", boxShadow: `0 4px 14px ${softA(c, 0.4)},inset 1px 1px 0 ${glow(0.2)}`,
      }}>{children}</button>
    );
  }
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base,
      background: `linear-gradient(145deg,${SURF_HI},${SURFACE})`, color: disabled ? FAINT : DIM, boxShadow: SO,
    }}>{children}</button>
  );
}

// ── StatTile: small inset metric ───────────────────────────────
export function StatTile({ value, label, color }) {
  const { BG_DEEP, FAINT, SI } = useContext(ThemeContext);
  return (
    <div style={{ background: BG_DEEP, borderRadius: RADIUS.control, boxShadow: SI, padding: PAD.tile, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 9, color: FAINT, marginTop: 2, letterSpacing: 0.5 }}>{(label || "").toUpperCase()}</div>
    </div>
  );
}

// ── Modal: adaptive width, sheet or centered ───────────────────
// size: "sm"|"md"|"lg" or a number (px). sheet=true → bottom sheet.
// icon: optional emoji shown in header icon box.
export function Modal({ open, onClose, children, size = "md", sheet = true, title, icon, grabber = true, pad = true, footer, maxH }) {
  const { SURF_HI, SURFACE, BG, TEXT, FAINT, BORDER } = useContext(ThemeContext);
  const { shade, ink } = useFX();
  if (!open) return null;
  const W = typeof size === "number" ? size : ({ sm: 380, md: 460, lg: 560 }[size] ?? size);
  const bodyPad = !pad ? 0 : footer ? "14px 20px" : sheet ? "14px 20px 28px" : "14px 20px 16px";
  const containerStyle = sheet
    ? { maxWidth: W, width: "100%", margin: "0 auto", background: `linear-gradient(180deg,${SURFACE},${BG})`, borderRadius: `${RADIUS.modal}px ${RADIUS.modal}px 0 0`, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: maxH || "92vh" }
    : { maxWidth: W, width: "100%", margin: "0 16px", background: panel(SURF_HI, SURFACE), borderRadius: RADIUS.modal, overflow: "hidden", boxShadow: `0 20px 60px ${shade(0.6)}`, display: "flex", flexDirection: "column", maxHeight: maxH || "88vh" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: shade(SCRIM), backdropFilter: "blur(8px)", display: "flex", alignItems: sheet ? "flex-end" : "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} className={sheet ? "modal-sheet-in" : "modal-pop-in"} style={containerStyle}>
        {sheet && grabber && <div style={{ width: 36, height: 4, borderRadius: 2, background: ink(0.18), margin: "10px auto 0", flexShrink: 0 }} />}
        {title && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            {icon && <div style={{ width: 34, height: 34, borderRadius: 9, background: ink(0.07), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{icon}</div>}
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, flex: 1 }}>{title}</div>
            <div onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, background: ink(0.07), display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: FAINT, fontSize: 14, flexShrink: 0, userSelect: "none" }}>✕</div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: bodyPad }}>
          {children}
        </div>
        {footer && (
          <div className="modal-footer" style={{ padding: "10px 20px 16px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ModalSection: labelled block inside a Modal ─────────────────
export function ModalSection({ label, children, first = false }) {
  const { BORDER, FAINT } = useContext(ThemeContext);
  return (
    <div>
      {!first && <div style={{ height: 1, background: BORDER, margin: "12px 0" }} />}
      {label && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: FAINT, marginBottom: 8, textTransform: "uppercase" }}>{label}</div>}
      {children}
    </div>
  );
}
