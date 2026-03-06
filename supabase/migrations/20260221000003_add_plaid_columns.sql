-- Add Plaid-specific columns to money tables
-- Phase 19: Plaid Bank Connection Pipeline
-- ALTER TABLE additions to Phase 18 stub tables — NOT recreating tables

-- =============================================================================
-- BANK CONNECTIONS: Add Plaid Item fields
-- =============================================================================

ALTER TABLE bank_connections
  ADD COLUMN plaid_item_id TEXT UNIQUE,
  ADD COLUMN institution_id TEXT,
  ADD COLUMN institution_name TEXT,
  ADD COLUMN vault_secret_name TEXT,
  ADD COLUMN sync_cursor TEXT,
  ADD COLUMN last_synced_at TIMESTAMPTZ,
  ADD COLUMN error_code TEXT,
  ADD COLUMN error_message TEXT,
  ADD COLUMN connected_by UUID REFERENCES profiles(id);

-- =============================================================================
-- ACCOUNTS: Add Plaid Account fields
-- =============================================================================

ALTER TABLE accounts
  ADD COLUMN plaid_account_id TEXT UNIQUE,
  ADD COLUMN official_name TEXT,
  ADD COLUMN mask TEXT,
  ADD COLUMN subtype TEXT;

-- =============================================================================
-- TRANSACTIONS: Add Plaid Transaction fields
-- =============================================================================

ALTER TABLE transactions
  ADD COLUMN plaid_transaction_id TEXT UNIQUE,
  ADD COLUMN plaid_category_primary TEXT,
  ADD COLUMN plaid_category_detailed TEXT,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('plaid', 'manual'));

-- =============================================================================
-- INDEXES for Plaid ID lookups (partial: only non-null values)
-- =============================================================================

CREATE INDEX idx_bank_connections_plaid_item ON bank_connections(plaid_item_id) WHERE plaid_item_id IS NOT NULL;
CREATE INDEX idx_accounts_plaid_account ON accounts(plaid_account_id) WHERE plaid_account_id IS NOT NULL;
CREATE INDEX idx_transactions_plaid_txn ON transactions(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL;
CREATE INDEX idx_transactions_source ON transactions(source);

-- =============================================================================
-- VAULT WRAPPER FUNCTIONS
-- Callable via admin.rpc() for Plaid access token management.
-- SECURITY DEFINER: runs with definer's privileges so they can access
-- vault.create_secret and vault.decrypted_secrets via PostgREST API.
-- =============================================================================

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
