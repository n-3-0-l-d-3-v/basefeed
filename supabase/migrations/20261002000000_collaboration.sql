-- Collaboration: notifications, team invites, personal API tokens and comment attachments.

-- ---------------------------------------------------------------- notification preferences

create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  new_comments boolean not null default true,
  assignments boolean not null default true,
  replies boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy prefs_own on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notifications are queued by the database itself, so every way a comment, assignment or reply is
-- created (dashboard, widget, API, agent) notifies people. A worker sends them; idempotency keys
-- make each notification go out once.
create function public.queue_comment_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.jobs (kind, payload, idempotency_key)
    values ('notify', jsonb_build_object('event', 'comment.created', 'comment_id', new.id), 'notify:created:' || new.id)
    on conflict (idempotency_key) do nothing;
  elsif new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id then
    insert into public.jobs (kind, payload, idempotency_key)
    values ('notify', jsonb_build_object('event', 'comment.assigned', 'comment_id', new.id, 'assignee_id', new.assignee_id),
            'notify:assigned:' || new.id || ':' || new.assignee_id || ':' || extract(epoch from new.updated_at))
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger comments_notify after insert or update of assignee_id on public.comments
  for each row execute function public.queue_comment_notifications();

create function public.queue_reply_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.jobs (kind, payload, idempotency_key)
  values ('notify', jsonb_build_object('event', 'reply.created', 'reply_id', new.id), 'notify:reply:' || new.id)
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;
create trigger replies_notify after insert on public.replies for each row execute function public.queue_reply_notifications();

-- ---------------------------------------------------------------- team invites

-- Invite links are reusable until they expire or are revoked (like a Slack invite link).
create function public.accept_invite(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.workspace_invites;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  select * into inv from public.workspace_invites
  where token_hash = p_token_hash and revoked_at is null and expires_at > now();
  if not found then
    raise exception 'invite not valid' using errcode = 'P0002';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do nothing;
  return inv.workspace_id;
end;
$$;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- Lets the invite page show which workspace you're joining without exposing the invite table.
create function public.invite_preview(p_token_hash text) returns table (workspace_name text, role public.member_role)
language sql stable security definer set search_path = '' as $$
  select w.name, i.role from public.workspace_invites i join public.workspaces w on w.id = i.workspace_id
  where i.token_hash = p_token_hash and i.revoked_at is null and i.expires_at > now();
$$;
revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------- personal API tokens (MCP / integrations)

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique,
  prefix text not null check (char_length(prefix) <= 16),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.api_tokens enable row level security;
create policy api_tokens_own on public.api_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.api_tokens from authenticated;
grant update (name, revoked_at) on public.api_tokens to authenticated;

-- ---------------------------------------------------------------- attachments

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  path text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  mime text not null,
  size integer not null check (size between 1 and 10485760),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index attachments_comment_idx on public.attachments (comment_id);
alter table public.attachments enable row level security;
create policy attachments_read on public.attachments for select to authenticated using (public.can_access_project(project_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.can_access_project(project_id) and created_by = auth.uid()
    and exists (select 1 from public.comments c where c.id = comment_id and c.project_id = attachments.project_id));
create policy attachments_delete on public.attachments for delete to authenticated using (created_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);

drop policy screenshots_read on storage.objects;
create policy project_files_read on storage.objects for select to authenticated
  using (bucket_id in ('screenshots', 'page-images', 'attachments') and public.can_access_project(((storage.foldername(name))[1])::uuid));
create policy attachments_write on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_access_project(((storage.foldername(name))[1])::uuid));

-- Comments on uploaded images are pinned by position on the image (0..1 on each axis).
alter table public.comments add constraint comments_pin_shape check (
  pin is null or (jsonb_typeof(pin -> 'x') = 'number' and jsonb_typeof(pin -> 'y') = 'number'
    and (pin ->> 'x')::numeric between 0 and 1 and (pin ->> 'y')::numeric between 0 and 1));
