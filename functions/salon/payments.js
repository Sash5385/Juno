// Оплата клієнтом запису через Monobank Acquiring. Гроші йдуть САЛОНУ: кожен салон підключає власний
// мерчант-токен Monobank (salonSavePaymentSettings), токен лежить у salon_secrets/{salonId}/monobankToken —
// вузол без правил (клієнтам закритий, читає лише сервер) і ніколи не повертається клієнту.
// Платформа брала б комісію/підписку окремо (див. docs/SALON-SCHEMA.md).
//
//   клієнт створив запис (paymentMethod: "online", status pending, ціна = каталожна)
//     → POST salonCreateBookingInvoice {salonId, bookingId, mode: "deposit"|"full"}  → pageUrl (сторінка Monobank)
//     → Monobank → POST salonMonobankCallback → paymentStatus запису (paid / deposit_paid / refunded)
//   неоплачений онлайн-запис знімається сам через holdMinutes (salonExpireUnpaidBookings).
//
// Публічні налаштування — salons/{salonId}/profile/payment:
//   {enabled, depositPercent (0-100), allowFull, holdMinutes (5-120), cancelFreeHours (0-720, типово 24), autoConfirm, hasToken, tokenLast4}
// Журнал платежів — salons/{salonId}/payments/{paymentId} (лише сервер): reference у Monobank = "{salonId}.{paymentId}".
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const crypto = require("crypto");
const {
  REGION, db, sRef, isSafeKey, clientUrl, adminUrl, buildAdminLink, clientBookingsLink, buildBookingBody,
  pushClient, pushOwner, pushStaff, saveNotification, masterName, salonName, isCancelled, isLicenseReadonly,
  allSalonIds, localDate, localToMs, salonTimezone,
} = require("./lib");
const { authUser, bodyOf } = require("./http");

const MONOBANK_API = "https://api.monobank.ua/api/merchant";
const INVOICE_VALIDITY_S = 3600;
const REUSE_INVOICE_MS = 50 * 60 * 1000;   // повторний запит під час дії рахунку віддає ту саму сторінку
const OPEN_INVOICE_GRACE_MS = 15 * 60 * 1000;
const DEFAULT_HOLD_MIN = 15;
const MIN_AMOUNT_KOP = 100;

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isTerminalOk = (s) => s === "success" || s === "reversed";
const project = () => process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
const webhookUrl = () => process.env.SALON_MONOBANK_WEBHOOK_URL || `https://${REGION}-${project()}.cloudfunctions.net/salonMonobankCallback`;
const secretRef = (salonId) => db().ref(`salon_secrets/${salonId}`);

// ─── Monobank API ───────────────────────────────────────────────────────
async function mono(token, path, init = {}) {
  const resp = await fetch(`${MONOBANK_API}${path}`, { ...init, headers: { "X-Token": token, "Content-Type": "application/json", ...(init.headers || {}) } });
  let json = null;
  try { json = await resp.json(); } catch { /* порожня відповідь */ }
  return { ok: resp.ok, status: resp.status, json };
}

// Публічний ключ мерчанта (для перевірки X-Sign). Кеш на токен; при невдалій перевірці ключ перечитується (Monobank
// може його змінити), але не частіше разу на 5 хв — інакше підроблені вебхуки змушували б нас засипати Monobank запитами.
const PUBKEY_REFETCH_MS = 5 * 60 * 1000;
const pubKeyCache = new Map();
const tokenId = (token) => crypto.createHash("sha256").update(token).digest("hex");
async function getPubKey(token, force = false) {
  const id = tokenId(token);
  const hit = pubKeyCache.get(id);
  if (hit && (!force || Date.now() - hit.at < PUBKEY_REFETCH_MS)) return hit.pem;
  const r = await mono(token, "/pubkey");
  if (!r.ok || !r.json?.key) throw new Error(`monobank pubkey failed: ${r.status}`);
  const pem = Buffer.from(r.json.key, "base64").toString("utf8");
  pubKeyCache.set(id, { pem, at: Date.now() });
  return pem;
}
async function verifySignature(token, rawBody, signatureB64) {
  const sig = Buffer.from(signatureB64, "base64");
  const check = (pem) => { try { return crypto.createVerify("SHA256").update(rawBody).verify(pem, sig); } catch { return false; } };
  if (check(await getPubKey(token))) return true;
  return check(await getPubKey(token, true));
}
async function refundInvoice(token, invoiceId, amountKop, extRef) {
  try {
    const r = await mono(token, "/invoice/cancel", { method: "POST", body: JSON.stringify({ invoiceId, extRef, amount: amountKop }) });
    return r.ok;
  } catch (e) { console.error("salon refundInvoice error:", e.message); return false; }
}

const getToken = async (salonId) => (await secretRef(salonId).child("monobankToken").get()).val() || null;
const getPaySettings = async (salonId) => (await sRef(salonId, "profile/payment").get()).val() || {};

// ─── Налаштування оплати (власник) ──────────────────────────────────────
const salonSavePaymentSettings = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const user = await authUser(req, res);
    if (!user) return;
    const salonId = user.uid;
    if (!(await sRef(salonId, "profile").get()).exists()) { res.status(404).json({ error: "salon_not_found" }); return; }
    const b = bodyOf(req);
    const cur = await getPaySettings(salonId);
    const next = { ...cur };
    let hasToken = !!(await getToken(salonId));

    if (b.removeToken === true) {
      await secretRef(salonId).remove();
      hasToken = false; next.enabled = false; next.tokenLast4 = null;
    } else if (b.monobankToken !== undefined) {
      const token = String(b.monobankToken || "").trim();
      if (token.length < 20 || token.length > 200 || /\s/.test(token)) { res.status(400).json({ error: "invalid_token" }); return; }
      let ok = false;
      try { const r = await mono(token, "/pubkey"); ok = r.ok && !!r.json?.key; } catch { ok = false; }
      if (!ok) { res.status(400).json({ error: "invalid_token" }); return; }
      await secretRef(salonId).update({ monobankToken: token, updatedAt: Date.now() });
      hasToken = true; next.tokenLast4 = token.slice(-4);
    }
    if (b.depositPercent !== undefined) next.depositPercent = clamp(Math.round(Number(b.depositPercent) || 0), 0, 100);
    if (b.allowFull !== undefined) next.allowFull = b.allowFull === true;
    if (b.cancelFreeHours !== undefined) next.cancelFreeHours = clamp(Math.round(Number(b.cancelFreeHours) || 0), 0, 720);
    if (b.holdMinutes !== undefined) next.holdMinutes = clamp(Math.round(Number(b.holdMinutes) || DEFAULT_HOLD_MIN), 5, 120);
    if (b.autoConfirm !== undefined) next.autoConfirm = b.autoConfirm === true;
    if (b.enabled !== undefined) next.enabled = b.enabled === true;
    if (next.enabled && !hasToken) { res.status(409).json({ error: "token_required" }); return; }
    if (next.enabled && !(next.depositPercent > 0) && next.allowFull === false) { res.status(400).json({ error: "no_payment_mode" }); return; }
    next.hasToken = hasToken;
    next.updatedAt = Date.now();
    await sRef(salonId, "profile/payment").set(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== null)));
    res.json({ ok: true, payment: next });
  } catch (e) {
    console.error("salonSavePaymentSettings error:", e);
    res.status(500).json({ error: "server" });
  }
});

// ─── Створення рахунку (клієнт) ─────────────────────────────────────────
function pickAmount(booking, pay, mode) {
  const price = Number(booking.price);
  if (!(price > 0)) return { error: "no_price" };
  const paid = Number(booking.paidAmount) || 0;
  const remaining = round2(price - paid);
  if (remaining <= 0) return { error: "already_paid" };
  const wantMode = mode || ((pay.depositPercent || 0) > 0 && paid === 0 ? "deposit" : "full");
  if (wantMode === "full") {
    if (pay.allowFull === false) return { error: "mode_not_allowed" };
    return { mode: "full", amount: remaining };
  }
  if (wantMode === "deposit") {
    const pct = Number(pay.depositPercent) || 0;
    if (!(pct > 0)) return { error: "mode_not_allowed" };
    if (paid > 0) return { error: "deposit_already_paid" };
    return { mode: "deposit", amount: Math.min(remaining, Math.ceil(price * pct) / 100) };
  }
  return { error: "bad_mode" };
}

const salonCreateBookingInvoice = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const user = await authUser(req, res);
    if (!user) return;
    const { salonId, bookingId, mode } = bodyOf(req);
    if (!isSafeKey(salonId) || !isSafeKey(bookingId)) { res.status(400).json({ error: "bad_request" }); return; }

    const booking = (await sRef(salonId, `bookings/${bookingId}`).get()).val();
    if (!booking) { res.status(404).json({ error: "booking_not_found" }); return; }
    if (booking.clientUid !== user.uid) { res.status(403).json({ error: "forbidden" }); return; }
    if (isCancelled(booking) || booking.status === "personal" || booking.status === "completed") { res.status(409).json({ error: "booking_closed" }); return; }

    const pay = await getPaySettings(salonId);
    const token = await getToken(salonId);
    if (!pay.enabled || !token) { res.status(409).json({ error: "payments_disabled" }); return; }
    if (isLicenseReadonly((await sRef(salonId, "license").get()).val())) { res.status(409).json({ error: "salon_unavailable" }); return; }

    const now = Date.now();
    const holdMs = clamp(Number(pay.holdMinutes) || DEFAULT_HOLD_MIN, 5, 120) * 60000;
    if (booking.status === "pending" && now - (booking.createdAt || now) > holdMs + OPEN_INVOICE_GRACE_MS) { res.status(409).json({ error: "hold_expired" }); return; }

    const pick = pickAmount(booking, pay, mode);
    if (pick.error) { res.status(pick.error === "bad_mode" ? 400 : 409).json({ error: pick.error }); return; }
    const amountKop = Math.round(pick.amount * 100);
    if (amountKop < MIN_AMOUNT_KOP) { res.status(409).json({ error: "amount_too_small" }); return; }

    // Той самий відкритий рахунок на ту саму суму віддаємо повторно — подвійний клік не плодить рахунки
    const prev = (await sRef(salonId, "payments").orderByChild("bookingId").equalTo(bookingId).get()).val() || {};
    const reuse = Object.entries(prev).find(([, p]) => p.status === "created" && p.amountKop === amountKop && p.pageUrl && now - p.createdAt < REUSE_INVOICE_MS);
    if (reuse) { res.json({ pageUrl: reuse[1].pageUrl, invoiceId: reuse[1].invoiceId, paymentId: reuse[0], amount: pick.amount, mode: pick.mode, reused: true }); return; }
    if (Object.keys(prev).length >= 10) { res.status(429).json({ error: "too_many_attempts" }); return; }

    const paymentRef = sRef(salonId, "payments").push();
    const paymentId = paymentRef.key;
    await paymentRef.set({ bookingId, clientUid: user.uid, masterId: booking.masterId || null, amountKop, mode: pick.mode, status: "creating", createdAt: now });

    const destination = `${(await salonName(salonId)) || "Салон"} — ${booking.serviceName || "послуга"}, ${booking.date} ${booking.time}`.slice(0, 140);
    const r = await mono(token, "/invoice/create", {
      method: "POST",
      body: JSON.stringify({
        amount: amountKop,
        ccy: 980,
        merchantPaymInfo: { reference: `${salonId}.${paymentId}`, destination },
        redirectUrl: `${clientUrl()}/cabinet/bookings`,
        webHookUrl: webhookUrl(),
        validity: INVOICE_VALIDITY_S,
      }),
    });
    if (!r.ok || !r.json?.pageUrl) {
      console.error("salonCreateBookingInvoice: monobank error", r.status, r.json);
      await paymentRef.update({ status: "error", error: String(r.json?.errText || r.status).slice(0, 200) });
      res.status(502).json({ error: "monobank_error" });
      return;
    }
    await paymentRef.update({ status: "created", invoiceId: r.json.invoiceId, pageUrl: r.json.pageUrl });
    res.json({ pageUrl: r.json.pageUrl, invoiceId: r.json.invoiceId, paymentId, amount: pick.amount, mode: pick.mode });
  } catch (e) {
    console.error("salonCreateBookingInvoice error:", e);
    res.status(500).json({ error: "server" });
  }
});

// ─── Вебхук Monobank ────────────────────────────────────────────────────
async function onPaymentSuccess(salonId, paymentId, rec) {
  // Ідемпотентність: застосовуємо оплату рівно один раз, навіть якщо Monobank повторив вебхук
  const claim = await sRef(salonId, `payments/${paymentId}/applied`).transaction((cur) => (cur === null ? Date.now() : undefined));
  if (!claim.committed) return;
  const amount = rec.amountKop / 100;
  const bRef = sRef(salonId, `bookings/${rec.bookingId}`);
  const b0 = (await bRef.get()).val();
  const pay = await getPaySettings(salonId);
  const now = Date.now();

  let after = null;
  if (b0 && !isCancelled(b0)) {
    const tx = await bRef.transaction((b) => {
      if (!b) return b;
      if (isCancelled(b)) return undefined;
      const paid = round2((Number(b.paidAmount) || 0) + amount);
      b.paidAmount = paid;
      b.paymentStatus = paid + 0.001 >= Number(b.price) ? "paid" : "deposit_paid";
      b.paymentInvoiceId = rec.invoiceId;
      b.paidAt = now;
      if (pay.autoConfirm === true && b.status === "pending") b.status = "confirmed";
      return b;
    });
    after = tx.committed ? tx.snapshot.val() : null;
  }

  if (!after) {
    // Оплата прийшла за скасований/видалений запис (напр. знявся за таймаутом) — повертаємо кошти автоматично
    const token = await getToken(salonId);
    const refunded = token ? await refundInvoice(token, rec.invoiceId, rec.amountKop, paymentId) : false;
    await sRef(salonId, `payments/${paymentId}`).update({ status: "success", orphan: true, refundedAuto: refunded, needsRefund: !refunded });
    await pushOwner(salonId, refunded ? "↩️ Оплату за скасований запис повернено" : "⚠️ Оплата за скасований запис — потрібне повернення",
      `${amount} ₴ · ${b0?.clientName || "клієнт"} · ${b0?.date || ""} ${b0?.time || ""}`.trim(), { url: adminUrl() }).catch(() => {});
    return;
  }

  const first = !(Number(b0.paidAmount) > 0);
  const label = `${amount} ₴ · ${after.date} о ${after.time}`;
  await pushClient(salonId, after.clientUid, "💳 Оплату отримано", label, { url: clientBookingsLink() }).catch(() => {});
  await saveNotification(salonId, after.clientUid, "💳 Оплату отримано", label, "payment");
  const link = buildAdminLink({ date: after.date, time: after.time, masterId: after.masterId, bookingId: rec.bookingId });
  if (first && after.paymentMethod === "online" && b0.status === "pending") {
    // персонал не сповіщався при створенні онлайн-запису — повідомляємо тепер, уже оплаченим
    const mName = await masterName(salonId, after.masterId);
    await pushStaff(salonId, after.masterId, "📋 Новий запис (оплачено)",
      `${buildBookingBody(after, { masterName: mName, withMaster: true })}\n💳 ${after.paymentStatus === "paid" ? "Оплачено" : "Передоплата"} ${amount} ₴`,
      { url: link }, { masterBody: `${buildBookingBody(after)}\n💳 ${after.paymentStatus === "paid" ? "Оплачено" : "Передоплата"} ${amount} ₴` });
  } else {
    await pushStaff(salonId, after.masterId, "💳 Оплата отримана", `${after.clientName || "Клієнт"} · ${label}`, { url: link });
  }
}

async function onPaymentReversed(salonId, paymentId, rec) {
  if (!rec.applied) return; // кошти не зараховувались — нічого відкочувати
  const claim = await sRef(salonId, `payments/${paymentId}/reversedAt`).transaction((cur) => (cur === null ? Date.now() : undefined));
  if (!claim.committed || rec.orphan) return;
  const amount = rec.amountKop / 100;
  const tx = await sRef(salonId, `bookings/${rec.bookingId}`).transaction((b) => {
    if (!b) return b;
    const paid = Math.max(0, round2((Number(b.paidAmount) || 0) - amount));
    b.paidAmount = paid;
    b.paymentStatus = paid <= 0 ? "refunded" : paid + 0.001 >= Number(b.price) ? "paid" : "deposit_paid";
    return b;
  });
  const b = tx.committed ? tx.snapshot.val() : null;
  if (!b) return;
  const label = `${amount} ₴ · ${b.date} о ${b.time}`;
  await pushClient(salonId, b.clientUid, "↩️ Платіж повернено", label, { url: clientBookingsLink() }).catch(() => {});
  await saveNotification(salonId, b.clientUid, "↩️ Платіж повернено", label, "payment");
  await pushStaff(salonId, b.masterId, "↩️ Платіж повернено", `${b.clientName || "Клієнт"} · ${label}`,
    { url: buildAdminLink({ date: b.date, time: b.time, masterId: b.masterId, bookingId: rec.bookingId }) }).catch(() => {});
}

async function applyPaymentEvent(salonId, paymentId, payload) {
  const recRef = sRef(salonId, `payments/${paymentId}`);
  const rec = (await recRef.get()).val();
  // Джерело істини — наш журнал: чужий/невідомий рахунок і розбіжність суми ігноруємо
  if (!rec || !rec.invoiceId || rec.invoiceId !== payload.invoiceId) { console.warn(`salonMonobankCallback: unknown invoice ${payload.invoiceId} (payment=${paymentId})`); return; }
  if (payload.amount != null && Number(payload.amount) !== rec.amountKop) { console.error(`salonMonobankCallback: amount mismatch payment=${paymentId} got=${payload.amount} want=${rec.amountKop}`); return; }
  // Вебхуки можуть приходити не за порядком: старіший за вже оброблений ігноруємо
  const mod = payload.modifiedDate ? Date.parse(payload.modifiedDate) : null;
  if (mod && rec.modifiedAt && mod < rec.modifiedAt) return;

  const status = String(payload.status || "");
  const stamp = mod ? { modifiedAt: mod } : {};
  if (status === "success") {
    await recRef.update({ status: "success", ...stamp });
    await onPaymentSuccess(salonId, paymentId, { ...rec, status: "success" });
  } else if (status === "reversed") {
    await recRef.update({ status: "reversed", ...stamp });
    await onPaymentReversed(salonId, paymentId, rec);
  } else if (["failure", "expired"].includes(status)) {
    if (!isTerminalOk(rec.status)) await recRef.update({ status, failureReason: String(payload.failureReason || "").slice(0, 200), ...stamp });
  } else if (["created", "processing", "hold"].includes(status)) {
    if (!isTerminalOk(rec.status)) await recRef.update({ status, ...stamp });
  }
}

// Підпис — ECDSA над сирим тілом, публічним ключем мерчанта САМЕ цього салону (salonId беремо з reference,
// а довіряємо лише після перевірки підпису). Невідомі/биті запити відповідаємо 200, щоб Monobank не повторював їх вічно.
const salonMonobankCallback = onRequest({ region: REGION }, async (req, res) => {
  try {
    const signature = req.get("X-Sign");
    const raw = req.rawBody;
    if (!signature || !raw) { res.status(400).send("bad request"); return; }
    const payload = req.body || {};
    const m = /^([^.]+)\.([^.]+)$/.exec(String(payload.reference || payload.merchantPaymInfo?.reference || ""));
    if (!m || !isSafeKey(m[1]) || !isSafeKey(m[2])) { res.status(200).send("ok"); return; }
    const [, salonId, paymentId] = m;
    const token = await getToken(salonId);
    if (!token) { res.status(200).send("ok"); return; }
    if (!(await verifySignature(token, raw, signature))) {
      console.error(`salonMonobankCallback: invalid signature salon=${salonId}`);
      res.status(400).send("invalid signature");
      return;
    }
    console.log(`salonMonobankCallback: salon=${salonId} payment=${paymentId} invoice=${payload.invoiceId} status=${payload.status}`);
    await applyPaymentEvent(salonId, paymentId, payload);
    res.status(200).send("ok");
  } catch (e) {
    console.error("salonMonobankCallback error:", e);
    res.status(500).send("error");
  }
});

// ─── Повернення коштів ──────────────────────────────────────────────────
// Політика як у більшості систем запису: салон задає cancelFreeHours — безкоштовна відміна не пізніше ніж за N год до початку.
// Клієнт скасував вчасно → автоповернення; пізніше → передоплата лишається салону. Скасував власник/майстер → завжди повне повернення.
// Повернення йде через Monobank /invoice/cancel; сам платіж позначає вебхук `reversed` (onPaymentReversed).
const DEFAULT_CANCEL_FREE_HOURS = 24;
const isRefundable = (p) => !!p && p.status === "success" && !p.reversedAt && !p.orphan && !p.refundRequestedAt;

async function refundBookingPayments(salonId, bookingId, reason) {
  const token = await getToken(salonId);
  const recs = Object.entries((await sRef(salonId, "payments").orderByChild("bookingId").equalTo(bookingId).get()).val() || {}).filter(([, p]) => isRefundable(p));
  let ok = 0, failed = 0;
  for (const [id, p] of recs) {
    // Рівно один запит на платіж: прапорець займається транзакцією (повторний виклик/подія його пропустить)
    const claim = await sRef(salonId, `payments/${id}/refundRequestedAt`).transaction((cur) => (cur === null ? Date.now() : undefined));
    if (!claim.committed) continue;
    const done = token ? await refundInvoice(token, p.invoiceId, p.amountKop, id) : false;
    if (done) { ok++; await sRef(salonId, `payments/${id}`).update({ refundReason: reason }); }
    else { failed++; await sRef(salonId, `payments/${id}`).update({ refundRequestedAt: null, needsRefund: true }); }
  }
  return { total: recs.length, ok, failed };
}

// Скасування сплаченого запису → рішення за політикою. Повертає {kept} або результат повернення (null — нічого сплаченого)
async function settleRefundOnCancel(salonId, bookingId, booking, by) {
  if (by === "reschedule" || !(Number(booking.paidAmount) > 0)) return null;
  if (by === "client") {
    const pay = await getPaySettings(salonId);
    const hours = Number.isFinite(Number(pay.cancelFreeHours)) && pay.cancelFreeHours !== undefined ? Number(pay.cancelFreeHours) : DEFAULT_CANCEL_FREE_HOURS;
    const startMs = booking.date && booking.time ? localToMs(booking.date, booking.time, await salonTimezone(salonId)) : Infinity;
    if (startMs - Date.now() < hours * 3600000) return { kept: true, hours };
  }
  return refundBookingPayments(salonId, bookingId, by === "client" ? "client_cancel_in_time" : `${by}_cancel`);
}

// Клієнт переносить запис: нова бронь з rescheduledFromId забирає передоплату старої (платежі переписуються на нову бронь)
async function moveReschedulePayment(salonId, oldId, newId, clientUid) {
  if (!isSafeKey(oldId) || oldId === newId) return false;
  let moved = null;
  const tx = await sRef(salonId, `bookings/${oldId}`).transaction((b) => {
    moved = null;
    if (!b) return b;
    if (b.clientUid !== clientUid || !(Number(b.paidAmount) > 0) || b.paymentMovedTo) return undefined;
    moved = { paidAmount: Number(b.paidAmount), paymentInvoiceId: b.paymentInvoiceId || null, paidAt: b.paidAt || null };
    b.paymentMovedTo = newId; b.paidAmount = 0; b.paymentStatus = null;
    return b;
  });
  if (!tx.committed || !moved) return false;
  await sRef(salonId, `bookings/${newId}`).transaction((b) => {
    if (!b) return b;
    b.paidAmount = moved.paidAmount;
    b.paymentStatus = moved.paidAmount + 0.001 >= Number(b.price) ? "paid" : "deposit_paid";
    b.paymentInvoiceId = moved.paymentInvoiceId; b.paidAt = moved.paidAt; b.paymentMovedFrom = oldId;
    return b;
  });
  const recs = (await sRef(salonId, "payments").orderByChild("bookingId").equalTo(oldId).get()).val() || {};
  for (const id of Object.keys(recs)) await sRef(salonId, `payments/${id}/bookingId`).set(newId);
  return true;
}

// Ручне повернення власником (виняток із політики): усі платежі запису, що ще не повернуті
const salonRefundBooking = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const user = await authUser(req, res);
    if (!user) return;
    const salonId = user.uid; // лише власник салону
    const { bookingId } = bodyOf(req);
    if (!isSafeKey(bookingId)) { res.status(400).json({ error: "bad_request" }); return; }
    const booking = (await sRef(salonId, `bookings/${bookingId}`).get()).val();
    if (!booking) { res.status(404).json({ error: "booking_not_found" }); return; }
    const r = await refundBookingPayments(salonId, bookingId, "owner_manual");
    if (!r.total) { res.status(409).json({ error: "nothing_to_refund" }); return; }
    if (r.failed) { res.status(502).json({ error: "refund_failed", ...r }); return; }
    res.json({ ok: true, refunded: r.ok });
  } catch (e) {
    console.error("salonRefundBooking error:", e);
    res.status(500).json({ error: "server" });
  }
});

// ─── Таймаут неоплачених онлайн-записів ─────────────────────────────────
// pending-запис з paymentMethod "online", який не оплачено за holdMinutes, знімається (слот звільняє salonOnBookingChanged).
// Якщо клієнт саме зараз платить (відкритий рахунок до 15 хв) — даємо дозаплатити.
async function expireUnpaidForSalon(salonId, now) {
  if (isLicenseReadonly((await sRef(salonId, "license").get()).val())) return 0;
  const pay = await getPaySettings(salonId);
  const holdMs = clamp(Number(pay.holdMinutes) || DEFAULT_HOLD_MIN, 5, 120) * 60000;
  const snap = await sRef(salonId, "bookings").orderByChild("date").startAt(localDate(now - 24 * 3600000)).get();
  if (!snap.exists()) return 0;
  const stale = [];
  snap.forEach((c) => {
    const b = c.val();
    if (!b || b.paymentMethod !== "online" || b.status !== "pending" || isCancelled(b)) return;
    if (b.paymentStatus === "paid" || b.paymentStatus === "deposit_paid" || Number(b.paidAmount) > 0) return;
    if (now - (b.createdAt || now) <= holdMs) return;
    stale.push(c.key);
  });
  let n = 0;
  for (const bookingId of stale) {
    const open = Object.values((await sRef(salonId, "payments").orderByChild("bookingId").equalTo(bookingId).get()).val() || {})
      .some((p) => ["created", "processing", "hold"].includes(p.status) && now - p.createdAt < OPEN_INVOICE_GRACE_MS);
    if (open) continue;
    await sRef(salonId, `bookings/${bookingId}`).transaction((b) => {
      if (!b) return b;
      if (b.status !== "pending" || isCancelled(b) || Number(b.paidAmount) > 0) return undefined;
      b.status = "cancelled"; b.cancelledBy = "payment_timeout"; b.cancelledAt = now;
      return b;
    });
    n++;
  }
  return n;
}

const salonExpireUnpaidBookings = onSchedule({ schedule: "every 5 minutes", region: REGION }, async () => {
  const now = Date.now();
  for (const salonId of await allSalonIds()) {
    await expireUnpaidForSalon(salonId, now).catch((e) => console.error(`salonExpireUnpaidBookings: salon=${salonId}`, e));
  }
});

module.exports = {
  salonSavePaymentSettings, salonCreateBookingInvoice, salonMonobankCallback, salonExpireUnpaidBookings, salonRefundBooking,
  expireUnpaidForSalon, pickAmount, applyPaymentEvent, refundBookingPayments, settleRefundOnCancel, moveReschedulePayment,
};
