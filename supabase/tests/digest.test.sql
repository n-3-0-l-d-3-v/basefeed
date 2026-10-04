begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select is((select count(*)::int from cron.job where jobname = 'daily-digest' and schedule = '*/30 * * * *'), 1, 'the digest check runs every half hour');

-- The next moment it is 09:10 in India (the default time zone).
create function pg_temp.nine() returns timestamptz language sql stable as $$
  select case when t > now() then t else t + interval '1 day' end
  from (select ((now() at time zone 'Asia/Kolkata')::date + time '09:10') at time zone 'Asia/Kolkata' as t) x $$;

-- Dana wants the digest, Eli wants an email per comment, Finn wants the digest but has nothing new.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'dana@studio.test', '{"name":"Dana"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'eli@studio.test', '{"name":"Eli"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d3', 'finn@studio.test', '{"name":"Finn"}', 'authenticated', 'authenticated');
insert into public.notification_prefs (user_id, daily_digest) values
  ('00000000-0000-0000-0000-0000000000d1', true),
  ('00000000-0000-0000-0000-0000000000d3', true);

-- They switched the digest on three days ago.
update public.notification_prefs set digest_since = now() - interval '3 days' where user_id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3');

insert into public.projects (id, workspace_id, name, created_by)
select ('10000000-0000-0000-0000-0000000000d' || right(user_id::text, 1))::uuid, workspace_id, 'Site', user_id
from public.workspace_members where user_id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d3');
insert into public.pages (id, project_id, url)
select ('20000000-0000-0000-0000-0000000000d' || right(id::text, 1))::uuid, id, 'https://client.test/' from public.projects where name = 'Site' and id::text like '10000000-0000-0000-0000-0000000000d%';
insert into public.guests (id, project_id, name, email)
select ('40000000-0000-0000-0000-0000000000d' || right(id::text, 1))::uuid, id, 'Priya', 'priya@client.test' from public.projects where id::text like '10000000-0000-0000-0000-0000000000d%';

-- A client comment for Dana and for Eli. Finn only has: his own comment, a page-check finding, and an old one.
insert into public.comments (project_id, page_id, author_guest_id, author_user_id, author_name, body, pin, context, created_at) values
  ('10000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000d1', null, 'Priya', 'Headline too long', '{"x":0.5,"y":0.2}', '{}', now()),
  ('10000000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-0000000000d2', null, 'Priya', 'Logo too small', '{"x":0.5,"y":0.2}', '{}', now()),
  ('10000000-0000-0000-0000-0000000000d3', '20000000-0000-0000-0000-0000000000d3', null, '00000000-0000-0000-0000-0000000000d3', 'Finn', 'My own note', '{"x":0.5,"y":0.2}', '{}', now()),
  ('10000000-0000-0000-0000-0000000000d3', '20000000-0000-0000-0000-0000000000d3', '40000000-0000-0000-0000-0000000000d3', null, 'Priya', 'Image has no alt text', '{"x":0.5,"y":0.2}', '{"qa":"alt"}', now()),
  ('10000000-0000-0000-0000-0000000000d3', '20000000-0000-0000-0000-0000000000d3', '40000000-0000-0000-0000-0000000000d3', null, 'Priya', 'Two days old', '{"x":0.5,"y":0.2}', '{}', now() - interval '2 days');

-- Counted for this test's members only, so the result does not depend on what else is in the database.
do $$ begin perform public.queue_daily_digests(pg_temp.nine()); end $$;
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'), 1,
  'one digest is queued: for the member who asked and has something new');
select is(
  (select payload ->> 'user_id' from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'),
  '00000000-0000-0000-0000-0000000000d1', 'it is for that member');
select ok(
  (select (payload ->> 'since')::timestamptz = pg_temp.nine() - interval '24 hours' from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'),
  'it covers the last 24 hours');
do $$ begin perform public.queue_daily_digests(pg_temp.nine()); end $$;
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'), 1, 'running it again the same day queues nothing more');

-- Own comments, page-check findings and comments older than a day do not make a digest.
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' = '00000000-0000-0000-0000-0000000000d3'), 0,
  'nothing new for a member means no digest and no email');

-- Switching "New comments" off switches the digest off too.
delete from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_';
update public.notification_prefs set new_comments = false where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin perform public.queue_daily_digests(pg_temp.nine()); end $$;
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'), 0, 'no digest for a member who turned new-comment emails off');

-- It is sent at 09:00 where the member is, and not at any other time of day.
update public.notification_prefs set new_comments = true where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin perform public.queue_daily_digests(pg_temp.nine() + interval '2 hours'); end $$;
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'), 0, 'outside 09:00 to 09:30 local time nothing is queued');
update public.notification_prefs set timezone = 'America/New_York' where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin perform public.queue_daily_digests(pg_temp.nine()); end $$;
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'), 0, '09:10 in India is not morning for a member in New York');
update public.notification_prefs set timezone = 'Not/AZone' where user_id = '00000000-0000-0000-0000-0000000000d1';
-- Switching the digest off and on again starts a new window: what was emailed before is not repeated.
update public.notification_prefs set daily_digest = false where user_id = '00000000-0000-0000-0000-0000000000d1';
update public.notification_prefs set daily_digest = true where user_id = '00000000-0000-0000-0000-0000000000d1';
update public.notification_prefs set digest_since = now() + interval '1 second' where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin perform public.queue_daily_digests(pg_temp.nine()); end $$;
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'), 0, 'comments from before the digest was switched on are not repeated in it');
update public.notification_prefs set digest_since = now() - interval '1 hour' where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin perform public.queue_daily_digests(pg_temp.nine()); end $$;
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'digest' and payload ->> 'user_id' like '00000000-0000-0000-0000-0000000000d_'), 1, 'an unknown time zone falls back to the default instead of failing');

set local role authenticated;
select throws_ok($$ select public.queue_daily_digests() $$, '42501', null, 'signed-in users cannot trigger digests');
reset role;

select * from finish();
rollback;
