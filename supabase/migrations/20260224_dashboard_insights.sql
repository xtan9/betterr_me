-- Phase 24: Dashboard Insights & Income Pattern Storage
-- Creates tables for dismissed insights and confirmed income patterns.

-- =============================================================================
-- dismissed_insights
-- Tracks which insights a household has dismissed. Period-scoped insight_id
-- means the same insight type resurfaces in a new period (e.g., new month).
-- =============================================================================

CREATE TABLE dismissed_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  insight_id TEXT NOT NULL, -- deterministic hash, e.g. "spending_anomaly:groceries:2026-02"
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, insight_id)
);

ALTER TABLE dismissed_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dismissed_insights_select" ON dismissed_insights
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "dismissed_insights_insert" ON dismissed_insights
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "dismissed_insights_delete" ON dismissed_insights
  FOR DELETE USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- confirmed_income_patterns
-- Stores user-confirmed recurring income patterns detected from transactions.
-- Used by cash flow projections on the dashboard.
-- =============================================================================

CREATE TABLE confirmed_income_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL, -- normalized merchant name from transactions
  amount_cents BIGINT NOT NULL, -- confirmed median income amount
  frequency TEXT NOT NULL CHECK (frequency IN ('WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY')),
  next_expected_date DATE NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  needs_reconfirmation BOOLEAN NOT NULL DEFAULT false, -- set true when detected pattern diverges >10%
  UNIQUE (household_id, merchant_name)
);

ALTER TABLE confirmed_income_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "confirmed_income_patterns_select" ON confirmed_income_patterns
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "confirmed_income_patterns_insert" ON confirmed_income_patterns
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "confirmed_income_patterns_update" ON confirmed_income_patterns
  FOR UPDATE USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "confirmed_income_patterns_delete" ON confirmed_income_patterns
  FOR DELETE USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );
