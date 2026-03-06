-- Create households and household_members tables
-- Phase 18: Database Foundation & Household Schema
-- Households provide multi-tenant isolation for money features (Phases 19-25)

-- =============================================================================
-- HOUSEHOLDS
-- =============================================================================

CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Household',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- HOUSEHOLD MEMBERS
-- =============================================================================

CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for the RLS IN-subquery pattern (fast user -> household lookups)
CREATE INDEX idx_household_members_user_id ON household_members(user_id);
CREATE INDEX idx_household_members_household_id ON household_members(household_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Households: users can only see households they belong to
CREATE POLICY "Users can view their households"
  ON households FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Households: any authenticated user can create a household
CREATE POLICY "Authenticated users can create households"
  ON households FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Household members: users can only see their own memberships
CREATE POLICY "Users can view their memberships"
  ON household_members FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Household members: users can only add themselves (invitations handled in Phase 23)
CREATE POLICY "Users can add themselves to households"
  ON household_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Reuse existing updated_at trigger function
CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
