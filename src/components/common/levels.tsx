import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, CircleHelp, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MasteryThresholds } from "@/lib/config/analysis-config";
import type { DifficultyStatus, MasteryLevel } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Variant = "high" | "medium" | "low" | "none";

export const LEVEL_META: Record<MasteryLevel, { label: string; variant: Variant; color: string; Icon: LucideIcon }> = {
  high: { label: "Высокий", variant: "high", color: "var(--level-high)", Icon: CheckCircle2 },
  medium: { label: "Средний", variant: "medium", color: "var(--level-medium)", Icon: AlertTriangle },
  low: { label: "Низкий", variant: "low", color: "var(--level-low)", Icon: AlertOctagon },
  insufficient: { label: "Мало данных", variant: "none", color: "var(--level-none)", Icon: CircleHelp },
};

export const STATUS_META: Record<DifficultyStatus, { label: string; variant: Variant; Icon: LucideIcon; hint: string }> = {
  difficult: {
    label: "Сложная тема",
    variant: "low",
    Icon: AlertOctagon,
    hint: "Успешность ниже порога среднего уровня, и даже верхняя граница 95% интервала ниже порога — вывод надёжен.",
  },
  likely_difficult: {
    label: "Вероятно сложная",
    variant: "low",
    Icon: CircleDashed,
    hint: "Успешность ниже порога, но доверительный интервал его пересекает — нужны дополнительные данные для уверенного вывода.",
  },
  attention: { label: "Требует внимания", variant: "medium", Icon: AlertTriangle, hint: "Средний уровень освоения." },
  mastered: { label: "Усваивается хорошо", variant: "high", Icon: CheckCircle2, hint: "Высокий уровень освоения." },
  insufficient: {
    label: "Недостаточно данных",
    variant: "none",
    Icon: CircleHelp,
    hint: "Слишком мало учеников или ответов, чтобы делать вывод о сложности темы.",
  },
};

export function levelRangeLabel(level: MasteryLevel, t: MasteryThresholds): string {
  switch (level) {
    case "high":
      return `${t.high}–100%`;
    case "medium":
      return `${t.medium}–${t.high - 1}%`;
    case "low":
      return `< ${t.medium}%`;
    default:
      return "мало данных";
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
