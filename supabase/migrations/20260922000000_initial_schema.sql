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
