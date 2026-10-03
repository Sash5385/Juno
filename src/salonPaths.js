// Шляхи RTDB для салону. Чисті функції без Firebase — однаковий файл у Juno і Juno-client.
// Схема і ролі: docs/SALON-SCHEMA.md. salonId = uid власника салону.
const need = (v, name) => { if (!v) throw new Error(`salonPaths: ${name} is required`); return v; };
const join = (base, path) => (path ? `${base}/${path}` : base);

export const salonPath = (salonId, path) => join(`salons/${need(salonId, "salonId")}`, path);

// Вузли салону
export const salonProfile = (salonId) => salonPath(salonId, "profile");
export const salonServices = (salonId, serviceId) => salonPath(salonId, serviceId ? `services/${serviceId}` : "services");
export const salonBookings = (salonId, bookingId) => salonPath(salonId, bookingId ? `bookings/${bookingId}` : "bookings");
export const salonUser = (salonId, uid) => salonPath(salonId, `users/${need(uid, "uid")}`);

// Майстри: публічний профіль, слоти ПЕР МАЙСТЕР, черга пер майстер, приватні налаштування
export const masterProfile = (salonId, masterId) => salonPath(salonId, `masters/${need(masterId, "masterId")}/profile`);
export const masterSlots = (salonId, masterId, date) => salonPath(salonId, `timeslots/${need(masterId, "masterId")}${date ? `/${date}` : ""}`);
export const masterQueue = (salonId, masterId, slotKey) => salonPath(salonId, `queue/${need(masterId, "masterId")}${slotKey ? `/${slotKey}` : ""}`);
export const masterChat = (salonId, masterId, clientUid) => salonPath(salonId, `masterChats/${need(masterId, "masterId")}/${need(clientUid, "clientUid")}`);
export const masterChatMeta = (salonId, masterId, clientUid) => salonPath(salonId, `masterChatMeta/${need(masterId, "masterId")}/${need(clientUid, "clientUid")}`);
export const masterSettings = (salonId, masterId) => salonPath(salonId, `masterSettings/${need(masterId, "masterId")}`);
// masterId залогіненого майстра (null, якщо це не майстер)
export const masterAuthPath = (salonId, uid) => salonPath(salonId, `masterAuth/${need(uid, "uid")}`);

// Публічний вхід: slug → salonId
export const salonSlugPath = (slug) => `salon_slugs/${need(slug, "slug")}`;
