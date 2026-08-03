-- constrained-sql-fixture: true
-- Exercise the recurring task lifecycle through its single authenticated RPC.
-- Every assertion runs in one transaction and the fixture rolls it back.
begin;

select public.sql_fixture_create_auth_user(
  '65900000-0000-0000-0000-000000000001',
  'recurring-lifecycle@example.test'
);
select public.sql_fixture_create_auth_user(
  '65900000-0000-0000-0000-000000000002',
  'recurring-lifecycle-other@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"65900000-0000-0000-0000-000000000001"}',
  true
);

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.recurring_task_lifecycle(text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute recurring task lifecycle RPC';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.recurring_task_occurrences'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.recurring_task_occurrences'::regclass
           and attname = 'series_id'),
        (select attnum from pg_attribute
         where attrelid = 'public.recurring_task_occurrences'::regclass
           and attname = 'scheduled_date')
      ]::smallint[]
  ) then
      raise exception 'occurrence ledger is missing its series/date uniqueness constraint';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.recurring_task_materialize_locked(uuid,date,date)',
    'execute'
  ) then
    raise exception 'internal materializer is directly executable by authenticated users';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.recurring_task_series',
    'INSERT'
  ) then
    raise exception 'authenticated users retain direct lifecycle-table write access';
  end if;
end
$$;

create temporary table recurring_lifecycle_fixture_state (
  series_id uuid not null,
  initial_revision_token integer not null
);

with created as (
  select public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object(
        'frequency', 'weekly',
        'interval', 1,
        'days_of_week', jsonb_build_array(1, 3, 1)
      ),
      'recurrenceAnchor', '2026-08-03',
      'activationDate', '2026-08-03',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Lifecycle acceptance task',
        'description', null,
        'priority', 1,
        'categoryId', null,
        'dueTime', null
      ),
      'coverage', jsonb_build_object(
        'from', '2026-08-03',
        'to', '2026-08-14'
      ),
      'idempotencyKey', 'create-659'
    )
  ) as outcome
)
insert into recurring_lifecycle_fixture_state (series_id, initial_revision_token)
select
  (outcome->'series'->>'id')::uuid,
  (outcome->'series'->>'revisionToken')::integer
from created;

do $$
declare
  v_series_id uuid;
  retry_outcome jsonb;
begin
  select state.series_id
  into v_series_id
  from recurring_lifecycle_fixture_state state;

  if (select count(*) from public.recurring_task_occurrences
      where recurring_task_occurrences.series_id = v_series_id) <> 4 then
    raise exception 'weekly recurrence did not deduplicate dates';
  end if;

  select public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object(
        'frequency', 'weekly', 'interval', 1, 'days_of_week', jsonb_build_array(1, 3, 1)
      ),
      'recurrenceAnchor', '2026-08-03',
      'activationDate', '2026-08-03',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Lifecycle acceptance task',
        'description', null,
        'priority', 1,
        'categoryId', null,
        'dueTime', null
      ),
      'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-14'),
      'idempotencyKey', 'create-659'
    )
  ) into retry_outcome;

  if retry_outcome->>'status' <> 'already-applied'
    or (select count(*) from public.recurring_task_occurrences
        where recurring_task_occurrences.series_id = v_series_id) <> 4 then
    raise exception 'create retry was not idempotent: %', retry_outcome;
  end if;
end
$$;

do $stopping_policy_reconciliation$
declare
  v_series_id uuid;
  v_invalid_series_id uuid;
  v_extension_series_id uuid;
  v_outcome jsonb;
begin
  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'Stopping policy revision'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', 'stopping-revision-create-684'
    )
  );
  v_series_id := (v_outcome->'series'->>'id')::uuid;

  v_outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-03',
      'recurrenceRule', jsonb_build_object(
        'frequency', 'weekly',
        'interval', 1,
        'days_of_week', jsonb_build_array(1)
      ),
      'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-05'),
      'idempotencyKey', 'stopping-revision-weekly-684'
    )
  );
  if (select state from public.recurring_task_occurrences occurrence
      where occurrence.series_id = v_series_id
        and occurrence.scheduled_date = date '2026-08-04') <> 'withdrawn'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-05') <> 'withdrawn' then
    raise exception 'revision did not withdraw obsolete open work';
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-03',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'lastScheduledDate', '2026-08-03',
      'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-05'),
      'idempotencyKey', 'stopping-revision-last-date-684'
    )
  );
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-04') <> 'withdrawn'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-05') <> 'withdrawn' then
    raise exception 'Last Scheduled Date reopened or retained work after its inclusive boundary: %', v_outcome;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'Stopping policy extension'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-02'),
      'idempotencyKey', 'stopping-extension-create-684'
    )
  );
  v_extension_series_id := (v_outcome->'series'->>'id')::uuid;
  v_outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_extension_series_id,
      'effectiveDate', '2026-08-03',
      'lastScheduledDate', '2026-08-05',
      'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-05'),
      'idempotencyKey', 'stopping-extension-revision-684'
    )
  );
  if v_outcome->>'status' <> 'complete'
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_extension_series_id) <> 5
     or not exists (
       select 1
       from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_extension_series_id
         and occurrence.scheduled_date = date '2026-08-05'
     )
     or v_outcome->'series'->>'status' <> 'ended' then
    raise exception 'Last Scheduled Date extension did not materialize its inclusive boundary: %', v_outcome;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'End validation'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-01'),
      'idempotencyKey', 'end-validation-create-684'
    )
  );
  v_invalid_series_id := (v_outcome->'series'->>'id')::uuid;

  begin
    v_outcome := public.recurring_task_lifecycle(
      'end-series',
      jsonb_build_object(
        'userId', '65900000-0000-0000-0000-000000000001',
        'seriesId', v_invalid_series_id,
        'effectiveDate', 'not-a-local-date'
      )
    );
  exception when others then
    raise exception 'invalid end request raised instead of returning a typed outcome';
  end;
  if v_outcome->>'status' <> 'invalid-transition'
     or v_outcome->>'type' <> 'invalid-transition' then
    raise exception 'invalid end request was not typed: %', v_outcome;
  end if;

  begin
    v_outcome := public.recurring_task_lifecycle(
      'end-series',
      jsonb_build_object(
        'userId', '65900000-0000-0000-0000-000000000001',
        'seriesId', 'not-a-series-id',
        'effectiveDate', '2026-08-01'
      )
    );
  exception when others then
    raise exception 'missing end request raised instead of returning a typed outcome';
  end;
  if v_outcome->>'status' <> 'not-found'
     or v_outcome->>'type' <> 'not-found' then
    raise exception 'missing end request disclosed or was not typed: %', v_outcome;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'end-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000002',
      'seriesId', v_invalid_series_id,
      'effectiveDate', '2026-08-01'
    )
  );
  if v_outcome->>'status' <> 'not-found'
     or v_outcome->>'type' <> 'not-found' then
    raise exception 'cross-owner end request disclosed the Series: %', v_outcome;
  end if;
end
$stopping_policy_reconciliation$;

do $end_terminal$
declare
  v_series_id uuid;
  v_outcome jsonb;
  v_occurrence_id uuid;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );
  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'Terminal end'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-06'),
      'idempotencyKey', 'end-terminal-create-684'
    )
  );
  if v_outcome->>'status' <> 'complete' then
    raise exception 'end terminal setup failed: %', v_outcome;
  end if;
  v_series_id := (v_outcome->'series'->>'id')::uuid;

  select occurrence.id into v_occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-01';
  v_outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id,
      'idempotencyKey', 'end-terminal-complete-684'
    )
  );

  select occurrence.id into v_occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-02';
  v_outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id,
      'updates', jsonb_build_object('title', 'Retained before end'),
      'idempotencyKey', 'end-terminal-edit-684'
    )
  );

  select occurrence.id into v_occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-03';
  v_outcome := public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id,
      'idempotencyKey', 'end-terminal-skip-684'
    )
  );
  v_outcome := public.recurring_task_lifecycle(
    'end-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-04',
      'coverage', jsonb_build_object('from', '2026-08-04', 'to', '2026-08-08'),
      'idempotencyKey', 'end-terminal-684'
    )
  );
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended'
     or (select count(*) from public.recurring_task_series_revisions revision
         where revision.series_id = v_series_id) <> 2
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-01') <> 'completed'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-02') <> 'open'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-03') <> 'skipped'
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.state = 'withdrawn') <> 3 then
    raise exception 'end did not retain history and withdraw untouched open work: %', v_outcome;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'end-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-04',
      'coverage', jsonb_build_object('from', '2026-08-04', 'to', '2026-08-08'),
      'idempotencyKey', 'end-terminal-684'
    )
  );
  if v_outcome->>'status' <> 'already-applied' then
    raise exception 'repeated end did not replay idempotently: %', v_outcome;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'range', jsonb_build_object('from', '2026-08-04', 'to', '2026-08-10'),
      'idempotencyKey', 'end-terminal-coverage-684'
    )
  );
  if v_outcome->>'status' <> 'complete'
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id) <> 6
     or exists (
       select 1 from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_series_id
         and occurrence.scheduled_date > date '2026-08-06'
     ) then
    raise exception 'Ended Series materialized later work: %', v_outcome;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-10'
    )
  );
  if v_outcome->>'status' <> 'invalid-transition'
     or v_outcome->>'type' <> 'invalid-transition' then
    raise exception 'Ended Series was resumable: %', v_outcome;
  end if;
end
$end_terminal$;

do $retained_limit$
declare
  v_series_id uuid;
  v_occurrence_id uuid;
  v_outcome jsonb;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );
  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'Retained limit'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-07'),
      'idempotencyKey', 'retained-limit-create-684'
    )
  );
  v_series_id := (v_outcome->'series'->>'id')::uuid;

  select occurrence.id into v_occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-01';
  perform public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id
    )
  );

  select occurrence.id into v_occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-02';
  perform public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id,
      'updates', jsonb_build_object('title', 'Changed retained'),
      'idempotencyKey', 'retained-limit-edit-684'
    )
  );

  select occurrence.id into v_occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-03';
  perform public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id
    )
  );

  select occurrence.id into v_occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-05';
  perform public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id,
      'updates', jsonb_build_object('title', 'Extra retained'),
      'idempotencyKey', 'retained-limit-extra-684'
    )
  );

  perform public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-04',
      'coverage', jsonb_build_object('from', '2026-08-04', 'to', '2026-08-05')
    )
  );
  perform public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-06',
      'coverage', jsonb_build_object('from', '2026-08-06', 'to', '2026-08-08')
    )
  );
  v_outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-06',
      'occurrenceLimit', 7,
      'coverage', jsonb_build_object('from', '2026-08-06', 'to', '2026-08-08'),
      'idempotencyKey', 'retained-limit-revision-684'
    )
  );
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended'
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.state <> 'withdrawn') <> 7
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-04') <> 'withdrawn'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-05') <> 'extra'
     or not exists (
       select 1 from public.recurring_task_intentional_absences absence
       where absence.series_id = v_series_id
         and absence.scheduled_date = date '2026-08-04'
         and absence.reason = 'paused'
     ) then
    raise exception 'Occurrence Limit did not count retained history exactly: %', v_outcome;
  end if;
end
$retained_limit$;

do $end_rollback$
declare
  v_series_id uuid;
  v_outcome jsonb;
  v_request jsonb;
  v_failed boolean := false;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );
  create function pg_temp.fail_end_withdrawal()
  returns trigger
  language plpgsql
  as $function$
  begin
    if new.recurrence_occurrence_state = 'withdrawn'
       and current_setting('betterr.allow_end_withdrawal', true)
           is distinct from 'on' then
      raise exception 'fixture end withdrawal rollback probe';
    end if;
    return new;
  end
  $function$;
  create trigger recurring_lifecycle_fixture_end_failure
  before update on public.tasks
  for each row execute function pg_temp.fail_end_withdrawal();

  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'End rollback'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-03'),
      'idempotencyKey', 'end-rollback-create-684'
    )
  );
  v_series_id := (v_outcome->'series'->>'id')::uuid;
  v_request := jsonb_build_object(
    'userId', '65900000-0000-0000-0000-000000000001',
    'seriesId', v_series_id,
    'effectiveDate', '2026-08-02',
    'coverage', jsonb_build_object('from', '2026-08-02', 'to', '2026-08-04'),
    'idempotencyKey', 'end-rollback-684'
  );

  begin
    perform public.recurring_task_lifecycle('end-series', v_request);
  exception when others then
    v_failed := true;
  end;
  if not v_failed
     or (select status from public.recurring_task_series where id = v_series_id) <> 'active'
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.state = 'open') <> 3 then
    raise exception 'failed end did not roll back completely';
  end if;

  perform set_config('betterr.allow_end_withdrawal', 'on', true);
  v_outcome := public.recurring_task_lifecycle('end-series', v_request);
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended' then
    raise exception 'end retry after rollback did not converge: %', v_outcome;
  end if;
end
$end_rollback$;

do $$
declare
  v_series_id uuid;
  occurrence_id uuid;
  retry_outcome jsonb;
begin
  select state.series_id
  into v_series_id
  from recurring_lifecycle_fixture_state state;

  select occurrence.id
  into occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-05';

  select public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', occurrence_id,
      'idempotencyKey', 'skip-659'
    )
  ) into retry_outcome;
  select public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', occurrence_id,
      'idempotencyKey', 'skip-659'
    )
  ) into retry_outcome;

  if retry_outcome->>'status' <> 'already-applied'
    or (select state from public.recurring_task_occurrences
        where id = occurrence_id) <> 'skipped'
    or not exists (
      select 1 from public.recurring_task_intentional_absences absence
      where absence.series_id = v_series_id
        and absence.scheduled_date = '2026-08-05'
        and absence.reason = 'skipped'
    ) then
    raise exception 'skip lifecycle did not persist its durable absence';
  end if;

  select public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'range', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-14'),
      'idempotencyKey', 'coverage-659'
    )
  ) into retry_outcome;
  select public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'range', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-14'),
      'idempotencyKey', 'coverage-659'
    )
  ) into retry_outcome;
  if retry_outcome->>'status' <> 'already-applied' then
    raise exception 'coverage retry was not idempotent';
  end if;
end
$$;

do $$
declare
  v_series_id uuid;
  completed_id uuid;
  edited_id uuid;
  outcome jsonb;
begin
  select state.series_id
  into v_series_id
  from recurring_lifecycle_fixture_state state;

  select occurrence.id into completed_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-03';
  select occurrence.id into edited_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-12';

  select public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', completed_id
    )
  ) into outcome;
  select public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', edited_id,
      'updates', '{"title":"Retained override","dueDate":null,"description":null}'::jsonb
    )
  ) into outcome;

  if (select state from public.recurring_task_occurrences where id = completed_id) <> 'completed'
    or (select state from public.recurring_task_occurrences where id = edited_id) <> 'open'
    or (select scheduled_date from public.recurring_task_occurrences where id = edited_id) <> '2026-08-12'
    or (select due_date from public.recurring_task_occurrences where id = edited_id) is not null
    or not exists (
      select 1 from public.recurring_task_occurrences occurrence
      where occurrence.id = edited_id
        and occurrence.overrides ? 'dueDate'
        and occurrence.overrides->'dueDate' = 'null'::jsonb
    ) then
    raise exception 'occurrence edit did not preserve field-level null or Scheduled Date';
  end if;

  create function pg_temp.capture_recurring_task_update()
  returns trigger
  language plpgsql
  as $function$
  begin
    perform set_config('betterr.fixture_task_title', new.title, false);
    perform set_config('betterr.fixture_task_due_date', coalesce(new.due_date::text, '<null>'), false);
    perform set_config('betterr.fixture_task_scheduled_date', new.scheduled_date::text, false);
    perform set_config('betterr.fixture_task_series_id', new.recurring_series_id::text, false);
    perform set_config('betterr.fixture_task_occurrence_id', new.recurring_occurrence_id::text, false);
    perform set_config('betterr.fixture_task_due_time', coalesce(new.due_time::text, '<null>'), false);
    perform set_config('betterr.fixture_task_has_due_date_override', (new.occurrence_overrides ? 'dueDate')::text, false);
    perform set_config('betterr.fixture_task_has_description_override', (new.occurrence_overrides ? 'description')::text, false);
    perform set_config('betterr.fixture_task_cleared_description', (new.occurrence_overrides->'description' = 'null'::jsonb)::text, false);
    perform set_config('betterr.fixture_task_cleared_due_date', (new.occurrence_overrides->'dueDate' = 'null'::jsonb)::text, false);
    return new;
  end
  $function$;

  create trigger recurring_lifecycle_fixture_update_capture
  before update on public.tasks
  for each row execute function pg_temp.capture_recurring_task_update();

  select public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', edited_id,
      'updates', jsonb_build_object('dueTime', '10:30'),
      'idempotencyKey', 'edit-task-659'
    )
  ) into outcome;
  if outcome->>'status' <> 'complete'
    or current_setting('betterr.fixture_task_title', true) <> 'Retained override'
    or current_setting('betterr.fixture_task_due_date', true) <> '<null>'
    or current_setting('betterr.fixture_task_scheduled_date', true) <> '2026-08-12'
    or current_setting('betterr.fixture_task_series_id', true) <> v_series_id::text
    or current_setting('betterr.fixture_task_occurrence_id', true) <> edited_id::text
    or current_setting('betterr.fixture_task_due_time', true) <> '10:30:00'
    or current_setting('betterr.fixture_task_has_due_date_override', true) <> 'true'
    or current_setting('betterr.fixture_task_has_description_override', true) <> 'true'
    or current_setting('betterr.fixture_task_cleared_description', true) <> 'true'
    or current_setting('betterr.fixture_task_cleared_due_date', true) <> 'true'
    or (select occurrence.overrides->>'dueTime'
        from public.recurring_task_occurrences occurrence
        where occurrence.id = edited_id) <> '10:30' then
    raise exception 'one-occurrence edit did not update its linked ordinary task';
  end if;

  select public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', edited_id,
      'updates', jsonb_build_object('dueTime', '10:30'),
      'idempotencyKey', 'edit-task-659'
    )
  ) into outcome;
  if outcome->>'status' <> 'already-applied' then
    raise exception 'one-occurrence task edit did not replay idempotently: %', outcome;
  end if;

  select public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', completed_id,
      'updates', '{}'::jsonb,
      'completed', false,
      'idempotencyKey', 'reopen-edit-659'
    )
  ) into outcome;
  if outcome->>'status' <> 'complete' then
    raise exception 'completed occurrence did not reopen through edit: %', outcome;
  end if;
  select public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', completed_id,
      'updates', '{}'::jsonb,
      'completed', false,
      'idempotencyKey', 'reopen-edit-659'
    )
  ) into outcome;
  if outcome->>'status' <> 'already-applied' then
    raise exception 'reopening an occurrence did not replay idempotently: %', outcome;
  end if;

  create function pg_temp.fail_recurring_task_update()
  returns trigger
  language plpgsql
  as $function$
  begin
    if new.due_time = time '11:30'
       and current_setting('betterr.fixture_allow_revision_retry', true)
           is distinct from 'on' then
      raise exception 'fixture occurrence task update rollback probe';
    end if;
    return new;
  end
  $function$;

  create trigger recurring_lifecycle_fixture_update_failure
  before update on public.tasks
  for each row execute function pg_temp.fail_recurring_task_update();

  begin
    perform public.recurring_task_lifecycle(
      'edit-occurrence',
      jsonb_build_object(
        'userId', '65900000-0000-0000-0000-000000000001',
        'seriesId', v_series_id,
        'occurrenceId', edited_id,
        'updates', jsonb_build_object('dueTime', '10:30'),
        'idempotencyKey', 'rollback-edit-659'
      )
    );
    raise exception 'occurrence task update rollback probe unexpectedly succeeded';
  exception when others then
    null;
  end;

  if (select occurrence.overrides->>'dueTime'
      from public.recurring_task_occurrences occurrence
      where occurrence.id = edited_id) <> '10:30' then
    raise exception 'failed occurrence edit changed the ledger before task rollback';
  end if;

  select public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', edited_id,
      'updates', jsonb_build_object('dueTime', '11:31'),
      'idempotencyKey', 'rollback-edit-659'
    )
  ) into outcome;
  if outcome->>'status' <> 'complete' then
    raise exception 'failed occurrence edit left an idempotency record: %', outcome;
  end if;

  if (select occurrence.overrides->>'dueTime'
      from public.recurring_task_occurrences occurrence
      where occurrence.id = edited_id) <> '11:31' then
    raise exception 'occurrence/task update did not roll back atomically';
  end if;

  select public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-10',
      'recurrenceRule', jsonb_build_object(
        'frequency', 'weekly', 'interval', 1, 'days_of_week', jsonb_build_array(1)
      ),
      'coverage', jsonb_build_object('from', '2026-08-10', 'to', '2026-08-17')
    )
  ) into outcome;

  if (select revision_token from public.recurring_task_series where id = v_series_id) <> 2
    or (select state from public.recurring_task_occurrences where id = edited_id) <> 'extra'
    or (select state from public.recurring_task_occurrences occurrence
        where occurrence.series_id = v_series_id
          and occurrence.scheduled_date = '2026-08-05') <> 'skipped' then
    raise exception 'revision did not retain completed/skipped/overridden history';
  end if;
end
$$;

do $$
declare
  v_series_id uuid;
  v_occurrence_id uuid;
  outcome jsonb;
begin
  select state.series_id
  into v_series_id
  from recurring_lifecycle_fixture_state state;
  select occurrence.id
  into v_occurrence_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-12';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );
  outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', '00000000-0000-0000-0000-000000000000',
      'updates', jsonb_build_object('title', 'missing')
    )
  );
  if outcome <> '{"status":"not-found","type":"not-found"}'::jsonb then
    raise exception 'missing occurrence did not return the typed not-found outcome: %', outcome;
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000002"}',
    true
  );
  outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000002',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id,
      'updates', jsonb_build_object('title', 'foreign')
    )
  );
  if outcome <> '{"status":"not-found","type":"not-found"}'::jsonb then
    raise exception 'foreign occurrence did not return the same not-found outcome: %', outcome;
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );
  outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_occurrence_id,
      'expectedRevisionToken', 1,
      'updates', jsonb_build_object('title', 'stale')
    )
  );
  if outcome->>'status' <> 'conflict'
    or outcome->>'type' <> 'conflict' then
    raise exception 'stale occurrence edit did not return a typed conflict outcome: %', outcome;
  end if;
end
$$;

do $$
declare
  v_series_id uuid;
  before_token integer;
  after_token integer;
begin
  select state.series_id
  into v_series_id
  from recurring_lifecycle_fixture_state state;
  select series.revision_token
  into before_token
  from public.recurring_task_series series
  where series.id = v_series_id;

  begin
    perform public.recurring_task_lifecycle(
      'revise-series',
      jsonb_build_object(
        'userId', '65900000-0000-0000-0000-000000000001',
        'seriesId', v_series_id,
        'effectiveDate', '2026-08-10',
        'occurrenceLimit', 0,
        'defaults', jsonb_build_object('title', 'must not commit')
      )
    );
    raise exception 'invalid revision unexpectedly succeeded';
  exception when others then
    null;
  end;

  select series.revision_token
  into after_token
  from public.recurring_task_series series
  where series.id = v_series_id;
  if after_token <> before_token
     or (select count(*) from public.recurring_task_series_revisions revision
         where revision.series_id = v_series_id) <> 2 then
    raise exception 'invalid revision partially committed';
  end if;
end
$$;

do $$
declare
  v_series_id uuid;
  outcome jsonb;
begin
  select state.series_id
  into v_series_id
  from recurring_lifecycle_fixture_state state;

  select public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-17',
      'coverage', jsonb_build_object('from', '2026-08-17', 'to', '2026-08-31')
    )
  ) into outcome;
  select public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-31',
      'coverage', jsonb_build_object('from', '2026-08-31', 'to', '2026-09-07')
    )
  ) into outcome;

  if (select status from public.recurring_task_series where id = v_series_id) <> 'active'
    or not exists (
      select 1 from public.recurring_task_intentional_absences absence
      where absence.series_id = v_series_id
        and absence.scheduled_date = '2026-08-24'
        and absence.reason = 'paused'
    )
    or exists (
      select 1 from public.recurring_task_occurrences occurrence
      where occurrence.series_id = v_series_id
        and occurrence.scheduled_date = '2026-08-24'
        and occurrence.state <> 'withdrawn'
    )
    or not exists (
      select 1 from public.recurring_task_occurrences occurrence
      where occurrence.series_id = v_series_id
        and occurrence.scheduled_date = '2026-08-31'
        and occurrence.state = 'open'
    ) then
    raise exception 'pause/resume lifecycle backfilled a paused interval';
  end if;

  select public.recurring_task_lifecycle(
    'end-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-09-07',
      'coverage', jsonb_build_object('from', '2026-09-07', 'to', '2026-09-14')
    )
  ) into outcome;
  if (select status from public.recurring_task_series where id = v_series_id) <> 'ended'
    or (select count(*) from public.recurring_task_occurrences
        where recurring_task_occurrences.series_id = v_series_id) < 4 then
    raise exception 'end lifecycle did not retain series lineage';
  end if;
end
$$;

do $$
declare
  v_series_id uuid;
  outcome jsonb;
begin
  select state.series_id
  into v_series_id
  from recurring_lifecycle_fixture_state state;

  select public.recurring_task_lifecycle(
    'get-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000002',
      'seriesId', v_series_id
    )
  ) into outcome;
  if outcome->>'status' <> 'not-found' then
    raise exception 'series ownership disclosed another user''s lineage';
  end if;
end
$$;

do $$
declare
  v_series_id uuid;
  completed_id uuid;
  skipped_id uuid;
  retained_id uuid;
  prior_revision_id uuid;
  successor_revision_id uuid;
  revision_request jsonb;
  rollback_request jsonb;
  first_revision jsonb;
  retry jsonb;
  conflict_outcome jsonb;
  rollback_failed boolean;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );

  first_revision := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object(
        'frequency', 'weekly',
        'interval', 1,
        'days_of_week', jsonb_build_array(1, 3, 5)
      ),
      'recurrenceAnchor', '2026-08-03',
      'activationDate', '2026-08-03',
      'defaults', jsonb_build_object(
        'title', 'Revision original',
        'description', 'Original description',
        'priority', 1
      ),
      'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-14'),
      'idempotencyKey', 'create-revision-682'
    )
  );
  if first_revision->>'status' <> 'complete' then
    raise exception 'revision reconciliation fixture series was not created: %', first_revision;
  end if;
  v_series_id := (first_revision->'series'->>'id')::uuid;

  select occurrence.id
  into completed_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-03';
  select occurrence.id
  into skipped_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-05';
  select occurrence.id
  into retained_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-12';

  retry := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', completed_id,
      'idempotencyKey', 'complete-revision-682'
    )
  );
  if retry->>'status' <> 'complete' then
    raise exception 'revision reconciliation fixture completion failed: %', retry;
  end if;
  retry := public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', skipped_id,
      'idempotencyKey', 'skip-revision-682'
    )
  );
  if retry->>'status' <> 'complete' then
    raise exception 'revision reconciliation fixture skip failed: %', retry;
  end if;
  retry := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', retained_id,
      'updates', jsonb_build_object('title', 'Retained override'),
      'idempotencyKey', 'edit-revision-682'
    )
  );
  if retry->>'status' <> 'complete' then
    raise exception 'revision reconciliation fixture override failed: %', retry;
  end if;

  revision_request := jsonb_build_object(
    'userId', '65900000-0000-0000-0000-000000000001',
    'seriesId', v_series_id,
    'effectiveDate', '2026-08-06',
    'recurrenceRule', jsonb_build_object(
      'frequency', 'weekly',
      'interval', 1,
      'days_of_week', jsonb_build_array(1, 4)
    ),
    'defaults', jsonb_build_object(
      'title', 'Revised once',
      'priority', 3
    ),
    'coverage', jsonb_build_object('from', '2026-08-06', 'to', '2026-08-14'),
    'scope', 'following',
    'idempotencyKey', 'revise-682'
  );
  first_revision := public.recurring_task_lifecycle('revise-series', revision_request);
  retry := public.recurring_task_lifecycle('revise-series', revision_request);
  if first_revision->>'status' <> 'complete'
     or retry->>'status' <> 'already-applied'
     or retry->>'type' <> 'already-applied' then
    raise exception 'revision retry was not typed and idempotent: %', retry;
  end if;

  begin
    conflict_outcome := public.recurring_task_lifecycle(
      'revise-series',
      jsonb_set(
        revision_request,
        '{defaults,title}',
        '"Different intent"'::jsonb
      )
    );
  exception when others then
    raise exception 'revision idempotency reuse raised instead of returning typed conflict';
  end;
  if conflict_outcome->>'status' <> 'conflict'
     or conflict_outcome->>'type' <> 'conflict' then
    raise exception 'revision idempotency reuse was not a typed conflict: %', conflict_outcome;
  end if;

  select revision.id
  into prior_revision_id
  from public.recurring_task_series_revisions revision
  where revision.series_id = v_series_id
    and revision.effective_from = '2026-08-03';
  select revision.id
  into successor_revision_id
  from public.recurring_task_series_revisions revision
  where revision.series_id = v_series_id
    and revision.effective_from = '2026-08-06';

  if (select count(*) from public.recurring_task_series_revisions revision
      where revision.series_id = v_series_id) <> 2
     or (select effective_to from public.recurring_task_series_revisions revision
         where revision.id = prior_revision_id) <> '2026-08-06'
     or (select effective_to from public.recurring_task_series_revisions revision
         where revision.id = successor_revision_id) is not null
     or exists (
       select 1
       from (values
         (date '2026-08-03'),
         (date '2026-08-05'),
         (date '2026-08-06'),
         (date '2026-08-07'),
         (date '2026-08-10'),
         (date '2026-08-12'),
         (date '2026-08-11'),
         (date '2026-08-13'),
         (date '2026-08-14')
       ) as dates(scheduled_date)
       where (
         select count(*)
         from public.recurring_task_series_revisions revision
         where revision.series_id = v_series_id
           and revision.effective_from <= dates.scheduled_date
           and (
             revision.effective_to is null
             or dates.scheduled_date < revision.effective_to
           )
       ) <> 1
     ) then
    raise exception 'revision effective dates did not resolve exactly once';
  end if;

  if (select state from public.recurring_task_occurrences occurrence
      where occurrence.series_id = v_series_id
        and occurrence.scheduled_date = '2026-08-03') <> 'completed'
     or (select revision_id from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-03') <> prior_revision_id
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-05') <> 'skipped'
     or (select revision_id from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-05') <> prior_revision_id
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-10') <> 'open'
     or (select revision_id from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-10') <> successor_revision_id
     or (select details->>'title' from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-10') <> 'Revised once'
     or (select (details->>'priority')::integer from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-10') <> 3
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-12') <> 'extra'
     or (select revision_id from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-12') <> prior_revision_id
     or (select details->>'title' from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-12') <> 'Retained override'
     or (select (details->>'priority')::integer from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-12') <> 1
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-14') <> 'withdrawn'
     or exists (
       select 1
       from (values (date '2026-08-06'), (date '2026-08-13')) as dates(scheduled_date)
       where not exists (
         select 1
         from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = dates.scheduled_date
           and occurrence.state = 'open'
           and occurrence.revision_id = successor_revision_id
           and occurrence.details->>'title' = 'Revised once'
           and (occurrence.details->>'priority')::integer = 3
       )
     ) then
    raise exception 'revision did not reconcile additions, removals, defaults, or preserved history';
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000002"}',
    true
  );
  conflict_outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_set(revision_request, '{userId}',
      '"65900000-0000-0000-0000-000000000002"'::jsonb)
  );
  if conflict_outcome->>'status' <> 'not-found'
     or conflict_outcome->>'type' <> 'not-found' then
    raise exception 'foreign revision did not return a typed not-found outcome: %', conflict_outcome;
  end if;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );

  conflict_outcome := public.recurring_task_lifecycle(
    'revise-series',
    revision_request || jsonb_build_object(
      'expectedRevisionToken', 1,
      'idempotencyKey', 'stale-revision-682'
    )
  );
  if conflict_outcome->>'status' <> 'conflict'
     or conflict_outcome->>'type' <> 'conflict' then
    raise exception 'stale revision token did not return a typed conflict: %', conflict_outcome;
  end if;

  rollback_request := revision_request || jsonb_build_object(
    'effectiveDate', '2026-08-07',
    'defaults', jsonb_build_object('dueTime', '11:30'),
    'idempotencyKey', 'rollback-revision-682'
  );
  rollback_failed := false;
  begin
    perform public.recurring_task_lifecycle('revise-series', rollback_request);
  exception when others then
    rollback_failed := true;
  end;
  if not rollback_failed
     or (select revision_token from public.recurring_task_series where id = v_series_id) <> 2
     or (select count(*) from public.recurring_task_series_revisions revision
         where revision.series_id = v_series_id) <> 2 then
    raise exception 'failed revision did not roll back its lineage and retry record';
  end if;
  perform set_config('betterr.fixture_allow_revision_retry', 'on', false);
  retry := public.recurring_task_lifecycle('revise-series', rollback_request);
  if retry->>'status' <> 'complete'
     or (select revision_token from public.recurring_task_series where id = v_series_id) <> 3 then
    raise exception 'rolled-back revision did not retry as a fresh transaction: %', retry;
  end if;
end
$$;

do $$
declare
  v_series_id uuid;
  v_occurrence_id uuid;
  v_completed_id uuid;
  v_skipped_id uuid;
  v_overridden_id uuid;
  v_outcome jsonb;
  v_retry jsonb;
  v_conflict jsonb;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );

  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'timeZone', 'America/New_York',
      'defaults', jsonb_build_object('title', 'Pause history'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', 'create-pause-683'
    )
  );
  if v_outcome->>'status' <> 'complete' then
    raise exception 'pause fixture series was not created: %', v_outcome;
  end if;
  v_series_id := (v_outcome->'series'->>'id')::uuid;

  select occurrence.id into v_completed_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-02';
  select occurrence.id into v_skipped_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-03';
  select occurrence.id into v_overridden_id
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = '2026-08-04';

  v_outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_completed_id,
      'idempotencyKey', 'complete-pause-683'
    )
  );
  if v_outcome->>'status' <> 'complete' then
    raise exception 'pause fixture completion failed: %', v_outcome;
  end if;
  v_outcome := public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_skipped_id,
      'idempotencyKey', 'skip-pause-683'
    )
  );
  if v_outcome->>'status' <> 'complete' then
    raise exception 'pause fixture skip failed: %', v_outcome;
  end if;
  v_outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', v_overridden_id,
      'updates', jsonb_build_object('title', 'Retained override'),
      'idempotencyKey', 'edit-pause-683'
    )
  );
  if v_outcome->>'status' <> 'complete' then
    raise exception 'pause fixture override failed: %', v_outcome;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-02-30',
      'idempotencyKey', 'invalid-pause-683'
    )
  );
  if v_outcome->>'status' <> 'invalid-transition'
     or v_outcome->>'type' <> 'invalid-transition'
     or (select status from public.recurring_task_series where id = v_series_id) <> 'active'
     or (select revision_token from public.recurring_task_series where id = v_series_id) <> 1 then
    raise exception 'invalid pause date was not typed or changed state: %', v_outcome;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-02',
      'timeZone', 'UTC',
      'coverage', jsonb_build_object('from', '2026-08-02', 'to', '2026-08-05'),
      'idempotencyKey', 'pause-683'
    )
  );
  if v_outcome->>'status' <> 'complete'
     or (select status from public.recurring_task_series where id = v_series_id) <> 'paused'
     or (select revision_token from public.recurring_task_series where id = v_series_id) <> 2
     or (select effective_from from public.recurring_task_series_revisions revision
         where revision.id = (select current_revision_id from public.recurring_task_series where id = v_series_id)) <> '2026-08-02'
     or exists (
       select 1
       from (values
         (date '2026-08-02'),
         (date '2026-08-03'),
         (date '2026-08-04'),
         (date '2026-08-05')
       ) as dates(scheduled_date)
       where not exists (
         select 1
         from public.recurring_task_intentional_absences absence
         where absence.series_id = v_series_id
           and absence.scheduled_date = dates.scheduled_date
       )
     )
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-02') <> 'completed'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-03') <> 'skipped'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-04') <> 'extra'
     or (select details->>'title' from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-04') <> 'Retained override'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-05') <> 'withdrawn' then
    raise exception 'pause did not record the boundary, absence, or retained history: %', v_outcome;
  end if;

  v_retry := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-02',
      'timeZone', 'UTC',
      'coverage', jsonb_build_object('from', '2026-08-02', 'to', '2026-08-05'),
      'idempotencyKey', 'pause-683'
    )
  );
  if v_retry->>'status' <> 'already-applied'
     or v_retry->>'type' <> 'already-applied' then
    raise exception 'pause retry was not typed and idempotent: %', v_retry;
  end if;

  v_conflict := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-03',
      'idempotencyKey', 'pause-683'
    )
  );
  if v_conflict->>'status' <> 'conflict'
     or v_conflict->>'type' <> 'conflict' then
    raise exception 'pause idempotency conflict was not typed: %', v_conflict;
  end if;

  v_conflict := public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'expectedRevisionToken', 1
    )
  );
  if v_conflict->>'status' <> 'conflict'
     or v_conflict->>'type' <> 'conflict' then
    raise exception 'stale resume did not return a typed conflict: %', v_conflict;
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000002"}',
    true
  );
  v_conflict := public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000002',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-05'
    )
  );
  if v_conflict->>'status' <> 'not-found'
     or v_conflict->>'type' <> 'not-found' then
    raise exception 'cross-owner resume did not return a typed not-found outcome: %', v_conflict;
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"65900000-0000-0000-0000-000000000001"}',
    true
  );
  v_conflict := public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-05',
      'coverage', jsonb_build_object('from', '2026-08-02', 'to', '2026-08-06'),
      'idempotencyKey', 'resume-683'
    )
  );
  if v_conflict->>'status' <> 'complete'
     or (select status from public.recurring_task_series where id = v_series_id) <> 'active'
     or not exists (
       select 1 from public.recurring_task_intentional_absences absence
       where absence.series_id = v_series_id
         and absence.scheduled_date = '2026-08-02'
     )
     or not exists (
       select 1 from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_series_id
         and occurrence.scheduled_date = '2026-08-05'
         and occurrence.state = 'open'
     )
     or not exists (
       select 1 from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_series_id
         and occurrence.scheduled_date = '2026-08-06'
         and occurrence.state = 'open'
     )
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date between '2026-08-02' and '2026-08-04') <> 3
     or exists (
       select 1 from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_series_id
         and occurrence.scheduled_date between '2026-08-02' and '2026-08-04'
         and occurrence.state not in ('completed', 'skipped', 'extra')
     ) then
    raise exception 'resume did not preserve the pause interval or start at its boundary: %', v_conflict;
  end if;

  v_retry := public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-05',
      'coverage', jsonb_build_object('from', '2026-08-02', 'to', '2026-08-06'),
      'idempotencyKey', 'resume-683'
    )
  );
  if v_retry->>'status' <> 'already-applied'
     or v_retry->>'type' <> 'already-applied' then
    raise exception 'resume retry was not typed and idempotent: %', v_retry;
  end if;

  v_conflict := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id
    )
  );
  if v_conflict->>'status' <> 'invalid-transition'
     or v_conflict->>'type' <> 'invalid-transition' then
    raise exception 'repeated pause did not return a typed invalid transition: %', v_conflict;
  end if;

  v_conflict := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', '00000000-0000-0000-0000-000000000000'
    )
  );
  if v_conflict->>'status' <> 'not-found'
     or v_conflict->>'type' <> 'not-found' then
    raise exception 'missing pause did not return a typed not-found outcome: %', v_conflict;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-10',
      'activationDate', '2026-08-10',
      'defaults', jsonb_build_object('title', 'Same-day pause'),
      'coverage', jsonb_build_object('from', '2026-08-10', 'to', '2026-08-10'),
      'idempotencyKey', 'create-same-day-683'
    )
  );
  v_series_id := (v_outcome->'series'->>'id')::uuid;
  v_outcome := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-10',
      'coverage', jsonb_build_object('from', '2026-08-10', 'to', '2026-08-10')
    )
  );
  v_outcome := public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-10',
      'coverage', jsonb_build_object('from', '2026-08-10', 'to', '2026-08-10')
    )
  );
  if v_outcome->>'status' <> 'complete'
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = '2026-08-10') <> 'open' then
    raise exception 'same-day pause and resume did not reconcile the existing horizon: %', v_outcome;
  end if;
end
$$;

create temporary table recurring_pause_rollback_state (
  series_id uuid not null,
  paused_revision_token integer not null
);

do $$
declare
  v_series_id uuid;
  v_outcome jsonb;
begin
  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-20',
      'activationDate', '2026-08-20',
      'defaults', jsonb_build_object('title', 'Pause rollback'),
      'coverage', jsonb_build_object('from', '2026-08-20', 'to', '2026-08-20'),
      'idempotencyKey', 'create-pause-rollback-683'
    )
  );
  v_series_id := (v_outcome->'series'->>'id')::uuid;
  v_outcome := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '65900000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-21',
      'coverage', jsonb_build_object('from', '2026-08-21', 'to', '2026-08-22'),
      'idempotencyKey', 'pause-rollback-683'
    )
  );
  if v_outcome->>'status' <> 'complete' then
    raise exception 'pause rollback fixture did not pause: %', v_outcome;
  end if;
  insert into recurring_pause_rollback_state(series_id, paused_revision_token)
  select series.id, series.revision_token
  from public.recurring_task_series series
  where series.id = v_series_id;
end
$$;

create function pg_temp.fail_recurring_task_insert()
returns trigger
language plpgsql
as $$
begin
  raise exception 'fixture rollback probe';
end
$$;

create trigger recurring_lifecycle_fixture_failure
before insert on public.tasks
for each row execute function pg_temp.fail_recurring_task_insert();

do $$
declare
  v_series_count integer;
begin
  select count(*) into v_series_count
  from public.recurring_task_series;
  begin
    perform public.recurring_task_lifecycle(
      'create-series',
      jsonb_build_object(
        'userId', '65900000-0000-0000-0000-000000000001',
        'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
        'recurrenceAnchor', '2026-08-01',
        'activationDate', '2026-08-01',
        'defaults', jsonb_build_object('title', 'must roll back'),
        'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-02'),
        'idempotencyKey', 'rollback-659'
      )
    );
    raise exception 'rollback probe unexpectedly succeeded';
  exception when others then
    null;
  end;

  if (select count(*) from public.recurring_task_series) <> v_series_count then
    raise exception 'failed lifecycle left a partially-created series';
  end if;
end
$$;

do $$
declare
  v_series_id uuid;
  v_paused_token integer;
  v_failed boolean := false;
  v_outcome jsonb;
begin
  select state.series_id, state.paused_revision_token
  into v_series_id, v_paused_token
  from recurring_pause_rollback_state state;

  begin
    v_outcome := public.recurring_task_lifecycle(
      'resume-series',
      jsonb_build_object(
        'userId', '65900000-0000-0000-0000-000000000001',
        'seriesId', v_series_id,
        'effectiveDate', '2026-08-21',
        'coverage', jsonb_build_object('from', '2026-08-21', 'to', '2026-08-22'),
        'idempotencyKey', 'resume-rollback-683'
      )
    );
  exception when others then
    v_failed := true;
  end;

  if not v_failed
     or (select status from public.recurring_task_series where id = v_series_id) <> 'paused'
     or (select revision_token from public.recurring_task_series where id = v_series_id) <> v_paused_token
     or (select count(*) from public.recurring_task_series_revisions revision
         where revision.series_id = v_series_id) <> 2
     or not exists (
       select 1 from public.recurring_task_intentional_absences absence
       where absence.series_id = v_series_id
         and absence.scheduled_date = '2026-08-21'
         and absence.reason = 'paused'
     )
     or exists (
       select 1 from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_series_id
         and occurrence.scheduled_date = '2026-08-21'
     ) then
    raise exception 'failed resume did not roll back its boundary and materialization: %', v_outcome;
  end if;
end
$$;

rollback;
