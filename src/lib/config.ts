// monday.com board layout. See CLAUDE.md "Source board".
export const BOARD_ID = "7364661326";

export const GROUPS = {
  todo: "new_group60142",
  completed: "group_title",
} as const;

export const COLUMNS = {
  status: "status",
  dueDate: "date__1",
  report: "color_mm7egxa",
  daysDelayed: "numeric_mm7ej9gp",
  company: "dropdown",
  priority: "status_1",
  assignees: "multiple_person_mm65hfg8",
} as const;

export const COLUMN_IDS: string[] = Object.values(COLUMNS);

export const REPORT_LABELS = ["Early", "On Time", "Overdue", "Late"] as const;
export type ReportLabel = (typeof REPORT_LABELS)[number];

/**
 * Test items: "test" at the start of a word, any case. Matches "[TEST – ignore]",
 * "Other - Jessa Test", "testing"; does not match "latest", "contest", "attest".
 * Keep in sync with TEST_ITEM_SQL_REGEX.
 */
export const TEST_ITEM_REGEX = /\btest/i;
/** Postgres equivalent, for `name ~* '\mtest'` (\m = start of word). */
export const TEST_ITEM_SQL_REGEX = "\\mtest";

export function isTestItem(name: string): boolean {
  return TEST_ITEM_REGEX.test(name);
}

export function mondayItemUrl(itemId: number | string): string {
  return `https://quickstarthealth.monday.com/boards/${BOARD_ID}/pulses/${itemId}`;
}
