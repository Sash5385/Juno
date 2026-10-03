// Підписка салону на платформу Juno (SaaS): тариф за кількістю активних майстрів, оплата через Monobank платформи.
// Це ОКРЕМО від оплат клієнтів салону (payments.js): там гроші йдуть салону з його токеном, тут — платформі з її токеном
// (secret JUNO_MONOBANK_TOKEN). Тарифи: tariffs.js (system/tariffs перекриває типові). Журнал: salon_billing/{salonId}/{paymentId}.
//
//   POST salonSubscriptionInfo           {tier?, months?}            → тарифи, ліцензія, майстри, розрахунок (власник)
//   POST salonCreateSubscriptionInvoice  {tier, months, dryRun?}     → pageUrl Monobank (reference "sub.{salonId}.{paymentId}")
//   POST salonSubscriptionCallback       вебхук Monobank (ECDSA X-Sign) → license: active, expiresAt, masterLimit, tier
//   onValueWritten masters/*/profile     → майстри понад ліміт тарифу автоматично ховаються (active:false)
const { onRequest } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");
const { REGION, db, sRef, adminUrl, pushOwner, saveNotification } = require("./lib");
const { authUser, bodyOf } = require("./http");
const { mono, verifySignature } = require("./payments");
const T = require("./tariffs");

const platformToken = defineSecret("JUNO_MONOBANK_TOKEN");
const project = () => process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
const webhookUrl = () => process.env.SALON_SUBSCRIPTION_WEBHOOK_URL || `https://${REGION}-${project()}.cloudfunctions.net/salonSubscriptionCallback`;
const billingRef = (salonId, path) => db().ref(path ? `salon_billing/${salonId}/${path}` : `salon_billing/${salonId}`);
const REUSE_INVOICE_MS = 50 * 60 * 1000;
const isTerminalOk = (s) => s === "success" || s === "reversed";
const LICENSE_KEYS = ["status", "provider", "expiresAt", "lastPaymentAt", "tier", "masterLimit", "monthKop", "lastPaymentId"];

const getTariffs = async () => T.normalizeTariffs((await db().ref("system/tariffs").get()).val());
const getLicense = async (salonId) => (await sRef(salonId, "license").get()).val();
const activeMasterIds = (masters) => Object.entries(masters || {}).filter(([, m]) => m && m.profile && m.profile.active !== false).map(([id, m]) => ({ id, at: Number(m.profile.activatedAt || m.profile.createdAt) || 0 }));
const countActiveMasters = async (salonId) => activeMasterIds((await sRef(salonId, "masters").get()).val()).length;
const fmtDate = (ts) => new Date(ts).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric" });
const kopStr = (kop) => `${(kop / 100).toFixed(2).replace(/\.00$/, "")} ₴`;

const publicTariffs = (t) => ({ currency: t.currency, yearMonths: t.yearMonths, trialMasterLimit: t.trialMasterLimit, tiers: t.tiers });
const publicQuote = (q) => (q.error ? q : { tier: q.tier.key, months: q.months, mode: q.mode, baseKop: q.baseKop, creditKop: q.creditKop, amountKop: q.amountKop });
const publicLicense = (l) => (l ? { status: l.status, expiresAt: l.expiresAt || null, trialEndsAt: l.trialEndsAt || null, tier: l.tier || null, masterLimit: l.masterLimit || null } : null);

// Власник салону = користувач з profile у salons/{uid}; повертає {salonId, lic, tariffs, active} або надсилає помилку
async function ownerContext(req, res) {
  const user = await authUser(req, res);
  if (!user) return null;
  const salonId = user.uid;
  if (!(await sRef(salonId, "profile").get()).exists()) { res.status(404).json({ error: "salon_not_found" }); return null; }
  const [lic, tariffs, active] = await Promise.all([getLicense(salonId), getTariffs(), countActiveMasters(salonId)]);
  return { salonId, lic, tariffs, active };
}

const salonSubscriptionInfo = onRequest({ region: REGION, cors: true, secrets: [platformToken] }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const c = await ownerContext(req, res);
    if (!c) return;
    const { tier, months } = bodyOf(req);
    const out = {
      tariffs: publicTariffs(c.tariffs), license: publicLicense(c.lic), activeMasters: c.active,
      masterLimit: T.masterLimitOf(c.lic, c.tariffs), payable: !!platformToken.value(),
    };
    if (tier) out.quote = publicQuote(T.quote(c.tariffs, c.lic, { tierKey: tier, months: Number(months) }, c.active));
    res.json(out);
  } catch (e) {
    console.error("salonSubscriptionInfo error:", e);
    res.status(500).json({ error: "server" });
  }
});

const salonCreateSubscriptionInvoice = onRequest({ region: REGION, cors: true, secrets: [platformToken] }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const c = await ownerContext(req, res);
    if (!c) return;
    const { tier, months, dryRun } = bodyOf(req);
    const q = T.quote(c.tariffs, c.lic, { tierKey: tier, months: Number(months) }, c.active);
    if (q.error) { res.status(q.error === "too_many_masters" ? 409 : 400).json(q); return; }
    if (dryRun) { res.json({ quote: publicQuote(q) }); return; }
    const token = platformToken.value();
    if (!token) { res.status(503).json({ error: "billing_unavailable" }); return; }
    if (c.lic && c.lic.status === "suspended" && !c.lic.expiresAt && !c.lic.trialEndsAt) { res.status(409).json({ error: "salon_blocked" }); return; }

    const now = Date.now();
    const prev = (await billingRef(c.salonId).get()).val() || {};
    const reuse = Object.entries(prev).find(([, p]) => p.status === "created" && p.pageUrl && p.tierKey === q.tier.key && p.months === q.months
      && p.mode === q.mode && p.amountKop === q.amountKop && now - p.createdAt < REUSE_INVOICE_MS);
    if (reuse) { res.json({ pageUrl: reuse[1].pageUrl, invoiceId: reuse[1].invoiceId, paymentId: reuse[0], quote: publicQuote(q), reused: true }); return; }
    if (Object.values(prev).filter((p) => now - p.createdAt < 3600000).length >= 10) { res.status(429).json({ error: "too_many_attempts" }); return; }

    const ref = billingRef(c.salonId).push();
    const paymentId = ref.key;
    await ref.set({
      tierKey: q.tier.key, maxMasters: q.tier.maxMasters, monthKop: q.tier.monthKop, months: q.months, mode: q.mode,
      baseKop: q.baseKop, creditKop: q.creditKop, amountKop: q.amountKop, status: "creating", createdAt: now,
    });
    const r = await mono(token, "/invoice/create", {
      method: "POST",
      body: JSON.stringify({
        amount: q.amountKop, ccy: 980,
        merchantPaymInfo: { reference: `sub.${c.salonId}.${paymentId}`, destination: `Juno — підписка «${q.tier.name}», ${q.months === 12 ? "12 міс." : "1 міс."}`.slice(0, 140) },
        redirectUrl: `${adminUrl()}/?subscription=paid`, webHookUrl: webhookUrl(), validity: 3600,
      }),
    });
    if (!r.ok || !r.json?.pageUrl) {
      console.error("salonCreateSubscriptionInvoice: monobank error", r.status, r.json);
      await ref.update({ status: "error", error: String(r.json?.errText || r.status).slice(0, 200) });
      res.status(502).json({ error: "monobank_error" });
      return;
    }
    await ref.update({ status: "created", invoiceId: r.json.invoiceId, pageUrl: r.json.pageUrl });
    res.json({ pageUrl: r.json.pageUrl, invoiceId: r.json.invoiceId, paymentId, quote: publicQuote(q) });
  } catch (e) {
    console.error("salonCreateSubscriptionInvoice error:", e);
    res.status(500).json({ error: "server" });
  }
});

// ─── Вебхук ─────────────────────────────────────────────────────────────
async function onSubscriptionPaid(salonId, paymentId, rec) {
  // Рівно одне зарахування, навіть якщо Monobank повторив вебхук
  const claim = await billingRef(salonId, `${paymentId}/applied`).transaction((cur) => (cur === null ? Date.now() : undefined));
  if (!claim.committed) return;
  if (!(await sRef(salonId, "profile").get()).exists()) {
    await billingRef(salonId, paymentId).update({ orphan: true, needsRefund: true });
    return;
  }
  const lic = (await getLicense(salonId)) || {};
  const now = Date.now();
  const next = T.applyPayment(lic, { ...rec, paymentId }, now);
  const prev = Object.fromEntries(LICENSE_KEYS.map((k) => [k, lic[k] ?? null]));
  const upd = {};
  for (const [k, v] of Object.entries(next)) upd[`license/${k}`] = v;
  await sRef(salonId).update(upd);
  await billingRef(salonId, paymentId).update({ prevLicense: prev, appliedExpiresAt: next.expiresAt });
  const tierName = (await getTariffs()).tiers.find((t) => t.key === rec.tierKey)?.name || rec.tierKey;
  const body = `Тариф «${tierName}» до ${fmtDate(next.expiresAt)} · ${kopStr(rec.amountKop)}`;
  await pushOwner(salonId, "✅ Підписку оплачено", body, { url: adminUrl() }).catch(() => {});
  await saveNotification(salonId, salonId, "✅ Підписку оплачено", body, "payment");
}

async function onSubscriptionReversed(salonId, paymentId, rec) {
  if (!rec.applied || rec.orphan) return;
  const claim = await billingRef(salonId, `${paymentId}/reversedAt`).transaction((cur) => (cur === null ? Date.now() : undefined));
  if (!claim.committed) return;
  const lic = await getLicense(salonId);
  if (!lic || lic.lastPaymentId !== paymentId) {
    // після цієї оплати були інші — автоматично не відкочуємо, лише позначаємо для ручного розгляду
    await billingRef(salonId, paymentId).update({ needsReview: true });
    return;
  }
  const upd = {};
  for (const k of LICENSE_KEYS) upd[`license/${k}`] = rec.prevLicense?.[k] ?? null;
  await sRef(salonId).update(upd);
  await pushOwner(salonId, "↩️ Платіж за підписку повернено", `${kopStr(rec.amountKop)} · підписку повернено до попереднього стану`, { url: adminUrl() }).catch(() => {});
}

async function applySubscriptionEvent(salonId, paymentId, payload) {
  const recRef = billingRef(salonId, paymentId);
  const rec = (await recRef.get()).val();
  if (!rec || !rec.invoiceId || rec.invoiceId !== payload.invoiceId) { console.warn(`salonSubscriptionCallback: unknown invoice ${payload.invoiceId}`); return; }
  if (payload.amount != null && Number(payload.amount) !== rec.amountKop) { console.error(`salonSubscriptionCallback: amount mismatch payment=${paymentId}`); return; }
  const mod = payload.modifiedDate ? Date.parse(payload.modifiedDate) : null;
  if (mod && rec.modifiedAt && mod < rec.modifiedAt) return;
  const status = String(payload.status || "");
  const stamp = mod ? { modifiedAt: mod } : {};
  if (status === "success") {
    await recRef.update({ status: "success", ...stamp });
    await onSubscriptionPaid(salonId, paymentId, rec);
  } else if (status === "reversed") {
    await recRef.update({ status: "reversed", ...stamp });
    await onSubscriptionReversed(salonId, paymentId, rec);
  } else if (["failure", "expired"].includes(status)) {
    if (!isTerminalOk(rec.status)) await recRef.update({ status, failureReason: String(payload.failureReason || "").slice(0, 200), ...stamp });
  } else if (["created", "processing", "hold"].includes(status)) {
    if (!isTerminalOk(rec.status)) await recRef.update({ status, ...stamp });
  }
}

const salonSubscriptionCallback = onRequest({ region: REGION, secrets: [platformToken] }, async (req, res) => {
  try {
    const signature = req.get("X-Sign");
    const raw = req.rawBody;
    const token = platformToken.value();
    if (!signature || !raw || !token) { res.status(400).send("bad request"); return; }
    if (!(await verifySignature(token, raw, signature))) { console.error("salonSubscriptionCallback: invalid signature"); res.status(400).send("invalid signature"); return; }
    const payload = req.body || {};
    const m = /^sub\.([^.]+)\.([^.]+)$/.exec(String(payload.reference || payload.merchantPaymInfo?.reference || ""));
    if (!m) { res.status(200).send("ok"); return; }
    console.log(`salonSubscriptionCallback: salon=${m[1]} payment=${m[2]} invoice=${payload.invoiceId} status=${payload.status}`);
    await applySubscriptionEvent(m[1], m[2], payload);
    res.status(200).send("ok");
  } catch (e) {
    console.error("salonSubscriptionCallback error:", e);
    res.status(500).send("error");
  }
});

// ─── Ліміт майстрів ─────────────────────────────────────────────────────
// Правила бази не вміють рахувати вузли, тому ліміт держить сервер: активних майстрів понад ліміт тарифу ховаємо (active:false).
// Лишаються найстарші за активацією (activatedAt/createdAt, далі id) — детермінізм потрібен, щоб два одночасні додавання не сховали обох.
const salonOnMasterWritten = onValueWritten({ ref: "salons/{salonId}/masters/{masterId}/profile", region: REGION }, async (event) => {
  const { salonId, masterId } = event.params;
  const after = event.data.after.val();
  if (!after || after.active === false) return;
  const lic = await getLicense(salonId);
  if (!lic) return;
  const limit = T.masterLimitOf(lic, await getTariffs());
  const list = activeMasterIds((await sRef(salonId, "masters").get()).val()).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  if (list.length <= limit || list.slice(0, limit).some((x) => x.id === masterId)) return;
  await sRef(salonId, `masters/${masterId}/profile/active`).set(false);
  await pushOwner(salonId, "⚠️ Ліміт майстрів за тарифом", `Ваш тариф — до ${limit} майстрів, тому «${after.name || "майстра"}» приховано. Оновіть тариф у Налаштуваннях → Підписка.`, { url: adminUrl() }).catch(() => {});
});

module.exports = { salonSubscriptionInfo, salonCreateSubscriptionInvoice, salonSubscriptionCallback, salonOnMasterWritten };
