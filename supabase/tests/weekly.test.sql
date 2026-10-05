begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select is((select count(*)::int from cron.job where jobname = 'weekly-summary' and schedule = '*/30 * * * *'), 1, 'the weekly check runs every half hour');

-- The next Monday 09:10 in India (the default time zone).
create function pg_temp.monday() returns timestamptz language sql stable as $$
  select t from (
    select (((now() at time zone 'Asia/Kolkata')::date + d) + time '09:10') at time zone 'Asia/Kolkata' as t
    from generate_series(0, 7) d) x
  where t > now() and extract(isodow from t at time zone 'Asia/Kolkata') = 1
  order by t limit 1 $$;
create function pg_temp.mine() returns setof public.jobs language sql as $$
  select * from public.jobs where payload ->> 'event' = 'weekly' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000f_' $$;

-- Gia wants the summary and has an open comment; Hal wants it but his project is empty; Ivy did not ask.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'gia@studio.test', '{"name":"Gia"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'hal@studio.test', '{"name":"Hal"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f3', 'ivy@studio.test', '{"name":"Ivy"}', 'authenticated', 'authenticated');
insert into public.notification_prefs (user_id, weekly_summary) values
  ('00000000-0000-0000-0000-0000000000f1', true),
  ('00000000-0000-0000-0000-0000000000f2', true);
insert into public.projects (id, workspace_id, name, created_by)
select ('10000000-0000-0000-0000-0000000000f' || right(user_id::text, 1))::uuid, workspace_id, 'Site', user_id
from public.workspace_members where user_id::text like '00000000-0000-0000-0000-0000000000f_';
insert into public.pages (id, project_id, url)
select ('20000000-0000-0000-0000-0000000000f' || right(id::text, 1))::uuid, id, 'https://client.test/' from public.projects where id::text like '10000000-0000-0000-0000-0000000000f_';
insert into public.comments (project_id, page_id, author_user_id, author_name, body, pin, created_at) values
  ('10000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Gia', 'Open for a month', '{"x":0.5,"y":0.2}', now() - interval '30 days'),
  ('10000000-0000-0000-0000-0000000000f3', '20000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f3', 'Ivy', 'Open too', '{"x":0.5,"y":0.2}', now());

do $$ begin perform public.queue_weekly_summaries(pg_temp.monday()); end $$;
select results_eq($$ select payload ->> 'user_id' from pg_temp.mine() $$, $$ values ('00000000-0000-0000-0000-0000000000f1') $$,
  'on Monday morning one summary is queued: for the member who asked and has something open');
select ok((select (payload ->> 'since')::timestamptz = pg_temp.monday() - interval '7 days' from pg_temp.mine()), 'it covers the last seven days');

do $$ begin perform public.queue_weekly_summaries(pg_temp.monday()); end $$;
select is((select count(*)::int from pg_temp.mine()), 1, 'once per week, however often the check runs');

delete from public.jobs where id in (select id from pg_temp.mine());
do $$ begin perform public.queue_weekly_summaries(pg_temp.monday() + interval '1 day'); end $$;
select is((select count(*)::int from pg_temp.mine()), 0, 'nothing on a Tuesday');
do $$ begin perform public.queue_weekly_summaries(pg_temp.monday() + interval '3 hours'); end $$;
select is((select count(*)::int from pg_temp.mine()), 0, 'nothing on Monday afternoon');

set local role authenticated;
select throws_ok($$ select public.queue_weekly_summaries() $$, '42501', null, 'signed-in users cannot trigger summaries');
reset role;

select * from finish();
rollback;
