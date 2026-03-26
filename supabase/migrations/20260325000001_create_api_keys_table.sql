-- Create api_keys table for external API access
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 50),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT 'read_write' CHECK (permissions IN ('read', 'read_write')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes (key_hash already has UNIQUE constraint from column definition)
CREATE INDEX idx_api_keys_user_id ON api_keys (user_id);

-- Enable Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only manage their own keys
CREATE POLICY "Users can view their own API keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own API keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
  ON api_keys FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
