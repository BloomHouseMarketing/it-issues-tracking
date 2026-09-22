import type { DashboardData } from "@/lib/dashboard/data";
import { formatNumber, formatPercent } from "@/lib/format";

function Kpi({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface-1 p-5">
      {accent && <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${accent}`} />}
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-ink-1 xl:text-5xl">{value}</p>
      <p className="mt-2 text-sm text-ink-3">{detail}</p>
    </div>
  );
}

export function KpiCards({ kpis, open }: Pick<DashboardData, "kpis" | "open">) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi
        label="Completed on time"
        value={formatNumber(kpis.completed_on_time)}
        detail={`${formatNumber(kpis.early)} Early · ${formatNumber(kpis.on_time)} On Time`}
        accent="bg-ontime"
      />
      <Kpi label="Completed late" value={formatNumber(kpis.completed_late)} detail={`of ${formatNumber(kpis.population)} rated completions`} accent="bg-late" />
      <Kpi label="On-time rate" value={formatPercent(kpis.on_time_rate)} detail="Early + On Time, of all rated completions" />
      <Kpi
        label="Avg days late"
        value={formatNumber(kpis.avg_days_late, 1)}
        detail={`Median ${formatNumber(kpis.median_days_late, 1)} · Max ${formatNumber(kpis.max_days_late)}`}
      />
      <Kpi
        label="Overdue now"
        value={formatNumber(open.overdue.length)}
        detail={`${formatNumber(open.total)} open · ${formatNumber(open.dueToday)} due today · ${formatNumber(open.noDueDate)} no due date`}
        accent="bg-overdue"
      />
    </div>
  );
}
