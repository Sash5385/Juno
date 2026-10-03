// Спільні хелпери Cloud Functions салону (клон DrivePad). Схема і ролі: docs/SALON-SCHEMA.md.
// Нічого не імпортує з ../index.js (щоб не було циклу) — дрібні хелпери продубльовано свідомо:
// код інструкторів лишається нетронутим, поки салон живе на окремій гілці.
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const REGION = "europe-west1";
const DEFAULT_TZ = "Europe/Kyiv";
const VENDOR_EMAIL = "sash5385@gmail.com";

// Адреси застосунків: на окремому Firebase-проєкті (ребрендинг) задаються через .env.<project>
const adminUrl = () => process.env.SALON_ADMIN_URL || "https://drivepad-admin.web.app";
const clientUrl = () => process.env.SALON_CLIENT_URL || "https://drivepad-client.web.app";

const db = () => admin.database();
const sRef = (salonId, path) => db().ref(path ? `salons/${salonId}/${path}` : `salons/${salonId}`);

// Безпечний ключ RTDB (без . # $ [ ] /) — для всього, що приходить із запиту користувача
const isSafeKey = (k) => typeof k === "string" && k.length > 0 && k.length <= 128 && !/[.#$[\]/]/.test(k);

// ─── Час ────────────────────────────────────────────────────────────────
// "YYYY-MM-DD" + "HH:MM" за часовим поясом салону → абсолютні мс. Два проходи — щоб правильно
// потрапляти в добу переходу на літній/зимовий час (зсув беремо на самому моменті, а не на здогадці).
function tzOffsetMs(ms, tz) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(ms).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return Date.UTC(p.year, p.month - 1, p.day, p.hour === "24" ? 0 : p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
function localToMs(dateStr, timeStr, tz = DEFAULT_TZ) {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`).getTime();
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}
// Дата "YYYY-MM-DD" у часовому поясі салону на момент ms
function localDate(ms, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}
function localHour(ms, tz = DEFAULT_TZ) {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(ms), 10);
}
const isQuietHour = (ms, tz) => { const h = localHour(ms, tz); return h >= 23 || h < 6; };

// ─── Токени й push ──────────────────────────────────────────────────────
function collectDeviceTokens(devicesVal) {
  if (!devicesVal || typeof devicesVal !== "object") return [];
  return Object.entries(devicesVal).filter(([, t]) => !!t);
}
const STALE = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

// Data-only push (title/body/url у data): клієнт і SW самі показують сповіщення, без дубля від браузера
async function sendToDevices(devices, { title, body, link, data = {} }, onStale) {
  let sent = false;
  for (const [deviceId, token] of devices) {
    try {
      await admin.messaging().send({
        token,
        data: Object.fromEntries(Object.entries({ title, body, url: link, ...data }).map(([k, v]) => [k, String(v)])),
        webpush: { fcmOptions: { link } },
      });
      sent = true;
    } catch (e) {
      if (STALE.has(e.code)) await Promise.resolve(onStale(deviceId)).catch(() => {});
      else console.error(`salon push error: code=${e.code} msg=${e.message}`);
    }
  }
  return sent;
}

// Власник салону: salons/{salonId}/fcmTokens/{deviceId}
async function pushOwner(salonId, title, body, data = {}) {
  const devices = collectDeviceTokens((await sRef(salonId, "fcmTokens").get()).val());
  if (!devices.length) return false;
  return sendToDevices(devices, { title, body, link: data.url || adminUrl(), data },
    (id) => sRef(salonId, `fcmTokens/${id}`).remove());
}
// Майстер: salons/{salonId}/masterTokens/{masterId}/{deviceId}
async function pushMaster(salonId, masterId, title, body, data = {}) {
  if (!masterId) return false;
  const devices = collectDeviceTokens((await sRef(salonId, `masterTokens/${masterId}`).get()).val());
  if (!devices.length) return false;
  return sendToDevices(devices, { title, body, link: data.url || adminUrl(), data },
    (id) => sRef(salonId, `masterTokens/${masterId}/${id}`).remove());
}
// Клієнт: salons/{salonId}/users/{uid}/fcmTokens/{deviceId} (дзеркало для розсилок — clientTokens)
async function pushClient(salonId, uid, title, body, data = {}) {
  if (!uid) return false;
  const devices = collectDeviceTokens((await sRef(salonId, `users/${uid}/fcmTokens`).get()).val());
  if (!devices.length) return false;
  return sendToDevices(devices, { title, body, link: data.url || `${clientUrl()}/cabinet`, data },
    async (id) => {
      await sRef(salonId, `users/${uid}/fcmTokens/${id}`).remove().catch(() => {});
      await sRef(salonId, `clientTokens/${uid}/${id}`).remove().catch(() => {});
    });
}

// uid Firebase Auth майстра (пишеться при прийнятті запрошення) — для сповіщень у notifications/{uid}
async function masterUid(salonId, masterId) {
  if (!masterId) return null;
  return (await sRef(salonId, `masterSettings/${masterId}/uid`).get().catch(() => null))?.val() || null;
}
async function masterName(salonId, masterId) {
  if (!masterId) return "";
  return (await sRef(salonId, `masters/${masterId}/profile/name`).get().catch(() => null))?.val() || "";
}
async function salonName(salonId) {
  return (await sRef(salonId, "profile/name").get().catch(() => null))?.val() || "";
}
async function salonTimezone(salonId) {
  return (await sRef(salonId, "profile/timezone").get().catch(() => null))?.val() || DEFAULT_TZ;
}

// Push персоналу: власнику і майстру запису (якщо майстер — це сам власник, друге повідомлення не шлемо)
async function pushStaff(salonId, masterId, title, body, data = {}, { masterBody } = {}) {
  const mUid = await masterUid(salonId, masterId);
  const [o, m] = await Promise.all([
    pushOwner(salonId, title, body, data).catch(() => false),
    masterId && mUid !== salonId ? pushMaster(salonId, masterId, title, masterBody ?? body, data).catch(() => false) : false,
  ]);
  return o || m;
}

async function saveNotification(salonId, uid, title, body, type = "system") {
  if (!uid) return;
  const ts = Date.now();
  const time = new Date(ts).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit", timeZone: DEFAULT_TZ });
  const date = new Date(ts).toLocaleDateString("uk", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: DEFAULT_TZ });
  await sRef(salonId, `notifications/${uid}`).push({ title, body, type, ts, time, date }).catch(() => {});
}

// ─── Записи ─────────────────────────────────────────────────────────────
const durationMinOf = (b) => b?.durationMin ?? b?.durMin ?? (b?.durationHours ? b.durationHours * 60 : 60);
const isCancelled = (b) => !b || b.status === "cancelled" || !!b.cancelledBy;
const fmtDM = (d) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ""); return m ? `${m[2]}.${m[1]}` : (d || "—"); };

function buildAdminLink({ date, time, masterId, bookingId } = {}) {
  const p = new URLSearchParams();
  if (date && date !== "—") p.set("date", date);
  if (time && time !== "—") p.set("time", time);
  if (masterId) p.set("master", masterId);
  if (bookingId) p.set("bookingId", bookingId);
  const qs = p.toString();
  return qs ? `${adminUrl()}/?${qs}` : `${adminUrl()}/`;
}
const clientBookingsLink = () => `${clientUrl()}/cabinet/bookings`;

// Текст пуша про запис: клієнт · послуга тривалість / дата о час · телефон / 💬 нотатка (+ майстер для власника)
function buildBookingBody(b, { masterName: mName = "", withMaster = false } = {}) {
  const svc = b.serviceName || "";
  const line1 = `${b.clientName || "Клієнт"}${svc ? " · " + svc : ""} ${durationMinOf(b)} хв`;
  const line2 = b.phone ? `${b.date} о ${b.time} · ${b.phone}` : `${b.date} о ${b.time}`;
  const lines = [line1, line2];
  if (withMaster && mName) lines.splice(1, 0, `Майстер: ${mName}`);
  const note = String(b.clientNote || "").trim();
  if (note) lines.push(`💬 ${note}`);
  return lines.join("\n");
}

// ─── Ліцензія (SaaS-підписка власника салону) ───────────────────────────
const LICENSE_GRACE_MS = 24 * 3600 * 1000;
const LICENSE_WARN_MS = 3 * 24 * 3600 * 1000;
const licenseUntilTs = (l) => (l ? (l.status === "trial" ? l.trialEndsAt : l.expiresAt) : null);
// true — призупинено або термін + пільгова доба минули. Немає вузла license — фіча вимкнена (false)
function isLicenseReadonly(l) {
  if (!l) return false;
  if (l.status === "suspended") return true;
  const until = licenseUntilTs(l);
  return !!until && Date.now() > until + LICENSE_GRACE_MS;
}

// Усі салони: реєстр salon_index (його наповнює власник при реєстрації і сервер — salonOnProfileCreated)
async function allSalonIds() {
  return Object.keys((await db().ref("salon_index").get()).val() || {});
}

module.exports = {
  admin, REGION, DEFAULT_TZ, VENDOR_EMAIL, adminUrl, clientUrl, db, sRef, isSafeKey,
  tzOffsetMs, localToMs, localDate, localHour, isQuietHour,
  collectDeviceTokens, sendToDevices, pushOwner, pushMaster, pushClient, pushStaff,
  masterUid, masterName, salonName, salonTimezone, saveNotification,
  durationMinOf, isCancelled, fmtDM, buildAdminLink, clientBookingsLink, buildBookingBody,
  LICENSE_GRACE_MS, LICENSE_WARN_MS, licenseUntilTs, isLicenseReadonly, allSalonIds,
};
