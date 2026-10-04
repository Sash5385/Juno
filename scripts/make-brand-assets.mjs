// Нарізає з макета бренду (assets/brand/juno-brand-source.jpg: ліворуч логотип, праворуч іконка) усі PNG для обох застосунків.
//   node scripts/make-brand-assets.mjs [макет.jpg] [шлях/до/Juno-client]
// Потрібен playwright (tests/smoke) і Chromium. Координати — для поточного макета 1024×559; для нового макета змініть TILE і LOGO.
// Якщо макет буде більшим (рекомендовано ≥1024 px по іконці) — картинки вийдуть різкішими.
import { chromium } from "../tests/smoke/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.resolve(process.argv[2] || path.join(ROOT, "assets/brand/juno-brand-source.jpg"));
const CLIENT = path.resolve(process.argv[3] || path.join(ROOT, "../juno-client"));
const TILE = { x: 636, y: 146, w: 258, h: 268, r: 38 };     // плитка іконки в макеті (з заокругленням)
const LOGO = { x: 146, y: 56, w: 348, h: 448 };               // логотип з підписом на білому тлі

const b64 = fs.readFileSync(SRC).toString("base64");
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await page.setContent("<canvas id=c></canvas>");
const out = await page.evaluate(async ({ b64, TILE, LOGO }) => {
  const img = new Image(); img.src = "data:image/jpeg;base64," + b64; await img.decode();
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; return [c, g]; };
  const png = (c) => c.toDataURL("image/png").split(",")[1];
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const res = {};

  // «any»: плитка із заокругленням на прозорому тлі (квадратне полотно по більшій стороні)
  const side = Math.max(TILE.w, TILE.h);
  const any = (n) => { const [c, g] = mk(n, n); const k = n / side; const ox = (side - TILE.w) / 2, oy = (side - TILE.h) / 2;
    g.save(); rr(g, (ox + 3) * k, (oy + 3) * k, (TILE.w - 6) * k, (TILE.h - 7) * k, (TILE.r - 2) * k); g.clip();
    g.drawImage(img, TILE.x, TILE.y, TILE.w, TILE.h, ox * k, oy * k, TILE.w * k, TILE.h * k); g.restore(); return png(c); };
  res.any512 = any(512); res.any192 = any(192); res.any64 = any(64);

  // непрозорий квадрат всередині плитки (без кутів): для apple-touch-icon; ширина обмежена меншою стороною мінус відступ під заокруглення
  const inset = Math.ceil(TILE.r * 0.3) + 3, sq = Math.min(TILE.w, TILE.h) - inset * 2;
  const cx = TILE.x + TILE.w / 2, cy = TILE.y + TILE.h / 2, sx = cx - sq / 2, sy = cy - sq / 2;
  const opaque = (n) => { const [c, g] = mk(n, n); g.drawImage(img, sx, sy, sq, sq, 0, 0, n, n); return [c, g]; };
  res.apple180 = png(opaque(180)[0]);

  // maskable: розмите тло з самої плитки + іконка по центру з розмитим краєм (без шва); безпечна зона Android — 80% діаметра
  { const n = 512, [c, g] = mk(n, n);
    g.filter = "blur(28px)"; g.drawImage(img, sx, sy, sq, sq, -40, -40, n + 80, n + 80); g.filter = "none";
    const m = Math.round(n * 0.86), [t, tg] = mk(m, m); tg.drawImage(img, sx, sy, sq, sq, 0, 0, m, m);
    const gr = tg.createRadialGradient(m / 2, m / 2, m * 0.30, m / 2, m / 2, m * 0.5); gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    tg.globalCompositeOperation = "destination-in"; tg.fillStyle = gr; tg.fillRect(0, 0, m, m);
    g.drawImage(t, (n - m) / 2, (n - m) / 2); res.maskable512 = png(c); }

  // логотип із розмитими краями (альфа): тло макета трохи кремове, без цього на білому видно прямокутник
  const feathered = (k) => { const w = LOGO.w * k, h = LOGO.h * k, f = 26 * k; const [c, g] = mk(w, h); g.drawImage(img, LOGO.x, LOGO.y, LOGO.w, LOGO.h, 0, 0, w, h);
    const [m, mg] = mk(w, h); const hx = mg.createLinearGradient(0, 0, w, 0); const e = f / w;
    hx.addColorStop(0, "rgba(0,0,0,0)"); hx.addColorStop(e, "rgba(0,0,0,1)"); hx.addColorStop(1 - e, "rgba(0,0,0,1)"); hx.addColorStop(1, "rgba(0,0,0,0)"); mg.fillStyle = hx; mg.fillRect(0, 0, w, h);
    const [m2, m2g] = mk(w, h); const vy = m2g.createLinearGradient(0, 0, 0, h); const ev = f / h;
    vy.addColorStop(0, "rgba(0,0,0,0)"); vy.addColorStop(ev, "rgba(0,0,0,1)"); vy.addColorStop(1 - ev, "rgba(0,0,0,1)"); vy.addColorStop(1, "rgba(0,0,0,0)"); m2g.fillStyle = vy; m2g.fillRect(0, 0, w, h);
    mg.globalCompositeOperation = "destination-in"; mg.drawImage(m2, 0, 0);          // маска = X-градієнт × Y-градієнт
    g.globalCompositeOperation = "destination-in"; g.drawImage(m, 0, 0); return c; };
  res.logo = png(feathered(2));

  // превʼю для посилань 1200×630: логотип на білому, м'яке пастельне світіння
  { const [c, g] = mk(1200, 630); g.fillStyle = "#fff"; g.fillRect(0, 0, 1200, 630);
    const gr = g.createRadialGradient(600, 315, 40, 600, 315, 640); gr.addColorStop(0, "rgba(200,180,255,0.18)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 1200, 630);
    const lc = feathered(2), h = 560, w = h * LOGO.w / LOGO.h; g.drawImage(lc, 600 - w / 2, 35, w, h); res.og = png(c); }
  return res;
}, { b64, TILE, LOGO });
await browser.close();

const w = (file, key) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(out[key], "base64")); console.log("→", path.relative(process.cwd(), file)); };
for (const dir of [path.join(ROOT, "public"), path.join(CLIENT, "public")]) {
  w(path.join(dir, "icon-512.png"), "any512"); w(path.join(dir, "icon-192.png"), "any192");
  w(path.join(dir, "icon-maskable-512.png"), "maskable512"); w(path.join(dir, "apple-touch-icon.png"), "apple180"); w(path.join(dir, "favicon-64.png"), "any64");
}
w(path.join(ROOT, "public/juno-logo.png"), "logo");
w(path.join(ROOT, "landing/img/icon-192.png"), "any192"); w(path.join(ROOT, "landing/img/favicon-64.png"), "any64");
w(path.join(ROOT, "landing/img/juno-logo.png"), "logo"); w(path.join(ROOT, "landing/img/og-image.png"), "og");
