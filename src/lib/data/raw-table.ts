import { i18n } from "@/i18n/core";
import Papa from "papaparse";

/** Таблица «как в файле»: заголовки и строки строковых значений. */
export interface RawTable {
  headers: string[];
  rows: string[][];
  /** Номер строки файла для каждой строки данных (для сообщений об ошибках). */
  rowNumbers: number[];
  delimiter: string | null;
  encoding: string | null;
}

export class TableReadError extends Error {}

/**
 * Декодирование байтов: UTF-8 (с BOM или без), иначе Windows-1251 —
 * так Excel в русской локали сохраняет «CSV (разделители — запятые)».
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^\uFEFF/, ""), encoding: "UTF-8" };
  } catch {
    try {
      return { text: new TextDecoder("windows-1251").decode(bytes), encoding: "Windows-1251" };
    } catch {
      throw new TableReadError(i18n().m.validation.encoding);
    }
  }
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => c.trim() === "");
}

function finalize(matrix: string[][], delimiter: string | null, encoding: string | null): RawTable {
  // Первая непустая строка — заголовок.
  const headerIndex = matrix.findIndex((r) => !isBlankRow(r));
  if (headerIndex < 0) throw new TableReadError(i18n().m.validation.emptyFile);
  const headers = matrix[headerIndex].map((h) => h.replace(/^\uFEFF/, "").trim());
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (isBlankRow(row)) continue;
    rows.push(row.map((c) => c.trim()));
    rowNumbers.push(i + 1);
  }
  return { headers, rows, rowNumbers, delimiter, encoding };
}

/** Разбор CSV-текста; разделитель (запятая, точка с запятой, табуляция) определяется автоматически. */
export function parseCsvText(text: string, encoding: string | null = null): RawTable {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: false,
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  const fatal = result.errors.find((e) => e.type === "Quotes");
  if (fatal) {
    throw new TableReadError(i18n().t(i18n().m.validation.csvQuotes, { row: (fatal.row ?? 0) + 1 }));
  }
  const matrix = result.data.map((row) => row.map((c) => (c ?? "").toString()));
  return finalize(matrix, result.meta.delimiter ?? null, encoding);
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return "";
    const y = cell.getUTCFullYear();
    const m = String(cell.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cell.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof cell === "boolean") return cell ? "1" : "0";
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  return String(cell);
}

/** Чтение первого листа XLSX. Библиотека загружается только при необходимости. */
export async function parseXlsx(data: ArrayBuffer): Promise<RawTable> {
  const { readSheet } = await import("read-excel-file/universal");
  let sheet: unknown[][];
  try {
    sheet = (await readSheet(data)) as unknown[][];
  } catch {
    throw new TableReadError(i18n().m.validation.xlsxFailed);
  }
  return finalize(sheet.map((row) => row.map(cellToString)), null, "XLSX");
}

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function readTableFromFile(file: File): Promise<RawTable> {
  if (file.size === 0) throw new TableReadError(i18n().m.validation.emptyFile);
  if (file.size > MAX_FILE_BYTES) throw new TableReadError(i18n().m.validation.tooLarge);
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith(".xlsx")) return parseXlsx(buffer);
  if (name.endsWith(".xls")) throw new TableReadError(i18n().m.validation.xlsUnsupported);
  const { text, encoding } = decodeText(new Uint8Array(buffer));
  return parseCsvText(text, encoding);
}
