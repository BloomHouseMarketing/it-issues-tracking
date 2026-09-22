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
