// Та сама логіка, що й findOfflineDuplicates у functions/index.js: картка учня,
// заведена вручну (без .profile), і зареєстрований учень — одна людина, якщо
// збігаються телефон (останні 9 цифр), пошта або ім'я+прізвище (порядок слів неважливий).
const digits = (p) => String(p || "").replace(/\D/g, "");
const phoneTail = (p) => { const d = digits(p); return d.length >= 9 ? d.slice(-9) : ""; };
const normEmail = (e) => String(e || "").trim().toLowerCase();
const normName = (n) => String(n || "").toLowerCase().replace(/[ʼ’`]/g, "'").split(/\s+/).filter(Boolean).sort().join(" ");

export function findOfflineDuplicates(usersVal, uid, person) {
  const ph = phoneTail(person?.phone), em = normEmail(person?.email), nm = normName(person?.name);
  const strong = [], byName = [];
  Object.entries(usersVal || {}).forEach(([key, u]) => {
    if (key === uid || !u || typeof u !== "object" || u.profile) return;
    if ((ph && phoneTail(u.phone) === ph) || (em && normEmail(u.email) === em)) strong.push(key);
    else if (nm.includes(" ") && normName(u.name) === nm && !(ph && phoneTail(u.phone))) byName.push(key);
  });
  return byName.length === 1 ? [...strong, byName[0]] : strong;
}

// Кількість карток-дублікатів, які можна об'єднати із зареєстрованими учнями.
export function countStudentDuplicates(usersVal) {
  const keys = new Set();
  Object.entries(usersVal || {}).forEach(([uid, u]) => {
    if (u?.profile) findOfflineDuplicates(usersVal, uid, u.profile).forEach(k => keys.add(k));
  });
  return keys.size;
}

// Учні, які вже є в списку і, схоже, та сама людина (телефон, пошта або ім'я+прізвище) —
// для попередження, коли інструктор заводить нову картку вручну. Повертає імена.
export function findSameStudents(usersVal, person) {
  const ph = phoneTail(person?.phone), em = normEmail(person?.email), nm = normName(person?.name);
  const out = [];
  Object.values(usersVal || {}).forEach((u) => {
    if (!u || typeof u !== "object") return;
    const p = u.profile || u;
    const samePhone = ph && phoneTail(p.phone || u.phone) === ph;
    const sameEmail = em && normEmail(p.email || u.email) === em;
    const sameName = nm.includes(" ") && normName(p.name || u.name) === nm;
    if (samePhone || sameEmail || sameName) out.push(p.name || u.name || "учень");
  });
  return out;
}
