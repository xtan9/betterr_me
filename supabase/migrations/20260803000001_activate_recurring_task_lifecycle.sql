-- Activate the Recurring Task Lifecycle only after the production-compatible
-- legacy backfill has completed. The singleton marker is the release
-- boundary: it is written in the same transaction as the backfill and cannot
-- be removed or changed by a rollback/retry path.

CREATE TABLE IF NOT EXISTS public.recurring_task_lifecycle_cutover (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  migration_key TEXT NOT NULL,
  backfill_migration_key TEXT NOT NULL,
  cutover_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status = 'active'),
  backfill_outcome JSONB NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (backfill_outcome->>'status' = 'complete'),
  CHECK (backfill_outcome->>'type' = 'complete')
);

COMMENT ON TABLE public.recurring_task_lifecycle_cutover IS
  'Immutable singleton proving the recurring lifecycle backfill completed before lifecycle traffic.';

ALTER TABLE public.recurring_task_lifecycle_cutover ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recurring_task_lifecycle_cutover
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.recurring_task_lifecycle_cutover TO service_role;

CREATE OR REPLACE FUNCTION public.recurring_task_lifecycle_cutover_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION 'Recurring Task Lifecycle cutover is immutable';
END;
$function$;

DROP TRIGGER IF EXISTS recurring_task_lifecycle_cutover_immutable
  ON public.recurring_task_lifecycle_cutover;
CREATE TRIGGER recurring_task_lifecycle_cutover_immutable
BEFORE UPDATE OR DELETE ON public.recurring_task_lifecycle_cutover
FOR EACH ROW
EXECUTE FUNCTION public.recurring_task_lifecycle_cutover_immutable();

CREATE OR REPLACE FUNCTION public.recurring_task_lifecycle_cutover_status()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'status', cutover.status,
        'migrationKey', cutover.migration_key,
        'backfillMigrationKey', cutover.backfill_migration_key,
        'cutoverDate', cutover.cutover_date,
        'backfillOutcome', cutover.backfill_outcome,
        'activatedAt', cutover.activated_at
      )
      FROM public.recurring_task_lifecycle_cutover cutover
      WHERE cutover.singleton
    ),
    jsonb_build_object('status', 'pending')
  );
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_lifecycle_cutover_activate(
  p_cutover_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_existing public.recurring_task_lifecycle_cutover%ROWTYPE;
  v_backfill_outcome JSONB;
BEGIN
  IF p_cutover_date IS NULL THEN
    RAISE EXCEPTION 'Recurring Task Lifecycle cutover requires a date';
  END IF;

  IF session_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION
      'Recurring Task Lifecycle cutover requires migration authority'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize retries. A failed backfill and marker insert share the caller's
  -- transaction, so a retry never observes a half-activated boundary.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('recurring_task_lifecycle_cutover', 0)
  );

  SELECT *
  INTO v_existing
  FROM public.recurring_task_lifecycle_cutover
  WHERE singleton
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.migration_key <> '20260803000001_activate_recurring_task_lifecycle'
       OR v_existing.backfill_migration_key <> '20260802000002_backfill_legacy_recurring'
       OR v_existing.status <> 'active'
       OR v_existing.backfill_outcome->>'status' <> 'complete'
       OR v_existing.backfill_outcome->>'type' <> 'complete' THEN
      RAISE EXCEPTION 'Recurring Task Lifecycle cutover marker is invalid';
    END IF;
    RETURN jsonb_build_object(
      'status', 'already-applied',
      'type', 'already-applied',
      'migrationKey', v_existing.migration_key,
      'backfillMigrationKey', v_existing.backfill_migration_key,
      'cutoverDate', v_existing.cutover_date,
      'backfillOutcome', v_existing.backfill_outcome
    );
  END IF;

  v_backfill_outcome := public.recurring_task_backfill_legacy(
    p_cutover_date,
    NULL
  );
  IF v_backfill_outcome->>'status' <> 'complete'
     OR v_backfill_outcome->>'type' <> 'complete' THEN
    RAISE EXCEPTION
      'Recurring Task Lifecycle backfill did not complete: %',
      v_backfill_outcome;
  END IF;

  INSERT INTO public.recurring_task_lifecycle_cutover (
    migration_key,
    backfill_migration_key,
    cutover_date,
    status,
    backfill_outcome
  ) VALUES (
    '20260803000001_activate_recurring_task_lifecycle',
    '20260802000002_backfill_legacy_recurring',
    p_cutover_date,
    'active',
    v_backfill_outcome
  );

  RETURN jsonb_build_object(
    'status', 'complete',
    'type', 'complete',
    'migrationKey', '20260803000001_activate_recurring_task_lifecycle',
    'backfillMigrationKey', '20260802000002_backfill_legacy_recurring',
    'cutoverDate', p_cutover_date,
    'backfillOutcome', v_backfill_outcome
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.recurring_task_lifecycle_cutover_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_task_lifecycle_cutover_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recurring_task_lifecycle_cutover_activate(DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recurring_task_lifecycle_cutover_status()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.recurring_task_lifecycle_cutover_activate(DATE)
  TO service_role;

-- The migration is the release boundary. If backfill raises, this transaction
-- rolls back and no active marker exists, so application traffic must remain
-- on the pre-release until the migration is retried successfully.
DO $activate$
DECLARE
  v_outcome JSONB;
BEGIN
  v_outcome := public.recurring_task_lifecycle_cutover_activate(CURRENT_DATE);
  RAISE NOTICE 'Recurring Task Lifecycle cutover: %', v_outcome;
END
$activate$;
