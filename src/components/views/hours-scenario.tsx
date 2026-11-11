"use client";

import * as React from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Download, Minus, Plus, RotateCcw } from "lucide-react";
import { MethodNote, Section } from "@/components/common/blocks";
import { LEVEL_META } from "@/components/common/levels";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { Rich } from "@/i18n/rich";
import type { HoursParams, HoursRow } from "@/lib/analytics/hours";
import { evaluateScenario, initialScenario, snapHours, type PlanSummary, type ScenarioHours, type ScenarioIssue } from "@/lib/analytics/scenario";
import { downloadCsv, toCsv } from "@/lib/data/export";
import { formatHours, formatHoursDelta, formatNumber, formatPct, formatPercentValue, quote } from "@/lib/format";
import { cn } from "@/lib/utils";

function IssueText({ issue }: { issue: ScenarioIssue }) {
  const { m, t } = useI18n();
  return <>{t(m.scenario.issue[issue.kind], { topic: issue.topicName ? quote(issue.topicName) : "", hours: formatHours(issue.hours), limit: formatHours(issue.limit) })}</>;
}

function sliderMax(row: HoursRow): number {
  // Достаточный запас для экспериментов: вдвое больше наибольшего из текущих/рекомендованных часов.
  return Math.max(2, Math.ceil(Math.max(row.currentHours, row.recommendedHours, row.minHours) * 2));
}

/**
 * Интерактивный what-if план. Логика ограничений — в lib/analytics/scenario.ts;
 * здесь только состояние формы и представление.
 */
export function HoursScenario({ rows, params, subject, grade }: { rows: HoursRow[]; params: HoursParams; subject: string; grade: number }) {
  const { m, t, plural } = useI18n();
  const [custom, setCustom] = React.useState<ScenarioHours>(() => initialScenario(rows, "recommended"));
  const evaluation = React.useMemo(() => evaluateScenario(rows, custom, params), [rows, custom, params]);
  const step = params.stepHours > 0 ? params.stepHours : 0.5;

  const setHours = (key: string, value: number) => setCustom((prev) => ({ ...prev, [key]: snapHours(value, step) }));
  const errors = evaluation.issues.filter((i) => i.severity === "error");
  const warnings = evaluation.issues.filter((i) => i.severity === "warning");
  const errorKeys = new Set(errors.map((i) => i.key).filter(Boolean));
  const s = evaluation.custom;
  const used = params.budgetHours > 0 ? Math.min(1, s.total / params.budgetHours) : 0;

  const exportScenario = () => {
    const csv = toCsv(
      ["subject", "grade", "topic_id", "topic_name", "min_hours", "current_hours", "recommended_hours", "custom_hours", "change_vs_current"],
      evaluation.rows.map((r) => [subject, grade, r.topicId, r.topicName, r.minHours, r.current, r.recommended, r.custom, r.deltaCurrent]),
    );
    downloadCsv(t(m.scenario.exportFile, { subject, grade }), csv);
  };

  const metric = (summary: PlanSummary, key: "total" | "remaining" | "changed" | "moved" | "below" | "shift"): string => {
    switch (key) {
      case "total":
        return formatHours(summary.total);
      case "remaining":
        return formatHoursDelta(summary.remaining);
      case "changed":
        return formatNumber(summary.changedTopics, 0);
      case "moved":
        return formatHours(summary.movedHours);
      case "below":
        return `${formatHours(summary.hoursBelowTarget)} (${formatPct(summary.shareBelowTarget, 0)})`;
      default:
        return `${summary.priorityShift > 0 ? "+" : summary.priorityShift < 0 ? "−" : ""}${formatNumber(Math.abs(summary.priorityShift), 2)}`;
    }
  };

  return (
    <Section
      title={m.scenario.title}
      description={m.scenario.description}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => setCustom(initialScenario(rows, "recommended"))}>
            <RotateCcw aria-hidden />
            {m.scenario.resetRecommended}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCustom(initialScenario(rows, "current"))}>
            {m.scenario.resetCurrent}
          </Button>
          <Button variant="outline" size="sm" onClick={exportScenario}>
            <Download aria-hidden />
            {m.scenario.exportCsv}
          </Button>
        </>
      }
    >
      {/* Бюджет: сколько распределено и что осталось. */}
      <div className="grid gap-3 border-b px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
            <span className="text-muted-foreground">{t(m.scenario.budgetUsed, { total: formatHours(s.total), budget: formatHours(params.budgetHours) })}</span>
            <span className={cn("inline-flex items-center gap-1.5 font-medium", evaluation.valid ? "text-success-ink" : "text-level-low-fg")}>
              {evaluation.valid ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertOctagon className="size-4" aria-hidden />}
              {evaluation.valid ? m.scenario.valid : plural(m.scenario.invalid, errors.length)}
              {warnings.length > 0 ? <span className="font-normal text-muted-foreground">· {plural(m.scenario.warnings, warnings.length)}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary" role="meter" aria-valuemin={0} aria-valuemax={params.budgetHours} aria-valuenow={s.total} aria-label={m.scenario.metricTotal}>
            <div className={cn("h-full rounded-full", s.remaining < 0 ? "bg-level-low" : "bg-primary")} style={{ width: `${used * 100}%` }} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">{s.remaining < 0 ? m.scenario.overBudget : m.scenario.remaining}</div>
          <div className={cn("text-[22px] leading-none font-semibold tabular", s.remaining < 0 && "text-level-low-fg")}>{formatHours(Math.abs(s.remaining))}</div>
        </div>
      </div>

      {/* Часы по темам. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="h-9 px-5 text-left font-medium">{m.scenario.colTopic}</th>
              <th className="h-9 px-3 text-right font-medium">{m.scenario.colCurrent}</th>
              <th className="h-9 px-3 text-right font-medium">{m.scenario.colRecommended}</th>
              <th className="h-9 px-3 text-left font-medium">{m.scenario.colCustom}</th>
              <th className="h-9 px-5 text-right font-medium">{m.scenario.colDelta}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {evaluation.rows.map((r, i) => {
              const source = rows[i];
              const meta = LEVEL_META[source.level];
              const invalid = errorKeys.has(r.key);
              const max = sliderMax(source);
              return (
                <tr key={r.key} className={cn("align-middle", invalid && "bg-level-low-bg/45")}>
                  <td className="max-w-72 px-5 py-2.5">
                    <div className="font-medium">{r.topicName}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <meta.Icon className="size-3.5" style={{ color: meta.color }} aria-label={meta.label} />
                      <span className="tabular">{formatPct(r.rate)}</span>
                      <span>· {t(m.scenario.minHint, { hours: formatHours(r.minHours) })}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular">{formatHours(r.current)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular">{formatHours(r.recommended)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={m.scenario.decrease} onClick={() => setHours(r.key, r.custom - step)} disabled={r.custom <= 0}>
                        <Minus aria-hidden />
                      </Button>
                      <input
                        type="range"
                        min={0}
                        max={max}
                        step={step}
                        value={Math.min(r.custom, max)}
                        onChange={(e) => setHours(r.key, Number(e.target.value))}
                        aria-label={t(m.scenario.sliderLabel, { topic: r.topicName })}
                        className="h-1.5 w-36 cursor-pointer accent-[var(--primary)]"
                      />
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={m.scenario.increase} onClick={() => setHours(r.key, r.custom + step)}>
                        <Plus aria-hidden />
                      </Button>
                      <input
                        type="number"
                        min={0}
                        step={step}
                        value={r.custom}
                        onChange={(e) => {
                          const v = Number(e.target.value.replace(",", "."));
                          if (Number.isFinite(v)) setHours(r.key, v);
                        }}
                        aria-label={t(m.scenario.sliderLabel, { topic: r.topicName })}
                        className={cn(
                          "h-8 w-16 rounded-md border border-input bg-card px-2 text-right text-[13px] font-semibold tabular outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                          invalid && "border-level-low text-level-low-fg",
                        )}
                      />
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-5 py-2.5 text-right font-semibold tabular",
                      r.deltaCurrent > 0 && "text-primary",
                      r.deltaCurrent < 0 && "text-[#b4471c]",
                      r.deltaCurrent === 0 && "font-normal text-muted-foreground",
                    )}
                  >
                    {formatHoursDelta(r.deltaCurrent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ограничения и сравнение планов. */}
      <div className="grid grid-cols-1 gap-5 border-t px-5 py-4 xl:grid-cols-2">
        <div className="grid content-start gap-2">
          <h3 className="text-[13px] font-semibold">{m.scenario.issuesTitle}</h3>
          {evaluation.issues.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-success-ink">
              <CheckCircle2 className="size-4" aria-hidden />
              {m.scenario.noIssues}
            </p>
          ) : (
            <ul className="grid gap-1.5 text-[13px] leading-relaxed">
              {evaluation.issues.map((issue, idx) => (
                <li key={`${issue.kind}-${issue.key ?? "budget"}-${idx}`} className="flex gap-2">
                  {issue.severity === "error" ? (
                    <AlertOctagon className="mt-0.5 size-4 shrink-0 text-level-low" aria-label={m.common.error} />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-level-medium-fg" aria-label={m.common.warning} />
                  )}
                  <span>
                    <IssueText issue={issue} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid content-start gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold">{m.scenario.compareTitle}</h3>
            <MethodNote title={m.scenario.methodTitle}>
              <p>
                <Rich text={t(m.scenario.method1, { target: formatPercentValue(params.targetPct) })} />
              </p>
              <p>
                <Rich text={m.scenario.method2} />
              </p>
              <p>{m.scenario.method3}</p>
            </MethodNote>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[440px] text-[13px]">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium" />
                  <th className="px-3 py-2 text-right font-medium">{m.scenario.planCurrent}</th>
                  <th className="px-3 py-2 text-right font-medium">{m.scenario.planRecommended}</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground">{m.scenario.planCustom}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(
                  [
                    ["total", m.scenario.metricTotal],
                    ["remaining", m.scenario.metricRemaining],
                    ["changed", m.scenario.metricChanged],
                    ["moved", m.scenario.metricMoved],
                    ["below", m.scenario.metricBelowTarget],
                    ["shift", m.scenario.metricPriorityShift],
                  ] as const
                ).map(([key, label]) => (
                  <tr key={key}>
                    <td className="px-3 py-2 text-muted-foreground">{label}</td>
                    <td className="px-3 py-2 text-right tabular">{metric(evaluation.current, key)}</td>
                    <td className="px-3 py-2 text-right tabular">{metric(evaluation.recommended, key)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular">{metric(evaluation.custom, key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Section>
  );
}
