# Coastal IT Performance Dashboard

Shows how the Coastal IT team performs against due dates. Data is synced from the monday.com board **Coastal IT To Do** into Supabase. See [CLAUDE.md](./CLAUDE.md) for the full spec and metric definitions.

## Status

- [x] Phase 1: Supabase schema (`supabase/migrations/`)
- [x] Phase 2: `/api/sync` with unit tests. **Waiting on a first live run and count check.**
- [ ] Phase 3: SQL views
- [ ] Phase 4: Dashboard UI
- [ ] Phase 5: Scheduled sync, access control, Vercel deploy

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in all four values.
3. Apply the migration: paste `supabase/migrations/20260922000000_initial_schema.sql` into the Supabase SQL editor, or run `supabase db push` with the Supabase CLI.

## Run the sync and check counts

```bash
npm run sync      # runs one full sync, then prints counts
npm run counts    # prints counts only
```

Or call the deployed route:

```bash
curl -X POST https://<your-app>/api/sync -H "Authorization: Bearer $SYNC_SECRET"
```

You can also paste `supabase/queries/verify_counts.sql` into the SQL editor.

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

`[TEST` items are stored as-is and excluded when metrics are calculated (the Phase 3 views). The sync never writes to monday.com.
