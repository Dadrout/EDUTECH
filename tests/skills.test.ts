import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSkills, computeClassErrorStats, computeSkillDetail, ERROR_TYPES, isKnownErrorType, makeSkillKey, normalizeErrorType } from "@/lib/analytics/skills";
import { topicKeyOf } from "@/lib/domain/types";
import { parseCsvText } from "@/lib/data/raw-table";
import { validateResults } from "@/lib/data/validate-results";
import { config, findNonFinite, rec } from "./helpers";

const cfg = { ...config, minStudentsPerTopic: 2, minAnswersPerTopic: 3, minStudentsPerCell: 2, minStudentsPerGroup: 3 };
const records = [
  rec({ skill: "Дроби", questionId: "Q1", isCorrect: false, errorType: " SIGN ", testDate: "2026-01-20" }),
  rec({ skill: "Дроби", questionId: "Q2", isCorrect: true, errorType: "concept" }),
  rec({ studentId: "S2", classId: "7Б", textbookId: "B", textbookName: "Учебник Б", skill: "Дроби", questionId: "Q1", isCorrect: false, errorType: " Своя ошибка ", testDate: "2026-01-10" }),
  rec({ studentId: "S2", skill: "Дроби", questionId: "Q2", isCorrect: false }),
  rec({ studentId: "S3", skill: "Корни", questionId: "Q3" }),
  rec({ studentId: "S4", skill: "  ", questionId: "Q4", isCorrect: false, errorType: "sign" }),
];

describe("аналитика навыков", () => {
  it("нормализует только известные коды", () => {
    for (const code of ERROR_TYPES) {
      expect(normalizeErrorType(` ${code.toUpperCase()} `)).toBe(code);
      expect(isKnownErrorType(code)).toBe(true);
    }
    expect(normalizeErrorType(" Свой Текст ")).toBe("Свой Текст");
    expect(isKnownErrorType("Свой Текст")).toBe(false);
    for (const value of [undefined, null, "", "  "]) expect(normalizeErrorType(value)).toBeNull();
  });

  it("считает навыки, кластерный интервал и отклонение от всей темы", () => {
    const a = analyzeSkills(records, cfg);
    const s = a.skills[0];
    expect(s).toMatchObject({ skill: "Дроби", answers: 4, correct: 1, students: 2, questions: 2, rate: 0.25, sufficient: true, level: "low", topicRate: 1 / 3 });
    expect(s.deltaFromTopic).toBeCloseTo(0.25 - 1 / 3);
    expect(s.estimate).toMatchObject({ clusters: 2, total: 4, correct: 1, rate: 0.25, se: 0.25 });
    expect(s.estimate!.ciLow).toBe(0);
    expect(s.estimate!.ciHigh).toBeGreaterThan(0.7);
    expect(analyzeSkills(records, { ...cfg, confidenceZ: 1 }).skills[0].estimate!.ciHigh).toBeLessThan(s.estimate!.ciHigh);
    expect(a.skills[1]).toMatchObject({ skill: "Корни", sufficient: false, level: "insufficient" });
    expect(analyzeSkills(records, { ...cfg, minAnswersPerTopic: 5 }).skills.every((s) => !s.sufficient)).toBe(true);
    expect(analyzeSkills(records, { ...cfg, minStudentsPerTopic: 3 }).skills.every((s) => !s.sufficient)).toBe(true);
    expect(analyzeSkills(records, { ...cfg, thresholds: { high: 25, medium: 10 } }).skills[0].level).toBe("high");
    expect(findNonFinite(a)).toEqual([]);
  });

  it("считает покрытие и доли только среди категоризированных ошибок", () => {
    const a = analyzeSkills(records, cfg);
    expect(a.coverage).toEqual({ answers: 6, withSkill: 5, incorrect: 4, incorrectWithType: 3, hasSkills: true, hasErrorTypes: true });
    expect(a.errorTypes).toEqual([
      { errorType: "sign", known: true, count: 2, share: 2 / 3 },
      { errorType: "Своя ошибка", known: false, count: 1, share: 1 / 3 },
    ]);
    expect(a.skills[0].errors.map((e) => e.share)).toEqual([0.5, 0.5]);
    expect(a.skills[0]).toMatchObject({ incorrect: 3, incorrectWithType: 2 });
  });

  it("показывает задания без навыков и пустой набор без NaN", () => {
    const a = analyzeSkills(records.map((r) => ({ ...r, skill: null })), cfg);
    expect(a.skills).toEqual([]);
    expect(a.coverage.hasSkills).toBe(false);
    expect(a.questions).toHaveLength(4);
    expect(a.questions.every((q) => q.skill === null)).toBe(true);
    const empty = analyzeSkills([], cfg);
    expect(empty).toEqual({ coverage: { answers: 0, withSkill: 0, incorrect: 0, incorrectWithType: 0, hasSkills: false, hasErrorTypes: false }, skills: [], errorTypes: [], questions: [] });
    expect(findNonFinite(empty)).toEqual([]);
    expect(computeSkillDetail([], "missing", cfg)).toBeNull();
  });

  it("сортирует задания, выбирает наиболее частый навык и раннюю дату", () => {
    const a = analyzeSkills(records, cfg);
    expect(a.questions.map((q) => q.questionId)).toEqual(["Q1", "Q4", "Q2", "Q3"]);
    expect(a.questions[0]).toMatchObject({ students: 2, answers: 2, correct: 0, incorrect: 2, incorrectWithType: 2, testDate: "2026-01-10", skill: "Дроби" });
    const mixed = [rec({ skill: "Б" }), rec({ studentId: "S2", skill: "А" }), rec({ studentId: "S3", skill: "А" })];
    expect(analyzeSkills(mixed, cfg).questions[0].skill).toBe("А");
  });

  it("разделяет темы и сортирует равные значения детерминированно", () => {
    const rs = [rec({ skill: "Б" }), rec({ skill: "А" }), rec({ skill: "А", topicId: "T2" })];
    const a = analyzeSkills(rs, cfg);
    expect(a.skills.map((s) => [s.topicId, s.skill])).toEqual([["T1", "А"], ["T1", "Б"], ["T2", "А"]]);
    expect(a.questions).toHaveLength(2);
    expect(analyzeSkills([...rs].reverse(), cfg).skills).toEqual(a.skills);
    const errors = analyzeSkills([rec({ isCorrect: false, errorType: "sign" }), rec({ isCorrect: false, errorType: "concept" })], cfg);
    expect(errors.errorTypes.map((e) => e.errorType)).toEqual(["concept", "sign"]);
  });

  it("возвращает детализацию только выбранного навыка", () => {
    const key = makeSkillKey(topicKeyOf(records[0]), "Дроби");
    const d = computeSkillDetail(records, key, cfg)!;
    expect(d.skill.topicRate).toBe(1 / 3);
    expect(d.byClass).toMatchObject([{ id: "7А", label: "7А", students: 2, answers: 3, sufficient: true }, { id: "7Б", label: "7Б", students: 1, answers: 1, sufficient: false }]);
    expect(d.byTextbook).toMatchObject([{ id: "A", label: "Учебник А", students: 2, sufficient: false }, { id: "B", label: "Учебник Б", students: 1, sufficient: false }]);
    expect(d.questions.map((q) => q.questionId)).toEqual(["Q1", "Q2"]);
    expect(d.byClass[0].estimate?.clusters).toBe(2);
    expect(computeSkillDetail(records, "missing", cfg)).toBeNull();
    expect(findNonFinite(d)).toEqual([]);
  });
});

const header = "student_id,class_id,grade,subject,topic_id,topic_name,textbook_id,textbook_name,test_id,question_id,is_correct,test_date";
const row = "S1,7А,7,Алгебра,T1,Тема,A,Учебник,TEST,Q1,0,2026-01-10";
it("импортирует необязательные метаданные и прежние CSV", () => {
  const old = validateResults(parseCsvText(`${header}\n${row}`));
  expect(old.fatal).toEqual([]);
  expect(old.records[0]).toMatchObject({ skill: null, errorType: null });
  const v = validateResults(parseCsvText(`${header},навык,тип ошибки\n${row}, Дроби , SIGN \n${row.replace("S1", "S2").replace(",0,", ",1,")}, Корни ,concept\n${row.replace("S1", "S3")},  ,  `));
  expect(v.fatal).toEqual([]);
  expect(v.issues).toEqual([]);
  expect(v.records.map((r) => [r.skill, r.errorType])).toEqual([["Дроби", "SIGN"], ["Корни", null], [null, null]]);
  expect(v.preview.headers.slice(-2)).toEqual(["skill", "error_type"]);
  expect(v.preview.rows[0].cells.slice(-2)).toEqual(["Дроби", "SIGN"]);
});

const demo = validateResults(parseCsvText(readFileSync(join(__dirname, "../public/demo/results.csv"), "utf8"))).records;
it("сохраняет исходные итоги демо по темам", () => {
  const expected = [455,452,427,344,285,230,395,344,447,393,423,450,280,357,514,389,473,463,355,299,219,404,481,446,399,328,372,286,355,416,478,443,380,334,313,330,456,376,394,308,379,323,438,32];
  const totals = new Map<string, number>();
  for (const r of demo) totals.set(r.topicId, (totals.get(r.topicId) ?? 0) + Number(r.isCorrect));
  expect([...totals].sort(([a], [b]) => a.localeCompare(b)).map(([, n]) => n)).toEqual(expected);
  expect(demo).toHaveLength(24252);
});

it("демо содержит разные навыки и частично размеченные ошибки", () => {
  const a = analyzeSkills(demo, config);
  expect(a.coverage.withSkill).toBe(24252);
  const ratio = a.coverage.incorrectWithType / a.coverage.incorrect;
  expect(ratio).toBeGreaterThan(0.94);
  expect(ratio).toBeLessThan(0.96);
  expect(a.errorTypes.every((e) => e.known)).toBe(true);
  for (const topic of new Set(a.skills.map((s) => s.topicKey))) {
    const skills = a.skills.filter((s) => s.topicKey === topic);
    expect(skills.length).toBeGreaterThanOrEqual(2);
    expect(skills.length).toBeLessThanOrEqual(3);
    expect(Math.max(...skills.map((s) => s.rate!)) - Math.min(...skills.map((s) => s.rate!))).toBeGreaterThan(0.02);
  }
  expect(findNonFinite(a)).toEqual([]);
});

it("сохраняет порядок при совпадении имён без учёта регистра", () => {
  const rs = [rec({ skill: "skill", isCorrect: false, errorType: "Custom" }),
    rec({ skill: "Skill", isCorrect: false, errorType: "custom" })];
  const forward = analyzeSkills(rs, cfg);
  const reverse = analyzeSkills([...rs].reverse(), cfg);
  expect(reverse.skills).toEqual(forward.skills);
  expect(reverse.questions).toEqual(forward.questions);
  expect(reverse.errorTypes).toEqual(forward.errorTypes);
});

it("ставит достаточные навыки первыми и ограничивает детализацию ответами навыка", () => {
  const rs = [rec({ skill: "Лёгкий" }), rec({ studentId: "S2", skill: "Лёгкий" }),
    rec({ studentId: "S3", skill: "Лёгкий" }), rec({ skill: "Сложный", isCorrect: false })];
  const a = analyzeSkills(rs, cfg);
  expect(a.skills.map((s) => s.skill)).toEqual(["Лёгкий", "Сложный"]);
  expect(a.questions[0]).toMatchObject({ answers: 4, skill: "Лёгкий" });
  const detail = computeSkillDetail(rs, makeSkillKey(topicKeyOf(rs[0]), "Сложный"), cfg)!;
  expect(detail.questions[0]).toMatchObject({ answers: 1, correct: 0, skill: "Сложный" });
  expect(detail.skill.topicRate).toBe(0.75);
  expect(detail.skill.estimate).toMatchObject({ ciLow: 0, ciHigh: 1, se: null });
  const enough = computeSkillDetail(rs, makeSkillKey(topicKeyOf(rs[0]), "Лёгкий"), cfg)!;
  expect(enough.byTextbook[0].sufficient).toBe(true);
  expect(findNonFinite(enough)).toEqual([]);
});

it.each([["skill", "error_type"], ["умение", "ошибка"], ["skill name", "error category"], ["дағды", "қате түрі"]])(
  "распознаёт метаданные %s / %s", (skill, error) => {
    const v = validateResults(parseCsvText(`${header},${skill},${error}\n${row}, Навык , Другая ошибка `));
    expect(v.issues).toEqual([]);
    expect(v.records[0]).toMatchObject({ skill: "Навык", errorType: "Другая ошибка" });
  },
);


it("сравнивает ошибки классов без навыков и не смешивает курсы", () => {
  const rs = [rec({ studentId: "S1", isCorrect: false }),
    rec({ studentId: "S1", questionId: "Q2", isCorrect: true }),
    rec({ studentId: "S2", isCorrect: false, errorType: " SIGN " }),
    rec({ studentId: "S3", classId: "7Б", isCorrect: true }),
    rec({ studentId: "S1", subject: "Физика", isCorrect: true }),
    rec({ studentId: "S4", grade: 8, isCorrect: false })];
  const result = computeClassErrorStats(rs, cfg);
  expect(result).toHaveLength(4);
  const algebra7 = result.find((r) => r.subject === "Алгебра" && r.grade === 7 && r.classId === "7А")!;
  expect(algebra7).toMatchObject({ students: 2, answers: 3, correct: 1, incorrect: 2,
    incorrectWithType: 1, sufficient: true, estimate: { rate: 1 / 3, total: 3, clusters: 2 },
    errors: [{ errorType: "sign", count: 1, share: 1 }] });
  expect(algebra7.label).toContain("Алгебра");
  expect(new Set(result.map((r) => r.id)).size).toBe(4);
  expect(result.find((r) => r.classId === "7Б")).toMatchObject({ answers: 1, incorrect: 0, incorrectWithType: 0, errors: [], sufficient: false });
  expect(computeClassErrorStats(rs.filter((r) => r.subject === "Алгебра" && r.grade === 7), cfg)[0].label).toBe("7А");
  expect(computeClassErrorStats([...rs].reverse(), cfg)).toEqual(result);
  expect(computeClassErrorStats([], cfg)).toEqual([]);
  expect(findNonFinite(result)).toEqual([]);
});
