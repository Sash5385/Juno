// Налаштування → Підписка (власник): тариф за кількістю активних майстрів, період, розрахунок, оплата Monobank
import { useState } from "react";
import { Btn, Chip, Card } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { callFn, errText } from "../api.js";
import { Row, Hint, useTh, dateLabel } from "../kit.jsx";
import { useSubscription, kop } from "../subscription.js";

const ymd = (ts) => dateLabel(new Date(ts).toISOString().slice(0, 10));

export default function Subscription() {
  const ctx = useSalon();
  const th = useTh();
  const lic = ctx.license;
  const [tier, setTier] = useState(null);
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const { info, error, loading } = useSubscription({ tier, months, reloadKey: `${lic?.lastPaymentId || ""}${lic?.expiresAt || ""}` });
  if (!info) return <Hint>{error ? errText(error) : "Завантаження…"}</Hint>;

  const { tariffs, license, activeMasters, masterLimit, payable } = info;
  const until = license ? (license.status === "trial" ? license.trialEndsAt : license.expiresAt) : null;
  const current = tariffs.tiers.find((t) => t.key === license?.tier);
  const status = !license ? "Немає підписки" : license.status === "trial" ? "Пробний період" : license.status === "suspended" ? "Призупинено" : "Підписка активна";
  const fresh = !loading && info.quote && info.quote.tier === tier && info.quote.months === months ? info.quote : null;
  const quoteError = !loading && info.quote?.error ? info.quote.error : null;
  const q = fresh && !fresh.error ? fresh : null;
  const per = (t) => t.monthKop * (months === 12 ? tariffs.yearMonths : 1);

  const pay = async () => {
    setBusy(true);
    try {
      const r = await callFn("salonCreateSubscriptionInvoice", { tier, months });
      if (r.pageUrl) window.location.href = r.pageUrl; else ctx.toast("Оплата зараз недоступна", "err");
    } catch (e) { ctx.toast(errText(e), "err"); } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{status}{current ? ` · «${current.name}»` : ""}</div>
      <div style={{ fontSize: 12, color: th.DIM, marginBottom: 10 }}>
        {until ? `до ${ymd(until)} · ` : ""}майстрів: {activeMasters}{masterLimit ? ` з ${masterLimit}` : ""}
      </div>
      <Row gap={8} style={{ marginBottom: 10 }}>
        <Chip active={months === 1} color={th.ACCENT} onClick={() => setMonths(1)}>1 місяць</Chip>
        <Chip active={months === 12} color={th.ACCENT} onClick={() => setMonths(12)}>12 міс. · −{12 - tariffs.yearMonths} міс.</Chip>
      </Row>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tariffs.tiers.map((t) => {
          const tooSmall = activeMasters > t.maxMasters;
          const on = tier === t.key;
          return (
            <div key={t.key} data-testid={`tier-${t.key}`}><Card onClick={() => !tooSmall && setTier(t.key)}
              style={{ cursor: tooSmall ? "not-allowed" : "pointer", opacity: tooSmall ? 0.45 : 1, outline: on ? `2px solid ${th.ACCENT}` : "none" }}>
              <Row gap={8}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{t.name}{license?.tier === t.key ? " · ваш" : ""}</div>
                  <div style={{ fontSize: 12, color: th.DIM }}>{t.maxMasters === 1 ? "1 майстер" : `до ${t.maxMasters} майстрів`}{tooSmall ? " · у вас більше активних" : ""}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{kop(per(t))}</div>
              </Row>
            </Card></div>
          );
        })}
      </div>
      {tier && (
        <div style={{ marginTop: 12 }}>
          {loading && <Hint>Розрахунок…</Hint>}
          {quoteError && <Hint color={th.RED}>{errText({ code: quoteError })}</Hint>}
          {q && (
            <div data-testid="sub-quote" style={{ fontSize: 13, marginBottom: 8 }}>
              {q.creditKop > 0 && <div style={{ color: th.DIM }}>Залишок поточного тарифу: −{kop(q.creditKop)}</div>}
              <div style={{ fontWeight: 800 }}>До сплати: {kop(q.amountKop)}</div>
              <div style={{ fontSize: 12, color: th.DIM }}>{q.mode === "upgrade" ? "Новий період — від сьогодні" : q.mode === "extend" ? "Період додається в кінець діючого" : "Період — після пробного (якщо він ще діє)"}</div>
            </div>
          )}
          <Btn onClick={pay} disabled={busy || !q || !payable}>{busy ? "…" : "Сплатити через Monobank"}</Btn>
          {!payable && <Hint color={th.GOLD}>Оплата підписки ще не підключена на платформі.</Hint>}
        </div>
      )}
      <Hint>Тариф залежить від кількості активних майстрів. Підвищити можна будь-коли — залишок оплаченого часу зараховується. Знизити — коли активних майстрів не більше за ліміт.</Hint>
    </div>
  );
}
