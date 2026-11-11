import { DEFAULT_ANALYSIS_CONFIG, type AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord } from "@/lib/domain/types";

export const config: AnalysisConfig = { ...DEFAULT_ANALYSIS_CONFIG };

/** Детерминированный ГПСЧ для тестов. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rec(partial: Partial<AnswerRecord>): AnswerRecord {
  return {
    studentId: "S1",
    classId: "7А",
    grade: 7,
    subject: "Алгебра",
    topicId: "T1",
    topicName: "Тема 1",
    textbookId: "A",
    textbookName: "Учебник А",
    testId: "TEST1",
    questionId: "Q1",
    isCorrect: true,
    testDate: "2026-01-15",
    ...partial,
  };
}

/**
 * Группа учеников: каждый отвечает на заданные вопросы,
 * доля верных ответов у каждого ученика ровно `rate` (округление по вопросам).
 */
export function group(opts: {
  students: number;
  prefix: string;
  classId?: string;
  textbookId?: string;
  topicId?: string;
  questions: string[];
  rate: number;
  testId?: string;
}): AnswerRecord[] {
  const out: AnswerRecord[] = [];
  const correctCount = Math.round(opts.rate * opts.questions.length);
  for (let s = 0; s < opts.students; s++) {
    opts.questions.forEach((q, i) => {
      // Сдвиг по ученику, чтобы верные ответы приходились на разные задания.
      const isCorrect = (i + s) % opts.questions.length < correctCount;
      out.push(
        rec({
          studentId: `${opts.prefix}${s}`,
          classId: opts.classId ?? "7А",
          textbookId: opts.textbookId ?? "A",
          textbookName: `Учебник ${opts.textbookId ?? "A"}`,
          topicId: opts.topicId ?? "T1",
          topicName: `Тема ${opts.topicId ?? "T1"}`,
          testId: opts.testId ?? "TEST1",
          questionId: q,
          isCorrect,
        }),
      );
    });
  }
  return out;
}

/** Рекурсивно найти NaN/Infinity во вложенной структуре. */
export function findNonFinite(value: unknown, path = "$", seen = new Set<unknown>()): string[] {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (value instanceof Map) return [...value.entries()].flatMap(([k, v]) => findNonFinite(v, `${path}.${String(k)}`, seen));
  if (value instanceof Set) return [...value].flatMap((v, i) => findNonFinite(v, `${path}[${i}]`, seen));
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => findNonFinite(v, `${path}.${k}`, seen));
}
