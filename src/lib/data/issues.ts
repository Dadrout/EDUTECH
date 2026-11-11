export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Число затронутых строк. */
  count: number;
  /** Примеры номеров строк файла (не более 5). */
  rows: number[];
}

export interface PreviewRow {
  rowNumber: number;
  cells: string[];
  hasError: boolean;
}

export interface TablePreview {
  headers: string[];
  rows: PreviewRow[];
}

const SAMPLE_ROWS = 5;

/** Группирует однотипные проблемы, чтобы не выводить тысячи одинаковых сообщений. */
export class IssueCollector {
  private readonly byCode = new Map<string, ValidationIssue>();

  add(severity: IssueSeverity, code: string, message: string, rowNumber?: number): void {
    let issue = this.byCode.get(code);
    if (!issue) {
      issue = { severity, code, message, count: 0, rows: [] };
      this.byCode.set(code, issue);
    }
    issue.count += 1;
    if (rowNumber !== undefined && issue.rows.length < SAMPLE_ROWS) issue.rows.push(rowNumber);
  }

  /** Сообщение без привязки к строкам (например, о структуре файла). */
  note(severity: IssueSeverity, code: string, message: string, count = 1): void {
    this.byCode.set(code, { severity, code, message, count, rows: [] });
  }

  list(): ValidationIssue[] {
    return [...this.byCode.values()].sort((a, b) =>
      a.severity === b.severity ? b.count - a.count : a.severity === "error" ? -1 : 1,
    );
  }
}

/** Наиболее частое значение (при равенстве — встреченное первым). */
export function majority<T>(counts: Map<T, number>): T | undefined {
  let best: T | undefined;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Индексы строк для предпросмотра: первые строки файла и строки с ошибками. */
export function previewIndices(total: number, errorIndices: Iterable<number>, first = 10, maxErrors = 10): number[] {
  const set = new Set<number>();
  for (let i = 0; i < Math.min(first, total); i++) set.add(i);
  let added = 0;
  for (const i of errorIndices) {
    if (added >= maxErrors) break;
    if (!set.has(i)) {
      set.add(i);
      added += 1;
    }
  }
  return [...set].sort((a, b) => a - b);
}
