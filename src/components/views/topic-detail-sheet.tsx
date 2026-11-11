"use client";

import * as React from "react";
import { Pagination, usePagination } from "@/components/common/exploration";
import { useRouter } from "next/navigation";
import { AlertTriangle, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReadyData } from "@/providers/data-provider";
import { LEVEL_META, StatusBadge, STATUS_META } from "@/components/common/levels";
import { RateBar } from "@/components/common/blocks";
import { Alert, AlertDescription } from "@/components/ui/misc";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { classifyLevel } from "@/lib/analytics/stats";
import { computeTopicDetail, type BreakdownRow, type TopicStats } from "@/lib/analytics/topics";
import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord } from "@/lib/domain/types";
import { formatCi, formatDate, formatInt, formatPct } from "@/lib/format";
import { useI18n } from "@/i18n/provider";

export function BreakdownTable({ title, rows, config, minNote }: { title: string; rows: BreakdownRow[]; config: AnalysisConfig; minNote: string }) {
  const { m, t } = useI18n();
  const p = usePagination(rows, 8);
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold">{title}</h3>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{m.topicDetail.colGroup}</th>
              <th className="px-3 py-2 text-right font-medium">{m.topicDetail.colStudents}</th>
              <th className="w-[38%] px-3 py-2 text-left font-medium">{m.topicDetail.colRate}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {p.rows.map((r) => {
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
      <Pagination {...p} onPageChange={p.setPage} />
      {rows.some((r) => !r.sufficient) ? <p className="mt-1.5 text-[11px] text-muted-foreground">{t(m.topicDetail.greyNote, { note: minNote })}</p> : null}
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
  const { m, t, plural } = useI18n();
  const router = useRouter();
  const { setFilters } = useReadyData();
  const detail = React.useMemo(() => (topic ? computeTopicDetail(records, topic.key, config) : null), [topic, records, config]);
  const questions = React.useMemo(() => detail?.questions ?? [], [detail]);
  const questionPage = usePagination(questions, 12);

  return (
    <Sheet open={topic !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="right" className="gap-0 overflow-y-auto">
        {topic && detail ? (
          <>
            <SheetHeader className="border-b">
              <div className="text-xs text-muted-foreground">
                {t(m.units.courseDot, { subject: topic.subject, grade: topic.grade })} · {topic.topicId}
              </div>
              <SheetTitle className="text-lg">{topic.topicName}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusBadge status={topic.status} />
                  <span className="text-xs">{STATUS_META[topic.status].hint}</span>
                </div>
              </SheetDescription>
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Переход к анализу ошибок с фильтром по этой теме.
                    setFilters({ subject: topic.subject, grade: topic.grade, classId: null, textbookId: null, topicKey: topic.key });
                    router.push("/skills");
                  }}
                >
                  <ScanSearch aria-hidden />
                  {m.skills.openForTopic}
                </Button>
              </div>
            </SheetHeader>

            <div className="grid grid-cols-1 gap-6 p-5">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                {[
                  [m.topicDetail.rate, formatPct(topic.rate)],
                  [m.units.ci, formatCi(topic.estimate?.ciLow, topic.estimate?.ciHigh)],
                  [m.topicDetail.students, formatInt(topic.students)],
                  [m.topicDetail.answersQuestions, `${formatInt(topic.answers)} / ${formatInt(topic.questions)}`],
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
                    <p>{t(m.topicDetail.noConclusion, { note: topic.sampleNote })}</p>
                  </AlertDescription>
                </Alert>
              ) : null}

              <BreakdownTable title={m.topicDetail.byClass} rows={detail.byClass} config={config} minNote={plural(m.counts.fewerStudents, config.minStudentsPerCell)} />
              <BreakdownTable title={m.topicDetail.byTextbook} rows={detail.byTextbook} config={config} minNote={plural(m.counts.fewerStudents, config.minStudentsPerGroup)} />

              <div>
                <h3 className="mb-1 text-[13px] font-semibold">{m.topicDetail.questionsTitle}</h3>
                <p className="mb-2 text-xs text-muted-foreground">{m.topicDetail.questionsHint}</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-[13px]">
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">{m.topicDetail.colTestQuestion}</th>
                        <th className="px-3 py-2 text-left font-medium">{m.topicDetail.colDate}</th>
                        <th className="px-3 py-2 text-right font-medium">{m.topicDetail.colAnswers}</th>
                        <th className="px-3 py-2 text-right font-medium">{m.topicDetail.colCorrect}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {questionPage.rows.map((q) => (
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
                <Pagination {...questionPage} onPageChange={questionPage.setPage} />
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
