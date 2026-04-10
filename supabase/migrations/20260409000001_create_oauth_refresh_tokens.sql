-- OAuth refresh tokens for MCP authentication
-- Stores hashed refresh tokens with rotation tracking

CREATE TABLE oauth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL DEFAULT '{read,write}',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  replaced_by_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON oauth_refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires ON oauth_refresh_tokens (expires_at);

-- Enable RLS (no policies — accessed via service-role only, matching oauth_codes pattern)
ALTER TABLE oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;
