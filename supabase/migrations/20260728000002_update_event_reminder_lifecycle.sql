-- Reconcile a calendar event and its reminder intent in one transaction.

CREATE OR REPLACE FUNCTION public.update_calendar_event_with_reminders(
  p_user_id UUID,
  p_event_id UUID,
  p_event JSONB,
  p_reminders JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_event public.calendar_events;
  updated_event public.calendar_events;
  created_reminder public.reminders;
  requested_reminder JSONB;
  reconciled_reminders JSONB := '[]'::JSONB;
  event_start TIMESTAMPTZ;
  reminder_fire_at TIMESTAMPTZ;
  existing_intent JSONB;
  requested_intent JSONB;
  should_recalculate BOOLEAN := false;
BEGIN
  IF COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
  )::UUID IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot update a schedule for another user';
  END IF;

  SELECT *
  INTO current_event
  FROM public.calendar_events
  WHERE id = p_event_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NO_DATA_FOUND;
  END IF;

  UPDATE public.calendar_events
  SET
    title = CASE WHEN p_event ? 'title'
      THEN p_event->>'title' ELSE current_event.title END,
    description = CASE WHEN p_event ? 'description'
      THEN p_event->>'description' ELSE current_event.description END,
    start_date = CASE WHEN p_event ? 'start_date'
      THEN (p_event->>'start_date')::DATE ELSE current_event.start_date END,
    start_time = CASE WHEN p_event ? 'start_time'
      THEN (p_event->>'start_time')::TIME ELSE current_event.start_time END,
    end_date = CASE WHEN p_event ? 'end_date'
      THEN (p_event->>'end_date')::DATE ELSE current_event.end_date END,
    end_time = CASE WHEN p_event ? 'end_time'
      THEN (p_event->>'end_time')::TIME ELSE current_event.end_time END,
    location = CASE WHEN p_event ? 'location'
      THEN p_event->>'location' ELSE current_event.location END,
    color = CASE WHEN p_event ? 'color'
      THEN p_event->>'color' ELSE current_event.color END,
    category_id = CASE WHEN p_event ? 'category_id'
      THEN (p_event->>'category_id')::UUID ELSE current_event.category_id END,
    is_recurring = CASE WHEN p_event ? 'is_recurring'
      THEN (p_event->>'is_recurring')::BOOLEAN ELSE current_event.is_recurring END,
    recurrence_rule = CASE WHEN p_event ? 'recurrence_rule'
      THEN NULLIF(p_event->'recurrence_rule', 'null'::JSONB)
      ELSE current_event.recurrence_rule END,
    end_type = CASE WHEN p_event ? 'end_type'
      THEN p_event->>'end_type' ELSE current_event.end_type END,
    end_date_recurrence = CASE WHEN p_event ? 'end_date_recurrence'
      THEN (p_event->>'end_date_recurrence')::DATE
      ELSE current_event.end_date_recurrence END,
    end_count = CASE WHEN p_event ? 'end_count'
      THEN (p_event->>'end_count')::INTEGER ELSE current_event.end_count END
  WHERE id = p_event_id
    AND user_id = p_user_id
  RETURNING * INTO updated_event;

  SELECT
    (
      updated_event.start_date +
      COALESCE(updated_event.start_time, TIME '00:00:00')
    )
    AT TIME ZONE COALESCE(profiles.timezone, 'UTC')
  INTO event_start
  FROM public.profiles
  WHERE profiles.id = p_user_id;

  IF p_reminders IS NULL THEN
    -- Existing intent is stable unless a moved event changes the derived time.
    should_recalculate := p_event ? 'start_date' OR p_event ? 'start_time';
  ELSE
    SELECT COALESCE(
      jsonb_agg(intent ORDER BY intent::TEXT),
      '[]'::JSONB
    )
    INTO existing_intent
    FROM (
      SELECT jsonb_build_object(
        'reminder_type', reminder_type,
        'relative_minutes', CASE WHEN reminder_type = 'relative'
          THEN relative_minutes ELSE NULL END,
        'absolute_time', CASE WHEN reminder_type = 'absolute'
          THEN absolute_time ELSE NULL END,
        'channels', ARRAY(
          SELECT DISTINCT channel.value
          FROM unnest(channels) AS channel(value)
          ORDER BY channel.value
        )
      ) AS intent
      FROM public.reminders
      WHERE user_id = p_user_id
        AND source_type = 'calendar_event'
        AND source_id = p_event_id
        AND status = 'pending'
    ) existing;

    SELECT COALESCE(
      jsonb_agg(intent ORDER BY intent::TEXT),
      '[]'::JSONB
    )
    INTO requested_intent
    FROM (
      SELECT DISTINCT jsonb_build_object(
        'reminder_type', value->>'reminder_type',
        'relative_minutes', CASE WHEN value->>'reminder_type' = 'relative'
          THEN (value->>'relative_minutes')::INTEGER ELSE NULL END,
        'absolute_time', CASE WHEN value->>'reminder_type' = 'absolute'
          THEN (value->>'absolute_time')::TIMESTAMPTZ ELSE NULL END,
        'channels', ARRAY(
          SELECT DISTINCT channel
          FROM jsonb_array_elements_text(value->'channels') AS channel
          ORDER BY channel
        )
      ) AS intent
      FROM jsonb_array_elements(p_reminders)
    ) requested;

    -- An unchanged collection keeps the same reminder records. A moved event
    -- only changes the schedule derived from its relative intent.
    IF existing_intent = requested_intent THEN
      should_recalculate := p_event ? 'start_date' OR p_event ? 'start_time';
    ELSE
      -- The supplied collection is the complete desired pending intent.
      -- Delivery history remains terminal and cannot be scheduled a second time.
      DELETE FROM public.reminders
      WHERE user_id = p_user_id
        AND source_type = 'calendar_event'
        AND source_id = p_event_id
        AND status = 'pending';

      FOR requested_reminder IN
        SELECT value
        FROM jsonb_array_elements(requested_intent)
      LOOP
        IF requested_reminder->>'reminder_type' = 'relative' THEN
          reminder_fire_at :=
            event_start -
            ((requested_reminder->>'relative_minutes')::INTEGER * INTERVAL '1 minute');
        ELSIF requested_reminder->>'reminder_type' = 'absolute' THEN
          reminder_fire_at := (requested_reminder->>'absolute_time')::TIMESTAMPTZ;
        ELSE
          RAISE EXCEPTION 'Unsupported reminder type';
        END IF;

        INSERT INTO public.reminders (
          user_id,
          source_type,
          source_id,
          reminder_type,
          relative_minutes,
          absolute_time,
          channels,
          fire_at
        )
        VALUES (
          p_user_id,
          'calendar_event',
          p_event_id,
          requested_reminder->>'reminder_type',
          (requested_reminder->>'relative_minutes')::INTEGER,
          (requested_reminder->>'absolute_time')::TIMESTAMPTZ,
          ARRAY(SELECT jsonb_array_elements_text(requested_reminder->'channels')),
          reminder_fire_at
        )
        RETURNING * INTO created_reminder;
      END LOOP;
    END IF;
  END IF;

  IF should_recalculate THEN
    UPDATE public.reminders
    SET fire_at =
      event_start - (relative_minutes * INTERVAL '1 minute')
    WHERE user_id = p_user_id
      AND source_type = 'calendar_event'
      AND source_id = p_event_id
      AND status = 'pending'
      AND reminder_type = 'relative'
      AND relative_minutes IS NOT NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(reminders) ORDER BY created_at), '[]'::JSONB)
  INTO reconciled_reminders
  FROM public.reminders
  WHERE user_id = p_user_id
    AND source_type = 'calendar_event'
    AND source_id = p_event_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'event', to_jsonb(updated_event),
    'reminders', reconciled_reminders
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_calendar_event_with_reminders(
  UUID,
  UUID,
  JSONB,
  JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_calendar_event_with_reminders(
  UUID,
  UUID,
  JSONB,
  JSONB
) TO authenticated;
