"use client";

import Link from "next/link";
import { useRef } from "react";
import { RANGE_PRESETS, type Filters } from "@/lib/dashboard/filters";

const control = "rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 outline-none focus:border-accent";

/** One filter row above everything it scopes. A plain GET form: filters live in the URL. */
export function FilterBar({ filters, companies, assignees }: { filters: Filters; companies: string[]; assignees: string[] }) {
  const form = useRef<HTMLFormElement>(null);
  const range = useRef<HTMLSelectElement>(null);
  const submit = () => form.current?.requestSubmit();
  const custom = filters.range === "custom";

  return (
    <form ref={form} method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-ink-3">
        Completed
        <select ref={range} name="range" defaultValue={filters.range} onChange={submit} className={control}>
          {RANGE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {(custom || filters.from) && (
        <>
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            From
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ""}
              readOnly={!custom}
              onChange={() => {
                if (range.current) range.current.value = "custom";
              }}
              className={control}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            To
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ""}
              readOnly={!custom}
              onChange={() => {
                if (range.current) range.current.value = "custom";
              }}
              className={control}
            />
          </label>
          {custom && (
            <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm text-ink-1 hover:border-accent">
              Apply
            </button>
          )}
        </>
      )}
      <label className="flex flex-col gap-1 text-xs text-ink-3">
        Company
        <select name="company" defaultValue={filters.company ?? ""} onChange={submit} className={`${control} max-w-56`}>
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-3">
        Assigned to
        <select name="assignee" defaultValue={filters.assignee ?? ""} onChange={submit} className={`${control} max-w-56`}>
          <option value="">Everyone</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      {(filters.range !== "all" || filters.company || filters.assignee) && (
        <Link href="/" className="px-2 py-2 text-sm text-ink-3 underline underline-offset-4 hover:text-ink-1">
          Clear filters
        </Link>
      )}
    </form>
  );
}
