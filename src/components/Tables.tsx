import type { CompletedItem, OpenItem } from "@/lib/dashboard/data";
import { formatDate, formatDateTimePT, joinList } from "@/lib/format";
import { ReportLabel } from "./ReportLabel";

const th = "px-3 py-2 text-left font-normal text-ink-3 whitespace-nowrap";
const td = "px-3 py-2 align-top";

function ItemLink({ href, name }: { href: string; name: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-ink-1 underline decoration-line underline-offset-4 hover:decoration-accent">
      {name}
    </a>
  );
}

export function OverdueTable({ items }: { items: OpenItem[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-ink-3">Nothing is overdue. Items are marked Overdue by the nightly check at 12:05 AM PT.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Item</th>
            <th className={th}>Due date</th>
            <th className={`${th} text-right`}>Days overdue</th>
            <th className={th}>Assigned to</th>
            <th className={th}>Company</th>
            <th className={th}>Priority</th>
          </tr>
        </thead>
        <tbody className="text-ink-2">
          {items.map((i) => (
            <tr key={i.item_id} className="border-t border-line">
              <td className={td}>
                <ItemLink href={i.monday_url} name={i.name} />
              </td>
              <td className={`${td} whitespace-nowrap`}>{formatDate(i.due_date)}</td>
              <td className={`${td} tabular text-right font-semibold text-ink-1`}>{i.days_past_due ?? "—"}</td>
              <td className={td}>{joinList(i.assignees)}</td>
              <td className={td}>{joinList(i.company)}</td>
              <td className={td}>{i.priority ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompletionsTable({ items }: { items: CompletedItem[] }) {
  if (items.length === 0) return <p className="py-8 text-center text-ink-3">No rated completions in this date range.</p>;
  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-1">
          <tr>
            <th className={th}>Item</th>
            <th className={th}>Report</th>
            <th className={`${th} text-right`}>Days late</th>
            <th className={th}>Due date</th>
            <th className={th}>Completed</th>
            <th className={th}>Assigned to</th>
            <th className={th}>Company</th>
          </tr>
        </thead>
        <tbody className="text-ink-2">
          {items.map((i) => (
            <tr key={i.item_id} className="border-t border-line">
              <td className={td}>
                <ItemLink href={i.monday_url} name={i.name} />
              </td>
              <td className={td}>
                <ReportLabel report={i.report} />
              </td>
              <td className={`${td} tabular text-right`}>{i.report === "Late" ? i.days_delayed ?? "—" : "—"}</td>
              <td className={`${td} whitespace-nowrap`}>{formatDate(i.due_date)}</td>
              <td className={`${td} whitespace-nowrap`}>{formatDateTimePT(i.completed_at)}</td>
              <td className={td}>{joinList(i.assignees)}</td>
              <td className={td}>{joinList(i.company)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
