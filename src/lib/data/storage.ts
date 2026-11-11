import { del, get, set } from "idb-keyval";
import type { Dataset } from "@/lib/domain/types";

/**
 * Загруженный методистом набор хранится только в браузере (IndexedDB)
 * и никуда не отправляется. Демо-набор не сохраняется — он загружается из /public.
 */
const DATASET_KEY = "ddc:dataset";
const SCHEMA_VERSION = 1;

interface StoredDataset {
  version: number;
  dataset: Dataset;
}

function isDataset(value: unknown): value is Dataset {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<Dataset>;
  return Array.isArray(d.records) && Array.isArray(d.curriculum) && typeof d.meta === "object" && d.meta !== null;
}

export async function loadStoredDataset(): Promise<Dataset | null> {
  try {
    const stored = (await get(DATASET_KEY)) as StoredDataset | undefined;
    if (!stored || stored.version !== SCHEMA_VERSION || !isDataset(stored.dataset)) return null;
    return stored.dataset;
  } catch {
    return null;
  }
}

export async function saveDataset(dataset: Dataset): Promise<boolean> {
  try {
    await set(DATASET_KEY, { version: SCHEMA_VERSION, dataset } satisfies StoredDataset);
    return true;
  } catch {
    return false;
  }
}

export async function clearStoredDataset(): Promise<void> {
  try {
    await del(DATASET_KEY);
  } catch {
    // Хранилище недоступно (например, приватный режим) — нечего очищать.
  }
}

/** Небольшие пользовательские настройки (фильтры, пороги) — в localStorage. */
export function readLocal<T>(key: string, fallback: T, guard: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Недоступно — настройки просто не сохранятся между сессиями.
  }
}
