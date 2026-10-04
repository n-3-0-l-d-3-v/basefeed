begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Ana owns the workspace; Ben is the writer on her team; Zed belongs to another workspace.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@studio.test', '{"name":"Ana"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'ben@studio.test', '{"name":"Ben"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'zed@other.test', '{"name":"Zed"}', 'authenticated', 'authenticated');
insert into public.workspace_members (workspace_id, user_id, role)
select workspace_id, '00000000-0000-0000-0000-0000000000a2', 'member' from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.projects (id, workspace_id, name, created_by)
select '10000000-0000-0000-0000-0000000000a1', workspace_id, 'Site', user_id from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.pages (id, project_id, url) values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'https://client.test/');
insert into public.assign_rules (project_id, category, assignee_id) values
  ('10000000-0000-0000-0000-0000000000a1', 'copy', '00000000-0000-0000-0000-0000000000a2'),
  ('10000000-0000-0000-0000-0000000000a1', 'bug', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000a1', 'design', '00000000-0000-0000-0000-0000000000a3');

insert into public.comments (id, project_id, page_id, author_user_id, author_name, body, pin, context, category) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Ana', 'Typo in the headline', '{"x":0.5,"y":0.2}', '{}', null),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Ana', 'Link goes nowhere', '{"x":0.5,"y":0.2}', '{"qa":"dead-link"}', 'bug'),
  ('30000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Ana', 'Button colour is off', '{"x":0.5,"y":0.2}', '{}', null),
  ('30000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Ana', 'Say Book a demo', '{"x":0.5,"y":0.2}', '{}', null);

select is((select assignee_id from public.comments where id = '30000000-0000-0000-0000-0000000000a1'), null, 'a comment with no category yet is left unassigned');

-- Triage (or a person) labels it: the rule assigns it, says so in the log, and tells the assignee.
update public.comments set category = 'copy' where id = '30000000-0000-0000-0000-0000000000a1';
select is((select assignee_id from public.comments where id = '30000000-0000-0000-0000-0000000000a1'), '00000000-0000-0000-0000-0000000000a2'::uuid,
  'labelling a comment as copy assigns it to the person the copy rule names');
select results_eq(
  $$ select actor_name, meta ->> 'rule' from public.activity where comment_id = '30000000-0000-0000-0000-0000000000a1' and action = 'comment.assignee' $$,
  $$ values ('Assignment rule', 'copy') $$,
  'the activity log says a rule did it, and which');
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'comment.assigned' and payload ->> 'comment_id' = '30000000-0000-0000-0000-0000000000a1'), 1,
  'the assignee is emailed once, as for a manual assignment');

-- A page-check finding arrives already labelled: assigned on insert, without an email each.
select is((select assignee_id from public.comments where id = '30000000-0000-0000-0000-0000000000a2'), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'a page-check finding is assigned by its category as it is filed');
select is((select count(*)::int from public.jobs where payload ->> 'event' = 'comment.assigned' and payload ->> 'comment_id' = '30000000-0000-0000-0000-0000000000a2'), 0,
  'findings assigned by a rule do not send an email each');

-- A rule never overrides a person.
update public.comments set assignee_id = null where id = '30000000-0000-0000-0000-0000000000a1';
update public.comments set priority = 'high' where id = '30000000-0000-0000-0000-0000000000a1';
select is((select assignee_id from public.comments where id = '30000000-0000-0000-0000-0000000000a1'), null, 'after someone unassigns it, the rule does not assign it again');
update public.comments set assignee_id = '00000000-0000-0000-0000-0000000000a1' where id = '30000000-0000-0000-0000-0000000000a4';
update public.comments set category = 'copy' where id = '30000000-0000-0000-0000-0000000000a4';
select is((select assignee_id from public.comments where id = '30000000-0000-0000-0000-0000000000a4'), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'a comment someone already assigned keeps its assignee');

-- A rule naming someone outside the workspace does nothing.
update public.comments set category = 'design' where id = '30000000-0000-0000-0000-0000000000a3';
select is((select assignee_id from public.comments where id = '30000000-0000-0000-0000-0000000000a3'), null, 'a rule naming someone who is not in the workspace assigns nobody');

-- Rules belong to the project's workspace.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from public.assign_rules), 0, 'another workspace cannot read the rules');
select throws_ok(
  $$ insert into public.assign_rules (project_id, category, assignee_id) values ('10000000-0000-0000-0000-0000000000a1', 'other', '00000000-0000-0000-0000-0000000000a3') $$,
  '42501', null, 'or add one');
reset role;

select * from finish();
rollback;
