// Maps a monday item to a monday_items row.
import { COLUMNS } from "../config";
import type { MondayColumnValue, MondayItem } from "../monday/items";

export interface MondayItemRow {
  item_id: number;
  name: string;
  group_id: string;
  group_title: string | null;
  status: string | null;
  due_date: string | null;
  report: string | null;
  days_delayed: number | null;
  completed_at: string | null;
  company: string[] | null;
  priority: string | null;
  assignees: string[] | null;
  monday_updated_at: string | null;
  synced_at: string;
}

function blankToNull(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

export function parseDate(col: MondayColumnValue | undefined): string | null {
  if (!col) return null;
  const date = parseJson(col.value)?.date;
  if (typeof date === "string" && DATE_PREFIX.test(date)) return date.slice(0, 10);
  const text = col.text?.trim() ?? "";
  return DATE_PREFIX.test(text) ? text.slice(0, 10) : null;
}

export function parseInteger(col: MondayColumnValue | undefined): number | null {
  const text = blankToNull(col?.text);
  if (text === null) return null;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function parseList(col: MondayColumnValue | undefined): string[] | null {
  if (!col) return null;
  const labels = col.values?.map((v) => v.label.trim()).filter(Boolean);
  if (labels && labels.length > 0) return labels;
  const text = blankToNull(col.text);
  if (text === null) return null;
  const parts = text.split(", ").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

export function toRow(
  item: MondayItem,
  group: { id: string; title: string },
  completedAt: Date | string | null,
  syncedAt: Date,
): MondayItemRow {
  const cols = new Map(item.column_values.map((c) => [c.id, c]));
  const itemId = Number(item.id);
  if (!Number.isSafeInteger(itemId)) throw new Error(`Bad item id: ${item.id}`);

  return {
    item_id: itemId,
    name: item.name,
    group_id: item.group?.id ?? group.id,
    group_title: item.group?.title ?? group.title,
    status: blankToNull(cols.get(COLUMNS.status)?.text),
    due_date: parseDate(cols.get(COLUMNS.dueDate)),
    report: blankToNull(cols.get(COLUMNS.report)?.text),
    days_delayed: parseInteger(cols.get(COLUMNS.daysDelayed)),
    completed_at:
      completedAt === null ? null : typeof completedAt === "string" ? completedAt : completedAt.toISOString(),
    company: parseList(cols.get(COLUMNS.company)),
    priority: blankToNull(cols.get(COLUMNS.priority)?.text),
    assignees: parseList(cols.get(COLUMNS.assignees)),
    monday_updated_at: item.updated_at ?? null,
    synced_at: syncedAt.toISOString(),
  };
}
