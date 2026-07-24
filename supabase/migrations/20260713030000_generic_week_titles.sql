update public.weekly_plans
set title = 'Week ' || week_number::text
where title is distinct from 'Week ' || week_number::text;
