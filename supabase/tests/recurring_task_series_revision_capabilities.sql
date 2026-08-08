-- constrained-sql-fixture: true
-- Exercise effective-dated Series revisions through the authenticated RPC.
-- The fixture is transactional so its lineage evidence never leaks into the
-- shared database.
begin;

select public.sql_fixture_create_auth_user(
  '68800000-0000-0000-0000-000000000001',
  'recurring-series-revision-capabilities@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"68800000-0000-0000-0000-000000000001"}',
  true
);

do $series_revision_lineage$
declare
  v_user_id constant uuid := '68800000-0000-0000-0000-000000000001';
  v_series_id uuid;
  v_initial_revision_id uuid;
  v_new_revision_id uuid;
  v_initial_revision_token integer;
  v_outcome jsonb;
  v_replay jsonb;
  v_stale jsonb;
  v_revision_request jsonb;
  v_stopping_series_id uuid;
  v_stopping_revision_token integer;
begin
  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', v_user_id,
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'timeZone', 'UTC',
      'defaults', jsonb_build_object('title', 'Revision lineage'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', 'revision-capabilities-create-688'
    )
  );
  if v_outcome->>'status' <> 'complete' then
    raise exception 'revision fixture setup failed: %', v_outcome;
  end if;

  v_series_id := (v_outcome->'series'->>'id')::uuid;
  v_initial_revision_token := (v_outcome->'series'->>'revisionToken')::integer;
  select revision.id
  into v_initial_revision_id
  from public.recurring_task_series_revisions revision
  where revision.series_id = v_series_id
    and revision.effective_from = date '2026-08-01';

  select public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', v_user_id,
      'seriesId', v_series_id,
      'occurrenceId', (
        select occurrence.id
        from public.recurring_task_occurrences occurrence
        where occurrence.series_id = v_series_id
          and occurrence.scheduled_date = date '2026-08-01'
      ),
      'idempotencyKey', 'revision-capabilities-complete-688'
    )
  ) into v_outcome;
  if v_outcome->>'status' <> 'complete' then
    raise exception 'completed historical occurrence setup failed: %', v_outcome;
  end if;

  select public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', v_user_id,
      'seriesId', v_series_id,
      'occurrenceId', (
        select occurrence.id
        from public.recurring_task_occurrences occurrence
        where occurrence.series_id = v_series_id
          and occurrence.scheduled_date = date '2026-08-02'
      ),
      'idempotencyKey', 'revision-capabilities-skip-688'
    )
  ) into v_outcome;
  if v_outcome->>'status' <> 'complete' then
    raise exception 'skipped historical occurrence setup failed: %', v_outcome;
  end if;

  select public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', v_user_id,
      'seriesId', v_series_id,
      'occurrenceId', (
        select occurrence.id
        from public.recurring_task_occurrences occurrence
        where occurrence.series_id = v_series_id
          and occurrence.scheduled_date = date '2026-08-04'
      ),
      'updates', jsonb_build_object('title', 'Retained override'),
      'idempotencyKey', 'revision-capabilities-edit-688'
    )
  ) into v_outcome;
  if v_outcome->>'status' <> 'complete' then
    raise exception 'overridden occurrence setup failed: %', v_outcome;
  end if;

  v_revision_request := jsonb_build_object(
    'userId', v_user_id,
    'seriesId', v_series_id,
    'expectedRevisionToken', v_initial_revision_token,
    'effectiveDate', '2026-08-03',
    'recurrenceRule', jsonb_build_object(
      'frequency', 'weekly',
      'interval', 1,
      'days_of_week', jsonb_build_array(1)
    ),
    'scope', 'all',
    'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-05'),
    'idempotencyKey', 'revision-capabilities-revise-688'
  );
  v_outcome := public.recurring_task_lifecycle('revise-series', v_revision_request);
  if v_outcome->>'status' <> 'complete' then
    raise exception 'effective-dated revision failed: %', v_outcome;
  end if;

  select revision.id
  into v_new_revision_id
  from public.recurring_task_series_revisions revision
  where revision.series_id = v_series_id
    and revision.effective_from = date '2026-08-03';

  if (select count(*) from public.recurring_task_series_revisions revision
      where revision.series_id = v_series_id) <> 2
     or not exists (
       select 1 from public.recurring_task_series_revisions revision
       where revision.id = v_initial_revision_id
         and revision.effective_to = date '2026-08-03'
     )
     or not exists (
       select 1 from public.recurring_task_series_revisions revision
       where revision.id = v_new_revision_id
         and revision.effective_from = date '2026-08-03'
         and revision.effective_to is null
     )
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-01') <> 'completed'
     or (select revision_id from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-01') <> v_initial_revision_id
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-02') <> 'skipped'
     or (select revision_id from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-02') <> v_initial_revision_id
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-04') <> 'extra'
     or (select revision_id from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-04') <> v_new_revision_id
     or not exists (
       select 1 from public.recurring_task_occurrences occurrence
       where occurrence.series_id = v_series_id
         and occurrence.scheduled_date = date '2026-08-04'
         and occurrence.overrides->>'title' = 'Retained override'
     )
     or (select state from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.scheduled_date = date '2026-08-05') <> 'withdrawn' then
    raise exception 'revision did not preserve historical lineage or reconcile open work';
  end if;

  v_replay := public.recurring_task_lifecycle('revise-series', v_revision_request);
  if v_replay->>'status' <> 'already-applied'
     or (select count(*) from public.recurring_task_series_revisions revision
         where revision.series_id = v_series_id) <> 2 then
    raise exception 'revision replay duplicated lineage: %', v_replay;
  end if;

  v_stale := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_set(v_revision_request, '{idempotencyKey}',
      '"revision-capabilities-stale-688"'::jsonb)
  );
  if v_stale->>'status' <> 'conflict'
     or v_stale->>'type' <> 'conflict'
     or (v_stale->>'expectedRevisionToken')::integer <> v_initial_revision_token
     or (v_stale->>'actualRevisionToken')::integer = v_initial_revision_token then
    raise exception 'stale revision did not return a typed optimistic conflict: %', v_stale;
  end if;

  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', v_user_id,
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'defaults', jsonb_build_object('title', 'Last Scheduled Date'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', 'revision-capabilities-stop-create-688'
    )
  );
  v_stopping_series_id := (v_outcome->'series'->>'id')::uuid;
  v_stopping_revision_token := (v_outcome->'series'->>'revisionToken')::integer;
  v_outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', v_user_id,
      'seriesId', v_stopping_series_id,
      'expectedRevisionToken', v_stopping_revision_token,
      'effectiveDate', '2026-08-03',
      'lastScheduledDate', '2026-08-03',
      'coverage', jsonb_build_object('from', '2026-08-03', 'to', '2026-08-05'),
      'idempotencyKey', 'revision-capabilities-stop-revise-688'
    )
  );
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended'
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_stopping_series_id
           and occurrence.state = 'withdrawn') <> 2 then
    raise exception 'Last Scheduled Date revision did not end and reconcile the Series: %', v_outcome;
  end if;
end
$series_revision_lineage$;

rollback;
