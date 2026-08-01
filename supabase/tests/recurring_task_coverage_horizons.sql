-- ralph-ci: true
-- Proves date-bounded reads reconcile an exact local-date horizon, preserve
-- monotonic/idempotent Series state, and report partial multi-Series coverage.

begin;

select public.ralph_ci_create_auth_user(
  '68900000-0000-0000-0000-000000000001',
  'coverage-horizons@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '68900000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"68900000-0000-0000-0000-000000000001"}',
  true
);

create temporary table exact_coverage_fixture_state (
  available_series_id uuid not null,
  failing_series_id uuid not null
) on commit drop;

do $create_series$
declare
  available_outcome jsonb;
  failing_outcome jsonb;
begin
  available_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '68900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-03-08',
      'activationDate', '2026-03-08',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Available Series',
        'description', null,
        'priority', 0,
        'categoryId', null,
        'dueTime', null
      ),
      'coverage', jsonb_build_object('from', '2026-03-08', 'to', '2026-03-08'),
      'idempotencyKey', 'coverage-689-available'
    )
  );
  failing_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '68900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-03-08',
      'activationDate', '2026-03-08',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Failing Series',
        'description', null,
        'priority', 0,
        'categoryId', null,
        'dueTime', null
      ),
      'coverage', jsonb_build_object('from', '2026-03-08', 'to', '2026-03-08'),
      'idempotencyKey', 'coverage-689-failing'
    )
  );
  if available_outcome->>'status' <> 'complete'
     or failing_outcome->>'status' <> 'complete' then
    raise exception 'Fixture Series creation failed: %, %',
      available_outcome, failing_outcome;
  end if;
  insert into exact_coverage_fixture_state(
    available_series_id,
    failing_series_id
  ) values (
    (available_outcome->'series'->>'id')::uuid,
    (failing_outcome->'series'->>'id')::uuid
  );
end
$create_series$;

do $already_covered$
declare
  state exact_coverage_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into state from exact_coverage_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'ensure-user-coverage',
    jsonb_build_object(
      'userId', '68900000-0000-0000-0000-000000000001',
      'range', jsonb_build_object('from', '2026-03-08', 'to', '2026-03-08')
    )
  );
  if outcome->>'status' <> 'complete'
     or (select coverage_horizon from public.recurring_task_series
         where id = state.available_series_id) <> date '2026-03-08'
     or (select coverage_horizon from public.recurring_task_series
         where id = state.failing_series_id) <> date '2026-03-08' then
    raise exception 'Already-covered read did not remain complete: %', outcome;
  end if;
end
$already_covered$;

do $extended$
declare
  state exact_coverage_fixture_state%rowtype;
  outcome jsonb;
  retry_outcome jsonb;
begin
  select * into state from exact_coverage_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '68900000-0000-0000-0000-000000000001',
      'seriesId', state.available_series_id,
      'range', jsonb_build_object('from', '2026-03-08', 'to', '2026-03-10'),
      'idempotencyKey', 'coverage-689-extend'
    )
  );
  retry_outcome := public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '68900000-0000-0000-0000-000000000001',
      'seriesId', state.available_series_id,
      'range', jsonb_build_object('from', '2026-03-08', 'to', '2026-03-10'),
      'idempotencyKey', 'coverage-689-extend'
    )
  );
  if outcome->>'status' <> 'complete'
     or retry_outcome->>'status' <> 'already-applied'
     or (select coverage_horizon from public.recurring_task_series
         where id = state.available_series_id) <> date '2026-03-10'
     or (select count(*) from public.recurring_task_occurrences
         where series_id = state.available_series_id) <> 3 then
    raise exception 'Extended or repeated coverage did not converge: %, %',
      outcome, retry_outcome;
  end if;
end
$extended$;

savepoint before_exact_coverage_partial_probe;

create function pg_temp.fail_one_coverage_series_task()
returns trigger
language plpgsql
as $function$
begin
  if new.title = 'Failing Series' then
    raise exception 'Intentional partial Coverage Horizon failure';
  end if;
  return new;
end
$function$;

create trigger exact_coverage_partial_probe
before insert on public.tasks
for each row execute function pg_temp.fail_one_coverage_series_task();

do $partial$
declare
  state exact_coverage_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into state from exact_coverage_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'ensure-user-coverage',
    jsonb_build_object(
      'userId', '68900000-0000-0000-0000-000000000001',
      'range', jsonb_build_object('from', '2026-03-08', 'to', '2026-03-10')
    )
  );
  if outcome->>'status' <> 'partial'
     or outcome->>'type' <> 'partial'
     or not (outcome->'failedSeriesIds' ? state.failing_series_id::text)
     or (select coverage_horizon from public.recurring_task_series
         where id = state.available_series_id) <> date '2026-03-10'
     or (select coverage_horizon from public.recurring_task_series
         where id = state.failing_series_id) <> date '2026-03-08'
     or (select count(*) from public.recurring_task_occurrences
         where series_id = state.failing_series_id) <> 1 then
    raise exception 'Partial multi-Series coverage was not typed or atomic: %', outcome;
  end if;
end
$partial$;

rollback to savepoint before_exact_coverage_partial_probe;

do $retry$
declare
  state exact_coverage_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into state from exact_coverage_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'ensure-user-coverage',
    jsonb_build_object(
      'userId', '68900000-0000-0000-0000-000000000001',
      'range', jsonb_build_object('from', '2026-03-08', 'to', '2026-03-10')
    )
  );
  if outcome->>'status' <> 'complete'
     or (select coverage_horizon from public.recurring_task_series
         where id = state.failing_series_id) <> date '2026-03-10'
     or (select count(*) from public.recurring_task_occurrences
         where series_id = state.failing_series_id) <> 3 then
    raise exception 'A partial coverage retry did not reconcile the failed Series: %', outcome;
  end if;
end
$retry$;

rollback;
