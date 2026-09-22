import { describe, expect, it } from "vitest";
import { createMondayClient } from "@/lib/monday/client";
import { runSync } from "@/lib/sync/runSync";
import { toRow } from "@/lib/sync/transform";
import { createFakeMonday, makeItem, statusLog, type FakeBoard } from "./fakeMonday";
import { createMemoryStore } from "./memoryStore";

const NOW = new Date("2026-09-22T20:00:00Z");

function bigBoard(): FakeBoard {
  const completed = Array.from({ length: 620 }, (_, i) =>
    makeItem(5000 + i, i < 3 ? `[TEST] item ${i}` : `Done ${i}`, "group_title", {
      status: "Completed",
      color_mm7egxa: ["Early", "On Time", "Late", ""][i % 4],
      numeric_mm7ej9gp: i % 4 === 2 ? String(i % 7) : "0",
      date__1: "2026-08-01",
    }),
  );
  const todo = Array.from({ length: 30 }, (_, i) =>
    makeItem(9000 + i, `Open ${i}`, "new_group60142", { color_mm7egxa: i < 5 ? "Overdue" : "" }),
  );
  const logs = completed.slice(0, 600).map((it, i) => statusLog(`l${i}`, it.id, String(17890416000000000 + i * 1e7)));
  return {
    groups: {
      new_group60142: { title: "To Do - Coastal", items: todo },
      group_title: { title: "Completed", items: completed },
    },
    activityLogs: logs,
  };
}

describe("runSync", () => {
  it("syncs both groups, derives completed_at and logs a successful run", async () => {
    const fake = createFakeMonday(bigBoard());
    const { store, items, runs } = createMemoryStore();
    const res = await runSync({ query: createMondayClient({ token: "t", fetch: fake.fetch }), store, now: () => NOW });

    expect(res.ok).toBe(true);
    expect(res.itemsSynced).toBe(650);
    expect(res.byGroup).toEqual({ new_group60142: 30, group_title: 620 });
    expect(res.completedAtFound).toBe(600);
    expect(items.size).toBe(650);

    expect(items.get(5000)!.completed_at).toBe("2026-09-10T12:00:00.000Z");
    expect(items.get(5619)!.completed_at).toBeNull(); // no log event
    expect(items.get(9000)!.completed_at).toBeNull(); // To Do items never get one
    expect(items.get(9000)!.report).toBe("Overdue");

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ ok: true, items_synced: 650, error: null });

    // Pages run one after another: 2 groups (1 + 2 pages) + 2 activity-log pages.
    expect(fake.calls.map((c) => c.op)).toEqual([
      "GroupItems",
      "GroupItems",
      "NextItems",
      "StatusLog",
      "StatusLog",
    ]);
  });

  it("deletes rows for items no longer in either group", async () => {
    const stale = toRow(makeItem(1, "Moved away", "group_title"), { id: "group_title", title: "Completed" }, null, NOW);
    const fake = createFakeMonday(bigBoard());
    const { store, items } = createMemoryStore([stale]);
    const res = await runSync({ query: createMondayClient({ token: "t", fetch: fake.fetch }), store, now: () => NOW });
    expect(res.deleted).toBe(1);
    expect(items.has(1)).toBe(false);
    expect(items.size).toBe(650);
  });

  it("keeps a stored completed_at when the activity log no longer has the event", async () => {
    const board = bigBoard();
    const prior = toRow(board.groups.group_title.items[619], { id: "group_title", title: "Completed" }, "2024-01-02T03:04:05.000Z", NOW);
    const fake = createFakeMonday(board);
    const { store, items } = createMemoryStore([prior]);
    await runSync({ query: createMondayClient({ token: "t", fetch: fake.fetch }), store, now: () => NOW });
    expect(items.get(5619)!.completed_at).toBe("2024-01-02T03:04:05.000Z");
  });

  it("records a failed run and leaves stored rows alone when monday errors", async () => {
    const prior = toRow(makeItem(1, "Keep me", "group_title"), { id: "group_title", title: "Completed" }, null, NOW);
    const { store, items, runs } = createMemoryStore([prior]);
    const failing = (async () => new Response(JSON.stringify({ errors: [{ message: "Internal error" }] }), { status: 500 })) as typeof fetch;
    const res = await runSync({ query: createMondayClient({ token: "t", fetch: failing }), store, now: () => NOW });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Internal error/);
    expect(runs[0]).toMatchObject({ ok: false, items_synced: null });
    expect(runs[0].error).toMatch(/Internal error/);
    expect(items.has(1)).toBe(true);
  });

  it("refuses to wipe the table when monday returns no items at all", async () => {
    const prior = toRow(makeItem(1, "Keep me", "group_title"), { id: "group_title", title: "Completed" }, null, NOW);
    const fake = createFakeMonday({
      groups: { new_group60142: { title: "To Do", items: [] }, group_title: { title: "Completed", items: [] } },
      activityLogs: [],
    });
    const { store, items, runs } = createMemoryStore([prior]);
    const res = await runSync({ query: createMondayClient({ token: "t", fetch: fake.fetch }), store, now: () => NOW });
    expect(res.ok).toBe(false);
    expect(items.has(1)).toBe(true);
    expect(runs[0].ok).toBe(false);
  });
});
