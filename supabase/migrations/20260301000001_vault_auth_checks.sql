-- Secure vault SECURITY DEFINER functions by restricting who can call them.
--
-- These functions are only called via the admin client (service_role), never
-- directly by authenticated users. Revoking EXECUTE from 'authenticated'
-- prevents any user from calling them via PostgREST, which was the original
-- security concern. This is simpler and more correct than auth.uid() checks
-- (which return NULL for service_role callers).

-- Revert to simple implementations (no auth.uid() checks that break service_role)
CREATE OR REPLACE FUNCTION create_plaid_secret(secret_name TEXT, secret_value TEXT, secret_description TEXT DEFAULT '')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_id UUID;
BEGIN
  SELECT vault.create_secret(secret_value, secret_name, secret_description) INTO secret_id;
  RETURN secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_plaid_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result TEXT;
BEGIN
  SELECT decrypted_secret INTO result
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION delete_plaid_secret(secret_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = secret_name;
END;
$$;

-- Lock down: only service_role can call these functions
REVOKE EXECUTE ON FUNCTION create_plaid_secret(TEXT, TEXT, TEXT) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION get_plaid_secret(TEXT) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION delete_plaid_secret(TEXT) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION create_plaid_secret(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_plaid_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION delete_plaid_secret(TEXT) TO service_role;
