// Loads everything the dashboard shows. Metric math lives in the SQL views and
// functions (supabase/migrations/*_metric_views.sql); this only fetches.
import "server-only";
import { createAdminClient } from "../supabase/admin";
import { dateInPT } from "../time";
import { monthlyChartWindow, toRpcArgs, type Filters } from "./filters";

export interface Kpis {
  population: number;
  early: number;
  on_time: number;
  completed_on_time: number;
  completed_late: number;
  on_time_rate: number | null;
  avg_days_late: number | null;
  median_days_late: number | null;
  max_days_late: number | null;
}

export interface BreakdownRow extends Kpis {
  key: string;
}

export interface OpenItem {
  item_id: number;
  name: string;
  status: string | null;
  report: string | null;
  due_date: string | null;
  days_past_due: number | null;
  company: string[];
  assignees: string[];
  priority: string | null;
  monday_url: string;
}

export interface CompletedItem {
  item_id: number;
  name: string;
  report: "Early" | "On Time" | "Late";
  days_delayed: number | null;
  due_date: string | null;
  completed_at: string | null;
  company: string[];
  assignees: string[];
  monday_url: string;
}

export interface Snapshot {
  snapshot_date: string;
  overdue_count: number | null;
  open_count: number | null;
}

export interface SyncRun {
  started_at: string;
  finished_at: string | null;
  items_synced: number | null;
  ok: boolean | null;
  error: string | null;
}

export interface DashboardData {
  kpis: Kpis;
  months: BreakdownRow[];
  byCompany: BreakdownRow[];
  byAssignee: BreakdownRow[];
  open: {
    total: number;
    overdue: OpenItem[];
    dueToday: number;
    noDueDate: number;
    todayPT: string;
  };
  /** Rated completions in the selected date range, newest first. */
  completions: CompletedItem[];
  snapshots: Snapshot[];
  lastSuccess: SyncRun | null;
  lastRun: SyncRun | null;
  options: { companies: string[]; assignees: string[] };
}

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function toKpis(r: Record<string, unknown> | undefined): Kpis {
  return {
    population: Number(r?.population ?? 0),
    early: Number(r?.early ?? 0),
    on_time: Number(r?.on_time ?? 0),
    completed_on_time: Number(r?.completed_on_time ?? 0),
    completed_late: Number(r?.completed_late ?? 0),
    on_time_rate: num(r?.on_time_rate),
    avg_days_late: num(r?.avg_days_late),
    median_days_late: num(r?.median_days_late),
    max_days_late: num(r?.max_days_late),
  };
}

function matches(item: { company: string[]; assignees: string[] }, f: Filters): boolean {
  return (!f.company || item.company.includes(f.company)) && (!f.assignee || item.assignees.includes(f.assignee));
}

function uniqueSorted(lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));
}

export async function getDashboardData(filters: Filters): Promise<DashboardData> {
  const db = createAdminClient();
  const args = toRpcArgs(filters);
  // The monthly chart ignores the date filter: always the last 6 months.
  const monthArgs = toRpcArgs({ ...filters, ...monthlyChartWindow(dateInPT(new Date())) });

  let completionsQuery = db
    .from("v_completed_performance")
    .select("item_id, name, report, days_delayed, due_date, completed_at, company, assignees, monday_url")
    .order("completed_at", { ascending: false, nullsFirst: false });
  if (filters.from) completionsQuery = completionsQuery.gte("completed_date_pt", filters.from);
  if (filters.to) completionsQuery = completionsQuery.lte("completed_date_pt", filters.to);

  let snapshotsQuery = db
    .from("daily_snapshots")
    .select("snapshot_date, overdue_count, open_count")
    .order("snapshot_date", { ascending: false })
    .limit(400);
  if (filters.from) snapshotsQuery = snapshotsQuery.gte("snapshot_date", filters.from);
  if (filters.to) snapshotsQuery = snapshotsQuery.lte("snapshot_date", filters.to);

  const [summary, months, byCompany, byAssignee, openItems, openSummary, completions, snapshots, lastSuccess, lastRun, optionRows] =
    await Promise.all([
      db.rpc("completed_performance_summary", args),
      db.rpc("completed_performance_breakdown", { p_dimension: "month", ...monthArgs }),
      db.rpc("completed_performance_breakdown", { p_dimension: "company", ...args }),
      db.rpc("completed_performance_breakdown", { p_dimension: "assignee", ...args }),
      db.from("v_open_items").select("*"),
      db.from("v_open_work_summary").select("as_of_date_pt").single(),
      completionsQuery,
      snapshotsQuery,
      db.from("sync_runs").select("*").eq("ok", true).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("v_completed_performance").select("company, assignees"),
    ]);

  for (const [name, res] of Object.entries({
    summary, months, byCompany, byAssignee, openItems, openSummary, completions, snapshots, lastSuccess, lastRun, optionRows,
  })) {
    if (res.error) throw new Error(`Loading ${name}: ${res.error.message}`);
  }

  const todayPT = String(openSummary.data!.as_of_date_pt);
  const allOpen = (openItems.data as OpenItem[]).filter((i) => matches(i, filters));
  const overdue = allOpen
    .filter((i) => i.report === "Overdue")
    .sort((a, b) => (b.days_past_due ?? 0) - (a.days_past_due ?? 0));

  const optionData = (optionRows.data ?? []) as { company: string[]; assignees: string[] }[];

  return {
    kpis: toKpis((summary.data as Record<string, unknown>[])[0]),
    months: (months.data as Record<string, unknown>[]).map((r) => ({ key: String(r.key), ...toKpis(r) })),
    byCompany: (byCompany.data as Record<string, unknown>[]).map((r) => ({ key: String(r.key), ...toKpis(r) })),
    byAssignee: (byAssignee.data as Record<string, unknown>[]).map((r) => ({ key: String(r.key), ...toKpis(r) })),
    open: {
      total: allOpen.length,
      overdue,
      dueToday: allOpen.filter((i) => i.due_date === todayPT).length,
      noDueDate: allOpen.filter((i) => !i.due_date).length,
      todayPT,
    },
    completions: (completions.data as CompletedItem[]).filter((i) => matches(i, filters)),
    snapshots: ((snapshots.data ?? []) as Snapshot[]).reverse(),
    lastSuccess: lastSuccess.data as SyncRun | null,
    lastRun: lastRun.data as SyncRun | null,
    options: {
      companies: uniqueSorted(optionData.map((r) => r.company)),
      assignees: uniqueSorted(optionData.map((r) => r.assignees)),
    },
  };
}
