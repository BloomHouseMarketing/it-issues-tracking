// Wires the sync to real monday.com and Supabase using environment variables.
import { createMondayClient } from "../monday/client";
import { createAdminClient } from "../supabase/admin";
import { runSync, type SyncResult } from "./runSync";
import { createSupabaseStore } from "./supabaseStore";

export async function runSyncFromEnv(): Promise<SyncResult> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN must be set");
  return runSync({
    query: createMondayClient({ token, apiVersion: process.env.MONDAY_API_VERSION || undefined }),
    store: createSupabaseStore(createAdminClient()),
  });
}
