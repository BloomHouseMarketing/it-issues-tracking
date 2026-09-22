"use client";

import { useActionState } from "react";
import { refreshNow } from "@/app/actions";

export function RefreshButton() {
  const [state, action, pending] = useActionState(refreshNow, null);
  return (
    <form action={action} className="flex items-center gap-3">
      {state && !pending && (
        <span role="status" className={`text-sm ${state.ok ? "text-ink-2" : "text-danger"}`}>
          {state.message}
        </span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 transition-colors hover:border-accent disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Refresh now"}
      </button>
    </form>
  );
}
