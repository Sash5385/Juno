// Запрошення майстрів. Власник створює одноразовий код (salonCreateMasterInvite), майстер після входу
// у свій Firebase-акаунт приймає його (salonClaimMasterInvite) — сервер прив'язує uid до masterId:
//   salons/{salonId}/masterAuth/{uid} = masterId, masterSettings/{masterId}/uid = uid.
// Прямий запис masterAuth правилами заборонений усім, крім власника, тож майстер сам себе призначити не може.
// Код = "{salonId}.{secret}": salonId у коді — щоб майстру не вводити нічого зайвого; secret — 16 випадкових байт.
const { onRequest } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { REGION, sRef, isSafeKey, adminUrl, pushOwner, masterName } = require("./lib");
const { authUser, bodyOf } = require("./http");

const HOUR = 3600000;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const salonCreateMasterInvite = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const user = await authUser(req, res);
    if (!user) return;
    const salonId = user.uid; // салон власника: salonId = його uid
    const { masterId, ttlHours } = bodyOf(req);
    if (!isSafeKey(masterId)) { res.status(400).json({ error: "bad_master" }); return; }
    if (!(await sRef(salonId, `masters/${masterId}/profile`).get()).exists()) { res.status(404).json({ error: "master_not_found" }); return; }

    // Старі неприйняті запрошення цього майстра відкликаємо — діє лише найновіше
    const old = (await sRef(salonId, "masterInvites").get()).val() || {};
    const upd = {};
    for (const [k, inv] of Object.entries(old)) if (inv?.masterId === masterId && !inv.claimedBy) upd[`masterInvites/${k}`] = null;
    if (Object.keys(upd).length) await sRef(salonId).update(upd);

    const now = Date.now();
    const expiresAt = now + clamp(Number(ttlHours) || 72, 1, 168) * HOUR;
    const secret = crypto.randomBytes(16).toString("base64url");
    await sRef(salonId, `masterInvites/${secret}`).set({ masterId, createdAt: now, expiresAt, createdBy: user.uid });
    const code = `${salonId}.${secret}`;
    res.json({ ok: true, code, link: `${adminUrl()}/join/${code}`, expiresAt });
  } catch (e) {
    console.error("salonCreateMasterInvite error:", e);
    res.status(500).json({ error: "server" });
  }
});

const salonClaimMasterInvite = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  try {
    const user = await authUser(req, res);
    if (!user) return;
    const m = /^([^.]+)\.([A-Za-z0-9_-]{16,64})$/.exec(String(bodyOf(req).code || ""));
    if (!m || !isSafeKey(m[1])) { res.status(400).json({ error: "bad_code" }); return; }
    const [, salonId, secret] = m;
    const uid = user.uid;
    const inviteRef = sRef(salonId, `masterInvites/${secret}`);
    const inv = (await inviteRef.get()).val();
    if (!inv || inv.expiresAt < Date.now() || (inv.claimedBy && inv.claimedBy !== uid)) { res.status(404).json({ error: "invite_invalid" }); return; }
    const masterId = inv.masterId;
    if (!(await sRef(salonId, `masters/${masterId}/profile`).get()).exists()) { res.status(404).json({ error: "master_not_found" }); return; }
    const bound = (await sRef(salonId, `masterAuth/${uid}`).get()).val();
    if (bound && bound !== masterId) { res.status(409).json({ error: "already_master" }); return; }

    // Рівно один переможець: claimedBy виставляється транзакційно (повтор того ж uid — ідемпотентний)
    const tx = await inviteRef.child("claimedBy").transaction((cur) => (cur === null ? uid : cur === uid ? cur : undefined));
    if (!tx.committed) { res.status(404).json({ error: "invite_invalid" }); return; }

    const oldUid = (await sRef(salonId, `masterSettings/${masterId}/uid`).get()).val();
    const upd = {
      [`masterAuth/${uid}`]: masterId,
      [`masterSettings/${masterId}/uid`]: uid,
      [`masterInvites/${secret}/claimedAt`]: Date.now(),
    };
    if (oldUid && oldUid !== uid) upd[`masterAuth/${oldUid}`] = null; // нове запрошення замінює попередній логін майстра
    await sRef(salonId).update(upd);
    if (bound !== masterId) {
      await pushOwner(salonId, "👤 Майстер приєднався", `${(await masterName(salonId, masterId)) || "Майстер"} увійшов у свій кабінет`, { url: adminUrl() }).catch(() => {});
    }
    res.json({ ok: true, salonId, masterId });
  } catch (e) {
    console.error("salonClaimMasterInvite error:", e);
    res.status(500).json({ error: "server" });
  }
});

module.exports = { salonCreateMasterInvite, salonClaimMasterInvite };
