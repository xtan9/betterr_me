-- ralph-ci: true
-- Proves Series creation and exact Coverage Horizon materialization share one
-- authenticated, idempotent transaction.
begin;

select public.ralph_ci_create_auth_user(
  '67900000-0000-0000-0000-000000000001',
  'recurring-series-coverage@example.test'
);
select public.ralph_ci_create_auth_user(
  '67900000-0000-0000-0000-000000000002',
  'recurring-series-coverage-other@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"67900000-0000-0000-0000-000000000001"}',
  true
);

create temporary table recurring_series_coverage_fixture_state (
  series_id uuid not null,
  create_request jsonb not null,
  coverage_horizon date,
  occurrence_count integer not null,
  task_count integer not null
) on commit drop;

with created as (
  select public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '67900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Atomic daily Series',
        'description', null,
        'priority', 1,
        'categoryId', null,
        'dueTime', null
      ),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-03'),
      'idempotencyKey', 'create-679'
    )
  ) as outcome
), stored as (
  select
    (created.outcome->'series'->>'id')::uuid as series_id,
    jsonb_build_object(
      'userId', '67900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Atomic daily Series',
        'description', null,
        'priority', 1,
        'categoryId', null,
        'dueTime', null
      ),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-03'),
      'idempotencyKey', 'create-679'
    ) as create_request,
    (created.outcome->'series'->>'coverageHorizon')::date as coverage_horizon
  from created
)
insert into recurring_series_coverage_fixture_state (
  series_id,
  create_request,
  coverage_horizon,
  occurrence_count,
  task_count
)
select
  stored.series_id,
  stored.create_request,
  stored.coverage_horizon,
  0,
  0
from stored;

update recurring_series_coverage_fixture_state as state
set occurrence_count = (
      select count(*)::integer
      from public.recurring_task_occurrences occurrence
      where occurrence.series_id = state.series_id
    ),
    task_count = (
      select count(*)::integer
      from public.recurring_task_occurrences occurrence
      where occurrence.series_id = state.series_id
        and occurrence.task_id is not null
    );

do $creation$
declare
  fixture_state recurring_series_coverage_fixture_state%rowtype;
  create_outcome jsonb;
  retry_outcome jsonb;
  conflict_outcome jsonb;
begin
  select * into fixture_state
  from recurring_series_coverage_fixture_state;

  select public.recurring_task_lifecycle(
    'create-series',
    fixture_state.create_request
  ) into retry_outcome;
  if retry_outcome->>'status' <> 'already-applied' then
    raise exception 'Series creation retry did not replay: %', retry_outcome;
  end if;
  if (retry_outcome->'series'->>'id')::uuid <> fixture_state.series_id then
    raise exception 'Series creation retry returned a different Series: %', retry_outcome;
  end if;
  if (select count(*) from public.recurring_task_series
      where user_id = '67900000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Series creation retry duplicated Series rows';
  end if;
  if (select count(*) from public.recurring_task_series_revisions
      where series_id = fixture_state.series_id) <> 1 then
    raise exception 'Series creation did not persist exactly one initial Revision';
  end if;
  if (select count(*) from public.recurring_task_occurrences
      where series_id = fixture_state.series_id) <> fixture_state.occurrence_count then
    raise exception 'Series creation retry duplicated ledger positions: actual %, expected %',
      (select count(*) from public.recurring_task_occurrences
       where series_id = fixture_state.series_id),
      fixture_state.occurrence_count;
  end if;
  if (select count(*) from public.recurring_task_occurrences occurrence
      where occurrence.series_id = fixture_state.series_id
        and occurrence.task_id is not null) <> fixture_state.task_count then
    raise exception 'Series creation retry duplicated Task Occurrences';
  end if;

  conflict_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_set(fixture_state.create_request, '{defaults,title}', '"different intent"'::jsonb)
  );
  if conflict_outcome->>'status' <> 'conflict'
    or conflict_outcome->>'type' <> 'conflict' then
    raise exception 'Idempotency key reuse was not a typed conflict: %', conflict_outcome;
  end if;

  create_outcome := public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '67900000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'range', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-05'),
      'idempotencyKey', 'ensure-679'
    )
  );
  if create_outcome->>'status' <> 'complete'
    or (create_outcome->'series'->>'coverageHorizon')::date <> date '2026-08-05'
    or (select count(*) from public.recurring_task_occurrences
        where series_id = fixture_state.series_id) <> 5
    or (select count(*) from public.recurring_task_occurrences
        where series_id = fixture_state.series_id
          and scheduled_date between date '2026-08-01' and date '2026-08-05') <> 5
    or (select count(*) from public.recurring_task_occurrences occurrence
        where occurrence.series_id = fixture_state.series_id
          and occurrence.task_id is not null) <> 5 then
    raise exception 'Inclusive ensure-coverage did not materialize exact facts: %', create_outcome;
  end if;

  select public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '67900000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'range', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-05'),
      'idempotencyKey', 'ensure-679'
    )
  ) into retry_outcome;
  if retry_outcome->>'status' <> 'already-applied'
    or (select count(*) from public.recurring_task_occurrences
        where series_id = fixture_state.series_id) <> 5 then
    raise exception 'Coverage retry did not converge: %', retry_outcome;
  end if;

  create_outcome := public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '67900000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'range', jsonb_build_object('from', '2026-08-07', 'to', '2026-08-09'),
      'idempotencyKey', 'ensure-gap-679'
    )
  );
  if create_outcome->>'status' <> 'complete'
    or (create_outcome->'series'->>'coverageHorizon')::date <> date '2026-08-09'
    or (select count(*) from public.recurring_task_occurrences
        where series_id = fixture_state.series_id) <> 9
    or not exists (
      select 1
      from public.recurring_task_occurrences
      where series_id = fixture_state.series_id
        and scheduled_date = date '2026-08-06'
    ) then
    raise exception 'Coverage gap was advanced without reconciling every date: %', create_outcome;
  end if;
end
$creation$;

do $stopping_policy$
declare
  outcome jsonb;
  limited_series_id uuid;
begin
  outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '67900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'occurrenceLimit', 2,
      'timeZone', 'UTC',
      'defaults', jsonb_build_object('title', 'Limited Series'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', 'limited-create-679'
    )
  );
  limited_series_id := (outcome->'series'->>'id')::uuid;
  if outcome->>'status' <> 'complete'
    or outcome->'series'->>'status' <> 'ended'
    or (outcome->'series'->>'coverageHorizon')::date <> date '2026-08-05'
    or (select count(*) from public.recurring_task_occurrences
        where series_id = limited_series_id) <> 2 then
    raise exception 'Stopping policy advanced beyond retained history: %', outcome;
  end if;
end
$stopping_policy$;

select set_config(
  'request.jwt.claim.sub',
  '67900000-0000-0000-0000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"67900000-0000-0000-0000-000000000002"}',
  true
);

do $ownership$
declare
  fixture_state recurring_series_coverage_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into fixture_state
  from recurring_series_coverage_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '67900000-0000-0000-0000-000000000002',
      'seriesId', fixture_state.series_id,
      'range', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-06'),
      'idempotencyKey', 'cross-owner-679'
    )
  );
  if outcome->>'status' <> 'not-found' then
    raise exception 'Cross-owner Series access was disclosed: %', outcome;
  end if;
end
$ownership$;

select set_config(
  'request.jwt.claim.sub',
  '67900000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"67900000-0000-0000-0000-000000000001"}',
  true
);

savepoint before_series_coverage_rollback_probe;

create function pg_temp.fail_series_coverage_task_insert()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Series coverage rollback probe';
end
$function$;

create trigger recurring_series_coverage_rollback_probe
before insert on public.tasks
for each row execute function pg_temp.fail_series_coverage_task_insert();

do $rollback$
declare
  fixture_state recurring_series_coverage_fixture_state%rowtype;
  before_series_count integer;
  before_occurrence_count integer;
  before_horizon date;
begin
  select * into fixture_state
  from recurring_series_coverage_fixture_state;
  select count(*) into before_series_count
  from public.recurring_task_series;
  select count(*) into before_occurrence_count
  from public.recurring_task_occurrences
  where series_id = fixture_state.series_id;
  select coverage_horizon into before_horizon
  from public.recurring_task_series
  where id = fixture_state.series_id;

  begin
    perform public.recurring_task_lifecycle(
      'ensure-coverage',
      jsonb_build_object(
        'userId', '67900000-0000-0000-0000-000000000001',
        'seriesId', fixture_state.series_id,
        'range', jsonb_build_object('from', '2026-08-10', 'to', '2026-08-12'),
        'idempotencyKey', 'rollback-ensure-679'
      )
    );
    raise exception 'Rollback probe unexpectedly succeeded';
  exception when others then
    null;
  end;

  if (select count(*) from public.recurring_task_series) <> before_series_count
    or (select count(*) from public.recurring_task_occurrences
        where series_id = fixture_state.series_id) <> before_occurrence_count
    or (select coverage_horizon from public.recurring_task_series
        where id = fixture_state.series_id) is distinct from before_horizon then
    raise exception 'Coverage rollback advanced or left partial state';
  end if;
end
$rollback$;

rollback to savepoint before_series_coverage_rollback_probe;

do $rollback_retry$
declare
  fixture_state recurring_series_coverage_fixture_state%rowtype;
  retry_outcome jsonb;
begin
  select * into fixture_state
  from recurring_series_coverage_fixture_state;
  retry_outcome := public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '67900000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'range', jsonb_build_object('from', '2026-08-10', 'to', '2026-08-12'),
      'idempotencyKey', 'rollback-ensure-679'
    )
  );
  if retry_outcome->>'status' <> 'complete'
    or (retry_outcome->'series'->>'coverageHorizon')::date <> date '2026-08-12' then
    raise exception 'Rollback retry did not converge as a fresh operation: %', retry_outcome;
  end if;
end
$rollback_retry$;

rollback;
