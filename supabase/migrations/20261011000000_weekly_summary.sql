-- Weekly summary: for whoever runs the account. One email on Monday morning (09:00 in their own
-- time zone) with where each project stands: what came in, what was closed, what is open, what is
-- waiting on a client. Opt-in per person.

alter table public.notification_prefs add column weekly_summary boolean not null default false;

-- Runs every half hour like the daily digest; one summary per member per local week. Nothing is
-- queued for a member whose projects have nothing open and nothing that moved in the last 7 days.
create function public.queue_weekly_summaries(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  queued integer;
begin
  insert into public.jobs (kind, payload, idempotency_key)
  select 'notify',
         jsonb_build_object('event', 'weekly', 'user_id', p.user_id, 'since', p_now - interval '7 days'),
         'notify:weekly:' || p.user_id || ':' || to_char(p_now at time zone tz.name, 'IYYY-IW')
  from public.notification_prefs p
  cross join lateral (
    select coalesce((select n.name from pg_catalog.pg_timezone_names n where n.name = p.timezone), 'Asia/Kolkata') as name) tz
  where p.weekly_summary
    and extract(isodow from p_now at time zone tz.name) = 1
    and (p_now at time zone tz.name)::time >= time '09:00'
    and (p_now at time zone tz.name)::time < time '09:30'
    and exists (
      select 1
      from public.workspace_members m
      join public.projects pr on pr.workspace_id = m.workspace_id and pr.archived_at is null
      join public.comments c on c.project_id = pr.id
      where m.user_id = p.user_id
        and not (c.context ? 'qa')
        and (c.status <> 'resolved' or c.client_review = 'pending' or c.created_at >= p_now - interval '7 days' or c.resolved_at >= p_now - interval '7 days'))
  on conflict (idempotency_key) do nothing;
  get diagnostics queued = row_count;
  return queued;
end;
$$;
revoke execute on function public.queue_weekly_summaries(timestamptz) from public, anon, authenticated;
select cron.schedule('weekly-summary', '*/30 * * * *', 'select public.queue_weekly_summaries()');
