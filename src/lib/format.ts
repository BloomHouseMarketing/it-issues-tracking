// Display formatting. Everything is shown in Pacific time.
import { PT_ZONE } from "./time";

const dateOnly = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const dateTimePT = new Intl.DateTimeFormat("en-US", {
  timeZone: PT_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const monthLong = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", year: "numeric" });
const monthShort = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });

/** "2026-09-22" (a calendar date) → "Sep 22, 2026". */
export function formatDate(date: string | null): string {
  if (!date) return "—";
  return dateOnly.format(new Date(`${date}T00:00:00Z`));
}

/** An instant → "Sep 22, 2:35 PM PT". */
export function formatDateTimePT(iso: string | null): string {
  if (!iso) return "—";
  return `${dateTimePT.format(new Date(iso))} PT`;
}

/** "2026-09" → "Sep 2026" (or "Sep" when short). */
export function formatMonth(key: string, short = false): string {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  return (short ? monthShort : monthLong).format(new Date(`${key}-01T00:00:00Z`));
}

export function formatPercent(rate: number | null): string {
  return rate === null || rate === undefined ? "—" : `${(Number(rate) * 100).toFixed(1)}%`;
}

/** Thousands-comma'd, up to `digits` decimals ("2", "6.7"). */
export function formatNumber(n: number | null, digits = 0): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** "5 minutes ago", for last-synced. */
export function formatAgo(iso: string | null, now = new Date()): string {
  if (!iso) return "never";
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function joinList(values: string[] | null | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "—";
}
