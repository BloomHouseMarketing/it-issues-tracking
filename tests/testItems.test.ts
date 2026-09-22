import { describe, expect, it } from "vitest";
import { isTestItem } from "@/lib/config";

describe("isTestItem", () => {
  it.each([
    "[TEST – ignore] Late",
    "[TEST – ignore] Overdue + due date change",
    "Other - Jessa Test",
    "Test",
    "ticket - testing jessa",
    "TESTING new printer",
    "test-item",
  ])("excludes %j", (name) => {
    expect(isTestItem(name)).toBe(true);
  });

  it.each([
    "Update to latest macOS",
    "Contest giveaway laptop",
    "Attestation form for St Louis",
    "Protest signage",
    "Landline for St. Louis (set up)",
  ])("keeps %j", (name) => {
    expect(isTestItem(name)).toBe(false);
  });
});
