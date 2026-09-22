// Dashboard filters, carried in the URL so every view is linkable and a TV can
// be pointed at a filtered page.
import { dateInPT } from "../time";

export const RANGE_PRESETS = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "ytd", label: "This year" },
  { value: "custom", label: "Custom range" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["value"];

export interface Filters {
  range: RangePreset;
  from: string | null;
  to: string | null;
  company: string | null;
  assignee: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseFilters(params: Record<string, string | string[] | undefined>, now = new Date()): Filters {
  const today = dateInPT(now);
  const rangeRaw = one(params.range);
  const range = (RANGE_PRESETS.some((p) => p.value === rangeRaw) ? rangeRaw : "all") as RangePreset;

  let from: string | null = null;
  let to: string | null = null;
  switch (range) {
    case "30d":
      from = shiftDays(today, -29);
      break;
    case "90d":
      from = shiftDays(today, -89);
      break;
    case "12m":
      from = shiftDays(today, -364);
      break;
    case "ytd":
      from = `${today.slice(0, 4)}-01-01`;
      break;
    case "custom": {
      const f = one(params.from);
      const t = one(params.to);
      from = f && DATE.test(f) ? f : null;
      to = t && DATE.test(t) ? t : null;
      if (from && to && from > to) [from, to] = [to, from];
      break;
    }
  }

  return { range, from, to, company: one(params.company), assignee: one(params.assignee) };
}

/** Arguments for the completed_performance_* SQL functions. */
export function toRpcArgs(f: Filters) {
  return { p_from: f.from, p_to: f.to, p_company: f.company, p_assignee: f.assignee };
}

export function hasFilters(f: Filters): boolean {
  return f.range !== "all" || !!f.company || !!f.assignee;
}
