import { describe, expect, it } from "vitest";
import {
  classifyDifficulty,
  classifyLevel,
  clusteredProportion,
  differenceOfProportions,
  safeRate,
  toPct,
  wilsonInterval,
} from "@/lib/analytics/stats";
import { config } from "./helpers";

describe("процент успешности", () => {
  it("считает долю правильных ответов", () => {
    expect(safeRate(3, 4)).toBe(0.75);
    expect(safeRate(0, 5)).toBe(0);
    expect(safeRate(5, 5)).toBe(1);
  });

  it("не делит на ноль и не возвращает NaN", () => {
    expect(safeRate(0, 0)).toBeNull();
    expect(safeRate(1, 0)).toBeNull();
    expect(safeRate(Number.NaN, 4)).toBeNull();
    expect(safeRate(1, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("убирает артефакты плавающей точки при переводе в проценты", () => {
    expect(toPct(0.29)).toBe(29);
    expect(toPct(0.6)).toBe(60);
    expect(toPct(0.07)).toBe(7);
  });
});

describe("кластерная оценка доли", () => {
  it("возвращает null для пустой выборки", () => {
    expect(clusteredProportion([], 1.96)).toBeNull();
    expect(clusteredProportion([{ correct: 0, total: 0 }], 1.96)).toBeNull();
  });

  it("совпадает с объединённой долей и даёт корректный интервал", () => {
    const clusters = [
      { correct: 3, total: 4 },
      { correct: 1, total: 4 },
      { correct: 2, total: 4 },
      { correct: 4, total: 4 },
    ];
    const est = clusteredProportion(clusters, 1.96)!;
    expect(est.rate).toBeCloseTo(10 / 16, 10);
    expect(est.clusters).toBe(4);
    expect(est.ciLow).toBeLessThan(est.rate);
    expect(est.ciHigh).toBeGreaterThan(est.rate);
    expect(est.ciLow).toBeGreaterThanOrEqual(0);
    expect(est.ciHigh).toBeLessThanOrEqual(1);
    // При равных размерах кластеров SE = sd(долей учеников)/sqrt(k)
    const props = [0.75, 0.25, 0.5, 1];
    const m = props.reduce((s, v) => s + v, 0) / 4;
    const sd = Math.sqrt(props.reduce((s, v) => s + (v - m) ** 2, 0) / 3);
    expect(est.se!).toBeCloseTo(sd / Math.sqrt(4), 10);
  });

  it("для одного ученика не делает выводов (интервал 0–100%)", () => {
    const est = clusteredProportion([{ correct: 5, total: 5 }], 1.96)!;
    expect(est.se).toBeNull();
    expect(est.ciLow).toBe(0);
    expect(est.ciHigh).toBe(1);
  });

  it("не даёт нулевой ширины интервала при 100% у всех", () => {
    const est = clusteredProportion(
      Array.from({ length: 12 }, () => ({ correct: 3, total: 3 })),
      1.96,
    )!;
    expect(est.rate).toBe(1);
    expect(est.ciLow).toBeLessThan(1);
  });

  it("интервал Уилсона корректен на границах", () => {
    expect(wilsonInterval(0, 0, 1.96)).toBeNull();
    const [lo, hi] = wilsonInterval(0, 10, 1.96)!;
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0);
  });
});

describe("разница долей", () => {
  it("значима, когда интервал не включает ноль", () => {
    const a = clusteredProportion(Array.from({ length: 40 }, (_, i) => ({ correct: i % 5 === 0 ? 3 : 5, total: 5 })), 1.96);
    const b = clusteredProportion(Array.from({ length: 40 }, (_, i) => ({ correct: i % 5 === 0 ? 3 : 2, total: 5 })), 1.96);
    const d = differenceOfProportions(a, b, 1.96)!;
    expect(d.diff).toBeGreaterThan(0.4);
    expect(d.significant).toBe(true);
  });

  it("возвращает null без стандартной ошибки", () => {
    const one = clusteredProportion([{ correct: 1, total: 2 }], 1.96);
    const many = clusteredProportion([{ correct: 1, total: 2 }, { correct: 2, total: 2 }], 1.96);
    expect(differenceOfProportions(one, many, 1.96)).toBeNull();
    expect(differenceOfProportions(null, many, 1.96)).toBeNull();
  });
});

describe("уровни освоения и статус сложности", () => {
  const th = config.thresholds;
  it("использует границы порогов включительно", () => {
    expect(classifyLevel(0.8, th)).toBe("high");
    expect(classifyLevel(0.7999, th)).toBe("medium");
    expect(classifyLevel(0.6, th)).toBe("medium");
    expect(classifyLevel(0.5999, th)).toBe("low");
    expect(classifyLevel(null, th)).toBe("insufficient");
  });

  it("учитывает изменённые пороги", () => {
    expect(classifyLevel(0.72, { high: 70, medium: 50 })).toBe("high");
    expect(classifyLevel(0.55, { high: 70, medium: 50 })).toBe("medium");
  });

  it("различает подтверждённо и вероятно сложные темы", () => {
    const confirmed = { rate: 0.4, ciLow: 0.35, ciHigh: 0.45, se: 0.02, clusters: 50, correct: 40, total: 100 };
    const uncertain = { rate: 0.55, ciLow: 0.45, ciHigh: 0.65, se: 0.05, clusters: 50, correct: 55, total: 100 };
    expect(classifyDifficulty(confirmed, true, th)).toBe("difficult");
    expect(classifyDifficulty(uncertain, true, th)).toBe("likely_difficult");
    expect(classifyDifficulty(confirmed, false, th)).toBe("insufficient");
    expect(classifyDifficulty(null, true, th)).toBe("insufficient");
  });
});
