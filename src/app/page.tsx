import { AutoRefresh } from "@/components/AutoRefresh";
import { Card } from "@/components/Card";
import { LateBars } from "@/components/charts/LateBars";
import { MonthlyChart } from "@/components/charts/MonthlyChart";
import { OverdueTrend } from "@/components/charts/OverdueTrend";
import { FilterBar } from "@/components/FilterBar";
import { KpiCards } from "@/components/KpiCards";
import { RefreshButton } from "@/components/RefreshButton";
import { OverdueTable, RecentTable } from "@/components/Tables";
import { getDashboardData } from "@/lib/dashboard/data";
import { parseFilters, RANGE_PRESETS } from "@/lib/dashboard/filters";
import { formatAgo, formatDate, formatDateTimePT } from "@/lib/format";
import { logout } from "./login/actions";

// "Refresh now" runs a full sync inside this page's Server Action.
export const maxDuration = 300;

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const data = await getDashboardData(filters);

  const rangeLabel =
    filters.range === "custom"
      ? `${filters.from ? formatDate(filters.from) : "Start"} – ${filters.to ? formatDate(filters.to) : "today"}`
      : RANGE_PRESETS.find((p) => p.value === filters.range)!.label;
  const scope = [filters.company, filters.assignee].filter(Boolean).join(" · ");
  const lastFailed = data.lastRun && data.lastRun.ok === false;

  return (
    <main className="mx-auto flex w-full max-w-[1920px] flex-col gap-5 p-4 sm:p-6 xl:p-8">
      <AutoRefresh seconds={300} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-1 xl:text-3xl">Coastal IT Performance</h1>
          <p className="mt-1 text-sm text-ink-3">
            Last synced {formatDateTimePT(data.lastSuccess?.finished_at ?? null)} ({formatAgo(data.lastSuccess?.finished_at ?? null)})
            {lastFailed && <span className="text-danger"> · latest sync failed: {data.lastRun!.error}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <form action={logout}>
            <button type="submit" className="px-2 py-2 text-sm text-ink-3 hover:text-ink-1">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Keyed so the uncontrolled inputs reset when the URL changes. */}
      <FilterBar key={JSON.stringify(filters)} filters={filters} companies={data.options.companies} assignees={data.options.assignees} />

      <KpiCards kpis={data.kpis} open={data.open} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card
          title="On time vs late, by month completed"
          subtitle={`${rangeLabel}${scope ? ` · ${scope}` : ""} · rated completions, Pacific time`}
          className="xl:col-span-2"
        >
          <MonthlyChart months={data.months} />
        </Card>
        <Card title="Overdue items over time" subtitle="Daily count of open items marked Overdue (all companies)">
          <OverdueTrend snapshots={data.snapshots} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Late completions by company" subtitle="An item with several companies counts under each">
          <LateBars rows={data.byCompany} noneLabel="No company" />
        </Card>
        <Card title="Late completions by assignee" subtitle="Many older items have no assignee">
          <LateBars rows={data.byAssignee} noneLabel="Unassigned" />
        </Card>
      </div>

      <Card
        title={`Overdue now (${data.open.overdue.length})`}
        subtitle={`To Do – Coastal · days overdue as of ${formatDate(data.open.todayPT)} (PT)${scope ? ` · ${scope}` : ""}`}
      >
        <OverdueTable items={data.open.overdue} />
      </Card>

      <Card
        title={`Completed in the last 30 days (${data.recent.length})`}
        subtitle={`Rated completions, newest first${scope ? ` · ${scope}` : ""}`}
      >
        <RecentTable items={data.recent} />
      </Card>

      <footer className="pb-4 text-xs leading-relaxed text-ink-3">
        On-time rate = (Early + On Time) ÷ all rated completions in the Completed group. Average, median and max days late use Days
        Delayed on Late items. Test items (any word starting with “test” in the name) are excluded everywhere. The date filter applies to
        completion dates; company and assignee filters apply to everything except the overdue trend. All dates are Pacific time.
      </footer>
    </main>
  );
}
