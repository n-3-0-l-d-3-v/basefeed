-- Retries and stalled jobs need a clock. Vercel's free plan only runs crons daily, so the database
-- drives the queue: pg_cron ticks every minute and, only when a job is ready, pg_net calls the
-- app's /api/jobs/run with the cron secret. Configure once per deployment:
--   select vault.create_secret('https://YOUR-APP', 'app_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Until both exist (local development) the tick does nothing; the app drains after each write anyway.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.tick_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare
  app_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if app_url is null or secret is null then return; end if;
  -- Same readiness rule as claim_jobs(), so an idle project makes no requests at all.
  if not exists (
    select 1 from public.jobs
    where attempts < max_attempts
      and ((status = 'queued' and run_after <= now())
        or (status = 'running' and locked_at < now() - interval '5 minutes'))
  ) then return; end if;
  perform net.http_get(
    url := rtrim(app_url, '/') || '/api/jobs/run',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000);
end;
$$;
revoke execute on function public.tick_jobs() from public, anon, authenticated;

select cron.schedule('tick-jobs', '* * * * *', 'select public.tick_jobs()');
