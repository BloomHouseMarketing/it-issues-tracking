import type { BreakdownRow } from "@/lib/dashboard/data";
import { formatMonth, formatNumber, formatPercent } from "@/lib/format";
import { DataTable } from "../Card";
import { LegendSwatch } from "../ReportLabel";
import { niceTicks } from "./scale";

const SEGMENTS = [
  { key: "early", label: "Early", color: "bg-early" },
  { key: "on_time", label: "On Time", color: "bg-ontime" },
  { key: "completed_late", label: "Late", color: "bg-late" },
] as const;

/** Every month from the first to the last key, zero-filled, so the time axis is honest. */
function fillMonths(rows: BreakdownRow[]): BreakdownRow[] {
  if (rows.length === 0) return rows;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const keys = rows.map((r) => r.key).sort();
  const out: BreakdownRow[] = [];
  let [y, m] = keys[0].split("-").map(Number);
  const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(
      byKey.get(key) ?? {
        key,
        population: 0,
        early: 0,
        on_time: 0,
        completed_on_time: 0,
        completed_late: 0,
        on_time_rate: null,
        avg_days_late: null,
        median_days_late: null,
        max_days_late: null,
      },
    );
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function shortMonth(key: string): string {
  return `${formatMonth(key, true)} ’${key.slice(2, 4)}`;
}

/** Stacked columns per month of completion (PT): Early, On Time, Late. */
export function MonthlyChart({ months }: { months: BreakdownRow[] }) {
  const rows = fillMonths(months.filter((m) => m.key !== "(unknown)"));
  const unknown = months.find((m) => m.key === "(unknown)");
  if (rows.length === 0)
    return (
      <p className="py-16 text-center text-ink-3">
        No completions in this range.
      </p>
    );

  if (rows.every((r) => r.population === 0))
    return (
      <p className="py-16 text-center text-ink-3">
        No completions in this range.
      </p>
    );
  const ticks = niceTicks(Math.max(...rows.map((r) => r.population)));
  const top = ticks[ticks.length - 1];
  const labelEvery = Math.ceil(rows.length / 10);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4">
        {SEGMENTS.map((s) => (
          <LegendSwatch key={s.key} color={s.color} label={s.label} />
        ))}
      </div>

      <div className="flex">
        {/* y-axis */}
        <div className="relative mr-2 h-56 w-8 shrink-0 xl:h-72">
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 translate-y-1/2 text-xs text-ink-3"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-56 xl:h-72">
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className="absolute inset-x-0 h-px bg-grid"
                style={{ bottom: `${(t / top) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end">
              {rows.map((m, i) => (
                <div
                  key={m.key}
                  tabIndex={0}
                  aria-label={`${formatMonth(m.key)}: ${m.early} Early, ${m.on_time} On Time, ${m.completed_late} Late`}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  <div
                    className="relative w-full max-w-6"
                    style={{ height: `${(m.population / top) * 100}%` }}
                  >
                    <div className="flex h-full w-full flex-col-reverse gap-[2px] transition-opacity group-hover:opacity-80 group-focus:opacity-80">
                      {SEGMENTS.map((s, si) => {
                        const v = m[s.key];
                        if (!v) return null;
                        const isTop = SEGMENTS.slice(si + 1).every(
                          (n) => !m[n.key],
                        );
                        return (
                          <div
                            key={s.key}
                            className={`${s.color} ${isTop ? "rounded-t" : ""}`}
                            style={{ flexGrow: v, flexBasis: 0 }}
                          />
                        );
                      })}
                    </div>

                    {/* Tooltip: values lead, labels follow. */}
                    <div
                      role="tooltip"
                      className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-44 rounded-lg border border-line bg-surface-2 p-3 text-sm shadow-lg group-hover:block group-focus:block ${
                        i > rows.length / 2 ? "right-0" : "left-0"
                      }`}
                    >
                      <p className="mb-2 font-medium text-ink-1">
                        {formatMonth(m.key)}
                      </p>
                      {[...SEGMENTS].reverse().map((s) => (
                        <p
                          key={s.key}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="flex items-center gap-2 text-ink-2">
                            <span
                              aria-hidden
                              className={`h-0.5 w-3 ${s.color}`}
                            />
                            {s.label}
                          </span>
                          <span className="tabular font-semibold text-ink-1">
                            {m[s.key]}
                          </span>
                        </p>
                      ))}
                      <p className="mt-2 border-t border-line pt-2 text-ink-2">
                        On-time rate{" "}
                        <span className="font-semibold text-ink-1">
                          {formatPercent(m.on_time_rate)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex h-4">
            {rows.map((m, i) => (
              <span
                key={m.key}
                className="relative flex-1 text-center text-xs text-ink-3"
              >
                {(i % labelEvery === 0 || i === rows.length - 1) && (
                  <span
                    className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${
                      i === 0 || i === rows.length - 1 ? "" : "hidden sm:inline"
                    } ${i === rows.length - 1 && i % labelEvery !== 0 ? "sm:hidden" : ""}`}
                  >
                    {shortMonth(m.key)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {unknown && (
        <p className="mt-3 text-xs text-ink-3">
          {unknown.population} completions have no known completion date and are
          not shown by month.
        </p>
      )}

      <DataTable>
        <table className="tabular w-full text-left">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-normal">Month</th>
              <th className="py-1 text-right font-normal">Early</th>
              <th className="py-1 text-right font-normal">On Time</th>
              <th className="py-1 text-right font-normal">Late</th>
              <th className="py-1 text-right font-normal">On-time rate</th>
              <th className="py-1 text-right font-normal">Avg days late</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {[...rows]
              .reverse()
              .filter((m) => m.population > 0)
              .map((m) => (
                <tr key={m.key} className="border-t border-line">
                  <td className="py-1">{formatMonth(m.key)}</td>
                  <td className="py-1 text-right">{m.early}</td>
                  <td className="py-1 text-right">{m.on_time}</td>
                  <td className="py-1 text-right">{m.completed_late}</td>
                  <td className="py-1 text-right">
                    {formatPercent(m.on_time_rate)}
                  </td>
                  <td className="py-1 text-right">
                    {formatNumber(m.avg_days_late, 1)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
