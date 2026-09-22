// Orchestrates one sync run: monday → monday_items, logged in sync_runs.
import { BOARD_ID, COLUMN_IDS, COLUMNS, GROUPS } from "../config";
import type { MondayQuery } from "../monday/client";
import { deriveCompletedAt, fetchStatusActivityLogs } from "../monday/activityLog";
import { fetchGroupItems } from "../monday/items";
import { toRow, type MondayItemRow } from "./transform";

export interface SyncStore {
  startRun(startedAt: Date): Promise<number>;
  finishRun(
    runId: number,
    result: { finishedAt: Date; itemsSynced: number | null; ok: boolean; error: string | null },
  ): Promise<void>;
  /** item_id → stored completed_at, for every row currently in monday_items. */
  loadExisting(): Promise<Map<number, string | null>>;
  upsertItems(rows: MondayItemRow[]): Promise<void>;
  deleteItems(itemIds: number[]): Promise<void>;
  /** Records today's counts in daily_snapshots. */
  takeSnapshot(): Promise<void>;
}

export interface SyncResult {
  ok: boolean;
  runId: number;
  itemsSynced: number;
  deleted: number;
  byGroup: Record<string, number>;
  completedAtFound: number;
  /** Set if the items synced but the daily snapshot failed. */
  snapshotError?: string;
  error?: string;
}

export interface SyncDeps {
  query: MondayQuery;
  store: SyncStore;
  now?: () => Date;
}

export async function runSync({ query, store, now = () => new Date() }: SyncDeps): Promise<SyncResult> {
  const runId = await store.startRun(now());
  try {
    const result = await syncItems(query, store, now());
    // The snapshot is a side feature: a failure here should not fail the sync.
    let snapshotError: string | undefined;
    try {
      await store.takeSnapshot();
    } catch (err) {
      snapshotError = err instanceof Error ? err.message : String(err);
    }
    await store.finishRun(runId, {
      finishedAt: now(),
      itemsSynced: result.itemsSynced,
      ok: true,
      error: snapshotError ? `snapshot failed: ${snapshotError}` : null,
    });
    return { ok: true, runId, ...result, ...(snapshotError ? { snapshotError } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await store.finishRun(runId, { finishedAt: now(), itemsSynced: null, ok: false, error: message });
    return { ok: false, runId, itemsSynced: 0, deleted: 0, byGroup: {}, completedAtFound: 0, error: message };
  }
}

async function syncItems(query: MondayQuery, store: SyncStore, syncedAt: Date) {
  // Sequential on purpose: keeps us inside monday's complexity budget.
  const todo = await fetchGroupItems(query, BOARD_ID, GROUPS.todo, COLUMN_IDS);
  const completed = await fetchGroupItems(query, BOARD_ID, GROUPS.completed, COLUMN_IDS);
  const logs = await fetchStatusActivityLogs(query, BOARD_ID, COLUMNS.status);
  const completedAtByItem = deriveCompletedAt(logs, COLUMNS.status);

  const existing = await store.loadExisting();

  const rows: MondayItemRow[] = [];
  let completedAtFound = 0;
  for (const group of [todo, completed]) {
    const isCompletedGroup = group.groupId === GROUPS.completed;
    for (const item of group.items) {
      let completedAt: Date | string | null = null;
      if (isCompletedGroup) {
        // Keep a previously stored value if the log no longer has the event
        // (e.g. it aged out of monday's activity-log retention).
        const fromLog = completedAtByItem.get(item.id);
        if (fromLog) completedAtFound++;
        completedAt = fromLog ?? existing.get(Number(item.id)) ?? null;
      }
      rows.push(toRow(item, { id: group.groupId, title: group.groupTitle }, completedAt, syncedAt));
    }
  }

  // An item appearing twice would make the upsert fail; keep the last copy.
  const unique = [...new Map(rows.map((r) => [r.item_id, r])).values()];

  if (unique.length === 0) {
    // Refuse to wipe the table on a suspicious empty read.
    throw new Error("monday returned no items in either group; nothing synced");
  }

  await store.upsertItems(unique);

  const keep = new Set(unique.map((r) => r.item_id));
  const stale = [...existing.keys()].filter((id) => !keep.has(id));
  if (stale.length > 0) await store.deleteItems(stale);

  return {
    itemsSynced: unique.length,
    deleted: stale.length,
    byGroup: { [todo.groupId]: todo.items.length, [completed.groupId]: completed.items.length },
    completedAtFound,
  };
}
