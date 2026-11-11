"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Info, Library, Scale, type LucideIcon } from "lucide-react";
import { CoursePicker } from "@/components/common/course-picker";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, MethodNote, PageHeader, Section } from "@/components/common/blocks";
import { FilterBar } from "@/components/common/filter-bar";
import { seriesColor } from "@/components/common/levels";
import { ForestPlot } from "@/components/charts/forest-plot";
import { TextbookTopicChart } from "@/components/charts/textbook-topic-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterRecords, naturalCompare } from "@/lib/analytics/filters";
import { compareTextbooks, type TopicComparisonStatus, type VerdictLevel } from "@/lib/analytics/textbooks";
import { countLabel, formatInt, formatPct, formatPp, formatPpRange, shortTextbookName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useReadyData } from "@/providers/data-provider";
import { SyntheticNotice } from "./overview-view";

const VERDICT_META: Record<VerdictLevel, { label: string; variant: "info" | "medium" | "none"; Icon: LucideIcon }> = {
  consistent: { label: "Различие устойчиво", variant: "info", Icon: CheckCircle2 },
  preliminary: { label: "Предварительный вывод", variant: "medium", Icon: AlertTriangle },
  no_difference: { label: "Различие не подтверждено", variant: "none", Icon: Scale },
  insufficient: { label: "Недостаточно данных", variant: "none", Icon: CircleHelp },
};

const TOPIC_STATUS: Record<TopicComparisonStatus, { label: string; variant: "high" | "none" | "medium" }> = {
  comparable: { label: "Сопоставима", variant: "high" },
  no_common_questions: { label: "Разные задания", variant: "medium" },
  missing_textbook: { label: "Нет данных", variant: "none" },
  insufficient_data: { label: "Мало учеников", variant: "none" },
};

function Comparison({ subject, grade }: { subject: string; grade: number }) {
  const { dataset, filters, config } = useReadyData();
  const courseRecords = React.useMemo(() => filterRecords(dataset.records, filters, ["subject", "grade"]), [dataset.records, filters]);

  // Все учебники курса; цвет закреплён за учебником по этому порядку.
  const allTextbooks = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of courseRecords) m.set(r.textbookId, r.textbookName);
    return [...m.entries()].sort((a, b) => naturalCompare(a[1], b[1])).map(([id, name], i) => ({ id, name, short: shortTextbookName(name, subject, grade), color: seriesColor(i) }));
  }, [courseRecords, subject, grade]);
  const tbById = React.useMemo(() => new Map(allTextbooks.map((t) => [t.id, t])), [allTextbooks]);

  const [selected, setSelected] = React.useState<string[]>(() => allTextbooks.map((t) => t.id));
  const [referenceId, setReferenceId] = React.useState<string>(() => allTextbooks[0]?.id ?? "");
  const selectedIds = React.useMemo(() => allTextbooks.map((t) => t.id).filter((id) => selected.includes(id)), [allTextbooks, selected]);
  const reference = selectedIds.includes(referenceId) ? referenceId : (selectedIds[0] ?? "");

  const result = React.useMemo(
    () => compareTextbooks({ records: courseRecords, textbookIds: selectedIds, topicKey: filters.topicKey, referenceId: reference, config }),
    [courseRecords, selectedIds, filters.topicKey, reference, config],
  );

  if (allTextbooks.length < 2) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={Library}
          title="Сравнивать не с чем"
          description={`В параллели «${subject}, ${grade} класс» используется только один учебник${allTextbooks[0] ? ` — ${allTextbooks[0].name}` : ""}. Выберите другой предмет или параллель.`}
        />
      </div>
    );
  }

  const comparableTopics = result.topics.filter((t) => t.status === "comparable");
  const refTb = tbById.get(reference);
  const maxAbsDiff = Math.max(0.1, ...result.verdicts.map((v) => (v.diff ? Math.max(Math.abs(v.diff.ciLow), Math.abs(v.diff.ciHigh)) : 0)));
  const diffBound = Math.min(1, Math.ceil(maxAbsDiff * 10) / 10);
  const diffTicks = [-diffBound, -diffBound / 2, 0, diffBound / 2, diffBound];

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-card px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <fieldset>
          <legend className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Учебники для сравнения</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {allTextbooks.map((t) => {
              const checked = selected.includes(t.id);
              return (
                <Label key={t.id} className="cursor-pointer font-normal">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => setSelected((prev) => (c ? [...prev, t.id] : prev.filter((x) => x !== t.id)))}
                    aria-label={t.name}
                  />
                  <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
                  <span className="text-[13px]">{t.name}</span>
                </Label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex min-w-0 flex-col gap-1 lg:w-72">
          <label htmlFor="reference" className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Базовый учебник (с ним сравниваются остальные)
          </label>
          <Select value={reference} onValueChange={setReferenceId} disabled={selectedIds.length < 2}>
            <SelectTrigger id="reference" size="sm" className="w-full">
              <SelectValue placeholder="Выберите" />
            </SelectTrigger>
            <SelectContent>
              {selectedIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {tbById.get(id)?.name ?? id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedIds.length < 2 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Library} title="Выберите не менее двух учебников" description="Сравнение строится между выбранными учебниками одной параллели." />
        </div>
      ) : (
        <>
          <Section
            title="Вывод по сравнению"
            description={`${countLabel(result.comparableTopicCount, ["сопоставимая тема", "сопоставимые темы", "сопоставимых тем"])} из ${result.topics.length} · ${countLabel(result.commonQuestionCount, ["общее задание", "общих задания", "общих заданий"])}`}
            actions={
              <MethodNote title="Как сравниваются учебники">
                <p>
                  1. Сравниваются только ученики <b>одного предмета и одной параллели</b>.
                </p>
                <p>
                  2. По каждой теме берутся только <b>общие задания</b>, которые выполняли ученики всех выбранных учебников. Темы без достаточного числа общих заданий ({config.minCommonQuestions}+) или учеников ({config.minStudentsPerGroup}+) исключаются.
                </p>
                <p>
                  3. Итог — доля верных ответов на общих заданиях сопоставимых тем. Для разницы строится <b>95% доверительный интервал</b> с учётом того, что ответы одного ученика связаны.
                </p>
                <p>
                  4. <b>Устойчивым</b> различие считается, только если интервал не включает ноль, каждый учебник используется минимум в двух классах и все классы одного учебника лучше всех классов другого.
                </p>
                <p>Даже устойчивое различие — это связь, а не доказательство причины.</p>
              </MethodNote>
            }
          >
            <div className="grid gap-px bg-border">
              {result.verdicts.map((v) => {
                const meta = VERDICT_META[v.level];
                const tb = tbById.get(v.textbookId);
                return (
                  <div key={v.textbookId} className="bg-card px-5 py-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant={meta.variant}>
                        <meta.Icon aria-hidden />
                        {meta.label}
                      </Badge>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ background: tb?.color }} aria-hidden />
                        {tb?.short} относительно {refTb?.short}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{v.summary}</p>
                    {v.reasons.length > 0 ? (
                      <ul className="mt-1.5 grid gap-0.5 text-[13px] leading-relaxed text-muted-foreground">
                        {v.reasons.map((r) => (
                          <li key={r} className="flex gap-2">
                            <span aria-hidden>—</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {result.warnings.length > 0 ? (
              <div className="border-t px-5 py-4">
                <Alert variant="warning">
                  <AlertTriangle aria-hidden />
                  <AlertTitle>Ограничения сопоставимости</AlertTitle>
                  <AlertDescription>
                    {result.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
          </Section>

          <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-2">
            <Section title="Успешность на общих заданиях" description="Точка — оценка, линия — 95% доверительный интервал.">
              <div className="px-5 py-4">
                <ForestPlot
                  ariaLabel="Успешность учебников на общих заданиях"
                  domain={[0, 1]}
                  ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                  tickFormat={(v) => `${Math.round(v * 100)}%`}
                  rows={result.groups.map((g) => ({
                    id: g.textbookId,
                    label: tbById.get(g.textbookId)?.short ?? g.textbookName,
                    sublabel: `${formatInt(g.comparableStudents)} уч. · ${g.classes.join(", ")}`,
                    color: tbById.get(g.textbookId)?.color ?? seriesColor(0),
                    value: g.comparable?.rate ?? null,
                    low: g.comparable?.ciLow ?? null,
                    high: g.comparable?.ciHigh ?? null,
                    valueText: formatPct(g.comparable?.rate),
                    rangeText: g.comparable ? `${formatPct(g.comparable.ciLow, 0)}–${formatPct(g.comparable.ciHigh, 0)}` : undefined,
                  }))}
                />
              </div>
            </Section>
            <Section title={`Разница с базовым учебником${refTb ? ` (${refTb.short})` : ""}`} description="Если интервал пересекает ноль, различие не подтверждено.">
              <div className="px-5 py-4">
                <ForestPlot
                  ariaLabel="Разница с базовым учебником"
                  domain={[-diffBound, diffBound]}
                  ticks={diffTicks}
                  tickFormat={(v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`}
                  zeroLine={0}
                  rows={result.verdicts.map((v) => ({
                    id: v.textbookId,
                    label: tbById.get(v.textbookId)?.short ?? v.textbookId,
                    sublabel: VERDICT_META[v.level].label,
                    color: tbById.get(v.textbookId)?.color ?? seriesColor(1),
                    value: v.diff?.diff ?? null,
                    low: v.diff?.ciLow ?? null,
                    high: v.diff?.ciHigh ?? null,
                    valueText: formatPp(v.diff?.diff),
                    rangeText: v.diff ? formatPpRange(v.diff.ciLow, v.diff.ciHigh) : undefined,
                    muted: v.level === "insufficient" || v.level === "no_difference",
                  }))}
                />
              </div>
            </Section>
          </div>

          <Section title="Группы учеников" description="Объём выборки и результаты отдельных классов. Успешность по всем заданиям приведена справочно: наборы заданий у групп могут различаться.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="h-9 px-5 text-left font-medium">Учебник</th>
                    <th className="h-9 px-3 text-right font-medium">Учеников</th>
                    <th className="h-9 px-3 text-right font-medium">Ответов</th>
                    <th className="h-9 px-3 text-right font-medium">По всем заданиям</th>
                    <th className="h-9 px-3 text-right font-medium">На общих заданиях</th>
                    <th className="h-9 px-5 text-left font-medium">По классам (общие задания)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.groups.map((g) => (
                    <tr key={g.textbookId}>
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="size-2.5 rounded-full" style={{ background: tbById.get(g.textbookId)?.color }} aria-hidden />
                          {g.textbookName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">{formatInt(g.students)}</td>
                      <td className="px-3 py-2.5 text-right tabular">{formatInt(g.answers)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground tabular">{formatPct(g.rawRate)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular">{formatPct(g.comparable?.rate)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {g.classBreakdown.map((c) => (
                            <span key={c.classId} className={cn("rounded-md border px-1.5 py-0.5 text-xs tabular", !c.sufficient && "hatch text-muted-foreground")}>
                              {c.classId} · {formatPct(c.estimate?.rate, 0)}
                            </span>
                          ))}
                          {g.classes.length === 1 ? <Badge variant="medium">один класс</Badge> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {comparableTopics.length > 0 ? (
            <Section title="Результаты по темам" description="Только сопоставимые темы, только общие задания.">
              <div className="px-3 py-4 sm:px-5">
                <TextbookTopicChart
                  series={selectedIds.map((id) => ({ id, name: tbById.get(id)?.short ?? id, color: tbById.get(id)?.color ?? seriesColor(0) }))}
                  data={comparableTopics.map((t) => ({
                    key: t.topicKey,
                    topicName: t.topicName,
                    commonQuestions: t.commonQuestions,
                    values: Object.fromEntries(selectedIds.map((id) => [id, { rate: t.cells[id]?.estimate?.rate ?? null, students: t.cells[id]?.students ?? 0 }])),
                  }))}
                />
              </div>
            </Section>
          ) : null}

          <Section title="Таблица по темам" description="Разница — относительно базового учебника, на общих заданиях; * — интервал не включает ноль.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="h-9 px-5 text-left font-medium">Тема</th>
                    <th className="h-9 px-3 text-left font-medium">Сопоставимость</th>
                    <th className="h-9 px-3 text-right font-medium">Общих заданий</th>
                    {selectedIds.map((id) => (
                      <th key={id} className="h-9 px-3 text-right font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: tbById.get(id)?.color }} aria-hidden />
                          {tbById.get(id)?.short}
                        </span>
                      </th>
                    ))}
                    {selectedIds
                      .filter((id) => id !== reference)
                      .map((id) => (
                        <th key={`d-${id}`} className="h-9 px-3 text-right font-medium">
                          Разница: {tbById.get(id)?.short}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.topics.map((t) => {
                    const st = TOPIC_STATUS[t.status];
                    const comparable = t.status === "comparable";
                    return (
                      <tr key={t.topicKey} className={cn(!comparable && "bg-muted/30")}>
                        <td className="max-w-80 px-5 py-2.5">
                          <div className="font-medium">{t.topicName}</div>
                          {t.notes.map((n) => (
                            <div key={n} className="mt-0.5 text-xs leading-snug text-muted-foreground">
                              {n}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular">
                          {t.commonQuestions}
                          <span className="text-muted-foreground"> / {t.unionQuestions}</span>
                        </td>
                        {selectedIds.map((id) => {
                          const cell = t.cells[id];
                          return (
                            <td key={id} className="px-3 py-2.5 text-right tabular">
                              {cell ? (
                                <>
                                  <div className={cn("font-medium", !comparable && "text-muted-foreground")}>{comparable ? formatPct(cell.estimate?.rate) : formatPct(cell.rawRate)}</div>
                                  <div className="text-[11px] text-muted-foreground">{comparable ? `${formatInt(cell.students)} уч.` : "по своим заданиям"}</div>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                        {selectedIds
                          .filter((id) => id !== reference)
                          .map((id) => {
                            const d = t.diffs[id];
                            return (
                              <td key={`d-${id}`} className="px-3 py-2.5 text-right tabular">
                                {d ? (
                                  <>
                                    <div className={cn("font-medium", d.significant ? "text-foreground" : "text-muted-foreground")}>
                                      {formatPp(d.diff)}
                                      {d.significant ? "*" : ""}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">{formatPpRange(d.ciLow, d.ciHigh)}</div>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            );
                          })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function TextbooksContent() {
  const { filters } = useReadyData();
  if (filters.subject === null || filters.grade === null) {
    return <CoursePicker reason="Учебники сравниваются только внутри одного предмета и одной параллели, чтобы группы учеников были сопоставимы." />;
  }
  // key сбрасывает выбор учебников при смене курса.
  return <Comparison key={`${filters.subject}|${filters.grade}`} subject={filters.subject} grade={filters.grade} />;
}

export function TextbooksView() {
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title="Сравнение учебников"
        description="Результаты учеников, занимающихся по разным учебникам, на одинаковых заданиях. Различия показываются вместе с размером выборки и статистической погрешностью."
      />
      <DataGate>
        <SyntheticNotice />
        <Alert variant="default">
          <Info aria-hidden />
          <AlertTitle>Сравнение показывает связь, а не причину</AlertTitle>
          <AlertDescription>
            <p>
              Более высокий средний результат не доказывает, что учебник эффективнее: различия могут объясняться подготовкой учеников, работой учителя или условиями тестирования. Используйте выводы как основание для
              дальнейшего изучения, а не как окончательное решение.
            </p>
          </AlertDescription>
        </Alert>
        <FilterBar fields={["subject", "grade", "topicKey"]} />
        <TextbooksContent />
      </DataGate>
    </div>
  );
}
