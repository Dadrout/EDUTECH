import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, CircleHelp, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { i18n } from "@/i18n/core";
import type { MasteryThresholds } from "@/lib/config/analysis-config";
import type { DifficultyStatus, MasteryLevel } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Variant = "high" | "medium" | "low" | "none";

// Подписи — геттеры: они читают словарь текущего языка в момент отрисовки.
export const LEVEL_META: Record<MasteryLevel, { readonly label: string; variant: Variant; color: string; Icon: LucideIcon }> = {
  high: { get label() { return i18n().m.levels.high; }, variant: "high", color: "var(--level-high)", Icon: CheckCircle2 },
  medium: { get label() { return i18n().m.levels.medium; }, variant: "medium", color: "var(--level-medium)", Icon: AlertTriangle },
  low: { get label() { return i18n().m.levels.low; }, variant: "low", color: "var(--level-low)", Icon: AlertOctagon },
  insufficient: { get label() { return i18n().m.levels.insufficient; }, variant: "none", color: "var(--level-none)", Icon: CircleHelp },
};

function statusMeta(status: DifficultyStatus, variant: Variant, Icon: LucideIcon) {
  return {
    get label() {
      return i18n().m.status[status];
    },
    get hint() {
      return i18n().m.status.hints[status];
    },
    variant,
    Icon,
  };
}

export const STATUS_META: Record<DifficultyStatus, { readonly label: string; variant: Variant; Icon: LucideIcon; readonly hint: string }> = {
  difficult: statusMeta("difficult", "low", AlertOctagon),
  likely_difficult: statusMeta("likely_difficult", "low", CircleDashed),
  attention: statusMeta("attention", "medium", AlertTriangle),
  mastered: statusMeta("mastered", "high", CheckCircle2),
  insufficient: statusMeta("insufficient", "none", CircleHelp),
};

export function levelRangeLabel(level: MasteryLevel, th: MasteryThresholds): string {
  const { t, m } = i18n();
  switch (level) {
    case "high":
      return t(m.units.percent, { n: `${th.high}–100` });
    case "medium":
      return t(m.units.percent, { n: `${th.medium}–${th.high - 1}` });
    case "low":
      return `< ${t(m.units.percent, { n: th.medium })}`;
    default:
      return m.levels.rangeInsufficient;
  }
}

export function LevelBadge({ level, className }: { level: MasteryLevel; className?: string }) {
  const meta = LEVEL_META[level];
  return (
    <Badge variant={meta.variant} className={className}>
      <meta.Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: DifficultyStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={meta.variant} className={cn(status === "likely_difficult" && "bg-transparent ring-1 ring-level-low/40 ring-inset", className)} title={meta.hint}>
      <meta.Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}

/** Цвет учебника закреплён за его позицией в полном списке учебников курса, а не в текущей выборке. */
export function seriesColor(index: number): string {
  return `var(--series-${(index % 8) + 1})`;
}
