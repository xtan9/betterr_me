-- BetterR.Me Habit Graduation
-- Migration: 20260412000001_habit_graduation.sql

-- =============================================================================
-- 1. HARD-DELETE EXISTING ARCHIVED HABITS (approved by product)
-- =============================================================================
DELETE FROM habits WHERE status = 'archived';

-- =============================================================================
-- 2. NEW COLUMNS ON habits
-- =============================================================================
ALTER TABLE habits
  ADD COLUMN graduated_at TIMESTAMPTZ,
  ADD COLUMN graduated_streak INTEGER,
  ADD COLUMN nudge_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN habits.graduated_at IS 'Timestamp when user graduated this habit. Cleared on reactivate.';
COMMENT ON COLUMN habits.graduated_streak IS 'Snapshot of current_streak at graduation. Displayed in Formed gallery.';
COMMENT ON COLUMN habits.nudge_dismissed_at IS 'When user dismissed the graduation nudge. Re-evaluates after 30 days.';

-- =============================================================================
-- 3. REPLACE status CHECK CONSTRAINT: archived -> formed
-- =============================================================================
ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_status_check;
ALTER TABLE habits
  ADD CONSTRAINT habits_status_check CHECK (status IN ('active', 'paused', 'formed'));

COMMENT ON COLUMN habits.status IS 'active = tracking, paused = temporarily stopped, formed = graduated/automatic';

-- Rebuild partial index (archived is gone; active still most common)
DROP INDEX IF EXISTS idx_habits_user_active;
CREATE INDEX idx_habits_user_active ON habits(user_id) WHERE status = 'active';

-- New partial index for Formed gallery
CREATE INDEX idx_habits_user_formed ON habits(user_id, graduated_at DESC) WHERE status = 'formed';

-- =============================================================================
-- 4. habit_graduations HISTORY TABLE
-- =============================================================================
CREATE TABLE habit_graduations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  graduated_at TIMESTAMPTZ NOT NULL,
  graduated_streak INTEGER NOT NULL,
  reactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_habit_graduations_habit ON habit_graduations(habit_id);
CREATE INDEX idx_habit_graduations_user ON habit_graduations(user_id, graduated_at DESC);

COMMENT ON TABLE habit_graduations IS 'History of graduate/reactivate cycles per habit';

-- =============================================================================
-- 5. RLS FOR habit_graduations (match habits pattern)
-- =============================================================================
ALTER TABLE habit_graduations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own graduations"
  ON habit_graduations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own graduations"
  ON habit_graduations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own graduations"
  ON habit_graduations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own graduations"
  ON habit_graduations FOR DELETE
  USING (auth.uid() = user_id);
