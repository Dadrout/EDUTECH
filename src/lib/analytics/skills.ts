/**
 * Анализ ошибок на уровне навыков и заданий (Smart Error Analysis).
 *
 * Чистые расчёты по наблюдаемым ответам. Навыки и категории учитываются
 * только при наличии соответствующих метаданных в исходных данных.
 */
import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord, MasteryLevel } from "@/lib/domain/types";
import { questionKeyOf, topicKeyOf } from "@/lib/domain/types";
import { classifyLevel, isSampleSufficient, type ProportionEstimate } from "./stats";
import { StudentAccumulator } from "./topics";
import { compareTopics, naturalCompare } from "./filters";

/**
 * Известные коды категорий ошибок. Значение error_type из файла сравнивается
 * без учёта регистра; неизвестные значения сохраняются как есть (текст из файла).
 */
export const ERROR_TYPES = ["calculation", "sign", "concept", "procedure", "formula", "units", "reading", "no_answer"] as const;
export type KnownErrorType = (typeof ERROR_TYPES)[number];

export interface ErrorTypeCount {
  /** Код из ERROR_TYPES или исходный текст из файла. */
  errorType: string;
  known: boolean;
  count: number;
  /** Доля среди неверных ответов с указанной категорией (0..1). */
  share: number;
}

/** Строка разбивки навыка по классам или учебникам. */
export interface SkillGroupRow {
  id: string;
  label: string;
  students: number;
  answers: number;
  estimate: ProportionEstimate | null;
  /** Достаточно ли учеников для вывода (порог — config.minStudentsPerCell). */
  sufficient: boolean;
}

/** Descriptive class comparison, available without skill/error metadata. */
export interface ClassErrorStats extends SkillGroupRow {
  classId: string;
  subject: string;
  grade: number;
  correct: number;
  incorrect: number;
  incorrectWithType: number;
  errors: ErrorTypeCount[];
}

/** Статистика одного задания (тест + задание) в пределах темы. */
export interface QuestionStats {
  /** Ключ задания: questionKeyOf (тест + задание). */
  key: string;
  testId: string;
  questionId: string;
  topicKey: string;
  topicName: string;
  subject: string;
  grade: number;
  /** Навык задания (наиболее частое значение в данных) или null. */
  skill: string | null;
  testDate: string | null;
  students: number;
  answers: number;
  correct: number;
  /** correct / answers; null, если ответов нет. */
  rate: number | null;
  incorrect: number;
  /** Неверные ответы с указанной категорией ошибки. */
  incorrectWithType: number;
  /** Категории ошибок по убыванию частоты. */
  errors: ErrorTypeCount[];
}

/** Статистика навыка внутри темы (навык идентифицируется темой + названием). */
export interface SkillStats {
  /** makeSkillKey(topicKey, skill). */
  key: string;
  skill: string;
  topicKey: string;
  topicId: string;
  topicName: string;
  subject: string;
  grade: number;
  students: number;
  answers: number;
  correct: number;
  questions: number;
  rate: number | null;
  /** Кластерная оценка по ученикам (clusteredProportion), как у тем. */
  estimate: ProportionEstimate | null;
  /** Уровень освоения по порогам config; "insufficient", если данных мало. */
  level: MasteryLevel;
  /** students >= minStudentsPerTopic и answers >= minAnswersPerTopic. */
  sufficient: boolean;
  /** Успешность темы целиком (все задания темы в выборке). */
  topicRate: number | null;
  /** rate − topicRate (доли): насколько навык труднее/легче своей темы. */
  deltaFromTopic: number | null;
  incorrect: number;
  incorrectWithType: number;
  errors: ErrorTypeCount[];
}

export interface SkillCoverage {
  answers: number;
  /** Ответы с указанным навыком. */
  withSkill: number;
  incorrect: number;
  /** Неверные ответы с указанной категорией ошибки. */
  incorrectWithType: number;
  /** Есть хотя бы один ответ с навыком. */
  hasSkills: boolean;
  /** Есть хотя бы один неверный ответ с категорией. */
  hasErrorTypes: boolean;
}

export interface SkillAnalysis {
  coverage: SkillCoverage;
  /**
   * Навыки (только при coverage.hasSkills): сначала достаточные по данным,
   * внутри — по возрастанию успешности; затем недостаточные.
   */
  skills: SkillStats[];
  /** Распределение категорий ошибок среди всех неверных ответов с категорией. */
  errorTypes: ErrorTypeCount[];
  /** Все задания выборки по возрастанию успешности (доступно всегда). */
  questions: QuestionStats[];
}

export interface SkillDetail {
  skill: SkillStats;
  byClass: SkillGroupRow[];
  byTextbook: SkillGroupRow[];
  questions: QuestionStats[];
}

export function makeSkillKey(topicKey: string, skill: string): string {
  return `${topicKey}\u001e${skill}`;
}

/** Нормализация категории ошибки: известный код (без учёта регистра) или исходный текст без лишних пробелов. */
export function normalizeErrorType(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const code = trimmed.toLowerCase();
  return isKnownErrorType(code) ? code : trimmed;
}

export function isKnownErrorType(value: string): value is KnownErrorType {
  return (ERROR_TYPES as readonly string[]).includes(value);
}

// При равенстве локализованного сравнения сохраняем полный порядок строк.
const compareNames = (a: string, b: string): number => naturalCompare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

// Накопители обновляются за один проход; ошибки учитываются только для неверных ответов.
class AnswerAccumulator extends StudentAccumulator {
  readonly errors = new Map<string, number>();
  incorrectWithType = 0;

  addRecord(r: AnswerRecord): void {
    this.add(r.studentId, r.isCorrect);
    const error = r.isCorrect ? null : normalizeErrorType(r.errorType);
    if (error !== null) {
      this.incorrectWithType += 1;
      this.errors.set(error, (this.errors.get(error) ?? 0) + 1);
    }
  }

  errorRows(): ErrorTypeCount[] {
    return [...this.errors].map(([errorType, count]) => ({
      errorType, known: isKnownErrorType(errorType), count, share: count / this.incorrectWithType,
    })).sort((a, b) => b.count - a.count || compareNames(a.errorType, b.errorType));
  }
}

/** Keep courses separate even when a class identifier occurs in both. */
export function computeClassErrorStats(records: AnswerRecord[], config: AnalysisConfig): ClassErrorStats[] {
  const courses = new Set<string>();
  const classes = new Map<string, { record: AnswerRecord; acc: AnswerAccumulator }>();
  for (const r of records) {
    courses.add(JSON.stringify([r.subject, r.grade]));
    const key = JSON.stringify([r.subject, r.grade, r.classId]);
    let group = classes.get(key);
    if (!group) {
      group = { record: r, acc: new AnswerAccumulator() };
      classes.set(key, group);
    }
    group.acc.addRecord(r);
  }
  return [...classes].map(([id, { record: r, acc }]) => ({
    id, classId: r.classId, subject: r.subject, grade: r.grade,
    label: courses.size > 1 ? `${r.classId} · ${r.subject} ${r.grade}` : r.classId,
    students: acc.students, answers: acc.total, correct: acc.correct,
    incorrect: acc.total - acc.correct, incorrectWithType: acc.incorrectWithType,
    estimate: acc.estimate(config.confidenceZ), sufficient: acc.students >= config.minStudentsPerCell,
    errors: acc.errorRows(),
  })).sort((a, b) => compareNames(a.subject, b.subject) || a.grade - b.grade || compareNames(a.classId, b.classId));
}

interface QuestionAccumulator {
  record: AnswerRecord;
  acc: AnswerAccumulator;
  skills: Map<string, number>;
  date: string;
}

function addQuestion(map: Map<string, QuestionAccumulator>, r: AnswerRecord, skill: string | null): void {
  // Ключ включает тему: один код задания может встретиться в разных темах.
  const key = JSON.stringify([topicKeyOf(r), questionKeyOf(r)]);
  let q = map.get(key);
  if (!q) {
    q = { record: r, acc: new AnswerAccumulator(), skills: new Map(), date: r.testDate };
    map.set(key, q);
  }
  q.acc.addRecord(r);
  if (skill) q.skills.set(skill, (q.skills.get(skill) ?? 0) + 1);
  if (r.testDate < q.date) q.date = r.testDate;
}

function questionRows(map: Map<string, QuestionAccumulator>): QuestionStats[] {
  return [...map.values()].map(({ record: r, acc, skills, date }) => ({
    key: questionKeyOf(r), testId: r.testId, questionId: r.questionId,
    topicKey: topicKeyOf(r), topicName: r.topicName, subject: r.subject, grade: r.grade,
    skill: [...skills].sort(([a, an], [b, bn]) => bn - an || compareNames(a, b))[0]?.[0] ?? null,
    testDate: date || null, students: acc.students, answers: acc.total, correct: acc.correct,
    rate: acc.total ? acc.correct / acc.total : null,
    incorrect: acc.total - acc.correct, incorrectWithType: acc.incorrectWithType, errors: acc.errorRows(),
  })).sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || compareNames(a.testId, b.testId)
    || compareNames(a.questionId, b.questionId) || compareNames(a.topicKey, b.topicKey));
}

/** Анализ навыков, категорий ошибок и заданий для уже отфильтрованных записей. */
export function analyzeSkills(records: AnswerRecord[], config: AnalysisConfig): SkillAnalysis {
  const total = new AnswerAccumulator();
  const topics = new Map<string, { correct: number; total: number }>();
  const skills = new Map<string, { record: AnswerRecord; skill: string; acc: AnswerAccumulator; questions: Set<string> }>();
  const questions = new Map<string, QuestionAccumulator>();
  let withSkill = 0;
  for (const r of records) {
    total.addRecord(r);
    const topicKey = topicKeyOf(r);
    let topic = topics.get(topicKey);
    if (!topic) {
      topic = { correct: 0, total: 0 };
      topics.set(topicKey, topic);
    }
    topic.total += 1;
    topic.correct += Number(r.isCorrect);
    const skill = r.skill?.trim() || null;
    addQuestion(questions, r, skill);
    if (!skill) continue;
    withSkill += 1;
    const key = makeSkillKey(topicKey, skill);
    let entry = skills.get(key);
    if (!entry) {
      entry = { record: r, skill, acc: new AnswerAccumulator(), questions: new Set() };
      skills.set(key, entry);
    }
    entry.acc.addRecord(r);
    entry.questions.add(questionKeyOf(r));
  }
  const rows: SkillStats[] = [...skills].map(([key, { record: r, skill, acc, questions }]) => {
    const topicKey = topicKeyOf(r);
    const topic = topics.get(topicKey)!;
    const topicRate = topic.correct / topic.total;
    const estimate = acc.estimate(config.confidenceZ);
    const rate = estimate?.rate ?? null;
    const sufficient = isSampleSufficient({ students: acc.students, answers: acc.total }, config);
    return {
      key, skill, topicKey, topicId: r.topicId, topicName: r.topicName, subject: r.subject, grade: r.grade,
      students: acc.students, answers: acc.total, correct: acc.correct, questions: questions.size,
      rate, estimate, sufficient, level: sufficient ? classifyLevel(rate, config.thresholds) : "insufficient",
      topicRate, deltaFromTopic: rate === null ? null : rate - topicRate,
      incorrect: acc.total - acc.correct, incorrectWithType: acc.incorrectWithType, errors: acc.errorRows(),
    };
  });
  rows.sort((a, b) => Number(b.sufficient) - Number(a.sufficient) || (a.rate ?? 2) - (b.rate ?? 2)
    || compareTopics(a, b) || compareNames(a.topicKey, b.topicKey) || compareNames(a.skill, b.skill));
  return {
    coverage: { answers: total.total, withSkill, incorrect: total.total - total.correct,
      incorrectWithType: total.incorrectWithType, hasSkills: withSkill > 0, hasErrorTypes: total.incorrectWithType > 0 },
    skills: rows, errorTypes: total.errorRows(), questions: questionRows(questions),
  };
}

/** Детализация навыка: классы, учебники, задания. null — если навыка нет в записях. */
export function computeSkillDetail(records: AnswerRecord[], skillKey: string, config: AnalysisConfig): SkillDetail | null {
  const skill = analyzeSkills(records, config).skills.find((s) => s.key === skillKey);
  if (!skill) return null;
  const classes = new Map<string, { label: string; acc: StudentAccumulator }>();
  const textbooks = new Map<string, { label: string; acc: StudentAccumulator }>();
  const questions = new Map<string, QuestionAccumulator>();
  for (const r of records) {
    if (topicKeyOf(r) !== skill.topicKey || r.skill?.trim() !== skill.skill) continue;
    for (const [map, id, label] of [[classes, r.classId, r.classId], [textbooks, r.textbookId, r.textbookName]] as const) {
      let entry = map.get(id);
      if (!entry) {
        entry = { label, acc: new StudentAccumulator() };
        map.set(id, entry);
      }
      entry.acc.add(r.studentId, r.isCorrect);
    }
    addQuestion(questions, r, skill.skill);
  }
  const groupRows = (map: typeof classes, min: number): SkillGroupRow[] => [...map].map(([id, { label, acc }]) => ({
    id, label, students: acc.students, answers: acc.total, estimate: acc.estimate(config.confidenceZ), sufficient: acc.students >= min,
  })).sort((a, b) => naturalCompare(a.label, b.label) || naturalCompare(a.id, b.id));
  return { skill, byClass: groupRows(classes, config.minStudentsPerCell),
    byTextbook: groupRows(textbooks, config.minStudentsPerGroup), questions: questionRows(questions) };
}
