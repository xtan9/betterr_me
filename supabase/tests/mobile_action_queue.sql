-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68300000-0000-0000-0000-000000000001','queue-owner@example.test');
select public.sql_fixture_create_auth_user('68300000-0000-0000-0000-000000000002','queue-other@example.test');
select set_config('request.jwt.claims','{"sub":"68300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare task jsonb; request jsonb; result jsonb; saved jsonb; rules_request jsonb;
begin
  task := public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Overseed 中文","estimate_minutes":120}')->'task';
  request := jsonb_build_object('operation','queue','operationId',gen_random_uuid(),'expectedVersion',null,'taskIds',jsonb_build_array(task->>'id'));
  if public.action_queue_command(request)->>'status' <> 'complete' then raise exception 'queue save failed'; end if;
  if public.action_queue_command(request)->>'status' <> 'already-applied' then raise exception 'queue replay failed'; end if;
  if public.action_queue_command(request || '{"taskIds":[]}')->>'status' <> 'conflict' then raise exception 'changed payload replay allowed'; end if;
  saved := public.action_queue_snapshot('2026-09-21T17:00:00Z',80);
  if saved->'queue' <> request->'taskIds' then raise exception 'queue order not persisted'; end if;
  if saved->'tasks'->0->'facts'->>'fitsGap' <> 'false' then raise exception 'oversized task fits gap'; end if;
  rules_request := jsonb_build_object('operation','rules','operationId',gen_random_uuid(),'expectedVersion',null,
    'expectedTaskVersion',task->>'version','taskId',task->>'id','waiting',true,'timezone','America/Los_Angeles',
    'windows','[{"day":1,"start":"09:00","end":"12:00"}]'::jsonb,'dependencyIds','[]'::jsonb);
  if public.action_queue_command(rules_request)->>'status' <> 'complete' then raise exception 'waiting save failed'; end if;
  result := public.action_queue_snapshot('2026-09-21T17:00:00Z',80);
  if not (result->'tasks'->0->'facts'->'reasons' ? 'waiting') then raise exception 'waiting not respected'; end if;
  if public.action_queue_command(rules_request || jsonb_build_object('operationId',gen_random_uuid()))->>'status' <> 'conflict' then
    raise exception 'stale rules allowed'; end if;
  request := request || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',saved->'version','taskIds','[]'::jsonb);
  if public.action_queue_command(request)->>'status' <> 'complete' then raise exception 'queue removal failed'; end if;
  if not exists(select 1 from public.tasks where id=(task->>'id')::uuid) then raise exception 'queue removal deleted task'; end if;
  if exists(select 1 from public.calendar_events) then raise exception 'queue reserved calendar time'; end if;
  perform set_config('request.jwt.claims','{"sub":"68300000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists(select 1 from public.task_action_rules) or exists(select 1 from public.action_queue_state)
    or exists(select 1 from public.action_queue_receipts) then raise exception 'cross-account read allowed'; end if;
  request := jsonb_build_object('operation','queue','operationId',gen_random_uuid(),'expectedVersion',null,'taskIds',jsonb_build_array(task->>'id'));
  if public.action_queue_command(request)->>'status' <> 'not-found' then raise exception 'cross-account reference allowed'; end if;
  if public.action_queue_command(rules_request || jsonb_build_object('operationId',gen_random_uuid()))->>'status' <> 'not-found' then
    raise exception 'cross-account rules edit allowed'; end if;
end $$;
rollback;
