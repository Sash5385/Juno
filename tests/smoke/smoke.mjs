// Смоук-тест у демо-режимі (?demo=1, без Firebase): відкриває застосунок, проходить усі вкладки
// на вузькому екрані 320px і падає, якщо є помилка JS, порожній екран або горизонтальний скрол.
// Запуск: node tests/smoke/smoke.mjs <admin|client> [BASE_URL]   (потрібен запущений vite preview)
import { chromium } from "playwright";

const kind = process.argv[2];
const base = (process.argv[3] || "http://localhost:4173").replace(/\/$/, "");
const TABS = {
  admin: ["Записи", "Журнал", "Учні", "Черга", "Послуги", "Чати", "Шаблони", "Статист.", "Налашт."],
  client: ["Записи", "Черга", "Чат", "Сповіщення"],
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

await page.goto(`${base}/?demo=1`);
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
  const btn = page.locator("button", { hasText: tab }).last();
  const found = (await btn.count()) > 0;
  check(`tab «${tab}» exists`, found);
  if (!found) continue;
  await btn.click();
  await page.waitForTimeout(700);
  check(`tab «${tab}» renders`, (await textLen()) > 30);
  check(`tab «${tab}» fits 320px`, await noOverflow());
}

check("no JS errors", errors.length === 0, "\n    " + errors.join("\n    "));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nSMOKE OK");
process.exit(fails ? 1 : 0);
