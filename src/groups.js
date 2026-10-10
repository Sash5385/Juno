// Групові записи: послуга з capacity > 1 — на один час записуються кілька клієнтів (поки є місця).
//  • Місця тримає вузол groupSeats/{date}/{HHMM} = { serviceId, capacity, count, seats: { bookingId: uid } }.
//    Клієнт займає місце транзакцією (db.js joinGroupSeat) і одразу створює запис; звільняє місця й слоти сервер
//    (functions: ensureGroupSeat / removeGroupSeat) — слоти розкладу лишаються зайняті, доки в групі є хоч один учасник.
//  • У записі: groupKey = `${date}_${HHMM}`, groupCap = місткість на момент запису.
// Файл однаковий в адмінці й клієнті (src/groups.js) — змінюєте один, копіюйте в інший.

export const MAX_CAPACITY = 30;

export const capacityOf = (service) => Math.max(1, Math.min(MAX_CAPACITY, Math.round(Number(service?.capacity)) || 1));
export const isGroupService = (service) => capacityOf(service) > 1;

export const seatTimeKey = (time) => String(time || "").replace(":", "");          // "10:00" → "1000"
export const groupKeyOf = (date, time) => `${date}_${seatTimeKey(time)}`;
export const seatPath = (date, time) => `groupSeats/${date}/${seatTimeKey(time)}`;

// Скільки місць лишилось у групі за вузлом (null — групи ще немає)
export const seatsLeft = (node) => (node ? Math.max(0, (Number(node.capacity) || 0) - (Number(node.count) || 0)) : null);

// Чи можна приєднатись до наявної групи цієї послуги
export const canJoinGroup = (node, serviceId) => !!node && node.serviceId === serviceId && seatsLeft(node) > 0;

const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? "місце" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "місця" : "місць"));
export const seatsLabel = (left) => `${left} ${plural(left)}`;
