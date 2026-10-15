-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68400000-0000-0000-0000-000000000001', 'planned-owner@example.test');
select public.sql_fixture_create_auth_user('68400000-0000-0000-0000-000000000002', 'planned-other@example.test');
select set_config('request.jwt.claims', '{"sub":"68400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare original jsonb; saved jsonb; moved jsonb; result jsonb; operation uuid := gen_random_uuid();
begin
  original := public.task_capture_command('create', gen_random_uuid(), null, null,
    '{"title":"Plan a day","due_date":"2026-11-15","estimate_minutes":30}')->'task';
  saved := public.task_capture_command('edit', operation, (original->>'id')::uuid,
    (original->>'version')::uuid, '{"planned_date":"2026-10-17"}');
  if saved->>'status' <> 'complete' or saved->'task'->>'planned_date' is distinct from '2026-10-17'
    or saved->'task'->>'due_date' is distinct from '2026-11-15'
    or saved->'task'->>'estimate_minutes' is distinct from '30'
    or saved->'task'->>'is_completed' is distinct from 'false' then
    raise exception 'date-only scheduling did not preserve task: %', saved;
  end if;
  if exists(select 1 from public.calendar_events where task_id=(original->>'id')::uuid) then
    raise exception 'scheduling a day reserved calendar time';
  end if;
  result := public.task_capture_command('edit', operation, (original->>'id')::uuid,
    (original->>'version')::uuid, '{"planned_date":"2026-10-17"}');
  if result->>'status' <> 'already-applied' or result->'task' <> saved->'task' then
    raise exception 'retry did not return the same saved date';
  end if;
  result := public.task_capture_command('edit', operation, (original->>'id')::uuid,
    (original->>'version')::uuid, '{"planned_date":"2026-10-18"}');
  if result->>'status' <> 'conflict' then raise exception 'operation id reused with another date'; end if;
  moved := public.task_capture_command('edit', gen_random_uuid(), (original->>'id')::uuid,
    (saved->'task'->>'version')::uuid, '{"planned_date":"2028-02-29"}');
  if moved->>'status' <> 'complete' or moved->'task'->>'planned_date' is distinct from '2028-02-29' then
    raise exception 'reschedule did not replace date';
  end if;
  result := public.task_capture_command('edit', gen_random_uuid(), (original->>'id')::uuid,
    (saved->'task'->>'version')::uuid, '{"planned_date":"2026-10-20"}');
  if result->>'status' <> 'conflict' then raise exception 'stale schedule overwrote newer date'; end if;
  result := public.task_capture_command('edit', gen_random_uuid(), (original->>'id')::uuid,
    (moved->'task'->>'version')::uuid, '{"planned_date":"2026-02-30"}');
  if result->>'status' <> 'invalid-transition' then raise exception 'impossible date accepted'; end if;
  result := public.task_capture_command('edit', gen_random_uuid(), (original->>'id')::uuid,
    (moved->'task'->>'version')::uuid, '{"planned_date":null}');
  if result->>'status' <> 'complete' or result->'task'->'planned_date' <> 'null'::jsonb
    or result->'task'->>'due_date' <> '2026-11-15' then raise exception 'clear changed the deadline'; end if;
  update public.tasks set is_completed=true where id=(original->>'id')::uuid;
  select to_jsonb(t) into moved from public.tasks t where id=(original->>'id')::uuid;
  result := public.task_capture_command('edit', gen_random_uuid(), (original->>'id')::uuid,
    (moved->>'version')::uuid, '{"planned_date":"2026-10-20"}');
  if result->>'status' <> 'invalid-transition' then raise exception 'completed task was rescheduled'; end if;
  perform set_config('request.jwt.claims','{"sub":"68400000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  result := public.task_capture_command('edit', gen_random_uuid(), (original->>'id')::uuid,
    (moved->>'version')::uuid, '{"planned_date":"2026-10-20"}');
  if result->>'status' <> 'not-found' then raise exception 'another owner scheduled private task'; end if;
end $$;
rollback;
