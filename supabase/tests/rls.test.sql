begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Two independent agencies.
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'alice@agency-a.test', '{"name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@agency-b.test', '{"name":"Bob"}', 'authenticated', 'authenticated');

select is(
  (select count(distinct workspace_id)::int from public.workspace_members
   where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2, 'each new user gets their own workspace');
select is((select name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'Alice', 'profile name comes from signup metadata');

create temp table ids as
select
  (select workspace_id from public.workspace_members where user_id = '00000000-0000-0000-0000-00000000000a') as ws_a,
  (select workspace_id from public.workspace_members where user_id = '00000000-0000-0000-0000-00000000000b') as ws_b;
grant select on ids to authenticated;

-- ---------------------------------------------------------------- as Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

insert into public.projects (id, workspace_id, name, created_by)
select '10000000-0000-0000-0000-000000000001', ws_a, 'Acme site', '00000000-0000-0000-0000-00000000000a' from ids;
insert into public.pages (id, project_id, url) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'https://acme.test/');
insert into public.comments (project_id, page_id, author_user_id, author_name, body, pin)
values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Alice', 'First', '{"x":0.1,"y":0.1}'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Alice', 'Second', '{"x":0.2,"y":0.2}');

select results_eq('select number from public.comments order by number', array[1, 2], 'comments are numbered per project');

select throws_ok(
  $$ insert into public.comments (project_id, page_id, author_user_id, author_name, body, pin)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Bob', 'forged', '{"x":0,"y":0}') $$,
  '42501', null, 'cannot post a comment as someone else');

select throws_ok(
  $$ update public.comments set anchor = '{"v":1}' where number = 1 $$,
  '42501', null, 'cannot rewrite server-owned columns (anchor) from the dashboard');

update public.comments set status = 'resolved' where number = 1;
select isnt((select resolved_at from public.comments where number = 1), null, 'resolving stamps resolved_at');
select is(
  (select count(*)::int from public.activity where action = 'comment.status'),
  1, 'status changes are written to the activity log by the database');

select throws_ok($$ select * from public.jobs $$, '42501', null, 'jobs table is not readable by users');
select throws_ok($$ select public.claim_jobs('triage', 1) $$, '42501', null, 'job queue functions are service-role only');

-- ---------------------------------------------------------------- as Bob
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.projects), 0, 'Bob cannot see Alice''s projects');
select is((select count(*)::int from public.comments), 0, 'Bob cannot see Alice''s comments');
select is((select count(*)::int from public.pages), 0, 'Bob cannot see Alice''s pages');
select is((select count(*)::int from public.activity), 0, 'Bob cannot see Alice''s activity');

select throws_ok(
  $$ insert into public.projects (workspace_id, name, created_by) select ws_a, 'Hijack', '00000000-0000-0000-0000-00000000000b' from ids $$,
  '42501', null, 'Bob cannot create projects in Alice''s workspace');

update public.comments set status = 'open' where project_id = '10000000-0000-0000-0000-000000000001';
reset role;
select is((select status::text from public.comments where number = 1), 'resolved', 'Bob''s update silently matched nothing');

-- What the server's service-role client looks like: no user in the JWT.
set local request.jwt.claims = '{"role":"service_role"}';
select public.update_comment_as(
  (select id from public.comments where number = 2), '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 'Alice', '{"status":"in_progress"}');
select is(
  (select actor_name from public.activity where action = 'comment.status' order by id desc limit 1),
  'Alice', 'server-side updates made for a widget user are attributed to that user');

select * from finish();
rollback;
