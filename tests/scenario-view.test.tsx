import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { i18n } from "@/i18n/core";
import { HoursScenario } from "@/components/views/hours-scenario";
import { buildHoursInputs, recommendHours } from "@/lib/analytics/hours";
import { defaultHoursConfig } from "@/lib/config/analysis-config";
import { config } from "./helpers";

vi.mock("@/i18n/provider", () => ({ useI18n: () => i18n() }));

it("allows half-hour offsets even when the recommendation transfer step is one hour", () => {
  const { inputs } = buildHoursInputs([{ subject: "Алгебра", grade: 7, topicId: "T1", topicName: "Topic", currentHours: 2.5, minHours: 0.5 }], [], "Алгебра", 7);
  const params = { ...defaultHoursConfig(config), stepHours: 1, budgetHours: 2.5, mediumPct: config.thresholds.medium };
  const plan = recommendHours(inputs, params);
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.message);
  const html = renderToStaticMarkup(<HoursScenario rows={plan.rows} params={params} subject="Алгебра" grade={7} />);
  expect(html).toContain('type="number" min="0.5" step="0.5"');
  expect(html).toContain('type="range" min="0.5"');
});


it("shows every editable topic without repeating the page heading or paginating the editor", () => {
  const topics = Array.from({ length: 8 }, (_, i) => ({ subject: "Алгебра", grade: 7, topicId: `T${i}`, topicName: `Topic ${i}`, currentHours: 2.5, minHours: 0.5 }));
  const { inputs } = buildHoursInputs(topics, [], "Алгебра", 7);
  const params = { ...defaultHoursConfig(config), budgetHours: 20, mediumPct: config.thresholds.medium };
  const plan = recommendHours(inputs, params);
  if (!plan.ok) throw new Error(plan.message);
  const html = renderToStaticMarkup(<HoursScenario rows={plan.rows} params={params} subject="Алгебра" grade={7} />);
  expect(html.match(/type="number"/g)).toHaveLength(8);
  for (const topic of topics) expect(html).toContain(topic.topicName);
  expect(html).not.toContain(i18n().m.scenario.title);
  expect(html).not.toContain(i18n().m.scenario.description);
  expect(html).not.toContain(i18n().m.ux.next);
  expect(html).toContain("sm:table-row");
  expect(html).toContain("size-11 sm:size-8");
});
