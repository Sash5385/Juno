import { useState, useEffect, useContext } from "react";
import { createPortal } from "react-dom";
import { ThemeContext } from "./theme.js";
import { auth } from "./firebase";
import { DEMO } from "./demo/demoMode.js";
import { APP_VERSION } from "./version.js";

// «Щось не працює?»: інструктор описує проблему текстом, звернення йде власнику сервісу
// (суперадмінка → «Звернення»). Відкривається подією з кнопки в «Налаштування → Профіль».
export const REPORT_PROBLEM_EVENT = "dp-report-problem";
export const openReportProblem = () => window.dispatchEvent(new Event(REPORT_PROBLEM_EVENT));

function Dialog({ onClose }) {
  const { SURFACE, TEXT, DIM, ACCENT, BORDER, BG_DEEP } = useContext(ThemeContext);
  const [text, setText] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | done | error | rate
  const ok = text.trim().length >= 5;

  const send = async () => {
    if (!ok || state === "sending") return;
    setState("sending");
    try {
      if (DEMO) { await new Promise(r => setTimeout(r, 400)); setState("done"); return; }
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const r = await fetch("/api/report-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ app: "admin", message: text.trim(), page: location.pathname, version: APP_VERSION, ua: navigator.userAgent }),
      });
      if (r.status === 429) { setState("rate"); return; }
      setState(r.ok ? "done" : "error");
    } catch { setState("error"); }
  };

  return createPortal(
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 410, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 520, maxHeight: "min(90vh, calc(100dvh - 48px - env(safe-area-inset-top, 0px)))", overflowY: "auto", background: `linear-gradient(${SURFACE},${SURFACE}), ${BG_DEEP}`, color: TEXT, borderRadius: "22px 22px 0 0", padding: "18px 16px calc(18px + env(safe-area-inset-bottom,0px))", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: DIM, opacity: 0.5, margin: "0 auto 14px" }} />
        {state === "done" ? (
          <>
            <div style={{ textAlign: "center", fontSize: 42 }}>✅</div>
            <div style={{ textAlign: "center", fontSize: 18, fontWeight: 900, margin: "8px 0 4px" }}>Дякуємо!</div>
            <div style={{ textAlign: "center", fontSize: 13, color: DIM, lineHeight: 1.5 }}>Ми отримали ваше повідомлення і розберемось якнайшвидше.</div>
            <button onClick={onClose} style={{ width: "100%", marginTop: 16, padding: 12, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>Закрити</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 900 }}>🛠 Щось не працює?</div>
            <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.5, margin: "6px 0 10px" }}>Опишіть, що саме пішло не так: на якому екрані і що ви натискали. Повідомлення одразу піде розробнику.</div>
            <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={6} autoFocus
              placeholder="Наприклад: слоти не розставляються після натискання ключика…"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 120, padding: 12, borderRadius: 12, border: `1px solid ${BORDER}`, background: "rgba(0,0,0,0.25)", color: TEXT, fontSize: 15, fontFamily: "inherit", outline: "none" }} />
            {(state === "error" || state === "rate") && (
              <div style={{ color: ACCENT, fontSize: 12.5, marginTop: 8 }}>{state === "rate" ? "Забагато повідомлень. Спробуйте трохи пізніше." : "Не вдалося надіслати. Перевірте інтернет і спробуйте ще раз."}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${BORDER}`, background: "transparent", color: DIM, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>Скасувати</button>
              <button onClick={send} disabled={!ok || state === "sending"} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontWeight: 800, fontFamily: "inherit", cursor: ok ? "pointer" : "default", opacity: ok ? 1 : 0.45 }}>{state === "sending" ? "Надсилаємо…" : "Надіслати"}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// Монтується в App один раз
export default function ReportProblem() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(REPORT_PROBLEM_EVENT, on);
    return () => window.removeEventListener(REPORT_PROBLEM_EVENT, on);
  }, []);
  if (!open) return null;
  return <Dialog onClose={() => setOpen(false)} />;
}
