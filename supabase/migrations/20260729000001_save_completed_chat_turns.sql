ALTER TABLE chat_messages
  ADD COLUMN turn_id TEXT,
  ADD COLUMN turn_position SMALLINT,
  ADD COLUMN model TEXT;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_completed_turn_shape_check
  CHECK (
    (turn_id IS NULL AND turn_position IS NULL)
    OR (
      turn_id IS NOT NULL
      AND (
        (
          turn_position = 0
          AND role = 'user'
          AND model IS NULL
        )
        OR (
          turn_position = 1
          AND role = 'assistant'
          AND model IS NOT NULL
          AND btrim(model) <> ''
        )
      )
    )
  );

CREATE UNIQUE INDEX chat_messages_conversation_turn_position_key
  ON chat_messages (conversation_id, turn_id, turn_position)
  WHERE turn_id IS NOT NULL;

CREATE OR REPLACE FUNCTION save_completed_chat_turn(
  p_conversation_id UUID,
  p_turn_id TEXT,
  p_user_content TEXT,
  p_assistant_content TEXT,
  p_assistant_model TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  saved_messages JSONB;
  saved_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_conversation_id::TEXT || ':' || p_turn_id, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM conversations
    WHERE id = p_conversation_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  SELECT
    jsonb_agg(to_jsonb(message_row) ORDER BY message_row.turn_position),
    count(*)
  INTO saved_messages, saved_count
  FROM chat_messages AS message_row
  WHERE message_row.conversation_id = p_conversation_id
    AND message_row.turn_id = p_turn_id;

  IF saved_count > 0 THEN
    IF saved_count <> 2 OR NOT EXISTS (
      SELECT 1
      FROM chat_messages
      WHERE conversation_id = p_conversation_id
        AND turn_id = p_turn_id
        AND turn_position = 0
        AND role = 'user'
        AND content = p_user_content
    ) OR NOT EXISTS (
      SELECT 1
      FROM chat_messages
      WHERE conversation_id = p_conversation_id
        AND turn_id = p_turn_id
        AND turn_position = 1
        AND role = 'assistant'
        AND content = p_assistant_content
        AND model = p_assistant_model
    ) THEN
      RAISE EXCEPTION 'Turn id already used with different content';
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'already_saved',
      'messages', saved_messages
    );
  END IF;

  INSERT INTO chat_messages (
    conversation_id,
    turn_id,
    turn_position,
    role,
    content,
    model
  )
  VALUES
    (p_conversation_id, p_turn_id, 0, 'user', p_user_content, NULL),
    (
      p_conversation_id,
      p_turn_id,
      1,
      'assistant',
      p_assistant_content,
      p_assistant_model
    );

  SELECT jsonb_agg(to_jsonb(message_row) ORDER BY message_row.turn_position)
  INTO saved_messages
  FROM chat_messages AS message_row
  WHERE message_row.conversation_id = p_conversation_id
    AND message_row.turn_id = p_turn_id;

  RETURN jsonb_build_object(
    'outcome', 'saved',
    'messages', saved_messages
  );
END;
$$;
