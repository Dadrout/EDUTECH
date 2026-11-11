"use client";

import * as React from "react";
import { LEVEL_META } from "@/components/common/levels";
import { Legend } from "@/components/common/blocks";
import type { HoursRow } from "@/lib/analytics/hours";
import { formatHours, formatHoursDelta, formatPct } from "@/lib/format";

const UP = "var(--series-1)";
const DOWN = "var(--series-2)";

/**
 * Перераспределение часов: полосы от нуля вправо — тема получает часы,
 * влево — отдаёт. Слева подписаны тема и её успешность.
 */
export function HoursChangeChart({ rows }: { rows: HoursRow[] }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.changeHours)));
  return (
    <div className="grid gap-3">
      <div role="img" aria-label="Изменение учебных часов по темам" className="grid gap-y-1">
        {rows.map((r) => {
          const share = Math.abs(r.changeHours) / maxAbs;
          const meta = LEVEL_META[r.level];
          return (
            <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(140px,1.2fr)_64px] items-center gap-x-3 py-1 sm:grid-cols-[minmax(0,260px)_1fr_72px]">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium" title={r.topicName}>
                  {r.topicName}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <meta.Icon className="size-3" style={{ color: meta.color }} aria-hidden />
                  {formatPct(r.rate, 0)} · {formatHours(r.currentHours)} → {formatHours(r.recommendedHours)}
                </div>
              </div>
              <div className="relative h-5">
                <span className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/35" aria-hidden />
                {r.changeHours !== 0 ? (
                  <span
                    className="absolute top-1/2 h-3.5 -translate-y-1/2"
                    style={
                      r.changeHours > 0
                        ? { left: "calc(50% + 1px)", width: `calc(${share * 50}% - 1px)`, background: UP, borderRadius: "0 4px 4px 0" }
                        : { right: "calc(50% + 1px)", width: `calc(${share * 50}% - 1px)`, background: DOWN, borderRadius: "4px 0 0 4px" }
                    }
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="text-right text-[13px] font-semibold tabular">{r.changeHours === 0 ? <span className="font-normal text-muted-foreground">0 ч</span> : formatHoursDelta(r.changeHours)}</div>
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { label: "Тема получает часы", color: UP },
          { label: "Тема отдаёт часы", color: DOWN },
        ]}
      />
    </div>
  );
}
