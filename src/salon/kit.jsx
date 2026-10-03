/* eslint-disable react-refresh/only-export-components */
// Дрібні спільні компоненти салонної адмінки поверх src/ui.jsx
import { useContext, useState, useCallback } from "react";
import { ThemeContext } from "../theme.js";
import { Modal, Btn, RADIUS } from "../ui.jsx";
import { fromYMD } from "../salonLogic.js";

export const useTh = () => useContext(ThemeContext);

export function Spinner() {
  return <div style={{ display: "flex", justifyContent: "center", padding: 28 }}><div className="spinner" /></div>;
}

export function Empty({ icon = "🗓", text }) {
  const th = useTh();
  return <div style={{ textAlign: "center", padding: "28px 12px", color: th.DIM, fontSize: 13 }}><div style={{ fontSize: 30, marginBottom: 6 }}>{icon}</div>{text}</div>;
}

export function Select({ label, value, onChange, options, style = {} }) {
  const th = useTh();
  return (
    <div style={{ marginBottom: 12, ...style }}>
      {label && <div style={{ fontSize: 10, color: th.FAINT, letterSpacing: 1, marginBottom: 5 }}>{label.toUpperCase()}</div>}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", background: th.BG_DEEP, border: `1px solid ${th.BORDER}`, borderRadius: RADIUS.control, padding: "10px 12px", color: th.TEXT, fontSize: 14, outline: "none", fontFamily: "inherit" }}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

// Простий нативний вибір дати/часу в стилі полів
export function Input({ label, value, onChange, type = "text", style = {}, min, max, step, placeholder }) {
  const th = useTh();
  return (
    <div style={{ marginBottom: 12, ...style }}>
      {label && <div style={{ fontSize: 10, color: th.FAINT, letterSpacing: 1, marginBottom: 5 }}>{label.toUpperCase()}</div>}
      <input type={type} value={value} min={min} max={max} step={step} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", background: th.BG_DEEP, border: `1px solid ${th.BORDER}`, borderRadius: RADIUS.control, padding: "10px 12px", color: th.TEXT, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", colorScheme: th.BG_IMAGE ? "light" : "dark" }} />
    </div>
  );
}

export function Row({ children, gap = 8, wrap = false, style = {} }) {
  return <div style={{ display: "flex", gap, alignItems: "center", flexWrap: wrap ? "wrap" : "nowrap", ...style }}>{children}</div>;
}

export function Hint({ children, color }) {
  const th = useTh();
  return <div style={{ fontSize: 11.5, color: color || th.DIM, lineHeight: 1.5, margin: "4px 0 10px" }}>{children}</div>;
}

export function useToast() {
  const th = useTh();
  const [msg, setMsg] = useState(null);
  const show = useCallback((text, kind = "ok") => { setMsg({ text, kind }); setTimeout(() => setMsg(null), 3200); }, []);
  const el = msg ? (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: "calc(env(safe-area-inset-bottom,0px) + 84px)", zIndex: 400, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ background: msg.kind === "err" ? "#7f1d1d" : th.SURF_HI, color: msg.kind === "err" ? "#fff" : th.TEXT, border: `1px solid ${th.BORDER}`, borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, boxShadow: th.SO, maxWidth: 420 }}>{msg.text}</div>
    </div>
  ) : null;
  return [el, show];
}

export function Confirm({ open, title, text, yes = "Так", no = "Ні", danger, onYes, onNo }) {
  const th = useTh();
  return (
    <Modal open={open} onClose={onNo} sheet={false} size="sm" title={title}
      footer={<><Btn variant="ghost" flex={1} onClick={onNo}>{no}</Btn><Btn flex={1} accent={danger ? th.RED : undefined} onClick={onYes}>{yes}</Btn></>}>
      <div style={{ fontSize: 13, color: th.DIM, lineHeight: 1.55, whiteSpace: "pre-line" }}>{text}</div>
    </Modal>
  );
}

export const STATUS = {
  pending: { label: "Очікує", color: "#f7c948" }, confirmed: { label: "Підтверджено", color: "#5b9bff" },
  completed: { label: "Завершено", color: "#7ed957" }, cancelled: { label: "Скасовано", color: "#ef4444" },
  personal: { label: "Особисте", color: "#94a3b8" },
};
export const statusOf = (b) => (b.status === "cancelled" || b.cancelledBy ? STATUS.cancelled : STATUS[b.status] || STATUS.pending);
export const PAY = { deposit_paid: { label: "Передоплата", color: "#2dd4bf" }, paid: { label: "Оплачено", color: "#7ed957" }, refunded: { label: "Повернено", color: "#94a3b8" } };

const WD = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
const MON = ["січ.", "лют.", "бер.", "кві.", "тра.", "чер.", "лип.", "сер.", "вер.", "жов.", "лис.", "гру."];
export const dateLabel = (ymd) => { const d = fromYMD(ymd); return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
export const money = (n) => `${Math.round((Number(n) || 0) * 100) / 100} ₴`;
export const initials = (name) => (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
export const slugify = (s) => String(s || "").toLowerCase().replace(/[іїє]/g, (c) => ({ і: "i", ї: "yi", є: "ye" }[c]))
  .replace(/[а-я]/g, (c) => ({ а: "a", б: "b", в: "v", г: "h", д: "d", е: "e", ж: "zh", з: "z", и: "y", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya", ы: "y", э: "e", ъ: "" }[c] ?? ""))
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "salon";
