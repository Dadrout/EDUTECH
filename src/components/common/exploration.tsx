"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";

/** Keep every row reachable without expanding a table into the whole page. */
export function paginate<T>(items: T[], requestedPage = 0, pageSize = 10) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 10;
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.min(pageCount - 1, Math.floor(requestedPage))) : 0;
  return { rows: items.slice(page * size, (page + 1) * size), page, pageCount, total, start: total === 0 ? 0 : page * size + 1, end: Math.min(total, (page + 1) * size) };
}

export function usePagination<T>(items: T[], pageSize = 10) {
  const [state, setState] = React.useState({ items, page: 0 });
  // New filters/order get their first page synchronously; no stale blank render.
  const window = paginate(items, state.items === items ? state.page : 0, pageSize);
  const setPage = (next: number) => {
    if (Number.isFinite(next)) setState({ items, page: paginate(items, next, pageSize).page });
  };
  return { ...window, setPage };
}

export function Pagination({ page, pageCount, total, start, end, onPageChange }: {
  page: number; pageCount: number; total: number; start: number; end: number; onPageChange: (page: number) => void;
}) {
  const { m, t } = useI18n();
  if (pageCount <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
      <span aria-live="polite">{t(m.ux.rows, { start, end, total })}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 0} aria-label={m.ux.previous}><ChevronLeft aria-hidden /><span className="hidden sm:inline">{m.ux.previous}</span></Button>
        <span className="tabular">{t(m.ux.page, { page: page + 1, pages: pageCount })}</span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount - 1} aria-label={m.ux.next}><span className="hidden sm:inline">{m.ux.next}</span><ChevronRight aria-hidden /></Button>
      </div>
    </div>
  );
}

export function Disclosure({ title, description, children, defaultOpen = false, count }: {
  title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; count?: number;
}) {
  return (
    <details className="detail-disclosure group min-w-0 border-t" open={defaultOpen || undefined}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0"><span>{title}</span>{description ? <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{description}</span> : null}</span>
        <span className="flex shrink-0 items-center gap-3">{count !== undefined ? <span className="text-xs text-muted-foreground tabular">{formatInt(count)}</span> : null}<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></span>
      </summary>
      <div className="grid min-w-0 gap-4 pb-5">{children}</div>
    </details>
  );
}

export function Finding({ title, children, actions, tone = "default" }: {
  title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; tone?: "default" | "warning" | "caution" | "success";
}) {
  const { m } = useI18n();
  return (
    <section aria-label={m.ux.keyFinding} className="finding flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-start">
      <div className="min-w-0 max-w-3xl">
        <h2 className={cn("font-display text-xl leading-snug font-semibold tracking-[-0.02em] text-balance sm:text-[24px]", tone === "warning" && "text-level-low-fg", tone === "caution" && "text-level-medium-fg", tone === "success" && "text-success-ink")}>{title}</h2>
        {children ? <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
