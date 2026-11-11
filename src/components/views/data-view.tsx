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
import { useI18n } from "@/i18n/provider";
import { checkCurriculumCoverage } from "@/lib/data/validate-curriculum";
import { summarizeRecords } from "@/lib/data/validate-results";
import { formatDate, formatInt } from "@/lib/format";
import { useReadyData } from "@/providers/data-provider";
import { ImportPanel } from "./import-panel";

function CurrentDataset() {
  const { dataset, restoreDemo } = useReadyData();
  const summary = React.useMemo(() => summarizeRecords(dataset.records), [dataset.records]);
  const coverage = React.useMemo(() => checkCurriculumCoverage(dataset.curriculum, dataset.records), [dataset.curriculum, dataset.records]);
  const meta = dataset.meta;
  const { m, t, plural, intl } = useI18n();

  return (
    <Section
      title={m.data.currentTitle}
      description={m.data.currentDescription}
      actions={
        !meta.isSynthetic || meta.source !== "demo" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void restoreDemo().then(() => toast.success(m.data.demoRestored));
            }}
          >
            <RotateCcw aria-hidden />
            {m.data.restoreDemo}
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {meta.isSynthetic ? (
            <Badge variant="medium">
              <FlaskConical aria-hidden />
              {m.data.syntheticBadge}
            </Badge>
          ) : (
            <Badge variant="high">
              <Database aria-hidden />
              {m.data.uploadedBadge}
            </Badge>
          )}
          {/* Название демо-набора хранится в данных по-русски — показываем его на языке интерфейса. */}
          <span className="text-sm font-medium">{meta.isSynthetic && meta.source === "demo" ? m.data.demoName : meta.name}</span>
          <span className="text-xs text-muted-foreground">
            {t(m.data.loadedAt, { date: new Date(meta.loadedAt).toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" }) })}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 lg:grid-cols-8">
          {[
            [m.data.statAnswers, formatInt(summary.rows)],
            [m.data.statStudents, formatInt(summary.students)],
            [m.data.statClasses, formatInt(summary.classes)],
            [m.data.statSubjects, formatInt(summary.subjects)],
            [m.data.statTopics, formatInt(summary.topics)],
            [m.data.statTextbooks, formatInt(summary.textbooks)],
            [m.data.statTests, formatInt(summary.tests)],
            [m.data.statPlanTopics, formatInt(dataset.curriculum.length)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-3 py-2.5">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-base font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            {m.data.resultsFile} <span className="text-foreground">{meta.resultsFileName ?? "—"}</span>
            {summary.dateFrom ? ` · ${t(m.units.dateRange, { from: formatDate(summary.dateFrom), to: formatDate(summary.dateTo) })}` : ""}
          </div>
          <div>
            {m.data.planFile} <span className="text-foreground">{meta.curriculumFileName ?? m.data.planNotLoaded}</span>
          </div>
          {meta.excludedResultRows > 0 || meta.removedDuplicates > 0 ? (
            <div>{t(m.data.excludedResults, { excluded: meta.excludedResultRows, duplicates: meta.removedDuplicates })}</div>
          ) : null}
          {meta.excludedCurriculumRows > 0 ? <div>{t(m.data.excludedPlan, { n: meta.excludedCurriculumRows })}</div> : null}
        </div>
        {dataset.curriculum.length === 0 ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden />
            <AlertTitle>{m.data.noPlanTitle}</AlertTitle>
            <AlertDescription>
              <p>{m.data.noPlanText}</p>
            </AlertDescription>
          </Alert>
        ) : coverage.coursesWithoutPlan.length > 0 || coverage.resultsWithoutPlan.length > 0 ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden />
            <AlertTitle>{m.data.partialPlanTitle}</AlertTitle>
            <AlertDescription>
              {coverage.coursesWithoutPlan.length > 0 ? (
                <p>{t(m.data.noPlanFor, { courses: coverage.coursesWithoutPlan.map((c) => t(m.units.courseShort, { subject: c.subject, grade: c.grade })).join("; ") })}</p>
              ) : null}
              {coverage.resultsWithoutPlan.length > 0 ? <p>{t(m.data.resultsWithoutPlan, { topics: plural(m.counts.topics, coverage.resultsWithoutPlan.length) })}</p> : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </Section>
  );
}

function ColumnsTable({ columns, kind }: { columns: ColumnSpec<string>[]; kind: "results" | "curriculum" }) {
  const { m, locale } = useI18n();
  const info = m.schema[kind] as Record<string, { description: string; example: string }>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{m.data.colColumn}</th>
            <th className="px-3 py-2 text-left font-medium">{m.data.colRequired}</th>
            <th className="px-3 py-2 text-left font-medium">{m.data.colDescription}</th>
            <th className="px-3 py-2 text-left font-medium">{m.data.colExample}</th>
            <th className="px-3 py-2 text-left font-medium">{m.data.colAliases}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {columns.map((c) => (
            <tr key={c.key}>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{c.name}</td>
              <td className="px-3 py-2">{c.required ? m.common.yes : <span className="text-muted-foreground">{m.common.no}</span>}</td>
              <td className="px-3 py-2 text-muted-foreground">{info[c.key]?.description}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{info[c.key]?.example}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {[...(locale !== "ru" ? (c.localAliases?.[locale] ?? []) : []), ...c.aliases].join(m.common.listSep)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataView() {
  const [tab, setTab] = React.useState<"results" | "curriculum">("results");
  const { m } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader title={m.data.title} description={m.data.description} />
      <DataGate>
        <CurrentDataset />

        <Section title={m.data.importTitle} description={m.data.importDescription}>
          <div className="px-5 py-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "results" | "curriculum")}>
              <TabsList>
                <TabsTrigger value="results">{m.data.tabResults}</TabsTrigger>
                <TabsTrigger value="curriculum">{m.data.tabPlan}</TabsTrigger>
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
          <AlertTitle>{m.data.privacyTitle}</AlertTitle>
          <AlertDescription>
            <p>{m.data.privacyText}</p>
          </AlertDescription>
        </Alert>

        <Section
          title={m.data.formatTitle}
          description={m.data.formatDescription}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => downloadCsv(m.data.resultsTemplateFile, resultsTemplateCsv())}>
                <Download aria-hidden />
                {m.data.resultsTemplate}
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadCsv(m.data.planTemplateFile, curriculumTemplateCsv())}>
                <Download aria-hidden />
                {m.data.planTemplate}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-5 px-5 py-4">
            <div className="grid gap-2">
              <h3 className="text-[13px] font-semibold">{m.data.resultsHeading}</h3>
              <ColumnsTable columns={RESULT_COLUMNS} kind="results" />
            </div>
            <div className="grid gap-2">
              <h3 className="text-[13px] font-semibold">{m.data.planHeading}</h3>
              <ColumnsTable columns={CURRICULUM_COLUMNS} kind="curriculum" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <HardDrive className="size-4" aria-hidden />
              {m.data.demoFiles}
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
