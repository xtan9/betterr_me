-- Create a calendar event and its optional reminder as one atomic lifecycle.

CREATE OR REPLACE FUNCTION public.create_calendar_event_with_reminder(
  p_user_id UUID,
  p_event JSONB,
  p_reminders JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  created_event public.calendar_events;
  created_reminder public.reminders;
  requested_reminder JSONB;
  created_reminders JSONB := '[]'::JSONB;
  event_start TIMESTAMPTZ;
  reminder_fire_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot create a schedule for another user';
  END IF;

  INSERT INTO public.calendar_events (
    user_id,
    title,
    description,
    start_date,
    start_time,
    end_date,
    end_time,
    location,
    color,
    category_id,
    is_recurring,
    recurrence_rule,
    end_type,
    end_date_recurrence,
    end_count,
    recurring_event_id,
    original_date,
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
        (
          created_event.start_date +
          COALESCE(created_event.start_time, TIME '00:00:00')
        )
        AT TIME ZONE COALESCE(profiles.timezone, 'UTC')
      INTO event_start
      FROM public.profiles
      WHERE profiles.id = p_user_id;

      reminder_fire_at :=
        event_start - ((requested_reminder->>'relative_minutes')::INTEGER * INTERVAL '1 minute');
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

REVOKE ALL ON TABLE public.calendar_events, public.reminders
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.calendar_events, public.reminders
  TO authenticated;

-- Relative reminders need the caller's timezone. Column-level access keeps the
-- existing own-profile RLS policy authoritative without exposing other profile
-- fields or elevating the lifecycle function.
GRANT SELECT (id, timezone) ON TABLE public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_calendar_event_with_reminder(UUID, JSONB, JSONB)
  TO authenticated;
