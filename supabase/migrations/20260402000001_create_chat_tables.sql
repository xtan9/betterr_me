-- conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conversations"
  ON conversations FOR ALL
  USING (user_id IN (SELECT auth.uid()));

-- chat_messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_conv_created ON chat_messages(conversation_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage messages in own conversations"
  ON chat_messages FOR ALL
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE user_id IN (SELECT auth.uid())
  ));

-- Trigger: update conversations.updated_at when messages are inserted
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_message_update_conversation
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();
