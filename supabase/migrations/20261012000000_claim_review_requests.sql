-- One sign-off email per batch, made safe against two job runners working at the same moment.
-- Claiming "the comments of this client that are waiting and have not been asked about" and
-- recording that they were asked is one step under a lock, so a second runner arriving at the same
-- instant waits, then finds nothing left to claim, and no client is emailed twice.

create function public.claim_review_requests(p_project uuid, p_guest uuid) returns setof uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project::text || ':' || p_guest::text, 0));
  return query
  with due as (
    select c.id, c.project_id
    from public.comments c
    where c.project_id = p_project and c.author_guest_id = p_guest
      and c.status = 'resolved' and c.client_review = 'pending'
      and not exists (
        select 1 from public.activity a
        where a.comment_id = c.id and a.action = 'client.asked' and a.created_at >= c.resolved_at)
  ), logged as (
    insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action)
    select d.project_id, d.id, null, 'Automation', 'client.asked' from due d
    returning comment_id
  )
  select l.comment_id from logged l;
end;
$$;
revoke execute on function public.claim_review_requests(uuid, uuid) from public, anon, authenticated;
