import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { generateReportPdf, PDF_PAGE_SIZE } from "@/lib/report/pdf";
import { buildReport } from "@/lib/report/report";
import { buildDataset, datasetFromDemoCsv } from "@/lib/data/dataset";
import { ru } from "@/i18n/messages/ru";
import { kk } from "@/i18n/messages/kk";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { es } from "@/i18n/messages/es";
import { fr } from "@/i18n/messages/fr";
import { de } from "@/i18n/messages/de";
import { tr } from "@/i18n/messages/tr";
import { uz } from "@/i18n/messages/uz";
import { createI18n, i18n, setCurrentI18n } from "@/i18n/core";
import { config, rec } from "./helpers";
import { analyzeSkills } from "@/lib/analytics/skills";
import { computeTopicStats } from "@/lib/analytics/topics";

const fonts = Promise.all([
  readFile("public/fonts/report/NotoSans-Regular.ttf"),
  readFile("public/fonts/report/NotoSans-Bold.ttf"),
]).then(([regular, bold]) => ({ regular, bold }));
const scope = { subject: null, grade: null };
const hasPoppler = spawnSync("pdftotext", ["-v"], { stdio: "ignore" }).status === 0;
async function extracted(bytes: Uint8Array) {
  const dir = await mkdtemp(join(tmpdir(), "bilimlens-pdf-test-"));
  try {
    const file = join(dir, "report.pdf");
    await writeFile(file, bytes);
    const result = spawnSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    return result.stdout;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

describe("standalone PDF reports", () => {
  it.each([["en", en], ["es", es], ["fr", fr], ["de", de], ["tr", tr], ["uz", uz]] as const)("renders searchable %s text with the bundled fonts", async (locale, m) => {
    const original = i18n();
    try {
      setCurrentI18n(createI18n(locale, m));
      const dataset = buildDataset([rec({ isCorrect: false })], [], { name: "BilimLens · Ә Ғ Қ Ң Ө Ұ Ү Һ І", source: "upload" });
      const report = buildReport(dataset, scope, config);
      const bytes = await generateReportPdf(report, { fonts: await fonts, locale, m });
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
      if (hasPoppler) expect(await extracted(bytes)).toContain(m.ux.executiveSummary);
    } finally { setCurrentI18n(original); }
  });
  it("creates exactly five A4 landscape pages, real embedded fonts and no page-sized images", async () => {
    const dataset = buildDataset([rec({ isCorrect: false, skill: "Навык" })], [], { name: "Проверка", source: "upload" });
    const bytes = await generateReportPdf(buildReport(dataset, scope, config), { fonts: await fonts, locale: "ru", m: ru });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(5);
    if (hasPoppler) expect(await extracted(bytes)).not.toContain(ru.insights.noneTitle);
    pdf.getPages().forEach(page => {
      expect(page.getSize().width).toBeCloseTo(PDF_PAGE_SIZE[0], 2);
      expect(page.getSize().height).toBeCloseTo(PDF_PAGE_SIZE[1], 2);
    });
    const objects = pdf.context.enumerateIndirectObjects().map(([, value]) => value);
    expect(objects.filter(value => value instanceof PDFDict && value.has(PDFName.of("ToUnicode"))).length).toBeGreaterThan(0);
    expect(objects.filter(value => value instanceof PDFDict && value.get(PDFName.of("Subtype"))?.toString() === "/Image")).toHaveLength(0);
  });

  it("handles empty scopes and embeds Kazakh-specific letters", async () => {
    const empty = buildDataset([], [], { name: "Ә Ғ Қ Ң Ө Ұ Ү Һ І", source: "upload" });
    const bytes = await generateReportPdf(buildReport(empty, scope, config), { fonts: await fonts, locale: "kk", m: kk });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
  });

  it("keeps long appendix strings and paginates all question rows", async () => {
    const records = Array.from({ length: 90 }, (_, index) => rec({ questionId: `Q${index}`, testId: index === 0 ? "ДлинныйИдентификатор".repeat(70) : `Тест${index}`, isCorrect: index % 2 === 0 }));
    const dataset = buildDataset(records, [], { name: "Appendix", source: "upload" });
    const bytes = await generateReportPdf(buildReport(dataset, scope, config), { fonts: await fonts, locale: "ru", m: ru, appendix: true, questions: analyzeSkills(records, config).questions, topics: computeTopicStats(records, config) });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(4);
    expect(pdf.getPages().every(page => page.getHeight() < 600)).toBe(true);
  });

  it("exports the synthetic dataset using the same report contract", async () => {
    const dataset = datasetFromDemoCsv(await readFile("public/demo/results.csv", "utf8"), await readFile("public/demo/curriculum.csv", "utf8"));
    const report = buildReport(dataset, { subject: "Алгебра", grade: 8 }, config);
    const bytes = await generateReportPdf(report, { fonts: await fonts, locale: "ru", m: ru });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
    expect(report.hours.some(course => course.plan.ok)).toBe(true);
  });

  it("rejects an unsupported glyph explicitly rather than emitting missing-glyph squares", async () => {
    const dataset = buildDataset([], [], { name: "Unsupported \u{13000}", source: "upload" });
    await expect(generateReportPdf(buildReport(dataset, scope, config), { fonts: await fonts, locale: "ru", m: ru })).rejects.toThrow("PDF_FONT_UNSUPPORTED");
  });

  it("embeds the Chinese fallback together with Cyrillic source names", async () => {
    const dataset = buildDataset([rec({ topicName: "Алгебра · 学习" })], [], { name: "学习分析 · Ә Ғ Қ Ң Ө Ұ Ү Һ І", source: "upload" });
    const bytes = await generateReportPdf(buildReport(dataset, scope, config), { fonts: { ...await fonts, fallback: await readFile("public/fonts/report/NotoSans-CJK-Fallback.ttf") }, locale: "zh", m: zh });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
    if (hasPoppler) {
      const text = await extracted(bytes);
      expect(text).toContain(zh.ux.executiveSummary);
      expect(text).toContain("Ә Ғ Қ Ң Ө Ұ Ү Һ І");
    }
  });

  it.skipIf(!hasPoppler)("keeps searchable Kazakh text rather than a screenshot", async () => {
    const dataset = buildDataset([], [], { name: "Ә Ғ Қ Ң Ө Ұ Ү Һ І", source: "upload" });
    const bytes = await generateReportPdf(buildReport(dataset, scope, config), { fonts: await fonts, locale: "kk", m: kk });
    const text = await extracted(bytes);
    expect(text).toContain("Ә Ғ Қ Ң Ө Ұ Ү Һ І");
    expect(text).toContain(kk.ux.executiveSummary);
    expect(text.match(/\f/g)).toHaveLength(5);
  });
});
