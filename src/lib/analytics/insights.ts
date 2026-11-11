import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord } from "@/lib/domain/types";
import { i18n } from "@/i18n/core";
import { formatCi, formatPct, formatPercentValue, formatPp, formatPpAbs, quote, shortTextbookName } from "@/lib/format";
import { listCourses, naturalCompare } from "./filters";
import { computeHeatmap } from "./heatmap";
import { isProblemStatus } from "./stats";
import { compareTextbooks } from "./textbooks";
import type { TopicStats } from "./topics";

export type InsightSeverity = "critical" | "warning" | "info";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  href: string;
  /** Предмет и параллель, к которым относится вывод (для перехода с фильтром). */
  scope?: { subject: string; grade: number; topicKey?: string };
}

/** Отставание класса от параллели по теме, начиная с которого оно попадает в список проблем. */
export const CLASS_GAP_THRESHOLD = 0.15;

const courseLabel = (subject: string, grade: number) => i18n().t(i18n().m.units.course, { subject, grade });

/** «A, B, C» или «A, B, C и другие». */
function listText(items: string[], more: boolean): string {
  const { t, m } = i18n();
  const list = items.join(m.common.listSep);
  return more ? t(m.common.andOthers, { list }) : list;
}

/**
 * Основные выявленные проблемы — детерминированные правила поверх статистики.
 * Никакой генерации текста моделью: каждый вывод воспроизводим.
 */
export function computeInsights(records: AnswerRecord[], topicStats: TopicStats[], config: AnalysisConfig): Insight[] {
  const insights: Insight[] = [];
  const { t, m, plural } = i18n();
  const threshold = formatPercentValue(config.thresholds.medium);

  // 1. Темы с низким уровнем освоения.
  const problems = topicStats
    .filter((x) => isProblemStatus(x.status) && x.rate !== null)
    .sort((a, b) => (a.rate as number) - (b.rate as number));
  const tr = t;
  for (const topic of problems.slice(0, 3)) {
    const confirmed = topic.status === "difficult";
    insights.push({
      id: `topic-${topic.key}`,
      severity: confirmed ? "critical" : "warning",
      title: tr(m.insights.topicLowTitle, { topic: quote(topic.topicName), rate: formatPct(topic.rate) }),
      detail: tr(m.insights.topicLowDetail, {
        course: courseLabel(topic.subject, topic.grade),
        students: topic.students,
        ci: formatCi(topic.estimate?.ciLow, topic.estimate?.ciHigh),
        verdict: tr(confirmed ? m.insights.reliable : m.insights.likely, { threshold }),
      }),
      href: "/topics",
      scope: { subject: topic.subject, grade: topic.grade, topicKey: topic.key },
    });
  }
  if (problems.length > 3) {
    insights.push({
      id: "topics-more",
      severity: "warning",
      title: plural(m.insights.moreTitle, problems.length - 3),
      detail: t(m.common.sentence, {
        text: listText(
          problems.slice(3, 6).map((p) => t(m.insights.topicWithRate, { topic: quote(p.topicName), rate: formatPct(p.rate, 0) })),
          problems.length > 6,
        ),
      }),
      href: "/topics",
    });
  }

  // 2. Классы, заметно отстающие от своей параллели по теме.
  const gaps: { classId: string; topicName: string; delta: number; rate: number; avg: number; subject: string; grade: number; topicKey: string }[] = [];
  const courses = listCourses(records);
  const byCourse = new Map<string, AnswerRecord[]>();
  for (const r of records) {
    const k = `${r.subject}\u001f${r.grade}`;
    let list = byCourse.get(k);
    if (!list) {
      list = [];
      byCourse.set(k, list);
    }
    list.push(r);
  }
  for (const course of courses) {
    const courseRecords = byCourse.get(`${course.subject}\u001f${course.grade}`) ?? [];
    const heatmap = computeHeatmap(courseRecords, config);
    if (heatmap.rows.length < 2) continue;
    heatmap.cells.forEach((row) =>
      row.forEach((cell, ci) => {
        if (!cell || !cell.sufficient || cell.deltaFromTopic === null || cell.rate === null) return;
        const col = heatmap.columns[ci];
        if (cell.deltaFromTopic <= -CLASS_GAP_THRESHOLD && col.rate !== null) {
          gaps.push({
            classId: cell.classId,
            topicName: col.topicName,
            delta: cell.deltaFromTopic,
            rate: cell.rate,
            avg: col.rate,
            subject: course.subject,
            grade: course.grade,
            topicKey: col.key,
          });
        }
      }),
    );
  }
  gaps.sort((a, b) => a.delta - b.delta);
  for (const g of gaps.slice(0, 2)) {
    insights.push({
      id: `gap-${g.classId}-${g.topicKey}`,
      severity: "warning",
      title: t(m.insights.classGapTitle, { classId: g.classId, topic: quote(g.topicName), pp: formatPpAbs(g.delta, 0) }),
      detail: t(m.insights.classGapDetail, { course: courseLabel(g.subject, g.grade), rate: formatPct(g.rate), avg: formatPct(g.avg) }),
      href: "/topics",
      scope: { subject: g.subject, grade: g.grade },
    });
  }

  // 3. Различия между учебниками (только с явной оговоркой о причинности).
  const textbookFindings: Insight[] = [];
  for (const course of courses) {
    const courseRecords = byCourse.get(`${course.subject}\u001f${course.grade}`) ?? [];
    const tbNames = new Map<string, string>();
    for (const r of courseRecords) tbNames.set(r.textbookId, r.textbookName);
    if (tbNames.size < 2) continue;
    const ids = [...tbNames.entries()].sort((a, b) => naturalCompare(a[1], b[1])).map(([id]) => id);
    const result = compareTextbooks({ records: courseRecords, textbookIds: ids, topicKey: null, referenceId: ids[0], config });
    for (const v of result.verdicts) {
      if ((v.level !== "consistent" && v.level !== "preliminary") || !v.diff) continue;
      const a = shortTextbookName(tbNames.get(v.textbookId) ?? v.textbookId, course.subject, course.grade);
      const b = shortTextbookName(tbNames.get(v.referenceId) ?? v.referenceId, course.subject, course.grade);
      textbookFindings.push({
        id: `tb-${course.subject}-${course.grade}-${v.textbookId}`,
        severity: "info",
        title: t(m.insights.textbookTitle, { course: courseLabel(course.subject, course.grade), a: quote(a), b: quote(b), diff: formatPp(v.diff.diff) }),
        detail: t(m.insights.textbookDetail, { verdict: v.level === "consistent" ? m.insights.textbookConsistent : m.insights.textbookPreliminary }),
        href: "/textbooks",
        scope: { subject: course.subject, grade: course.grade },
      });
    }
  }
  textbookFindings.sort((x, y) => x.title.localeCompare(y.title, i18n().intl));
  insights.push(...textbookFindings.slice(0, 2));

  // 4. Темы с недостаточным объёмом данных.
  const insufficient = topicStats.filter((x) => !x.sufficient);
  if (insufficient.length > 0) {
    insights.push({
      id: "insufficient",
      severity: "info",
      title: plural(m.insights.insufficientTitle, insufficient.length),
      detail: t(m.insights.insufficientDetail, {
        list: listText(
          insufficient.slice(0, 3).map((x) => t(m.insights.insufficientItem, { topic: quote(x.topicName), n: x.students })),
          insufficient.length > 3,
        ),
      }),
      href: "/topics",
    });
  }

  if (problems.length === 0 && topicStats.length > 0) {
    insights.unshift({
      id: "no-problems",
      severity: "info",
      title: m.insights.noneTitle,
      detail: t(m.insights.noneDetail, { threshold }),
      href: "/topics",
    });
  }

  const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return insights.map((x, i) => ({ x, i })).sort((a, b) => order[a.x.severity] - order[b.x.severity] || a.i - b.i).map(({ x }) => x);
}
