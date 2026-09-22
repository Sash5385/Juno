const { google } = require("googleapis");
const { defineSecret } = require("firebase-functions/params");

const CALENDAR_TIMEZONE = "Europe/Kyiv";

const googleClientId = defineSecret("GOOGLE_CALENDAR_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CALENDAR_CLIENT_SECRET");
const googleRefreshToken = defineSecret("GOOGLE_CALENDAR_REFRESH_TOKEN");

const CALENDAR_SECRETS = [googleClientId, googleClientSecret, googleRefreshToken];

function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    googleClientId.value(),
    googleClientSecret.value()
  );
  oauth2Client.setCredentials({ refresh_token: googleRefreshToken.value() });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// Той самий розрахунок дати/тривалості, що й buildSlotUpdates в index.js
function getBookingSchedule(booking) {
  const { date, time, durationHours, durMin, startMin } = booking || {};
  if (!date || (!time && startMin == null)) return null;

  let start;
  if (startMin != null) {
    start = startMin;
  } else {
    const [h, m] = (time || "0:0").split(":").map(Number);
    start = h * 60 + m;
  }
  const dur = durMin ?? ((durationHours || 1) * 60);
  const hh = String(Math.floor(start / 60)).padStart(2, "0");
  const mm = String(start % 60).padStart(2, "0");

  return { date, time: `${hh}:${mm}`, startMin: start, durMin: dur };
}

function computeRange(booking) {
  const sched = getBookingSchedule(booking);
  if (!sched) return null;
  const { date, startMin: start, durMin: dur } = sched;
  const end = start + dur;

  const toDateTime = (totalMin) => {
    const dayOffset = Math.floor(totalMin / 1440);
    const mins = ((totalMin % 1440) + 1440) % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + dayOffset);
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const DD = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${MM}-${DD}T${hh}:${mm}:00`;
  };

  return { startDateTime: toDateTime(start), endDateTime: toDateTime(end) };
}

function buildEvent(booking, bookingId, uid) {
  const range = computeRange(booking);
  if (!range) return null;
  // Особисті події адміна (bookings/personal/*) — це не урок водіння, тож
  // назва в Google Calendar має бути власною назвою події, без префіксу.
  const isPersonal = booking.type === "personal" || booking.status === "personal";
  const summary = isPersonal
    ? (booking.name || booking.studentName || "Особиста подія")
    : `Урок водіння — ${booking.studentName || "Учень"}`;
  return {
    summary,
    start: { dateTime: range.startDateTime, timeZone: CALENDAR_TIMEZONE },
    end: { dateTime: range.endDateTime, timeZone: CALENDAR_TIMEZONE },
    extendedProperties: {
      private: { appSource: "id4drive", bookingId, uid },
    },
  };
}

function isIgnorableCalendarError(err) {
  const status = err?.code ?? err?.response?.status;
  return status === 404 || status === 410;
}

function toKyivDateTimeParts(isoString) {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// Обернена до buildEvent: подія з Google Calendar → {date, time, startMin, durMin}.
// Повертає null для all-day подій (немає dateTime, тільки date).
function fromCalendarEvent(event) {
  const startIso = event?.start?.dateTime;
  const endIso = event?.end?.dateTime;
  if (!startIso || !endIso) return null;

  const { date, time } = toKyivDateTimeParts(startIso);
  const [h, m] = time.split(":").map(Number);
  const startMin = h * 60 + m;
  const durMin = Math.round((new Date(endIso) - new Date(startIso)) / 60000);

  return { date, time, startMin, durMin };
}

module.exports = {
  CALENDAR_SECRETS,
  getCalendarClient,
  buildEvent,
  getBookingSchedule,
  fromCalendarEvent,
  isIgnorableCalendarError,
};
