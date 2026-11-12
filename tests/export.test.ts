import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/data/export";

describe("CSV export", () => {
  it("neutralizes spreadsheet formulas from uploaded text but keeps numbers", () => {
    const csv = toCsv(["topic", "change"], [["=HYPERLINK(\"http://x\")", -2.5], ["@SUM(A1)", 3], ["Дроби", null]]);
    const [, first, second, third] = csv.split("\r\n");
    expect(first.startsWith('"\'=HYPERLINK')).toBe(true);
    expect(first.endsWith(",-2.5")).toBe(true);
    expect(second).toBe("\"'@SUM(A1)\",3");
    expect(third).toBe("Дроби,");
  });
});
