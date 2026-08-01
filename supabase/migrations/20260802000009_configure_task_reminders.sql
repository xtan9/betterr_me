-- Make Task Reminder Configuration a Task-owned, atomic mutation.
-- Pending intent is reconciled as a complete collection. Terminal delivery
-- history is owned by Reminder Delivery and remains untouched.

-- Remove legacy rows that cannot satisfy the tenant-scoped relationship before
-- adding the composite source foreign key.
DELETE FROM public.reminders AS reminder
WHERE reminder.source_type = 'task'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    WHERE task.id = reminder.source_id
      AND task.user_id = reminder.user_id
  );

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE public.reminders
  ADD COLUMN task_source_id UUID
  GENERATED ALWAYS AS (
    CASE
      WHEN source_type = 'task' THEN source_id
      ELSE NULL::UUID
    END
  ) STORED;

ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_task_owner_fkey
  FOREIGN KEY (task_source_id, user_id)
  REFERENCES public.tasks (id, user_id)
  ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'betterr_task_lifecycle') THEN
    CREATE ROLE betterr_task_lifecycle
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'betterr_task_lifecycle'
      AND (
        rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'Existing Task lifecycle role has unsafe attributes';
  END IF;
END
$$;

GRANT betterr_task_lifecycle TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO betterr_task_lifecycle;
GRANT SELECT (id, user_id, due_date, due_time), UPDATE
  ON TABLE public.tasks TO betterr_task_lifecycle;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.reminders TO betterr_task_lifecycle;
GRANT SELECT (id, timezone)
  ON TABLE public.profiles TO betterr_task_lifecycle;

-- Habit configuration remains on the generic authenticated adapter. Task
-- configuration is owned by this lifecycle RPC; delivery updates still allow
-- authenticated status/fire_at/sent_at transitions for existing reminders.
DROP POLICY IF EXISTS "Users create own non-calendar reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users delete own non-calendar reminders" ON public.reminders;
CREATE POLICY "Users create own Habit reminders"
  ON public.reminders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND source_type = 'habit');
CREATE POLICY "Users delete own Habit reminders"
  ON public.reminders FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND source_type = 'habit');

CREATE OR REPLACE FUNCTION public.prevent_direct_task_reminder_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user <> 'betterr_task_lifecycle'
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
    AND (OLD.source_type = 'task' OR NEW.source_type = 'task')
  THEN
    RAISE EXCEPTION
      'Task Reminder Configuration must use the Task lifecycle boundary';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_direct_task_reminder_configuration
  ON public.reminders;
CREATE TRIGGER prevent_direct_task_reminder_configuration
  BEFORE UPDATE OF user_id, source_type, source_id, reminder_type,
    relative_minutes, absolute_time, channels
  ON public.reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_task_reminder_configuration();

CREATE POLICY "Task lifecycle reads owned tasks"
  ON public.tasks FOR SELECT TO betterr_task_lifecycle
  USING (
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Task lifecycle locks owned tasks"
  ON public.tasks FOR UPDATE TO betterr_task_lifecycle
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

CREATE POLICY "Task lifecycle reads owned profiles"
  ON public.profiles FOR SELECT TO betterr_task_lifecycle
  USING (
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = id
  );

CREATE POLICY "Task lifecycle reads owned reminders"
  ON public.reminders FOR SELECT TO betterr_task_lifecycle
  USING (
    source_type = 'task'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Task lifecycle creates owned reminders"
  ON public.reminders FOR INSERT TO betterr_task_lifecycle
  WITH CHECK (
    source_type = 'task'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Task lifecycle updates owned reminders"
  ON public.reminders FOR UPDATE TO betterr_task_lifecycle
  USING (
    source_type = 'task'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  )
  WITH CHECK (
    source_type = 'task'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE POLICY "Task lifecycle deletes owned reminders"
  ON public.reminders FOR DELETE TO betterr_task_lifecycle
  USING (
    source_type = 'task'
    AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub'
    )::UUID = user_id
  );

CREATE OR REPLACE FUNCTION public.configure_task_reminders(
  p_user_id UUID,
  p_task_id UUID,
  p_reminders JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id UUID;
  locked_task RECORD;
  requested_reminder JSONB;
  normalized_reminder JSONB;
  normalized_channels JSONB;
  requested_intents JSONB[] := ARRAY[]::JSONB[];
  requested_intent JSONB;
  existing_intent JSONB;
  reconciled_reminders JSONB;
  task_start TIMESTAMPTZ;
  task_timezone TEXT;
  reminder_fire_at TIMESTAMPTZ;
  relative_minutes_value INTEGER;
  absolute_time_value TIMESTAMPTZ;
  has_relative_reminder BOOLEAN := false;
  reminder_index INTEGER := 0;
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

  IF p_task_id IS NULL THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT id, user_id, due_date, due_time
  INTO locked_task
  FROM public.tasks
  WHERE id = p_task_id
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

  IF has_relative_reminder THEN
    IF locked_task.due_date IS NULL THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'task',
        'message', 'A relative reminder requires a scheduled Task date'
      );
    END IF;
    SELECT COALESCE(profile.timezone, 'UTC')
    INTO task_timezone
    FROM public.profiles AS profile
    WHERE profile.id = p_user_id;
    task_timezone := COALESCE(task_timezone, 'UTC');
    task_start := (
      locked_task.due_date + COALESCE(locked_task.due_time, TIME '00:00:00')
    ) AT TIME ZONE task_timezone;
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
      AND reminder.source_type = 'task'
      AND reminder.source_id = p_task_id
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
      AND reminder.source_type = 'task'
      AND reminder.source_id = p_task_id
      AND reminder.status = 'pending';

    RETURN jsonb_build_object(
      'type', 'already-applied',
      'reminders', reconciled_reminders
    );
  END IF;

  -- The complete requested collection replaces only pending configuration;
  -- terminal Reminder Delivery history remains available for audit and retry
  -- policy decisions owned by that later boundary.
  DELETE FROM public.reminders
  WHERE user_id = p_user_id
    AND source_type = 'task'
    AND source_id = p_task_id
    AND status = 'pending';

  FOREACH normalized_reminder IN ARRAY requested_intents
  LOOP
    IF normalized_reminder->>'reminder_type' = 'relative' THEN
      reminder_fire_at := task_start
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
      'task',
      p_task_id,
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
    AND reminder.source_type = 'task'
    AND reminder.source_id = p_task_id
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

ALTER FUNCTION public.configure_task_reminders(UUID, UUID, JSONB)
  OWNER TO betterr_task_lifecycle;
ALTER FUNCTION public.configure_task_reminders(UUID, UUID, JSONB)
  SECURITY DEFINER;
ALTER FUNCTION public.configure_task_reminders(UUID, UUID, JSONB)
  SET search_path = pg_catalog, public;
REVOKE CREATE ON SCHEMA public FROM betterr_task_lifecycle;
REVOKE ALL ON FUNCTION public.configure_task_reminders(UUID, UUID, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_task_reminders(UUID, UUID, JSONB)
  TO authenticated, service_role;
