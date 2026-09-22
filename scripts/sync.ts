// Runs one sync against real monday.com + Supabase, then prints the counts.
// Usage: npm run sync             (reads .env.local)
//        npm run sync -- --dry-run  (reads monday only; writes nothing anywhere)
import { COLUMNS, GROUPS } from "../src/lib/config";
import { createMondayClient } from "../src/lib/monday/client";
import { runSyncFromEnv } from "../src/lib/sync";
import { runSync, type SyncStore } from "../src/lib/sync/runSync";
import type { MondayItemRow } from "../src/lib/sync/transform";
import { printCounts, summarizeCounts } from "./verify-counts";

async function dryRun() {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN must be set");
  let rows: MondayItemRow[] = [];
  const store: SyncStore = {
    startRun: async () => 0,
    finishRun: async () => {},
    loadExisting: async () => new Map(),
    upsertItems: async (r) => void (rows = r),
    deleteItems: async () => {},
    takeSnapshot: async () => {},
  };
  const result = await runSync({ query: createMondayClient({ token }), store });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
  console.log(JSON.stringify(summarizeCounts(rows), null, 2));

  // Extra detail for checking the data by eye.
  const late = rows.filter((r) => r.group_id === GROUPS.completed && r.report === "Late");
  console.log("Late items with blank Days Delayed:", late.filter((r) => r.days_delayed === null).length);
  console.log("Status labels seen:", [...new Set(rows.map((r) => r.status))]);
  console.log("Sample rows:", JSON.stringify(rows.filter((r) => r.report).slice(0, 2), null, 2));
  console.log(`(column ids used: ${Object.values(COLUMNS).join(", ")})`);
}

async function main() {
  const started = Date.now();
  if (process.argv.includes("--dry-run")) {
    await dryRun();
  } else {
    const result = await runSyncFromEnv();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    await printCounts();
  }
  console.log(`Took ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
