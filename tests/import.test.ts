import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareTextbooks } from "@/lib/analytics/textbooks";
import { computeTopicStats } from "@/lib/analytics/topics";
import { computeOverview } from "@/lib/analytics/overview";
import { computeInsights } from "@/lib/analytics/insights";
import { buildHoursInputs, planTotal, recommendHours } from "@/lib/analytics/hours";
import { filterRecords, listCourses } from "@/lib/analytics/filters";
import { computeHeatmap } from "@/lib/analytics/heatmap";
import { defaultHoursConfig } from "@/lib/config/analysis-config";
import { buildDataset, datasetFromDemoCsv } from "@/lib/data/dataset";
import { parseBoolean, parseDate, parseGrade } from "@/lib/data/parse-values";
import { decodeText, parseCsvText } from "@/lib/data/raw-table";
import { checkCurriculumCoverage, validateCurriculum } from "@/lib/data/validate-curriculum";
import { validateResults } from "@/lib/data/validate-results";
import { EMPTY_FILTERS } from "@/lib/domain/types";
import { formatCi, formatHours, formatPct, formatPp } from "@/lib/format";
import { i18n } from "@/i18n/core";
import { config, findNonFinite } from "./helpers";

const HEADER = "student_id,class_id,grade,subject,topic_id,topic_name,textbook_id,textbook_name,test_id,question_id,is_correct,test_date";

describe("разбор значений", () => {
  it("понимает разные записи верного ответа", () => {
    for (const v of ["1", "true", "TRUE", "да", "Да", "yes", "верно"]) expect(parseBoolean(v)).toBe(true);
    for (const v of ["0", "false", "нет", "no", "неверно"]) expect(parseBoolean(v)).toBe(false);
    expect(parseBoolean("2")).toBeNull();
    expect(parseBoolean("")).toBeNull();
  });

  it("понимает даты ISO и ДД.ММ.ГГГГ и отклоняет несуществующие", () => {
    expect(parseDate("2026-02-12")).toBe("2026-02-12");
    expect(parseDate("12.02.2026")).toBe("2026-02-12");
    expect(parseDate("2026-02-12T10:00:00")).toBe("2026-02-12");
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("02/30/2026")).toBeNull();
    expect(parseDate("вчера")).toBeNull();
  });

  it("понимает параллель", () => {
    expect(parseGrade("7")).toBe(7);
    expect(parseGrade("7 класс")).toBe(7);
    expect(parseGrade("13")).toBeNull();
    expect(parseGrade("7А")).toBeNull();
  });
});

describe("импорт результатов тестирования", () => {
  it("принимает корректный CSV", () => {
    const csv = [HEADER, "S1,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,1,2026-01-10", "S2,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,0,2026-01-10"].join("\n");
    const v = validateResults(parseCsvText(csv));
    expect(v.fatal).toEqual([]);
    expect(v.errorRows).toBe(0);
    expect(v.records).toHaveLength(2);
    expect(v.records[0].isCorrect).toBe(true);
    expect(v.summary.students).toBe(2);
  });

  it("поддерживает точку с запятой, русские заголовки, BOM и вывод параллели из класса", () => {
    const csv =
      String.fromCharCode(0xfeff) +
      ["ID ученика;Класс;Предмет;Код темы;Тема;Код учебника;Учебник;Тест;Задание;Верно;Дата", "S1;8Б;Физика;F1;Ток;B;Учебник Б;T;Q1;да;14.10.2026"].join("\n");
    const v = validateResults(parseCsvText(csv));
    expect(v.fatal).toEqual([]);
    expect(v.gradeDerived).toBe(true);
    expect(v.records[0]).toMatchObject({ grade: 8, classId: "8Б", isCorrect: true, testDate: "2026-10-14" });
    expect(v.issues.some((i) => i.code === "grade-derived")).toBe(true);
  });

  it("сообщает об отсутствующих обязательных колонках", () => {
    const v = validateResults(parseCsvText("student_id,class_id\nS1,7А"));
    expect(v.fatal.join(" ")).toMatch(/subject/);
    expect(v.records).toEqual([]);
  });

  it("не пропускает пустые и некорректные значения в расчёты", () => {
    const csv = [
      HEADER,
      "S1,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,1,2026-01-10",
      "S2,7А,7,Алгебра,,Тема,A,Учебник А,TEST1,Q1,1,2026-01-10",
      "S3,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,может быть,2026-01-10",
      "S4,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,1,когда-то",
      "S5,7А,семь,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,1,2026-01-10",
    ].join("\n");
    const v = validateResults(parseCsvText(csv));
    expect(v.records).toHaveLength(1);
    expect(v.errorRows).toBe(4);
    const codes = v.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["empty-topicId", "bad-correct", "bad-date", "bad-grade"]));
    const empty = v.issues.find((i) => i.code === "empty-topicId")!;
    expect(empty.rows).toEqual([3]);
    expect(v.preview.rows.filter((r) => r.hasError)).toHaveLength(4);
  });

  it("удаляет точные дубликаты и исключает противоречивые", () => {
    const csv = [
      HEADER,
      "S1,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,1,2026-01-10",
      "S1,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,1,2026-01-10",
      "S2,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,1,2026-01-10",
      "S2,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,0,2026-01-10",
    ].join("\n");
    const v = validateResults(parseCsvText(csv));
    expect(v.duplicateRows).toBe(1);
    expect(v.errorRows).toBe(2);
    expect(v.records.map((r) => r.studentId)).toEqual(["S1"]);
    expect(v.issues.find((i) => i.code === "duplicate")?.severity).toBe("warning");
    expect(v.issues.find((i) => i.code === "conflict")?.severity).toBe("error");
  });

  it("проверяет согласованность класса, заданий и названий", () => {
    const csv = [
      HEADER,
      "S1,7А,7,Алгебра,T1,Тема 1,A,Учебник А,TEST1,Q1,1,2026-01-10",
      "S2,7А,7,Алгебра,T1,Тема 1,A,Учебник А,TEST1,Q2,1,2026-01-10",
      "S3,7А,8,Алгебра,T1,Тема 1,A,Учебник А,TEST1,Q3,1,2026-01-10",
      "S4,7А,7,Алгебра,T2,Тема 2,A,Учебник А,TEST1,Q1,1,2026-01-10",
      "S5,7А,7,Алгебра,T1,Тема один,A,Учебник А,TEST1,Q2,1,2026-01-10",
    ].join("\n");
    const v = validateResults(parseCsvText(csv));
    const codes = v.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["class-grade", "question-topic", "topic-name"]));
    expect(v.records.every((r) => r.grade === 7)).toBe(true);
    expect(v.records.every((r) => r.topicId !== "T1" || r.topicName === "Тема 1")).toBe(true);
  });

  it("распознаёт файлы в кодировке Windows-1251", () => {
    // «Да» в Windows-1251: 0xC4 0xE0
    const bytes = new Uint8Array([0xc4, 0xe0]);
    const { text, encoding } = decodeText(bytes);
    expect(encoding).toBe("Windows-1251");
    expect(text).toBe("Да");
    expect(decodeText(new TextEncoder().encode("Тема")).encoding).toBe("UTF-8");
  });
});

describe("импорт учебного плана", () => {
  it("проверяет часы, дубликаты и минимум", () => {
    const csv = [
      "subject,grade,topic_id,current_hours,min_hours",
      "Алгебра,7,T1,10,6",
      "Алгебра,7,T2,\"8,5\",9",
      "Алгебра,7,T3,4.3,2",
      "Алгебра,7,T4,-1,0",
      "Алгебра,7,T5,6,4",
      "Алгебра,7,T5,7,4",
    ].join("\n");
    const v = validateCurriculum(parseCsvText(csv));
    expect(v.entries.map((e) => e.topicId)).toEqual(["T1", "T2"]);
    expect(v.entries[1].currentHours).toBe(8.5);
    const codes = v.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["half-currentHours", "bad-currentHours", "conflict", "min-above-current"]));
  });

  it("принимает заголовки из задания (Subject, Class, Topic ID, Current Hours, Minimum Hours)", () => {
    const v = validateCurriculum(parseCsvText("Subject,Class,Topic ID,Current Hours,Minimum Hours\nАлгебра,7 класс,T1,10,6"));
    expect(v.fatal).toEqual([]);
    expect(v.entries[0]).toMatchObject({ grade: 7, currentHours: 10, minHours: 6 });
  });

  it("сверяет план с результатами", () => {
    const results = validateResults(parseCsvText([HEADER, "S1,7А,7,Алгебра,T1,Тема,A,Учебник А,TEST1,Q1,1,2026-01-10", "S1,8А,8,Физика,F1,Тема,B,Учебник Б,TEST2,Q1,1,2026-01-10"].join("\n")));
    const plan = validateCurriculum(parseCsvText("subject,grade,topic_id,current_hours,min_hours\nАлгебра,7,T2,10,6"));
    const coverage = checkCurriculumCoverage(plan.entries, results.records);
    expect(coverage.planWithoutResults.map((e) => e.topicId)).toEqual(["T2"]);
    expect(coverage.resultsWithoutPlan.map((t) => t.topicId)).toEqual(["T1"]);
    expect(coverage.coursesWithoutPlan).toEqual([{ subject: "Физика", grade: 8 }]);
  });
});

describe("демо-набор и замена данных", () => {
  const demoDir = join(__dirname, "..", "public", "demo");
  const demo = datasetFromDemoCsv(readFileSync(join(demoDir, "results.csv"), "utf8"), readFileSync(join(demoDir, "curriculum.csv"), "utf8"));

  it("демо-данные проходят проверку без ошибок и помечены как синтетические", () => {
    expect(demo.meta.isSynthetic).toBe(true);
    expect(demo.records.length).toBeGreaterThan(20000);
    expect(new Set(demo.records.map((r) => r.studentId)).size).toBe(300);
    expect(demo.curriculum.length).toBe(44);
  });

  it("все расчёты по демо-данным не содержат NaN и бесконечностей", () => {
    const topics = computeTopicStats(demo.records, config);
    expect(findNonFinite(topics)).toEqual([]);
    expect(findNonFinite(computeOverview(demo.records, topics, config))).toEqual([]);
    expect(findNonFinite(computeInsights(demo.records, topics, config))).toEqual([]);
    for (const course of listCourses(demo.records)) {
      const recs = filterRecords(demo.records, { ...EMPTY_FILTERS, subject: course.subject, grade: course.grade });
      const ts = computeTopicStats(recs, config);
      expect(findNonFinite(computeHeatmap(recs, config))).toEqual([]);
      const ids = [...new Set(recs.map((r) => r.textbookId))];
      expect(findNonFinite(compareTextbooks({ records: recs, textbookIds: ids, topicKey: null, referenceId: ids[0], config }))).toEqual([]);
      const { inputs } = buildHoursInputs(demo.curriculum, ts, course.subject, course.grade);
      const plan = recommendHours(inputs, {
        ...defaultHoursConfig(config),
        budgetHours: planTotal(demo.curriculum, course.subject, course.grade),
        mediumPct: config.thresholds.medium,
      });
      expect(plan.ok).toBe(true);
      expect(findNonFinite(plan)).toEqual([]);
    }
  });

  it("после импорта нового CSV все расчёты используют только новые данные", () => {
    const csv = [HEADER];
    for (let s = 0; s < 12; s++) {
      for (let q = 1; q <= 4; q++) {
        csv.push(`N${s},5А,5,Математика,M1,Дроби,K1,Математика 5,MT1,Q${q},${q <= 1 ? 1 : 0},2026-03-01`);
      }
    }
    const v = validateResults(parseCsvText(csv.join("\n")));
    const ds = buildDataset(v.records, [], { name: "Новый набор", source: "upload" });
    const topics = computeTopicStats(ds.records, config);
    expect(topics).toHaveLength(1);
    expect(topics[0].topicName).toBe("Дроби");
    expect(topics[0].rate).toBe(0.25);
    expect(topics[0].status).toBe("difficult");
    expect(computeOverview(ds.records, topics, config).kpis.students).toBe(12);
    // Учебный план не загружен — рекомендации не строятся из старых данных.
    const { inputs } = buildHoursInputs(ds.curriculum, topics, "Математика", 5);
    expect(inputs).toEqual([]);
  });
});

describe("форматирование для интерфейса", () => {
  it("никогда не показывает NaN", () => {
    expect(formatPct(Number.NaN)).toBe("—");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatPp(undefined)).toBe("—");
    expect(formatCi(null, 0.5)).toBe("—");
    expect(formatHours(Number.NaN)).toBe("—");
  });

  it("форматирует проценты и пункты по-русски", () => {
    expect(formatPct(0.724)).toBe("72,4%");
    expect(formatPp(0.042)).toBe("+4,2 п.п.");
    expect(formatPp(-0.03)).toBe("−3,0 п.п.");
    const { plural, m } = i18n();
    expect(plural(m.counts.topics, 1)).toBe("1 тема");
    expect(plural(m.counts.topics, 3)).toBe("3 темы");
    expect(plural(m.counts.topics, 11)).toBe("11 тем");
    expect(plural(m.counts.topics, 25)).toBe("25 тем");
  });
});
