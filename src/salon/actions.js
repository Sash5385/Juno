// Дії персоналу над записами та слотами (запис у RTDB; решту — слоти, сповіщення, повернення — робить сервер).
import { push, update, set, remove } from "firebase/database";
import { sref } from "./data.js";
import { callFn } from "./api.js";

const by = (ctx) => (ctx.role === "owner" ? "admin" : "master");

export async function createBooking(ctx, b) {
  const r = push(sref(ctx.salonId, "bookings"));
  const clean = Object.fromEntries(Object.entries({ ...b, id: r.key, createdBy: by(ctx), createdAt: Date.now() }).filter(([, v]) => v !== undefined && v !== ""));
  await set(r, clean);
  return r.key;
}
export const confirmBooking = (ctx, id) => update(sref(ctx.salonId, `bookings/${id}`), { status: "confirmed" });
export const completeBooking = (ctx, id) => update(sref(ctx.salonId, `bookings/${id}`), { status: "completed" });
export const cancelBooking = (ctx, id) => update(sref(ctx.salonId, `bookings/${id}`), { status: "cancelled", cancelledBy: by(ctx), cancelledAt: Date.now() });
export const markPaidOnSite = (ctx, b) => update(sref(ctx.salonId, `bookings/${b.id}`), { paymentStatus: "paid", paidAmount: Number(b.price) || 0, paidAt: Date.now(), paymentMethod: "onsite" });
export const moveBooking = (ctx, id, { date, time, masterId }) => update(sref(ctx.salonId, `bookings/${id}`), { date, time, masterId });
export const saveBookingNote = (ctx, id, staffNote) => update(sref(ctx.salonId, `bookings/${id}`), { staffNote: staffNote || null });
export const refundBooking = (id) => callFn("salonRefundBooking", { bookingId: id });

// Слоти: блокування/розблокування (розблокування запрошує першого з черги — salonOnAdminSlotOpened)
export const blockSlot = (ctx, masterId, date, slotId) => update(sref(ctx.salonId, `timeslots/${masterId}/${date}/${slotId}`), { available: false, adminBlocked: true });
export const unblockSlot = (ctx, masterId, date, slotId) => update(sref(ctx.salonId, `timeslots/${masterId}/${date}/${slotId}`), { available: true, adminBlocked: false });
export async function blockDay(ctx, masterId, date, daySlots) {
  const upd = {};
  for (const [id, s] of Object.entries(daySlots || {})) if (s && s.time && !s.phantom && s.available !== false) { upd[`timeslots/${masterId}/${date}/${id}/available`] = false; upd[`timeslots/${masterId}/${date}/${id}/adminBlocked`] = true; }
  if (Object.keys(upd).length) await update(sref(ctx.salonId, ""), upd);
  return Object.keys(upd).length / 2;
}
export async function unblockDay(ctx, masterId, date, daySlots) {
  const upd = {};
  for (const [id, s] of Object.entries(daySlots || {})) if (s && s.adminBlocked) { upd[`timeslots/${masterId}/${date}/${id}/available`] = true; upd[`timeslots/${masterId}/${date}/${id}/adminBlocked`] = false; }
  if (Object.keys(upd).length) await update(sref(ctx.salonId, ""), upd);
  return Object.keys(upd).length / 2;
}
export const removeNode = (ctx, path) => remove(sref(ctx.salonId, path));
