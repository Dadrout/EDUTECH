"use client";

import * as React from "react";
import { FileDown, FileText } from "lucide-react";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, KpiTile, PageHeader, Section } from "@/components/common/blocks";
import { FilterBar } from "@/components/common/filter-bar";
import { StatusBadge } from "@/components/common/levels";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { buildReport, type DataQualityKind } from "@/lib/report/report";
import { filterRecords } from "@/lib/analytics/filters";
import { analyzeSkills } from "@/lib/analytics/skills";
import { formatCi, formatDate, formatHours, formatHoursDelta, formatInt, formatPct, formatPpRange } from "@/lib/format";
import { useReadyData } from "@/providers/data-provider";
import { ErrorBars, QuestionTable } from "./skills-view";

function ReportContent() {
  const { dataset, filters, config } = useReadyData();
  const { m, t } = useI18n();
  // LocaleScope remounts the view when the language changes, including explanations.
  const report = React.useMemo(() => buildReport(dataset, { subject: filters.subject, grade: filters.grade }, config), [dataset, filters.subject, filters.grade, config]);
  const errors = React.useMemo(() => report.skills ?? analyzeSkills(filterRecords(dataset.records, filters, ["subject", "grade"]), config), [report, dataset.records, filters, config]);
  const r = m.reports;
  const qualityLabels: Record<DataQualityKind, string> = {
    synthetic: r.synthetic, excluded_rows: r.excludedRows, duplicates_removed: r.duplicatesRemoved,
    insufficient_topics: r.insufficientTopics, no_curriculum: r.noCurriculum,
    courses_without_plan: r.coursesWithoutPlan, no_skill_data: r.noSkills,
    partial_skill_data: r.partialSkills, single_class_textbooks: r.singleClassTextbooks,
  };
  const estimate = report.performance.estimate;
  const course = (subject: string, grade: number) => t(m.units.course, { subject, grade });
  if (report.sample.answers === 0) return <EmptyState icon={FileText} title={r.noData} description={m.common.changeFilters} />;
  return (
    <article className="report-document grid min-w-0 gap-6" aria-label={r.title}>
      <div className="report-toolbar flex flex-wrap items-center justify-between gap-3" data-print-hide>
        <p className="max-w-3xl text-sm text-muted-foreground">{r.scopeNote}</p>
        <Button onClick={() => window.print()}><FileDown aria-hidden />{r.exportPdf}</Button>
      </div>
      <div className="report-masthead flex flex-wrap justify-between gap-3 border-b pb-5">
        <div><p className="text-lg font-semibold">BilimLens · {r.title}</p><p className="mt-1 text-sm text-muted-foreground">{report.sample.datasetName}</p></div>
        <div className="text-sm text-muted-foreground"><p>{filters.subject ?? m.filters.allSubjects} · {filters.grade === null ? m.filters.allGrades : t(m.units.grade, { grade: filters.grade })}</p><p>{t(r.generatedAt, { date: formatDate(report.generatedAt) })}</p></div>
      </div>
      {report.sample.isSynthetic ? <p role="note" className="rounded-lg border border-level-medium/40 bg-level-medium-bg px-4 py-3 text-sm text-level-medium-fg">{r.synthetic}</p> : null}
      <Section title={r.sample}>
        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4">
          <KpiTile label={m.topics.colStudents} value={formatInt(report.sample.students)} />
          <KpiTile label={m.topics.colAnswers} value={formatInt(report.sample.answers)} />
          <KpiTile label={m.filters.classId} value={formatInt(report.sample.classes)} />
          <KpiTile label={m.skills.colTopic} value={formatInt(report.sample.topics)} />
        </div>
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">{formatDate(report.sample.dateFrom)} — {formatDate(report.sample.dateTo)}</p>
      </Section>
      <Section title={r.performance}>
        <div className="flex flex-wrap items-start gap-6 p-5">
          <div><p className="text-3xl font-semibold tracking-tight">{formatPct(estimate?.rate)}</p><p className="mt-1 text-xs text-muted-foreground">{m.units.ci}: {formatCi(estimate?.ciLow, estimate?.ciHigh)}</p></div>
          <ul className="flex flex-wrap gap-3">{Object.entries(report.performance.statusCounts).map(([status, count]) => <li key={status} className="flex items-center gap-2"><StatusBadge status={status as keyof typeof report.performance.statusCounts} /><span className="text-sm font-semibold">{formatInt(count)}</span></li>)}</ul>
        </div>
        {report.insights.length > 0 ? <ul className="divide-y border-t">{report.insights.map((insight, index) => <li key={index} className="px-5 py-3"><p className="text-sm font-medium">{insight.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.detail}</p></li>)}</ul> : null}
      </Section>
      <Section title={r.problemTopics}>
        {report.problemTopics.length ? <div className="overflow-x-auto"><table className="report-table w-full min-w-[620px] text-sm"><thead><tr><th>{m.topics.colTopic}</th><th>{m.topics.colStudents}</th><th>{m.topics.colAnswers}</th><th>{m.topics.colRate}</th><th>{m.topics.colStatus}</th></tr></thead><tbody>{report.problemTopics.map(topic => <tr key={topic.key}><td><span className="font-medium">{topic.topicName}</span><p className="text-xs text-muted-foreground">{course(topic.subject, topic.grade)}</p></td><td>{formatInt(topic.students)}</td><td>{formatInt(topic.answers)}</td><td>{formatPct(topic.rate)}<p className="text-xs text-muted-foreground">{formatCi(topic.estimate?.ciLow, topic.estimate?.ciHigh)}</p></td><td><StatusBadge status={topic.status} /></td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-muted-foreground">{r.noProblems}</p>}
      </Section>
      <Section title={r.textbooks} description={r.comparisonNote}>
        {report.textbooks.length ? <div className="divide-y">{report.textbooks.map(c => <div key={course(c.subject, c.grade)} className="p-5"><h3 className="mb-3 text-sm font-semibold">{course(c.subject, c.grade)}</h3><ul className="grid gap-4">{c.result.verdicts.map(verdict => <li key={verdict.textbookId}><p className="text-sm font-medium">{c.textbookNames[verdict.textbookId]} / {c.textbookNames[verdict.referenceId]}</p><p className="mt-1 text-sm">{m.textbooks.verdict[verdict.level]} · {verdict.summary}</p>{verdict.diff ? <p className="text-xs text-muted-foreground">{m.units.ci}: {formatPpRange(verdict.diff.ciLow, verdict.diff.ciHigh)}</p> : null}<ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-muted-foreground">{verdict.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></li>)}</ul>{c.result.warnings.map((warning, i) => <p key={i} className="mt-2 text-xs text-muted-foreground">{warning}</p>)}</div>)}</div> : <p className="p-5 text-sm text-muted-foreground">{r.noComparisons}</p>}
      </Section>
      <Section title={r.errorAnalysis}>
        {report.skills ? <div className="grid gap-4 p-5"><p className="text-sm">{m.skills.colAnswers}: {formatInt(report.skills.coverage.answers)} · {m.skills.colSkill}: {formatInt(report.skills.coverage.withSkill)}</p><div className="overflow-x-auto"><table className="report-table w-full text-sm"><thead><tr><th>{m.skills.colSkill}</th><th>{m.topics.colStudents}</th><th>{m.skills.colAnswers}</th><th>{m.skills.colRate}</th></tr></thead><tbody>{report.skills.skills.map(skill => <tr key={skill.key}><td>{skill.skill}<p className="text-xs text-muted-foreground">{skill.topicName}</p></td><td>{formatInt(skill.students)}</td><td>{formatInt(skill.answers)}</td><td>{formatPct(skill.rate)}{!skill.sufficient ? <p className="text-xs text-muted-foreground">{m.topics.insufficientData}</p> : null}</td></tr>)}</tbody></table></div></div> : <p className="p-5 text-sm text-muted-foreground">{r.noSkills}</p>}
        {errors.coverage.hasErrorTypes ? <div className="border-t p-5"><h3 className="mb-3 text-sm font-semibold">{m.skills.errorsTitle}</h3><ErrorBars errors={errors.errorTypes} /></div> : null}
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">{m.reports.questionsNote}</p>
        <QuestionTable questions={errors.questions} thresholds={config.thresholds} showSkill={errors.coverage.hasSkills} showTopic={true} previewLimit={Infinity} />
      </Section>
      <Section title={r.hours} description={r.hoursNote}>
        {report.hours.length ? <div className="divide-y">{report.hours.map(c => <div key={course(c.subject, c.grade)} className="p-5"><h3 className="mb-3 text-sm font-semibold">{course(c.subject, c.grade)}</h3>{c.unplannedTopics > 0 ? <p className="mb-3 text-sm text-level-medium-fg">{r.unplannedTopics}: {formatInt(c.unplannedTopics)}</p> : null}{c.plan.ok ? <><p className="mb-3 text-xs text-muted-foreground">{r.budget}: {formatHours(c.plan.budgetHours)} · {r.reserve}: {formatHours(c.plan.reserveHours)}</p><div className="overflow-x-auto"><table className="report-table w-full min-w-[580px] text-sm"><thead><tr><th>{m.hours.colTopic}</th><th>{r.baseline}</th><th>{r.recommended}</th><th>{m.hours.colReason}</th></tr></thead><tbody>{c.plan.rows.map(row => <tr key={row.key}><td>{row.topicName}</td><td className="whitespace-nowrap">{formatHours(row.currentHours)}</td><td className="whitespace-nowrap">{formatHours(row.recommendedHours)}<p className="text-xs text-muted-foreground">{formatHoursDelta(row.changeHours)}</p></td><td className="max-w-md text-xs text-muted-foreground">{row.reasons.join(" ")}</td></tr>)}</tbody></table></div>{c.plan.warnings.map((warning, i) => <p key={i} className="mt-2 text-xs text-muted-foreground">{warning}</p>)}</> : <p className="text-sm text-destructive">{c.plan.message} {c.plan.details.join(" ")}</p>}</div>)}</div> : <p className="p-5 text-sm text-muted-foreground">{r.noHours}</p>}
      </Section>
      <Section title={r.limitations}><ul className="grid list-inside list-disc gap-2 p-5 text-sm text-muted-foreground">{report.quality.map(item => <li key={item.kind}>{qualityLabels[item.kind]} <span className="font-medium text-foreground">{formatInt(item.count)}</span></li>)}<li>{r.comparisonNote}</li><li>{r.hoursNote}</li></ul></Section>
    </article>
  );
}

export function ReportsView() {
  const { m } = useI18n();
  return <div className="grid min-w-0 gap-5"><div data-print-hide><PageHeader title={m.reports.title} description={m.reports.description} /></div><DataGate><div data-print-hide><FilterBar fields={["subject", "grade"]} /></div><ReportContent /></DataGate></div>;
}
