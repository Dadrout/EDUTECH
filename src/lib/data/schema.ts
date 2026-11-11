/**
 * Форматы входных файлов. Заголовки сопоставляются без учёта регистра,
 * пробелов, подчёркиваний и дефисов; поддерживаются синонимы на языках интерфейса.
 */
import type { Locale } from "@/i18n/locales";

export interface ColumnSpec<K extends string> {
  key: K;
  /** Каноническое имя колонки в шаблоне. */
  name: string;
  required: boolean;
  /** Синонимы заголовка на английском и русском. */
  aliases: string[];
  /** Синонимы на других языках интерфейса: распознаются всегда, показываются для своего языка. */
  localAliases?: Partial<Record<Exclude<Locale, "ru">, string[]>>;
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
  {
    key: "studentId", name: "student_id", required: true,
    aliases: ["student", "student id", "id ученика", "код ученика", "ученик"],
    localAliases: { kk: ["оқушы", "оқушы id"], es: ["alumno", "estudiante"], fr: ["élève", "eleve"], de: ["schüler", "schueler"], tr: ["öğrenci", "ogrenci"], uz: ["oʻquvchi", "o'quvchi", "oquvchi"], zh: ["学生", "学号"] },
  },
  {
    key: "classId", name: "class_id", required: true,
    aliases: ["class", "класс", "код класса"],
    localAliases: { kk: ["сынып"], es: ["clase", "grupo"], fr: ["classe"], de: ["klasse"], tr: ["sınıf", "sinif", "şube"], uz: ["sinf"], zh: ["班级"] },
  },
  {
    key: "grade", name: "grade", required: false,
    aliases: ["параллель", "номер класса", "grade level"],
    localAliases: { kk: ["сынып нөмірі"], es: ["curso", "nivel"], fr: ["niveau"], de: ["klassenstufe", "jahrgangsstufe"], tr: ["sınıf seviyesi", "seviye"], uz: ["sinf raqami"], zh: ["年级"] },
  },
  {
    key: "subject", name: "subject", required: true,
    aliases: ["предмет", "дисциплина"],
    localAliases: { kk: ["пән"], es: ["asignatura", "materia"], fr: ["matière", "matiere"], de: ["fach"], tr: ["ders"], uz: ["fan"], zh: ["科目", "学科"] },
  },
  {
    key: "topicId", name: "topic_id", required: true,
    aliases: ["код темы", "id темы"],
    localAliases: { kk: ["тақырып коды"], es: ["código de tema"], fr: ["code du thème"], de: ["themencode"], tr: ["konu kodu"], uz: ["mavzu kodi"], zh: ["主题代码"] },
  },
  {
    key: "topicName", name: "topic_name", required: true,
    aliases: ["topic", "тема", "название темы"],
    localAliases: { kk: ["тақырып", "тақырып атауы"], es: ["tema"], fr: ["thème", "theme"], de: ["thema"], tr: ["konu"], uz: ["mavzu"], zh: ["主题", "课题"] },
  },
  {
    key: "textbookId", name: "textbook_id", required: true,
    aliases: ["код учебника", "id учебника"],
    localAliases: { kk: ["оқулық коды"], es: ["código de libro"], fr: ["code du manuel"], de: ["lehrbuchcode"], tr: ["kitap kodu"], uz: ["darslik kodi"], zh: ["教材代码"] },
  },
  {
    key: "textbookName", name: "textbook_name", required: true,
    aliases: ["textbook", "учебник", "название учебника"],
    localAliases: { kk: ["оқулық"], es: ["libro de texto", "libro"], fr: ["manuel"], de: ["lehrbuch", "schulbuch"], tr: ["ders kitabı", "kitap"], uz: ["darslik"], zh: ["教材", "课本"] },
  },
  {
    key: "testId", name: "test_id", required: true,
    aliases: ["test", "тест", "код теста", "работа"],
    localAliases: { kk: ["тест коды"], es: ["prueba", "examen"], fr: ["examen", "épreuve"], de: ["prüfung"], tr: ["sınav"], uz: ["test kodi"], zh: ["测验", "考试"] },
  },
  {
    key: "questionId", name: "question_id", required: true,
    aliases: ["question", "задание", "вопрос", "номер задания"],
    localAliases: { kk: ["тапсырма", "сұрақ"], es: ["pregunta", "ítem"], fr: ["exercice"], de: ["aufgabe", "frage"], tr: ["soru"], uz: ["savol", "topshiriq"], zh: ["题目", "题号"] },
  },
  {
    key: "isCorrect", name: "is_correct", required: true,
    aliases: ["correct", "верно", "правильно", "результат", "ответ верный"],
    localAliases: { kk: ["дұрыс"], es: ["correcto", "acierto"], fr: ["juste"], de: ["richtig", "korrekt"], tr: ["doğru"], uz: ["toʻgʻri", "to'g'ri"], zh: ["正确", "是否正确"] },
  },
  {
    key: "testDate", name: "test_date", required: true,
    aliases: ["date", "дата", "дата теста"],
    localAliases: { kk: ["күні", "тест күні"], es: ["fecha"], fr: ["date du test"], de: ["datum"], tr: ["tarih"], uz: ["sana"], zh: ["日期"] },
  },
];

export const CURRICULUM_COLUMNS: ColumnSpec<CurriculumColumnKey>[] = [
  {
    key: "subject", name: "subject", required: true,
    aliases: ["предмет"],
    localAliases: { kk: ["пән"], es: ["asignatura", "materia"], fr: ["matière", "matiere"], de: ["fach"], tr: ["ders"], uz: ["fan"], zh: ["科目", "学科"] },
  },
  {
    key: "grade", name: "grade", required: true,
    aliases: ["class", "класс", "параллель"],
    localAliases: { kk: ["сынып"], es: ["curso", "nivel"], fr: ["niveau", "classe"], de: ["klasse", "klassenstufe"], tr: ["sınıf", "sinif"], uz: ["sinf"], zh: ["年级"] },
  },
  {
    key: "topicId", name: "topic_id", required: true,
    aliases: ["код темы", "id темы"],
    localAliases: { kk: ["тақырып коды"], es: ["código de tema"], fr: ["code du thème"], de: ["themencode"], tr: ["konu kodu"], uz: ["mavzu kodi"], zh: ["主题代码"] },
  },
  {
    key: "topicName", name: "topic_name", required: false,
    aliases: ["topic", "тема", "название темы"],
    localAliases: { kk: ["тақырып", "тақырып атауы"], es: ["tema"], fr: ["thème", "theme"], de: ["thema"], tr: ["konu"], uz: ["mavzu"], zh: ["主题", "课题"] },
  },
  {
    key: "currentHours", name: "current_hours", required: true,
    aliases: ["hours", "часы", "текущие часы", "часов"],
    localAliases: { kk: ["сағат"], es: ["horas"], fr: ["heures"], de: ["stunden"], tr: ["saat"], uz: ["soat"], zh: ["课时"] },
  },
  {
    key: "minHours", name: "min_hours", required: true,
    aliases: ["minimum hours", "минимум часов", "минимальные часы", "мин часов"],
    localAliases: { kk: ["ең аз сағат"], es: ["horas mínimas"], fr: ["heures minimum"], de: ["mindeststunden"], tr: ["en az saat"], uz: ["minimal soat"], zh: ["最少课时"] },
  },
];

/** Все синонимы колонки: английские, русские и на остальных языках интерфейса. */
export function allAliases(spec: ColumnSpec<string>): string[] {
  return [...spec.aliases, ...Object.values(spec.localAliases ?? {}).flat()];
}

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
    const candidates = new Set([spec.name, spec.key, ...allAliases(spec)].map(normalizeHeader));
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
