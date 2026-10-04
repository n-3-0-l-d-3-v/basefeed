-- Assignment rules: per project, "comments of this category go to this person" (copy → the writer,
-- bugs → the developer). Applied by the database the moment a comment gets its category, whoever
-- set it: AI triage, the page check, or a person. A rule only ever fills an empty assignee; it
-- never overrides someone's choice, and never re-assigns after someone unassigns.

create table public.assign_rules (
  project_id uuid not null references public.projects (id) on delete cascade,
  category text not null check (category in ('copy', 'design', 'layout', 'bug', 'content', 'question', 'other')),
  assignee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, category)
);
alter table public.assign_rules enable row level security;
create policy assign_rules_all on public.assign_rules for all to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
grant select, insert, update, delete on public.assign_rules to authenticated;

create function public.auto_assign() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
begin
  if new.assignee_id is not null or new.category is null or new.status = 'resolved' then return new; end if;
  if tg_op = 'UPDATE' and new.category is not distinct from old.category then return new; end if;
  -- Someone who has left the workspace is not assigned, even if their rule is still there.
  select r.assignee_id into who
  from public.assign_rules r
  join public.projects p on p.id = r.project_id
  join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = r.assignee_id
  where r.project_id = new.project_id and r.category = new.category;
  if who is null then return new; end if;
  -- A separate UPDATE (rather than changing the row in a BEFORE trigger) so the activity log and the
  -- "assigned to you" email fire exactly as they do for a manual assignment.
  perform set_config('app.auto_assign', new.category, true);
  update public.comments set assignee_id = who where id = new.id and assignee_id is null;
  perform set_config('app.auto_assign', '', true);
  return new;
end;
$$;
create trigger comments_auto_assign after insert or update on public.comments
  for each row execute function public.auto_assign();

-- The activity log says a rule did it, not the person whose edit happened to set the category.
create or replace function public.log_comment_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  actor_label text := coalesce(
    (select p.name from public.profiles p where p.id = coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid)),
    nullif(current_setting('app.actor_name', true), ''),
    'Automation');
  rule text := nullif(current_setting('app.auto_assign', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action)
    values (new.project_id, new.id, new.author_user_id, new.author_name, 'comment.created');
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action, meta)
    values (new.project_id, new.id, actor, actor_label, 'comment.status', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action, meta)
    values (new.project_id, new.id, actor, actor_label, 'comment.priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    if rule is not null then
      insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action, meta)
      values (new.project_id, new.id, null, 'Assignment rule', 'comment.assignee', jsonb_build_object('to', new.assignee_id, 'rule', rule));
    else
      insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action, meta)
      values (new.project_id, new.id, actor, actor_label, 'comment.assignee', jsonb_build_object('to', new.assignee_id));
    end if;
  end if;
  if new.triage_state is distinct from old.triage_state and new.triage_state in ('accepted', 'dismissed') then
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action)
    values (new.project_id, new.id, actor, actor_label, 'triage.' || new.triage_state);
  end if;
  if new.anchor is distinct from old.anchor then
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action, meta)
    values (new.project_id, new.id, actor, actor_label, 'comment.repinned', jsonb_build_object('from', old.anchor_state));
  end if;
  return new;
end;
$$;

-- Page-check findings are filed in bulk, so a rule assigning them does not send an email each.
-- Assigning one by hand still does.
create or replace function public.queue_comment_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.jobs (kind, payload, idempotency_key)
    values ('notify', jsonb_build_object('event', 'comment.created', 'comment_id', new.id), 'notify:created:' || new.id)
    on conflict (idempotency_key) do nothing;
  elsif new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id
    and not (new.context ? 'qa' and nullif(current_setting('app.auto_assign', true), '') is not null) then
    insert into public.jobs (kind, payload, idempotency_key)
    values ('notify', jsonb_build_object('event', 'comment.assigned', 'comment_id', new.id, 'assignee_id', new.assignee_id),
            'notify:assigned:' || new.id || ':' || new.assignee_id || ':' || extract(epoch from new.updated_at))
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;
