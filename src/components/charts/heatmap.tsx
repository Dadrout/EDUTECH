"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HeatmapData } from "@/lib/analytics/heatmap";
import { divergingColor, readableTextOn, DIVERGING, mixOklab } from "@/lib/color";
import type { MasteryThresholds } from "@/lib/config/analysis-config";
import { formatInt, formatPct, formatPp } from "@/lib/format";
import { cn } from "@/lib/utils";

function Cell({
  rate,
  sufficient,
  thresholds,
  label,
  details,
  emphasis,
}: {
  rate: number | null;
  sufficient: boolean;
  thresholds: MasteryThresholds;
  label: string;
  details: React.ReactNode;
  emphasis?: boolean;
}) {
  if (rate === null) {
    return (
      <div className="flex h-11 items-center justify-center rounded-[5px] bg-secondary/60 text-xs text-muted-foreground" aria-label={`${label}: нет данных`}>
        —
      </div>
    );
  }
  const bg = divergingColor(rate, thresholds);
  const fg = readableTextOn(bg);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${formatPct(rate, 0)}${sufficient ? "" : ", мало данных"}`}
          className={cn(
            "relative flex h-11 w-full items-center justify-center rounded-[5px] text-[13px] tabular outline-none transition-shadow hover:ring-2 hover:ring-foreground/70 focus-visible:ring-2 focus-visible:ring-foreground",
            emphasis ? "font-semibold" : "font-medium",
          )}
          style={{ background: bg, color: fg }}
        >
          {!sufficient ? <span className="hatch absolute inset-0 rounded-[5px] opacity-80" aria-hidden /> : null}
          <span className="relative">{formatPct(rate, 0)}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{details}</TooltipContent>
    </Tooltip>
  );
}

/** Тепловая карта «класс × тема» с итогами по строкам и столбцам. */
export function Heatmap({ data, thresholds }: { data: HeatmapData; thresholds: MasteryThresholds }) {
  const cols = data.columns.length;
  const template = `minmax(132px, 168px) repeat(${cols}, minmax(64px, 1fr)) minmax(64px, 76px)`;

  return (
    <div className="overflow-x-auto">
      <div role="table" aria-label="Успешность по классам и темам" className="grid min-w-max gap-1 p-4 text-xs" style={{ gridTemplateColumns: template }}>
        <div role="row" className="contents">
          <div role="columnheader" className="flex items-end pb-1 text-[11px] font-medium text-muted-foreground uppercase">
            Класс
          </div>
          {data.columns.map((c) => (
            <div role="columnheader" key={c.key} className="flex items-end px-0.5 pb-1" title={c.topicName}>
              <span className="line-clamp-3 text-[11px] leading-tight font-medium text-foreground">{c.topicName}</span>
            </div>
          ))}
          <div role="columnheader" className="flex items-end pb-1 text-[11px] font-medium text-muted-foreground">
            Все темы
          </div>
        </div>

        {data.rows.map((row, ri) => (
          <div role="row" key={row.classId} className="contents">
            <div role="rowheader" className="flex min-w-0 flex-col justify-center pr-2">
              <span className="text-[13px] font-semibold">{row.classId}</span>
              <span className="truncate text-[11px] text-muted-foreground" title={row.textbookNames.join(", ")}>
                {row.textbookNames.join(", ")}
              </span>
            </div>
            {data.cells[ri].map((cell, ci) => {
              const col = data.columns[ci];
              return (
                <div role="cell" key={col.key}>
                  <Cell
                    rate={cell?.rate ?? null}
                    sufficient={cell?.sufficient ?? false}
                    thresholds={thresholds}
                    label={`${row.classId}, ${col.topicName}`}
                    details={
                      cell ? (
                        <div className="grid gap-0.5">
                          <div className="font-medium">
                            {row.classId} · {col.topicName}
                          </div>
                          <div>Успешность: {formatPct(cell.rate)}</div>
                          <div>
                            Отклонение от параллели: {formatPp(cell.deltaFromTopic)}
                          </div>
                          <div>
                            {formatInt(cell.students)} уч. · {formatInt(cell.answers)} отв.
                          </div>
                          {!cell.sufficient ? <div className="pt-0.5 font-medium">Мало учеников — вывод ненадёжен.</div> : null}
                        </div>
                      ) : null
                    }
                  />
                </div>
              );
            })}
            <div role="cell">
              <Cell
                rate={row.rate}
                sufficient
                emphasis
                thresholds={thresholds}
                label={`${row.classId}, все темы`}
                details={
                  <div>
                    {row.classId}: {formatPct(row.rate)} по всем темам · {formatInt(row.students)} уч.
                  </div>
                }
              />
            </div>
          </div>
        ))}

        <div role="row" className="contents">
          <div role="rowheader" className="flex items-center pr-2 text-[13px] font-semibold">
            Параллель
          </div>
          {data.columns.map((c) => (
            <div role="cell" key={c.key} className="border-t pt-1">
              <Cell rate={c.rate} sufficient emphasis thresholds={thresholds} label={`Параллель, ${c.topicName}`} details={<div>{c.topicName}: {formatPct(c.rate)} по параллели</div>} />
            </div>
          ))}
          <div role="cell" className="border-t pt-1" />
        </div>
      </div>
    </div>
  );
}

/** Легенда расходящейся шкалы с порогами. */
export function HeatmapLegend({ thresholds }: { thresholds: MasteryThresholds }) {
  const low = Math.max(0, thresholds.medium - 30);
  const mid = (thresholds.medium + thresholds.high) / 2;
  const stops = Array.from({ length: 11 }, (_, i) => {
    const pct = low + ((100 - low) * i) / 10;
    return divergingColor(pct / 100, thresholds);
  });
  const pos = (v: number) => `${((v - low) / (100 - low)) * 100}%`;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
      <div className="w-64 max-w-full">
        <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(to right, ${stops.join(",")})` }} aria-hidden />
        <div className="relative mt-1 h-4 tabular">
          {[low, thresholds.medium, mid, thresholds.high, 100].map((v) => (
            <span key={v} className="absolute -translate-x-1/2 text-[10px]" style={{ left: pos(v) }}>
              {Math.round(v)}%
            </span>
          ))}
        </div>
      </div>
      <span className="flex items-center gap-1.5">
        <span className="hatch inline-block size-3 rounded-[3px] border" style={{ background: mixOklab(DIVERGING.mid, DIVERGING.pos, 0.2) }} aria-hidden />
        мало учеников в ячейке
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-[3px] bg-secondary" aria-hidden />— класс не писал тест по теме
      </span>
    </div>
  );
}
