"use client";

import { i18n } from "@/i18n/core";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface ForestRow {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  /** Значения в долях (−1..1 для разниц, 0..1 для оценок). */
  value: number | null;
  low: number | null;
  high: number | null;
  valueText: string;
  rangeText?: string;
  muted?: boolean;
}

/**
 * «Лесной» график: точка — оценка, линия — 95% доверительный интервал.
 * Позволяет сразу увидеть, перекрываются ли интервалы и пересекают ли они ноль.
 */
export function ForestPlot({
  rows,
  domain,
  ticks,
  tickFormat,
  zeroLine,
  ariaLabel,
}: {
  rows: ForestRow[];
  domain: [number, number];
  ticks: number[];
  tickFormat: (v: number) => string;
  zeroLine?: number;
  ariaLabel: string;
}) {
  const [d0, d1] = domain;
  const pos = (v: number) => `${((Math.max(d0, Math.min(d1, v)) - d0) / (d1 - d0)) * 100}%`;

  return (
    <div role="img" aria-label={ariaLabel} className="grid gap-y-1 text-xs">
      <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-x-4 sm:grid-cols-[minmax(96px,180px)_minmax(0,1fr)_104px]">
        <div className="hidden sm:block" />
        <div className="relative h-4 tabular text-[10px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: pos(t) }}>
              {tickFormat(t)}
            </span>
          ))}
        </div>
        <div />
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className={cn("grid grid-cols-[minmax(0,1fr)_88px] items-center gap-x-4 gap-y-1 py-1.5 sm:grid-cols-[minmax(96px,180px)_minmax(0,1fr)_104px]", r.muted && "opacity-55")}
        >
          <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground" title={r.label}>
                {r.label}
              </span>
              {r.sublabel ? <span className="block truncate text-[11px] text-muted-foreground">{r.sublabel}</span> : null}
            </span>
          </div>
          <div className="relative h-6">
            {ticks.map((t) => (
              <span key={t} className="absolute inset-y-0 w-px bg-[var(--chart-grid)]" style={{ left: pos(t) }} aria-hidden />
            ))}
            {zeroLine !== undefined ? <span className="absolute inset-y-[-4px] w-px bg-foreground/45" style={{ left: pos(zeroLine) }} aria-hidden /> : null}
            {r.value !== null && r.low !== null && r.high !== null ? (
              <>
                <span
                  className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
                  style={{ left: pos(r.low), width: `calc(${pos(r.high)} - ${pos(r.low)})`, background: r.color }}
                  aria-hidden
                />
                <span className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2" style={{ left: pos(r.low), background: r.color }} aria-hidden />
                <span className="absolute top-1/2 h-2.5 w-0.5 -translate-x-full -translate-y-1/2" style={{ left: pos(r.high), background: r.color }} aria-hidden />
                <span
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                  style={{ left: pos(r.value), background: r.color }}
                  aria-hidden
                />
              </>
            ) : (
              <span className="absolute inset-0 flex items-center text-[11px] text-muted-foreground">{i18n().m.charts.noEstimate}</span>
            )}
          </div>
          <div className="text-right">
            <div className="text-[13px] font-semibold text-foreground tabular">{r.valueText}</div>
            {r.rangeText ? <div className="text-[11px] text-muted-foreground tabular">{r.rangeText}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
