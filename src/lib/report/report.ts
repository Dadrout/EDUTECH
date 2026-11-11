/**
 * Аналитический отчёт для методиста (Explainable Intelligence Report).
 *
 * Отчёт — структура данных, собранная ТОЛЬКО из результатов существующего
 * аналитического движка (темы, обзор, выводы, навыки, учебники, часы).
 * Никаких собственных формул и придуманных показателей: каждая цифра отчёта
 * совпадает с тем, что показывают страницы платформы при тех же фильтрах.
 * Текст формирует интерфейс через словари i18n.
 *
 * КОНТРАКТ: типы и сигнатуры зафиксированы — на них опирается интерфейс.
 * Реализация — задача Codex (см. docs/tasks/codex-3-report.md).
 */
import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { Dataset, DifficultyStatus } from "@/lib/domain/types";
import type { HoursResult } from "@/lib/analytics/hours";
import type { Insight } from "@/lib/analytics/insights";
import type { Overview } from "@/lib/analytics/overview";
import type { SkillAnalysis } from "@/lib/analytics/skills";
import type { ProportionEstimate } from "@/lib/analytics/stats";
import type { TextbookComparisonResult } from "@/lib/analytics/textbooks";
import type { TopicStats } from "@/lib/analytics/topics";

export interface ReportScope {
  /** null — все предметы / параллели. */
  subject: string | null;
  grade: number | null;
}

export interface ReportSample {
  datasetName: string;
  isSynthetic: boolean;
  students: number;
  classes: number;
  subjects: number;
  topics: number;
  textbooks: number;
  tests: number;
  answers: number;
  dateFrom: string | null;
  dateTo: string | null;
  /** Из метаданных набора: строки, исключённые при импорте, и удалённые дубликаты. */
  excludedResultRows: number;
  removedDuplicates: number;
  /** Темы учебного плана в выбранной области. */
  curriculumTopics: number;
}

export interface ReportPerformance {
  /** Средняя успешность по всем ответам области с 95% ДИ (как KPI обзора). */
  estimate: ProportionEstimate | null;
  overview: Overview;
  statusCounts: Record<DifficultyStatus, number>;
}

export interface ReportTextbookCourse {
  subject: string;
  grade: number;
  /** Сравнение всех учебников курса; базовый — первый по названию (как на странице). */
  result: TextbookComparisonResult;
  /** Названия учебников по id — для текста отчёта. */
  textbookNames: Record<string, string>;
}

export interface ReportHoursCourse {
  subject: string;
  grade: number;
  /** Рекомендация с параметрами по умолчанию (defaultHoursConfig), бюджет = текущая сумма плана. */
  plan: HoursResult;
  /** Темы с результатами тестирования, отсутствующие в учебном плане. */
  unplannedTopics: number;
}

export type DataQualityKind =
  | "synthetic"
  | "excluded_rows"
  | "duplicates_removed"
  | "insufficient_topics"
  | "no_curriculum"
  | "courses_without_plan"
  | "no_skill_data"
  | "partial_skill_data"
  | "single_class_textbooks";

export interface DataQualityItem {
  kind: DataQualityKind;
  /** Количество затронутых строк / тем / курсов / учебников (по смыслу kind). */
  count: number;
}

export interface Report {
  /** ISO-время формирования. */
  generatedAt: string;
  scope: ReportScope;
  sample: ReportSample;
  performance: ReportPerformance;
  /** Темы со статусом difficult и likely_difficult, по возрастанию успешности. */
  problemTopics: TopicStats[];
  /** Темы без достаточного объёма данных. */
  insufficientTopics: TopicStats[];
  /** Выводы обзора (computeInsights) для той же области. */
  insights: Insight[];
  /** Анализ навыков; null, если в данных нет навыков. */
  skills: SkillAnalysis | null;
  /** Курсы, где используется не менее двух учебников. */
  textbooks: ReportTextbookCourse[];
  /** Курсы, для которых есть учебный план. */
  hours: ReportHoursCourse[];
  quality: DataQualityItem[];
}

/**
 * Собрать отчёт для области scope (предмет / параллель; остальные фильтры не применяются,
 * чтобы отчёт описывал полную выборку курса). now — для детерминированных тестов.
 */
export function buildReport(dataset: Dataset, scope: ReportScope, config: AnalysisConfig, now: Date = new Date()): Report {
  void dataset;
  void scope;
  void config;
  void now;
  throw new Error("buildReport: not implemented");
}
