// Доступ до даних салону: підписки на RTDB, список записів за роллю, сітка слотів.
import { useEffect, useState } from "react";
import { ref, onValue, get, update, query, orderByChild, equalTo, startAt, endAt } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase.js";
import { DEMO, DEMO_VENDOR } from "../demo/demoMode.js";
import { salonPath } from "../salonPaths.js";
import { gridWrites, regridWrites, toYMD, normWorkHours } from "../salonLogic.js";

export const DEMO_SALON_ID = "demo-salon";
export const DEMO_SALON_USER = { uid: DEMO_SALON_ID, email: DEMO_VENDOR ? "sash5385@gmail.com" : "demo@juno.app", displayName: "Демо", isAnonymous: false };

export const sref = (salonId, path) => ref(db, salonPath(salonId, path));
export const rootRef = (path) => ref(db, path);
export const toList = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...(v && typeof v === "object" ? v : {}) }));

// Підписка на вузол: makeRef() → ref/query або null (тоді value = null). deps — як у useEffect
export function useValue(makeRef, deps) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key: null, value: undefined });
  useEffect(() => {
    const r = makeRef();
    if (!r) { queueMicrotask(() => setState({ key, value: null })); return undefined; }
    const unsub = onValue(r, (snap) => setState({ key, value: snap.val() }), () => setState({ key, value: null }));
    return () => { try { unsub(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Дані іншого ключа (інша дата/майстер) не показуємо: поки не прийшли нові — loading
  const fresh = state.key === key;
  return { value: fresh ? state.value : undefined, loading: !fresh };
}

export function useAuthUser() {
  const [user, setUser] = useState(DEMO ? DEMO_SALON_USER : undefined);
  useEffect(() => {
    if (DEMO) return undefined;
    const fallback = setTimeout(() => setUser((p) => (p === undefined ? null : p)), 3000);
    const unsub = onAuthStateChanged(auth, (u) => { clearTimeout(fallback); setUser(u || null); });
    return () => { clearTimeout(fallback); unsub(); };
  }, []);
  return user;
}

// Хто цей користувач: власник (є salons/{uid}/profile), майстер (master_memberships + перевірка masterAuth) або новий
export async function resolveSession(uid) {
  if (DEMO) return { status: "owner", salonId: DEMO_SALON_ID, masterId: null };
  if ((await get(sref(uid, "profile"))).exists()) return { status: "owner", salonId: uid, masterId: null };
  const mem = (await get(rootRef(`master_memberships/${uid}`))).val() || {};
  const wanted = (() => { try { return localStorage.getItem("salon_last"); } catch { return null; } })();
  const ids = Object.keys(mem).sort((a) => (a === wanted ? -1 : 1));
  for (const salonId of ids) {
    const bound = (await get(sref(salonId, `masterAuth/${uid}`)).catch(() => null))?.val();
    if (bound && bound === mem[salonId]) return { status: "master", salonId, masterId: bound };
  }
  return { status: "onboard", salonId: null, masterId: null };
}

// Записи за роллю. Власник: запит за діапазоном дат (або всі); майстер: лише свій masterId (так вимагають rules)
export function useBookings(ctx, from, to) {
  const { salonId, role, masterId } = ctx;
  const { value, loading } = useValue(() => {
    const base = sref(salonId, "bookings");
    if (role === "master") return query(base, orderByChild("masterId"), equalTo(masterId));
    if (from && to) return query(base, orderByChild("date"), startAt(from), endAt(to));
    return base;
  }, [salonId, role, masterId, from, to]);
  const list = toList(value).filter((b) => (!from || (b.date || "") >= from) && (!to || (b.date || "") <= to) && (role !== "master" || b.masterId === masterId));
  return { bookings: list, loading };
}

// Слоти дня для кількох майстрів: { masterId: {slotId: slot} }
export function useDaySlots(masterIds, salonId, date) {
  const [slots, setSlots] = useState({});
  const key = masterIds.join(",");
  useEffect(() => {
    const unsubs = masterIds.map((mid) => onValue(sref(salonId, `timeslots/${mid}/${date}`), (snap) => setSlots((s) => ({ ...s, [mid]: snap.val() || {} }))));
    return () => unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, salonId, date]);
  return slots;
}

// Сітка слотів на 45 днів уперед (лише відсутні слоти). Викликається при вході; повторно — не частіше разу на добу на пристрої
export async function ensureGrid({ salonId, masters, step }) {
  if (DEMO) return 0;
  const today = toYMD(new Date());
  const key = `salon_grid_${salonId}`;
  try { if (localStorage.getItem(key) === today) return 0; } catch { /* ignore */ }
  let written = 0;
  for (const m of masters) {
    const existing = (await get(sref(salonId, `timeslots/${m.id}`))).val() || {};
    const w = gridWrites({ masterId: m.id, workHours: normWorkHours(m.profile?.workHours), step, startYmd: today, days: 45, existing });
    const keys = Object.keys(w);
    for (let i = 0; i < keys.length; i += 400) {
      await update(sref(salonId, ""), Object.fromEntries(keys.slice(i, i + 400).map((k) => [k, w[k]])));
    }
    written += keys.length;
  }
  try { localStorage.setItem(key, today); } catch { /* ignore */ }
  return written;
}
export const resetGridMark = (salonId) => { try { localStorage.removeItem(`salon_grid_${salonId}`); } catch { /* ignore */ } };

// Перебудова сітки майстра після зміни годин/кроку (вільні зайві слоти прибираються, відсутні додаються)
export async function regridMaster({ salonId, master, step }) {
  if (DEMO) return 0;
  const existing = (await get(sref(salonId, `timeslots/${master.id}`))).val() || {};
  const w = regridWrites({ masterId: master.id, workHours: normWorkHours(master.profile?.workHours), step, startYmd: toYMD(new Date()), days: 45, existing });
  const keys = Object.keys(w);
  for (let i = 0; i < keys.length; i += 400) await update(sref(salonId, ""), Object.fromEntries(keys.slice(i, i + 400).map((k) => [k, w[k]])));
  return keys.length;
}
