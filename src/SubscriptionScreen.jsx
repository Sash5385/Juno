import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";


const BG    = "#161719";
const SURF  = "#26282c";
const HI    = "#2e3034";
const BRD   = "rgba(255,255,255,0.07)";
const TEXT  = "#e8e8ea";
const DIM   = "#8b8d93";
const ACCENT = "#ff5a3c";
const GREEN  = "#34d399";
const GOLD   = "#fbbf24";

const MONTHLY_PRICE = 499;

function daysLeft(ts) {
  return Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
}

export function TrialBanner({ subscription }) {
  if (!subscription || subscription.plan !== "trial") return null;
  const days = daysLeft(subscription.trialEndsAt || 0);
  if (days <= 0) return null;

  const urgent = days <= 3;
  const color  = urgent ? ACCENT : GOLD;

  return (
    <div style={{
      padding:"8px 14px",
      background: urgent ? "rgba(255,90,60,0.12)" : "rgba(251,191,36,0.1)",
      borderBottom:`1px solid ${urgent ? "rgba(255,90,60,0.3)" : "rgba(251,191,36,0.25)"}`,
      display:"flex", alignItems:"center", gap:8,
      fontSize:12, color,
    }}>
      <span>{urgent ? "⚠️" : "⏳"}</span>
      <span style={{flex:1, fontWeight:600}}>
        Пробний період: залишилось <strong>{days}</strong> {days === 1 ? "день" : days < 5 ? "дні" : "днів"}
      </span>
      <PayButton compact subscription={subscription}/>
    </div>
  );
}

function PayButton({ compact, subscription }) {
  const [loading, setLoading] = useState(false);

  const pay = async () => {
    const iid = auth.currentUser?.uid;
    if (!iid) { alert("Не авторизовано"); return; }
    setLoading(true);
    try {
      const resp = await fetch("/api/liqpay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: MONTHLY_PRICE, months: 1, iid }),
        credentials: "include",
      });
      if (!resp.ok) throw new Error("server error");
      const { data, signature, action } = await resp.json();
      // Submit LiqPay form
      const form = document.createElement("form");
      form.method = "POST";
      form.action = action || "https://www.liqpay.ua/api/3/checkout";
      form.target = "_blank";
      [["data", data], ["signature", signature]].forEach(([n, v]) => {
        const inp = document.createElement("input");
        inp.type = "hidden"; inp.name = n; inp.value = v;
        form.appendChild(inp);
      });
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    } catch {
      alert("Помилка з'єднання з платіжним сервісом. Спробуйте пізніше.");
    } finally {
      setLoading(false);
    }
  };

  if (compact) return (
    <button onClick={pay} disabled={loading} style={{
      padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer",
      background: GOLD, color:"#1a1200", fontSize:11, fontWeight:700,
    }}>
      {loading ? "..." : `Оплатити ${MONTHLY_PRICE}₴`}
    </button>
  );

  return (
    <button onClick={pay} disabled={loading} style={{
      width:"100%", padding:"14px", borderRadius:14,
      background: loading ? "rgba(52,211,153,0.3)" : `linear-gradient(135deg,#4ade80,${GREEN})`,
      border:"none", color:"#0a2e1a", fontSize:15, fontWeight:800, cursor: loading ? "default" : "pointer",
      boxShadow: loading ? "none" : "0 4px 16px rgba(52,211,153,0.4)",
    }}>
      {loading ? "Перехід до оплати..." : `Підключити — ${MONTHLY_PRICE}₴/місяць`}
    </button>
  );
}

export function SubscriptionExpiredScreen({ subscription }) {
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    await signOut(auth).catch(() => {});
  };

  const isExpiredTrial = subscription?.plan === "trial";
  const isExpiredPaid  = subscription?.plan === "active";

  return (
    <div style={{
      minHeight:"100vh", background:BG, display:"flex", alignItems:"center",
      justifyContent:"center", padding:"20px",
    }}>
      <div style={{
        background:`linear-gradient(135deg,${HI},${SURF})`,
        borderRadius:24, padding:"36px 28px", width:"100%", maxWidth:420,
        boxShadow:"6px 6px 24px rgba(0,0,0,0.5)", border:`1px solid ${BRD}`,
        textAlign:"center",
      }}>
        <div style={{fontSize:52, marginBottom:16}}>{isExpiredPaid ? "🔒" : "⏰"}</div>
        <div style={{fontSize:22, fontWeight:800, color:TEXT, marginBottom:10}}>
          {isExpiredPaid ? "Підписка закінчилась" : "Пробний період завершено"}
        </div>
        <div style={{fontSize:14, color:DIM, lineHeight:1.6, marginBottom:28}}>
          {isExpiredPaid
            ? "Для продовження роботи поновіть підписку."
            : "Ваш безкоштовний пробний період закінчився. Підключіть підписку щоб продовжити роботу."
          }
        </div>

        <div style={{
          background:"rgba(52,211,153,0.08)", borderRadius:14,
          padding:"16px", marginBottom:24, border:"1px solid rgba(52,211,153,0.2)",
        }}>
          <div style={{fontSize:13, color:DIM, marginBottom:4}}>Місячна підписка</div>
          <div style={{fontSize:32, fontWeight:900, color:GREEN}}>{MONTHLY_PRICE}₴</div>
          <div style={{fontSize:12, color:DIM, marginTop:2}}>/місяць · без обмежень</div>
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:12}}>
          <PayButton subscription={subscription}/>
          <button onClick={logout} disabled={loggingOut} style={{
            padding:"10px", borderRadius:10, border:`1px solid ${BRD}`,
            background:"transparent", color:DIM, fontSize:13, cursor:"pointer",
          }}>
            {loggingOut ? "Вихід..." : "Вийти з акаунту"}
          </button>
        </div>
      </div>
    </div>
  );
}
