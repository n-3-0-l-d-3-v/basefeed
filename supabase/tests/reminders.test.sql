begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is((select count(*)::int from cron.job where jobname = 'review-reminders' and schedule = '35 3 * * *'), 1, 'reminders are checked once a day');

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000000e1', 'eve@studio.test', '{"name":"Eve"}', 'authenticated', 'authenticated');
insert into public.projects (id, workspace_id, name, created_by)
select '10000000-0000-0000-0000-0000000000e1', workspace_id, 'Client site', user_id from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000e1';
insert into public.pages (id, project_id, url) values ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'https://client.test/');
insert into public.guests (id, project_id, name, email) values
  ('40000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'Priya', 'priya@client.test'),
  ('40000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1', 'Marcus', 'marcus@client.test');
insert into public.comments (id, project_id, page_id, author_guest_id, author_user_id, author_name, body, pin) values
  ('30000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000e1', null, 'Priya', 'Headline too long', '{"x":0.5,"y":0.2}'),
  ('30000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000e1', null, 'Priya', 'Logo too small', '{"x":0.1,"y":0.1}'),
  ('30000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000e2', null, 'Marcus', 'Footer link broken', '{"x":0.2,"y":0.2}'),
  ('30000000-0000-0000-0000-0000000000e4', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', null, '00000000-0000-0000-0000-0000000000e1', 'Eve', 'Internal note', '{"x":0.3,"y":0.3}'),
  ('30000000-0000-0000-0000-0000000000e5', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000e2', null, 'Marcus', 'Still open', '{"x":0.4,"y":0.4}');

-- The team resolves Priya's two, Marcus's first and their own note. Marcus's second stays open.
update public.comments set status = 'resolved' where id in (
  '30000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e2', '30000000-0000-0000-0000-0000000000e3', '30000000-0000-0000-0000-0000000000e4');

create function pg_temp.mine() returns setof public.jobs language sql as $$
  select * from public.jobs where payload ->> 'event' = 'review.reminder' and payload ->> 'project_id' = '10000000-0000-0000-0000-0000000000e1' $$;

do $$ begin perform public.queue_review_reminders(); end $$;
select is((select count(*)::int from pg_temp.mine()), 0, 'nobody is reminded before three days have passed');

-- Three days later. (alter the resolve time directly; triggers would reset it.)
alter table public.comments disable trigger user;
update public.comments set resolved_at = now() - interval '3 days 1 hour' where project_id = '10000000-0000-0000-0000-0000000000e1' and status = 'resolved';
alter table public.comments enable trigger user;

do $$ begin perform public.queue_review_reminders(); end $$;
select is((select count(*)::int from pg_temp.mine()), 2, 'one reminder per client, however many of their comments are waiting');
select results_eq(
  $$ select payload ->> 'guest_id' from pg_temp.mine() order by 1 $$,
  $$ values ('40000000-0000-0000-0000-0000000000e1'), ('40000000-0000-0000-0000-0000000000e2') $$,
  'for the two clients with something waiting');
select is(
  (select count(*)::int from public.activity where action = 'client.reminded' and actor_name = 'Reminder' and project_id = '10000000-0000-0000-0000-0000000000e1'), 3,
  'each waiting comment gets a history entry; the team''s own and the open one do not');

delete from public.jobs where id in (select id from pg_temp.mine());
do $$ begin perform public.queue_review_reminders(); end $$;
select is((select count(*)::int from pg_temp.mine()), 0, 'a comment is only reminded about once');

-- Sent back, fixed again, resolved again: that is a new wait, so it can be reminded about again.
-- (Inside one transaction every now() is the same instant, so place the first reminder in the past.)
update public.activity set created_at = now() - interval '1 hour' where action = 'client.reminded' and project_id = '10000000-0000-0000-0000-0000000000e1';
update public.comments set status = 'open' where id = '30000000-0000-0000-0000-0000000000e1';
update public.comments set status = 'resolved' where id = '30000000-0000-0000-0000-0000000000e1';
do $$ begin perform public.queue_review_reminders(interval '0 seconds'); end $$;
select is((select count(*)::int from pg_temp.mine()), 1, 'resolving it again starts a new wait');

-- A client who has answered is left alone.
delete from public.jobs where id in (select id from pg_temp.mine());
delete from public.activity where action = 'client.reminded' and project_id = '10000000-0000-0000-0000-0000000000e1';
alter table public.comments disable trigger user;
update public.comments set client_review = 'approved' where author_guest_id = '40000000-0000-0000-0000-0000000000e1';
alter table public.comments enable trigger user;
do $$ begin perform public.queue_review_reminders(interval '0 seconds'); end $$;
select results_eq(
  $$ select payload ->> 'guest_id' from pg_temp.mine() $$,
  $$ values ('40000000-0000-0000-0000-0000000000e2') $$,
  'confirmed comments are not reminded about');

set local role authenticated;
select throws_ok($$ select public.queue_review_reminders() $$, '42501', null, 'signed-in users cannot trigger reminders');
reset role;

select * from finish();
rollback;
