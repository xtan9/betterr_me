-- ralph-ci: true
-- Proves the additive lineage expansion on top of the #659 lifecycle model.
begin;

do $schema$
declare
  required_column text;
begin
  if to_regclass('public.recurring_task_series') is null
    or to_regclass('public.recurring_task_series_revisions') is null
    or to_regclass('public.recurring_task_occurrences') is null
    or to_regclass('public.recurring_task_idempotency') is null then
    raise exception 'recurring lifecycle storage from #659 is missing';
  end if;

  if to_regclass('public.recurring_tasks') is null then
    raise exception 'legacy recurring task storage was removed';
  end if;

  foreach required_column in array array[
    'id',
    'user_id',
    'recurrence_rule',
    'start_date',
    'instances_generated',
    'status'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recurring_tasks'
        and column_name = required_column
    ) then
      raise exception 'legacy recurring task column is missing: %', required_column;
    end if;
  end loop;

  foreach required_column in array array[
    'recurring_task_id',
    'is_exception',
    'original_date'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = required_column
    ) then
      raise exception 'legacy task recurrence column is missing: %', required_column;
    end if;
  end loop;

  foreach required_column in array array[
    'lifecycle_state',
    'stopping_policy',
    'activation_date',
    'coverage_horizon',
    'concurrency_token'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recurring_task_series'
        and column_name = required_column
    ) then
      raise exception 'Series storage expansion is missing column: %', required_column;
    end if;
  end loop;

  foreach required_column in array array[
    'effective_date_range',
    'recurrence_rule',
    'recurrence_anchor',
    'series_defaults'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recurring_task_series_revisions'
        and column_name = required_column
    ) then
      raise exception 'Series Revision storage expansion is missing column: %', required_column;
    end if;
  end loop;

  foreach required_column in array array[
    'creating_revision_id',
    'disposition',
    'retained_sequence',
    'occurrence_overrides',
    'task_id'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recurring_task_occurrences'
        and column_name = required_column
    ) then
      raise exception 'Task Occurrence storage expansion is missing column: %', required_column;
    end if;
  end loop;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.recurring_task_series'::regclass
  ) then
    raise exception 'Recurring Task Series storage is missing RLS';
  end if;
  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.recurring_task_occurrences'::regclass
  ) then
    raise exception 'Task Occurrence storage is missing RLS';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.recurring_task_series_revisions'::regclass
      and contype = 'x'
  ) then
    raise exception 'Series Revision storage is missing its exclusion constraint';
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
    raise exception 'Task Occurrence storage is missing Series plus Scheduled Date uniqueness';
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.recurring_task_occurrences'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.recurring_task_occurrences'::regclass
           and attname = 'task_id')
      ]::smallint[]
  ) then
    raise exception 'Task Occurrence storage is missing one-to-one task uniqueness';
  end if;
end
$schema$;

select public.ralph_ci_create_auth_user(
  '67700000-0000-0000-0000-000000000001',
  'recurring-storage-owner@example.test'
);
select public.ralph_ci_create_auth_user(
  '67700000-0000-0000-0000-000000000002',
  'recurring-storage-other@example.test'
);

-- The constrained runner owns disposable table grants before the fixture
-- switches to authenticated. Set the owner claim while the runner still has
-- the table grant so this setup write follows the existing tasks RLS policy
-- without broadening authenticated direct-write privileges.
select set_config('request.jwt.claims', '', false);
select set_config(
  'request.jwt.claim.sub',
  '67700000-0000-0000-0000-000000000001',
  false
);

insert into public.tasks (id, user_id, title)
values (
  '67700000-0000-0000-0000-000000000101',
  '67700000-0000-0000-0000-000000000001',
  'Linked Task Occurrence'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '67700000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"67700000-0000-0000-0000-000000000001"}',
  true
);

do $authorization$
begin
  if not has_function_privilege(
    'authenticated',
    'public.recurring_task_lifecycle(text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks lifecycle creation execute privilege';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.record_recurring_task_occurrence(uuid,date,uuid,text,integer,jsonb,uuid,bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks occurrence recording execute privilege';
  end if;
  if has_function_privilege(
    'anon',
    'public.record_recurring_task_occurrence(uuid,date,uuid,text,integer,jsonb,uuid,bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'anonymous occurrence recording execute privilege leaked';
  end if;
  if has_table_privilege(
    'authenticated',
    'public.recurring_task_series',
    'INSERT'
  ) then
    raise exception 'authenticated retained direct Series insert privilege';
  end if;
  if has_table_privilege(
    'authenticated',
    'public.recurring_task_occurrences',
    'INSERT'
  ) then
    raise exception 'authenticated retained direct Task Occurrence insert privilege';
  end if;
  if has_table_privilege(
    'authenticated',
    'public.recurring_task_idempotency',
    'SELECT'
  ) then
    raise exception 'authenticated can read hidden idempotency records';
  end if;
  if has_table_privilege(
    'betterr_recurring_task_storage',
    'public.recurring_task_idempotency',
    'UPDATE'
  ) then
    raise exception 'storage owner retained unnecessary idempotency update privilege';
  end if;
  if has_schema_privilege(
    'betterr_recurring_task_storage',
    'public',
    'CREATE'
  ) then
    raise exception 'storage owner retained schema create privilege';
  end if;
  if exists (
    select 1
    from pg_roles
    where rolname = 'betterr_recurring_task_storage'
      and (
        rolcanlogin
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolinherit
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'storage owner role has unsafe attributes';
  end if;
  if exists (
    select 1
    from pg_proc as routine
    where routine.oid =
      'public.record_recurring_task_occurrence(uuid,date,uuid,text,integer,jsonb,uuid,bigint,text)'::regprocedure
      and (
        pg_get_userbyid(routine.proowner) <> 'betterr_recurring_task_storage'
        or not routine.prosecdef
        or not coalesce(
          routine.proconfig @> array['search_path=pg_catalog, public'],
          false
        )
      )
  ) then
    raise exception 'occurrence recording function security settings are unsafe';
  end if;
end
$authorization$;

create temporary table recurring_storage_fixture_state (
  series_id uuid not null,
  revision_id uuid not null,
  initial_concurrency_token bigint not null
) on commit drop;

with created as (
  select public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '67700000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object(
        'frequency', 'weekly',
        'interval', 1,
        'days_of_week', jsonb_build_array(1, 3)
      ),
      'recurrenceAnchor', '2026-08-10',
      'activationDate', '2026-08-10',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Storage acceptance task',
        'description', null,
        'priority', 2
      ),
      'idempotencyKey', 'create-series-677'
    )
  ) as outcome
)
insert into recurring_storage_fixture_state (
  series_id,
  revision_id,
  initial_concurrency_token
)
select
  (outcome->'series'->>'id')::uuid,
  (outcome->'series'->'revisions'->0->>'id')::uuid,
  (outcome->'series'->>'revisionToken')::bigint
from created;

do $creation$
declare
  v_series_id uuid;
  v_revision_id uuid;
  retry jsonb;
  series_row public.recurring_task_series;
  revision_row public.recurring_task_series_revisions;
begin
  select state.series_id, state.revision_id
  into v_series_id, v_revision_id
  from recurring_storage_fixture_state as state;

  select * into series_row
  from public.recurring_task_series as series
  where series.id = v_series_id;
  if series_row.user_id <> '67700000-0000-0000-0000-000000000001'
    or series_row.lifecycle_state <> 'active'
    or series_row.activation_date <> date '2026-08-10'
    or series_row.stopping_policy <> 'unbounded'
    or series_row.coverage_horizon is not null
    or series_row.concurrency_token <> 1 then
    raise exception 'Series storage expansion did not retain lifecycle fields: %', series_row;
  end if;

  select * into revision_row
  from public.recurring_task_series_revisions as revision
  where revision.id = v_revision_id;
  if revision_row.series_id <> v_series_id
    or revision_row.effective_from <> date '2026-08-10'
    or revision_row.effective_to is not null
    or revision_row.recurrence_anchor <> date '2026-08-10'
    or revision_row.series_defaults <> revision_row.defaults
    or not (date '2026-08-10' <@ revision_row.effective_date_range) then
    raise exception 'Series Revision storage expansion did not retain effective lineage: %', revision_row;
  end if;

  retry := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '67700000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object(
        'frequency', 'weekly', 'interval', 1, 'days_of_week', jsonb_build_array(1, 3)
      ),
      'recurrenceAnchor', '2026-08-10',
      'activationDate', '2026-08-10',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object(
        'title', 'Storage acceptance task', 'description', null, 'priority', 2
      ),
      'idempotencyKey', 'create-series-677'
    )
  );
  if retry->>'status' <> 'already-applied'
    or (retry->'series'->>'id')::uuid <> v_series_id then
    raise exception 'same Series request did not replay its idempotent outcome: %', retry;
  end if;

end
$creation$;

select set_config(
  'request.jwt.claim.sub',
  '67700000-0000-0000-0000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"67700000-0000-0000-0000-000000000002"}',
  true
);

do $ownership$
declare
  v_series_id uuid;
  v_revision_id uuid;
  visible_series_count integer;
  visible_revision_count integer;
  visible_occurrence_count integer;
begin
  select state.series_id, state.revision_id
  into v_series_id, v_revision_id
  from recurring_storage_fixture_state as state;

  select count(*) into visible_series_count
  from public.recurring_task_series;
  select count(*) into visible_revision_count
  from public.recurring_task_series_revisions;
  select count(*) into visible_occurrence_count
  from public.recurring_task_occurrences;
  if visible_series_count <> 0
    or visible_revision_count <> 0
    or visible_occurrence_count <> 0 then
    raise exception 'cross-owner lifecycle rows were visible: %, %, %',
      visible_series_count, visible_revision_count, visible_occurrence_count;
  end if;

  begin
    perform public.record_recurring_task_occurrence(
      v_series_id,
      date '2026-08-10',
      v_revision_id,
      'open',
      1,
      '{}'::jsonb,
      null,
      1,
      'cross-owner-occurrence-677'
    );
    raise exception 'cross-owner occurrence write unexpectedly succeeded';
  exception
    when sqlstate 'P0002' then
      if sqlerrm <> 'recurring_task_series_not_found' then raise; end if;
  end;
end
$ownership$;

select set_config(
  'request.jwt.claim.sub',
  '67700000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"67700000-0000-0000-0000-000000000001"}',
  true
);

do $occurrences$
declare
  v_series_id uuid;
  v_revision_id uuid;
  created jsonb;
  retry jsonb;
  overrides jsonb;
  v_series_token bigint;
  occurrence_count integer;
begin
  select state.series_id, state.revision_id
  into v_series_id, v_revision_id
  from recurring_storage_fixture_state as state;

  created := public.record_recurring_task_occurrence(
    v_series_id,
    date '2026-08-10',
    v_revision_id,
    'open',
    1,
    '{"dueTime":null,"priority":2}'::jsonb,
    '67700000-0000-0000-0000-000000000101',
    1,
    'record-occurrence-677'
  );
  if created->>'status' <> 'created'
    or (created->>'concurrencyToken')::bigint <> 2 then
    raise exception 'first Task Occurrence did not advance its token: %', created;
  end if;

  select occurrence.occurrence_overrides
  into overrides
  from public.recurring_task_occurrences as occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-10';
  if not (overrides ? 'dueTime')
    or (overrides->'dueTime') is distinct from 'null'::jsonb
    or not (overrides ? 'priority')
    or (overrides ? 'description') then
    raise exception 'Occurrence Override presence did not distinguish null from absence: %', overrides;
  end if;

  if (select occurrence.task_id
      from public.recurring_task_occurrences as occurrence
      where occurrence.series_id = v_series_id
        and occurrence.scheduled_date = date '2026-08-10')
      <> '67700000-0000-0000-0000-000000000101'::uuid then
    raise exception 'Task Occurrence did not retain its optional one-to-one task link';
  end if;

  retry := public.record_recurring_task_occurrence(
    v_series_id,
    date '2026-08-10',
    v_revision_id,
    'open',
    1,
    '{"dueTime":null,"priority":2}'::jsonb,
    '67700000-0000-0000-0000-000000000101',
    1,
    'record-occurrence-677'
  );
  if retry->>'status' <> 'already_applied'
    or (retry->>'occurrenceId')::uuid <> (created->>'occurrenceId')::uuid then
    raise exception 'same occurrence request did not replay its idempotent outcome: %', retry;
  end if;

  begin
    perform public.record_recurring_task_occurrence(
      v_series_id, date '2026-08-10', v_revision_id, 'open', 1,
      '{"dueTime":null,"priority":2}'::jsonb, null, 2,
      'duplicate-scheduled-date-677'
    );
    raise exception 'duplicate Series plus Scheduled Date unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  created := public.record_recurring_task_occurrence(
    v_series_id, date '2026-08-11', v_revision_id, 'open', 2,
    '{}'::jsonb, null, 2, 'record-second-occurrence-677'
  );
  if created->>'status' <> 'created'
    or (created->>'concurrencyToken')::bigint <> 3 then
    raise exception 'second Task Occurrence did not advance its token: %', created;
  end if;

  select occurrence.occurrence_overrides
  into overrides
  from public.recurring_task_occurrences as occurrence
  where occurrence.series_id = v_series_id
    and occurrence.scheduled_date = date '2026-08-11';
  if overrides <> '{}'::jsonb or overrides ? 'dueTime' then
    raise exception 'override absence was not retained as an empty object: %', overrides;
  end if;

  begin
    perform public.record_recurring_task_occurrence(
      v_series_id, date '2026-08-12', v_revision_id, 'open', 3,
      '{}'::jsonb, '67700000-0000-0000-0000-000000000101', 3,
      'duplicate-task-link-677'
    );
    raise exception 'one Task Occurrence task link was not enforced';
  exception
    when unique_violation then null;
  end;

  created := public.record_recurring_task_occurrence(
    v_series_id, date '2026-08-12', v_revision_id, 'skipped', 3,
    '{}'::jsonb, null, 3, 'record-skipped-occurrence-677'
  );
  if created->>'status' <> 'created'
    or (created->>'concurrencyToken')::bigint <> 4 then
    raise exception 'Skipped Occurrence did not advance its token: %', created;
  end if;

  select count(*) into occurrence_count
  from public.recurring_task_occurrences as occurrence
  where occurrence.series_id = v_series_id;
  select series.concurrency_token
  into v_series_token
  from public.recurring_task_series as series
  where series.id = v_series_id;
  if occurrence_count <> 3 or v_series_token <> 4 then
    raise exception 'Occurrence ledger/token state was not serialized: %, %',
      occurrence_count, v_series_token;
  end if;

  if (select count(*) from public.recurring_task_occurrences as occurrence
      where occurrence.series_id = v_series_id
        and occurrence.retained_sequence in (1, 2, 3)) <> 3 then
    raise exception 'retained occurrence sequence was not preserved';
  end if;
  if (select count(*) from public.recurring_task_occurrences as occurrence
      where occurrence.series_id = v_series_id
        and occurrence.disposition = 'skipped'
        and occurrence.creating_revision_id = v_revision_id) <> 1 then
    raise exception 'disposition or creating revision lineage was not retained';
  end if;
end
$occurrences$;

select set_config(
  'request.jwt.claim.sub',
  '67700000-0000-0000-0000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"67700000-0000-0000-0000-000000000002"}',
  true
);

do $occurrence_ownership$
declare
  v_series_id uuid;
  v_revision_id uuid;
begin
  select state.series_id, state.revision_id
  into v_series_id, v_revision_id
  from recurring_storage_fixture_state as state;

  begin
    perform public.record_recurring_task_occurrence(
      v_series_id, date '2026-08-13', v_revision_id, 'open', 4,
      '{}'::jsonb, null, 4, 'cross-owner-occurrence-677-2'
    );
    raise exception 'cross-owner Task Occurrence write unexpectedly succeeded';
  exception
    when sqlstate 'P0002' then
      if sqlerrm <> 'recurring_task_series_not_found' then raise; end if;
  end;
end
$occurrence_ownership$;

rollback;
