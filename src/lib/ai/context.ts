/**
 * Аналитический контекст для AI: только обезличенные агрегаты из проверенного
 * движка (темы, навыки, учебники, часы). Чистая функция — работает в браузере;
 * на сервер уходит только результат после явного действия пользователя.
 *
 * Приватность:
 * - идентификаторы учеников и отдельные ответы не попадают в контекст никогда;
 * - группы меньше MIN_GROUP_STUDENTS учеников не передаются (подавление малых ячеек);
 * - подписи (темы, навыки, учебники) — недоверенный текст: очищаются и обрезаются.
 */
import { filterRecords, listCourses, naturalCompare } from "@/lib/analytics/filters";
import { computeHeatmap } from "@/lib/analytics/heatmap";
import { analyzeSkills } from "@/lib/analytics/skills";
import { computeTopicStats, type TopicStats } from "@/lib/analytics/topics";
import type { AnalysisConfig } from "@/lib/config/analysis-config";
import { EMPTY_FILTERS, type DataFilters, type Dataset } from "@/lib/domain/types";
import { buildReport } from "@/lib/report/report";

export const MIN_GROUP_STUDENTS = 10;
export const MAX_EVIDENCE = 30;
const LABEL_MAX = 80;

export const AI_PAGES = ["overview", "topics", "skills", "textbooks", "hours", "simulator", "reports", "other"] as const;
export type AiPage = (typeof AI_PAGES)[number];

export const EVIDENCE_KINDS = ["overview", "topic", "class_topic", "skill", "error", "textbook", "hours_plan", "hours_topic"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const LIMITATION_CODES = [
  "synthetic_data",
  "observational_not_causal",
  "hours_heuristic_no_forecast",
  "small_groups_suppressed",
  "insufficient_topics",
  "no_skill_data",
  "no_error_data",
  "partial_skill_data",
  "no_curriculum",
  "single_class_textbooks",
  "evidence_truncated",
] as const;
export type LimitationCode = (typeof LIMITATION_CODES)[number];

export type MetricValue = number | string | boolean | null;

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  /** Тема, навык, «класс · тема», «учебник A / учебник B» — из данных, недоверенный текст. */
  label: string;
  /** Курс, например «Алгебра · 7». */
  course?: string;
  /** Проценты — в единицах процента (41.5), разницы — в процентных пунктах. */
  metrics: Record<string, MetricValue>;
}

export interface AiContext {
  version: 1;
  /** synthetic — демонстрационные данные; uploaded — загруженные методистом (по умолчанию AI для них выключен). */
  source: "synthetic" | "uploaded";
  page: AiPage;
  scope: { subject: string | null; grade: number | null; classId: string | null; textbook: string | null; topic: string | null };
  thresholds: { highPct: number; mediumPct: number };
  evidence: EvidenceItem[];
  limitations: LimitationCode[];
}

/** Очистка недоверенной подписи: без управляющих символов и разметки, ограниченная длина. */
export function sanitizeLabel(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f<>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_MAX);
}

const pct = (rate: number | null | undefined): number | null => (rate == null || !Number.isFinite(rate) ? null : Math.round(rate * 1000) / 10);
const round2 = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const courseLabel = (subject: string, grade: number) => sanitizeLabel(`${subject} · ${grade}`);

/** Порядок разделов и лимиты для каждой страницы: контекст фокусируется на текущей задаче. */
const FOCUS: Record<AiPage, Partial<Record<EvidenceKind, number>>> = {
  overview: { overview: 1, topic: 10, skill: 6, class_topic: 5, textbook: 4, hours_plan: 2, hours_topic: 6, error: 4 },
  topics: { overview: 1, topic: 14, class_topic: 8, skill: 8, error: 4 },
  skills: { overview: 1, skill: 14, error: 8, topic: 8, class_topic: 4 },
  textbooks: { overview: 1, textbook: 10, topic: 8, class_topic: 4 },
  hours: { overview: 1, hours_plan: 3, hours_topic: 16, topic: 8 },
  simulator: { overview: 1, hours_plan: 3, hours_topic: 16, topic: 8 },
  reports: { overview: 1, topic: 8, skill: 6, error: 4, class_topic: 4, textbook: 6, hours_plan: 3, hours_topic: 6 },
  other: { overview: 1, topic: 10, skill: 6, class_topic: 4, textbook: 4, hours_plan: 2, hours_topic: 6, error: 4 },
};

export interface BuildAiContextInput {
  dataset: Dataset;
  filters: DataFilters;
  config: AnalysisConfig;
  page: AiPage;
}

export function buildAiContext({ dataset, filters, config, page }: BuildAiContextInput): AiContext {
  const limitations = new Set<LimitationCode>(["observational_not_causal"]);
  if (dataset.meta.isSynthetic) limitations.add("synthetic_data");
  let suppressed = false;

  const scopeFilters: DataFilters = { ...EMPTY_FILTERS, subject: filters.subject, grade: filters.grade };
  // Темы и навыки — с учётом всех фильтров (класс, учебник, тема), сравнения — по курсу целиком.
  const records = filterRecords(dataset.records, filters);
  const courseRecords = filterRecords(dataset.records, scopeFilters, ["subject", "grade"]);
  const report = buildReport(dataset, { subject: filters.subject, grade: filters.grade }, config);
  const topics = computeTopicStats(records, config);
  const skills = analyzeSkills(records, config);

  const buckets: Record<EvidenceKind, Omit<EvidenceItem, "id">[]> = {
    overview: [], topic: [], class_topic: [], skill: [], error: [], textbook: [], hours_plan: [], hours_topic: [],
  };

  // Общая картина.
  const overallStudents = new Set(records.map((r) => r.studentId)).size;
  if (records.length > 0 && overallStudents >= MIN_GROUP_STUDENTS) {
    const estimate = topicsEstimate(topics);
    buckets.overview.push({
      kind: "overview",
      label: "selection",
      metrics: {
        students: overallStudents,
        answers: records.length,
        topics: topics.length,
        average_pct: estimate ?? pct(report.performance.estimate?.rate),
        problem_topics: topics.filter((t) => t.status === "difficult" || t.status === "likely_difficult").length,
        insufficient_topics: topics.filter((t) => !t.sufficient).length,
      },
    });
  }

  // Темы: сначала проблемные (по возрастанию успешности), затем лучшие для контраста.
  const reliable = topics.filter((t) => t.sufficient && t.students >= MIN_GROUP_STUDENTS && t.rate !== null);
  if (topics.some((t) => !t.sufficient)) limitations.add("insufficient_topics");
  if (topics.some((t) => t.students < MIN_GROUP_STUDENTS)) suppressed = true;
  const byRate = [...reliable].sort((a, b) => (a.rate as number) - (b.rate as number));
  const ordered = [...byRate.slice(0, 12), ...byRate.slice(12).reverse().slice(0, 2)];
  for (const t of ordered) buckets.topic.push(topicItem(t));

  // Классы, заметно отстающие от параллели по теме (или выбранный класс).
  for (const course of listCourses(courseRecords)) {
    const heat = computeHeatmap(filterRecords(courseRecords, { ...EMPTY_FILTERS, subject: course.subject, grade: course.grade }, ["subject", "grade"]), config);
    heat.cells.forEach((row) =>
      row.forEach((cell, ci) => {
        if (!cell || cell.rate === null || cell.deltaFromTopic === null) return;
        if (cell.students < MIN_GROUP_STUDENTS) return void (suppressed = true);
        const selectedClass = filters.classId !== null && cell.classId === filters.classId;
        if (!selectedClass && cell.deltaFromTopic > -0.1) return;
        const column = heat.columns[ci];
        buckets.class_topic.push({
          kind: "class_topic",
          label: sanitizeLabel(`${cell.classId} · ${column.topicName}`),
          course: courseLabel(course.subject, course.grade),
          metrics: { class: sanitizeLabel(cell.classId), rate_pct: pct(cell.rate), grade_topic_rate_pct: pct(column.rate), delta_pp: round1(cell.deltaFromTopic * 100), students: cell.students },
        });
      }),
    );
  }
  buckets.class_topic.sort((a, b) => Number(a.metrics.delta_pp) - Number(b.metrics.delta_pp));

  // Навыки и категории ошибок — только если они есть в данных (ничего не придумываем).
  if (!skills.coverage.hasSkills) limitations.add("no_skill_data");
  else if (skills.coverage.withSkill < skills.coverage.answers) limitations.add("partial_skill_data");
  if (!skills.coverage.hasErrorTypes) limitations.add("no_error_data");
  for (const s of skills.skills) {
    if (!s.sufficient || s.students < MIN_GROUP_STUDENTS) {
      if (s.students < MIN_GROUP_STUDENTS) suppressed = true;
      continue;
    }
    const top = s.errors[0];
    buckets.skill.push({
      kind: "skill",
      label: sanitizeLabel(s.skill),
      course: courseLabel(s.subject, s.grade),
      metrics: {
        topic: sanitizeLabel(s.topicName),
        rate_pct: pct(s.rate),
        topic_rate_pct: pct(s.topicRate),
        delta_pp: s.deltaFromTopic === null ? null : round1(s.deltaFromTopic * 100),
        students: s.students,
        answers: s.answers,
        top_error: top ? sanitizeLabel(top.errorType) : null,
        top_error_share_pct: top ? pct(top.share) : null,
      },
    });
  }
  for (const e of skills.errorTypes) {
    buckets.error.push({ kind: "error", label: sanitizeLabel(e.errorType), metrics: { known_category: e.known, incorrect_answers: e.count, share_pct: pct(e.share) } });
  }

  // Сравнение учебников — вердикты движка с интервалами; без «лучшего учебника».
  for (const c of report.textbooks) {
    for (const v of c.result.verdicts) {
      const a = c.result.groups.find((g) => g.textbookId === v.textbookId);
      const b = c.result.groups.find((g) => g.textbookId === v.referenceId);
      if (!a || !b) continue;
      if (a.comparableStudents < MIN_GROUP_STUDENTS || b.comparableStudents < MIN_GROUP_STUDENTS) {
        suppressed = true;
        continue;
      }
      if (a.classes.length < 2 || b.classes.length < 2) limitations.add("single_class_textbooks");
      buckets.textbook.push({
        kind: "textbook",
        label: sanitizeLabel(`${c.textbookNames[v.textbookId] ?? v.textbookId} / ${c.textbookNames[v.referenceId] ?? v.referenceId}`),
        course: courseLabel(c.subject, c.grade),
        metrics: {
          verdict: v.level,
          diff_pp: v.diff ? round1(v.diff.diff * 100) : null,
          ci_low_pp: v.diff ? round1(v.diff.ciLow * 100) : null,
          ci_high_pp: v.diff ? round1(v.diff.ciHigh * 100) : null,
          significant: v.diff ? v.diff.significant : null,
          students_a: a.comparableStudents,
          students_b: b.comparableStudents,
          classes_a: a.classes.length,
          classes_b: b.classes.length,
          comparable_topics: c.result.comparableTopicCount,
        },
      });
    }
  }

  // Учебные часы — рекомендация движка с параметрами по умолчанию (как на странице).
  if (report.hours.length === 0 && courseRecords.length > 0) limitations.add("no_curriculum");
  for (const c of report.hours) {
    const plan = c.plan;
    if (!plan.ok) {
      buckets.hours_plan.push({ kind: "hours_plan", label: "plan_conflict", course: courseLabel(c.subject, c.grade), metrics: { ok: false, conflict: plan.kind } });
      continue;
    }
    limitations.add("hours_heuristic_no_forecast");
    buckets.hours_plan.push({
      kind: "hours_plan",
      label: "plan",
      course: courseLabel(c.subject, c.grade),
      metrics: {
        ok: true,
        budget_h: plan.budgetHours,
        current_total_h: plan.currentTotal,
        recommended_total_h: plan.recommendedTotal,
        reserve_h: plan.reserveHours,
        moved_h: plan.movedHours,
        changed_topics: plan.rows.filter((r) => r.changeHours !== 0).length,
        target_pct: config.thresholds.high,
      },
    });
    const rows = [...plan.rows].sort((a, b) => Math.abs(b.changeHours) - Math.abs(a.changeHours) || naturalCompare(a.topicName, b.topicName));
    for (const r of rows) {
      if (r.changeHours === 0 && page !== "hours" && page !== "simulator") continue;
      buckets.hours_topic.push({
        kind: "hours_topic",
        label: sanitizeLabel(r.topicName),
        course: courseLabel(c.subject, c.grade),
        metrics: {
          rate_pct: pct(r.rate),
          sufficient: r.sufficient,
          current_h: r.currentHours,
          recommended_h: r.recommendedHours,
          min_h: r.minHours,
          change_h: r.changeHours,
          role: r.role,
          priority: round2(r.priority),
        },
      });
    }
  }

  if (suppressed) limitations.add("small_groups_suppressed");

  // Сборка по фокусу страницы, с общим лимитом.
  const evidence: EvidenceItem[] = [];
  let truncated = false;
  for (const [kind, cap] of Object.entries(FOCUS[page]) as [EvidenceKind, number][]) {
    const items = buckets[kind];
    if (items.length > cap) truncated = true;
    for (const item of items.slice(0, cap)) {
      if (evidence.length >= MAX_EVIDENCE) {
        truncated = true;
        break;
      }
      evidence.push({ ...item, id: `e${evidence.length + 1}` });
    }
  }
  if (truncated) limitations.add("evidence_truncated");

  return {
    version: 1,
    source: dataset.meta.isSynthetic ? "synthetic" : "uploaded",
    page,
    scope: {
      subject: filters.subject === null ? null : sanitizeLabel(filters.subject),
      grade: filters.grade,
      classId: filters.classId === null ? null : sanitizeLabel(filters.classId),
      textbook: filters.textbookId === null ? null : sanitizeLabel(records.find((r) => r.textbookId === filters.textbookId)?.textbookName ?? filters.textbookId),
      topic: filters.topicKey === null ? null : sanitizeLabel(topics.find((t) => t.key === filters.topicKey)?.topicName ?? ""),
    },
    thresholds: { highPct: config.thresholds.high, mediumPct: config.thresholds.medium },
    evidence,
    limitations: LIMITATION_CODES.filter((code) => limitations.has(code)),
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function topicsEstimate(topics: TopicStats[]): number | null {
  let correct = 0;
  let answers = 0;
  for (const t of topics) {
    if (t.rate === null) continue;
    correct += t.rate * t.answers;
    answers += t.answers;
  }
  return answers > 0 ? pct(correct / answers) : null;
}

function topicItem(t: TopicStats): Omit<EvidenceItem, "id"> {
  return {
    kind: "topic",
    label: sanitizeLabel(t.topicName),
    course: courseLabel(t.subject, t.grade),
    metrics: {
      rate_pct: pct(t.rate),
      ci_low_pct: pct(t.estimate?.ciLow),
      ci_high_pct: pct(t.estimate?.ciHigh),
      students: t.students,
      answers: t.answers,
      status: t.status,
    },
  };
}
