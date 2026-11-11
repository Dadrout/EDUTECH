"use client";

import * as React from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Info } from "lucide-react";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, MethodNote, PageHeader, RateBar, Section } from "@/components/common/blocks";
import { FilterBar } from "@/components/common/filter-bar";
import { LEVEL_META, LevelBadge, StatusBadge, STATUS_META } from "@/components/common/levels";
import { Heatmap, HeatmapLegend } from "@/components/charts/heatmap";
import { TopicBarChart } from "@/components/charts/topic-bar-chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { compareTopics, filterRecords } from "@/lib/analytics/filters";
import { computeHeatmap } from "@/lib/analytics/heatmap";
import { isProblemStatus } from "@/lib/analytics/stats";
import { computeTopicStats, type TopicStats } from "@/lib/analytics/topics";
import type { DifficultyStatus } from "@/lib/domain/types";
import { formatCi, formatInt, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useReadyData } from "@/providers/data-provider";
import { SyntheticNotice } from "./overview-view";
import { TopicDetailSheet } from "./topic-detail-sheet";

type SortKey = "order" | "name" | "students" | "answers" | "questions" | "rate" | "status";
type StatusFilter = "all" | DifficultyStatus;

const STATUS_ORDER: Record<DifficultyStatus, number> = { difficult: 0, likely_difficult: 1, attention: 2, mastered: 3, insufficient: 4 };
const STATUS_CHIPS: DifficultyStatus[] = ["difficult", "likely_difficult", "attention", "mastered", "insufficient"];

function sortTopics(rows: TopicStats[], key: SortKey, dir: 1 | -1): TopicStats[] {
  const sorted = [...rows].sort((a, b) => {
    switch (key) {
      case "name":
        return a.topicName.localeCompare(b.topicName, "ru");
      case "students":
        return a.students - b.students;
      case "answers":
        return a.answers - b.answers;
      case "questions":
        return a.questions - b.questions;
      case "rate":
        return (a.rate ?? -1) - (b.rate ?? -1);
      case "status":
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.rate ?? 0) - (b.rate ?? 0);
      default:
        return compareTopics(a, b);
    }
  });
  return dir === 1 ? sorted : sorted.reverse();
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={cn("h-9 px-3 text-xs font-medium whitespace-nowrap text-muted-foreground", align === "right" ? "text-right" : "text-left", className)} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40", active && "text-foreground", align === "right" && "flex-row-reverse")}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

function TopicsContent() {
  const { dataset, filters, config, courses, setFilters } = useReadyData();
  const records = React.useMemo(() => filterRecords(dataset.records, filters, ["subject", "grade", "classId", "textbookId"]), [dataset.records, filters]);
  const topics = React.useMemo(() => computeTopicStats(records, config), [records, config]);
  const singleCourse = filters.subject !== null && filters.grade !== null;
  const heatmap = React.useMemo(() => (singleCourse ? computeHeatmap(records, config) : null), [singleCourse, records, config]);

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rate", dir: 1 });
  const [chartOrder, setChartOrder] = React.useState<"rate" | "program">("rate");
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  const counts = React.useMemo(() => {
    const c: Record<DifficultyStatus, number> = { difficult: 0, likely_difficult: 0, attention: 0, mastered: 0, insufficient: 0 };
    for (const t of topics) c[t.status] += 1;
    return c;
  }, [topics]);

  const visible = React.useMemo(
    () => sortTopics(statusFilter === "all" ? topics : topics.filter((t) => t.status === statusFilter), sort.key, sort.dir),
    [topics, statusFilter, sort],
  );

  const showContext = !singleCourse && courses.length > 1;
  const chartData = React.useMemo(() => {
    const base = statusFilter === "all" ? topics : topics.filter((t) => t.status === statusFilter);
    const ordered = chartOrder === "program" ? [...base].sort(compareTopics) : [...base].sort((a, b) => (a.sufficient === b.sufficient ? (a.rate ?? 2) - (b.rate ?? 2) : a.sufficient ? -1 : 1));
    return ordered.map((t) => ({
      key: t.key,
      name: t.topicName,
      context: showContext ? `${t.subject} ${t.grade}` : undefined,
      rate: t.rate,
      ciLow: t.estimate?.ciLow ?? null,
      ciHigh: t.estimate?.ciHigh ?? null,
      level: t.level,
      students: t.students,
      answers: t.answers,
    }));
  }, [topics, statusFilter, chartOrder, showContext]);

  const selected = topics.find((t) => t.key === selectedKey) ?? null;
  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: k === "name" || k === "order" ? 1 : k === "rate" || k === "status" ? 1 : -1 }));

  if (topics.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={Info} title="Нет данных для выбранных фильтров" description="Измените или сбросьте фильтры." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр по статусу сложности">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          aria-pressed={statusFilter === "all"}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
            statusFilter === "all" ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent",
          )}
        >
          Все темы <span className="tabular opacity-70">{topics.length}</span>
        </button>
        {STATUS_CHIPS.map((s) => {
          const meta = STATUS_META[s];
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              disabled={counts[s] === 0}
              onClick={() => setStatusFilter(active ? "all" : s)}
              aria-pressed={active}
              title={meta.hint}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-40",
                active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent",
              )}
            >
              <meta.Icon
                className={cn(
                  "size-3.5",
                  !active && meta.variant === "low" && "text-level-low",
                  !active && meta.variant === "medium" && "text-level-medium-fg",
                  !active && meta.variant === "high" && "text-level-high",
                )}
                aria-hidden
              />
              {meta.label} <span className="tabular opacity-70">{counts[s]}</span>
            </button>
          );
        })}
      </div>

      <Section
        title="Успешность по темам"
        description="Нажмите на полосу, чтобы открыть детализацию темы по классам, учебникам и заданиям."
        actions={
          <>
            <Tabs value={chartOrder} onValueChange={(v) => setChartOrder(v as "rate" | "program")}>
              <TabsList className="h-8">
                <TabsTrigger value="rate">По успешности</TabsTrigger>
                <TabsTrigger value="program">По программе</TabsTrigger>
              </TabsList>
            </Tabs>
            <MethodNote>
              <p>
                <b>Успешность</b> = верные ответы / все ответы по заданиям темы.
              </p>
              <p>
                <b>Уровень освоения</b>: высокий — от {config.thresholds.high}%, средний — от {config.thresholds.medium}%, низкий — ниже {config.thresholds.medium}%. Это начальная настройка MVP, её можно изменить.
              </p>
              <p>
                <b>Сложная тема</b> — успешность ниже {config.thresholds.medium}%, и верхняя граница 95% доверительного интервала тоже ниже порога. Если интервал пересекает порог — «вероятно сложная».
              </p>
              <p>
                Вывод делается только при {config.minStudentsPerTopic}+ учениках и {config.minAnswersPerTopic}+ ответах.
              </p>
            </MethodNote>
          </>
        }
      >
        <div className="px-3 py-4 sm:px-5">
          {chartData.length > 0 ? (
            <TopicBarChart data={chartData} thresholds={config.thresholds} onSelect={setSelectedKey} ariaLabel="Успешность по темам" />
          ) : (
            <EmptyState icon={Info} title="Нет тем с выбранным статусом" />
          )}
        </div>
      </Section>

      <Section
        title="Тепловая карта: классы × темы"
        description={
          singleCourse
            ? "Успешность каждого класса по каждой теме. Красный — ниже нормы, синий — выше; середина шкалы — между порогами среднего и высокого уровня."
            : "Тепловая карта строится в пределах одного предмета и параллели: темы разных классов не совпадают."
        }
      >
        {heatmap && heatmap.columns.length > 0 ? (
          <>
            <Heatmap data={heatmap} thresholds={config.thresholds} />
            <div className="border-t px-5 py-3">
              <HeatmapLegend thresholds={config.thresholds} />
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2 px-5 py-5">
            {courses
              .filter((c) => filters.subject === null || c.subject === filters.subject)
              .map((c) => (
                <button
                  key={`${c.subject}-${c.grade}`}
                  type="button"
                  onClick={() => setFilters({ subject: c.subject, grade: c.grade })}
                  className="inline-flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-[13px] font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30"
                >
                  {c.subject} · {c.grade} класс
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                </button>
              ))}
          </div>
        )}
      </Section>

      <Section
        title="Таблица тем"
        description={`${visible.length} из ${topics.length} тем. Проблемные разделы выделены; сортировка — по заголовкам столбцов.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead className="border-b bg-muted/40">
              <tr>
                <SortHeader label="Тема" k="name" sort={sort} onSort={onSort} className="pl-5" />
                <SortHeader label="Учеников" k="students" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Ответов" k="answers" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Заданий" k="questions" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Успешность" k="rate" sort={sort} onSort={onSort} />
                <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground">95% ДИ</th>
                <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground">Уровень</th>
                <SortHeader label="Статус" k="status" sort={sort} onSort={onSort} className="pr-5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((t) => {
                const problem = isProblemStatus(t.status);
                return (
                  <tr
                    key={t.key}
                    className={cn("cursor-pointer transition-colors hover:bg-muted/50", problem && "bg-level-low-bg/45 hover:bg-level-low-bg/70")}
                    onClick={() => setSelectedKey(t.key)}
                  >
                    <td className={cn("py-2.5 pr-3 pl-5", problem && "shadow-[inset_3px_0_0_var(--level-low)]")}>
                      <button type="button" className="text-left font-medium outline-none hover:underline focus-visible:underline" onClick={() => setSelectedKey(t.key)}>
                        {t.topicName}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {t.subject} · {t.grade} кл. · {t.topicId}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      <span className="inline-flex items-center gap-1">
                        {!t.sufficient ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="size-3.5 text-level-medium-fg" aria-label="Недостаточно данных" />
                            </TooltipTrigger>
                            <TooltipContent>{t.sampleNote}</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {formatInt(t.students)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{formatInt(t.answers)}</td>
                    <td className="px-3 py-2.5 text-right tabular">{formatInt(t.questions)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-12 font-semibold tabular">{formatPct(t.rate)}</span>
                        <RateBar
                          rate={t.rate}
                          ciLow={t.estimate?.ciLow}
                          ciHigh={t.estimate?.ciHigh}
                          color={LEVEL_META[t.level].color}
                          thresholds={config.thresholds}
                          className="w-28"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground tabular">{formatCi(t.estimate?.ciLow, t.estimate?.ciHigh)}</td>
                    <td className="px-3 py-2.5">
                      <LevelBadge level={t.level} />
                    </td>
                    <td className="py-2.5 pr-5 pl-3">
                      <StatusBadge status={t.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <TopicDetailSheet topic={selected} records={records} config={config} onClose={() => setSelectedKey(null)} />
    </div>
  );
}

export function TopicsView() {
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title="Анализ освоения тем"
        description="Результаты тестирования по каждой теме учебной программы: объём выборки, успешность с доверительным интервалом, уровень освоения и статус сложности."
      />
      <DataGate>
        <SyntheticNotice />
        <FilterBar fields={["subject", "grade", "classId", "textbookId"]} />
        <TopicsContent />
      </DataGate>
    </div>
  );
}
