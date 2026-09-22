// Cross-checks the SQL views/functions against an independent TypeScript
// calculation from the raw monday_items rows. Exits 1 on any mismatch.
// Usage: npm run check:metrics   (reads .env.local)
import type { SupabaseClient } from "@supabase/supabase-js";
import { GROUPS, isTestItem } from "../src/lib/config";
import { createAdminClient } from "../src/lib/supabase/admin";
import { dateInPT, daysBetween } from "../src/lib/time";

interface Item {
  item_id: number;
  name: string;
  group_id: string;
  report: string | null;
  days_delayed: number | null;
  due_date: string | null;
  completed_at: string | null;
  company: string[] | null;
  assignees: string[] | null;
}

interface Filters {
  p_from?: string;
  p_to?: string;
  p_company?: string;
  p_assignee?: string;
}

type Kpis = {
  population: number;
  early: number;
  on_time: number;
  completed_on_time: number;
  completed_late: number;
  on_time_rate: number | null;
  avg_days_late: number | null;
  median_days_late: number | null;
  max_days_late: number | null;
};

let failures = 0;
let checks = 0;

function same(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  // Postgres numerics may arrive as strings; compare numbers with a rounding tolerance.
  if (a !== "" && b !== "" && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) < 0.006;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function expectEqual(label: string, sql: Record<string, unknown>, ts: Record<string, unknown>) {
  checks++;
  const bad = Object.keys(ts).filter((k) => !same(sql[k], ts[k]));
  if (bad.length) {
    failures++;
    console.log(`✗ ${label}`);
    for (const k of bad) console.log(`    ${k}: sql=${JSON.stringify(sql[k])} ts=${JSON.stringify(ts[k])}`);
  }
}

// ---- Independent TypeScript reference implementation -----------------------

function population(items: Item[]): Item[] {
  return items.filter(
    (i) =>
      i.group_id === GROUPS.completed &&
      ["Early", "On Time", "Late"].includes(i.report ?? "") &&
      !isTestItem(i.name),
  );
}

function completedDatePT(i: Item): string | null {
  return i.completed_at ? dateInPT(new Date(i.completed_at)) : null;
}

function applyFilters(items: Item[], f: Filters): Item[] {
  return items.filter((i) => {
    const d = completedDatePT(i);
    if (f.p_from && (!d || d < f.p_from)) return false;
    if (f.p_to && (!d || d > f.p_to)) return false;
    if (f.p_company && !(i.company ?? []).includes(f.p_company)) return false;
    if (f.p_assignee && !(i.assignees ?? []).includes(f.p_assignee)) return false;
    return true;
  });
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function kpis(items: Item[]): Kpis {
  const early = items.filter((i) => i.report === "Early").length;
  const onTime = items.filter((i) => i.report === "On Time").length;
  const lateDays = items.filter((i) => i.report === "Late").map((i) => i.days_delayed).filter((d): d is number => d !== null);
  const late = items.filter((i) => i.report === "Late").length;
  return {
    population: items.length,
    early,
    on_time: onTime,
    completed_on_time: early + onTime,
    completed_late: late,
    on_time_rate: items.length ? (early + onTime) / items.length : null,
    avg_days_late: lateDays.length ? lateDays.reduce((a, b) => a + b, 0) / lateDays.length : null,
    median_days_late: median(lateDays),
    max_days_late: lateDays.length ? Math.max(...lateDays) : null,
  };
}

function breakdown(items: Item[], dim: "month" | "company" | "assignee"): Map<string, Kpis> {
  const groups = new Map<string, Item[]>();
  const add = (k: string, i: Item) => groups.set(k, [...(groups.get(k) ?? []), i]);
  for (const i of items) {
    if (dim === "month") add(completedDatePT(i)?.slice(0, 7) ?? "(unknown)", i);
    else {
      const vals = (dim === "company" ? i.company : i.assignees) ?? [];
      if (vals.length === 0) add("(none)", i);
      for (const v of vals) add(v, i);
    }
  }
  return new Map([...groups].map(([k, v]) => [k, kpis(v)]));
}

// ---- Runner ----------------------------------------------------------------

async function loadItems(db: SupabaseClient): Promise<Item[]> {
  const out: Item[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("monday_items").select("*").order("item_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as Item[]));
    if (data.length < 1000) return out;
  }
}

async function rpc<T>(db: SupabaseClient, fn: string, args: object): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function view<T>(db: SupabaseClient, name: string): Promise<T[]> {
  const { data, error } = await db.from(name).select("*");
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T[];
}

export async function checkMetrics(db: SupabaseClient) {
  const items = await loadItems(db);
  const pop = population(items);
  const today = dateInPT(new Date());

  // Pick real filter values from the data so filters are exercised.
  const topCompany = [...breakdown(pop, "company")].filter(([k]) => k !== "(none)").sort((a, b) => b[1].population - a[1].population)[0]?.[0];
  const topAssignee = [...breakdown(pop, "assignee")].filter(([k]) => k !== "(none)").sort((a, b) => b[1].population - a[1].population)[0]?.[0];

  const filterSets: [string, Filters][] = [
    ["no filters", {}],
    ["date range 2025-01-01..2025-06-30", { p_from: "2025-01-01", p_to: "2025-06-30" }],
    ["from 2026-09-01", { p_from: "2026-09-01" }],
    [`company = ${topCompany}`, { p_company: topCompany }],
    [`assignee = ${topAssignee}`, { p_assignee: topAssignee }],
    ["company + date range", { p_company: topCompany, p_from: "2025-01-01", p_to: today }],
    ["no match", { p_company: "No Such Company" }],
  ];

  for (const [label, f] of filterSets) {
    const [sqlRow] = await rpc<Kpis[]>(db, "completed_performance_summary", f);
    expectEqual(`summary (${label})`, sqlRow, kpis(applyFilters(pop, f)));

    for (const dim of ["month", "company", "assignee"] as const) {
      const sqlRows = await rpc<(Kpis & { key: string })[]>(db, "completed_performance_breakdown", { p_dimension: dim, ...f });
      const ts = breakdown(applyFilters(pop, f), dim);
      checks++;
      const sqlKeys = sqlRows.map((r) => r.key).sort();
      const tsKeys = [...ts.keys()].sort();
      if (JSON.stringify(sqlKeys) !== JSON.stringify(tsKeys)) {
        failures++;
        console.log(`✗ breakdown ${dim} (${label}) keys differ: sql=${sqlKeys.length} ts=${tsKeys.length}`);
      }
      for (const r of sqlRows) if (ts.has(r.key)) expectEqual(`breakdown ${dim}=${r.key} (${label})`, r, ts.get(r.key)!);
    }
  }

  // Open work.
  const open = items.filter((i) => i.group_id === GROUPS.todo && !isTestItem(i.name));
  const [openSql] = await view<Record<string, unknown>>(db, "v_open_work_summary");
  expectEqual("v_open_work_summary", openSql, {
    open_total: open.length,
    overdue_now: open.filter((i) => i.report === "Overdue").length,
    due_today: open.filter((i) => i.due_date === today).length,
    no_due_date: open.filter((i) => !i.due_date).length,
    as_of_date_pt: today,
  });

  const overdueSql = await view<{ item_id: number; days_overdue: number; monday_url: string }>(db, "v_overdue_now");
  const overdueTs = open.filter((i) => i.report === "Overdue");
  expectEqual("v_overdue_now ids", { ids: overdueSql.map((r) => r.item_id).sort() }, { ids: overdueTs.map((i) => i.item_id).sort() });
  for (const r of overdueSql) {
    const i = overdueTs.find((x) => x.item_id === r.item_id);
    if (!i) continue;
    expectEqual(`v_overdue_now ${r.item_id}`, r, {
      days_overdue: i.due_date ? daysBetween(i.due_date, today) : null,
      monday_url: `https://quickstarthealth.monday.com/boards/7364661326/pulses/${i.item_id}`,
    });
  }

  // Recent completions: last 30 days, PT.
  const recentSql = await view<{ item_id: number }>(db, "v_recent_completions");
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const recentTs = pop.filter((i) => (completedDatePT(i) ?? "") >= cutoffDate);
  expectEqual("v_recent_completions ids", { ids: recentSql.map((r) => r.item_id).sort() }, { ids: recentTs.map((i) => i.item_id).sort() });

  const headline = kpis(pop);
  console.log(`\nHeadline (no filters): ${JSON.stringify(headline)}`);
  console.log(`Open work: ${JSON.stringify(openSql)}`);
  console.log(`Recent completions (30 days): ${recentSql.length}, overdue now: ${overdueSql.length}`);
  console.log(`\n${checks} checks, ${failures} failed`);
  return failures;
}

if (process.argv[1]?.endsWith("check-metrics.ts")) {
  checkMetrics(createAdminClient())
    .then((f) => process.exit(f ? 1 : 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
