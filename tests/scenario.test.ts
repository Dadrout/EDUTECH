import { describe, expect, it } from "vitest";
import { recommendHours, type HoursParams, type HoursRow, type HoursTopicInput } from "@/lib/analytics/hours";
import { evaluateScenario, initialScenario, moveHours, snapHours, type ScenarioIssueKind } from "@/lib/analytics/scenario";
import { findNonFinite, rng } from "./helpers";

const params = (budgetHours = 20, extra: Partial<HoursParams> = {}): HoursParams => ({
  budgetHours, targetPct: 80, mediumPct: 60, maxIncreaseShare: 0.5, maxDecreaseShare: 0.25, stepHours: 0.5, ...extra,
});
const row = (key: string, extra: Partial<HoursRow> = {}): HoursRow => ({
  key, topicId: key, topicName: `Topic ${key}`, rate: 0.4, sufficient: true,
  level: "low", students: 50, answers: 300, currentHours: 8, minHours: 2,
  recommendedHours: 10, changeHours: 2, role: "recipient", priority: 0.5,
  demandHours: 2, releaseCapHours: 0, reasons: [], ...extra,
});

describe("scenario initialization and snapping", () => {
  it("copies either plan without sharing edits, including special record keys", () => {
    const rows = [row("A"), row("__proto__")];
    const custom = initialScenario(rows, "recommended");
    expect(custom).toEqual({ A: 10, ["__proto__"]: 10 });
    custom.A = 3;
    expect(rows[0].recommendedHours).toBe(10);
    expect(initialScenario(rows, "current")).toEqual({ A: 8, ["__proto__"]: 8 });
    expect(initialScenario([], "current")).toEqual({});
  });

  it.each([
    [1.24, 0.5, 1], [1.25, 0.5, 1.5], [2.25, 1.5, 3], [0.1 + 0.2, 0.5, 0.5],
    [-1, 0.5, 0], [1.3, 0, 1.5], [1.3, -1, 1.5], [1.3, NaN, 1.5],
    [1.3, Infinity, 1.5], [1.3, 1e-12, 1.5], [1.3, 0.3, 1.5], [NaN, 0.5, 0], [Infinity, 0.5, 0],
  ])("snaps %s at step %s to %s", (value, step, expected) => {
    expect(snapHours(value, step)).toBe(expected);
  });
});

describe("scenario evaluation", () => {
  it("computes all three summaries using hand-calculated priorities", () => {
    const rows = [row("A", { priority: 0.99 }), row("B", { rate: 0.6, currentHours: 4, recommendedHours: 5 }),
      row("C", { rate: 0.8, currentHours: 6, recommendedHours: 4 }),
      row("D", { sufficient: false, currentHours: 2, recommendedHours: 1 })];
    const result = evaluateScenario(rows, { A: 11, B: 3, C: 4, D: 2 }, params());
    expect(result.current).toEqual({ total: 20, remaining: 0, changedTopics: 0, movedHours: 0,
      hoursBelowTarget: 12, shareBelowTarget: 0.6, priorityShift: 0 });
    expect(result.recommended).toEqual({ total: 20, remaining: 0, changedTopics: 4, movedHours: 3,
      hoursBelowTarget: 15, shareBelowTarget: 0.75, priorityShift: 1.25 });
    expect(result.custom).toEqual({ total: 20, remaining: 0, changedTopics: 3, movedHours: 3,
      hoursBelowTarget: 14, shareBelowTarget: 0.7, priorityShift: 1.25 });
    expect(result.rows.map((r) => [r.key, r.priority, r.deltaCurrent, r.deltaRecommended]))
      .toEqual([["A", 0.99, 3, 1], ["B", 0.5, -1, -2], ["C", 0.5, -2, 0], ["D", 0.5, 0, 1]]);
    expect(result.rows[0]).toMatchObject({ topicId: "A", topicName: "Topic A", minHours: 2,
      current: 8, recommended: 10, custom: 11, rate: 0.4, sufficient: true });
  });

  it("uses current hours for missing own keys and ignores unknown keys", () => {
    const custom = Object.assign(Object.create({ A: 99 }), { B: 4.5, unknown: -100 });
    const result = evaluateScenario([row("A"), row("B")], custom, params(12.5));
    expect(result.rows.map((r) => r.custom)).toEqual([8, 4.5]);
    expect(result.custom.total).toBe(12.5);
    expect(result.custom.remaining).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("keeps half-hour totals exact and reports reserve as a warning", () => {
    const rows = Array.from({ length: 101 }, (_, i) => row(String(i), { currentHours: 0.5, minHours: 0 }));
    const result = evaluateScenario(rows, {}, params(51));
    expect(result.custom.total).toBe(50.5);
    expect(result.custom.remaining).toBe(0.5);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([{ kind: "under_budget", severity: "warning", hours: 50.5, limit: 51 }]);
    expect(evaluateScenario([], {}, params(0)).custom).toEqual({ total: 0, remaining: 0,
      changedTopics: 0, movedHours: 0, hoursBelowTarget: 0, shareBelowTarget: null, priorityShift: 0 });
    expect(evaluateScenario([row("A", { currentHours: 0, minHours: 0 })], {}, params(0)).custom.shareBelowTarget).toBeNull();
  });

  it.each<{ kind: ScenarioIssueKind; hours: number; equality: number; limit: number; extra?: Partial<HoursRow> }>([
    { kind: "negative", hours: -0.5, equality: 0, limit: 0, extra: { minHours: 0 } },
    { kind: "not_half_hour", hours: 8.1, equality: 8, limit: 0.5 },
    { kind: "below_minimum", hours: 1.5, equality: 2, limit: 2 },
    { kind: "above_max_increase", hours: 12.5, equality: 12, limit: 12 },
    { kind: "below_max_decrease", hours: 5.5, equality: 6, limit: 6 },
    { kind: "changed_without_data", hours: 8.5, equality: 8, limit: 8, extra: { sufficient: false } },
    { kind: "changed_without_data", hours: 7.5, equality: 8, limit: 8, extra: { rate: null } },
  ])("reports $kind only across its boundary", ({ kind, hours, equality, limit, extra }) => {
    const rows = [row("A", extra)];
    const result = evaluateScenario(rows, { A: hours }, params());
    expect(result.issues.find((issue) => issue.kind === kind)).toEqual({ kind,
      severity: ["negative", "not_half_hour", "below_minimum"].includes(kind) ? "error" : "warning",
      key: "A", topicName: "Topic A", hours, limit });
    expect(evaluateScenario(rows, { A: equality }, params()).issues.map((i) => i.kind)).not.toContain(kind);
  });

  it("does not report decrease warnings below minimum or floating-point boundary noise", () => {
    expect(evaluateScenario([row("A")], { A: 1.5 }, params()).issues.map((i) => i.kind)).not.toContain("below_max_decrease");
    const result = evaluateScenario([row("A", { currentHours: 0.5, minHours: 0.5 })],
      { A: 0.1 + 0.2 + 0.2 }, params(0.5));
    expect(result.issues).toEqual([]);
    expect(result.custom.total).toBe(0.5);
  });

  it("reports budget boundaries with errors before warnings in input order", () => {
    const rows = [row("Z", { sufficient: false }), row("A")];
    const result = evaluateScenario(rows, { Z: 12.5, A: -0.5 }, params(10));
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => [i.kind, i.key])).toEqual([
      ["over_budget", undefined], ["negative", "A"], ["below_minimum", "A"],
      ["above_max_increase", "Z"], ["changed_without_data", "Z"],
    ]);
    expect(result.issues[0]).toEqual({ kind: "over_budget", severity: "error", hours: 12, limit: 10 });
    expect(result.custom.remaining).toBe(-2);
    for (const budget of [12, 12.5]) {
      const evaluation = evaluateScenario([row("A", { minHours: 0 })], { A: 12 }, params(budget));
      expect(evaluation.valid).toBe(true);
      expect(evaluation.issues.map((i) => i.kind)).toEqual(budget === 12 ? [] : ["under_budget"]);
    }
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite custom hours %s", (hours) => {
    const result = evaluateScenario([row("A")], { A: hours }, params());
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.kind)).toContain("not_half_hour");
    expect(findNonFinite(result)).toEqual([]);
    expect(result.rows[0].custom).toBe(8);
    expect(moveHours({ A: hours, B: 4 }, [row("A"), row("B")], "A", "B", 1, 0.5)).toEqual({ A: hours, B: 4 });
  });
});

describe("moving scenario hours", () => {
  const rows = [row("A", { currentHours: 5.5, minHours: 2 }), row("B", { currentHours: 3 })];
  it("snaps the request and caps the transfer at whole steps above minimum", () => {
    const custom = { A: 5.5, B: 3, unknown: 9 };
    expect(moveHours(custom, rows, "A", "B", 2.3, 1)).toEqual({ A: 3.5, B: 5, unknown: 9 });
    expect(moveHours(custom, rows, "A", "B", 99, 1)).toEqual({ A: 2.5, B: 6, unknown: 9 });
    expect(moveHours(custom, rows, "A", "B", 99, 0.5)).toEqual({ A: 2, B: 6.5, unknown: 9 });
    expect(custom).toEqual({ A: 5.5, B: 3, unknown: 9 });
    expect(moveHours({}, rows, "A", "B", 0.5, NaN)).toEqual({ A: 5, B: 3.5 });
  });
  it("returns the identical object when no transfer is possible", () => {
    const custom = { A: 2.5, B: 3 };
    for (const [from, to, hours, step] of [
      ["A", "A", 1, 0.5], ["unknown", "B", 1, 0.5], ["A", "unknown", 1, 0.5],
      ["A", "B", 1, 1], ["A", "B", 0, 0.5], ["A", "B", -1, 0.5],
    ] as const) expect(moveHours(custom, rows, from, to, hours, step)).toBe(custom);
    const below = { A: 1, B: 3 };
    expect(moveHours(below, rows, "A", "B", 1, 0.5)).toBe(below);
  });
});

it("preserves recommender invariants on hundreds of randomized plans", () => {
  const rand = rng(42);
  let checked = 0;
  for (let iteration = 0; iteration < 400; iteration++) {
    const topics: HoursTopicInput[] = Array.from({ length: 1 + Math.floor(rand() * 9) }, (_, i) => {
      const currentHours = Math.round(rand() * 40) / 2;
      const rate = rand() < 0.15 ? null : rand();
      return { key: `T${i}`, topicId: `T${i}`, topicName: `Topic ${i}`, currentHours,
        minHours: Math.round(rand() * 16) / 2, rate, sufficient: rate !== null && rand() > 0.1,
        students: 50, answers: 300, hasResults: rate !== null };
    });
    const budget = Math.max(0, Math.round((topics.reduce((s, t) => s + t.currentHours, 0) + (rand() - 0.5) * 20) * 2) / 2);
    const p = params(budget, { stepHours: rand() < 0.5 ? 1 : 0.5, maxDecreaseShare: rand(), maxIncreaseShare: rand() * 3 });
    const plan = recommendHours(topics, p);
    if (!plan.ok) {
      expect(plan.kind).toBe("budget_below_minimum");
      continue;
    }
    checked++;
    const result = evaluateScenario(plan.rows, initialScenario(plan.rows, "recommended"), p);
    expect(result.valid).toBe(true);
    expect(result.custom.total + result.custom.remaining).toBe(budget);
    expect(result.custom.total).toBe(plan.recommendedTotal);
  }
  expect(checked).toBeGreaterThan(200);
});
