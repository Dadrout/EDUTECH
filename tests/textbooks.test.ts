import { describe, expect, it } from "vitest";
import { compareTextbooks } from "@/lib/analytics/textbooks";
import { makeTopicKey } from "@/lib/domain/types";
import { config, group } from "./helpers";

const Q = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `Q${from + i}`);

describe("сравнение учебников", () => {
  it("сравнивает только по общим заданиям", () => {
    // A: задания Q1–Q6, все решены на 50%. B: Q1–Q3 (общие) на 50%, Q7–Q9 (только у B) — на 100%.
    const records = [
      ...group({ students: 20, prefix: "a", classId: "7А", textbookId: "A", questions: Q(1, 6), rate: 0.5 }),
      ...group({ students: 20, prefix: "b", classId: "7Б", textbookId: "B", questions: Q(1, 3), rate: 2 / 3 }),
      ...group({ students: 20, prefix: "b", classId: "7Б", textbookId: "B", questions: Q(7, 9), rate: 1 }),
    ];
    const result = compareTextbooks({ records, textbookIds: ["A", "B"], topicKey: null, referenceId: "A", config });
    const topic = result.topics[0];
    expect(topic.status).toBe("comparable");
    expect(topic.commonQuestions).toBe(3);
    expect(topic.unionQuestions).toBe(9);
    expect(topic.notes.join(" ")).toMatch(/3 общим заданиям из 9/);
    // Сырые результаты B завышены «лёгкими» заданиями, на общих — сопоставимы.
    expect(topic.cells.B!.rawRate!).toBeGreaterThan(topic.cells.B!.estimate!.rate);
    expect(topic.cells.B!.answers).toBe(60);
    expect(topic.cells.A!.answers).toBe(60);
  });

  it("исключает темы без общих заданий и без данных одного из учебников", () => {
    const records = [
      ...group({ students: 20, prefix: "a", textbookId: "A", topicId: "T1", questions: Q(1, 6), rate: 0.5 }),
      ...group({ students: 20, prefix: "b", classId: "7Б", textbookId: "B", topicId: "T1", questions: Q(11, 16), rate: 0.5 }),
      ...group({ students: 20, prefix: "a", textbookId: "A", topicId: "T2", questions: Q(21, 26), rate: 0.5 }),
    ];
    const result = compareTextbooks({ records, textbookIds: ["A", "B"], topicKey: null, referenceId: "A", config });
    const byId = Object.fromEntries(result.topics.map((t) => [t.topicId, t]));
    expect(byId.T1.status).toBe("no_common_questions");
    expect(byId.T2.status).toBe("missing_textbook");
    expect(result.comparableTopicCount).toBe(0);
    expect(result.verdicts[0].level).toBe("insufficient");
    expect(result.groups.every((g) => g.comparable === null)).toBe(true);
  });

  it("сообщает о недостаточной выборке вместо вывода", () => {
    const records = [
      ...group({ students: 20, prefix: "a", textbookId: "A", questions: Q(1, 6), rate: 0.9 }),
      ...group({ students: 4, prefix: "b", classId: "7Б", textbookId: "B", questions: Q(1, 6), rate: 0.3 }),
    ];
    const result = compareTextbooks({ records, textbookIds: ["A", "B"], topicKey: null, referenceId: "A", config });
    expect(result.topics[0].status).toBe("insufficient_data");
    expect(result.verdicts[0].level).toBe("insufficient");
    expect(result.verdicts[0].summary).toMatch(/Недостаточно данных/);
  });

  it("не утверждает различие, если оно в пределах погрешности", () => {
    const records = [
      ...group({ students: 15, prefix: "a", classId: "7А", textbookId: "A", questions: Q(1, 6), rate: 4 / 6 }),
      ...group({ students: 15, prefix: "c", classId: "7В", textbookId: "A", questions: Q(1, 6), rate: 3 / 6 }),
      ...group({ students: 15, prefix: "b", classId: "7Б", textbookId: "B", questions: Q(1, 6), rate: 4 / 6 }),
      ...group({ students: 15, prefix: "d", classId: "7Г", textbookId: "B", questions: Q(1, 6), rate: 3 / 6 }),
    ];
    const result = compareTextbooks({ records, textbookIds: ["A", "B"], topicKey: null, referenceId: "A", config });
    expect(result.verdicts[0].level).toBe("no_difference");
  });

  it("помечает различие как предварительное, если учебник используется в одном классе", () => {
    const records = [
      ...group({ students: 25, prefix: "a", classId: "7А", textbookId: "A", questions: Q(1, 6), rate: 5 / 6 }),
      ...group({ students: 25, prefix: "b", classId: "7Б", textbookId: "B", questions: Q(1, 6), rate: 2 / 6 }),
    ];
    const result = compareTextbooks({ records, textbookIds: ["A", "B"], topicKey: null, referenceId: "A", config });
    const v = result.verdicts[0];
    expect(v.diff!.significant).toBe(true);
    expect(v.level).toBe("preliminary");
    expect(v.reasons.join(" ")).toMatch(/одном классе/);
    expect(result.warnings.join(" ")).toMatch(/только в одном классе/);
  });

  it("признаёт различие устойчивым, только если оно воспроизводится во всех классах", () => {
    const records = [
      ...group({ students: 20, prefix: "a", classId: "7А", textbookId: "A", questions: Q(1, 6), rate: 2 / 6 }),
      ...group({ students: 20, prefix: "c", classId: "7В", textbookId: "A", questions: Q(1, 6), rate: 2 / 6 }),
      ...group({ students: 20, prefix: "b", classId: "7Б", textbookId: "B", questions: Q(1, 6), rate: 5 / 6 }),
      ...group({ students: 20, prefix: "d", classId: "7Г", textbookId: "B", questions: Q(1, 6), rate: 5 / 6 }),
    ];
    const result = compareTextbooks({ records, textbookIds: ["A", "B"], topicKey: null, referenceId: "A", config });
    const v = result.verdicts[0];
    expect(v.level).toBe("consistent");
    expect(v.diff!.diff).toBeCloseTo(0.5, 6);
    expect(v.summary).toMatch(/выше/);
    // Даже устойчивый вывод сопровождается оговоркой о причинности.
    expect(v.reasons.join(" ")).toMatch(/не доказательство причины/);
  });

  it("ограничивает сравнение выбранной темой", () => {
    const records = [
      ...group({ students: 20, prefix: "a", classId: "7А", textbookId: "A", topicId: "T1", questions: Q(1, 6), rate: 0.5 }),
      ...group({ students: 20, prefix: "b", classId: "7Б", textbookId: "B", topicId: "T1", questions: Q(1, 6), rate: 0.5 }),
      ...group({ students: 20, prefix: "a", classId: "7А", textbookId: "A", topicId: "T2", questions: Q(7, 12), rate: 0.5 }),
      ...group({ students: 20, prefix: "b", classId: "7Б", textbookId: "B", topicId: "T2", questions: Q(7, 12), rate: 0.5 }),
    ];
    const result = compareTextbooks({
      records,
      textbookIds: ["A", "B"],
      topicKey: makeTopicKey("Алгебра", 7, "T2"),
      referenceId: "A",
      config,
    });
    expect(result.topics.map((t) => t.topicId)).toEqual(["T2"]);
  });

  it("требует минимум два учебника", () => {
    const records = group({ students: 20, prefix: "a", textbookId: "A", questions: Q(1, 6), rate: 0.5 });
    const result = compareTextbooks({ records, textbookIds: ["A"], topicKey: null, referenceId: "A", config });
    expect(result.verdicts).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/не менее двух/);
  });
});
