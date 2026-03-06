-- Phase 22: Bills, Goals & Net Worth
-- Adds: recurring_bills, savings_goals, goal_contributions, net_worth_snapshots, manual_assets

-- =============================================================================
-- RECURRING BILLS TABLE
-- =============================================================================

CREATE TABLE recurring_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plaid_stream_id TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  amount_cents BIGINT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'MONTHLY'
    CHECK (frequency IN ('WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'ANNUALLY')),
  next_due_date DATE,
  user_status TEXT NOT NULL DEFAULT 'auto'
    CHECK (user_status IN ('auto', 'confirmed', 'dismissed')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  plaid_status TEXT,
  category_primary TEXT,
  previous_amount_cents BIGINT,
  source TEXT NOT NULL DEFAULT 'plaid'
    CHECK (source IN ('plaid', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, plaid_stream_id)
);

CREATE INDEX idx_recurring_bills_household ON recurring_bills(household_id);
CREATE INDEX idx_recurring_bills_next_due ON recurring_bills(household_id, next_due_date);

-- =============================================================================
-- SAVINGS GOALS TABLE
-- =============================================================================

CREATE TABLE savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_cents BIGINT NOT NULL,
  current_cents BIGINT NOT NULL DEFAULT 0,
  deadline DATE,
  funding_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (funding_type IN ('manual', 'linked')),
  linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  icon TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_savings_goals_household ON savings_goals(household_id);

-- =============================================================================
-- GOAL CONTRIBUTIONS TABLE
-- =============================================================================

CREATE TABLE goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  note TEXT,
  contributed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goal_contributions_goal ON goal_contributions(goal_id);
CREATE INDEX idx_goal_contributions_date ON goal_contributions(goal_id, contributed_at);

-- =============================================================================
-- NET WORTH SNAPSHOTS TABLE
-- =============================================================================

CREATE TABLE net_worth_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_cents BIGINT NOT NULL,
  assets_cents BIGINT NOT NULL DEFAULT 0,
  liabilities_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, snapshot_date)
);

CREATE INDEX idx_net_worth_snapshots_household ON net_worth_snapshots(household_id, snapshot_date);

-- =============================================================================
-- MANUAL ASSETS TABLE
-- =============================================================================

CREATE TABLE manual_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_cents BIGINT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'other'
    CHECK (asset_type IN ('property', 'vehicle', 'investment', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_manual_assets_household ON manual_assets(household_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE recurring_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_assets ENABLE ROW LEVEL SECURITY;

-- Recurring bills: household members can SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Household members can view recurring_bills"
  ON recurring_bills FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert recurring_bills"
  ON recurring_bills FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update recurring_bills"
  ON recurring_bills FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete recurring_bills"
  ON recurring_bills FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- Savings goals: household members can SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Household members can view savings_goals"
  ON savings_goals FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert savings_goals"
  ON savings_goals FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update savings_goals"
  ON savings_goals FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete savings_goals"
  ON savings_goals FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- Goal contributions: household-scoped via savings_goals join
CREATE POLICY "Household members can view goal_contributions"
  ON goal_contributions FOR SELECT TO authenticated
  USING (goal_id IN (
    SELECT id FROM savings_goals
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

CREATE POLICY "Household members can insert goal_contributions"
  ON goal_contributions FOR INSERT TO authenticated
  WITH CHECK (goal_id IN (
    SELECT id FROM savings_goals
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

CREATE POLICY "Household members can update goal_contributions"
  ON goal_contributions FOR UPDATE TO authenticated
  USING (goal_id IN (
    SELECT id FROM savings_goals
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

CREATE POLICY "Household members can delete goal_contributions"
  ON goal_contributions FOR DELETE TO authenticated
  USING (goal_id IN (
    SELECT id FROM savings_goals
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));

-- Net worth snapshots: household members can SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Household members can view net_worth_snapshots"
  ON net_worth_snapshots FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert net_worth_snapshots"
  ON net_worth_snapshots FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update net_worth_snapshots"
  ON net_worth_snapshots FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete net_worth_snapshots"
  ON net_worth_snapshots FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- Manual assets: household members can SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Household members can view manual_assets"
  ON manual_assets FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can insert manual_assets"
  ON manual_assets FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can update manual_assets"
  ON manual_assets FOR UPDATE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Household members can delete manual_assets"
  ON manual_assets FOR DELETE TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER update_recurring_bills_updated_at
  BEFORE UPDATE ON recurring_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_savings_goals_updated_at
  BEFORE UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_manual_assets_updated_at
  BEFORE UPDATE ON manual_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
