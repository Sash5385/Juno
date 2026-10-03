// Загальні функції Juno: форма зв'язку лендингу, моніторинг помилок застосунків.
// Не залежать від схеми салону (дані — system/*, читає лише суперадмін VENDOR_EMAIL).
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { admin, db: getDb, REGION, VENDOR_EMAIL, pushOwner } = require("./salon/lib");

const db = { ref: (p) => getDb().ref(p) };

// ─── Форма зв'язку лендингу (landing/ → /api/contact) ──────────────
// Публічний POST без авторизації: honeypot-поле "website", валідація довжин,
// обмеження частоти за хешем IP (30 с між запитами, до 5 за годину). Повідомлення
// зберігаються в system/contactMessages (читає лише суперадмін, вкладка "Звернення").
exports.submitContact = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
  try {
    const b = req.body || {};
    if (b.website) { res.status(200).json({ ok: true }); return; } // бот заповнив приховане поле
    const name = String(b.name || "").trim().slice(0, 80);
    const email = String(b.email || "").trim().slice(0, 120);
    const phone = String(b.phone || "").trim().slice(0, 30);
    const message = String(b.message || "").trim().slice(0, 2000);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) {
      res.status(400).json({ ok: false, error: "invalid" }); return;
    }
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
    const now = Date.now();
    const rate = await db.ref(`system/contactRate/${ipHash}`).transaction(cur => {
      const c = cur || { w: now, n: 0, t: 0 };
      if (now - c.w > 3600000) { c.w = now; c.n = 0; }
      if (now - c.t < 30000 || c.n >= 5) return; // перевищено ліміт — скасовуємо транзакцію
      c.n += 1; c.t = now;
      return c;
    });
    if (!rate.committed) { res.status(429).json({ ok: false, error: "rate" }); return; }
    await db.ref("system/contactMessages").push({ name, email, phone, message, at: now, ip: ipHash, status: "new" });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("submitContact error:", e);
    res.status(500).json({ ok: false });
  }
});

// ─── Моніторинг помилок (адмінка і клієнтський застосунок → /api/report-error) ──────
// Публічний POST без авторизації (помилка може статись до входу). Захист: ліміт 20 запитів/хв
// за хешем IP, обрізання довжин, групування за відбитком (повтор лише збільшує лічильник).
// Дані — system/errorLog/{відбиток} (читає лише суперадмін, вкладка "Помилки"). Про НОВУ
// помилку власнику йде push (не частіше ніж раз на 10 хв), а в Cloud Logging — console.error.
exports.reportError = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    const message = String(b.message || "").trim().slice(0, 300);
    if (!message) { res.status(400).json({ ok: false }); return; }
    const app = b.app === "client" ? "client" : "admin";
    const stack = String(b.stack || "").slice(0, 1500);
    const url = String(b.url || "").replace(/[?#].*$/, "").slice(0, 160);
    const version = String(b.version || "").slice(0, 20);
    const ua = String(b.ua || req.get("user-agent") || "").slice(0, 160);
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
    const now = Date.now();
    const rate = await db.ref(`system/errorRate/${ipHash}`).transaction(cur => {
      const c = cur || { w: now, n: 0 };
      if (now - c.w > 60000) { c.w = now; c.n = 0; }
      if (c.n >= 20) return; // перевищено ліміт — скасовуємо транзакцію
      c.n += 1;
      return c;
    });
    if (!rate.committed) { res.status(429).json({ ok: false }); return; }
    const fp = crypto.createHash("sha1").update(`${app}|${message}|${stack.split("\n").slice(0, 2).join("|")}`).digest("hex").slice(0, 16);
    let isNew = false;
    await db.ref(`system/errorLog/${fp}`).transaction(cur => {
      isNew = !cur;
      return cur
        ? { ...cur, count: (cur.count || 1) + 1, last: now, version, url, ua }
        : { app, message, stack, url, version, ua, count: 1, first: now, last: now };
    });
    res.status(200).json({ ok: true });
    if (!isNew) return;
    console.error(`clientError [${app} ${version}] ${message}\n${stack}`);
    const push = await db.ref("system/errorLogMeta/lastPush").transaction(cur => (cur && now - cur < 600000 ? undefined : now));
    if (!push.committed) return;
    const owner = await admin.auth().getUserByEmail(VENDOR_EMAIL).catch(() => null);
    if (owner) await pushOwner(owner.uid, `🐞 Нова помилка (${app === "client" ? "клієнт" : "адмінка"} ${version})`, message.slice(0, 120), {}).catch(() => {});
  } catch (e) {
    console.error("reportError error:", e);
    if (!res.headersSent) res.status(500).json({ ok: false });
  }
});

// Щодня прибирає журнал помилок старше 14 діб і лічильники частоти
exports.cleanupErrorLog = onSchedule({ schedule: "every 24 hours", region: REGION }, async () => {
  const now = Date.now();
  const log = (await db.ref("system/errorLog").get()).val() || {};
  const upd = {};
  for (const [k, v] of Object.entries(log)) if (!v || (v.last || 0) < now - 14 * 86400000) upd[`system/errorLog/${k}`] = null;
  const rate = (await db.ref("system/errorRate").get()).val() || {};
  for (const [k, v] of Object.entries(rate)) if (!v || (v.w || 0) < now - 3600000) upd[`system/errorRate/${k}`] = null;
  if (Object.keys(upd).length) await db.ref().update(upd);
});
