// Реєстр салонів і життєвий цикл: salon_index, нові клієнти, ліцензія (термін підписки власника).
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated } = require("firebase-functions/v2/database");
const {
  REGION, db, sRef, adminUrl, allSalonIds, pushOwner, licenseUntilTs, LICENSE_GRACE_MS, LICENSE_WARN_MS,
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

// Новий клієнт заповнив анкету → push власнику
const salonOnClientRegistered = onValueCreated(
  { ref: "salons/{salonId}/users/{uid}/profile", region: REGION },
  async (event) => {
    const profile = event.data.val() || {};
    const { salonId, uid } = event.params;
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

module.exports = { salonOnProfileCreated, salonOnClientRegistered, salonCheckLicenseExpiry, checkSalonLicense };
