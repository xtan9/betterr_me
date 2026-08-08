-- constrained-sql-fixture: true
-- Exercise the authenticated Series pause, resume, and end commands through
-- the canonical lifecycle RPC. Every assertion runs in one transaction.
begin;

select public.sql_fixture_create_auth_user(
  '88700000-0000-0000-0000-000000000001',
  'recurring-series-commands@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"88700000-0000-0000-0000-000000000001"}',
  true
);

do $privileges$
begin
  if not has_function_privilege(
    'authenticated',
    'public.recurring_task_lifecycle(text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute canonical Series commands';
  end if;
  if has_function_privilege(
    'anon',
    'public.recurring_task_lifecycle(text,jsonb)',
    'execute'
  ) then
    raise exception 'anon can execute canonical Series commands';
  end if;
end
$privileges$;

do $commands$
declare
  v_series_id uuid;
  v_outcome jsonb;
  v_retry jsonb;
  v_conflict jsonb;
  v_pause_request jsonb;
  v_resume_request jsonb;
  v_end_request jsonb;
  v_initial_occurrence_count integer;
  v_initial_revision_count integer;
begin
  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '88700000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object('title', 'Series command evidence'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', '887-create'
    )
  );
  if v_outcome->>'status' <> 'complete' then
    raise exception 'Series command fixture setup failed: %', v_outcome;
  end if;
  v_series_id := (v_outcome->'series'->>'id')::uuid;
  select count(*) into v_initial_occurrence_count
  from public.recurring_task_occurrences occurrence
  where occurrence.series_id = v_series_id;
  select count(*) into v_initial_revision_count
  from public.recurring_task_series_revisions revision
  where revision.series_id = v_series_id;

  v_conflict := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '88700000-0000-0000-0000-000000000001',
      'seriesId', '00000000-0000-0000-0000-000000000000',
      'expectedRevisionToken', 1,
      'idempotencyKey', '887-missing-pause'
    )
  );
  if v_conflict->>'status' <> 'not-found'
     or v_conflict->>'type' <> 'not-found' then
    raise exception 'missing Series was not typed: %', v_conflict;
  end if;

  v_conflict := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '88700000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-02-30',
      'expectedRevisionToken', 1,
      'idempotencyKey', '887-invalid-pause'
    )
  );
  if v_conflict->>'status' <> 'invalid-transition'
     or v_conflict->>'type' <> 'invalid-transition' then
    raise exception 'invalid pause was not typed: %', v_conflict;
  end if;

  v_pause_request := jsonb_build_object(
    'userId', '88700000-0000-0000-0000-000000000001',
    'seriesId', v_series_id,
    'effectiveDate', '2026-08-03',
    'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-05'),
    'expectedRevisionToken', 1,
    'idempotencyKey', '887-pause'
  );
  v_outcome := public.recurring_task_lifecycle('pause-series', v_pause_request);
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'paused'
     or (select revision_token from public.recurring_task_series where id = v_series_id) <> 2
     or not exists (
       select 1
       from public.recurring_task_intentional_absences absence
       where absence.series_id = v_series_id
         and absence.scheduled_date between '2026-08-03' and '2026-08-05'
         and absence.reason = 'paused'
     ) then
    raise exception 'pause did not record its local boundary: %', v_outcome;
  end if;

  v_retry := public.recurring_task_lifecycle('pause-series', v_pause_request);
  if v_retry->>'status' <> 'already-applied'
     or v_retry->>'type' <> 'already-applied' then
    raise exception 'pause retry was not a typed replay: %', v_retry;
  end if;

  v_conflict := public.recurring_task_lifecycle(
    'pause-series',
    v_pause_request || jsonb_build_object(
      'effectiveDate', '2026-08-04'
    )
  );
  if v_conflict->>'status' <> 'conflict'
     or v_conflict->>'type' <> 'conflict' then
    raise exception 'pause idempotency conflict was not typed: %', v_conflict;
  end if;

  v_conflict := public.recurring_task_lifecycle(
    'pause-series',
    jsonb_build_object(
      'userId', '88700000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-04',
      'expectedRevisionToken', 2,
      'idempotencyKey', '887-invalid-transition'
    )
  );
  if v_conflict->>'status' <> 'invalid-transition'
     or v_conflict->>'type' <> 'invalid-transition' then
    raise exception 'invalid pause transition was not typed: %', v_conflict;
  end if;

  v_conflict := public.recurring_task_lifecycle(
    'resume-series',
    jsonb_build_object(
      'userId', '88700000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-06',
      'expectedRevisionToken', 1,
      'idempotencyKey', '887-stale-resume'
    )
  );
  if v_conflict->>'status' <> 'conflict'
     or v_conflict->>'type' <> 'conflict' then
    raise exception 'stale resume was not typed: %', v_conflict;
  end if;

  v_resume_request := jsonb_build_object(
    'userId', '88700000-0000-0000-0000-000000000001',
    'seriesId', v_series_id,
    'effectiveDate', '2026-08-06',
    'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-08'),
    'expectedRevisionToken', 2,
    'idempotencyKey', '887-resume'
  );
  v_outcome := public.recurring_task_lifecycle('resume-series', v_resume_request);
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'active'
     or (select revision_token from public.recurring_task_series where id = v_series_id) <> 3
     or exists (
       select 1
       from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_series_id
         and occurrence.scheduled_date between '2026-08-03' and '2026-08-05'
         and occurrence.state = 'open'
     )
     or not exists (
       select 1
       from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_series_id
         and occurrence.scheduled_date in ('2026-08-06', '2026-08-07', '2026-08-08')
         and occurrence.state = 'open'
     ) then
    raise exception 'resume backfilled the pause interval or missed its boundary: %', v_outcome;
  end if;

  v_retry := public.recurring_task_lifecycle('resume-series', v_resume_request);
  if v_retry->>'status' <> 'already-applied'
     or v_retry->>'type' <> 'already-applied' then
    raise exception 'resume retry was not a typed replay: %', v_retry;
  end if;

  v_end_request := jsonb_build_object(
    'userId', '88700000-0000-0000-0000-000000000001',
    'seriesId', v_series_id,
    'effectiveDate', '2026-08-09',
    'expectedRevisionToken', 3,
    'idempotencyKey', '887-end'
  );
  v_outcome := public.recurring_task_lifecycle('end-series', v_end_request);
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended'
     or (select id from public.recurring_task_series where id = v_series_id) <> v_series_id
     or (select count(*) from public.recurring_task_occurrences where series_id = v_series_id)
          < v_initial_occurrence_count
     or (select count(*) from public.recurring_task_series_revisions where series_id = v_series_id)
          <= v_initial_revision_count then
    raise exception 'end did not preserve Series lineage: %', v_outcome;
  end if;

  v_retry := public.recurring_task_lifecycle('end-series', v_end_request);
  if v_retry->>'status' <> 'already-applied'
     or v_retry->>'type' <> 'already-applied' then
    raise exception 'end retry was not a typed replay: %', v_retry;
  end if;
end
$commands$;

do $rollback$
declare
  v_series_id uuid;
  v_request jsonb;
  v_outcome jsonb;
  v_failed boolean := false;
begin
  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '88700000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-10',
      'activationDate', '2026-08-10',
      'defaults', jsonb_build_object('title', 'Series command rollback'),
      'coverage', jsonb_build_object('from', '2026-08-10', 'to', '2026-08-12'),
      'idempotencyKey', '887-rollback-create'
    )
  );
  v_series_id := (v_outcome->'series'->>'id')::uuid;
  v_request := jsonb_build_object(
    'userId', '88700000-0000-0000-0000-000000000001',
    'seriesId', v_series_id,
    'effectiveDate', '2026-08-11',
    'expectedRevisionToken', 1,
    'idempotencyKey', '887-rollback-end'
  );

  create function pg_temp.fail_series_command_end()
  returns trigger
  language plpgsql
  as $function$
  begin
    if new.recurrence_occurrence_state = 'withdrawn'
       and current_setting('betterr.allow_series_command_end', true)
           is distinct from 'on' then
      raise exception 'Series command rollback probe';
    end if;
    return new;
  end
  $function$;
  create trigger recurring_series_command_end_failure
  before update on public.tasks
  for each row execute function pg_temp.fail_series_command_end();

  begin
    perform public.recurring_task_lifecycle('end-series', v_request);
  exception when others then
    v_failed := true;
  end;
  if not v_failed
     or (select status from public.recurring_task_series where id = v_series_id) <> 'active'
     or (select revision_token from public.recurring_task_series where id = v_series_id) <> 1 then
    raise exception 'failed end did not roll back the Series command';
  end if;

  perform set_config('betterr.allow_series_command_end', 'on', true);
  v_outcome := public.recurring_task_lifecycle('end-series', v_request);
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended' then
    raise exception 'end retry after rollback did not converge: %', v_outcome;
  end if;
end
$rollback$;

rollback;
