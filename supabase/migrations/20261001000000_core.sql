-- Core schema for Basenine Feedback.
-- Every table has RLS. The dashboard talks to Postgres as the signed-in user, so isolation between
-- workspaces is enforced by the database, not by application code. The embed widget never talks to
-- Postgres directly: it goes through the app's API, which verifies a scoped widget token first.

create type public.member_role as enum ('owner', 'admin', 'member');
create type public.comment_status as enum ('open', 'in_progress', 'resolved');
create type public.comment_priority as enum ('low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  email text not null default '',
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role public.member_role not null default 'member' check (role <> 'owner'),
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  site_url text check (site_url is null or site_url ~ '^https?://'),
  public_key text not null unique default 'pk_' || encode(extensions.gen_random_bytes(12), 'hex'),
  allowed_origins text[] not null default '{}',
  figma_url text check (figma_url is null or figma_url ~ '^https://(www\.)?figma\.com/'),
  comment_seq integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index projects_workspace_idx on public.projects (workspace_id);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'live' check (kind in ('live', 'image')),
  url text not null check (char_length(url) <= 2048),
  title text not null default '' check (char_length(title) <= 160),
  image_path text,
  created_at timestamptz not null default now(),
  unique (project_id, url)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) <= 254),
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  token_hash text not null unique,
  label text not null default '' check (char_length(label) <= 80),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_id uuid not null references public.pages (id) on delete cascade,
  number integer not null default 0,
  author_user_id uuid references auth.users (id) on delete set null,
  author_guest_id uuid references public.guests (id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 5000),
  title text check (title is null or char_length(title) <= 120),
  category text check (category is null or category in ('copy', 'design', 'layout', 'bug', 'content', 'question', 'other')),
  status public.comment_status not null default 'open',
  priority public.comment_priority not null default 'medium',
  assignee_id uuid references auth.users (id) on delete set null,
  anchor jsonb,
  pin jsonb,
  snapshot jsonb,
  context jsonb not null default '{}'::jsonb,
  screenshot_path text,
  anchor_state text not null default 'unknown' check (anchor_state in ('attached', 'suggested', 'detached', 'unknown')),
  change_summary jsonb,
  checked_at timestamptz,
  triage jsonb,
  triage_state text not null default 'pending' check (triage_state in ('pending', 'ready', 'accepted', 'dismissed', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (project_id, number),
  check (anchor is not null or pin is not null)
);
create index comments_page_idx on public.comments (page_id, created_at);
create index comments_project_status_idx on public.comments (project_id, status);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  author_guest_id uuid references public.guests (id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index replies_comment_idx on public.replies (comment_id, created_at);

create table public.activity (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_name text not null,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_project_idx on public.activity (project_id, created_at desc);

-- Background work (AI triage etc.). Service role only.
create table public.jobs (
  id bigint generated always as identity primary key,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_ready_idx on public.jobs (kind, status, run_after);

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------- helpers

create function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create function public.has_role(ws uuid, roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role = any (roles));
$$;

create function public.can_access_project(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects pr join public.workspace_members m on m.workspace_id = pr.workspace_id
    where pr.id = p and m.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- triggers

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  display_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1));
  ws uuid;
begin
  insert into public.profiles (id, name, email) values (new.id, left(display_name, 80), coalesce(new.email, ''));
  insert into public.workspaces (name) values (left(display_name || '''s workspace', 80)) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger comments_touch before update on public.comments for each row execute function public.touch_updated_at();

-- Per-project sequential numbers (#1, #2, ...). The row lock on the project serializes concurrent inserts.
create function public.assign_comment_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set comment_seq = comment_seq + 1 where id = new.project_id returning comment_seq into new.number;
  return new;
end;
$$;
create trigger comments_number before insert on public.comments for each row execute function public.assign_comment_number();

create function public.comment_consistency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pages p where p.id = new.page_id and p.project_id = new.project_id) then
    raise exception 'page % does not belong to project %', new.page_id, new.project_id;
  end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status <> 'resolved') then new.resolved_at := now(); end if;
  if new.status <> 'resolved' then new.resolved_at := null; end if;
  return new;
end;
$$;
create trigger comments_consistency before insert or update on public.comments for each row execute function public.comment_consistency();

create function public.reply_consistency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select c.project_id into new.project_id from public.comments c where c.id = new.comment_id;
  return new;
end;
$$;
create trigger replies_consistency before insert on public.replies for each row execute function public.reply_consistency();

-- Activity is written by the database so no code path can skip it.
create function public.log_comment_activity() returns trigger
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
  return new;
end;
$$;
create trigger comments_activity after insert or update on public.comments for each row execute function public.log_comment_activity();

-- ---------------------------------------------------------------- job queue + rate limiting

create function public.claim_jobs(p_kind text, p_limit integer default 5) returns setof public.jobs
language sql security definer set search_path = '' as $$
  with ready as (
    select id from public.jobs
    where kind = p_kind and attempts < max_attempts
      and ((status = 'queued' and run_after <= now())
        or (status = 'running' and locked_at < now() - interval '5 minutes'))
    order by id
    for update skip locked
    limit p_limit
  )
  update public.jobs j
  set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
  from ready where j.id = ready.id
  returning j.*;
$$;

create function public.finish_job(p_id bigint, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.jobs set
    status = case when p_error is null then 'done' when attempts >= max_attempts then 'failed' else 'queued' end,
    last_error = p_error,
    -- exponential backoff with jitter: ~10s, 20s, 40s, ...
    run_after = case when p_error is null then run_after
      else now() + make_interval(secs => 10 * power(2, attempts - 1) * (0.75 + random() * 0.5)) end,
    locked_at = null,
    updated_at = now()
  where id = p_id;
$$;

create function public.hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits (bucket, window_start, hits) values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  delete from public.rate_limits where window_start < now() - interval '1 day' and random() < 0.01;
  return n <= p_limit;
end;
$$;

-- Server-side comment updates on behalf of a widget user, attributed to them in the activity log.
create function public.update_comment_as(p_comment uuid, p_project uuid, p_actor uuid, p_actor_name text, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  perform set_config('app.actor_name', coalesce(p_actor_name, ''), true);
  update public.comments set
    status = coalesce((p_patch ->> 'status')::public.comment_status, status),
    priority = coalesce((p_patch ->> 'priority')::public.comment_priority, priority)
  where id = p_comment and project_id = p_project;
  if not found then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.update_comment_as(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_comment_as(uuid, uuid, uuid, text, jsonb) to service_role;
revoke execute on function public.claim_jobs(text, integer) from public, anon, authenticated;
revoke execute on function public.finish_job(bigint, text) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_jobs(text, integer) to service_role;
grant execute on function public.finish_job(bigint, text) to service_role;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.projects enable row level security;
alter table public.pages enable row level security;
alter table public.guests enable row level security;
alter table public.share_links enable row level security;
alter table public.comments enable row level security;
alter table public.replies enable row level security;
alter table public.activity enable row level security;
alter table public.jobs enable row level security;
alter table public.rate_limits enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy workspaces_read on public.workspaces for select to authenticated using (public.is_member(id));
create policy workspaces_update on public.workspaces for update to authenticated using (public.has_role(id, '{owner,admin}'));

create policy members_read on public.workspace_members for select to authenticated using (public.is_member(workspace_id));
create policy members_manage on public.workspace_members for update to authenticated
  using (public.has_role(workspace_id, '{owner,admin}')) with check (role <> 'owner' or public.has_role(workspace_id, '{owner}'));
create policy members_remove on public.workspace_members for delete to authenticated
  using (public.has_role(workspace_id, '{owner,admin}') and role <> 'owner');

create policy invites_read on public.workspace_invites for select to authenticated using (public.has_role(workspace_id, '{owner,admin}'));
create policy invites_write on public.workspace_invites for all to authenticated
  using (public.has_role(workspace_id, '{owner,admin}')) with check (public.has_role(workspace_id, '{owner,admin}'));

create policy projects_read on public.projects for select to authenticated using (public.is_member(workspace_id));
create policy projects_insert on public.projects for insert to authenticated with check (public.is_member(workspace_id) and created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy projects_delete on public.projects for delete to authenticated using (public.has_role(workspace_id, '{owner,admin}'));

create policy pages_all on public.pages for all to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy guests_read on public.guests for select to authenticated using (public.can_access_project(project_id));
create policy share_links_all on public.share_links for all to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

create policy comments_read on public.comments for select to authenticated using (public.can_access_project(project_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.can_access_project(project_id) and author_user_id = auth.uid() and author_guest_id is null);
create policy comments_update on public.comments for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy comments_delete on public.comments for delete to authenticated
  using (author_user_id = auth.uid() or exists (
    select 1 from public.projects p where p.id = project_id and public.has_role(p.workspace_id, '{owner,admin}')));

create policy replies_read on public.replies for select to authenticated using (public.can_access_project(project_id));
create policy replies_insert on public.replies for insert to authenticated
  with check (author_user_id = auth.uid() and author_guest_id is null
    and exists (select 1 from public.comments c where c.id = comment_id and public.can_access_project(c.project_id)));
create policy replies_delete on public.replies for delete to authenticated using (author_user_id = auth.uid());

create policy activity_read on public.activity for select to authenticated using (public.can_access_project(project_id));
-- jobs and rate_limits: internal. No policies, and no table privileges for API roles at all.
revoke all on public.jobs, public.rate_limits from anon, authenticated;

-- Columns the dashboard may change on a comment. Everything else (anchor, author, triage payload...) is
-- written only by the server with the service role.
revoke update on public.comments from authenticated;
grant update (status, priority, assignee_id, title, category, body, triage_state) on public.comments to authenticated;

-- ---------------------------------------------------------------- realtime + storage

alter publication supabase_realtime add table public.comments, public.replies;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('screenshots', 'screenshots', false, 3145728, array['image/png', 'image/jpeg', 'image/webp']),
  ('page-images', 'page-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp']);

create policy screenshots_read on storage.objects for select to authenticated
  using (bucket_id in ('screenshots', 'page-images') and public.can_access_project(((storage.foldername(name))[1])::uuid));
create policy page_images_write on storage.objects for insert to authenticated
  with check (bucket_id = 'page-images' and public.can_access_project(((storage.foldername(name))[1])::uuid));
