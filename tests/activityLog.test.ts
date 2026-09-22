import { describe, expect, it } from "vitest";
import { createMondayClient } from "@/lib/monday/client";
import {
  deriveCompletedAt,
  fetchStatusActivityLogs,
  isCompletionEvent,
  type ActivityLogEntry,
} from "@/lib/monday/activityLog";
import fixture from "./fixtures/activity-log.json";
import { createFakeMonday, statusLog } from "./fakeMonday";

const entries = fixture as ActivityLogEntry[];
const byId = (id: string) => entries.find((e) => e.id === id)!;

describe("isCompletionEvent", () => {
  it("accepts a not-done -> done transition", () => {
    expect(isCompletionEvent(byId("a1"), "status")).toBe(true);
  });
  it("accepts done with no previous value (status set directly to Completed)", () => {
    expect(isCompletionEvent(byId("a2"), "status")).toBe(true);
  });
  it("rejects done -> not-done (reopened)", () => {
    expect(isCompletionEvent(byId("a3"), "status")).toBe(false);
  });
  it("rejects done -> done relabels, e.g. Complete -> Completed", () => {
    expect(isCompletionEvent(byId("a4"), "status")).toBe(false);
  });
  it("rejects non-done changes, bad JSON and other columns", () => {
    expect(isCompletionEvent(byId("a5"), "status")).toBe(false);
    expect(isCompletionEvent(byId("a6"), "status")).toBe(false);
    expect(isCompletionEvent(byId("a7"), "status")).toBe(false);
  });
});

describe("deriveCompletedAt", () => {
  it("uses the latest completion when an item was completed, reopened and completed again", () => {
    const map = deriveCompletedAt(entries, "status");
    expect(map.get("7390000001")?.toISOString()).toBe("2026-09-11T12:00:00.000Z");
  });

  it("does not depend on log order", () => {
    const map = deriveCompletedAt([...entries].reverse(), "status");
    expect(map.get("7390000001")?.toISOString()).toBe("2026-09-11T12:00:00.000Z");
  });

  it("leaves out items with no qualifying event", () => {
    const map = deriveCompletedAt(entries, "status");
    expect([...map.keys()]).toEqual(["7390000001"]);
  });
});

describe("fetchStatusActivityLogs", () => {
  it("reads pages sequentially until a short page", async () => {
    const logs = Array.from({ length: 1234 }, (_, i) => statusLog(`e${i}`, 1, String(17890000000000000 + i)));
    const fake = createFakeMonday({ groups: {}, activityLogs: logs });
    const query = createMondayClient({ token: "t", fetch: fake.fetch });
    const got = await fetchStatusActivityLogs(query, "7364661326", "status");
    expect(got).toHaveLength(1234);
    expect(fake.calls.map((c) => c.variables.page)).toEqual([1, 2, 3]);
    expect(fake.calls[0].variables).toMatchObject({ columnIds: ["status"], limit: 500 });
  });

  it("requests one extra empty page when the total is an exact multiple", async () => {
    const logs = Array.from({ length: 1000 }, (_, i) => statusLog(`e${i}`, 1, "17890000000000000"));
    const fake = createFakeMonday({ groups: {}, activityLogs: logs });
    const query = createMondayClient({ token: "t", fetch: fake.fetch });
    expect(await fetchStatusActivityLogs(query, "b", "status")).toHaveLength(1000);
    expect(fake.calls).toHaveLength(3);
  });
});
