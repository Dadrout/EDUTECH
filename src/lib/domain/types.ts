/**
 * Доменная модель Data-Driven Curriculum.
 *
 * Единица исходных данных — один ответ ученика на одно задание теста.
 * Все агрегаты (темы, классы, учебники) вычисляются из этих записей.
 */

/** Один ответ ученика на одно задание. */
export interface AnswerRecord {
  studentId: string;
  /** Класс-группа, например «7А». */
  classId: string;
  /** Параллель (номер класса), например 7. */
  grade: number;
  subject: string;
  topicId: string;
  topicName: string;
  textbookId: string;
  textbookName: string;
  testId: string;
  questionId: string;
  isCorrect: boolean;
  /** Дата в формате ISO YYYY-MM-DD. */
  testDate: string;
  /**
   * Проверяемый заданием навык (необязательная колонка skill), например
   * «Приведение к общему знаменателю». null/undefined — навык не указан.
   */
  skill?: string | null;
  /**
   * Категория ошибки для неверного ответа (необязательная колонка error_type).
   * Известные коды — ERROR_TYPES в lib/analytics/skills.ts; иначе — текст из файла.
   * Для верных ответов не используется.
   */
  errorType?: string | null;
}

/** Строка учебного плана: часы на тему в рамках предмета и параллели. */
export interface CurriculumEntry {
  subject: string;
  grade: number;
  topicId: string;
  topicName: string | null;
  currentHours: number;
  minHours: number;
}

export type DatasetSource = "demo" | "upload";

export interface DatasetMeta {
  name: string;
  source: DatasetSource;
  /** Синтетические (демонстрационные) данные, не связанные с реальными учениками. */
  isSynthetic: boolean;
  loadedAt: string;
  resultsFileName: string | null;
  curriculumFileName: string | null;
  /** Строки, исключённые при импорте из-за ошибок (по решению методиста). */
  excludedResultRows: number;
  excludedCurriculumRows: number;
  /** Удалённые точные дубликаты ответов. */
  removedDuplicates: number;
}

export interface Dataset {
  meta: DatasetMeta;
  records: AnswerRecord[];
  curriculum: CurriculumEntry[];
}

/** Уровень освоения по точечной оценке успешности. */
export type MasteryLevel = "high" | "medium" | "low" | "insufficient";

/**
 * Статус сложности темы: учитывает не только точечную оценку,
 * но и доверительный интервал (насколько вывод надёжен).
 */
export type DifficultyStatus =
  | "difficult"
  | "likely_difficult"
  | "attention"
  | "mastered"
  | "insufficient";

/** Глобальные фильтры. null означает «все». */
export interface DataFilters {
  subject: string | null;
  grade: number | null;
  classId: string | null;
  textbookId: string | null;
  topicKey: string | null;
}

export const EMPTY_FILTERS: DataFilters = {
  subject: null,
  grade: null,
  classId: null,
  textbookId: null,
  topicKey: null,
};

const KEY_SEPARATOR = "\u001f";

/**
 * Тема идентифицируется тройкой (предмет, параллель, topic_id):
 * один и тот же код темы в разных параллелях — это разные темы.
 */
export function makeTopicKey(subject: string, grade: number, topicId: string): string {
  return [subject, String(grade), topicId].join(KEY_SEPARATOR);
}

export function parseTopicKey(key: string): { subject: string; grade: number; topicId: string } | null {
  const parts = key.split(KEY_SEPARATOR);
  if (parts.length !== 3) return null;
  const grade = Number(parts[1]);
  if (!Number.isFinite(grade)) return null;
  return { subject: parts[0], grade, topicId: parts[2] };
}

export function topicKeyOf(record: Pick<AnswerRecord, "subject" | "grade" | "topicId">): string {
  return makeTopicKey(record.subject, record.grade, record.topicId);
}

/** Задание идентифицируется парой (тест, задание). */
export function questionKeyOf(record: Pick<AnswerRecord, "testId" | "questionId">): string {
  return record.testId + KEY_SEPARATOR + record.questionId;
}
