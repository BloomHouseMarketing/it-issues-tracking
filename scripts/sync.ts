// Runs one sync against real monday.com + Supabase, then prints the counts.
// Usage: npm run sync   (reads .env.local)
import { runSyncFromEnv } from "../src/lib/sync";
import { printCounts } from "./verify-counts";

async function main() {
  const started = Date.now();
  const result = await runSyncFromEnv();
  console.log(JSON.stringify(result, null, 2));
  console.log(`Took ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (!result.ok) process.exit(1);
  await printCounts();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
