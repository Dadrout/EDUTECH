import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord } from "@/lib/domain/types";
import { questionKeyOf, topicKeyOf } from "@/lib/domain/types";
import { i18n } from "@/i18n/core";
import { formatPct, formatPp, formatPpAbs, formatPpRange, quote } from "@/lib/format";
import { compareTopics, naturalCompare } from "./filters";
import { clusteredProportion, differenceOfProportions, type ClusterCount, type DifferenceEstimate, type ProportionEstimate } from "./stats";

/**
 * Сравнение учебников.
 *
 * Принципы (чтобы не выдавать корреляцию за причинно-следственную связь):
 * 1. Сравниваются только группы одного предмета и одной параллели.
 * 2. По каждой теме используются только ОБЩИЕ задания, которые выполняли
 *    ученики всех сравниваемых учебников — разные наборы заданий не смешиваются.
 * 3. Тема исключается, если у одного из учебников нет данных, мало учеников
 *    или мало общих заданий.
 * 4. Для разницы строится 95% доверительный интервал (кластеризация по ученикам).
 * 5. Учебник обычно закреплён за классом, поэтому проверяется число классов
 *    и устойчивость различия во всех классах; иначе вывод — предварительный.
 */

export type TopicComparisonStatus = "comparable" | "missing_textbook" | "no_common_questions" | "insufficient_data";

export interface TextbookTopicCell {
  students: number;
  answers: number;
  /** Оценка по общим заданиям. */
  estimate: ProportionEstimate | null;
  /** Успешность по всем заданиям учебника (справочно, не для сравнения). */
  rawRate: number | null;
  rawQuestions: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface TopicComparisonRow {
  topicKey: string;
  topicId: string;
  topicName: string;
  status: TopicComparisonStatus;
  commonQuestions: number;
  unionQuestions: number;
  cells: Record<string, TextbookTopicCell | null>;
  /** Разница с базовым учебником по общим заданиям. */
  diffs: Record<string, DifferenceEstimate | null>;
  notes: string[];
}

export interface ClassBreakdown {
  classId: string;
  students: number;
  estimate: ProportionEstimate | null;
  sufficient: boolean;
}

export interface TextbookGroupSummary {
  textbookId: string;
  textbookName: string;
  /** Ученики с ответами в выбранной области (все задания). */
  students: number;
  answers: number;
  classes: string[];
  topicsCovered: number;
  /** Успешность по всем заданиям (не сопоставима между учебниками). */
  rawRate: number | null;
  /** Успешность на общих заданиях сопоставимых тем. */
  comparable: ProportionEstimate | null;
  comparableStudents: number;
  classBreakdown: ClassBreakdown[];
}

export type VerdictLevel = "insufficient" | "no_difference" | "preliminary" | "consistent";

export interface PairVerdict {
  textbookId: string;
  referenceId: string;
  level: VerdictLevel;
  diff: DifferenceEstimate | null;
  summary: string;
  reasons: string[];
}

export interface TextbookComparisonResult {
  referenceId: string;
  textbookIds: string[];
  groups: TextbookGroupSummary[];
  topics: TopicComparisonRow[];
  comparableTopicCount: number;
  commonQuestionCount: number;
  verdicts: PairVerdict[];
  warnings: string[];
}

export interface TextbookComparisonInput {
  /** Записи одного предмета и одной параллели. */
  records: AnswerRecord[];
  textbookIds: string[];
  /** Конкретная тема или null — все сопоставимые темы. */
  topicKey: string | null;
  referenceId: string | null;
  config: AnalysisConfig;
}

const DATE_GAP_DAYS = 30;

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

type StudentMap = Map<string, ClusterCount>;

function addTo(map: StudentMap, studentId: string, isCorrect: boolean): void {
  let c = map.get(studentId);
  if (!c) {
    c = { correct: 0, total: 0 };
    map.set(studentId, c);
  }
  c.total += 1;
  if (isCorrect) c.correct += 1;
}

function mergeInto(target: StudentMap, source: StudentMap): void {
  for (const [id, c] of source) {
    const t = target.get(id);
    if (t) {
      t.correct += c.correct;
      t.total += c.total;
    } else {
      target.set(id, { ...c });
    }
  }
}

export function compareTextbooks(input: TextbookComparisonInput): TextbookComparisonResult {
  const { config } = input;
  const z = config.confidenceZ;
  const selected = [...new Set(input.textbookIds)];
  const selectedSet = new Set(selected);
  const referenceId = input.referenceId && selectedSet.has(input.referenceId) ? input.referenceId : (selected[0] ?? "");

  const scoped = input.records.filter(
    (r) => selectedSet.has(r.textbookId) && (input.topicKey === null || topicKeyOf(r) === input.topicKey),
  );

  // Проход 1: метаданные, наборы заданий, учащиеся.
  const names = new Map<string, string>();
  const topicMeta = new Map<string, { topicId: string; topicName: string; subject: string; grade: number }>();
  const questionSets = new Map<string, Map<string, Set<string>>>(); // topic → textbook → questions
  const rawByTopicTb = new Map<string, { correct: number; total: number; students: Set<string>; first: string; last: string }>();
  const groupRaw = new Map<string, { students: Set<string>; classes: Set<string>; topics: Set<string>; correct: number; total: number }>();

  for (const r of scoped) {
    names.set(r.textbookId, r.textbookName);
    const tk = topicKeyOf(r);
    if (!topicMeta.has(tk)) topicMeta.set(tk, { topicId: r.topicId, topicName: r.topicName, subject: r.subject, grade: r.grade });
    let byTb = questionSets.get(tk);
    if (!byTb) {
      byTb = new Map();
      questionSets.set(tk, byTb);
    }
    let qs = byTb.get(r.textbookId);
    if (!qs) {
      qs = new Set();
      byTb.set(r.textbookId, qs);
    }
    qs.add(questionKeyOf(r));

    const rk = tk + "\u001f" + r.textbookId;
    let raw = rawByTopicTb.get(rk);
    if (!raw) {
      raw = { correct: 0, total: 0, students: new Set(), first: r.testDate, last: r.testDate };
      rawByTopicTb.set(rk, raw);
    }
    raw.total += 1;
    if (r.isCorrect) raw.correct += 1;
    raw.students.add(r.studentId);
    if (r.testDate < raw.first) raw.first = r.testDate;
    if (r.testDate > raw.last) raw.last = r.testDate;

    let g = groupRaw.get(r.textbookId);
    if (!g) {
      g = { students: new Set(), classes: new Set(), topics: new Set(), correct: 0, total: 0 };
      groupRaw.set(r.textbookId, g);
    }
    g.students.add(r.studentId);
    g.classes.add(r.classId);
    g.topics.add(tk);
    g.total += 1;
    if (r.isCorrect) g.correct += 1;
  }

  // Общие задания по каждой теме.
  const commonByTopic = new Map<string, Set<string>>();
  const unionByTopic = new Map<string, number>();
  for (const [tk, byTb] of questionSets) {
    const union = new Set<string>();
    for (const qs of byTb.values()) for (const q of qs) union.add(q);
    unionByTopic.set(tk, union.size);
    if (selected.every((id) => byTb.has(id))) {
      const [first, ...rest] = selected.map((id) => byTb.get(id)!);
      const common = new Set([...first].filter((q) => rest.every((s) => s.has(q))));
      commonByTopic.set(tk, common);
    } else {
      commonByTopic.set(tk, new Set());
    }
  }

  // Проход 2: накопление только по общим заданиям.
  const onCommon = new Map<string, StudentMap>(); // topic|tb → students
  const onCommonByClass = new Map<string, Map<string, StudentMap>>(); // topic|tb → class → students
  for (const r of scoped) {
    const tk = topicKeyOf(r);
    const common = commonByTopic.get(tk);
    if (!common || !common.has(questionKeyOf(r))) continue;
    const rk = tk + "\u001f" + r.textbookId;
    let sm = onCommon.get(rk);
    if (!sm) {
      sm = new Map();
      onCommon.set(rk, sm);
    }
    addTo(sm, r.studentId, r.isCorrect);
    let byClass = onCommonByClass.get(rk);
    if (!byClass) {
      byClass = new Map();
      onCommonByClass.set(rk, byClass);
    }
    let csm = byClass.get(r.classId);
    if (!csm) {
      csm = new Map();
      byClass.set(r.classId, csm);
    }
    addTo(csm, r.studentId, r.isCorrect);
  }

  // Строки по темам.
  const topics: TopicComparisonRow[] = [];
  const sortedTopics = [...topicMeta.entries()].sort((a, b) => compareTopics(a[1], b[1]));
  for (const [tk, meta] of sortedTopics) {
    const byTb = questionSets.get(tk)!;
    const common = commonByTopic.get(tk)!;
    const cells: Record<string, TextbookTopicCell | null> = {};
    const notes: string[] = [];
    for (const id of selected) {
      const raw = rawByTopicTb.get(tk + "\u001f" + id);
      if (!raw) {
        cells[id] = null;
        continue;
      }
      const sm = onCommon.get(tk + "\u001f" + id);
      const estimate = sm ? clusteredProportion([...sm.values()], z) : null;
      cells[id] = {
        students: sm?.size ?? 0,
        answers: estimate?.total ?? 0,
        estimate,
        rawRate: raw.total > 0 ? raw.correct / raw.total : null,
        rawQuestions: byTb.get(id)?.size ?? 0,
        firstDate: raw.first,
        lastDate: raw.last,
      };
    }

    let status: TopicComparisonStatus = "comparable";
    const missing = selected.filter((id) => !byTb.has(id));
    if (missing.length > 0) {
      status = "missing_textbook";
      notes.push(i18n().t(i18n().m.textbookAnalysis.noResults, { names: missing.map((id) => quote(names.get(id) ?? id)).join(i18n().m.common.listSep) }));
    } else if (common.size < config.minCommonQuestions) {
      status = "no_common_questions";
      notes.push(i18n().t(i18n().m.textbookAnalysis.fewCommon, { n: common.size, min: config.minCommonQuestions }));
    } else {
      const small = selected.filter((id) => (cells[id]?.students ?? 0) < config.minStudentsPerGroup);
      if (small.length > 0) {
        status = "insufficient_data";
        notes.push(
          i18n().t(i18n().m.textbookAnalysis.fewStudents, {
            min: config.minStudentsPerGroup,
            names: small.map((id) => quote(names.get(id) ?? id)).join(i18n().m.common.listSep),
          }),
        );
      }
    }
    const unionSize = unionByTopic.get(tk) ?? 0;
    if (status === "comparable" && common.size < unionSize) {
      notes.push(i18n().t(i18n().m.textbookAnalysis.partialCommon, { n: common.size, total: unionSize }));
    }
    if (status === "comparable") {
      const dates = selected.map((id) => cells[id]).filter((c): c is TextbookTopicCell => c !== null && c.firstDate !== null);
      for (let i = 0; i < dates.length; i++) {
        for (let j = i + 1; j < dates.length; j++) {
          if (daysBetween(dates[i].firstDate!, dates[j].firstDate!) > DATE_GAP_DAYS) {
            notes.push(i18n().m.textbookAnalysis.dateGap);
            i = dates.length;
            break;
          }
        }
      }
    }

    const diffs: Record<string, DifferenceEstimate | null> = {};
    const ref = cells[referenceId]?.estimate ?? null;
    for (const id of selected) {
      if (id === referenceId || status !== "comparable") {
        diffs[id] = null;
        continue;
      }
      diffs[id] = differenceOfProportions(cells[id]?.estimate ?? null, ref, z);
    }

    topics.push({
      topicKey: tk,
      topicId: meta.topicId,
      topicName: meta.topicName,
      status,
      commonQuestions: common.size,
      unionQuestions: unionSize,
      cells,
      diffs,
      notes,
    });
  }

  const comparableTopics = topics.filter((t) => t.status === "comparable");
  const comparableKeys = new Set(comparableTopics.map((t) => t.topicKey));
  const commonQuestionCount = comparableTopics.reduce((s, t) => s + t.commonQuestions, 0);

  // Итог по учебникам: объединённая оценка на общих заданиях сопоставимых тем.
  const groups: TextbookGroupSummary[] = selected.map((id) => {
    const merged: StudentMap = new Map();
    const classMerged = new Map<string, StudentMap>();
    for (const tk of comparableKeys) {
      const rk = tk + "\u001f" + id;
      const sm = onCommon.get(rk);
      if (sm) mergeInto(merged, sm);
      const byClass = onCommonByClass.get(rk);
      if (byClass) {
        for (const [classId, csm] of byClass) {
          let target = classMerged.get(classId);
          if (!target) {
            target = new Map();
            classMerged.set(classId, target);
          }
          mergeInto(target, csm);
        }
      }
    }
    const g = groupRaw.get(id);
    return {
      textbookId: id,
      textbookName: names.get(id) ?? id,
      students: g?.students.size ?? 0,
      answers: g?.total ?? 0,
      classes: g ? [...g.classes].sort(naturalCompare) : [],
      topicsCovered: g?.topics.size ?? 0,
      rawRate: g && g.total > 0 ? g.correct / g.total : null,
      comparable: clusteredProportion([...merged.values()], z),
      comparableStudents: merged.size,
      classBreakdown: [...classMerged.entries()]
        .map(([classId, sm]) => ({
          classId,
          students: sm.size,
          estimate: clusteredProportion([...sm.values()], z),
          sufficient: sm.size >= config.minStudentsPerCell,
        }))
        .sort((a, b) => naturalCompare(a.classId, b.classId)),
    };
  });

  const { t, m } = i18n();
  const warnings: string[] = [];
  if (selected.length < 2) warnings.push(m.textbookAnalysis.selectTwo);
  for (const g of groups) {
    if (g.classes.length === 1) {
      warnings.push(t(m.textbookAnalysis.oneClass, { name: quote(g.textbookName), classId: g.classes[0] }));
    }
  }
  const excluded = topics.length - comparableTopics.length;
  if (excluded > 0) {
    warnings.push(t(m.textbookAnalysis.excludedTopics, { excluded, total: topics.length }));
  }

  const verdicts = selected
    .filter((id) => id !== referenceId)
    .map((id) => buildVerdict(id, referenceId, groups, comparableTopics.length, config));

  return {
    referenceId,
    textbookIds: selected,
    groups,
    topics,
    comparableTopicCount: comparableTopics.length,
    commonQuestionCount,
    verdicts,
    warnings,
  };
}

/** Модуль разницы без знака: «4,2 п.п.». */
const ppAbs = (diff: number): string => formatPpAbs(diff);

function classRange(group: TextbookGroupSummary): { min: number; max: number; count: number } | null {
  const rates = group.classBreakdown.filter((c) => c.sufficient && c.estimate).map((c) => c.estimate!.rate);
  if (rates.length === 0) return null;
  return { min: Math.min(...rates), max: Math.max(...rates), count: rates.length };
}

function buildVerdict(
  id: string,
  referenceId: string,
  groups: TextbookGroupSummary[],
  comparableTopicCount: number,
  config: AnalysisConfig,
): PairVerdict {
  const g = groups.find((x) => x.textbookId === id)!;
  const ref = groups.find((x) => x.textbookId === referenceId)!;
  const { t, m } = i18n();
  const ta = m.textbookAnalysis;
  const a = quote(g.textbookName);
  const b = quote(ref.textbookName);
  const base = { textbookId: id, referenceId };

  if (comparableTopicCount === 0) {
    return {
      ...base,
      level: "insufficient",
      diff: null,
      summary: t(ta.noComparableSummary, { a, b }),
      reasons: [ta.noComparableReason],
    };
  }
  const small = [g, ref].filter((x) => x.comparableStudents < config.minStudentsPerGroup);
  const diff = differenceOfProportions(g.comparable, ref.comparable, config.confidenceZ);
  if (small.length > 0 || !diff) {
    return {
      ...base,
      level: "insufficient",
      diff,
      summary: t(ta.insufficientSummary, { a, b }),
      reasons: small.map((x) => t(ta.insufficientReason, { name: quote(x.textbookName), n: x.comparableStudents, min: config.minStudentsPerGroup })),
    };
  }

  const range = t(ta.range, { range: formatPpRange(diff.ciLow, diff.ciHigh) });
  if (!diff.significant) {
    return {
      ...base,
      level: "no_difference",
      diff,
      summary: t(ta.noDifferenceSummary, { a, b, diff: formatPp(diff.diff), range }),
      reasons: [ta.noDifferenceReason],
    };
  }

  const summary = t(diff.diff > 0 ? ta.higherSummary : ta.lowerSummary, { a, b, pp: ppAbs(diff.diff), range });

  const reasons: string[] = [];
  const higher = diff.diff > 0 ? g : ref;
  const lower = diff.diff > 0 ? ref : g;
  const hr = classRange(higher);
  const lr = classRange(lower);
  let consistent = true;
  if (g.classes.length < 2 || ref.classes.length < 2) {
    consistent = false;
    reasons.push(ta.singleClassReason);
  }
  if (hr && lr) {
    if (hr.min <= lr.max) {
      consistent = false;
      reasons.push(t(ta.notReproduced, { higher: quote(higher.textbookName), min: formatPct(hr.min), lower: quote(lower.textbookName), max: formatPct(lr.max) }));
    }
    const spread = Math.max(hr.max - hr.min, lr.max - lr.min);
    if (spread >= Math.abs(diff.diff)) {
      consistent = false;
      reasons.push(t(ta.spread, { pp: ppAbs(spread) }));
    }
  } else {
    consistent = false;
    reasons.push(ta.noClassData);
  }

  if (consistent) {
    return {
      ...base,
      level: "consistent",
      diff,
      summary: t(ta.reproduced, { summary }),
      reasons: [ta.causality],
    };
  }
  return { ...base, level: "preliminary", diff, summary, reasons };
}
