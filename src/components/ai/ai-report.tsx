"use client";

import * as React from "react";
import { ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import type { AiAnswer } from "@/lib/ai/client";
import type { AiContext } from "@/lib/ai/context";
import { describeEvidence } from "@/lib/ai/evidence";
import type { AiReportInsights } from "@/lib/ai/schema";
import { cn } from "@/lib/utils";
import { AiError, AiFootnote } from "./ai-result";
import { useAiAvailability } from "./use-ai";

function EvidenceLine({ ids, context }: { ids: string[]; context: AiContext }) {
  const { m, t } = useI18n();
  const items = ids.map((id) => context.evidence.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {m.ai.evidence}:{" "}
      {items
        .map((e) => {
          const d = describeEvidence(e, m, t);
          return `${d.title} — ${d.values}`;
        })
        .join("; ")}
    </p>
  );
}

/** AI-интерпретация отчёта: генерация по кнопке, результат уходит и в PDF. */
export function AiReportSection({
  context,
  request,
}: {
  context: AiContext;
  request: { busy: boolean; error: unknown; answer: AiAnswer<AiReportInsights> | null; run: (c: AiContext) => Promise<void>; retry: () => void };
}) {
  const { m } = useI18n();
  const availability = useAiAvailability(context);
  const [open, setOpen] = React.useState(false);
  if (availability === "loading") return null;
  const blocked = availability !== "ready";
  const answer = request.answer;
  const r = answer?.result;

  return (
    <section aria-label={m.ai.reportTitle} className="rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" aria-hidden />
            {m.ai.reportTitle}
          </p>
          {!r ? <p className="mt-0.5 text-xs text-muted-foreground">{blocked ? m.ai.status[availability === "off" ? "off" : availability === "uploaded_off" ? "uploadedOff" : "noData"] : m.ai.reportHint}</p> : null}
        </div>
        {!blocked && !r ? (
          <Button size="sm" variant="outline" disabled={request.busy} onClick={() => void request.run(context)}>
            {request.busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {request.busy ? m.ai.generating : m.ai.reportGenerate}
          </Button>
        ) : null}
      </div>
      {request.error ? (
        <div className="mt-2">
          <AiError error={request.error} onRetry={request.retry} />
        </div>
      ) : null}
      {r && answer ? (
        <div className="mt-3 grid gap-3">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground">{m.ai.executiveSummary}</h3>
            <p className="mt-1 text-sm leading-relaxed">{r.executiveSummary}</p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-3">
            {r.keyFindings.map((f, i) => (
              <li key={i} className="rounded-md bg-secondary/60 p-3 text-[13px]">
                <p className="font-medium">{f.problem}</p>
                <p className="mt-1 text-muted-foreground">{f.significance}</p>
                <EvidenceLine ids={f.evidence} context={context} />
              </li>
            ))}
          </ol>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex w-fit items-center gap-1 rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {m.ai.recommendations} · {m.ai.limitations}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          {open ? (
            <div className="grid gap-3 border-l-2 border-border pl-3 text-[13px]">
              <ol className="grid gap-2">
                {r.recommendations.map((x, i) => (
                  <li key={i}>
                    <span className="font-medium">{x.action}</span> <span className="text-xs text-muted-foreground">· {m.ai.priority[x.priority]}</span>
                    <p className="text-muted-foreground">
                      {m.ai.why}: {x.why}
                    </p>
                    <EvidenceLine ids={x.evidence} context={context} />
                  </li>
                ))}
              </ol>
              <ul className="list-disc pl-4 text-muted-foreground">
                {r.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-primary">{m.ai.inPdf}</p>
          <AiFootnote source={`${answer.provider} · ${answer.model}`} cached={answer.cached} />
        </div>
      ) : null}
    </section>
  );
}
