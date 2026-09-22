# Coastal IT Performance Dashboard: Structure, Behavior and Porting Guide

This document describes everything the Coastal IT Performance Dashboard does and how it works. Use it to rebuild the dashboard as a page inside another dashboard.

- **What it is:** a one-page dashboard that shows how the Coastal IT team performs against due dates, based on the monday.com board **Coastal IT To Do**.
- **Current app:** Next.js 16 (App Router, TypeScript, Server Components), Tailwind CSS 4, Supabase (Postgres), hosted on Vercel.
- **Source code:** `BloomHouseMarketing/it-issues-tracking`, branch `main`.
- **Status:** approved by the team lead and live on Vercel.

---

## Contents

1. [How it works in one minute](#1-how-it-works-in-one-minute)
2. [Source data: the monday.com board](#2-source-data-the-mondaycom-board)
3. [Metric definitions](#3-metric-definitions)
4. [Database: tables, views and functions](#4-database-tables-views-and-functions)
5. [The sync](#5-the-sync)
6. [The page, section by section](#6-the-page-section-by-section)
7. [Filters](#7-filters)
8. [Look and feel](#8-look-and-feel)
9. [Access control](#9-access-control)
10. [Environment variables](#10-environment-variables)
11. [File map](#11-file-map)
12. [Porting into another dashboard](#12-porting-into-another-dashboard)
13. [Verification and tests](#13-verification-and-tests)
14. [Known quirks and decisions](#14-known-quirks-and-decisions)
15. [Appendix A: SQL migrations (verbatim)](#appendix-a-sql-migrations-verbatim)
16. [Appendix B: monday.com GraphQL queries (verbatim)](#appendix-b-mondaycom-graphql-queries-verbatim)

---

## 1. How it works in one minute

```
monday.com board ──(GraphQL, server-side, read-only)──▶ sync ──upsert──▶ Supabase (Postgres)
   "Coastal IT To Do"                                    ▲                    │
                                                         │                    │ SQL views and functions
                          Vercel Cron every 15 min ──────┤                    │ (all metric logic)
                          "Refresh now" button ──────────┘                    ▼
                                                              Dashboard page (Server Component)
```

1. **Sync:** every 15 minutes (and on "Refresh now"), the server reads both board groups from monday.com and stores every item in the Supabase table `monday_items`.
2. **Metrics:** SQL views and functions in Supabase compute every number (on-time rate, days late, overdue and so on), so every screen agrees.
3. **Page:** a server-rendered page reads only from Supabase, never from monday.com directly, and renders KPI cards, charts and tables.
4. **The app never writes to monday.com.** Report labels (Early, On Time, Late, Overdue) are written on the board by an existing **n8n** automation. The dashboard only reads them.

---

## 2. Source data: the monday.com board

| Thing | Value |
|---|---|
| Board | Coastal IT To Do, id `7364661326` |
| Account URL | `https://quickstarthealth.monday.com` |
| To Do group | "To Do - Coastal", id `new_group60142` |
| Completed group | "Completed", id `group_title` |
| Status column | `status` (done label "Completed", index 1; older items used "Complete") |
| Due Date column | `date__1` (date only, no time) |
| Report column | `color_mm7egxa`, labels `Early`, `On Time`, `Overdue`, `Late` (blank = not classified) |
| Days Delayed column | `numeric_mm7ej9gp` (integer days; 0 for Early and On Time) |
| Company | `dropdown` (can hold several values) |
| Priority | `status_1` |
| Assigned to | `multiple_person_mm65hfg8` (can hold several people) |
| Item link format | `https://quickstarthealth.monday.com/boards/7364661326/pulses/{item_id}` |

Other groups on the board (not synced): "New Entities Initial Set Up" (`group_mm15dsf`), "New Entities Pending/Ongoing" (`group_mm64ppgm`), "Canceled" (`group_mkw2e2nf`).

### How the Report label gets set (n8n, outside this app; do not rebuild)

- When an item in To Do – Coastal is set to Completed, n8n sets Report to **Early**, **On Time** or **Late** and fills in **Days Delayed**, comparing dates in **America/Los_Angeles**. The board then moves the item to Completed.
- A nightly job at **12:05 AM PT** sets Report = **Overdue** on To Do – Coastal items whose due date has passed, that aren't Completed, and whose Report is blank.
- If an Overdue item's due date changes, Report is cleared and an update is posted on the item.
- An item that was Overdue and then gets completed becomes **Late**.
- Historical Completed items were backfilled with the same rules.

**Consequence:** in the Completed group, Report is filled in only for items that were completed while in To Do – Coastal *and* had a due date. Items from other groups, or with no due date, always have a blank Report. So the dashboard filters on Report and never re-derives group history.

---

## 3. Metric definitions

These definitions are authoritative. Don't change them without the team lead's approval.

**Test items are excluded everywhere.** A test item is any item whose name contains a word starting with "test", in any case:

- Excluded: `[TEST – ignore] Late`, `Other - Jessa Test`, `Test`, `ticket - testing jessa`
- Not excluded: "latest", "contest", "attest"
- SQL: `name ~* '\mtest'` (`\m` = start of a word). TypeScript: `/\btest/i`.
- Test items stay in `monday_items`; they're only left out when metrics are calculated.

### Completed performance (Completed group)

| Metric | Definition |
|---|---|
| Population ("rated completions") | Items in `group_title` with Report ∈ {Early, On Time, Late}, excluding test items |
| Completed on time | Early + On Time (Early and On Time are also shown separately) |
| Completed late | Late |
| On-time rate | (Early + On Time) ÷ population |
| Average days late | Mean of Days Delayed across Late items; also shown: **median** and **maximum** |
| Breakdowns | By month of completion (Pacific time), by Company, by Assigned to |

### Open work (To Do – Coastal group)

| Metric | Definition |
|---|---|
| Overdue now | Items in `new_group60142` with Report = `Overdue` |
| Open items | All items in `new_group60142` |
| Due today | `due_date` = today in Pacific time |
| No due date | `due_date` is empty |
| Days overdue | Today (PT) − due date |

### Dates and time zones

- **All dates are Pacific time** (`America/Los_Angeles`), including "today", the month an item was completed in, and the date filters.
- `completed_at` is a timestamp. Its Pacific-time calendar date decides which day, week and month the completion counts toward. For example, a completion at 03:00 UTC on Sept 1 counts toward **August**, because it's Aug 31, 8 PM in Pacific time.
- **Weeks run Monday to Sunday.**

---

## 4. Database: tables, views and functions

All objects live in the `public` schema of the Supabase project. Full SQL is in [Appendix A](#appendix-a-sql-migrations-verbatim). Apply the migrations in order:

1. `supabase/migrations/20260922000000_initial_schema.sql`: tables and RLS
2. `supabase/migrations/20260922010000_metric_views.sql`: views and functions

### Tables

| Table | Purpose | Key columns |
|---|---|---|
| `monday_items` | One row per item in the two synced groups | `item_id` (PK), `name`, `group_id`, `group_title`, `status`, `due_date` (date), `report`, `days_delayed`, `completed_at` (timestamptz), `company` (text[]), `priority`, `assignees` (text[]), `monday_updated_at`, `synced_at` |
| `sync_runs` | One row per sync attempt | `id`, `started_at`, `finished_at`, `items_synced`, `ok`, `error` |
| `daily_snapshots` | One row per Pacific-time day, for the overdue trend chart | `snapshot_date` (PK), `overdue_count`, `open_count`, `completed_on_time`, `completed_late` |

### Views (all `security_invoker = true`)

| View | Returns |
|---|---|
| `v_completed_performance` | One row per rated completion (the population above), with `is_on_time`, `completed_date_pt`, `completed_month_pt`, `company`, `assignees` (never null; `{}` when empty) and `monday_url` |
| `v_open_items` | One row per non-test To Do – Coastal item, with `days_past_due` |
| `v_overdue_now` | Open items with Report = Overdue, with `days_overdue` and `monday_url` |
| `v_open_work_summary` | One row: `open_total`, `overdue_now`, `due_today`, `no_due_date`, `as_of_date_pt` |
| `v_recent_completions` | Rated completions from the last 30 days (no longer used by the page, kept for convenience) |

### Functions

| Function | Returns |
|---|---|
| `pt_today()` | Today's date in Pacific time |
| `is_test_item(name)` | `true` for test items (the rule above) |
| `completed_performance_summary(p_from, p_to, p_company, p_assignee)` | One KPI row: `population`, `early`, `on_time`, `completed_on_time`, `completed_late`, `on_time_rate`, `avg_days_late`, `median_days_late`, `max_days_late`. All parameters are optional (null = no filter). `p_from` and `p_to` are inclusive PT dates on the completion date. |
| `completed_performance_breakdown(p_dimension, …same filters)` | The same KPI columns plus `key`, one row per `month` (`YYYY-MM`), `company` or `assignee`. An item with several companies or assignees counts once under each. Items with none are grouped under `(none)`; items with no completion date appear under `(unknown)` by month. |
| `take_daily_snapshot()` | Writes today's counts to `daily_snapshots`. It runs after every sync, so the last sync of the day wins. |

### Security model

- RLS is enabled on every table, and there are **no policies**. The `anon` and `authenticated` roles can read and write nothing.
- The views use `security_invoker`, so they respect RLS rather than running with the owner's rights.
- Every view and function is revoked from `anon` and `authenticated` and granted to `service_role`.
- Only the server uses the **service-role key**. It never reaches the browser.

---

## 5. The sync

Code: `src/lib/sync/runSync.ts`, `src/lib/monday/*`, `src/lib/sync/transform.ts`, `src/lib/sync/supabaseStore.ts`.

### What one run does

1. Inserts a `sync_runs` row (`started_at`).
2. Reads **To Do – Coastal**, then **Completed**, from monday.com using `items_page` and then `next_items_page` (cursor pagination, 500 items per page, **one page at a time**, only the 7 needed columns).
3. Reads **every page** of the board's activity log for the Status column (`activity_logs(column_ids: ["status"], limit: 500, page: N)`), until a page comes back with fewer than 500 entries.
4. Works out each item's `completed_at` from that log: the **latest** event where `value.label.is_done === true` and `previous_value.label.is_done !== true`, meaning a change from not done to done. Relabels from done to done (such as "Complete" to "Completed") don't count. `created_at` is in 100-nanosecond units: `ms = created_at / 10,000`, done with BigInt for precision.
   - Only **Completed-group** items get a `completed_at`; To Do items get null.
   - If the log no longer has an item's event (for example because of monday's history limit), the value already stored is kept.
5. Converts each item to a row:
   - Status, Report and Priority from the column text, with blanks stored as null.
   - Due date from the date column's JSON `date`, falling back to the text.
   - Days Delayed as an integer (0 stays 0).
   - Company from the dropdown labels, and assignees from the people column text split on ", ".
6. **Refuses to continue if monday returned zero items** in both groups. That protects against wiping the table on a bad read.
7. Saves all rows (in chunks of 500), then deletes rows for items that are in **neither** group any more (deleted, archived or moved away).
8. Calls `take_daily_snapshot()`. If the snapshot fails, the sync still counts as a success, and the error is recorded as `snapshot failed: …`.
9. Updates the `sync_runs` row with `finished_at`, `items_synced`, `ok` and `error`.

**Typical run:** about 576 items, 5–6 API calls, 8–12 seconds.

### monday.com API details

- Endpoint `https://api.monday.com/v2`, POST, header `Authorization: <MONDAY_API_TOKEN>`. An optional `API-Version` header comes from `MONDAY_API_VERSION`; if it's not set, monday uses its current default.
- **Complexity budget:** if a response mentions "Complexity budget exhausted", the sync waits **60 seconds** and retries **once**. A second failure fails the run.
- GraphQL errors, HTTP errors and responses that aren't JSON all fail the run with the message saved in `sync_runs.error`.
- The token has write permission on monday, but **the app only reads**.

### Triggers

| Trigger | How |
|---|---|
| Every 15 minutes | Vercel Cron (`vercel.json`: `"*/15 * * * *"`) calls `GET /api/sync` with `Authorization: Bearer <CRON_SECRET>`. It needs the Vercel **Pro** plan, since Hobby only allows daily crons. |
| Manual | The **Refresh now** button calls a Server Action (`src/app/actions.ts`) that checks the user's session, runs the same sync, and reloads the page data. |
| Local and CLI | `npm run sync` (writes), `npm run sync -- --dry-run` (reads monday only), `npm run counts`, `npm run check:metrics` |

`/api/sync` accepts GET and POST and returns **401** unless the header is exactly `Bearer <CRON_SECRET>` (compared in constant time). The route's `maxDuration` is 300 s, enough for a full run plus one 60-second retry.

---

## 6. The page, section by section

One page, from top to bottom. It's server-rendered and refetches its data every 5 minutes (`AutoRefresh`, using `router.refresh()`), so a wall TV stays current.

| # | Section | Shows | Data source | Date filter? | Company and assignee filters? |
|---|---|---|---|---|---|
| 1 | **Header** | Title, "Last synced {date, time} PT ({x} min ago)", and a red note if the latest sync failed. Buttons: **Refresh now**, **theme toggle** (moon/sun), **Sign out** | `sync_runs` (latest `ok = true`, plus the latest run overall) | – | – |
| 2 | **Filter bar** | Date-range picker, Company picker, Assigned to picker, **Reset** link (shown only when something differs from the defaults), "Updating…" spinner while loading | Options come from the companies and assignees found in `v_completed_performance` | – | – |
| 3 | **KPI cards** (5) | See the KPI table below. A caption above them says which period the completions cover and that Overdue now is as of today. | `completed_performance_summary` and `v_open_items` | Yes (first 4 cards) | Yes |
| 4 | **On time vs late, by month completed** | Stacked columns (Early at the bottom, then On Time, then Late), **always 6 bars**: the current month plus the 5 before it, with empty months shown at 0. The total is on top of each bar; hovering or focusing a bar shows a tooltip with the counts and on-time rate. | `completed_performance_breakdown('month')` with a fixed 6-month window | **No** (always the last 6 months) | Yes |
| 5 | **Overdue items over time** | Line and soft area of the daily overdue count, with the latest value labeled. With few points it notes that the trend builds day by day. | `daily_snapshots` | Yes | **No** (always all companies) |
| 6 | **Late completions by company** | Horizontal bars of the Late count, top 8 companies, plus "No company" (muted) and a note "N more with X late in total" | `completed_performance_breakdown('company')` | Yes | Yes |
| 7 | **Late completions by assignee** | Same layout, "Unassigned" muted | `completed_performance_breakdown('assignee')` | Yes | Yes |
| 8 | **Overdue now (N)** table | Item (link to monday), due date, days overdue, assigned to, company, priority. Sorted by most days overdue. If there are none: "Nothing is overdue. Items are marked Overdue by the nightly check at 12:05 AM PT." | `v_open_items` where `report = 'Overdue'` | **No** (always today) | Yes |
| 9 | **Completions (N)** table | Item (link), Report label (colored dot plus text), days late (Late only), due date, completed (date and time PT), assigned to, company. Newest first, scrolls inside the card. | `v_completed_performance` filtered by `completed_date_pt` | Yes | Yes |
| 10 | **Footer** | A plain-language summary of the definitions and which filters apply to what | – | – | – |

Every chart has a **"Show data table"** toggle underneath, so no value depends only on hovering or on color.

### KPI cards

| Card | Big number | Small line under it | Accent bar |
|---|---|---|---|
| Completed on time | Early + On Time | "{Early} Early · {On Time} On Time" | On Time green |
| Completed late | Late | "of {population} rated completions" | Late red |
| On-time rate | e.g. 53.8% | "Early + On Time, of all rated completions" | none |
| Avg days late | e.g. 1.8 | "Median {m} · Max {max}" | none |
| Overdue now | count | "{open} open · {due today} due today · {no due date} no due date" | Overdue red |

Card titles are **bold**. Numbers show "—" when there's nothing to calculate (for example, the average with no Late items).

---

## 7. Filters

Filters live in the **URL**, so any view can be bookmarked or left open on a TV. Changing a filter navigates without a full page reload.

| URL parameter | Values |
|---|---|
| `range` | `today`, `yesterday`, `this_week`, `last_week`, `this_month` (default; omitted from the URL), `last_month`, `30d`, `6m`, `all`, `custom` |
| `from`, `to` | `YYYY-MM-DD`, only read when `range=custom`. If they're reversed, they're swapped. Invalid values are ignored. |
| `company` | Exact company label |
| `assignee` | Exact person name |

### Date presets (all inclusive, computed from **today in Pacific time**)

| Preset | From | To |
|---|---|---|
| Today | today | today |
| Yesterday | today − 1 | today − 1 |
| This week | Monday of this week | today |
| Last week | Monday of last week | Sunday of last week |
| This month *(default)* | 1st of this month | today |
| Last month | 1st of last month | last day of last month |
| Last 30 days | today − 29 | today |
| Last 6 months | 1st of the month 5 months ago | today (same window as the monthly chart) |
| All time | no limit | no limit |
| Custom | picked on the calendar | picked on the calendar |

### Controls

- **Date-range picker:** a button showing the preset name and the resolved dates (e.g. "THIS MONTH · Sep 1 – Sep 22, 2026"). It opens a panel with the preset rows (a check mark on the selected one) on the left and a calendar on the right.
  - Weeks in the calendar start on Monday. Future days are disabled, and today is marked with a dot.
  - Click a start day, then an end day; the range previews on hover. **Apply** confirms it and **Cancel** closes the panel.
  - On a phone, the presets and calendar stack vertically.
- **Company and Assigned to pickers:** custom dropdowns. The first row clears the filter ("Any company", "Anyone"). Lists with more than 8 options get a search box.
  - Keyboard: ↑/↓ to move, Enter to pick, Esc to close. Clicking outside closes them.
  - Note: "All Companies" is a **real company value** on the board. That's why the clear option is labeled "Any company".
- **Reset:** goes back to the defaults (This month, any company, anyone).

---

## 8. Look and feel

### Themes

- **Light theme is the default** for everyone, even when the computer is set to dark mode.
- The moon/sun button switches instantly and saves the choice in a `theme` cookie (`light` or `dark`, one year). The server reads that cookie and sets `<html data-theme>`, so the page never flashes the wrong theme.
- Colors are CSS variables in `src/app/globals.css`, exposed to Tailwind as utilities (`bg-surface-1`, `text-ink-2`, `bg-late` and so on).

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--surface-0` | `#f4f6f9` | `#0f1115` | Page background |
| `--surface-1` | `#ffffff` | `#171a20` | Cards |
| `--surface-2` | `#ffffff` | `#1f232b` | Inputs, popovers |
| `--line` | `#e2e6ec` | `#2c313b` | Borders |
| `--grid` | `#eceff3` | `#2a2e37` | Chart gridlines |
| `--ink-1` / `--ink-2` / `--ink-3` | `#111827` / `#4b5563` / `#5f6673` | `#f4f5f7` / `#b4b9c4` / `#8a909c` | Primary, secondary and muted text |
| `--accent` / `--on-accent` | `#0873b5` / `#ffffff` | `#66ccff` / `#0f1115` | Focus, selection, buttons |
| `--danger` | `#c62839` | `#ff6b81` | Error text |
| `--hover` | 5% ink | 5% white | Hover wash |

### Report label colors (fixed; the same in both themes)

| Label | Color |
|---|---|
| Early | `#66ccff` |
| On Time | `#9cd326` |
| Overdue | `#df2f4a` |
| Late | `#bb3354` |

These colors are used only for **marks** (bars, dots, accent strips), never for text. Labels next to them use the normal text colors.

### Layout and chart rules

- Max width 1920 px. The KPI row has 5 columns on large screens, 2 on tablets and 1 on phones. At 2200 px and wider (TVs), the base font grows to 20 px.
- Charts are plain HTML and SVG drawn on the server; there's no chart library. They follow these rules:
  - Thin bars with a 2 px gap between stacked segments, and a rounded top only on the topmost segment.
  - Hairline, solid gridlines; one y-axis with round tick numbers.
  - A legend whenever there are two or more series.
  - Tooltips work on keyboard focus as well as hover, and every chart has a data-table view.
- Font: Geist (sans).
- Favicon: an eye icon (`src/app/icon.svg`, a light-blue eye on a dark rounded square).

---

## 9. Access control

**Current setup:** one shared dashboard password, checked by the app itself.

- The password is in the `DASHBOARD_PASSWORD` environment variable. It's never in the code or the repo.
- `src/proxy.ts` (Next.js 16's renamed middleware) sends every request without a valid session cookie to `/login`. The exceptions are `/login`, `/api/sync` (which has its own `CRON_SECRET` check), static files and the favicon.
- Login sets `coastal_session`, an **HMAC-SHA256 of a fixed label, keyed by the password**. The cookie is httpOnly, secure in production, SameSite=Lax and lasts 30 days. Changing the password signs everyone out.
  - A wrong password waits about 0.8 seconds before it can be retried.
  - After login, the user is redirected to the page they were going to (same-site paths only).
- **Server Actions check the session themselves** ("Refresh now", for example), because anyone can call them with a direct POST.

**When you move this into the main dashboard, replace this whole mechanism with the main dashboard's own login.** See section 12.

---

## 10. Environment variables

| Name | Server only? | Purpose |
|---|---|---|
| `MONDAY_API_TOKEN` | Yes | monday.com API token (read-only use) |
| `SUPABASE_URL` | – | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Service-role key; never expose to the browser or prefix with `NEXT_PUBLIC_` |
| `CRON_SECRET` | Yes | Bearer token for `/api/sync` (Vercel Cron sends it automatically) |
| `DASHBOARD_PASSWORD` | Yes | Shared login password (not needed if the host app handles login) |
| `MONDAY_API_VERSION` | Yes | Optional; pins the monday API version |

`.env.example` lists them. Local development reads `.env.local`, which git ignores.

---

## 11. File map

```
src/
  app/
    page.tsx                 The dashboard page (Server Component); lays out every section
    actions.ts               "Refresh now" Server Action (session check → sync → revalidate)
    layout.tsx               <html data-theme> from the theme cookie, fonts, metadata
    globals.css              Theme tokens (light and dark), Tailwind theme mapping
    icon.svg                 Eye favicon
    api/sync/route.ts        GET/POST /api/sync for Vercel Cron (CRON_SECRET)
    login/                   Password login page, form and actions (login/logout)
  proxy.ts                   Redirects signed-out requests to /login
  components/
    KpiCards.tsx             The 5 KPI cards
    Card.tsx                 Card shell and the "Show data table" toggle
    Tables.tsx               OverdueTable, CompletionsTable
    ReportLabel.tsx          Colored dot + label; legend swatch
    FilterBar.tsx            Filter row; pushes URL changes
    filters/                 DateRangePicker, Listbox (searchable dropdown), popover helpers and icons
    charts/                  MonthlyChart, OverdueTrend, LateBars, scale (nice axis ticks)
    RefreshButton.tsx        Calls the refresh action and shows the result
    ThemeToggle.tsx          Light/dark switch (cookie)
    AutoRefresh.tsx          router.refresh() every 5 minutes
  lib/
    config.ts                Board, group and column IDs, test-item rule, monday URL
    time.ts                  Pacific-time date helpers, activity-log timestamp conversion
    format.ts                Date, number and percent formatting (Pacific time)
    dashboard/filters.ts     Presets, URL parsing, date math, 6-month window
    dashboard/data.ts        Loads everything the page needs from Supabase in parallel
    monday/client.ts         GraphQL client with the complexity-budget retry
    monday/items.ts          Group items with cursor pagination
    monday/activityLog.ts    Status history → completed_at
    sync/runSync.ts          The sync run (storage is pluggable)
    sync/transform.ts        monday item → monday_items row
    sync/supabaseStore.ts    Storage implementation for Supabase
    sync/index.ts            runSyncFromEnv(): wires the real services from environment variables
    sync/auth.ts             Bearer-token check for /api/sync
    supabase/admin.ts        Service-role Supabase client
    session.ts, auth.ts      Password session (HMAC cookie)
    theme.ts                 Theme cookie helpers
supabase/
  migrations/                The two SQL migrations (Appendix A)
  queries/verify_counts.sql  Count check to paste into the SQL editor
scripts/                     sync.ts, verify-counts.ts, check-metrics.ts
tests/                       Vitest suites and fixtures (86 tests)
vercel.json                  Cron: /api/sync every 15 minutes
```

---

## 12. Porting into another dashboard

The goal is to run this as a page, such as `/it-performance`, inside the main dashboard. Most of the code moves over unchanged; the parts to adapt are listed below.

### Keep as-is

- **The Supabase schema and SQL** (Appendix A). Either keep using the same Supabase project, which is simplest because the data is already there and verified, or run both migrations on the main dashboard's database.
- **The sync logic** (`lib/monday/*`, `lib/sync/*`, `lib/time.ts`, `lib/config.ts`) and its tests.
- **The data loading, filters, charts, tables and KPI cards** (`lib/dashboard/*`, `lib/format.ts`, `components/*`).

### Change

| Area | What to do |
|---|---|
| **Page route** | Move `src/app/page.tsx` to the new route (e.g. `app/it-performance/page.tsx`). |
| **Filter URLs** | `filtersToQuery()` in `lib/dashboard/filters.ts` builds `"/"` and `"/?…"`, and the **Reset** link in `FilterBar.tsx` points to `"/"`. Change both to the new route (e.g. `"/it-performance?…"`). |
| **Refresh action** | In `app/actions.ts`, change `revalidatePath("/")` to the new route. Keep `export const maxDuration = 300` on the page, because the Server Action runs inside it. |
| **Login** | Delete `app/login/*`, `lib/session.ts`, `proxy.ts` and `DASHBOARD_PASSWORD`. In `app/actions.ts`, replace `isSignedIn()` with the main dashboard's session check. **Keep an auth check inside the Server Action**, because it can be called directly. Protect the page with the main dashboard's own login. |
| **Header** | Drop "Sign out", since the main dashboard owns that. Keep "Last synced" and "Refresh now". Keep the theme toggle only if the main dashboard doesn't already have one. |
| **Theme** | If the main dashboard has a theme system, map these tokens onto it: `surface-0/1/2`, `line`, `grid`, `ink-1/2/3`, `accent`, `on-accent`, `danger`, `hover`, `pop`, plus the four Report colors. Otherwise copy the `:root` and `[data-theme="dark"]` blocks and the `@theme inline` mapping from `globals.css` (Tailwind 4 syntax). |
| **Layout** | The page assumes it's the whole screen (`max-w-[1920px]`, its own `<h1>`). Inside another layout, reduce the outer padding and let the host provide the page title if it has one. |
| **Cron** | Add the `crons` entry from `vercel.json` to the main project (path changes if the API route moves). Set `CRON_SECRET` in that Vercel project. **Only one app should run the sync**, so turn off the cron in the old app once the new one is live. |
| **Environment variables** | Add `MONDAY_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` to the main project, all server-only. |
| **Dependencies** | `@supabase/supabase-js`, `server-only`. Dev: `vitest`, `tsx`. No chart library is needed. |

### If the main dashboard isn't Next.js 16

- `proxy.ts` is Next 16's name for `middleware.ts`.
- `searchParams` and `cookies()` are **async** (awaited) in Next 15 and later.
- `PageProps<"/">` and `LayoutProps` are generated types; replace them with plain prop types if needed.
- Server Actions (`"use server"`) and `useActionState` are React 19 features.
- For a non-Next host, move the data loading (`getDashboardData`) and the sync into an API layer, keep the SQL as-is, and rebuild the components in the host's framework. The behavior in sections 6–8 is the spec.

### Porting checklist

- [ ] Database: reuse the existing Supabase project, or run both migrations on the new one.
- [ ] Environment variables are set as server-only in the main project.
- [ ] The page renders at the new route, and the filters change the URL of that route.
- [ ] "Refresh now" works and is protected by the main dashboard's login.
- [ ] The cron runs every 15 minutes on exactly one app; check for new rows in `sync_runs`.
- [ ] `npm run check:metrics` passes against the database the page reads from.
- [ ] The numbers match the old app for the same filters (section 13).
- [ ] The old app's cron is turned off (and the old app retired) once the new page is confirmed.

---

## 13. Verification and tests

### Baseline numbers (verified Sept 22, 2026, against the live board)

| Check | Value |
|---|---|
| Items synced | 576 (To Do – Coastal 28, Completed 548) |
| Rated completions, excluding test items (all time) | **302**: 43 Early, 89 On Time, 170 Late |
| Test items excluded from the rated completions | 4 (`[TEST – ignore] Early / On Time / Late`, `Other - Jessa Test`) |
| Sum of Days Delayed, real Late items | 1,140 |
| On-time rate (all time) | 43.7% |
| Avg / median / max days late (all time) | 6.71 / 2 / 178 |
| Rated completions with a `completed_at` | 302 of 302 (history goes back to Oct 2024) |
| This month, Sept 1–22 | 21 on time (12 Early, 9 On Time), 18 late, 53.8% |

These numbers change as the team completes items. Compare the two apps with the same filters at the same time.

### Automated checks

- `npm test` runs **86 Vitest tests** on fixture data, with no network. They cover:
  - pagination and cursor handling;
  - activity-log parsing (reopen and recomplete, done-to-done relabels, bad JSON, other columns);
  - Pacific-time math across daylight-saving changes, month ends and year ends;
  - the 60-second retry;
  - column parsing;
  - stale-row deletion and the empty-read guard;
  - snapshot failure handling;
  - `/api/sync` authentication;
  - the test-item rule;
  - every date preset;
  - the login session;
  - formatting.
- `npm run check:metrics` recalculates every KPI and breakdown in TypeScript from the raw rows and compares it with the SQL output: 197 checks across 7 filter combinations.
- `npm run typecheck` and `npm run lint`.

---

## 14. Known quirks and decisions

- **Assignee data is sparse** in older items. For example, 144 of 170 Late items all time have no assignee, so "Unassigned" dominates the assignee chart. Newer items are assigned consistently.
- **About 27% of rated completions have no Company** (83 of 302 all time). They show as "No company".
- **Items with several companies or assignees count under each**, so breakdown rows can add up to more than the total.
- **"All Companies" is a real company label** on the board, not a UI option.
- **Overdue now only changes after the nightly n8n job** (12:05 AM PT). "Refresh now" shows the board as it is; it doesn't mark anything Overdue.
- **The overdue trend began on Sept 22, 2026** (first snapshot) and grows by one point per day.
- **Early and On Time colors are faint in light mode** (about 1.8:1 contrast on white). They're fixed by the spec, so every chart also shows totals, a legend and a data-table view.
- **Supabase SQL editor:** paste a whole migration into a fresh query tab with nothing highlighted. Running a highlighted part gives "syntax error at end of input".
- **monday activity-log history** is limited by the account's plan. The sync keeps previously stored `completed_at` values if old events disappear.

---

## Appendix A: SQL migrations (verbatim)

Run these in order in the Supabase SQL editor (paste each whole file into a fresh tab, nothing highlighted), or with `supabase db push`.

### `supabase/migrations/20260922000000_initial_schema.sql`

```sql
-- Phase 1: base tables for the Coastal IT dashboard.
-- monday_items mirrors the two monday.com groups we report on; sync_runs logs
-- every /api/sync run; daily_snapshots feeds the overdue trend chart.

create table if not exists public.monday_items (
  item_id           bigint primary key,
  name              text not null,
  group_id          text not null,
  group_title       text,
  status            text,
  due_date          date,
  report            text,          -- Early | On Time | Overdue | Late | null
  days_delayed      integer,
  completed_at      timestamptz,   -- from activity log; null if unknown
  company           text[],
  priority          text,
  assignees         text[],
  monday_updated_at timestamptz,
  synced_at         timestamptz not null default now()
);

create index if not exists monday_items_group_report_idx
  on public.monday_items (group_id, report);
create index if not exists monday_items_completed_at_idx
  on public.monday_items (completed_at);

create table if not exists public.sync_runs (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  items_synced integer,
  ok           boolean,
  error        text
);

create index if not exists sync_runs_started_at_idx
  on public.sync_runs (started_at desc);

create table if not exists public.daily_snapshots (
  snapshot_date     date primary key,
  overdue_count     integer,
  open_count        integer,
  completed_on_time integer,
  completed_late    integer
);

-- RLS on, with no policies: anon and authenticated roles can read nothing.
-- Only the server (service-role key, which bypasses RLS) touches these tables.
alter table public.monday_items    enable row level security;
alter table public.sync_runs       enable row level security;
alter table public.daily_snapshots enable row level security;
```

### `supabase/migrations/20260922010000_metric_views.sql`

```sql
-- Phase 3: metric logic in SQL, so every screen computes numbers the same way.
-- Definitions: CLAUDE.md "Metrics". All dates are Pacific time.
--
-- Views use security_invoker, so they respect RLS on monday_items: anon and
-- authenticated see nothing; the server's service-role key sees everything.
-- Functions are revoked from anon/authenticated for the same reason.

-- Today's date in Pacific time.
create or replace function public.pt_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;

-- True for test items: a word starting with "test", any case.
-- Matches "[TEST - ignore] Late", "Other - Jessa Test", "testing";
-- not "latest" or "contest". Keep in sync with TEST_ITEM_REGEX in src/lib/config.ts.
create or replace function public.is_test_item(item_name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(item_name ~* '\mtest', false)
$$;

-- ---------------------------------------------------------------------------
-- Completed performance: one row per item in the population.
-- Population: Completed group, Report in (Early, On Time, Late), not a test item.
-- ---------------------------------------------------------------------------
create or replace view public.v_completed_performance
with (security_invoker = true)
as
select
  i.item_id,
  i.name,
  i.report,
  i.report in ('Early', 'On Time')                                          as is_on_time,
  i.days_delayed,
  i.due_date,
  i.completed_at,
  (i.completed_at at time zone 'America/Los_Angeles')::date                 as completed_date_pt,
  date_trunc('month', i.completed_at at time zone 'America/Los_Angeles')::date as completed_month_pt,
  coalesce(i.company, '{}')                                                 as company,
  coalesce(i.assignees, '{}')                                               as assignees,
  i.priority,
  'https://quickstarthealth.monday.com/boards/7364661326/pulses/' || i.item_id as monday_url
from public.monday_items i
where i.group_id = 'group_title'
  and i.report in ('Early', 'On Time', 'Late')
  and not public.is_test_item(i.name);

-- ---------------------------------------------------------------------------
-- Open work (To Do - Coastal), excluding test items.
-- ---------------------------------------------------------------------------
create or replace view public.v_open_items
with (security_invoker = true)
as
select
  i.item_id,
  i.name,
  i.status,
  i.report,
  i.due_date,
  case when i.due_date is not null then public.pt_today() - i.due_date end as days_past_due,
  coalesce(i.company, '{}')   as company,
  coalesce(i.assignees, '{}') as assignees,
  i.priority,
  'https://quickstarthealth.monday.com/boards/7364661326/pulses/' || i.item_id as monday_url
from public.monday_items i
where i.group_id = 'new_group60142'
  and not public.is_test_item(i.name);

-- Overdue now: To Do - Coastal items with Report = Overdue.
-- days_overdue = today (PT) - due date.
create or replace view public.v_overdue_now
with (security_invoker = true)
as
select
  item_id,
  name,
  due_date,
  days_past_due as days_overdue,
  assignees,
  company,
  priority,
  status,
  monday_url
from public.v_open_items
where report = 'Overdue';

-- Open-work KPI row.
create or replace view public.v_open_work_summary
with (security_invoker = true)
as
select
  count(*)                                           as open_total,
  count(*) filter (where report = 'Overdue')         as overdue_now,
  count(*) filter (where due_date = public.pt_today()) as due_today,
  count(*) filter (where due_date is null)           as no_due_date,
  public.pt_today()                                  as as_of_date_pt
from public.v_open_items;

-- Rated completions from the last 30 days (PT), newest first.
create or replace view public.v_recent_completions
with (security_invoker = true)
as
select *
from public.v_completed_performance
where completed_date_pt >= public.pt_today() - 30
order by completed_at desc;

-- ---------------------------------------------------------------------------
-- Filtered completed-performance KPIs. All filters are optional (null = all).
--   p_from / p_to: inclusive PT dates on completed_at. When set, items without
--                  a completed_at are left out.
--   p_company / p_assignee: item must have this value in its array.
-- ---------------------------------------------------------------------------
create or replace function public.completed_performance_summary(
  p_from date default null,
  p_to date default null,
  p_company text default null,
  p_assignee text default null
)
returns table (
  population        bigint,
  early             bigint,
  on_time           bigint,
  completed_on_time bigint,
  completed_late    bigint,
  on_time_rate      numeric,
  avg_days_late     numeric,
  median_days_late  numeric,
  max_days_late     integer
)
language sql
stable
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where report = 'Early'),
    count(*) filter (where report = 'On Time'),
    count(*) filter (where is_on_time),
    count(*) filter (where report = 'Late'),
    round(count(*) filter (where is_on_time)::numeric / nullif(count(*), 0), 4),
    round(avg(days_delayed) filter (where report = 'Late'), 2),
    (percentile_cont(0.5) within group (order by days_delayed)
       filter (where report = 'Late'))::numeric,
    max(days_delayed) filter (where report = 'Late')
  from public.v_completed_performance
  where (p_from is null or completed_date_pt >= p_from)
    and (p_to is null or completed_date_pt <= p_to)
    and (p_company is null or p_company = any (company))
    and (p_assignee is null or p_assignee = any (assignees))
$$;

-- Breakdown of the same KPIs by 'month', 'company' or 'assignee'.
-- An item with several companies/assignees counts once under each; items with
-- none are grouped under '(none)'. Month keys are 'YYYY-MM' (PT); items with no
-- completed_at are grouped under '(unknown)'.
create or replace function public.completed_performance_breakdown(
  p_dimension text,
  p_from date default null,
  p_to date default null,
  p_company text default null,
  p_assignee text default null
)
returns table (
  key               text,
  population        bigint,
  early             bigint,
  on_time           bigint,
  completed_on_time bigint,
  completed_late    bigint,
  on_time_rate      numeric,
  avg_days_late     numeric,
  median_days_late  numeric,
  max_days_late     integer
)
language plpgsql
stable
set search_path = public
as $$
begin
  if p_dimension not in ('month', 'company', 'assignee') then
    raise exception 'p_dimension must be month, company or assignee (got %)', p_dimension;
  end if;

  return query
  with filtered as (
    select *
    from public.v_completed_performance v
    where (p_from is null or v.completed_date_pt >= p_from)
      and (p_to is null or v.completed_date_pt <= p_to)
      and (p_company is null or p_company = any (v.company))
      and (p_assignee is null or p_assignee = any (v.assignees))
  ),
  keyed as (
    select coalesce(to_char(f.completed_month_pt, 'YYYY-MM'), '(unknown)') as k, f.*
    from filtered f
    where p_dimension = 'month'
    union all
    select coalesce(c.val, '(none)'), f.*
    from filtered f
    left join lateral unnest(f.company) as c(val) on true
    where p_dimension = 'company'
    union all
    select coalesce(a.val, '(none)'), f.*
    from filtered f
    left join lateral unnest(f.assignees) as a(val) on true
    where p_dimension = 'assignee'
  )
  select
    k,
    count(*),
    count(*) filter (where report = 'Early'),
    count(*) filter (where report = 'On Time'),
    count(*) filter (where is_on_time),
    count(*) filter (where report = 'Late'),
    round(count(*) filter (where is_on_time)::numeric / nullif(count(*), 0), 4),
    round(avg(days_delayed) filter (where report = 'Late'), 2),
    (percentile_cont(0.5) within group (order by days_delayed)
       filter (where report = 'Late'))::numeric,
    max(days_delayed) filter (where report = 'Late')
  from keyed
  group by k
  order by k;
end;
$$;

-- Records today's (PT) counts in daily_snapshots for the overdue trend chart.
-- Called after every sync; the last sync of the day wins.
create or replace function public.take_daily_snapshot()
returns public.daily_snapshots
language sql
volatile
set search_path = public
as $$
  insert into public.daily_snapshots as d
    (snapshot_date, overdue_count, open_count, completed_on_time, completed_late)
  select
    public.pt_today(),
    o.overdue_now,
    o.open_total,
    c.completed_on_time,
    c.completed_late
  from public.v_open_work_summary o
  cross join public.completed_performance_summary() c
  on conflict (snapshot_date) do update set
    overdue_count     = excluded.overdue_count,
    open_count        = excluded.open_count,
    completed_on_time = excluded.completed_on_time,
    completed_late    = excluded.completed_late
  returning d.*
$$;

-- Lock everything down to the server (service_role).
revoke all on public.v_completed_performance, public.v_open_items, public.v_overdue_now,
  public.v_open_work_summary, public.v_recent_completions
  from public, anon, authenticated;

revoke execute on function
  public.pt_today(),
  public.is_test_item(text),
  public.completed_performance_summary(date, date, text, text),
  public.completed_performance_breakdown(text, date, date, text, text),
  public.take_daily_snapshot()
  from public, anon, authenticated;

grant select on public.v_completed_performance, public.v_open_items, public.v_overdue_now,
  public.v_open_work_summary, public.v_recent_completions
  to service_role;

grant execute on function
  public.pt_today(),
  public.is_test_item(text),
  public.completed_performance_summary(date, date, text, text),
  public.completed_performance_breakdown(text, date, date, text, text),
  public.take_daily_snapshot()
  to service_role;
```

## Appendix B: monday.com GraphQL queries (verbatim)

Sent as `POST https://api.monday.com/v2` with `{ query, variables }`. Variables used by the sync: `boardId: ["7364661326"]`, `groupId: ["new_group60142"]` then `["group_title"]`, `limit: 500`, `columnIds: ["status", "date__1", "color_mm7egxa", "numeric_mm7ej9gp", "dropdown", "status_1", "multiple_person_mm65hfg8"]`. For the activity log: `columnIds: ["status"]`, `page: 1, 2, …` until a page returns fewer than 500 entries.

### First page of a group

```graphql
query GroupItems($boardId: [ID!], $groupId: [String], $limit: Int!, $columnIds: [String!]) {
  boards(ids: $boardId) {
    groups(ids: $groupId) {
      id
      title
      items_page(limit: $limit) {
        cursor
        items { 
  id
  name
  updated_at
  group { id title }
  column_values(ids: $columnIds) {
    id
    text
    value
    ... on DropdownValue { values { label } }
  }
 }
      }
    }
  }
}
```

### Next pages (cursor)

```graphql
query NextItems($cursor: String!, $limit: Int!, $columnIds: [String!]) {
  next_items_page(cursor: $cursor, limit: $limit) {
    cursor
    items { 
  id
  name
  updated_at
  group { id title }
  column_values(ids: $columnIds) {
    id
    text
    value
    ... on DropdownValue { values { label } }
  }
 }
  }
}
```

### Status activity log (one page)

```graphql
query StatusLog($boardId: [ID!], $columnIds: [String], $limit: Int!, $page: Int!) {
  boards(ids: $boardId) {
    activity_logs(column_ids: $columnIds, limit: $limit, page: $page) {
      id
      event
      created_at
      data
    }
  }
}
```

### Activity-log entry shape (the `data` field is a JSON string)

```json
{ "pulse_id": 7390000001, "column_id": "status",
  "value":          { "label": { "index": 1, "text": "Completed",     "is_done": true  } },
  "previous_value": { "label": { "index": 0, "text": "Working on it", "is_done": false } } }
```

`created_at` example: `"17891280000000000"` → 17891280000000000 ÷ 10,000 = 1789128000000 ms → 2026-09-11T12:00:00Z.

