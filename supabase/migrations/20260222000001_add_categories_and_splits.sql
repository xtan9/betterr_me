-- Phase 20: Transaction Management & Categorization
-- Adds: color/display_name to categories, category_id/notes to transactions,
-- merchant_category_rules, transaction_splits, hidden_categories tables,
-- 16 seeded Plaid PFCv2 system categories, category_id backfill

-- =============================================================================
-- ALTER EXISTING TABLES
-- =============================================================================

-- Add color and display_name to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add category_id FK and notes to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

-- =============================================================================
-- MERCHANT CATEGORY RULES
-- =============================================================================

CREATE TABLE merchant_category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  merchant_name_lower TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, merchant_name_lower)
);

CREATE INDEX idx_merchant_rules_household ON merchant_category_rules(household_id);
CREATE INDEX idx_merchant_rules_lookup ON merchant_category_rules(household_id, merchant_name_lower);

-- =============================================================================
-- TRANSACTION SPLITS
-- =============================================================================

CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_splits_transaction ON transaction_splits(transaction_id);

-- =============================================================================
-- HIDDEN CATEGORIES
-- =============================================================================

CREATE TABLE hidden_categories (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, category_id)
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE merchant_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hidden_categories ENABLE ROW LEVEL SECURITY;

-- Merchant category rules: household members can SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Household members can view merchant_category_rules"
  ON merchant_category_rules FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert merchant_category_rules"
  ON merchant_category_rules FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update merchant_category_rules"
  ON merchant_category_rules FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete merchant_category_rules"
  ON merchant_category_rules FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- Transaction splits: household-scoped via transaction join
CREATE POLICY "Household members can view transaction_splits"
  ON transaction_splits FOR SELECT TO authenticated
  USING (transaction_id IN (
    SELECT id FROM transactions
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

CREATE POLICY "Household members can insert transaction_splits"
  ON transaction_splits FOR INSERT TO authenticated
  WITH CHECK (transaction_id IN (
    SELECT id FROM transactions
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

CREATE POLICY "Household members can delete transaction_splits"
  ON transaction_splits FOR DELETE TO authenticated
  USING (transaction_id IN (
    SELECT id FROM transactions
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

-- Hidden categories: household members can SELECT, INSERT, DELETE
CREATE POLICY "Household members can view hidden_categories"
  ON hidden_categories FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert hidden_categories"
  ON hidden_categories FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete hidden_categories"
  ON hidden_categories FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER update_merchant_category_rules_updated_at
  BEFORE UPDATE ON merchant_category_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SEED SYSTEM CATEGORIES (Plaid PFCv2 primary taxonomy)
-- =============================================================================

INSERT INTO categories (household_id, name, icon, is_system, color, display_name) VALUES
  (NULL, 'INCOME', '💰', true, '#4CAF50', 'Income'),
  (NULL, 'TRANSFER_IN', '📥', true, '#2196F3', 'Transfer In'),
  (NULL, 'TRANSFER_OUT', '📤', true, '#FF9800', 'Transfer Out'),
  (NULL, 'LOAN_PAYMENTS', '🏦', true, '#795548', 'Loan Payments'),
  (NULL, 'BANK_FEES', '🏛️', true, '#9E9E9E', 'Bank Fees'),
  (NULL, 'ENTERTAINMENT', '🎬', true, '#E91E63', 'Entertainment'),
  (NULL, 'FOOD_AND_DRINK', '🍔', true, '#FF5722', 'Food & Drink'),
  (NULL, 'GENERAL_MERCHANDISE', '🛍️', true, '#9C27B0', 'Shopping'),
  (NULL, 'HOME_IMPROVEMENT', '🏠', true, '#3F51B5', 'Home Improvement'),
  (NULL, 'MEDICAL', '🏥', true, '#F44336', 'Medical'),
  (NULL, 'PERSONAL_CARE', '💅', true, '#FF4081', 'Personal Care'),
  (NULL, 'GENERAL_SERVICES', '🔧', true, '#607D8B', 'Services'),
  (NULL, 'GOVERNMENT_AND_NON_PROFIT', '🏛️', true, '#455A64', 'Government'),
  (NULL, 'TRANSPORTATION', '🚗', true, '#00BCD4', 'Transportation'),
  (NULL, 'TRAVEL', '✈️', true, '#009688', 'Travel'),
  (NULL, 'RENT_AND_UTILITIES', '🏠', true, '#8BC34A', 'Rent & Utilities')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- BACKFILL CATEGORY_ID FROM TEXT CATEGORY COLUMN
-- =============================================================================

UPDATE transactions SET category_id = c.id
FROM categories c
WHERE c.name = transactions.category AND c.is_system = true
AND transactions.category_id IS NULL;
