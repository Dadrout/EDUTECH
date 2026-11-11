import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord } from "@/lib/domain/types";
import { countLabel, formatCi, formatPct, formatPp, quote, shortTextbookName } from "@/lib/format";
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

const courseLabel = (subject: string, grade: number) => `${subject}, ${grade} класс`;

/**
 * Основные выявленные проблемы — детерминированные правила поверх статистики.
 * Никакой генерации текста моделью: каждый вывод воспроизводим.
 */
export function computeInsights(records: AnswerRecord[], topicStats: TopicStats[], config: AnalysisConfig): Insight[] {
  const insights: Insight[] = [];

  // 1. Темы с низким уровнем освоения.
  const problems = topicStats
    .filter((t) => isProblemStatus(t.status) && t.rate !== null)
    .sort((a, b) => (a.rate as number) - (b.rate as number));
  for (const t of problems.slice(0, 3)) {
    const confirmed = t.status === "difficult";
    insights.push({
      id: `topic-${t.key}`,
      severity: confirmed ? "critical" : "warning",
      title: `${quote(t.topicName)} — низкое освоение, ${formatPct(t.rate)}`,
      detail: `${courseLabel(t.subject, t.grade)} · ${t.students} уч. · 95% ДИ ${formatCi(t.estimate?.ciLow, t.estimate?.ciHigh)}. ${
        confirmed
          ? `Вывод надёжен: даже верхняя граница интервала ниже ${config.thresholds.medium}%.`
          : `Интервал пересекает порог ${config.thresholds.medium}% — тема вероятно сложная, нужны дополнительные данные.`
      }`,
      href: "/topics",
      scope: { subject: t.subject, grade: t.grade, topicKey: t.key },
    });
  }
  if (problems.length > 3) {
    insights.push({
      id: "topics-more",
      severity: "warning",
      title: `Ещё ${countLabel(problems.length - 3, ["тема", "темы", "тем"])} с низким уровнем освоения`,
      detail: problems
        .slice(3, 6)
        .map((t) => `${quote(t.topicName)} (${formatPct(t.rate, 0)})`)
        .join(", ") + (problems.length > 6 ? " и другие." : "."),
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
      title: `${g.classId} отстаёт по теме ${quote(g.topicName)} на ${formatPp(Math.abs(g.delta), 0).replace(/^[+±]/, "")}`,
      detail: `${courseLabel(g.subject, g.grade)}: успешность класса ${formatPct(g.rate)} при среднем по параллели ${formatPct(g.avg)}. Стоит проверить методику преподавания темы в этом классе.`,
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
        title: `${courseLabel(course.subject, course.grade)}: ${quote(a)} относительно ${quote(b)} — ${formatPp(v.diff.diff)}`,
        detail: `${v.level === "consistent" ? "Различие устойчиво во всех классах" : "Различие значимо, но вывод предварительный"}. Это связь на общих заданиях, а не доказательство того, что учебник — причина.`,
        href: "/textbooks",
        scope: { subject: course.subject, grade: course.grade },
      });
    }
  }
  textbookFindings.sort((x, y) => x.title.localeCompare(y.title, "ru"));
  insights.push(...textbookFindings.slice(0, 2));

  // 4. Темы с недостаточным объёмом данных.
  const insufficient = topicStats.filter((t) => !t.sufficient);
  if (insufficient.length > 0) {
    insights.push({
      id: "insufficient",
      severity: "info",
      title: `${countLabel(insufficient.length, ["тема", "темы", "тем"])} без достаточного объёма данных`,
      detail: `${insufficient
        .slice(0, 3)
        .map((t) => `${quote(t.topicName)} (${t.students} уч.)`)
        .join(", ")}${insufficient.length > 3 ? " и другие" : ""}. Выводы о сложности таких тем не делаются.`,
      href: "/topics",
    });
  }

  if (problems.length === 0 && topicStats.length > 0) {
    insights.unshift({
      id: "no-problems",
      severity: "info",
      title: "Тем с низким уровнем освоения не выявлено",
      detail: `Все темы с достаточным объёмом данных освоены не ниже ${config.thresholds.medium}%.`,
      href: "/topics",
    });
  }

  const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return insights.map((x, i) => ({ x, i })).sort((a, b) => order[a.x.severity] - order[b.x.severity] || a.i - b.i).map(({ x }) => x);
}
