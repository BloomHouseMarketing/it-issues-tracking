"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, usePopover } from "./popover";

export interface ListboxOption {
  value: string;
  label: string;
}

/**
 * A dropdown for one value. The first row ("All …") clears the filter. Long
 * lists get a search box. Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
 */
export function Listbox({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | null;
  options: ListboxOption[];
  onChange: (value: string | null) => void;
}) {
  const { open, setOpen, rootRef } = usePopover();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchable = options.length > 8;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return [{ value: "", label: allLabel }, ...matched];
  }, [options, query, allLabel]);

  const toggle = () => {
    if (!open) {
      setQuery("");
      setActive(value ? Math.max(options.findIndex((o) => o.value === value) + 1, 0) : 0);
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (open) requestAnimationFrame(() => (searchable ? searchRef.current : listRef.current)?.focus());
  }, [open, searchable]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (v: string) => {
    setOpen(false);
    onChange(v || null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) pick(rows[active].value);
    }
  };

  const current = value ? (options.find((o) => o.value === value)?.label ?? value) : allLabel;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className={`flex h-12 min-w-44 max-w-72 items-center gap-3 rounded-lg border bg-surface-2 px-3 text-left transition-colors hover:border-ink-3 ${
          open ? "border-accent" : "border-line"
        }`}
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] uppercase tracking-wide text-ink-3">{label}</span>
          <span className={`truncate text-sm ${value ? "text-ink-1" : "text-ink-2"}`}>{current}</span>
        </span>
        <ChevronDown className={`ml-auto shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-surface-2 shadow-2xl shadow-black/40">
          {searchable && (
            <div className="border-b border-line p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(e.target.value ? 1 : 0);
                }}
                onKeyDown={onKeyDown}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-controls={listId}
                aria-activedescendant={`${listId}-${active}`}
                className="w-full rounded-md bg-surface-1 px-3 py-2 text-sm text-ink-1 outline-none placeholder:text-ink-3 focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            onKeyDown={searchable ? undefined : onKeyDown}
            aria-activedescendant={`${listId}-${active}`}
            className="max-h-80 overflow-auto p-1 outline-none"
          >
            {rows.map((o, i) => {
              const selected = (value ?? "") === o.value;
              return (
                <li
                  key={o.value || "__all"}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.value)}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm ${
                    i === active ? "bg-white/5" : ""
                  } ${selected ? "font-semibold text-ink-1" : "text-ink-2"} ${i === 0 ? "border-b border-line/0" : ""}`}
                >
                  <span className="w-4 shrink-0">{selected && <Check />}</span>
                  <span className="truncate">{o.label}</span>
                </li>
              );
            })}
            {rows.length === 1 && query && <li className="px-3 py-2 text-sm text-ink-3">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
