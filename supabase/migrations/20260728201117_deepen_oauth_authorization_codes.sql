ALTER TABLE oauth_codes
  ADD COLUMN client_id TEXT,
  ADD COLUMN scopes TEXT[] NOT NULL DEFAULT '{read,write}',
  ADD COLUMN code_challenge_method TEXT NOT NULL DEFAULT 'S256'
    CHECK (code_challenge_method = 'S256');

ALTER TABLE oauth_refresh_tokens
  ADD COLUMN client_id TEXT;

-- Existing authorization codes predate client binding. Leave them unbound so
-- the consume function's client equality can never match them.

-- Legacy refresh tokens previously issued access tokens with the user ID as
-- the effective client identity. Preserve that behavior during migration.
UPDATE oauth_refresh_tokens
SET client_id = user_id::TEXT
WHERE client_id IS NULL;

CREATE OR REPLACE FUNCTION consume_oauth_authorization_code(
  requested_code_hash TEXT,
  requested_client_id TEXT,
  requested_redirect_uri TEXT,
  requested_code_challenge TEXT,
  requested_code_challenge_method TEXT,
  requested_at TIMESTAMPTZ
)
RETURNS TABLE (
  outcome TEXT,
  code_hash TEXT,
  client_id TEXT,
  redirect_uri TEXT,
  user_id UUID,
  scopes TEXT[],
  expires_at TIMESTAMPTZ,
  code_challenge TEXT,
  code_challenge_method TEXT,
  used BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched oauth_codes%ROWTYPE;
BEGIN
  UPDATE oauth_codes
  SET used = true
  WHERE oauth_codes.code_hash = requested_code_hash
    AND oauth_codes.used = false
    AND oauth_codes.expires_at > requested_at
    AND oauth_codes.client_id = requested_client_id
    AND oauth_codes.redirect_uri = requested_redirect_uri
    AND oauth_codes.code_challenge = requested_code_challenge
    AND oauth_codes.code_challenge_method = requested_code_challenge_method
  RETURNING * INTO matched;

  IF FOUND THEN
    RETURN QUERY SELECT
      'consumed'::TEXT,
      matched.code_hash,
      matched.client_id,
      matched.redirect_uri,
      matched.user_id,
      matched.scopes,
      matched.expires_at,
      matched.code_challenge,
      matched.code_challenge_method,
      matched.used;
    RETURN;
  END IF;

  SELECT * INTO matched
  FROM oauth_codes
  WHERE oauth_codes.code_hash = requested_code_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_code'::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::TEXT, NULL::UUID, NULL::TEXT[], NULL::TIMESTAMPTZ, NULL::TEXT,
      NULL::TEXT, NULL::BOOLEAN;
  ELSIF matched.used THEN
    RETURN QUERY SELECT 'reused_code'::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::TEXT, NULL::UUID, NULL::TEXT[], NULL::TIMESTAMPTZ, NULL::TEXT,
      NULL::TEXT, NULL::BOOLEAN;
  ELSIF matched.expires_at <= requested_at THEN
    RETURN QUERY SELECT 'expired_code'::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::TEXT, NULL::UUID, NULL::TEXT[], NULL::TIMESTAMPTZ, NULL::TEXT,
      NULL::TEXT, NULL::BOOLEAN;
  ELSE
    RETURN QUERY SELECT 'mismatched_code'::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::TEXT, NULL::UUID, NULL::TEXT[], NULL::TIMESTAMPTZ, NULL::TEXT,
      NULL::TEXT, NULL::BOOLEAN;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION consume_oauth_authorization_code(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_oauth_authorization_code(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;
