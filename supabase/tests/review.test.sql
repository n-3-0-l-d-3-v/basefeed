begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000000c1', 'cara@studio.test', '{"name":"Cara"}', 'authenticated', 'authenticated');
insert into public.projects (id, workspace_id, name, created_by)
select '10000000-0000-0000-0000-0000000000c1', workspace_id, 'Client site', user_id from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000c1';
insert into public.pages (id, project_id, url) values ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'https://client.test/');
insert into public.guests (id, project_id, name, email) values
  ('40000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Priya', 'priya@client.test'),
  ('40000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', 'Marcus', 'marcus@client.test');
insert into public.comments (id, project_id, page_id, author_guest_id, author_user_id, author_name, body, pin) values
  ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', null, 'Priya', 'Headline too long', '{"x":0.5,"y":0.2}'),
  ('30000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', null, 'Priya', 'Logo too small', '{"x":0.1,"y":0.1}'),
  ('30000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000c1', 'Cara', 'Internal note', '{"x":0.2,"y":0.2}');

-- The team resolves: the client is asked to confirm, the team's own comments are not reviewed.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
update public.comments set status = 'resolved' where project_id = '10000000-0000-0000-0000-0000000000c1';
select throws_ok(
  $$ update public.comments set client_review = 'approved' where id = '30000000-0000-0000-0000-0000000000c1' $$,
  '42501', null, 'a team member cannot approve on the client''s behalf');
reset role;

select is((select client_review from public.comments where id = '30000000-0000-0000-0000-0000000000c1'), 'pending', 'resolving a client''s comment asks the client to confirm');
select is((select client_review from public.comments where id = '30000000-0000-0000-0000-0000000000c3'), null, 'the team''s own comments need no client review');
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'review.requested' and payload ->> 'comment_id' = '30000000-0000-0000-0000-0000000000c1'), 1,
  'the client is notified once');

-- Only the comment's author can answer.
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok(
  $$ select public.review_comment_as_guest('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c2', true) $$,
  'P0002', null, 'another client cannot confirm someone else''s comment');

select public.review_comment_as_guest('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', true);
select is((select status::text || '/' || client_review from public.comments where id = '30000000-0000-0000-0000-0000000000c1'), 'resolved/approved', 'approving keeps it resolved');
select is((select actor_name from public.activity where comment_id = '30000000-0000-0000-0000-0000000000c1' and action = 'client.approved'), 'Priya', 'the approval is logged under the client''s name');
select throws_ok(
  $$ select public.review_comment_as_guest('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', false) $$,
  'P0002', null, 'an answer cannot be changed once given');

select public.review_comment_as_guest('30000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', false, '  Still tiny on my phone ');
select is((select status::text || '/' || client_review from public.comments where id = '30000000-0000-0000-0000-0000000000c2'), 'open/rejected', 'sending it back reopens the comment');
select is((select body from public.replies where comment_id = '30000000-0000-0000-0000-0000000000c2'), 'Still tiny on my phone', 'the client''s note becomes a reply');
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'review.rejected' and payload ->> 'comment_id' = '30000000-0000-0000-0000-0000000000c2'), 1,
  'the team is told the fix was sent back');

-- Resolving again starts a fresh review.
update public.comments set status = 'resolved' where id = '30000000-0000-0000-0000-0000000000c2';
select is((select client_review from public.comments where id = '30000000-0000-0000-0000-0000000000c2'), 'pending', 'a second fix is reviewed again');

select * from finish();
rollback;
