import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n/core";
import { formatInt } from "@/lib/format";
import { describe, expect, it, vi } from "vitest";
import { Disclosure, Pagination, paginate } from "@/components/common/exploration";

vi.mock("@/i18n/provider", () => ({ useI18n: () => i18n() }));

describe("complete paginated evidence", () => {
  it("makes every observation reachable exactly once", () => {
    const records = Array.from({ length: 103 }, (_, id) => ({ id }));
    const all = Array.from({ length: paginate(records, 0, 12).pageCount }, (_, page) => paginate(records, page, 12).rows).flat();
    expect(all).toEqual(records);
    expect(new Set(all.map(row => row.id)).size).toBe(103);
    expect(paginate(records, 8, 12)).toMatchObject({ start: 97, end: 103, page: 8, pageCount: 9 });
  });
  it("clamps stale page indices after a filter reduces the data", () => {
    expect(paginate(["only"], 24, 12)).toMatchObject({ rows: ["only"], page: 0, start: 1, end: 1 });
    expect(paginate([], 24)).toMatchObject({ rows: [], page: 0, start: 0, end: 0, total: 0 });
  });
  it("normalizes invalid page and size inputs without losing records", () => {
    expect(paginate([1, 2], -1, 0).rows).toEqual([1]);
    expect(paginate([1, 2], NaN, Infinity).rows).toEqual([1, 2]);
  });
});


describe("pagination presentation", () => {
  it("omits controls for empty and single-page results", () => {
    for (const records of [[], [1, 2, 3, 4]]) {
      expect(renderToStaticMarkup(createElement(Pagination, { ...paginate(records), onPageChange: vi.fn() }))).toBe("");
    }
  });
  it("keeps navigation for multiple pages", () => {
    const html = renderToStaticMarkup(createElement(Pagination, { ...paginate([1, 2, 3], 0, 2), onPageChange: vi.fn() }));
    expect(html).toContain(i18n().m.ux.next);
    expect(html.match(/<button/g)).toHaveLength(2);
  });
  it("formats disclosure counts with grouped digits", () => {
    const html = renderToStaticMarkup(Disclosure({ title: "Evidence", count: 24252, children: "Rows" }));
    expect(html).toContain(formatInt(24252));
  });
});
