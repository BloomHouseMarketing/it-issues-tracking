// SyncStore backed by Supabase (service role).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncStore } from "./runSync";
import type { MondayItemRow } from "./transform";

const CHUNK = 500;
const PAGE = 1000;

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`Supabase ${what}: ${error.message}`);
}

export function createSupabaseStore(db: SupabaseClient): SyncStore {
  return {
    async startRun(startedAt) {
      const { data, error } = await db
        .from("sync_runs")
        .insert({ started_at: startedAt.toISOString() })
        .select("id")
        .single();
      check(error, "insert sync_runs");
      return Number(data!.id);
    },

    async finishRun(runId, r) {
      const { error } = await db
        .from("sync_runs")
        .update({
          finished_at: r.finishedAt.toISOString(),
          items_synced: r.itemsSynced,
          ok: r.ok,
          error: r.error,
        })
        .eq("id", runId);
      check(error, "update sync_runs");
    },

    async loadExisting() {
      const out = new Map<number, string | null>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from("monday_items")
          .select("item_id, completed_at")
          .order("item_id")
          .range(from, from + PAGE - 1);
        check(error, "select monday_items");
        for (const row of data ?? []) out.set(Number(row.item_id), row.completed_at);
        if (!data || data.length < PAGE) return out;
      }
    },

    async upsertItems(rows: MondayItemRow[]) {
      for (const part of chunks(rows, CHUNK)) {
        const { error } = await db.from("monday_items").upsert(part, { onConflict: "item_id" });
        check(error, "upsert monday_items");
      }
    },

    async deleteItems(itemIds) {
      for (const part of chunks(itemIds, CHUNK)) {
        const { error } = await db.from("monday_items").delete().in("item_id", part);
        check(error, "delete monday_items");
      }
    },
  };
}
