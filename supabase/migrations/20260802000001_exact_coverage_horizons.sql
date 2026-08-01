-- Ensure every date-bounded read reconciles each owned Series independently.
-- A failed Series is reported as partial coverage; successful Series remain
-- committed and the failed Series never advances its Coverage Horizon.

ALTER FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  RENAME TO recurring_task_lifecycle_before_exact_user_coverage;

CREATE OR REPLACE FUNCTION public.recurring_task_ensure_user_coverage_atomic(
  p_user_id UUID,
  p_request JSONB
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_from_date DATE := NULLIF(p_request->'range'->>'from', '')::DATE;
  v_to_date DATE := NULLIF(p_request->'range'->>'to', '')::DATE;
  v_series public.recurring_task_series%ROWTYPE;
  v_series_outcome JSONB;
  v_series_json JSONB := '[]'::JSONB;
  v_occurrences JSONB := '[]'::JSONB;
  v_intentional_absences JSONB := '[]'::JSONB;
  v_failed_series_ids JSONB := '[]'::JSONB;
  v_status TEXT;
BEGIN
  IF v_from_date IS NULL OR v_to_date IS NULL OR v_from_date > v_to_date THEN
    RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
  END IF;

  -- The nested block is a per-Series subtransaction. A materialization or
  -- task-write failure rolls back only that Series, allowing the read to
  -- return the available facts with a typed degraded outcome.
  FOR v_series IN
    SELECT series.*
    FROM public.recurring_task_series series
    WHERE series.user_id = p_user_id
    ORDER BY series.created_at, series.id
    FOR UPDATE
  LOOP
    BEGIN
      v_series_outcome :=
        public.recurring_task_lifecycle_before_exact_user_coverage(
          'ensure-coverage',
          (
            p_request - 'idempotencyKey' - 'operationKey'
          ) || jsonb_build_object(
            'userId', p_user_id,
            'seriesId', v_series.id,
            'range', jsonb_build_object(
              'from', v_from_date,
              'to', v_to_date
            )
          )
        );

      IF v_series_outcome->>'status' IN ('complete', 'already-applied') THEN
        v_series_json := v_series_json || jsonb_build_array(
          v_series_outcome->'series'
        );
        v_occurrences := v_occurrences || COALESCE(
          v_series_outcome->'occurrences',
          '[]'::JSONB
        );
        v_intentional_absences := v_intentional_absences || COALESCE(
          v_series_outcome->'intentionalAbsences',
          '[]'::JSONB
        );
      ELSE
        v_failed_series_ids := v_failed_series_ids || jsonb_build_array(
          v_series.id::TEXT
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed_series_ids := v_failed_series_ids || jsonb_build_array(
        v_series.id::TEXT
      );
    END;
  END LOOP;

  v_status := CASE
    WHEN jsonb_array_length(v_failed_series_ids) = 0 THEN 'complete'
    ELSE 'partial'
  END;
  RETURN jsonb_build_object(
    'status', v_status,
    'type', CASE WHEN v_status = 'complete' THEN 'complete' ELSE 'partial' END,
    'requestedRange', jsonb_build_object(
      'from', v_from_date,
      'to', v_to_date
    ),
    'failedSeriesIds', v_failed_series_ids,
    'series', v_series_json,
    'occurrences', v_occurrences,
    'intentionalAbsences', v_intentional_absences
  );
END;
$function$;

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
  v_operation_key TEXT := COALESCE(
    NULLIF(p_request->>'idempotencyKey', ''),
    NULLIF(p_request->>'operationKey', '')
  );
  v_fingerprint TEXT;
  v_replay JSONB;
  v_outcome JSONB;
BEGIN
  IF p_operation <> 'ensure-user-coverage' THEN
    RETURN public.recurring_task_lifecycle_before_exact_user_coverage(
      p_operation,
      p_request
    );
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

  IF v_operation_key IS NOT NULL THEN
    v_replay := public.recurring_task_lifecycle_replay(
      v_user_id,
      p_operation,
      p_request
    );
    IF v_replay IS NOT NULL THEN
      RETURN v_replay;
    END IF;
  END IF;

  v_outcome := public.recurring_task_ensure_user_coverage_atomic(
    v_user_id,
    p_request
  );

  -- A partial result must remain retryable. Persist an idempotent replay only
  -- after every Series has reached the requested horizon.
  IF v_operation_key IS NOT NULL AND v_outcome->>'status' = 'complete' THEN
    v_fingerprint := public.recurring_task_lifecycle_fingerprint(
      p_operation,
      p_request
    );
    INSERT INTO public.recurring_task_idempotency(
      user_id,
      operation_key,
      fingerprint,
      outcome
    ) VALUES (
      v_user_id,
      v_operation_key,
      v_fingerprint,
      v_outcome
    );
  END IF;
  RETURN v_outcome;
END;
$function$;

REVOKE ALL ON FUNCTION public.recurring_task_ensure_user_coverage_atomic(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  TO authenticated, service_role;
