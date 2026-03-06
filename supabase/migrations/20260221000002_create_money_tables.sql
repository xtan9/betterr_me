-- Create money tables: bank_connections, accounts, transactions, categories
-- Phase 18: Database Foundation & Household Schema
-- Stub tables for Phase 19+ — schema established now so RLS pattern and types are ready
-- All money amounts use BIGINT (integer cents) — NEVER numeric/decimal

-- =============================================================================
-- BANK CONNECTIONS
-- =============================================================================

CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'plaid',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ACCOUNTS
-- =============================================================================

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  bank_connection_id UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'checking',
  balance_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TRANSACTIONS
-- =============================================================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  description TEXT NOT NULL,
  merchant_name TEXT,
  category TEXT,
  transaction_date DATE NOT NULL,
  is_pending BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CATEGORIES
-- =============================================================================

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE, -- NULL = system default
  name TEXT NOT NULL,
  icon TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_bank_connections_household ON bank_connections(household_id);
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_transactions_household ON transactions(household_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(household_id, transaction_date);
CREATE INDEX idx_categories_household ON categories(household_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Bank connections: household members can view
CREATE POLICY "Household members can view bank_connections"
  ON bank_connections FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert bank_connections"
  ON bank_connections FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update bank_connections"
  ON bank_connections FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete bank_connections"
  ON bank_connections FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- Accounts: household members can view
CREATE POLICY "Household members can view accounts"
  ON accounts FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert accounts"
  ON accounts FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update accounts"
  ON accounts FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete accounts"
  ON accounts FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- Transactions: household members can view
CREATE POLICY "Household members can view transactions"
  ON transactions FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert transactions"
  ON transactions FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update transactions"
  ON transactions FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete transactions"
  ON transactions FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- Categories: household members can view (NULL household_id = system defaults visible to all)
CREATE POLICY "Household members can view categories"
  ON categories FOR SELECT TO authenticated
  USING (
    household_id IS NULL
    OR household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Household members can insert categories"
  ON categories FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update categories"
  ON categories FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete categories"
  ON categories FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Reuse existing updated_at trigger function
CREATE TRIGGER update_bank_connections_updated_at
  BEFORE UPDATE ON bank_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
