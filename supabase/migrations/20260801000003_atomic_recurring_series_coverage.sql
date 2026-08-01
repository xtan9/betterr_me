-- Establish the public Series creation and exact Coverage Horizon seam.
-- The #659 lifecycle remains the compatibility authority for later commands;
-- this migration gives creation and single-Series coverage their own narrow,
-- per-Series transactional path without changing the storage model from #677.

CREATE OR REPLACE FUNCTION public.recurring_task_lifecycle_fingerprint(
  p_operation TEXT,
  p_request JSONB
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT md5(
    jsonb_build_object(
      'operation', p_operation,
      'request', p_request - 'idempotencyKey' - 'operationKey'
    )::TEXT
  );
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_lifecycle_replay(
  p_user_id UUID,
  p_operation TEXT,
  p_request JSONB
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_operation_key TEXT := COALESCE(
    NULLIF(p_request->>'idempotencyKey', ''),
    NULLIF(p_request->>'operationKey', '')
  );
  v_fingerprint TEXT;
  v_existing public.recurring_task_idempotency%ROWTYPE;
BEGIN
  IF v_operation_key IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::TEXT || ':' || v_operation_key, 0)
  );
  v_fingerprint := public.recurring_task_lifecycle_fingerprint(
    p_operation,
    p_request
  );

  SELECT * INTO v_existing
  FROM public.recurring_task_idempotency
  WHERE user_id = p_user_id
    AND operation_key = v_operation_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_existing.fingerprint <> v_fingerprint THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'reason', 'Idempotency key was reused for a different request'
    );
  END IF;

  RETURN jsonb_set(
    jsonb_set(v_existing.outcome, '{status}', '"already-applied"'::JSONB),
    '{type}',
    '"already-applied"'::JSONB
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_create_series_atomic(
  p_user_id UUID,
  p_request JSONB
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_series_id UUID := gen_random_uuid();
  v_revision_id UUID := gen_random_uuid();
  v_revision public.recurring_task_series_revisions%ROWTYPE;
  v_defaults JSONB;
  v_time_zone TEXT;
  v_from_date DATE;
  v_to_date DATE;
  v_operation_key TEXT := COALESCE(
    NULLIF(p_request->>'idempotencyKey', ''),
    NULLIF(p_request->>'operationKey', '')
  );
  v_fingerprint TEXT := public.recurring_task_lifecycle_fingerprint(
    'create-series',
    p_request
  );
  v_outcome JSONB;
BEGIN
  IF p_request->'recurrenceRule' IS NULL
     OR p_request->>'recurrenceAnchor' IS NULL
     OR p_request->>'activationDate' IS NULL THEN
    RAISE EXCEPTION 'Recurrence Rule, Recurrence Anchor, and Activation Date are required';
  END IF;
  IF (p_request->>'activationDate')::DATE
     < (p_request->>'recurrenceAnchor')::DATE THEN
    RAISE EXCEPTION 'Activation Date cannot be before the Recurrence Anchor';
  END IF;
  IF p_request ? 'occurrenceLimit'
     AND p_request->>'occurrenceLimit' IS NOT NULL
     AND (
       (p_request->>'occurrenceLimit')::INTEGER < 1
       OR (p_request->>'occurrenceLimit')::INTEGER
          <> (p_request->>'occurrenceLimit')::NUMERIC
     ) THEN
    RAISE EXCEPTION 'Occurrence Limit must be a positive integer';
  END IF;
  IF p_request ? 'lastScheduledDate'
     AND p_request->>'lastScheduledDate' IS NOT NULL
     AND (p_request->>'lastScheduledDate')::DATE
         < (p_request->>'activationDate')::DATE THEN
    RAISE EXCEPTION 'Last Scheduled Date cannot be before Activation Date';
  END IF;

  IF p_request ? 'coverage'
     AND (
       p_request->'coverage'->>'from' IS NULL
       OR p_request->'coverage'->>'to' IS NULL
     ) THEN
    RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
  END IF;

  v_time_zone := COALESCE(
    NULLIF(p_request->>'timeZone', ''),
    NULLIF(p_request->>'timezone', ''),
    (
      SELECT profile.timezone
      FROM public.profiles profile
      WHERE profile.id = p_user_id
    ),
    'UTC'
  );
  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names
    WHERE name = v_time_zone
  ) THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', v_time_zone;
  END IF;

  v_defaults := jsonb_build_object(
    'title', COALESCE(p_request->'defaults'->>'title', p_request->>'title', ''),
    'description', COALESCE(p_request->'defaults'->'description', 'null'::JSONB),
    'priority', COALESCE((p_request->'defaults'->>'priority')::INTEGER, 0),
    'categoryId', COALESCE(p_request->'defaults'->'categoryId', 'null'::JSONB),
    'dueTime', COALESCE(p_request->'defaults'->'dueTime', 'null'::JSONB),
    'status', COALESCE(p_request->'defaults'->>'status', 'todo'),
    'section', COALESCE(p_request->'defaults'->>'section', 'personal'),
    'projectId', COALESCE(p_request->'defaults'->'projectId', 'null'::JSONB)
  ) || COALESCE(p_request->'defaults', '{}'::JSONB);

  INSERT INTO public.recurring_task_series(
    id,
    user_id,
    status,
    recurrence_anchor,
    activation_date,
    occurrence_limit,
    last_scheduled_date,
    time_zone,
    current_revision_id
  ) VALUES (
    v_series_id,
    p_user_id,
    'active',
    (p_request->>'recurrenceAnchor')::DATE,
    (p_request->>'activationDate')::DATE,
    NULLIF(p_request->>'occurrenceLimit', '')::INTEGER,
    NULLIF(p_request->>'lastScheduledDate', '')::DATE,
    v_time_zone,
    v_revision_id
  );

  INSERT INTO public.recurring_task_series_revisions(
    id,
    series_id,
    effective_from,
    state,
    recurrence_rule,
    recurrence_anchor,
    activation_date,
    defaults
  ) VALUES (
    v_revision_id,
    v_series_id,
    (p_request->>'activationDate')::DATE,
    'active',
    p_request->'recurrenceRule',
    (p_request->>'recurrenceAnchor')::DATE,
    (p_request->>'activationDate')::DATE,
    v_defaults
  ) RETURNING * INTO v_revision;

  UPDATE public.recurring_task_series
  SET current_revision_id = v_revision.id
  WHERE id = v_series_id;

  INSERT INTO public.recurring_tasks(
    id,
    user_id,
    title,
    description,
    priority,
    due_time,
    recurrence_rule,
    start_date,
    end_type,
    end_date,
    end_count,
    instances_generated,
    next_generate_date,
    status
  ) VALUES (
    v_series_id,
    p_user_id,
    v_defaults->>'title',
    v_defaults->>'description',
    COALESCE((v_defaults->>'priority')::INTEGER, 0),
    (v_defaults->>'dueTime')::TIME,
    p_request->'recurrenceRule',
    (p_request->>'recurrenceAnchor')::DATE,
    CASE
      WHEN NULLIF(p_request->>'lastScheduledDate', '') IS NOT NULL THEN 'on_date'
      WHEN NULLIF(p_request->>'occurrenceLimit', '') IS NOT NULL THEN 'after_count'
      ELSE 'never'
    END,
    NULLIF(p_request->>'lastScheduledDate', '')::DATE,
    NULLIF(p_request->>'occurrenceLimit', '')::INTEGER,
    0,
    (p_request->>'activationDate')::DATE,
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  v_from_date := COALESCE(
    p_request->'coverage'->>'from',
    p_request->>'activationDate'
  )::DATE;
  v_to_date := COALESCE(
    p_request->'coverage'->>'to',
    p_request->>'coverageThrough'
  )::DATE;
  IF v_to_date IS NOT NULL AND v_from_date > v_to_date THEN
    RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
  END IF;
  IF v_to_date IS NOT NULL THEN
    PERFORM public.recurring_task_materialize_locked(
      v_series_id,
      v_from_date,
      v_to_date
    );
  END IF;

  UPDATE public.recurring_tasks legacy
  SET status = CASE series.status
        WHEN 'ended' THEN 'archived'
        ELSE series.status
      END,
      instances_generated = (
        SELECT COUNT(*)::INTEGER
        FROM public.recurring_task_occurrences occurrence
        WHERE occurrence.series_id = series.id
          AND occurrence.state <> 'withdrawn'
      ),
      next_generate_date = series.coverage_horizon + 1
  FROM public.recurring_task_series series
  WHERE legacy.id = series.id
    AND legacy.user_id = p_user_id;

  v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  IF v_operation_key IS NOT NULL THEN
    INSERT INTO public.recurring_task_idempotency(
      user_id,
      operation_key,
      fingerprint,
      series_id,
      outcome
    ) VALUES (
      p_user_id,
      v_operation_key,
      v_fingerprint,
      v_series_id,
      v_outcome
    );
  END IF;
  RETURN v_outcome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_ensure_coverage_atomic(
  p_user_id UUID,
  p_request JSONB
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_series_id UUID := NULLIF(p_request->>'seriesId', '')::UUID;
  v_series public.recurring_task_series%ROWTYPE;
  v_from_date DATE := COALESCE(
    p_request->'range'->>'from',
    p_request->>'fromDate'
  )::DATE;
  v_to_date DATE := COALESCE(
    p_request->'range'->>'to',
    p_request->>'throughDate'
  )::DATE;
  v_operation_key TEXT := COALESCE(
    NULLIF(p_request->>'idempotencyKey', ''),
    NULLIF(p_request->>'operationKey', '')
  );
  v_fingerprint TEXT := public.recurring_task_lifecycle_fingerprint(
    'ensure-coverage',
    p_request
  );
  v_outcome JSONB;
BEGIN
  IF v_from_date IS NULL OR v_to_date IS NULL OR v_from_date > v_to_date THEN
    RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
  END IF;

  SELECT * INTO v_series
  FROM public.recurring_task_series
  WHERE id = v_series_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
  END IF;

  IF p_request ? 'expectedRevisionToken'
     AND (p_request->>'expectedRevisionToken')::INTEGER
         <> v_series.revision_token THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'expectedRevisionToken', (p_request->>'expectedRevisionToken')::INTEGER,
      'actualRevisionToken', v_series.revision_token
    );
  END IF;

  -- Preserve the caller's exact inclusive upper bound. If the caller starts
  -- beyond the current horizon, fill the uncovered gap first so advancing
  -- the horizon cannot claim dates that were never reconciled.
  IF v_series.coverage_horizon IS NOT NULL
     AND v_from_date > v_series.coverage_horizon + 1
     AND v_to_date > v_series.coverage_horizon THEN
    v_from_date := v_series.coverage_horizon + 1;
  END IF;

  PERFORM public.recurring_task_materialize_locked(
    v_series_id,
    v_from_date,
    v_to_date
  );

  UPDATE public.recurring_tasks legacy
  SET status = CASE series.status
        WHEN 'ended' THEN 'archived'
        ELSE series.status
      END,
      instances_generated = (
        SELECT COUNT(*)::INTEGER
        FROM public.recurring_task_occurrences occurrence
        WHERE occurrence.series_id = series.id
          AND occurrence.state <> 'withdrawn'
      ),
      next_generate_date = series.coverage_horizon + 1
  FROM public.recurring_task_series series
  WHERE legacy.id = series.id
    AND legacy.user_id = p_user_id;

  v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  IF v_operation_key IS NOT NULL THEN
    INSERT INTO public.recurring_task_idempotency(
      user_id,
      operation_key,
      fingerprint,
      series_id,
      outcome
    ) VALUES (
      p_user_id,
      v_operation_key,
      v_fingerprint,
      v_series_id,
      v_outcome
    );
  END IF;
  RETURN v_outcome;
END;
$function$;

ALTER FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  RENAME TO recurring_task_lifecycle_legacy;

CREATE OR REPLACE FUNCTION public.recurring_task_lifecycle(
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
  v_replay JSONB;
BEGIN
  IF p_operation NOT IN ('create-series', 'ensure-coverage') THEN
    RETURN public.recurring_task_lifecycle_legacy(p_operation, p_request);
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
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
  END IF;

  v_replay := public.recurring_task_lifecycle_replay(
    v_user_id,
    p_operation,
    p_request
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  IF p_operation = 'create-series' THEN
    RETURN public.recurring_task_create_series_atomic(v_user_id, p_request);
  END IF;
  RETURN public.recurring_task_ensure_coverage_atomic(v_user_id, p_request);
END;
$function$;

REVOKE ALL ON FUNCTION public.recurring_task_lifecycle_legacy(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recurring_task_lifecycle_fingerprint(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recurring_task_lifecycle_replay(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recurring_task_create_series_atomic(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recurring_task_ensure_coverage_atomic(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  TO authenticated, service_role;
