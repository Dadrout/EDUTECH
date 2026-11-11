"use client";

import * as React from "react";
import { ChevronRight, Layers } from "lucide-react";
import { useReadyData } from "@/providers/data-provider";

/**
 * Выбор предмета и параллели для страниц, где анализ корректен только
 * внутри одного курса (тепловая карта, сравнение учебников, учебные часы).
 */
export function CoursePicker({ reason }: { reason: string }) {
  const { courses, dataset, setFilters, filters } = useReadyData();

  const stats = React.useMemo(() => {
    const map = new Map<string, { students: Set<string>; textbooks: Set<string>; topics: Set<string> }>();
    for (const r of dataset.records) {
      const key = `${r.subject}\u0000${r.grade}`;
      let s = map.get(key);
      if (!s) {
        s = { students: new Set(), textbooks: new Set(), topics: new Set() };
        map.set(key, s);
      }
      s.students.add(r.studentId);
      s.textbooks.add(r.textbookId);
      s.topics.add(r.topicId);
    }
    return map;
  }, [dataset.records]);

  const visible = courses.filter((c) => (filters.subject === null || c.subject === filters.subject) && (filters.grade === null || c.grade === filters.grade));

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Layers className="size-4" aria-hidden />
        </div>
        <div>
          <div className="text-sm font-semibold">Выберите предмет и параллель</div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{reason}</p>
        </div>
      </div>
      <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => {
          const s = stats.get(`${c.subject}\u0000${c.grade}`);
          return (
            <li key={`${c.subject}-${c.grade}`} className="bg-card">
              <button
                type="button"
                onClick={() => setFilters({ subject: c.subject, grade: c.grade })}
                className="group flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {c.subject} · {c.grade} класс
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {s ? `${s.students.size} уч. · ${s.topics.size} тем · ${s.textbooks.size} учебн.` : null}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
