-- Team members can re-pin a comment whose element changed or was removed: confirm the suggested
-- match or pick a new element. The original snapshot is kept on purpose: it records what the
-- author saw, so "changed since this comment" stays truthful after the pin moves.

create or replace function public.update_comment_as(p_comment uuid, p_project uuid, p_actor uuid, p_actor_name text, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  perform set_config('app.actor_name', coalesce(p_actor_name, ''), true);
  update public.comments set
    status = coalesce((p_patch ->> 'status')::public.comment_status, status),
    priority = coalesce((p_patch ->> 'priority')::public.comment_priority, priority),
    anchor = coalesce(p_patch -> 'anchor', anchor),
    -- A human just pointed at the element, so it is attached by definition.
    anchor_state = case when p_patch ? 'anchor' then 'attached' else anchor_state end
  where id = p_comment and project_id = p_project;
  if not found then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.log_comment_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  -- Dashboard writes run as the user (auth.uid()); widget writes go through update_comment_as(),
  -- which sets app.actor_*; anything else is the system.
  actor uuid := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  actor_label text := coalesce(
    (select p.name from public.profiles p where p.id = coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid)),
    nullif(current_setting('app.actor_name', true), ''),
    'Automation');
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
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action, meta)
    values (new.project_id, new.id, actor, actor_label, 'comment.assignee', jsonb_build_object('to', new.assignee_id));
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
