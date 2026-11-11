/**
 * Форматы входных файлов. Заголовки сопоставляются без учёта регистра,
 * пробелов, подчёркиваний и дефисов; поддерживаются русские синонимы.
 */

export interface ColumnSpec<K extends string> {
  key: K;
  /** Каноническое имя колонки в шаблоне. */
  name: string;
  required: boolean;
  aliases: string[];
  description: string;
  example: string;
}

export type ResultColumnKey =
  | "studentId"
  | "classId"
  | "grade"
  | "subject"
  | "topicId"
  | "topicName"
  | "textbookId"
  | "textbookName"
  | "testId"
  | "questionId"
  | "isCorrect"
  | "testDate";

export type CurriculumColumnKey = "subject" | "grade" | "topicId" | "topicName" | "currentHours" | "minHours";

export const RESULT_COLUMNS: ColumnSpec<ResultColumnKey>[] = [
  { key: "studentId", name: "student_id", required: true, aliases: ["student", "id ученика", "код ученика", "ученик"], description: "Обезличенный идентификатор ученика", example: "S0001" },
  { key: "classId", name: "class_id", required: true, aliases: ["class", "класс", "код класса"], description: "Класс-группа", example: "7А" },
  { key: "grade", name: "grade", required: false, aliases: ["параллель", "номер класса", "grade level"], description: "Параллель (номер класса). Если колонки нет, берётся из начала class_id", example: "7" },
  { key: "subject", name: "subject", required: true, aliases: ["предмет", "дисциплина"], description: "Предмет", example: "Алгебра" },
  { key: "topicId", name: "topic_id", required: true, aliases: ["код темы", "id темы"], description: "Код темы учебной программы", example: "ALG7-05" },
  { key: "topicName", name: "topic_name", required: true, aliases: ["topic", "тема", "название темы"], description: "Название темы", example: "Алгебраические дроби" },
  { key: "textbookId", name: "textbook_id", required: true, aliases: ["код учебника", "id учебника"], description: "Код учебника", example: "ALG7-ALPHA" },
  { key: "textbookName", name: "textbook_name", required: true, aliases: ["textbook", "учебник", "название учебника"], description: "Название учебника", example: "Алгебра 7 · УМК «Альфа»" },
  { key: "testId", name: "test_id", required: true, aliases: ["test", "тест", "код теста", "работа"], description: "Код теста (контрольной работы)", example: "ALG7-T2" },
  { key: "questionId", name: "question_id", required: true, aliases: ["question", "задание", "вопрос", "номер задания"], description: "Код задания внутри теста", example: "Q05" },
  { key: "isCorrect", name: "is_correct", required: true, aliases: ["correct", "верно", "правильно", "результат", "ответ верный"], description: "Верно ли выполнено задание: 1/0, true/false, да/нет", example: "1" },
  { key: "testDate", name: "test_date", required: true, aliases: ["date", "дата", "дата теста"], description: "Дата теста: ГГГГ-ММ-ДД или ДД.ММ.ГГГГ", example: "2026-10-14" },
];

export const CURRICULUM_COLUMNS: ColumnSpec<CurriculumColumnKey>[] = [
  { key: "subject", name: "subject", required: true, aliases: ["предмет"], description: "Предмет (как в результатах тестирования)", example: "Алгебра" },
  { key: "grade", name: "grade", required: true, aliases: ["class", "класс", "параллель"], description: "Параллель (номер класса)", example: "7" },
  { key: "topicId", name: "topic_id", required: true, aliases: ["код темы", "id темы"], description: "Код темы (как в результатах тестирования)", example: "ALG7-05" },
  { key: "topicName", name: "topic_name", required: false, aliases: ["topic", "тема", "название темы"], description: "Название темы (необязательно)", example: "Алгебраические дроби" },
  { key: "currentHours", name: "current_hours", required: true, aliases: ["hours", "часы", "текущие часы", "часов"], description: "Текущее количество часов на тему, кратно 0,5", example: "14" },
  { key: "minHours", name: "min_hours", required: true, aliases: ["minimum hours", "минимум часов", "минимальные часы", "мин часов"], description: "Минимально допустимые часы на тему", example: "10" },
];

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s_\-.]+/g, "");
}

export interface ColumnMapping<K extends string> {
  /** Индекс колонки во входной таблице для каждого поля (или -1). */
  indexOf: Record<K, number>;
  matched: { key: K; name: string; header: string | null; required: boolean }[];
  missingRequired: string[];
  unknownHeaders: string[];
  duplicateHeaders: string[];
}

export function mapColumns<K extends string>(headers: string[], specs: ColumnSpec<K>[]): ColumnMapping<K> {
  const normalized = headers.map(normalizeHeader);
  const indexOf = {} as Record<K, number>;
  const used = new Set<number>();
  const duplicateHeaders: string[] = [];

  for (const spec of specs) {
    const candidates = new Set([spec.name, spec.key, ...spec.aliases].map(normalizeHeader));
    const hits = normalized.map((h, i) => (candidates.has(h) ? i : -1)).filter((i) => i >= 0 && !used.has(i));
    indexOf[spec.key] = hits.length > 0 ? hits[0] : -1;
    if (hits.length > 0) used.add(hits[0]);
    if (hits.length > 1) duplicateHeaders.push(spec.name);
  }

  return {
    indexOf,
    matched: specs.map((s) => ({
      key: s.key,
      name: s.name,
      header: indexOf[s.key] >= 0 ? headers[indexOf[s.key]].trim() : null,
      required: s.required,
    })),
    missingRequired: specs.filter((s) => s.required && indexOf[s.key] < 0).map((s) => s.name),
    unknownHeaders: headers.filter((h, i) => !used.has(i) && h.trim() !== "").map((h) => h.trim()),
    duplicateHeaders,
  };
}
