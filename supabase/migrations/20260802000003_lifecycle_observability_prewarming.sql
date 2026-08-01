-- Keep lifecycle coverage visible without exposing task content. Scheduled
-- prewarming is a service-only read/list plus one-Series coverage command; a
-- date-bounded user read remains the correctness boundary.

ALTER FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  RENAME TO recurring_task_lifecycle_before_690;

CREATE OR REPLACE FUNCTION public.recurring_task_lifecycle_with_observability(
  p_operation TEXT,
  p_request JSONB
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_outcome JSONB;
  v_series_id UUID;
  v_invalid_series_id BOOLEAN := false;
  v_user_id UUID := CASE
    WHEN COALESCE(auth.role(), '') = 'service_role'
      THEN COALESCE(
        NULLIF(p_request->>'userId', '')::UUID,
        auth.uid()
      )
    ELSE auth.uid()
  END;
  v_before_occurrences INTEGER := 0;
  v_before_absences INTEGER := 0;
  v_before_withdrawn INTEGER := 0;
  v_after_occurrences INTEGER := 0;
  v_after_absences INTEGER := 0;
  v_after_withdrawn INTEGER := 0;
  v_observability JSONB;
BEGIN
  BEGIN
    v_series_id := NULLIF(p_request->>'seriesId', '')::UUID;
  EXCEPTION WHEN others THEN
    -- Preserve the typed non-disclosing outcome for malformed identifiers
    -- instead of allowing a later lifecycle wrapper to raise during casting.
    v_series_id := NULL;
    v_invalid_series_id := true;
  END;

  IF v_invalid_series_id THEN
    RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
  END IF;

  IF v_series_id IS NOT NULL THEN
    SELECT COUNT(*)::INTEGER
    INTO v_before_occurrences
    FROM public.recurring_task_occurrences occurrence
    WHERE occurrence.series_id = v_series_id;

    SELECT COUNT(*)::INTEGER
    INTO v_before_absences
    FROM public.recurring_task_intentional_absences absence
    WHERE absence.series_id = v_series_id;

    SELECT COUNT(*)::INTEGER
    INTO v_before_withdrawn
    FROM public.recurring_task_occurrences occurrence
    WHERE occurrence.series_id = v_series_id
      AND occurrence.state = 'withdrawn';
  END IF;

  v_outcome := public.recurring_task_lifecycle_before_690(
    p_operation,
    p_request
  );

  IF v_outcome->>'status' = 'complete' AND v_series_id IS NULL THEN
    v_series_id := NULLIF(v_outcome->'series'->>'id', '')::UUID;
  END IF;

  IF v_outcome->>'status' <> 'complete' OR v_series_id IS NULL THEN
    RETURN v_outcome;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_after_occurrences
  FROM public.recurring_task_occurrences occurrence
  WHERE occurrence.series_id = v_series_id;

  SELECT COUNT(*)::INTEGER
  INTO v_after_absences
  FROM public.recurring_task_intentional_absences absence
  WHERE absence.series_id = v_series_id;

  SELECT COUNT(*)::INTEGER
  INTO v_after_withdrawn
  FROM public.recurring_task_occurrences occurrence
  WHERE occurrence.series_id = v_series_id
    AND occurrence.state = 'withdrawn';

  v_observability := jsonb_build_object(
    'createdOccurrences', GREATEST(v_after_occurrences - v_before_occurrences, 0),
    'intentionalAbsences', GREATEST(v_after_absences - v_before_absences, 0),
    'withdrawnOccurrences', GREATEST(v_after_withdrawn - v_before_withdrawn, 0)
  );
  RETURN jsonb_set(v_outcome, '{observability}', v_observability, true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_ensure_user_coverage_observable(
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
  v_result JSONB;
  v_series_json JSONB := '[]'::JSONB;
  v_occurrences JSONB := '[]'::JSONB;
  v_intentional_absences JSONB := '[]'::JSONB;
  v_failed_series_ids JSONB := '[]'::JSONB;
  v_created_occurrences INTEGER := 0;
  v_intentional_absences_count INTEGER := 0;
  v_withdrawn_occurrences INTEGER := 0;
BEGIN
  IF v_from_date IS NULL OR v_to_date IS NULL OR v_from_date > v_to_date THEN
    RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
  END IF;

  -- Each nested block is a per-Series subtransaction. A failed Series rolls
  -- back independently while successful Series remain available to the read.
  FOR v_series IN
    SELECT series.*
    FROM public.recurring_task_series series
    WHERE series.user_id = p_user_id
    ORDER BY series.created_at, series.id
    FOR UPDATE
  LOOP
    BEGIN
      v_result := public.recurring_task_lifecycle_with_observability(
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

      IF v_result->>'status' IN ('complete', 'already-applied') THEN
        v_series_json := v_series_json || jsonb_build_array(
          v_result->'series'
        );
        v_occurrences := v_occurrences || COALESCE(
          v_result->'occurrences',
          '[]'::JSONB
        );
        v_intentional_absences := v_intentional_absences || COALESCE(
          v_result->'intentionalAbsences',
          '[]'::JSONB
        );
        v_created_occurrences := v_created_occurrences + COALESCE(
          (v_result->'observability'->>'createdOccurrences')::INTEGER,
          0
        );
        v_intentional_absences_count := v_intentional_absences_count + COALESCE(
          (v_result->'observability'->>'intentionalAbsences')::INTEGER,
          0
        );
        v_withdrawn_occurrences := v_withdrawn_occurrences + COALESCE(
          (v_result->'observability'->>'withdrawnOccurrences')::INTEGER,
          0
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

  RETURN jsonb_build_object(
    'status', CASE
      WHEN jsonb_array_length(v_failed_series_ids) = 0 THEN 'complete'
      ELSE 'partial'
    END,
    'type', CASE
      WHEN jsonb_array_length(v_failed_series_ids) = 0 THEN 'complete'
      ELSE 'partial'
    END,
    'requestedRange', jsonb_build_object(
      'from', v_from_date,
      'to', v_to_date
    ),
    'failedSeriesIds', v_failed_series_ids,
    'value', v_series_json,
    'series', v_series_json,
    'occurrences', v_occurrences,
    'intentionalAbsences', v_intentional_absences,
    'observability', jsonb_build_object(
      'createdOccurrences', v_created_occurrences,
      'intentionalAbsences', v_intentional_absences_count,
      'withdrawnOccurrences', v_withdrawn_occurrences
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_list_active_series_for_prewarm()
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'status', 'complete',
    'type', 'complete',
    'series', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', series.id,
          'userId', series.user_id,
          'status', series.status,
          'timeZone', series.time_zone,
          'coverageHorizon', series.coverage_horizon
        )
        ORDER BY series.created_at, series.id
      ),
      '[]'::JSONB
    ),
    'occurrences', '[]'::JSONB,
    'intentionalAbsences', '[]'::JSONB
  )
  FROM public.recurring_task_series series
  WHERE series.status = 'active';
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
  v_requested_user_id UUID;
  v_authenticated_user_id UUID := auth.uid();
  v_user_id UUID;
  v_series_id UUID;
  v_series public.recurring_task_series%ROWTYPE;
  v_operation_key TEXT := COALESCE(
    NULLIF(p_request->>'idempotencyKey', ''),
    NULLIF(p_request->>'operationKey', '')
  );
  v_fingerprint TEXT;
  v_replay JSONB;
  v_outcome JSONB;
BEGIN
  BEGIN
    v_requested_user_id := NULLIF(p_request->>'userId', '')::UUID;
    v_series_id := NULLIF(p_request->>'seriesId', '')::UUID;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
  END;

  IF p_operation = 'list-active-series' THEN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
      RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
    END IF;
    RETURN public.recurring_task_list_active_series_for_prewarm();
  END IF;

  IF p_operation = 'prewarm-coverage' THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       OR p_request->>'source' <> 'prewarm' THEN
      RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
    END IF;
    IF v_requested_user_id IS NULL OR v_series_id IS NULL THEN
      RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
    END IF;
    SELECT * INTO v_series
    FROM public.recurring_task_series series
    WHERE series.id = v_series_id
      AND series.user_id = v_requested_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
    END IF;
    IF v_series.status <> 'active' THEN
      RETURN jsonb_build_object(
        'status', 'skipped',
        'type', 'skipped',
        'reason', 'inactive-series'
      );
    END IF;
    RETURN public.recurring_task_lifecycle_with_observability(
      'ensure-coverage',
      p_request
    );
  END IF;

  IF p_operation = 'ensure-user-coverage' THEN
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

    v_outcome := public.recurring_task_ensure_user_coverage_observable(
      v_user_id,
      p_request
    );
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
  END IF;

  RETURN public.recurring_task_lifecycle_with_observability(
    p_operation,
    p_request
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.recurring_task_lifecycle_before_690(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_task_lifecycle_with_observability(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_task_ensure_user_coverage_observable(UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_task_list_active_series_for_prewarm()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  TO authenticated, service_role;
