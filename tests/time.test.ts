import { describe, expect, it } from "vitest";
import { activityLogTimestampToDate, dateInPT, daysBetween, daysOverdue, monthInPT } from "@/lib/time";

describe("dateInPT", () => {
  it("uses the Pacific date late in the UTC day (PDT, UTC-7)", () => {
    // 06:59Z on Sep 22 is 23:59 on Sep 21 in PDT.
    expect(dateInPT(new Date("2026-09-22T06:59:00Z"))).toBe("2026-09-21");
    expect(dateInPT(new Date("2026-09-22T07:00:00Z"))).toBe("2026-09-22");
  });

  it("uses UTC-8 in winter (PST)", () => {
    expect(dateInPT(new Date("2026-01-15T07:59:00Z"))).toBe("2026-01-14");
    expect(dateInPT(new Date("2026-01-15T08:00:00Z"))).toBe("2026-01-15");
  });

  it("handles the spring-forward and fall-back days", () => {
    // 2026-03-08: clocks jump 02:00 PST -> 03:00 PDT.
    expect(dateInPT(new Date("2026-03-08T07:59:00Z"))).toBe("2026-03-07");
    expect(dateInPT(new Date("2026-03-09T06:59:00Z"))).toBe("2026-03-08");
    // 2026-11-01: clocks fall back 02:00 PDT -> 01:00 PST.
    expect(dateInPT(new Date("2026-11-02T07:59:00Z"))).toBe("2026-11-01");
    expect(dateInPT(new Date("2026-11-02T08:00:00Z"))).toBe("2026-11-02");
  });
});

describe("monthInPT", () => {
  it("assigns a completion just after midnight UTC on the 1st to the previous PT month", () => {
    expect(monthInPT(new Date("2026-10-01T03:00:00Z"))).toBe("2026-09");
    expect(monthInPT(new Date("2026-10-01T07:00:00Z"))).toBe("2026-10");
  });
});

describe("daysBetween / daysOverdue", () => {
  it("counts calendar days, including across DST and month ends", () => {
    expect(daysBetween("2026-09-20", "2026-09-22")).toBe(2);
    expect(daysBetween("2026-09-22", "2026-09-20")).toBe(-2);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  });

  it("measures overdue days against today in PT, not UTC", () => {
    // 05:00Z Sep 23 is still Sep 22 in PT.
    const now = new Date("2026-09-23T05:00:00Z");
    expect(daysOverdue("2026-09-20", now)).toBe(2);
    expect(daysOverdue("2026-09-22", now)).toBe(0);
  });

  it("rejects malformed dates", () => {
    expect(() => daysBetween("2026-9-1", "2026-09-02")).toThrow();
  });
});

describe("activityLogTimestampToDate", () => {
  it("converts 100 ns ticks to milliseconds", () => {
    expect(activityLogTimestampToDate("17891280000000000").toISOString()).toBe("2026-09-11T12:00:00.000Z");
    expect(activityLogTimestampToDate(17890416000000000).toISOString()).toBe("2026-09-10T12:00:00.000Z");
  });

  it("keeps millisecond precision for 17-digit values", () => {
    expect(activityLogTimestampToDate("17891280001234567").toISOString()).toBe("2026-09-11T12:00:00.123Z");
  });
});
