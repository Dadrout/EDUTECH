"use client";

import * as React from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { buildAiContext, type AiPage } from "@/lib/ai/context";
import type { AiInsight } from "@/lib/ai/schema";
import { useReadyData } from "@/providers/data-provider";
import { AiError, AiInsightView } from "./ai-result";
import { useAiAvailability, useAiRequest } from "./use-ai";

/**
 * Один компактный AI-инсайт на странице. Генерация — только по кнопке:
 * смена фильтров ничего не запрашивает, а старый ответ сбрасывается.
 */
export function AiPageInsight({ page }: { page: AiPage }) {
  const { dataset, filters, config } = useReadyData();
  const { m } = useI18n();
  const context = React.useMemo(() => buildAiContext({ dataset, filters, config, page }), [dataset, filters, config, page]);
  const availability = useAiAvailability(context);
  const ai = useAiRequest("insight");
  const { reset } = ai;
  React.useEffect(() => reset(), [context, reset]);

  if (availability === "loading") return null;
  const blocked = availability !== "ready";

  return (
    <section aria-label={m.ai.insightTitle} className="rounded-lg border bg-card px-4 py-3" data-print-hide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="text-sm font-medium">{m.ai.insightTitle}</span>
          {!ai.answer && !ai.busy ? <span className="hidden text-xs text-muted-foreground sm:inline">{blocked ? m.ai.status[availability === "off" ? "off" : availability === "uploaded_off" ? "uploadedOff" : "noData"] : m.ai.insightHint}</span> : null}
        </div>
        {!blocked && !ai.answer ? (
          <Button size="sm" variant="outline" disabled={ai.busy} onClick={() => void ai.run(context)}>
            {ai.busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {ai.busy ? m.ai.generating : m.ai.explain}
          </Button>
        ) : null}
      </div>
      {blocked ? <p className="mt-1 text-xs text-muted-foreground sm:hidden">{m.ai.status[availability === "off" ? "off" : availability === "uploaded_off" ? "uploadedOff" : "noData"]}</p> : null}
      {ai.busy ? (
        <div className="mt-3 grid gap-2" aria-live="polite" aria-busy="true">
          <span className="sr-only">{m.ai.generating}</span>
          <div className="h-3 w-11/12 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
        </div>
      ) : null}
      {ai.error ? (
        <div className="mt-2">
          <AiError error={ai.error} onRetry={ai.retry} />
        </div>
      ) : null}
      {ai.answer && ai.context ? (
        <div className="mt-2">
          <AiInsightView compact insight={ai.answer.result as AiInsight} context={ai.context} source={`${ai.answer.provider} · ${ai.answer.model}`} cached={ai.answer.cached} />
        </div>
      ) : null}
    </section>
  );
}
