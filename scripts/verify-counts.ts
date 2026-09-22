// Prints item counts from Supabase so they can be checked against monday.
// Usage: npm run counts   (reads .env.local)
import { GROUPS, isTestItem } from "../src/lib/config";
import { createAdminClient } from "../src/lib/supabase/admin";
import { dateInPT } from "../src/lib/time";

interface Row {
  item_id: number;
  name: string;
  group_id: string;
  report: string | null;
  due_date: string | null;
  completed_at: string | null;
}

async function loadRows(): Promise<Row[]> {
  const db = createAdminClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("monday_items")
      .select("item_id, name, group_id, report, due_date, completed_at")
      .order("item_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (data.length < 1000) return rows;
  }
}

function tally(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.report ?? "(blank)"] = (out[r.report ?? "(blank)"] ?? 0) + 1;
  return out;
}

export async function printCounts() {
  const rows = await loadRows();
  const today = dateInPT(new Date());
  const completed = rows.filter((r) => r.group_id === GROUPS.completed);
  const todo = rows.filter((r) => r.group_id === GROUPS.todo);
  const classified = completed.filter((r) => ["Early", "On Time", "Late"].includes(r.report ?? ""));
  const classifiedReal = classified.filter((r) => !isTestItem(r.name));
  const todoReal = todo.filter((r) => !isTestItem(r.name));

  const { data: lastRun } = await createAdminClient()
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const out = {
    last_sync_run: lastRun,
    total_rows: rows.length,
    completed_group: {
      all_items: completed.length,
      report_breakdown_all: tally(completed),
      with_report_incl_test: classified.length,
      test_items_with_report: classified.filter((r) => isTestItem(r.name)).map((r) => r.name),
      with_report_real: classifiedReal.length,
      real_breakdown: tally(classifiedReal),
      real_with_completed_at: classifiedReal.filter((r) => r.completed_at).length,
    },
    todo_group: {
      all_items: todo.length,
      test_items: todo.filter((r) => isTestItem(r.name)).map((r) => r.name),
      real_items: todoReal.length,
      report_breakdown_real: tally(todoReal),
      due_today_pt: todoReal.filter((r) => r.due_date === today).length,
      no_due_date: todoReal.filter((r) => !r.due_date).length,
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1]?.endsWith("verify-counts.ts")) {
  printCounts().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
