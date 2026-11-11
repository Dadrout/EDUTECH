/** Размер AI-контекста по страницам (без запросов к провайдерам). */
import { readFileSync } from "node:fs";
import { buildAiContext, AI_PAGES } from "@/lib/ai/context";
import { dataMessage, systemPrompt } from "@/lib/ai/prompts";
import { DEFAULT_ANALYSIS_CONFIG } from "@/lib/config/analysis-config";
import { datasetFromDemoCsv } from "@/lib/data/dataset";
import { EMPTY_FILTERS } from "@/lib/domain/types";

const dataset = datasetFromDemoCsv(readFileSync("public/demo/results.csv", "utf8"), readFileSync("public/demo/curriculum.csv", "utf8"));
for (const filters of [EMPTY_FILTERS, { ...EMPTY_FILTERS, subject: "Алгебра", grade: 7 }]) {
  for (const page of AI_PAGES) {
    const c = buildAiContext({ dataset, filters, config: DEFAULT_ANALYSIS_CONFIG, page });
    const data = dataMessage(c, "вопрос");
    console.log(filters.subject ?? "all", page, "evidence", c.evidence.length, "data chars", data.length, "system chars", systemPrompt("insight", page, "ru").length);
  }
}
