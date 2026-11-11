"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Option } from "@/lib/analytics/filters";
import type { DataFilters } from "@/lib/domain/types";
import { useReadyData } from "@/providers/data-provider";
import { cn } from "@/lib/utils";

export type FilterField = "subject" | "grade" | "classId" | "textbookId" | "topicKey";

const ALL = "__all__";

const FIELD_META: Record<FilterField, { label: string; all: string; width: string }> = {
  subject: { label: "Предмет", all: "Все предметы", width: "sm:w-40" },
  grade: { label: "Параллель", all: "Все параллели", width: "sm:w-40" },
  classId: { label: "Класс", all: "Все классы", width: "sm:w-32" },
  textbookId: { label: "Учебник", all: "Все учебники", width: "sm:w-56" },
  topicKey: { label: "Тема", all: "Все темы", width: "sm:w-64" },
};

function FilterSelect<T extends string | number>({
  field,
  value,
  options,
  onChange,
  disabled,
  allowAll,
}: {
  field: FilterField;
  value: T | null;
  options: Option<T>[];
  onChange: (value: T | null) => void;
  disabled?: boolean;
  allowAll: boolean;
}) {
  const meta = FIELD_META[field];
  // Уникальный id: страницы остаются смонтированными (скрытыми) после перехода, фиксированные id дублировались бы.
  const id = `filter-${field}-${React.useId()}`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", meta.width)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {meta.label}
      </label>
      <Select
        value={value === null ? ALL : String(value)}
        onValueChange={(v) => {
          if (v === ALL) onChange(null);
          else {
            const opt = options.find((o) => String(o.value) === v);
            if (opt) onChange(opt.value);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} size="sm" className="w-full min-w-0">
          <SelectValue placeholder={meta.all} />
        </SelectTrigger>
        <SelectContent>
          {allowAll ? (
            <>
              <SelectItem value={ALL}>{meta.all}</SelectItem>
              {options.length > 0 ? <SelectSeparator /> : null}
            </>
          ) : null}
          {options.map((o) => (
            <SelectItem key={String(o.value)} value={String(o.value)}>
              <span className="truncate">{o.label}</span>
              {o.hint ? <span className="ml-1 text-xs text-muted-foreground">{o.hint}</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Единая панель фильтров над содержимым страницы. Фильтры общие для всех страниц:
 * выбор на одной странице сохраняется при переходе на другую.
 */
export function FilterBar({
  fields,
  extra,
  className,
}: {
  fields: FilterField[];
  /** Дополнительные элементы управления страницы в той же строке. */
  extra?: React.ReactNode;
  className?: string;
}) {
  const { filters, options, setFilters } = useReadyData();
  const active = fields.some((f) => filters[f] !== null);

  const set = <K extends keyof DataFilters>(key: K, value: DataFilters[K]) => setFilters({ [key]: value } as Partial<DataFilters>);

  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-2.5 sm:flex sm:flex-row sm:flex-wrap sm:items-end", className)} data-print-hide>
      {fields.includes("subject") ? (
        <FilterSelect field="subject" value={filters.subject} options={options.subjects} onChange={(v) => set("subject", v)} allowAll />
      ) : null}
      {fields.includes("grade") ? (
        <FilterSelect field="grade" value={filters.grade} options={options.grades} onChange={(v) => set("grade", v)} allowAll />
      ) : null}
      {fields.includes("classId") ? (
        <FilterSelect field="classId" value={filters.classId} options={options.classes} onChange={(v) => set("classId", v)} allowAll />
      ) : null}
      {fields.includes("textbookId") ? (
        <FilterSelect field="textbookId" value={filters.textbookId} options={options.textbooks} onChange={(v) => set("textbookId", v)} allowAll />
      ) : null}
      {fields.includes("topicKey") ? (
        <FilterSelect field="topicKey" value={filters.topicKey} options={options.topics} onChange={(v) => set("topicKey", v)} allowAll />
      ) : null}
      {extra}
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          className="col-span-2 justify-self-start text-muted-foreground sm:col-auto"
          onClick={() => setFilters(Object.fromEntries(fields.map((f) => [f, null])) as Partial<DataFilters>)}
        >
          <RotateCcw aria-hidden />
          Сбросить
        </Button>
      ) : null}
    </div>
  );
}
