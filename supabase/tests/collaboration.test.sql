begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@studio.test', '{"name":"Ana"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'ben@freelance.test', '{"name":"Ben"}', 'authenticated', 'authenticated');

create temp table ws as
select (select workspace_id from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000a1') as ana_ws;
grant select on ws to authenticated;

-- Ana sets up a project with one comment.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into public.projects (id, workspace_id, name, created_by)
select '10000000-0000-0000-0000-0000000000a1', ana_ws, 'Studio site', '00000000-0000-0000-0000-0000000000a1' from ws;
insert into public.pages (id, project_id, url) values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'https://studio.test/');
insert into public.comments (id, project_id, page_id, author_user_id, author_name, body, pin)
values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a1', 'Ana', 'Hero image is blurry', '{"x":0.5,"y":0.2}');

select throws_ok(
  $$ insert into public.comments (project_id, page_id, author_user_id, author_name, body, pin)
     values ('10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Ana', 'x', '{"x":4,"y":0}') $$,
  '23514', null, 'image pins must lie on the image (0..1)');

insert into public.workspace_invites (workspace_id, role, token_hash, created_by)
select ana_ws, 'member', 'invite-hash-1', '00000000-0000-0000-0000-0000000000a1' from ws;
insert into public.api_tokens (user_id, name, token_hash, prefix) values ('00000000-0000-0000-0000-0000000000a1', 'Cursor', 'tok-hash', 'bnf_abcd');

reset role;
select is((select count(*)::int from public.jobs where idempotency_key = 'notify:created:30000000-0000-0000-0000-0000000000a1'), 1,
  'a new comment queues exactly one notification');

update public.comments set assignee_id = '00000000-0000-0000-0000-0000000000a1' where id = '30000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'comment.assigned'), 1, 'assigning someone queues a notification');

update public.comments set body = 'Hero image is blurry on retina' where id = '30000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'comment.assigned'), 1, 'unrelated edits do not re-notify the assignee');

insert into public.replies (comment_id, project_id, author_user_id, author_name, body)
values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Ana', 'On it');
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'reply.created'), 1, 'a reply queues a notification');

-- Ben, from another workspace.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is((select count(*)::int from public.api_tokens), 0, 'API tokens are private to their owner');
select is((select count(*)::int from public.attachments), 0, 'attachments are invisible outside the project');
select is((select count(*)::int from public.projects), 0, 'before accepting an invite, Ben sees nothing');
select is((select workspace_name from public.invite_preview('invite-hash-1')), 'Ana''s workspace', 'the invite page can show which workspace it is for');
select throws_ok($$ select public.accept_invite('wrong-hash') $$, 'P0002', null, 'a wrong invite token is rejected');

select public.accept_invite('invite-hash-1');
select is((select count(*)::int from public.projects), 1, 'after accepting, Ben sees the workspace''s projects');
select is((select role::text from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000b1'
  and workspace_id = (select ana_ws from ws)), 'member', 'Ben joins with the invite''s role');

select * from finish();
rollback;
