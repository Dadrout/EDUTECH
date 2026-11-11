"use client";

import * as React from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, RotateCcw } from "lucide-react";
import { CoursePicker } from "@/components/common/course-picker";
import { DataGate } from "@/components/common/data-gate";
import { EmptyState, MethodNote, PageHeader, Section } from "@/components/common/blocks";
import { FilterBar } from "@/components/common/filter-bar";
import { LEVEL_META } from "@/components/common/levels";
import { HoursChangeChart } from "@/components/charts/hours-change-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterRecords } from "@/lib/analytics/filters";
import { buildHoursInputs, planTotal, recommendHours, type HoursRow } from "@/lib/analytics/hours";
import { computeTopicStats } from "@/lib/analytics/topics";
import { defaultHoursConfig } from "@/lib/config/analysis-config";
import { curriculumTemplateCsv, downloadCsv, toCsv } from "@/lib/data/export";
import { formatHours, formatHoursDelta, formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useReadyData } from "@/providers/data-provider";
import { SyntheticNotice } from "./overview-view";

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
      ...(reserve > 0 ? [[subject, grade, "", "Резерв (не распределено)", "", "", "", reserve, "", ""]] : []),
    ],
  );
  downloadCsv(`рекомендации-часы-${subject}-${grade}.csv`, csv);
}

function HoursPlanner({ subject, grade }: { subject: string; grade: number }) {
  const { dataset, filters, config } = useReadyData();
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

  const plan = React.useMemo(
    () =>
      recommendHours(inputs, {
        budgetHours: parseNum(form.budget),
        targetPct: parseNum(form.target),
        maxIncreaseShare: parseNum(form.maxInc) / 100,
        maxDecreaseShare: parseNum(form.maxDec) / 100,
        stepHours: parseNum(form.step),
        mediumPct: config.thresholds.medium,
      }),
    [inputs, form, config.thresholds.medium],
  );

  if (inputs.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={FileSpreadsheet}
          title={`Учебный план для «${subject}, ${grade} класс» не загружен`}
          description="Для рекомендаций нужны текущие и минимальные часы по каждой теме. Скачайте шаблон — в нём уже перечислены темы из результатов тестирования, — заполните часы и загрузите его на странице данных."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  downloadCsv(
                    `учебный-план-${subject}-${grade}.csv`,
                    curriculumTemplateCsv(topicStats.map((t) => ({ subject: t.subject, grade: t.grade, topicId: t.topicId, topicName: t.topicName }))),
                  )
                }
              >
                <Download aria-hidden />
                Шаблон плана с темами
              </Button>
              <Button asChild>
                <Link href="/data">Загрузить учебный план</Link>
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
      <Section
        title="Параметры расчёта"
        description="Исходные данные — учебный план и результаты тестирования выбранной параллели. Изменения пересчитываются сразу."
        actions={
          <Button variant="ghost" size="sm" onClick={() => setForm(defaults)}>
            <RotateCcw aria-hidden />
            По умолчанию
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <ParamField id="budget" label="Бюджет часов" value={form.budget} onChange={set("budget")} suffix="ч" hint={`Сейчас по плану: ${formatHours(total)}`} />
          <ParamField id="target" label="Целевой уровень освоения" value={form.target} onChange={set("target")} suffix="%" hint="Темы ниже цели получают приоритет" />
          <ParamField id="maxInc" label="Макс. увеличение темы" value={form.maxInc} onChange={set("maxInc")} suffix="%" hint="от текущих часов темы" />
          <ParamField id="maxDec" label="Макс. сокращение донора" value={form.maxDec} onChange={set("maxDec")} suffix="%" hint="не ниже минимума часов" />
          <div className="grid content-start gap-1.5">
            <Label htmlFor="step">Шаг изменения</Label>
            <Select value={form.step} onValueChange={set("step")}>
              <SelectTrigger id="step" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 час</SelectItem>
                <SelectItem value="0.5">0,5 часа</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">минимальная единица переноса</span>
          </div>
        </div>
      </Section>

      {!plan.ok ? (
        <Alert variant="destructive">
          <AlertOctagon aria-hidden />
          <AlertTitle>{plan.kind === "budget_below_minimum" ? "Конфликт ограничений: план не сформирован" : plan.message}</AlertTitle>
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
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Текущая сумма часов", value: formatHours(plan.currentTotal) },
              { label: "Рекомендуемая сумма", value: formatHours(plan.recommendedTotal) },
              { label: "Резерв (не распределено)", value: formatHours(plan.reserveHours) },
              { label: "Перераспределено", value: formatHours(plan.movedHours), sub: `${changed} тем изменено` },
              { label: "Сумма минимумов", value: formatHours(plan.minTotal) },
            ].map((k) => (
              <div key={k.label} className="bg-card px-4 py-3.5">
                <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-[22px] leading-none font-semibold tracking-tight">{k.value}</div>
                {k.sub ? <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div> : null}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <Alert variant="success">
              <CheckCircle2 aria-hidden />
              <AlertTitle>
                Ограничения соблюдены: {formatHours(plan.recommendedTotal)} + резерв {formatHours(plan.reserveHours)} = бюджет {formatHours(plan.budgetHours)}
              </AlertTitle>
              <AlertDescription>
                <p>Ни одна тема не опускается ниже установленного минимума, отрицательных значений нет. Рекомендации — предложение для методиста, а не обязательное решение.</p>
              </AlertDescription>
            </Alert>
            {plan.warnings.length > 0 || unplanned.length > 0 ? (
              <Alert variant="warning">
                <AlertTriangle aria-hidden />
                <AlertTitle>Обратите внимание</AlertTitle>
                <AlertDescription>
                  {plan.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                  {unplanned.length > 0 ? (
                    <p>
                      Темы с результатами тестирования, которых нет в учебном плане: {unplanned.map((u) => `«${u.topicName}»`).join(", ")}. Они не участвуют в расчёте.
                    </p>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <Section
            title="Перераспределение часов"
            description="Какие темы получают дополнительные часы и за счёт каких тем."
            actions={
              <MethodNote title="Как сформирована рекомендация">
                <p>
                  <b>1. База.</b> Текущие часы каждой темы, но не ниже минимума из плана.
                </p>
                <p>
                  <b>2. Бюджет.</b> Если база превышает бюджет, часы снимаются по шагу с тем с наибольшим освоением и запасом над минимумом.
                </p>
                <p>
                  <b>3. Приоритет.</b> Для тем ниже цели: приоритет = (цель − успешность) / цель. Потребность = часы × макс. увеличение × приоритет, с округлением до шага.
                </p>
                <p>
                  <b>4. Источник часов.</b> Сначала используется свободный бюджет, затем часы тем-доноров — тем с освоением не ниже цели. Донор отдаёт не больше «макс. сокращения» своих часов и не опускается ниже минимума; первыми отдают темы с наибольшим освоением.
                </p>
                <p>
                  <b>5. Резерв.</b> Неиспользованный бюджет не распределяется произвольно, а показывается как резерв.
                </p>
                <p>Темы с недостаточными данными и без результатов тестирования не меняются. Это эвристика, а не модель педагогической эффективности.</p>
              </MethodNote>
            }
          >
            <div className="px-5 py-4">
              <HoursChangeChart rows={plan.rows} />
            </div>
          </Section>

          <Section
            title="Рекомендации по темам"
            description="Обоснование указано для каждой темы."
            actions={
              <Button variant="outline" size="sm" onClick={() => exportPlan(plan.rows, subject, grade, plan.reserveHours)}>
                <Download aria-hidden />
                Скачать CSV
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-[13px]">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="h-9 px-5 text-left font-medium">Тема</th>
                    <th className="h-9 px-3 text-left font-medium">Успешность</th>
                    <th className="h-9 px-3 text-right font-medium">Текущие часы</th>
                    <th className="h-9 px-3 text-right font-medium">Мин.</th>
                    <th className="h-9 px-3 text-right font-medium">Рекомендуемые</th>
                    <th className="h-9 px-3 text-right font-medium">Изменение</th>
                    <th className="h-9 px-5 text-left font-medium">Причина</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {plan.rows.map((r) => {
                    const meta = LEVEL_META[r.level];
                    return (
                      <tr key={r.key} className="align-top">
                        <td className="max-w-64 px-5 py-3">
                          <div className="font-medium">{r.topicName}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.topicId}
                            {r.priority !== null ? ` · приоритет ${formatNumber(r.priority, 2)}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <meta.Icon className="size-3.5" style={{ color: meta.color }} aria-label={meta.label} />
                            <span className="font-medium tabular">{formatPct(r.rate)}</span>
                          </span>
                          <div className="text-[11px] text-muted-foreground">{r.students} уч.</div>
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
                      <td className="px-5 py-3 font-medium">Резерв (не распределено)</td>
                      <td />
                      <td className="px-3 py-3 text-right tabular">—</td>
                      <td />
                      <td className="px-3 py-3 text-right font-semibold tabular">{formatHours(plan.reserveHours)}</td>
                      <td />
                      <td className="px-5 py-3 text-xs text-muted-foreground">Часы сверх потребности тем ниже цели; методист распределяет их сам (повторение, обобщение).</td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="border-t bg-muted/50 font-medium">
                  <tr>
                    <td className="px-5 py-3">Итого</td>
                    <td />
                    <td className="px-3 py-3 text-right tabular">{formatHours(plan.currentTotal)}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular">{formatHours(plan.minTotal)}</td>
                    <td className="px-3 py-3 text-right tabular">{formatHours(plan.recommendedTotal + plan.reserveHours)}</td>
                    <td className="px-3 py-3 text-right tabular">{formatHoursDelta(plan.recommendedTotal + plan.reserveHours - plan.currentTotal)}</td>
                    <td className="px-5 py-3 text-xs font-normal text-muted-foreground">Бюджет: {formatHours(plan.budgetHours)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function HoursContent() {
  const { filters, config } = useReadyData();
  if (filters.subject === null || filters.grade === null) {
    return <CoursePicker reason="Учебный план составляется для конкретного предмета и параллели — выберите, для какого курса построить рекомендации." />;
  }
  return <HoursPlanner key={`${filters.subject}|${filters.grade}|${config.thresholds.high}`} subject={filters.subject} grade={filters.grade} />;
}

export function HoursView() {
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title="Распределение учебных часов"
        description="Предложение по перераспределению часов между темами на основе уровня освоения: больше времени — темам, которые ученики усваивают хуже, без превышения бюджета и нарушения минимумов."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/methodology#hours">
              <Info aria-hidden />
              Описание алгоритма
            </Link>
          </Button>
        }
      />
      <DataGate>
        <SyntheticNotice />
        <FilterBar fields={["subject", "grade"]} />
        <HoursContent />
      </DataGate>
    </div>
  );
}

