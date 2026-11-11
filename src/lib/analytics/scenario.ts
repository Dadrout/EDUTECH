/**
 * What-if симулятор учебного плана: проверка пользовательского распределения
 * часов и сравнение трёх планов (текущий, рекомендованный, пользовательский).
 *
 * Никаких прогнозов успеваемости: оцениваются только часы, ограничения
 * и то, куда смещаются часы относительно приоритетов существующего алгоритма.
 *
 * Чистые расчёты без состояния интерфейса; допустимость сценария
 * определяется бюджетом, минимумами и получасовым шагом.
 */
import type { HoursParams, HoursRow } from "./hours";

/** Часы пользовательского плана по ключу темы (HoursRow.key). */
export type ScenarioHours = Record<string, number>;

export type ScenarioIssueKind =
  /** Ошибки: план недопустим. */
  | "below_minimum"
  | "negative"
  | "not_half_hour"
  | "over_budget"
  /** Предупреждения: план допустим, но методисту стоит знать. */
  | "under_budget"
  | "above_max_increase"
  | "below_max_decrease"
  | "changed_without_data";

export interface ScenarioIssue {
  kind: ScenarioIssueKind;
  severity: "error" | "warning";
  /** Тема, к которой относится проблема; для бюджета — не задано. */
  key?: string;
  topicName?: string;
  /** Часы темы (или сумма плана для бюджета). */
  hours: number;
  /** Граница, которая нарушена или достигнута: минимум, бюджет, допустимое увеличение и т. п. */
  limit: number;
}

export interface PlanSummary {
  total: number;
  /** budget − total: положительное — резерв, отрицательное — превышение. */
  remaining: number;
  /** Число тем, часы которых отличаются от текущего плана. */
  changedTopics: number;
  /** Сумма увеличений относительно текущего плана (= сумма сокращений при неизменной сумме). */
  movedHours: number;
  /** Часы на темы с успешностью ниже цели (только темы с достаточными данными). */
  hoursBelowTarget: number;
  /** hoursBelowTarget / total; null при total = 0. */
  shareBelowTarget: number | null;
  /**
   * Сдвиг к приоритетам: Σ priorityᵢ × (hoursᵢ − currentᵢ) по темам ниже цели,
   * где priorityᵢ = (цель − успешность) / цель — та же формула, что в рекомендациях.
   * Это мера направленности перераспределения, НЕ прогноз роста знаний.
   */
  priorityShift: number;
}

export interface ScenarioRow {
  key: string;
  topicId: string;
  topicName: string;
  rate: number | null;
  sufficient: boolean;
  /** Приоритет из алгоритма рекомендаций (null — тема не ниже цели или данных мало). */
  priority: number | null;
  minHours: number;
  current: number;
  recommended: number;
  custom: number;
  /** custom − current */
  deltaCurrent: number;
  /** custom − recommended */
  deltaRecommended: number;
}

export interface ScenarioEvaluation {
  rows: ScenarioRow[];
  current: PlanSummary;
  recommended: PlanSummary;
  custom: PlanSummary;
  issues: ScenarioIssue[];
  /** Нет ни одной проблемы с severity = "error". */
  valid: boolean;
}

const EPSILON = 1e-9;
const toU = (hours: number) => Math.round(hours * 2);
const fromU = (units: number) => units / 2;
const isHalfMultiple = (hours: number) => Number.isFinite(hours) && Math.abs(hours * 2 - toU(hours)) < EPSILON;
// Valid edits use integer units. Preserve invalid fractions so validation and
// summaries still show the actual edit rather than silently rounding it away.
const unitsOf = (hours: number) => isHalfMultiple(hours) ? toU(hours) : hours * 2;
const differs = (a: number, b: number) => Math.abs(a - b) > EPSILON;
const stepUnits = (hours: number) => isHalfMultiple(hours) && toU(hours) > 0 ? toU(hours) : 1;
const hoursFor = (custom: ScenarioHours, row: HoursRow) =>
  Object.prototype.hasOwnProperty.call(custom, row.key) ? custom[row.key] : row.currentHours;

/**
 * Начальный пользовательский план — копия рекомендованного (или текущего).
 */
export function initialScenario(rows: HoursRow[], from: "recommended" | "current"): ScenarioHours {
  return Object.fromEntries(rows.map((row) => [row.key, from === "recommended" ? row.recommendedHours : row.currentHours]));
}

/** Округлить часы до шага (кратно 0,5 ч) и не ниже 0. */
export function snapHours(value: number, stepHours: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = stepUnits(stepHours);
  return fromU(Math.round(value * 2 / step) * step);
}

function summarize(rows: HoursRow[], hours: number[], params: HoursParams): PlanSummary {
  let totalU = 0;
  let movedU = 0;
  let belowU = 0;
  let changedTopics = 0;
  let priorityShift = 0;
  rows.forEach((row, i) => {
    const units = unitsOf(hours[i]);
    const deltaU = units - toU(row.currentHours);
    totalU += units;
    movedU += Math.max(0, deltaU);
    if (differs(deltaU, 0)) changedTopics++;
    if (row.sufficient && row.rate !== null && row.rate * 100 < params.targetPct) {
      belowU += units;
      priorityShift += (params.targetPct - row.rate * 100) / params.targetPct * fromU(deltaU);
    }
  });
  return {
    total: fromU(totalU),
    remaining: fromU(toU(params.budgetHours) - totalU),
    changedTopics,
    movedHours: fromU(movedU),
    hoursBelowTarget: fromU(belowU),
    shareBelowTarget: totalU === 0 ? null : belowU / totalU,
    priorityShift,
  };
}

/**
 * Проверить пользовательский план и сравнить его с текущим и рекомендованным.
 * rows — строки успешно построенного плана (HoursResult при ok = true).
 */
export function evaluateScenario(rows: HoursRow[], custom: ScenarioHours, params: HoursParams): ScenarioEvaluation {
  const current = summarize(rows, rows.map((row) => row.currentHours), params);
  const recommended = summarize(rows, rows.map((row) => row.recommendedHours), params);
  const rawHours = rows.map((row) => hoursFor(custom, row));
  // Invalid numeric edits must remain errors without contaminating the view
  // with NaN/Infinity. Keep the current allocation in the displayed totals
  // until that edit is corrected; such a scenario cannot be exported as valid.
  const customHours = rawHours.map((hours, i) => Number.isFinite(hours) ? hours : rows[i].currentHours);
  const summary = summarize(rows, customHours, params);
  const errors: ScenarioIssue[] = [];
  const warnings: ScenarioIssue[] = [];
  if (summary.total > params.budgetHours + EPSILON) {
    errors.push({ kind: "over_budget", severity: "error", hours: summary.total, limit: params.budgetHours });
  } else if (summary.total < params.budgetHours - EPSILON) {
    warnings.push({ kind: "under_budget", severity: "warning", hours: summary.total, limit: params.budgetHours });
  }
  const scenarioRows = rows.map((row, i): ScenarioRow => {
    const hours = customHours[i];
    const issue = (kind: ScenarioIssueKind, severity: ScenarioIssue["severity"], limit: number) => {
      (severity === "error" ? errors : warnings).push({
        kind, severity, key: row.key, topicName: row.topicName, hours, limit,
      });
    };
    if (hours < -EPSILON) issue("negative", "error", 0);
    if (!isHalfMultiple(rawHours[i])) issue("not_half_hour", "error", 0.5);
    if (hours < row.minHours - EPSILON) issue("below_minimum", "error", row.minHours);
    const increaseLimit = row.currentHours * (1 + params.maxIncreaseShare);
    const decreaseLimit = row.currentHours * (1 - params.maxDecreaseShare);
    if (hours > increaseLimit + EPSILON) issue("above_max_increase", "warning", increaseLimit);
    if (hours < row.currentHours - EPSILON && hours < decreaseLimit - EPSILON && hours >= row.minHours - EPSILON) {
      issue("below_max_decrease", "warning", decreaseLimit);
    }
    if ((!row.sufficient || row.rate === null) && differs(hours, row.currentHours)) {
      issue("changed_without_data", "warning", row.currentHours);
    }
    return {
      key: row.key, topicId: row.topicId, topicName: row.topicName,
      rate: row.rate, sufficient: row.sufficient, priority: row.priority,
      minHours: row.minHours, current: row.currentHours, recommended: row.recommendedHours,
      custom: hours,
      deltaCurrent: fromU(unitsOf(hours) - toU(row.currentHours)),
      deltaRecommended: fromU(unitsOf(hours) - toU(row.recommendedHours)),
    };
  });
  return { rows: scenarioRows, current, recommended, custom: summary, issues: [...errors, ...warnings], valid: errors.length === 0 };
}

/**
 * Перенести часы с темы from на тему to с соблюдением минимума и шага.
 * Возвращает новый план; если перенос невозможен — исходный объект.
 */
export function moveHours(custom: ScenarioHours, rows: HoursRow[], fromKey: string, toKey: string, hours: number, stepHours: number): ScenarioHours {
  if (fromKey === toKey) return custom;
  const from = rows.find((row) => row.key === fromKey);
  const to = rows.find((row) => row.key === toKey);
  if (!from || !to) return custom;
  const fromHours = hoursFor(custom, from);
  const toHours = hoursFor(custom, to);
  if (!isHalfMultiple(fromHours) || !isHalfMultiple(toHours)) return custom;
  const step = stepUnits(stepHours);
  const available = Math.max(0, toU(fromHours) - toU(from.minHours));
  const amount = Math.min(toU(snapHours(hours, stepHours)), Math.floor(available / step) * step);
  if (amount <= 0) return custom;
  return { ...custom, [fromKey]: fromU(toU(fromHours) - amount), [toKey]: fromU(toU(toHours) + amount) };
}
