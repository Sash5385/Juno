// Реєстр салонів і життєвий цикл: salon_index, нові клієнти, ліцензія (термін підписки власника).
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated } = require("firebase-functions/v2/database");
const {
  admin, REGION, db, sRef, adminUrl, allSalonIds, pushOwner, licenseUntilTs, LICENSE_GRACE_MS, LICENSE_WARN_MS,
  salonTimezone, localDate, saveNotification,
} = require("./lib");

// Новий салон (з'явився profile) → запис у salon_index: за ним шедулери знаходять усі салони
// (клієнт теж пише salon_index при реєстрації, але на сервер надійніше)
const salonOnProfileCreated = onValueCreated(
  { ref: "salons/{salonId}/profile", region: REGION },
  async (event) => {
    const { salonId } = event.params;
    const p = event.data.val() || {};
    await db().ref(`salon_index/${salonId}`).transaction((cur) => cur || { name: p.name || "", slug: p.slug || "", createdAt: Date.now() });
  }
);

const normPhone = (p) => String(p || "").replace(/\D/g, "");

// Записи, які власник завів клієнту без акаунта (лише ім'я й телефон), прив'язуємо до щойно зареєстрованого клієнта з тим самим
// телефоном — тоді вони видно в його кабінеті, і нагадування працюють. Лише якщо телефон ПІДТВЕРДЖЕНО входом за SMS
// (Auth phoneNumber): телефон з анкети можна вписати чужий. Дивимось записи від -30 діб і далі; історію не переносимо.
async function linkWalkInBookings(salonId, uid, profile) {
  const phone = normPhone(profile.phone);
  if (phone.length < 9) return 0;
  const authPhone = await admin.auth().getUser(uid).then((u) => normPhone(u.phoneNumber)).catch(() => "");
  if (!authPhone || authPhone !== phone) return 0;
  const from = localDate(Date.now() - 30 * 86400000, await salonTimezone(salonId));
  const snap = await sRef(salonId, "bookings").orderByChild("date").startAt(from).get();
  const upd = {};
  snap.forEach((c) => {
    const b = c.val();
    if (b && !b.clientUid && b.status !== "personal" && normPhone(b.phone) === phone) upd[`bookings/${c.key}/clientUid`] = uid;
  });
  const n = Object.keys(upd).length;
  if (n) {
    await sRef(salonId).update(upd);
    await saveNotification(salonId, uid, "📋 Знайшли ваші записи", `Записи, створені салоном за вашим номером, тепер у «Мої записи»: ${n}`, "system");
  }
  return n;
}

// Новий клієнт заповнив анкету → push власнику
const salonOnClientRegistered = onValueCreated(
  { ref: "salons/{salonId}/users/{uid}/profile", region: REGION },
  async (event) => {
    const profile = event.data.val() || {};
    const { salonId, uid } = event.params;
    await linkWalkInBookings(salonId, uid, profile).catch((e) => console.error("linkWalkInBookings:", e));
    const name = profile.name || "Новий клієнт";
    await pushOwner(salonId, "🎉 Новий клієнт", profile.phone ? `${name} · ${profile.phone}` : name, { url: `${adminUrl()}/?client=${encodeURIComponent(uid)}` });
  }
);

const fmtDate = (ts) => new Date(ts).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric" });

// Кожні 6 годин: за 3 дні — попередження (раз на період), у пільгову добу — нагадування (раз), після неї — suspended
async function checkSalonLicense(salonId, now) {
  const lic = (await sRef(salonId, "license").get()).val();
  if (!lic || lic.status === "suspended") return;
  const until = licenseUntilTs(lic);
  if (!until) return;
  const link = { url: adminUrl() };
  if (now > until + LICENSE_GRACE_MS) {
    await sRef(salonId, "license/status").set("suspended");
    await pushOwner(salonId, "🔒 Режим читання", "Підписку не оплачено — акаунт переведено в режим читання. Оплатіть у Налаштуваннях, щоб відновити роботу.", link).catch(() => {});
  } else if (now > until) {
    if (lic.graceNotifiedFor !== until) {
      await sRef(salonId, "license/graceNotifiedFor").set(until);
      await pushOwner(salonId, "⚠️ Підписку не оплачено", "Сьогодні остання доба — далі акаунт перейде в режим читання. Оплатіть у Налаштуваннях.", link).catch(() => {});
    }
  } else if (until - now <= LICENSE_WARN_MS && lic.warnedFor !== until) {
    const days = Math.max(1, Math.ceil((until - now) / 86400000));
    await sRef(salonId, "license/warnedFor").set(until);
    const what = lic.status === "trial" ? "Пробний період" : "Підписка";
    await pushOwner(salonId, "⏳ Скоро завершення", `${what} закінчується ${fmtDate(until)} (через ${days} дн.). Продовжіть у Налаштуваннях.`, link).catch(() => {});
  }
}

const salonCheckLicenseExpiry = onSchedule({ schedule: "every 6 hours", region: REGION }, async () => {
  const now = Date.now();
  for (const salonId of await allSalonIds()) {
    await checkSalonLicense(salonId, now).catch((e) => console.error(`salonCheckLicenseExpiry: salon=${salonId}`, e));
  }
});

module.exports = { salonOnProfileCreated, salonOnClientRegistered, salonCheckLicenseExpiry, checkSalonLicense, linkWalkInBookings };
