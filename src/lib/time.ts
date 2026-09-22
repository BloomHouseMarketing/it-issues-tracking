// Date helpers. All business dates are Pacific time (America/Los_Angeles).

export const PT_ZONE = "America/Los_Angeles";

const ptDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PT_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) of an instant, in Pacific time. */
export function dateInPT(instant: Date): string {
  return ptDateFormat.format(instant);
}

/** Calendar month (YYYY-MM) of an instant, in Pacific time. */
export function monthInPT(instant: Date): string {
  return dateInPT(instant).slice(0, 7);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateToUtcMs(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Positive if `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / 86_400_000);
}

/** Days overdue as of `now`: today (PT) minus the due date. */
export function daysOverdue(dueDate: string, now: Date): number {
  return daysBetween(dueDate, dateInPT(now));
}

/**
 * monday activity-log `created_at` is a count of 100 ns ticks since the Unix
 * epoch, e.g. "17267040000000000". Converts it to a Date (ms precision).
 */
export function activityLogTimestampToDate(createdAt: string | number): Date {
  const ticks = BigInt(String(createdAt).trim());
  return new Date(Number(ticks / BigInt(10_000)));
}
