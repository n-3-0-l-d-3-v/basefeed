begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is((select count(*)::int from cron.job where jobname = 'tick-jobs' and schedule = '* * * * *'), 1, 'the job queue is ticked every minute');

create temp table seen as select coalesce(max(id), 0) as id from net.http_request_queue;
insert into public.jobs (kind, payload, idempotency_key) values ('notify', '{}', 'test:tick');

select public.tick_jobs();
select is((select count(*)::int from net.http_request_queue where id > (select id from seen)), 0, 'until app_url and cron_secret are configured the tick does nothing');

select vault.create_secret('https://app.test/', 'app_url');
select vault.create_secret('s3cret', 'cron_secret');
select public.tick_jobs();
select results_eq(
  $$ select url, headers ->> 'Authorization' from net.http_request_queue where id > (select id from seen) $$,
  $$ values ('https://app.test/api/jobs/run', 'Bearer s3cret') $$,
  'with a ready job it calls the runner with the cron secret');

delete from public.jobs;
select public.tick_jobs();
select is((select count(*)::int from net.http_request_queue where id > (select id from seen)), 1, 'an idle queue makes no requests');

select * from finish();
rollback;
