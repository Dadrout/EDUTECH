"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { LEVEL_META, StatusBadge, STATUS_META } from "@/components/common/levels";
import { RateBar } from "@/components/common/blocks";
import { Alert, AlertDescription } from "@/components/ui/misc";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { classifyLevel } from "@/lib/analytics/stats";
import { computeTopicDetail, type BreakdownRow, type TopicStats } from "@/lib/analytics/topics";
import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord } from "@/lib/domain/types";
import { formatCi, formatDate, formatInt, formatPct } from "@/lib/format";

function BreakdownTable({ title, rows, config, minNote }: { title: string; rows: BreakdownRow[]; config: AnalysisConfig; minNote: string }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold">{title}</h3>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Группа</th>
              <th className="px-3 py-2 text-right font-medium">Уч.</th>
              <th className="w-[38%] px-3 py-2 text-left font-medium">Успешность</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const level = r.sufficient ? classifyLevel(r.estimate?.rate ?? null, config.thresholds) : "insufficient";
              return (
                <tr key={r.id}>
                  <td className="max-w-0 truncate px-3 py-2" title={r.label}>
                    {r.label}
                  </td>
                  <td className="px-3 py-2 text-right tabular">{formatInt(r.students)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-12 font-medium tabular">{formatPct(r.estimate?.rate, 0)}</span>
                      <RateBar rate={r.estimate?.rate ?? null} color={LEVEL_META[level].color} thresholds={config.thresholds} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some((r) => !r.sufficient) ? <p className="mt-1.5 text-[11px] text-muted-foreground">Серым — {minNote}.</p> : null}
    </div>
  );
}

/** Детализация темы: где именно возникают трудности. */
export function TopicDetailSheet({
  topic,
  records,
  config,
  onClose,
}: {
  topic: TopicStats | null;
  records: AnswerRecord[];
  config: AnalysisConfig;
  onClose: () => void;
}) {
  const detail = React.useMemo(() => (topic ? computeTopicDetail(records, topic.key, config) : null), [topic, records, config]);

  return (
    <Sheet open={topic !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="right" className="gap-0 overflow-y-auto">
        {topic && detail ? (
          <>
            <SheetHeader className="border-b">
              <div className="text-xs text-muted-foreground">
                {topic.subject} · {topic.grade} класс · {topic.topicId}
              </div>
              <SheetTitle className="text-lg">{topic.topicName}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusBadge status={topic.status} />
                  <span className="text-xs">{STATUS_META[topic.status].hint}</span>
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-1 gap-6 p-5">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                {[
                  ["Успешность", formatPct(topic.rate)],
                  ["95% ДИ", formatCi(topic.estimate?.ciLow, topic.estimate?.ciHigh)],
                  ["Учеников", formatInt(topic.students)],
                  ["Ответов / заданий", `${formatInt(topic.answers)} / ${formatInt(topic.questions)}`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-card px-3 py-2.5">
                    <dt className="text-[11px] text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold tabular">{value}</dd>
                  </div>
                ))}
              </dl>

              {topic.sampleNote ? (
                <Alert variant="warning">
                  <AlertTriangle aria-hidden />
                  <AlertDescription>
                    <p>{topic.sampleNote} Выводы о сложности темы не делаются.</p>
                  </AlertDescription>
                </Alert>
              ) : null}

              <BreakdownTable title="По классам" rows={detail.byClass} config={config} minNote={`меньше ${config.minStudentsPerCell} учеников`} />
              <BreakdownTable title="По учебникам" rows={detail.byTextbook} config={config} minNote={`меньше ${config.minStudentsPerGroup} учеников`} />

              <div>
                <h3 className="mb-1 text-[13px] font-semibold">Задания темы — от самых трудных</h3>
                <p className="mb-2 text-xs text-muted-foreground">Помогает понять, какие именно умения не сформированы.</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-[13px]">
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Тест · задание</th>
                        <th className="px-3 py-2 text-left font-medium">Дата</th>
                        <th className="px-3 py-2 text-right font-medium">Ответов</th>
                        <th className="px-3 py-2 text-right font-medium">Верно</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.questions.slice(0, 12).map((q) => (
                        <tr key={`${q.testId}-${q.questionId}`}>
                          <td className="px-3 py-2 font-mono text-xs">
                            {q.testId} · {q.questionId}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(q.testDate)}</td>
                          <td className="px-3 py-2 text-right tabular">{formatInt(q.answers)}</td>
                          <td className="px-3 py-2 text-right font-medium tabular">{formatPct(q.rate, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.questions.length > 12 ? <p className="mt-1.5 text-[11px] text-muted-foreground">Показаны 12 из {detail.questions.length} заданий.</p> : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
