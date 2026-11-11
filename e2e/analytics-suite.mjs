/** Browser release checks. Run against a production server via BASE_URL. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const output = process.env.QA_OUTPUT_DIR ?? "/tmp/bilimlens-browser-qa";
const routes = ["/", "/topics", "/textbooks", "/hours", "/data", "/methodology", "/skills", "/simulator", "/reports"];
const languages = [
  ["ru", "Русский"], ["kk", "Қазақша"], ["en", "English"],
  ["zh", "中文"], ["es", "Español"], ["fr", "Français"],
  ["de", "Deutsch"], ["tr", "Türkçe"], ["uz", "Oʻzbekcha"],
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "ru-RU" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
async function go(route) {
  await page.goto(base + route, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(300);
}
function check(value, message) {
  assert.ok(value, message);
  console.log(`PASS ${message}`);
}

try {
  // Capture one pass; inspect the evidence, fix findings, then rerun with QA_PASS=2.
  for (const round of [process.env.QA_PASS ?? "1"]) {
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1180], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const route of routes) {
        await go(route);
        check(!/NaN|Infinity|undefined/.test(await page.locator("body").innerText()), `${route}: finite content (${device}, pass ${round})`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        check(!overflow, `${route}: no page overflow (${device}, pass ${round})`);
        check(await page.locator("main h1:visible").count() === 1, `${route}: one page heading`);
        await page.screenshot({ path: `${output}/pass-${round}-${device}-${route.slice(1) || "overview"}.png`, fullPage: true });
      }
      if (device === "mobile") {
        await page.getByRole("button", { name: "Открыть меню" }).click();
        const menu = page.getByRole("dialog");
        await menu.getByRole("link", { name: "Анализ ошибок" }).click();
        await page.getByRole("heading", { level: 1, name: "Анализ ошибок и навыков" }).waitFor();
        check(await menu.count() === 0, "mobile navigation closes after selection");
      }
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await go("/skills");
  check((await page.locator("main").innerText()).includes("7А"), "class statistics rendered");
  await page.getByRole("combobox", { name: "Предмет", exact: true }).click();
  await page.getByRole("option", { name: "Алгебра", exact: true }).click();
  await page.getByRole("combobox", { name: "Параллель", exact: true }).click();
  await page.getByRole("option", { name: "8 класс", exact: true }).click();
  await go("/simulator");
  const hours = page.locator('input[type="number"]').first();
  await hours.waitFor();
  const minimum = Number(await hours.getAttribute("min"));
  await hours.fill("0");
  await hours.press("Tab");
  check(Number(await hours.inputValue()) >= minimum, "simulator enforces minimum");
  await hours.fill("10000");
  const exportButton = page.getByRole("button", { name: "Скачать вариант (CSV)" });
  check(await exportButton.isDisabled(), "invalid over-budget plan cannot be exported");
  await page.getByRole("button", { name: "Сбросить к рекомендации" }).click();
  check(await exportButton.isEnabled(), "reset restores valid plan");
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  const csvPath = `${output}/scenario.csv`;
  await download.saveAs(csvPath);
  const csv = await readFile(csvPath, "utf8");
  check(csv.includes("custom_hours") && csv.includes("Алгебра"), "scenario CSV contains actual allocations");

  await go("/reports");
  await page.waitForFunction(() => Boolean(document.querySelector(".report-document table")));
  await page.evaluate(() => { window.__printCalled = false; window.print = () => { window.__printCalled = true; }; });
  await page.getByRole("button", { name: "Печать / Сохранить PDF" }).click();
  check(await page.evaluate(() => window.__printCalled), "report print action works");
  await page.emulateMedia({ media: "print" });
  check(await page.locator("aside").isHidden(), "print omits navigation");
  await page.pdf({ path: `${output}/intelligence-report.pdf`, format: "A4", printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: "screen" });
  check((await readFile(`${output}/intelligence-report.pdf`)).subarray(0, 4).toString() === "%PDF", "report produces a PDF");

  for (const [code, name] of languages) {
    await page.locator("aside [role=combobox]").click();
    await page.getByRole("option", { name, exact: true }).click();
    await page.waitForFunction(expected => document.documentElement.lang === expected, code);
    for (const route of ["/skills", "/simulator", "/reports"]) {
      await go(route);
      check(!/NaN|Infinity|undefined|\{\w+\}/.test(await page.locator("main").innerText()), `${code} ${route}: complete localized content`);
    }
  }
  check(errors.length === 0, `no browser errors: ${errors.slice(0, 3).join(" | ")}`);
} finally {
  await browser.close();
}
