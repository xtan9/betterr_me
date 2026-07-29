ALTER TABLE oauth_refresh_tokens
  ADD COLUMN family_id UUID,
  ADD COLUMN revoked_at TIMESTAMPTZ;

-- The precise revocation time is unavailable for legacy rows. Retain all of
-- them for a fresh evidence window rather than deleting a recently revoked
-- token according to its potentially much older creation time.
UPDATE oauth_refresh_tokens
SET revoked_at = now()
WHERE revoked = true;

ALTER TABLE oauth_refresh_tokens
  ADD CONSTRAINT oauth_refresh_tokens_revoked_at_present
  CHECK (revoked = false OR revoked_at IS NOT NULL);

-- Preserve legacy replacement chains as families. A root is a token that no
-- earlier token names as its replacement; recursion walks toward the active
-- descendant.
WITH RECURSIVE token_families AS (
  SELECT
    root.id AS family_id,
    root.id,
    root.replaced_by_hash,
    ARRAY[root.id] AS path
  FROM oauth_refresh_tokens AS root
  WHERE NOT EXISTS (
    SELECT 1
    FROM oauth_refresh_tokens AS predecessor
    WHERE predecessor.replaced_by_hash = root.token_hash
  )

  UNION ALL

  SELECT
    token_families.family_id,
    replacement.id,
    replacement.replaced_by_hash,
    token_families.path || replacement.id
  FROM token_families
  JOIN oauth_refresh_tokens AS replacement
    ON replacement.token_hash = token_families.replaced_by_hash
  WHERE NOT replacement.id = ANY(token_families.path)
)
UPDATE oauth_refresh_tokens AS token
SET family_id = token_families.family_id
FROM token_families
WHERE token.id = token_families.id;

-- Defensive fallback for malformed legacy cycles. Newly issued root tokens
-- receive a family identifier from the column default.
UPDATE oauth_refresh_tokens
SET family_id = id
WHERE family_id IS NULL;

ALTER TABLE oauth_refresh_tokens
  ALTER COLUMN family_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX idx_refresh_tokens_family
  ON oauth_refresh_tokens (family_id);

CREATE OR REPLACE FUNCTION resolve_oauth_refresh_token_context(
  requested_token_hash TEXT,
  requested_client_id TEXT,
  requested_at TIMESTAMPTZ
)
RETURNS TABLE (
  outcome TEXT,
  client_id TEXT,
  user_id UUID,
  scopes TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched oauth_refresh_tokens%ROWTYPE;
BEGIN
  SELECT * INTO matched
  FROM oauth_refresh_tokens
  WHERE token_hash = requested_token_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
  ELSIF matched.replaced_by_hash IS NOT NULL THEN
    RETURN QUERY SELECT 'reused_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
  ELSIF matched.client_id IS DISTINCT FROM requested_client_id THEN
    RETURN QUERY SELECT 'mismatched_context'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
  ELSIF matched.expires_at <= requested_at THEN
    RETURN QUERY SELECT 'expired_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
  ELSIF matched.revoked THEN
    RETURN QUERY SELECT 'revoked_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
  ELSE
    RETURN QUERY SELECT
      'valid_token'::TEXT,
      matched.client_id,
      matched.user_id,
      matched.scopes;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION resolve_oauth_refresh_token_context(
  TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_oauth_refresh_token_context(
  TEXT, TEXT, TIMESTAMPTZ
) TO service_role;

CREATE OR REPLACE FUNCTION rotate_oauth_refresh_token(
  requested_token_hash TEXT,
  replacement_token_hash TEXT,
  replacement_expires_at TIMESTAMPTZ,
  requested_client_id TEXT,
  requested_at TIMESTAMPTZ
)
RETURNS TABLE (
  outcome TEXT,
  client_id TEXT,
  user_id UUID,
  scopes TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched oauth_refresh_tokens%ROWTYPE;
  matched_family_id UUID;
BEGIN
  -- Resolve only the stable family identifier before locking. Every rotation
  -- and reuse response in the family takes this same transaction-level lock,
  -- then reloads the row so a waiter sees all descendants committed by the
  -- previous holder.
  SELECT family_id INTO matched_family_id
  FROM oauth_refresh_tokens
  WHERE token_hash = requested_token_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(matched_family_id::TEXT, 0)
  );

  SELECT * INTO matched
  FROM oauth_refresh_tokens
  WHERE token_hash = requested_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
    RETURN;
  END IF;

  -- Possession of a known consumed token is reuse regardless of its current
  -- expiry or presented client context. Revoke the family before returning.
  IF matched.replaced_by_hash IS NOT NULL THEN
    UPDATE oauth_refresh_tokens
    SET revoked = true,
        revoked_at = COALESCE(revoked_at, clock_timestamp())
    WHERE family_id = matched.family_id;

    RETURN QUERY SELECT 'reused_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
    RETURN;
  END IF;

  IF matched.client_id IS DISTINCT FROM requested_client_id THEN
    RETURN QUERY SELECT 'mismatched_context'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
    RETURN;
  END IF;

  IF matched.expires_at <= requested_at THEN
    RETURN QUERY SELECT 'expired_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
    RETURN;
  END IF;

  IF matched.revoked THEN
    RETURN QUERY SELECT 'revoked_token'::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT[];
    RETURN;
  END IF;

  INSERT INTO oauth_refresh_tokens (
    token_hash,
    family_id,
    client_id,
    user_id,
    scopes,
    expires_at
  )
  VALUES (
    replacement_token_hash,
    matched.family_id,
    matched.client_id,
    matched.user_id,
    matched.scopes,
    replacement_expires_at
  );

  UPDATE oauth_refresh_tokens
  SET revoked = true,
      revoked_at = clock_timestamp(),
      replaced_by_hash = replacement_token_hash
  WHERE id = matched.id;

  RETURN QUERY SELECT
    'rotated'::TEXT,
    matched.client_id,
    matched.user_id,
    matched.scopes;
END;
$$;

REVOKE ALL ON FUNCTION rotate_oauth_refresh_token(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rotate_oauth_refresh_token(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
) TO service_role;

CREATE OR REPLACE FUNCTION cleanup_oauth_refresh_token_families(
  expired_before TIMESTAMPTZ,
  revoked_before TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM oauth_refresh_tokens
  WHERE (revoked = false AND expires_at < expired_before)
     OR (revoked = true AND revoked_at < revoked_before);
$$;

REVOKE ALL ON FUNCTION cleanup_oauth_refresh_token_families(
  TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_oauth_refresh_token_families(
  TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
