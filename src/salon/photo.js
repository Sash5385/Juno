// Фото салону й майстрів (Firebase Storage: salons/{salonId}/..., правила — storage.rules). Файл стискається в браузері
// (до 900 px по довшій стороні, JPEG) — зазвичай 80–200 КБ. Кожне завантаження — новий файл (унікальне ім'я, без проблем з кешем),
// старий прибирається. У демо-режимі Storage не чіпаємо: фото лишається локальним посиланням до закриття вкладки.
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase.js";
import { DEMO } from "../demo/demoMode.js";

const MAX_SIDE = 900;
const MAX_INPUT = 15 * 1024 * 1024;

export async function resizeImage(file, maxSide = MAX_SIDE, quality = 0.82) {
  if (!file || !/^image\//.test(file.type)) throw Object.assign(new Error("not_image"), { code: "not_image" });
  if (file.size > MAX_INPUT) throw Object.assign(new Error("too_big"), { code: "too_big" });
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // прозорий PNG → білий фон, а не чорний
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) throw Object.assign(new Error("encode_failed"), { code: "encode_failed" });
  return blob;
}

const pathOf = (url) => { try { return decodeURIComponent(new URL(url).pathname.split("/o/")[1] || ""); } catch { return ""; } };

// kind: "logo" | "master"; повертає URL нового фото. oldUrl (якщо є) видаляється після успішного завантаження.
export async function uploadSalonImage({ salonId, kind, masterId, file, oldUrl }) {
  const blob = await resizeImage(file);
  if (DEMO) return URL.createObjectURL(blob);
  const name = kind === "logo" ? `logo-${Date.now()}.jpg` : `masters/${masterId}-${Date.now()}.jpg`;
  const r = sRef(storage, `salons/${salonId}/${name}`);
  await uploadBytes(r, blob, { contentType: "image/jpeg", cacheControl: "public,max-age=31536000" });
  const url = await getDownloadURL(r);
  removeSalonImage(salonId, oldUrl);
  return url;
}

// Видаляє файл за його URL; лише в межах salons/{salonId}/, помилки ігноруються (файл міг уже зникнути)
export function removeSalonImage(salonId, url) {
  if (DEMO || !url) return Promise.resolve();
  const p = pathOf(url);
  if (!p.startsWith(`salons/${salonId}/`)) return Promise.resolve();
  return deleteObject(sRef(storage, p)).catch(() => {});
}
