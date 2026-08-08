-- constrained-sql-fixture: true
-- Proves explicit completion, reopening, and intentional skipping preserve
-- occurrence lineage while atomically updating the ordinary task projection.
begin;

select public.sql_fixture_create_auth_user(
  '68100000-0000-0000-0000-000000000001',
  'recurring-occurrence-lifecycle@example.test'
);
select public.sql_fixture_create_auth_user(
  '68100000-0000-0000-0000-000000000002',
  'recurring-occurrence-lifecycle-other@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"68100000-0000-0000-0000-000000000001"}',
  true
);

create temporary table recurring_occurrence_lifecycle_fixture_state (
  series_id uuid not null,
  complete_occurrence_id uuid not null,
  complete_task_id uuid not null,
  complete_revision_id uuid not null,
  complete_scheduled_date date not null,
  complete_due_date date,
  complete_title text not null,
  skip_occurrence_id uuid not null,
  skip_task_id uuid not null,
  rollback_complete_occurrence_id uuid not null,
  rollback_skip_occurrence_id uuid not null,
  rollback_skip_task_id uuid not null,
  initial_revision_count integer not null
) on commit drop;

create temporary table recurring_occurrence_task_events (
  event text not null,
  task_id uuid not null,
  user_id uuid not null,
  series_id uuid,
  occurrence_id uuid,
  scheduled_date date,
  due_date date,
  title text,
  status text,
  is_completed boolean
) on commit drop;

create function pg_temp.capture_occurrence_task_transition()
returns trigger
language plpgsql
as $$
begin
  insert into recurring_occurrence_task_events (
    event,
    task_id,
    user_id,
    series_id,
    occurrence_id,
    scheduled_date,
    due_date,
    title,
    status,
    is_completed
  ) values (
    tg_op,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'DELETE' then old.user_id else new.user_id end,
    case when tg_op = 'DELETE' then old.recurring_series_id else new.recurring_series_id end,
    case when tg_op = 'DELETE' then old.recurring_occurrence_id else new.recurring_occurrence_id end,
    case when tg_op = 'DELETE' then old.scheduled_date else new.scheduled_date end,
    case when tg_op = 'DELETE' then old.due_date else new.due_date end,
    case when tg_op = 'DELETE' then old.title else new.title end,
    case when tg_op = 'DELETE' then old.status else new.status end,
    case when tg_op = 'DELETE' then old.is_completed else new.is_completed end
  );
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger occurrence_lifecycle_task_transition_capture
before insert or update or delete on public.tasks
for each row execute function pg_temp.capture_occurrence_task_transition();

do $create_series$
declare
  create_outcome jsonb;
  fixture_series_id uuid;
begin
  create_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Frozen default',
        'description', 'Original description',
        'priority', 1,
        'categoryId', null,
        'dueTime', null,
        'status', 'todo',
        'section', 'personal',
        'projectId', null
      ),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-04'),
      'idempotencyKey', 'create-681'
    )
  );

  if create_outcome->>'status' <> 'complete' then
    raise exception 'Occurrence lifecycle fixture Series creation failed: %', create_outcome;
  end if;

  fixture_series_id := (create_outcome->'series'->>'id')::uuid;
  insert into recurring_occurrence_lifecycle_fixture_state (
    series_id,
    complete_occurrence_id,
    complete_task_id,
    complete_revision_id,
    complete_scheduled_date,
    complete_due_date,
    complete_title,
    skip_occurrence_id,
    skip_task_id,
    rollback_complete_occurrence_id,
    rollback_skip_occurrence_id,
    rollback_skip_task_id,
    initial_revision_count
  )
  select
    fixture_series_id,
    complete_occurrence.id,
    complete_occurrence.task_id,
    complete_occurrence.revision_id,
    complete_occurrence.scheduled_date,
    complete_occurrence.due_date,
    complete_occurrence.details->>'title',
    skip_occurrence.id,
    skip_occurrence.task_id,
    rollback_complete_occurrence.id,
    rollback_skip_occurrence.id,
    rollback_skip_occurrence.task_id,
    (
      select count(*)::integer
      from public.recurring_task_series_revisions revision
      where revision.series_id = fixture_series_id
    )
  from public.recurring_task_occurrences complete_occurrence
  join public.recurring_task_occurrences skip_occurrence
    on skip_occurrence.series_id = complete_occurrence.series_id
   and skip_occurrence.scheduled_date = date '2026-08-03'
  join public.recurring_task_occurrences rollback_complete_occurrence
    on rollback_complete_occurrence.series_id = complete_occurrence.series_id
   and rollback_complete_occurrence.scheduled_date = date '2026-08-02'
  join public.recurring_task_occurrences rollback_skip_occurrence
    on rollback_skip_occurrence.series_id = complete_occurrence.series_id
   and rollback_skip_occurrence.scheduled_date = date '2026-08-04'
  where complete_occurrence.series_id = fixture_series_id
    and complete_occurrence.scheduled_date = date '2026-08-01';

  if not exists (
    select 1
    from recurring_occurrence_lifecycle_fixture_state
  ) then
    raise exception 'Occurrence lifecycle fixture did not capture all ledger positions';
  end if;
end
$create_series$;

do $command_revalidation$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  wrong_scope_outcome jsonb;
  wrong_task_outcome jsonb;
  wrong_date_outcome jsonb;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;

  wrong_scope_outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.complete_occurrence_id,
      'taskId', fixture_state.complete_task_id,
      'scope', 'following',
      'scheduledDate', fixture_state.complete_scheduled_date,
      'idempotencyKey', 'wrong-scope-681'
    )
  );
  wrong_task_outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.complete_occurrence_id,
      'taskId', gen_random_uuid(),
      'scope', 'this',
      'scheduledDate', fixture_state.complete_scheduled_date,
      'idempotencyKey', 'wrong-task-681'
    )
  );
  wrong_date_outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.complete_occurrence_id,
      'taskId', fixture_state.complete_task_id,
      'scope', 'this',
      'scheduledDate', '2026-08-31',
      'idempotencyKey', 'wrong-date-681'
    )
  );
  if wrong_scope_outcome->>'status' <> 'invalid-transition'
     or wrong_task_outcome->>'status' <> 'not-found'
     or wrong_date_outcome->>'status' <> 'not-found'
     or (select state from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> 'open' then
    raise exception 'Shared Task Command facts were not revalidated atomically: %, %, %',
      wrong_scope_outcome, wrong_task_outcome, wrong_date_outcome;
  end if;
end
$command_revalidation$;

do $complete$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  outcome jsonb;
  retry_outcome jsonb;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;
  truncate table recurring_occurrence_task_events;

  outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.complete_occurrence_id,
      'taskId', fixture_state.complete_task_id,
      'scope', 'this',
      'scheduledDate', fixture_state.complete_scheduled_date,
      'idempotencyKey', 'complete-681'
    )
  );

  if outcome->>'status' <> 'complete'
     or outcome->>'type' <> 'complete'
     or (select state from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> 'completed'
     or (select revision_id from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> fixture_state.complete_revision_id
     or (select scheduled_date from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> fixture_state.complete_scheduled_date
     or (select due_date from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) is distinct from fixture_state.complete_due_date
     or (select details->>'title' from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> fixture_state.complete_title
     or (select is_completed from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) is distinct from true
     or (select status from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) <> 'done'
     or (select series_id from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) <> fixture_state.series_id
     or (select occurrence_id from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) <> fixture_state.complete_occurrence_id
     or (select scheduled_date from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) <> fixture_state.complete_scheduled_date
     or (select due_date from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) is distinct from fixture_state.complete_due_date
     or (select count(*) from public.recurring_task_series_revisions
         where series_id = fixture_state.series_id) <> fixture_state.initial_revision_count then
    raise exception 'Completion changed immutable occurrence facts or revision identity: %', outcome;
  end if;

  retry_outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.complete_occurrence_id,
      'taskId', fixture_state.complete_task_id,
      'scope', 'this',
      'scheduledDate', fixture_state.complete_scheduled_date,
      'idempotencyKey', 'complete-681'
    )
  );
  if retry_outcome->>'status' <> 'already-applied'
     or retry_outcome->>'type' <> 'already-applied'
     or (select count(*) from public.recurring_task_occurrences
         where series_id = fixture_state.series_id) <> 4 then
    raise exception 'Completion retry was not typed and idempotent: %', retry_outcome;
  end if;
end
$complete$;

do $revise_and_reopen$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  revision_outcome jsonb;
  outcome jsonb;
  retry_outcome jsonb;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;

  revision_outcome := public.recurring_task_lifecycle(
    'revise-series',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'effectiveDate', '2026-08-02',
      'defaults', jsonb_build_object('title', 'New default after completion'),
      'idempotencyKey', 'revise-681'
    )
  );
  if revision_outcome->>'status' <> 'complete' then
    raise exception 'Revision setup failed: %', revision_outcome;
  end if;
  truncate table recurring_occurrence_task_events;

  outcome := public.recurring_task_lifecycle(
    'reopen-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.complete_occurrence_id,
      'taskId', fixture_state.complete_task_id,
      'scope', 'this',
      'scheduledDate', fixture_state.complete_scheduled_date,
      'idempotencyKey', 'reopen-681'
    )
  );
  if outcome->>'status' <> 'complete'
     or outcome->>'type' <> 'complete'
     or (select state from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> 'open'
     or (select revision_id from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> fixture_state.complete_revision_id
     or (select scheduled_date from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> fixture_state.complete_scheduled_date
     or (select details->>'title' from public.recurring_task_occurrences
         where id = fixture_state.complete_occurrence_id) <> fixture_state.complete_title
     or (select title from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) <> fixture_state.complete_title
     or (select is_completed from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) is distinct from false
     or (select status from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) <> 'todo'
     or (select due_date from recurring_occurrence_task_events
         where event = 'UPDATE' and task_id = fixture_state.complete_task_id) is distinct from fixture_state.complete_due_date then
    raise exception 'Reopen rewrote the completed Occurrence or its task details: %', outcome;
  end if;

  retry_outcome := public.recurring_task_lifecycle(
    'reopen-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.complete_occurrence_id,
      'taskId', fixture_state.complete_task_id,
      'scope', 'this',
      'scheduledDate', fixture_state.complete_scheduled_date,
      'idempotencyKey', 'reopen-681'
    )
  );
  if retry_outcome->>'status' <> 'already-applied'
     or retry_outcome->>'type' <> 'already-applied' then
    raise exception 'Reopen retry was not typed and idempotent: %', retry_outcome;
  end if;
end
$revise_and_reopen$;

do $skip$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  outcome jsonb;
  retry_outcome jsonb;
  router_replay jsonb;
  skipped_task_id uuid;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;
  truncate table recurring_occurrence_task_events;
  skipped_task_id := fixture_state.skip_task_id;

  outcome := public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.skip_occurrence_id,
      'taskId', fixture_state.skip_task_id,
      'scope', 'this',
      'scheduledDate', '2026-08-03',
      'idempotencyKey', 'skip-681'
    )
  );
  if outcome->>'status' <> 'complete'
     or outcome->>'type' <> 'complete'
     or (select state from public.recurring_task_occurrences
         where id = fixture_state.skip_occurrence_id) <> 'skipped'
     or (select task_id from public.recurring_task_occurrences
         where id = fixture_state.skip_occurrence_id) is not null
     or (select count(*) from recurring_occurrence_task_events
         where event = 'DELETE' and task_id = skipped_task_id) <> 1
     or not exists (
       select 1
       from public.recurring_task_intentional_absences
       where series_id = fixture_state.series_id
         and scheduled_date = date '2026-08-03'
         and reason = 'skipped'
     ) then
    raise exception 'Skip did not remove the ordinary task and retain ledger evidence: %', outcome;
  end if;

  outcome := public.recurring_task_lifecycle(
    'ensure-coverage',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'range', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-05'),
      'idempotencyKey', 'ensure-skip-681'
    )
  );
  if outcome->>'status' <> 'complete'
     or (select count(*) from public.recurring_task_occurrences
         where series_id = fixture_state.series_id
           and scheduled_date = date '2026-08-03') <> 1
     or (select count(*) from public.recurring_task_occurrences
         where series_id = fixture_state.series_id
           and scheduled_date = date '2026-08-03'
           and state = 'skipped'
           and task_id is null) <> 1
     or exists (
       select 1
       from recurring_occurrence_task_events
       where event = 'INSERT'
         and series_id = fixture_state.series_id
         and scheduled_date = date '2026-08-03'
     ) then
    raise exception 'Ensure coverage rematerialized an intentional absence: %', outcome;
  end if;

  retry_outcome := public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.skip_occurrence_id,
      'taskId', fixture_state.skip_task_id,
      'scope', 'this',
      'scheduledDate', '2026-08-03',
      'idempotencyKey', 'skip-681'
    )
  );
  router_replay := public.task_command_replay(
    'skip',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'taskId', fixture_state.skip_task_id,
      'idempotencyKey', 'skip-681'
    )
  );
  if retry_outcome->>'status' <> 'already-applied'
     or retry_outcome->>'type' <> 'already-applied'
     or router_replay->>'status' <> 'already-applied' then
    raise exception 'Skip retry was not typed and idempotent: %, %',
      retry_outcome, router_replay;
  end if;
end
$skip$;

do $ownership$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  cross_owner_outcome jsonb;
  missing_outcome jsonb;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"68100000-0000-0000-0000-000000000002"}',
    true
  );
  cross_owner_outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000002',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.complete_occurrence_id
    )
  );
  missing_outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000002',
      'seriesId', gen_random_uuid(),
      'occurrenceId', fixture_state.complete_occurrence_id
    )
  );
  perform set_config(
    'request.jwt.claims',
    '{"sub":"68100000-0000-0000-0000-000000000001"}',
    true
  );
  if cross_owner_outcome <> jsonb_build_object('status', 'not-found', 'type', 'not-found')
     or missing_outcome <> jsonb_build_object('status', 'not-found', 'type', 'not-found') then
    raise exception 'Missing and cross-owner occurrence targets were distinguishable: %, %',
      cross_owner_outcome, missing_outcome;
  end if;
end
$ownership$;

truncate table recurring_occurrence_task_events;
savepoint rollback_complete_681;
create function pg_temp.fail_occurrence_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' then
    raise exception 'fixture forced completion rollback';
  end if;
  return new;
end
$$;
create trigger occurrence_lifecycle_completion_failure
before update on public.tasks
for each row execute function pg_temp.fail_occurrence_completion();

do $completion_rollback$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  failed boolean := false;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;
  begin
    perform public.recurring_task_lifecycle(
      'complete-occurrence',
      jsonb_build_object(
        'userId', '68100000-0000-0000-0000-000000000001',
        'seriesId', fixture_state.series_id,
        'occurrenceId', fixture_state.rollback_complete_occurrence_id,
        'taskId', (select task_id from public.recurring_task_occurrences
                   where id = fixture_state.rollback_complete_occurrence_id),
        'scope', 'this',
        'scheduledDate', (select scheduled_date from public.recurring_task_occurrences
                          where id = fixture_state.rollback_complete_occurrence_id),
        'idempotencyKey', 'rollback-complete-681'
      )
    );
  exception when others then
    failed := true;
  end;
  if not failed
     or (select state from public.recurring_task_occurrences
         where id = fixture_state.rollback_complete_occurrence_id) <> 'open'
     or (select task_id from public.recurring_task_occurrences
         where id = fixture_state.rollback_complete_occurrence_id) is null
     or exists (select 1 from recurring_occurrence_task_events
               where event = 'UPDATE'
                 and task_id = (
                   select task_id from public.recurring_task_occurrences
                   where id = fixture_state.rollback_complete_occurrence_id
                 ))
     then
    raise exception 'Completion failure did not roll back ledger, task, and idempotency state';
  end if;
end
$completion_rollback$;

rollback to savepoint rollback_complete_681;
do $completion_retry$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.rollback_complete_occurrence_id,
      'taskId', (select task_id from public.recurring_task_occurrences
                 where id = fixture_state.rollback_complete_occurrence_id),
      'scope', 'this',
      'scheduledDate', (select scheduled_date from public.recurring_task_occurrences
                        where id = fixture_state.rollback_complete_occurrence_id),
      'idempotencyKey', 'rollback-complete-681'
    )
  );
  if outcome->>'status' <> 'complete'
     or (select state from public.recurring_task_occurrences
         where id = fixture_state.rollback_complete_occurrence_id) <> 'completed' then
    raise exception 'Completion retry did not apply after rollback: %', outcome;
  end if;
end
$completion_retry$;
release savepoint rollback_complete_681;

truncate table recurring_occurrence_task_events;
savepoint rollback_skip_681;
create function pg_temp.fail_occurrence_skip()
returns trigger
language plpgsql
as $$
begin
  raise exception 'fixture forced skip rollback';
end
$$;
create trigger occurrence_lifecycle_skip_failure
before delete on public.tasks
for each row execute function pg_temp.fail_occurrence_skip();

do $skip_rollback$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  failed boolean := false;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;
  begin
    perform public.recurring_task_lifecycle(
      'skip-occurrence',
      jsonb_build_object(
        'userId', '68100000-0000-0000-0000-000000000001',
        'seriesId', fixture_state.series_id,
        'occurrenceId', fixture_state.rollback_skip_occurrence_id,
        'taskId', fixture_state.rollback_skip_task_id,
        'scope', 'this',
        'scheduledDate', (select scheduled_date from public.recurring_task_occurrences
                          where id = fixture_state.rollback_skip_occurrence_id),
        'idempotencyKey', 'rollback-skip-681'
      )
    );
  exception when others then
    failed := true;
  end;
  if not failed
     or (select state from public.recurring_task_occurrences
         where id = fixture_state.rollback_skip_occurrence_id) <> 'open'
     or (select task_id from public.recurring_task_occurrences
         where id = fixture_state.rollback_skip_occurrence_id) is distinct from fixture_state.rollback_skip_task_id
     or exists (select 1 from recurring_occurrence_task_events
               where event = 'DELETE'
                 and task_id = fixture_state.rollback_skip_task_id)
     or exists (select 1 from public.recurring_task_intentional_absences
               where series_id = fixture_state.series_id
                 and scheduled_date = date '2026-08-04')
     then
    raise exception 'Skip failure did not roll back ledger, task, absence, and idempotency state';
  end if;
end
$skip_rollback$;

rollback to savepoint rollback_skip_681;
do $skip_retry$
declare
  fixture_state recurring_occurrence_lifecycle_fixture_state%rowtype;
  outcome jsonb;
begin
  select * into fixture_state
  from recurring_occurrence_lifecycle_fixture_state;
  outcome := public.recurring_task_lifecycle(
    'skip-occurrence',
    jsonb_build_object(
      'userId', '68100000-0000-0000-0000-000000000001',
      'seriesId', fixture_state.series_id,
      'occurrenceId', fixture_state.rollback_skip_occurrence_id,
      'taskId', fixture_state.rollback_skip_task_id,
      'scope', 'this',
      'scheduledDate', (select scheduled_date from public.recurring_task_occurrences
                        where id = fixture_state.rollback_skip_occurrence_id),
      'idempotencyKey', 'rollback-skip-681'
    )
  );
  if outcome->>'status' <> 'complete'
     or (select state from public.recurring_task_occurrences
         where id = fixture_state.rollback_skip_occurrence_id) <> 'skipped'
     or (select task_id from public.recurring_task_occurrences
         where id = fixture_state.rollback_skip_occurrence_id) is not null
     or (select count(*) from recurring_occurrence_task_events
         where event = 'DELETE' and task_id = fixture_state.rollback_skip_task_id) <> 1 then
    raise exception 'Skip retry did not apply after rollback: %', outcome;
  end if;
end
$skip_retry$;
release savepoint rollback_skip_681;

rollback;
