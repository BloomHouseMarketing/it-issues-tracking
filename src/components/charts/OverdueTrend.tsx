import type { Snapshot } from "@/lib/dashboard/data";
import { formatDate } from "@/lib/format";
import { DataTable } from "../Card";
import { niceTicks } from "./scale";

/** Overdue count per day, from daily_snapshots (single series). */
export function OverdueTrend({ snapshots }: { snapshots: Snapshot[] }) {
  const points = snapshots.filter((s) => s.overdue_count !== null);
  if (points.length === 0) return <p className="py-16 text-center text-ink-3">No snapshots yet. One is saved after each sync.</p>;

  const ticks = niceTicks(Math.max(...points.map((p) => p.overdue_count!), 1));
  const top = ticks[ticks.length - 1];
  const n = points.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.overdue_count!)}`).join(" ");
  const last = points[n - 1];

  return (
    <div>
      <div className="flex">
        <div className="relative mr-2 h-56 w-6 shrink-0 xl:h-72">
          {ticks.map((t) => (
            <span key={t} className="tabular absolute right-0 translate-y-1/2 text-xs text-ink-3" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-56 min-w-0 flex-1 xl:h-72">
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute inset-x-0 h-px bg-grid" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          {n > 1 && (
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <path d={`${path} L${x(n - 1)},100 L${x(0)},100 Z`} fill="var(--report-overdue)" opacity={0.1} />
              <path d={path} fill="none" stroke="var(--report-overdue)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}
          {points.map((p, i) => (
            <span
              key={p.snapshot_date}
              tabIndex={0}
              title={`${formatDate(p.snapshot_date)}: ${p.overdue_count} overdue, ${p.open_count} open`}
              aria-label={`${formatDate(p.snapshot_date)}: ${p.overdue_count} overdue`}
              className="absolute flex h-6 w-6 -translate-x-1/2 translate-y-1/2 items-center justify-center outline-none"
              style={{ left: `${x(i)}%`, bottom: `${100 - y(p.overdue_count!)}%` }}
            >
              <span className={`rounded-full bg-overdue ring-2 ring-surface-1 ${i === n - 1 ? "h-2.5 w-2.5" : "h-2 w-2 opacity-0 hover:opacity-100"}`} />
            </span>
          ))}
          <span
            className="absolute whitespace-nowrap text-sm font-semibold text-ink-1"
            style={{ right: 0, bottom: `calc(${100 - y(last.overdue_count!)}% + 10px)` }}
          >
            {last.overdue_count}
          </span>
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-8 text-xs text-ink-3">
        <span>{formatDate(points[0].snapshot_date)}</span>
        {n > 1 && <span>{formatDate(last.snapshot_date)}</span>}
      </div>
      {n < 7 && <p className="mt-3 text-xs text-ink-3">The trend builds up day by day; the first snapshot was taken {formatDate(points[0].snapshot_date)}.</p>}
      <DataTable>
        <table className="tabular w-full text-left">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-normal">Date</th>
              <th className="py-1 text-right font-normal">Overdue</th>
              <th className="py-1 text-right font-normal">Open</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {[...points].reverse().map((p) => (
              <tr key={p.snapshot_date} className="border-t border-line">
                <td className="py-1">{formatDate(p.snapshot_date)}</td>
                <td className="py-1 text-right">{p.overdue_count}</td>
                <td className="py-1 text-right">{p.open_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
