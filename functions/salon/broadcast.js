// Сповіщення клієнтам від салону: «звільнився час» (автоматично) і ручна розсилка власника.
//
// Звільнився час: слот майстра став вільним (скасування) у найближчі 10 днів → черга slotFreedQueue; через 5 хв, якщо слот
//   досі вільний, push усім клієнтам із сповіщеннями (не частіше ніж раз на 30 хв одному клієнту, не вночі). Вимикається
//   власником: profile/slotFreedPush = false. Слоти, відкриті власником (adminBlocked → вільний), обслуговує черга очікування (queue.js).
// Розсилка: POST salonSendBroadcast {title, body} (власник) — усім клієнтам із сповіщеннями, до 5 розсилок на добу; {ім'я} у тексті
//   підставляється для кожного клієнта. Журнал — pushLog; клієнтам кладеться сповіщення (notifications) типу "broadcast".
const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const {
  REGION, sRef, allSalonIds, isLicenseReadonly, salonTimezone, localDate, localToMs, isQuietHour, clientUrl,
  masterName, pushClient, saveNotification, fmtDM,
} = require("./lib");
const { authUser, bodyOf } = require("./http");

const MIN = 60000, DAY = 86400000;
const DELAY_MS = 5 * MIN;
const RATE_LIMIT_MS = 30 * MIN;
const WINDOW_DAYS = 10;
const MAX_BROADCASTS_PER_DAY = 5;
const CONCURRENCY = 10;

const normName = (n) => String(n || "").trim() || "Клієнте";
const render = (text, vars) => String(text).replace(/\{([^}]+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
async function inChunks(items, fn) {
  for (let i = 0; i < items.length; i += CONCURRENCY) await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
}

// Клієнти салону з сповіщеннями: uid, чий хоч один пристрій має токен (дзеркало users/{uid}/fcmTokens → clientTokens)
async function pushableClients(salonId) {
  const tokens = (await sRef(salonId, "clientTokens").get()).val() || {};
  const users = (await sRef(salonId, "users").get()).val() || {};
  return Object.keys(tokens).filter((uid) => Object.values(tokens[uid] || {}).some(Boolean) && users[uid] && !users[uid].blocked)
    .map((uid) => ({ uid, name: users[uid].profile?.name || "" }));
}

// ─── Звільнився час ─────────────────────────────────────────────────────
const salonOnSlotFreed = onValueWritten({ ref: "salons/{salonId}/timeslots/{masterId}/{date}/{slotId}", region: REGION }, async (event) => {
  const before = event.data.before?.val();
  const after = event.data.after?.val();
  // Лише справжнє звільнення зайнятого слоту: був зайнятий (не phantom, не заблокований власником) → став вільним
  if (!before || before.available !== false || before.adminBlocked || before.phantom || before.bookingStart === false) return;
  if (!after || after.available !== true || !after.time) return;
  const { salonId, masterId, date } = event.params;
  if ((await sRef(salonId, "profile/slotFreedPush").get()).val() === false) return;
  const tz = await salonTimezone(salonId);
  const now = Date.now();
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${localDate(now, tz)}T00:00:00Z`)) / DAY);
  if (!Number.isFinite(days) || days < 0 || days > WINDOW_DAYS) return;
  if (localToMs(date, after.time, tz) < now + 30 * MIN) return; // майже початок/вже минув — немає сенсу
  await sRef(salonId, `slotFreedQueue/${masterId}_${date}_${after.time.replace(":", "")}`).set({ masterId, date, time: after.time, sendAfter: now + DELAY_MS });
});

async function flushSlotFreedForSalon(salonId, now) {
  const queue = (await sRef(salonId, "slotFreedQueue").get()).val();
  if (!queue) return 0;
  const due = Object.entries(queue).filter(([, v]) => v && v.sendAfter <= now);
  if (!due.length) return 0;
  if (isLicenseReadonly((await sRef(salonId, "license").get()).val())) return 0;
  const tz = await salonTimezone(salonId);
  if (isQuietHour(now, tz)) return 0; // вночі лишаємо в черзі — піде вранці, якщо слот ще вільний
  const clients = await pushableClients(salonId);
  const slug = (await sRef(salonId, "profile/slug").get()).val();
  const last = (await sRef(salonId, "lastSlotNotif").get()).val() || {};
  let sentTotal = 0;
  for (const [key, { masterId, date, time }] of due) {
    await sRef(salonId, `slotFreedQueue/${key}`).remove().catch(() => {});
    if (localToMs(date, time, tz) < now + 15 * MIN) continue;
    const slot = (await sRef(salonId, `timeslots/${masterId}/${date}/slot${time.replace(":", "")}`).get()).val();
    if (!slot || slot.available !== true) continue; // за 5 хв слот хтось забрав
    const mName = await masterName(salonId, masterId);
    const body = `${mName ? mName + " · " : ""}${fmtDM(date)} о ${time} — є вільне місце`;
    const url = `${clientUrl()}/s/${slug || ""}`;
    const targets = clients.filter((c) => !(last[c.uid] && now - last[c.uid] < RATE_LIMIT_MS));
    await inChunks(targets, async (c) => {
      const sent = await pushClient(salonId, c.uid, "✨ Звільнився час", body, { url, date, time, masterId }).catch(() => false);
      if (!sent) return; // немає живого токена — не витрачаємо ліміт
      last[c.uid] = now; sentTotal++;
      await saveNotification(salonId, c.uid, "✨ Звільнився час", body, "slot_freed").catch(() => {});
      await sRef(salonId, `lastSlotNotif/${c.uid}`).set(now).catch(() => {});
    });
  }
  return sentTotal;
}

const salonFlushSlotFreedQueue = onSchedule({ schedule: "every 1 minutes", region: REGION }, async () => {
  const now = Date.now();
  for (const salonId of await allSalonIds()) {
    await flushSlotFreedForSalon(salonId, now).catch((e) => console.error(`salonFlushSlotFreedQueue: salon=${salonId}`, e));
  }
});

// ─── Ручна розсилка ─────────────────────────────────────────────────────
const salonSendBroadcast = onRequest({ region: REGION, cors: true, timeoutSeconds: 300 }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const user = await authUser(req, res);
    if (!user) return;
    const salonId = user.uid;
    if (!(await sRef(salonId, "profile").get()).exists()) { res.status(404).json({ error: "salon_not_found" }); return; }
    const b = bodyOf(req);
    const title = String(b.title || "").trim().slice(0, 60);
    const body = String(b.body || "").trim().slice(0, 300);
    if (!title || !body) { res.status(400).json({ error: "empty_message" }); return; }
    if (isLicenseReadonly((await sRef(salonId, "license").get()).val())) { res.status(409).json({ error: "salon_unavailable" }); return; }
    const now = Date.now();
    const log = (await sRef(salonId, "pushLog").get()).val() || {};
    if (Object.values(log).filter((l) => l && now - l.sentAt < DAY).length >= MAX_BROADCASTS_PER_DAY) { res.status(429).json({ error: "too_many_broadcasts" }); return; }

    const logRef = sRef(salonId, "pushLog").push();
    await logRef.set({ title, body, sentAt: now, status: "sending" });
    const clients = await pushableClients(salonId);
    const url = `${clientUrl()}/s/${(await sRef(salonId, "profile/slug").get()).val() || ""}`;
    let sent = 0;
    await inChunks(clients, async (c) => {
      const vars = { "ім'я": normName(c.name) };
      const t = render(title, vars), bd = render(body, vars);
      const ok = await pushClient(salonId, c.uid, t, bd, { url }).catch(() => false);
      if (ok) sent++;
      await saveNotification(salonId, c.uid, t, bd, "broadcast").catch(() => {});
    });
    await logRef.update({ status: "sent", recipients: clients.length, sent });
    res.json({ ok: true, recipients: clients.length, sent, id: logRef.key });
  } catch (e) {
    console.error("salonSendBroadcast error:", e);
    res.status(500).json({ error: "server" });
  }
});

module.exports = { salonOnSlotFreed, salonFlushSlotFreedQueue, salonSendBroadcast, flushSlotFreedForSalon };
