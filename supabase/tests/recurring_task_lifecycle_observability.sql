-- constrained-sql-fixture: true
-- Exercises lifecycle signals, per-Series coverage retry, and authorization
-- around the narrow service-role prewarming boundary.
begin;

select public.sql_fixture_create_auth_user(
  '69000000-0000-0000-0000-000000000001',
  'recurring-observability-owner@example.test'
);
select public.sql_fixture_create_auth_user(
  '69000000-0000-0000-0000-000000000002',
  'recurring-observability-other@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"69000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table lifecycle_observability_fixture_state (
  active_series_id uuid not null,
  retry_series_id uuid not null,
  paused_series_id uuid not null,
  ended_series_id uuid not null,
  active_create_request jsonb not null
) on commit drop;

do $setup$
declare
  active_request jsonb := jsonb_build_object(
    'userId', '69000000-0000-0000-0000-000000000001',
    'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
    'recurrenceAnchor', '2026-08-01',
    'activationDate', '2026-08-01',
    'timeZone', 'America/Los_Angeles',
    'defaults', jsonb_build_object(
      'title', 'ISSUE690_SECRET_TITLE',
      'description', 'ISSUE690_SECRET_DESCRIPTION',
      'priority', 1,
      'categoryId', null,
      'dueTime', null
    ),
    'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
    'idempotencyKey', 'create-active-690'
  );
  retry_request jsonb := jsonb_build_object(
    'userId', '69000000-0000-0000-0000-000000000001',
    'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
    'recurrenceAnchor', '2026-08-01',
    'activationDate', '2026-08-01',
    'timeZone', 'America/Los_Angeles',
    'defaults', jsonb_build_object(
      'title', 'ISSUE690_RETRY_TITLE',
      'description', 'ISSUE690_RETRY_DESCRIPTION',
      'priority', 1,
      'categoryId', null,
      'dueTime', null
    ),
    'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-01'),
    'idempotencyKey', 'create-retry-690'
  );
  outcome jsonb;
  pause_outcome jsonb;
  end_outcome jsonb;
  active_series_id uuid;
  retry_series_id uuid;
  paused_series_id uuid;
  ended_series_id uuid;
begin
  outcome := public.recurring_task_lifecycle('create-series', active_request);
  if outcome->>'status' <> 'complete' then
    raise exception 'Active Series setup failed: %', outcome;
  end if;
  active_series_id := (outcome->'series'->>'id')::uuid;

  outcome := public.recurring_task_lifecycle('create-series', retry_request);
  if outcome->>'status' <> 'complete' then
    raise exception 'Retryable Series setup failed: %', outcome;
  end if;
  retry_series_id := (outcome->'series'->>'id')::uuid;

  outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '69000000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'ISSUE690_PAUSED_TITLE'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-03'),
      'idempotencyKey', 'create-paused-690'
    )
  );
  if outcome->>'status' <> 'complete' then
    raise exception 'Paused Series setup failed: %', outcome;
  end if;
  paused_series_id := (outcome->'series'->>'id')::uuid;

  pause_outcome := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '69000000-0000-0000-0000-000000000001',
      'seriesId', paused_series_id,
      'effectiveDate', '2026-08-03',
      'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-04')
    )
  );
  if pause_outcome->>'status' <> 'complete'
     or coalesce((pause_outcome->'observability'->>'intentionalAbsences')::integer, 0) < 1
     or coalesce((pause_outcome->'observability'->>'withdrawnOccurrences')::integer, 0) < 1 then
    raise exception 'Paused Series did not expose absence and withdrawal counts: %', pause_outcome;
  end if;

  outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '69000000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'ISSUE690_ENDED_TITLE'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-03'),
      'idempotencyKey', 'create-ended-690'
    )
  );
  if outcome->>'status' <> 'complete' then
    raise exception 'Ended Series setup failed: %', outcome;
  end if;
  ended_series_id := (outcome->'series'->>'id')::uuid;

  end_outcome := public.recurring_task_lifecycle(
    'end-series',
    jsonb_build_object(
      'userId', '69000000-0000-0000-0000-000000000001',
      'seriesId', ended_series_id,
      'effectiveDate', '2026-08-03',
      'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-04')
    )
  );
  if end_outcome->>'status' <> 'complete' then
    raise exception 'Ended Series transition failed: %', end_outcome;
  end if;

  insert into lifecycle_observability_fixture_state (
    active_series_id,
    retry_series_id,
    paused_series_id,
    ended_series_id,
    active_create_request
  ) values (
    active_series_id,
    retry_series_id,
    paused_series_id,
    ended_series_id,
    active_request
  );
end
$setup$;

savepoint before_690_partial_coverage;

create function pg_temp.fail_lifecycle_observability_task_insert()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Issue 690 per-Series retry probe';
end
$function$;

create trigger lifecycle_observability_task_failure_probe
before insert on public.tasks
for each row execute function pg_temp.fail_lifecycle_observability_task_insert();

do $partial$
declare
  state lifecycle_observability_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into state from lifecycle_observability_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'ensure-user-coverage',
    jsonb_build_object(
      'userId', '69000000-0000-0000-0000-000000000001',
      'range', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', 'ensure-user-690'
    )
  );
  if outcome->>'status' <> 'partial'
     or not (outcome->'failedSeriesIds' ? state.retry_series_id::text) then
    raise exception 'Per-Series coverage failure was not isolated: %', outcome;
  end if;
  if (select coverage_horizon from public.recurring_task_series
      where id = state.retry_series_id) <> date '2026-08-01' then
    raise exception 'Failed Series advanced its horizon: %', outcome;
  end if;
end
$partial$;

rollback to savepoint before_690_partial_coverage;

do $retry$
declare
  state lifecycle_observability_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into state from lifecycle_observability_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'ensure-user-coverage',
    jsonb_build_object(
      'userId', '69000000-0000-0000-0000-000000000001',
      'range', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', 'ensure-user-690'
    )
  );
  if outcome->>'status' <> 'complete'
     or (select coverage_horizon from public.recurring_task_series
         where id = state.retry_series_id) <> date '2026-08-05' then
    raise exception 'Partial coverage was not independently retryable: %', outcome;
  end if;
end
$retry$;

do $conflict$
declare
  state lifecycle_observability_fixture_state%rowtype;
  conflict_outcome jsonb;
begin
  select * into state from lifecycle_observability_fixture_state;
  conflict_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_set(state.active_create_request, '{defaults,title}', '"ISSUE690_DIFFERENT_TITLE"'::jsonb)
  );
  if conflict_outcome->>'status' <> 'conflict' then
    raise exception 'Lifecycle conflict was not typed: %', conflict_outcome;
  end if;
end
$conflict$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"69000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

do $authorization$
declare
  state lifecycle_observability_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into state from lifecycle_observability_fixture_state;
  outcome := public.recurring_task_lifecycle('list-active-series', '{}'::jsonb);
  if outcome->>'status' <> 'not-found' then
    raise exception 'Authenticated caller reached the service-only Series list: %', outcome;
  end if;

  outcome := public.recurring_task_lifecycle(
    'prewarm-coverage',
    jsonb_build_object(
      'userId', '69000000-0000-0000-0000-000000000001',
      'seriesId', state.active_series_id,
      'range', jsonb_build_object('from', '2026-08-06', 'to', '2026-08-07'),
      'operationKey', 'unauthorized-prewarm-690',
      'source', 'prewarm'
    )
  );
  if outcome->>'status' <> 'not-found' then
    raise exception 'Authenticated caller reached service prewarming: %', outcome;
  end if;
end
$authorization$;

rollback;
