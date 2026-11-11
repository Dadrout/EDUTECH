/**
 * What-if симулятор учебного плана: проверка пользовательского распределения
 * часов и сравнение трёх планов (текущий, рекомендованный, пользовательский).
 *
 * Никаких прогнозов успеваемости: оцениваются только часы, ограничения
 * и то, куда смещаются часы относительно приоритетов существующего алгоритма.
 *
 * КОНТРАКТ: типы и сигнатуры зафиксированы — на них опирается интерфейс.
 * Реализация — задача Codex (см. docs/tasks/codex-2-scenario.md).
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

/**
 * Начальный пользовательский план — копия рекомендованного (или текущего).
 */
export function initialScenario(rows: HoursRow[], from: "recommended" | "current"): ScenarioHours {
  void rows;
  void from;
  throw new Error("initialScenario: not implemented");
}

/** Округлить часы до шага (кратно 0,5 ч) и не ниже 0. */
export function snapHours(value: number, stepHours: number): number {
  void value;
  void stepHours;
  throw new Error("snapHours: not implemented");
}

/**
 * Проверить пользовательский план и сравнить его с текущим и рекомендованным.
 * rows — строки успешно построенного плана (HoursResult при ok = true).
 */
export function evaluateScenario(rows: HoursRow[], custom: ScenarioHours, params: HoursParams): ScenarioEvaluation {
  void rows;
  void custom;
  void params;
  throw new Error("evaluateScenario: not implemented");
}

/**
 * Перенести часы с темы from на тему to с соблюдением минимума и шага.
 * Возвращает новый план; если перенос невозможен — исходный объект.
 */
export function moveHours(custom: ScenarioHours, rows: HoursRow[], fromKey: string, toKey: string, hours: number, stepHours: number): ScenarioHours {
  void custom;
  void rows;
  void fromKey;
  void toKey;
  void hours;
  void stepHours;
  throw new Error("moveHours: not implemented");
}
