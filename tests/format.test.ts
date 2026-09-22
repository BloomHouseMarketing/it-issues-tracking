import { describe, expect, it } from "vitest";
import { formatDate, formatDateTimePT, formatMonth, formatNumber, formatPercent } from "@/lib/format";

describe("display formatting", () => {
  it("shows calendar dates as-is, without a timezone shift", () => {
    expect(formatDate("2026-09-01")).toBe("Sep 1, 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("shows instants in Pacific time", () => {
    // 03:00 UTC Sep 1 is 8:00 PM on Aug 31 in PDT.
    expect(formatDateTimePT("2026-09-01T03:00:00Z")).toBe("Aug 31, 8:00 PM PT");
  });

  it("formats months, percents and numbers", () => {
    expect(formatMonth("2026-09")).toBe("Sep 2026");
    expect(formatPercent(0.43708)).toBe("43.7%");
    expect(formatPercent(null)).toBe("—");
    expect(formatNumber(6.70588, 1)).toBe("6.7");
    expect(formatNumber(2, 1)).toBe("2");
    expect(formatNumber(1140)).toBe("1,140");
  });
});
