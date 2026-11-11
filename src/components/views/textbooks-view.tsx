"use client";

import { AiPageInsight } from "@/components/ai/ai-insight";
import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Info, Library, Scale, type LucideIcon } from "lucide-react";
import { CoursePicker } from "@/components/common/course-picker";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, MethodNote, PageHeader, Section } from "@/components/common/blocks";
import { Disclosure, Finding, Pagination, usePagination } from "@/components/common/exploration";
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
import { formatInt, formatPct, formatPercentValue, formatPp, formatPpRange, quote, shortTextbookName } from "@/lib/format";
import { i18n } from "@/i18n/core";
import { useI18n } from "@/i18n/provider";
import { Rich } from "@/i18n/rich";
import { cn } from "@/lib/utils";
import { useReadyData } from "@/providers/data-provider";
import { SyntheticNotice } from "./overview-view";

// Подписи — геттеры, чтобы читать словарь текущего языка.
const verdictMeta = (level: VerdictLevel, variant: "info" | "medium" | "none", Icon: LucideIcon) => ({
  get label() {
    return i18n().m.textbooks.verdict[level];
  },
  variant,
  Icon,
});

const VERDICT_META: Record<VerdictLevel, { readonly label: string; variant: "info" | "medium" | "none"; Icon: LucideIcon }> = {
  consistent: verdictMeta("consistent", "info", CheckCircle2),
  preliminary: verdictMeta("preliminary", "medium", AlertTriangle),
  no_difference: verdictMeta("no_difference", "none", Scale),
  insufficient: verdictMeta("insufficient", "none", CircleHelp),
};

const topicStatus = (status: TopicComparisonStatus, variant: "high" | "none" | "medium") => ({
  get label() {
    return i18n().m.textbooks.topicStatus[status];
  },
  variant,
});

const TOPIC_STATUS: Record<TopicComparisonStatus, { readonly label: string; variant: "high" | "none" | "medium" }> = {
  comparable: topicStatus("comparable", "high"),
  no_common_questions: topicStatus("no_common_questions", "medium"),
  missing_textbook: topicStatus("missing_textbook", "none"),
  insufficient_data: topicStatus("insufficient_data", "none"),
};

function Comparison({ subject, grade }: { subject: string; grade: number }) {
  const { dataset, filters, config } = useReadyData();
  const { m, t, plural } = useI18n();
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

  const comparableTopics = React.useMemo(() => result.topics.filter(topic => topic.status === "comparable"), [result.topics]);
  const topicPage = usePagination(result.topics, 12);
  const groupPage = usePagination(result.groups, 8);
  const chartPage = usePagination(comparableTopics, 7);

  if (allTextbooks.length < 2) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={Library}
          title={m.textbooks.nothingTitle}
          description={t(m.textbooks.nothingDescription, {
            course: quote(t(m.units.course, { subject, grade })),
            textbook: allTextbooks[0] ? t(m.textbooks.nothingTextbook, { name: allTextbooks[0].name }) : "",
          })}
        />
      </div>
    );
  }

  const refTb = tbById.get(reference);
  const maxAbsDiff = Math.max(0.1, ...result.verdicts.map((v) => (v.diff ? Math.max(Math.abs(v.diff.ciLow), Math.abs(v.diff.ciHigh)) : 0)));
  const diffBound = Math.min(1, Math.ceil(maxAbsDiff * 10) / 10);
  const diffTicks = [-diffBound, -diffBound / 2, 0, diffBound / 2, diffBound];

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-card px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">{m.textbooks.compareLabel}</legend>
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
        <div className="flex min-w-0 flex-col gap-1 lg:w-80">
          <label htmlFor="reference" className="text-xs font-medium text-muted-foreground">
            {m.textbooks.referenceLabel}
          </label>
          <Select value={reference} onValueChange={setReferenceId} disabled={selectedIds.length < 2}>
            <SelectTrigger id="reference" size="sm" className="w-full">
              <SelectValue placeholder={m.textbooks.choose} />
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
          <EmptyState icon={Library} title={m.textbooks.selectTwoTitle} description={m.textbooks.selectTwoDescription} />
        </div>
      ) : (
        <>
          <Finding title={result.verdicts[0] ? VERDICT_META[result.verdicts[0].level].label : m.textbooks.verdict.insufficient} tone={result.verdicts.some(v => v.level === "preliminary" || v.level === "insufficient") ? "warning" : "default"}>
            <p>{result.verdicts[0]?.summary ?? m.textbooks.selectTwoDescription}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t(m.textbooks.verdictDescription, { topics: plural(m.textbooks.comparableTopics, result.comparableTopicCount), total: result.topics.length, questions: plural(m.textbooks.commonQuestions, result.commonQuestionCount) })}</p>
            <p className="mt-1 text-xs text-muted-foreground">{m.textbooks.method5}</p>
          </Finding>
          {comparableTopics.length > 0 ? (
            <Section title={m.textbooks.topicsChartTitle} description={m.textbooks.topicsChartDescription}>
              <div className="px-3 py-4 sm:px-5">
                <TextbookTopicChart
                  series={selectedIds.map((id) => ({ id, name: tbById.get(id)?.short ?? id, color: tbById.get(id)?.color ?? seriesColor(0) }))}
                  data={chartPage.rows.map((t) => ({
                    key: t.topicKey,
                    topicName: t.topicName,
                    commonQuestions: t.commonQuestions,
                    values: Object.fromEntries(selectedIds.map((id) => [id, { rate: t.cells[id]?.estimate?.rate ?? null, students: t.cells[id]?.students ?? 0, ciLow: t.cells[id]?.estimate?.ciLow ?? null, ciHigh: t.cells[id]?.estimate?.ciHigh ?? null }])),
                  }))}
                />
              </div>
              <Pagination page={chartPage.page} pageCount={chartPage.pageCount} total={chartPage.total} start={chartPage.start} end={chartPage.end} onPageChange={chartPage.setPage} />
            </Section>
          ) : null}

          <Disclosure
            title={m.textbooks.verdictTitle}
            description={t(m.textbooks.verdictDescription, {
              topics: plural(m.textbooks.comparableTopics, result.comparableTopicCount),
              total: result.topics.length,
              questions: plural(m.textbooks.commonQuestions, result.commonQuestionCount),
            })}
          >
            <div className="flex justify-end border-b p-3">              <MethodNote title={m.textbooks.methodTitle}>
                <p>
                  <Rich text={m.textbooks.method1} />
                </p>
                <p>
                  <Rich text={t(m.textbooks.method2, { questions: config.minCommonQuestions, students: config.minStudentsPerGroup })} />
                </p>
                <p>
                  <Rich text={m.textbooks.method3} />
                </p>
                <p>
                  <Rich text={m.textbooks.method4} />
                </p>
                <p>{m.textbooks.method5}</p>
              </MethodNote>
</div>
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
                        {t(m.textbooks.relativeTo, { a: tb?.short ?? "", b: refTb?.short ?? "" })}
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
                  <AlertTitle>{m.textbooks.limitsTitle}</AlertTitle>
                  <AlertDescription>
                    {result.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
          </Disclosure>

          <Disclosure title={m.textbooks.diffTitle} description={m.textbooks.diffDescription}>
          <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-2">
            <Section title={m.textbooks.rateTitle} description={m.textbooks.rateDescription}>
              <div className="px-5 py-4">
                <ForestPlot
                  ariaLabel={m.textbooks.rateAria}
                  domain={[0, 1]}
                  ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                  tickFormat={(v) => formatPercentValue(Math.round(v * 100))}
                  rows={groupPage.rows.map((g) => ({
                    id: g.textbookId,
                    label: tbById.get(g.textbookId)?.short ?? g.textbookName,
                    sublabel: t(m.textbooks.groupSub, { students: formatInt(g.comparableStudents), classes: g.classes.join(m.common.listSep) }),
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
            <Section title={refTb ? t(m.textbooks.diffTitleWith, { name: refTb.short }) : m.textbooks.diffTitle} description={m.textbooks.diffDescription}>
              <div className="px-5 py-4">
                <ForestPlot
                  ariaLabel={m.textbooks.diffAria}
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
          </Disclosure>

          <Disclosure title={m.textbooks.groupsTitle} description={m.textbooks.groupsDescription} count={result.groups.length}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="h-9 px-5 text-left font-medium">{m.textbooks.colTextbook}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.textbooks.colStudents}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.textbooks.colAnswers}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.textbooks.colAllQuestions}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.textbooks.colCommonQuestions}</th>
                    <th className="h-9 px-5 text-left font-medium">{m.textbooks.colByClass}</th>
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
                          {g.classes.length === 1 ? <Badge variant="medium">{m.textbooks.oneClass}</Badge> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={groupPage.page} pageCount={groupPage.pageCount} total={groupPage.total} start={groupPage.start} end={groupPage.end} onPageChange={groupPage.setPage} />
          </Disclosure>



          <Disclosure title={m.textbooks.tableTitle} description={m.textbooks.tableDescription}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="h-9 px-5 text-left font-medium">{m.textbooks.colTopic}</th>
                    <th className="h-9 px-3 text-left font-medium">{m.textbooks.colComparability}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.textbooks.colCommon}</th>
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
                          {t(m.textbooks.colDiff, { name: tbById.get(id)?.short ?? id })}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topicPage.rows.map((row) => {
                    const st = TOPIC_STATUS[row.status];
                    const comparable = row.status === "comparable";
                    return (
                      <tr key={row.topicKey} className={cn(!comparable && "bg-muted/30")}>
                        <td className="max-w-80 px-5 py-2.5">
                          <div className="font-medium">{row.topicName}</div>
                          {row.notes.map((n) => (
                            <div key={n} className="mt-0.5 text-xs leading-snug text-muted-foreground">
                              {n}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular">
                          {row.commonQuestions}
                          <span className="text-muted-foreground"> / {row.unionQuestions}</span>
                        </td>
                        {selectedIds.map((id) => {
                          const cell = row.cells[id];
                          return (
                            <td key={id} className="px-3 py-2.5 text-right tabular">
                              {cell ? (
                                <>
                                  <div className={cn("font-medium", !comparable && "text-muted-foreground")}>{comparable ? formatPct(cell.estimate?.rate) : formatPct(cell.rawRate)}</div>
                                  <div className="text-[11px] text-muted-foreground">{comparable ? t(m.units.studentsShort, { n: cell.students }) : m.textbooks.ownQuestions}</div>
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
                            const d = row.diffs[id];
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
            <Pagination page={topicPage.page} pageCount={topicPage.pageCount} total={topicPage.total} start={topicPage.start} end={topicPage.end} onPageChange={topicPage.setPage} />
          </Disclosure>
        </>
      )}
    </div>
  );
}

function TextbooksContent() {
  const { filters } = useReadyData();
  const { m } = useI18n();
  if (filters.subject === null || filters.grade === null) {
    return <CoursePicker reason={m.textbooks.pickerReason} />;
  }
  // key сбрасывает выбор учебников при смене курса.
  return <Comparison key={`${filters.subject}|${filters.grade}`} subject={filters.subject} grade={filters.grade} />;
}

export function TextbooksView() {
  const { m } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader title={m.textbooks.title} description={m.textbooks.description} />
      <DataGate>
        <SyntheticNotice />
        <Alert variant="default">
          <Info aria-hidden />
          <AlertTitle>{m.textbooks.causalityTitle}</AlertTitle>
          <AlertDescription>
            <p>{m.textbooks.causalityText}</p>
          </AlertDescription>
        </Alert>
        <FilterBar fields={["subject", "grade", "topicKey"]} />
        <AiPageInsight page="textbooks" />
        <TextbooksContent />
      </DataGate>
    </div>
  );
}
