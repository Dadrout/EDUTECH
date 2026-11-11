/**
 * Анализ ошибок на уровне навыков и заданий (Smart Error Analysis).
 *
 * КОНТРАКТ: типы и сигнатуры зафиксированы — на них опирается интерфейс.
 * Реализация — задача Codex (см. docs/tasks/codex-1-skills.md).
 */
import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord, MasteryLevel } from "@/lib/domain/types";
import type { ProportionEstimate } from "./stats";

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
  void value;
  throw new Error("normalizeErrorType: not implemented");
}

export function isKnownErrorType(value: string): value is KnownErrorType {
  return (ERROR_TYPES as readonly string[]).includes(value);
}

/** Анализ навыков, категорий ошибок и заданий для уже отфильтрованных записей. */
export function analyzeSkills(records: AnswerRecord[], config: AnalysisConfig): SkillAnalysis {
  void records;
  void config;
  throw new Error("analyzeSkills: not implemented");
}

/** Детализация навыка: классы, учебники, задания. null — если навыка нет в записях. */
export function computeSkillDetail(records: AnswerRecord[], skillKey: string, config: AnalysisConfig): SkillDetail | null {
  void records;
  void skillKey;
  void config;
  throw new Error("computeSkillDetail: not implemented");
}
