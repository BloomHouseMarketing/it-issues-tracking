export type Theme = "light" | "dark";

export const THEME_COOKIE = "theme";
export const DEFAULT_THEME: Theme = "light";

export function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}
