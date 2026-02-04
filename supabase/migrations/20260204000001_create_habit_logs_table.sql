-- BetterR.Me Habits Feature - Habit Logs Table
-- Migration: 20260203_002_create_habit_logs_table.sql

-- =============================================================================
-- HABIT LOGS TABLE
-- =============================================================================

CREATE TABLE habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one log per habit per day
  UNIQUE (habit_id, logged_date)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- For fetching logs by habit and date range (streak calculation)
CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, logged_date DESC);

-- For fetching all user logs by date (dashboard view)
CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, logged_date DESC);

-- For checking if habit was completed on specific date
CREATE INDEX idx_habit_logs_habit_date_completed ON habit_logs(habit_id, logged_date) WHERE completed = true;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE habit_logs IS 'Daily completion records for habits';
COMMENT ON COLUMN habit_logs.logged_date IS 'The date this log represents (DATE, not timestamp)';
COMMENT ON COLUMN habit_logs.completed IS 'Whether the habit was completed on this date';
