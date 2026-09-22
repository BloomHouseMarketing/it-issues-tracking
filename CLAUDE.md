# Coastal IT Performance Dashboard

A Next.js dashboard, hosted on Vercel, that shows how the Coastal IT team performs against due dates. Data comes from the monday.com board **Coastal IT To Do**. It is synced into Supabase, and the dashboard reads only from Supabase.

## Stack

- Next.js (App Router, TypeScript, Server Components), Tailwind CSS
- Supabase (Postgres) as the data store
- Vercel for hosting, plus a scheduled trigger for the sync
- monday.com GraphQL API (`https://api.monday.com/v2`) as the source of truth

## Source board (monday.com)

| Thing | Value |
|---|---|
| Board | Coastal IT To Do, id `7364661326` |
| To Do group | "To Do - Coastal", id `new_group60142` |
| Completed group | "Completed", id `group_title` |
| Status column | `status` (done label = "Completed", index 1; older items used "Complete") |
| Due Date column | `date__1` (date only, no time) |
| Report column | `color_mm7egxa`, labels: `Early`, `On Time`, `Overdue`, `Late` (blank = not classified) |
| Days Delayed column | `numeric_mm7ej9gp` (integer days; 0 for Early/On Time) |
| Other useful columns | Company `dropdown`, Priority `status_1`, Assigned to `multiple_person_mm65hfg8` |

The Completed group has 500+ items, so reads must use `items_page` with **cursor pagination** (`next_items_page`).

### How Report gets filled (already built in n8n; do not rebuild it)

- When an item in To Do – Coastal is set to Completed, Report is set to Early, On Time or Late, and Days Delayed is filled in. Dates are compared in **America/Los_Angeles**. The board then auto-moves the item to Completed.
- A nightly job at 12:05 AM PT sets Report = `Overdue` on To Do – Coastal items whose due date has passed, that aren't Completed, and whose Report is blank.
- If an Overdue item's due date changes, Report is cleared and an update is posted on the item.
- An item that was Overdue and then gets completed becomes `Late`.
- Historical Completed items were backfilled with the same rules.

**Key consequence:** in the Completed group, **Report is non-blank only for items that were completed while in To Do – Coastal *and* had a due date.** Items from other groups, and items without a due date, always have a blank Report. So the dashboard filters on Report and does not need to re-derive group history.

## Metrics (definitions are authoritative)

Exclude test items everywhere: any item whose name contains the word "test" at the start of a word, in any case (e.g. `[TEST – ignore] Late`, `Other - Jessa Test`, `testing`). Words like "latest" or "contest" do not count. In SQL: `name ~* '\mtest'`. Test items are still stored in `monday_items`; they are excluded when metrics are calculated.

### Completed performance (Completed group)

- Population: items in `group_title` with Report ∈ {Early, On Time, Late}
- **Completed on time** = Early + On Time. Show Early and On Time separately as well.
- **Completed late** = Late
- **On-time rate** = (Early + On Time) / population
- **Average days late** = mean Days Delayed across Late items. Also show the median and the maximum.
- Breakdowns: by month of completion (see `completed_at` below), by Company, by Assigned to

### Open work (To Do – Coastal group)

- **Overdue now** = items in `new_group60142` with Report = `Overdue`
- Also show: open items total, due today (due_date = today in PT), and items with no due date
- Table of overdue items: name, due date, days overdue (today PT − due date), assignee, company, priority, and a link to the monday item (`https://quickstarthealth.monday.com/boards/7364661326/pulses/{id}`)

## Architecture

```
monday.com --(GraphQL, server-side)--> /api/sync (Next.js route) --upsert--> Supabase
                                                                                   |
                                        Dashboard pages (Server Components) <------+
```

### Sync (`/api/sync`)

- Protected: requires header `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron sends this automatically). Reject anything else.
- Fetches **all items in both groups** (paginated) with the columns listed above, and upserts them into `monday_items`.
- Deletes rows for items that are no longer in either group (for example, deleted or moved back).
- **completed_at:** derive it from the board's activity log (`boards { activity_logs(column_ids: ["status"], limit: 500, page: N) }`). Use the latest event where `value.label.is_done === true` and `previous_value.label.is_done !== true`. `created_at` is in units of 100 ns, so `ms = Number(created_at) / 1e4`. There are about 1,200 status events in total, so reading all pages on each run is fine. After a full run, the sync can switch to reading only recent pages.
- Writes a row to `sync_runs` (started_at, finished_at, items_synced, ok, error).
- Must stay within monday's API complexity budget: request only the needed columns, run pages sequentially, and retry once after 60 s if the error mentions "Complexity budget exhausted".
- Trigger: every 15 minutes via **Vercel Cron** (GET `/api/sync`, configured in `vercel.json`). No n8n involvement in the sync; the app reads the monday board directly. Sub-daily crons need the Vercel Pro plan. Also add a "Refresh now" button in the UI that calls a server action, which triggers the sync.

### Supabase schema

```sql
create table monday_items (
  item_id        bigint primary key,
  name           text not null,
  group_id       text not null,
  group_title    text,
  status         text,
  due_date       date,
  report         text,          -- Early | On Time | Overdue | Late | null
  days_delayed   integer,
  completed_at   timestamptz,   -- from activity log; null if unknown
  company        text[],
  priority       text,
  assignees      text[],
  monday_updated_at timestamptz,
  synced_at      timestamptz not null default now()
);

create table sync_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_synced integer,
  ok boolean,
  error text
);

-- Optional: daily snapshot for trend lines of overdue counts
create table daily_snapshots (
  snapshot_date date primary key,
  overdue_count integer,
  open_count integer,
  completed_on_time integer,
  completed_late integer
);
```

- Enable RLS on all tables with **no anon policies**. Only the server uses the service-role key.
- Put the metric logic in SQL views (`v_completed_performance`, `v_overdue_now`) so it stays consistent.

## Dashboard UI

- One page, clean and responsive, readable on a laptop and a TV screen.
- Top KPI cards: Completed on time, Completed late, On-time rate %, Avg days late, **Overdue now**
- Charts: monthly on-time vs late (stacked bar, last 6 months), overdue count trend (from `daily_snapshots`), late items by assignee or company
- Tables: current overdue items, and rated completions in the selected date range with their Report label
- Report label colors: Early `#66ccff`, On Time `#9cd326`, Overdue `#df2f4a`, Late `#bb3354`
- Show "Last synced: …" from `sync_runs`
- Filters: date range (on completed_at), company, assignee
  - Date presets: Today, Yesterday, This week, Last week, This month (default), Last month, Last 30 days, Last 6 months, All time, plus a custom range picked on a calendar. Weeks run Monday to Sunday. "Last 6 months" = the current month plus the 5 before it.
  - The date filter applies to the KPI cards, late breakdowns, completions table and overdue trend. It does not apply to "Overdue now" (always today's open work) or to the "On time vs late, by month" chart, which always shows the last 6 months (6 bars).
- All dates are displayed in Pacific time.

## Access control

This is internal company data, so the dashboard must not be publicly readable.

**Decision:** a single shared dashboard password, checked by the app itself.

- The password is in the `DASHBOARD_PASSWORD` environment variable (never in the code or repo).
- `src/proxy.ts` sends every request without a valid session cookie to `/login`. `/api/sync` is excluded because it has its own `CRON_SECRET` check.
- The session cookie is an HMAC keyed by the password (httpOnly, 30 days). Changing the password signs everyone out.
- Server Actions (such as "Refresh now") check the session themselves, because they are reachable by direct POST.

## Environment variables

| Name | Where | Notes |
|---|---|---|
| `MONDAY_API_TOKEN` | Vercel (server only) | Read-only use; never expose to the client |
| `SUPABASE_URL` | Vercel | |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server only) | Never expose to the client |
| `CRON_SECRET` | Vercel | Random 32+ character string; Vercel Cron sends it as a Bearer token |
| `DASHBOARD_PASSWORD` | Vercel (server only) | The shared password for the dashboard login |

Never commit secrets. Provide `.env.example`.

## Rules for this repo

- The dashboard is **read-only** toward monday.com. Never write to the board from this app.
- Don't change the metric definitions above without asking.
- Test the sync logic (pagination, activity log parsing, PT date math) with unit tests using fixture data.
- Build in phases, and confirm each phase works before moving on:
  1. Supabase schema and migrations
  2. `/api/sync` with tests; run it once and verify counts. Expected roughly: Completed with Report ≈ 302 real items (43 Early, 89 On Time, 170 Late) plus test items that must be excluded, and To Do – Coastal ≈ 30 items.
  3. SQL views
  4. Dashboard UI
  5. Scheduled sync and access control, then deploy to Vercel

## Next.js version notes

@AGENTS.md
