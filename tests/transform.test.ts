import { describe, expect, it } from "vitest";
import type { MondayItem } from "@/lib/monday/items";
import { toRow } from "@/lib/sync/transform";
import fixture from "./fixtures/items.json";

const syncedAt = new Date("2026-09-22T20:00:00Z");

describe("toRow", () => {
  it("maps every column of a filled-in item", () => {
    const row = toRow(
      fixture.completedItem as MondayItem,
      { id: "group_title", title: "Completed" },
      new Date("2026-09-11T12:00:00Z"),
      syncedAt,
    );
    expect(row).toEqual({
      item_id: 7390000001,
      name: "Replace printer toner - front desk",
      group_id: "group_title",
      group_title: "Completed",
      status: "Completed",
      due_date: "2026-09-08",
      report: "Late",
      days_delayed: 2,
      completed_at: "2026-09-11T12:00:00.000Z",
      company: ["Coastal Dental", "Bayview Clinic"],
      priority: "High",
      assignees: ["Jordan Lee", "Sam Rivera"],
      monday_updated_at: "2026-09-10T18:22:41Z",
      synced_at: "2026-09-22T20:00:00.000Z",
    });
  });

  it("turns blank columns into nulls", () => {
    const row = toRow(fixture.blankItem as MondayItem, { id: "new_group60142", title: "To Do - Coastal" }, null, syncedAt);
    expect(row).toMatchObject({
      status: null,
      due_date: null,
      report: null,
      days_delayed: null,
      company: null,
      priority: null,
      assignees: null,
      completed_at: null,
      monday_updated_at: null,
    });
  });

  it("treats a Days Delayed of 0 as 0, not blank", () => {
    const item: MondayItem = {
      id: "1",
      name: "x",
      updated_at: null,
      group: null,
      column_values: [{ id: "numeric_mm7ej9gp", text: "0", value: '"0"' }],
    };
    expect(toRow(item, { id: "group_title", title: "Completed" }, null, syncedAt).days_delayed).toBe(0);
  });

  it("falls back to the date text when value JSON is missing", () => {
    const item: MondayItem = {
      id: "1",
      name: "x",
      updated_at: null,
      group: null,
      column_values: [{ id: "date__1", text: "2026-01-05", value: null }],
    };
    const row = toRow(item, { id: "new_group60142", title: "To Do - Coastal" }, null, syncedAt);
    expect(row.due_date).toBe("2026-01-05");
    expect(row.group_id).toBe("new_group60142");
  });
});
