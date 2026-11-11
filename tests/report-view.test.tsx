import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n, i18n, setCurrentI18n } from "@/i18n/core";
import { ru } from "@/i18n/messages/ru";
import { en } from "@/i18n/messages/en";
import { buildDataset } from "@/lib/data/dataset";
import { EMPTY_FILTERS, type Dataset } from "@/lib/domain/types";
import { config, rec } from "./helpers";
import { ReportsView } from "@/components/views/reports-view";
import { HoursView } from "@/components/views/hours-view";

let dataset: Dataset;
let filters = { ...EMPTY_FILTERS };
vi.mock("@/providers/data-provider", () => ({ useReadyData: () => ({ dataset, filters, config }) }));
vi.mock("@/i18n/provider", () => ({ useI18n: () => i18n() }));
vi.mock("@/components/common/data-gate", () => ({ DataGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/common/filter-bar", () => ({ FilterBar: () => null }));

function sample(withSkills = false) {
  dataset = buildDataset([
    rec({ studentId: "s1", isCorrect: false, ...(withSkills ? { skill: "Sign rules", errorType: "sign" } : {}) }),
    rec({ studentId: "s2", isCorrect: true }),
    rec({ studentId: "s3", isCorrect: true }),
    rec({ subject: "Физика", studentId: "p1", testId: "PHYSICS_TEST" }),
  ], [], { name: "Teacher dataset", source: "upload" });
  filters = { ...EMPTY_FILTERS, subject: "Алгебра", grade: 7 };
}

afterEach(() => setCurrentI18n(createI18n("ru", ru)));

describe("report rendering", () => {
  it("keeps task analysis for old CSV without inventing skills", () => {
    sample();
    const html = renderToStaticMarkup(<ReportsView />);
    expect(html).toContain("TEST1");
    expect(html).toContain("Q1");
    expect(html).toContain("66,7%");
    expect(html).toContain(ru.reports.noSkills);
    expect(html).not.toContain("PHYSICS_TEST");
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("localizes headings and calculated explanations in English", () => {
    sample(true);
    setCurrentI18n(createI18n("en", en));
    const html = renderToStaticMarkup(<ReportsView />);
    expect(html).toContain(en.reports.title);
    expect(html).toContain(en.ux.downloadReport);
    expect(html).toContain(en.ux.downloadAppendix);
    expect(html).toContain("Sign rules");
    expect(html).not.toContain(ru.reports.title);
  });

  it("shows an empty scope without fabricated statistics", () => {
    sample();
    filters.subject = "No such subject";
    const html = renderToStaticMarkup(<ReportsView />);
    expect(html).toContain(ru.reports.noData);
    expect(html).not.toContain("TEST1");
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("reports supplied error categories even without skill metadata", () => {
    sample();
    dataset.records[0].errorType = "units";
    const html = renderToStaticMarkup(<ReportsView />);
    expect(html).toContain(ru.skills.errorsTitle);
    expect(html).toContain(ru.errorTypes.units);
    expect(html).toContain(ru.reports.noSkills);
  });

  it("discloses assessed topics missing from a partial curriculum plan", () => {
    sample();
    dataset.curriculum = [{ subject: "Алгебра", grade: 7, topicId: "T1", topicName: "Тема 1", currentHours: 4, minHours: 2 }];
    dataset.records.push(rec({ topicId: "T2", topicName: "Missing-plan topic", questionId: "Q2" }));
    const html = renderToStaticMarkup(<ReportsView />);
    expect(html).toContain(ru.reports.unplannedTopics);
    const simulator = renderToStaticMarkup(<HoursView scenarioOnly />);
    expect(simulator).toContain(ru.hours.unplanned.split("{topics}")[0]);
    expect(simulator).toContain("Missing-plan topic");
  });

  it("does not call a conflicting curriculum an absent curriculum", () => {
    sample();
    dataset.curriculum = [{ subject: "Алгебра", grade: 7, topicId: "T1", topicName: "Тема 1", currentHours: 1, minHours: 4 }];
    const html = renderToStaticMarkup(<ReportsView />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(ru.hours.conflictTitle);
    expect(html).not.toContain(ru.reports.noHours);
  });

  it("leads with uncertainty when no topic has enough observations", () => {
    sample();
    const html = renderToStaticMarkup(<ReportsView />);
    expect(html).toContain(ru.ux.noReliableFinding);
    expect(html).not.toContain(ru.insights.noneTitle);
  });
});
