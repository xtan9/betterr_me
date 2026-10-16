-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68500000-0000-0000-0000-000000000001', 'period-owner@example.test');
select public.sql_fixture_create_auth_user('68500000-0000-0000-0000-000000000002', 'period-other@example.test');
select set_config('request.jwt.claims', '{"sub":"68500000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare saved jsonb; replay jsonb; operation uuid := gen_random_uuid();
  changes jsonb := '{"title":"Morning task","due_date":"2026-11-15","estimate_minutes":30,"planned_date":"2026-10-17","planned_period":"morning"}';
begin
  saved := public.task_capture_command('create', operation, null, null, changes);
  if saved->>'status' is distinct from 'complete'
    or saved->'task'->>'planned_date' is distinct from '2026-10-17'
    or saved->'task'->>'planned_period' is distinct from 'morning'
    or saved->'task'->>'due_date' is distinct from '2026-11-15'
    or saved->'task'->>'estimate_minutes' is distinct from '30'
    or saved->'task'->>'is_completed' is distinct from 'false' then
    raise exception 'task was not created atomically in Morning: %', saved;
  end if;
  if exists(select 1 from public.calendar_events where task_id=(saved->'task'->>'id')::uuid) then
    raise exception 'a planned period reserved calendar time';
  end if;
  replay := public.task_capture_command('create', operation, null, null, changes);
  if replay->>'status' is distinct from 'already-applied' or replay->'task' is distinct from saved->'task'
    or (select count(*) from public.tasks where title='Morning task') <> 1 then
    raise exception 'retry duplicated a task or lost its saved placement';
  end if;
  replay := public.task_capture_command('create', operation, null, null, changes || '{"planned_period":"evening"}');
  if replay->>'status' is distinct from 'conflict' then raise exception 'operation reuse changed the period'; end if;
end $$;

do $$
declare task jsonb; previous jsonb; result jsonb; operation uuid := gen_random_uuid();
begin
  task := public.task_capture_command('create', gen_random_uuid(), null, null,
    '{"title":"Move one task","planned_date":"2026-10-17","planned_period":"morning"}')->'task';
  previous := task;
  result := public.task_capture_command('edit', operation, (task->>'id')::uuid,
    (task->>'version')::uuid, '{"planned_period":"afternoon"}');
  if result->>'status' is distinct from 'complete'
    or result->'task'->>'id' is distinct from task->>'id'
    or result->'task'->>'planned_date' is distinct from '2026-10-17'
    or result->'task'->>'planned_period' is distinct from 'afternoon' then
    raise exception 'changing period did not preserve task and date: %', result;
  end if;
  task := result->'task';
  result := public.task_capture_command('edit', gen_random_uuid(), (task->>'id')::uuid,
    (previous->>'version')::uuid, '{"planned_period":"evening"}');
  if result->>'status' is distinct from 'conflict' then raise exception 'stale placement overwrote a newer edit'; end if;
  result := public.task_capture_command('edit', operation, (task->>'id')::uuid,
    (previous->>'version')::uuid, '{"planned_period":"afternoon"}');
  if result->>'status' is distinct from 'already-applied' or result->'task' is distinct from task then
    raise exception 'placement retry did not return its original receipt';
  end if;
  result := public.task_capture_command('edit', gen_random_uuid(), (task->>'id')::uuid,
    (task->>'version')::uuid, '{"planned_date":"2028-02-29"}');
  if result->>'status' is distinct from 'complete'
    or result->'task'->>'planned_date' is distinct from '2028-02-29'
    or result->'task'->>'planned_period' is distinct from 'afternoon' then
    raise exception 'legacy date-only move lost the period: %', result;
  end if;
  task := result->'task';
  result := public.task_capture_command('edit', gen_random_uuid(), (task->>'id')::uuid,
    (task->>'version')::uuid, '{"title":"Edited by older client"}');
  if result->>'status' is distinct from 'complete' or result->'task'->>'planned_period' is distinct from 'afternoon' then
    raise exception 'legacy metadata command lost the period';
  end if;
  task := result->'task';
  result := public.task_capture_command('edit', gen_random_uuid(), (task->>'id')::uuid,
    (task->>'version')::uuid, '{"planned_period":null}');
  if result->>'status' is distinct from 'complete' or result->'task'->'planned_period' is distinct from 'null'::jsonb
    or result->'task'->>'planned_date' is distinct from '2028-02-29' then
    raise exception 'Anytime removed the planned date';
  end if;
  task := result->'task';
  task := public.task_capture_command('edit', gen_random_uuid(), (task->>'id')::uuid,
    (task->>'version')::uuid, '{"planned_period":"evening"}')->'task';
  result := public.task_capture_command('edit', gen_random_uuid(), (task->>'id')::uuid,
    (task->>'version')::uuid, '{"planned_date":null}');
  if result->>'status' is distinct from 'complete' or result->'task'->'planned_date' is distinct from 'null'::jsonb
    or result->'task'->'planned_period' is distinct from 'null'::jsonb then
    raise exception 'clearing the date retained its period';
  end if;
  task := result->'task';
  result := public.task_capture_command('edit', gen_random_uuid(), (task->>'id')::uuid,
    (task->>'version')::uuid, '{"planned_period":"morning"}');
  if result->>'status' is distinct from 'invalid-transition' then raise exception 'period without a date was accepted'; end if;
end $$;

-- Invalid or aborted creation cannot leave an unscheduled orphan or receipt.
do $$
declare changes jsonb; result jsonb; operation uuid; before_count bigint;
begin
  select count(*) into before_count from public.tasks;
  for changes in select value from jsonb_array_elements('[
    {"planned_period":"morning"},
    {"planned_date":null,"planned_period":"morning"},
    {"planned_date":"2026-10-17","planned_period":"midnight"},
    {"planned_date":"2026-10-17","planned_period":3},
    {"planned_date":"2026-02-30","planned_period":"morning"}
  ]'::jsonb) loop
    operation := gen_random_uuid();
    result := public.task_capture_command('create', operation, null, null, '{"title":"Invalid placement"}'::jsonb || changes);
    if result->>'status' is distinct from 'invalid-transition'
      or exists(select 1 from public.task_capture_receipts where operation_id=operation) then
      raise exception 'invalid creation persisted a task or receipt: %', result;
    end if;
  end loop;
  operation := gen_random_uuid();
  begin
    result := public.task_capture_command('create', operation, null, null,
      '{"title":"Aborted placement","planned_date":"2026-10-17","planned_period":"morning"}');
    if result->>'status' is distinct from 'complete' then raise exception 'atomic setup failed: %', result; end if;
    raise exception using errcode='PT499', message='simulate transaction failure';
  exception when sqlstate 'PT499' then null;
  end;
  if (select count(*) from public.tasks) <> before_count
    or exists(select 1 from public.task_capture_receipts where operation_id=operation) then
    raise exception 'failed creation left an orphan task or receipt';
  end if;
end $$;

-- Older clients can clear the date without knowing the additive period column.
do $$
declare saved jsonb; current_task public.tasks;
begin
  saved := public.task_capture_command('create', gen_random_uuid(), null, null,
    '{"title":"Legacy date clear","planned_date":"2026-10-17","planned_period":"evening"}')->'task';
  update public.tasks set title='Legacy metadata edit' where id=(saved->>'id')::uuid returning * into current_task;
  if current_task.planned_period is distinct from 'evening' then
    raise exception 'legacy metadata edit lost the chosen period';
  end if;
  update public.tasks set planned_date='2026-10-18' where id=current_task.id returning * into current_task;
  if current_task.planned_period is distinct from 'evening' then raise exception 'legacy direct move lost the period'; end if;
  update public.tasks set planned_date=null where id=current_task.id returning * into current_task;
  if current_task.planned_date is not null or current_task.planned_period is not null then
    raise exception 'legacy date clear retained a period';
  end if;
  begin
    update public.tasks set planned_period='morning' where id=current_task.id;
    raise exception 'direct write accepted a period without a date';
  exception when check_violation then null;
  end;
  begin
    update public.tasks set planned_date='2026-10-18', planned_period='invalid' where id=current_task.id;
    raise exception 'direct write accepted an unknown period';
  exception when check_violation then null;
  end;
end $$;

-- A recurring occurrence's immutable series position is not a movable placement.
do $$
declare result jsonb; task public.tasks;
begin
  result := public.recurring_task_lifecycle('create-series', jsonb_build_object(
    'userId','68500000-0000-0000-0000-000000000001',
    'recurrenceRule',jsonb_build_object('frequency','daily','interval',1),
    'recurrenceAnchor','2026-10-17','activationDate','2026-10-17','timeZone','UTC',
    'defaults',jsonb_build_object('title','Recurring period boundary'),
    'coverage',jsonb_build_object('from','2026-10-17','to','2026-10-17'),
    'idempotencyKey','planned-period-recurring-setup'));
  if result->>'status' is distinct from 'complete' then raise exception 'recurring setup failed: %', result; end if;
  select * into strict task from public.tasks where recurring_series_id=(result->'series'->>'id')::uuid;
  result := public.task_capture_command('edit', gen_random_uuid(), task.id, task.version,
    '{"planned_date":"2026-10-18","planned_period":"morning"}');
  if result->>'status' is distinct from 'invalid-transition' then raise exception 'recurring task was scheduled as standalone'; end if;
  result := public.task_capture_command('edit', gen_random_uuid(), task.id, task.version, '{"planned_period":null}');
  if result->>'status' is distinct from 'invalid-transition' then raise exception 'recurring task accepted a period-only edit'; end if;
end $$;

-- Completion retains placement; subsequent placement edits remain prohibited.
do $$
declare task public.tasks; result jsonb;
begin
  result := public.task_capture_command('create', gen_random_uuid(), null, null,
    '{"title":"Complete in place","planned_date":"2026-10-17","planned_period":"morning"}');
  update public.tasks set is_completed=true where id=(result->'task'->>'id')::uuid returning * into task;
  if task.planned_date is distinct from '2026-10-17'::date or task.planned_period is distinct from 'morning' then
    raise exception 'completion discarded task placement';
  end if;
  result := public.task_capture_command('edit', gen_random_uuid(), task.id, task.version, '{"planned_period":"afternoon"}');
  if result->>'status' is distinct from 'invalid-transition' then raise exception 'completed task was regrouped'; end if;
  result := public.task_capture_command('edit', gen_random_uuid(), task.id, task.version, '{"planned_date":null}');
  if result->>'status' is distinct from 'invalid-transition' then raise exception 'completed task was unscheduled'; end if;
  update public.tasks set is_completed=false where id=task.id returning * into task;
  if task.planned_period is distinct from 'morning' then raise exception 'reopening discarded task placement'; end if;
  perform set_config('request.jwt.claims','{"sub":"68500000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  result := public.task_capture_command('edit', gen_random_uuid(), task.id, task.version, '{"planned_period":"evening"}');
  if result->>'status' is distinct from 'not-found' then raise exception 'another owner regrouped private task'; end if;
  if exists(select 1 from public.tasks where id=task.id) or exists(select 1 from public.task_capture_receipts) then
    raise exception 'another owner read private placement or receipts';
  end if;
end $$;
rollback;
