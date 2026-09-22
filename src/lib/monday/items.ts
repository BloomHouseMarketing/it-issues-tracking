// Reads all items of a board group with cursor pagination (items_page → next_items_page).
import type { MondayQuery } from "./client";

export const ITEMS_PAGE_LIMIT = 500;

export interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
  /** Present for dropdown columns. */
  values?: { label: string }[] | null;
}

export interface MondayItem {
  id: string;
  name: string;
  updated_at: string | null;
  group: { id: string; title: string } | null;
  column_values: MondayColumnValue[];
}

interface ItemsPage {
  cursor: string | null;
  items: MondayItem[];
}

const ITEM_FIELDS = `
  id
  name
  updated_at
  group { id title }
  column_values(ids: $columnIds) {
    id
    text
    value
    ... on DropdownValue { values { label } }
  }
`;

export const FIRST_PAGE_QUERY = `
query GroupItems($boardId: [ID!], $groupId: [String], $limit: Int!, $columnIds: [String!]) {
  boards(ids: $boardId) {
    groups(ids: $groupId) {
      id
      title
      items_page(limit: $limit) {
        cursor
        items { ${ITEM_FIELDS} }
      }
    }
  }
}`;

export const NEXT_PAGE_QUERY = `
query NextItems($cursor: String!, $limit: Int!, $columnIds: [String!]) {
  next_items_page(cursor: $cursor, limit: $limit) {
    cursor
    items { ${ITEM_FIELDS} }
  }
}`;

interface FirstPageData {
  boards: { groups: { id: string; title: string; items_page: ItemsPage }[] }[];
}

interface NextPageData {
  next_items_page: ItemsPage;
}

export interface GroupItems {
  groupId: string;
  groupTitle: string;
  items: MondayItem[];
}

/** Fetches every item in one group, one page at a time. */
export async function fetchGroupItems(
  query: MondayQuery,
  boardId: string,
  groupId: string,
  columnIds: string[],
  limit = ITEMS_PAGE_LIMIT,
): Promise<GroupItems> {
  const first = await query<FirstPageData>(FIRST_PAGE_QUERY, {
    boardId: [boardId],
    groupId: [groupId],
    limit,
    columnIds,
  });

  const group = first.boards?.[0]?.groups?.find((g) => g.id === groupId);
  if (!group) {
    throw new Error(`Group ${groupId} not found on board ${boardId}`);
  }

  const items = [...group.items_page.items];
  const seenCursors = new Set<string>();
  let cursor = group.items_page.cursor;

  while (cursor) {
    if (seenCursors.has(cursor)) throw new Error("monday returned a repeated cursor");
    seenCursors.add(cursor);
    const next = await query<NextPageData>(NEXT_PAGE_QUERY, { cursor, limit, columnIds });
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  return { groupId: group.id, groupTitle: group.title, items };
}
