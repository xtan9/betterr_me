-- Add composite index for efficient stats COUNT queries.
-- Covers: countCompletedLogs() which filters by (habit_id, user_id, completed, logged_date range)

CREATE INDEX IF NOT EXISTS idx_habit_logs_stats
  ON habit_logs (habit_id, user_id, logged_date, completed);
