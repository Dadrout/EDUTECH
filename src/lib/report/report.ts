/**
 * Аналитический отчёт для методиста (Explainable Intelligence Report).
 *
 * Отчёт — структура данных, собранная ТОЛЬКО из результатов существующего
 * аналитического движка (темы, обзор, выводы, навыки, учебники, часы).
 * Никаких собственных формул и придуманных показателей: каждая цифра отчёта
 * совпадает с тем, что показывают страницы платформы при тех же фильтрах.
 * Текст формирует интерфейс через словари i18n.
 *
 * Типы и сигнатуры используются интерфейсом и экспортом отчёта.
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
import { EMPTY_FILTERS, makeTopicKey } from "@/lib/domain/types";
import { filterRecords, listCourses, naturalCompare } from "@/lib/analytics/filters";
import { buildHoursInputs, planTotal, recommendHours } from "@/lib/analytics/hours";
import { computeInsights } from "@/lib/analytics/insights";
import { computeOverview } from "@/lib/analytics/overview";
import { analyzeSkills } from "@/lib/analytics/skills";
import { isProblemStatus } from "@/lib/analytics/stats";
import { compareTextbooks } from "@/lib/analytics/textbooks";
import { computeTopicStats } from "@/lib/analytics/topics";
import { defaultHoursConfig } from "@/lib/config/analysis-config";
import { summarizeRecords } from "@/lib/data/validate-results";

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
  const records = filterRecords(dataset.records, { ...EMPTY_FILTERS, ...scope }, ["subject", "grade"]);
  const curriculum = dataset.curriculum.filter((entry) =>
    (scope.subject === null || entry.subject === scope.subject) &&
    (scope.grade === null || entry.grade === scope.grade),
  );
  const summary = summarizeRecords(records);
  const topics = computeTopicStats(records, config);
  const overview = computeOverview(records, topics, config);
  const skills = analyzeSkills(records, config);
  const courses = listCourses(records);
  const statusCounts: Record<DifficultyStatus, number> = {
    difficult: 0, likely_difficult: 0, attention: 0, mastered: 0, insufficient: 0,
  };
  for (const topic of topics) statusCounts[topic.status] += 1;

  const textbooks: ReportTextbookCourse[] = [];
  for (const { subject, grade } of courses) {
    const courseRecords = filterRecords(records, { ...EMPTY_FILTERS, subject, grade }, ["subject", "grade"]);
    const names = new Map(courseRecords.map((record) => [record.textbookId, record.textbookName]));
    const ids = [...names.entries()].sort((a, b) => naturalCompare(a[1], b[1])).map(([id]) => id);
    if (ids.length < 2) continue;
    textbooks.push({
      subject,
      grade,
      textbookNames: Object.fromEntries(names),
      result: compareTextbooks({ records: courseRecords, textbookIds: ids, topicKey: null, referenceId: ids[0], config }),
    });
  }

  // A curriculum can be imported before assessments: include those courses too,
  // with the hours engine's explicit no-data rows, rather than hide the plan.
  const plannedCourses = new Map<string, { subject: string; grade: number }>();
  for (const { subject, grade } of curriculum) {
    plannedCourses.set(makeTopicKey(subject, grade, ""), { subject, grade });
  }
  const hours: ReportHoursCourse[] = [];
  for (const { subject, grade } of [...plannedCourses.values()].sort((a, b) => naturalCompare(a.subject, b.subject) || a.grade - b.grade)) {
    const courseTopics = topics.filter((topic) => topic.subject === subject && topic.grade === grade);
    const { inputs, unplanned } = buildHoursInputs(curriculum, courseTopics, subject, grade);
    if (inputs.length === 0) continue;
    hours.push({
      subject,
      grade,
      unplannedTopics: unplanned.length,
      plan: recommendHours(inputs, {
        ...defaultHoursConfig(config),
        budgetHours: planTotal(curriculum, subject, grade),
        mediumPct: config.thresholds.medium,
      }),
    });
  }

  const insufficientTopics = topics.filter((topic) => !topic.sufficient);
  const withoutPlan = courses.filter(({ subject, grade }) => !plannedCourses.has(makeTopicKey(subject, grade, ""))).length;
  const quality: DataQualityItem[] = [];
  const addQuality = (kind: DataQualityKind, count: number) => {
    if (count > 0) quality.push({ kind, count });
  };
  addQuality("synthetic", dataset.meta.isSynthetic ? 1 : 0);
  addQuality("excluded_rows", dataset.meta.excludedResultRows);
  addQuality("duplicates_removed", dataset.meta.removedDuplicates);
  addQuality("insufficient_topics", insufficientTopics.length);
  addQuality(curriculum.length === 0 ? "no_curriculum" : "courses_without_plan", withoutPlan);
  addQuality(skills.coverage.hasSkills ? "partial_skill_data" : "no_skill_data", records.length - skills.coverage.withSkill);
  addQuality("single_class_textbooks", textbooks.reduce((total, course) => total + course.result.groups.filter((group) => group.classes.length === 1).length, 0));

  return {
    generatedAt: now.toISOString(),
    scope: { ...scope },
    sample: {
      datasetName: dataset.meta.name,
      isSynthetic: dataset.meta.isSynthetic,
      students: summary.students,
      classes: summary.classes,
      subjects: summary.subjects,
      topics: summary.topics,
      textbooks: summary.textbooks,
      tests: summary.tests,
      answers: summary.rows,
      dateFrom: summary.dateFrom,
      dateTo: summary.dateTo,
      excludedResultRows: dataset.meta.excludedResultRows,
      removedDuplicates: dataset.meta.removedDuplicates,
      curriculumTopics: curriculum.length,
    },
    performance: { estimate: overview.kpis.estimate, overview, statusCounts },
    problemTopics: topics.filter((topic) => isProblemStatus(topic.status)).sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1)),
    insufficientTopics,
    insights: computeInsights(records, topics, config),
    skills: skills.coverage.hasSkills ? skills : null,
    textbooks,
    hours,
    quality,
  };
}
