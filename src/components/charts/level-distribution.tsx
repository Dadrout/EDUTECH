"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LEVEL_META, levelRangeLabel } from "@/components/common/levels";
import { Legend } from "@/components/common/blocks";
import type { SubjectDistribution } from "@/lib/analytics/overview";
import type { MasteryThresholds } from "@/lib/config/analysis-config";
import { countLabel, formatPct } from "@/lib/format";

const LEVELS = ["high", "medium", "low"] as const;
const INSIDE_LABEL = { high: "#ffffff", medium: "#12141a", low: "#ffffff" } as const;

/**
 * Распределение учеников по уровням освоения для каждого предмета —
 * сегментированная полоса (часть от целого) с подписями внутри сегментов.
 */
export function LevelDistribution({ subjects, thresholds }: { subjects: SubjectDistribution[]; thresholds: MasteryThresholds }) {
  return (
    <div className="grid grid-cols-1 gap-5">
      {subjects.map((s) => {
        const total = s.levels.high + s.levels.medium + s.levels.low;
        return (
          <div key={s.subject} className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium">{s.subject}</span>
              <span className="text-xs text-muted-foreground">
                средняя успешность <b className="font-semibold text-foreground tabular">{formatPct(s.estimate?.rate)}</b> · {countLabel(total, ["ученик", "ученика", "учеников"])}
              </span>
            </div>
            {total === 0 ? (
              <div className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">Недостаточно ответов, чтобы распределить учеников по уровням.</div>
            ) : (
              <div className="flex h-7 w-full gap-[2px]" role="img" aria-label={`${s.subject}: ${LEVELS.map((l) => `${LEVEL_META[l].label} — ${Math.round((s.levels[l] / total) * 100)}%`).join(", ")}`}>
                {LEVELS.map((l) => {
                  const count = s.levels[l];
                  if (count === 0) return null;
                  const share = count / total;
                  return (
                    <Tooltip key={l}>
                      <TooltipTrigger asChild>
                        <div
                          tabIndex={0}
                          className="flex min-w-0 items-center rounded-[4px] px-2 text-xs font-semibold outline-none tabular focus-visible:ring-2 focus-visible:ring-foreground"
                          style={{ width: `${share * 100}%`, background: LEVEL_META[l].color, color: INSIDE_LABEL[l] }}
                        >
                          {share >= 0.1 ? `${Math.round(share * 100)}%` : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {LEVEL_META[l].label} уровень ({levelRangeLabel(l, thresholds)}): {countLabel(count, ["ученик", "ученика", "учеников"])}, {Math.round(share * 100)}%
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <Legend items={LEVELS.map((l) => ({ label: `${LEVEL_META[l].label} (${levelRangeLabel(l, thresholds)})`, color: LEVEL_META[l].color }))} />
    </div>
  );
}
