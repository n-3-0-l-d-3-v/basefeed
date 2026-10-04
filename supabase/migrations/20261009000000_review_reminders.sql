-- Client reminders: when a client has not answered "does this look right?" for three days, remind
-- them once, in one email covering everything of theirs that is waiting on that project. Nobody on
-- the team has to chase. A comment is reminded about once per time it is resolved; the reminder is
-- written to the comment's history, and that history entry is also what stops a second reminder.

create function public.queue_review_reminders(p_after interval default interval '3 days') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  queued integer;
begin
  with due as (
    select c.id, c.project_id, c.author_guest_id
    from public.comments c
    join public.projects p on p.id = c.project_id and p.archived_at is null
    where c.status = 'resolved' and c.client_review = 'pending' and c.author_guest_id is not null
      and c.resolved_at <= now() - p_after
      and not exists (
        select 1 from public.activity a
        where a.comment_id = c.id and a.action = 'client.reminded' and a.created_at >= c.resolved_at)
  ), logged as (
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action)
    select project_id, id, null, 'Reminder', 'client.reminded' from due
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

-- 03:35 UTC, five minutes after the daily digest (09:05 in India).
select cron.schedule('review-reminders', '35 3 * * *', 'select public.queue_review_reminders()');
