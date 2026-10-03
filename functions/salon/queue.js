// Черга очікування ПЕР МАЙСТЕР: salons/{salonId}/queue/{masterId}/{slotKey}/entries/{uid}, slotKey = "YYYY-MM-DD_HH:MM".
// Статуси запису в черзі: waiting → offered → booked | expired.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const {
  REGION, sRef, clientUrl, localToMs, salonTimezone, masterName, pushClient, saveNotification,
  isLicenseReadonly, allSalonIds,
} = require("./lib");

const OFFER_WINDOW_MS = 30 * 60 * 1000;

const slotIdOf = (time) => `slot${time.replace(":", "")}`;
function parseSlotKey(slotKey) {
  const sep = String(slotKey).lastIndexOf("_");
  const date = slotKey.slice(0, sep), time = slotKey.slice(sep + 1);
  return date && time ? { date, time } : null;
}

// Запросити наступного в черзі (першого зі статусом waiting, за часом додавання).
// freedDurationMin — тривалість щойно скасованого запису: саме на неї записуємо клієнта з черги.
async function inviteNextInQueue(salonId, masterId, slotKey, excludeUids = [], freedDurationMin = null) {
  const snap = await sRef(salonId, `queue/${masterId}/${slotKey}/entries`).get();
  if (!snap.exists()) return null;
  const next = Object.entries(snap.val())
    .map(([uid, e]) => ({ uid, ...e }))
    .filter((e) => e.status === "waiting" && !excludeUids.includes(e.uid))
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))[0];
  if (!next) return null;
  const upd = { status: "offered" };
  if (freedDurationMin) upd.offerDurationMin = freedDurationMin;
  await sRef(salonId, `queue/${masterId}/${slotKey}/entries/${next.uid}`).update(upd);
  return next.uid; // salonOnQueueInvite спрацює сам
}

// status → offered: резервуємо слот за клієнтом на 30 хв, шлемо push і in-app пропозицію
const salonOnQueueInvite = onValueUpdated(
  { ref: "salons/{salonId}/queue/{masterId}/{slotKey}/entries/{uid}", region: REGION },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!after || after.status !== "offered" || before?.status === "offered") return;
    const { salonId, masterId, slotKey, uid } = event.params;
    const parsed = parseSlotKey(slotKey);
    if (!parsed) return;
    const { date, time } = parsed;
    const until = Date.now() + OFFER_WINDOW_MS;

    await sRef(salonId, `timeslots/${masterId}/${date}/${slotIdOf(time)}/offeredTo/${uid}`).set({ until }).catch(() => {});
    await sRef(salonId, `users/${uid}/queueOffers/${masterId}_${slotKey}`).set({
      masterId, date, time, until, slotKey,
      ...(after.offerDurationMin ? { durationMin: after.offerDurationMin } : {}),
    }).catch(() => {});

    const mName = await masterName(salonId, masterId);
    const title = "🎉 Звільнився час для вас!";
    const body = `${mName ? mName + " · " : ""}${date} о ${time} — у вас 30 хвилин, щоб записатись`;
    const url = `${clientUrl()}/cabinet?master=${masterId}&date=${date}&time=${encodeURIComponent(time)}`;
    await pushClient(salonId, uid, title, body, { url, masterId, date, time, slotKey });
    await saveNotification(salonId, uid, title, body, "queue_offer");
  }
);

// Власник/майстер відкрив заблокований слот (adminBlocked true → false, available → true):
// запрошуємо першого в черзі цього майстра
const salonOnAdminSlotOpened = onValueWritten(
  { ref: "salons/{salonId}/timeslots/{masterId}/{date}/{slotId}", region: REGION },
  async (event) => {
    const before = event.data.before?.val();
    const after = event.data.after?.val();
    if (!before || !after || before.adminBlocked !== true) return;
    if (after.adminBlocked !== false || after.available !== true) return;
    const { salonId, masterId, date, slotId } = event.params;
    let time = after.time;
    if (!time) {
      const m = slotId.match(/^slot(\d{2})(\d{2})$/);
      if (!m) return;
      time = `${m[1]}:${m[2]}`;
    }
    await inviteNextInQueue(salonId, masterId, `${date}_${time}`);
  }
);

// Кожні 10 хв: прострочені пропозиції → entry стає expired, резерв знімається, а коли активних
// пропозицій на слот не лишилось — запрошуємо наступного. (В інструкторській версії прострочені
// лишались offered і наступні запрошувались кожні 10 хв, не чекаючи вікна попереднього.)
const salonCascadeQueueInvites = onSchedule({ schedule: "every 10 minutes", region: REGION }, async () => {
  const now = Date.now();
  for (const salonId of await allSalonIds()) {
    try {
      if (isLicenseReadonly((await sRef(salonId, "license").get()).val())) continue;
      const queue = (await sRef(salonId, "queue").get()).val() || {};
      const tz = await salonTimezone(salonId);
      for (const [masterId, slots] of Object.entries(queue)) {
        for (const [slotKey, node] of Object.entries(slots || {})) {
          const entries = node?.entries || {};
          if (!Object.values(entries).some((e) => e?.status === "offered")) continue;
          const parsed = parseSlotKey(slotKey);
          if (!parsed || localToMs(parsed.date, parsed.time, tz) <= now) continue; // час уже минув
          const slotPath = `timeslots/${masterId}/${parsed.date}/${slotIdOf(parsed.time)}`;
          const slot = (await sRef(salonId, slotPath).get()).val();
          if (!slot || slot.available === false) continue; // слот зайнято — черга своє відпрацювала
          const offered = slot.offeredTo || {};
          const expired = Object.entries(offered).filter(([, o]) => (o?.until || 0) < now).map(([uid]) => uid);
          const active = Object.entries(offered).filter(([, o]) => (o?.until || 0) >= now);
          if (!expired.length || active.length) continue;
          const upd = {};
          for (const uid of expired) {
            upd[`${slotPath}/offeredTo/${uid}`] = null;
            upd[`queue/${masterId}/${slotKey}/entries/${uid}/status`] = "expired";
            upd[`users/${uid}/queueOffers/${masterId}_${slotKey}`] = null;
          }
          await sRef(salonId).update(upd);
          await inviteNextInQueue(salonId, masterId, slotKey);
        }
      }
    } catch (e) {
      console.error(`salonCascadeQueueInvites: salon=${salonId}`, e);
    }
  }
});

module.exports = { inviteNextInQueue, salonOnQueueInvite, salonOnAdminSlotOpened, salonCascadeQueueInvites, OFFER_WINDOW_MS };
