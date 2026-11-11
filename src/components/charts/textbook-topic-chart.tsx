"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Legend } from "@/components/common/blocks";
import { formatInt, formatPct } from "@/lib/format";
import { AXIS_TICK, ChartTooltipCard, TooltipRow } from "./chart-tooltip";
import { useNarrow } from "./use-narrow";

export interface TextbookSeries {
  id: string;
  name: string;
  color: string;
}

export interface TextbookTopicDatum {
  key: string;
  topicName: string;
  commonQuestions: number;
  values: Record<string, { rate: number | null; students: number }>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Сгруппированные полосы: успешность на общих заданиях по каждой сопоставимой теме. */
export function TextbookTopicChart({ data, series }: { data: TextbookTopicDatum[]; series: TextbookSeries[] }) {
  const narrow = useNarrow();
  const labelWidth = narrow ? 120 : 250;
  const rows = data.map((d) => ({
    key: d.key,
    topicName: d.topicName,
    commonQuestions: d.commonQuestions,
    raw: d.values,
    ...Object.fromEntries(series.map((s) => [s.id, d.values[s.id]?.rate != null ? (d.values[s.id].rate as number) * 100 : null])),
  }));
  const groupHeight = Math.max(30, series.length * 12 + 14);
  const height = Math.max(140, rows.length * groupHeight + 40);

  return (
    <div className="grid gap-3">
      <div style={{ height }} role="img" aria-label="Успешность по темам на общих заданиях для каждого учебника">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={10} barGap={2}>
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
              interval={0}
              axisLine={false}
              tickLine={false}
              tick={(props: { x: number | string; y: number | string; payload: { value: string } }) => {
                const row = rows.find((r) => r.key === props.payload.value);
                return (
                  <text x={Number(props.x) - 8} y={Number(props.y)} dy={4} textAnchor="end" fontSize={12} fill="var(--foreground)">
                    <title>{row?.topicName}</title>
                    {truncate(row?.topicName ?? "", Math.floor((labelWidth - 12) / 6.8))}
                  </text>
                );
              }}
            />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const row = active && payload?.[0] ? (payload[0].payload as (typeof rows)[number]) : null;
                if (!row) return null;
                return (
                  <ChartTooltipCard title={row.topicName}>
                    {series.map((s) => (
                      <TooltipRow key={s.id} color={s.color} label={s.name} value={`${formatPct(row.raw[s.id]?.rate ?? null)} · ${formatInt(row.raw[s.id]?.students ?? 0)} уч.`} />
                    ))}
                    <div className="pt-1 text-[11px]">По {row.commonQuestions} общим заданиям</div>
                  </ChartTooltipCard>
                );
              }}
            />
            {series.map((s) => (
              <Bar key={s.id} dataKey={s.id} name={s.name} fill={s.color} barSize={10} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
    </div>
  );
}
