"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, FileDown, FileText, LoaderCircle } from "lucide-react";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, KpiTile, PageHeader, Section } from "@/components/common/blocks";
import { Disclosure, Finding, Pagination, usePagination } from "@/components/common/exploration";
import { FilterBar } from "@/components/common/filter-bar";
import { StatusBadge } from "@/components/common/levels";
import { TopicBarChart } from "@/components/charts/topic-bar-chart";
import { HoursChangeChart } from "@/components/charts/hours-change-chart";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/provider";
import { buildReport, type DataQualityKind } from "@/lib/report/report";
import { filterRecords } from "@/lib/analytics/filters";
import { analyzeSkills } from "@/lib/analytics/skills";
import { computeTopicStats, type TopicStats } from "@/lib/analytics/topics";
import { formatCi, formatDate, formatHours, formatInt, formatPct } from "@/lib/format";
import { useReadyData } from "@/providers/data-provider";
import { ErrorBars, QuestionTable } from "./skills-view";

const resources = new Map<string, Promise<Uint8Array>>();
async function resource(url: string): Promise<Uint8Array> {
  let result = resources.get(url);
  if (!result) {
    result = fetch(url).then(async response => {
      if (!response.ok) throw new Error("PDF asset unavailable");
      return new Uint8Array(await response.arrayBuffer());
    }).catch(error => { resources.delete(url); throw error; });
    resources.set(url, result);
  }
  return result;
}

function TopicEvidence({ topics }: { topics: TopicStats[] }) {
  const { m } = useI18n();
  const p = usePagination(topics, 10);
  return <Section title={m.ux.allData}>
    <div className="overflow-x-auto"><table className="report-table w-full min-w-[600px] text-sm">
      <thead><tr><th>{m.topics.colTopic}</th><th>{m.topics.colStudents}</th><th>{m.topics.colAnswers}</th><th>{m.topics.colRate}</th><th>{m.topics.colStatus}</th></tr></thead>
      <tbody>{p.rows.map(topic => <tr key={topic.key}>
        <td>{topic.topicName}<p className="text-xs text-muted-foreground">{topic.subject} · {topic.grade}</p></td>
        <td>{formatInt(topic.students)}</td><td>{formatInt(topic.answers)}</td>
        <td>{formatPct(topic.rate)}<p className="text-xs text-muted-foreground">{formatCi(topic.estimate?.ciLow, topic.estimate?.ciHigh)}</p></td>
        <td><StatusBadge status={topic.status} /></td>
      </tr>)}</tbody>
    </table></div>
    <Pagination {...p} onPageChange={p.setPage} />
  </Section>;
}

function ReportContent() {
  const { dataset, filters, config, setFilters } = useReadyData();
  const { m, t, locale } = useI18n();
  const records = React.useMemo(() => filterRecords(dataset.records, filters, ["subject", "grade"]), [dataset.records, filters]);
  const topics = React.useMemo(() => computeTopicStats(records, config), [records, config]);
  const errors = React.useMemo(() => analyzeSkills(records, config), [records, config]);
  const report = React.useMemo(() => buildReport(dataset, { subject: filters.subject, grade: filters.grade }, config), [dataset, filters.subject, filters.grade, config]);
  const [busy, setBusy] = React.useState<"report" | "appendix" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const r = m.reports;
  const qualityLabels: Record<DataQualityKind, string> = {
    synthetic: r.synthetic, excluded_rows: r.excludedRows, duplicates_removed: r.duplicatesRemoved,
    insufficient_topics: r.insufficientTopics, no_curriculum: r.noCurriculum,
    courses_without_plan: r.coursesWithoutPlan, no_skill_data: r.noSkills,
    partial_skill_data: r.partialSkills, single_class_textbooks: r.singleClassTextbooks,
  };
  const estimate = report.performance.estimate;
  const course = (subject: string, grade: number) => t(m.units.course, { subject, grade });
  const reliable = topics.some(topic => topic.sufficient);
  const findings = report.insights.filter(insight => reliable || insight.id !== "no-problems");
  const first = findings[0];
  const unplanned = report.hours.reduce((sum, course) => sum + course.unplannedTopics, 0);
  const gapRows = report.problemTopics.slice(0, 6).map(topic => ({
    key: topic.key, name: topic.topicName, context: course(topic.subject, topic.grade),
    rate: topic.rate, ciLow: topic.estimate?.ciLow ?? null, ciHigh: topic.estimate?.ciHigh ?? null,
    level: topic.level, students: topic.students, answers: topic.answers,
  }));
  const firstPlan = report.hours.find(c => c.plan.ok);
  const failedPlans = report.hours.filter(c => !c.plan.ok);

  async function download(appendix: boolean) {
    setBusy(appendix ? "appendix" : "report"); setError(null);
    try {
      const cjk = locale === "zh" || /[\u3400-\u9fff]/u.test(JSON.stringify({ report, topics, questions: errors.questions }));
      const [{ generateReportPdf }, regular, bold, logo, fallback] = await Promise.all([
        import("@/lib/report/pdf"), resource("/fonts/report/NotoSans-Regular.ttf"), resource("/fonts/report/NotoSans-Bold.ttf"), resource("/brand/bilimlens-logo.png"),
        cjk ? resource("/fonts/report/NotoSans-CJK-Fallback.ttf") : Promise.resolve(undefined),
      ]);
      const bytes = await generateReportPdf(report, { fonts: { regular, bold, fallback }, locale, m, logo, appendix, topics, questions: errors.questions });
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }));
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `BilimLens-${appendix ? "appendix" : "report"}-${report.generatedAt.slice(0, 10)}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      const unsupported = reason instanceof Error ? reason.message.match(/PDF_FONT_UNSUPPORTED: (U\+[0-9A-F]+)/) : null;
      setError(unsupported ? t(m.ux.unsupportedGlyph, { code: unsupported[1] }) : m.ux.pdfFailed);
    } finally { setBusy(null); }
  }

  if (report.sample.answers === 0) return <EmptyState icon={FileText} title={r.noData} description={m.common.changeFilters} />;
  return <div className="grid min-w-0 gap-5">
    <Finding title={reliable ? first?.title ?? r.noProblems : m.ux.noReliableFinding} tone={report.problemTopics.length ? "warning" : "default"}>
      <p>{reliable ? first?.detail ?? m.ux.summaryDescription : m.ux.notEnoughData}</p><p className="mt-2 text-xs">{dataset.meta.isSynthetic ? m.data.demoName : report.sample.datasetName} · {formatDate(report.sample.dateFrom)} — {formatDate(report.sample.dateTo)}</p>
    </Finding>
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div><p className="text-sm font-medium">{m.ux.reportFormat}</p><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{r.scopeNote}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void download(false)} disabled={busy !== null}>{busy === "report" ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}{busy === "report" ? m.ux.pdfPreparing : m.ux.downloadReport}</Button>
        <Button variant="outline" onClick={() => void download(true)} disabled={busy !== null}>{busy === "appendix" ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}{busy === "appendix" ? m.ux.pdfPreparing : m.ux.downloadAppendix}</Button>
      </div>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {report.sample.isSynthetic ? <p role="note" className="text-xs text-level-medium-fg">{r.synthetic}</p> : null}
    {unplanned > 0 ? <p role="note" className="text-sm text-level-medium-fg">{r.unplannedTopics}: {formatInt(unplanned)}</p> : null}
    {failedPlans.length > 0 ? <div role="alert" className="rounded-md border border-level-low/30 p-4 text-sm text-level-low-fg"><p className="font-medium">{m.hours.conflictTitle}: {formatInt(failedPlans.length)}</p><p className="mt-1">{failedPlans[0].plan.ok ? "" : failedPlans[0].plan.message}</p></div> : null}
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
      <KpiTile label={r.performance} value={formatPct(estimate?.rate)} sub={`${m.units.ci} ${formatCi(estimate?.ciLow, estimate?.ciHigh)}`} />
      <KpiTile label={r.problemTopics} value={formatInt(report.problemTopics.length)} tone={report.problemTopics.length ? "low" : "default"} />
      <KpiTile label={m.topics.colStudents} value={formatInt(report.sample.students)} /><KpiTile label={m.topics.colAnswers} value={formatInt(report.sample.answers)} sub={m.ux.observations} />
    </div>
    <Tabs defaultValue="summary">
      <div className="overflow-x-auto"><TabsList className="h-auto w-max max-w-none gap-1">
        <TabsTrigger value="summary">{m.ux.executiveSummary}</TabsTrigger><TabsTrigger value="gaps">{m.ux.learningGaps}</TabsTrigger><TabsTrigger value="textbooks">{r.textbooks}</TabsTrigger><TabsTrigger value="hours">{r.hours}</TabsTrigger><TabsTrigger value="actions">{r.limitations}</TabsTrigger>
      </TabsList></div>
      <TabsContent value="summary" className="pt-3">
        <Section title={m.ux.actionableRecommendations}><ul className="divide-y">{findings.slice(1, 4).map(insight => <li key={insight.id} className="p-5"><p className="text-sm font-medium">{insight.title}</p><p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p><Link href={insight.href} onClick={() => { if (insight.scope) setFilters({ subject: insight.scope.subject, grade: insight.scope.grade, classId: null, textbookId: null, topicKey: insight.scope.topicKey ?? null }); }} className="mt-2 inline-flex items-center gap-1 text-sm text-primary">{m.ux.viewDetails}<ArrowRight className="size-3" aria-hidden /></Link></li>)}</ul>{findings.length <= 1 ? <div className="p-5"><Link href="/topics" onClick={() => setFilters({ classId: null, textbookId: null, topicKey: null })} className="text-sm text-primary">{m.ux.inspectTopics} →</Link></div> : null}</Section>
      </TabsContent>
      <TabsContent value="gaps" className="pt-3"><Section title={m.ux.learningGaps} description={t(m.ux.selected, { shown: gapRows.length, total: report.problemTopics.length })}><div className="p-5">{gapRows.length ? <TopicBarChart data={gapRows} thresholds={config.thresholds} ariaLabel={m.ux.learningGaps} /> : <p className="text-sm text-muted-foreground">{reliable ? r.noProblems : m.ux.noReliableFinding}</p>}</div></Section></TabsContent>
      <TabsContent value="textbooks" className="pt-3"><Section title={r.textbooks} description={`${m.ux.comparisonCaution} ${t(m.ux.selected, { shown: Math.min(3, report.textbooks.length), total: report.textbooks.length })}`}><div className="grid gap-4 p-5">{report.textbooks.slice(0, 3).map(c => <div key={course(c.subject, c.grade)}><h3 className="text-sm font-semibold">{course(c.subject, c.grade)}</h3>{c.result.verdicts.slice(0, 2).map(verdict => <p key={verdict.textbookId} className="mt-2 text-sm"><span className="font-medium">{c.textbookNames[verdict.textbookId]} / {c.textbookNames[verdict.referenceId]}</span> — {verdict.summary}</p>)}</div>)}{!report.textbooks.length ? <p>{r.noComparisons}</p> : null}<Link href="/textbooks" className="text-sm text-primary">{m.ux.inspectTextbooks} →</Link></div></Section></TabsContent>
      <TabsContent value="hours" className="pt-3"><Section title={r.hours} description={m.ux.defaultPlan}><div className="p-5">{firstPlan?.plan.ok ? <><p className="mb-3 text-sm font-semibold">{course(firstPlan.subject, firstPlan.grade)} · {r.budget}: {formatHours(firstPlan.plan.budgetHours)}</p><HoursChangeChart rows={firstPlan.plan.rows.filter(row => row.changeHours !== 0).slice(0, 8)} /><p className="mt-2 text-xs text-muted-foreground">{t(m.ux.selected, { shown: 1, total: report.hours.length })}</p></> : <p className="text-sm">{failedPlans.length ? m.hours.conflictTitle : r.noHours}</p>}<Link href="/hours" className="mt-3 inline-block text-sm text-primary">{m.ux.planHours} →</Link></div></Section></TabsContent>
      <TabsContent value="actions" className="pt-3"><Section title={r.limitations}><ul className="grid gap-2 p-5 text-sm text-muted-foreground">{report.quality.map(item => <li key={item.kind}>{qualityLabels[item.kind]}: <span className="font-medium text-foreground">{formatInt(item.count)}</span></li>)}<li>{m.ux.comparisonCaution}</li><li>{m.ux.targetCaution}</li></ul></Section></TabsContent>
    </Tabs>
    <Disclosure title={m.ux.evidence} description={m.ux.appendixFormat} count={topics.length}>
      <TopicEvidence topics={topics} />
      <Section title={r.errorAnalysis}>
        <div className="grid gap-3 p-5"><p className="text-sm">{t(m.ux.errorCoverage, { typed: formatInt(errors.coverage.incorrectWithType), incorrect: formatInt(errors.coverage.incorrect) })}</p>{!errors.coverage.hasSkills ? <p className="text-xs text-muted-foreground">{r.noSkills}</p> : null}{errors.coverage.hasErrorTypes ? <><h3 className="text-sm font-medium">{m.skills.errorsTitle}</h3><ErrorBars errors={errors.errorTypes} limit={8} /></> : null}</div>
        <QuestionTable questions={errors.questions} thresholds={config.thresholds} showSkill={errors.coverage.hasSkills} showTopic />
      </Section>
    </Disclosure>
  </div>;
}

export function ReportsView() {
  const { m } = useI18n();
  return <div className="grid min-w-0 gap-5"><PageHeader title={m.reports.title} description={m.ux.summaryDescription} /><DataGate><FilterBar fields={["subject", "grade"]} /><ReportContent /></DataGate></div>;
}
