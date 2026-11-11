"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertOctagon, AlertTriangle, ArrowRight, FlaskConical, Info, type LucideIcon } from "lucide-react";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, KpiTile, MethodNote, PageHeader, Section } from "@/components/common/blocks";
import { FilterBar } from "@/components/common/filter-bar";
import { STATUS_META } from "@/components/common/levels";
import { LevelDistribution } from "@/components/charts/level-distribution";
import { TopicBarChart } from "@/components/charts/topic-bar-chart";
import { Button } from "@/components/ui/button";
import { filterRecords } from "@/lib/analytics/filters";
import { computeInsights, type Insight, type InsightSeverity } from "@/lib/analytics/insights";
import { computeOverview } from "@/lib/analytics/overview";
import { computeTopicStats } from "@/lib/analytics/topics";
import type { DifficultyStatus } from "@/lib/domain/types";
import { countLabel, formatCi, formatDate, formatInt, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useReadyData } from "@/providers/data-provider";

const MAX_CHART_TOPICS = 15;
/** Сколько проблем показывать до раскрытия списка: самые важные идут первыми. */
const INSIGHTS_PREVIEW = 5;

const SEVERITY: Record<InsightSeverity, { Icon: LucideIcon; className: string; label: string }> = {
  critical: { Icon: AlertOctagon, className: "text-level-low", label: "Критично" },
  warning: { Icon: AlertTriangle, className: "text-level-medium-fg", label: "Внимание" },
  info: { Icon: Info, className: "text-primary", label: "К сведению" },
};

export function SyntheticNotice() {
  const { dataset } = useReadyData();
  if (!dataset.meta.isSynthetic) return null;
  return (
    // Пунктир — тот же знак «не окончательно», что и у статуса «Вероятно сложная».
    <div role="note" className="flex items-start gap-2 rounded-lg border border-dashed border-input px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">
      <FlaskConical className="mt-[3px] size-3.5 shrink-0" aria-hidden />
      <p>
        <span className="font-medium text-foreground">Демонстрационный режим:</span> синтетические результаты 300 учеников, не относятся к реальным школам, ученикам или
        издательствам.{" "}
        <Link href="/data" className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline">
          Загрузить собственные данные
        </Link>
      </p>
    </div>
  );
}

function InsightItem({ insight }: { insight: Insight }) {
  const router = useRouter();
  const { setFilters } = useReadyData();
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
            router.push(insight.href);
          }}
        >
          Подробнее
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
  const { dataset, filters, config, courses } = useReadyData();
  const records = React.useMemo(() => filterRecords(dataset.records, filters), [dataset.records, filters]);
  const topicStats = React.useMemo(() => computeTopicStats(records, config), [records, config]);
  const overview = React.useMemo(() => computeOverview(records, topicStats, config), [records, topicStats, config]);
  const insights = React.useMemo(() => computeInsights(records, topicStats, config), [records, topicStats, config]);

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

  const [allInsights, setAllInsights] = React.useState(false);
  const shownInsights = allInsights ? insights : insights.slice(0, INSIGHTS_PREVIEW);
  const hiddenInsights = insights.length - INSIGHTS_PREVIEW;

  const k = overview.kpis;

  if (records.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={Info} title="Нет данных для выбранных фильтров" description="Измените или сбросьте фильтры." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* Сначала выводы (результат, проблемные темы), затем объём данных, на котором они получены. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
        <KpiTile label="Средний результат" value={formatPct(k.estimate?.rate)} sub={`95% ДИ ${formatCi(k.estimate?.ciLow, k.estimate?.ciHigh)}`} />
        <KpiTile
          tone={k.problemTopics > 0 ? "low" : "default"}
          label="Проблемных тем"
          value={formatInt(k.problemTopics)}
          sub={`ниже ${config.thresholds.medium}%${k.insufficientTopics ? ` · ${k.insufficientTopics} без выводов` : ""}`}
        />
        <dl className="col-span-2 grid grid-cols-[auto_auto_minmax(0,1fr)] content-center items-baseline gap-x-4 gap-y-1 bg-card px-5 py-4 text-[13px] lg:col-span-1">
          <dt className="text-muted-foreground">Учеников</dt>
          <dd className="text-right font-semibold tabular">{formatInt(k.students)}</dd>
          <dd className="truncate text-muted-foreground tabular">{formatInt(k.answers)} ответов</dd>
          <dt className="text-muted-foreground">Классов</dt>
          <dd className="text-right font-semibold tabular">{formatInt(k.classes)}</dd>
          <dd className="truncate text-muted-foreground tabular">{countLabel(k.textbooks, ["учебник", "учебника", "учебников"])}</dd>
          <dt className="text-muted-foreground">Учебных тем</dt>
          <dd className="text-right font-semibold tabular">{formatInt(k.topics)}</dd>
          <dd className="truncate text-muted-foreground tabular">{countLabel(k.tests, ["тест", "теста", "тестов"])}</dd>
        </dl>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-1 gap-5">
          <Section
            title="Успешность по темам"
            description={
              topicStats.length > MAX_CHART_TOPICS
                ? `Показаны ${MAX_CHART_TOPICS} тем с наименьшей успешностью из ${topicStats.length}. Уточните фильтр или откройте анализ тем.`
                : "Доля правильных ответов по каждой теме, от сложных к освоенным."
            }
            actions={
              <>
                <MethodNote>
                  <p>
                    <b>Успешность темы</b> — доля правильных ответов на все задания темы: верных ответов / всех ответов.
                  </p>
                  <p>
                    Цвет — уровень освоения: высокий от {config.thresholds.high}%, средний от {config.thresholds.medium}%, ниже — низкий. Пороги настраиваются в «Параметрах анализа».
                  </p>
                  <p>Серым показаны темы, по которым мало данных для вывода.</p>
                </MethodNote>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/topics">Анализ тем</Link>
                </Button>
              </>
            }
          >
            <div className="px-3 py-4 sm:px-5">
              <TopicBarChart data={chartTopics} thresholds={config.thresholds} ariaLabel="Успешность по темам" />
            </div>
          </Section>
          <Section
            title="Темы по статусу сложности"
            description={k.dateFrom ? `Тестирование: ${formatDate(k.dateFrom)} — ${formatDate(k.dateTo)}` : undefined}
          >
            <div className="px-5 py-2">
              <StatusSummary counts={statusCounts} />
            </div>
          </Section>
        </div>

        <Section title="Основные выявленные проблемы" description="Правила применяются к отфильтрованным данным.">
          {insights.length === 0 ? (
            <EmptyState icon={Info} title="Проблем не выявлено" description="Для выбранных фильтров нет тем и классов, требующих внимания." />
          ) : (
            <>
              <ul className="divide-y">
                {shownInsights.map((i) => (
                  <InsightItem key={i.id} insight={i} />
                ))}
              </ul>
              {hiddenInsights > 0 ? (
                <button
                  type="button"
                  aria-expanded={allInsights}
                  onClick={() => setAllInsights((v) => !v)}
                  className="w-full rounded-b-xl border-t px-5 py-2.5 text-left text-[13px] font-medium text-primary outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset"
                >
                  {allInsights ? "Свернуть список" : `Показать ещё ${hiddenInsights}`}
                </button>
              ) : null}
            </>
          )}
        </Section>
      </div>

      <Section
        title="Распределение результатов по предметам"
        description={`Доля учеников по уровню освоения (учитываются ученики с ${config.minAnswersPerStudent}+ ответами по предмету).`}
      >
        <div className="px-5 py-5">
          <LevelDistribution subjects={overview.subjects} thresholds={config.thresholds} />
        </div>
      </Section>
    </div>
  );
}

export function OverviewView() {
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title="Обзор успеваемости"
        description="Сводка по результатам тестирования. Все показатели рассчитываются из загруженных данных и пересчитываются при смене фильтров."
      />
      <DataGate>
        <SyntheticNotice />
        <FilterBar fields={["subject", "grade", "classId", "textbookId", "topicKey"]} />
        <OverviewContent />
      </DataGate>
    </div>
  );
}
