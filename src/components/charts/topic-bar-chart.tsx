"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LEVEL_META } from "@/components/common/levels";
import type { MasteryThresholds } from "@/lib/config/analysis-config";
import type { MasteryLevel } from "@/lib/domain/types";
import { formatCi, formatInt, formatPct, formatPercentValue } from "@/lib/format";
import { useI18n } from "@/i18n/provider";
import { AXIS_TICK, ChartTooltipCard, TooltipRow } from "./chart-tooltip";
import { useNarrow } from "./use-narrow";

export interface TopicBarDatum {
  key: string;
  name: string;
  context?: string;
  rate: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  level: MasteryLevel;
  students: number;
  answers: number;
}

interface ChartRow extends TopicBarDatum {
  value: number;
  label: string;
  /** Доверительный интервал как отклонения от значения, в п.п.: [вниз, вверх]. */
  ci: [number, number] | null;
}

const ROW_HEIGHT = 30;
// Геометрия области построения: по ней же ставятся кнопки строк поверх подписей.
const MARGIN = { top: 18, right: 44, bottom: 4, left: 4 };
const X_AXIS_HEIGHT = 24;
const LABEL_FONT = "12px Geologica Variable, system-ui, sans-serif";

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Обрезать подпись по фактической ширине шрифта (кириллица Geologica шире средней оценки). */
function fitText(text: string, maxWidth: number): string {
  if (measureCtx === undefined) measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  const ctx = measureCtx;
  if (!ctx) return text.length > maxWidth / 7.6 ? `${text.slice(0, Math.max(1, Math.floor(maxWidth / 7.6) - 1))}…` : text;
  ctx.font = LABEL_FONT;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, Math.max(1, lo)).trimEnd()}…`;
}

/**
 * Горизонтальная диаграмма успешности по темам. Цвет полосы — уровень освоения
 * (статус), он же продублирован в подсказке и таблице; пороги — опорные линии.
 */
export function TopicBarChart({
  data,
  thresholds,
  onSelect,
  ariaLabel,
}: {
  data: TopicBarDatum[];
  thresholds: MasteryThresholds;
  onSelect?: (key: string) => void;
  ariaLabel: string;
}) {
  const narrow = useNarrow();
  const { m, t } = useI18n();
  const labelWidth = narrow ? 130 : 290;
  const rows: ChartRow[] = data.map((d) => {
    const value = d.rate === null ? 0 : d.rate * 100;
    const ci: [number, number] | null = d.rate !== null && d.ciLow != null && d.ciHigh != null ? [Math.max(0, value - d.ciLow * 100), Math.max(0, d.ciHigh * 100 - value)] : null;
    return { ...d, value, ci, label: d.context ? `${d.name} · ${d.context}` : d.name };
  });
  const height = Math.max(120, rows.length * ROW_HEIGHT + 36);
  const band = rows.length ? (height - MARGIN.top - MARGIN.bottom - X_AXIS_HEIGHT) / rows.length : 0;

  return (
    <div role={onSelect ? "group" : "img"} aria-label={ariaLabel} style={{ height }} className="relative w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={MARGIN} barCategoryGap={8} accessibilityLayer={false}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tickFormatter={(v: number) => formatPercentValue(v)}
            tick={AXIS_TICK}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tickLine={false}
            height={X_AXIS_HEIGHT}
          />
          <YAxis
            type="category"
            dataKey="key"
            width={labelWidth}
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={(props: { x: number | string; y: number | string; payload: { value: string } }) => {
              const row = rows.find((r) => r.key === props.payload.value);
              const text = row?.label ?? "";
              return (
                <text x={Number(props.x) - 8} y={Number(props.y)} dy={4} textAnchor="end" fontSize={12} fill="var(--foreground)">
                  <title>{text}</title>
                  {fitText(text, labelWidth - 14)}
                </text>
              );
            }}
          />
          <ReferenceLine
            x={thresholds.medium}
            stroke="var(--chart-ink)"
            strokeOpacity={0.6}
            strokeDasharray="4 3"
            label={{ value: formatPercentValue(thresholds.medium), position: "top", fill: "var(--chart-muted)", fontSize: 10 }}
          />
          <ReferenceLine
            x={thresholds.high}
            stroke="var(--chart-ink)"
            strokeOpacity={0.35}
            strokeDasharray="4 3"
            label={{ value: formatPercentValue(thresholds.high), position: "top", fill: "var(--chart-muted)", fontSize: 10 }}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const row = active && payload?.[0] ? (payload[0].payload as ChartRow) : null;
              if (!row) return null;
              return (
                <ChartTooltipCard title={row.label}>
                  <TooltipRow color={LEVEL_META[row.level].color} label={t(m.levels.tooltipLevel, { level: LEVEL_META[row.level].label.toLowerCase() })} value={formatPct(row.rate)} />
                  <TooltipRow label={m.units.ci} value={formatCi(row.ciLow, row.ciHigh)} />
                  <TooltipRow label={m.charts.topicTooltipCounts} value={`${formatInt(row.students)} / ${formatInt(row.answers)}`} />
                  {onSelect ? <div className="pt-1 text-[11px]">{m.charts.clickForDetail}</div> : null}
                </ChartTooltipCard>
              );
            }}
          />
          <Bar
            dataKey="value"
            barSize={16}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            onClick={(entry: { payload?: ChartRow }) => {
              if (onSelect && entry?.payload) onSelect(entry.payload.key);
            }}
            style={{ cursor: onSelect ? "pointer" : undefined }}
          >
            {rows.map((r) => (
              <Cell key={r.key} fill={LEVEL_META[r.level].color} />
            ))}
            <ErrorBar dataKey="ci" direction="x" width={6} strokeWidth={1.25} stroke="var(--chart-ink)" strokeOpacity={0.55} />
            <LabelList
              dataKey="value"
              position="right"
              offset={10}
              formatter={(v: unknown) => (typeof v === "number" ? formatPercentValue(Math.round(v)) : "")}
              style={{ fill: "var(--chart-ink)", fontSize: 11, stroke: "var(--card)", strokeWidth: 3, paintOrder: "stroke" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {onSelect
        ? rows.map((r, i) => (
            // Клавиатура и экранные дикторы: каждая строка — кнопка поверх подписи.
            <button
              key={r.key}
              type="button"
              onClick={() => onSelect(r.key)}
              aria-label={`${r.label}: ${formatPct(r.rate)}, ${m.units.ci} ${formatCi(r.ciLow, r.ciHigh)}`}
              className="absolute left-0 rounded-md outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
              style={{ top: MARGIN.top + band * i, height: band, width: labelWidth + MARGIN.left }}
            />
          ))
        : null}
    </div>
  );
}
