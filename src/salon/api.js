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
  booking_not_found: "Запис не знайдено", server: "Помилка сервера, спробуйте пізніше",
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
  if (name === "salonClaimMasterInvite") return { ok: true, salonId: "demo-salon", masterId: "m1" };
  return { ok: true };
}
