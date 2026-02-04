-- BetterR.Me Habits Feature - Habits Table
-- Migration: 20260203_001_create_habits_table.sql

-- =============================================================================
-- HABITS TABLE
-- =============================================================================

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('health', 'wellness', 'learning', 'productivity', 'other')),
  frequency JSONB NOT NULL,
  status TEXT CHECK (status IN ('active', 'paused', 'archived')) DEFAULT 'active',
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- For fetching user's habits
CREATE INDEX idx_habits_user_id ON habits(user_id);

-- For filtering by status
CREATE INDEX idx_habits_user_status ON habits(user_id, status);

-- Partial index for active habits only (most common query)
CREATE INDEX idx_habits_user_active ON habits(user_id) WHERE status = 'active';

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE habits IS 'User habits with frequency settings and streak tracking';
COMMENT ON COLUMN habits.frequency IS 'JSONB: {type: "daily"} | {type: "weekdays"} | {type: "weekly"} | {type: "times_per_week", count: N} | {type: "custom", days: [0-6]}';
COMMENT ON COLUMN habits.status IS 'active = tracking, paused = temporarily stopped, archived = hidden';
COMMENT ON COLUMN habits.current_streak IS 'Denormalized streak count, updated on habit toggle';
COMMENT ON COLUMN habits.best_streak IS 'All-time best streak for this habit';
