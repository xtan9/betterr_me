-- ralph-ci: true
-- Proves safe legacy attribution, retained facts, aggregate diagnostics, and
-- transactional rollback for the recurring-task migration boundary.

begin;

select public.ralph_ci_create_auth_user(
  '68500000-0000-0000-0000-000000000001',
  'legacy-backfill-owner@example.test'
);
select public.ralph_ci_create_auth_user(
  '68500000-0000-0000-0000-000000000002',
  'legacy-backfill-other@example.test'
);

-- Setup writes happen before the constrained role switch, following the
-- repository's fixture pattern without broadening authenticated privileges.
select set_config('betterr.recurring_lifecycle', 'on', true);
select set_config(
  'request.jwt.claim.sub',
  '68500000-0000-0000-0000-000000000001',
  false
);
select set_config(
  'request.jwt.claims',
  '{"sub":"68500000-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

insert into public.recurring_tasks (
  id, user_id, title, description, priority, due_time,
  recurrence_rule, start_date, end_type, end_date, end_count,
  instances_generated, next_generate_date, status
) values
  (
    '68500000-0000-0000-0000-000000000101',
    '68500000-0000-0000-0000-000000000001',
    'Legacy active work',
    'Keep this description',
    1,
    time '09:30',
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'never',
    null,
    null,
    99,
    date '2026-08-03',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000102',
    '68500000-0000-0000-0000-000000000001',
    'Paused recurring work',
    'Completed before the pause',
    2,
    time '08:00',
    '{"frequency":"daily","interval":1}',
    date '2026-07-25',
    'never',
    null,
    null,
    88,
    date '2026-08-02',
    'paused'
  ),
  (
    '68500000-0000-0000-0000-000000000103',
    '68500000-0000-0000-0000-000000000001',
    'Archived recurring work',
    'Retain the stopping policy',
    1,
    time '07:00',
    '{"frequency":"daily","interval":1}',
    date '2026-07-20',
    'on_date',
    date '2026-08-01',
    null,
    77,
    date '2026-08-02',
    'archived'
  ),
  (
    '68500000-0000-0000-0000-000000000104',
    '68500000-0000-0000-0000-000000000001',
    'Override default title',
    'Override default description',
    1,
    time '10:00',
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'never',
    null,
    null,
    42,
    date '2026-08-20',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000105',
    '68500000-0000-0000-0000-000000000001',
    'Partially generated work',
    'Do not invent missing positions',
    0,
    time '11:00',
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'never',
    null,
    null,
    999,
    date '2030-01-01',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000106',
    '68500000-0000-0000-0000-000000000001',
    'Duplicate-position work',
    'Both rows are uncertain',
    0,
    null,
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'never',
    null,
    null,
    2,
    date '2026-08-02',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000107',
    '68500000-0000-0000-0000-000000000001',
    'Cross-owner work',
    'The task owner does not match the series owner',
    0,
    null,
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'never',
    null,
    null,
    1,
    date '2026-08-02',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000108',
    '68500000-0000-0000-0000-000000000001',
    'Missing scheduled position',
    'Keep this task standalone',
    0,
    null,
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'never',
    null,
    null,
    1,
    date '2026-08-02',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000109',
    '68500000-0000-0000-0000-000000000001',
    'Unsafe recurrence metadata',
    'Keep this task standalone',
    0,
    null,
    '{"frequency":"daily"}',
    date '2026-07-29',
    'never',
    null,
    null,
    1,
    date '2026-08-02',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000110',
    '68500000-0000-0000-0000-000000000001',
    'Unsafe scheduled position',
    'The position precedes the recurrence anchor',
    0,
    null,
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'never',
    null,
    null,
    1,
    date '2026-08-02',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000111',
    '68500000-0000-0000-0000-000000000001',
    'Count-limited work',
    'Use retained occurrence count',
    0,
    null,
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'after_count',
    null,
    2,
    99,
    date '2030-01-01',
    'active'
  ),
  (
    '68500000-0000-0000-0000-000000000112',
    '68500000-0000-0000-0000-000000000001',
    'Rollback probe work',
    'The failed migration must leave this untouched',
    0,
    null,
    '{"frequency":"daily","interval":1}',
    date '2026-07-29',
    'never',
    null,
    null,
    1,
    date '2026-08-02',
    'active'
  );

-- Simulate duplicate ambiguous legacy positions. A pair of rows with the same
-- missing position is permitted by the current partial unique index and is
-- still conservatively reported as duplicate rather than attributed.

insert into public.tasks (
  id, user_id, title, description, is_completed, priority,
  due_date, due_time, completed_at, status, section, sort_order,
  recurring_task_id, original_date
) values
  (
    '68500000-0000-0000-0000-000000000201',
    '68500000-0000-0000-0000-000000000001',
    'Legacy active work',
    'Keep this description',
    false,
    1,
    date '2026-08-03',
    time '09:30',
    null,
    'todo',
    'personal',
    1,
    '68500000-0000-0000-0000-000000000101',
    date '2026-08-03'
  ),
  (
    '68500000-0000-0000-0000-000000000202',
    '68500000-0000-0000-0000-000000000001',
    'Paused recurring work',
    'Completed before the pause',
    true,
    2,
    date '2026-07-31',
    time '08:00',
    timestamptz '2026-07-31 10:00:00+00',
    'done',
    'personal',
    2,
    '68500000-0000-0000-0000-000000000102',
    date '2026-07-31'
  ),
  (
    '68500000-0000-0000-0000-000000000204',
    '68500000-0000-0000-0000-000000000001',
    'Override changed title',
    null,
    false,
    2,
    date '2026-08-02',
    null,
    null,
    'in_progress',
    'work',
    999,
    '68500000-0000-0000-0000-000000000104',
    date '2026-08-01'
  ),
  (
    '68500000-0000-0000-0000-000000000205',
    '68500000-0000-0000-0000-000000000001',
    'Partially generated work',
    'Do not invent missing positions',
    false,
    0,
    date '2026-07-29',
    time '11:00',
    null,
    'todo',
    'personal',
    5,
    '68500000-0000-0000-0000-000000000105',
    date '2026-07-29'
  ),
  (
    '68500000-0000-0000-0000-000000000206',
    '68500000-0000-0000-0000-000000000001',
    'Partially generated work',
    'Do not invent missing positions',
    false,
    0,
    date '2026-07-31',
    time '11:00',
    null,
    'todo',
    'personal',
    6,
    '68500000-0000-0000-0000-000000000105',
    date '2026-07-31'
  ),
  (
    '68500000-0000-0000-0000-000000000207',
    '68500000-0000-0000-0000-000000000001',
    'Duplicate-position work',
    'Both rows are uncertain',
    false,
    0,
    null,
    null,
    null,
    'todo',
    'personal',
    7,
    '68500000-0000-0000-0000-000000000106',
    null
  ),
  (
    '68500000-0000-0000-0000-000000000208',
    '68500000-0000-0000-0000-000000000001',
    'Duplicate-position work copy',
    'Both rows are uncertain',
    false,
    0,
    null,
    null,
    null,
    'todo',
    'personal',
    8,
    '68500000-0000-0000-0000-000000000106',
    null
  ),
  (
    '68500000-0000-0000-0000-000000000210',
    '68500000-0000-0000-0000-000000000001',
    'Missing scheduled position',
    'Keep this task standalone',
    false,
    0,
    null,
    null,
    null,
    'todo',
    'personal',
    10,
    '68500000-0000-0000-0000-000000000108',
    null
  ),
  (
    '68500000-0000-0000-0000-000000000211',
    '68500000-0000-0000-0000-000000000001',
    'Unsafe recurrence metadata',
    'Keep this task standalone',
    false,
    0,
    date '2026-08-01',
    null,
    null,
    'todo',
    'personal',
    11,
    '68500000-0000-0000-0000-000000000109',
    date '2026-08-01'
  ),
  (
    '68500000-0000-0000-0000-000000000212',
    '68500000-0000-0000-0000-000000000001',
    'Unsafe scheduled position',
    'The position precedes the recurrence anchor',
    false,
    0,
    date '2026-07-28',
    null,
    null,
    'todo',
    'personal',
    12,
    '68500000-0000-0000-0000-000000000110',
    date '2026-07-28'
  ),
  (
    '68500000-0000-0000-0000-000000000213',
    '68500000-0000-0000-0000-000000000001',
    'Count-limited work',
    'Use retained occurrence count',
    false,
    0,
    date '2026-07-29',
    null,
    null,
    'todo',
    'personal',
    13,
    '68500000-0000-0000-0000-000000000111',
    date '2026-07-29'
  ),
  (
    '68500000-0000-0000-0000-000000000214',
    '68500000-0000-0000-0000-000000000001',
    'Rollback probe work',
    'The failed migration must leave this untouched',
    false,
    0,
    date '2026-08-02',
    null,
    null,
    'todo',
    'personal',
    14,
    '68500000-0000-0000-0000-000000000112',
    date '2026-08-02'
  );

select set_config(
  'request.jwt.claim.sub',
  '68500000-0000-0000-0000-000000000002',
  false
);

insert into public.tasks (
  id, user_id, title, description, is_completed, priority,
  due_date, due_time, completed_at, status, section, sort_order,
  recurring_task_id, original_date
) values (
  '68500000-0000-0000-0000-000000000209',
  '68500000-0000-0000-0000-000000000002',
  'Cross-owner task',
  'Preserve the other owner task',
  false,
  0,
  date '2026-08-01',
  null,
  null,
  'todo',
  'personal',
  9,
  '68500000-0000-0000-0000-000000000107',
  date '2026-08-01'
);

select set_config(
  'request.jwt.claim.sub',
  '68500000-0000-0000-0000-000000000001',
  false
);

create function pg_temp.fixture_685_backfill_rollback_guard()
returns trigger
language plpgsql
as $function$
begin
  if new.id = '68500000-0000-0000-0000-000000000214'
     and current_setting('betterr.fixture_685_rollback', true) = 'on' then
    raise exception 'legacy backfill rollback sentinel';
  end if;
  return new;
end;
$function$;

create trigger fixture_685_backfill_rollback_guard
before update on public.tasks
for each row execute function pg_temp.fixture_685_backfill_rollback_guard();

select set_config('betterr.fixture_685_rollback', 'on', true);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '68500000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"68500000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $assert_preflight$
declare
  preflight jsonb;
begin
  preflight := public.recurring_task_backfill_legacy_preflight(
    date '2026-08-01',
    '68500000-0000-0000-0000-000000000001'
  );
  if preflight->>'safeSeriesCount' <> '11'
     or preflight->>'safeTaskCount' <> '7'
     or preflight->>'uncertainTaskCount' <> '6'
     or preflight->'diagnostics'->>'crossOwnerTasks' <> '1'
     or preflight->'diagnostics'->>'duplicateScheduledPositionTasks' <> '2'
     or preflight->'diagnostics'->>'missingScheduledDateTasks' <> '1'
     or preflight->'diagnostics'->>'unsafeRecurrenceMetadataTasks' <> '1'
     or preflight->'diagnostics'->>'unsafeScheduledDateTasks' <> '1' then
    raise exception 'legacy backfill preflight was incorrect: %', preflight;
  end if;
end
$assert_preflight$;

do $assert_all_owner_authorization$
begin
  begin
    perform public.recurring_task_backfill_legacy_preflight(date '2026-08-01', null);
    raise exception 'all-owner preflight unexpectedly allowed an authenticated caller';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.recurring_task_backfill_legacy(date '2026-08-01', null);
    raise exception 'all-owner backfill unexpectedly allowed an authenticated caller';
  exception when insufficient_privilege then
    null;
  end;
end
$assert_all_owner_authorization$;

-- The guard fires after the migration has inserted lineage for the rollback
-- probe, so a caught error proves the whole function call is atomic.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"68500000-0000-0000-0000-000000000001","role":"service_role"}',
  true
);
do $assert_rollback$
declare
  failure_message text;
begin
  begin
    perform public.recurring_task_backfill_legacy(date '2026-08-01', null);
    raise exception 'rollback sentinel was not raised';
  exception when others then
    get stacked diagnostics failure_message = message_text;
    if failure_message <> 'legacy backfill rollback sentinel' then
      raise exception 'unexpected rollback probe error: %', failure_message;
    end if;
  end;
end
$assert_rollback$;

reset role;
do $assert_rollback_state$
begin
  if exists (
       select 1
       from public.recurring_task_series
       where id = '68500000-0000-0000-0000-000000000112'
     )
     or exists (
       select 1
       from public.recurring_task_occurrences
       where task_id = '68500000-0000-0000-0000-000000000214'
     )
     or (select recurring_task_id from public.tasks
         where id = '68500000-0000-0000-0000-000000000214') is distinct from
        '68500000-0000-0000-0000-000000000112' then
    raise exception 'legacy backfill did not roll back partial lineage';
  end if;
end
$assert_rollback_state$;

select set_config('betterr.fixture_685_rollback', 'off', true);

set local role authenticated;
do $assert_backfill$
declare
  outcome jsonb;
begin
  outcome := public.recurring_task_backfill_legacy(date '2026-08-01', null);
  if outcome->>'migratedSeriesCount' <> '11'
     or outcome->>'migratedTaskCount' <> '7'
     or outcome->>'migratedOccurrenceCount' <> '7'
     or outcome->>'detachedTaskCount' <> '6'
     or outcome->>'stoppingPolicyHistoryCount' <> '11' then
    raise exception 'safe legacy backfill was incomplete: %', outcome;
  end if;

end
$assert_backfill$;

reset role;
do $assert_aggregate_diagnostics$
declare
  diagnostics jsonb;
begin
  select d.diagnostics
  into diagnostics
  from public.recurring_task_migration_diagnostics d
  where d.migration_key = '20260802000002_backfill_legacy_recurring';

  if diagnostics->'diagnostics'->>'crossOwnerTasks' <> '1'
     or diagnostics->'diagnostics'->>'duplicateScheduledPositionTasks' <> '2'
     or diagnostics->'diagnostics'->>'missingScheduledDateTasks' <> '1'
     or diagnostics->'diagnostics'->>'unsafeRecurrenceMetadataTasks' <> '1'
     or diagnostics->'diagnostics'->>'unsafeScheduledDateTasks' <> '1' then
    raise exception 'aggregate migration diagnostics were incomplete: %', diagnostics;
  end if;
end
$assert_aggregate_diagnostics$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '68500000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"68500000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $assert_safe_lineage$
declare
  original_task public.tasks%rowtype;
  safe_series_id uuid;
  occurrence_overrides jsonb;
begin
  select * into original_task
  from public.tasks
  where id = '68500000-0000-0000-0000-000000000201';

  select id into safe_series_id
  from public.recurring_task_series
  where id = '68500000-0000-0000-0000-000000000101'
    and user_id = '68500000-0000-0000-0000-000000000001';

  if safe_series_id is null
     or (select count(*) from public.recurring_task_series_revisions
         where recurring_task_series_revisions.series_id = safe_series_id) <> 1
     or (select state from public.recurring_task_series_revisions
         where recurring_task_series_revisions.series_id = safe_series_id) <> 'active'
     or (select count(*) from public.recurring_task_occurrences
         where recurring_task_occurrences.series_id = safe_series_id
           and scheduled_date = date '2026-08-03') <> 1
     or (select scheduled_date from public.tasks
         where id = original_task.id) <> date '2026-08-03'
     or (select title from public.tasks
         where id = original_task.id) is distinct from original_task.title
     or (select description from public.tasks
         where id = original_task.id) is distinct from original_task.description
     or (select due_date from public.tasks
         where id = original_task.id) is distinct from original_task.due_date
     or (select due_time from public.tasks
         where id = original_task.id) is distinct from original_task.due_time then
    raise exception 'safe legacy lineage or visible task preservation failed';
  end if;
end
$assert_safe_lineage$;

do $assert_lifecycle_and_history$
declare
  paused_series public.recurring_task_series%rowtype;
  archived_series public.recurring_task_series%rowtype;
  paused_occurrence public.recurring_task_occurrences%rowtype;
  override_occurrence public.recurring_task_occurrences%rowtype;
  occurrence_overrides jsonb;
  partial_series public.recurring_task_series%rowtype;
  count_series public.recurring_task_series%rowtype;
begin
  select * into paused_series
  from public.recurring_task_series
  where id = '68500000-0000-0000-0000-000000000102';
  select * into paused_occurrence
  from public.recurring_task_occurrences
  where series_id = paused_series.id;
  if paused_series.status <> 'paused'
     or (select state from public.recurring_task_series_revisions
         where series_id = paused_series.id) <> 'paused'
     or paused_occurrence.state <> 'completed'
     or paused_occurrence.completed_at <> timestamptz '2026-07-31 10:00:00+00'
     or (select is_completed from public.tasks
         where id = '68500000-0000-0000-0000-000000000202') is not true
     or (select status from public.tasks
         where id = '68500000-0000-0000-0000-000000000202') <> 'done' then
    raise exception 'paused or completed legacy state was not retained';
  end if;

  select * into archived_series
  from public.recurring_task_series
  where id = '68500000-0000-0000-0000-000000000103';
  if archived_series.status <> 'ended'
     or (select state from public.recurring_task_series_revisions
         where series_id = archived_series.id) <> 'ended'
     or (select end_type from public.recurring_task_series_stopping_policy_history
         where series_id = archived_series.id) <> 'on_date'
     or (select effective_to
         from public.recurring_task_series_stopping_policy_history
         where series_id = archived_series.id) <> date '2026-08-02'
     or (select effective_to from public.recurring_task_series_revisions
         where series_id = archived_series.id) <> date '2026-08-02'
     or (select last_scheduled_date
         from public.recurring_task_series_stopping_policy_history
         where series_id = archived_series.id) <> date '2026-08-01'
     or (select legacy_instances_generated
         from public.recurring_task_series_stopping_policy_history
         where series_id = archived_series.id) <> 77 then
    raise exception 'archived lifecycle or stopping-policy history was not retained';
  end if;

  select * into override_occurrence
  from public.recurring_task_occurrences
  where series_id = '68500000-0000-0000-0000-000000000104';
  occurrence_overrides := override_occurrence.overrides;
  if occurrence_overrides->>'title' <> 'Override changed title'
     or occurrence_overrides->'description' <> 'null'::jsonb
     or occurrence_overrides->>'priority' <> '2'
     or occurrence_overrides->'dueTime' <> 'null'::jsonb
     or occurrence_overrides->>'dueDate' <> '2026-08-02'
     or occurrence_overrides->>'status' <> 'in_progress'
     or occurrence_overrides->>'section' <> 'work'
     or occurrence_overrides ? 'sortOrder' then
    raise exception 'field-level overrides were not inferred from evidence: %',
      occurrence_overrides;
  end if;

  select * into partial_series
  from public.recurring_task_series
  where id = '68500000-0000-0000-0000-000000000105';
  if partial_series.coverage_horizon <> date '2026-07-31'
     or (select count(*) from public.recurring_task_occurrences
         where series_id = partial_series.id) <> 2
     or exists (select 1 from public.recurring_task_occurrences
                where series_id = partial_series.id
                  and scheduled_date = date '2026-07-30')
     or (select instances_generated from public.recurring_tasks
         where id = partial_series.id) <> 2
     or (select next_generate_date from public.recurring_tasks
         where id = partial_series.id) <> date '2026-08-01' then
    raise exception 'partial legacy generation invented a position or trusted a counter';
  end if;

  select * into count_series
  from public.recurring_task_series
  where id = '68500000-0000-0000-0000-000000000111';
  if count_series.occurrence_limit <> 2
     or count_series.status <> 'active'
     or count_series.coverage_horizon <> date '2026-07-29'
     or (select count(*) from public.recurring_task_occurrences
         where series_id = count_series.id) <> 1
     or (select occurrence_limit
         from public.recurring_task_series_stopping_policy_history
         where series_id = count_series.id) <> 2 then
    raise exception 'occurrence-limit consumption trusted the legacy counter';
  end if;
end
$assert_lifecycle_and_history$;

do $assert_uncertain_tasks$
declare
  other_task_title text;
begin
  if exists (select 1 from public.recurring_task_series
             where id = '68500000-0000-0000-0000-000000000109')
     or exists (select 1 from public.recurring_task_occurrences
                where task_id in (
                  '68500000-0000-0000-0000-000000000207',
                  '68500000-0000-0000-0000-000000000208',
                  '68500000-0000-0000-0000-000000000211',
                  '68500000-0000-0000-0000-000000000212'
                )) then
    raise exception 'uncertain legacy tasks were assigned guessed lineage';
  end if;

  if (select recurring_task_id from public.tasks
      where id = '68500000-0000-0000-0000-000000000210') is not null
     or (select recurring_task_id from public.tasks
         where id = '68500000-0000-0000-0000-000000000211') is not null
     or (select recurring_task_id from public.tasks
         where id = '68500000-0000-0000-0000-000000000212') is not null
     or (select recurring_series_id from public.tasks
         where id = '68500000-0000-0000-0000-000000000210') is not null
     or (select title from public.tasks
         where id = '68500000-0000-0000-0000-000000000211') <> 'Unsafe recurrence metadata' then
    raise exception 'uncertain tasks were not preserved as standalone facts';
  end if;

  perform set_config('request.jwt.claim.sub',
    '68500000-0000-0000-0000-000000000002', true);
  select title into other_task_title
  from public.tasks
  where id = '68500000-0000-0000-0000-000000000209';
  if other_task_title <> 'Cross-owner task'
     or (select recurring_task_id from public.tasks
         where id = '68500000-0000-0000-0000-000000000209') is not null then
    raise exception 'cross-owner task was not detached without changing its value';
  end if;

  perform set_config('request.jwt.claim.sub',
    '68500000-0000-0000-0000-000000000001', true);
end
$assert_uncertain_tasks$;

rollback;
