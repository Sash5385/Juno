// Єдині правила блокування / звільнення timeslots під запис (серверна копія
// src/slotRules.js — логіку тримати ідентичною).
//  - блокування: позиція, якої не існувало в сітці дня, створюється лише під
//    запис і одразу позначається phantom:true;
//  - звільнення: phantom видаляємо; справжню (існувала) повертаємо вільною з
//    усіма її власними полями (durMin тощо); позицію, якої вже немає в дні, НЕ
//    створюємо — інакше повторне звільнення (клієнт + функція) воскрешало б
//    видалені phantom-и як окремі 30-хв слоти.
// Обидві функції ідемпотентні.
const pad2 = (n) => String(n).padStart(2, "0");
const slotIdAt = (min) => `slot${pad2(Math.floor(min / 60))}${pad2(min % 60)}`;
const slotTimeAt = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
const slotExists = (node) =>
  !!node && typeof node === "object" && (node.available !== undefined || !!node.time);

function blockRangeUpdates(day, prefix, startMin, durMin, opts = {}) {
  const { bookingStart = false, step = 30 } = opts;
  const upd = {};
  for (let i = 0; i < durMin; i += step) {
    const min = startMin + i;
    const id = slotIdAt(min);
    if (!slotExists(day && day[id])) upd[`${prefix}${id}/phantom`] = true;
    upd[`${prefix}${id}/available`] = false;
    upd[`${prefix}${id}/time`] = slotTimeAt(min);
    if (bookingStart) upd[`${prefix}${id}/bookingStart`] = i === 0;
  }
  return upd;
}

function restoreRangeUpdates(day, prefix, startMin, durMin, opts = {}) {
  const { step = 30, skipIds = null } = opts;
  const upd = {};
  for (let i = 0; i < durMin; i += step) {
    const min = startMin + i;
    const id = slotIdAt(min);
    if (skipIds && skipIds.has(id)) continue;
    const node = day && day[id];
    if (!slotExists(node)) continue;
    if (node.phantom) {
      upd[`${prefix}${id}`] = null;
      continue;
    }
    upd[`${prefix}${id}/available`] = true;
    upd[`${prefix}${id}/time`] = slotTimeAt(min);
    upd[`${prefix}${id}/phantom`] = null;
    upd[`${prefix}${id}/bookingStart`] = null;
  }
  return upd;
}

function rangeSlotIds(startMin, durMin, step = 30) {
  const ids = new Set();
  for (let i = 0; i < durMin; i += step) ids.add(slotIdAt(startMin + i));
  return ids;
}

module.exports = { slotIdAt, slotTimeAt, slotExists, blockRangeUpdates, restoreRangeUpdates, rangeSlotIds };
