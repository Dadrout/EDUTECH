/**
 * Подпись доказательства для интерфейса и PDF: значения берутся из контекста,
 * который построил аналитический движок, а не из текста модели.
 */
import type { Messages } from "@/i18n/messages/ru";
import { formatHours, formatInt, formatPercentValue, formatPp } from "@/lib/format";
import type { EvidenceItem } from "./context";

type T = (template: string, params: Record<string, string | number>) => string;

export function describeEvidence(item: EvidenceItem, m: Messages, t: T): { title: string; values: string } {
  const x = item.metrics;
  const num = (k: string) => (typeof x[k] === "number" ? (x[k] as number) : null);
  if (item.kind === "error") {
    const labels = m.errorTypes as Record<string, string>;
    return {
      title: x.known_category === true ? (labels[item.label] ?? item.label) : item.label,
      values: [num("share_pct") !== null ? formatPercentValue(num("share_pct"), 1) : null, num("incorrect_answers") !== null ? formatInt(num("incorrect_answers")) : null].filter(Boolean).join(" · "),
    };
  }
  if (item.kind === "overview") {
    return {
      title: m.ai.pages.overview,
      values: [formatPercentValue(num("average_pct"), 1), t(m.units.studentsShort, { n: num("students") ?? 0 }), `${m.reports.problemTopics}: ${formatInt(num("problem_topics"))}`].join(" · "),
    };
  }
  const parts: string[] = [];
  if (num("rate_pct") !== null) parts.push(formatPercentValue(num("rate_pct"), 1));
  if (num("delta_pp") !== null) parts.push(formatPp((num("delta_pp") as number) / 100));
  if (typeof x.verdict === "string") parts.push((m.textbooks.verdict as Record<string, string>)[x.verdict] ?? x.verdict);
  if (num("diff_pp") !== null) parts.push(formatPp((num("diff_pp") as number) / 100));
  if (num("current_h") !== null && num("recommended_h") !== null) parts.push(`${formatHours(num("current_h"))} → ${formatHours(num("recommended_h"))}`);
  if (item.kind === "hours_plan" && num("budget_h") !== null) parts.push(`${m.hours.budget}: ${formatHours(num("budget_h"))}`);
  if (typeof x.status === "string") parts.push((m.status as Record<string, unknown>)[x.status] as string);
  if (num("students") !== null) parts.push(t(m.units.studentsShort, { n: num("students") as number }));
  const title = item.kind === "hours_plan" ? m.ai.pages.hours : item.label;
  return { title: item.course ? `${title} · ${item.course}` : title, values: parts.filter(Boolean).join(" · ") };
}
