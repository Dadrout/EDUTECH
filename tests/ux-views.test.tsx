import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { datasetFromDemoCsv } from "@/lib/data/dataset";
import { getFilterOptions, listCourses } from "@/lib/analytics/filters";
import { filterRecords } from "@/lib/analytics/filters";
import { computeInsights } from "@/lib/analytics/insights";
import { computeTopicStats } from "@/lib/analytics/topics";
import { EMPTY_FILTERS } from "@/lib/domain/types";
import { i18n } from "@/i18n/core";
import { config } from "./helpers";
import { OverviewView } from "@/components/views/overview-view";
import { TopicsView } from "@/components/views/topics-view";
import { TextbooksView } from "@/components/views/textbooks-view";
import { HoursView } from "@/components/views/hours-view";
import { SkillsView } from "@/components/views/skills-view";
import { ReportsView } from "@/components/views/reports-view";
import { DataView } from "@/components/views/data-view";
import { MethodologyView } from "@/components/views/methodology-view";
import { TooltipProvider } from "@/components/ui/tooltip";

const dataset = datasetFromDemoCsv(readFileSync("public/demo/results.csv", "utf8"), readFileSync("public/demo/curriculum.csv", "utf8"));
const filters = { ...EMPTY_FILTERS, subject: "Алгебра", grade: 8 };
const context = { dataset, filters, config, status: "ready", courses: listCourses(dataset.records), options: getFilterOptions(dataset.records, filters), setFilters: vi.fn(), resetFilters: vi.fn(), setConfig: vi.fn(), restoreDemo: vi.fn(), retry: vi.fn() };
vi.mock("@/providers/data-provider", () => ({ useReadyData: () => context, useData: () => context }));
vi.mock("@/i18n/provider", () => ({ useI18n: () => i18n() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/components/common/data-gate", () => ({ DataGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/common/filter-bar", () => ({ FilterBar: () => null }));

describe("nine-screen disclosure and finite rendering", () => {
  for (const [name, View] of [
    ["overview", OverviewView], ["topics", TopicsView], ["textbooks", TextbooksView],
    ["hours", HoursView], ["simulator", () => <HoursView scenarioOnly />],
    ["skills", SkillsView], ["reports", ReportsView], ["data", DataView], ["methodology", MethodologyView],
  ] as const) {
    it(`${name}: renders a bounded initial view without losing access to details`, () => {
      const html = renderToStaticMarkup(<TooltipProvider><View /></TooltipProvider>);
      expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      expect((html.match(/<tr\b/g) ?? []).length).toBeLessThan(90);
      expect(html).toContain(name === "simulator" ? 'role="meter"' : "<details");
      if (["overview", "topics", "textbooks", "hours", "skills", "reports"].includes(name)) expect(html).toContain('class="finding ');
    });
  }

  it("offers direct report and appendix downloads without screenshot/print export", () => {
    const html = renderToStaticMarkup(<ReportsView />);
    expect(html).toContain(i18n().m.ux.downloadReport);
    expect(html).toContain(i18n().m.ux.downloadAppendix);
    expect(html).toContain(i18n().m.ux.reportFormat);
    expect(html).not.toContain("Печать /");
  });

  it("does not repeat the leading finding in the default overview/report recommendations", () => {
    const records = filterRecords(dataset.records, filters);
    const first = computeInsights(records, computeTopicStats(records, config), config)[0];
    expect(first).toBeDefined();
    for (const View of [OverviewView, ReportsView]) {
      const html = renderToStaticMarkup(<TooltipProvider><View /></TooltipProvider>);
      expect(html.split(first.title).length - 1).toBe(1);
    }
  });
});
