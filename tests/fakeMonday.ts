// A fake monday.com GraphQL endpoint for tests. Routes by operation name.
import type { MondayItem } from "@/lib/monday/items";
import type { ActivityLogEntry } from "@/lib/monday/activityLog";

export interface FakeBoard {
  groups: Record<string, { title: string; items: MondayItem[] }>;
  activityLogs: ActivityLogEntry[];
}

export interface RecordedCall {
  op: string;
  variables: Record<string, unknown>;
  headers: Record<string, string>;
}

export function makeItem(
  id: string | number,
  name: string,
  groupId: string,
  cols: Partial<Record<string, string>> = {},
): MondayItem {
  return {
    id: String(id),
    name,
    updated_at: "2026-09-01T00:00:00Z",
    group: { id: groupId, title: groupId === "group_title" ? "Completed" : "To Do - Coastal" },
    column_values: Object.entries(cols).map(([colId, text]) => ({
      id: colId,
      text: text ?? "",
      value: colId === "date__1" && text ? JSON.stringify({ date: text }) : null,
    })),
  };
}

export function statusLog(id: string, itemId: string | number, ticks: string, prevDone = false): ActivityLogEntry {
  return {
    id,
    event: "update_column_value",
    created_at: ticks,
    data: JSON.stringify({
      pulse_id: Number(itemId),
      column_id: "status",
      value: { label: { text: "Completed", is_done: true } },
      previous_value: { label: { text: prevDone ? "Complete" : "Working on it", is_done: prevDone } },
    }),
  };
}

export function createFakeMonday(board: FakeBoard) {
  const calls: RecordedCall[] = [];

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    const op = /query\s+(\w+)/.exec(query)?.[1] ?? "unknown";
    calls.push({ op, variables, headers: init?.headers as Record<string, string> });

    if (op === "GroupItems") {
      const limit = variables.limit as number;
      const groups = (variables.groupId as string[])
        .filter((g) => board.groups[g])
        .map((g) => {
          const { title, items } = board.groups[g];
          return {
            id: g,
            title,
            items_page: {
              cursor: items.length > limit ? `${g}:${limit}` : null,
              items: items.slice(0, limit),
            },
          };
        });
      return json({ data: { boards: [{ groups }] } });
    }

    if (op === "NextItems") {
      const limit = variables.limit as number;
      const [g, offsetStr] = String(variables.cursor).split(":");
      const offset = Number(offsetStr);
      const items = board.groups[g].items;
      const end = offset + limit;
      return json({
        data: {
          next_items_page: {
            cursor: items.length > end ? `${g}:${end}` : null,
            items: items.slice(offset, end),
          },
        },
      });
    }

    if (op === "StatusLog") {
      const limit = variables.limit as number;
      const page = variables.page as number;
      const slice = board.activityLogs.slice((page - 1) * limit, page * limit);
      return json({ data: { boards: [{ activity_logs: slice }] } });
    }

    return json({ errors: [{ message: `Unknown op ${op}` }] }, 400);
  }) as typeof fetch;

  return { fetch: fetchImpl, calls };
}
