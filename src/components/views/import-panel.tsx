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
import { formatDate, formatInt, quote } from "@/lib/format";
import { useI18n } from "@/i18n/provider";
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
  const { m } = useI18n();
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
      <div className="text-sm font-medium">{kind === "results" ? m.import.dropResults : m.import.dropPlan}</div>
      <div className="text-xs text-muted-foreground">{m.import.formats}</div>
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
        {m.import.chooseFile}
      </Button>
    </div>
  );
}

function MappingList({ mapping }: { mapping: Pick<ColumnMapping<string>, "matched"> }) {
  const { m, t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1.5">
      {mapping.matched.map((col) => (
        <span
          key={col.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
            col.header ? "bg-card" : col.required ? "border-level-low/40 bg-level-low-bg text-level-low-fg" : "bg-muted/50 text-muted-foreground",
          )}
          title={col.header ? t(m.import.fileColumn, { header: quote(col.header) }) : col.required ? m.import.requiredMissing : m.import.optionalMissing}
        >
          {col.header ? <CheckCircle2 className="size-3 text-level-high" aria-hidden /> : col.required ? <X className="size-3" aria-hidden /> : null}
          <span className="font-mono">{col.name}</span>
          {col.header && col.header.toLowerCase() !== col.name ? <span className="text-muted-foreground">← {col.header}</span> : null}
        </span>
      ))}
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  const { m, t, plural } = useI18n();
  if (issues.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border">
      {issues.map((i) => (
        <li key={i.code} className="flex gap-2.5 px-3 py-2 text-[13px]">
          {i.severity === "error" ? <AlertOctagon className="mt-0.5 size-4 shrink-0 text-level-low" aria-label={m.common.error} /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-level-medium-fg" aria-label={m.common.warning} />}
          <div className="min-w-0">
            <span>{i.message}</span>
            <span className="text-muted-foreground">
              {" "}
              {i.rows.length > 0
                ? t(m.import.rowsExample, { rows: plural(m.counts.rows, i.count), list: `${i.rows.join(m.common.listSep)}${i.count > i.rows.length ? "…" : ""}` })
                : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PreviewTable({ preview }: { preview: TablePreview }) {
  const { m } = useI18n();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="px-2.5 py-2 text-left font-medium">{m.import.colRow}</th>
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
                  {c === "" ? <span className="text-level-low-fg">{m.import.empty}</span> : c}
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
  const { m, t, plural } = useI18n();

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
      setReadError(e instanceof TableReadError ? e.message : m.import.readFailed);
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
      toast.success(m.import.resultsLoaded, {
        description: `${t(m.import.resultsLoadedText, {
          answers: plural(m.counts.answers, results.records.length),
          students: plural(m.counts.students, results.summary.students),
        })}${dataset.meta.isSynthetic ? m.import.demoPlanCleared : ""}`,
      });
    } else if (plan) {
      ok = await replaceDataset({
        ...dataset,
        curriculum: plan.entries,
        meta: { ...dataset.meta, curriculumFileName: loaded.file.name, excludedCurriculumRows: plan.errorRows, loadedAt: new Date().toISOString() },
      });
      toast.success(m.import.planLoaded, { description: t(m.common.sentence, { text: plural(m.counts.topics, plan.entries.length) }) });
    }
    if (!ok) {
      toast.warning(m.import.notSaved, { description: m.import.notSavedText });
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
          <AlertTitle>{m.import.readErrorTitle}</AlertTitle>
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
                {t(m.import.fileInfo, { rows: formatInt(loaded.table.rows.length), encoding: loaded.table.encoding ?? "—" })}
                {loaded.table.delimiter ? t(m.import.delimiter, { delimiter: loaded.table.delimiter === "\t" ? m.import.tab : loaded.table.delimiter }) : ""}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X aria-hidden />
              {m.import.otherFile}
            </Button>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{m.import.mappedColumns}</div>
            <MappingList mapping={v.mapping} />
          </div>

          {fatal.length > 0 ? (
            <Alert variant="destructive">
              <AlertOctagon aria-hidden />
              <AlertTitle>{m.import.fatalTitle}</AlertTitle>
              <AlertDescription>
                {fatal.map((f) => (
                  <p key={f}>{f}</p>
                ))}
                <p>{m.import.fatalHint}</p>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
              <Stat label={m.import.statRows} value={formatInt(v.totalRows)} />
              <Stat label={m.import.statValid} value={formatInt(validCount)} tone="high" />
              <Stat label={m.import.statErrors} value={formatInt(errorRows)} tone={errorRows > 0 ? "low" : undefined} />
              <Stat label={m.import.statDuplicates} value={formatInt(v.duplicateRows)} tone={v.duplicateRows > 0 ? "medium" : undefined} />
            </div>
          )}

          {results && fatal.length === 0 ? (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                plural(m.counts.students, results.summary.students),
                plural(m.counts.classes, results.summary.classes),
                plural(m.counts.subjects, results.summary.subjects),
                plural(m.counts.topics, results.summary.topics),
                plural(m.counts.textbooks, results.summary.textbooks),
                plural(m.counts.tests, results.summary.tests),
                results.summary.dateFrom ? t(m.units.dateRange, { from: formatDate(results.summary.dateFrom), to: formatDate(results.summary.dateTo) }) : null,
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
              <AlertTitle>{m.import.coverageTitle}</AlertTitle>
              <AlertDescription>
                {coverage.planWithoutResults.length > 0 ? (
                  <p>
                    {t(m.import.planWithoutResults, {
                      topics: plural(m.counts.topics, coverage.planWithoutResults.length),
                      list: `${coverage.planWithoutResults.slice(0, 4).map((e) => e.topicId).join(m.common.listSep)}${coverage.planWithoutResults.length > 4 ? "…" : ""}`,
                    })}
                  </p>
                ) : null}
                {coverage.resultsWithoutPlan.length > 0 ? (
                  <p>
                    {t(m.import.resultsWithoutPlan, {
                      topics: plural(m.counts.topics, coverage.resultsWithoutPlan.length),
                      list: `${coverage.resultsWithoutPlan.slice(0, 4).map((x) => x.topicId).join(m.common.listSep)}${coverage.resultsWithoutPlan.length > 4 ? "…" : ""}`,
                    })}
                  </p>
                ) : null}
                {coverage.coursesWithoutPlan.length > 0 ? (
                  <p>{t(m.data.noPlanFor, { courses: coverage.coursesWithoutPlan.map((c) => t(m.units.courseShort, { subject: c.subject, grade: c.grade })).join("; ") })}</p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{m.import.previewTitle}</div>
            <PreviewTable preview={v.preview} />
          </div>

          {fatal.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {validCount === 0
                  ? m.import.noValid
                  : errorRows > 0
                    ? t(m.import.withErrors, { rows: plural(m.counts.rows, errorRows) })
                    : results
                      ? dataset.meta.isSynthetic
                        ? m.import.replaceResultsDemo
                        : m.import.replaceResults
                      : m.import.replacePlan}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={reset}>
                  {m.common.cancel}
                </Button>
                <Button onClick={() => void apply()} disabled={validCount === 0} variant={errorRows > 0 ? "secondary" : "default"}>
                  {errorRows > 0 ? t(m.import.importValid, { n: formatInt(validCount) }) : m.import.applyData}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
