-- Centralize Reminder Delivery state transitions behind one storage adapter.
-- Reminder Configuration remains owned by Calendar, Task, and Habit lifecycles.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'betterr_reminder_delivery'
  ) THEN
    CREATE ROLE betterr_reminder_delivery
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'betterr_reminder_delivery'
      AND (
        rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'Existing Reminder Delivery owner role has unsafe attributes';
  END IF;
END
$$;

GRANT betterr_reminder_delivery TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO betterr_reminder_delivery;
GRANT SELECT, UPDATE ON TABLE public.reminders TO betterr_reminder_delivery;

-- Authenticated callers may read delivery records, but cannot mutate either
-- delivery state or source-owned configuration columns directly. The source
-- lifecycle RPCs retain their own definer roles and table privileges.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.reminders FROM PUBLIC, authenticated;
DROP POLICY IF EXISTS "Users can create own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users create own non-calendar reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users update own non-calendar reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users delete own non-calendar reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users create own Habit reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users delete own Habit reminders" ON public.reminders;
DROP POLICY IF EXISTS "Reminder Delivery reads owned reminders" ON public.reminders;
DROP POLICY IF EXISTS "Reminder Delivery updates owned reminders" ON public.reminders;

CREATE POLICY "Reminder Delivery reads owned reminders"
  ON public.reminders FOR SELECT TO betterr_reminder_delivery
  USING (
    user_id = COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
    OR NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'role' = 'service_role'
    OR current_setting('role', true) = 'service_role'
  );

CREATE POLICY "Reminder Delivery updates owned reminders"
  ON public.reminders FOR UPDATE TO betterr_reminder_delivery
  USING (
    user_id = COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
    OR NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'role' = 'service_role'
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    user_id = COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
    OR NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'role' = 'service_role'
    OR current_setting('role', true) = 'service_role'
  );

CREATE OR REPLACE FUNCTION public.transition_reminder_delivery(
  p_user_id UUID,
  p_reminder_id UUID,
  p_context TEXT,
  p_transition TEXT,
  p_fire_at TIMESTAMPTZ DEFAULT NULL,
  p_sent_at TIMESTAMPTZ DEFAULT NULL,
  p_expected_status TEXT DEFAULT NULL,
  p_expected_fire_at TIMESTAMPTZ DEFAULT NULL,
  p_expected_sent_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id UUID;
  current_reminder public.reminders;
  transitioned public.reminders;
  is_unsupported BOOLEAN;
BEGIN
  IF p_context NOT IN ('user', 'operational') THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'action', COALESCE(p_transition, 'unknown'),
      'reason', 'Reminder Delivery context is invalid'
    );
  END IF;

  IF p_user_id IS NULL OR p_reminder_id IS NULL THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  actor_id := COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
  )::UUID;

  IF p_context = 'user' AND actor_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF p_context = 'operational'
    AND current_setting('role', true) IS DISTINCT FROM 'service_role'
    AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
    AND NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'role'
      IS DISTINCT FROM 'service_role'
  THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'action', COALESCE(p_transition, 'unknown'),
      'reason', 'Only the trusted reminder dispatcher may use operational delivery context'
    );
  END IF;

  SELECT *
  INTO current_reminder
  FROM public.reminders
  WHERE id = p_reminder_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF p_expected_status IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'action', COALESCE(p_transition, 'unknown'),
      'reason', 'Reminder Delivery expected state is required',
      'current_status', current_reminder.status
    );
  END IF;

  is_unsupported := current_reminder.source_type NOT IN (
    'calendar_event', 'task', 'habit'
  );

  IF is_unsupported AND p_transition <> 'retire-unsupported-source' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'action', COALESCE(p_transition, 'unknown'),
      'reason', 'Unsupported reminder sources must be retired before delivery',
      'current_status', current_reminder.status
    );
  END IF;

  IF p_transition IN ('failed', 'stale', 'retire-unsupported-source')
    AND p_context <> 'operational'
  THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'action', p_transition,
      'reason', CASE
        WHEN p_transition = 'failed'
          THEN 'Only trusted operational dispatch may record a delivery failure'
        ELSE 'Only trusted operational dispatch may run this delivery transition'
      END,
      'current_status', current_reminder.status
    );
  END IF;

  IF p_transition IN ('snooze', 'legacy-snooze')
    AND p_context <> 'user'
  THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'action', p_transition,
      'reason', 'Operational dispatch cannot author a Reminder Delivery snooze',
      'current_status', current_reminder.status
    );
  END IF;

  -- Idempotency is checked before optimistic expected-state matching. A
  -- retry that observes the target state is successful even if another worker
  -- committed it after the original read.
  IF p_transition = 'snooze'
    AND current_reminder.status = 'pending'
    AND current_reminder.fire_at IS NOT DISTINCT FROM p_fire_at
    AND p_fire_at > clock_timestamp()
    AND current_reminder.sent_at IS NULL
  THEN
    RETURN jsonb_build_object(
      'type', 'already-applied',
      'transition', p_transition,
      'reminder', to_jsonb(current_reminder)
    );
  ELSIF p_transition = 'sent' AND current_reminder.status = 'sent' THEN
    RETURN jsonb_build_object(
      'type', 'already-applied',
      'transition', p_transition,
      'reminder', to_jsonb(current_reminder)
    );
  ELSIF p_transition IN ('failed', 'stale')
    AND current_reminder.status = 'failed'
  THEN
    RETURN jsonb_build_object(
      'type', 'already-applied',
      'transition', p_transition,
      'reminder', to_jsonb(current_reminder)
    );
  ELSIF p_transition = 'retire-unsupported-source'
    AND is_unsupported
    AND current_reminder.status IN ('failed', 'sent')
  THEN
    RETURN jsonb_build_object(
      'type', 'already-applied',
      'transition', p_transition,
      'reminder', to_jsonb(current_reminder)
    );
  ELSIF p_transition = 'legacy-snooze'
    AND current_reminder.status = 'snoozed'
  THEN
    RETURN jsonb_build_object(
      'type', 'already-applied',
      'transition', p_transition,
      'reminder', to_jsonb(current_reminder)
    );
  END IF;

  IF p_expected_status IS NOT NULL AND (
    current_reminder.status IS DISTINCT FROM p_expected_status
    OR current_reminder.fire_at IS DISTINCT FROM p_expected_fire_at
    OR current_reminder.sent_at IS DISTINCT FROM p_expected_sent_at
  ) THEN
    RETURN jsonb_build_object(
      'type', 'conflict',
      'reason', 'Reminder Delivery changed before this transition was applied'
    );
  END IF;

  IF p_transition = 'snooze' THEN
    IF p_context <> 'user' THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Operational dispatch cannot author a Reminder Delivery snooze',
        'current_status', current_reminder.status
      );
    END IF;
    IF current_reminder.status <> 'pending'
      OR p_fire_at IS NULL
      OR p_sent_at IS NOT NULL
      OR p_fire_at <= clock_timestamp()
    THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Only pending reminders can be snoozed to a future datetime',
        'current_status', current_reminder.status
      );
    END IF;
    UPDATE public.reminders
    SET status = 'pending', fire_at = p_fire_at, sent_at = NULL
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;

  ELSIF p_transition = 'legacy-snooze' THEN
    IF p_context <> 'user' THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Operational dispatch cannot author a Reminder Delivery snooze',
        'current_status', current_reminder.status
      );
    END IF;
    IF current_reminder.status <> 'pending'
      OR p_fire_at IS DISTINCT FROM current_reminder.fire_at
      OR p_sent_at IS NOT NULL
    THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Only pending reminders can become legacy snoozed',
        'current_status', current_reminder.status
      );
    END IF;
    UPDATE public.reminders
    SET status = 'snoozed', sent_at = NULL
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;

  ELSIF p_transition = 'sent' THEN
    IF current_reminder.status <> 'pending'
      OR (p_fire_at IS NOT NULL AND p_fire_at IS DISTINCT FROM current_reminder.fire_at)
      OR p_sent_at IS NULL
    THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Only pending reminders can be marked sent',
        'current_status', current_reminder.status
      );
    END IF;
    UPDATE public.reminders
    SET status = 'sent', sent_at = p_sent_at
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;

  ELSIF p_transition = 'failed' THEN
    IF p_context <> 'operational' THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Only trusted operational dispatch may record a delivery failure',
        'current_status', current_reminder.status
      );
    END IF;
    IF current_reminder.status <> 'pending'
      OR (p_fire_at IS NOT NULL AND p_fire_at IS DISTINCT FROM current_reminder.fire_at)
      OR p_sent_at IS NOT NULL
    THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Only pending reminders can be marked failed',
        'current_status', current_reminder.status
      );
    END IF;
    UPDATE public.reminders
    SET status = 'failed', sent_at = NULL
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;

  ELSIF p_transition = 'stale' THEN
    IF p_context <> 'operational' THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Only trusted operational dispatch may run this delivery transition',
        'current_status', current_reminder.status
      );
    END IF;
    IF current_reminder.status <> 'pending'
      OR (p_fire_at IS NOT NULL AND p_fire_at IS DISTINCT FROM current_reminder.fire_at)
      OR p_sent_at IS NOT NULL
      OR current_reminder.fire_at > clock_timestamp() - INTERVAL '4 hours'
    THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Reminder has not exceeded the stale delivery retry horizon',
        'current_status', current_reminder.status
      );
    END IF;
    UPDATE public.reminders
    SET status = 'failed', sent_at = NULL
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;

  ELSIF p_transition = 'retire-unsupported-source' THEN
    IF p_context <> 'operational' THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Only trusted operational dispatch may run this delivery transition',
        'current_status', current_reminder.status
      );
    END IF;
    IF NOT is_unsupported OR current_reminder.status <> 'pending' THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'action', p_transition,
        'reason', 'Only pending unsupported Reminder sources can be retired',
        'current_status', current_reminder.status
      );
    END IF;
    UPDATE public.reminders
    SET status = 'failed', sent_at = NULL
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;

  ELSE
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'action', COALESCE(p_transition, 'unknown'),
      'reason', 'Unsupported Reminder Delivery transition',
      'current_status', current_reminder.status
    );
  END IF;

  RETURN jsonb_build_object(
    'type', 'transitioned',
    'transition', p_transition,
    'reminder', to_jsonb(transitioned)
  );
END;
$$;

ALTER FUNCTION public.transition_reminder_delivery(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
)
  OWNER TO betterr_reminder_delivery;
ALTER FUNCTION public.transition_reminder_delivery(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
)
  SECURITY DEFINER;
ALTER FUNCTION public.transition_reminder_delivery(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
)
  SET search_path = pg_catalog, public;
REVOKE CREATE ON SCHEMA public FROM betterr_reminder_delivery;
REVOKE ALL ON FUNCTION public.transition_reminder_delivery(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_reminder_delivery(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated, service_role;

COMMENT ON FUNCTION public.transition_reminder_delivery(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Shared Reminder Delivery state machine; source configuration remains owned by its lifecycle boundary.';
