const COLORS: Record<string, string> = {
  Early: "bg-early",
  "On Time": "bg-ontime",
  Overdue: "bg-overdue",
  Late: "bg-late",
};

/** Report label: colored dot for identity, text stays in ink. */
export function ReportLabel({ report }: { report: string | null }) {
  if (!report) return <span className="text-ink-3">—</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${COLORS[report] ?? "bg-ink-3"}`} />
      {report}
    </span>
  );
}

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2">
      <span aria-hidden className={`inline-block h-3 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
