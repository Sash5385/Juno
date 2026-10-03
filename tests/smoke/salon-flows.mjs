// Сценарії адмінки салону в демо-режимі (?app=salon&demo=1, пам'ять замість Firebase): записи, послуги, майстри, чат, налаштування.
// Запуск: node tests/smoke/salon-flows.mjs [BASE_URL]   (потрібен запущений vite preview)
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
const gone = async (text, timeout = 2500) => { try { await page.getByText(text, { exact: false }).first().waitFor({ state: "detached", timeout }); return true; } catch { return false; } };
const tab = (t) => page.locator("button", { hasText: t }).last().click();
const btn = (t) => page.locator("button", { hasText: t }).first();
const back = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(300); };

await page.goto(`${base}/?demo=1&app=salon`);
await page.waitForTimeout(2000);

console.log("── календар і запис");
check("calendar shows today's bookings", await has("Олена Коваль") && await has("Ірина Шевченко"));
check("personal event shown", await has("Обід"));
await page.getByText("Ірина Шевченко").first().click();
check("booking sheet opens (pending, online)", await has("Очікує") && await has("онлайн"));
await btn("Підтвердити").click();
check("confirming closes sheet and updates card", await gone("Нотатка для себе") && await has("Підтверджено"));
await page.getByText("Олена Коваль").first().click();
await btn("Скасувати").last().click();
check("cancel asks for confirmation", await has("Скасувати запис?"));
await page.locator("button", { hasText: "Скасувати запис" }).last().click();
check("cancelled booking is marked", await has("Скасовано"));

console.log("── новий запис");
await btn("＋ Запис").click();
check("new booking sheet", await has("Майстер і послуга"));
await page.locator("select").nth(1).selectOption({ label: "Манікюр з покриттям · 700 ₴ · 90 хв" });
const tmr = new Date(Date.now() + 86400000), pad = (n) => String(n).padStart(2, "0");
await page.locator('.modal-sheet-in input[type="date"]').fill(`${tmr.getFullYear()}-${pad(tmr.getMonth() + 1)}-${pad(tmr.getDate())}`); // завтра: не залежить від поточного часу доби
const chips = page.locator(".modal-sheet-in").locator("button", { hasText: /^\d\d:\d\d$/ });
await page.waitForTimeout(600);
check("free time chips offered for the day", (await chips.count()) > 0);
await page.locator('input[type="text"]').first().fill("Тест Клієнтка");
await chips.first().click();
await btn("Створити запис").click();
check("booking created (toast)", await has("Запис створено"));

console.log("── вкладка «Записи»");
await tab("Записи");
check("filters and list render", await has("Майбутні") && await has("Тест Клієнтка"));
await btn("Очікують").click();
check("pending filter keeps only pending", await gone("Тест Клієнтка"));
await btn("Скасовані").click();
check("cancelled filter shows cancelled", await has("Олена Коваль") || await has("Ірина Шевченко"));

console.log("── послуги");
await tab("Послуги");
check("services grouped by category", await has("Манікюр") && await has("Чоловіча стрижка"));
await btn("Нова послуга").click();
await page.getByPlaceholder("Жіноча стрижка").fill("Укладка");
await page.locator("div", { hasText: /^ЦІНА, ₴$/ }).locator("..").locator("input").first().fill("350");
await page.locator("button", { hasText: "Анна Мельник" }).last().click();
await btn("Зберегти").last().click();
check("new service saved and listed", await has("Укладка"));

console.log("── майстри");
await tab("Майстри");
check("masters listed with login status", await has("Борис Литвин") && await has("Без входу"));
await page.getByText("Борис Литвин").first().click();
await btn("Створити запрошення").click();
check("invite link produced", await has("/join/"));
await back();

console.log("── чати");
await tab("Чати");
await page.getByText("Олена Коваль").first().click();
check("thread shows history", await has("Чи можна перенести на 12:00?"));
await page.getByPlaceholder("Повідомлення…").fill("Перенесла на 12:00");
await page.locator("button", { hasText: "➤" }).click();
check("sent message appears", await has("Перенесла на 12:00"));
await back();

console.log("── статистика і налаштування");
await tab("Статист.");
check("stats: revenue per master", await has("По майстрах") && await has("Виручка"));
await tab("Налашт.");
check("settings: salon and payment sections", await has("Посилання для запису") && await has("Онлайн-оплата"));
await page.getByText("Онлайн-оплата та скасування").click();
check("payment form: connected token and cancellation policy", await has("Monobank підключено") && await has("Безкоштовне скасування"));
await btn("Зберегти налаштування").click();
check("payment settings saved (toast)", await has("Налаштування збережено"));

check("no JS errors", errors.length === 0, "\n    " + errors.join("\n    "));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nSALON FLOWS OK");
process.exit(fails ? 1 : 0);
