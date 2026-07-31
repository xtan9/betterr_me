ALTER TABLE public.conversations
  ADD COLUMN initial_turn_id TEXT;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_initial_turn_id_not_blank
  CHECK (initial_turn_id IS NULL OR btrim(initial_turn_id) <> '');

CREATE UNIQUE INDEX conversations_user_initial_turn_key
  ON public.conversations (user_id, initial_turn_id)
  WHERE initial_turn_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_initial_chat_turn(
  p_user_id UUID,
  p_turn_id TEXT,
  p_user_content TEXT,
  p_assistant_content TEXT,
  p_assistant_model TEXT,
  p_title TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  conversation_row public.conversations%ROWTYPE;
  saved_messages JSONB;
  saved_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NULLIF(btrim(p_turn_id), '') IS NULL
    OR NULLIF(btrim(p_user_content), '') IS NULL
    OR NULLIF(btrim(p_assistant_content), '') IS NULL
    OR NULLIF(btrim(p_assistant_model), '') IS NULL
    OR NULLIF(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Initial turn fields cannot be blank';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::TEXT || ':' || p_turn_id, 0)
  );

  SELECT *
  INTO conversation_row
  FROM public.conversations
  WHERE user_id = p_user_id
    AND initial_turn_id = p_turn_id;

  IF FOUND THEN
    SELECT
      jsonb_agg(to_jsonb(message_row) ORDER BY message_row.turn_position),
      count(*)
    INTO saved_messages, saved_count
    FROM public.chat_messages AS message_row
    WHERE message_row.conversation_id = conversation_row.id
      AND message_row.turn_id = p_turn_id;

    IF conversation_row.model <> p_assistant_model
      OR conversation_row.title <> p_title
      OR saved_count <> 2
      OR NOT EXISTS (
        SELECT 1 FROM public.chat_messages
        WHERE conversation_id = conversation_row.id
          AND turn_id = p_turn_id
          AND turn_position = 0
          AND role = 'user'
          AND content = p_user_content
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.chat_messages
        WHERE conversation_id = conversation_row.id
          AND turn_id = p_turn_id
          AND turn_position = 1
          AND role = 'assistant'
          AND content = p_assistant_content
          AND model = p_assistant_model
      ) THEN
      RAISE EXCEPTION 'Initial turn id already used with different content';
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'already_saved',
      'conversationId', conversation_row.id,
      'title', conversation_row.title,
      'messages', saved_messages
    );
  END IF;

  INSERT INTO public.conversations (user_id, initial_turn_id, model)
  VALUES (p_user_id, p_turn_id, p_assistant_model)
  RETURNING * INTO conversation_row;

  INSERT INTO public.chat_messages (
    conversation_id,
    turn_id,
    turn_position,
    role,
    content,
    model
  )
  VALUES
    (conversation_row.id, p_turn_id, 0, 'user', p_user_content, NULL),
    (
      conversation_row.id,
      p_turn_id,
      1,
      'assistant',
      p_assistant_content,
      p_assistant_model
    );

  UPDATE public.conversations
  SET title = p_title
  WHERE id = conversation_row.id
  RETURNING * INTO conversation_row;

  SELECT jsonb_agg(to_jsonb(message_row) ORDER BY message_row.turn_position)
  INTO saved_messages
  FROM public.chat_messages AS message_row
  WHERE message_row.conversation_id = conversation_row.id
    AND message_row.turn_id = p_turn_id;

  RETURN jsonb_build_object(
    'outcome', 'saved',
    'conversationId', conversation_row.id,
    'title', conversation_row.title,
    'messages', saved_messages
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_initial_chat_turn(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_initial_chat_turn(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
