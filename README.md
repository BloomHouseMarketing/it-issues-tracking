# Coastal IT Performance Dashboard

Shows how the Coastal IT team performs against due dates. Data is synced from the monday.com board **Coastal IT To Do** into Supabase. See [CLAUDE.md](./CLAUDE.md) for the full spec and metric definitions.

## Status

- [x] Phase 1: Supabase schema (`supabase/migrations/`)
- [x] Phase 2: `/api/sync` with unit tests; initial sync verified (302 real rated items: 43 Early, 89 On Time, 170 Late)
- [x] Phase 3: SQL views (`supabase/migrations/20260922010000_metric_views.sql`)
- [x] Phase 4: Dashboard UI with password login
- [ ] Phase 5: Deploy to Vercel (cron is configured in `vercel.json`)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in all five values.
3. Apply the migrations in order: paste each file in `supabase/migrations/` into the Supabase SQL editor, or run `supabase db push` with the Supabase CLI.

## Run the sync and check counts

```bash
npm run sync      # runs one full sync, then prints counts
npm run counts    # prints counts only
npm run sync -- --dry-run   # reads monday only, writes nothing
```

Or call the deployed route:

```bash
curl https://<your-app>/api/sync -H "Authorization: Bearer $CRON_SECRET"
```

You can also paste `supabase/queries/verify_counts.sql` into the SQL editor.

## Dashboard

One page at `/`, behind a password login (`DASHBOARD_PASSWORD`).

- KPI cards, monthly on-time vs late, the overdue trend, late completions by company and assignee, the overdue table and the completions in the selected range.
- Filters live in the URL, so a filtered view can be bookmarked or shown on a TV. Date presets (Today … Last 6 months, All time) or a custom calendar range; searchable company and assignee pickers. The monthly chart always shows the last 6 months.
- The page re-fetches every 5 minutes. "Refresh now" runs a full sync right away.
- Light theme by default; the moon/sun button in the header switches to dark mode and remembers the choice (cookie).

## Metrics in SQL

All metric logic lives in the database so every screen agrees. Everything excludes test items and is locked to the service-role key.

| Object | What it returns |
|---|---|
| `v_completed_performance` | One row per rated completion (Early / On Time / Late), with Pacific-time completion date and month |
| `completed_performance_summary(p_from, p_to, p_company, p_assignee)` | KPI row: counts, on-time rate, average / median / max days late. All filters optional |
| `completed_performance_breakdown(p_dimension, …same filters)` | The same KPIs per `month`, `company` or `assignee` |
| `v_open_items` | To Do – Coastal items |
| `v_overdue_now` | Overdue items with days overdue (today PT − due date) and monday link |
| `v_open_work_summary` | Open total, overdue now, due today, no due date |
| `v_recent_completions` | Rated completions from the last 30 days |
| `take_daily_snapshot()` | Writes today's counts to `daily_snapshots`; runs after every sync |

`npm run check:metrics` recomputes every metric in TypeScript from the raw rows and compares it with the SQL output.

## Development

```bash
npm test          # unit tests (fixture data, no network)
npm run typecheck
npm run lint
npm run dev
```

## How the sync works

1. Reads To Do – Coastal, then Completed, with `items_page` / `next_items_page` (500 per page, one page at a time, only the needed columns).
2. Reads every page of Status-column activity logs and sets `completed_at` to each item's latest not-done → done change. Only Completed-group items get a `completed_at`. If the log no longer has an item's event, the stored value is kept.
3. Upserts all rows into `monday_items`, then deletes rows for items that are in neither group. If monday returns zero items, the run fails instead of emptying the table.
4. Logs the run in `sync_runs`. If monday reports "Complexity budget exhausted", the sync waits 60 s and retries once.

Test items (any word starting with "test" in the name, any case) are stored as-is and excluded when metrics are calculated (the Phase 3 views). The sync never writes to monday.com.
