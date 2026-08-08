-- constrained-sql-fixture: true
-- Exercise scoped Task Commands against authoritative recurring storage:
-- occurrence overrides, future revisions, all-scope end semantics, operation
-- replay, ownership/lineage/version conflicts, and rollback.
begin;

select public.sql_fixture_create_auth_user(
  '68300000-0000-0000-0000-000000000001',
  'scoped-task-commands@example.test'
);
select public.sql_fixture_create_auth_user(
  '68300000-0000-0000-0000-000000000002',
  'scoped-task-commands-other@example.test'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"68300000-0000-0000-0000-000000000001"}',
  true
);
set local role authenticated;

do $privileges$
declare
  lifecycle_definition text;
begin
  if not has_function_privilege(
    'authenticated',
    'public.recurring_task_lifecycle(text,jsonb)',
    'execute'
  ) or not has_function_privilege(
    'authenticated',
    'public.task_command_replay(text,jsonb)',
    'execute'
  ) then
    raise exception 'Scoped Task Command RPCs are not available to authenticated users';
  end if;
  lifecycle_definition := pg_get_functiondef(
    'public.recurring_task_scoped_command_checked(text,jsonb)'::regprocedure
  );
  if position('FOR UPDATE' in upper(lifecycle_definition)) = 0
     or position('EXPECTEDREVISIONTOKEN' in upper(lifecycle_definition)) = 0
     or position('RECURRING_OCCURRENCE_ID' in upper(lifecycle_definition)) = 0 then
    raise exception 'Scoped lifecycle wrapper does not prove locks, versions, and lineage';
  end if;
end
$privileges$;

create temporary table scoped_task_command_fixture_state (
  series_id uuid not null,
  revision_token integer not null,
  occurrence_id uuid not null,
  task_id uuid not null,
  revision_id uuid not null,
  scheduled_date date not null
) on commit drop;

do $create_series$
declare
  outcome jsonb;
begin
  outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'timeZone', 'UTC',
      'defaults', jsonb_build_object(
        'title', 'Original default',
        'description', null,
        'priority', 1,
        'categoryId', null,
        'dueTime', null,
        'status', 'todo',
        'section', 'personal',
        'projectId', null
      ),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-04'),
      'idempotencyKey', 'scoped-create-683'
    )
  );
  if outcome->>'status' <> 'complete' then
    raise exception 'Scoped fixture Series creation failed: %', outcome;
  end if;
  insert into scoped_task_command_fixture_state (
    series_id,
    revision_token,
    occurrence_id,
    task_id,
    revision_id,
    scheduled_date
  )
  select
    series.id,
    series.revision_token,
    occurrence.id,
    occurrence.task_id,
    occurrence.revision_id,
    occurrence.scheduled_date
  from public.recurring_task_series series
  join public.recurring_task_occurrences occurrence
    on occurrence.series_id = series.id
  where series.user_id = '68300000-0000-0000-0000-000000000001'
    and occurrence.scheduled_date = date '2026-08-02';
end
$create_series$;

do $revalidation$
declare
  fixture scoped_task_command_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into fixture from scoped_task_command_fixture_state;

  outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000002',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', fixture.task_id,
      'scope', 'this',
      'scheduledDate', fixture.scheduled_date,
      'updates', jsonb_build_object('title', 'Must not apply'),
      'idempotencyKey', 'scoped-wrong-owner-683'
    )
  );
  if outcome->>'status' <> 'not-found' then
    raise exception 'Foreign owner was not masked: %', outcome;
  end if;

  outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', gen_random_uuid(),
      'scope', 'this',
      'scheduledDate', fixture.scheduled_date,
      'expectedRevisionToken', fixture.revision_token,
      'updates', jsonb_build_object('title', 'Must not apply'),
      'idempotencyKey', 'scoped-wrong-task-683'
    )
  );
  if outcome->>'status' <> 'not-found' then
    raise exception 'Foreign visible Task was not masked: %', outcome;
  end if;

  outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', fixture.task_id,
      'scope', 'following',
      'scheduledDate', fixture.scheduled_date,
      'expectedRevisionToken', fixture.revision_token,
      'updates', jsonb_build_object('title', 'Must not apply'),
      'idempotencyKey', 'scoped-wrong-scope-683'
    )
  );
  if outcome->>'status' <> 'invalid-transition' then
    raise exception 'Occurrence edit accepted a Series scope: %', outcome;
  end if;

  outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', fixture.task_id,
      'scope', 'this',
      'scheduledDate', '2026-08-31',
      'expectedRevisionToken', fixture.revision_token,
      'updates', jsonb_build_object('title', 'Must not apply'),
      'idempotencyKey', 'scoped-wrong-date-683'
    )
  );
  if outcome->>'status' <> 'not-found' then
    raise exception 'Stale Scheduled Date was not masked: %', outcome;
  end if;
end
$revalidation$;

do $occurrence_override$
declare
  fixture scoped_task_command_fixture_state%rowtype;
  outcome jsonb;
  retry_outcome jsonb;
  replay_outcome jsonb;
begin
  select * into fixture from scoped_task_command_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', fixture.task_id,
      'scope', 'this',
      'scheduledDate', fixture.scheduled_date,
      'expectedRevisionToken', fixture.revision_token,
      'expectedRevisionId', fixture.revision_id,
      'updates', jsonb_build_object(
        'title', 'Personal title',
        'dueDate', '2026-08-09',
        'status', 'in_progress'
      ),
      'idempotencyKey', 'scoped-edit-683'
    )
  );
  retry_outcome := public.recurring_task_lifecycle(
    'edit-occurrence',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', fixture.task_id,
      'scope', 'this',
      'scheduledDate', fixture.scheduled_date,
      'expectedRevisionToken', fixture.revision_token,
      'expectedRevisionId', fixture.revision_id,
      'updates', jsonb_build_object(
        'title', 'Personal title',
        'dueDate', '2026-08-09',
        'status', 'in_progress'
      ),
      'idempotencyKey', 'scoped-edit-683'
    )
  );
  replay_outcome := public.task_command_replay(
    'edit',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'taskId', fixture.task_id,
      'idempotencyKey', 'scoped-edit-683'
    )
  );
  if outcome->>'status' <> 'complete'
     or retry_outcome->>'status' <> 'already-applied'
     or replay_outcome->>'status' <> 'already-applied'
     or (select title from public.tasks where id = fixture.task_id) <> 'Personal title'
     or (select status from public.tasks where id = fixture.task_id) <> 'in_progress'
     or (select overrides->>'title' from public.recurring_task_occurrences
         where id = fixture.occurrence_id) <> 'Personal title'
     or (select details->>'title' from public.recurring_task_occurrences
         where id = fixture.occurrence_id) <> 'Personal title'
     or (select details->>'title' from public.recurring_task_occurrences
         where series_id = fixture.series_id
           and scheduled_date = date '2026-08-03') <> 'Original default' then
    raise exception 'Occurrence override or replay semantics failed: %, %, %',
      outcome, retry_outcome, replay_outcome;
  end if;
end
$occurrence_override$;

do $series_revision$
declare
  fixture scoped_task_command_fixture_state%rowtype;
  outcome jsonb;
  stale_outcome jsonb;
begin
  select * into fixture from scoped_task_command_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', fixture.task_id,
      'scope', 'following',
      'scheduledDate', fixture.scheduled_date,
      'effectiveDate', '2026-08-03',
      'expectedRevisionToken', fixture.revision_token,
      'defaults', jsonb_build_object('title', 'Future default', 'priority', 2),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-04'),
      'idempotencyKey', 'scoped-revise-683'
    )
  );
  stale_outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', fixture.task_id,
      'scope', 'following',
      'scheduledDate', fixture.scheduled_date,
      'effectiveDate', '2026-08-03',
      'expectedRevisionToken', fixture.revision_token,
      'defaults', jsonb_build_object('title', 'Stale default'),
      'idempotencyKey', 'scoped-stale-revise-683'
    )
  );
  if outcome->>'status' <> 'complete'
     or (outcome->'series'->>'revisionToken')::integer <> fixture.revision_token + 1
     or stale_outcome->>'status' <> 'conflict'
     or (stale_outcome->>'actualRevisionToken')::integer <> fixture.revision_token + 1
     or (select details->>'title' from public.recurring_task_occurrences
         where series_id = fixture.series_id
           and scheduled_date = date '2026-08-03') <> 'Future default'
     or (select details->>'title' from public.recurring_task_occurrences
         where series_id = fixture.series_id
           and scheduled_date = date '2026-08-02') <> 'Personal title' then
    raise exception 'Scoped Series Revision did not enforce version/inheritance: %, %',
      outcome, stale_outcome;
  end if;
end
$series_revision$;

savepoint scoped_edit_rollback_683;
create function pg_temp.fail_scoped_task_edit()
returns trigger
language plpgsql
as $$
begin
  if new.title = 'Rollback title' then
    raise exception 'fixture forced scoped Task edit rollback';
  end if;
  return new;
end
$$;
create trigger scoped_task_edit_failure
before update on public.tasks
for each row execute function pg_temp.fail_scoped_task_edit();

do $rollback$
declare
  fixture scoped_task_command_fixture_state%rowtype;
  failed boolean := false;
begin
  select * into fixture from scoped_task_command_fixture_state;
  begin
    perform public.recurring_task_lifecycle(
      'edit-occurrence',
      jsonb_build_object(
        'userId', '68300000-0000-0000-0000-000000000001',
        'seriesId', fixture.series_id,
        'occurrenceId', fixture.occurrence_id,
        'taskId', fixture.task_id,
        'scope', 'this',
        'scheduledDate', fixture.scheduled_date,
        'expectedRevisionToken', fixture.revision_token + 1,
        'updates', jsonb_build_object('title', 'Rollback title'),
        'idempotencyKey', 'scoped-rollback-683'
      )
    );
  exception when others then
    failed := true;
  end;
  if not failed
     or (select title from public.tasks where id = fixture.task_id) = 'Rollback title'
     or (select overrides->>'title' from public.recurring_task_occurrences
         where id = fixture.occurrence_id) = 'Rollback title' then
    raise exception 'Scoped Task edit did not roll back all tables';
  end if;
end
$rollback$;
rollback to savepoint scoped_edit_rollback_683;
release savepoint scoped_edit_rollback_683;

do $end_all$
declare
  fixture scoped_task_command_fixture_state%rowtype;
  outcome jsonb;
  replay_outcome jsonb;
begin
  select * into fixture from scoped_task_command_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'end-series',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'seriesId', fixture.series_id,
      'occurrenceId', fixture.occurrence_id,
      'taskId', fixture.task_id,
      'scope', 'all',
      'scheduledDate', fixture.scheduled_date,
      'effectiveDate', '2026-08-03',
      'expectedRevisionToken', fixture.revision_token + 1,
      'idempotencyKey', 'scoped-end-all-683'
    )
  );
  replay_outcome := public.task_command_replay(
    'skip',
    jsonb_build_object(
      'userId', '68300000-0000-0000-0000-000000000001',
      'taskId', fixture.task_id,
      'idempotencyKey', 'scoped-end-all-683'
    )
  );
  if outcome->>'status' <> 'complete'
     or replay_outcome->>'status' <> 'already-applied'
     or (select status from public.recurring_task_series where id = fixture.series_id) <> 'ended'
     or exists (
       select 1 from public.recurring_task_occurrences
       where series_id = fixture.series_id
         and state in ('open', 'extra')
     )
     or not exists (
       select 1 from public.recurring_task_occurrences
       where series_id = fixture.series_id
         and state = 'withdrawn'
     ) then
    raise exception 'All-scope endSeries did not preserve history and withdraw open work: %, %',
      outcome, replay_outcome;
  end if;
end
$end_all$;

rollback;
