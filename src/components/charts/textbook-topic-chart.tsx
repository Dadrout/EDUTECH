"use client";

import * as React from "react";
import { Legend } from "@/components/common/blocks";
import { formatInt, formatPct, formatPercentValue } from "@/lib/format";
import { useI18n } from "@/i18n/provider";

export interface TextbookSeries {
  id: string;
  name: string;
  color: string;
}

export interface TextbookTopicDatum {
  key: string;
  topicName: string;
  commonQuestions: number;
  values: Record<string, { rate: number | null; students: number; ciLow?: number | null; ciHigh?: number | null }>;
}

/** Connected estimates on one 0–100% scale; intervals preserve sample uncertainty. */
export function TextbookTopicChart({ data, series }: { data: TextbookTopicDatum[]; series: TextbookSeries[] }) {
  const { m, t } = useI18n();
  const x = (rate: number) => 12 + Math.max(0, Math.min(1, rate)) * 376;
  return (
    <div className="grid gap-4">
      <Legend items={series.map(s => ({ label: s.name, color: s.color }))} />
      <div className="grid grid-cols-[minmax(7rem,1fr)_minmax(10rem,2fr)] gap-x-4">
        <span />
        <div className="flex justify-between px-1 text-[11px] text-muted-foreground" aria-hidden>{[0, 20, 40, 60, 80, 100].map(value => <span key={value}>{formatPercentValue(value)}</span>)}</div>
        {data.map(row => {
          const points = series.flatMap(s => row.values[s.id]?.rate != null ? [{ series: s, value: row.values[s.id] }] : []);
          const rates = points.map(p => p.value.rate as number);
          const description = points.map(p => `${p.series.name}: ${formatPct(p.value.rate)}; ${t(m.units.studentsShort, { n: p.value.students })}${p.value.ciLow != null && p.value.ciHigh != null ? `; ${m.units.ci} ${formatPct(p.value.ciLow)}–${formatPct(p.value.ciHigh)}` : ""}`).join(". ");
          return <React.Fragment key={row.key}>
            <div className="min-w-0 border-b py-3"><p className="text-[13px] font-medium leading-snug">{row.topicName}</p><p className="mt-1 text-[11px] text-muted-foreground">{t(m.charts.commonQuestions, { n: row.commonQuestions })}</p></div>
            <div className="flex min-w-0 items-center border-b py-2">
              <svg viewBox="0 0 400 46" className="h-12 w-full" role="img" aria-label={`${row.topicName}. ${description || m.common.noDataForFilters}`}>
                <title>{description}</title>
                {[0, .2, .4, .6, .8, 1].map(tick => <line key={tick} x1={x(tick)} x2={x(tick)} y1={4} y2={42} stroke="var(--chart-grid)" />)}
                {rates.length > 1 ? <line x1={x(Math.min(...rates))} x2={x(Math.max(...rates))} y1={23} y2={23} stroke="var(--chart-axis)" strokeWidth={3} /> : null}
                {points.map(({ series: s, value }) => <g key={s.id}>
                  {value.ciLow != null && value.ciHigh != null ? <line x1={x(value.ciLow)} x2={x(value.ciHigh)} y1={23} y2={23} stroke={s.color} strokeWidth={2} opacity={.6} /> : null}
                  <circle cx={x(value.rate as number)} cy={23} r={5} fill={s.color} stroke="var(--card)" strokeWidth={1.5}><title>{s.name}: {formatPct(value.rate)} · {formatInt(value.students)}</title></circle>
                </g>)}
              </svg>
            </div>
          </React.Fragment>;
        })}
      </div>
    </div>
  );
}
