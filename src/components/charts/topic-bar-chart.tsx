"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LEVEL_META } from "@/components/common/levels";
import type { MasteryThresholds } from "@/lib/config/analysis-config";
import type { MasteryLevel } from "@/lib/domain/types";
import { formatCi, formatInt, formatPct } from "@/lib/format";
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
}

const ROW_HEIGHT = 30;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
  const labelWidth = narrow ? 130 : 290;
  // ~6,8 px на символ при 12px — обрезаем подпись, чтобы она не выходила за край.
  const maxChars = Math.floor((labelWidth - 12) / 6.8);
  const rows: ChartRow[] = data.map((d) => ({ ...d, value: d.rate === null ? 0 : d.rate * 100, label: d.context ? `${d.name} · ${d.context}` : d.name }));
  const height = Math.max(120, rows.length * ROW_HEIGHT + 36);

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={AXIS_TICK}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tickLine={false}
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
                  {truncate(text, maxChars)}
                </text>
              );
            }}
          />
          <ReferenceLine
            x={thresholds.medium}
            stroke="var(--level-low)"
            strokeOpacity={0.55}
            strokeDasharray="4 3"
            label={{ value: `${thresholds.medium}%`, position: "top", fill: "var(--chart-muted)", fontSize: 10 }}
          />
          <ReferenceLine
            x={thresholds.high}
            stroke="var(--level-high)"
            strokeOpacity={0.6}
            strokeDasharray="4 3"
            label={{ value: `${thresholds.high}%`, position: "top", fill: "var(--chart-muted)", fontSize: 10 }}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const row = active && payload?.[0] ? (payload[0].payload as ChartRow) : null;
              if (!row) return null;
              return (
                <ChartTooltipCard title={row.label}>
                  <TooltipRow color={LEVEL_META[row.level].color} label={`Уровень: ${LEVEL_META[row.level].label.toLowerCase()}`} value={formatPct(row.rate)} />
                  <TooltipRow label="95% ДИ" value={formatCi(row.ciLow, row.ciHigh)} />
                  <TooltipRow label="Учеников / ответов" value={`${formatInt(row.students)} / ${formatInt(row.answers)}`} />
                  {onSelect ? <div className="pt-1 text-[11px]">Нажмите, чтобы открыть детализацию</div> : null}
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
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: unknown) => (typeof v === "number" ? `${Math.round(v)}%` : "")}
              style={{ fill: "var(--chart-ink)", fontSize: 11, stroke: "var(--card)", strokeWidth: 3, paintOrder: "stroke" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
