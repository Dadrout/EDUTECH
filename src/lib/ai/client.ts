"use client";

/**
 * Браузерная часть AI: статус сервера и запросы к /api/ai. Кэш — в sessionStorage
 * по хэшу обезличенного контекста, чтобы повтор не тратил лимит провайдера.
 */
import * as React from "react";
import type { AiPublicStatus } from "./config";
import type { AiContext } from "./context";
import type { AiErrorCode } from "./providers";
import type { AiInsight, AiMode, AiReportInsights } from "./schema";

export interface AiAnswer<T> {
  result: T;
  provider: string;
  model: string;
  cached: boolean;
}

export class AiRequestError extends Error {
  constructor(public readonly code: AiErrorCode | "network") {
    super(code);
  }
}

let statusPromise: Promise<AiPublicStatus | null> | null = null;
function loadStatus(): Promise<AiPublicStatus | null> {
  statusPromise ??= fetch("/api/ai", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<AiPublicStatus>) : null))
    .catch(() => null);
  return statusPromise;
}

/** Статус AI на сервере: undefined — загружается, null — недоступен. */
export function useAiStatus(): AiPublicStatus | null | undefined {
  const [status, setStatus] = React.useState<AiPublicStatus | null | undefined>(undefined);
  React.useEffect(() => {
    let alive = true;
    void loadStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function requestAi<M extends AiMode>(
  mode: M,
  context: AiContext,
  locale: string,
  question?: string,
  options: { refresh?: boolean } = {},
): Promise<AiAnswer<M extends "report" ? AiReportInsights : AiInsight>> {
  const body = JSON.stringify({ mode, locale, context, ...(question ? { question } : {}) });
  const key = `bilimlens:ai:${await digest(body)}`;
  if (!options.refresh) {
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return { ...JSON.parse(cached), cached: true };
    } catch {
      // Хранилище недоступно — просто запрашиваем заново.
    }
  }
  let response: Response;
  try {
    response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  } catch {
    throw new AiRequestError("network");
  }
  const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: AiErrorCode; result?: unknown; provider?: string; model?: string } | null;
  if (!response.ok || !data?.ok) throw new AiRequestError(data?.error ?? "unavailable");
  const answer = { result: data.result, provider: data.provider ?? "", model: data.model ?? "", cached: false } as AiAnswer<M extends "report" ? AiReportInsights : AiInsight>;
  try {
    sessionStorage.setItem(key, JSON.stringify(answer));
  } catch {
    // Без кэша.
  }
  return answer;
}
