import type { AnswerRecord, DataFilters } from "@/lib/domain/types";
import { makeTopicKey, topicKeyOf } from "@/lib/domain/types";
import { i18n } from "@/i18n/core";

export const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });

export type FilterKey = keyof DataFilters;

/** Применить выбранные фильтры (по умолчанию — все). */
export function filterRecords(
  records: AnswerRecord[],
  filters: DataFilters,
  apply: FilterKey[] = ["subject", "grade", "classId", "textbookId", "topicKey"],
): AnswerRecord[] {
  const use = new Set(apply);
  const subject = use.has("subject") ? filters.subject : null;
  const grade = use.has("grade") ? filters.grade : null;
  const classId = use.has("classId") ? filters.classId : null;
  const textbookId = use.has("textbookId") ? filters.textbookId : null;
  const topicKey = use.has("topicKey") ? filters.topicKey : null;
  if (subject === null && grade === null && classId === null && textbookId === null && topicKey === null) {
    return records;
  }
  return records.filter(
    (r) =>
      (subject === null || r.subject === subject) &&
      (grade === null || r.grade === grade) &&
      (classId === null || r.classId === classId) &&
      (textbookId === null || r.textbookId === textbookId) &&
      (topicKey === null || topicKeyOf(r) === topicKey),
  );
}

export interface Option<T extends string | number = string> {
  value: T;
  label: string;
  hint?: string;
}

export interface FilterOptions {
  subjects: Option[];
  grades: Option<number>[];
  classes: Option[];
  textbooks: Option[];
  topics: Option[];
}

/**
 * Каскадные варианты фильтров: параллели зависят от предмета,
 * классы/учебники/темы — от предмета и параллели.
 */
export function getFilterOptions(records: AnswerRecord[], filters: DataFilters): FilterOptions {
  const { t, m } = i18n();
  const subjects = new Set<string>();
  const grades = new Set<number>();
  const classes = new Map<string, number>();
  const textbooks = new Map<string, string>();
  const topics = new Map<string, { name: string; topicId: string; subject: string; grade: number }>();

  for (const r of records) {
    subjects.add(r.subject);
    if (filters.subject !== null && r.subject !== filters.subject) continue;
    grades.add(r.grade);
    if (filters.grade !== null && r.grade !== filters.grade) continue;
    classes.set(r.classId, r.grade);
    textbooks.set(r.textbookId, r.textbookName);
    const key = topicKeyOf(r);
    if (!topics.has(key)) {
      topics.set(key, { name: r.topicName, topicId: r.topicId, subject: r.subject, grade: r.grade });
    }
  }

  const multiSubject = filters.subject === null && subjects.size > 1;
  const multiGrade = filters.grade === null;

  return {
    subjects: [...subjects].sort(naturalCompare).map((s) => ({ value: s, label: s })),
    grades: [...grades].sort((a, b) => a - b).map((g) => ({ value: g, label: t(m.units.grade, { grade: g }) })),
    classes: [...classes.entries()]
      .sort((a, b) => naturalCompare(a[0], b[0]))
      .map(([id]) => ({ value: id, label: id })),
    textbooks: [...textbooks.entries()]
      .sort((a, b) => naturalCompare(a[1], b[1]))
      .map(([id, name]) => ({ value: id, label: name })),
    topics: [...topics.entries()]
      .sort((a, b) => compareTopics(a[1], b[1]))
      .map(([key, tp]) => ({
        value: key,
        label: tp.name,
        hint: [multiSubject ? tp.subject : null, multiGrade ? t(m.units.gradeShort, { grade: tp.grade }) : null].filter(Boolean).join(" · ") || undefined,
      })),
  };
}

export function compareTopics(
  a: { subject: string; grade: number; topicId: string },
  b: { subject: string; grade: number; topicId: string },
): number {
  return naturalCompare(a.subject, b.subject) || a.grade - b.grade || naturalCompare(a.topicId, b.topicId);
}

/** Сбросить значения фильтров, которые стали недопустимыми после смены данных или зависимого фильтра. */
export function sanitizeFilters(records: AnswerRecord[], filters: DataFilters): DataFilters {
  let next = { ...filters };
  let options = getFilterOptions(records, next);
  if (next.subject !== null && !options.subjects.some((o) => o.value === next.subject)) {
    next = { ...next, subject: null };
    options = getFilterOptions(records, next);
  }
  if (next.grade !== null && !options.grades.some((o) => o.value === next.grade)) {
    next = { ...next, grade: null };
    options = getFilterOptions(records, next);
  }
  if (next.classId !== null && !options.classes.some((o) => o.value === next.classId)) {
    next = { ...next, classId: null };
  }
  if (next.textbookId !== null && !options.textbooks.some((o) => o.value === next.textbookId)) {
    next = { ...next, textbookId: null };
  }
  if (next.topicKey !== null && !options.topics.some((o) => o.value === next.topicKey)) {
    next = { ...next, topicKey: null };
  }
  return next;
}

export function filtersEqual(a: DataFilters, b: DataFilters): boolean {
  return (
    a.subject === b.subject &&
    a.grade === b.grade &&
    a.classId === b.classId &&
    a.textbookId === b.textbookId &&
    a.topicKey === b.topicKey
  );
}

/** Пары «предмет + параллель», присутствующие в данных. */
export function listCourses(records: AnswerRecord[]): { subject: string; grade: number }[] {
  const seen = new Map<string, { subject: string; grade: number }>();
  for (const r of records) {
    const key = makeTopicKey(r.subject, r.grade, "");
    if (!seen.has(key)) seen.set(key, { subject: r.subject, grade: r.grade });
  }
  return [...seen.values()].sort((a, b) => naturalCompare(a.subject, b.subject) || a.grade - b.grade);
}
