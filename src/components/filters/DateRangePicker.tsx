"use client";

import { useState } from "react";
import { addDays, describeRange, monthStart, RANGE_PRESETS, rangeLabel, resolveRange, type RangePreset } from "@/lib/dashboard/filters";
import { formatDate } from "@/lib/format";
import { CalendarIcon, Check, Chevron, ChevronDown, usePopover } from "./popover";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const monthTitle = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

/** Monday-first grid of dates (YYYY-MM-DD) covering the month, padded with neighbors. */
function monthGrid(month: string): string[] {
  const first = monthStart(month);
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -dow);
  const next = monthStart(month, 1);
  const days: string[] = [];
  for (let d = start; d < next || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}

export function DateRangePicker({
  range,
  from,
  to,
  today,
  onChange,
}: {
  range: RangePreset;
  from: string | null;
  to: string | null;
  today: string;
  onChange: (next: { range: RangePreset; from: string | null; to: string | null }) => void;
}) {
  const { open, setOpen, rootRef } = usePopover();
  // Draft custom selection inside the calendar.
  const [start, setStart] = useState<string | null>(from);
  const [end, setEnd] = useState<string | null>(to);
  const [hover, setHover] = useState<string | null>(null);
  const [month, setMonth] = useState(monthStart(to ?? today));

  const toggle = () => {
    if (!open) {
      setStart(from);
      setEnd(to);
      setHover(null);
      setMonth(monthStart(to ?? today));
    }
    setOpen(!open);
  };

  const pickPreset = (value: RangePreset) => {
    setOpen(false);
    onChange({ range: value, ...resolveRange(value, today) });
  };

  const clickDay = (d: string) => {
    if (d > today) return;
    if (!start || end) {
      setStart(d);
      setEnd(null);
    } else if (d < start) {
      setEnd(start);
      setStart(d);
    } else {
      setEnd(d);
    }
  };

  const applyCustom = () => {
    if (!start) return;
    setOpen(false);
    onChange({ range: "custom", from: start, to: end ?? start });
  };

  // What the calendar highlights: the draft, or the hover preview while choosing an end.
  const lo = start;
  const hi = end ?? (start && hover && hover >= start ? hover : start);
  const draftChanged = start !== from || (end ?? start) !== to;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className={`flex h-12 min-w-64 items-center gap-3 rounded-lg border bg-surface-2 px-3 text-left transition-colors hover:border-ink-3 ${
          open ? "border-accent" : "border-line"
        }`}
      >
        <CalendarIcon />
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] uppercase tracking-wide text-ink-3">{rangeLabel(range)}</span>
          <span className="truncate text-sm text-ink-1">{describeRange(from, to)}</span>
        </span>
        <ChevronDown className={`ml-auto shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute left-0 z-30 mt-2 flex w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface-2 shadow-2xl shadow-black/40 sm:flex-row"
        >
          {/* Presets */}
          <ul className="flex shrink-0 flex-col gap-0.5 border-b border-line p-2 sm:w-48 sm:border-b-0 sm:border-r">
            {RANGE_PRESETS.map((p) => {
              const selected = range === p.value;
              return (
                <li key={p.value}>
                  <button
                    type="button"
                    onClick={() => pickPreset(p.value)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-white/5 ${
                      selected ? "font-semibold text-ink-1" : "text-ink-2"
                    }`}
                  >
                    <span className="w-4 shrink-0">{selected && <Check />}</span>
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Custom range */}
          <div className="flex flex-1 flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setMonth(monthStart(month, -1))}
                className="rounded-md p-1.5 text-ink-2 hover:bg-white/5 hover:text-ink-1"
              >
                <Chevron dir="left" />
              </button>
              <span className="text-sm font-medium text-ink-1">{monthTitle.format(new Date(`${month}T00:00:00Z`))}</span>
              <button
                type="button"
                aria-label="Next month"
                disabled={monthStart(month, 1) > today}
                onClick={() => setMonth(monthStart(month, 1))}
                className="rounded-md p-1.5 text-ink-2 hover:bg-white/5 hover:text-ink-1 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Chevron dir="right" />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-xs text-ink-3">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-1">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7" onMouseLeave={() => setHover(null)}>
              {monthGrid(month).map((d) => {
                const inMonth = d.slice(0, 7) === month.slice(0, 7);
                const future = d > today;
                const isStart = d === lo;
                const isEnd = d === hi;
                const inRange = !!lo && !!hi && d >= lo && d <= hi;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={future}
                    onClick={() => clickDay(d)}
                    onMouseEnter={() => setHover(d)}
                    aria-label={formatDate(d)}
                    aria-pressed={isStart || isEnd}
                    className={`relative h-9 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${
                      inRange && !isStart && !isEnd ? "bg-accent/15 text-ink-1" : ""
                    } ${isStart ? "rounded-l-md" : ""} ${isEnd ? "rounded-r-md" : ""} ${
                      isStart || isEnd ? "bg-accent font-semibold text-surface-0" : inMonth ? "text-ink-2 hover:bg-white/5" : "text-ink-3/50 hover:bg-white/5"
                    }`}
                  >
                    {Number(d.slice(8))}
                    {d === today && !isStart && !isEnd && (
                      <span aria-hidden className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-sm text-ink-2">
                {start ? describeRange(start, end ?? (hover && hover >= start ? hover : start)) : "Pick a start date"}
                {start && !end && <span className="text-ink-3"> · pick an end date</span>}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-sm text-ink-2 hover:text-ink-1">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!start || (!draftChanged && range === "custom")}
                  onClick={applyCustom}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface-0 disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
