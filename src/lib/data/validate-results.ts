import { i18n } from "@/i18n/core";
import type { AnswerRecord } from "@/lib/domain/types";
import { questionKeyOf, topicKeyOf } from "@/lib/domain/types";
import { IssueCollector, majority, previewIndices, type TablePreview, type ValidationIssue } from "./issues";
import { gradeFromClassId, parseBoolean, parseDate, parseGrade } from "./parse-values";
import type { RawTable } from "./raw-table";
import { mapColumns, RESULT_COLUMNS, type ColumnMapping, type ResultColumnKey } from "./schema";

export interface DatasetSummary {
  rows: number;
  students: number;
  classes: number;
  subjects: number;
  topics: number;
  textbooks: number;
  tests: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface ResultsValidation {
  /** Критические ошибки структуры: импорт невозможен. */
  fatal: string[];
  mapping: ColumnMapping<ResultColumnKey>;
  gradeDerived: boolean;
  totalRows: number;
  /** Корректные записи (без строк с ошибками и без точных дубликатов). */
  records: AnswerRecord[];
  /** Число строк, исключаемых из-за ошибок. */
  errorRows: number;
  duplicateRows: number;
  issues: ValidationIssue[];
  preview: TablePreview;
  summary: DatasetSummary;
}

const PREVIEW_ROWS = 10;

interface Candidate {
  index: number;
  rowNumber: number;
  record: AnswerRecord;
}

export function summarizeRecords(records: AnswerRecord[]): DatasetSummary {
  const s = { students: new Set<string>(), classes: new Set<string>(), subjects: new Set<string>(), topics: new Set<string>(), textbooks: new Set<string>(), tests: new Set<string>() };
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  for (const r of records) {
    s.students.add(r.studentId);
    s.classes.add(r.classId);
    s.subjects.add(r.subject);
    s.topics.add(topicKeyOf(r));
    s.textbooks.add(r.textbookId);
    s.tests.add(r.testId);
    if (dateFrom === null || r.testDate < dateFrom) dateFrom = r.testDate;
    if (dateTo === null || r.testDate > dateTo) dateTo = r.testDate;
  }
  return {
    rows: records.length,
    students: s.students.size,
    classes: s.classes.size,
    subjects: s.subjects.size,
    topics: s.topics.size,
    textbooks: s.textbooks.size,
    tests: s.tests.size,
    dateFrom,
    dateTo,
  };
}

const COLUMN_LABEL: Record<ResultColumnKey, string> = Object.fromEntries(RESULT_COLUMNS.map((c) => [c.key, c.name])) as Record<
  ResultColumnKey,
  string
>;

export function validateResults(table: RawTable): ResultsValidation {
  const mapping = mapColumns(table.headers, RESULT_COLUMNS);
  const issues = new IssueCollector();
  const fatal: string[] = [];
  const gradeDerived = mapping.indexOf.grade < 0;

  if (mapping.missingRequired.length > 0) {
    fatal.push(i18n().t(i18n().m.validation.missingColumns, { columns: mapping.missingRequired.join(", ") }));
  }
  if (table.rows.length === 0) fatal.push(i18n().m.validation.noRows);
  if (mapping.duplicateHeaders.length > 0) {
    issues.note("warning", "dup-headers", i18n().t(i18n().m.validation.duplicateHeaders, { columns: mapping.duplicateHeaders.join(", ") }));
  }
  if (mapping.unknownHeaders.length > 0) {
    issues.note("warning", "unknown-headers", i18n().t(i18n().m.validation.unknownHeadersResults, { columns: mapping.unknownHeaders.join(", ") }), mapping.unknownHeaders.length);
  }
  if (gradeDerived && fatal.length === 0) {
    issues.note("warning", "grade-derived", i18n().m.validation.gradeDerived);
  }

  const previewHeaders = RESULT_COLUMNS.map((c) => c.name);
  if (fatal.length > 0) {
    return {
      fatal,
      mapping,
      gradeDerived,
      totalRows: table.rows.length,
      records: [],
      errorRows: table.rows.length,
      duplicateRows: 0,
      issues: issues.list(),
      preview: {
        headers: table.headers,
        rows: table.rows.slice(0, PREVIEW_ROWS).map((cells, i) => ({ rowNumber: table.rowNumbers[i], cells, hasError: false })),
      },
      summary: summarizeRecords([]),
    };
  }

  const idx = mapping.indexOf;
  const rowError = new Array<boolean>(table.rows.length).fill(false);
  const candidates: Candidate[] = [];
  const get = (row: string[], key: ResultColumnKey) => (idx[key] >= 0 ? (row[idx[key]] ?? "").trim() : "");

  table.rows.forEach((row, i) => {
    const rowNumber = table.rowNumbers[i];
    let bad = false;
    const required: ResultColumnKey[] = ["studentId", "classId", "subject", "topicId", "topicName", "textbookId", "textbookName", "testId", "questionId", "isCorrect", "testDate"];
    for (const key of required) {
      if (get(row, key) === "") {
        issues.add("error", `empty-${key}`, i18n().t(i18n().m.validation.emptyValue, { column: COLUMN_LABEL[key] }), rowNumber);
        bad = true;
      }
    }

    const classId = get(row, "classId");
    let grade: number | null = null;
    const gradeRaw = get(row, "grade");
    if (gradeRaw !== "") {
      grade = parseGrade(gradeRaw);
      if (grade === null) {
        issues.add("error", "bad-grade", i18n().m.validation.badGradeResults, rowNumber);
        bad = true;
      }
    } else if (classId !== "") {
      grade = gradeFromClassId(classId);
      if (grade === null) {
        issues.add("error", "no-grade", i18n().m.validation.noGrade, rowNumber);
        bad = true;
      }
    }

    const correctRaw = get(row, "isCorrect");
    const isCorrect = correctRaw === "" ? null : parseBoolean(correctRaw);
    if (correctRaw !== "" && isCorrect === null) {
      issues.add("error", "bad-correct", i18n().m.validation.badCorrect, rowNumber);
      bad = true;
    }

    const dateRaw = get(row, "testDate");
    const testDate = dateRaw === "" ? null : parseDate(dateRaw);
    if (dateRaw !== "" && testDate === null) {
      issues.add("error", "bad-date", i18n().m.validation.badDate, rowNumber);
      bad = true;
    }

    if (bad || grade === null || isCorrect === null || testDate === null) {
      rowError[i] = true;
      return;
    }
    candidates.push({
      index: i,
      rowNumber,
      record: {
        studentId: get(row, "studentId"),
        classId,
        grade,
        subject: get(row, "subject"),
        topicId: get(row, "topicId"),
        topicName: get(row, "topicName"),
        textbookId: get(row, "textbookId"),
        textbookName: get(row, "textbookName"),
        testId: get(row, "testId"),
        questionId: get(row, "questionId"),
        isCorrect,
        testDate,
      },
    });
  });

  // Класс относится к одной параллели.
  const classGrades = new Map<string, Map<number, number>>();
  for (const c of candidates) {
    let m = classGrades.get(c.record.classId);
    if (!m) {
      m = new Map();
      classGrades.set(c.record.classId, m);
    }
    m.set(c.record.grade, (m.get(c.record.grade) ?? 0) + 1);
  }
  for (const c of candidates) {
    const m = classGrades.get(c.record.classId)!;
    if (m.size > 1 && c.record.grade !== majority(m)) {
      issues.add("error", "class-grade", i18n().m.validation.classGrade, c.rowNumber);
      rowError[c.index] = true;
    }
  }

  // Задание относится к одной теме.
  const questionTopics = new Map<string, Map<string, number>>();
  for (const c of candidates) {
    if (rowError[c.index]) continue;
    const qk = questionKeyOf(c.record);
    let m = questionTopics.get(qk);
    if (!m) {
      m = new Map();
      questionTopics.set(qk, m);
    }
    const tk = topicKeyOf(c.record);
    m.set(tk, (m.get(tk) ?? 0) + 1);
  }
  for (const c of candidates) {
    if (rowError[c.index]) continue;
    const m = questionTopics.get(questionKeyOf(c.record))!;
    if (m.size > 1 && topicKeyOf(c.record) !== majority(m)) {
      issues.add("error", "question-topic", i18n().m.validation.questionTopic, c.rowNumber);
      rowError[c.index] = true;
    }
  }

  // Дубликаты ответа ученика на задание.
  const seen = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (rowError[c.index]) continue;
    const key = [c.record.studentId, c.record.testId, c.record.questionId].join("\u0000");
    const list = seen.get(key);
    if (list) list.push(c);
    else seen.set(key, [c]);
  }
  const duplicateIdx = new Set<number>();
  for (const list of seen.values()) {
    if (list.length < 2) continue;
    const values = new Set(list.map((c) => c.record.isCorrect));
    if (values.size > 1) {
      for (const c of list) {
        issues.add("error", "conflict", i18n().m.validation.conflictResults, c.rowNumber);
        rowError[c.index] = true;
      }
    } else {
      for (const c of list.slice(1)) {
        issues.add("warning", "duplicate", i18n().m.validation.duplicateResults, c.rowNumber);
        duplicateIdx.add(c.index);
      }
    }
  }

  const valid = candidates.filter((c) => !rowError[c.index] && !duplicateIdx.has(c.index));

  // Согласование названий: одна тема/учебник — одно название.
  const topicNames = new Map<string, Map<string, number>>();
  const textbookNames = new Map<string, Map<string, number>>();
  for (const c of valid) {
    const tk = topicKeyOf(c.record);
    const tn = topicNames.get(tk) ?? new Map<string, number>();
    tn.set(c.record.topicName, (tn.get(c.record.topicName) ?? 0) + 1);
    topicNames.set(tk, tn);
    const bn = textbookNames.get(c.record.textbookId) ?? new Map<string, number>();
    bn.set(c.record.textbookName, (bn.get(c.record.textbookName) ?? 0) + 1);
    textbookNames.set(c.record.textbookId, bn);
  }
  for (const c of valid) {
    const tn = topicNames.get(topicKeyOf(c.record))!;
    if (tn.size > 1) {
      const name = majority(tn)!;
      if (c.record.topicName !== name) {
        issues.add("warning", "topic-name", i18n().m.validation.topicName, c.rowNumber);
        c.record = { ...c.record, topicName: name };
      }
    }
    const bn = textbookNames.get(c.record.textbookId)!;
    if (bn.size > 1) {
      const name = majority(bn)!;
      if (c.record.textbookName !== name) {
        issues.add("warning", "textbook-name", i18n().m.validation.textbookName, c.rowNumber);
        c.record = { ...c.record, textbookName: name };
      }
    }
  }

  // Информационные проверки, влияющие на интерпретацию.
  const studentClasses = new Map<string, Set<string>>();
  const studentTextbooks = new Map<string, Set<string>>();
  for (const c of valid) {
    const sc = studentClasses.get(c.record.studentId) ?? new Set<string>();
    sc.add(c.record.classId);
    studentClasses.set(c.record.studentId, sc);
    const stKey = c.record.studentId + "\u0000" + c.record.subject;
    const st = studentTextbooks.get(stKey) ?? new Set<string>();
    st.add(c.record.textbookId);
    studentTextbooks.set(stKey, st);
  }
  const multiClass = [...studentClasses.values()].filter((s) => s.size > 1).length;
  if (multiClass > 0) {
    issues.note("warning", "student-class", i18n().t(i18n().m.validation.studentClass, { n: multiClass }), multiClass);
  }
  const multiBook = [...studentTextbooks.values()].filter((s) => s.size > 1).length;
  if (multiBook > 0) {
    issues.note(
      "warning",
      "student-textbook",
      i18n().t(i18n().m.validation.studentTextbook, { n: multiBook }),
      multiBook,
    );
  }

  const errorRows = rowError.filter(Boolean).length;
  const records = valid.map((c) => c.record);
  const errorSet = new Set(rowError.map((e, i) => (e ? i : -1)).filter((i) => i >= 0));

  return {
    fatal,
    mapping,
    gradeDerived,
    totalRows: table.rows.length,
    records,
    errorRows,
    duplicateRows: duplicateIdx.size,
    issues: issues.list(),
    preview: {
      headers: previewHeaders,
      rows: previewIndices(table.rows.length, errorSet, PREVIEW_ROWS).map((i) => {
        const row = table.rows[i];
        return {
          rowNumber: table.rowNumbers[i],
          cells: RESULT_COLUMNS.map((col) => {
            if (col.key === "grade" && gradeDerived) {
              const g = gradeFromClassId(get(row, "classId"));
              return g === null ? "" : i18n().t(i18n().m.validation.gradeFromClass, { grade: g });
            }
            return get(row, col.key);
          }),
          hasError: errorSet.has(i),
        };
      }),
    },
    summary: summarizeRecords(records),
  };
}
