import type { BreakdownRow } from "@/lib/dashboard/data";
import { formatNumber, formatPercent } from "@/lib/format";
import { DataTable } from "../Card";

const TOP_N = 8;

/** Horizontal bars: late completions per company or assignee (single series). */
export function LateBars({ rows, noneLabel }: { rows: BreakdownRow[]; noneLabel: string }) {
  const withLate = rows.filter((r) => r.completed_late > 0).sort((a, b) => b.completed_late - a.completed_late || a.key.localeCompare(b.key));
  if (withLate.length === 0) return <p className="py-10 text-center text-ink-3">No late completions in this range.</p>;

  const named = withLate.filter((r) => r.key !== "(none)");
  const none = withLate.find((r) => r.key === "(none)");
  const shown = named.slice(0, TOP_N);
  const rest = named.slice(TOP_N);
  const restLate = rest.reduce((s, r) => s + r.completed_late, 0);
  const bars = [
    ...shown.map((r) => ({ label: r.key, row: r, muted: false })),
    ...(none ? [{ label: noneLabel, row: none, muted: true }] : []),
  ].map((b) => ({ ...b, late: b.row.completed_late }));
  const max = Math.max(...bars.map((b) => b.late));

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {bars.map((b) => (
          <li
            key={b.label}
            className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-sm"
            title={`${b.label}: ${b.late} late of ${b.row.population} · avg ${formatNumber(b.row.avg_days_late, 1)} days late`}
          >
            <span className={`truncate ${b.muted ? "text-ink-3" : "text-ink-2"}`}>{b.label}</span>
            <span className="flex items-center gap-2">
              <span className={`h-4 max-h-6 rounded-r ${b.muted ? "bg-late/50" : "bg-late"}`} style={{ width: `${(b.late / max) * 85}%` }} />
              <span className="tabular text-ink-1">{b.late}</span>
            </span>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <p className="mt-3 text-xs text-ink-3">
          {rest.length} more with {restLate} late in total. See the data table.
        </p>
      )}
      <DataTable>
        <table className="tabular w-full text-left">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-normal">Name</th>
              <th className="py-1 text-right font-normal">Late</th>
              <th className="py-1 text-right font-normal">Rated</th>
              <th className="py-1 text-right font-normal">On-time rate</th>
              <th className="py-1 text-right font-normal">Avg days late</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {rows
              .slice()
              .sort((a, b) => b.completed_late - a.completed_late || b.population - a.population)
              .map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-1">{r.key === "(none)" ? noneLabel : r.key}</td>
                  <td className="py-1 text-right">{r.completed_late}</td>
                  <td className="py-1 text-right">{r.population}</td>
                  <td className="py-1 text-right">{formatPercent(r.on_time_rate)}</td>
                  <td className="py-1 text-right">{formatNumber(r.avg_days_late, 1)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
