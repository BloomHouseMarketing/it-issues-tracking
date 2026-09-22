// Dashboard filters, carried in the URL so every view is linkable and a TV can
// be pointed at a filtered page. All dates are Pacific-time calendar dates.
import { formatDate } from "../format";
import { dateInPT } from "../time";

export const RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "30d", label: "Last 30 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "all", label: "All time" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["value"] | "custom";

export const DEFAULT_RANGE: RangePreset = "6m";

/** Months shown in the "On time vs late, by month" chart, including the current one. */
export const MONTHLY_CHART_MONTHS = 6;

export interface Filters {
  range: RangePreset;
  /** Inclusive PT date, or null for no lower bound. */
  from: string | null;
  /** Inclusive PT date, or null for no upper bound. */
  to: string | null;
  company: string | null;
  assignee: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return fmt(y, m, d + days);
}

/** First day of the month `offset` months from `date`'s month. */
export function monthStart(date: string, offset = 0): string {
  const [y, m] = parts(date);
  return fmt(y, m + offset, 1);
}

/** Monday of `date`'s week (weeks run Monday to Sunday). */
export function weekStart(date: string): string {
  const [y, m, d] = parts(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** Resolves a preset to inclusive PT dates, given today's PT date. */
export function resolveRange(range: RangePreset, today: string): { from: string | null; to: string | null } {
  switch (range) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "this_week":
      return { from: weekStart(today), to: today };
    case "last_week": {
      const start = addDays(weekStart(today), -7);
      return { from: start, to: addDays(start, 6) };
    }
    case "this_month":
      return { from: monthStart(today), to: today };
    case "last_month":
      return { from: monthStart(today, -1), to: addDays(monthStart(today), -1) };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "6m":
      // The current month plus the 5 before it, matching the monthly chart.
      return { from: monthStart(today, -(MONTHLY_CHART_MONTHS - 1)), to: today };
    case "all":
    case "custom":
      return { from: null, to: null };
  }
}

export function parseFilters(params: Record<string, string | string[] | undefined>, now = new Date()): Filters {
  const today = dateInPT(now);
  const rangeRaw = one(params.range);
  const known = rangeRaw === "custom" || RANGE_PRESETS.some((p) => p.value === rangeRaw);
  const range = (known ? rangeRaw : DEFAULT_RANGE) as RangePreset;

  let { from, to } = resolveRange(range, today);
  if (range === "custom") {
    const f = one(params.from);
    const t = one(params.to);
    from = f && DATE.test(f) ? f : null;
    to = t && DATE.test(t) ? t : null;
    if (from && to && from > to) [from, to] = [to, from];
  }

  return { range, from, to, company: one(params.company), assignee: one(params.assignee) };
}

/** Arguments for the completed_performance_* SQL functions. */
export function toRpcArgs(f: Pick<Filters, "from" | "to" | "company" | "assignee">) {
  return { p_from: f.from, p_to: f.to, p_company: f.company, p_assignee: f.assignee };
}

/** Date window for the monthly chart: always the last 6 months, ignoring the date filter. */
export function monthlyChartWindow(today: string): { from: string; to: string } {
  return { from: monthStart(today, -(MONTHLY_CHART_MONTHS - 1)), to: today };
}

/** Builds the dashboard URL for a set of filters (defaults are left out). */
export function filtersToQuery(f: Pick<Filters, "range" | "from" | "to" | "company" | "assignee">): string {
  const q = new URLSearchParams();
  if (f.range !== DEFAULT_RANGE) q.set("range", f.range);
  if (f.range === "custom") {
    if (f.from) q.set("from", f.from);
    if (f.to) q.set("to", f.to);
  }
  if (f.company) q.set("company", f.company);
  if (f.assignee) q.set("assignee", f.assignee);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

export function rangeLabel(range: RangePreset): string {
  return range === "custom" ? "Custom range" : RANGE_PRESETS.find((p) => p.value === range)!.label;
}

/** "Sep 1 – Sep 22, 2026" style summary of an inclusive range. */
export function describeRange(from: string | null, to: string | null): string {
  if (!from && !to) return "All completions";
  if (from && to && from === to) return formatDate(from);
  if (from && to && from.slice(0, 4) === to.slice(0, 4)) {
    return `${formatDate(from).replace(/, \d{4}$/, "")} – ${formatDate(to)}`;
  }
  return `${from ? formatDate(from) : "Start"} – ${to ? formatDate(to) : "today"}`;
}
