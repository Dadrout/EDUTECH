/**
 * Разрешённый smoke-тест реальных провайдеров (минимум запросов).
 * Запуск: node --env-file=.env.local --import tsx scripts/ai-smoke.ts [gemini|groq] [mode] [locale]
 * Ключи не печатаются; выводится только структура ответа.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAiContext } from "@/lib/ai/context";
import { readAiConfig } from "@/lib/ai/config";
import { createAiHandler } from "@/lib/ai/handler";
import { DEFAULT_ANALYSIS_CONFIG } from "@/lib/config/analysis-config";
import { datasetFromDemoCsv } from "@/lib/data/dataset";
import { EMPTY_FILTERS } from "@/lib/domain/types";

const [providerArg = "gemini", modeArg = "methodologist", locale = "ru"] = process.argv.slice(2);
const root = process.cwd();
const dataset = datasetFromDemoCsv(readFileSync(join(root, "public/demo/results.csv"), "utf8"), readFileSync(join(root, "public/demo/curriculum.csv"), "utf8"));
const filters = { ...EMPTY_FILTERS, subject: "Алгебра", grade: 7 };
const context = buildAiContext({ dataset, filters, config: DEFAULT_ANALYSIS_CONFIG, page: modeArg === "report" ? "reports" : "topics" });

const env = { ...process.env, AI_PRIMARY_PROVIDER: providerArg, AI_FALLBACK_ENABLED: "false" };
const handler = createAiHandler({ env, config: readAiConfig(env), log: (e, d) => console.log("log", e, JSON.stringify(d)) });
const question = locale === "ru" ? "Почему 7Г класс хуже справляется с алгебраическими дробями и что повторить в первую очередь?" : "Which topics should be reviewed first and why?";
async function main() {
const started = Date.now();
const response = await handler(
  new Request("http://localhost:3000/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000" },
    body: JSON.stringify({ mode: modeArg, locale, context, ...(modeArg === "methodologist" ? { question } : {}) }),
  }),
);
const body = await response.json();
console.log("evidence items:", context.evidence.length, "limitations:", context.limitations.join(","));
console.log("HTTP", response.status, "in", Date.now() - started, "ms");
console.log(JSON.stringify(body, null, 2).slice(0, 3500));
}
void main();
