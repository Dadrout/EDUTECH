/**
 * Сквозная проверка в браузере (Playwright, Chromium).
 *
 * Запуск: сначала `npm run build && npm start`, затем в другом терминале
 *   npm run test:e2e
 * Адрес можно переопределить: BASE_URL=http://localhost:3001 npm run test:e2e
 * Если браузер не установлен: npx playwright install chromium
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
let failed = 0;

function check(cond, msg) {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failed += 1;
}

const text = (page) => page.evaluate(() => document.body.innerText.replace(/[  ]/g, " "));
const go = async (page, path) => {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
};

const browser = await chromium.launch();
// Браузер с русской локалью: интерфейс сам выбирает язык браузера, а проверки ниже — на русском.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

try {
  // 1. Демо-данные: все страницы открываются, нет NaN.
  for (const p of ["/", "/topics", "/textbooks", "/hours", "/data", "/methodology"]) {
    await go(page, p);
    check(!/NaN|Infinity|undefined/.test(await text(page)), `нет NaN/undefined на ${p}`);
  }
  await go(page, "/");
  let t = await text(page);
  check(/Учеников\s*300/.test(t), "обзор: 300 учеников в демо-наборе");
  check(t.includes("Демонстрационный режим"), "демо-данные помечены как синтетические");

  // 2. Параметры анализа меняют результаты на всех страницах.
  const before = Number((t.match(/Проблемных тем\s*(\d+)/) ?? [])[1]);
  await page.getByRole("button", { name: "Параметры анализа" }).first().click();
  await page.locator("#th-medium").fill("50");
  await page.getByRole("button", { name: "Применить" }).click();
  await page.waitForTimeout(300);
  t = await text(page);
  const after = Number((t.match(/Проблемных тем\s*(\d+)/) ?? [])[1]);
  check(after < before, `порог 50%: проблемных тем ${before} → ${after}`);
  await page.getByRole("button", { name: "Параметры анализа" }).first().click();
  await page.getByRole("button", { name: "Значения по умолчанию" }).click();
  await page.getByRole("button", { name: "Применить" }).click();

  // 3. Сравнение учебников и детализация темы.
  await page.getByRole("combobox", { name: "Предмет" }).click();
  await page.getByRole("option", { name: "Алгебра" }).click();
  await page.getByRole("combobox", { name: "Параллель" }).click();
  await page.getByRole("option", { name: "8 класс" }).click();
  await go(page, "/textbooks");
  t = await text(page);
  check(t.includes("Различие устойчиво"), "Алгебра 8: устойчивое различие учебников");
  check(t.includes("не доказательство причины"), "оговорка о причинности показана");
  await go(page, "/topics");
  await page.getByRole("button", { name: "Квадратичная функция", exact: true }).click();
  await page.getByText("Задания темы — от самых трудных").waitFor();
  check(true, "детализация темы открывается");
  await page.keyboard.press("Escape");

  // 4. Импорт CSV с ошибками (Windows-1251, «;», русские заголовки).
  await go(page, "/data");
  await page.locator("#file-results").setInputFiles(join(FIXTURES, "results-ru.csv"));
  await page.getByText("Распознанные колонки").waitFor();
  t = await text(page);
  check(t.includes("Windows-1251") && /Строк с ошибками\s*3/.test(t) && /Дубликатов удалено\s*1/.test(t), "ошибки и дубликаты обнаружены");
  await page.getByRole("button", { name: /Импортировать .* корректных/ }).click();
  await page.waitForTimeout(600);
  await go(page, "/");
  t = await text(page);
  check(/Учеников\s*40/.test(t) && t.includes("Обыкновенные дроби"), "после импорта все расчёты используют новые данные");

  // 5. Учебный план и рекомендации по часам.
  await go(page, "/hours");
  check((await text(page)).includes("не загружен"), "без плана — понятное сообщение");
  await go(page, "/data");
  await page.getByRole("tab", { name: /Учебный план/ }).click();
  await page.locator("#file-curriculum").setInputFiles(join(FIXTURES, "plan.csv"));
  await page.getByRole("button", { name: "Применить данные" }).click();
  await page.waitForTimeout(500);
  await go(page, "/hours");
  t = await text(page);
  check(t.includes("Ограничения соблюдены"), "план часов построен, бюджет соблюдён");
  await page.locator("#budget").fill("40");
  await page.waitForTimeout(300);
  check((await text(page)).includes("Конфликт ограничений"), "конфликт при бюджете меньше суммы минимумов");

  // 6. XLSX и возврат демо-данных.
  await go(page, "/data");
  await page.locator("#file-results").setInputFiles(join(FIXTURES, "results.xlsx"));
  await page.getByText("Распознанные колонки").waitFor({ timeout: 15000 });
  check(/Корректных записей\s*199/.test(await text(page)), "XLSX прочитан");
  await page.getByRole("button", { name: "Отмена" }).click();
  await page.getByRole("button", { name: "Вернуть демо-данные" }).click();
  await page.getByText("Синтетические данные").first().waitFor({ timeout: 20000 });
  check(true, "демо-данные восстановлены");

  // 7. Смена языка интерфейса: тексты, расчётные выводы и числа переводятся, выбор запоминается.
  await go(page, "/");
  await page.getByRole("combobox", { name: "Язык интерфейса" }).first().click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByText("Performance overview").waitFor({ timeout: 15000 });
  t = await text(page);
  check(t.includes("Main problems found") && /Students\s*300/.test(t) && (await page.evaluate(() => document.documentElement.lang)) === "en", "интерфейс переключается на английский");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Performance overview").waitFor({ timeout: 15000 });
  check(true, "выбранный язык сохраняется после перезагрузки");
  await page.getByRole("combobox", { name: "Interface language" }).first().click();
  await page.getByRole("option", { name: "Русский" }).click();
  await page.getByText("Обзор успеваемости").waitFor({ timeout: 15000 });
  check(true, "возврат к русскому языку");

  check(errors.length === 0, `нет ошибок в консоли${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
} catch (e) {
  failed += 1;
  console.error("FAIL", e instanceof Error ? e.message : e);
} finally {
  await browser.close();
}

console.log(failed === 0 ? "\nВсе проверки пройдены." : `\nНе пройдено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
