-- ralph-ci: true
-- Exercise the recurring task lifecycle through its single authenticated RPC.
-- Every assertion runs in one transaction and the fixture rolls it back.
begin;

select public.ralph_ci_create_auth_user(
  '65900000-0000-0000-0000-000000000001',
  'recurring-lifecycle@example.test'
);
select public.ralph_ci_create_auth_user(
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
    if new.due_time = time '11:30' then
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

rollback;
