"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useData } from "@/providers/data-provider";
import { EmptyState } from "./blocks";

/** Показывает содержимое только когда данные загружены; иначе — загрузку, ошибку или пустое состояние. */
export function DataGate({ children }: { children: React.ReactNode }) {
  const { status, error, dataset, retry, restoreDemo } = useData();

  if (status === "loading" && !dataset) {
    return (
      <div className="space-y-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Загрузка данных…</span>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-2 bg-card p-4">
              <Skeleton className="h-3 w-24" />
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
          title="Не удалось загрузить данные"
          description={error ?? "Попробуйте обновить страницу."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={retry}>Повторить</Button>
              <Button variant="outline" onClick={() => void restoreDemo()}>
                Загрузить демо-данные
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
          title="Нет данных тестирования"
          description="Загрузите файл с результатами тестирования, чтобы увидеть аналитику."
          action={
            <Button asChild>
              <Link href="/data">Перейти к загрузке данных</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
