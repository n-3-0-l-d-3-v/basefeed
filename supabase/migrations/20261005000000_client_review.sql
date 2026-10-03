-- Closing the loop with the client. When the team resolves a comment a client left, the client is
-- asked to confirm the fix ("pending"). They answer from the site: "approved" keeps it resolved,
-- "rejected" reopens it with their note. Nobody has to chase a sign-off by hand.

alter table public.comments
  add column client_review text check (client_review in ('pending', 'approved', 'rejected')),
  add column client_reviewed_at timestamptz;

-- Resolving a client's comment starts the review; reopening it before they answered cancels it.
create function public.comment_client_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.author_guest_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status = 'resolved' then
    new.client_review := 'pending';
    new.client_reviewed_at := null;
  elsif old.status = 'resolved' and new.client_review = 'pending' then
    new.client_review := null;
  end if;
  return new;
end;
$$;
create trigger comments_client_review before update on public.comments for each row execute function public.comment_client_review();

-- Tell the client there is something to confirm, and the team when a fix is sent back.
create function public.queue_review_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_review = 'pending' and old.client_review is distinct from 'pending' then
    insert into public.jobs (kind, payload, idempotency_key)
    values ('notify', jsonb_build_object('event', 'review.requested', 'comment_id', new.id),
            'notify:review:' || new.id || ':' || extract(epoch from new.updated_at))
    on conflict (idempotency_key) do nothing;
  elsif new.client_review = 'rejected' and old.client_review is distinct from 'rejected' then
    insert into public.jobs (kind, payload, idempotency_key)
    values ('notify', jsonb_build_object('event', 'review.rejected', 'comment_id', new.id),
            'notify:rejected:' || new.id || ':' || extract(epoch from new.updated_at))
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;
-- Not "update of client_review": the review usually starts in the trigger above, not in the statement.
create trigger comments_review_notify after update on public.comments
  for each row execute function public.queue_review_notifications();

/**
 * The client's answer, from the widget (service role; the guest is identified by their signed token).
 * Only the comment's own author can answer, and only while a review is pending.
 */
create function public.review_comment_as_guest(p_comment uuid, p_project uuid, p_guest uuid, p_approved boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  guest_name text;
begin
  select g.name into guest_name from public.guests g where g.id = p_guest and g.project_id = p_project;
  if guest_name is null then raise exception 'guest not found' using errcode = 'P0002'; end if;
  perform set_config('app.actor_id', '', true);
  perform set_config('app.actor_name', guest_name, true);

  update public.comments set
    client_review = case when p_approved then 'approved' else 'rejected' end,
    client_reviewed_at = now(),
    status = case when p_approved then status else 'open' end
  where id = p_comment and project_id = p_project and author_guest_id = p_guest and client_review = 'pending';
  if not found then raise exception 'nothing to review' using errcode = 'P0002'; end if;

  insert into public.activity (project_id, comment_id, actor_user_id, actor_name, action)
  values (p_project, p_comment, null, guest_name, case when p_approved then 'client.approved' else 'client.rejected' end);

  if not p_approved and nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.replies (comment_id, project_id, author_guest_id, author_name, body)
    values (p_comment, p_project, p_guest, guest_name, left(btrim(p_note), 5000));
  end if;
end;
$$;
revoke execute on function public.review_comment_as_guest(uuid, uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_comment_as_guest(uuid, uuid, uuid, boolean, text) to service_role;
