"use client";

import * as React from "react";
import { getFilterOptions, filtersEqual, listCourses, sanitizeFilters, type FilterOptions } from "@/lib/analytics/filters";
import { DEFAULT_ANALYSIS_CONFIG, validateAnalysisConfig, type AnalysisConfig } from "@/lib/config/analysis-config";
import { fetchDemoDataset } from "@/lib/data/dataset";
import { clearStoredDataset, loadStoredDataset, readLocal, saveDataset, writeLocal } from "@/lib/data/storage";
import { EMPTY_FILTERS, type DataFilters, type Dataset } from "@/lib/domain/types";
import { i18n } from "@/i18n/core";
import { useI18n } from "@/i18n/provider";

type Status = "loading" | "ready" | "error";

interface DataContextValue {
  status: Status;
  error: string | null;
  dataset: Dataset | null;
  filters: DataFilters;
  /** Варианты фильтров для текущего набора данных (каскадно). */
  options: FilterOptions;
  courses: { subject: string; grade: number }[];
  config: AnalysisConfig;
  setFilters: (patch: Partial<DataFilters>) => void;
  resetFilters: () => void;
  setConfig: (config: AnalysisConfig) => void;
  /** Заменить набор данных (после импорта). Возвращает false, если не удалось сохранить в браузере. */
  replaceDataset: (dataset: Dataset) => Promise<boolean>;
  restoreDemo: () => Promise<void>;
  retry: () => void;
}

const DataContext = React.createContext<DataContextValue | null>(null);

const FILTERS_KEY = "ddc:filters";
const CONFIG_KEY = "ddc:config";

function isFilters(v: unknown): v is DataFilters {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  const strOrNull = (x: unknown) => x === null || typeof x === "string";
  return strOrNull(f.subject) && (f.grade === null || typeof f.grade === "number") && strOrNull(f.classId) && strOrNull(f.textbookId) && strOrNull(f.topicKey);
}

function isConfig(v: unknown): v is AnalysisConfig {
  if (!v || typeof v !== "object") return false;
  const merged = { ...DEFAULT_ANALYSIS_CONFIG, ...(v as object) } as AnalysisConfig;
  return typeof merged.thresholds === "object" && validateAnalysisConfig(merged).length === 0;
}

const EMPTY_OPTIONS: FilterOptions = { subjects: [], grades: [], classes: [], textbooks: [], topics: [] };

/** Сбросить недопустимые фильтры; если в данных один предмет и одна параллель — выбрать их сразу. */
function prepareFilters(records: Dataset["records"], filters: DataFilters): DataFilters {
  const sanitized = sanitizeFilters(records, filters);
  const courses = listCourses(records);
  if (courses.length === 1) {
    return { ...sanitized, subject: courses[0].subject, grade: courses[0].grade };
  }
  return sanitized;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [dataset, setDataset] = React.useState<Dataset | null>(null);
  const [filters, setFiltersState] = React.useState<DataFilters>(EMPTY_FILTERS);
  const [config, setConfigState] = React.useState<AnalysisConfig>(DEFAULT_ANALYSIS_CONFIG);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setError(null);
      try {
        const stored = await loadStoredDataset();
        const ds = stored ?? (await fetchDemoDataset(controller.signal));
        if (cancelled) return;
        const savedConfig = readLocal<AnalysisConfig>(CONFIG_KEY, DEFAULT_ANALYSIS_CONFIG, isConfig);
        const savedFilters = readLocal<DataFilters>(FILTERS_KEY, EMPTY_FILTERS, isFilters);
        setConfigState({ ...DEFAULT_ANALYSIS_CONFIG, ...savedConfig });
        setDataset(ds);
        setFiltersState(prepareFilters(ds.records, savedFilters));
        setStatus("ready");
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : i18n().m.dataGate.loadFailed);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  const records = dataset?.records;

  const setFilters = React.useCallback(
    (patch: Partial<DataFilters>) => {
      setFiltersState((prev) => {
        const merged = { ...prev, ...patch };
        // Смена предмета/параллели сбрасывает зависимые фильтры, если они стали недопустимы.
        const next = records ? sanitizeFilters(records, merged) : merged;
        if (filtersEqual(prev, next)) return prev;
        writeLocal(FILTERS_KEY, next);
        return next;
      });
    },
    [records],
  );

  const resetFilters = React.useCallback(() => {
    setFiltersState(EMPTY_FILTERS);
    writeLocal(FILTERS_KEY, EMPTY_FILTERS);
  }, []);

  const setConfig = React.useCallback((next: AnalysisConfig) => {
    setConfigState(next);
    writeLocal(CONFIG_KEY, next);
  }, []);

  const replaceDataset = React.useCallback(async (next: Dataset) => {
    setDataset(next);
    setFiltersState((prev) => {
      const prepared = prepareFilters(next.records, prev);
      writeLocal(FILTERS_KEY, prepared);
      return prepared;
    });
    setStatus("ready");
    return saveDataset(next);
  }, []);

  const restoreDemo = React.useCallback(async () => {
    await clearStoredDataset();
    setAttempt((a) => a + 1);
  }, []);

  const retry = React.useCallback(() => setAttempt((a) => a + 1), []);

  // Подписи вариантов («7 класс») зависят от языка.
  const { locale } = useI18n();
  const options = React.useMemo(() => (records ? getFilterOptions(records, filters) : EMPTY_OPTIONS), [records, filters, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const courses = React.useMemo(() => (records ? listCourses(records) : []), [records]);

  const value = React.useMemo<DataContextValue>(
    () => ({ status, error, dataset, filters, options, courses, config, setFilters, resetFilters, setConfig, replaceDataset, restoreDemo, retry }),
    [status, error, dataset, filters, options, courses, config, setFilters, resetFilters, setConfig, replaceDataset, restoreDemo, retry],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = React.useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}

/** Набор данных гарантированно загружен (для компонентов внутри DataGate). */
export function useReadyData(): DataContextValue & { dataset: Dataset } {
  const ctx = useData();
  if (!ctx.dataset) throw new Error("Dataset is not loaded yet");
  return ctx as DataContextValue & { dataset: Dataset };
}
