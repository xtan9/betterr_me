-- constrained-sql-fixture: true
-- Isolated fixture: transaction rolls back all test identities and records.
begin;
select public.sql_fixture_create_auth_user('68200000-0000-0000-0000-000000000001', 'mobile-task-owner@example.test');
select public.sql_fixture_create_auth_user('68200000-0000-0000-0000-000000000002', 'mobile-task-other@example.test');
select set_config('request.jwt.claims', '{"sub":"68200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare result jsonb; replay jsonb;
begin
 result := public.task_capture_command('create', '68200000-0000-0000-0000-000000000003', null, null,
   '{"title":"Read 中文","estimate_minutes":30,"due_date":"2026-09-30"}');
 if result->>'status' <> 'complete' or result->'task'->>'title' <> 'Read 中文' then
   raise exception 'capture failed: %', result;
 end if;
 replay := public.task_capture_command('create', '68200000-0000-0000-0000-000000000003', null, null,
   '{"title":"Read 中文","estimate_minutes":30,"due_date":"2026-09-30"}');
 if replay->>'status' <> 'already-applied' or replay->'task' <> result->'task' then
   raise exception 'retry did not return original receipt';
 end if;
 if (select count(*) from public.tasks) <> 1 then raise exception 'duplicate capture'; end if;
end $$;
rollback;
