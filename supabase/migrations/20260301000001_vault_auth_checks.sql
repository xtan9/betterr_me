-- Add authorization checks to vault SECURITY DEFINER functions.
-- Each function now verifies the caller is a member of the household
-- that owns the bank connection associated with the vault secret.

CREATE OR REPLACE FUNCTION create_plaid_secret(secret_name TEXT, secret_value TEXT, secret_description TEXT DEFAULT '')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_id UUID;
BEGIN
  -- Verify caller owns a bank connection with this vault secret name
  IF NOT EXISTS (
    SELECT 1 FROM bank_connections bc
    JOIN household_members hm ON bc.household_id = hm.household_id
    WHERE bc.vault_secret_name = secret_name
    AND hm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of the household owning this connection';
  END IF;

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
  -- Verify caller owns a bank connection with this vault secret name
  IF NOT EXISTS (
    SELECT 1 FROM bank_connections bc
    JOIN household_members hm ON bc.household_id = hm.household_id
    WHERE bc.vault_secret_name = secret_name
    AND hm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of the household owning this connection';
  END IF;

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
  -- Verify caller owns a bank connection with this vault secret name
  IF NOT EXISTS (
    SELECT 1 FROM bank_connections bc
    JOIN household_members hm ON bc.household_id = hm.household_id
    WHERE bc.vault_secret_name = secret_name
    AND hm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of the household owning this connection';
  END IF;

  DELETE FROM vault.secrets WHERE name = secret_name;
END;
$$;
