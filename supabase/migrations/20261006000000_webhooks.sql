-- Outgoing webhooks: a project announces what happens in it to a URL the team chooses (Slack,
-- n8n, Zapier, Make, their own service). Events are queued by the database, so no code path can
-- forget one, and delivered by the same retrying job queue as email and AI triage.

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 2048),
  /** Signs every delivery (HMAC-SHA256) so the receiver can verify it came from here. */
  secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  /** Events to send; empty means all of them. */
  events text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_status integer,
  last_error text,
  last_delivered_at timestamptz
);
create index webhooks_project_idx on public.webhooks (project_id);
alter table public.webhooks enable row level security;
create policy webhooks_all on public.webhooks for all to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

create function public.queue_webhooks(p_project uuid, p_event text, p_comment uuid, p_actor text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.jobs (kind, payload)
  select 'webhook', jsonb_build_object('webhook_id', w.id, 'event', p_event, 'comment_id', p_comment, 'actor', p_actor, 'meta', p_meta, 'at', now())
  from public.webhooks w
  where w.project_id = p_project and (cardinality(w.events) = 0 or p_event = any (w.events));
$$;
revoke execute on function public.queue_webhooks(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

-- The activity log already records who did what; the events worth announcing are a subset of it.
create function public.activity_webhooks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.action not in ('comment.created', 'comment.status', 'client.approved', 'client.rejected') then return new; end if;
  -- A page check files findings in batches; announcing each would flood the channel.
  if new.action = 'comment.created' and exists (select 1 from public.comments c where c.id = new.comment_id and c.context ? 'qa') then return new; end if;
  perform public.queue_webhooks(new.project_id, new.action, new.comment_id, new.actor_name, coalesce(new.meta, '{}'::jsonb));
  return new;
end;
$$;
create trigger activity_webhooks after insert on public.activity for each row execute function public.activity_webhooks();

create function public.reply_webhooks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.queue_webhooks(new.project_id, 'reply.created', new.comment_id, new.author_name, jsonb_build_object('reply_id', new.id));
  return new;
end;
$$;
create trigger replies_webhooks after insert on public.replies for each row execute function public.reply_webhooks();

-- AI triage found something a person has to decide (vague, duplicate, wrong priority, new work).
create function public.triage_webhooks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.triage_state = 'ready' and old.triage_state is distinct from 'ready' then
    perform public.queue_webhooks(new.project_id, 'triage.flagged', new.id, 'Automation');
  end if;
  return new;
end;
$$;
create trigger comments_triage_webhooks after update on public.comments for each row execute function public.triage_webhooks();
