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

const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
/** Доля 0–1 → позиция в процентах ширины дорожки. Подписи оси и точки используют одну шкалу. */
const pos = (rate: number) => `${Math.max(0, Math.min(1, rate)) * 100}%`;

/** Connected estimates on one 0–100% scale; intervals preserve sample uncertainty. */
export function TextbookTopicChart({ data, series }: { data: TextbookTopicDatum[]; series: TextbookSeries[] }) {
  const { m, t } = useI18n();
  // Каждый учебник — на своей строке внутри темы, чтобы точки и интервалы не перекрывались.
  const laneGap = 10;
  const laneTop = (i: number) => 24 + (i - (series.length - 1) / 2) * laneGap;
  return (
    <div className="grid gap-4">
      <Legend items={series.map(s => ({ label: s.name, color: s.color }))} />
      <div className="grid grid-cols-[minmax(7rem,1fr)_minmax(10rem,2fr)] gap-x-4">
        <span />
        <div className="relative mx-2 h-4 text-[11px] text-muted-foreground tabular" aria-hidden>
          {TICKS.map(tick => (
            <span key={tick} className="absolute top-0 -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: pos(tick) }}>{formatPercentValue(tick * 100)}</span>
          ))}
        </div>
        {data.map(row => {
          const points = series.flatMap((s, i) => row.values[s.id]?.rate != null ? [{ series: s, lane: i, value: row.values[s.id] }] : []);
          const description = points.map(p => `${p.series.name}: ${formatPct(p.value.rate)}; ${t(m.units.studentsShort, { n: p.value.students })}${p.value.ciLow != null && p.value.ciHigh != null ? `; ${m.units.ci} ${formatPct(p.value.ciLow)}–${formatPct(p.value.ciHigh)}` : ""}`).join(". ");
          return <React.Fragment key={row.key}>
            <div className="min-w-0 border-b py-3"><p className="text-[13px] font-medium leading-snug">{row.topicName}</p><p className="mt-1 text-[11px] text-muted-foreground">{t(m.charts.commonQuestions, { n: row.commonQuestions })}</p></div>
            <div className="flex min-w-0 items-center border-b py-2">
              <div role="img" aria-label={`${row.topicName}. ${description || m.common.noDataForFilters}`} title={description} className="relative mx-2 h-12 w-full">
                {TICKS.map(tick => <span key={tick} aria-hidden className="absolute inset-y-1 w-px bg-[var(--chart-grid)]" style={{ left: pos(tick) }} />)}
                {points.map(({ series: s, lane, value }) => {
                  const top = laneTop(lane);
                  return <React.Fragment key={s.id}>
                    {value.ciLow != null && value.ciHigh != null ? (
                      <span aria-hidden className="absolute h-0.5 -translate-y-1/2 rounded-full opacity-60" style={{ top, left: pos(value.ciLow), width: `calc(${pos(value.ciHigh)} - ${pos(value.ciLow)})`, background: s.color }} />
                    ) : null}
                    <span aria-hidden className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[1.5px] ring-[var(--card)]" style={{ top, left: pos(value.rate as number), background: s.color }} title={`${s.name}: ${formatPct(value.rate)} · ${formatInt(value.students)}`} />
                  </React.Fragment>;
                })}
              </div>
            </div>
          </React.Fragment>;
        })}
      </div>
    </div>
  );
}
