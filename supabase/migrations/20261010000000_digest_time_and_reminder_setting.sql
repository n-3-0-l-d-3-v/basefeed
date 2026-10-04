-- Three refinements to the daily digest and the client reminder.
--   1. The digest arrives at 09:00 in each person's own time zone, not at one fixed moment.
--   2. A digest never repeats a comment that was already emailed on its own before the person
--      switched to the digest: its window starts when the digest was switched on.
--   3. Each project chooses after how many days a silent client is reminded, or switches it off.

alter table public.notification_prefs
  add column digest_since timestamptz,
  add column timezone text not null default 'Asia/Kolkata';

create function public.prefs_digest_since() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.daily_digest and (tg_op = 'INSERT' or not old.daily_digest) then new.digest_since := now(); end if;
  return new;
end;
$$;
create trigger prefs_digest_since before insert or update on public.notification_prefs
  for each row execute function public.prefs_digest_since();

-- Runs every half hour and picks the members whose local time is between 09:00 and 09:30 (so zones
-- on a half hour, like India, are exact). One digest per member per local day. p_now exists for tests.
drop function public.queue_daily_digests();
create function public.queue_daily_digests(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  queued integer;
begin
  insert into public.jobs (kind, payload, idempotency_key)
  select 'notify',
         jsonb_build_object('event', 'digest', 'user_id', p.user_id, 'since', w.since),
         'notify:digest:' || p.user_id || ':' || to_char(p_now at time zone tz.name, 'YYYY-MM-DD')
  from public.notification_prefs p
  -- An unknown zone name falls back to the default rather than failing the whole run.
  cross join lateral (
    select coalesce((select n.name from pg_catalog.pg_timezone_names n where n.name = p.timezone), 'Asia/Kolkata') as name) tz
  cross join lateral (
    select greatest(p_now - interval '24 hours', coalesce(p.digest_since, '-infinity'::timestamptz)) as since) w
  where p.daily_digest and p.new_comments
    and (p_now at time zone tz.name)::time >= time '09:00'
    and (p_now at time zone tz.name)::time < time '09:30'
    and exists (
      select 1
      from public.workspace_members m
      join public.projects pr on pr.workspace_id = m.workspace_id
      join public.comments c on c.project_id = pr.id
      where m.user_id = p.user_id
        and c.created_at >= w.since
        and c.author_user_id is distinct from p.user_id
        and not (c.context ? 'qa'))
  on conflict (idempotency_key) do nothing;
  get diagnostics queued = row_count;
  return queued;
end;
$$;
revoke execute on function public.queue_daily_digests(timestamptz) from public, anon, authenticated;
select cron.schedule('daily-digest', '*/30 * * * *', 'select public.queue_daily_digests()');

-- Reminder delay per project. Null switches reminders off for that project.
alter table public.projects
  add column reminder_days integer default 3 check (reminder_days is null or reminder_days between 1 and 30);

drop function public.queue_review_reminders(interval);
create function public.queue_review_reminders(p_after interval default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  queued integer;
begin
  with due as (
    select c.id, c.project_id, c.author_guest_id, p.reminder_days
    from public.comments c
    join public.projects p on p.id = c.project_id and p.archived_at is null and p.reminder_days is not null
    where c.status = 'resolved' and c.client_review = 'pending' and c.author_guest_id is not null
      and c.resolved_at <= now() - coalesce(p_after, make_interval(days => p.reminder_days))
      and not exists (
        select 1 from public.activity a
        where a.comment_id = c.id and a.action = 'client.reminded' and a.created_at >= c.resolved_at)
  ), logged as (
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action, meta)
    select project_id, id, null, 'Reminder', 'client.reminded', jsonb_build_object('days', reminder_days) from due
  ), added as (
    insert into public.jobs (kind, payload, idempotency_key)
    select distinct 'notify',
           jsonb_build_object('event', 'review.reminder', 'project_id', project_id, 'guest_id', author_guest_id),
           'notify:remind:' || project_id || ':' || author_guest_id || ':' || to_char(now() at time zone 'utc', 'YYYY-MM-DD')
    from due
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into queued from added;
  return queued;
end;
$$;
revoke execute on function public.queue_review_reminders(interval) from public, anon, authenticated;
