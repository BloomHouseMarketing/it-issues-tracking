import type { SyncStore } from "@/lib/sync/runSync";
import type { MondayItemRow } from "@/lib/sync/transform";

export interface RunRecord {
  id: number;
  started_at: Date;
  finished_at?: Date;
  items_synced?: number | null;
  ok?: boolean;
  error?: string | null;
}

export function createMemoryStore(initial: MondayItemRow[] = []) {
  const items = new Map<number, MondayItemRow>(initial.map((r) => [r.item_id, r]));
  const runs: RunRecord[] = [];
  const snapshots = { count: 0, fail: null as string | null };
  const store: SyncStore = {
    async startRun(startedAt) {
      const id = runs.length + 1;
      runs.push({ id, started_at: startedAt });
      return id;
    },
    async finishRun(runId, r) {
      Object.assign(runs[runId - 1], {
        finished_at: r.finishedAt,
        items_synced: r.itemsSynced,
        ok: r.ok,
        error: r.error,
      });
    },
    async loadExisting() {
      return new Map([...items.values()].map((r) => [r.item_id, r.completed_at]));
    },
    async upsertItems(rows) {
      for (const r of rows) items.set(r.item_id, r);
    },
    async deleteItems(ids) {
      for (const id of ids) items.delete(id);
    },
    async takeSnapshot() {
      if (snapshots.fail) throw new Error(snapshots.fail);
      snapshots.count++;
    },
  };
  return { store, items, runs, snapshots };
}
