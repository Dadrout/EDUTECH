/**
 * Серверный обработчик AI-запросов (Route Handler /api/ai).
 *
 * Порядок: размер тела → схема запроса → политика приватности → происхождение
 * запроса → лимиты → кэш → провайдер (с резервом) → проверка ответа (схема,
 * ссылки, числа; одна попытка исправления) → ответ. В логи попадают только коды.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { LOCALES } from "@/i18n/locales";
import { AI_PAGES, EVIDENCE_KINDS, LIMITATION_CODES, MAX_EVIDENCE, MIN_GROUP_STUDENTS, type AiContext } from "./context";
import { createProviders, readAiConfig, type AiConfig, type AiEnv } from "./config";
import { dataMessage, systemPrompt } from "./prompts";
import { AiError, generateWithFallback, type AiProvider } from "./providers";
import { AI_MODES, AiValidationError, insightJsonSchema, reportJsonSchema, validateAiOutput, type AiInsight, type AiMode, type AiReportInsights } from "./schema";

export const MAX_BODY_BYTES = 48_000;
const QUESTION_MAX = 300;

const label = z.string().max(80);
const metricValue = z.union([z.number().finite(), z.string().max(80), z.boolean(), z.null()]);
const contextSchema = z
  .object({
    version: z.literal(1),
    source: z.enum(["synthetic", "uploaded"]),
    page: z.enum(AI_PAGES),
    scope: z.object({ subject: label.nullable(), grade: z.number().int().min(1).max(12).nullable(), classId: label.nullable(), textbook: label.nullable(), topic: label.nullable() }).strict(),
    thresholds: z.object({ highPct: z.number().min(1).max(100), mediumPct: z.number().min(1).max(100) }).strict(),
    evidence: z
      .array(
        z
          .object({
            id: z.string().regex(/^e\d{1,2}$/),
            kind: z.enum(EVIDENCE_KINDS),
            label,
            course: label.optional(),
            metrics: z.record(z.string().regex(/^[a-z_]{1,32}$/), metricValue).refine((m) => Object.keys(m).length <= 14, "too many metrics"),
          })
          .strict(),
      )
      .max(MAX_EVIDENCE),
    limitations: z.array(z.enum(LIMITATION_CODES)).max(LIMITATION_CODES.length),
  })
  .strict();

export const aiRequestSchema = z
  .object({
    mode: z.enum(AI_MODES),
    locale: z.enum(LOCALES.map((l) => l.code) as [string, ...string[]]),
    question: z.string().trim().max(QUESTION_MAX).optional(),
    context: contextSchema,
  })
  .strict();

export type AiRequestBody = z.infer<typeof aiRequestSchema>;

export interface AiSuccess {
  ok: true;
  mode: AiMode;
  result: AiInsight | AiReportInsights;
  provider: string;
  model: string;
  cached: boolean;
}

/** Удаление того, что похоже на персональные данные: почта, телефоны, коды учеников. */
export function redactQuestion(question: string): string {
  return question
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[…]")
    .replace(/\+?\d[\d\s()-]{7,}\d/g, "[…]")
    .replace(/\b[\p{L}]{1,3}[-_]?\d{3,}\b/gu, "[…]")
    .replace(/[\u0000-\u001f\u007f<>`]/g, " ")
    .slice(0, QUESTION_MAX);
}

/** Проверка, что в контексте нет малых групп (повторно на сервере, не доверяя клиенту). */
function violatesPrivacy(context: AiContext): boolean {
  return context.evidence.some((e) => {
    const counts = ["students", "students_a", "students_b"].map((k) => e.metrics[k]).filter((v): v is number => typeof v === "number");
    return counts.some((n) => n < MIN_GROUP_STUDENTS);
  });
}

// ---------- Лимиты и кэш (память процесса; для нескольких экземпляров — внешнее хранилище) ----------

export class RateLimiter {
  private minute = new Map<string, number[]>();
  private global: number[] = [];
  private day = { key: "", attempts: 0 };
  /** Общий минутный предел: адрес клиента можно подделать, поэтому всплеск ограничен и для всех вместе. */
  private readonly globalPerMinute: number;
  constructor(private readonly perMinute: number, private readonly perDay: number, globalPerMinute?: number) {
    this.globalPerMinute = globalPerMinute ?? perMinute * 5;
  }

  /** Запрос клиента в минутном окне. */
  allowRequest(client: string, now = Date.now()): boolean {
    this.global = this.global.filter((t) => now - t < 60_000);
    if (this.global.length >= this.globalPerMinute) return false;
    const recent = (this.minute.get(client) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= this.perMinute) {
      this.minute.set(client, recent);
      return false;
    }
    recent.push(now);
    this.global.push(now);
    this.minute.set(client, recent);
    if (this.minute.size > 5_000) this.minute.clear();
    return true;
  }

  /** Достаточно ли дневного бюджета попыток провайдера (повторы и резерв считаются отдельно). */
  hasBudget(now = Date.now()): boolean {
    this.roll(now);
    return this.day.attempts < this.perDay;
  }

  spendAttempt(now = Date.now()): void {
    this.roll(now);
    this.day.attempts += 1;
  }

  private roll(now: number) {
    const key = new Date(now).toISOString().slice(0, 10);
    if (this.day.key !== key) this.day = { key, attempts: 0 };
  }
}

export class ResponseCache {
  private store = new Map<string, { at: number; value: AiSuccess }>();
  constructor(private readonly ttlMs = 30 * 60_000, private readonly max = 100) {}
  get(key: string, now = Date.now()): AiSuccess | null {
    const hit = this.store.get(key);
    if (!hit || now - hit.at > this.ttlMs) return null;
    return { ...hit.value, cached: true };
  }
  set(key: string, value: AiSuccess, now = Date.now()) {
    if (this.store.size >= this.max) this.store.delete(this.store.keys().next().value as string);
    this.store.set(key, { at: now, value });
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(status === 429 ? { "Retry-After": "60" } : {}) },
  });
}

const fail = (error: AiError) => json({ ok: false, error: error.code }, error.status);

async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AiError("invalid_request", false, 415);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AiError("invalid_request", false, 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new AiError("invalid_request", false, 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("invalid_request", false, 400);
  }
}

/** Только тот же сайт: браузер всегда присылает Origin для POST fetch. */
function sameOrigin(request: Request, env: AiEnv): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set((env.AI_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  if (host) allowed.add(`${proto}://${host}`);
  allowed.add(new URL(request.url).origin);
  return allowed.has(origin);
}

/**
 * Ключ клиента для лимита. x-real-ip и последний адрес в X-Forwarded-For
 * добавляет ближайший прокси (Vercel, nginx); первый адрес клиент может подставить сам.
 */
export function clientKey(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const chain = (request.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain.at(-1) ?? "local";
}

export interface HandlerDeps {
  env?: AiEnv;
  config?: AiConfig;
  providers?: AiProvider[];
  limiter?: RateLimiter;
  cache?: ResponseCache;
  sleep?: (ms: number) => Promise<void>;
  log?: (event: string, data: Record<string, unknown>) => void;
}

export function createAiHandler(deps: HandlerDeps = {}) {
  const env = deps.env ?? process.env;
  const config = deps.config ?? readAiConfig(env);
  const limiter = deps.limiter ?? new RateLimiter(config.requestsPerMinute, config.dailyAttempts);
  const cache = deps.cache ?? new ResponseCache();
  const log = deps.log ?? ((event, data) => console.warn(`[ai] ${event}`, data));
  let providers = deps.providers ?? null;

  return async function handle(request: Request): Promise<Response> {
    if (!config.enabled) return fail(new AiError("not_configured", false, 503));
    if (!sameOrigin(request, env)) return fail(new AiError("invalid_request", false, 403));

    let body: AiRequestBody;
    try {
      const parsed = aiRequestSchema.safeParse(await readBody(request));
      if (!parsed.success) return fail(new AiError("invalid_request", false, 400));
      body = parsed.data;
    } catch (error) {
      return fail(error instanceof AiError ? error : new AiError("invalid_request", false, 400));
    }

    const context = body.context as AiContext;
    if (context.source === "uploaded" && !config.allowUploadedData) return fail(new AiError("privacy", false, 403));
    if (violatesPrivacy(context)) return fail(new AiError("privacy", false, 403));
    if (context.evidence.length === 0) return fail(new AiError("invalid_request", false, 422));
    const question = body.mode === "methodologist" ? redactQuestion(body.question ?? "") : null;
    if (body.mode === "methodologist" && !question?.trim()) return fail(new AiError("invalid_request", false, 400));

    const cacheKey = createHash("sha256").update(JSON.stringify({ m: body.mode, l: body.locale, q: question, c: context })).digest("hex");
    const hit = cache.get(cacheKey);
    if (hit) return json(hit);

    if (!limiter.allowRequest(clientKey(request))) return fail(new AiError("rate_limited", true, 429));
    if (!limiter.hasBudget()) return fail(new AiError("quota", false, 429));

    providers ??= createProviders(config);
    const mode = body.mode as AiMode;
    const system = systemPrompt(mode, context.page, body.locale as Parameters<typeof systemPrompt>[2]);
    const jsonSchema = mode === "report" ? reportJsonSchema : insightJsonSchema;
    let user = dataMessage(context, question);

    // Вторая попытка — только если ответ не прошёл проверку достоверности.
    for (let round = 0; round < 2; round++) {
      try {
        const run = await generateWithFallback(
          providers,
          { system, user, jsonSchema, maxOutputTokens: Math.min(config.maxOutputTokens, mode === "report" ? 2_400 : 1_600) },
          { timeoutMs: config.timeoutMs, retries: 1, backoffMs: 600, sleep: deps.sleep, onAttempt: () => limiter.spendAttempt() },
        );
        let raw: unknown;
        try {
          raw = JSON.parse(run.text);
        } catch {
          throw new AiValidationError("schema", "json");
        }
        const result = validateAiOutput(mode, raw, context);
        const success: AiSuccess = { ok: true, mode, result, provider: run.provider, model: run.model, cached: false };
        cache.set(cacheKey, success);
        log("ok", { mode, page: context.page, provider: run.provider, attempts: run.attempts, round });
        return json(success);
      } catch (error) {
        if (error instanceof AiValidationError) {
          log("invalid_output", { mode, reason: error.reason, detail: error.detail.slice(0, 60), round });
          if (round === 0 && limiter.hasBudget()) {
            user = `${dataMessage(context, question)}\n\nYour previous answer was rejected by validation (${error.reason}: ${error.detail.slice(0, 40)}). Cite only existing evidence ids and copy numbers exactly from the evidence, or omit them.`;
            continue;
          }
          return fail(new AiError("invalid_response", false, 502));
        }
        const aiError = error instanceof AiError ? error : new AiError("unavailable", true, 503);
        log("provider_error", { mode, code: aiError.code });
        return fail(aiError);
      }
    }
    return fail(new AiError("invalid_response", false, 502));
  };
}
