// Cloud Functions салону (клон DrivePad під салон/барбершоп/манікюр). Схема і ролі: docs/SALON-SCHEMA.md.
// Підключається з ../index.js ЛИШЕ коли SALON_FUNCTIONS=1 — на бойовому проєкті DrivePad (інструктори) нічого не змінюється.
// Для окремого Firebase-проєкту салону: functions/.env.<project> з SALON_FUNCTIONS=1 (+ SALON_ADMIN_URL, SALON_CLIENT_URL).
module.exports = {
  ...require("./bookings"),   // salonOnBookingChanged
  ...require("./queue"),      // salonOnQueueInvite, salonOnAdminSlotOpened, salonCascadeQueueInvites
  ...require("./reminders"),  // salonSendReminders, salonFlushRescheduleQueue
  ...require("./chat"),       // salonOnClientMessage, salonOnOwnerMessage, salonOnMasterChatMessage
  ...require("./registry"),   // salonOnProfileCreated, salonOnClientRegistered, salonCheckLicenseExpiry
  ...require("./masters"),    // salonCreateMasterInvite, salonClaimMasterInvite
  ...require("./payments"),   // salonSavePaymentSettings, salonCreateBookingInvoice, salonMonobankCallback, salonExpireUnpaidBookings
};

// Експортуємо лише обгортки функцій (а не внутрішні хелпери модулів) — Firebase бере з exports усе
for (const k of Object.keys(module.exports)) {
  const v = module.exports[k];
  if (typeof v !== "function" || !v.__endpoint) delete module.exports[k];
}
