"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import type { AiContext, EvidenceItem } from "@/lib/ai/context";
import { AiRequestError } from "@/lib/ai/client";
import { describeEvidence } from "@/lib/ai/evidence";
import type { AiInsight } from "@/lib/ai/schema";
import { cn } from "@/lib/utils";
import type { Messages } from "@/i18n/messages/ru";

function Refs({ ids, context }: { ids: string[]; context: AiContext }) {
  const { m, t } = useI18n();
  const items = ids.map((id) => context.evidence.find((e) => e.id === id)).filter((e): e is EvidenceItem => Boolean(e));
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {items.map((e) => {
        const d = describeEvidence(e, m, t);
        return (
          <span key={e.id} className="inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground" title={`${d.title} — ${d.values}`}>
            <span className="min-w-0 truncate">{d.title}</span>
            {d.values ? <span className="shrink-0 font-medium text-foreground tabular">{d.values.split(" · ")[0]}</span> : null}
          </span>
        );
      })}
    </span>
  );
}

/** Ответ AI: кратко + разворачиваемые подробности + данные, на которых он основан. */
export function AiInsightView({ insight, context, source, cached, compact = false }: { insight: AiInsight; context: AiContext; source: string; cached: boolean; compact?: boolean }) {
  const { m, t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const cited = [...new Set([...insight.facts, ...insight.hypotheses, ...insight.recommendations].flatMap((x) => x.evidence))];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <p className={cn("leading-relaxed", compact ? "text-sm" : "text-[15px]")}>{insight.answer}</p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-fit items-center gap-1 rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {open ? m.ai.less : m.ai.more}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-l-2 border-border pl-3 text-[13px] leading-relaxed">
          {insight.facts.length ? (
            <section>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{m.ai.facts}</h4>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {insight.facts.map((f, i) => (
                  <li key={i}>
                    {f.text}
                    <Refs ids={f.evidence} context={context} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {insight.hypotheses.length ? (
            <section>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{m.ai.hypotheses}</h4>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {insight.hypotheses.map((h, i) => (
                  <li key={i} className="italic">
                    {h.text}
                    <Refs ids={h.evidence} context={context} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {insight.recommendations.length ? (
            <section>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{m.ai.recommendations}</h4>
              <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {insight.recommendations.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{r.action}</span> <span className="text-xs text-muted-foreground">· {m.ai.priority[r.priority]}</span>
                    <p className="text-muted-foreground">{r.reason}</p>
                    <Refs ids={r.evidence} context={context} />
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <section>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{m.ai.limitations}</h4>
            <ul className="list-disc pl-4 text-muted-foreground">
              {insight.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
          {cited.length ? (
            <section>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{m.ai.evidence}</h4>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1 text-xs">
                {cited.map((id) => {
                  const e = context.evidence.find((x) => x.id === id);
                  if (!e) return null;
                  const d = describeEvidence(e, m, t);
                  return (
                    <li key={id} className="flex flex-wrap justify-between gap-x-3">
                      <span>{d.title}</span>
                      <span className="text-muted-foreground tabular">{d.values}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
      <AiFootnote source={source} cached={cached} />
    </div>
  );
}

export function AiFootnote({ source, cached }: { source: string; cached: boolean }) {
  const { m } = useI18n();
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <Sparkles className="size-3" aria-hidden />
      <span>{m.ai.label}</span>
      <span>· {source}</span>
      {cached ? <span>· {m.ai.cached}</span> : null}
      <span className="basis-full">{m.ai.disclaimer}</span>
    </p>
  );
}

export function AiError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { m } = useI18n();
  const code = error instanceof AiRequestError ? error.code : "unavailable";
  const retryable = !["not_configured", "auth", "privacy", "quota", "invalid_request"].includes(code);
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-level-medium-fg">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span>{m.ai.errors[code as keyof Messages["ai"]["errors"]] ?? m.ai.errors.unavailable}</span>
      {retryable && onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden />
          {m.ai.retry}
        </Button>
      ) : null}
    </div>
  );
}
