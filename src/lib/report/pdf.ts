/** A browser-independent, text/vector PDF. No DOM capture or rasterised tables. */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Messages } from "@/i18n/messages/ru";
import type { Locale } from "@/i18n/locales";
import type { QuestionStats } from "@/lib/analytics/skills";
import type { TopicStats } from "@/lib/analytics/topics";
import type { DataQualityKind, Report } from "./report";

export interface PdfReportOptions {
  fonts: { regular: Uint8Array; bold: Uint8Array; fallback?: Uint8Array };
  locale: Locale;
  m: Messages;
  logo?: Uint8Array;
  appendix?: boolean;
  questions?: QuestionStats[];
  topics?: TopicStats[];
}

export const PDF_PAGE_SIZE = [841.89, 595.28] as const;
const [W, H] = PDF_PAGE_SIZE;
const M = 36;
const C = {
  ink: rgb(0.098, 0.176, 0.165), muted: rgb(0.349, 0.42, 0.396),
  green: rgb(0.09, 0.384, 0.329), pale: rgb(0.945, 0.965, 0.949),
  line: rgb(0.85, 0.89, 0.865), red: rgb(0.67, 0.19, 0.16), amber: rgb(0.62, 0.4, 0.05),
  white: rgb(1, 1, 1), blue: rgb(0.20, 0.40, 0.62),
};
type Color = ReturnType<typeof rgb>;
const plain = (s: string) => s.replace(/<\/?b>/g, "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").replace(/[\u00a0\u202f]/g, " ");

/** Builds five editorial summary pages, or a separately paginated full appendix. */
export async function generateReportPdf(report: Report, options: PdfReportOptions): Promise<Uint8Array> {
  const { m } = options;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const logo = options.logo ? await doc.embedPng(options.logo) : null;
  const regular = await doc.embedFont(options.fonts.regular, { subset: true });
  const bold = await doc.embedFont(options.fonts.bold, { subset: true });
  // The legacy fontkit subsetter loses some complex CJK glyphs; embed this already-subset fallback intact.
  const fallback = options.fonts.fallback ? await doc.embedFont(options.fonts.fallback, { subset: false }) : null;
  const charsets = new Map<PDFFont, Set<number>>([regular, bold, ...(fallback ? [fallback] : [])].map(font => [font, new Set(font.getCharacterSet())]));
  const intl = options.locale === "kk" ? "kk-KZ" : options.locale === "uz" ? "uz-Latn-UZ" : options.locale;
  const nf = new Intl.NumberFormat(intl, { maximumFractionDigits: 1 });
  const n = (v: number) => nf.format(v);
  const pct = (v: number | null | undefined) => v == null ? "—" : m.units.percent.replace("{n}", n(v * 100));
  const hours = (v: number) => m.units.hours.replace("{n}", n(v));
  const pp = (v: number) => m.units.pp.replace("{n}", `${v > 0 ? "+" : ""}${n(v * 100)}`);
  const t = (value: string, params: Record<string, string | number>) => value.replace(/\{(\w+)\}/g, (full, key: string) => key in params ? String(params[key]) : full);
  const course = (subject: string, grade: number) => t(m.units.course, { subject, grade });
  const date = (v: string | null) => v ? new Intl.DateTimeFormat(intl, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(v.slice(0, 10) + "T00:00:00Z")) : "—";
  const scope = `${report.scope.subject ?? m.filters.allSubjects} · ${report.scope.grade === null ? m.filters.allGrades : t(m.units.grade, { grade: report.scope.grade })}`;
  const quality: Record<DataQualityKind, string> = {
    synthetic: m.reports.synthetic, excluded_rows: m.reports.excludedRows,
    duplicates_removed: m.reports.duplicatesRemoved, insufficient_topics: m.reports.insufficientTopics,
    no_curriculum: m.reports.noCurriculum, courses_without_plan: m.reports.coursesWithoutPlan,
    no_skill_data: m.reports.noSkills, partial_skill_data: m.reports.partialSkills,
    single_class_textbooks: m.reports.singleClassTextbooks,
  };

  const findings = report.insights.filter(insight => report.sample.topics > report.insufficientTopics.length || insight.id !== "no-problems");

  function runs(value: string, strong = false): { text: string; font: PDFFont }[] {
    const primary = strong ? bold : regular;
    const result: { text: string; font: PDFFont }[] = [];
    for (const char of plain(value)) {
      const cp = char.codePointAt(0)!;
      const font = charsets.get(primary)!.has(cp) ? primary : fallback && charsets.get(fallback)!.has(cp) ? fallback : null;
      if (!font) throw new Error(`PDF_FONT_UNSUPPORTED: U+${cp.toString(16).toUpperCase()}`);
      const previous = result.at(-1);
      if (previous?.font === font) previous.text += char;
      else result.push({ text: char, font });
    }
    return result;
  }
  const width = (value: string, size: number, strong = false) => runs(value, strong).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
  function text(page: PDFPage, value: string, x: number, y: number, size = 10, strong = false, color = C.ink) {
    for (const run of runs(value, strong)) {
      page.drawText(run.text, { x, y, font: run.font, size, color });
      x += run.font.widthOfTextAtSize(run.text, size);
    }
  }
  function lines(value: string, maxWidth: number, size: number, strong = false): string[] {
    const result: string[] = [];
    for (const paragraph of plain(value).split(/\r?\n/)) {
      let current = "";
      for (const token of paragraph.split(/(\s+)/u).filter(Boolean)) {
        if (width(current + token, size, strong) <= maxWidth) current += token;
        else {
          if (current.trim()) result.push(current.trimEnd());
          current = "";
          for (const char of token.trimStart()) {
            if (current && width(current + char, size, strong) > maxWidth) { result.push(current); current = ""; }
            current += char;
          }
        }
      }
      if (current.trim() || !result.length) result.push(current.trimEnd());
    }
    return result;
  }
  function paragraph(page: PDFPage, value: string, x: number, y: number, maxWidth: number, size = 10, maxLines = 3, strong = false, color = C.ink): number {
    const wrapped = lines(value, maxWidth, size, strong);
    const shown = wrapped.slice(0, maxLines);
    if (wrapped.length > maxLines) {
      let last = shown[shown.length - 1];
      while (last && width(last + "…", size, strong) > maxWidth) last = last.slice(0, -1);
      shown[shown.length - 1] = last + "…";
    }
    shown.forEach((line, i) => text(page, line, x, y - i * size * 1.4, size, strong, color));
    return shown.length * size * 1.4;
  }
  const line = (page: PDFPage, x1: number, y1: number, x2: number, y2: number, color = C.line, thickness = 1) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
  const rect = (page: PDFPage, x: number, y: number, w: number, h: number, color = C.pale) => page.drawRectangle({ x, y, width: w, height: h, color });
  function page(title: string, subtitle = scope): PDFPage {
    const p = doc.addPage([W, H]);
    if (logo) p.drawImage(logo, { x: M, y: H - 45, width: 95, height: 95 * logo.height / logo.width });
    else text(p, "BilimLens", M, H - 40, 15, true, C.green);
    paragraph(p, options.appendix ? m.ux.appendix : m.reports.title, 156, H - 38, W - 156 - M, 9, 1, false, C.muted);
    line(p, M, H - 54, W - M, H - 54);
    paragraph(p, title, M, H - 96, W - M * 2, 24, 1, true);
    paragraph(p, subtitle, M, H - 119, W - M * 2, 10, 2, false, C.muted);
    return p;
  }
  function note(p: PDFPage, value: string, y = 73) { paragraph(p, value, M, y, W - M * 2, 8.5, 2, false, C.muted); }
  function selected(p: PDFPage, shown: number, total: number) { note(p, t(m.ux.selected, { shown: n(shown), total: n(total) })); }
  function axis(p: PDFPage, x: number, y: number, w: number) {
    for (const tick of [0, 25, 50, 75, 100]) { const xx = x + tick / 100 * w; text(p, pct(tick / 100), xx - 6, y, 8, false, C.muted); }
  }
  function interval(p: PDFPage, x: number, y: number, w: number, rate: number, low: number, high: number, color: Color) {
    rect(p, x, y - 3, w, 6, C.pale);
    rect(p, x, y - 3, w * rate, 6, color);
    line(p, x + low * w, y, x + high * w, y, C.ink, 1.5);
    for (const v of [low, high]) line(p, x + v * w, y - 5, x + v * w, y + 5, C.ink);
  }

  if (!options.appendix) {
    const summary = page(m.ux.executiveSummary);
    const metrics = [
      [m.topics.colStudents, n(report.sample.students)], [m.topics.colAnswers, n(report.sample.answers)],
      [m.topics.colRate, pct(report.performance.estimate?.rate)], [m.reports.problemTopics, n(report.problemTopics.length)],
    ];
    metrics.forEach(([label, value], i) => {
      const x = M + i * 195;
      rect(summary, x, 343, 184, 89);
      paragraph(summary, label, x + 14, 409, 156, 10, 2, false, C.muted);
      text(summary, value, x + 14, 365, 28, true, i === 3 && report.problemTopics.length ? C.red : C.ink);
    });
    const hasReliableTopics = report.sample.topics > report.insufficientTopics.length;
    const finding = hasReliableTopics ? findings[0] : null;
    text(summary, m.ux.keyFinding, M, 309, 12, true, C.green);
    paragraph(summary, finding?.title ?? m.ux.noReliableFinding, M, 280, 730, 17, 2, true);
    paragraph(summary, finding?.detail ?? m.ux.summaryDescription, M, 229, 730, 11, 3, false, C.muted);
    const total = Object.values(report.performance.statusCounts).reduce((sum, v) => sum + v, 0);
    const statuses = ["difficult", "likely_difficult", "attention", "mastered", "insufficient"] as const;
    const colors = [C.red, C.amber, C.blue, C.green, C.line];
    let sx = M;
    statuses.forEach((status, i) => { const w = total ? report.performance.statusCounts[status] / total * (W - M * 2) : 0; rect(summary, sx, 143, w, 12, colors[i]); sx += w; });
    statuses.forEach((status, i) => {
      const x = M + i * 155;
      rect(summary, x, 112, 6, 6, colors[i]);
      paragraph(summary, `${m.status[status]}: ${n(report.performance.statusCounts[status])}`, x + 12, 115, 138, 8, 2, false, C.muted);
    });
    note(summary, `${m.units.ci}: ${pct(report.performance.estimate?.ciLow)} – ${pct(report.performance.estimate?.ciHigh)}. ${m.ux.appendixNote}`);

    const gaps = page(m.ux.learningGaps, `${scope} · ${m.units.ci}`);
    const problems = report.problemTopics.slice(0, 5);
    axis(gaps, 346, 437, 365);
    problems.forEach((topic, i) => {
      const y = 403 - i * 62;
      paragraph(gaps, topic.topicName, M, y + 6, 285, 12, 2, true);
      paragraph(gaps, `${course(topic.subject, topic.grade)} · ${n(topic.students)} ${m.topics.colStudents.toLowerCase()} · ${n(topic.answers)} ${m.topics.colAnswers.toLowerCase()}`, M, y - 25, 285, 8, 1, false, C.muted);
      if (topic.estimate) interval(gaps, 346, y - 4, 365, topic.estimate.rate, topic.estimate.ciLow, topic.estimate.ciHigh, C.red);
      text(gaps, pct(topic.rate), 735, y - 8, 14, true, C.red);
      line(gaps, M, y - 40, W - M, y - 40);
    });
    if (!problems.length) paragraph(gaps, hasReliableTopics ? m.reports.noProblems : m.ux.noReliableFinding, M, 398, 720, 16, 3);
    if (problems.length <= 2) {
      const sy = problems.length === 2 ? 237 : 282;
      text(gaps, m.skills.chartTitle, M, sy, 12, true, C.green);
      const skills = report.skills?.skills.filter(skill => skill.sufficient).slice(0, 3) ?? [];
      skills.forEach((skill, i) => {
        const y = sy - 31 - i * 39;
        paragraph(gaps, skill.skill, M, y + 3, 285, 10, 1, true);
        paragraph(gaps, skill.topicName, M, y - 12, 285, 8, 1, false, C.muted);
        if (skill.estimate) interval(gaps, 346, y - 3, 365, skill.estimate.rate, skill.estimate.ciLow, skill.estimate.ciHigh, C.amber);
        text(gaps, pct(skill.rate), 735, y - 7, 12, true, C.amber);
      });
      if (!skills.length) paragraph(gaps, report.skills ? m.ux.noReliableFinding : m.reports.noSkills, M, sy - 28, 720, 10, 3, false, C.muted);
    }
    paragraph(gaps, `${m.reports.insufficientTopics}: ${n(report.insufficientTopics.length)}`, M, 95, 740, 10, 1, false, C.muted);
    selected(gaps, problems.length, report.problemTopics.length);

    const comparison = page(m.reports.textbooks, m.reports.comparisonNote);
    const pairs = report.textbooks.flatMap(c => c.result.verdicts.map(verdict => ({ c, verdict })));
    const compared = pairs.slice(0, 4);
    axis(comparison, 386, 432, 325);
    compared.forEach(({ c, verdict }, i) => {
      const y = 397 - i * 77;
      const a = c.result.groups.find(g => g.textbookId === verdict.referenceId);
      const b = c.result.groups.find(g => g.textbookId === verdict.textbookId);
      paragraph(comparison, course(c.subject, c.grade), M, y + 5, 320, 10, 1, true);
      paragraph(comparison, `${a?.textbookName ?? verdict.referenceId}: ${pct(a?.comparable?.rate)}`, M, y - 15, 326, 9, 1, false, C.muted);
      paragraph(comparison, `${b?.textbookName ?? verdict.textbookId}: ${pct(b?.comparable?.rate)}`, M, y - 31, 326, 9, 1, false, C.green);
      if (a?.comparable && b?.comparable) {
        const ax = 386 + a.comparable.rate * 325; const bx = 386 + b.comparable.rate * 325;
        line(comparison, ax, y - 10, bx, y - 10, C.line, 4);
        comparison.drawCircle({ x: ax, y: y - 10, size: 4, color: C.muted });
        comparison.drawCircle({ x: bx, y: y - 10, size: 4, color: C.green });
      }
      paragraph(comparison, m.textbooks.verdict[verdict.level], 386, y - 36, 380, 10, 2, true, verdict.level === "consistent" ? C.green : C.muted);
      line(comparison, M, y - 51, W - M, y - 51);
    });
    if (!compared.length) paragraph(comparison, m.reports.noComparisons, M, 398, 720, 16, 3);
    if (compared.length > 0 && compared.length <= 2) {
      const { c, verdict } = compared[0];
      const y = compared.length === 1 ? 280 : 208;
      text(comparison, m.ux.evidence, M, y, 12, true, C.green);
      const evidence = `${m.topics.colQuestions}: ${n(c.result.commonQuestionCount)} · ${m.skills.colTopic}: ${n(c.result.comparableTopicCount)}`;
      paragraph(comparison, evidence, M, y - 24, 740, 10, 1, false, C.muted);
      if (verdict.diff) text(comparison, `${m.units.ci}: ${pp(verdict.diff.ciLow)} … ${pp(verdict.diff.ciHigh)}`, M, y - 44, 11, true);
      paragraph(comparison, verdict.summary, M, y - 68, 740, 12, 2, true);
      paragraph(comparison, verdict.reasons.join(" "), M, y - 107, 740, 10, 3, false, C.muted);
    }
    selected(comparison, compared.length, pairs.length);

    const allocation = page(m.reports.hours, m.ux.defaultPlan);
    const plans = report.hours.filter(c => c.plan.ok);
    const rows = plans.flatMap(c => c.plan.ok ? c.plan.rows.map(row => ({ row, subject: c.subject, grade: c.grade })) : []);
    const changes = [...rows].sort((a, b) => Math.abs(b.row.changeHours) - Math.abs(a.row.changeHours));
    const shown = changes.slice(0, 8);
    const max = Math.max(1, ...shown.map(({ row }) => Math.abs(row.changeHours)));
    const zero = 650;
    text(allocation, m.reports.baseline, 335, 433, 9, false, C.muted);
    text(allocation, m.reports.recommended, 424, 433, 9, false, C.muted);
    text(allocation, m.ux.changeHours, 570, 433, 9, false, C.muted);
    line(allocation, zero, 103, zero, 421);
    shown.forEach(({ row, subject, grade }, i) => {
      const y = 402 - i * 38;
      paragraph(allocation, row.topicName, M, y + 4, 276, 10, 1, true);
      paragraph(allocation, course(subject, grade), M, y - 11, 276, 8, 1, false, C.muted);
      text(allocation, hours(row.currentHours), 335, y, 10);
      text(allocation, hours(row.recommendedHours), 424, y, 10, true);
      const delta = row.changeHours / max * 95;
      if (delta) rect(allocation, Math.min(zero, zero + delta), y - 3, Math.abs(delta), 9, delta > 0 ? C.green : C.red);
      text(allocation, `${row.changeHours > 0 ? "+" : ""}${n(row.changeHours)}`, 765, y, 9, true, row.changeHours < 0 ? C.red : C.green);
    });
    if (!shown.length) {
      const conflict = report.hours.find(c => !c.plan.ok);
      paragraph(allocation, conflict && !conflict.plan.ok ? `${conflict.plan.message} ${conflict.plan.details.join(" ")}` : m.reports.noHours, M, 398, 720, 16, 4);
    }
    const budget = plans.reduce((sum, c) => sum + (c.plan.ok ? c.plan.budgetHours : 0), 0);
    const reserve = plans.reduce((sum, c) => sum + (c.plan.ok ? c.plan.reserveHours : 0), 0);
    const conflicts = report.hours.filter(c => !c.plan.ok).length;
    const unplanned = report.hours.reduce((sum, c) => sum + c.unplannedTopics, 0);
    paragraph(allocation, `${m.reports.budget}: ${hours(budget)} · ${m.reports.reserve}: ${hours(reserve)}${conflicts ? ` · ${m.ux.validPlansOnly}` : ""}`, M, 107, 740, 9, 1, false, C.muted);
    if (conflicts || unplanned) paragraph(allocation, `${m.hours.conflictTitle}: ${n(conflicts)} · ${m.reports.unplannedTopics}: ${n(unplanned)}`, M, 90, 740, 8.5, 1, true, C.amber);
    note(allocation, `${t(m.ux.shownOf, { shown: n(shown.length), total: n(changes.length) })}. ${m.ux.noForecast}`);

    const actions = page(m.ux.actionableRecommendations, m.ux.summaryDescription);
    const hourAction = changes.find(({ row }) => row.changeHours > 0);
    const insights = [
      ...findings.slice(0, hourAction ? 2 : 3),
      ...(hourAction ? [{ title: `${hourAction.row.topicName}: ${hours(hourAction.row.currentHours)} -> ${hours(hourAction.row.recommendedHours)}`, detail: hourAction.row.reasons.join(" "), href: "/hours" }] : []),
    ];
    insights.forEach((insight, i) => {
      const x = M + i * 261;
      rect(actions, x, 215, 248, 211);
      text(actions, m.ux.action, x + 15, 403, 9, true, C.green);
      paragraph(actions, insight.title, x + 15, 379, 218, 13, 4, true);
      paragraph(actions, insight.detail, x + 15, 293, 218, 9, 5, false, C.muted);
      const nav = insight.href.startsWith("/hours") ? m.nav.hours : insight.href.startsWith("/textbooks") ? m.nav.textbooks : insight.href.startsWith("/skills") ? m.nav.skills : m.nav.topics;
      paragraph(actions, `${m.ux.nextStep}: ${nav}`, x + 15, 234, 218, 9, 1, true, C.green);
    });
    if (!insights.length) paragraph(actions, m.ux.noRecommendations, M, 396, 730, 16, 3);
    text(actions, m.ux.dataQuality, M, 185, 12, true);
    paragraph(actions, report.quality.map(item => item.kind === "synthetic" ? quality[item.kind] : `${quality[item.kind]}: ${n(item.count)}`).join(" · ") || (report.sample.answers ? m.ux.enoughData : m.reports.noData), M, 163, 750, 9, 4, false, C.muted);
    note(actions, `${m.reports.comparisonNote} ${m.reports.hoursNote}`, 94);
  } else {
    const appendixSections: { title: string; headers: string[]; widths: number[]; rows: string[][] }[] = [];
    appendixSections.push({ title: m.ux.source, headers: [m.ux.evidence, m.ux.details], widths: [170, 600], rows: [
      [m.ux.source, report.sample.datasetName], [m.ux.scope, scope],
      [m.ux.period, `${date(report.sample.dateFrom)} - ${date(report.sample.dateTo)}`],
      [m.ux.generated, date(report.generatedAt)],
      ...report.quality.map(item => [quality[item.kind], n(item.count)]),
      [m.ux.dataQuality, `${m.reports.comparisonNote} ${m.reports.hoursNote}`],
    ] });
    appendixSections.push({ title: m.ux.actionableRecommendations, headers: [m.ux.keyFinding, m.ux.evidence], widths: [260, 510], rows: findings.map(insight => [insight.title, insight.detail]) });
    const topics = options.topics ?? [...report.problemTopics, ...report.insufficientTopics];
    appendixSections.push({ title: m.nav.topics, headers: [m.topics.colTopic, m.filters.subject, m.topics.colStudents, m.topics.colAnswers, m.topics.colRate, m.units.ci, m.topics.colStatus], widths: [210, 140, 65, 65, 65, 95, 130], rows: topics.map(topic => [topic.topicName, course(topic.subject, topic.grade), n(topic.students), n(topic.answers), pct(topic.rate), `${pct(topic.estimate?.ciLow)} – ${pct(topic.estimate?.ciHigh)}`, m.status[topic.status]]) });
    appendixSections.push({ title: m.skills.questionsTitle, headers: [m.skills.colQuestion, m.skills.colTopic, m.skills.colSkill, m.skills.colAnswers, m.skills.colRate, m.skills.colErrors], widths: [100, 170, 150, 60, 60, 230], rows: (options.questions ?? []).map(q => [`${q.testId} · ${q.questionId}`, q.topicName, q.skill ?? "—", n(q.answers), pct(q.rate), q.errors.map(e => `${e.known ? m.errorTypes[e.errorType as keyof typeof m.errorTypes] : e.errorType}: ${n(e.count)}`).join("; ") || "—"]) });
    appendixSections.push({ title: m.skills.chartTitle, headers: [m.skills.colSkill, m.skills.colTopic, m.topics.colStudents, m.topics.colAnswers, m.skills.colRate, m.units.ci], widths: [205, 205, 80, 80, 80, 120], rows: (report.skills?.skills ?? []).map(s => [s.skill, s.topicName, n(s.students), n(s.answers), pct(s.rate), `${pct(s.estimate?.ciLow)} – ${pct(s.estimate?.ciHigh)}`]) });
    for (const c of report.textbooks) {
      appendixSections.push({ title: `${m.reports.textbooks} · ${course(c.subject, c.grade)}`, headers: [m.textbooks.colTextbook, m.ux.evidence], widths: [260, 510], rows: c.result.verdicts.map(v => [`${c.textbookNames[v.textbookId]} / ${c.textbookNames[v.referenceId]}`, `${m.textbooks.verdict[v.level]}. ${v.summary} ${v.diff ? `${m.units.ci}: ${pp(v.diff.ciLow)} … ${pp(v.diff.ciHigh)}.` : ""} ${v.reasons.join(" ")}`]) });
      appendixSections.push({ title: `${m.nav.topics} · ${course(c.subject, c.grade)}`, headers: [m.topics.colTopic, m.topics.colQuestions, m.ux.evidence], widths: [220, 95, 455], rows: c.result.topics.map(topic => [topic.topicName, n(topic.commonQuestions), Object.entries(topic.cells).map(([id, cell]) => `${c.textbookNames[id]}: ${pct(cell?.estimate?.rate)}; ${m.topics.colStudents}: ${cell ? n(cell.students) : "—"}; ${m.topics.colAnswers}: ${cell ? n(cell.answers) : "—"}`).join(". ") + " " + topic.notes.join(" ")]) });
      appendixSections.push({ title: `${m.reports.textbooks} · ${course(c.subject, c.grade)}`, headers: [m.textbooks.colTextbook, m.topics.colStudents, m.topics.colAnswers, m.textbooks.colCommonQuestions, m.units.ci], widths: [300, 95, 95, 140, 140], rows: c.result.groups.map(g => [g.textbookName, n(g.comparableStudents), g.comparable ? n(g.comparable.total) : "—", pct(g.comparable?.rate), `${pct(g.comparable?.ciLow)} – ${pct(g.comparable?.ciHigh)}`]) });
    }
    for (const c of report.hours) {
      if (!c.plan.ok) appendixSections.push({ title: `${m.reports.hours} · ${course(c.subject, c.grade)}`, headers: [m.hours.conflictTitle, m.ux.evidence], widths: [200, 570], rows: [[c.plan.message, c.plan.details.join(" ")]] });
      if (c.plan.ok) appendixSections.push({ title: `${m.reports.hours} · ${course(c.subject, c.grade)}`, headers: [m.hours.colTopic, m.reports.baseline, m.reports.recommended, m.hours.colMin, m.hours.colReason], widths: [205, 90, 95, 90, 290], rows: c.plan.rows.map(r => [r.topicName, hours(r.currentHours), hours(r.recommendedHours), hours(r.minHours), r.reasons.join(" ")]) });
    }
    for (const section of appendixSections) {
      if (section.rows.length === 0) continue;
      const available = W - M * 2;
      const sum = section.widths.reduce((a, b) => a + b, 0);
      const widths = section.widths.map(w => w / sum * available);
      let p: PDFPage; let y: number;
      const start = () => {
        p = page(section.title);
        y = 429;
        const headerHeight = Math.max(...section.headers.map((h, i) => lines(h, widths[i] - 12, 8, true).length)) * 11 + 15;
        rect(p, M, y - headerHeight, available, headerHeight);
        let x = M;
        section.headers.forEach((h, i) => { paragraph(p, h, x + 6, y - 12, widths[i] - 12, 8, 6, true); x += widths[i]; });
        y -= headerHeight + 1;
      };
      start();
      if (!section.rows.length) { paragraph(p!, m.ux.noReliableFinding, M, y! - 25, 730, 11, 3, false, C.muted); continue; }
      for (const row of section.rows) {
        const cells = row.map((value, i) => lines(value, widths[i] - 12, 8.5));
        const totalLines = Math.max(...cells.map(c => c.length), 1);
        let offset = 0;
        while (offset < totalLines) {
          if (y! < 93) start();
          const capacity = Math.floor((y! - 66 - 14) / 12);
          const remaining = totalLines - offset;
          if (remaining <= 32 && remaining > capacity && y! < 380) start();
          const count = Math.min(remaining, Math.max(1, Math.floor((y! - 66 - 14) / 12)));
          let x = M;
          cells.forEach((cell, i) => { cell.slice(offset, offset + count).forEach((value, j) => text(p!, value, x + 6, y! - 14 - j * 12, 8.5)); x += widths[i]; });
          y! -= count * 12 + 14;
          line(p!, M, y!, W - M, y!);
          offset += count;
          if (offset < totalLines) start();
        }
      }
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    line(p, M, 49, W - M, 49);
    paragraph(p, `${m.ux.source}: ${report.sample.datasetName}${report.sample.isSynthetic ? ` · ${m.shell.demoData}` : ""}`, M, 34, 480, 7.5, 1, false, C.muted);
    paragraph(p, `${m.ux.period}: ${date(report.sample.dateFrom)} – ${date(report.sample.dateTo)} · ${m.ux.generated}: ${date(report.generatedAt)}`, M, 22, 690, 7, 1, false, C.muted);
    text(p, t(m.ux.pageNumber, { page: i + 1, pages: pages.length }), W - 74, 31, 9, true, C.muted);
  });
  doc.setTitle(`BilimLens · ${options.appendix ? m.ux.appendix : m.reports.title}`);
  doc.setSubject(scope);
  doc.setAuthor("BilimLens");
  doc.setProducer("BilimLens · pdf-lib");
  doc.setCreationDate(new Date(report.generatedAt));
  doc.setModificationDate(new Date(report.generatedAt));
  return doc.save();
}
