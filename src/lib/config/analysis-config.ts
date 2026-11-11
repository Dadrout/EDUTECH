/**
 * Централизованные параметры анализа.
 *
 * ВАЖНО: пороги уровней освоения — начальная настройка MVP,
 * а не образовательный стандарт, установленный организаторами.
 * Методист может изменить их в интерфейсе («Параметры анализа»),
 * а значения по умолчанию — здесь.
 */

export interface MasteryThresholds {
  /** Не ниже этого процента — высокий уровень освоения. */
  high: number;
  /** Не ниже этого процента (и ниже high) — средний уровень. Ниже — низкий. */
  medium: number;
}

export interface AnalysisConfig {
  thresholds: MasteryThresholds;
  /** Минимум учеников, чтобы делать вывод о сложности темы. */
  minStudentsPerTopic: number;
  /** Минимум ответов, чтобы делать вывод о сложности темы. */
  minAnswersPerTopic: number;
  /** Минимум ответов ученика по предмету, чтобы отнести его к уровню освоения. */
  minAnswersPerStudent: number;
  /** Минимум учеников в ячейке «класс × тема» тепловой карты. */
  minStudentsPerCell: number;
  /** Минимум учеников в группе учебника для сравнения. */
  minStudentsPerGroup: number;
  /** Минимум общих заданий, чтобы сравнивать учебники по теме. */
  minCommonQuestions: number;
  /** z-квантиль для 95% доверительного интервала. */
  confidenceZ: number;
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  thresholds: { high: 80, medium: 60 },
  minStudentsPerTopic: 10,
  minAnswersPerTopic: 30,
  minAnswersPerStudent: 10,
  minStudentsPerCell: 5,
  minStudentsPerGroup: 10,
  minCommonQuestions: 3,
  confidenceZ: 1.96,
};

/** Параметры эвристики перераспределения учебных часов. */
export interface HoursConfig {
  /** Целевой уровень освоения, %. По умолчанию — порог высокого уровня. */
  targetPct: number;
  /** Максимальное увеличение часов темы, доля от текущих (0.5 = +50%). */
  maxIncreaseShare: number;
  /** Максимальное добровольное сокращение темы-донора, доля (0.25 = −25%). */
  maxDecreaseShare: number;
  /** Шаг изменения часов. */
  stepHours: number;
}

export function defaultHoursConfig(analysis: AnalysisConfig): HoursConfig {
  return {
    targetPct: analysis.thresholds.high,
    maxIncreaseShare: 0.5,
    maxDecreaseShare: 0.25,
    stepHours: 1,
  };
}

/** Проверка согласованности параметров, возвращает список ошибок. */
export function validateAnalysisConfig(config: AnalysisConfig): string[] {
  const errors: string[] = [];
  const { high, medium } = config.thresholds;
  if (!(medium > 0 && medium < 100)) errors.push("Порог среднего уровня должен быть в диапазоне 1–99%.");
  if (!(high > 0 && high <= 100)) errors.push("Порог высокого уровня должен быть в диапазоне 1–100%.");
  if (!(high > medium)) errors.push("Порог высокого уровня должен быть больше порога среднего.");
  const positiveInts: [keyof AnalysisConfig, string][] = [
    ["minStudentsPerTopic", "Минимум учеников на тему"],
    ["minAnswersPerTopic", "Минимум ответов на тему"],
    ["minAnswersPerStudent", "Минимум ответов ученика по предмету"],
    ["minStudentsPerCell", "Минимум учеников в ячейке"],
    ["minStudentsPerGroup", "Минимум учеников в группе учебника"],
    ["minCommonQuestions", "Минимум общих заданий"],
  ];
  for (const [key, label] of positiveInts) {
    const value = config[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      errors.push(`${label}: требуется целое число не меньше 1.`);
    }
  }
  return errors;
}
