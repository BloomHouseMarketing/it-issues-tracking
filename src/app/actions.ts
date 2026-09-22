"use server";

import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/auth";
import { runSyncFromEnv } from "@/lib/sync";

export type RefreshState = { ok: boolean; message: string } | null;

/** "Refresh now": runs a full sync. Server Actions are public POST endpoints, so check the session. */
export async function refreshNow(): Promise<RefreshState> {
  if (!(await isSignedIn())) return { ok: false, message: "Your session expired. Reload and sign in again." };
  try {
    const result = await runSyncFromEnv();
    revalidatePath("/");
    return result.ok
      ? { ok: true, message: `Synced ${result.itemsSynced} items.` }
      : { ok: false, message: `Sync failed: ${result.error}` };
  } catch (err) {
    return { ok: false, message: `Sync failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
