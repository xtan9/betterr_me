-- Make Habit Reminder Configuration a Habit-owned, atomic mutation.
-- Pending intent is reconciled as a complete collection. Terminal delivery
-- history remains owned by Reminder Delivery. The existing Habit source FK
-- keeps ON DELETE CASCADE as a database backstop for source deletion.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'betterr_habit_lifecycle') THEN
    CREATE ROLE betterr_habit_lifecycle
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'betterr_habit_lifecycle'
      AND (
        rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'Existing Habit lifecycle role has unsafe attributes';
  END IF;
END
$$;

GRANT betterr_habit_lifecycle TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO betterr_habit_lifecycle;
GRANT SELECT (id, user_id), UPDATE, DELETE
  ON TABLE public.habits TO betterr_habit_lifecycle;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.reminders TO betterr_habit_lifecycle;

-- Habit configuration is now owned by the Habit lifecycle boundary. Delivery
-- adapters retain authenticated SELECT/UPDATE access, but cannot create or
-- delete configuration rows directly.
DROP POLICY IF EXISTS "Users create own Habit reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users delete own Habit reminders" ON public.reminders;
REVOKE INSERT, DELETE ON TABLE public.reminders FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_direct_habit_reminder_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user <> 'betterr_habit_lifecycle'
    AND current_user <> 'service_role'
    AND (
      OLD.user_id IS DISTINCT FROM NEW.user_id
      OR OLD.source_type IS DISTINCT FROM NEW.source_type
      OR OLD.source_id IS DISTINCT FROM NEW.source_id
      OR OLD.reminder_type IS DISTINCT FROM NEW.reminder_type
      OR OLD.relative_minutes IS DISTINCT FROM NEW.relative_minutes
      OR OLD.absolute_time IS DISTINCT FROM NEW.absolute_time
      OR OLD.channels IS DISTINCT FROM NEW.channels
    )
    AND (OLD.source_type = 'habit' OR NEW.source_type = 'habit')
  THEN
    RAISE EXCEPTION
      'Habit Reminder Configuration must use the Habit lifecycle boundary';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_direct_habit_reminder_configuration
  ON public.reminders;
CREATE TRIGGER prevent_direct_habit_reminder_configuration
  BEFORE UPDATE OF user_id, source_type, source_id, reminder_type,
    relative_minutes, absolute_time, channels
  ON public.reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_habit_reminder_configuration();

CREATE POLICY "Habit lifecycle reads owned habits"
  ON public.habits FOR SELECT TO betterr_habit_lifecycle
  USING (
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Habit lifecycle locks owned habits"
  ON public.habits FOR UPDATE TO betterr_habit_lifecycle
  USING (
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  )
  WITH CHECK (
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Habit lifecycle deletes owned habits"
  ON public.habits FOR DELETE TO betterr_habit_lifecycle
  USING (
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Habit lifecycle reads owned reminders"
  ON public.reminders FOR SELECT TO betterr_habit_lifecycle
  USING (
    source_type = 'habit'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Habit lifecycle creates owned reminders"
  ON public.reminders FOR INSERT TO betterr_habit_lifecycle
  WITH CHECK (
    source_type = 'habit'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Habit lifecycle updates owned reminders"
  ON public.reminders FOR UPDATE TO betterr_habit_lifecycle
  USING (
    source_type = 'habit'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  )
  WITH CHECK (
    source_type = 'habit'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Habit lifecycle deletes owned reminders"
  ON public.reminders FOR DELETE TO betterr_habit_lifecycle
  USING (
    source_type = 'habit'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE OR REPLACE FUNCTION public.configure_habit_reminders(
  p_user_id UUID,
  p_habit_id UUID,
  p_reminders JSONB DEFAULT '[]'::JSONB,
  p_reference_time TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id UUID;
  locked_habit RECORD;
  requested_reminder JSONB;
  normalized_reminder JSONB;
  normalized_channels JSONB;
  requested_intents JSONB[] := ARRAY[]::JSONB[];
  requested_intent JSONB;
  existing_intent JSONB;
  reconciled_reminders JSONB;
  reminder_fire_at TIMESTAMPTZ;
  relative_minutes_value INTEGER;
  absolute_time_value TIMESTAMPTZ;
  has_relative_reminder BOOLEAN := false;
  reminder_index INTEGER := 0;
BEGIN
  -- Missing, cross-owner, and unauthorised requests intentionally share one
  -- result so this boundary never discloses Habit existence.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    actor_id := COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID;
    IF actor_id IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('type', 'not-found');
    END IF;
  END IF;

  IF p_habit_id IS NULL THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT id, user_id
  INTO locked_habit
  FROM public.habits
  WHERE id = p_habit_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF jsonb_typeof(COALESCE(p_reminders, '[]'::JSONB)) <> 'array' THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'reminders',
      'message', 'reminders must be an array'
    );
  END IF;

  FOR requested_reminder IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_reminders, '[]'::JSONB))
  LOOP
    reminder_index := reminder_index + 1;
    IF requested_reminder ? 'source_type'
      OR requested_reminder ? 'sourceType' THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', format('reminders[%s].sourceType', reminder_index - 1),
        'message', 'Habit reminder configuration cannot select another source'
      );
    END IF;
    IF jsonb_typeof(requested_reminder) <> 'object'
      OR requested_reminder->>'reminder_type' NOT IN ('relative', 'absolute') THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', format('reminders[%s]', reminder_index - 1),
        'message', 'Reminder type is invalid'
      );
    END IF;

    IF jsonb_typeof(requested_reminder->'channels') IS DISTINCT FROM 'array' THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', format('reminders[%s].channels', reminder_index - 1),
        'message', 'Reminder channels are invalid'
      );
    END IF;

    IF jsonb_array_length(requested_reminder->'channels') = 0
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
        'field', format('reminders[%s].channels', reminder_index - 1),
        'message', 'Reminder channels are invalid'
      );
    END IF;

    SELECT jsonb_agg(to_jsonb(channel.value) ORDER BY channel.value)
    INTO normalized_channels
    FROM jsonb_array_elements_text(requested_reminder->'channels') AS channel;

    IF requested_reminder->>'reminder_type' = 'relative' THEN
      IF COALESCE(requested_reminder->>'relative_minutes', '') !~ '^-?[0-9]+$'
        OR (requested_reminder->>'relative_minutes')::NUMERIC NOT BETWEEN -525600 AND 525600 THEN
        RETURN jsonb_build_object(
          'type', 'invalid',
          'field', format('reminders[%s].relativeMinutes', reminder_index - 1),
          'message', 'relativeMinutes must be a whole number within one year'
        );
      END IF;
      relative_minutes_value := (requested_reminder->>'relative_minutes')::INTEGER;
      has_relative_reminder := true;
      normalized_reminder := jsonb_build_object(
        'reminder_type', 'relative',
        'relative_minutes', relative_minutes_value,
        'absolute_time', NULL,
        'channels', normalized_channels
      );
    ELSE
      IF requested_reminder->>'absolute_time' IS NULL THEN
        RETURN jsonb_build_object(
          'type', 'invalid',
          'field', format('reminders[%s].absoluteTime', reminder_index - 1),
          'message', 'absoluteTime must be a valid datetime'
        );
      END IF;
      BEGIN
        absolute_time_value := (requested_reminder->>'absolute_time')::TIMESTAMPTZ;
      EXCEPTION
        WHEN invalid_text_representation OR invalid_datetime_format
          OR datetime_field_overflow THEN
          RETURN jsonb_build_object(
            'type', 'invalid',
            'field', format('reminders[%s].absoluteTime', reminder_index - 1),
            'message', 'absoluteTime must be a valid datetime'
          );
      END;
      normalized_reminder := jsonb_build_object(
        'reminder_type', 'absolute',
        'relative_minutes', NULL,
        'absolute_time', absolute_time_value,
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

  IF has_relative_reminder AND p_reference_time IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'referenceTime',
      'message', 'A relative reminder requires a valid reference time'
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(intent ORDER BY intent::TEXT),
    '[]'::JSONB
  )
  INTO existing_intent
  FROM (
    SELECT jsonb_build_object(
      'reminder_type', reminder.reminder_type,
      'relative_minutes', CASE
        WHEN reminder.reminder_type = 'relative' THEN reminder.relative_minutes
        ELSE NULL
      END,
      'absolute_time', CASE
        WHEN reminder.reminder_type = 'absolute' THEN reminder.absolute_time
        ELSE NULL
      END,
      'channels', (
        SELECT jsonb_agg(to_jsonb(channel.value) ORDER BY channel.value)
        FROM unnest(reminder.channels) AS channel(value)
      )
    ) AS intent
    FROM public.reminders AS reminder
    WHERE reminder.user_id = p_user_id
      AND reminder.source_type = 'habit'
      AND reminder.source_id = p_habit_id
      AND reminder.status = 'pending'
  ) AS existing;

  SELECT COALESCE(
    jsonb_agg(intent ORDER BY intent::TEXT),
    '[]'::JSONB
  )
  INTO requested_intent
  FROM unnest(requested_intents) AS requested(intent);

  IF existing_intent = requested_intent THEN
    SELECT COALESCE(
      jsonb_agg(to_jsonb(reminder) ORDER BY reminder.created_at),
      '[]'::JSONB
    )
    INTO reconciled_reminders
    FROM public.reminders AS reminder
    WHERE reminder.user_id = p_user_id
      AND reminder.source_type = 'habit'
      AND reminder.source_id = p_habit_id
      AND reminder.status = 'pending';

    RETURN jsonb_build_object(
      'type', 'already-applied',
      'reminders', reconciled_reminders
    );
  END IF;

  -- Replace only pending configuration. Terminal delivery history remains
  -- available for audit and retry policy decisions owned by delivery.
  DELETE FROM public.reminders
  WHERE user_id = p_user_id
    AND source_type = 'habit'
    AND source_id = p_habit_id
    AND status = 'pending';

  FOREACH normalized_reminder IN ARRAY requested_intents
  LOOP
    IF normalized_reminder->>'reminder_type' = 'relative' THEN
      reminder_fire_at := p_reference_time
        - ((normalized_reminder->>'relative_minutes')::INTEGER * INTERVAL '1 minute');
    ELSE
      reminder_fire_at := (normalized_reminder->>'absolute_time')::TIMESTAMPTZ;
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
      'habit',
      p_habit_id,
      normalized_reminder->>'reminder_type',
      (normalized_reminder->>'relative_minutes')::INTEGER,
      (normalized_reminder->>'absolute_time')::TIMESTAMPTZ,
      ARRAY(SELECT jsonb_array_elements_text(normalized_reminder->'channels')),
      reminder_fire_at
    );
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(reminder) ORDER BY reminder.created_at),
    '[]'::JSONB
  )
  INTO reconciled_reminders
  FROM public.reminders AS reminder
  WHERE reminder.user_id = p_user_id
    AND reminder.source_type = 'habit'
    AND reminder.source_id = p_habit_id
    AND reminder.status = 'pending';

  RETURN jsonb_build_object(
    'type', CASE WHEN jsonb_array_length(requested_intent) = 0
      THEN 'removed' ELSE 'configured' END,
    'reminders', reconciled_reminders
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'type', 'conflict',
      'resource', 'reminder'
    );
END;
$$;

ALTER FUNCTION public.configure_habit_reminders(UUID, UUID, JSONB, TIMESTAMPTZ)
  OWNER TO betterr_habit_lifecycle;
ALTER FUNCTION public.configure_habit_reminders(UUID, UUID, JSONB, TIMESTAMPTZ)
  SECURITY DEFINER;
ALTER FUNCTION public.configure_habit_reminders(UUID, UUID, JSONB, TIMESTAMPTZ)
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.configure_habit_reminders(UUID, UUID, JSONB, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_habit_reminders(UUID, UUID, JSONB, TIMESTAMPTZ)
  TO authenticated, service_role;

-- Habit deletion uses the same lifecycle owner so explicit source cleanup and
-- the Habit delete commit atomically. The FK remains an ON DELETE CASCADE
-- backstop for any source deletion that reaches the database directly.
CREATE OR REPLACE FUNCTION public.delete_habit_atomically(
  p_habit_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id UUID;
  v_deleted_habit_id UUID;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    actor_id := COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID;
    IF actor_id IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('type', 'not-found');
    END IF;
  END IF;

  PERFORM 1
  FROM public.habits
  WHERE id = p_habit_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  DELETE FROM public.reminders
  WHERE user_id = p_user_id
    AND source_type = 'habit'
    AND source_id = p_habit_id;

  DELETE FROM public.habits
  WHERE id = p_habit_id
    AND user_id = p_user_id
  RETURNING id INTO v_deleted_habit_id;

  IF v_deleted_habit_id IS NULL THEN
    RAISE EXCEPTION 'Habit disappeared during lifecycle delete';
  END IF;

  RETURN jsonb_build_object('type', 'deleted');
END;
$$;

ALTER FUNCTION public.delete_habit_atomically(UUID, UUID)
  OWNER TO betterr_habit_lifecycle;
ALTER FUNCTION public.delete_habit_atomically(UUID, UUID)
  SECURITY DEFINER;
ALTER FUNCTION public.delete_habit_atomically(UUID, UUID)
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.delete_habit_atomically(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_habit_atomically(UUID, UUID)
  TO authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM betterr_habit_lifecycle;
