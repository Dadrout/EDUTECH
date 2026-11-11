/** Generate the exact browser-independent template for Poppler QA. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { datasetFromDemoCsv } from "../src/lib/data/dataset";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/lib/config/analysis-config";
import { buildReport } from "../src/lib/report/report";
import { generateReportPdf, type PdfReportOptions } from "../src/lib/report/pdf";
import { computeTopicStats } from "../src/lib/analytics/topics";
import { analyzeSkills } from "../src/lib/analytics/skills";
import { filterRecords } from "../src/lib/analytics/filters";
import { EMPTY_FILTERS } from "../src/lib/domain/types";
import { createI18n, setCurrentI18n } from "../src/i18n/core";
import { ru } from "../src/i18n/messages/ru";
import { kk } from "../src/i18n/messages/kk";
import { zh } from "../src/i18n/messages/zh";

async function main() {
  const locale = process.argv.includes("--kk") ? "kk" : process.argv.includes("--zh") ? "zh" : "ru";
  const m = locale === "kk" ? kk : locale === "zh" ? zh : ru;
  setCurrentI18n(createI18n(locale, m));
  const root = process.cwd();
  const output = process.env.PDF_OUTPUT_DIR ?? join(root, "output/pdf");
  await mkdir(output, { recursive: true });
  const dataset = datasetFromDemoCsv(await readFile(join(root, "public/demo/results.csv"), "utf8"), await readFile(join(root, "public/demo/curriculum.csv"), "utf8"));
  if (locale === "kk") dataset.meta.name = "Білім сапасы: Ә Ғ Қ Ң Ө Ұ Ү Һ І";
  const scope = process.argv.includes("--all") ? { subject: null, grade: null } : { subject: "Алгебра", grade: 8 };
  const records = filterRecords(dataset.records, { ...EMPTY_FILTERS, ...scope }, ["subject", "grade"]);
  const report = buildReport(dataset, scope, DEFAULT_ANALYSIS_CONFIG, new Date("2026-11-11T12:00:00Z"));
  const options: PdfReportOptions = {
    locale, m,
    fonts: {
      regular: await readFile(join(root, "public/fonts/report/NotoSans-Regular.ttf")),
      bold: await readFile(join(root, "public/fonts/report/NotoSans-Bold.ttf")),
      ...(locale === "zh" ? { fallback: await readFile(join(root, "public/fonts/report/NotoSans-CJK-Fallback.ttf")) } : {}),
    },
    logo: await readFile(join(root, "public/brand/bilimlens-logo.png")),
    questions: analyzeSkills(records, DEFAULT_ANALYSIS_CONFIG).questions,
    topics: computeTopicStats(records, DEFAULT_ANALYSIS_CONFIG),
  };
  for (const appendix of [false, true]) {
    const name = `bilimlens-${locale}-${appendix ? "appendix" : "report"}.pdf`;
    const bytes = await generateReportPdf(report, { ...options, appendix });
    await writeFile(join(output, name), bytes);
    console.log(`${name}: ${bytes.length} bytes`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
