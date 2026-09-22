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

export const TEST_ITEM_PREFIX = "[TEST";

export function isTestItem(name: string): boolean {
  return name.startsWith(TEST_ITEM_PREFIX);
}

export function mondayItemUrl(itemId: number | string): string {
  return `https://quickstarthealth.monday.com/boards/${BOARD_ID}/pulses/${itemId}`;
}
