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

-- Both copies of a repeated local window are allowed; the gap between them is not.
select set_config('request.jwt.claims','{"sub":"68300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare task jsonb; facts jsonb; example record;
begin
  task := public.task_capture_command('create',gen_random_uuid(),null,null,
    '{"title":"Repeated-hour availability","estimate_minutes":30}')->'task';
  if public.action_queue_command(jsonb_build_object('operation','rules','operationId',gen_random_uuid(),
    'expectedVersion',null,'expectedTaskVersion',task->>'version','taskId',task->>'id',
    'waiting',false,'timezone','America/New_York','dependencyIds','[]'::jsonb,
    'windows','[{"day":0,"start":"01:15","end":"01:45"}]'::jsonb))->>'status' is distinct from 'complete' then
    raise exception 'repeated-hour rules save failed';
  end if;
  for example in select * from (values
    ('2026-11-01T05:15:00Z'::timestamptz,true,null::text),
    ('2026-11-01T05:20:00Z',false,'window-too-short'),
    ('2026-11-01T05:45:00Z',false,'unavailable'),
    ('2026-11-01T05:50:00Z',false,'unavailable'),
    ('2026-11-01T06:00:00Z',false,'unavailable'),
    ('2026-11-01T06:15:00Z',true,null),
    ('2026-11-01T06:20:00Z',false,'window-too-short'),
    ('2026-11-01T06:45:00Z',false,'unavailable')
  ) examples(at, fits, reason) loop
    select value->'facts' into facts from jsonb_array_elements(public.action_queue_snapshot(example.at,30)->'tasks')
      where value->>'id'=task->>'id';
    if (facts->>'fitsGap')::boolean is distinct from example.fits
      or (example.reason is not null and not (facts->'reasons' ? example.reason)) then
      raise exception 'repeated-hour mismatch at %: %', example.at, facts;
    end if;
  end loop;
end $$;

-- Continuous weekly coverage has no artificial date horizon, even for the
-- largest estimate accepted by task capture.
do $$
declare task jsonb; facts jsonb; windows jsonb; estimate integer;
begin
  select jsonb_agg(jsonb_build_object('day',day,'start','00:00','end','24:00')) into windows
    from generate_series(0,6) day;
  foreach estimate in array array[14400,2147483647] loop
    task := public.task_capture_command('create',gen_random_uuid(),null,null,
      jsonb_build_object('title','Continuous weekly availability','estimate_minutes',estimate))->'task';
    if public.action_queue_command(jsonb_build_object('operation','rules','operationId',gen_random_uuid(),
      'expectedVersion',null,'expectedTaskVersion',task->>'version','taskId',task->>'id',
      'waiting',false,'timezone','America/New_York','dependencyIds','[]'::jsonb,'windows',windows))->>'status'
      is distinct from 'complete' then raise exception 'continuous weekly rules save failed'; end if;
    select value->'facts' into facts from jsonb_array_elements(
      public.action_queue_snapshot('2026-10-26T04:00:00Z',estimate)->'tasks') where value->>'id'=task->>'id';
    if facts->>'fitsGap' is distinct from 'true' or facts->>'actionable' is distinct from 'true' then
      raise exception 'continuous weekly coverage incorrectly rejects % minutes: %',estimate,facts;
    end if;
  end loop;
end $$;

-- Spring-forward removes the only weekly gap once. Continuous fit may then
-- extend beyond eight days, but must stop at the next real weekly gap.
do $$
declare task jsonb; facts jsonb; windows jsonb; example record;
begin
  select jsonb_agg(jsonb_build_object('day',day,'start','00:00','end','24:00')) into windows
    from generate_series(1,6) day;
  windows := windows || '[{"day":0,"start":"00:00","end":"02:00"},{"day":0,"start":"03:00","end":"24:00"}]'::jsonb;
  for example in select * from (values (14400,true),(28800,false),(2147483647,false)) examples(estimate,fits) loop
    task := public.task_capture_command('create',gen_random_uuid(),null,null,
      jsonb_build_object('title','Weekly gap removed by spring-forward','estimate_minutes',example.estimate))->'task';
    if public.action_queue_command(jsonb_build_object('operation','rules','operationId',gen_random_uuid(),
      'expectedVersion',null,'expectedTaskVersion',task->>'version','taskId',task->>'id',
      'waiting',false,'timezone','America/New_York','dependencyIds','[]'::jsonb,'windows',windows))->>'status'
      is distinct from 'complete' then raise exception 'spring-forward rules save failed'; end if;
    select value->'facts' into facts from jsonb_array_elements(
      public.action_queue_snapshot('2026-03-02T05:00:00Z',example.estimate)->'tasks') where value->>'id'=task->>'id';
    if (facts->>'fitsGap')::boolean is distinct from example.fits then
      raise exception 'spring-forward weekly gap mismatch for % minutes: %',example.estimate,facts;
    end if;
  end loop;
end $$;

-- Lord Howe repeats only 30 minutes. Session timezone must not alter the
-- calendar dates used to expand the rule's explicitly named timezone.
set local timezone = 'Pacific/Auckland';
do $$
declare task jsonb; facts jsonb; example record;
begin
  task := public.task_capture_command('create',gen_random_uuid(),null,null,
    '{"title":"Half-hour fall-back","estimate_minutes":10}')->'task';
  if public.action_queue_command(jsonb_build_object('operation','rules','operationId',gen_random_uuid(),
    'expectedVersion',null,'expectedTaskVersion',task->>'version','taskId',task->>'id',
    'waiting',false,'timezone','Australia/Lord_Howe','dependencyIds','[]'::jsonb,
    'windows','[{"day":0,"start":"01:40","end":"01:50"}]'::jsonb))->>'status'
    is distinct from 'complete' then raise exception 'half-hour rules save failed'; end if;
  for example in select * from (values
    ('2026-04-04T14:40:00Z'::timestamptz,true,null::text),
    ('2026-04-04T14:45:00Z',false,'window-too-short'),
    ('2026-04-04T14:55:00Z',false,'unavailable'),
    ('2026-04-04T15:00:00Z',false,'unavailable'),
    ('2026-04-04T15:10:00Z',true,null),
    ('2026-04-04T15:20:00Z',false,'unavailable')
  ) examples(at,fits,reason) loop
    select value->'facts' into facts from jsonb_array_elements(public.action_queue_snapshot(example.at,10)->'tasks')
      where value->>'id'=task->>'id';
    if (facts->>'fitsGap')::boolean is distinct from example.fits
      or (example.reason is not null and not (facts->'reasons' ? example.reason)) then
      raise exception 'half-hour mismatch at %: %',example.at,facts;
    end if;
  end loop;
end $$;
rollback;
