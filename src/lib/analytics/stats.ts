import type { AnalysisConfig, MasteryThresholds } from "@/lib/config/analysis-config";
import type { DifficultyStatus, MasteryLevel } from "@/lib/domain/types";

/** Доля правильных ответов; null, если ответов нет (никакого деления на ноль). */
export function safeRate(correct: number, total: number): number | null {
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;
  return correct / total;
}

/** Перевод доли в проценты с устранением артефактов плавающей точки (0.29*100 → 29). */
export function toPct(rate: number): number {
  return Math.round(rate * 100 * 1e6) / 1e6;
}

export interface ClusterCount {
  correct: number;
  total: number;
}

export interface ProportionEstimate {
  /** Доля правильных ответов (0..1). */
  rate: number;
  /** Границы 95% доверительного интервала (0..1). */
  ciLow: number;
  ciHigh: number;
  /** Стандартная ошибка (0..1); null, если кластеров меньше двух. */
  se: number | null;
  clusters: number;
  correct: number;
  total: number;
}

/**
 * Интервал Уилсона для доли (предполагает независимость ответов).
 * Используется как нижняя граница неопределённости.
 */
export function wilsonInterval(correct: number, total: number, z: number): [number, number] | null {
  if (total <= 0) return null;
  const p = correct / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/**
 * Оценка доли с учётом кластеризации по ученикам.
 *
 * Ответы одного ученика не независимы, поэтому стандартная ошибка считается
 * по ученикам (ratio estimator для кластерной выборки):
 *   p = Σc / Σn,  Var(p) ≈ Σ(c_j − p·n_j)² / (k(k−1)·n̄²)
 * Итоговый интервал — объединение кластерного интервала и интервала Уилсона,
 * чтобы не получить ложную точность (например, при p = 100%).
 */
export function clusteredProportion(clusters: ClusterCount[], z: number): ProportionEstimate | null {
  let correct = 0;
  let total = 0;
  let k = 0;
  for (const c of clusters) {
    if (c.total <= 0) continue;
    correct += c.correct;
    total += c.total;
    k += 1;
  }
  const rate = safeRate(correct, total);
  if (rate === null) return null;

  let se: number | null = null;
  if (k >= 2) {
    const meanSize = total / k;
    let sumSq = 0;
    for (const c of clusters) {
      if (c.total <= 0) continue;
      const resid = c.correct - rate * c.total;
      sumSq += resid * resid;
    }
    const variance = sumSq / (k * (k - 1) * meanSize * meanSize);
    se = Math.sqrt(Math.max(0, variance));
  }

  const wilson = wilsonInterval(correct, total, z) ?? [rate, rate];
  let ciLow = wilson[0];
  let ciHigh = wilson[1];
  if (se !== null) {
    ciLow = Math.min(ciLow, rate - z * se);
    ciHigh = Math.max(ciHigh, rate + z * se);
  } else {
    // Один ученик: вывод о теме невозможен — интервал максимально широкий.
    ciLow = 0;
    ciHigh = 1;
  }
  return {
    rate,
    ciLow: Math.max(0, ciLow),
    ciHigh: Math.min(1, ciHigh),
    se,
    clusters: k,
    correct,
    total,
  };
}

export interface DifferenceEstimate {
  /** Разница долей a − b (−1..1). */
  diff: number;
  ciLow: number;
  ciHigh: number;
  /** Интервал не включает 0. */
  significant: boolean;
}

/** Разница двух независимых долей с нормальной аппроксимацией. */
export function differenceOfProportions(
  a: ProportionEstimate | null,
  b: ProportionEstimate | null,
  z: number,
): DifferenceEstimate | null {
  if (!a || !b || a.se === null || b.se === null) return null;
  const diff = a.rate - b.rate;
  const se = Math.sqrt(a.se * a.se + b.se * b.se);
  const ciLow = diff - z * se;
  const ciHigh = diff + z * se;
  return { diff, ciLow, ciHigh, significant: ciLow > 0 || ciHigh < 0 };
}

/** Уровень освоения по точечной оценке. */
export function classifyLevel(rate: number | null, thresholds: MasteryThresholds): MasteryLevel {
  if (rate === null) return "insufficient";
  const pct = toPct(rate);
  if (pct >= thresholds.high) return "high";
  if (pct >= thresholds.medium) return "medium";
  return "low";
}

export interface SampleInfo {
  students: number;
  answers: number;
}

export function isSampleSufficient(sample: SampleInfo, config: AnalysisConfig): boolean {
  return sample.students >= config.minStudentsPerTopic && sample.answers >= config.minAnswersPerTopic;
}

/**
 * Статус сложности темы.
 * «Сложная» — успешность ниже порога среднего уровня и верхняя граница
 * доверительного интервала тоже ниже порога (вывод надёжен).
 * «Вероятно сложная» — точечная оценка ниже порога, но интервал его пересекает.
 */
export function classifyDifficulty(
  estimate: ProportionEstimate | null,
  sufficient: boolean,
  thresholds: MasteryThresholds,
): DifficultyStatus {
  if (!estimate || !sufficient) return "insufficient";
  const level = classifyLevel(estimate.rate, thresholds);
  if (level === "high") return "mastered";
  if (level === "medium") return "attention";
  return toPct(estimate.ciHigh) < thresholds.medium ? "difficult" : "likely_difficult";
}

export function isProblemStatus(status: DifficultyStatus): boolean {
  return status === "difficult" || status === "likely_difficult";
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}
