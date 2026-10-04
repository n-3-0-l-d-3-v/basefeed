begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000000d1', 'dana@studio.test', '{"name":"Dana"}', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000d2', 'eve@elsewhere.test', '{"name":"Eve"}', 'authenticated', 'authenticated');
insert into public.projects (id, workspace_id, name, created_by)
select '10000000-0000-0000-0000-0000000000d1', workspace_id, 'Hooked site', user_id from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into public.pages (id, project_id, url) values ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'https://hooked.test/');
insert into public.webhooks (id, project_id, url, events) values
  ('50000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'https://example.test/all', '{}'),
  ('50000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000d1', 'https://example.test/rejections', '{client.rejected}');

create function pg_temp.sent(hook text) returns text[] language sql as $$
  select coalesce(array_agg(payload ->> 'event' order by id), '{}') from public.jobs where kind = 'webhook' and payload ->> 'webhook_id' = hook
$$;

insert into public.guests (id, project_id, name, email) values ('40000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'Priya', 'priya@client.test');
insert into public.comments (id, project_id, page_id, author_guest_id, author_name, body, pin)
values ('30000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000d1', 'Priya', 'Logo too small', '{"x":0.1,"y":0.1}');
select is(pg_temp.sent('50000000-0000-0000-0000-0000000000d1'), array['comment.created'], 'a new comment is announced to a hook that takes every event');
select is(pg_temp.sent('50000000-0000-0000-0000-0000000000d2'), '{}'::text[], 'and not to a hook that did not ask for it');

insert into public.comments (project_id, page_id, author_user_id, author_name, body, pin, context)
values ('10000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Dana', 'Link goes nowhere', '{"x":0.2,"y":0.2}', '{"qa":"dead-link"}');
select is(pg_temp.sent('50000000-0000-0000-0000-0000000000d1'), array['comment.created'], 'page-check findings are not announced one by one');

insert into public.replies (comment_id, project_id, author_user_id, author_name, body)
values ('30000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Dana', 'On it');
update public.comments set status = 'resolved' where id = '30000000-0000-0000-0000-0000000000d1';
set local request.jwt.claims = '{"role":"service_role"}';
select public.review_comment_as_guest('30000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000d1', false, 'Still small');
select is(pg_temp.sent('50000000-0000-0000-0000-0000000000d1'),
  array['comment.created', 'reply.created', 'comment.status', 'comment.status', 'client.rejected', 'reply.created'],
  'replies, status changes and the client''s answer are announced in order');
select is(pg_temp.sent('50000000-0000-0000-0000-0000000000d2'), array['client.rejected'], 'a filtered hook gets only its event');

update public.comments set triage_state = 'ready' where id = '30000000-0000-0000-0000-0000000000d1';
select is((pg_temp.sent('50000000-0000-0000-0000-0000000000d1'))[7], 'triage.flagged', 'an AI flag that needs a decision is announced');

-- Signing secrets are visible to the project's team only.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select is((select count(*)::int from public.webhooks), 0, 'another workspace cannot read a project''s webhooks or their secrets');
select throws_ok(
  $$ insert into public.webhooks (project_id, url) values ('10000000-0000-0000-0000-0000000000d1', 'https://evil.test/steal') $$,
  '42501', null, 'or add one to it');

select * from finish();
rollback;
