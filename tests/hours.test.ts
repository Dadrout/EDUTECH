import { describe, expect, it } from "vitest";
import { buildHoursInputs, recommendHours, type HoursParams, type HoursTopicInput } from "@/lib/analytics/hours";
import { computeTopicStats } from "@/lib/analytics/topics";
import { makeTopicKey } from "@/lib/domain/types";
import { config, findNonFinite, group, rng } from "./helpers";

const params = (budgetHours: number, extra: Partial<HoursParams> = {}): HoursParams => ({
  budgetHours,
  targetPct: 80,
  mediumPct: 60,
  maxIncreaseShare: 0.5,
  maxDecreaseShare: 0.25,
  stepHours: 1,
  ...extra,
});

const topic = (id: string, rate: number | null, currentHours: number, minHours: number, extra: Partial<HoursTopicInput> = {}): HoursTopicInput => ({
  key: id,
  topicId: id,
  topicName: `Тема ${id}`,
  currentHours,
  minHours,
  rate,
  sufficient: rate !== null,
  students: rate !== null ? 50 : 0,
  answers: rate !== null ? 300 : 0,
  hasResults: rate !== null,
  ...extra,
});

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

describe("рекомендации по учебным часам", () => {
  const base = [
    topic("A", 0.92, 10, 7),
    topic("B", 0.85, 10, 7),
    topic("C", 0.7, 12, 8),
    topic("D", 0.45, 14, 10),
    topic("E", 0.38, 14, 10),
  ];

  it("сохраняет бюджет и передаёт часы от освоенных тем к сложным", () => {
    const plan = recommendHours(base, params(60));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.recommendedTotal + plan.reserveHours).toBe(60);
    expect(sum(plan.rows.map((r) => r.recommendedHours)) + plan.reserveHours).toBe(60);
    const byId = Object.fromEntries(plan.rows.map((r) => [r.topicId, r]));
    expect(byId.E.changeHours).toBeGreaterThan(0);
    expect(byId.D.changeHours).toBeGreaterThan(0);
    expect(byId.A.changeHours).toBeLessThan(0);
    // Тема с самым низким освоением имеет наибольший приоритет.
    expect(byId.E.priority!).toBeGreaterThan(byId.D.priority!);
    // У каждой строки есть объяснение.
    for (const r of plan.rows) expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("соблюдает минимальные часы и не допускает отрицательных значений", () => {
    const plan = recommendHours(base, params(60, { maxDecreaseShare: 1 }));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    for (const r of plan.rows) {
      expect(r.recommendedHours).toBeGreaterThanOrEqual(r.minHours);
      expect(r.recommendedHours).toBeGreaterThanOrEqual(0);
    }
  });

  it("поднимает тему до минимума, если текущие часы ниже", () => {
    const plan = recommendHours([topic("A", 0.7, 4, 6), topic("B", 0.7, 10, 5)], params(14));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rows[0].recommendedHours).toBe(6);
    expect(plan.rows[0].reasons.join(" ")).toMatch(/ниже минимума/);
    expect(plan.recommendedTotal + plan.reserveHours).toBe(14);
  });

  it("показывает конфликт, если бюджет меньше суммы минимумов", () => {
    const plan = recommendHours(base, params(40));
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.kind).toBe("budget_below_minimum");
    expect(plan.message).toMatch(/меньше суммы минимальных часов/);
  });

  it("при сокращении бюджета в первую очередь сокращает хорошо освоенные темы", () => {
    const plan = recommendHours(base, params(56));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.recommendedTotal + plan.reserveHours).toBe(56);
    const byId = Object.fromEntries(plan.rows.map((r) => [r.topicId, r]));
    expect(byId.A.changeHours).toBeLessThan(0);
    expect(byId.E.changeHours).toBeGreaterThanOrEqual(0);
  });

  it("при увеличении бюджета оставляет неиспользованные часы в резерве", () => {
    const plan = recommendHours(base, params(100));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.recommendedTotal + plan.reserveHours).toBe(100);
    expect(plan.reserveHours).toBeGreaterThan(0);
    // Доноры не сокращаются, если хватает свободного бюджета.
    expect(plan.rows.find((r) => r.topicId === "A")!.changeHours).toBe(0);
  });

  it("не меняет часы тем с недостаточными данными", () => {
    const plan = recommendHours(
      [
        topic("A", 0.95, 10, 5),
        topic("X", 0.2, 10, 5, { sufficient: false, students: 3, answers: 9 }),
        topic("Y", null, 10, 5),
      ],
      params(30),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const byId = Object.fromEntries(plan.rows.map((r) => [r.topicId, r]));
    expect(byId.X.changeHours).toBe(0);
    expect(byId.X.role).toBe("frozen");
    expect(byId.Y.changeHours).toBe(0);
    expect(byId.Y.role).toBe("no_data");
  });

  it("отклоняет некорректные входные данные", () => {
    expect(recommendHours([topic("A", 0.5, -1, 0)], params(10)).ok).toBe(false);
    expect(recommendHours([topic("A", 0.5, 4.3, 0)], params(10)).ok).toBe(false);
    expect(recommendHours([topic("A", 0.5, 4, 0)], params(Number.NaN)).ok).toBe(false);
    const empty = recommendHours([], params(10));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.kind).toBe("no_topics");
  });

  it("поддерживает получасовую точность без ошибок округления", () => {
    const plan = recommendHours([topic("A", 0.9, 4.5, 2), topic("B", 0.3, 5.5, 3)], params(10, { stepHours: 0.5 }));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.recommendedTotal + plan.reserveHours).toBe(10);
  });

  it("сохраняет инварианты на сотнях случайных планов", () => {
    const rand = rng(42);
    for (let iter = 0; iter < 400; iter++) {
      const n = 1 + Math.floor(rand() * 9);
      const topics = Array.from({ length: n }, (_, i) => {
        const current = Math.round(rand() * 40) / 2;
        const min = Math.round(rand() * current * 2) / 2;
        const rate = rand() < 0.15 ? null : rand();
        return topic(`T${i}`, rate, current, min, { sufficient: rate !== null && rand() > 0.1 });
      });
      const minTotal = sum(topics.map((t) => t.minHours));
      const currentTotal = sum(topics.map((t) => t.currentHours));
      const baseTotal = sum(topics.map((t) => Math.max(t.currentHours, t.minHours)));
      const budget = Math.max(0, Math.round((currentTotal + (rand() - 0.5) * 20) * 2) / 2);
      const plan = recommendHours(topics, params(budget, { stepHours: rand() < 0.5 ? 1 : 0.5, maxDecreaseShare: rand() }));
      if (budget < minTotal) {
        expect(plan.ok).toBe(false);
        continue;
      }
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;
      expect(findNonFinite(plan)).toEqual([]);
      expect(plan.recommendedTotal + plan.reserveHours).toBeCloseTo(budget, 9);
      expect(plan.reserveHours).toBeGreaterThanOrEqual(0);
      for (const r of plan.rows) {
        expect(r.recommendedHours).toBeGreaterThanOrEqual(r.minHours);
        expect(r.recommendedHours).toBeGreaterThanOrEqual(0);
        // Если бюджета хватает на базовый план, темы без надёжных данных не меняются.
        if ((r.role === "frozen" || r.role === "no_data") && budget >= baseTotal) {
          expect(r.recommendedHours).toBe(Math.max(r.currentHours, r.minHours));
        }
      }
    }
  });
});

describe("сопоставление учебного плана со статистикой", () => {
  it("находит темы без плана и темы плана без результатов", () => {
    const records = group({ students: 12, prefix: "s", topicId: "T1", questions: ["Q1", "Q2", "Q3"], rate: 2 / 3 }).concat(
      group({ students: 12, prefix: "s", topicId: "T9", questions: ["Q4", "Q5", "Q6"], rate: 2 / 3 }),
    );
    const stats = computeTopicStats(records, config);
    const { inputs, unplanned } = buildHoursInputs(
      [
        { subject: "Алгебра", grade: 7, topicId: "T1", topicName: null, currentHours: 10, minHours: 6 },
        { subject: "Алгебра", grade: 7, topicId: "T2", topicName: "Без результатов", currentHours: 8, minHours: 6 },
      ],
      stats,
      "Алгебра",
      7,
    );
    expect(inputs).toHaveLength(2);
    expect(inputs[0].hasResults).toBe(true);
    expect(inputs[0].key).toBe(makeTopicKey("Алгебра", 7, "T1"));
    expect(inputs[1].hasResults).toBe(false);
    expect(unplanned.map((u) => u.topicId)).toEqual(["T9"]);
  });
});
