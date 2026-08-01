-- Centralize recurring task and series deletion behind one atomic lifecycle
-- mutation. The existing end-series command owns the future-boundary
-- (following) semantics; this command owns all-scope deletion and preserves
-- completed occurrence history while withdrawing every eligible incomplete
-- occurrence.

CREATE OR REPLACE FUNCTION public.recurring_task_delete_series(
  p_operation TEXT,
  p_request JSONB
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_requested_user_id UUID := NULLIF(p_request->>'userId', '')::UUID;
  v_authenticated_user_id UUID := auth.uid();
  v_user_id UUID;
  v_series_id UUID := NULLIF(p_request->>'seriesId', '')::UUID;
  v_series public.recurring_task_series%ROWTYPE;
  v_revision public.recurring_task_series_revisions%ROWTYPE;
  v_effective_date DATE;
  v_operation_key TEXT := COALESCE(
    NULLIF(p_request->>'idempotencyKey', ''),
    NULLIF(p_request->>'operationKey', '')
  );
  v_fingerprint TEXT;
  v_replay JSONB;
  v_outcome JSONB;
BEGIN
  IF p_operation <> 'delete-series' THEN
    RAISE EXCEPTION 'Unsupported recurring task deletion operation: %', p_operation;
  END IF;

  PERFORM set_config('betterr.recurring_lifecycle', 'on', true);
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_user_id := COALESCE(v_requested_user_id, v_authenticated_user_id);
  ELSE
    IF v_authenticated_user_id IS NULL
       OR v_requested_user_id IS DISTINCT FROM v_authenticated_user_id THEN
      RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
    END IF;
    v_user_id := v_authenticated_user_id;
  END IF;
  IF v_user_id IS NULL OR v_series_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::TEXT, 659::BIGINT)
  );
  v_replay := public.recurring_task_lifecycle_replay(
    v_user_id,
    p_operation,
    p_request
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;
  v_fingerprint := public.recurring_task_lifecycle_fingerprint(
    p_operation,
    p_request
  );

  SELECT * INTO v_series
  FROM public.recurring_task_series
  WHERE id = v_series_id
    AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
  END IF;
  IF v_series.status = 'ended' THEN
    RETURN public.recurring_task_series_snapshot(v_series_id, 'complete');
  END IF;

  IF NULLIF(p_request->>'effectiveDate', '') IS NOT NULL THEN
    BEGIN
      v_effective_date := (p_request->>'effectiveDate')::DATE;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Effective Date must be a valid local date'
      );
    END;
  ELSE
    v_effective_date := (
      NOW() AT TIME ZONE COALESCE(v_series.time_zone, 'UTC')
    )::DATE;
  END IF;
  IF v_effective_date < v_series.activation_date THEN
    RETURN jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Effective Date cannot be before Activation Date'
    );
  END IF;

  SELECT * INTO v_revision
  FROM public.recurring_task_series_revisions revision
  WHERE revision.id = v_series.current_revision_id
  FOR UPDATE;
  IF NOT FOUND OR v_effective_date < v_revision.effective_from THEN
    RETURN jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'A lifecycle transition cannot begin before the current revision'
    );
  END IF;

  IF v_effective_date = v_revision.effective_from THEN
    UPDATE public.recurring_task_series_revisions
    SET state = 'ended',
        activation_date = v_effective_date
    WHERE id = v_revision.id
    RETURNING * INTO v_revision;
  ELSE
    UPDATE public.recurring_task_series_revisions
    SET effective_to = v_effective_date
    WHERE id = v_revision.id;
    INSERT INTO public.recurring_task_series_revisions(
      series_id,
      effective_from,
      state,
      recurrence_rule,
      recurrence_anchor,
      activation_date,
      defaults
    ) VALUES (
      v_series_id,
      v_effective_date,
      'ended',
      v_revision.recurrence_rule,
      v_revision.recurrence_anchor,
      v_effective_date,
      v_revision.defaults
    ) RETURNING * INTO v_revision;
  END IF;

  UPDATE public.recurring_task_series
  SET current_revision_id = v_revision.id,
      status = 'ended',
      revision_token = revision_token + 1,
      updated_at = NOW()
  WHERE id = v_series_id;

  WITH withdrawn AS (
    UPDATE public.recurring_task_occurrences occurrence
    SET state = 'withdrawn',
        updated_at = NOW()
    WHERE occurrence.series_id = v_series_id
      AND occurrence.state IN ('open', 'extra')
      AND (
        occurrence.task_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = occurrence.task_id
            AND task.is_completed = false
        )
      )
    RETURNING occurrence.series_id, occurrence.scheduled_date, occurrence.task_id
  ), inserted_absences AS (
    INSERT INTO public.recurring_task_intentional_absences(
      series_id,
      scheduled_date,
      reason
    )
    SELECT series_id, scheduled_date, 'ended'
    FROM withdrawn
    ON CONFLICT (series_id, scheduled_date) DO UPDATE
      SET reason = 'ended'
    RETURNING scheduled_date
  )
  UPDATE public.tasks task
  SET recurrence_occurrence_state = 'withdrawn',
      updated_at = NOW()
  FROM withdrawn
  WHERE task.id = withdrawn.task_id
    AND task.is_completed = false;

  UPDATE public.recurring_tasks legacy
  SET status = 'archived',
      instances_generated = (
        SELECT COUNT(*)::INTEGER
        FROM public.recurring_task_occurrences occurrence
        WHERE occurrence.series_id = v_series_id
          AND occurrence.state <> 'withdrawn'
      ),
      next_generate_date = COALESCE(
        (SELECT series.coverage_horizon + 1
         FROM public.recurring_task_series series
         WHERE series.id = v_series_id),
        legacy.next_generate_date
      )
  WHERE legacy.id = v_series_id
    AND legacy.user_id = v_user_id;

  v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  IF v_operation_key IS NOT NULL THEN
    INSERT INTO public.recurring_task_idempotency(
      user_id,
      operation_key,
      fingerprint,
      series_id,
      outcome
    ) VALUES (
      v_user_id,
      v_operation_key,
      v_fingerprint,
      v_series_id,
      v_outcome
    );
  END IF;
  RETURN v_outcome;
END;
$function$;

REVOKE ALL ON FUNCTION public.recurring_task_delete_series(TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurring_task_delete_series(TEXT, JSONB)
  TO authenticated, service_role;
