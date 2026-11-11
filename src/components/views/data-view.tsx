"use client";

import * as React from "react";
import { AlertTriangle, Database, Download, FlaskConical, HardDrive, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DataGate } from "@/components/common/data-gate";
import { PageHeader, Section } from "@/components/common/blocks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { curriculumTemplateCsv, downloadCsv, resultsTemplateCsv } from "@/lib/data/export";
import { DEMO_CURRICULUM_URL, DEMO_RESULTS_URL } from "@/lib/data/dataset";
import { CURRICULUM_COLUMNS, RESULT_COLUMNS, type ColumnSpec } from "@/lib/data/schema";
import { checkCurriculumCoverage } from "@/lib/data/validate-curriculum";
import { summarizeRecords } from "@/lib/data/validate-results";
import { countLabel, formatDate, formatInt } from "@/lib/format";
import { useReadyData } from "@/providers/data-provider";
import { ImportPanel } from "./import-panel";

function CurrentDataset() {
  const { dataset, restoreDemo } = useReadyData();
  const summary = React.useMemo(() => summarizeRecords(dataset.records), [dataset.records]);
  const coverage = React.useMemo(() => checkCurriculumCoverage(dataset.curriculum, dataset.records), [dataset.curriculum, dataset.records]);
  const m = dataset.meta;

  return (
    <Section
      title="Текущий набор данных"
      description="Этот набор используется на всех страницах платформы."
      actions={
        !m.isSynthetic || m.source !== "demo" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void restoreDemo().then(() => toast.success("Восстановлен демонстрационный набор"));
            }}
          >
            <RotateCcw aria-hidden />
            Вернуть демо-данные
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {m.isSynthetic ? (
            <Badge variant="medium">
              <FlaskConical aria-hidden />
              Синтетические данные
            </Badge>
          ) : (
            <Badge variant="high">
              <Database aria-hidden />
              Загружено методистом
            </Badge>
          )}
          <span className="text-sm font-medium">{m.name}</span>
          <span className="text-xs text-muted-foreground">· загружено {new Date(m.loadedAt).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</span>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["Ответов", formatInt(summary.rows)],
            ["Учеников", formatInt(summary.students)],
            ["Классов", formatInt(summary.classes)],
            ["Предметов", formatInt(summary.subjects)],
            ["Тем", formatInt(summary.topics)],
            ["Учебников", formatInt(summary.textbooks)],
            ["Тестов", formatInt(summary.tests)],
            ["Тем в плане", formatInt(dataset.curriculum.length)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-3 py-2.5">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-base font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            Результаты: <span className="text-foreground">{m.resultsFileName ?? "—"}</span>
            {summary.dateFrom ? ` · ${formatDate(summary.dateFrom)} — ${formatDate(summary.dateTo)}` : ""}
          </div>
          <div>
            Учебный план: <span className="text-foreground">{m.curriculumFileName ?? "не загружен"}</span>
          </div>
          {m.excludedResultRows > 0 || m.removedDuplicates > 0 ? (
            <div>
              При импорте исключено строк с ошибками: {formatInt(m.excludedResultRows)}, удалено дубликатов: {formatInt(m.removedDuplicates)}.
            </div>
          ) : null}
          {m.excludedCurriculumRows > 0 ? <div>Из плана исключено строк с ошибками: {formatInt(m.excludedCurriculumRows)}.</div> : null}
        </div>
        {dataset.curriculum.length === 0 ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden />
            <AlertTitle>Учебный план не загружен</AlertTitle>
            <AlertDescription>
              <p>Анализ тем и сравнение учебников доступны, но для рекомендаций по часам загрузите учебный план.</p>
            </AlertDescription>
          </Alert>
        ) : coverage.coursesWithoutPlan.length > 0 || coverage.resultsWithoutPlan.length > 0 ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden />
            <AlertTitle>План покрывает не все данные</AlertTitle>
            <AlertDescription>
              {coverage.coursesWithoutPlan.length > 0 ? <p>Нет плана для: {coverage.coursesWithoutPlan.map((c) => `${c.subject}, ${c.grade} кл.`).join("; ")}.</p> : null}
              {coverage.resultsWithoutPlan.length > 0 ? <p>{countLabel(coverage.resultsWithoutPlan.length, ["тема", "темы", "тем"])} с результатами нет в плане.</p> : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </Section>
  );
}

function ColumnsTable({ columns }: { columns: ColumnSpec<string>[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Колонка</th>
            <th className="px-3 py-2 text-left font-medium">Обязательна</th>
            <th className="px-3 py-2 text-left font-medium">Описание</th>
            <th className="px-3 py-2 text-left font-medium">Пример</th>
            <th className="px-3 py-2 text-left font-medium">Также распознаётся</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {columns.map((c) => (
            <tr key={c.key}>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{c.name}</td>
              <td className="px-3 py-2">{c.required ? "да" : <span className="text-muted-foreground">нет</span>}</td>
              <td className="px-3 py-2 text-muted-foreground">{c.description}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{c.example}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{c.aliases.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataView() {
  const [tab, setTab] = React.useState<"results" | "curriculum">("results");
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title="Данные и импорт"
        description="Загрузите результаты тестирования и учебный план. Каждый файл проверяется до применения: обязательные колонки, типы значений, пустые ячейки, дубликаты и согласованность."
      />
      <DataGate>
        <CurrentDataset />

        <Section title="Импорт файлов" description="Сначала загрузите результаты тестирования, затем учебный план с часами по темам.">
          <div className="px-5 py-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "results" | "curriculum")}>
              <TabsList>
                <TabsTrigger value="results">1. Результаты тестирования</TabsTrigger>
                <TabsTrigger value="curriculum">2. Учебный план</TabsTrigger>
              </TabsList>
              <TabsContent value="results" className="pt-2">
                <ImportPanel kind="results" onApplied={() => setTab("curriculum")} />
              </TabsContent>
              <TabsContent value="curriculum" className="pt-2">
                <ImportPanel kind="curriculum" />
              </TabsContent>
            </Tabs>
          </div>
        </Section>

        <Alert variant="default">
          <ShieldCheck aria-hidden />
          <AlertTitle>Данные не покидают браузер</AlertTitle>
          <AlertDescription>
            <p>
              Файлы обрабатываются на вашем компьютере и сохраняются только в хранилище браузера (IndexedDB). Используйте обезличенные идентификаторы учеников — ФИО не требуются.
            </p>
          </AlertDescription>
        </Alert>

        <Section
          title="Формат данных и шаблоны"
          description="Одна строка файла результатов — один ответ ученика на одно задание. Заголовки распознаются без учёта регистра, пробелов и подчёркиваний."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => downloadCsv("шаблон-результаты.csv", resultsTemplateCsv())}>
                <Download aria-hidden />
                Шаблон результатов
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadCsv("шаблон-учебный-план.csv", curriculumTemplateCsv())}>
                <Download aria-hidden />
                Шаблон плана
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-5 px-5 py-4">
            <div className="grid gap-2">
              <h3 className="text-[13px] font-semibold">Результаты тестирования</h3>
              <ColumnsTable columns={RESULT_COLUMNS} />
            </div>
            <div className="grid gap-2">
              <h3 className="text-[13px] font-semibold">Учебный план</h3>
              <ColumnsTable columns={CURRICULUM_COLUMNS} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <HardDrive className="size-4" aria-hidden />
              Демонстрационные файлы (синтетические):
              <a className="font-medium text-primary hover:underline" href={DEMO_RESULTS_URL} download>
                results.csv
              </a>
              ·
              <a className="font-medium text-primary hover:underline" href={DEMO_CURRICULUM_URL} download>
                curriculum.csv
              </a>
            </div>
          </div>
        </Section>
      </DataGate>
    </div>
  );
}
