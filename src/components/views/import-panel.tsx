"use client";

import * as React from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildDataset } from "@/lib/data/dataset";
import type { TablePreview, ValidationIssue } from "@/lib/data/issues";
import { readTableFromFile, TableReadError, type RawTable } from "@/lib/data/raw-table";
import type { ColumnMapping } from "@/lib/data/schema";
import { checkCurriculumCoverage, validateCurriculum, type CurriculumValidation } from "@/lib/data/validate-curriculum";
import { validateResults, type ResultsValidation } from "@/lib/data/validate-results";
import { countLabel, formatDate, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useReadyData } from "@/providers/data-provider";

type Kind = "results" | "curriculum";

interface Loaded {
  file: File;
  table: RawTable;
}

function Dropzone({ onFile, busy, kind }: { onFile: (file: File) => void; busy: boolean; kind: Kind }) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = `file-${kind}`;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
        over ? "border-primary bg-accent" : "border-input bg-muted/30",
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground">
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileUp className="size-5" aria-hidden />}
      </div>
      <div className="text-sm font-medium">{kind === "results" ? "Перетащите файл с результатами тестирования" : "Перетащите файл учебного плана"}</div>
      <div className="text-xs text-muted-foreground">CSV (UTF-8 или Windows-1251, разделитель «,» или «;») или XLSX, до 50 МБ</div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" className="mt-1" disabled={busy} onClick={() => inputRef.current?.click()}>
        Выбрать файл
      </Button>
    </div>
  );
}

function MappingList({ mapping }: { mapping: Pick<ColumnMapping<string>, "matched"> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {mapping.matched.map((m) => (
        <span
          key={m.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
            m.header ? "bg-card" : m.required ? "border-level-low/40 bg-level-low-bg text-level-low-fg" : "bg-muted/50 text-muted-foreground",
          )}
          title={m.header ? `Колонка файла: «${m.header}»` : m.required ? "Обязательная колонка не найдена" : "Необязательная колонка не найдена"}
        >
          {m.header ? <CheckCircle2 className="size-3 text-level-high" aria-hidden /> : m.required ? <X className="size-3" aria-hidden /> : null}
          <span className="font-mono">{m.name}</span>
          {m.header && m.header.toLowerCase() !== m.name ? <span className="text-muted-foreground">← {m.header}</span> : null}
        </span>
      ))}
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border">
      {issues.map((i) => (
        <li key={i.code} className="flex gap-2.5 px-3 py-2 text-[13px]">
          {i.severity === "error" ? <AlertOctagon className="mt-0.5 size-4 shrink-0 text-level-low" aria-label="Ошибка" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-level-medium-fg" aria-label="Предупреждение" />}
          <div className="min-w-0">
            <span>{i.message}</span>
            <span className="text-muted-foreground">
              {" "}
              {i.rows.length > 0 ? `${countLabel(i.count, ["строка", "строки", "строк"])}; например: ${i.rows.join(", ")}${i.count > i.rows.length ? "…" : ""}` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PreviewTable({ preview }: { preview: TablePreview }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="px-2.5 py-2 text-left font-medium">Строка</th>
            {preview.headers.map((h) => (
              <th key={h} className="px-2.5 py-2 text-left font-mono font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {preview.rows.map((r) => (
            <tr key={r.rowNumber} className={cn(r.hasError && "bg-level-low-bg/60")}>
              <td className={cn("px-2.5 py-1.5 text-muted-foreground tabular", r.hasError && "font-semibold text-level-low-fg")}>{r.rowNumber}</td>
              {r.cells.map((c, i) => (
                <td key={i} className="max-w-56 truncate px-2.5 py-1.5 whitespace-nowrap" title={c}>
                  {c === "" ? <span className="text-level-low-fg">пусто</span> : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "low" | "medium" | "high" }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-base font-semibold", tone === "low" && "text-level-low-fg", tone === "medium" && "text-level-medium-fg", tone === "high" && "text-success-ink")}>{value}</div>
    </div>
  );
}

export function ImportPanel({ kind, onApplied }: { kind: Kind; onApplied?: () => void }) {
  const { dataset, replaceDataset } = useReadyData();
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [readError, setReadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const results: ResultsValidation | null = React.useMemo(() => (loaded && kind === "results" ? validateResults(loaded.table) : null), [loaded, kind]);
  const plan: CurriculumValidation | null = React.useMemo(() => (loaded && kind === "curriculum" ? validateCurriculum(loaded.table) : null), [loaded, kind]);
  const coverage = React.useMemo(() => (plan && plan.fatal.length === 0 ? checkCurriculumCoverage(plan.entries, dataset.records) : null), [plan, dataset.records]);

  const onFile = async (file: File) => {
    setBusy(true);
    setReadError(null);
    setLoaded(null);
    try {
      const table = await readTableFromFile(file);
      setLoaded({ file, table });
    } catch (e) {
      setReadError(e instanceof TableReadError ? e.message : "Не удалось прочитать файл.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setLoaded(null);
    setReadError(null);
  };

  const apply = async () => {
    if (!loaded) return;
    let ok = true;
    if (results) {
      // Учебный план демо-набора не смешивается с новыми результатами.
      const curriculum = dataset.meta.isSynthetic ? [] : dataset.curriculum;
      ok = await replaceDataset(
        buildDataset(results.records, curriculum, {
          name: loaded.file.name,
          source: "upload",
          isSynthetic: false,
          resultsFileName: loaded.file.name,
          curriculumFileName: dataset.meta.isSynthetic ? null : dataset.meta.curriculumFileName,
          excludedResultRows: results.errorRows,
          excludedCurriculumRows: dataset.meta.isSynthetic ? 0 : dataset.meta.excludedCurriculumRows,
          removedDuplicates: results.duplicateRows,
        }),
      );
      toast.success("Результаты тестирования загружены", {
        description: `${formatInt(results.records.length)} ответов, ${formatInt(results.summary.students)} учеников.${dataset.meta.isSynthetic ? " Учебный план демо-набора очищен — загрузите свой." : ""}`,
      });
    } else if (plan) {
      ok = await replaceDataset({
        ...dataset,
        curriculum: plan.entries,
        meta: { ...dataset.meta, curriculumFileName: loaded.file.name, excludedCurriculumRows: plan.errorRows, loadedAt: new Date().toISOString() },
      });
      toast.success("Учебный план загружен", { description: `${countLabel(plan.entries.length, ["тема", "темы", "тем"])}.` });
    }
    if (!ok) {
      toast.warning("Данные применены, но не сохранены в браузере", { description: "После перезагрузки страницы потребуется загрузить файл снова." });
    }
    reset();
    onApplied?.();
  };

  const v = results ?? plan;
  const fatal = v?.fatal ?? [];
  const validCount = results ? results.records.length : (plan?.entries.length ?? 0);
  const errorRows = v?.errorRows ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4">
      {!loaded ? <Dropzone onFile={(f) => void onFile(f)} busy={busy} kind={kind} /> : null}

      {readError ? (
        <Alert variant="destructive">
          <AlertOctagon aria-hidden />
          <AlertTitle>Файл не прочитан</AlertTitle>
          <AlertDescription>
            <p>{readError}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {loaded && v ? (
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{loaded.file.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatInt(loaded.table.rows.length)} строк данных · {loaded.table.encoding ?? "—"}
                {loaded.table.delimiter ? ` · разделитель «${loaded.table.delimiter === "\t" ? "табуляция" : loaded.table.delimiter}»` : ""}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X aria-hidden />
              Выбрать другой файл
            </Button>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Распознанные колонки</div>
            <MappingList mapping={v.mapping} />
          </div>

          {fatal.length > 0 ? (
            <Alert variant="destructive">
              <AlertOctagon aria-hidden />
              <AlertTitle>Импорт невозможен</AlertTitle>
              <AlertDescription>
                {fatal.map((f) => (
                  <p key={f}>{f}</p>
                ))}
                <p>Проверьте заголовки колонок или скачайте шаблон ниже.</p>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
              <Stat label="Строк в файле" value={formatInt(v.totalRows)} />
              <Stat label="Корректных записей" value={formatInt(validCount)} tone="high" />
              <Stat label="Строк с ошибками" value={formatInt(errorRows)} tone={errorRows > 0 ? "low" : undefined} />
              <Stat label="Дубликатов удалено" value={formatInt(v.duplicateRows)} tone={v.duplicateRows > 0 ? "medium" : undefined} />
            </div>
          )}

          {results && fatal.length === 0 ? (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                countLabel(results.summary.students, ["ученик", "ученика", "учеников"]),
                countLabel(results.summary.classes, ["класс", "класса", "классов"]),
                countLabel(results.summary.subjects, ["предмет", "предмета", "предметов"]),
                countLabel(results.summary.topics, ["тема", "темы", "тем"]),
                countLabel(results.summary.textbooks, ["учебник", "учебника", "учебников"]),
                countLabel(results.summary.tests, ["тест", "теста", "тестов"]),
                results.summary.dateFrom ? `${formatDate(results.summary.dateFrom)} — ${formatDate(results.summary.dateTo)}` : null,
              ]
                .filter(Boolean)
                .map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
            </div>
          ) : null}

          <IssueList issues={v.issues} />

          {coverage && (coverage.planWithoutResults.length > 0 || coverage.resultsWithoutPlan.length > 0 || coverage.coursesWithoutPlan.length > 0) ? (
            <Alert variant="warning">
              <AlertTriangle aria-hidden />
              <AlertTitle>Сверка с результатами тестирования</AlertTitle>
              <AlertDescription>
                {coverage.planWithoutResults.length > 0 ? (
                  <p>
                    {countLabel(coverage.planWithoutResults.length, ["тема", "темы", "тем"])} плана без результатов тестирования ({coverage.planWithoutResults.slice(0, 4).map((e) => e.topicId).join(", ")}
                    {coverage.planWithoutResults.length > 4 ? "…" : ""}) — их часы не будут меняться.
                  </p>
                ) : null}
                {coverage.resultsWithoutPlan.length > 0 ? (
                  <p>
                    {countLabel(coverage.resultsWithoutPlan.length, ["тема", "темы", "тем"])} с результатами отсутствуют в плане ({coverage.resultsWithoutPlan.slice(0, 4).map((t) => t.topicId).join(", ")}
                    {coverage.resultsWithoutPlan.length > 4 ? "…" : ""}).
                  </p>
                ) : null}
                {coverage.coursesWithoutPlan.length > 0 ? <p>Нет плана для: {coverage.coursesWithoutPlan.map((c) => `${c.subject}, ${c.grade} кл.`).join("; ")}.</p> : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Предпросмотр: первые строки файла и строки с ошибками (выделены)</div>
            <PreviewTable preview={v.preview} />
          </div>

          {fatal.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {validCount === 0
                  ? "В файле нет ни одной корректной записи — импорт невозможен."
                  : errorRows > 0
                    ? `${countLabel(errorRows, ["строка", "строки", "строк"])} с ошибками не попадут в расчёты. Исправьте файл или подтвердите импорт только корректных записей.`
                    : results
                      ? `Данные заменят текущий набор${dataset.meta.isSynthetic ? " (демо-набор и его учебный план)" : ""} на всех страницах.`
                      : "План заменит текущий учебный план для всех предметов и параллелей."}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={reset}>
                  Отмена
                </Button>
                <Button onClick={() => void apply()} disabled={validCount === 0} variant={errorRows > 0 ? "secondary" : "default"}>
                  {errorRows > 0 ? `Импортировать ${formatInt(validCount)} корректных` : "Применить данные"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
