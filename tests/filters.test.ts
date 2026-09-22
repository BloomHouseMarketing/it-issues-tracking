import { describe, expect, it } from "vitest";
import { filtersToQuery, monthlyChartWindow, parseFilters, resolveRange, toRpcArgs, weekStart } from "@/lib/dashboard/filters";

// 06:00 UTC on Wed Sep 23 is still Tue Sep 22, 2026 in Pacific time.
const NOW = new Date("2026-09-23T06:00:00Z");
const TODAY = "2026-09-22"; // a Tuesday

describe("resolveRange", () => {
  it.each([
    ["today", "2026-09-22", "2026-09-22"],
    ["yesterday", "2026-09-21", "2026-09-21"],
    ["this_week", "2026-09-21", "2026-09-22"], // Monday to today
    ["last_week", "2026-09-14", "2026-09-20"], // Monday to Sunday
    ["this_month", "2026-09-01", "2026-09-22"],
    ["last_month", "2026-08-01", "2026-08-31"],
    ["30d", "2026-08-24", "2026-09-22"],
    ["6m", "2026-04-01", "2026-09-22"], // Apr..Sep = 6 months, same as the monthly chart
  ] as const)("%s → %s .. %s", (range, from, to) => {
    expect(resolveRange(range, TODAY)).toEqual({ from, to });
  });

  it("has no bounds for all time", () => {
    expect(resolveRange("all", TODAY)).toEqual({ from: null, to: null });
  });

  it("handles year and month boundaries", () => {
    expect(resolveRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolveRange("last_month", "2024-03-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(resolveRange("yesterday", "2026-01-01")).toEqual({ from: "2025-12-31", to: "2025-12-31" });
    expect(resolveRange("6m", "2026-02-10")).toEqual({ from: "2025-09-01", to: "2026-02-10" });
    // Week starting in the previous year.
    expect(resolveRange("this_week", "2026-01-02")).toEqual({ from: "2025-12-29", to: "2026-01-02" });
  });

  it("treats Monday as the first day and Sunday as the last", () => {
    expect(weekStart("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday
    expect(resolveRange("last_week", "2026-09-21")).toEqual({ from: "2026-09-14", to: "2026-09-20" });
  });
});

describe("parseFilters", () => {
  it("defaults to this month, computed from today in Pacific time", () => {
    expect(parseFilters({}, NOW)).toEqual({ range: "this_month", from: "2026-09-01", to: "2026-09-22", company: null, assignee: null });
  });

  it("uses custom dates only when valid, and swaps a reversed range", () => {
    expect(parseFilters({ range: "custom", from: "2025-01-01", to: "2025-03-31" }, NOW)).toMatchObject({ from: "2025-01-01", to: "2025-03-31" });
    expect(parseFilters({ range: "custom", from: "2025-03-31", to: "2025-01-01" }, NOW)).toMatchObject({ from: "2025-01-01", to: "2025-03-31" });
    expect(parseFilters({ range: "custom", from: "garbage", to: "2025-01-01" }, NOW)).toMatchObject({ from: null, to: "2025-01-01" });
    // Dates in the URL are ignored unless the range is custom.
    expect(parseFilters({ range: "today", from: "2025-01-01" }, NOW)).toMatchObject({ from: TODAY, to: TODAY });
  });

  it("falls back to the default for an unknown range and trims company/assignee", () => {
    expect(parseFilters({ range: "forever", company: "  Opus Health ", assignee: "" }, NOW)).toMatchObject({
      range: "this_month",
      company: "Opus Health",
      assignee: null,
    });
  });

  it("maps to the SQL function arguments", () => {
    expect(toRpcArgs(parseFilters({ range: "this_month", company: "BXR" }, NOW))).toEqual({
      p_from: "2026-09-01",
      p_to: TODAY,
      p_company: "BXR",
      p_assignee: null,
    });
  });
});

describe("monthlyChartWindow", () => {
  it("always covers the current month and the 5 before it", () => {
    expect(monthlyChartWindow(TODAY)).toEqual({ from: "2026-04-01", to: TODAY });
    expect(monthlyChartWindow("2026-03-05")).toEqual({ from: "2025-10-01", to: "2026-03-05" });
  });
});

describe("filtersToQuery", () => {
  it("round-trips through parseFilters and leaves defaults out", () => {
    expect(filtersToQuery({ range: "this_month", from: null, to: null, company: null, assignee: null })).toBe("/");
    expect(filtersToQuery({ range: "6m", from: null, to: null, company: null, assignee: null })).toBe("/?range=6m");
    const q = filtersToQuery({ range: "custom", from: "2026-01-01", to: "2026-02-15", company: "St. Louis, LLC", assignee: "Bryan Wolfe" });
    const params = Object.fromEntries(new URLSearchParams(q.slice(2)));
    expect(parseFilters(params, NOW)).toEqual({
      range: "custom",
      from: "2026-01-01",
      to: "2026-02-15",
      company: "St. Louis, LLC",
      assignee: "Bryan Wolfe",
    });
    expect(filtersToQuery({ range: "last_week", from: "2026-09-14", to: "2026-09-20", company: null, assignee: null })).toBe("/?range=last_week");
  });
});
