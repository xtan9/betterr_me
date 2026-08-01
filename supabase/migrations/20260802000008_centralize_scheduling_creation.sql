-- Complete the scheduling creation boundary. The RPC remains the only
-- calendar-event/reminder configuration write and returns expected domain
-- outcomes before it performs any mutation.

GRANT SELECT (id, user_id) ON TABLE public.categories
  TO betterr_calendar_lifecycle;

CREATE OR REPLACE FUNCTION public.create_calendar_event_with_reminder(
  p_user_id UUID,
  p_event JSONB,
  p_reminders JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id UUID;
  created_event public.calendar_events;
  created_reminder public.reminders;
  requested_reminder JSONB;
  normalized_reminder JSONB;
  normalized_channels JSONB;
  requested_intents JSONB[] := ARRAY[]::JSONB[];
  event_start TIMESTAMPTZ;
  reminder_fire_at TIMESTAMPTZ;
  requested_category_id UUID;
  requested_recurring_event_id UUID;
  is_recurring BOOLEAN := COALESCE((p_event->>'is_recurring')::BOOLEAN, false);
  is_exception BOOLEAN := COALESCE((p_event->>'is_exception')::BOOLEAN, false);
  recurrence_rule JSONB := NULLIF(p_event->'recurrence_rule', 'null'::JSONB);
  end_type_value TEXT := p_event->>'end_type';
  end_count_value INTEGER;
  reminder_count INTEGER := 0;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    actor_id := COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID;
    IF actor_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Cannot create a schedule for another user';
    END IF;
  END IF;

  IF jsonb_typeof(p_event) <> 'object' THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'event',
      'message', 'Event details are required'
    );
  END IF;
  IF p_event->>'title' IS NULL OR btrim(p_event->>'title') = '' THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'title',
      'message', 'Title is required'
    );
  END IF;
  IF p_event->>'start_date' IS NULL OR p_event->>'end_date' IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'startDate',
      'message', 'Start and end dates are required'
    );
  END IF;
  IF p_event->>'end_date' < p_event->>'start_date' THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'endDate',
      'message', 'endDate must be on or after startDate'
    );
  END IF;
  IF p_event->>'start_time' IS NULL AND p_event->>'end_time' IS NOT NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'endTime',
      'message', 'endTime cannot be set for an all-day event'
    );
  END IF;

  IF p_event->>'category_id' IS NOT NULL THEN
    BEGIN
      requested_category_id := (p_event->>'category_id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'categoryId',
        'message', 'categoryId is invalid'
      );
    END;
    IF NOT EXISTS (
      SELECT 1
      FROM public.categories
      WHERE categories.id = requested_category_id
        AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object(
        'type', 'not-found',
        'related', 'category'
      );
    END IF;
  END IF;

  IF p_event->>'recurring_event_id' IS NOT NULL THEN
    BEGIN
      requested_recurring_event_id := (p_event->>'recurring_event_id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'recurringEventId',
        'message', 'recurringEventId is invalid'
      );
    END;
    IF NOT EXISTS (
      SELECT 1
      FROM public.calendar_events
      WHERE calendar_events.id = requested_recurring_event_id
        AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object(
        'type', 'not-found',
        'related', 'recurringEvent'
      );
    END IF;
    IF p_event->>'original_date' IS NULL THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'originalDate',
        'message', 'originalDate is required for an exception'
      );
    END IF;
  END IF;
  IF is_exception AND requested_recurring_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'recurringEventId',
      'message', 'recurringEventId is required for an exception'
    );
  END IF;

  IF is_recurring AND recurrence_rule IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'recurrenceRule',
      'message', 'recurrenceRule is required for recurring events'
    );
  END IF;
  IF NOT is_recurring AND recurrence_rule IS NOT NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'recurrenceRule',
      'message', 'recurrenceRule requires isRecurring'
    );
  END IF;
  IF recurrence_rule IS NOT NULL THEN
    IF jsonb_typeof(recurrence_rule) <> 'object'
      OR recurrence_rule->>'frequency' NOT IN ('daily', 'weekly', 'monthly', 'yearly')
      OR COALESCE(recurrence_rule->>'interval', '') !~ '^[0-9]+$'
      OR (recurrence_rule->>'interval')::INTEGER NOT BETWEEN 1 AND 365 THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'recurrenceRule',
        'message', 'recurrenceRule is invalid'
      );
    END IF;
    IF recurrence_rule->>'frequency' = 'weekly' AND (
      jsonb_typeof(recurrence_rule->'days_of_week') <> 'array'
      OR jsonb_array_length(recurrence_rule->'days_of_week') = 0
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(recurrence_rule->'days_of_week') AS day
        WHERE day.value::TEXT !~ '^[0-6]$'
      )
    ) THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'recurrenceRule',
        'message', 'days_of_week is invalid'
      );
    END IF;
    IF recurrence_rule->>'frequency' = 'monthly' AND NOT (
      (
        COALESCE(recurrence_rule->>'day_of_month', '') ~ '^[0-9]+$'
        AND (recurrence_rule->>'day_of_month')::INTEGER BETWEEN 1 AND 31
      )
      OR (
        COALESCE(recurrence_rule->>'week_position', '') IN ('first', 'second', 'third', 'fourth', 'last')
        AND COALESCE(recurrence_rule->>'day_of_week_monthly', '') ~ '^[0-6]$'
      )
    ) THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'recurrenceRule',
        'message', 'monthly recurrenceRule is invalid'
      );
    END IF;
    IF recurrence_rule->>'frequency' = 'yearly' AND NOT (
      COALESCE(recurrence_rule->>'month_of_year', '') ~ '^[0-9]+$'
      AND (recurrence_rule->>'month_of_year')::INTEGER BETWEEN 1 AND 12
      AND COALESCE(recurrence_rule->>'day_of_month', '') ~ '^[0-9]+$'
      AND (recurrence_rule->>'day_of_month')::INTEGER BETWEEN 1 AND 31
    ) THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'recurrenceRule',
        'message', 'yearly recurrenceRule is invalid'
      );
    END IF;
  END IF;

  IF end_type_value IS NOT NULL AND end_type_value NOT IN ('never', 'after_count', 'on_date') THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'endType',
      'message', 'endType is invalid'
    );
  END IF;
  IF p_event->>'end_count' IS NOT NULL THEN
    IF p_event->>'end_count' !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'endCount',
        'message', 'endCount is invalid'
      );
    END IF;
    end_count_value := (p_event->>'end_count')::INTEGER;
    IF end_count_value NOT BETWEEN 1 AND 500 THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'endCount',
        'message', 'endCount must be a positive integer'
      );
    END IF;
  END IF;
  IF end_type_value = 'after_count' AND end_count_value IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'endCount',
      'message', 'endCount is required for after_count recurrence'
    );
  END IF;
  IF end_type_value = 'on_date' AND p_event->>'end_date_recurrence' IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'endDateRecurrence',
      'message', 'endDateRecurrence is required for on_date recurrence'
    );
  END IF;
  IF p_event->>'end_date_recurrence' IS NOT NULL
    AND p_event->>'end_date_recurrence' < p_event->>'start_date' THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'endDateRecurrence',
      'message', 'endDateRecurrence must be on or after startDate'
    );
  END IF;

  IF jsonb_typeof(COALESCE(p_reminders, '[]'::JSONB)) <> 'array' THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'reminders',
      'message', 'reminders must be an array'
    );
  END IF;

  -- Validate and canonicalize every requested Reminder Configuration before
  -- inserting the event. Duplicate intent is an expected conflict, not a
  -- partial write or an infrastructure exception.
  FOR requested_reminder IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_reminders, '[]'::JSONB))
  LOOP
    reminder_count := reminder_count + 1;
    IF jsonb_typeof(requested_reminder) <> 'object'
      OR requested_reminder->>'reminder_type' NOT IN ('relative', 'absolute') THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', format('reminders[%s]', reminder_count - 1),
        'message', 'Reminder type is invalid'
      );
    END IF;
    IF jsonb_typeof(requested_reminder->'channels') <> 'array'
      OR jsonb_array_length(requested_reminder->'channels') = 0
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(requested_reminder->'channels') AS channel
        WHERE channel.value NOT IN ('push', 'email')
      )
      OR jsonb_array_length(requested_reminder->'channels') <> (
        SELECT count(DISTINCT channel.value)
        FROM jsonb_array_elements_text(requested_reminder->'channels') AS channel
      ) THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', format('reminders[%s].channels', reminder_count - 1),
        'message', 'Reminder channels are invalid'
      );
    END IF;
    SELECT jsonb_agg(to_jsonb(channel.value) ORDER BY channel.value)
    INTO normalized_channels
    FROM jsonb_array_elements_text(requested_reminder->'channels') AS channel;

    IF requested_reminder->>'reminder_type' = 'relative' THEN
      normalized_reminder := jsonb_build_object(
        'reminder_type', 'relative',
        'relative_minutes', requested_reminder->'relative_minutes',
        'absolute_time', NULL,
        'channels', normalized_channels
      );
    ELSE
      normalized_reminder := jsonb_build_object(
        'reminder_type', 'absolute',
        'relative_minutes', NULL,
        'absolute_time', requested_reminder->'absolute_time',
        'channels', normalized_channels
      );
    END IF;
    IF normalized_reminder = ANY(requested_intents) THEN
      RETURN jsonb_build_object(
        'type', 'conflict',
        'resource', 'reminder',
        'reason', 'Duplicate reminder configuration'
      );
    END IF;
    requested_intents := array_append(requested_intents, normalized_reminder);
  END LOOP;

  INSERT INTO public.calendar_events (
    user_id, title, description, start_date, start_time, end_date, end_time,
    location, color, category_id, is_recurring, recurrence_rule, end_type,
    end_date_recurrence, end_count, recurring_event_id, original_date,
    is_exception
  )
  VALUES (
    p_user_id,
    btrim(p_event->>'title'),
    p_event->>'description',
    (p_event->>'start_date')::DATE,
    (p_event->>'start_time')::TIME,
    (p_event->>'end_date')::DATE,
    (p_event->>'end_time')::TIME,
    p_event->>'location',
    p_event->>'color',
    requested_category_id,
    is_recurring,
    recurrence_rule,
    end_type_value,
    (p_event->>'end_date_recurrence')::DATE,
    end_count_value,
    requested_recurring_event_id,
    (p_event->>'original_date')::DATE,
    is_exception
  )
  RETURNING * INTO created_event;

  SELECT (
    created_event.start_date + COALESCE(created_event.start_time, TIME '00:00:00')
  ) AT TIME ZONE COALESCE(profiles.timezone, 'UTC')
  INTO event_start
  FROM public.profiles
  WHERE profiles.id = p_user_id;

  FOREACH normalized_reminder IN ARRAY requested_intents
  LOOP
    IF normalized_reminder->>'reminder_type' = 'relative' THEN
      reminder_fire_at := event_start
        - ((normalized_reminder->>'relative_minutes')::INTEGER * INTERVAL '1 minute');
    ELSE
      reminder_fire_at := (normalized_reminder->>'absolute_time')::TIMESTAMPTZ;
    END IF;

    INSERT INTO public.reminders (
      user_id, source_type, source_id, reminder_type, relative_minutes,
      absolute_time, channels, fire_at
    )
    VALUES (
      p_user_id,
      'calendar_event',
      created_event.id,
      normalized_reminder->>'reminder_type',
      (normalized_reminder->>'relative_minutes')::INTEGER,
      (normalized_reminder->>'absolute_time')::TIMESTAMPTZ,
      ARRAY(SELECT jsonb_array_elements_text(normalized_reminder->'channels')),
      reminder_fire_at
    )
    RETURNING * INTO created_reminder;
  END LOOP;

  RETURN jsonb_build_object(
    'type', 'created',
    'event', to_jsonb(created_event),
    'reminders', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(reminder) ORDER BY reminder.created_at)
        FROM public.reminders AS reminder
        WHERE reminder.user_id = p_user_id
          AND reminder.source_type = 'calendar_event'
          AND reminder.source_id = created_event.id
      ),
      '[]'::JSONB
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'type', 'conflict',
      'resource', 'reminder'
    );
END;
$$;

ALTER FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  OWNER TO betterr_calendar_lifecycle;
ALTER FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  SECURITY DEFINER;
ALTER FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  TO authenticated, service_role;
