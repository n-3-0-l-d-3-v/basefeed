-- Daily digest: a member can swap "one email per new comment" for one email a day.
-- Assignments, replies and comments sent back by a client stay immediate; they are addressed to
-- someone and waiting a day would cost more than the email does.

alter table public.notification_prefs add column daily_digest boolean not null default false;

-- Queue one digest job per member who asked for it and has something to read: a comment from the
-- last 24 hours, in a workspace they belong to, that they did not write and that is not a
-- page-check finding. Nobody qualifying means nothing queued, so the app is not called at all.
create function public.queue_daily_digests() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  since timestamptz := now() - interval '24 hours';
  queued integer;
begin
  insert into public.jobs (kind, payload, idempotency_key)
  select 'notify',
         jsonb_build_object('event', 'digest', 'user_id', p.user_id, 'since', since),
         'notify:digest:' || p.user_id || ':' || to_char(now() at time zone 'utc', 'YYYY-MM-DD')
  from public.notification_prefs p
  where p.daily_digest and p.new_comments
    and exists (
      select 1
      from public.workspace_members m
      join public.projects pr on pr.workspace_id = m.workspace_id
      join public.comments c on c.project_id = pr.id
      where m.user_id = p.user_id
        and c.created_at >= since
        and c.author_user_id is distinct from p.user_id
        and not (c.context ? 'qa'))
  on conflict (idempotency_key) do nothing;
  get diagnostics queued = row_count;
  return queued;
end;
$$;
revoke execute on function public.queue_daily_digests() from public, anon, authenticated;

-- 03:30 UTC is 09:00 in India. The every-minute tick then finds the jobs and calls the app.
select cron.schedule('daily-digest', '30 3 * * *', 'select public.queue_daily_digests()');
