import { describe, expect, it } from "vitest";
import { fillMonths } from "@/components/charts/MonthlyChart";

const row = (key: string, population: number) => ({
  key,
  population,
  early: 0,
  on_time: 0,
  completed_on_time: 0,
  completed_late: population,
  on_time_rate: 0,
  avg_days_late: 1,
  median_days_late: 1,
  max_days_late: 1,
});

describe("fillMonths", () => {
  it("returns exactly one bar per month, zero-filling gaps and ignoring outside months", () => {
    const out = fillMonths([row("2026-05", 3), row("2026-09", 7), row("2025-01", 9)], "2026-04", "2026-09");
    expect(out.map((r) => r.key)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(out.map((r) => r.population)).toEqual([0, 3, 0, 0, 0, 7]);
  });

  it("crosses a year boundary", () => {
    expect(fillMonths([], "2025-10", "2026-03").map((r) => r.key)).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
  });
});
