import { useState, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { PLANS, startLicensePayment } from "./licensePayApi";
import { ThemeContext } from "./theme.js";

// Вибір тарифу + кнопки LiqPay/Monobank (використовується в Налаштуваннях і в модалці банера)
export function LicensePayPanel() {
  const [plan, setPlan] = useState("month");
  const [paying, setPaying] = useState(null);
  const cur = PLANS.find(p => p.id === plan);

  const pay = async (provider) => {
    setPaying(provider);
    try { await startLicensePayment(provider, plan); }
    catch { alert(`Не вдалося відкрити оплату ${provider === "liqpay" ? "LiqPay" : "Monobank"}. Спробуйте пізніше.`); }
    finally { setPaying(null); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {PLANS.map(p => (
          <button key={p.id} onClick={() => setPlan(p.id)} style={{
            flex: 1, padding: "9px 6px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
            border: `1.5px solid ${plan === p.id ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.15)"}`,
            background: plan === p.id ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.18)",
            color: "#fff", fontSize: 13, fontWeight: 800, lineHeight: 1.25,
          }}>
            {p.label}<br/><span style={{ fontSize: 15 }}>{p.price}₴</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => pay("liqpay")} disabled={!!paying} style={{
          flex: 1, padding: "11px", borderRadius: 12, border: "none", cursor: paying ? "default" : "pointer",
          background: paying === "liqpay" ? "rgba(52,211,153,0.3)" : "linear-gradient(135deg,#4ade80,#34d399)",
          color: "#0a2e1a", fontSize: 13, fontWeight: 800,
        }}>{paying === "liqpay" ? "..." : "LiqPay"}</button>
        <button onClick={() => pay("monobank")} disabled={!!paying} style={{
          flex: 1, padding: "11px", borderRadius: 12, border: "none", cursor: paying ? "default" : "pointer",
          background: paying === "monobank" ? "rgba(0,0,0,0.2)" : "linear-gradient(135deg,#3a3a3a,#1a1a1a)",
          color: "#fff", fontSize: 13, fontWeight: 800,
        }}>{paying === "monobank" ? "..." : "Monobank"}</button>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 8, lineHeight: 1.4 }}>
        {cur.note}. Apple Pay / Google Pay / картка. Monobank — разовий платіж (без автосписання).
      </div>
    </div>
  );
}

function LicensePayModal({ onClose }) {
  const { SURF_HI, SURFACE, BORDER, TEXT, DIM, GOLD, BG_DEEP } = useContext(ThemeContext);
  return createPortal(
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 440, padding: "16px 16px calc(20px + env(safe-area-inset-bottom, 0px))",
        borderRadius: "20px 20px 0 0", border: `1px solid ${BORDER}`,
        background: `linear-gradient(145deg,${SURF_HI},${SURFACE})`, color: TEXT,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>💳 Оплата підписки</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: DIM, fontSize: 22, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>
        <div style={{
          padding: "12px 14px", borderRadius: 14, border: `1px solid ${GOLD}55`,
          background: `linear-gradient(135deg,color-mix(in srgb,${GOLD} 38%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
        }}>
          <LicensePayPanel/>
        </div>
      </div>
    </div>,
    document.body
  );
}

const fmtDate = ts => ts ? new Date(ts).toLocaleDateString("uk", { day: "numeric", month: "long" }) : "";

// Смуга над контентом адмінки: попередження за 3 дні, пільгова доба, режим читання.
export function LicenseBanner({ state }) {
  const { GOLD, RED } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);

  // Спроба змінити дані в режимі читання (див. firebaseDbGuard.js) — підсвічуємо смугу
  useEffect(() => {
    let t;
    const on = () => { setFlash(true); clearTimeout(t); t = setTimeout(() => setFlash(false), 2200); };
    window.addEventListener("dp-license-readonly", on);
    return () => { window.removeEventListener("dp-license-readonly", on); clearTimeout(t); };
  }, []);

  if (!state || state.level === "ok") return null;
  const { level, until, daysLeft } = state;
  const cfg = level === "readonly"
    ? { color: RED, text: flash ? "🔒 Режим читання — зміни недоступні, оплатіть підписку" : "🔒 Режим читання · підписку не оплачено" }
    : level === "grace"
    ? { color: "#f59e0b", text: "⚠️ Підписку не оплачено · сьогодні остання доба" }
    : { color: GOLD, text: `⏳ Підписка до ${fmtDate(until)} · ${daysLeft <= 1 ? "залишилась доба" : `ще ${daysLeft} дн.`}` };

  return (
    <>
      <div onClick={() => setOpen(true)} style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        margin: "0 10px 6px", padding: "6px 10px", borderRadius: 10, cursor: "pointer",
        background: `${cfg.color}${flash ? "44" : "22"}`, border: `1px solid ${cfg.color}88`,
        color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1.25,
        transition: "background .2s",
      }}>
        <span style={{ minWidth: 0 }}>{cfg.text}</span>
        <span style={{
          flexShrink: 0, padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 800,
          background: cfg.color, color: "#fff",
        }}>Оплатити</span>
      </div>
      {open && <LicensePayModal onClose={() => setOpen(false)}/>}
    </>
  );
}
