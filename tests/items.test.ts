import { describe, expect, it } from "vitest";
import { createMondayClient } from "@/lib/monday/client";
import { fetchGroupItems, ITEMS_PAGE_LIMIT } from "@/lib/monday/items";
import { createFakeMonday, makeItem } from "./fakeMonday";

const COLS = ["status", "date__1"];

function board(n: number) {
  const items = Array.from({ length: n }, (_, i) => makeItem(1000 + i, `Item ${i}`, "group_title"));
  return createFakeMonday({ groups: { group_title: { title: "Completed", items } }, activityLogs: [] });
}

describe("fetchGroupItems", () => {
  it("follows next_items_page cursors until the cursor is null", async () => {
    const fake = board(1234);
    const query = createMondayClient({ token: "t", fetch: fake.fetch });
    const res = await fetchGroupItems(query, "7364661326", "group_title", COLS);

    expect(res.items).toHaveLength(1234);
    expect(new Set(res.items.map((i) => i.id)).size).toBe(1234);
    expect(res.groupTitle).toBe("Completed");
    expect(fake.calls.map((c) => c.op)).toEqual(["GroupItems", "NextItems", "NextItems"]);
    expect(fake.calls[0].variables).toMatchObject({
      boardId: ["7364661326"],
      groupId: ["group_title"],
      limit: ITEMS_PAGE_LIMIT,
      columnIds: COLS,
    });
    expect(fake.calls[1].variables.cursor).toBe("group_title:500");
    expect(fake.calls[2].variables.cursor).toBe("group_title:1000");
  });

  it("makes a single request when everything fits on one page", async () => {
    const fake = board(30);
    const query = createMondayClient({ token: "t", fetch: fake.fetch });
    const res = await fetchGroupItems(query, "7364661326", "group_title", COLS);
    expect(res.items).toHaveLength(30);
    expect(fake.calls).toHaveLength(1);
  });

  it("handles an exact multiple of the page size", async () => {
    const fake = board(1000);
    const query = createMondayClient({ token: "t", fetch: fake.fetch });
    const res = await fetchGroupItems(query, "7364661326", "group_title", COLS);
    expect(res.items).toHaveLength(1000);
  });

  it("fails if the group does not exist", async () => {
    const fake = board(1);
    const query = createMondayClient({ token: "t", fetch: fake.fetch });
    await expect(fetchGroupItems(query, "7364661326", "nope", COLS)).rejects.toThrow(/Group nope not found/);
  });

  it("stops on a repeated cursor instead of looping forever", async () => {
    const query = (async (q: string) =>
      q.includes("GroupItems")
        ? { boards: [{ groups: [{ id: "g", title: "G", items_page: { cursor: "c1", items: [] } }] }] }
        : { next_items_page: { cursor: "c1", items: [] } }) as never;
    await expect(fetchGroupItems(query, "b", "g", COLS)).rejects.toThrow(/repeated cursor/);
  });
});
