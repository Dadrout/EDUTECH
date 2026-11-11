/**
 * Структурированные ответы AI: Zod-схемы (серверная проверка) и совместимые
 * JSON Schema (ограниченный ответ провайдера). Ограничения длины и количества
 * проверяются в Zod: строгий режим провайдеров поддерживает не все ключевые слова.
 *
 * Проверка достоверности: каждая ссылка на доказательство должна существовать в
 * переданном контексте, а каждое число в тексте — совпадать (с учётом округления)
 * с числом из контекста. Модель не может подменить показатели движка.
 */
import { z } from "zod";
import type { AiContext } from "./context";

export const AI_MODES = ["methodologist", "insight", "report"] as const;
export type AiMode = (typeof AI_MODES)[number];

const text = (max: number) => z.string().trim().min(1).max(max).refine((v) => !/[<>\u0000-\u0008\u000b-\u001f]/u.test(v), "plain text only");
const refs = z.array(z.string().regex(/^e\d{1,2}$/)).min(1).max(5);
const priority = z.enum(["high", "medium", "low"]);

export const insightSchema = z
  .object({
    answer: text(600),
    facts: z.array(z.object({ text: text(320), evidence: refs }).strict()).max(4),
    hypotheses: z.array(z.object({ text: text(320), evidence: refs }).strict()).max(3),
    recommendations: z.array(z.object({ action: text(220), reason: text(320), priority, evidence: refs }).strict()).max(4),
    limitations: z.array(text(260)).min(1).max(4),
  })
  .strict();
export type AiInsight = z.infer<typeof insightSchema>;

export const reportSchema = z
  .object({
    executiveSummary: text(800),
    keyFindings: z.array(z.object({ problem: text(220), significance: text(320), evidence: refs }).strict()).min(1).max(3),
    recommendations: z.array(z.object({ action: text(220), why: text(320), priority, evidence: refs }).strict()).min(1).max(4),
    limitations: z.array(text(260)).min(1).max(4),
  })
  .strict();
export type AiReportInsights = z.infer<typeof reportSchema>;

const s = { type: "string" };
const ids = { type: "array", items: { type: "string" } };
const pri = { type: "string", enum: ["high", "medium", "low"] };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

export const insightJsonSchema = obj({
  answer: s,
  facts: { type: "array", items: obj({ text: s, evidence: ids }) },
  hypotheses: { type: "array", items: obj({ text: s, evidence: ids }) },
  recommendations: { type: "array", items: obj({ action: s, reason: s, priority: pri, evidence: ids }) },
  limitations: { type: "array", items: s },
});

export const reportJsonSchema = obj({
  executiveSummary: s,
  keyFindings: { type: "array", items: obj({ problem: s, significance: s, evidence: ids }) },
  recommendations: { type: "array", items: obj({ action: s, why: s, priority: pri, evidence: ids }) },
  limitations: { type: "array", items: s },
});

export class AiValidationError extends Error {
  constructor(public readonly reason: "schema" | "evidence" | "number", public readonly detail: string) {
    super(`AI_INVALID_${reason.toUpperCase()}: ${detail}`);
    this.name = "AiValidationError";
  }
}

/** Числа, которые модели разрешено упоминать: значения показателей, подписей и порогов. */
export function allowedNumbers(context: AiContext): number[] {
  const out = new Set<number>();
  const add = (v: number) => {
    if (!Number.isFinite(v)) return;
    out.add(v);
    out.add(Math.abs(v));
  };
  const fromText = (value: string) => {
    for (const n of extractNumbers(value)) add(n);
  };
  for (const item of context.evidence) {
    fromText(item.label);
    if (item.course) fromText(item.course);
    for (const value of Object.values(item.metrics)) {
      if (typeof value === "number") add(value);
      else if (typeof value === "string") fromText(value);
    }
  }
  for (const v of [context.thresholds.highPct, context.thresholds.mediumPct, context.scope.grade ?? NaN]) add(v);
  for (const v of [context.scope.subject, context.scope.classId, context.scope.textbook, context.scope.topic]) if (v) fromText(v);
  // Малые целые («три темы», «2 класса») и «95%» доверительного интервала не являются выдуманной статистикой.
  for (let i = 0; i <= 10; i++) add(i);
  add(95);
  add(100);
  return [...out];
}

// «24 252», «24 252», «24,252» — разряды; иначе «41,5», «41.5», «7» (в «7Б»).
const NUMBER = /\d{1,3}(?:[   ,]\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?/g;
const GROUP_SEP = /[   ,]/g;

/**
 * Прочтения каждого числа в тексте. У «24 252» два прочтения: 24252 или
 * «24» и «252» отдельно; у «24,252» — 24252 или 24.252. Число допустимо,
 * если все значения хотя бы одного прочтения есть в контексте.
 */
export function numberReadings(value: string): number[][][] {
  return [...value.matchAll(NUMBER)].map(([raw]) => {
    const plain = [Number(raw.replace(",", "."))];
    if (!/^\d{1,3}(?:[   ,]\d{3})+$/.test(raw)) return [plain];
    const split = raw.split(/[   ]/).map((p) => Number(p.replace(",", ".")));
    return [[Number(raw.replace(GROUP_SEP, ""))], split].filter((r) => r.every(Number.isFinite));
  });
}

/** Все числа в тексте (любое прочтение), без учёта знака. */
export function extractNumbers(value: string): number[] {
  return numberReadings(value).flat(2);
}

function proseOf(value: AiInsight | AiReportInsights): string[] {
  if ("answer" in value) {
    return [value.answer, ...value.facts.map((f) => f.text), ...value.hypotheses.map((h) => h.text), ...value.recommendations.flatMap((r) => [r.action, r.reason]), ...value.limitations];
  }
  return [value.executiveSummary, ...value.keyFindings.flatMap((f) => [f.problem, f.significance]), ...value.recommendations.flatMap((r) => [r.action, r.why]), ...value.limitations];
}

function citations(value: AiInsight | AiReportInsights): string[] {
  if ("answer" in value) return [...value.facts, ...value.hypotheses, ...value.recommendations].flatMap((x) => x.evidence);
  return [...value.keyFindings, ...value.recommendations].flatMap((x) => x.evidence);
}

/** Проверить структуру, ссылки на доказательства и числа. Бросает AiValidationError. */
/** Удалить ссылки вида «(e12)» из текста: доказательства показываются отдельно. */
export function stripInlineRefs(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\s*\((?:e\d{1,2}(?:\s*,\s*)?)+\)/g, "").replace(/\s{2,}/g, " ").trim();
  if (Array.isArray(value)) return value.map(stripInlineRefs);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "evidence" ? v : stripInlineRefs(v)]));
  return value;
}

export function validateAiOutput(mode: AiMode, raw: unknown, context: AiContext): AiInsight | AiReportInsights {
  const parsed = (mode === "report" ? reportSchema : insightSchema).safeParse(stripInlineRefs(raw));
  if (!parsed.success) throw new AiValidationError("schema", parsed.error.issues[0]?.path.join(".") ?? "invalid");
  const value = parsed.data;

  const known = new Set(context.evidence.map((e) => e.id));
  const missing = citations(value).find((id) => !known.has(id));
  if (missing) throw new AiValidationError("evidence", missing);

  const allowed = allowedNumbers(context);
  for (const prose of proseOf(value)) {
    // Допуск на округление в тексте: 41,5 → «41» или «42».
    const isKnown = (n: number) => allowed.some((a) => Math.abs(a - n) <= 0.51);
    for (const readings of numberReadings(prose)) {
      if (!readings.some((r) => r.every(isKnown))) throw new AiValidationError("number", String(readings[0]?.[0]));
    }
  }
  return value;
}
