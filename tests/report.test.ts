import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterRecords, naturalCompare } from "@/lib/analytics/filters";
import { buildHoursInputs, planTotal, recommendHours } from "@/lib/analytics/hours";
import { computeInsights } from "@/lib/analytics/insights";
import { computeOverview } from "@/lib/analytics/overview";
import { analyzeSkills } from "@/lib/analytics/skills";
import { isProblemStatus } from "@/lib/analytics/stats";
import { compareTextbooks } from "@/lib/analytics/textbooks";
import { computeTopicStats } from "@/lib/analytics/topics";
import { defaultHoursConfig } from "@/lib/config/analysis-config";
import { buildDataset, datasetFromDemoCsv } from "@/lib/data/dataset";
import { summarizeRecords } from "@/lib/data/validate-results";
import { EMPTY_FILTERS, type CurriculumEntry } from "@/lib/domain/types";
import { buildReport } from "@/lib/report/report";
import { config, findNonFinite, group, rec } from "./helpers";

const now = new Date("2026-11-11T10:00:00Z");
const all = { subject: null, grade: null };
const curriculum: CurriculumEntry[] = [
  { subject: "Алгебра", grade: 7, topicId: "T1", topicName: "Тема T1", currentHours: 10, minHours: 4 },
  { subject: "Алгебра", grade: 7, topicId: "T2", topicName: "Тема T2", currentHours: 10, minHours: 4 },
];
const records = [
  ...group({ students: 20, prefix: "A", classId: "7А", textbookId: "A", questions: ["Q1", "Q2", "Q3", "Q4"], rate: 0.25 }),
  ...group({ students: 20, prefix: "B", classId: "7Б", textbookId: "B", questions: ["Q1", "Q2", "Q3", "Q4"], rate: 0.5 }),
  ...group({ students: 20, prefix: "A", classId: "7А", textbookId: "A", topicId: "T2", questions: ["Q5", "Q6", "Q7", "Q8"], rate: 1 }),
  rec({ studentId: "F1", subject: "Физика", grade: 8, classId: "8А", testId: "PHYSICS", testDate: "2026-03-01" }),
  rec({ studentId: "M8", grade: 8, classId: "8Б", testId: "MATH8", testDate: "2026-02-01" }),
];
const dataset = buildDataset(records, curriculum, { name: "Fixture", source: "upload", loadedAt: now.toISOString() });

describe("buildReport", () => {
  it("reuses overview, topic and insight calculations without changing their values", () => {
    const report = buildReport(dataset, all, config, now);
    const topics = computeTopicStats(records, config);
    const overview = computeOverview(records, topics, config);
    const summary = summarizeRecords(records);
    expect(report.generatedAt).toBe(now.toISOString());
    expect(report.scope).toEqual(all);
    expect(report.sample).toEqual({
      datasetName: "Fixture", isSynthetic: false, students: summary.students,
      classes: summary.classes, subjects: summary.subjects, topics: summary.topics,
      textbooks: summary.textbooks, tests: summary.tests, answers: summary.rows,
      dateFrom: summary.dateFrom, dateTo: summary.dateTo,
      excludedResultRows: 0, removedDuplicates: 0, curriculumTopics: 2,
    });
    expect(report.performance.overview).toEqual(overview);
    expect(report.performance.estimate).toEqual(overview.kpis.estimate);
    expect(report.problemTopics).toEqual(topics.filter((t) => isProblemStatus(t.status)).sort((a, b) => a.rate! - b.rate!));
    expect(report.insufficientTopics).toEqual(topics.filter((t) => !t.sufficient));
    expect(Object.values(report.performance.statusCounts).reduce((sum, n) => sum + n, 0)).toBe(topics.length);
    for (const status of ["difficult", "likely_difficult", "attention", "mastered", "insufficient"] as const) {
      expect(report.performance.statusCounts[status]).toBe(topics.filter((t) => t.status === status).length);
    }
    expect(report.insights).toEqual(computeInsights(records, topics, config));
    expect(findNonFinite(report)).toEqual([]);
  });

  it("uses exactly the textbook page's default selection, reference and verdicts", () => {
    const report = buildReport(dataset, { subject: "Алгебра", grade: 7 }, config, now);
    const courseRecords = records.filter((r) => r.subject === "Алгебра" && r.grade === 7);
    const names = new Map(courseRecords.map((r) => [r.textbookId, r.textbookName]));
    const ids = [...names].sort((a, b) => naturalCompare(a[1], b[1])).map(([id]) => id);
    expect(report.textbooks).toHaveLength(1);
    expect(report.textbooks[0]).toEqual({
      subject: "Алгебра", grade: 7, textbookNames: Object.fromEntries(names),
      result: compareTextbooks({ records: courseRecords, textbookIds: ids, topicKey: null, referenceId: ids[0], config }),
    });
  });

  it("uses the hours page's default budget, constraints and recommendations", () => {
    const scope = { subject: "Алгебра", grade: 7 };
    const report = buildReport(dataset, scope, config, now);
    const scoped = filterRecords(records, { ...EMPTY_FILTERS, ...scope }, ["subject", "grade"]);
    const { inputs } = buildHoursInputs(curriculum, computeTopicStats(scoped, config), scope.subject, scope.grade);
    const expected = recommendHours(inputs, {
      ...defaultHoursConfig(config), budgetHours: planTotal(curriculum, scope.subject, scope.grade), mediumPct: config.thresholds.medium,
    });
    expect(report.hours).toEqual([{ subject: scope.subject, grade: scope.grade, plan: expected, unplannedTopics: 0 }]);
  });

  it.each([
    [all, 242, 2, 2],
    [{ subject: "Алгебра", grade: null }, 241, 1, 2],
    [{ subject: "Алгебра", grade: 7 }, 240, 1, 2],
    [{ subject: null, grade: 8 }, 2, 2, 0],
    [{ subject: "Unknown", grade: null }, 0, 0, 0],
  ])("applies scope %j to both results and curriculum", (scope, answers, subjects, curriculumTopics) => {
    const report = buildReport(dataset, scope, config, now);
    expect(report.sample.answers).toBe(answers);
    expect(report.sample.subjects).toBe(subjects);
    expect(report.sample.curriculumTopics).toBe(curriculumTopics);
    expect(report.textbooks.every((c) => (scope.subject === null || c.subject === scope.subject) && (scope.grade === null || c.grade === scope.grade))).toBe(true);
    expect(report.hours.every((c) => (scope.subject === null || c.subject === scope.subject) && (scope.grade === null || c.grade === scope.grade))).toBe(true);
  });

  it("includes data limitations only when present, with actual observation counts", () => {
    const partial = buildDataset(records.map((r, i) => i < 10 ? { ...r, skill: "Fractions" } : r), curriculum, {
      name: "Quality", source: "demo", isSynthetic: true, excludedResultRows: 3, removedDuplicates: 4,
    });
    const report = buildReport(partial, all, config, now);
    const quality = Object.fromEntries(report.quality.map((item) => [item.kind, item.count]));
    expect(quality).toEqual({
      synthetic: 1, excluded_rows: 3, duplicates_removed: 4,
      insufficient_topics: 2, courses_without_plan: 2,
      partial_skill_data: 232, single_class_textbooks: 2,
    });
    expect(report.skills).toEqual(analyzeSkills(partial.records, config));
    expect(buildReport(dataset, all, config, now).skills).toBeNull();
  });

  it("distinguishes absence of all curriculum from partially missing course plans", () => {
    const noPlan = buildReport({ ...dataset, curriculum: [] }, all, config, now);
    expect(noPlan.quality).toContainEqual({ kind: "no_curriculum", count: 3 });
    expect(noPlan.quality).toContainEqual({ kind: "no_skill_data", count: records.length });
    expect(noPlan.quality.some((q) => q.kind === "courses_without_plan")).toBe(false);
    expect(noPlan.hours).toEqual([]);
  });

  it("reports plan-only courses honestly, without creating assessment results", () => {
    const onlyPlan = buildDataset([], curriculum, { name: "Only curriculum", source: "upload" });
    const report = buildReport(onlyPlan, all, config, now);
    expect(report.sample.answers).toBe(0);
    expect(report.performance.estimate).toBeNull();
    expect(report.hours).toHaveLength(1);
    const plan = report.hours[0].plan;
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.rows.every((r) => !r.sufficient && r.rate === null)).toBe(true);
    expect(findNonFinite(report)).toEqual([]);
  });

  it("handles empty datasets with zeros, null estimate and no invented findings", () => {
    const empty = buildDataset([], [], { name: "Empty", source: "upload" });
    const report = buildReport(empty, all, config, now);
    expect(report.sample.answers).toBe(0);
    expect(report.sample.topics).toBe(0);
    expect(report.sample.dateFrom).toBeNull();
    expect(report.sample.dateTo).toBeNull();
    expect(report.performance.estimate).toBeNull();
    expect(report.problemTopics).toEqual([]);
    expect(report.insufficientTopics).toEqual([]);
    expect(report.skills).toBeNull();
    expect(report.textbooks).toEqual([]);
    expect(report.hours).toEqual([]);
    expect(report.quality).toEqual([]);
    expect(findNonFinite(report)).toEqual([]);
  });

  it("keeps results deterministic and does not mutate the dataset or scope", () => {
    const before = JSON.stringify(dataset);
    const scope = { subject: "Алгебра", grade: 7 };
    const report = buildReport(dataset, scope, config, now);
    expect(buildReport(dataset, scope, config, now)).toEqual(report);
    expect(JSON.stringify(dataset)).toBe(before);
    scope.grade = 8;
    expect(report.scope.grade).toBe(7);
  });

  it("builds an engine-consistent report from the demo CSV import pipeline", () => {
    const demo = datasetFromDemoCsv(readFileSync("public/demo/results.csv", "utf8"), readFileSync("public/demo/curriculum.csv", "utf8"));
    const report = buildReport(demo, { subject: "Алгебра", grade: 8 }, config, now);
    expect(report.sample.isSynthetic).toBe(true);
    expect(report.sample.answers).toBeGreaterThan(0);
    expect(report.textbooks).toHaveLength(1);
    expect(report.textbooks[0].result.verdicts.some((v) => v.level === "consistent")).toBe(true);
    expect(report.hours).toHaveLength(1);
    const plan = report.hours[0].plan;
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.recommendedTotal + plan.reserveHours).toBe(plan.budgetHours);
    expect(findNonFinite(report)).toEqual([]);
  });
});
