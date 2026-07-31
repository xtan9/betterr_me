-- Delete an event and every calendar reminder in its recurrence tree through
-- one idempotent, caller-scoped transaction boundary.

-- Preserve legacy cross-owner descendants instead of allowing the old
-- single-column cascade to remove them with another user's recurrence root.
UPDATE public.calendar_events AS child
SET
  recurring_event_id = NULL,
  original_date = NULL,
  is_exception = false
FROM public.calendar_events AS parent
WHERE child.recurring_event_id = parent.id
  AND child.user_id <> parent.user_id;

-- Remove calendar reminders admitted before lifecycle-only reminder writes.
-- This covers both missing sources and cross-owner links, so enabling the
-- invariant below starts from a valid data set.
DELETE FROM public.reminders AS reminder
WHERE reminder.source_type = 'calendar_event'
  AND NOT EXISTS (
    SELECT 1
    FROM public.calendar_events AS event
    WHERE event.id = reminder.source_id
      AND event.user_id = reminder.user_id
  );

-- Recurrence edges are tenant-scoped from this point forward. The redundant
-- unique key is the target required by PostgreSQL for the composite self-FK.
ALTER TABLE public.calendar_events
  DROP CONSTRAINT calendar_events_recurring_event_id_fkey;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_id_user_id_key UNIQUE (id, user_id);
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_recurring_event_owner_fkey
  FOREIGN KEY (recurring_event_id, user_id)
  REFERENCES public.calendar_events (id, user_id)
  ON DELETE CASCADE;

-- Project the polymorphic calendar source into a nullable FK column. Non-event
-- reminders produce NULL and are outside this relationship; calendar reminders
-- must reference an event owned by the same user. PostgreSQL's FK locking also
-- closes concurrent reminder-insert/event-delete races.
ALTER TABLE public.reminders
  ADD COLUMN calendar_event_source_id UUID
  GENERATED ALWAYS AS (
    CASE
      WHEN source_type = 'calendar_event' THEN source_id
      ELSE NULL::UUID
    END
  ) STORED;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_calendar_event_owner_fkey
  FOREIGN KEY (calendar_event_source_id, user_id)
  REFERENCES public.calendar_events (id, user_id)
  ON DELETE CASCADE;

GRANT DELETE ON TABLE public.calendar_events TO betterr_calendar_lifecycle;

REVOKE DELETE ON TABLE public.calendar_events FROM authenticated;

-- The lifecycle role runs SECURITY DEFINER functions for both authenticated
-- JWT callers and the trusted MCP service-role client. The database request
-- role distinguishes service-role calls; authenticated callers retain exact
-- JWT-subject binding.
CREATE POLICY "Lifecycle reads owned calendar events"
  ON public.calendar_events FOR SELECT TO betterr_calendar_lifecycle
  USING (
    current_setting('role', true) = 'service_role'
    OR COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(
        current_setting('request.jwt.claims', true),
        ''
      )::JSONB->>'sub'
    )::UUID = user_id
  );

DROP POLICY IF EXISTS "Users can delete own calendar_events"
  ON public.calendar_events;
CREATE POLICY "Lifecycle deletes owned calendar events"
  ON public.calendar_events FOR DELETE TO betterr_calendar_lifecycle
  USING (
    current_setting('role', true) = 'service_role'
    OR COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(
        current_setting('request.jwt.claims', true),
        ''
      )::JSONB->>'sub'
    )::UUID = user_id
  );

DROP POLICY IF EXISTS "Lifecycle deletes owned reminders"
  ON public.reminders;
CREATE POLICY "Lifecycle deletes owned reminders"
  ON public.reminders FOR DELETE TO betterr_calendar_lifecycle
  USING (
    source_type = 'calendar_event'
    AND (
      current_setting('role', true) = 'service_role'
      OR COALESCE(
        NULLIF(current_setting('request.jwt.claim.sub', true), ''),
        NULLIF(
          current_setting('request.jwt.claims', true),
          ''
        )::JSONB->>'sub'
      )::UUID = user_id
    )
  );

CREATE OR REPLACE FUNCTION public.delete_calendar_event_with_reminders(
  p_user_id UUID,
  p_event_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_event_id UUID;
  deleted_reminder_count INTEGER := 0;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
  AND COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(
        current_setting('request.jwt.claims', true),
        ''
      )::JSONB->>'sub'
    )::UUID IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot delete a schedule for another user';
  END IF;

  PERFORM 1
  FROM public.calendar_events
  WHERE id = p_event_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'event_id', p_event_id,
      'deleted', false,
      'reminders_deleted', 0
    );
  END IF;

  -- Lock the complete recurrence tree before observing reminders. This keeps
  -- concurrent lifecycle updates from attaching a reminder to an event that
  -- the parent delete is about to cascade away.
  PERFORM locked_event.id
  FROM public.calendar_events locked_event
  WHERE locked_event.id IN (
    WITH RECURSIVE related_events AS (
      SELECT id
      FROM public.calendar_events
      WHERE id = p_event_id
        AND user_id = p_user_id

      -- UNION de-duplicates visited IDs, bounding legacy cyclic recurrence
      -- graphs such as a self-referential exception.
      UNION

      SELECT child.id
      FROM public.calendar_events child
      JOIN related_events parent
        ON child.recurring_event_id = parent.id
      WHERE child.user_id = p_user_id
    )
    SELECT id FROM related_events
  )
  ORDER BY locked_event.id
  FOR UPDATE;

  DELETE FROM public.reminders
  WHERE user_id = p_user_id
    AND source_type = 'calendar_event'
    AND source_id IN (
      -- Re-observe the tree after acquiring its row locks so a descendant
      -- committed while lock acquisition waited cannot escape cleanup.
      WITH RECURSIVE related_events AS (
        SELECT id
        FROM public.calendar_events
        WHERE id = p_event_id
          AND user_id = p_user_id

        UNION

        SELECT child.id
        FROM public.calendar_events child
        JOIN related_events parent
          ON child.recurring_event_id = parent.id
        WHERE child.user_id = p_user_id
      )
      SELECT id FROM related_events
    );
  GET DIAGNOSTICS deleted_reminder_count = ROW_COUNT;

  DELETE FROM public.calendar_events
  WHERE id = p_event_id
    AND user_id = p_user_id
  RETURNING id INTO deleted_event_id;

  IF deleted_event_id IS NULL THEN
    RAISE EXCEPTION 'Calendar event disappeared during lifecycle delete';
  END IF;

  RETURN jsonb_build_object(
    'event_id', deleted_event_id,
    'deleted', true,
    'reminders_deleted', deleted_reminder_count
  );
END;
$$;

GRANT CREATE ON SCHEMA public TO betterr_calendar_lifecycle;
ALTER FUNCTION public.delete_calendar_event_with_reminders(UUID, UUID)
  OWNER TO betterr_calendar_lifecycle;
REVOKE CREATE ON SCHEMA public FROM betterr_calendar_lifecycle;
REVOKE ALL ON FUNCTION public.delete_calendar_event_with_reminders(UUID, UUID)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_calendar_event_with_reminders(UUID, UUID)
  TO authenticated, service_role;
