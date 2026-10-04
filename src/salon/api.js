// Виклики HTTP-функцій салону (functions/salon/*) з ID-токеном Firebase Auth. У демо-режимі — заглушки.
import { auth } from "../firebase.js";
import { DEMO } from "../demo/demoMode.js";
import { FUNCTIONS_BASE } from "./env.js";

const base = () => FUNCTIONS_BASE || `https://europe-west1-${auth.app.options.projectId}.cloudfunctions.net`;

export const ERR_TEXT = {
  unauthorized: "Потрібно увійти знову", forbidden: "Немає доступу", salon_not_found: "Салон не знайдено",
  master_not_found: "Майстра не знайдено", invite_invalid: "Код недійсний або вже використаний", bad_code: "Невірний формат коду",
  already_master: "Ви вже майстер у цьому салоні", invalid_token: "Токен Monobank не прийнято — перевірте його",
  token_required: "Спершу підключіть токен Monobank", no_payment_mode: "Увімкніть передоплату або повну оплату",
  nothing_to_refund: "Немає платежів для повернення", refund_failed: "Monobank не виконав повернення — спробуйте пізніше",
  booking_not_found: "Запис не знайдено", too_many_masters: "Активних майстрів більше, ніж дозволяє цей тариф",
  billing_unavailable: "Оплата підписки тимчасово недоступна", too_many_attempts: "Забагато спроб — спробуйте за годину",
  empty_message: "Заповніть заголовок і текст", too_many_broadcasts: "Ліміт розсилок на добу вичерпано — спробуйте завтра",
  salon_unavailable: "Салон у режимі читання — оплатіть підписку", vendor_account: "Цей акаунт видаляти не можна", archive: "Не вдалося зберегти архів — спробуйте пізніше",
  bad_tier: "Невідомий тариф", bad_period: "Невірний період", salon_blocked: "Акаунт заблоковано — напишіть у підтримку",
  monobank_error: "Monobank не створив рахунок — спробуйте пізніше", server: "Помилка сервера, спробуйте пізніше",
};

export async function callFn(name, body = {}) {
  if (DEMO) return demoReply(name, body);
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Object.assign(new Error("unauthorized"), { code: "unauthorized" });
  const r = await fetch(`${base()}/${name}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let json = {};
  try { json = await r.json(); } catch { /* порожня відповідь */ }
  if (!r.ok) throw Object.assign(new Error(json.error || `http_${r.status}`), { code: json.error || `http_${r.status}`, status: r.status });
  return json;
}
export const errText = (e) => ERR_TEXT[e?.code] || ERR_TEXT[e?.message] || "Не вдалося виконати. Спробуйте ще раз.";

function demoReply(name, body) {
  if (name === "salonCreateMasterInvite") return { ok: true, code: "demo.INVITE", link: `${window.location.origin}/join/demo.INVITE`, expiresAt: Date.now() + 72 * 3600000 };
  if (name === "salonSavePaymentSettings") return { ok: true, payment: { ...body, hasToken: true, tokenLast4: "demo" } };
  if (name === "salonRefundBooking") return { ok: true, refunded: 1 };
  if (name === "salonSendBroadcast") return { ok: true, recipients: 12, sent: 9 };
  if (name === "salonDeleteAccount") return { ok: true };
  if (name === "salonSubscriptionInfo") return demoSubscription(body);
  if (name === "salonCreateSubscriptionInvoice") return { pageUrl: "https://pay.example/demo", invoiceId: "demo", paymentId: "demo" };
  if (name === "salonClaimMasterInvite") return { ok: true, salonId: "demo-salon", masterId: "m1" };
  return { ok: true };
}

// Демо: ті самі типові тарифи, що в functions/salon/tariffs.js (2 активні майстри з 3 — один прихований, пробний період)
const DEMO_TIERS = [
  { key: "solo", name: "Соло", maxMasters: 1, monthKop: 19900 }, { key: "team", name: "Команда", maxMasters: 3, monthKop: 39900 },
  { key: "studio", name: "Студія", maxMasters: 7, monthKop: 69900 }, { key: "salon", name: "Салон", maxMasters: 15, monthKop: 119900 },
];
function demoSubscription({ tier, months }) {
  const out = {
    tariffs: { currency: "UAH", yearMonths: 10, trialMasterLimit: 3, tiers: DEMO_TIERS },
    license: { status: "trial", trialEndsAt: Date.now() + 9 * 86400000 }, activeMasters: 2, masterLimit: 3, payable: true,
  };
  const t = DEMO_TIERS.find((x) => x.key === tier);
  if (tier && t) {
    out.quote = t.maxMasters < 2 ? { error: "too_many_masters" }
      : { tier, months, mode: "new", baseKop: t.monthKop * (months === 12 ? 10 : 1), creditKop: 0, amountKop: t.monthKop * (months === 12 ? 10 : 1) };
  }
  return out;
}
