"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { LoaderCircle, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/provider";
import { buildAiContext, type AiPage } from "@/lib/ai/context";
import type { AiInsight } from "@/lib/ai/schema";
import { useData } from "@/providers/data-provider";
import { AiError, AiInsightView } from "./ai-result";
import { useAiAvailability, useAiRequest } from "./use-ai";

const QUESTION_MAX = 300;

export function pageFromPath(pathname: string): AiPage {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  if (first === "") return "overview";
  return (["topics", "skills", "textbooks", "hours", "simulator", "reports"] as const).find((p) => p === first) ?? "other";
}

/** Компактная панель AI-методиста: контекст страницы, готовые вопросы, один актуальный ответ. */
export function AiMethodologist({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {open ? <Panel /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Panel() {
  const { m, t } = useI18n();
  const { dataset, filters, config } = useData();
  const page = pageFromPath(usePathname());
  const context = React.useMemo(() => (dataset ? buildAiContext({ dataset, filters, config, page }) : null), [dataset, filters, config, page]);
  const availability = useAiAvailability(context);
  const ai = useAiRequest("methodologist");
  const [question, setQuestion] = React.useState("");
  const questions = m.ai.questions[page === "simulator" ? "hours" : page === "reports" || page === "other" ? "overview" : page];
  const scope = [filters.subject, filters.grade !== null ? t(m.units.grade, { grade: filters.grade }) : null, filters.classId].filter(Boolean).join(" · ");

  const ask = (q: string) => {
    const text = q.trim().slice(0, QUESTION_MAX);
    if (!text || !context || availability !== "ready") return;
    setQuestion(text);
    void ai.run(context, text);
  };

  const blocked = availability !== "ready" && availability !== "loading";
  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {m.ai.name}
        </SheetTitle>
        <SheetDescription>
          {t(m.ai.context, { page: m.ai.pages[page] })}
          {scope ? ` · ${scope}` : ""}
        </SheetDescription>
      </SheetHeader>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-5">
        {availability === "loading" ? <p className="text-sm text-muted-foreground">{m.ai.status.loading}</p> : null}
        {blocked ? (
          <p role="note" className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {m.ai.status[availability === "off" ? "off" : availability === "uploaded_off" ? "uploadedOff" : "noData"]}
          </p>
        ) : null}

        {availability === "ready" && !ai.answer && !ai.busy ? <p className="text-sm leading-relaxed text-muted-foreground">{m.ai.scopeHint}</p> : null}

        <div className="grid gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">{m.ai.suggested}</h3>
          <div className="flex flex-wrap gap-2">
            {questions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={availability !== "ready" || ai.busy}
                onClick={() => ask(q)}
                aria-label={`${m.ai.ask}: ${q}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-left text-[13px] outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50"
              >
                <span>{q}</span>
                <Send className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label htmlFor="ai-question" className="text-xs font-medium text-muted-foreground">
            {m.ai.questionLabel}
          </label>
          <textarea
            id="ai-question"
            value={question}
            maxLength={QUESTION_MAX}
            rows={2}
            placeholder={m.ai.questionPlaceholder}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            className="min-h-16 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] leading-snug text-muted-foreground">{m.ai.privacyHint}</p>
            <Button type="submit" size="sm" disabled={availability !== "ready" || ai.busy || !question.trim()}>
              {ai.busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              {m.ai.ask}
            </Button>
          </div>
        </form>

        {ai.busy ? (
          <div className="grid gap-2 border-t pt-4" aria-live="polite" aria-busy="true">
            <p className="text-xs text-muted-foreground">{m.ai.generating}</p>
            <div className="h-3 w-11/12 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
          </div>
        ) : null}
        {ai.error ? (
          <div className="border-t pt-4">
            <AiError error={ai.error} onRetry={ai.retry} />
          </div>
        ) : null}
        {ai.answer && ai.context ? (
          <div className="grid gap-1 border-t pt-4" aria-live="polite">
            <h3 className="text-xs font-medium text-muted-foreground">{m.ai.answer}</h3>
            <AiInsightView insight={ai.answer.result as AiInsight} context={ai.context} source={`${ai.answer.provider} · ${ai.answer.model}`} cached={ai.answer.cached} />
          </div>
        ) : null}
      </div>
    </>
  );
}
