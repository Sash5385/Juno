// Cloud Functions Juno (салон/барбершоп/манікюр). Схема і ролі: docs/SALON-SCHEMA.md.
// Підключається з ../index.js. Адреси застосунків: functions/.env.<project> з SALON_ADMIN_URL, SALON_CLIENT_URL.
module.exports = {
  ...require("./bookings"),   // salonOnBookingChanged
  ...require("./queue"),      // salonOnQueueInvite, salonOnAdminSlotOpened, salonCascadeQueueInvites
  ...require("./reminders"),  // salonSendReminders, salonFlushRescheduleQueue
  ...require("./chat"),       // salonOnClientMessage, salonOnOwnerMessage, salonOnMasterChatMessage
  ...require("./registry"),   // salonOnProfileCreated, salonOnClientRegistered, salonCheckLicenseExpiry
  ...require("./masters"),    // salonCreateMasterInvite, salonClaimMasterInvite
  ...require("./payments"),   // salonSavePaymentSettings, salonCreateBookingInvoice, salonMonobankCallback, salonExpireUnpaidBookings
  ...require("./broadcast"),  // salonOnSlotFreed, salonFlushSlotFreedQueue, salonSendBroadcast
  ...require("./account"),    // salonDeleteAccount, salonNightlyBackup
  ...require("./billing"),    // salonSubscriptionInfo, salonCreateSubscriptionInvoice, salonSubscriptionCallback, salonOnMasterWritten
};
