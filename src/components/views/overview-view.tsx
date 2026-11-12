"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertOctagon, AlertTriangle, ArrowRight, FlaskConical, Info, type LucideIcon } from "lucide-react";
import { Disclosure, Finding, Pagination, usePagination } from "@/components/common/exploration";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, KpiTile, MethodNote, PageHeader, Section } from "@/components/common/blocks";
import { FilterBar } from "@/components/common/filter-bar";
import { STATUS_META } from "@/components/common/levels";
import { LevelDistribution } from "@/components/charts/level-distribution";
import { TopicBarChart } from "@/components/charts/topic-bar-chart";
import { Button } from "@/components/ui/button";
import { filterRecords } from "@/lib/analytics/filters";
import { computeInsights, insightHref, type Insight, type InsightSeverity } from "@/lib/analytics/insights";
import { computeOverview } from "@/lib/analytics/overview";
import { computeTopicStats } from "@/lib/analytics/topics";
import type { DifficultyStatus } from "@/lib/domain/types";
import { formatCi, formatDate, formatInt, formatPct, formatPercentValue } from "@/lib/format";
import { i18n } from "@/i18n/core";
import { useI18n } from "@/i18n/provider";
import { Rich } from "@/i18n/rich";
import { cn } from "@/lib/utils";
import { useReadyData } from "@/providers/data-provider";

const MAX_CHART_TOPICS = 6;
/** Сколько проблем показывать до раскрытия списка: самые важные идут первыми. */
const INSIGHTS_PREVIEW = 3;

const SEVERITY: Record<InsightSeverity, { Icon: LucideIcon; className: string; readonly label: string }> = {
  critical: { Icon: AlertOctagon, className: "text-level-low", get label() { return i18n().m.overview.severity.critical; } },
  warning: { Icon: AlertTriangle, className: "text-level-medium-fg", get label() { return i18n().m.overview.severity.warning; } },
  info: { Icon: Info, className: "text-primary", get label() { return i18n().m.overview.severity.info; } },
};

export function SyntheticNotice() {
  const { dataset } = useReadyData();
  const { m } = useI18n();
  if (!dataset.meta.isSynthetic) return null;
  return (
    // Пунктир — тот же знак «не окончательно», что и у статуса «Вероятно сложная».
    <div role="note" className="flex items-start gap-2 rounded-lg border border-dashed border-input px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">
      <FlaskConical className="mt-[3px] size-3.5 shrink-0" aria-hidden />
      <p>
        <span className="font-medium text-foreground">{m.notice.title}</span> {m.notice.text}{" "}
        <Link href="/data" className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline">
          {m.notice.link}
        </Link>
      </p>
    </div>
  );
}

function InsightItem({ insight }: { insight: Insight }) {
  const router = useRouter();
  const { setFilters } = useReadyData();
  const { m } = useI18n();
  const meta = SEVERITY[insight.severity];
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <meta.Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} aria-label={meta.label} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug font-medium">{insight.title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{insight.detail}</p>
        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-1 rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => {
            if (insight.scope) setFilters({ subject: insight.scope.subject, grade: insight.scope.grade, classId: null, textbookId: null, topicKey: null });
            router.push(insightHref(insight));
          }}
        >
          {m.common.more}
          <ArrowRight className="size-3" aria-hidden />
        </button>
      </div>
    </li>
  );
}

function StatusSummary({ counts }: { counts: Record<DifficultyStatus, number> }) {
  const order: DifficultyStatus[] = ["difficult", "likely_difficult", "attention", "mastered", "insufficient"];
  const total = order.reduce((s, k) => s + counts[k], 0);
  return (
    <ul className="divide-y">
      {order.map((status) => {
        const meta = STATUS_META[status];
        const n = counts[status];
        return (
          <li key={status} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
            <span className="flex items-center gap-2">
              <meta.Icon
                className={cn(
                  "size-4",
                  meta.variant === "low" && "text-level-low",
                  meta.variant === "medium" && "text-level-medium-fg",
                  meta.variant === "high" && "text-level-high",
                  meta.variant === "none" && "text-muted-foreground",
                )}
                aria-hidden
              />
              {meta.label}
            </span>
            <span className="flex items-center gap-3">
              <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-secondary sm:block" aria-hidden>
                <span className="block h-full rounded-full bg-foreground/40" style={{ width: total ? `${(n / total) * 100}%` : 0 }} />
              </span>
              <span className="w-6 text-right font-semibold tabular">{n}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function OverviewContent() {
  const { dataset, filters, config, courses, setFilters } = useReadyData();
  const router = useRouter();
  const { m, t, plural } = useI18n();
  const records = React.useMemo(() => filterRecords(dataset.records, filters), [dataset.records, filters]);
  const topicStats = React.useMemo(() => computeTopicStats(records, config), [records, config]);
  const overview = React.useMemo(() => computeOverview(records, topicStats, config), [records, topicStats, config]);
  const insights = React.useMemo(() => computeInsights(records, topicStats, config).filter(insight => topicStats.some(topic => topic.sufficient) || insight.id !== "no-problems"), [records, topicStats, config]);

  const multiCourse = filters.subject === null || filters.grade === null;
  const chartTopics = React.useMemo(
    () =>
      [...topicStats]
        .sort((a, b) => (a.sufficient === b.sufficient ? (a.rate ?? 2) - (b.rate ?? 2) : a.sufficient ? -1 : 1))
        .slice(0, MAX_CHART_TOPICS)
        .map((t) => ({
          key: t.key,
          name: t.topicName,
          context: multiCourse && courses.length > 1 ? `${t.subject} ${t.grade}` : undefined,
          rate: t.rate,
          ciLow: t.estimate?.ciLow ?? null,
          ciHigh: t.estimate?.ciHigh ?? null,
          level: t.level,
          students: t.students,
          answers: t.answers,
        })),
    [topicStats, multiCourse, courses.length],
  );

  const statusCounts = React.useMemo(() => {
    const c: Record<DifficultyStatus, number> = { difficult: 0, likely_difficult: 0, attention: 0, mastered: 0, insufficient: 0 };
    for (const t of topicStats) c[t.status] += 1;
    return c;
  }, [topicStats]);

  const otherInsights = React.useMemo(() => insights.slice(1), [insights]);
  const insightPage = usePagination(otherInsights, INSIGHTS_PREVIEW);
  const shownInsights = insightPage.rows;

  const k = overview.kpis;
  const lead = topicStats.some(topic => topic.sufficient) ? insights[0] : undefined;
  const openLead = () => {
    if (!lead) return;
    if (lead.scope) setFilters({ subject: lead.scope.subject, grade: lead.scope.grade, classId: null, textbookId: null, topicKey: null });
    router.push(insightHref(lead));
  };
  // Уровень среднего результата — тем же цветом, что и уровни тем (цвет только как вердикт).
  const averagePct = k.estimate?.rate != null ? k.estimate.rate * 100 : null;
  const averageTone = averagePct == null ? "default" : averagePct < config.thresholds.medium ? "low" : averagePct < config.thresholds.high ? "medium" : "high";

  if (records.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={Info} title={m.common.noDataForFilters} description={m.common.changeFilters} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <Finding title={topicStats.some(topic => topic.sufficient) ? insights[0]?.title ?? m.overview.noProblemsTitle : m.ux.noReliableFinding} tone={overview.kpis.problemTopics > 0 ? "warning" : "default"} actions={<>{lead?.scope?.topicKey ? <Button onClick={openLead}>{m.ux.openTopic}<ArrowRight aria-hidden /></Button> : null}<Button asChild variant="outline"><Link href="/reports">{m.ux.createReport}</Link></Button></>}>
        <p>{topicStats.some(topic => topic.sufficient) ? insights[0]?.detail ?? m.overview.noProblemsDescription : m.ux.notEnoughData}</p>
      </Finding>
      {/* Сначала выводы (результат, проблемные темы), затем объём данных, на котором они получены. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
        <KpiTile tone={averageTone} label={m.overview.kpiAverage} value={formatPct(k.estimate?.rate)} sub={t(m.units.ciValue, { ci: formatCi(k.estimate?.ciLow, k.estimate?.ciHigh) })} />
        <KpiTile
          tone={k.problemTopics > 0 ? "low" : "default"}
          label={m.overview.kpiProblems}
          value={formatInt(k.problemTopics)}
          sub={`${t(m.overview.kpiProblemsSub, { threshold: formatPercentValue(config.thresholds.medium) })}${k.insufficientTopics ? t(m.overview.kpiNoConclusion, { n: k.insufficientTopics }) : ""}`}
        />
        <dl className="col-span-2 grid grid-cols-[auto_auto_minmax(0,1fr)] content-center items-baseline gap-x-4 gap-y-1 bg-card px-5 py-4 text-[13px] lg:col-span-1">
          <dt className="text-muted-foreground">{m.overview.students}</dt>
          <dd className="text-right font-semibold tabular">{formatInt(k.students)}</dd>
          <dd className="truncate text-muted-foreground tabular">{plural(m.counts.answers, k.answers)}</dd>
          <dt className="text-muted-foreground">{m.overview.classes}</dt>
          <dd className="text-right font-semibold tabular">{formatInt(k.classes)}</dd>
          <dd className="truncate text-muted-foreground tabular">{plural(m.counts.textbooks, k.textbooks)}</dd>
          <dt className="text-muted-foreground">{m.overview.topics}</dt>
          <dd className="text-right font-semibold tabular">{formatInt(k.topics)}</dd>
          <dd className="truncate text-muted-foreground tabular">{plural(m.counts.tests, k.tests)}</dd>
        </dl>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-1 gap-5">
          <Section
            title={m.overview.chartTitle}
            description={
              topicStats.length > MAX_CHART_TOPICS ? t(m.overview.chartShown, { shown: MAX_CHART_TOPICS, total: topicStats.length }) : m.overview.chartAll
            }
            actions={
              <>
                <MethodNote>
                  <p>
                    <Rich text={m.overview.methodRate} />
                  </p>
                  <p>{t(m.overview.methodColor, { high: formatPercentValue(config.thresholds.high), medium: formatPercentValue(config.thresholds.medium) })}</p>
                  <p>{m.overview.methodGrey}</p>
                </MethodNote>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/topics">{m.overview.openTopics}</Link>
                </Button>
              </>
            }
          >
            <div className="px-3 py-4 sm:px-5">
              <TopicBarChart data={chartTopics} thresholds={config.thresholds} ariaLabel={m.overview.chartTitle} />
            </div>
          </Section>
          <Disclosure
            title={m.overview.statusTitle}
            description={k.dateFrom ? t(m.overview.testingPeriod, { from: formatDate(k.dateFrom), to: formatDate(k.dateTo) }) : undefined}
          >
            <div className="rounded-xl border bg-card px-5 py-2">
              <StatusSummary counts={statusCounts} />
            </div>
          </Disclosure>
        </div>

        <Section title={m.overview.insightsTitle} description={m.overview.insightsDescription}>
          {otherInsights.length === 0 ? (
            <div className="p-5"><Button variant="outline" asChild><Link href="/topics">{m.ux.inspectTopics}</Link></Button></div>
          ) : (
            <>
              <ul className="divide-y">
                {shownInsights.map((i) => (
                  <InsightItem key={i.id} insight={i} />
                ))}
              </ul>
              <Pagination {...insightPage} onPageChange={insightPage.setPage} />
            </>
          )}
        </Section>
      </div>

      <Disclosure title={m.overview.distributionTitle} description={t(m.overview.distributionDescription, { n: config.minAnswersPerStudent })}>
        <div className="rounded-xl border bg-card px-5 py-5">
          <LevelDistribution subjects={overview.subjects} thresholds={config.thresholds} />
        </div>
      </Disclosure>
    </div>
  );
}

export function OverviewView() {
  const { m } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader title={m.overview.title} description={m.overview.description} />
      <DataGate>
        <SyntheticNotice />
        <FilterBar fields={["subject", "grade", "classId", "textbookId", "topicKey"]} />
        <OverviewContent />
      </DataGate>
    </div>
  );
}
