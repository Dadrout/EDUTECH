import { i18n } from "@/i18n/core";
import Papa from "papaparse";
import { CURRICULUM_COLUMNS, RESULT_COLUMNS } from "./schema";

const BOM = String.fromCharCode(0xfeff);

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  // escapeFormulae: текст вида «=…», «+…», «-…», «@…» из загруженных файлов не выполнится как формула Excel.
  return Papa.unparse({ fields: headers, data: rows.map((r) => r.map((v) => (v === null ? "" : v))) }, { escapeFormulae: true });
}

/** Скачать текстовый файл. BOM нужен, чтобы Excel корректно открыл кириллицу. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Пример строк шаблона — на языке интерфейса (значения из описания колонок). */
export function resultsTemplateCsv(): string {
  const ex = i18n().m.schema.results;
  const row = (question: string, correct: number) => [
    ex.studentId.example,
    ex.classId.example,
    7,
    ex.subject.example,
    ex.topicId.example,
    ex.topicName.example,
    ex.textbookId.example,
    ex.textbookName.example,
    ex.testId.example,
    question,
    correct,
    "2026-02-12",
  ];
  return toCsv(
    RESULT_COLUMNS.map((c) => c.name),
    [row("Q01", 1), row("Q02", 0)],
  );
}

export function curriculumTemplateCsv(rows?: { subject: string; grade: number; topicId: string; topicName: string }[]): string {
  const data = rows
    ? rows.map((r) => [r.subject, r.grade, r.topicId, r.topicName, "", ""])
    : [[i18n().m.schema.curriculum.subject.example, 7, i18n().m.schema.curriculum.topicId.example, i18n().m.schema.curriculum.topicName.example, 14, 10]];
  return toCsv(
    CURRICULUM_COLUMNS.map((c) => c.name),
    data,
  );
}
