-- Make calendar-event reminder intent writable only through narrow lifecycle
-- functions. Delivery-only dismiss/snooze transitions use a separate RPC.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'betterr_calendar_lifecycle') THEN
    CREATE ROLE betterr_calendar_lifecycle
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'betterr_calendar_lifecycle'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Existing lifecycle role has unsafe attributes';
  END IF;
END
$$;
GRANT betterr_calendar_lifecycle TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO betterr_calendar_lifecycle;
GRANT SELECT, INSERT, UPDATE ON TABLE public.calendar_events TO betterr_calendar_lifecycle;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminders TO betterr_calendar_lifecycle;
GRANT SELECT (id, timezone) ON TABLE public.profiles TO betterr_calendar_lifecycle;

-- This create RPC shipped before the controller role. Re-declare its complete
-- body so already-migrated databases receive the claim lookup that does not
-- depend on private auth-schema privileges.
CREATE OR REPLACE FUNCTION public.create_calendar_event_with_reminder(
  p_user_id UUID,
  p_event JSONB,
  p_reminders JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  created_event public.calendar_events;
  created_reminder public.reminders;
  requested_reminder JSONB;
  created_reminders JSONB := '[]'::JSONB;
  event_start TIMESTAMPTZ;
  reminder_fire_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
  )::UUID IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot create a schedule for another user';
  END IF;

  INSERT INTO public.calendar_events (
    user_id, title, description, start_date, start_time, end_date, end_time,
    location, color, category_id, is_recurring, recurrence_rule, end_type,
    end_date_recurrence, end_count, recurring_event_id, original_date,
    is_exception
  )
  VALUES (
    p_user_id,
    p_event->>'title',
    p_event->>'description',
    (p_event->>'start_date')::DATE,
    (p_event->>'start_time')::TIME,
    (p_event->>'end_date')::DATE,
    (p_event->>'end_time')::TIME,
    p_event->>'location',
    p_event->>'color',
    (p_event->>'category_id')::UUID,
    COALESCE((p_event->>'is_recurring')::BOOLEAN, false),
    NULLIF(p_event->'recurrence_rule', 'null'::JSONB),
    p_event->>'end_type',
    (p_event->>'end_date_recurrence')::DATE,
    (p_event->>'end_count')::INTEGER,
    (p_event->>'recurring_event_id')::UUID,
    (p_event->>'original_date')::DATE,
    COALESCE((p_event->>'is_exception')::BOOLEAN, false)
  )
  RETURNING * INTO created_event;

  FOR requested_reminder IN
    SELECT value FROM jsonb_array_elements(p_reminders)
  LOOP
    IF requested_reminder->>'reminder_type' = 'relative' THEN
      SELECT
        (created_event.start_date + COALESCE(created_event.start_time, TIME '00:00:00'))
          AT TIME ZONE COALESCE(profiles.timezone, 'UTC')
      INTO event_start
      FROM public.profiles
      WHERE profiles.id = p_user_id;

      reminder_fire_at := event_start
        - ((requested_reminder->>'relative_minutes')::INTEGER * INTERVAL '1 minute');
    ELSIF requested_reminder->>'reminder_type' = 'absolute' THEN
      reminder_fire_at := (requested_reminder->>'absolute_time')::TIMESTAMPTZ;
    ELSE
      RAISE EXCEPTION 'Unsupported reminder type';
    END IF;

    INSERT INTO public.reminders (
      user_id, source_type, source_id, reminder_type, relative_minutes,
      absolute_time, channels, fire_at
    )
    VALUES (
      p_user_id,
      'calendar_event',
      created_event.id,
      requested_reminder->>'reminder_type',
      (requested_reminder->>'relative_minutes')::INTEGER,
      (requested_reminder->>'absolute_time')::TIMESTAMPTZ,
      ARRAY(SELECT jsonb_array_elements_text(requested_reminder->'channels')),
      reminder_fire_at
    )
    RETURNING * INTO created_reminder;
    created_reminders := created_reminders || jsonb_build_array(to_jsonb(created_reminder));
  END LOOP;

  RETURN jsonb_build_object(
    'event', to_jsonb(created_event),
    'reminders', created_reminders
  );
END;
$$;

ALTER FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  SECURITY DEFINER;
ALTER FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  OWNER TO betterr_calendar_lifecycle;

ALTER FUNCTION public.update_calendar_event_with_reminders(UUID, UUID, JSONB, JSONB)
  SECURITY DEFINER;
ALTER FUNCTION public.update_calendar_event_with_reminders(UUID, UUID, JSONB, JSONB)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_calendar_event_with_reminders(UUID, UUID, JSONB, JSONB)
  OWNER TO betterr_calendar_lifecycle;

REVOKE UPDATE ON TABLE public.calendar_events FROM authenticated;

DROP POLICY IF EXISTS "Users can update own calendar_events" ON public.calendar_events;
CREATE POLICY "Lifecycle updates owned calendar events"
  ON public.calendar_events FOR UPDATE TO betterr_calendar_lifecycle
  USING (COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub')::UUID = user_id)
  WITH CHECK (COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub')::UUID = user_id);

DROP POLICY IF EXISTS "Users can create own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;

CREATE POLICY "Users create own non-calendar reminders"
  ON public.reminders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND source_type <> 'calendar_event');
CREATE POLICY "Users update own non-calendar reminders"
  ON public.reminders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND source_type <> 'calendar_event')
  WITH CHECK (auth.uid() = user_id AND source_type <> 'calendar_event');
CREATE POLICY "Users delete own non-calendar reminders"
  ON public.reminders FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND source_type <> 'calendar_event');

CREATE POLICY "Lifecycle creates owned reminders"
  ON public.reminders FOR INSERT TO betterr_calendar_lifecycle
  WITH CHECK (COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub')::UUID = user_id AND source_type = 'calendar_event');
CREATE POLICY "Lifecycle updates owned reminders"
  ON public.reminders FOR UPDATE TO betterr_calendar_lifecycle
  USING (COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub')::UUID = user_id AND source_type = 'calendar_event')
  WITH CHECK (COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub')::UUID = user_id AND source_type = 'calendar_event');
CREATE POLICY "Lifecycle deletes owned reminders"
  ON public.reminders FOR DELETE TO betterr_calendar_lifecycle
  USING (COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub')::UUID = user_id AND source_type = 'calendar_event');

CREATE OR REPLACE FUNCTION public.transition_calendar_event_reminder(
  p_user_id UUID,
  p_reminder_id UUID,
  p_status TEXT,
  p_fire_at TIMESTAMPTZ DEFAULT NULL,
  p_sent_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.reminders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  reminder_source_id UUID;
  current_status TEXT;
  transitioned public.reminders;
BEGIN
  IF COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
  )::UUID IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot transition a reminder for another user';
  END IF;

  SELECT source_id INTO reminder_source_id
  FROM public.reminders
  WHERE id = p_reminder_id
    AND user_id = p_user_id
    AND source_type = 'calendar_event';

  IF NOT FOUND THEN
    RAISE NO_DATA_FOUND;
  END IF;

  PERFORM 1
  FROM public.calendar_events
  WHERE id = reminder_source_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NO_DATA_FOUND;
  END IF;

  SELECT status INTO current_status
  FROM public.reminders
  WHERE id = p_reminder_id
    AND user_id = p_user_id
    AND source_type = 'calendar_event'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NO_DATA_FOUND;
  END IF;

  IF current_status IN ('sent', 'failed') THEN
    IF p_status = current_status AND p_fire_at IS NULL THEN
      SELECT * INTO transitioned
      FROM public.reminders
      WHERE id = p_reminder_id AND user_id = p_user_id;
      RETURN transitioned;
    END IF;
    RAISE EXCEPTION 'Terminal calendar reminders cannot be transitioned';
  END IF;

  IF current_status = 'snoozed' THEN
    IF p_status = 'snoozed' AND p_fire_at IS NULL AND p_sent_at IS NULL THEN
      SELECT * INTO transitioned
      FROM public.reminders
      WHERE id = p_reminder_id AND user_id = p_user_id;
      RETURN transitioned;
    END IF;
    RAISE EXCEPTION 'Inactive snoozed calendar reminders cannot be transitioned';
  END IF;

  IF p_status = 'pending' THEN
    IF p_fire_at IS NULL OR p_sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'Snooze requires fire_at and cannot set sent_at';
    END IF;
    UPDATE public.reminders
    SET status = 'pending', fire_at = p_fire_at, sent_at = NULL
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;
  ELSIF p_status = 'snoozed' THEN
    IF p_fire_at IS NOT NULL OR p_sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy snooze cannot change delivery timestamps';
    END IF;
    UPDATE public.reminders
    SET status = 'snoozed'
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;
  ELSIF p_status IN ('sent', 'failed') THEN
    IF p_fire_at IS NOT NULL THEN
      RAISE EXCEPTION 'Terminal transitions cannot change fire_at';
    END IF;
    UPDATE public.reminders
    SET status = p_status, sent_at = p_sent_at
    WHERE id = p_reminder_id AND user_id = p_user_id
    RETURNING * INTO transitioned;
  ELSE
    RAISE EXCEPTION 'Unsupported calendar reminder transition';
  END IF;

  RETURN transitioned;
END;
$$;

ALTER FUNCTION public.transition_calendar_event_reminder(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  OWNER TO betterr_calendar_lifecycle;
REVOKE CREATE ON SCHEMA public FROM betterr_calendar_lifecycle;
REVOKE ALL ON FUNCTION public.transition_calendar_event_reminder(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_calendar_event_reminder(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_calendar_event_with_reminders(UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_calendar_event_with_reminders(UUID, UUID, JSONB, JSONB) TO authenticated;
