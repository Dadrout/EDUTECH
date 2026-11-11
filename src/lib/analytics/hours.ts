import type { HoursConfig } from "@/lib/config/analysis-config";
import type { CurriculumEntry, MasteryLevel } from "@/lib/domain/types";
import { makeTopicKey } from "@/lib/domain/types";
import { i18n } from "@/i18n/core";
import { formatHours, formatNumber, quote } from "@/lib/format";
import { naturalCompare } from "./filters";
import { toPct } from "./stats";
import type { TopicStats } from "./topics";

/**
 * Рекомендации по распределению учебных часов — прозрачная детерминированная эвристика.
 *
 * Это предложение для методиста, а не модель педагогической эффективности.
 *
 * Шаги:
 *  0. Проверка допустимости: сумма минимальных часов не может превышать бюджет.
 *  1. База: текущие часы, поднятые до минимума.
 *  2. Если база больше бюджета — сокращение по шагу, начиная с тем
 *     с наибольшим «освоение × доля сохранённых часов» (не ниже минимума).
 *  3. Темы ниже цели (получатели) получают часы по приоритету:
 *       приоритет = (цель − успешность) / цель,
 *       потребность = часы × maxIncrease × приоритет (округление до шага).
 *     Источник — свободный бюджет, затем темы-доноры с освоением не ниже цели:
 *       запас донора = часы × maxDecrease (округление вниз до шага), но не ниже минимума;
 *       первыми отдают темы с наибольшим освоением.
 *  4. Неиспользованный бюджет остаётся в резерве и показывается явно.
 * Темы с недостаточными данными не меняются по результатам тестирования.
 *
 * Внутри все расчёты ведутся в целых получасах, поэтому сумма часов
 * всегда точно равна бюджету, а отрицательные значения невозможны.
 */

export interface HoursTopicInput {
  key: string;
  topicId: string;
  topicName: string;
  currentHours: number;
  minHours: number;
  /** Доля правильных ответов (0..1) или null. */
  rate: number | null;
  sufficient: boolean;
  students: number;
  answers: number;
  hasResults: boolean;
}

export interface HoursParams extends HoursConfig {
  budgetHours: number;
  /** Порог среднего уровня (для формулировок). */
  mediumPct: number;
}

export type HoursRole = "recipient" | "donor" | "frozen" | "no_data";

export interface HoursRow {
  key: string;
  topicId: string;
  topicName: string;
  rate: number | null;
  level: MasteryLevel;
  students: number;
  answers: number;
  sufficient: boolean;
  currentHours: number;
  minHours: number;
  recommendedHours: number;
  changeHours: number;
  role: HoursRole;
  /** Приоритет дополнительного внимания 0..1 (только для тем ниже цели). */
  priority: number | null;
  /** Оценённая потребность в дополнительных часах. */
  demandHours: number;
  /** Максимум часов, который тема-донор может отдать. */
  releaseCapHours: number;
  reasons: string[];
}

export interface HoursPlan {
  ok: true;
  rows: HoursRow[];
  budgetHours: number;
  currentTotal: number;
  recommendedTotal: number;
  reserveHours: number;
  minTotal: number;
  movedHours: number;
  unmetDemandHours: number;
  warnings: string[];
}

export interface HoursConflict {
  ok: false;
  kind: "budget_below_minimum" | "invalid_input" | "no_topics";
  message: string;
  details: string[];
}

export type HoursResult = HoursPlan | HoursConflict;

const UNIT = 2; // 1 час = 2 расчётные единицы (шаг 0,5 ч)
const toU = (hours: number) => Math.round(hours * UNIT);
const fromU = (units: number) => units / UNIT;
const isHalfMultiple = (hours: number) => Math.abs(hours * UNIT - Math.round(hours * UNIT)) < 1e-9;

function validate(topics: HoursTopicInput[], p: HoursParams): string[] {
  const { t: tr, m } = i18n();
  const h = m.hoursPlan;
  const errors: string[] = [];
  if (!Number.isFinite(p.budgetHours) || p.budgetHours < 0) errors.push(h.errBudget);
  else if (!isHalfMultiple(p.budgetHours)) errors.push(h.errBudgetHalf);
  if (!Number.isFinite(p.stepHours) || p.stepHours <= 0 || !isHalfMultiple(p.stepHours)) errors.push(h.errStep);
  if (!Number.isFinite(p.targetPct) || p.targetPct <= 0 || p.targetPct > 100) errors.push(h.errTarget);
  if (!Number.isFinite(p.maxIncreaseShare) || p.maxIncreaseShare < 0 || p.maxIncreaseShare > 3) errors.push(h.errIncrease);
  if (!Number.isFinite(p.maxDecreaseShare) || p.maxDecreaseShare < 0 || p.maxDecreaseShare > 1) errors.push(h.errDecrease);
  for (const t of topics) {
    if (!Number.isFinite(t.currentHours) || t.currentHours < 0 || !isHalfMultiple(t.currentHours)) {
      errors.push(tr(h.errCurrent, { topic: quote(t.topicName) }));
    }
    if (!Number.isFinite(t.minHours) || t.minHours < 0 || !isHalfMultiple(t.minHours)) {
      errors.push(tr(h.errMin, { topic: quote(t.topicName) }));
    }
  }
  return errors;
}

function levelOf(pct: number | null, sufficient: boolean, p: HoursParams): MasteryLevel {
  if (pct === null || !sufficient) return "insufficient";
  if (pct >= p.targetPct) return "high";
  if (pct >= p.mediumPct) return "medium";
  return "low";
}

export function recommendHours(topics: HoursTopicInput[], params: HoursParams): HoursResult {
  const { t: tr, m } = i18n();
  const h = m.hoursPlan;
  const pctText = (v: number | null) => tr(m.units.percent, { n: formatNumber(v, 1) });
  const errors = validate(topics, params);
  if (errors.length > 0) {
    return { ok: false, kind: "invalid_input", message: h.invalidInput, details: errors };
  }
  if (topics.length === 0) {
    return { ok: false, kind: "no_topics", message: h.noTopics, details: [] };
  }

  const n = topics.length;
  const T = params.targetPct;
  const B = toU(params.budgetHours);
  const step = Math.max(1, toU(params.stepHours));
  const cur = topics.map((t) => toU(t.currentHours));
  const min = topics.map((t) => toU(t.minHours));
  const minTotal = min.reduce((s, v) => s + v, 0);

  if (minTotal > B) {
    const top = topics
      .map((t, i) => ({ t, m: min[i] }))
      .filter((x) => x.m > 0)
      .sort((a, b) => b.m - a.m)
      .slice(0, 5)
      .map((x) => tr(h.minItem, { topic: quote(x.t.topicName), hours: formatHours(fromU(x.m)) }));
    return {
      ok: false,
      kind: "budget_below_minimum",
      message: tr(h.budgetBelowMinimum, {
        budget: formatHours(params.budgetHours),
        minTotal: formatHours(fromU(minTotal)),
        shortfall: formatHours(fromU(minTotal - B)),
      }),
      details: top,
    };
  }

  const pct = topics.map((t) => (t.rate === null ? null : toPct(t.rate)));
  const usable = topics.map((t, i) => t.hasResults && t.sufficient && pct[i] !== null);
  const base = cur.map((c, i) => Math.max(c, min[i]));
  const alloc = [...base];

  const roles: HoursRole[] = topics.map((t, i) => {
    if (!t.hasResults) return "no_data";
    if (!usable[i]) return "frozen";
    return (pct[i] as number) < T ? "recipient" : "donor";
  });

  const priority = topics.map((_, i) => (roles[i] === "recipient" ? (T - (pct[i] as number)) / T : null));
  const demand = topics.map((_, i) => {
    if (roles[i] !== "recipient") return 0;
    const cap = Math.floor(base[i] * params.maxIncreaseShare);
    const raw = base[i] * params.maxIncreaseShare * (priority[i] as number);
    return Math.max(0, Math.min(cap, Math.round(raw / step) * step));
  });
  const releaseCap = topics.map((_, i) => {
    if (roles[i] !== "donor") return 0;
    const raw = base[i] * params.maxDecreaseShare;
    return Math.max(0, Math.min(base[i] - min[i], Math.floor(raw / step) * step));
  });

  // Шаг 2: приведение к бюджету при его нехватке.
  const cutBy = new Array<number>(n).fill(0);
  let deficit = alloc.reduce((s, v) => s + v, 0) - B;
  while (deficit > 0) {
    let best = -1;
    let bestScore = -Infinity;
    let bestSlack = 0;
    for (let i = 0; i < n; i++) {
      const slack = alloc[i] - min[i];
      if (slack <= 0) continue;
      const eff = usable[i] ? (pct[i] as number) : T;
      const score = (eff * alloc[i]) / Math.max(1, base[i]);
      if (score > bestScore || (score === bestScore && slack > bestSlack)) {
        best = i;
        bestScore = score;
        bestSlack = slack;
      }
    }
    if (best < 0) break; // недостижимо: сумма минимумов не превышает бюджет
    const amount = Math.min(step, deficit, bestSlack);
    alloc[best] -= amount;
    cutBy[best] += amount;
    deficit -= amount;
  }

  // Шаг 3: перераспределение в пользу тем с низким освоением.
  let pool = B - alloc.reduce((s, v) => s + v, 0);
  const given = new Array<number>(n).fill(0);
  const released = new Array<number>(n).fill(0);
  const remainingRelease = releaseCap.map((cap, i) => Math.max(0, cap - cutBy[i]));
  const guardLimit = 100_000;
  for (let guard = 0; guard < guardLimit; guard++) {
    let r = -1;
    let rScore = -Infinity;
    for (let i = 0; i < n; i++) {
      const unmet = demand[i] - given[i];
      if (unmet <= 0) continue;
      const score = (priority[i] as number) * (unmet / demand[i]);
      if (score > rScore) {
        r = i;
        rScore = score;
      }
    }
    if (r < 0) break;
    const want = Math.min(step, demand[r] - given[r]);
    let amount = 0;
    if (pool > 0) {
      amount = Math.min(want, pool);
      pool -= amount;
    } else {
      let d = -1;
      let dScore = -Infinity;
      for (let i = 0; i < n; i++) {
        if (remainingRelease[i] <= 0 || alloc[i] - min[i] <= 0) continue;
        // Первыми отдают темы с наибольшим освоением; по мере отдачи их очередь снижается.
        const score = (pct[i] as number) * (remainingRelease[i] / releaseCap[i]);
        if (score > dScore) {
          d = i;
          dScore = score;
        }
      }
      if (d < 0) break;
      amount = Math.min(want, remainingRelease[d], alloc[d] - min[d]);
      alloc[d] -= amount;
      remainingRelease[d] -= amount;
      released[d] += amount;
    }
    alloc[r] += amount;
    given[r] += amount;
  }
  const reserve = pool;

  // Инварианты: бюджет соблюдён, минимумы не нарушены.
  const allocTotal = alloc.reduce((s, v) => s + v, 0);
  if (allocTotal + reserve !== B || alloc.some((a, i) => a < min[i] || a < 0)) {
    return {
      ok: false,
      kind: "invalid_input",
      message: h.internalCheck,
      details: [tr(h.internalCheckDetail, { sum: fromU(allocTotal), reserve: fromU(reserve), budget: fromU(B) })],
    };
  }

  const rows: HoursRow[] = topics.map((t, i) => {
    const reasons: string[] = [];
    const p = pct[i];
    if (cur[i] < min[i]) {
      reasons.push(tr(h.raisedToMin, { current: formatHours(fromU(cur[i])), min: formatHours(fromU(min[i])) }));
    }
    if (roles[i] === "no_data") {
      reasons.push(h.noResults);
    } else if (roles[i] === "frozen") {
      reasons.push(tr(h.insufficient, { students: t.students, answers: t.answers }));
    } else if (roles[i] === "recipient") {
      reasons.push(
        tr(h.belowTarget, {
          level: (p as number) < params.mediumPct ? h.levelLow : h.levelMedium,
          rate: pctText(p),
          target: tr(m.units.percent, { n: formatNumber(T, 0) }),
          gap: tr(m.units.pp, { n: formatNumber(T - (p as number), 1) }),
          priority: formatNumber(priority[i], 2),
        }),
      );
      if (given[i] > 0) {
        reasons.push(
          given[i] < demand[i]
            ? tr(h.addedPartial, { given: formatHours(fromU(given[i])), demand: formatHours(fromU(demand[i])) })
            : tr(h.addedFull, { given: formatHours(fromU(given[i])) }),
        );
      } else if (demand[i] === 0) {
        reasons.push(tr(h.belowStep, { step: formatHours(params.stepHours) }));
      } else {
        reasons.push(h.noFreeHours);
      }
    } else {
      reasons.push(tr(h.high, { rate: pctText(p) }));
      if (released[i] > 0) {
        reasons.push(tr(h.released, { hours: formatHours(fromU(released[i])), min: formatHours(fromU(min[i])) }));
      } else if (releaseCap[i] === 0) {
        reasons.push(h.releaseLimited);
      } else if (cutBy[i] === 0) {
        reasons.push(h.releaseNotNeeded);
      }
    }
    if (cutBy[i] > 0) {
      reasons.push(tr(h.cut, { hours: formatHours(fromU(cutBy[i])) }));
    }
    return {
      key: t.key,
      topicId: t.topicId,
      topicName: t.topicName,
      rate: t.rate,
      level: levelOf(p, usable[i], params),
      students: t.students,
      answers: t.answers,
      sufficient: t.sufficient,
      currentHours: fromU(cur[i]),
      minHours: fromU(min[i]),
      recommendedHours: fromU(alloc[i]),
      changeHours: fromU(alloc[i] - cur[i]),
      role: roles[i],
      priority: priority[i],
      demandHours: fromU(demand[i]),
      releaseCapHours: fromU(releaseCap[i]),
      reasons,
    };
  });

  const currentTotal = fromU(cur.reduce((s, v) => s + v, 0));
  const unmet = demand.reduce((s, d, i) => s + Math.max(0, d - given[i]), 0);
  const warnings: string[] = [];
  if (B !== toU(currentTotal)) {
    warnings.push(tr(h.budgetDiffers, { budget: formatHours(fromU(B)), current: formatHours(currentTotal) }));
  }
  if (unmet > 0) {
    warnings.push(tr(h.unmet, { hours: formatHours(fromU(unmet)) }));
  }
  if (reserve > 0) {
    warnings.push(tr(h.reserveLeft, { hours: formatHours(fromU(reserve)) }));
  }

  return {
    ok: true,
    rows,
    budgetHours: fromU(B),
    currentTotal,
    recommendedTotal: fromU(allocTotal),
    reserveHours: fromU(reserve),
    minTotal: fromU(minTotal),
    movedHours: fromU(given.reduce((s, v) => s + v, 0)),
    unmetDemandHours: fromU(unmet),
    warnings,
  };
}

export interface HoursInputsResult {
  inputs: HoursTopicInput[];
  /** Темы с результатами тестирования, отсутствующие в учебном плане. */
  unplanned: TopicStats[];
}

/** Сопоставить учебный план (предмет + параллель) со статистикой тем. */
export function buildHoursInputs(
  curriculum: CurriculumEntry[],
  topicStats: TopicStats[],
  subject: string,
  grade: number,
): HoursInputsResult {
  const statsByKey = new Map(topicStats.map((t) => [t.key, t]));
  const plan = curriculum
    .filter((c) => c.subject === subject && c.grade === grade)
    .sort((a, b) => naturalCompare(a.topicId, b.topicId));
  const planned = new Set<string>();
  const inputs = plan.map((c) => {
    const key = makeTopicKey(c.subject, c.grade, c.topicId);
    planned.add(key);
    const s = statsByKey.get(key);
    return {
      key,
      topicId: c.topicId,
      topicName: s?.topicName ?? c.topicName ?? c.topicId,
      currentHours: c.currentHours,
      minHours: c.minHours,
      rate: s?.rate ?? null,
      sufficient: s?.sufficient ?? false,
      students: s?.students ?? 0,
      answers: s?.answers ?? 0,
      hasResults: Boolean(s && s.answers > 0),
    } satisfies HoursTopicInput;
  });
  const unplanned = topicStats.filter((t) => t.subject === subject && t.grade === grade && !planned.has(t.key));
  return { inputs, unplanned };
}

/** Сумма текущих часов плана для предмета и параллели. */
export function planTotal(curriculum: CurriculumEntry[], subject: string, grade: number): number {
  return curriculum.filter((c) => c.subject === subject && c.grade === grade).reduce((s, c) => s + c.currentHours, 0);
}
