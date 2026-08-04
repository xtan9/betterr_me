-- constrained-sql-fixture: true
-- Proves the post-cutover storage, runtime, privilege, rollback, and import
-- contract for the activated Recurring Task Lifecycle.
begin;

do $contract$
declare
  obsolete_column text;
begin
  if to_regclass('public.recurring_tasks') is not null then
    raise exception 'obsolete recurring task table remains after contract migration';
  end if;

  foreach obsolete_column in array array[
    'recurring_task_id',
    'is_exception',
    'original_date'
  ] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = obsolete_column
    ) then
      raise exception 'obsolete task column remains: %', obsolete_column;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc routine
    join pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname like 'recurring_task%'
      and routine.proname ~* '(legacy|backfill)'
  ) then
    raise exception 'obsolete recurring lifecycle function remains';
  end if;

  if exists (
    select 1
    from pg_proc routine
    join pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname like 'recurring_task%'
      and routine.prosrc ~* '(recurring_tasks|instances_generated|next_generate_date|recurring_task_id([^[:alnum:]_]|$)|is_exception|original_date)'
  ) then
    raise exception 'active recurring lifecycle function still contains retired storage terminology';
  end if;

  foreach obsolete_column in array array[
    'recurring_task_series',
    'recurring_task_series_revisions',
    'recurring_task_occurrences',
    'recurring_task_intentional_absences',
    'recurring_task_idempotency'
  ] loop
    if not (
      select relrowsecurity
      from pg_class
      where oid = format('public.%s', obsolete_column)::regclass
    ) then
      raise exception 'target lifecycle storage is missing RLS: %', obsolete_column;
    end if;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'public.recurring_task_lifecycle(text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute the lifecycle boundary';
  end if;
  if has_table_privilege('authenticated', 'public.recurring_task_series', 'insert')
     or has_table_privilege('authenticated', 'public.recurring_task_occurrences', 'insert') then
    raise exception 'authenticated retained direct lifecycle storage writes';
  end if;
end
$contract$;

savepoint contract_rollback_probe;
create temporary table recurring_task_contract_rollback_probe (value text);
insert into recurring_task_contract_rollback_probe values ('rolled-back');
rollback to savepoint contract_rollback_probe;
do $rollback_assert$
begin
  if to_regclass('pg_temp.recurring_task_contract_rollback_probe') is not null then
    raise exception 'contract rollback probe left temporary state behind';
  end if;
end
$rollback_assert$;

rollback;
