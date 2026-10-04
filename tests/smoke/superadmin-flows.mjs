// Екран суперадміна в демо-режимі від імені власника платформи (?demo=1&vendor=1), екран 320px.
// Запуск: node tests/smoke/superadmin-flows.mjs [BASE_URL]   (потрібен запущений vite preview)
import { chromium } from "playwright";
const base = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await (await browser.newContext({ viewport: { width: 320, height: 640 }, serviceWorkers: "block" })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text().slice(0, 200)}`); });
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  " + info}`); };
const has = async (text, timeout = 2500) => { try { await page.getByText(text, { exact: false }).first().waitFor({ timeout }); return true; } catch { return false; } };
const btn = (t) => page.locator("button", { hasText: t }).first();
const chip = (t) => page.locator("button", { hasText: new RegExp(`^${t}$`) }).first();
const countIs = async (sel, n, timeout = 2500) => { try { await page.waitForFunction(([q, k]) => document.querySelectorAll(q).length === k, [sel, n], { timeout }); return true; } catch { return false; } };
const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// не суперадмін: вкладки «Адмін» немає
await page.goto(`${base}/?demo=1&vendor=0`);
await page.waitForTimeout(1500);
check("regular owner has no «Адмін» tab", (await page.locator("nav button", { hasText: "Адмін" }).count()) === 0);

await page.goto(`${base}/?demo=1&vendor=1`);
await page.waitForTimeout(1500);
await page.locator("nav button", { hasText: "Адмін" }).click();
console.log("── салони");
check("summary: 5 salons, 2 paid, 2 trial, 1 problematic, ≈598 ₴", await has("Салонів") && await page.locator('[data-testid="sa-summary"]').innerText().then((t) => /Салонів\s*5/.test(t) && /Платних\s*2/.test(t) && /Пробних\s*2/.test(t) && /Проблемних\s*1/.test(t) && /598 ₴/.test(t)));
check("five salon cards", await countIs('[data-testid="sa-salon"]', 5));
check("fits 320px", await noOverflow());
await chip("Платні").click();
check("filter «Платні» keeps 2", await countIs('[data-testid="sa-salon"]', 2));
await chip("Усі").click();
await page.getByPlaceholder("Пошук: назва або посилання").fill("old");
check("search finds Old Salon (suspended)", await countIs('[data-testid="sa-salon"]', 1) && await has("Призупинено"));
await page.locator('[data-testid="sa-salon"]').first().click();
check("salon sheet: license form and payments block", await has("Підписка до") && await has("Платежі підписки (0)"));
await page.locator("select").first().selectOption("active");
await btn("+30 дн.").click();
await btn("Зберегти").click();
check("license saved (toast)", await has("Підписку збережено"));
check("salon is now «Активна»", await has("Активна"));
await page.getByPlaceholder("Пошук: назва або посилання").fill("barber");
await page.locator('[data-testid="sa-salon"]').first().click();
check("payments history of a salon (paid / failed)", await has("Платежі підписки (3)") && await has("оплачено") && await has("failure"));
await btn("Закрити").click();

console.log("── тарифи");
await page.locator("nav button", { hasText: "Адмін" }).click();
await chip("Тарифи").click();
check("four default tiers, defaults label", await countIs('[data-testid="sa-tier"]', 4) && await has("Діють типові тарифи"));
const price = (i) => page.locator('[data-testid="sa-tier"]').nth(i).locator("input").nth(3);
await price(0).fill("0.5");
await btn("Зберегти тарифи").click();
check("price below 1 ₴ is rejected with a reason", await has("ціна від 1"));
await price(0).fill("199"); await price(2).fill("300");
await btn("Зберегти тарифи").click();
check("a bigger tier must cost more", await has("має бути дорожчим"));
await price(2).fill("749");
await btn("Зберегти тарифи").click();
check("valid tariffs saved, now custom", await has("Тарифи збережено") && await has("Діють власні тарифи"));
await btn("Типові").click();
check("reset to defaults", await has("Повернуто типові тарифи") && await has("Діють типові тарифи"));
check("fits 320px", await noOverflow());

console.log("── система");
await chip("Система").click().catch(async () => { await page.locator("button", { hasText: /^Система/ }).first().click(); });
check("backup status line", await has("за розкладом") && await has("салонів: 5"));
await btn("Зробити копію зараз").click();
check("manual backup started (toast)", await has("Копію запущено"));
check("three contact messages, two new", await countIs('[data-testid="sa-message"]', 3) && await has("Скільки коштує для салону"));
await btn("Опрацьовано").click();
check("message can be marked as done", await has("Повернути в нові"));
await btn("Видалити").click();
check("message can be deleted", await countIs('[data-testid="sa-message"]', 2));
await page.getByText("Помилки застосунків", { exact: true }).first().click();
check("error log: two groups with counters", await countIs('[data-testid="sa-error"]', 2) && await has("×7"));
await btn("Очистити журнал").click();
check("error log cleared", await has("Помилок немає"));
check("fits 320px", await noOverflow());

check("no JS errors", errors.length === 0, "\n    " + errors.join("\n    "));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nSUPERADMIN FLOWS OK");
process.exit(fails ? 1 : 0);
