// Зведення для суперадмінки (aldemi.com.ua/superadmin): лічильники по всіх салонах Juno. Лише вендор (VENDOR_EMAIL).
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { REGION, VENDOR_EMAIL, db, allSalonIds, localDate, licenseUntilTs, isLicenseReadonly, isCancelled, DEFAULT_TZ } = require("./lib");

const DAY_MS = 86400000;

// Окремий салон: профіль, ліцензія, кількість майстрів/клієнтів, записи з початку місяця
async function salonStats(salonId, today, weekStart, monthStart) {
  const root = db().ref(`salons/${salonId}`);
  const [profile, license, masters, users, bookings] = await Promise.all([
    root.child("profile").get(),
    root.child("license").get(),
    root.child("masters").get(),
    root.child("users").get(),
    root.child("bookings").orderByChild("date").startAt(monthStart).get(),
  ]);
  const lic = license.val();
  const stats = { salonId, name: profile.val()?.name || salonId, license: lic?.status || null, licenseUntil: lic ? licenseUntilTs(lic) || null : null,
    readonly: isLicenseReadonly(lic), masters: Object.keys(masters.val() || {}).length, clients: Object.keys(users.val() || {}).length,
    today: 0, week: 0, month: 0, revenue: 0 };
  for (const b of Object.values(bookings.val() || {})) {
    if (!b || b.status === "personal" || isCancelled(b)) continue;
    stats.month++;
    if (b.date >= weekStart) stats.week++;
    if (b.date === today) stats.today++;
    if (b.status === "completed" || b.paymentStatus === "paid") stats.revenue += Number(b.paidAmount ?? b.price) || 0;
  }
  return stats;
}

exports.superadminSummary = onCall({ region: REGION, timeoutSeconds: 120 }, async (req) => {
  if (req.auth?.token?.email !== VENDOR_EMAIL || req.auth?.token?.email_verified !== true) throw new HttpsError("permission-denied", "Лише для власника платформи");
  const now = Date.now();
  const today = localDate(now, DEFAULT_TZ);
  const weekStart = localDate(now - 6 * DAY_MS, DEFAULT_TZ);
  const monthStart = today.slice(0, 8) + "01";
  const ids = await allSalonIds();
  const salons = [];
  for (let i = 0; i < ids.length; i += 10) {
    salons.push(...await Promise.all(ids.slice(i, i + 10).map(id => salonStats(id, today, weekStart, monthStart).catch(() => null))));
  }
  const list = salons.filter(Boolean);
  const sum = (k) => list.reduce((a, s) => a + s[k], 0);
  // Помилки браузерів за 24 години (reportError → system/errorLog)
  const errs = Object.values((await db().ref("system/errorLog").get()).val() || {}).filter(e => now - (e.last || 0) < DAY_MS).length;
  return {
    generatedAt: now,
    totals: { salons: list.length, masters: sum("masters"), clients: sum("clients"), today: sum("today"), week: sum("week"), month: sum("month"), revenue: sum("revenue"),
      trial: list.filter(s => s.license === "trial").length, active: list.filter(s => s.license === "active").length, readonly: list.filter(s => s.readonly).length, errors24h: errs },
    salons: list.sort((a, b) => b.month - a.month),
  };
});
