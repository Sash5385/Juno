// Масштаб інтерфейсу адмінки: Мін / Середній / Макс (CSS zoom вмісту розділів,
// крім розкладу — у нього свій масштаб годин/днів). Зберігається в браузері.
export const UI_SCALES = [
  { id: "s", name: "Мін",      zoom: 0.9 },
  { id: "m", name: "Середній", zoom: 1 },
  { id: "l", name: "Макс",     zoom: 1.15 },
];
const KEY = "uiScale";
export const UI_SCALE_EVENT = "dp-scale";
export function readUiScale() {
  try {
    const v = localStorage.getItem(KEY);
    return UI_SCALES.some(x => x.id === v) ? v : "m";
  } catch { return "m"; }
}
export function uiScaleZoom(id) {
  return UI_SCALES.find(x => x.id === id)?.zoom || 1;
}
export function setUiScale(id) {
  try { localStorage.setItem(KEY, id); } catch { /* сховище недоступне */ }
  window.dispatchEvent(new CustomEvent(UI_SCALE_EVENT, { detail: id }));
}
