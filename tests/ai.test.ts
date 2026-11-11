/**
 * AI-слой: все провайдеры — моки, реальные платные API не вызываются.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildAiContext, MIN_GROUP_STUDENTS, type AiContext } from "@/lib/ai/context";
import { publicStatus, readAiConfig } from "@/lib/ai/config";
import { createAiHandler, redactQuestion, RateLimiter } from "@/lib/ai/handler";
import { systemPrompt } from "@/lib/ai/prompts";
import { AiError, classifyError, createGroqProvider, generateWithFallback, type AiProvider } from "@/lib/ai/providers";
import { allowedNumbers, AiValidationError, validateAiOutput, type AiInsight } from "@/lib/ai/schema";
import { buildDataset, datasetFromDemoCsv } from "@/lib/data/dataset";
import { EMPTY_FILTERS } from "@/lib/domain/types";
import { generateReportPdf } from "@/lib/report/pdf";
import { buildReport } from "@/lib/report/report";
import { ru } from "@/i18n/messages/ru";
import { config, group, rec } from "./helpers";

const demo = datasetFromDemoCsv(readFileSync("public/demo/results.csv", "utf8"), readFileSync("public/demo/curriculum.csv", "utf8"));
const algebra7 = { ...EMPTY_FILTERS, subject: "Алгебра", grade: 7 };
const ctx = (page: Parameters<typeof buildAiContext>[0]["page"] = "topics") => buildAiContext({ dataset: demo, filters: algebra7, config, page });

/** Корректный ответ, ссылающийся на существующие доказательства и числа из них. */
function validInsight(context: AiContext): AiInsight {
  const topic = context.evidence.find((e) => e.kind === "topic")!;
  return {
    answer: `Тема ${topic.label} требует внимания: ${topic.metrics.rate_pct}% верных ответов.`,
    facts: [{ text: "Успешность ниже порога среднего уровня.", evidence: [topic.id] }],
    hypotheses: [{ text: "Возможно, базовые понятия темы не закреплены.", evidence: [topic.id] }],
    recommendations: [{ action: "Провести короткую диагностику.", reason: "Уточнит, какие умения не сформированы.", priority: "high", evidence: [topic.id] }],
    limitations: ["Данные наблюдательные, причинность не доказана."],
  };
}

const mockProvider = (id: "gemini" | "groq", impl: () => Promise<string>): AiProvider => ({ id, model: `${id}-test`, generate: vi.fn(impl) });

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

const env = { GEMINI_API_KEY: "test-gemini", GROQ_API_KEY: "test-groq" };
const noSleep = async () => {};
const quiet = () => {};

describe("AI context", () => {
  it("builds focused, numbered evidence from the analytics engine", () => {
    const c = ctx("topics");
    expect(c.version).toBe(1);
    expect(c.source).toBe("synthetic");
    expect(c.evidence.length).toBeGreaterThan(5);
    expect(c.evidence.length).toBeLessThanOrEqual(30);
    c.evidence.forEach((e, i) => expect(e.id).toBe(`e${i + 1}`));
    expect(c.evidence[0].kind).toBe("overview");
    // Значение темы совпадает с расчётом движка (в процентах, 1 знак).
    const report = buildReport(demo, { subject: "Алгебра", grade: 7 }, config);
    const worst = report.problemTopics[0];
    const item = c.evidence.find((e) => e.kind === "topic" && e.label === worst.topicName)!;
    expect(item.metrics.rate_pct).toBe(Math.round((worst.rate as number) * 1000) / 10);
    expect(c.limitations).toContain("synthetic_data");
    expect(c.limitations).toContain("observational_not_causal");
  });

  it("focuses evidence on the current page", () => {
    expect(ctx("textbooks").evidence.some((e) => e.kind === "textbook")).toBe(true);
    expect(ctx("hours").evidence.some((e) => e.kind === "hours_topic")).toBe(true);
    expect(ctx("skills").evidence.some((e) => e.kind === "skill")).toBe(true);
  });

  it("returns empty evidence for empty analytics", () => {
    const empty = buildAiContext({ dataset: buildDataset([], [], { name: "empty", source: "upload" }), filters: EMPTY_FILTERS, config, page: "overview" });
    expect(empty.evidence).toEqual([]);
    expect(empty.source).toBe("uploaded");
  });
});

describe("privacy", () => {
  it("never includes student identifiers or individual answers", () => {
    const json = JSON.stringify(ctx("overview"));
    const ids = new Set(demo.records.map((r) => r.studentId));
    for (const id of [...ids].slice(0, 50)) expect(json).not.toContain(id);
    expect(json).not.toMatch(/studentId|student_id|isCorrect/);
  });

  it("suppresses groups smaller than the minimum", () => {
    const records = [...group({ students: 6, prefix: "small", rate: 0.3, topicId: "T1", questions: ["Q1", "Q2", "Q3"] })];
    const dataset = buildDataset(records, [], { name: "small", source: "demo", isSynthetic: true });
    const c = buildAiContext({ dataset, filters: EMPTY_FILTERS, config, page: "topics" });
    expect(c.evidence).toEqual([]);
    expect(c.limitations).toContain("small_groups_suppressed");
  });

  it("redacts e-mails, phone numbers and student codes from questions", () => {
    const q = redactQuestion("Почему S0012 и ivan@school.kz (+7 701 123 45 67) отстают?");
    expect(q).not.toMatch(/S0012|ivan@school\.kz|701/);
  });

  it("rejects small groups and uploaded data on the server", async () => {
    const handler = createAiHandler({ env, providers: [mockProvider("gemini", async () => "{}")], log: quiet });
    const c = ctx();
    const tiny = { ...c, evidence: [{ ...c.evidence[1], metrics: { ...c.evidence[1].metrics, students: MIN_GROUP_STUDENTS - 1 } }] };
    expect((await handler(request({ mode: "insight", locale: "ru", context: tiny }))).status).toBe(403);
    const uploaded = { ...c, source: "uploaded" };
    const res = await handler(request({ mode: "insight", locale: "ru", context: uploaded }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("privacy");
  });
});

describe("providers", () => {
  it("uses the primary provider", async () => {
    const c = ctx();
    const primary = mockProvider("gemini", async () => JSON.stringify(validInsight(c)));
    const fallback = mockProvider("groq", async () => "{}");
    const handler = createAiHandler({ env, providers: [primary, fallback], sleep: noSleep, log: quiet });
    const res = await handler(request({ mode: "insight", locale: "ru", context: c }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.provider).toBe("gemini");
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("falls back to the secondary provider on transient errors only", async () => {
    const c = ctx();
    const primary = mockProvider("gemini", async () => Promise.reject({ status: 503 }));
    const fallback = mockProvider("groq", async () => JSON.stringify(validInsight(c)));
    const handler = createAiHandler({ env, providers: [primary, fallback], sleep: noSleep, log: quiet });
    const body = await (await handler(request({ mode: "insight", locale: "ru", context: c }))).json();
    expect(body.provider).toBe("groq");
    expect(primary.generate).toHaveBeenCalledTimes(2); // попытка + один повтор

    const authFail = mockProvider("gemini", async () => Promise.reject({ status: 401 }));
    const untouched = mockProvider("groq", async () => JSON.stringify(validInsight(c)));
    const strict = createAiHandler({ env, providers: [authFail, untouched], sleep: noSleep, log: quiet });
    const res = await strict(request({ mode: "insight", locale: "ru", context: c }));
    expect((await res.json()).error).toBe("auth");
    expect(untouched.generate).not.toHaveBeenCalled();
  });

  it("classifies provider errors", () => {
    expect(classifyError({ status: 429 })).toMatchObject({ code: "rate_limited", transient: true });
    expect(classifyError({ status: 400 })).toMatchObject({ code: "invalid_request", transient: false });
    expect(classifyError({ status: 500 })).toMatchObject({ code: "unavailable", transient: true });
    expect(classifyError(Object.assign(new Error("x"), { name: "AbortError" }))).toMatchObject({ code: "timeout" });
  });

  it("retries 429 with backoff, and moves on after a timeout", async () => {
    const sleep = vi.fn(noSleep);
    const limited = mockProvider("gemini", async () => Promise.reject({ status: 429 }));
    await expect(generateWithFallback([limited], { system: "", user: "", jsonSchema: {}, maxOutputTokens: 100 }, { timeoutMs: 1000, retries: 1, backoffMs: 50, sleep })).rejects.toMatchObject({ code: "rate_limited" });
    expect(limited.generate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);

    const hanging = mockProvider("gemini", () => new Promise<string>(() => {}));
    const backup = mockProvider("groq", async () => '{"ok":true}');
    const run = await generateWithFallback([hanging, backup], { system: "", user: "", jsonSchema: {}, maxOutputTokens: 100 }, { timeoutMs: 20, retries: 1, backoffMs: 1, sleep: noSleep });
    expect(run.provider).toBe("groq");
    expect(hanging.generate).toHaveBeenCalledTimes(1);
  });

  it("calls Groq through the OpenAI-compatible API with strict JSON schema", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
    const groq = createGroqProvider("key", "openai/gpt-oss-120b", fetchMock as unknown as typeof fetch);
    expect(await groq.generate({ system: "s", user: "u", jsonSchema: { type: "object" }, maxOutputTokens: 100 }, new AbortController().signal)).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "openai/gpt-oss-120b", response_format: { type: "json_schema", json_schema: { strict: true } } });
  });
});

describe("configuration and limits", () => {
  it("disables AI without keys and never exposes secrets", async () => {
    const off = readAiConfig({});
    expect(off.enabled).toBe(false);
    const res = await createAiHandler({ env: {}, log: quiet })(request({ mode: "insight", locale: "ru", context: ctx() }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_configured");
    const status = JSON.stringify(publicStatus(readAiConfig(env)));
    expect(status).not.toContain("test-gemini");
    expect(status).not.toContain("test-groq");
    expect(readAiConfig(env).order.map((o) => o.model)).toEqual(["gemini-3.8-flash", "gemini-3.5-flash", "openai/gpt-oss-120b"]);
    expect(readAiConfig({ ...env, AI_FALLBACK_ENABLED: "false", GEMINI_MODEL: "gemini-x" }).order).toHaveLength(1);
  });

  it("limits requests per client and the daily provider budget", async () => {
    const limiter = new RateLimiter(2, 3);
    expect(limiter.allowRequest("a", 0)).toBe(true);
    expect(limiter.allowRequest("a", 1)).toBe(true);
    expect(limiter.allowRequest("a", 2)).toBe(false);
    expect(limiter.allowRequest("a", 61_000)).toBe(true);
    limiter.spendAttempt(0);
    limiter.spendAttempt(0);
    limiter.spendAttempt(0);
    expect(limiter.hasBudget(0)).toBe(false);

    const c = ctx();
    const handler = createAiHandler({ env, providers: [mockProvider("gemini", async () => JSON.stringify(validInsight(c)))], limiter: new RateLimiter(1, 100), log: quiet });
    expect((await handler(request({ mode: "insight", locale: "ru", context: c }))).status).toBe(200);
    // Тот же запрос — из кэша, лимит не тратится.
    expect((await (await handler(request({ mode: "insight", locale: "ru", context: c }))).json()).cached).toBe(true);
    const other = await handler(request({ mode: "insight", locale: "en", context: c }));
    expect(other.status).toBe(429);
  });

  it("accepts only same-origin JSON requests within the size limit", async () => {
    const handler = createAiHandler({ env, providers: [mockProvider("gemini", async () => "{}")], log: quiet });
    expect((await handler(request({ mode: "insight", locale: "ru", context: ctx() }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await handler(request({ mode: "insight", locale: "ru", context: ctx(), extra: 1 }))).status).toBe(400);
    const big = { mode: "methodologist", locale: "ru", context: ctx(), question: "x".repeat(60_000) };
    expect((await handler(request(big))).status).toBeGreaterThanOrEqual(400);
  });
});

describe("structured output validation", () => {
  it("accepts grounded output and rejects unknown evidence or invented numbers", () => {
    const c = ctx();
    expect(() => validateAiOutput("insight", validInsight(c), c)).not.toThrow();
    const unknownRef = { ...validInsight(c), facts: [{ text: "Факт.", evidence: ["e99"] }] };
    expect(() => validateAiOutput("insight", unknownRef, c)).toThrow(AiValidationError);
    const invented = { ...validInsight(c), answer: "Через месяц успешность вырастет до 4321,7%." };
    expect(() => validateAiOutput("insight", invented, c)).toThrow(/NUMBER/);
    expect(() => validateAiOutput("insight", { answer: "x" }, c)).toThrow(/SCHEMA/);
    expect(allowedNumbers(c)).toContain(c.thresholds.mediumPct);
  });

  it("repairs once, then returns a safe error instead of an unverified answer", async () => {
    const c = ctx();
    const bad = mockProvider("gemini", async () => JSON.stringify({ ...validInsight(c), answer: "Рост до 4321,7% гарантирован." }));
    const handler = createAiHandler({ env, providers: [bad], log: quiet });
    const res = await handler(request({ mode: "insight", locale: "ru", context: c }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("invalid_response");
    expect(bad.generate).toHaveBeenCalledTimes(2);
  });

  it("strips inline evidence ids from prose", () => {
    const c = ctx();
    const withRefs = { ...validInsight(c), answer: `${validInsight(c).answer} (e2)` };
    expect((validateAiOutput("insight", withRefs, c) as AiInsight).answer).not.toContain("(e2)");
  });
});

describe("localization and reports", () => {
  it("asks the model to answer in the interface language", () => {
    expect(systemPrompt("methodologist", "topics", "ru")).toContain("Russian");
    expect(systemPrompt("insight", "skills", "kk")).toContain("Kazakh");
    expect(systemPrompt("report", "reports", "en")).toContain("English");
    expect(systemPrompt("insight", "textbooks", "en")).toMatch(/never call a textbook objectively better/i);
  });

  it("builds the PDF without AI and adds two labelled pages with AI insights", async () => {
    const fonts = { regular: await readFile("public/fonts/report/NotoSans-Regular.ttf"), bold: await readFile("public/fonts/report/NotoSans-Bold.ttf") };
    const dataset = buildDataset([rec({ isCorrect: false })], [], { name: "Проверка", source: "upload" });
    const report = buildReport(dataset, { subject: null, grade: null }, config);
    const plain = await PDFDocument.load(await generateReportPdf(report, { fonts, locale: "ru", m: ru }));
    expect(plain.getPageCount()).toBe(5);

    const c = ctx("reports");
    const topic = c.evidence.find((e) => e.kind === "topic")!;
    const insights = {
      executiveSummary: "Есть темы с низкой успешностью.",
      keyFindings: [{ problem: topic.label, significance: "Ниже порога.", evidence: [topic.id] }],
      recommendations: [{ action: "Провести диагностику.", why: "Уточнить пробелы.", priority: "high" as const, evidence: [topic.id] }],
      limitations: ["Синтетические данные."],
    };
    const withAi = await PDFDocument.load(await generateReportPdf(report, { fonts, locale: "ru", m: ru, ai: { insights, context: c, source: "gemini · test" } }));
    expect(withAi.getPageCount()).toBe(7);
  });

  it("all AI errors surface as structured codes", () => {
    expect(new AiError("timeout", true, 504).message).toBe("AI_TIMEOUT");
  });
});

describe("number verification with digit grouping", () => {
  it("reads thousands separators in any interface language", () => {
    const c = ctx("overview");
    const answers = c.evidence[0].metrics.answers as number;
    const grouped = answers.toLocaleString("ru-RU"); // «24 252» с неразрывным пробелом
    const base = validInsight(c);
    for (const text of [grouped, grouped.replace(/\u00a0|\u202f/g, " "), answers.toLocaleString("en-US")]) {
      expect(() => validateAiOutput("insight", { ...base, answer: `Всего ответов: ${text}.` }, c)).not.toThrow();
    }
    expect(() => validateAiOutput("insight", { ...base, answer: "Всего ответов: 98 765." }, c)).toThrow(/NUMBER/);
  });
});
