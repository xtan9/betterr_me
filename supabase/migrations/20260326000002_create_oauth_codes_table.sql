-- OAuth authorization codes table for PKCE flow
-- Only accessed via service-role client. RLS enabled in 20260328000001.

CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_challenge TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_codes_expires ON oauth_codes (expires_at);
