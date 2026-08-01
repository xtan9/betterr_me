-- Contract the activated Recurring Task Lifecycle.
--
-- 20260803000001 is the release boundary. Once its immutable marker is
-- active, no runtime caller may need the compatibility projection or the
-- one-time migration helpers. Rewrite the installed function bodies first,
-- then remove the obsolete storage and compatibility-only functions in the
-- same transaction.

DO $contract_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.recurring_task_lifecycle_cutover
    WHERE singleton
      AND status = 'active'
      AND backfill_outcome->>'status' = 'complete'
      AND backfill_outcome->>'type' = 'complete'
  ) THEN
    RAISE EXCEPTION
      'Recurring Task Lifecycle contract requires an active completed cutover';
  END IF;
END;
$contract_guard$;

-- The final pre-contract migration kept these functions under temporary
-- compatibility names. Derive the installed definitions so an upgrade keeps
-- the exact behavior already accepted by the lifecycle tests while removing
-- only the projection writes and old task columns.
DO $rewrite_materializer$
DECLARE
  v_source TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.recurring_task_materialize_locked_legacy(uuid,date,date)'::REGPROCEDURE
  )
  INTO v_source;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Installed Task Occurrence materializer is missing';
  END IF;

  v_source := regexp_replace(
    v_source,
    '(?is)[[:space:]]*CASE[[:space:]]+WHEN[[:space:]]+EXISTS[[:space:]]*[(][[:space:]]*SELECT[[:space:]]+1[[:space:]]+FROM[[:space:]]+public[.]recurring_tasks[[:space:]]+legacy[[:space:]]+WHERE[[:space:]]+legacy[.]id[[:space:]]*=[[:space:]]*p_series_id[[:space:]]*[)][[:space:]]+THEN[[:space:]]+p_series_id[[:space:]]+ELSE[[:space:]]+NULL[[:space:]]+END[[:space:]]*,[[:space:]]*false[[:space:]]*,[[:space:]]*v_date[[:space:]]*,',
    chr(10),
    'g'
  );
  v_source := replace(
    v_source,
    'recurring_task_id, is_exception, original_date,',
    ''
  );
  v_source := replace(
    v_source,
    'recurring_task_materialize_locked_legacy',
    'recurring_task_materialize_locked_target'
  );
  EXECUTE v_source;

  SELECT pg_get_functiondef(
    'public.recurring_task_materialize_locked(uuid,date,date)'::REGPROCEDURE
  )
  INTO v_source;
  v_source := replace(
    v_source,
    'recurring_task_materialize_locked_legacy',
    'recurring_task_materialize_locked_target'
  );
  EXECUTE v_source;
END;
$rewrite_materializer$;

-- Remove projection statements from every atomic function that remains on a
-- delivery path. The regex is deliberately bounded to one SQL statement and
-- is evaluated against the installed definition before the table is dropped.
DO $rewrite_atomic_functions$
DECLARE
  v_signature TEXT;
  v_source TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.recurring_task_create_series_atomic(uuid,jsonb)',
    'public.recurring_task_ensure_coverage_atomic(uuid,jsonb)',
    'public.recurring_task_pause_resume_atomic(text,jsonb)',
    'public.recurring_task_end_atomic(jsonb)',
    'public.recurring_task_edit_occurrence_overrides_atomic(jsonb)',
    'public.recurring_task_delete_series(text,jsonb)'
  ] LOOP
    SELECT pg_get_functiondef(v_signature::REGPROCEDURE)
    INTO v_source;
    IF v_source IS NULL THEN
      RAISE EXCEPTION 'Installed lifecycle function is missing: %', v_signature;
    END IF;

    v_source := regexp_replace(
      v_source,
      '(?i)[[:space:]]*INSERT[[:space:]]+INTO[[:space:]]+public[.]recurring_tasks[[:space:]]*[(][^;]*ON[[:space:]]+CONFLICT[[:space:]]*[(]id[)][[:space:]]+DO[[:space:]]+NOTHING[[:space:]]*;[[:space:]]*',
      chr(10),
      'g'
    );
    v_source := regexp_replace(
      v_source,
      '(?i)[[:space:]]*UPDATE[[:space:]]+public[.]recurring_tasks([[:space:]]+as)?([[:space:]]+legacy)?[[:space:]]+SET[^;]*;[[:space:]]*',
      chr(10),
      'g'
    );
    v_source := regexp_replace(
      v_source,
      '(?im)^[[:space:]]*is_exception[[:space:]]*=[[:space:]]*true,[[:space:]]*',
      chr(10),
      'g'
    );
    EXECUTE v_source;
  END LOOP;

  -- The original lifecycle implementation is still the fallback for
  -- revision and other commands behind the wrapper chain. Give it a
  -- target-only name and update its one caller before retiring the old name.
  SELECT pg_get_functiondef(
    'public.recurring_task_lifecycle_legacy(text,jsonb)'::REGPROCEDURE
  )
  INTO v_source;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Installed lifecycle fallback is missing';
  END IF;
  v_source := regexp_replace(
    v_source,
    '(?i)[[:space:]]*INSERT[[:space:]]+INTO[[:space:]]+public[.]recurring_tasks[[:space:]]*[(][^;]*ON[[:space:]]+CONFLICT[[:space:]]*[(]id[)][[:space:]]+DO[[:space:]]+NOTHING[[:space:]]*;[[:space:]]*',
    chr(10),
    'g'
  );
  v_source := regexp_replace(
    v_source,
    '(?i)[[:space:]]*UPDATE[[:space:]]+public[.]recurring_tasks([[:space:]]+as)?([[:space:]]+legacy)?[[:space:]]+SET[^;]*;[[:space:]]*',
    chr(10),
    'g'
  );
  v_source := regexp_replace(
    v_source,
    '(?im)^[[:space:]]*is_exception[[:space:]]*=[[:space:]]*true,[[:space:]]*',
    chr(10),
    'g'
  );
  v_source := replace(
    v_source,
    'recurring_task_lifecycle_legacy',
    'recurring_task_lifecycle_target'
  );
  EXECUTE v_source;

  SELECT pg_get_functiondef(
    'public.recurring_task_lifecycle_atomic_coverage(text,jsonb)'::REGPROCEDURE
  )
  INTO v_source;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Installed lifecycle coverage wrapper is missing';
  END IF;
  v_source := replace(
    v_source,
    'recurring_task_lifecycle_legacy',
    'recurring_task_lifecycle_target'
  );
  EXECUTE v_source;
END;
$rewrite_atomic_functions$;

-- Rebuild the task guard against only the target lifecycle metadata. Ordinary
-- task writes remain ordinary task writes; linked Task Occurrence mutations
-- still require the transaction-local lifecycle setting.
CREATE OR REPLACE FUNCTION public.recurring_task_task_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (
      NEW.recurring_series_id IS NOT NULL
      OR NEW.recurring_occurrence_id IS NOT NULL
    ) AND current_setting('betterr.recurring_lifecycle', true)
      IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Recurring task mutations must use the lifecycle boundary';
    END IF;
    RETURN NEW;
  END IF;

  IF current_setting('betterr.recurring_lifecycle', true) IS DISTINCT FROM 'on'
     AND (
       OLD.recurring_series_id IS NOT NULL
       OR OLD.recurring_occurrence_id IS NOT NULL
       OR NEW.recurring_series_id IS NOT NULL
       OR NEW.recurring_occurrence_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Recurring task mutations must use the lifecycle boundary';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    RAISE EXCEPTION 'Scheduled Date is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- The cutover marker is retained as immutable release evidence, but its
-- activation procedure and all backfill helpers are no longer runtime APIs.
DROP FUNCTION IF EXISTS public.recurring_task_lifecycle_cutover_activate(DATE);
DROP FUNCTION IF EXISTS public.recurring_task_backfill_legacy_preflight(DATE, UUID);
DROP FUNCTION IF EXISTS public.recurring_task_backfill_legacy(DATE, UUID);
DROP FUNCTION IF EXISTS public.recurring_task_legacy_task_overrides(public.tasks, public.recurring_tasks);
DROP FUNCTION IF EXISTS public.recurring_task_legacy_defaults(public.recurring_tasks);
DROP FUNCTION IF EXISTS public.recurring_task_legacy_record_is_safe(public.recurring_tasks);
DROP FUNCTION IF EXISTS public.recurring_task_legacy_rule_is_safe(JSONB);
DROP FUNCTION IF EXISTS public.recurring_task_lifecycle_legacy(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.recurring_task_materialize_locked_legacy(UUID, DATE, DATE);

DROP TRIGGER IF EXISTS recurring_task_legacy_write_guard
  ON public.recurring_tasks;
DROP FUNCTION IF EXISTS public.recurring_task_legacy_write_guard();

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_recurring_task_id_fkey;
DROP INDEX IF EXISTS public.idx_tasks_recurring;
DROP INDEX IF EXISTS public.idx_tasks_recurring_date;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS recurring_task_id,
  DROP COLUMN IF EXISTS is_exception,
  DROP COLUMN IF EXISTS original_date;

DROP TABLE IF EXISTS public.recurring_tasks;

ALTER TABLE IF EXISTS public.recurring_task_series_stopping_policy_history
  DROP COLUMN IF EXISTS legacy_instances_generated,
  DROP COLUMN IF EXISTS legacy_next_generate_date;

COMMENT ON TABLE public.recurring_task_series_stopping_policy_history IS
  'Retained stopping-policy facts captured during the Recurring Task Lifecycle migration.';

COMMENT ON TABLE public.recurring_task_lifecycle_cutover IS
  'Immutable release evidence proving the Recurring Task Lifecycle backfill completed before activation.';
