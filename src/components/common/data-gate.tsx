"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useData } from "@/providers/data-provider";
import { EmptyState } from "./blocks";
import { useI18n } from "@/i18n/provider";

/** Показывает содержимое только когда данные загружены; иначе — загрузку, ошибку или пустое состояние. */
export function DataGate({ children }: { children: React.ReactNode }) {
  const { status, error, dataset, retry, restoreDemo } = useData();
  const { m } = useI18n();

  if (status === "loading" && !dataset) {
    return (
      <div className="space-y-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">{m.dataGate.loading}</span>
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-32 rounded-full" />
          <Skeleton className="h-10 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
              <Skeleton className="h-3 w-24 max-w-full" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={AlertTriangle}
          title={m.dataGate.errorTitle}
          description={error ?? m.dataGate.errorFallback}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={retry}>{m.dataGate.retry}</Button>
              <Button variant="outline" onClick={() => void restoreDemo()}>
                {m.dataGate.loadDemo}
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (dataset && dataset.records.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={Database}
          title={m.dataGate.emptyTitle}
          description={m.dataGate.emptyDescription}
          action={
            <Button asChild>
              <Link href="/data">{m.dataGate.goToImport}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
