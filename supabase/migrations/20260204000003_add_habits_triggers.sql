-- BetterR.Me Habits Feature - Triggers
-- Migration: 20260203_004_add_habits_triggers.sql

-- Note: update_updated_at_column() function already exists from initial schema

-- =============================================================================
-- APPLY updated_at TRIGGERS
-- =============================================================================

CREATE TRIGGER update_habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_habit_logs_updated_at
  BEFORE UPDATE ON habit_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
