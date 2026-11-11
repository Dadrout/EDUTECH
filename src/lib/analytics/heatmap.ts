import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord, MasteryLevel } from "@/lib/domain/types";
import { topicKeyOf } from "@/lib/domain/types";
import { compareTopics, naturalCompare } from "./filters";
import { classifyLevel } from "./stats";
import { StudentAccumulator } from "./topics";

export interface HeatmapCell {
  classId: string;
  topicKey: string;
  students: number;
  answers: number;
  rate: number | null;
  level: MasteryLevel;
  sufficient: boolean;
  /** Отклонение от успешности параллели по теме, в долях (−1..1). */
  deltaFromTopic: number | null;
}

export interface HeatmapColumn {
  key: string;
  topicId: string;
  topicName: string;
  rate: number | null;
}

export interface HeatmapRow {
  classId: string;
  textbookNames: string[];
  rate: number | null;
  students: number;
}

export interface HeatmapData {
  columns: HeatmapColumn[];
  rows: HeatmapRow[];
  /** cells[rowIndex][columnIndex]; null — класс не писал тест по теме. */
  cells: (HeatmapCell | null)[][];
}

/**
 * Матрица «класс × тема». Корректна в пределах одного предмета и параллели,
 * поэтому вызывающая сторона передаёт уже отфильтрованные записи.
 */
export function computeHeatmap(records: AnswerRecord[], config: AnalysisConfig): HeatmapData {
  const columnsMap = new Map<string, { topicId: string; topicName: string; subject: string; grade: number; acc: StudentAccumulator }>();
  const rowsMap = new Map<string, { textbooks: Set<string>; acc: StudentAccumulator }>();
  const cellsMap = new Map<string, StudentAccumulator>();

  for (const r of records) {
    const tk = topicKeyOf(r);
    let col = columnsMap.get(tk);
    if (!col) {
      col = { topicId: r.topicId, topicName: r.topicName, subject: r.subject, grade: r.grade, acc: new StudentAccumulator() };
      columnsMap.set(tk, col);
    }
    col.acc.add(r.studentId, r.isCorrect);

    let row = rowsMap.get(r.classId);
    if (!row) {
      row = { textbooks: new Set(), acc: new StudentAccumulator() };
      rowsMap.set(r.classId, row);
    }
    row.textbooks.add(r.textbookName);
    row.acc.add(r.studentId, r.isCorrect);

    const ck = r.classId + "\u001f" + tk;
    let cell = cellsMap.get(ck);
    if (!cell) {
      cell = new StudentAccumulator();
      cellsMap.set(ck, cell);
    }
    cell.add(r.studentId, r.isCorrect);
  }

  const columnEntries = [...columnsMap.entries()].sort((a, b) => compareTopics(a[1], b[1]));
  const columns: HeatmapColumn[] = columnEntries.map(([key, c]) => ({
    key,
    topicId: c.topicId,
    topicName: c.topicName,
    rate: c.acc.total > 0 ? c.acc.correct / c.acc.total : null,
  }));
  const rowEntries = [...rowsMap.entries()].sort((a, b) => naturalCompare(a[0], b[0]));
  const rows: HeatmapRow[] = rowEntries.map(([classId, r]) => ({
    classId,
    textbookNames: [...r.textbooks].sort(naturalCompare),
    rate: r.acc.total > 0 ? r.acc.correct / r.acc.total : null,
    students: r.acc.students,
  }));

  const cells = rowEntries.map(([classId]) =>
    columns.map((col) => {
      const acc = cellsMap.get(classId + "\u001f" + col.key);
      if (!acc || acc.total === 0) return null;
      const rate = acc.correct / acc.total;
      const sufficient = acc.students >= config.minStudentsPerCell;
      return {
        classId,
        topicKey: col.key,
        students: acc.students,
        answers: acc.total,
        rate,
        level: sufficient ? classifyLevel(rate, config.thresholds) : "insufficient",
        sufficient,
        deltaFromTopic: col.rate !== null ? rate - col.rate : null,
      } satisfies HeatmapCell;
    }),
  );

  return { columns, rows, cells };
}
