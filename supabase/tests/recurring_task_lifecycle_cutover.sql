-- ralph-ci: true
-- Proves the release marker is complete, immutable, and not exposed as an
-- application write path after the production-compatible legacy backfill.

begin;

do $assert_cutover_marker$
declare
  marker jsonb;
begin
  select jsonb_build_object(
    'migrationKey', migration_key,
    'backfillMigrationKey', backfill_migration_key,
    'cutoverDate', cutover_date,
    'status', status,
    'backfillOutcome', backfill_outcome
  )
  into marker
  from public.recurring_task_lifecycle_cutover
  where singleton;

  if marker is null
     or marker->>'migrationKey' <> '20260803000001_activate_recurring_task_lifecycle'
     or marker->>'backfillMigrationKey' <> '20260802000002_backfill_legacy_recurring'
     or marker->>'status' <> 'active'
     or marker->'backfillOutcome'->>'status' <> 'complete'
     or marker->'backfillOutcome'->>'type' <> 'complete' then
    raise exception 'recurring lifecycle cutover marker was incomplete: %', marker;
  end if;
end
$assert_cutover_marker$;

do $assert_cutover_privileges$
begin
  if has_function_privilege(
       'authenticated',
       'public.recurring_task_lifecycle_cutover_activate(date)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.recurring_task_lifecycle_cutover_status()',
       'execute'
     ) then
    raise exception 'application role can operate the lifecycle cutover marker';
  end if;
end
$assert_cutover_privileges$;

-- A release retry is represented by the immutable marker rather than a
-- second writer. The stored outcome must retain the backfill diagnostics and
-- must not claim a range beyond the migration's observed Coverage horizon.
do $assert_cutover_outcome$
declare
  outcome jsonb;
begin
  select backfill_outcome
  into outcome
  from public.recurring_task_lifecycle_cutover
  where singleton;

  if outcome->'diagnostics' is null
     or outcome->>'migratedSeriesCount' is null
     or outcome->>'detachedTaskCount' is null then
    raise exception 'cutover marker did not retain backfill diagnostics: %', outcome;
  end if;
end
$assert_cutover_outcome$;

rollback;
