-- constrained-sql-fixture: true
-- Isolated fixture: transaction rolls back all test identities and records.
begin;
select public.sql_fixture_create_auth_user('68200000-0000-0000-0000-000000000001', 'mobile-task-owner@example.test');
select public.sql_fixture_create_auth_user('68200000-0000-0000-0000-000000000002', 'mobile-task-other@example.test');
select set_config('request.jwt.claims', '{"sub":"68200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare result jsonb; replay jsonb; current_task jsonb; stale jsonb; archived jsonb;
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
 if exists(select 1 from public.calendar_events) then raise exception 'capture reserved calendar time'; end if;
 update public.tasks set description='Preserve notes',due_time='14:30',priority=3
 where id=(result->'task'->>'id')::uuid;
 stale := public.task_capture_command('edit','68200000-0000-0000-0000-000000000004',
   (result->'task'->>'id')::uuid,(result->'task'->>'version')::uuid,'{"title":"Stale"}');
 if stale->>'status' <> 'conflict' then raise exception 'stale native edit allowed'; end if;
 select to_jsonb(t) into current_task from public.tasks t where id=(result->'task'->>'id')::uuid;
 result := public.task_capture_command('edit','68200000-0000-0000-0000-000000000005',
   (current_task->>'id')::uuid,(current_task->>'version')::uuid,'{"estimate_minutes":45}');
 if result->>'status' <> 'complete' or result->'task'->>'description' <> 'Preserve notes'
   or result->'task'->>'due_time' <> '14:30:00' or result->'task'->>'priority' <> '3' then
   raise exception 'estimate edit lost richer fields';
 end if;
 stale := public.task_command_atomic('edit',jsonb_build_object('userId',current_task->>'user_id',
   'taskId',current_task->>'id','idempotencyKey','stale-web-edit',
   'expectedTaskVersion',current_task->>'version','updates',jsonb_build_object('title','Stale web')));
 if stale->>'status' <> 'conflict' then raise exception 'stale web edit allowed'; end if;
 archived := public.task_capture_command('archive','68200000-0000-0000-0000-000000000006',
   (result->'task'->>'id')::uuid,(result->'task'->>'version')::uuid);
 if archived->>'status' <> 'complete' or archived->'task'->>'archived_at' is null
   or archived->'task'->>'is_completed' <> 'false' then raise exception 'archive changed completion'; end if;
 result := public.task_capture_command('unarchive','68200000-0000-0000-0000-000000000007',
   (archived->'task'->>'id')::uuid,(archived->'task'->>'version')::uuid);
 if result->>'status' <> 'complete' or result->'task'->>'archived_at' is not null
   or result->'task'->>'description' <> 'Preserve notes' then raise exception 'unarchive lost history'; end if;
 perform set_config('request.jwt.claims','{"sub":"68200000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if exists(select 1 from public.tasks) or exists(select 1 from public.task_capture_receipts) then
   raise exception 'second account can read private records'; end if;
 stale := public.task_capture_command('archive','68200000-0000-0000-0000-000000000008',
   (result->'task'->>'id')::uuid,(result->'task'->>'version')::uuid);
 if stale->>'status' <> 'not-found' then raise exception 'second account can mutate known task'; end if;
end $$;
rollback;
