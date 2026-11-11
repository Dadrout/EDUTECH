import type { AnalysisConfig } from "@/lib/config/analysis-config";
import type { AnswerRecord } from "@/lib/domain/types";
import { naturalCompare } from "./filters";
import { classifyLevel, clusteredProportion, isProblemStatus, type ProportionEstimate } from "./stats";
import type { TopicStats } from "./topics";

export interface OverviewKpis {
  students: number;
  classes: number;
  topics: number;
  answers: number;
  tests: number;
  textbooks: number;
  estimate: ProportionEstimate | null;
  problemTopics: number;
  insufficientTopics: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface SubjectDistribution {
  subject: string;
  students: number;
  /** Ученики с достаточным числом ответов для отнесения к уровню. */
  evaluatedStudents: number;
  estimate: ProportionEstimate | null;
  levels: { high: number; medium: number; low: number };
}

export interface Overview {
  kpis: OverviewKpis;
  subjects: SubjectDistribution[];
}

export function computeOverview(records: AnswerRecord[], topicStats: TopicStats[], config: AnalysisConfig): Overview {
  const students = new Set<string>();
  const classes = new Set<string>();
  const tests = new Set<string>();
  const textbooks = new Set<string>();
  const perStudent = new Map<string, { correct: number; total: number }>();
  const perSubjectStudent = new Map<string, Map<string, { correct: number; total: number }>>();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (const r of records) {
    students.add(r.studentId);
    classes.add(r.classId);
    tests.add(r.testId);
    textbooks.add(r.textbookId);
    if (dateFrom === null || r.testDate < dateFrom) dateFrom = r.testDate;
    if (dateTo === null || r.testDate > dateTo) dateTo = r.testDate;

    let s = perStudent.get(r.studentId);
    if (!s) {
      s = { correct: 0, total: 0 };
      perStudent.set(r.studentId, s);
    }
    s.total += 1;
    if (r.isCorrect) s.correct += 1;

    let bySubject = perSubjectStudent.get(r.subject);
    if (!bySubject) {
      bySubject = new Map();
      perSubjectStudent.set(r.subject, bySubject);
    }
    let ss = bySubject.get(r.studentId);
    if (!ss) {
      ss = { correct: 0, total: 0 };
      bySubject.set(r.studentId, ss);
    }
    ss.total += 1;
    if (r.isCorrect) ss.correct += 1;
  }

  const subjects: SubjectDistribution[] = [...perSubjectStudent.entries()]
    .sort((a, b) => naturalCompare(a[0], b[0]))
    .map(([subject, map]) => {
      const levels = { high: 0, medium: 0, low: 0 };
      let evaluated = 0;
      for (const c of map.values()) {
        if (c.total < config.minAnswersPerStudent) continue;
        const level = classifyLevel(c.correct / c.total, config.thresholds);
        if (level === "high" || level === "medium" || level === "low") {
          levels[level] += 1;
          evaluated += 1;
        }
      }
      return {
        subject,
        students: map.size,
        evaluatedStudents: evaluated,
        estimate: clusteredProportion([...map.values()], config.confidenceZ),
        levels,
      };
    });

  return {
    kpis: {
      students: students.size,
      classes: classes.size,
      topics: topicStats.length,
      answers: records.length,
      tests: tests.size,
      textbooks: textbooks.size,
      estimate: clusteredProportion([...perStudent.values()], config.confidenceZ),
      problemTopics: topicStats.filter((t) => isProblemStatus(t.status)).length,
      insufficientTopics: topicStats.filter((t) => !t.sufficient).length,
      dateFrom,
      dateTo,
    },
    subjects,
  };
}
