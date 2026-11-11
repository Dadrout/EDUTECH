/**
 * Конфигурация AI из серверных переменных окружения (никаких NEXT_PUBLIC_*).
 * Ключи читаются только на сервере и никогда не попадают в ответы API.
 */
import { createGeminiProvider, createGroqProvider, type AiProvider, type ProviderId } from "./providers";

export type AiEnv = Record<string, string | undefined>;

/** Модели по умолчанию. Список через запятую — порядок попыток внутри провайдера. */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-3.8-flash,gemini-3.5-flash",
  groq: "openai/gpt-oss-120b",
};

const int = (value: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export interface AiConfig {
  enabled: boolean;
  /** Порядок провайдеров: основной, затем резервный (если разрешён и настроен). */
  order: { id: ProviderId; model: string; key: string }[];
  /** Разрешена ли отправка агрегатов загруженных (не синтетических) данных. */
  allowUploadedData: boolean;
  requestsPerMinute: number;
  dailyAttempts: number;
  timeoutMs: number;
  maxOutputTokens: number;
}

export function readAiConfig(env: AiEnv = process.env): AiConfig {
  const primary: ProviderId = env.AI_PRIMARY_PROVIDER === "groq" ? "groq" : "gemini";
  const secondary: ProviderId = primary === "gemini" ? "groq" : "gemini";
  const key = (id: ProviderId) => (id === "gemini" ? env.GEMINI_API_KEY : env.GROQ_API_KEY)?.trim() ?? "";
  const model = (id: ProviderId) => (id === "gemini" ? env.GEMINI_MODEL : env.GROQ_MODEL)?.trim() || DEFAULT_MODELS[id];
  const ids: ProviderId[] = env.AI_FALLBACK_ENABLED === "false" ? [primary] : [primary, secondary];
  const order = ids
    .filter((id) => key(id))
    .flatMap((id) =>
      model(id)
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((m) => ({ id, model: m, key: key(id) })),
    );
  return {
    enabled: env.AI_ENABLED !== "false" && order.length > 0,
    order,
    allowUploadedData: env.AI_ALLOW_UPLOADED_DATA === "true",
    requestsPerMinute: int(env.AI_REQUESTS_PER_MINUTE, 6, 1, 60),
    dailyAttempts: int(env.AI_DAILY_ATTEMPT_LIMIT, 200, 1, 5000),
    timeoutMs: int(env.AI_TIMEOUT_MS, 20_000, 3_000, 60_000),
    maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 2_400, 512, 8_192),
  };
}

export function createProviders(config: AiConfig): AiProvider[] {
  return config.order.map(({ id, model, key }) => (id === "gemini" ? createGeminiProvider(key, model) : createGroqProvider(key, model)));
}

/** Безопасный статус для браузера: без ключей и без внутренних лимитов. */
export interface AiPublicStatus {
  enabled: boolean;
  providers: { id: ProviderId; model: string }[];
  allowUploadedData: boolean;
}

export function publicStatus(config: AiConfig): AiPublicStatus {
  return { enabled: config.enabled, providers: config.order.map(({ id, model }) => ({ id, model })), allowUploadedData: config.allowUploadedData };
}
