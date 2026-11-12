"use client";

import { AiPageInsight } from "@/components/ai/ai-insight";
import * as React from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, Download, FileSpreadsheet, Info, RotateCcw } from "lucide-react";
import { CoursePicker } from "@/components/common/course-picker";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, MethodNote, PageHeader, Section } from "@/components/common/blocks";
import { Disclosure, Finding, Pagination, usePagination } from "@/components/common/exploration";
import { FilterBar } from "@/components/common/filter-bar";
import { LEVEL_META } from "@/components/common/levels";
import { HoursChangeChart } from "@/components/charts/hours-change-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterRecords } from "@/lib/analytics/filters";
import { buildHoursInputs, planTotal, recommendHours, type HoursParams, type HoursRow } from "@/lib/analytics/hours";
import { computeTopicStats } from "@/lib/analytics/topics";
import { defaultHoursConfig } from "@/lib/config/analysis-config";
import { curriculumTemplateCsv, downloadCsv, toCsv } from "@/lib/data/export";
import { formatHours, formatHoursDelta, formatNumber, formatPct, quote } from "@/lib/format";
import { i18n } from "@/i18n/core";
import { useI18n } from "@/i18n/provider";
import { Rich } from "@/i18n/rich";
import { cn } from "@/lib/utils";
import { useReadyData } from "@/providers/data-provider";
import { HoursScenario } from "./hours-scenario";
import { SyntheticNotice } from "./overview-view";

const EMPTY_HOURS_ROWS: HoursRow[] = [];

function parseNum(value: string): number {
  const n = Number(value.trim().replace(",", "."));
  return value.trim() === "" ? Number.NaN : n;
}

function ParamField({
  id,
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={cn(suffix && "pr-9")} />
        {suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span> : null}
      </div>
      {hint ? <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function exportPlan(rows: HoursRow[], subject: string, grade: number, reserve: number) {
  const csv = toCsv(
    ["subject", "grade", "topic_id", "topic_name", "success_rate_pct", "current_hours", "min_hours", "recommended_hours", "change_hours", "reason"],
    [
      ...rows.map((r) => [
        subject,
        grade,
        r.topicId,
        r.topicName,
        r.rate === null ? "" : Math.round(r.rate * 1000) / 10,
        r.currentHours,
        r.minHours,
        r.recommendedHours,
        r.changeHours,
        r.reasons.join(" "),
      ]),
      ...(reserve > 0 ? [[subject, grade, "", i18n().m.hours.reserve, "", "", "", reserve, "", ""]] : []),
    ],
  );
  downloadCsv(i18n().t(i18n().m.hours.exportFile, { subject, grade }), csv);
}

function HoursPlanner({ subject, grade, scenarioOnly = false }: { subject: string; grade: number; scenarioOnly?: boolean }) {
  const { dataset, filters, config } = useReadyData();
  const { m, t, plural } = useI18n();
  const records = React.useMemo(() => filterRecords(dataset.records, filters, ["subject", "grade"]), [dataset.records, filters]);
  const topicStats = React.useMemo(() => computeTopicStats(records, config), [records, config]);
  const { inputs, unplanned } = React.useMemo(() => buildHoursInputs(dataset.curriculum, topicStats, subject, grade), [dataset.curriculum, topicStats, subject, grade]);
  const total = React.useMemo(() => planTotal(dataset.curriculum, subject, grade), [dataset.curriculum, subject, grade]);

  const defaults = React.useMemo(() => {
    const h = defaultHoursConfig(config);
    return {
      budget: String(total),
      target: String(h.targetPct),
      maxInc: String(Math.round(h.maxIncreaseShare * 100)),
      maxDec: String(Math.round(h.maxDecreaseShare * 100)),
      step: String(h.stepHours),
    };
  }, [config, total]);
  const [form, setForm] = React.useState(defaults);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  // Одни и те же параметры — для рекомендации и для симулятора.
  const params = React.useMemo<HoursParams>(
    () => ({
      budgetHours: parseNum(form.budget),
      targetPct: parseNum(form.target),
      maxIncreaseShare: parseNum(form.maxInc) / 100,
      maxDecreaseShare: parseNum(form.maxDec) / 100,
      stepHours: parseNum(form.step),
      mediumPct: config.thresholds.medium,
    }),
    [form, config.thresholds.medium],
  );
  const plan = React.useMemo(() => recommendHours(inputs, params), [inputs, params]);
  const rowPage = usePagination(plan.ok ? plan.rows : EMPTY_HOURS_ROWS, 8);

  if (inputs.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={FileSpreadsheet}
          title={t(m.hours.noPlanTitle, { course: quote(t(m.units.course, { subject, grade })) })}
          description={m.hours.noPlanDescription}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  downloadCsv(
                    t(m.hours.templateFile, { subject, grade }),
                    curriculumTemplateCsv(topicStats.map((t) => ({ subject: t.subject, grade: t.grade, topicId: t.topicId, topicName: t.topicName }))),
                  )
                }
              >
                <Download aria-hidden />
                {m.hours.planTemplate}
              </Button>
              <Button asChild>
                <Link href="/data">{m.hours.uploadPlan}</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const changed = plan.ok ? plan.rows.filter((r) => r.changeHours !== 0).length : 0;

  return (
    <div className="grid grid-cols-1 gap-5">
      {plan.ok && !scenarioOnly ? (() => {
        // Нехватка часов — главное сообщение; соблюдённые ограничения уходят в подзаголовок.
        const shortfall = plan.unmetDemandHours > 0;
        const constraints = t(m.hours.okTitle, { recommended: formatHours(plan.recommendedTotal), reserve: formatHours(plan.reserveHours), budget: formatHours(plan.budgetHours) });
        return (
          <Finding
            title={shortfall ? t(m.hours.shortfallTitle, { hours: formatHours(plan.unmetDemandHours) }) : constraints}
            tone={shortfall ? "caution" : "success"}
            actions={<>
              <Button onClick={() => exportPlan(plan.rows, subject, grade, plan.reserveHours)}><Download aria-hidden />{m.hours.downloadCsv}</Button>
              <Button asChild variant="outline"><Link href="/simulator">{m.nav.simulator}</Link></Button>
            </>}
          >
            {shortfall ? <p>{constraints}. {m.hours.shortfallHint}</p> : null}
            <p className={shortfall ? "mt-1" : undefined}>{plural(m.hours.kpiChanged, changed)} · {m.hours.kpiMoved}: {formatHours(plan.movedHours)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{m.hours.method6}</p>
          </Finding>
        );
      })() : null}
      <Disclosure
        title={m.hours.paramsTitle}
        description={m.hours.paramsDescription}
      >
        <div className="flex justify-end px-5 pt-3"><Button variant="ghost" size="sm" onClick={() => setForm(defaults)}>
            <RotateCcw aria-hidden />
            {m.hours.defaults}
          </Button></div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <ParamField id="budget" label={m.hours.budget} value={form.budget} onChange={set("budget")} suffix={m.hours.hoursSuffix} hint={t(m.hours.budgetHint, { hours: formatHours(total) })} />
          <ParamField id="target" label={m.hours.target} value={form.target} onChange={set("target")} suffix="%" hint={m.hours.targetHint} />
          <ParamField id="maxInc" label={m.hours.maxIncrease} value={form.maxInc} onChange={set("maxInc")} suffix="%" hint={m.hours.maxIncreaseHint} />
          <ParamField id="maxDec" label={m.hours.maxDecrease} value={form.maxDec} onChange={set("maxDec")} suffix="%" hint={m.hours.maxDecreaseHint} />
          <div className="grid content-start gap-1.5">
            <Label htmlFor="step">{m.hours.step}</Label>
            <Select value={form.step} onValueChange={set("step")}>
              <SelectTrigger id="step" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{m.hours.stepOne}</SelectItem>
                <SelectItem value="0.5">{m.hours.stepHalf}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">{m.hours.stepHint}</span>
          </div>
        </div>
      </Disclosure>

      {!plan.ok ? (
        <Alert variant="destructive">
          <AlertOctagon aria-hidden />
          <AlertTitle>{plan.kind === "budget_below_minimum" ? m.hours.conflictTitle : plan.message}</AlertTitle>
          <AlertDescription>
            {plan.kind === "budget_below_minimum" ? <p>{plan.message}</p> : null}
            {plan.details.length > 0 ? (
              <ul className="list-disc pl-4">
                {plan.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {!scenarioOnly ? <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: m.hours.kpiCurrent, value: formatHours(plan.currentTotal) },
              { label: m.hours.kpiRecommended, value: formatHours(plan.recommendedTotal) },
              { label: m.hours.kpiReserve, value: formatHours(plan.reserveHours) },
              { label: m.hours.kpiMoved, value: formatHours(plan.movedHours), sub: plural(m.hours.kpiChanged, changed) },
              { label: m.hours.kpiMinimum, value: formatHours(plan.minTotal) },
            ].map((k) => (
              <div key={k.label} className="bg-card px-4 py-3.5">
                <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-[22px] leading-none font-semibold tracking-tight">{k.value}</div>
                {k.sub ? <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div> : null}
              </div>
            ))}
          </div>



          <Section
            title={m.hours.chartTitle}
            description={m.hours.chartDescription}
            actions={
              <MethodNote title={m.hours.methodTitle}>
                {[m.hours.method1, m.hours.method2, m.hours.method3, m.hours.method4, m.hours.method5].map((text) => (
                  <p key={text}>
                    <Rich text={text} />
                  </p>
                ))}
                <p>{m.hours.method6}</p>
              </MethodNote>
            }
          >
            <div className="px-5 py-4">
              <HoursChangeChart rows={rowPage.rows} />
            </div>
            <Pagination page={rowPage.page} pageCount={rowPage.pageCount} total={rowPage.total} start={rowPage.start} end={rowPage.end} onPageChange={rowPage.setPage} />
          </Section>

          <Disclosure
            title={m.hours.tableTitle}
            description={m.hours.tableDescription}
          >
            <div className="flex justify-end p-3"><Button variant="outline" size="sm" onClick={() => exportPlan(plan.rows, subject, grade, plan.reserveHours)}>
                <Download aria-hidden />
                {m.hours.downloadCsv}
              </Button></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-[13px]">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="h-9 px-5 text-left font-medium">{m.hours.colTopic}</th>
                    <th className="h-9 px-3 text-left font-medium">{m.hours.colRate}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.hours.colCurrent}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.hours.colMin}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.hours.colRecommended}</th>
                    <th className="h-9 px-3 text-right font-medium">{m.hours.colChange}</th>
                    <th className="h-9 px-5 text-left font-medium">{m.hours.colReason}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rowPage.rows.map((r) => {
                    const meta = LEVEL_META[r.level];
                    return (
                      <tr key={r.key} className="align-top">
                        <td className="max-w-64 px-5 py-3">
                          <div className="font-medium">{r.topicName}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.topicId}
                            {r.priority !== null ? t(m.hours.priority, { value: formatNumber(r.priority, 2) }) : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <meta.Icon className="size-3.5" style={{ color: meta.color }} aria-label={meta.label} />
                            <span className="font-medium tabular">{formatPct(r.rate)}</span>
                          </span>
                          <div className="text-[11px] text-muted-foreground">{t(m.units.studentsShort, { n: r.students })}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular">{formatHours(r.currentHours)}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular">{formatHours(r.minHours)}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular">{formatHours(r.recommendedHours)}</td>
                        <td
                          className={cn(
                            "px-3 py-3 text-right font-semibold tabular",
                            r.changeHours > 0 && "text-primary",
                            r.changeHours < 0 && "text-[#b4471c]",
                            r.changeHours === 0 && "font-normal text-muted-foreground",
                          )}
                        >
                          {formatHoursDelta(r.changeHours)}
                        </td>
                        <td className="max-w-[28rem] px-5 py-3 text-xs leading-relaxed text-muted-foreground">{r.reasons.join(" ")}</td>
                      </tr>
                    );
                  })}
                  {plan.reserveHours > 0 ? (
                    <tr className="bg-muted/30">
                      <td className="px-5 py-3 font-medium">{m.hours.reserve}</td>
                      <td />
                      <td className="px-3 py-3 text-right tabular">—</td>
                      <td />
                      <td className="px-3 py-3 text-right font-semibold tabular">{formatHours(plan.reserveHours)}</td>
                      <td />
                      <td className="px-5 py-3 text-xs text-muted-foreground">{m.hours.reserveNote}</td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="border-t bg-muted/50 font-medium">
                  <tr>
                    <td className="px-5 py-3">{m.hours.total}</td>
                    <td />
                    <td className="px-3 py-3 text-right tabular">{formatHours(plan.currentTotal)}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular">{formatHours(plan.minTotal)}</td>
                    <td className="px-3 py-3 text-right tabular">{formatHours(plan.recommendedTotal + plan.reserveHours)}</td>
                    <td className="px-3 py-3 text-right tabular">{formatHoursDelta(plan.recommendedTotal + plan.reserveHours - plan.currentTotal)}</td>
                    <td className="px-5 py-3 text-xs font-normal text-muted-foreground">{t(m.hours.budgetTotal, { hours: formatHours(plan.budgetHours) })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination page={rowPage.page} pageCount={rowPage.pageCount} total={rowPage.total} start={rowPage.start} end={rowPage.end} onPageChange={rowPage.setPage} />
          </Disclosure>

          </> : null}
            {plan.warnings.length > 0 || unplanned.length > 0 ? (
              <Alert variant="warning">
                <AlertTriangle aria-hidden />
                <AlertTitle>{m.hours.noticeTitle}</AlertTitle>
                <AlertDescription>
                  {plan.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                  {unplanned.length > 0 ? (
                    <p>{t(m.hours.unplanned, { topics: unplanned.map((u) => quote(u.topicName)).join(m.common.listSep) })}</p>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          {scenarioOnly ? <HoursScenario key={JSON.stringify({ rows: plan.rows, params })} rows={plan.rows} params={params} subject={subject} grade={grade} /> : null}
        </>
      )}
    </div>
  );
}

function HoursContent({ scenarioOnly = false }: { scenarioOnly?: boolean }) {
  const { filters, config, dataset } = useReadyData();
  const { m } = useI18n();
  if (filters.subject === null || filters.grade === null) {
    return <CoursePicker reason={m.hours.pickerReason} />;
  }
  return <HoursPlanner key={JSON.stringify({ subject: filters.subject, grade: filters.grade, config, curriculum: dataset.curriculum })} subject={filters.subject} grade={filters.grade} scenarioOnly={scenarioOnly} />;
}

export function HoursView({ scenarioOnly = false }: { scenarioOnly?: boolean }) {
  const { m } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title={scenarioOnly ? m.scenario.title : m.hours.title}
        description={scenarioOnly ? m.scenario.description : m.hours.description}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/methodology#hours">
              <Info aria-hidden />
              {m.hours.algorithm}
            </Link>
          </Button>
        }
      />
      <DataGate>
        <SyntheticNotice />
        <FilterBar fields={["subject", "grade"]} />
        <AiPageInsight page="hours" />
        <HoursContent scenarioOnly={scenarioOnly} />
      </DataGate>
    </div>
  );
}

