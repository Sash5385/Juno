// Смоук-тест у демо-режимі (?demo=1, без Firebase): відкриває застосунок, проходить усі вкладки
// на вузькому екрані 320px і падає, якщо є помилка JS, порожній екран або горизонтальний скрол.
// Запуск: node tests/smoke/smoke.mjs <admin|client> [BASE_URL]   (потрібен запущений vite preview)
import { chromium } from "playwright";

const kind = process.argv[2];
const base = (process.argv[3] || "http://localhost:4173").replace(/\/$/, "");
const TABS = {
  admin: ["Записи", "Журнал", "Клієнти", "Черга", "Послуги", "Чати", "Шаблони", "Статист", "Налашт"],
  client: ["Записи", "Черга", "Чат", "Події"],
};
if (!TABS[kind]) { console.error("usage: smoke.mjs <admin|client> [BASE_URL]"); process.exit(2); }

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await (await browser.newContext({ viewport: { width: 320, height: 640 }, serviceWorkers: "block" })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !/net::ERR_|Failed to load resource/.test(t)) errors.push(`console.error: ${t.slice(0, 200)}`);
});

let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  " + info}`); };
const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const textLen = () => page.evaluate(() => document.body.innerText.trim().length);

await page.goto(`${base}/?demo=1&lang=uk`);
await page.waitForTimeout(2500);
check("home renders", (await textLen()) > 50, `body text ${await textLen()}`);
check("home fits 320px", await noOverflow());

if (kind === "admin") {
  // кнопка «?» над розкладом відкриває довідник по значках
  const help = page.getByLabel("Підказки по розкладу");
  check("help button «?» exists", (await help.count()) > 0);
  if ((await help.count()) > 0) {
    await help.click(); await page.waitForTimeout(500);
    check("help sheet opens with legend", (await page.getByText("Підказки по розкладу").count()) >= 1 && (await page.getByText("Шапка дня").count()) > 0);
    check("help sheet fits 320px", await noOverflow());
    await page.getByLabel("Закрити").click(); await page.waitForTimeout(300);
    check("help sheet closes", (await page.getByText("Шапка дня").count()) === 0);
  }
}

for (const tab of TABS[kind]) {
  // у навбарі адмінки підписи сховані (стиль «Плитки») — шукаємо за aria-label або за текстом кнопки
  let btn = page.locator(`#app-bottomnav button[aria-label="${tab}"], button[aria-label="${tab}"], button:has-text("${tab}")`).last();
  let found = (await btn.count()) > 0;
  // телефон: другорядні вкладки адмінки — у шторці «Ще»
  if (!found && kind === "admin") {
    const more = page.locator('#app-bottomnav button[aria-label="Ще"]');
    if (await more.count()) {
      await more.click(); await page.waitForTimeout(400);
      btn = page.locator(`#app-bottomnav [role="dialog"] button:has-text("${tab}")`).first();
      found = (await btn.count()) > 0;
    }
  }
  check(`tab «${tab}» exists`, found);
  if (!found) continue;
  await btn.click();
  await page.waitForTimeout(700);
  check(`tab «${tab}» renders`, (await textLen()) > 30);
  check(`tab «${tab}» fits 320px`, await noOverflow());
}

if (kind === "admin") {
  // кнопка «+» у нижньому меню відкриває форму нового запису
  const plus = page.locator('#app-bottomnav button[aria-label="Новий запис"]');
  check("«+» new booking button exists", (await plus.count()) > 0);
  if (await plus.count()) {
    await plus.click(); await page.waitForTimeout(1500);
    check("«+» opens booking form", (await page.getByText("КЛІЄНТ").count() + await page.getByText("Клієнт").count()) > 0);
    check("booking form fits 320px", await noOverflow());
  }
}

if (kind === "admin") {
  const lum = (c) => { const m = (c || "").match(/[\d.]+/g)?.map(Number) || [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  await page.goto(`${base}/?demo=1&lang=uk`); await page.waitForTimeout(2000);
  // 1. нижнє меню: рівно 5 кнопок, кожна ≥ 32px заввишки
  const navInfo = await page.evaluate(() => [...document.querySelectorAll("#app-bottomnav > * button, #app-bottomnav button")]
    .filter((b) => !b.closest('[role="dialog"]')).map((b) => ({ l: b.getAttribute("aria-label") || b.innerText.trim(), h: b.getBoundingClientRect().height })));
  check("bottomnav has 5 buttons", navInfo.length === 5, JSON.stringify(navInfo));
  const navTxt = navInfo.map((b) => b.l).join("|");
  check("bottomnav buttons are Записи/Клієнти/+/Чати/Ще", ["Записи", "Клієнти", "Новий запис", "Чати", "Ще"].every((t) => navTxt.includes(t)), navTxt);
  check("bottomnav buttons ≥32px tall", navInfo.every((b) => b.h >= 32), JSON.stringify(navInfo));
  // 2. шторка «Ще»
  await page.locator('#app-bottomnav button[aria-label="Ще"]').click(); await page.waitForTimeout(400);
  const dlg = page.locator('#app-bottomnav [role="dialog"]');
  check("«Ще» sheet opens", (await dlg.count()) > 0);
  if (await dlg.count()) {
    const t = await dlg.first().innerText();
    for (const w of ["Журнал", "Черга", "Послуги", "Шаблони", "Статист", "Налашт"]) check(`«Ще» sheet has ${w}`, t.includes(w), t);
    await page.mouse.click(160, 40); await page.waitForTimeout(500);
    check("«Ще» sheet closes on backdrop click", (await dlg.count()) === 0 || !(await dlg.first().isVisible()));
  }
  // 3. кнопки днів у шапці календаря
  await page.locator('#app-bottomnav button[aria-label="Записи"], #app-bottomnav button:has-text("Записи")').first().click().catch(() => {});
  await page.waitForTimeout(500);
  // Кнопка «Показати ▾» відкриває вибір 1,2,3,5,7 днів
  const pickDays = async () => { await page.locator('[data-help="days"]').first().click(); await page.waitForTimeout(300); };
  await pickDays();
  const opts = page.locator('button').filter({ hasText: /^(1|2|3|5|7)$/ });
  const dl = (await opts.allInnerTexts()).map((x) => x.trim());
  check("day options are 1,2,3,5,7", dl.join(",") === "1,2,3,5,7", dl.join(","));
  if (dl.includes("1")) {
    await opts.filter({ hasText: /^1$/ }).first().click(); await page.waitForTimeout(500);
    check("day «1» fits 320px", await noOverflow());
    await pickDays();
    await page.locator('button').filter({ hasText: /^3$/ }).first().click(); await page.waitForTimeout(500);
    check("day «3» fits 320px", await noOverflow());
  }
  // 4. список клієнтів: нейтральна картка + аватар з ініціалами
  await page.locator('#app-bottomnav button[aria-label="Клієнти"], #app-bottomnav button:has-text("Клієнти")').first().click(); await page.waitForTimeout(800);
  const card = await page.evaluate(() => {
    const cands = [...document.querySelectorAll("main *, #root *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 150 && r.height > 36 && r.height < 160 && e.querySelector("img, [class*=avatar], [class*=Avatar]") !== null || false; });
    const el = cands[0]; if (!el) return null;
    const cs = getComputedStyle(el); const m = cs.backgroundColor.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
    const sat = Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]);
    return { bg: cs.backgroundColor, sat };
  });
  check("clients: first card neutral background", !card || card.sat < 60 || /rgba?\(255, 255, 255/.test(card.bg), JSON.stringify(card));
  const initials = await page.evaluate(() => [...document.querySelectorAll("span,div")].some((e) => { if (e.children.length || !/^\p{Lu}{1,2}$/u.test(e.textContent.trim())) return false; const r = (e.parentElement || e).getBoundingClientRect(); return r.width >= 24 && r.width <= 80 && Math.abs(r.width - r.height) < 4; }));
  check("clients: initials avatar present", initials);
  // 5. світла тема прибрана
  await page.goto(`${base}/?demo=1&theme=light&lang=uk`); await page.waitForTimeout(2000);
  const bgs = await page.evaluate(() => [document.body, document.documentElement, document.getElementById("root")].filter(Boolean).map((e) => getComputedStyle(e).backgroundColor));
  const solid = bgs.filter((c) => !/rgba\(0, 0, 0, 0\)|transparent/.test(c));
  check("theme=light stays dark", solid.length > 0 && solid.every((c) => lum(c) < 0.3), bgs.join(" | "));
  const more2 = page.locator('#app-bottomnav button[aria-label="Ще"]');
  await more2.click(); await page.waitForTimeout(400);
  await page.locator('#app-bottomnav [role="dialog"] button:has-text("Налашт")').first().click(); await page.waitForTimeout(800);
  const body = await page.evaluate(() => document.body.innerText);
  check("settings has no Темна/Світла theme switch", !/Темна|Світла/.test(body));
}

check("no JS errors", errors.length === 0, "\n    " + errors.join("\n    "));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nSMOKE OK");
process.exit(fails ? 1 : 0);
