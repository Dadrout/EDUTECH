import * as React from "react";
import { cn } from "@/lib/utils";

/** Общая оболочка всплывающей подсказки графиков: значение — крупно, подпись — вторично. */
export function ChartTooltipCard({ title, children, className }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("pointer-events-none min-w-44 max-w-72 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg", className)}>
      {title ? <div className="mb-1.5 leading-snug font-medium text-foreground">{title}</div> : null}
      <div className="grid gap-1 text-muted-foreground">{children}</div>
    </div>
  );
}

export function TooltipRow({ color, label, value, line = false }: { color?: string; label: React.ReactNode; value: React.ReactNode; line?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5">
        {color ? <span className={cn("shrink-0", line ? "h-0.5 w-3" : "size-2 rounded-[2px]")} style={{ background: color }} aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-semibold text-foreground tabular">{value}</span>
    </div>
  );
}

export const AXIS_TICK = { fill: "var(--chart-muted)", fontSize: 11 } as const;
