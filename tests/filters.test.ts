import { describe, expect, it } from "vitest";
import { parseFilters, toRpcArgs } from "@/lib/dashboard/filters";

// 06:00 UTC on Sep 23 is still Sep 22 in Pacific time.
const NOW = new Date("2026-09-23T06:00:00Z");

describe("parseFilters", () => {
  it("defaults to all time with no filters", () => {
    expect(parseFilters({}, NOW)).toEqual({ range: "all", from: null, to: null, company: null, assignee: null });
  });

  it("computes presets from today in Pacific time", () => {
    expect(parseFilters({ range: "30d" }, NOW).from).toBe("2026-08-24");
    expect(parseFilters({ range: "90d" }, NOW).from).toBe("2026-06-25");
    expect(parseFilters({ range: "12m" }, NOW).from).toBe("2025-09-23");
    expect(parseFilters({ range: "ytd" }, NOW).from).toBe("2026-01-01");
    expect(parseFilters({ range: "30d" }, NOW).to).toBeNull();
  });

  it("uses custom dates only when valid, and swaps a reversed range", () => {
    expect(parseFilters({ range: "custom", from: "2025-01-01", to: "2025-03-31" }, NOW)).toMatchObject({ from: "2025-01-01", to: "2025-03-31" });
    expect(parseFilters({ range: "custom", from: "2025-03-31", to: "2025-01-01" }, NOW)).toMatchObject({ from: "2025-01-01", to: "2025-03-31" });
    expect(parseFilters({ range: "custom", from: "garbage", to: "2025-01-01" }, NOW)).toMatchObject({ from: null, to: "2025-01-01" });
    // Dates are ignored unless the range is custom.
    expect(parseFilters({ range: "all", from: "2025-01-01" }, NOW).from).toBeNull();
  });

  it("falls back to all time for an unknown range and trims company/assignee", () => {
    expect(parseFilters({ range: "forever", company: "  Opus Health ", assignee: "" }, NOW)).toMatchObject({
      range: "all",
      company: "Opus Health",
      assignee: null,
    });
  });

  it("maps to the SQL function arguments", () => {
    expect(toRpcArgs(parseFilters({ range: "ytd", company: "BXR" }, NOW))).toEqual({
      p_from: "2026-01-01",
      p_to: null,
      p_company: "BXR",
      p_assignee: null,
    });
  });
});
