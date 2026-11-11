import Papa from "papaparse";
import { CURRICULUM_COLUMNS, RESULT_COLUMNS } from "./schema";

const BOM = String.fromCharCode(0xfeff);

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return Papa.unparse({ fields: headers, data: rows.map((r) => r.map((v) => (v === null ? "" : v))) });
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

export function resultsTemplateCsv(): string {
  return toCsv(
    RESULT_COLUMNS.map((c) => c.name),
    [
      ["S0001", "7А", 7, "Алгебра", "ALG7-05", "Разложение многочленов на множители", "ALG7-ALPHA", "Алгебра 7 · УМК «Альфа»", "ALG7-T3", "Q01", 1, "2026-02-12"],
      ["S0001", "7А", 7, "Алгебра", "ALG7-05", "Разложение многочленов на множители", "ALG7-ALPHA", "Алгебра 7 · УМК «Альфа»", "ALG7-T3", "Q02", 0, "2026-02-12"],
    ],
  );
}

export function curriculumTemplateCsv(rows?: { subject: string; grade: number; topicId: string; topicName: string }[]): string {
  const data = rows
    ? rows.map((r) => [r.subject, r.grade, r.topicId, r.topicName, "", ""])
    : [
        ["Алгебра", 7, "ALG7-05", "Разложение многочленов на множители", 14, 10],
        ["Алгебра", 7, "ALG7-06", "Алгебраические дроби", 14, 10],
      ];
  return toCsv(
    CURRICULUM_COLUMNS.map((c) => c.name),
    data,
  );
}
