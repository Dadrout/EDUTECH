/**
 * Провайдеры LLM (только сервер). Gemini — официальный SDK @google/genai,
 * Groq — OpenAI-совместимый API. Общая обработка ошибок, тайм-аут, ограниченные
 * повторы и переключение на резервного провайдера ТОЛЬКО при временных сбоях.
 */
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export type ProviderId = "gemini" | "groq";

export type AiErrorCode =
  /** AI выключен или ключ не задан. */
  | "not_configured"
  /** Ключ отклонён (401/403) — без переключения, это ошибка конфигурации. */
  | "auth"
  /** Запрос отклонён провайдером как некорректный (400/404/422) — без переключения. */
  | "invalid_request"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  /** Ответ не прошёл проверку схемы, ссылок или чисел. */
  | "invalid_response"
  /** Данные не разрешено отправлять (политика приватности). */
  | "privacy"
  /** Исчерпан лимит запросов приложения. */
  | "quota";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    public readonly transient: boolean,
    public readonly status: number,
  ) {
    super(`AI_${code.toUpperCase()}`);
    this.name = "AiError";
  }
}

export interface GenerateRequest {
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface AiProvider {
  id: ProviderId;
  model: string;
  generate(request: GenerateRequest, signal: AbortSignal): Promise<string>;
}

/** Классификация ошибки провайдера: временная (можно повторить/переключиться) или нет. */
export function classifyError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return new AiError("timeout", true, 504);
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : NaN;
  if (status === 401 || status === 403) return new AiError("auth", false, 502);
  if (status === 429) return new AiError("rate_limited", true, 429);
  if (status === 408 || status === 504) return new AiError("timeout", true, 504);
  if (status >= 500 && status <= 599) return new AiError("unavailable", true, 503);
  if (status >= 400 && status <= 499) return new AiError("invalid_request", false, 502);
  // Сетевой сбой без HTTP-статуса — временный.
  return new AiError("unavailable", true, 503);
}

export function createGeminiProvider(apiKey: string, model: string, client?: Pick<GoogleGenAI, "models">): AiProvider {
  const sdk = client ?? new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return {
    id: "gemini",
    model,
    async generate(request, signal) {
      const response = await sdk.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: request.jsonSchema,
          maxOutputTokens: request.maxOutputTokens,
          temperature: 0.2,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: signal,
        },
      });
      const text = response.text;
      if (!text) throw new AiError("invalid_response", false, 502);
      return text;
    },
  };
}

export function createGroqProvider(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): AiProvider {
  return {
    id: "groq",
    model,
    async generate(request, signal) {
      const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          reasoning_effort: "low",
          max_completion_tokens: request.maxOutputTokens,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: { type: "json_schema", json_schema: { name: "bilimlens_ai", strict: true, schema: request.jsonSchema } },
        }),
      });
      if (!response.ok) throw { status: response.status };
      const body = (await response.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content) throw new AiError("invalid_response", false, 502);
      return content;
    },
  };
}

export interface RunOptions {
  timeoutMs: number;
  /** Повторов на одного провайдера при временной ошибке (без учёта первой попытки). */
  retries: number;
  backoffMs: number;
  sleep?: (ms: number) => Promise<void>;
  /** Учёт каждой реальной попытки (для дневного лимита расходов). */
  onAttempt?: (provider: ProviderId) => void;
}

export interface RunResult {
  text: string;
  provider: ProviderId;
  model: string;
  attempts: number;
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiError("timeout", true, 504));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Основной провайдер → (при временном сбое) повтор с паузой → резервный провайдер.
 * Ошибки авторизации, некорректного запроса и проверки ответа не переключают провайдера.
 */
export async function generateWithFallback(providers: AiProvider[], request: GenerateRequest, options: RunOptions): Promise<RunResult> {
  if (providers.length === 0) throw new AiError("not_configured", false, 503);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let attempts = 0;
  let last: AiError = new AiError("unavailable", true, 503);
  for (const provider of providers) {
    for (let attempt = 0; attempt <= options.retries; attempt++) {
      attempts += 1;
      options.onAttempt?.(provider.id);
      try {
        const text = await withTimeout(options.timeoutMs, (signal) => provider.generate(request, signal));
        return { text, provider: provider.id, model: provider.model, attempts };
      } catch (error) {
        last = classifyError(error);
        if (!last.transient) throw last;
        // Зависшую модель не повторяем: сразу следующая модель/провайдер. Повтор — только для 429/503.
        if (last.code === "timeout") break;
        if (attempt < options.retries) await sleep(options.backoffMs * 2 ** attempt);
      }
    }
  }
  throw last;
}
