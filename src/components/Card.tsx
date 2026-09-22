import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  className = "",
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-line bg-surface-1 p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-1">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A collapsible table view under a chart, so no value depends on hover or color. */
export function DataTable({ summary = "Show data table", children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer select-none text-ink-3 hover:text-ink-2">{summary}</summary>
      <div className="mt-3 max-h-80 overflow-auto">{children}</div>
    </details>
  );
}
