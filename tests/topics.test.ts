import { describe, expect, it } from "vitest";
import { computeHeatmap } from "@/lib/analytics/heatmap";
import { computeOverview } from "@/lib/analytics/overview";
import { computeTopicDetail, computeTopicStats } from "@/lib/analytics/topics";
import { computeInsights } from "@/lib/analytics/insights";
import { filterRecords, sanitizeFilters } from "@/lib/analytics/filters";
import { EMPTY_FILTERS, makeTopicKey } from "@/lib/domain/types";
import { config, findNonFinite, group, rec } from "./helpers";

const Q6 = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"];

describe("анализ тем", () => {
  it("правильно считает процент успешности и объём выборки", () => {
    const records = [
      ...group({ students: 12, prefix: "a", topicId: "T1", questions: Q6, rate: 5 / 6 }),
      ...group({ students: 12, prefix: "a", topicId: "T2", questions: Q6, rate: 2 / 6 }),
    ];
    const stats = computeTopicStats(records, config);
    expect(stats).toHaveLength(2);
    const [t1, t2] = stats;
    expect(t1.rate).toBeCloseTo(5 / 6, 10);
    expect(t1.students).toBe(12);
    expect(t1.answers).toBe(72);
    expect(t1.questions).toBe(6);
    expect(t1.level).toBe("high");
    expect(t2.rate).toBeCloseTo(2 / 6, 10);
    expect(t2.level).toBe("low");
  });

  it("выявляет проблемные темы только при достаточной выборке", () => {
    const records = [
      ...group({ students: 30, prefix: "a", topicId: "HARD", questions: Q6, rate: 2 / 6 }),
      ...group({ students: 30, prefix: "a", topicId: "MID", questions: Q6, rate: 4 / 6 }),
      // Один ответ одного ученика — вывод о сложности недопустим.
      rec({ studentId: "z", topicId: "ONE", topicName: "Один ответ", isCorrect: false }),
    ];
    const stats = computeTopicStats(records, config);
    const byId = Object.fromEntries(stats.map((s) => [s.topicId, s]));
    expect(byId.HARD.status).toBe("difficult");
    expect(byId.MID.status).toBe("attention");
    expect(byId.ONE.sufficient).toBe(false);
    expect(byId.ONE.status).toBe("insufficient");
    expect(byId.ONE.level).toBe("insufficient");
    expect(byId.ONE.sampleNote).toMatch(/Недостаточно данных/);
  });

  it("различает одинаковые коды тем в разных параллелях", () => {
    const records = [rec({ grade: 7, classId: "7А" }), rec({ grade: 8, classId: "8А", studentId: "S2" })];
    const stats = computeTopicStats(records, config);
    expect(stats.map((s) => s.key)).toEqual([makeTopicKey("Алгебра", 7, "T1"), makeTopicKey("Алгебра", 8, "T1")]);
  });

  it("корректно обрабатывает пустой набор", () => {
    expect(computeTopicStats([], config)).toEqual([]);
    const overview = computeOverview([], [], config);
    expect(overview.kpis.students).toBe(0);
    expect(overview.kpis.estimate).toBeNull();
    expect(findNonFinite(overview)).toEqual([]);
    expect(computeInsights([], [], config)).toEqual([]);
    const heat = computeHeatmap([], config);
    expect(heat.rows).toEqual([]);
    expect(heat.cells).toEqual([]);
  });

  it("строит тепловую карту класс × тема с пометкой малых ячеек", () => {
    const records = [
      ...group({ students: 10, prefix: "a", classId: "7А", topicId: "T1", questions: Q6, rate: 1 }),
      ...group({ students: 3, prefix: "b", classId: "7Б", topicId: "T1", questions: Q6, rate: 0.5 }),
      ...group({ students: 10, prefix: "a", classId: "7А", topicId: "T2", questions: Q6, rate: 0.5 }),
    ];
    const heat = computeHeatmap(records, config);
    expect(heat.rows.map((r) => r.classId)).toEqual(["7А", "7Б"]);
    expect(heat.columns.map((c) => c.topicId)).toEqual(["T1", "T2"]);
    expect(heat.cells[0][0]?.rate).toBe(1);
    expect(heat.cells[1][0]?.sufficient).toBe(false);
    expect(heat.cells[1][1]).toBeNull(); // 7Б не писал тему T2
  });

  it("детализирует тему по классам и заданиям", () => {
    const records = group({ students: 10, prefix: "a", topicId: "T1", questions: Q6, rate: 0.5 });
    const detail = computeTopicDetail(records, makeTopicKey("Алгебра", 7, "T1"), config);
    expect(detail.byClass).toHaveLength(1);
    expect(detail.questions).toHaveLength(6);
    for (const q of detail.questions) expect(q.answers).toBe(10);
  });
});

describe("фильтры", () => {
  const records = [
    rec({ subject: "Алгебра", grade: 7, classId: "7А" }),
    rec({ subject: "Физика", grade: 8, classId: "8Б", studentId: "S2" }),
  ];

  it("фильтрует по предмету и параллели", () => {
    expect(filterRecords(records, { ...EMPTY_FILTERS, subject: "Физика" })).toHaveLength(1);
    expect(filterRecords(records, { ...EMPTY_FILTERS, grade: 7 })).toHaveLength(1);
    expect(filterRecords(records, EMPTY_FILTERS)).toBe(records);
  });

  it("сбрасывает недопустимые значения после смены данных", () => {
    const next = sanitizeFilters(records, { ...EMPTY_FILTERS, subject: "Физика", grade: 7, classId: "7А" });
    expect(next.subject).toBe("Физика");
    expect(next.grade).toBeNull();
    expect(next.classId).toBeNull();
    expect(sanitizeFilters([], { ...EMPTY_FILTERS, subject: "История" }).subject).toBeNull();
  });
});
