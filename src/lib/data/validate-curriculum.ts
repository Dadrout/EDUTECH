import type { AnswerRecord, CurriculumEntry } from "@/lib/domain/types";
import { makeTopicKey, topicKeyOf } from "@/lib/domain/types";
import { IssueCollector, previewIndices, type TablePreview, type ValidationIssue } from "./issues";
import { isHalfHourMultiple, parseGrade, parseNonNegativeNumber } from "./parse-values";
import type { RawTable } from "./raw-table";
import { CURRICULUM_COLUMNS, mapColumns, type ColumnMapping, type CurriculumColumnKey } from "./schema";

export interface CurriculumValidation {
  fatal: string[];
  mapping: ColumnMapping<CurriculumColumnKey>;
  totalRows: number;
  entries: CurriculumEntry[];
  errorRows: number;
  duplicateRows: number;
  issues: ValidationIssue[];
  preview: TablePreview;
}

const PREVIEW_ROWS = 15;

export function validateCurriculum(table: RawTable): CurriculumValidation {
  const mapping = mapColumns(table.headers, CURRICULUM_COLUMNS);
  const issues = new IssueCollector();
  const fatal: string[] = [];
  if (mapping.missingRequired.length > 0) fatal.push(`Не найдены обязательные колонки: ${mapping.missingRequired.join(", ")}.`);
  if (table.rows.length === 0) fatal.push("В файле нет строк с данными.");
  if (mapping.unknownHeaders.length > 0) {
    issues.note("warning", "unknown-headers", `Колонки не используются: ${mapping.unknownHeaders.join(", ")}.`, mapping.unknownHeaders.length);
  }
  const idx = mapping.indexOf;
  const get = (row: string[], key: CurriculumColumnKey) => (idx[key] >= 0 ? (row[idx[key]] ?? "").trim() : "");
  const previewRows = (errors: Set<number>) =>
    previewIndices(table.rows.length, [...errors].sort((a, b) => a - b), PREVIEW_ROWS).map((i) => ({
      rowNumber: table.rowNumbers[i],
      cells: fatal.length > 0 ? table.rows[i] : CURRICULUM_COLUMNS.map((c) => get(table.rows[i], c.key)),
      hasError: errors.has(i),
    }));

  if (fatal.length > 0) {
    return {
      fatal,
      mapping,
      totalRows: table.rows.length,
      entries: [],
      errorRows: table.rows.length,
      duplicateRows: 0,
      issues: issues.list(),
      preview: { headers: table.headers, rows: previewRows(new Set()) },
    };
  }

  const rowError = new Set<number>();
  const parsed: { index: number; rowNumber: number; entry: CurriculumEntry }[] = [];
  table.rows.forEach((row, i) => {
    const rowNumber = table.rowNumbers[i];
    let bad = false;
    for (const key of ["subject", "grade", "topicId", "currentHours", "minHours"] as const) {
      if (get(row, key) === "") {
        issues.add("error", `empty-${key}`, `Пустое значение в обязательной колонке ${CURRICULUM_COLUMNS.find((c) => c.key === key)!.name}.`, rowNumber);
        bad = true;
      }
    }
    const grade = get(row, "grade") === "" ? null : parseGrade(get(row, "grade"));
    if (get(row, "grade") !== "" && grade === null) {
      issues.add("error", "bad-grade", "Некорректная параллель: ожидается целое число от 1 до 12.", rowNumber);
      bad = true;
    }
    const hours = (key: "currentHours" | "minHours", label: string): number | null => {
      const raw = get(row, key);
      if (raw === "") return null;
      const value = parseNonNegativeNumber(raw);
      if (value === null) {
        issues.add("error", `bad-${key}`, `${label}: ожидается неотрицательное число.`, rowNumber);
        bad = true;
        return null;
      }
      if (!isHalfHourMultiple(value)) {
        issues.add("error", `half-${key}`, `${label}: значение должно быть кратно 0,5 ч.`, rowNumber);
        bad = true;
        return null;
      }
      return value;
    };
    const currentHours = hours("currentHours", "current_hours");
    const minHours = hours("minHours", "min_hours");
    if (bad || grade === null || currentHours === null || minHours === null) {
      rowError.add(i);
      return;
    }
    if (minHours > currentHours) {
      issues.add("warning", "min-above-current", "Минимум часов больше текущих часов — при расчёте тема будет поднята до минимума.", rowNumber);
    }
    parsed.push({
      index: i,
      rowNumber,
      entry: {
        subject: get(row, "subject"),
        grade,
        topicId: get(row, "topicId"),
        topicName: get(row, "topicName") || null,
        currentHours,
        minHours,
      },
    });
  });

  const byKey = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const key = makeTopicKey(p.entry.subject, p.entry.grade, p.entry.topicId);
    const list = byKey.get(key);
    if (list) list.push(p);
    else byKey.set(key, [p]);
  }
  const duplicates = new Set<number>();
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const same = list.every(
      (p) => p.entry.currentHours === list[0].entry.currentHours && p.entry.minHours === list[0].entry.minHours,
    );
    if (same) {
      for (const p of list.slice(1)) {
        issues.add("warning", "duplicate", "Точные дубликаты строк плана удалены.", p.rowNumber);
        duplicates.add(p.index);
      }
    } else {
      for (const p of list) {
        issues.add("error", "conflict", "Тема указана в плане несколько раз с разными часами — строки исключаются.", p.rowNumber);
        rowError.add(p.index);
      }
    }
  }

  const entries = parsed.filter((p) => !rowError.has(p.index) && !duplicates.has(p.index)).map((p) => p.entry);
  return {
    fatal,
    mapping,
    totalRows: table.rows.length,
    entries,
    errorRows: rowError.size,
    duplicateRows: duplicates.size,
    issues: issues.list(),
    preview: { headers: CURRICULUM_COLUMNS.map((c) => c.name), rows: previewRows(rowError) },
  };
}

export interface CurriculumCoverage {
  /** Темы плана без результатов тестирования. */
  planWithoutResults: CurriculumEntry[];
  /** Темы с результатами, отсутствующие в плане (для предметов и параллелей, которые есть в плане). */
  resultsWithoutPlan: { subject: string; grade: number; topicId: string; topicName: string }[];
  /** Предметы и параллели из результатов, для которых нет плана. */
  coursesWithoutPlan: { subject: string; grade: number }[];
}

/** Сверка учебного плана с результатами тестирования. */
export function checkCurriculumCoverage(entries: CurriculumEntry[], records: AnswerRecord[]): CurriculumCoverage {
  const planKeys = new Set(entries.map((e) => makeTopicKey(e.subject, e.grade, e.topicId)));
  const planCourses = new Set(entries.map((e) => `${e.subject}\u0000${e.grade}`));
  const resultTopics = new Map<string, { subject: string; grade: number; topicId: string; topicName: string }>();
  const resultCourses = new Map<string, { subject: string; grade: number }>();
  for (const r of records) {
    const key = topicKeyOf(r);
    if (!resultTopics.has(key)) resultTopics.set(key, { subject: r.subject, grade: r.grade, topicId: r.topicId, topicName: r.topicName });
    const ck = `${r.subject}\u0000${r.grade}`;
    if (!resultCourses.has(ck)) resultCourses.set(ck, { subject: r.subject, grade: r.grade });
  }
  return {
    planWithoutResults: entries.filter((e) => !resultTopics.has(makeTopicKey(e.subject, e.grade, e.topicId))),
    resultsWithoutPlan: [...resultTopics.entries()]
      .filter(([key, t]) => planCourses.has(`${t.subject}\u0000${t.grade}`) && !planKeys.has(key))
      .map(([, t]) => t),
    coursesWithoutPlan: [...resultCourses.entries()].filter(([ck]) => !planCourses.has(ck)).map(([, c]) => c),
  };
}
