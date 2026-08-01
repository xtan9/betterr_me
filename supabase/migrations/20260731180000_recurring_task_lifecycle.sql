-- Recurring Task Lifecycle
--
-- The legacy recurring_tasks table remains as a compatibility projection while
-- the lifecycle tables become the source of truth for scheduling decisions.
-- Every multi-write operation is exposed through one transactional RPC.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurring_series_id UUID,
  ADD COLUMN IF NOT EXISTS recurring_occurrence_id UUID,
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_occurrence_state TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_overrides JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE TABLE public.recurring_task_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'ended')),
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  recurrence_anchor DATE NOT NULL,
  activation_date DATE NOT NULL,
  occurrence_limit INTEGER CHECK (occurrence_limit IS NULL OR occurrence_limit > 0),
  last_scheduled_date DATE,
  coverage_horizon DATE,
  current_revision_id UUID,
  revision_token INTEGER NOT NULL DEFAULT 1 CHECK (revision_token > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (activation_date >= recurrence_anchor),
  CHECK (last_scheduled_date IS NULL OR last_scheduled_date >= activation_date)
);

CREATE INDEX recurring_task_series_user_status_idx
  ON public.recurring_task_series(user_id, status);

CREATE TABLE public.recurring_task_series_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.recurring_task_series(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  state TEXT NOT NULL CHECK (state IN ('active', 'paused', 'ended')),
  recurrence_rule JSONB NOT NULL,
  recurrence_anchor DATE NOT NULL,
  activation_date DATE NOT NULL,
  defaults JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (series_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (activation_date >= recurrence_anchor)
);

CREATE INDEX recurring_task_series_revisions_span_idx
  ON public.recurring_task_series_revisions(series_id, effective_from, effective_to);

ALTER TABLE public.recurring_task_series
  ADD CONSTRAINT recurring_task_series_current_revision_fkey
  FOREIGN KEY (current_revision_id)
  REFERENCES public.recurring_task_series_revisions(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.recurring_task_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.recurring_task_series(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.recurring_task_series_revisions(id),
  scheduled_date DATE NOT NULL,
  due_date DATE,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  state TEXT NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'completed', 'skipped', 'withdrawn', 'extra')),
  overrides JSONB NOT NULL DEFAULT '{}'::JSONB,
  task_id UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (series_id, scheduled_date)
);

CREATE INDEX recurring_task_occurrences_task_idx
  ON public.recurring_task_occurrences(task_id)
  WHERE task_id IS NOT NULL;
CREATE INDEX recurring_task_occurrences_read_idx
  ON public.recurring_task_occurrences(series_id, scheduled_date, state);

CREATE TABLE public.recurring_task_intentional_absences (
  series_id UUID NOT NULL REFERENCES public.recurring_task_series(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('skipped', 'paused', 'ended', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series_id, scheduled_date)
);

CREATE TABLE public.recurring_task_idempotency (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  series_id UUID REFERENCES public.recurring_task_series(id) ON DELETE SET NULL,
  outcome JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, operation_key)
);

CREATE INDEX recurring_task_idempotency_series_idx
  ON public.recurring_task_idempotency(series_id)
  WHERE series_id IS NOT NULL;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_recurring_series_fkey
  FOREIGN KEY (recurring_series_id)
  REFERENCES public.recurring_task_series(id)
  ON DELETE SET NULL,
  ADD CONSTRAINT tasks_recurring_occurrence_fkey
  FOREIGN KEY (recurring_occurrence_id)
  REFERENCES public.recurring_task_occurrences(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.recurring_task_occurrences
  ADD CONSTRAINT recurring_task_occurrences_task_fkey
  FOREIGN KEY (task_id)
  REFERENCES public.tasks(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.recurring_task_revision_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.recurring_task_series_revisions other_revision
    WHERE other_revision.series_id = NEW.series_id
      AND other_revision.id <> NEW.id
      AND daterange(
        other_revision.effective_from,
        other_revision.effective_to,
        '[)'
      ) && daterange(
        NEW.effective_from,
        NEW.effective_to,
        '[)'
      )
  ) THEN
    RAISE EXCEPTION 'Series revisions cannot overlap';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_lifecycle(
  p_operation TEXT,
  p_request JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id UUID;
  v_requested_user_id UUID;
  v_series_id UUID;
  v_revision_id UUID;
  v_series public.recurring_task_series%ROWTYPE;
  v_revision public.recurring_task_series_revisions%ROWTYPE;
  v_occurrence public.recurring_task_occurrences%ROWTYPE;
  v_defaults JSONB;
  v_updates JSONB;
  v_operation_key TEXT;
  v_fingerprint TEXT;
  v_existing_idempotency public.recurring_task_idempotency%ROWTYPE;
  v_outcome JSONB;
  v_series_json JSONB := '[]'::JSONB;
  v_effective_date DATE;
  v_from_date DATE;
  v_to_date DATE;
  v_status TEXT;
  v_rule JSONB;
  v_time_zone TEXT;
  v_schedule_exists BOOLEAN;
  v_replay JSONB;
BEGIN
  PERFORM set_config('betterr.recurring_lifecycle', 'on', true);
  v_requested_user_id := NULLIF(p_request->>'userId', '')::UUID;
  v_user_id := auth.uid();
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (v_user_id IS NULL OR v_requested_user_id IS DISTINCT FROM v_user_id) THEN
    RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
  END IF;
  IF v_user_id IS NULL THEN
    v_user_id := v_requested_user_id;
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Recurring Task Lifecycle requires an authenticated user';
  END IF;

  -- Serialize lifecycle commands for one owner. Series row locks below still
  -- protect per-series work, while this advisory lock closes the create and
  -- user-coverage idempotency race before a series row exists.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::TEXT, 659::BIGINT)
  );

  IF p_operation = 'get-series' THEN
    v_series_id := NULLIF(p_request->>'seriesId', '')::UUID;
    SELECT * INTO v_series
    FROM public.recurring_task_series
    WHERE id = v_series_id AND user_id = v_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
    END IF;
    RETURN public.recurring_task_series_snapshot(v_series_id, 'complete');
  END IF;

  IF p_operation = 'list-series' THEN
    SELECT COALESCE(
      jsonb_agg(
        public.recurring_task_series_snapshot(series.id, 'complete')->'series'
        ORDER BY series.created_at DESC
      ),
      '[]'::JSONB
    )
    INTO v_series_json
    FROM public.recurring_task_series series
    WHERE series.user_id = v_user_id
      AND (
        p_request->>'status' IS NULL
        OR series.status = p_request->>'status'
      );
    RETURN jsonb_build_object(
      'status', 'complete',
      'type', 'complete',
      'series', v_series_json,
      'occurrences', '[]'::JSONB,
      'intentionalAbsences', '[]'::JSONB
    );
  END IF;

  v_operation_key := COALESCE(
    NULLIF(p_request->>'idempotencyKey', ''),
    NULLIF(p_request->>'operationKey', '')
  );
  v_fingerprint := md5(
    jsonb_build_object(
      'operation', p_operation,
      'request', p_request - 'idempotencyKey' - 'operationKey'
    )::TEXT
  );
  IF v_operation_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_user_id::TEXT || ':' || v_operation_key, 0)
    );
  END IF;

  IF p_operation = 'create-series' THEN
    IF v_operation_key IS NOT NULL THEN
      SELECT * INTO v_existing_idempotency
      FROM public.recurring_task_idempotency
      WHERE user_id = v_user_id AND operation_key = v_operation_key
      FOR UPDATE;
      IF FOUND THEN
        IF v_existing_idempotency.fingerprint <> v_fingerprint THEN
          RAISE EXCEPTION 'Idempotency key was reused for a different request';
        END IF;
        RETURN jsonb_set(
          jsonb_set(
            v_existing_idempotency.outcome,
            '{status}',
            '"already-applied"'::JSONB
          ),
          '{type}',
          '"already-applied"'::JSONB
        );
      END IF;
    END IF;

    IF p_request->'recurrenceRule' IS NULL
       OR p_request->>'recurrenceAnchor' IS NULL
       OR p_request->>'activationDate' IS NULL THEN
      RAISE EXCEPTION 'Recurrence Rule, Recurrence Anchor, and Activation Date are required';
    END IF;
    IF (p_request->>'activationDate')::DATE < (p_request->>'recurrenceAnchor')::DATE THEN
      RAISE EXCEPTION 'Activation Date cannot be before the Recurrence Anchor';
    END IF;

    v_series_id := gen_random_uuid();
    v_revision_id := gen_random_uuid();
    v_time_zone := COALESCE(
      NULLIF(p_request->>'timeZone', ''),
      NULLIF(p_request->>'timezone', ''),
      (
        SELECT profile.timezone
        FROM public.profiles profile
        WHERE profile.id = v_user_id
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
      id, user_id, status, recurrence_anchor, activation_date,
      occurrence_limit, last_scheduled_date, time_zone, current_revision_id
    ) VALUES (
      v_series_id,
      v_user_id,
      'active',
      (p_request->>'recurrenceAnchor')::DATE,
      (p_request->>'activationDate')::DATE,
      NULLIF(p_request->>'occurrenceLimit', '')::INTEGER,
      NULLIF(p_request->>'lastScheduledDate', '')::DATE,
      v_time_zone,
      v_revision_id
    );

    INSERT INTO public.recurring_task_series_revisions(
      id, series_id, effective_from, state, recurrence_rule,
      recurrence_anchor, activation_date, defaults
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

    -- Keep the legacy table as a read-compatible projection until all clients
    -- have crossed the lifecycle boundary.
    INSERT INTO public.recurring_tasks(
      id, user_id, title, description, priority, due_time,
      recurrence_rule, start_date, end_type, end_date, end_count,
      instances_generated, next_generate_date, status
    ) VALUES (
      v_series_id,
      v_user_id,
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
    IF v_to_date IS NOT NULL THEN
      PERFORM public.recurring_task_materialize_locked(
        v_series_id, v_from_date, v_to_date
      );
    END IF;

    UPDATE public.recurring_tasks legacy
    SET status = CASE series.status WHEN 'ended' THEN 'archived' ELSE series.status END,
        instances_generated = (
          SELECT COUNT(*)::INTEGER
          FROM public.recurring_task_occurrences occurrence
          WHERE occurrence.series_id = series.id
            AND occurrence.state <> 'withdrawn'
        ),
        next_generate_date = series.coverage_horizon + 1
    FROM public.recurring_task_series series
    WHERE legacy.id = series.id
      AND legacy.user_id = v_user_id;

    v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
    IF v_operation_key IS NOT NULL THEN
      INSERT INTO public.recurring_task_idempotency(
        user_id, operation_key, fingerprint, series_id, outcome
      ) VALUES (
        v_user_id, v_operation_key, v_fingerprint, v_series_id, v_outcome
      );
    END IF;
    RETURN v_outcome;
  END IF;

  IF p_operation = 'ensure-user-coverage' THEN
    v_from_date := (p_request->'range'->>'from')::DATE;
    v_to_date := (p_request->'range'->>'to')::DATE;
    IF v_from_date IS NULL OR v_to_date IS NULL OR v_from_date > v_to_date THEN
      RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
    END IF;
    IF v_operation_key IS NOT NULL THEN
      SELECT * INTO v_existing_idempotency
      FROM public.recurring_task_idempotency
      WHERE user_id = v_user_id AND operation_key = v_operation_key
      FOR UPDATE;
      IF FOUND THEN
        IF v_existing_idempotency.fingerprint <> v_fingerprint THEN
          RAISE EXCEPTION 'Idempotency key was reused for a different request';
        END IF;
        RETURN jsonb_set(
          jsonb_set(v_existing_idempotency.outcome, '{status}', '"already-applied"'::JSONB),
          '{type}', '"already-applied"'::JSONB
        );
      END IF;
    END IF;

    FOR v_series IN
      SELECT series.*
      FROM public.recurring_task_series series
      WHERE series.user_id = v_user_id
      ORDER BY series.id
      FOR UPDATE
    LOOP
      PERFORM public.recurring_task_materialize_locked(
        v_series.id, v_from_date, v_to_date
      );
      UPDATE public.recurring_tasks legacy
      SET status = CASE refreshed.status WHEN 'ended' THEN 'archived' ELSE refreshed.status END,
          instances_generated = (
            SELECT COUNT(*)::INTEGER
            FROM public.recurring_task_occurrences occurrence
            WHERE occurrence.series_id = refreshed.id
              AND occurrence.state <> 'withdrawn'
          ),
          next_generate_date = refreshed.coverage_horizon + 1
      FROM public.recurring_task_series refreshed
      WHERE legacy.id = refreshed.id
        AND legacy.user_id = v_user_id;
      v_series_json := v_series_json || jsonb_build_array(
        public.recurring_task_series_snapshot(v_series.id, 'complete')->'series'
      );
    END LOOP;
    v_outcome := jsonb_build_object(
      'status', 'complete',
      'type', 'complete',
      'value', v_series_json,
      'series', v_series_json,
      'occurrences', '[]'::JSONB,
      'intentionalAbsences', '[]'::JSONB
    );
    IF v_operation_key IS NOT NULL THEN
      INSERT INTO public.recurring_task_idempotency(
        user_id, operation_key, fingerprint, outcome
      ) VALUES (v_user_id, v_operation_key, v_fingerprint, v_outcome);
    END IF;
    RETURN v_outcome;
  END IF;

  v_series_id := NULLIF(p_request->>'seriesId', '')::UUID;
  SELECT * INTO v_series
  FROM public.recurring_task_series
  WHERE id = v_series_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
  END IF;

  IF v_operation_key IS NOT NULL THEN
    SELECT * INTO v_existing_idempotency
    FROM public.recurring_task_idempotency
    WHERE user_id = v_user_id AND operation_key = v_operation_key
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing_idempotency.fingerprint <> v_fingerprint THEN
        RAISE EXCEPTION 'Idempotency key was reused for a different request';
      END IF;
      RETURN jsonb_set(
        jsonb_set(v_existing_idempotency.outcome, '{status}', '"already-applied"'::JSONB),
        '{type}', '"already-applied"'::JSONB
      );
    END IF;
  END IF;

  IF p_request ? 'expectedRevisionToken'
     AND (p_request->>'expectedRevisionToken')::INTEGER <> v_series.revision_token THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'expectedRevisionToken', (p_request->>'expectedRevisionToken')::INTEGER,
      'actualRevisionToken', v_series.revision_token
    );
  END IF;

  IF p_operation = 'ensure-coverage' THEN
    v_from_date := COALESCE(
      p_request->'range'->>'from',
      p_request->>'fromDate'
    )::DATE;
    v_to_date := COALESCE(
      p_request->'range'->>'to',
      p_request->>'throughDate'
    )::DATE;
    IF v_from_date IS NULL OR v_to_date IS NULL OR v_from_date > v_to_date THEN
      RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
    END IF;
    IF v_series.coverage_horizon IS NOT NULL
       AND v_from_date > v_series.coverage_horizon + 1
       AND v_to_date > v_series.coverage_horizon THEN
      v_from_date := v_series.coverage_horizon + 1;
    END IF;
    PERFORM public.recurring_task_materialize_locked(
      v_series_id, v_from_date, v_to_date
    );
    UPDATE public.recurring_tasks legacy
    SET status = CASE series.status WHEN 'ended' THEN 'archived' ELSE series.status END,
        instances_generated = (
          SELECT COUNT(*)::INTEGER
          FROM public.recurring_task_occurrences occurrence
          WHERE occurrence.series_id = series.id
            AND occurrence.state <> 'withdrawn'
        ),
        next_generate_date = series.coverage_horizon + 1
    FROM public.recurring_task_series series
    WHERE legacy.id = series.id
      AND legacy.user_id = v_user_id;
    v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  ELSIF p_operation = 'revise-series' THEN
    IF v_series.status = 'ended' THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Ended Series cannot be revised'
      );
    END IF;
    v_effective_date := COALESCE(
      NULLIF(p_request->>'effectiveDate', '')::DATE,
      (
        NOW() AT TIME ZONE COALESCE(
          v_series.time_zone,
          'UTC'
        )
      )::DATE
    );
    IF v_effective_date < v_series.activation_date THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'A Series Revision cannot begin before Activation Date'
      );
    END IF;
    IF p_request ? 'occurrenceLimit'
       AND p_request->>'occurrenceLimit' IS NOT NULL
       AND (
         (p_request->>'occurrenceLimit')::INTEGER < 1
         OR (p_request->>'occurrenceLimit')::INTEGER <> (p_request->>'occurrenceLimit')::NUMERIC
       ) THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Occurrence Limit must be a positive integer'
      );
    END IF;
    IF p_request ? 'lastScheduledDate'
       AND p_request->>'lastScheduledDate' IS NOT NULL
       AND (p_request->>'lastScheduledDate')::DATE < v_series.activation_date THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Last Scheduled Date cannot be before activation'
      );
    END IF;
    SELECT * INTO v_revision
    FROM public.recurring_task_series_revisions revision
    WHERE revision.id = v_series.current_revision_id
    FOR UPDATE;
    v_status := v_series.status;
    IF v_effective_date < v_revision.effective_from THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'A Series Revision cannot begin before the current revision'
      );
    END IF;
    v_defaults := v_revision.defaults || COALESCE(p_request->'defaults', '{}'::JSONB);
    IF v_effective_date = v_revision.effective_from THEN
      UPDATE public.recurring_task_series_revisions
      SET state = v_status,
          recurrence_rule = COALESCE(p_request->'recurrenceRule', recurrence_rule),
          activation_date = v_effective_date,
          defaults = v_defaults
      WHERE id = v_revision.id
      RETURNING * INTO v_revision;
    ELSE
      UPDATE public.recurring_task_series_revisions
      SET effective_to = v_effective_date
      WHERE id = v_revision.id;
      INSERT INTO public.recurring_task_series_revisions(
        series_id, effective_from, state, recurrence_rule,
        recurrence_anchor, activation_date, defaults
      ) VALUES (
        v_series_id,
        v_effective_date,
        v_status,
        COALESCE(p_request->'recurrenceRule', v_revision.recurrence_rule),
        v_revision.recurrence_anchor,
        v_effective_date,
        v_defaults
      ) RETURNING * INTO v_revision;
    END IF;
    UPDATE public.recurring_task_series
    SET current_revision_id = v_revision.id,
        status = v_status,
        occurrence_limit = CASE
          WHEN p_request ? 'occurrenceLimit'
            THEN NULLIF(p_request->>'occurrenceLimit', '')::INTEGER
          ELSE occurrence_limit
        END,
        last_scheduled_date = CASE
          WHEN p_request ? 'lastScheduledDate'
            THEN NULLIF(p_request->>'lastScheduledDate', '')::DATE
          ELSE last_scheduled_date
        END,
        revision_token = revision_token + 1,
        updated_at = NOW()
    WHERE id = v_series_id;
    v_from_date := COALESCE(
      p_request->'coverage'->>'from',
      v_effective_date::TEXT
    )::DATE;
    v_to_date := COALESCE(
      p_request->'coverage'->>'to',
      v_series.coverage_horizon::TEXT
    )::DATE;
    IF v_to_date IS NOT NULL AND v_from_date <= v_to_date THEN
      PERFORM public.recurring_task_materialize_locked(
        v_series_id, v_from_date, v_to_date
      );
    END IF;
    IF p_request->>'scope' = 'all' THEN
      UPDATE public.recurring_task_occurrences occurrence
      SET revision_id = v_revision.id,
          details = v_defaults || occurrence.overrides,
          updated_at = NOW()
      WHERE occurrence.series_id = v_series_id
        AND occurrence.state IN ('open', 'extra');
      UPDATE public.tasks task
      SET title = COALESCE(occurrence.details->>'title', task.title),
          description = occurrence.details->>'description',
          priority = COALESCE((occurrence.details->>'priority')::INTEGER, task.priority),
          category_id = (occurrence.details->>'categoryId')::UUID,
          due_time = (occurrence.details->>'dueTime')::TIME,
          sort_order = COALESCE((occurrence.details->>'sortOrder')::DOUBLE PRECISION, task.sort_order),
          status = COALESCE(occurrence.details->>'status', task.status),
          section = COALESCE(occurrence.details->>'section', task.section),
          project_id = (occurrence.details->>'projectId')::UUID,
          is_completed = COALESCE(occurrence.details->>'status', task.status) = 'done',
          updated_at = NOW()
      FROM public.recurring_task_occurrences occurrence
      WHERE occurrence.task_id = task.id
        AND occurrence.series_id = v_series_id
        AND occurrence.state IN ('open', 'extra');
    END IF;
    UPDATE public.recurring_tasks
    SET title = v_defaults->>'title',
        description = v_defaults->>'description',
        priority = COALESCE((v_defaults->>'priority')::INTEGER, priority),
        due_time = (v_defaults->>'dueTime')::TIME,
        recurrence_rule = v_revision.recurrence_rule,
        status = v_status,
        end_type = CASE
          WHEN p_request->>'endType' IS NOT NULL THEN p_request->>'endType'
          WHEN NULLIF(p_request->>'lastScheduledDate', '') IS NOT NULL THEN 'on_date'
          WHEN NULLIF(p_request->>'occurrenceLimit', '') IS NOT NULL THEN 'after_count'
          ELSE end_type
        END,
        end_date = CASE
          WHEN p_request ? 'lastScheduledDate'
            THEN NULLIF(p_request->>'lastScheduledDate', '')::DATE
          ELSE end_date
        END,
        end_count = CASE
          WHEN p_request ? 'occurrenceLimit'
            THEN NULLIF(p_request->>'occurrenceLimit', '')::INTEGER
          ELSE end_count
        END
    WHERE id = v_series_id AND user_id = v_user_id;
    v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  ELSIF p_operation = 'edit-occurrence' THEN
    v_updates := COALESCE(p_request->'updates', '{}'::JSONB);
    SELECT * INTO v_occurrence
    FROM public.recurring_task_occurrences occurrence
    WHERE occurrence.id = NULLIF(p_request->>'occurrenceId', '')::UUID
      AND occurrence.series_id = v_series_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
    END IF;
    IF v_occurrence.state = 'completed'
       AND p_request->>'completed' = 'false'
       AND v_updates = '{}'::JSONB THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.recurring_task_series_revisions revision
        WHERE revision.series_id = v_series_id
          AND revision.state = 'active'
          AND revision.effective_from <= v_occurrence.scheduled_date
          AND (revision.effective_to IS NULL OR v_occurrence.scheduled_date < revision.effective_to)
          AND (
            v_series.last_scheduled_date IS NULL
            OR v_occurrence.scheduled_date <= v_series.last_scheduled_date
          )
          AND EXISTS (
            SELECT 1
            FROM public.recurring_task_scheduled_dates(
              revision.recurrence_rule,
              revision.recurrence_anchor,
              revision.activation_date,
              v_occurrence.scheduled_date,
              v_occurrence.scheduled_date
            ) dates
            WHERE dates.scheduled_date = v_occurrence.scheduled_date
          )
      ) INTO v_schedule_exists;
      UPDATE public.recurring_task_occurrences
      SET state = CASE WHEN v_schedule_exists THEN 'open' ELSE 'extra' END,
          completed_at = NULL,
          updated_at = NOW()
      WHERE id = v_occurrence.id;
      UPDATE public.tasks
      SET is_completed = false,
          status = 'todo',
          completed_at = NULL,
          recurrence_occurrence_state = CASE
            WHEN v_schedule_exists THEN 'open' ELSE 'extra' END,
          updated_at = NOW()
      WHERE id = v_occurrence.task_id;
      v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
      RETURN v_outcome;
    END IF;
    IF v_occurrence.state IN ('completed', 'skipped', 'withdrawn') THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Only Open or Extra Occurrences can be edited'
      );
    END IF;
    UPDATE public.recurring_task_occurrences
    SET details = details || v_updates,
        overrides = overrides || v_updates,
        due_date = CASE WHEN v_updates ? 'dueDate'
          THEN (v_updates->>'dueDate')::DATE ELSE due_date END,
        updated_at = NOW()
    WHERE id = v_occurrence.id;
    UPDATE public.tasks
    SET title = CASE WHEN v_updates ? 'title' THEN v_updates->>'title' ELSE title END,
        description = CASE WHEN v_updates ? 'description'
          THEN v_updates->>'description' ELSE description END,
        priority = CASE WHEN v_updates ? 'priority'
          THEN (v_updates->>'priority')::INTEGER ELSE priority END,
        category_id = CASE WHEN v_updates ? 'categoryId'
          THEN (v_updates->>'categoryId')::UUID ELSE category_id END,
        due_date = CASE WHEN v_updates ? 'dueDate'
          THEN (v_updates->>'dueDate')::DATE ELSE due_date END,
        due_time = CASE WHEN v_updates ? 'dueTime'
          THEN (v_updates->>'dueTime')::TIME ELSE due_time END,
        sort_order = CASE WHEN v_updates ? 'sortOrder'
          THEN (v_updates->>'sortOrder')::DOUBLE PRECISION ELSE sort_order END,
        status = CASE WHEN v_updates ? 'status'
          THEN v_updates->>'status' ELSE status END,
        section = CASE WHEN v_updates ? 'section'
          THEN v_updates->>'section' ELSE section END,
        project_id = CASE WHEN v_updates ? 'projectId'
          THEN (v_updates->>'projectId')::UUID ELSE project_id END,
        is_completed = CASE WHEN v_updates ? 'status'
          THEN (v_updates->>'status') = 'done' ELSE is_completed END,
        completed_at = CASE WHEN v_updates ? 'status'
          THEN CASE WHEN v_updates->>'status' = 'done' THEN NOW() ELSE NULL END
          ELSE completed_at END,
        is_exception = true,
        recurrence_occurrence_state = CASE
          WHEN recurrence_occurrence_state IN ('withdrawn', 'extra') THEN 'extra'
          ELSE 'open'
        END,
        occurrence_overrides = occurrence_overrides || v_updates,
        updated_at = NOW()
    WHERE id = v_occurrence.task_id;
    IF p_request->>'completed' = 'true' THEN
      UPDATE public.recurring_task_occurrences
      SET state = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = v_occurrence.id;
      UPDATE public.tasks
      SET is_completed = true,
          status = 'done',
          completed_at = NOW(),
          recurrence_occurrence_state = 'completed',
          updated_at = NOW()
      WHERE id = v_occurrence.task_id;
    END IF;
    v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  ELSIF p_operation IN ('skip-occurrence', 'complete-occurrence', 'reopen-occurrence') THEN
    SELECT * INTO v_occurrence
    FROM public.recurring_task_occurrences occurrence
    WHERE occurrence.id = NULLIF(p_request->>'occurrenceId', '')::UUID
      AND occurrence.series_id = v_series_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not-found', 'type', 'not-found');
    END IF;
    IF p_operation = 'skip-occurrence' THEN
      IF v_occurrence.state = 'skipped' THEN
        RETURN jsonb_set(
          jsonb_set(
            public.recurring_task_series_snapshot(v_series_id, 'complete'),
            '{status}', '"already-applied"'::JSONB
          ),
          '{type}', '"already-applied"'::JSONB
        );
      END IF;
      IF v_occurrence.state NOT IN ('open', 'extra', 'skipped') THEN
        RETURN jsonb_build_object(
          'status', 'invalid-transition',
          'type', 'invalid-transition',
          'reason', 'Only Open or Extra Occurrences can be skipped'
        );
      END IF;
      UPDATE public.recurring_task_occurrences
      SET state = 'skipped', updated_at = NOW()
      WHERE id = v_occurrence.id;
      INSERT INTO public.recurring_task_intentional_absences(
        series_id, scheduled_date, reason
      ) VALUES (v_series_id, v_occurrence.scheduled_date, 'skipped')
      ON CONFLICT (series_id, scheduled_date) DO UPDATE SET reason = 'skipped';
      UPDATE public.tasks
      SET recurrence_occurrence_state = 'skipped', updated_at = NOW()
      WHERE id = v_occurrence.task_id;
    ELSIF p_operation = 'complete-occurrence' THEN
      IF v_occurrence.state = 'completed' THEN
        RETURN jsonb_set(
          jsonb_set(
            public.recurring_task_series_snapshot(v_series_id, 'complete'),
            '{status}', '"already-applied"'::JSONB
          ),
          '{type}', '"already-applied"'::JSONB
        );
      END IF;
      IF v_occurrence.state NOT IN ('open', 'extra', 'completed') THEN
        RETURN jsonb_build_object(
          'status', 'invalid-transition',
          'type', 'invalid-transition',
          'reason', 'Only Open or Extra Occurrences can be completed'
        );
      END IF;
      UPDATE public.recurring_task_occurrences
      SET state = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = v_occurrence.id;
      UPDATE public.tasks
      SET is_completed = true,
          status = 'done',
          completed_at = COALESCE(completed_at, NOW()),
          recurrence_occurrence_state = 'completed',
          updated_at = NOW()
      WHERE id = v_occurrence.task_id;
    ELSE
      IF v_occurrence.state <> 'completed' THEN
        RETURN jsonb_build_object(
          'status', 'invalid-transition',
          'type', 'invalid-transition',
          'reason', 'Only completed Occurrences can be reopened'
        );
      END IF;
      SELECT EXISTS (
        SELECT 1
        FROM public.recurring_task_series_revisions revision
        WHERE revision.series_id = v_series_id
          AND revision.state = 'active'
          AND revision.effective_from <= v_occurrence.scheduled_date
          AND (revision.effective_to IS NULL OR v_occurrence.scheduled_date < revision.effective_to)
          AND (
            v_series.last_scheduled_date IS NULL
            OR v_occurrence.scheduled_date <= v_series.last_scheduled_date
          )
          AND EXISTS (
            SELECT 1
            FROM public.recurring_task_scheduled_dates(
              revision.recurrence_rule,
              revision.recurrence_anchor,
              revision.activation_date,
              v_occurrence.scheduled_date,
              v_occurrence.scheduled_date
            ) dates
            WHERE dates.scheduled_date = v_occurrence.scheduled_date
          )
      ) INTO v_schedule_exists;
      UPDATE public.recurring_task_occurrences
      SET state = CASE WHEN v_schedule_exists THEN 'open' ELSE 'extra' END,
          completed_at = NULL,
          updated_at = NOW()
      WHERE id = v_occurrence.id;
      UPDATE public.tasks
      SET is_completed = false,
          status = 'todo',
          completed_at = NULL,
          recurrence_occurrence_state = CASE
            WHEN v_schedule_exists THEN 'open' ELSE 'extra' END,
          updated_at = NOW()
      WHERE id = v_occurrence.task_id;
    END IF;
    v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  ELSIF p_operation IN ('pause-series', 'resume-series', 'end-series') THEN
    IF p_operation = 'pause-series' AND v_series.status <> 'active' THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', CASE WHEN v_series.status = 'ended'
          THEN 'Ended Series cannot be paused' ELSE 'Paused Series is already paused' END
      );
    END IF;
    IF p_operation = 'resume-series' AND v_series.status <> 'paused' THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', CASE WHEN v_series.status = 'ended'
          THEN 'Ended Series cannot be resumed' ELSE 'Active Series is not paused' END
      );
    END IF;
    IF p_operation = 'end-series' AND v_series.status = 'ended' THEN
      RETURN public.recurring_task_series_snapshot(v_series_id, 'complete');
    END IF;
    v_effective_date := COALESCE(
      NULLIF(p_request->>'effectiveDate', '')::DATE,
      (
        NOW() AT TIME ZONE COALESCE(
          v_series.time_zone,
          'UTC'
        )
      )::DATE
    );
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
    v_status := CASE p_operation
      WHEN 'pause-series' THEN 'paused'
      WHEN 'resume-series' THEN 'active'
      ELSE 'ended'
    END;
    IF v_effective_date < v_revision.effective_from THEN
      RETURN jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'A lifecycle transition cannot begin before the current revision'
      );
    END IF;
    IF p_operation = 'resume-series' THEN
      DELETE FROM public.recurring_task_intentional_absences
      WHERE series_id = v_series_id
        AND reason = 'paused'
        AND scheduled_date >= v_effective_date;
    END IF;
    IF v_effective_date = v_revision.effective_from THEN
      UPDATE public.recurring_task_series_revisions
      SET state = v_status,
          activation_date = v_effective_date
      WHERE id = v_revision.id
      RETURNING * INTO v_revision;
    ELSE
      UPDATE public.recurring_task_series_revisions
      SET effective_to = v_effective_date
      WHERE id = v_revision.id;
      INSERT INTO public.recurring_task_series_revisions(
        series_id, effective_from, state, recurrence_rule,
        recurrence_anchor, activation_date, defaults
      ) VALUES (
        v_series_id,
        v_effective_date,
        v_status,
        v_revision.recurrence_rule,
        v_revision.recurrence_anchor,
        v_effective_date,
        v_revision.defaults
      ) RETURNING * INTO v_revision;
    END IF;
    UPDATE public.recurring_task_series
    SET current_revision_id = v_revision.id,
        status = v_status,
        revision_token = revision_token + 1,
        updated_at = NOW()
    WHERE id = v_series_id;
    v_from_date := COALESCE(
      p_request->'coverage'->>'from',
      v_effective_date::TEXT
    )::DATE;
    v_to_date := COALESCE(
      p_request->'coverage'->>'to',
      v_series.coverage_horizon::TEXT
    )::DATE;
    IF v_to_date IS NOT NULL AND v_from_date <= v_to_date THEN
      PERFORM public.recurring_task_materialize_locked(
        v_series_id, v_from_date, v_to_date
      );
    END IF;
    UPDATE public.recurring_tasks
    SET status = CASE v_status WHEN 'ended' THEN 'archived' ELSE v_status END,
        next_generate_date = COALESCE(
          (SELECT series.coverage_horizon + 1
           FROM public.recurring_task_series series
           WHERE series.id = v_series_id),
          next_generate_date
        )
    WHERE id = v_series_id AND user_id = v_user_id;
    v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  ELSE
    RAISE EXCEPTION 'Unsupported Recurring Task Lifecycle operation: %', p_operation;
  END IF;

  IF v_operation_key IS NOT NULL THEN
    INSERT INTO public.recurring_task_idempotency(
      user_id, operation_key, fingerprint, series_id, outcome
    ) VALUES (
      v_user_id, v_operation_key, v_fingerprint, v_series_id, v_outcome
    );
  END IF;
  RETURN v_outcome;
END;
$function$;

CREATE CONSTRAINT TRIGGER recurring_task_revision_no_overlap
AFTER INSERT OR UPDATE ON public.recurring_task_series_revisions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.recurring_task_revision_no_overlap();

CREATE OR REPLACE FUNCTION public.recurring_task_task_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (
      NEW.recurring_task_id IS NOT NULL
      OR NEW.recurring_series_id IS NOT NULL
      OR NEW.recurring_occurrence_id IS NOT NULL
    ) AND current_setting('betterr.recurring_lifecycle', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Recurring task mutations must use the lifecycle boundary';
    END IF;
    RETURN NEW;
  END IF;
  IF current_setting('betterr.recurring_lifecycle', true) IS DISTINCT FROM 'on' THEN
    IF OLD.recurring_task_id IS NOT NULL
      OR OLD.recurring_series_id IS NOT NULL
      OR OLD.recurring_occurrence_id IS NOT NULL
      OR NEW.recurring_task_id IS NOT NULL
      OR NEW.recurring_series_id IS NOT NULL
      OR NEW.recurring_occurrence_id IS NOT NULL THEN
      RAISE EXCEPTION 'Recurring task mutations must use the lifecycle boundary';
    END IF;
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

CREATE TRIGGER recurring_task_task_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.recurring_task_task_write_guard();

CREATE OR REPLACE FUNCTION public.recurring_task_legacy_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF current_setting('betterr.recurring_lifecycle', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Recurring Task Series mutations must use the lifecycle boundary';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER recurring_task_legacy_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.recurring_tasks
FOR EACH ROW
EXECUTE FUNCTION public.recurring_task_legacy_write_guard();

ALTER TABLE public.recurring_task_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_task_series_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_task_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_task_intentional_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_task_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_task_series_owner_select
  ON public.recurring_task_series FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY recurring_task_series_owner_insert
  ON public.recurring_task_series FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY recurring_task_series_owner_update
  ON public.recurring_task_series FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY recurring_task_revision_owner_select
  ON public.recurring_task_series_revisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.recurring_task_series series
    WHERE series.id = series_id AND series.user_id = auth.uid()
  ));

CREATE POLICY recurring_task_occurrence_owner_select
  ON public.recurring_task_occurrences FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.recurring_task_series series
    WHERE series.id = series_id AND series.user_id = auth.uid()
  ));

CREATE POLICY recurring_task_absence_owner_select
  ON public.recurring_task_intentional_absences FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.recurring_task_series series
    WHERE series.id = series_id AND series.user_id = auth.uid()
  ));

CREATE POLICY recurring_task_idempotency_owner_select
  ON public.recurring_task_idempotency FOR SELECT
  USING (user_id = auth.uid());

-- Preserve legacy facts while establishing a stable series identity. Rows
-- without a trustworthy legacy scheduled date remain ordinary standalone
-- tasks; they are deliberately not guessed into the occurrence ledger.
DO $backfill$
BEGIN
  PERFORM set_config('betterr.recurring_lifecycle', 'on', true);

  INSERT INTO public.recurring_task_series (
    id, user_id, status, recurrence_anchor, activation_date,
    occurrence_limit, last_scheduled_date, time_zone,
    created_at, updated_at
  )
  SELECT
    legacy.id,
    legacy.user_id,
    CASE WHEN legacy.status = 'archived' THEN 'ended'
      ELSE COALESCE(legacy.status, 'active') END,
    legacy.start_date,
    legacy.start_date,
    CASE
      WHEN legacy.end_type = 'after_count' AND legacy.end_count > 0
        THEN legacy.end_count
      ELSE NULL
    END,
    CASE
      WHEN legacy.end_type = 'on_date'
        AND legacy.end_date >= legacy.start_date
        THEN legacy.end_date
      ELSE NULL
    END,
    CASE
      WHEN profile.timezone IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_timezone_names
          WHERE name = profile.timezone
        )
        THEN profile.timezone
      ELSE 'UTC'
    END,
    legacy.created_at,
    legacy.updated_at
  FROM public.recurring_tasks legacy
  LEFT JOIN public.profiles profile ON profile.id = legacy.user_id
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.recurring_task_series_revisions (
    series_id, effective_from, effective_to, state,
    recurrence_rule, recurrence_anchor, activation_date, defaults,
    created_at
  )
  SELECT
    legacy.id,
    legacy.start_date,
    CASE
      WHEN legacy.end_type = 'on_date'
        AND legacy.end_date >= legacy.start_date
        THEN legacy.end_date + 1
      ELSE NULL
    END,
    CASE WHEN legacy.status = 'archived' THEN 'ended'
      ELSE COALESCE(legacy.status, 'active') END,
    legacy.recurrence_rule,
    legacy.start_date,
    legacy.start_date,
    jsonb_build_object(
      'title', legacy.title,
      'description', legacy.description,
      'priority', legacy.priority,
      'categoryId', legacy.category_id,
      'dueTime', legacy.due_time
    ),
    legacy.created_at
  FROM public.recurring_tasks legacy
  ON CONFLICT (series_id, effective_from) DO NOTHING;

  UPDATE public.recurring_task_series series
  SET current_revision_id = revision.id
  FROM public.recurring_task_series_revisions revision
  WHERE revision.series_id = series.id
    AND revision.effective_from = series.recurrence_anchor
    AND series.current_revision_id IS NULL;

END
$backfill$;

ALTER TABLE public.recurring_task_series
  ALTER COLUMN current_revision_id SET NOT NULL;

COMMENT ON TABLE public.recurring_task_series IS
  'Stable Recurring Task Series identity and lifecycle policy.';
COMMENT ON TABLE public.recurring_task_series_revisions IS
  'Effective-dated Recurrence Rule and Series Defaults history.';
COMMENT ON TABLE public.recurring_task_occurrences IS
  'Materialized Task Occurrence ledger; one row per series and Scheduled Date.';
COMMENT ON COLUMN public.tasks.scheduled_date IS
  'Immutable local Scheduled Date; unlike due_date it never moves with an edit.';
COMMENT ON COLUMN public.tasks.occurrence_overrides IS
  'Presence-aware field-level Occurrence Overrides, including explicit nulls.';

CREATE OR REPLACE FUNCTION public.recurring_task_scheduled_dates(
  p_rule JSONB,
  p_anchor DATE,
  p_activation DATE,
  p_from DATE,
  p_to DATE
)
RETURNS TABLE(scheduled_date DATE)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_frequency TEXT := p_rule->>'frequency';
  v_interval INTEGER := COALESCE((p_rule->>'interval')::INTEGER, 1);
  v_lower DATE := GREATEST(p_from, p_activation);
  v_candidate DATE;
  v_anchor_week DATE;
  v_lower_week DATE;
  v_requested_week INTEGER;
  v_week_index INTEGER;
  v_dow INTEGER;
  v_anchor_month INTEGER;
  v_lower_month INTEGER;
  v_month_index INTEGER;
  v_month DATE;
  v_month_last DATE;
  v_first_dow INTEGER;
  v_last_dow INTEGER;
  v_position INTEGER;
  v_wanted_dow INTEGER;
  v_day INTEGER;
  v_anchor_year INTEGER;
  v_lower_year INTEGER;
  v_year INTEGER;
  v_month_of_year INTEGER;
  v_day_of_month INTEGER;
BEGIN
  IF p_from > p_to OR v_lower > p_to THEN
    RETURN;
  END IF;
  IF v_interval < 1 THEN
    RAISE EXCEPTION 'Recurrence interval must be a positive integer';
  END IF;

  IF v_frequency = 'daily' THEN
    v_candidate := p_anchor
      + ((GREATEST(0, v_lower - p_anchor) + v_interval - 1)
        / v_interval) * v_interval;
    WHILE v_candidate <= p_to LOOP
      IF v_candidate >= p_activation THEN
        scheduled_date := v_candidate;
        RETURN NEXT;
      END IF;
      v_candidate := v_candidate + v_interval;
    END LOOP;
    RETURN;
  END IF;

  IF v_frequency = 'weekly' THEN
    v_anchor_week := p_anchor - EXTRACT(DOW FROM p_anchor)::INTEGER;
    v_lower_week := v_lower - EXTRACT(DOW FROM v_lower)::INTEGER;
    v_requested_week := GREATEST(0, (v_lower_week - v_anchor_week) / 7);
    v_week_index := CASE
      WHEN v_requested_week = 0 THEN 0
      ELSE ((v_requested_week + v_interval - 1) / v_interval) * v_interval
    END;

    WHILE v_anchor_week + (v_week_index * 7) <= p_to LOOP
      FOR v_dow IN
        SELECT DISTINCT value::INTEGER
        FROM jsonb_array_elements_text(COALESCE(p_rule->'days_of_week', '[]'::JSONB))
        WHERE value::INTEGER BETWEEN 0 AND 6
        ORDER BY value::INTEGER
      LOOP
        v_candidate := v_anchor_week + (v_week_index * 7) + v_dow;
        IF v_candidate BETWEEN v_lower AND p_to
           AND v_candidate >= p_anchor
           AND v_candidate >= p_activation THEN
          scheduled_date := v_candidate;
          RETURN NEXT;
        END IF;
      END LOOP;
      v_week_index := v_week_index + v_interval;
    END LOOP;
    RETURN;
  END IF;

  IF v_frequency = 'monthly' THEN
    v_anchor_month := EXTRACT(YEAR FROM p_anchor)::INTEGER * 12
      + EXTRACT(MONTH FROM p_anchor)::INTEGER - 1;
    v_lower_month := EXTRACT(YEAR FROM v_lower)::INTEGER * 12
      + EXTRACT(MONTH FROM v_lower)::INTEGER - 1;
    v_month_index := v_anchor_month
      + ((GREATEST(0, v_lower_month - v_anchor_month) + v_interval - 1)
        / v_interval) * v_interval;

    WHILE v_month_index <= EXTRACT(YEAR FROM p_to)::INTEGER * 12
      + EXTRACT(MONTH FROM p_to)::INTEGER - 1 LOOP
      v_month := make_date(v_month_index / 12, (v_month_index % 12) + 1, 1);
      v_month_last := (v_month + INTERVAL '1 month - 1 day')::DATE;
      IF p_rule ? 'week_position' THEN
        v_wanted_dow := (p_rule->>'day_of_week_monthly')::INTEGER;
        v_first_dow := EXTRACT(DOW FROM v_month)::INTEGER;
        v_last_dow := EXTRACT(DOW FROM v_month_last)::INTEGER;
        IF p_rule->>'week_position' = 'last' THEN
          v_candidate := v_month_last
            - ((v_last_dow - v_wanted_dow + 7) % 7);
        ELSE
          v_position := CASE p_rule->>'week_position'
            WHEN 'first' THEN 1
            WHEN 'second' THEN 2
            WHEN 'third' THEN 3
            WHEN 'fourth' THEN 4
            ELSE 1
          END;
          v_candidate := v_month
            + ((v_wanted_dow - v_first_dow + 7) % 7)
            + ((v_position - 1) * 7);
        END IF;
      ELSE
        v_day_of_month := (p_rule->>'day_of_month')::INTEGER;
        v_candidate := v_month
          + LEAST(v_day_of_month, EXTRACT(DAY FROM v_month_last)::INTEGER) - 1;
      END IF;
      IF v_candidate BETWEEN v_lower AND p_to
         AND v_candidate >= p_anchor
         AND v_candidate >= p_activation THEN
        scheduled_date := v_candidate;
        RETURN NEXT;
      END IF;
      v_month_index := v_month_index + v_interval;
    END LOOP;
    RETURN;
  END IF;

  IF v_frequency = 'yearly' THEN
    v_anchor_year := EXTRACT(YEAR FROM p_anchor)::INTEGER;
    v_lower_year := EXTRACT(YEAR FROM v_lower)::INTEGER;
    v_year := v_anchor_year
      + ((GREATEST(0, v_lower_year - v_anchor_year) + v_interval - 1)
        / v_interval) * v_interval;
    v_month_of_year := (p_rule->>'month_of_year')::INTEGER;
    v_day_of_month := (p_rule->>'day_of_month')::INTEGER;
    WHILE v_year <= EXTRACT(YEAR FROM p_to)::INTEGER + 1 LOOP
      v_month := make_date(v_year, v_month_of_year, 1);
      v_month_last := (v_month + INTERVAL '1 month - 1 day')::DATE;
      v_candidate := v_month
        + LEAST(v_day_of_month, EXTRACT(DAY FROM v_month_last)::INTEGER) - 1;
      EXIT WHEN v_candidate > p_to;
      IF v_candidate BETWEEN v_lower AND p_to
         AND v_candidate >= p_anchor
         AND v_candidate >= p_activation THEN
        scheduled_date := v_candidate;
        RETURN NEXT;
      END IF;
      v_year := v_year + v_interval;
    END LOOP;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Unsupported recurrence frequency: %', v_frequency;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_safe_scheduled_date(
  p_rule JSONB,
  p_anchor DATE,
  p_activation DATE,
  p_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.recurring_task_scheduled_dates(
      p_rule,
      p_anchor,
      p_activation,
      p_date,
      p_date
    ) scheduled
    WHERE scheduled.scheduled_date = p_date
  );
EXCEPTION WHEN OTHERS THEN
  -- A legacy row with malformed recurrence metadata is not safe to attribute
  -- to a lifecycle occurrence. The migration preserves it as a standalone
  -- task instead of aborting the whole backfill or guessing its lineage.
  RETURN FALSE;
END;
$function$;

-- Link legacy task facts only after the deterministic schedule helper exists.
-- A task with an ambiguous or invalid legacy Scheduled Date remains a
-- standalone task rather than being guessed into the occurrence ledger.
DO $safe_backfill$
BEGIN
  PERFORM set_config('betterr.recurring_lifecycle', 'on', true);
  INSERT INTO public.recurring_task_occurrences (
    series_id, revision_id, scheduled_date, due_date, details, state,
    overrides, task_id, completed_at
  )
  SELECT
    task.recurring_task_id,
    revision.id,
    task.original_date,
    task.due_date,
    jsonb_build_object(
      'title', task.title,
      'description', task.description,
      'priority', task.priority,
      'categoryId', task.category_id,
      'dueTime', task.due_time,
      'sortOrder', task.sort_order,
      'status', task.status,
      'section', task.section,
      'projectId', task.project_id
    ),
    CASE WHEN task.is_completed THEN 'completed' ELSE 'open' END,
    (CASE WHEN task.title IS DISTINCT FROM legacy.title
      THEN jsonb_build_object('title', task.title) ELSE '{}'::JSONB END)
      || (CASE WHEN task.description IS DISTINCT FROM legacy.description
        THEN jsonb_build_object('description', task.description) ELSE '{}'::JSONB END)
      || (CASE WHEN task.priority IS DISTINCT FROM legacy.priority
        THEN jsonb_build_object('priority', task.priority) ELSE '{}'::JSONB END)
      || (CASE WHEN task.category_id IS DISTINCT FROM legacy.category_id
        THEN jsonb_build_object('categoryId', task.category_id) ELSE '{}'::JSONB END)
      || (CASE WHEN task.due_time IS DISTINCT FROM legacy.due_time
        THEN jsonb_build_object('dueTime', task.due_time) ELSE '{}'::JSONB END)
      || (CASE WHEN task.due_date IS DISTINCT FROM task.original_date
        THEN jsonb_build_object('dueDate', task.due_date) ELSE '{}'::JSONB END)
      || (CASE WHEN task.status IS DISTINCT FROM 'todo'
          AND NOT task.is_completed
        THEN jsonb_build_object('status', task.status) ELSE '{}'::JSONB END)
      || (CASE WHEN task.section IS DISTINCT FROM 'personal'
        THEN jsonb_build_object('section', task.section) ELSE '{}'::JSONB END)
      || (CASE WHEN task.project_id IS NOT NULL
        THEN jsonb_build_object('projectId', task.project_id) ELSE '{}'::JSONB END),
    task.id,
    task.completed_at
  FROM public.tasks task
  JOIN public.recurring_tasks legacy
    ON legacy.id = task.recurring_task_id
  JOIN public.recurring_task_series_revisions revision
    ON revision.series_id = task.recurring_task_id
   AND revision.effective_from = (
     SELECT series.recurrence_anchor
     FROM public.recurring_task_series series
     WHERE series.id = task.recurring_task_id
   )
  JOIN public.recurring_task_series series
    ON series.id = task.recurring_task_id
  WHERE task.recurring_task_id IS NOT NULL
    AND task.original_date IS NOT NULL
    AND public.recurring_task_safe_scheduled_date(
      revision.recurrence_rule,
      revision.recurrence_anchor,
      revision.activation_date,
      task.original_date
    )
  ON CONFLICT (series_id, scheduled_date) DO NOTHING;

  UPDATE public.tasks task
  SET recurring_series_id = occurrence.series_id,
      recurring_occurrence_id = occurrence.id,
      scheduled_date = occurrence.scheduled_date,
      recurrence_occurrence_state = occurrence.state,
      occurrence_overrides = occurrence.overrides
  FROM public.recurring_task_occurrences occurrence
  WHERE occurrence.task_id = task.id;

  -- Do not infer a lifecycle occurrence from an untrustworthy legacy date.
  -- Detaching the legacy template link makes the row explicitly standalone
  -- while preserving the task itself and its user-visible history.
  UPDATE public.tasks task
  SET recurring_task_id = NULL
  WHERE task.recurring_task_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.recurring_task_occurrences occurrence
      WHERE occurrence.task_id = task.id
    );
END
$safe_backfill$;

-- Reconcile migration bookkeeping from the durable ledger rather than
-- inheriting the legacy generation counter. A null horizon remains honest when
-- no legacy task had a trustworthy Scheduled Date.
DO $reconcile_backfill$
BEGIN
  PERFORM set_config('betterr.recurring_lifecycle', 'on', true);

  UPDATE public.recurring_task_series series
  SET coverage_horizon = (
    SELECT MAX(occurrence.scheduled_date)
    FROM public.recurring_task_occurrences occurrence
    WHERE occurrence.series_id = series.id
  );

  UPDATE public.recurring_task_series series
  SET status = 'ended', updated_at = NOW()
  WHERE series.status = 'active'
    AND (
      (
        series.occurrence_limit IS NOT NULL
        AND (
          SELECT COUNT(*)
          FROM public.recurring_task_occurrences occurrence
          WHERE occurrence.series_id = series.id
            AND occurrence.state <> 'withdrawn'
        ) >= series.occurrence_limit
      )
      OR (
        series.last_scheduled_date IS NOT NULL
        AND series.coverage_horizon IS NOT NULL
        AND series.coverage_horizon >= series.last_scheduled_date
      )
    );

  UPDATE public.recurring_tasks legacy
  SET status = CASE series.status WHEN 'ended' THEN 'archived' ELSE series.status END,
      instances_generated = (
        SELECT COUNT(*)::INTEGER
        FROM public.recurring_task_occurrences occurrence
        WHERE occurrence.series_id = series.id
          AND occurrence.state <> 'withdrawn'
      ),
      next_generate_date = series.coverage_horizon + 1
  FROM public.recurring_task_series series
  WHERE legacy.id = series.id;
END
$reconcile_backfill$;

CREATE OR REPLACE FUNCTION public.recurring_task_series_snapshot(
  p_series_id UUID,
  p_status TEXT DEFAULT 'complete'
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'status', p_status,
    'type', p_status,
    'value', jsonb_build_object(
      'id', series.id,
      'userId', series.user_id,
      'status', series.status,
      'timeZone', series.time_zone,
      'recurrenceAnchor', series.recurrence_anchor,
      'activationDate', series.activation_date,
      'occurrenceLimit', series.occurrence_limit,
      'lastScheduledDate', series.last_scheduled_date,
      'coverageHorizon', series.coverage_horizon,
      'currentRevisionId', series.current_revision_id,
      'revisionToken', series.revision_token,
      'revisions', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', revision.id,
            'seriesId', revision.series_id,
            'effectiveFrom', revision.effective_from,
            'effectiveTo', revision.effective_to,
            'state', revision.state,
            'recurrenceRule', revision.recurrence_rule,
            'recurrenceAnchor', revision.recurrence_anchor,
            'activationDate', revision.activation_date,
            'defaults', revision.defaults,
            'createdAt', revision.created_at
          ) ORDER BY revision.effective_from
        )
        FROM public.recurring_task_series_revisions revision
        WHERE revision.series_id = series.id
      ), '[]'::JSONB),
      'occurrences', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', occurrence.id,
            'seriesId', occurrence.series_id,
            'revisionId', occurrence.revision_id,
            'scheduledDate', occurrence.scheduled_date,
            'dueDate', occurrence.due_date,
            'details', occurrence.details,
            'state', occurrence.state,
            'overrides', occurrence.overrides,
            'taskId', occurrence.task_id,
            'completedAt', occurrence.completed_at,
            'createdAt', occurrence.created_at
          ) ORDER BY occurrence.scheduled_date
        )
        FROM public.recurring_task_occurrences occurrence
        WHERE occurrence.series_id = series.id
      ), '[]'::JSONB),
      'intentionalAbsences', COALESCE((
        SELECT jsonb_agg(absence.scheduled_date ORDER BY absence.scheduled_date)
        FROM public.recurring_task_intentional_absences absence
        WHERE absence.series_id = series.id
      ), '[]'::JSONB),
      'createdAt', series.created_at,
      'updatedAt', series.updated_at
    ),
    'series', jsonb_build_object(
      'id', series.id,
      'userId', series.user_id,
      'status', series.status,
      'timeZone', series.time_zone,
      'recurrenceAnchor', series.recurrence_anchor,
      'activationDate', series.activation_date,
      'occurrenceLimit', series.occurrence_limit,
      'lastScheduledDate', series.last_scheduled_date,
      'coverageHorizon', series.coverage_horizon,
      'currentRevisionId', series.current_revision_id,
      'revisionToken', series.revision_token,
      'revisions', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', revision.id,
            'seriesId', revision.series_id,
            'effectiveFrom', revision.effective_from,
            'effectiveTo', revision.effective_to,
            'state', revision.state,
            'recurrenceRule', revision.recurrence_rule,
            'recurrenceAnchor', revision.recurrence_anchor,
            'activationDate', revision.activation_date,
            'defaults', revision.defaults,
            'createdAt', revision.created_at
          ) ORDER BY revision.effective_from
        )
        FROM public.recurring_task_series_revisions revision
        WHERE revision.series_id = series.id
      ), '[]'::JSONB),
      'occurrences', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', occurrence.id,
            'seriesId', occurrence.series_id,
            'revisionId', occurrence.revision_id,
            'scheduledDate', occurrence.scheduled_date,
            'dueDate', occurrence.due_date,
            'details', occurrence.details,
            'state', occurrence.state,
            'overrides', occurrence.overrides,
            'taskId', occurrence.task_id,
            'completedAt', occurrence.completed_at,
            'createdAt', occurrence.created_at
          ) ORDER BY occurrence.scheduled_date
        )
        FROM public.recurring_task_occurrences occurrence
        WHERE occurrence.series_id = series.id
      ), '[]'::JSONB),
      'intentionalAbsences', COALESCE((
        SELECT jsonb_agg(absence.scheduled_date ORDER BY absence.scheduled_date)
        FROM public.recurring_task_intentional_absences absence
        WHERE absence.series_id = series.id
      ), '[]'::JSONB),
      'createdAt', series.created_at,
      'updatedAt', series.updated_at
    ),
    'occurrences', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', occurrence.id,
          'seriesId', occurrence.series_id,
          'revisionId', occurrence.revision_id,
          'scheduledDate', occurrence.scheduled_date,
          'dueDate', occurrence.due_date,
          'details', occurrence.details,
          'state', occurrence.state,
          'overrides', occurrence.overrides,
          'taskId', occurrence.task_id,
          'completedAt', occurrence.completed_at,
          'createdAt', occurrence.created_at
        ) ORDER BY occurrence.scheduled_date
      )
      FROM public.recurring_task_occurrences occurrence
      WHERE occurrence.series_id = series.id
        AND occurrence.state <> 'withdrawn'
    ), '[]'::JSONB),
    'intentionalAbsences', COALESCE((
      SELECT jsonb_agg(absence.scheduled_date ORDER BY absence.scheduled_date)
      FROM public.recurring_task_intentional_absences absence
      WHERE absence.series_id = series.id
    ), '[]'::JSONB)
  )
  FROM public.recurring_task_series series
  WHERE series.id = p_series_id;
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_materialize_locked(
  p_series_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_series public.recurring_task_series%ROWTYPE;
  v_revision public.recurring_task_series_revisions%ROWTYPE;
  v_occurrence public.recurring_task_occurrences%ROWTYPE;
  v_date DATE;
  v_start DATE;
  v_end DATE;
  v_task_id UUID;
  v_occurrence_id UUID;
  v_sort_order DOUBLE PRECISION;
  v_retained_count INTEGER;
  v_has_active_schedule BOOLEAN;
  v_reason TEXT;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
  END IF;

  SELECT * INTO v_series
  FROM public.recurring_task_series
  WHERE id = p_series_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring Task Series not found';
  END IF;

  FOR v_revision IN
    SELECT revision.*
    FROM public.recurring_task_series_revisions revision
    WHERE revision.series_id = p_series_id
      AND revision.effective_from <= p_to
      AND (revision.effective_to IS NULL OR revision.effective_to > p_from)
    ORDER BY revision.effective_from, revision.id
  LOOP
    v_start := GREATEST(p_from, v_revision.effective_from);
    v_end := LEAST(
      p_to,
      COALESCE(v_revision.effective_to - 1, p_to)
    );
    IF v_start > v_end THEN
      CONTINUE;
    END IF;

    FOR v_date IN
      SELECT dates.scheduled_date
      FROM public.recurring_task_scheduled_dates(
        v_revision.recurrence_rule,
        v_revision.recurrence_anchor,
        v_revision.activation_date,
        v_start,
        v_end
      ) dates
      ORDER BY dates.scheduled_date
    LOOP
      IF v_revision.state <> 'active' THEN
        v_reason := CASE v_revision.state
          WHEN 'paused' THEN 'paused'
          ELSE 'ended'
        END;
        INSERT INTO public.recurring_task_intentional_absences(
          series_id, scheduled_date, reason
        ) VALUES (p_series_id, v_date, v_reason)
        ON CONFLICT (series_id, scheduled_date) DO UPDATE
          SET reason = CASE
            WHEN public.recurring_task_intentional_absences.reason = 'skipped'
              THEN public.recurring_task_intentional_absences.reason
            ELSE EXCLUDED.reason
          END;

        SELECT * INTO v_occurrence
        FROM public.recurring_task_occurrences occurrence
        WHERE occurrence.series_id = p_series_id
          AND occurrence.scheduled_date = v_date
        FOR UPDATE;
        IF FOUND AND v_occurrence.state = 'open' THEN
          UPDATE public.recurring_task_occurrences
          SET state = CASE
                WHEN v_occurrence.overrides <> '{}'::JSONB THEN 'extra'
                ELSE 'withdrawn'
              END,
              updated_at = NOW()
          WHERE id = v_occurrence.id;
          UPDATE public.tasks
          SET recurrence_occurrence_state = CASE
                WHEN v_occurrence.overrides <> '{}'::JSONB THEN 'extra'
                ELSE 'withdrawn'
              END
          WHERE id = v_occurrence.task_id;
        END IF;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.recurring_task_intentional_absences absence
        WHERE absence.series_id = p_series_id
          AND absence.scheduled_date = v_date
      ) THEN
        CONTINUE;
      END IF;

      SELECT * INTO v_occurrence
      FROM public.recurring_task_occurrences occurrence
      WHERE occurrence.series_id = p_series_id
        AND occurrence.scheduled_date = v_date
      FOR UPDATE;
      IF FOUND THEN
        IF v_occurrence.state = 'withdrawn' THEN
          UPDATE public.recurring_task_occurrences
          SET state = 'open',
              revision_id = v_revision.id,
              details = v_revision.defaults || v_occurrence.overrides,
              due_date = CASE
                WHEN v_occurrence.overrides ? 'dueDate'
                  THEN v_occurrence.due_date
                ELSE v_date
              END,
              updated_at = NOW()
          WHERE id = v_occurrence.id;
      UPDATE public.tasks
      SET title = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'title', title),
              description = (v_revision.defaults || v_occurrence.overrides)->>'description',
              priority = COALESCE(((v_revision.defaults || v_occurrence.overrides)->>'priority')::INTEGER, priority),
              category_id = ((v_revision.defaults || v_occurrence.overrides)->>'categoryId')::UUID,
              due_date = CASE
                WHEN v_occurrence.overrides ? 'dueDate'
                  THEN due_date
                ELSE v_date
              END,
              due_time = ((v_revision.defaults || v_occurrence.overrides)->>'dueTime')::TIME,
              sort_order = COALESCE(((v_revision.defaults || v_occurrence.overrides)->>'sortOrder')::DOUBLE PRECISION, sort_order),
              status = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'status', status),
              section = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'section', section),
              project_id = ((v_revision.defaults || v_occurrence.overrides)->>'projectId')::UUID,
              recurrence_occurrence_state = 'open'
          WHERE id = v_occurrence.task_id;
        ELSIF v_occurrence.state IN ('open', 'extra') THEN
          UPDATE public.recurring_task_occurrences
          SET revision_id = v_revision.id,
              details = v_revision.defaults || v_occurrence.overrides,
              due_date = CASE
                WHEN v_occurrence.overrides ? 'dueDate'
                  THEN due_date
                ELSE v_date
              END,
              updated_at = NOW()
          WHERE id = v_occurrence.id;
          UPDATE public.tasks
          SET title = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'title', title),
              description = (v_revision.defaults || v_occurrence.overrides)->>'description',
              priority = COALESCE(((v_revision.defaults || v_occurrence.overrides)->>'priority')::INTEGER, priority),
              category_id = ((v_revision.defaults || v_occurrence.overrides)->>'categoryId')::UUID,
              due_date = CASE
                WHEN v_occurrence.overrides ? 'dueDate'
                  THEN due_date
                ELSE v_date
              END,
              due_time = ((v_revision.defaults || v_occurrence.overrides)->>'dueTime')::TIME,
              sort_order = COALESCE(((v_revision.defaults || v_occurrence.overrides)->>'sortOrder')::DOUBLE PRECISION, sort_order),
              status = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'status', status),
              section = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'section', section),
              project_id = ((v_revision.defaults || v_occurrence.overrides)->>'projectId')::UUID,
              recurrence_occurrence_state = v_occurrence.state
          WHERE id = v_occurrence.task_id;
        END IF;
        CONTINUE;
      END IF;

      SELECT COUNT(*)::INTEGER INTO v_retained_count
      FROM public.recurring_task_occurrences occurrence
      WHERE occurrence.series_id = p_series_id
        AND occurrence.state <> 'withdrawn';
      IF v_series.occurrence_limit IS NOT NULL
         AND v_retained_count >= v_series.occurrence_limit THEN
        UPDATE public.recurring_task_series
        SET status = 'ended', updated_at = NOW()
        WHERE id = p_series_id;
        EXIT;
      END IF;
      IF v_series.last_scheduled_date IS NOT NULL
         AND v_date > v_series.last_scheduled_date THEN
        UPDATE public.recurring_task_series
        SET status = 'ended', updated_at = NOW()
        WHERE id = p_series_id;
        EXIT;
      END IF;

      v_task_id := gen_random_uuid();
      v_occurrence_id := gen_random_uuid();
      SELECT COALESCE(MAX(task.sort_order), 0) + 65536.0
      INTO v_sort_order
      FROM public.tasks task
      WHERE task.user_id = v_series.user_id;

      INSERT INTO public.tasks(
        id, user_id, title, description, is_completed, priority,
        due_date, due_time, status, section, sort_order,
        recurring_task_id, is_exception, original_date,
        recurring_series_id, recurring_occurrence_id, scheduled_date,
        recurrence_occurrence_state, occurrence_overrides
      )
      VALUES (
        v_task_id,
        v_series.user_id,
        COALESCE(v_revision.defaults->>'title', ''),
        v_revision.defaults->>'description',
        COALESCE(v_revision.defaults->>'status', 'todo') = 'done',
        COALESCE((v_revision.defaults->>'priority')::INTEGER, 0),
        v_date,
        (v_revision.defaults->>'dueTime')::TIME,
        COALESCE(v_revision.defaults->>'status', 'todo'),
        COALESCE(v_revision.defaults->>'section', 'personal'),
        COALESCE((v_revision.defaults->>'sortOrder')::DOUBLE PRECISION, v_sort_order),
        CASE WHEN EXISTS (
          SELECT 1 FROM public.recurring_tasks legacy
          WHERE legacy.id = p_series_id
        ) THEN p_series_id ELSE NULL END,
        false,
        v_date,
        p_series_id,
        v_occurrence_id,
        v_date,
        'open',
        '{}'::JSONB
      );

      INSERT INTO public.recurring_task_occurrences(
        id, series_id, revision_id, scheduled_date, due_date, details,
        state, overrides, task_id
      ) VALUES (
        v_occurrence_id,
        p_series_id,
        v_revision.id,
        v_date,
        v_date,
        v_revision.defaults,
        'open',
        '{}'::JSONB,
        v_task_id
      );
    END LOOP;
  END LOOP;

  FOR v_occurrence IN
    SELECT occurrence.*
    FROM public.recurring_task_occurrences occurrence
    WHERE occurrence.series_id = p_series_id
      AND occurrence.state = 'open'
      AND occurrence.scheduled_date BETWEEN p_from AND p_to
    FOR UPDATE
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.recurring_task_series_revisions revision
      WHERE revision.series_id = p_series_id
        AND revision.state = 'active'
        AND revision.effective_from <= v_occurrence.scheduled_date
        AND (
          revision.effective_to IS NULL
          OR v_occurrence.scheduled_date < revision.effective_to
        )
        AND (
          v_series.last_scheduled_date IS NULL
          OR v_occurrence.scheduled_date <= v_series.last_scheduled_date
        )
        AND EXISTS (
          SELECT 1
          FROM public.recurring_task_scheduled_dates(
            revision.recurrence_rule,
            revision.recurrence_anchor,
            revision.activation_date,
            v_occurrence.scheduled_date,
            v_occurrence.scheduled_date
          ) dates
          WHERE dates.scheduled_date = v_occurrence.scheduled_date
        )
    ) INTO v_has_active_schedule;

    IF NOT v_has_active_schedule THEN
      UPDATE public.recurring_task_occurrences
      SET state = CASE
            WHEN v_occurrence.overrides <> '{}'::JSONB THEN 'extra'
            ELSE 'withdrawn'
          END,
          updated_at = NOW()
      WHERE id = v_occurrence.id;
      UPDATE public.tasks
      SET recurrence_occurrence_state = CASE
            WHEN v_occurrence.overrides <> '{}'::JSONB THEN 'extra'
            ELSE 'withdrawn'
          END
      WHERE id = v_occurrence.task_id;
    END IF;
  END LOOP;

  SELECT COUNT(*)::INTEGER INTO v_retained_count
  FROM public.recurring_task_occurrences occurrence
  WHERE occurrence.series_id = p_series_id
    AND occurrence.state <> 'withdrawn';

  UPDATE public.recurring_task_series
  SET coverage_horizon = CASE
        WHEN coverage_horizon IS NULL OR p_to > coverage_horizon THEN p_to
        ELSE coverage_horizon
      END,
      status = CASE
        WHEN occurrence_limit IS NOT NULL
          AND v_retained_count >= occurrence_limit THEN 'ended'
        WHEN status = 'active'
          AND last_scheduled_date IS NOT NULL
          AND p_to >= last_scheduled_date THEN 'ended'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_series_id;
END;
$function$;

GRANT SELECT ON TABLE
  public.recurring_task_series,
  public.recurring_task_series_revisions,
  public.recurring_task_occurrences,
  public.recurring_task_intentional_absences
  TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.recurring_task_series,
  public.recurring_task_series_revisions,
  public.recurring_task_occurrences,
  public.recurring_task_intentional_absences,
  public.recurring_task_idempotency
  FROM anon, authenticated;

CREATE TRIGGER recurring_task_series_updated_at
  BEFORE UPDATE ON public.recurring_task_series
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER recurring_task_occurrences_updated_at
  BEFORE UPDATE ON public.recurring_task_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON FUNCTION public.recurring_task_lifecycle(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurring_task_lifecycle(TEXT, JSONB)
  TO authenticated, service_role;

-- Materialization is an internal SECURITY DEFINER helper. Callers must use
-- the ownership-checked lifecycle RPC rather than invoking it directly.
REVOKE ALL ON FUNCTION public.recurring_task_materialize_locked(UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.recurring_task_scheduled_dates(JSONB, DATE, DATE, DATE, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurring_task_scheduled_dates(JSONB, DATE, DATE, DATE, DATE)
  TO authenticated, service_role;
