-- Paste into the Supabase SQL editor after a sync to check counts.
-- Expected (CLAUDE.md): Completed with Report ~302 real (43 Early, 89 On Time, 170 Late)
-- plus 3 [TEST items; To Do - Coastal ~30 items.

select group_id,
       coalesce(report, '(blank)')      as report,
       count(*) filter (where name not like '[TEST%') as real_items,
       count(*) filter (where name like '[TEST%')     as test_items,
       count(completed_at) filter (where name not like '[TEST%') as real_with_completed_at
from monday_items
group by 1, 2
order by 1, 2;

select * from sync_runs order by started_at desc limit 5;
