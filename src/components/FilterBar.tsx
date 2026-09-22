"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DEFAULT_RANGE, filtersToQuery, type Filters } from "@/lib/dashboard/filters";
import { DateRangePicker } from "./filters/DateRangePicker";
import { Listbox } from "./filters/Listbox";

/** One filter row above everything it scopes. Filters live in the URL. */
export function FilterBar({
  filters,
  today,
  companies,
  assignees,
}: {
  filters: Filters;
  today: string;
  companies: string[];
  assignees: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    startTransition(() => router.push(filtersToQuery(next), { scroll: false }));
  };

  const filtered = filters.range !== DEFAULT_RANGE || filters.company || filters.assignee;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <DateRangePicker
        range={filters.range}
        from={filters.from}
        to={filters.to}
        today={today}
        onChange={({ range, from, to }) => go({ range, from, to })}
      />
      <Listbox
        label="Company"
        allLabel="Any company"
        value={filters.company}
        options={companies.map((c) => ({ value: c, label: c }))}
        onChange={(company) => go({ company })}
      />
      <Listbox
        label="Assigned to"
        allLabel="Anyone"
        value={filters.assignee}
        options={assignees.map((a) => ({ value: a, label: a }))}
        onChange={(assignee) => go({ assignee })}
      />
      {filtered && (
        <Link href="/" scroll={false} className="px-2 py-2 text-sm text-ink-3 underline underline-offset-4 hover:text-ink-1">
          Reset
        </Link>
      )}
      {pending && (
        <span role="status" className="flex items-center gap-2 text-sm text-ink-3">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-ink-3 border-t-transparent" />
          Updating…
        </span>
      )}
    </div>
  );
}
