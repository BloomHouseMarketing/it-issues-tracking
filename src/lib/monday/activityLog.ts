// Derives each item's completion time from the board activity log on the Status column.
import { activityLogTimestampToDate } from "../time";
import type { MondayQuery } from "./client";

export const ACTIVITY_LOG_LIMIT = 500;
/** Safety stop; ~1,200 status events means ~3 pages today. */
export const ACTIVITY_LOG_MAX_PAGES = 200;

export interface ActivityLogEntry {
  id: string;
  event: string;
  created_at: string;
  /** JSON string. */
  data: string;
}

export const ACTIVITY_LOG_QUERY = `
query StatusLog($boardId: [ID!], $columnIds: [String], $limit: Int!, $page: Int!) {
  boards(ids: $boardId) {
    activity_logs(column_ids: $columnIds, limit: $limit, page: $page) {
      id
      event
      created_at
      data
    }
  }
}`;

interface ActivityLogData {
  boards: { activity_logs: ActivityLogEntry[] | null }[];
}

/** Reads every page of status-column activity logs, sequentially. */
export async function fetchStatusActivityLogs(
  query: MondayQuery,
  boardId: string,
  statusColumnId: string,
  limit = ACTIVITY_LOG_LIMIT,
): Promise<ActivityLogEntry[]> {
  const all: ActivityLogEntry[] = [];
  for (let page = 1; page <= ACTIVITY_LOG_MAX_PAGES; page++) {
    const data = await query<ActivityLogData>(ACTIVITY_LOG_QUERY, {
      boardId: [boardId],
      columnIds: [statusColumnId],
      limit,
      page,
    });
    const entries = data.boards?.[0]?.activity_logs ?? [];
    all.push(...entries);
    if (entries.length < limit) return all;
  }
  throw new Error(`Activity log exceeded ${ACTIVITY_LOG_MAX_PAGES} pages`);
}

interface StatusChangeData {
  pulse_id?: number | string;
  column_id?: string;
  value?: { label?: { is_done?: boolean } | null } | null;
  previous_value?: { label?: { is_done?: boolean } | null } | null;
}

function parseData(raw: string): StatusChangeData | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** True if the entry moves the status from a not-done label to a done label. */
export function isCompletionEvent(entry: ActivityLogEntry, statusColumnId: string): boolean {
  const data = parseData(entry.data);
  if (!data) return false;
  if (data.column_id !== undefined && data.column_id !== statusColumnId) return false;
  return data.value?.label?.is_done === true && data.previous_value?.label?.is_done !== true;
}

/**
 * Maps item id → latest completion time (the most recent not-done → done
 * transition). Items that were completed, reopened and completed again get
 * the last completion.
 */
export function deriveCompletedAt(
  entries: ActivityLogEntry[],
  statusColumnId: string,
): Map<string, Date> {
  const result = new Map<string, Date>();
  for (const entry of entries) {
    if (!isCompletionEvent(entry, statusColumnId)) continue;
    const data = parseData(entry.data);
    if (data?.pulse_id === undefined || data.pulse_id === null) continue;
    const itemId = String(data.pulse_id);
    let at: Date;
    try {
      at = activityLogTimestampToDate(entry.created_at);
    } catch {
      continue;
    }
    const prev = result.get(itemId);
    if (!prev || at > prev) result.set(itemId, at);
  }
  return result;
}
