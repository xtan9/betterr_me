-- Household invitations and visibility columns
-- Phase 23: Household & Couples
-- Adds invitation system, account/transaction visibility controls,
-- and budget/goal ownership for multi-member households

-- =============================================================================
-- HOUSEHOLD INVITATIONS
-- =============================================================================

CREATE TABLE household_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  email TEXT NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, email)
);

-- Indexes for invitation lookups
CREATE INDEX idx_invitations_token ON household_invitations(token);
CREATE INDEX idx_invitations_email ON household_invitations(email);
CREATE INDEX idx_invitations_household ON household_invitations(household_id);

-- =============================================================================
-- HOUSEHOLD INVITATIONS RLS
-- =============================================================================

ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;

-- Household owners can view invitations
CREATE POLICY "Household owners can view invitations"
  ON household_invitations FOR SELECT
  TO authenticated
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

-- Household owners can create invitations
CREATE POLICY "Household owners can create invitations"
  ON household_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

-- Household owners can update invitations (for revoke)
CREATE POLICY "Household owners can update invitations"
  ON household_invitations FOR UPDATE
  TO authenticated
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

-- =============================================================================
-- UPDATE HOUSEHOLD MEMBERS RLS
-- =============================================================================

-- The original Phase 18 policy only allows users to see their OWN membership.
-- For household features, users need to see ALL members of their household.
DROP POLICY "Users can view their memberships" ON household_members;

CREATE POLICY "Users can view household memberships"
  ON household_members FOR SELECT
  TO authenticated
  USING (
    household_id IN (
      SELECT hm.household_id FROM household_members hm
      WHERE hm.user_id = (SELECT auth.uid())
    )
  );

-- =============================================================================
-- UPDATE PROFILES RLS
-- =============================================================================

-- The original policy only allows users to see their OWN profile.
-- For household features, users need to see profiles of household members.
DROP POLICY "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own and household member profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR id IN (
      SELECT hm.user_id FROM household_members hm
      WHERE hm.household_id IN (
        SELECT hm2.household_id FROM household_members hm2
        WHERE hm2.user_id = (SELECT auth.uid())
      )
    )
  );

-- =============================================================================
-- ACCOUNT VISIBILITY COLUMNS
-- =============================================================================

ALTER TABLE accounts
  ADD COLUMN owner_id UUID REFERENCES profiles(id),
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'mine'
    CHECK (visibility IN ('mine', 'ours', 'hidden')),
  ADD COLUMN shared_since TIMESTAMPTZ;

-- Backfill owner_id from bank_connections.connected_by for linked accounts
UPDATE accounts SET owner_id = bc.connected_by
FROM bank_connections bc
WHERE accounts.bank_connection_id = bc.id
AND accounts.owner_id IS NULL
AND bc.connected_by IS NOT NULL;

-- Backfill owner_id for cash/manual accounts from household owner
UPDATE accounts a SET owner_id = (
  SELECT hm.user_id FROM household_members hm
  WHERE hm.household_id = a.household_id AND hm.role = 'owner'
  LIMIT 1
)
WHERE a.owner_id IS NULL;

-- Indexes for ownership and visibility queries
CREATE INDEX idx_accounts_owner ON accounts(owner_id);
CREATE INDEX idx_accounts_visibility ON accounts(visibility);

-- =============================================================================
-- TRANSACTION VISIBILITY COLUMNS
-- =============================================================================

ALTER TABLE transactions
  ADD COLUMN is_hidden_from_household BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_shared_to_household BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- BUDGET/GOAL OWNERSHIP COLUMNS
-- =============================================================================

ALTER TABLE budgets
  ADD COLUMN owner_id UUID REFERENCES profiles(id),
  ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE savings_goals
  ADD COLUMN owner_id UUID REFERENCES profiles(id),
  ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT false;

-- Backfill budget owner_id from household owner
UPDATE budgets b SET owner_id = (
  SELECT hm.user_id FROM household_members hm
  WHERE hm.household_id = b.household_id AND hm.role = 'owner'
  LIMIT 1
)
WHERE b.owner_id IS NULL;

-- Backfill savings_goals owner_id from household owner
UPDATE savings_goals sg SET owner_id = (
  SELECT hm.user_id FROM household_members hm
  WHERE hm.household_id = sg.household_id AND hm.role = 'owner'
  LIMIT 1
)
WHERE sg.owner_id IS NULL;

-- Indexes for ownership queries
CREATE INDEX idx_budgets_owner ON budgets(owner_id);
CREATE INDEX idx_goals_owner ON savings_goals(owner_id);
