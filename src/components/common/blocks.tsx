"use client";

import * as React from "react";
import { Info, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-xs font-medium text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-balance sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,17,20,0.04)]", className)}>
      <div className="flex flex-col gap-2 border-b px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] leading-snug font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** Пояснение «как рассчитано» — доступно по клику и с клавиатуры. */
export function MethodNote({ title = "Как рассчитано", children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden />
        {title}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 text-[13px] leading-relaxed">
        <div className="mb-1.5 font-semibold">{title}</div>
        <div className="space-y-2 text-muted-foreground [&_b]:font-medium [&_b]:text-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "low" | "medium" | "high";
  icon?: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon ? (
          <Icon
            className={cn(
              "size-3.5",
              tone === "low" && "text-level-low",
              tone === "medium" && "text-level-medium-fg",
              tone === "high" && "text-level-high",
            )}
            aria-hidden
          />
        ) : null}
        {label}
      </div>
      <div className="text-[26px] leading-none font-semibold tracking-[-0.02em]">{value}</div>
      {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      {description ? <div className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Горизонтальная шкала успешности с отметками порогов. */
export function RateBar({
  rate,
  ciLow,
  ciHigh,
  color,
  thresholds,
  className,
}: {
  rate: number | null;
  ciLow?: number | null;
  ciHigh?: number | null;
  color: string;
  thresholds?: { medium: number; high: number };
  className?: string;
}) {
  const pct = rate === null ? 0 : Math.max(0, Math.min(100, rate * 100));
  return (
    <div className={cn("relative h-1.5 w-full min-w-16 rounded-full bg-secondary", className)} aria-hidden>
      {rate !== null ? <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} /> : null}
      {rate !== null && ciLow != null && ciHigh != null ? (
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-foreground/35"
          style={{ left: `${ciLow * 100}%`, width: `${Math.max(0.5, (ciHigh - ciLow) * 100)}%` }}
        />
      ) : null}
      {thresholds
        ? [thresholds.medium, thresholds.high].map((t) => (
            <div key={t} className="absolute -top-0.5 h-2.5 w-px bg-foreground/25" style={{ left: `${t}%` }} />
          ))
        : null}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; shape?: "square" | "line" | "hatch" }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground", className)}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            className={cn("inline-block shrink-0", it.shape === "line" ? "h-0.5 w-3.5" : "size-2.5 rounded-[3px]", it.shape === "hatch" && "hatch border border-level-none")}
            style={it.shape === "hatch" ? undefined : { background: it.color }}
            aria-hidden
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
