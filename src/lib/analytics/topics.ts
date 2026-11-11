import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord, DifficultyStatus, MasteryLevel } from "@/lib/domain/types";
import { questionKeyOf, topicKeyOf } from "@/lib/domain/types";
import { i18n } from "@/i18n/core";
import { compareTopics, naturalCompare } from "./filters";
import {
  classifyDifficulty,
  classifyLevel,
  clusteredProportion,
  isSampleSufficient,
  type ClusterCount,
  type ProportionEstimate,
} from "./stats";

export interface TopicStats {
  key: string;
  subject: string;
  grade: number;
  topicId: string;
  topicName: string;
  students: number;
  answers: number;
  correct: number;
  /** Число различных заданий (тест + задание). */
  questions: number;
  tests: number;
  classes: number;
  estimate: ProportionEstimate | null;
  /** Доля правильных ответов (0..1) или null при отсутствии ответов. */
  rate: number | null;
  level: MasteryLevel;
  status: DifficultyStatus;
  sufficient: boolean;
  /** Пояснение, почему выборки недостаточно. */
  sampleNote: string | null;
}

/** Накопитель «ученик → (верных, всего)» — основа кластерной оценки. */
export class StudentAccumulator {
  private readonly byStudent = new Map<string, ClusterCount>();
  correct = 0;
  total = 0;

  add(studentId: string, isCorrect: boolean): void {
    let c = this.byStudent.get(studentId);
    if (!c) {
      c = { correct: 0, total: 0 };
      this.byStudent.set(studentId, c);
    }
    c.total += 1;
    this.total += 1;
    if (isCorrect) {
      c.correct += 1;
      this.correct += 1;
    }
  }

  get students(): number {
    return this.byStudent.size;
  }

  clusters(): ClusterCount[] {
    return [...this.byStudent.values()];
  }

  studentRates(): Map<string, ClusterCount> {
    return this.byStudent;
  }

  estimate(z: number): ProportionEstimate | null {
    return clusteredProportion(this.clusters(), z);
  }
}

export function describeSample(students: number, answers: number, config: AnalysisConfig): string | null {
  const { t, m } = i18n();
  const parts: string[] = [];
  if (students < config.minStudentsPerTopic) parts.push(t(m.topics.sampleStudents, { n: students, min: config.minStudentsPerTopic }));
  if (answers < config.minAnswersPerTopic) parts.push(t(m.topics.sampleAnswers, { n: answers, min: config.minAnswersPerTopic }));
  return parts.length ? t(m.topics.sampleNote, { parts: parts.join(m.common.listSep) }) : null;
}

interface TopicAccumulator {
  subject: string;
  grade: number;
  topicId: string;
  topicName: string;
  acc: StudentAccumulator;
  questions: Set<string>;
  tests: Set<string>;
  classes: Set<string>;
}

/** Статистика по каждой теме в переданном наборе ответов. */
export function computeTopicStats(records: AnswerRecord[], config: AnalysisConfig): TopicStats[] {
  const byTopic = new Map<string, TopicAccumulator>();
  for (const r of records) {
    const key = topicKeyOf(r);
    let t = byTopic.get(key);
    if (!t) {
      t = {
        subject: r.subject,
        grade: r.grade,
        topicId: r.topicId,
        topicName: r.topicName,
        acc: new StudentAccumulator(),
        questions: new Set(),
        tests: new Set(),
        classes: new Set(),
      };
      byTopic.set(key, t);
    }
    t.acc.add(r.studentId, r.isCorrect);
    t.questions.add(questionKeyOf(r));
    t.tests.add(r.testId);
    t.classes.add(r.classId);
  }

  const result: TopicStats[] = [];
  for (const [key, t] of byTopic) {
    const estimate = t.acc.estimate(config.confidenceZ);
    const sample = { students: t.acc.students, answers: t.acc.total };
    const sufficient = isSampleSufficient(sample, config);
    result.push({
      key,
      subject: t.subject,
      grade: t.grade,
      topicId: t.topicId,
      topicName: t.topicName,
      students: sample.students,
      answers: sample.answers,
      correct: t.acc.correct,
      questions: t.questions.size,
      tests: t.tests.size,
      classes: t.classes.size,
      estimate,
      rate: estimate?.rate ?? null,
      level: sufficient ? classifyLevel(estimate?.rate ?? null, config.thresholds) : "insufficient",
      status: classifyDifficulty(estimate, sufficient, config.thresholds),
      sufficient,
      sampleNote: describeSample(sample.students, sample.answers, config),
    });
  }
  return result.sort(compareTopics);
}

export interface BreakdownRow {
  id: string;
  label: string;
  students: number;
  answers: number;
  estimate: ProportionEstimate | null;
  sufficient: boolean;
}

export interface QuestionRow {
  testId: string;
  questionId: string;
  answers: number;
  rate: number | null;
  testDate: string;
}

export interface TopicDetail {
  byClass: BreakdownRow[];
  byTextbook: BreakdownRow[];
  byTest: BreakdownRow[];
  questions: QuestionRow[];
}

/** Детализация темы: классы, учебники, тесты и отдельные задания. */
export function computeTopicDetail(records: AnswerRecord[], topicKey: string, config: AnalysisConfig): TopicDetail {
  const byClass = new Map<string, { label: string; acc: StudentAccumulator }>();
  const byTextbook = new Map<string, { label: string; acc: StudentAccumulator }>();
  const byTest = new Map<string, { label: string; acc: StudentAccumulator }>();
  const questions = new Map<string, { testId: string; questionId: string; correct: number; total: number; date: string }>();

  const push = (map: Map<string, { label: string; acc: StudentAccumulator }>, id: string, label: string, r: AnswerRecord) => {
    let entry = map.get(id);
    if (!entry) {
      entry = { label, acc: new StudentAccumulator() };
      map.set(id, entry);
    }
    entry.acc.add(r.studentId, r.isCorrect);
  };

  for (const r of records) {
    if (topicKeyOf(r) !== topicKey) continue;
    push(byClass, r.classId, r.classId, r);
    push(byTextbook, r.textbookId, r.textbookName, r);
    push(byTest, r.testId, r.testId, r);
    const qk = questionKeyOf(r);
    let q = questions.get(qk);
    if (!q) {
      q = { testId: r.testId, questionId: r.questionId, correct: 0, total: 0, date: r.testDate };
      questions.set(qk, q);
    }
    q.total += 1;
    if (r.isCorrect) q.correct += 1;
    if (r.testDate < q.date) q.date = r.testDate;
  }

  const toRows = (map: Map<string, { label: string; acc: StudentAccumulator }>, minStudents: number): BreakdownRow[] =>
    [...map.entries()]
      .map(([id, { label, acc }]) => ({
        id,
        label,
        students: acc.students,
        answers: acc.total,
        estimate: acc.estimate(config.confidenceZ),
        sufficient: acc.students >= minStudents,
      }))
      .sort((a, b) => naturalCompare(a.label, b.label));

  return {
    byClass: toRows(byClass, config.minStudentsPerCell),
    byTextbook: toRows(byTextbook, config.minStudentsPerGroup),
    byTest: toRows(byTest, config.minStudentsPerCell),
    questions: [...questions.values()]
      .map((q) => ({
        testId: q.testId,
        questionId: q.questionId,
        answers: q.total,
        rate: q.total > 0 ? q.correct / q.total : null,
        testDate: q.date,
      }))
      .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2)),
  };
}
