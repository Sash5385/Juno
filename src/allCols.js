// Скільки майстрів на екрані в огляді «Усі» (1–5): спільний стан для верхньої панелі (TopBar) і AllMastersView.
// Зберігається на пристрої; зміна розсилається подією, щоб обидва місця оновились одразу.
import { useState, useEffect } from "react";

const KEY = "allMastersCols", EV = "juno:allCols";
export const readAllCols = () => { try { const n = parseInt(localStorage.getItem(KEY), 10); return n >= 1 && n <= 5 ? n : null; } catch { return null; } };
export function setAllCols(n) {
  try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EV, { detail: n }));
}
export function useAllCols() {
  const [v, setV] = useState(readAllCols);
  useEffect(() => { const h = (e) => setV(e.detail); window.addEventListener(EV, h); return () => window.removeEventListener(EV, h); }, []);
  return v;
}
// Фактична кількість колонок: вибір користувача, інакше телефон — 1, ширший екран — «N діб» з налаштувань
export const allColsEffective = (pick, staffCount, daysShown, phone) => Math.max(1, Math.min(staffCount, pick || (phone ? 1 : (Number(daysShown) || 5))));
