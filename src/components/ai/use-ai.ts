"use client";

import * as React from "react";
import { useI18n } from "@/i18n/provider";
import { requestAi, useAiStatus, type AiAnswer } from "@/lib/ai/client";
import type { AiContext } from "@/lib/ai/context";
import type { AiInsight, AiMode, AiReportInsights } from "@/lib/ai/schema";

export type Availability = "loading" | "ready" | "off" | "uploaded_off" | "no_data";

/** Можно ли отправлять этот контекст: сервер настроен, политика приватности, есть агрегаты. */
export function useAiAvailability(context: AiContext | null): Availability {
  const status = useAiStatus();
  if (status === undefined) return "loading";
  if (!status?.enabled) return "off";
  if (!context || context.evidence.length === 0) return "no_data";
  if (context.source === "uploaded" && !status.allowUploadedData) return "uploaded_off";
  return "ready";
}

type Result<M extends AiMode> = AiAnswer<M extends "report" ? AiReportInsights : AiInsight>;

/** Состояние одного запроса: последний ответ без истории сообщений. */
export function useAiRequest<M extends AiMode>(mode: M) {
  const { locale } = useI18n();
  const [state, setState] = React.useState<{ busy: boolean; error: unknown; answer: Result<M> | null; context: AiContext | null }>({ busy: false, error: null, answer: null, context: null });
  const last = React.useRef<{ context: AiContext; question?: string } | null>(null);
  const seq = React.useRef(0);

  const run = React.useCallback(
    async (context: AiContext, question?: string, refresh = false) => {
      const id = ++seq.current;
      last.current = { context, question };
      setState({ busy: true, error: null, answer: null, context });
      try {
        const answer = await requestAi(mode, context, locale, question, { refresh });
        if (id === seq.current) setState({ busy: false, error: null, answer: answer as Result<M>, context });
      } catch (error) {
        if (id === seq.current) setState({ busy: false, error, answer: null, context });
      }
    },
    [mode, locale],
  );

  const retry = React.useCallback(() => {
    if (last.current) void run(last.current.context, last.current.question, true);
  }, [run]);

  const reset = React.useCallback(() => {
    seq.current += 1;
    setState({ busy: false, error: null, answer: null, context: null });
  }, []);

  return { ...state, run, retry, reset };
}
