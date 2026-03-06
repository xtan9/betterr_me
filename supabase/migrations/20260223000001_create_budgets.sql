-- Phase 21: Budgets & Spending Analytics
-- Adds: budgets (envelope container per month), budget_categories (per-category allocations)

-- =============================================================================
-- BUDGETS TABLE
-- =============================================================================

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  month DATE NOT NULL,  -- always first day of month, e.g. '2026-02-01'
  total_cents BIGINT NOT NULL,
  rollover_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, month)
);

CREATE INDEX idx_budgets_household_month ON budgets(household_id, month);

-- =============================================================================
-- BUDGET CATEGORIES TABLE
-- =============================================================================

CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  allocated_cents BIGINT NOT NULL,
  rollover_cents BIGINT NOT NULL DEFAULT 0,  -- can be negative (overspend debt carries forward)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(budget_id, category_id)
);

CREATE INDEX idx_budget_categories_budget ON budget_categories(budget_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;

-- Budgets: household members can SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Household members can view budgets"
  ON budgets FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert budgets"
  ON budgets FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update budgets"
  ON budgets FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete budgets"
  ON budgets FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- Budget categories: household-scoped via budget join
CREATE POLICY "Household members can view budget_categories"
  ON budget_categories FOR SELECT TO authenticated
  USING (budget_id IN (
    SELECT id FROM budgets
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

CREATE POLICY "Household members can insert budget_categories"
  ON budget_categories FOR INSERT TO authenticated
  WITH CHECK (budget_id IN (
    SELECT id FROM budgets
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

CREATE POLICY "Household members can update budget_categories"
  ON budget_categories FOR UPDATE TO authenticated
  USING (budget_id IN (
    SELECT id FROM budgets
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

CREATE POLICY "Household members can delete budget_categories"
  ON budget_categories FOR DELETE TO authenticated
  USING (budget_id IN (
    SELECT id FROM budgets
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
