"use client";

import { AiPageInsight } from "@/components/ai/ai-insight";
import * as React from "react";
import { AlertTriangle, Info, ScanSearch } from "lucide-react";
import { Disclosure, Finding, Pagination, usePagination } from "@/components/common/exploration";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, MethodNote, PageHeader, RateBar, Section } from "@/components/common/blocks";
import { FilterBar } from "@/components/common/filter-bar";
import { LEVEL_META, seriesColor } from "@/components/common/levels";
import { TopicBarChart } from "@/components/charts/topic-bar-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/misc";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { i18n } from "@/i18n/core";
import { useI18n } from "@/i18n/provider";
import { Rich } from "@/i18n/rich";
import { filterRecords } from "@/lib/analytics/filters";
import { analyzeSkills, computeClassErrorStats, computeSkillDetail, ERROR_TYPES, type ErrorTypeCount, type QuestionStats, type SkillStats } from "@/lib/analytics/skills";
import { classifyLevel } from "@/lib/analytics/stats";
import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord } from "@/lib/domain/types";
import { formatCi, formatDate, formatInt, formatPct, formatPp, formatPpAbs, quote } from "@/lib/format";
import { useReadyData } from "@/providers/data-provider";
import { SyntheticNotice } from "./overview-view";
import { BreakdownTable } from "./topic-detail-sheet";

const MAX_CHART_SKILLS = 6;
const QUESTIONS_PREVIEW = 12;
const STACKED_SKILLS = 6;

/** Подпись категории ошибки: известный код — из словаря, иначе текст из файла. */
export function errorLabel(e: Pick<ErrorTypeCount, "errorType" | "known">): string {
  const labels = i18n().m.errorTypes as Record<string, string>;
  return e.known ? (labels[e.errorType] ?? e.errorType) : e.errorType;
}

/** Цвет категории закреплён за кодом (одинаков на всех графиках страницы); свои категории — нейтральные. */
export function errorColor(e: Pick<ErrorTypeCount, "errorType" | "known">): string {
  const index = (ERROR_TYPES as readonly string[]).indexOf(e.errorType);
  return e.known && index >= 0 ? seriesColor(index) : "var(--chart-neutral)";
}

/** Горизонтальные полосы долей категорий ошибок. */
export function ErrorBars({ errors, limit }: { errors: ErrorTypeCount[]; limit?: number }) {
  const { m, t } = useI18n();
  const shown = limit ? errors.slice(0, limit) : errors;
  if (shown.length === 0) return <p className="text-[13px] text-muted-foreground">{m.skills.errorsNone}</p>;
  return (
    <ul className="grid gap-2">
      {shown.map((e) => (
        <li key={e.errorType} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: errorColor(e) }} aria-hidden />
            <span className="truncate">{errorLabel(e)}</span>
          </span>
          <span className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-secondary sm:col-span-1 sm:row-start-auto" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${e.share * 100}%`, background: errorColor(e) }} />
          </span>
          <span className="text-right text-xs text-muted-foreground tabular">{t(m.skills.errorsCount, { count: formatInt(e.count), share: formatPct(e.share, 0) })}</span>
        </li>
      ))}
    </ul>
  );
}

/** Состав ошибок по навыкам: одна полоса на навык, сегменты — категории. */
function ErrorsBySkill({ skills, onSelect }: { skills: SkillStats[]; onSelect: (key: string) => void }) {
  const { m } = useI18n();
  const rows = skills.filter((s) => s.incorrectWithType > 0).slice(0, STACKED_SKILLS);
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-3">
      <h3 className="text-[13px] font-semibold">{m.skills.errorsBySkillTitle}</h3>
      <ul className="grid gap-2.5">
        {rows.map((s) => (
          <li key={s.key}>
            <button type="button" onClick={() => onSelect(s.key)} className="grid w-full gap-1 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30">
              <span className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate font-medium hover:underline">{s.skill}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">{formatPct(s.rate, 0)}</span>
              </span>
              <span className="flex h-3 w-full gap-px overflow-hidden rounded-[3px] bg-secondary" role="img" aria-label={s.errors.map((e) => `${errorLabel(e)} — ${formatPct(e.share, 0)}`).join(m.common.listSep)}>
                {s.errors.map((e) => (
                  <span key={e.errorType} className="h-full" style={{ width: `${e.share * 100}%`, background: errorColor(e) }} title={`${errorLabel(e)}: ${formatPct(e.share, 0)}`} />
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuestionTable({ questions, thresholds, showSkill, showTopic, previewLimit = QUESTIONS_PREVIEW }: { questions: QuestionStats[]; thresholds: AnalysisConfig["thresholds"]; showSkill: boolean; showTopic: boolean; previewLimit?: number }) {
  const { m } = useI18n();
  const questionPage = usePagination(questions, Math.min(QUESTIONS_PREVIEW, previewLimit));
  const shown = questionPage.rows;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="h-9 px-5 text-left font-medium">{m.skills.colQuestion}</th>
              {showTopic ? <th className="h-9 px-3 text-left font-medium">{m.skills.colTopic}</th> : null}
              {showSkill ? <th className="h-9 px-3 text-left font-medium">{m.skills.colSkill}</th> : null}
              <th className="h-9 px-3 text-right font-medium">{m.skills.colAnswers}</th>
              <th className="h-9 px-3 text-left font-medium">{m.skills.colRate}</th>
              <th className="h-9 px-5 text-left font-medium">{m.skills.colErrors}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((q) => {
              const level = classifyLevel(q.rate, thresholds);
              return (
                <tr key={`${q.topicKey}|${q.key}`} className="align-top">
                  <td className="px-5 py-2.5">
                    <div className="font-mono text-xs whitespace-nowrap">
                      {q.testId} · {q.questionId}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{formatDate(q.testDate)}</div>
                  </td>
                  {showTopic ? <td className="max-w-64 px-3 py-2.5">{q.topicName}</td> : null}
                  {showSkill ? <td className="max-w-56 px-3 py-2.5 text-muted-foreground">{q.skill ?? "—"}</td> : null}
                  <td className="px-3 py-2.5 text-right tabular">{formatInt(q.answers)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-10 font-medium tabular">{formatPct(q.rate, 0)}</span>
                      <RateBar rate={q.rate} color={LEVEL_META[level].color} thresholds={thresholds} className="w-20" />
                    </div>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {q.errors.slice(0, 2).map((e) => (
                        <span key={e.errorType} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs">
                          <span className="size-2 rounded-[2px]" style={{ background: errorColor(e) }} aria-hidden />
                          {errorLabel(e)} <span className="text-muted-foreground tabular">{formatPct(e.share, 0)}</span>
                        </span>
                      ))}
                      {q.errors.length === 0 ? <span className="text-muted-foreground">—</span> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination {...questionPage} onPageChange={questionPage.setPage} />
    </>
  );
}

/** Пояснения к навыку — только из вычисленных значений. */
function SkillExplanation({ skill, config }: { skill: SkillStats; config: AnalysisConfig }) {
  const { m, t } = useI18n();
  const lines: string[] = [];
  if (!skill.sufficient) {
    lines.push(t(m.skills.explainInsufficient, { students: config.minStudentsPerTopic, answers: config.minAnswersPerTopic }));
  }
  if (skill.rate !== null && skill.topicRate !== null && skill.deltaFromTopic !== null) {
    const params = { rate: formatPct(skill.rate), topicRate: formatPct(skill.topicRate), pp: formatPpAbs(skill.deltaFromTopic) };
    if (Math.abs(skill.deltaFromTopic) < 0.02) lines.push(t(m.skills.explainSame, params));
    else lines.push(t(skill.deltaFromTopic < 0 ? m.skills.explainBelow : m.skills.explainAbove, params));
  }
  const top = skill.errors[0];
  if (top) {
    lines.push(t(m.skills.explainTopError, { error: errorLabel(top), share: formatPct(top.share, 0), count: formatInt(top.count) }));
  }
  return (
    <ul className="grid gap-1.5 text-[13px] leading-relaxed">
      {lines.map((line) => (
        <li key={line} className="flex gap-2">
          <span aria-hidden className="text-muted-foreground">
            —
          </span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function SkillDetailSheet({ skillKey, records, config, onClose }: { skillKey: string | null; records: AnswerRecord[]; config: AnalysisConfig; onClose: () => void }) {
  const { m, t, plural } = useI18n();
  const detail = React.useMemo(() => (skillKey ? computeSkillDetail(records, skillKey, config) : null), [skillKey, records, config]);
  const s = detail?.skill;
  return (
    <Sheet open={skillKey !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="right" className="gap-0 overflow-y-auto sm:max-w-xl">
        {detail && s ? (
          <>
            <SheetHeader className="border-b">
              <div className="text-xs text-muted-foreground">
                {t(m.units.courseDot, { subject: s.subject, grade: s.grade })} · {t(m.skills.detailTopic, { topic: quote(s.topicName) })}
              </div>
              <SheetTitle className="text-lg">{s.skill}</SheetTitle>
              <SheetDescription asChild>
                <div className="pt-1">
                  <SkillExplanation skill={s} config={config} />
                </div>
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-1 gap-6 p-5">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
                {[
                  [m.skills.detailRate, formatPct(s.rate)],
                  [m.units.ci, formatCi(s.estimate?.ciLow, s.estimate?.ciHigh)],
                  [m.skills.detailTopicRate, formatPct(s.topicRate)],
                  [m.skills.detailDelta, formatPp(s.deltaFromTopic)],
                  [m.skills.detailStudents, formatInt(s.students)],
                  [m.skills.detailAnswers, `${formatInt(s.answers)} / ${formatInt(s.questions)}`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-card px-3 py-2.5">
                    <dt className="text-[11px] text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold tabular">{value}</dd>
                  </div>
                ))}
              </dl>
              {s.errors.length > 0 ? (
                <div className="grid gap-2">
                  <h3 className="text-[13px] font-semibold">{m.skills.detailErrors}</h3>
                  <ErrorBars errors={s.errors} />
                </div>
              ) : null}
              <BreakdownTable title={m.skills.detailByClass} rows={detail.byClass} config={config} minNote={plural(m.counts.fewerStudents, config.minStudentsPerCell)} />
              <BreakdownTable title={m.skills.detailByTextbook} rows={detail.byTextbook} config={config} minNote={plural(m.counts.fewerStudents, config.minStudentsPerGroup)} />
              <div className="grid gap-2">
                <h3 className="text-[13px] font-semibold">{m.skills.detailQuestions}</h3>
                <div className="overflow-hidden rounded-lg border">
                  <QuestionTable questions={detail.questions} thresholds={config.thresholds} showSkill={false} showTopic={false} />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SkillsContent() {
  const { dataset, filters, config, courses } = useReadyData();
  const { m, t, plural } = useI18n();
  const records = React.useMemo(() => filterRecords(dataset.records, filters), [dataset.records, filters]);
  const analysis = React.useMemo(() => analyzeSkills(records, config), [records, config]);
  const classStats = React.useMemo(() => computeClassErrorStats(records, config), [records, config]);
  const [selected, setSelected] = React.useState<string | null>(null);

  const { coverage, skills, errorTypes, questions } = analysis;
  const skillPage = usePagination(skills, MAX_CHART_SKILLS);
  const classPage = usePagination(classStats, 8);
  const weakest = skills.find(skill => skill.sufficient);
  const multiCourse = (filters.subject === null || filters.grade === null) && courses.length > 1;
  const multiTopic = filters.topicKey === null;

  const chartData = React.useMemo(
    () =>
      skillPage.rows.map((s) => ({
        key: s.key,
        name: s.skill,
        context: multiTopic ? (multiCourse ? `${s.topicName} · ${s.subject} ${s.grade}` : s.topicName) : undefined,
        rate: s.rate,
        ciLow: s.estimate?.ciLow ?? null,
        ciHigh: s.estimate?.ciHigh ?? null,
        level: s.level,
        students: s.students,
        answers: s.answers,
      })),
    [skillPage.rows, multiTopic, multiCourse],
  );

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={ScanSearch} title={m.skills.noData} description={m.common.changeFilters} />
      </div>
    );
  }

  const skillShare = coverage.answers > 0 ? coverage.withSkill / coverage.answers : 0;
  const errorShare = coverage.incorrect > 0 ? coverage.incorrectWithType / coverage.incorrect : 0;

  return (
    <div className="grid grid-cols-1 gap-5">
      <Finding title={weakest ? `${weakest.skill} · ${formatPct(weakest.rate)}` : coverage.hasSkills ? m.ux.noReliableFinding : m.skills.noSkillsTitle} tone={weakest && weakest.rate !== null && weakest.rate < config.thresholds.medium / 100 ? "warning" : "default"}>
        <p>{t(m.skills.summary, { skills: plural(m.skills.skillCount, skills.length), questions: plural(m.skills.questionCount, questions.length), answers: plural(m.counts.answers, coverage.answers) })}</p>
        <p className="mt-1 text-xs">{t(m.ux.errorCoverage, { typed: formatInt(coverage.incorrectWithType), incorrect: formatInt(coverage.incorrect) })}</p>
      </Finding>
      {!coverage.hasSkills ? (
        <Alert variant="default">
          <Info aria-hidden />
          <AlertTitle>{m.skills.noSkillsTitle}</AlertTitle>
          <AlertDescription>
            <p>{m.skills.noSkillsText}</p>
          </AlertDescription>
        </Alert>
      ) : skillShare < 0.999 || (coverage.hasErrorTypes && errorShare < 0.999) || !coverage.hasErrorTypes ? (
        <div role="note" className="flex items-start gap-2 rounded-lg border border-dashed border-input px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-[3px] size-3.5 shrink-0" aria-hidden />
          <p>
            {[
              skillShare < 0.999 ? t(m.skills.partialSkills, { share: formatPct(skillShare, 0) }) : null,
              !coverage.hasErrorTypes ? m.skills.noErrorTypes : errorShare < 0.999 ? t(m.skills.partialErrorTypes, { share: formatPct(errorShare, 0) }) : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
      ) : null}

      {coverage.hasSkills && skills.length > 0 ? (
        <Section
          title={m.skills.chartTitle}
          description={`${t(m.ux.rows, { start: skillPage.start, end: skillPage.end, total: skills.length })}. ${m.skills.chartAll}`}
          actions={
            <MethodNote>
              <p>
                <Rich text={m.skills.methodSkill} />
              </p>
              <p>
                <Rich text={m.skills.methodDelta} />
              </p>
              <p>{t(m.skills.methodSource, { students: config.minStudentsPerTopic, answers: config.minAnswersPerTopic })}</p>
            </MethodNote>
          }
        >
          <div className="px-3 py-4 sm:px-5">
            <TopicBarChart data={chartData} thresholds={config.thresholds} onSelect={setSelected} ariaLabel={m.skills.chartTitle} />
          </div>
          <Pagination {...skillPage} onPageChange={skillPage.setPage} />
        </Section>
      ) : null}

      {coverage.hasErrorTypes ? (
        <Disclosure title={m.skills.errorsTitle} description={t(m.skills.errorsDescription, { n: coverage.incorrectWithType })} defaultOpen={!coverage.hasSkills}>
          <div className="grid grid-cols-1 gap-6 px-5 py-4 lg:grid-cols-2">
            <ErrorBars errors={errorTypes} />
            <ErrorsBySkill skills={skills} onSelect={setSelected} />
          </div>
        </Disclosure>
      ) : null}

      <Disclosure title={m.ux.allData} count={questions.length}>
      <Section title={m.topicDetail.byClass} description={m.skills.classComparisonNote}>
        <div className="overflow-x-auto">
          <table className="report-table w-full min-w-[580px] text-sm">
            <thead><tr><th>{m.filters.classId}</th><th>{m.topics.colStudents}</th><th>{m.topics.colAnswers}</th><th>{m.skills.colIncorrect}</th><th>{m.skills.colErrorRate}</th><th>{m.skills.colRate}</th><th>{m.units.ci}</th></tr></thead>
            <tbody>{classPage.rows.map(row => <tr key={row.id}><td className="font-medium">{row.label}</td><td>{formatInt(row.students)}</td><td>{formatInt(row.answers)}</td><td>{formatInt(row.incorrect)}</td><td>{formatPct(row.answers > 0 ? row.incorrect / row.answers : null)}</td><td><div className="flex items-center gap-3"><span>{formatPct(row.estimate?.rate)}</span><RateBar rate={row.estimate?.rate ?? null} color={LEVEL_META[row.sufficient ? classifyLevel(row.estimate?.rate ?? null, config.thresholds) : "insufficient"].color} thresholds={config.thresholds} className="w-20" /></div>{!row.sufficient ? <p className="text-xs text-muted-foreground">{m.topics.insufficientData}</p> : null}</td><td className="text-xs text-muted-foreground">{formatCi(row.estimate?.ciLow, row.estimate?.ciHigh)}</td></tr>)}</tbody>
          </table>
        </div>
        <Pagination {...classPage} onPageChange={classPage.setPage} />
      </Section>

      <Section
        title={m.skills.questionsTitle}
        description={`${m.skills.questionsDescription} ${t(m.skills.summary, {
          skills: plural(m.skills.skillCount, skills.length),
          questions: plural(m.skills.questionCount, questions.length),
          answers: plural(m.counts.answers, coverage.answers),
        })}`}
      >
        <QuestionTable questions={questions} thresholds={config.thresholds} showSkill={coverage.hasSkills} showTopic={multiTopic} />
      </Section>

      </Disclosure>
      <SkillDetailSheet skillKey={selected} records={records} config={config} onClose={() => setSelected(null)} />
    </div>
  );
}

export function SkillsView() {
  const { m } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader title={m.skills.title} description={m.skills.description} />
      <DataGate>
        <SyntheticNotice />
        <FilterBar fields={["subject", "grade", "classId", "textbookId", "topicKey"]} />
        <AiPageInsight page="skills" />
        <SkillsContent />
      </DataGate>
    </div>
  );
}

