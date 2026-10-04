// Видалення акаунтів і резервні копії.
//
// POST salonDeleteAccount (Bearer ID-токен):
//   {type:"client", salonId?}  — клієнт видаляє свої дані (в одному салоні або, без salonId, в усіх) і сам обліковий запис.
//       Майбутні записи скасовуються (слоти звільняються, повернення — за політикою салону, сповіщень клієнту немає),
//       чат, сповіщення, черга й токени видаляються, минулі записи знеособлюються (лишаються для виручки й статистики).
//   {type:"owner", salonId?}   — власник видаляє салон: JSON-архів у Storage (backups/deleted/…), потім дані салону, slug, токен Monobank,
//       журнал підписки, членства майстрів, файли Storage і обліковий запис. salonId (чужий) може вказати лише суперадмін.
// Нічна резервна копія (salonNightlyBackup): лише коли суперадмін увімкнув system/backupEnabled = true; 30 діб зберігання.
// Ручна (salonManualBackup): запис system/backupRequest — працює незалежно від тумблера.
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueWritten } = require("firebase-functions/v2/database");
const {
  admin, REGION, db, sRef, isSafeKey, VENDOR_EMAIL, localDate, salonTimezone, isCancelled, allSalonIds,
} = require("./lib");
const { authUser, bodyOf } = require("./http");

const bucket = () => admin.storage().bucket(process.env.SALON_BACKUP_BUCKET || undefined);
const BACKUP_KEEP_DAYS = 30;
// Що копіюємо: без чатів, слотів (відновлюються сіткою), сповіщень і push-токенів
const BACKUP_KEYS = ["profile", "license", "masters", "masterSettings", "services", "bookings", "users", "payments", "pushTemplates", "pushLog", "masterAuth"];

// ─── Дані клієнта ───────────────────────────────────────────────────────
async function deleteClientData(salonId, uid) {
  const now = Date.now();
  const today = localDate(now, await salonTimezone(salonId));
  const upd = {};
  const snap = await sRef(salonId, "bookings").orderByChild("clientUid").equalTo(uid).get();
  snap.forEach((c) => {
    const b = c.val();
    if (!b) return;
    const base = `bookings/${c.key}`;
    upd[`${base}/clientName`] = "Видалений клієнт"; upd[`${base}/phone`] = null; upd[`${base}/clientNote`] = null;
    if (b.date >= today && !isCancelled(b) && b.status !== "completed") {
      // clientUid лишається, поки відпрацює тригер скасування (deletedClient глушить сповіщення клієнту)
      upd[`${base}/status`] = "cancelled"; upd[`${base}/cancelledBy`] = "client"; upd[`${base}/cancelledAt`] = now; upd[`${base}/deletedClient`] = true;
    } else upd[`${base}/clientUid`] = null;
  });
  for (const n of ["users", "chats", "chatMeta", "notifications", "userQueue", "clientTokens", "lastSlotNotif"]) upd[`${n}/${uid}`] = null;
  const masters = Object.keys((await sRef(salonId, "masters").get()).val() || {});
  for (const m of masters) { upd[`masterChats/${m}/${uid}`] = null; upd[`masterChatMeta/${m}/${uid}`] = null; }
  // черга очікування: queue/{masterId}/{date_time}/entries/{uid}
  const queue = (await sRef(salonId, "queue").get()).val() || {};
  for (const [m, slots] of Object.entries(queue)) for (const [k, v] of Object.entries(slots || {})) if (v?.entries?.[uid]) upd[`queue/${m}/${k}/entries/${uid}`] = null;
  await sRef(salonId).update(upd);
}

async function deleteOwnerSalon(salonId, deletedBy) {
  const data = (await sRef(salonId).get()).val();
  const secrets = (await db().ref(`salon_secrets/${salonId}`).get()).val();
  const tokenless = secrets ? { ...secrets, monobankToken: undefined } : null; // токен мерчанта в архів не кладемо
  await bucket().file(`backups/deleted/${salonId}-${Date.now()}.json`).save(
    JSON.stringify({ salonId, deletedAt: Date.now(), deletedBy, data: data || null, secrets: tokenless }), { contentType: "application/json", resumable: false });
  const upd = { [`salons/${salonId}`]: null, [`salon_index/${salonId}`]: null, [`salon_secrets/${salonId}`]: null, [`salon_billing/${salonId}`]: null };
  const slug = data?.profile?.slug;
  if (slug) upd[`salon_slugs/${slug}`] = null;
  for (const muid of Object.keys(data?.masterAuth || {})) upd[`master_memberships/${muid}/${salonId}`] = null;
  await db().ref().update(upd);
  try { await bucket().deleteFiles({ prefix: `salons/${salonId}/` }); } catch (e) { console.warn("deleteAccount: storage", e.message); }
}

const salonDeleteAccount = onRequest({ region: REGION, cors: true, timeoutSeconds: 300, memory: "512MiB" }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const caller = await authUser(req, res);
    if (!caller) return;
    const isVendor = caller.email === VENDOR_EMAIL;
    const { type, salonId: sid } = bodyOf(req);
    if (sid !== undefined && !isSafeKey(sid)) { res.status(400).json({ error: "bad_salon" }); return; }

    if (type === "owner") {
      const salonId = sid || caller.uid;
      if (salonId !== caller.uid && !isVendor) { res.status(403).json({ error: "forbidden" }); return; }
      if (salonId === caller.uid && isVendor) { res.status(400).json({ error: "vendor_account" }); return; }
      if (!(await sRef(salonId, "profile").get()).exists()) { res.status(404).json({ error: "salon_not_found" }); return; }
      try { await deleteOwnerSalon(salonId, caller.uid); } catch (e) { console.error("deleteAccount: owner archive/delete failed", e); res.status(500).json({ error: "archive" }); return; }
      try { await admin.auth().deleteUser(salonId); } catch (e) { console.warn("deleteAccount: auth", e.code); }
      console.log(`deleteAccount: salon ${salonId} deleted by ${caller.uid}`);
      res.json({ ok: true }); return;
    }

    if (type === "client") {
      const uid = caller.uid;
      if (isVendor) { res.status(400).json({ error: "vendor_account" }); return; }
      const salons = sid ? [sid] : await allSalonIds();
      let cleaned = 0;
      for (const id of salons) {
        if ((await sRef(id, `users/${uid}`).get()).exists() || (await sRef(id, "bookings").orderByChild("clientUid").equalTo(uid).limitToFirst(1).get()).exists()) {
          await deleteClientData(id, uid); cleaned++;
        }
      }
      // Без salonId видаляємо й сам обліковий запис; з salonId — лише дані в цьому салоні (клієнт може бути й в інших)
      if (!sid) { try { await admin.auth().deleteUser(uid); } catch (e) { console.warn("deleteAccount: auth", e.code); } }
      console.log(`deleteAccount: client ${uid} cleaned in ${cleaned} salon(s)`);
      res.json({ ok: true, salons: cleaned }); return;
    }
    res.status(400).json({ error: "type" });
  } catch (e) {
    console.error("salonDeleteAccount error:", e);
    res.status(500).json({ error: "server" });
  }
});

// ─── Резервна копія ─────────────────────────────────────────────────────
async function runBackup(trigger) {
  const startedAt = Date.now();
  const date = localDate(startedAt, "Europe/Kyiv");
  try {
    const b = bucket();
    let count = 0, bytes = 0;
    for (const salonId of await allSalonIds()) {
      const salon = (await sRef(salonId).get()).val();
      if (!salon) continue;
      const data = {};
      for (const k of BACKUP_KEYS) if (salon[k] !== undefined) data[k] = salon[k];
      if (data.users) data.users = Object.fromEntries(Object.entries(data.users).map(([u, v]) => [u, { ...v, fcmTokens: undefined }]));
      const body = JSON.stringify({ salonId, date, savedAt: startedAt, trigger, data });
      await b.file(`backups/${date}/${salonId}.json`).save(body, { contentType: "application/json", resumable: false });
      count++; bytes += Buffer.byteLength(body);
    }
    const cutoff = localDate(startedAt - BACKUP_KEEP_DAYS * 86400000, "Europe/Kyiv");
    const [files] = await b.getFiles({ prefix: "backups/" });
    let removed = 0;
    for (const f of files) {
      const m = /^backups\/(\d{4}-\d{2}-\d{2})\//.exec(f.name);
      if (m && m[1] < cutoff) { await f.delete().catch(() => {}); removed++; }
    }
    await db().ref("system/backupStatus").set({ ok: true, at: Date.now(), date, salons: count, bytes, removed, trigger });
    return { ok: true, count, removed };
  } catch (e) {
    console.error("backup error:", e);
    await db().ref("system/backupStatus").set({ ok: false, at: Date.now(), date, trigger, error: String(e?.message || e).slice(0, 300) }).catch(() => {});
    return { ok: false };
  }
}

const salonNightlyBackup = onSchedule({ schedule: "every day 03:00", timeZone: "Europe/Kyiv", region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async () => {
  if ((await db().ref("system/backupEnabled").get()).val() !== true) return;
  await runBackup("nightly");
});

// Кнопка «Зробити копію зараз» у суперадміні: запис system/backupRequest (пише лише суперадмін) → копія незалежно від тумблера
const salonManualBackup = onValueWritten({ ref: "system/backupRequest", region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (event) => {
  if (event.data.after.val() == null) return;
  await runBackup("manual");
  await db().ref("system/backupRequest").remove().catch(() => {});
});

module.exports = { salonDeleteAccount, salonNightlyBackup, salonManualBackup, deleteClientData, deleteOwnerSalon, runBackup };
