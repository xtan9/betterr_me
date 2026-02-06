-- Partial index for efficient stats COUNT queries on completed logs.
-- Covers: countCompletedLogs() which filters by (habit_id, user_id, logged_date range)
-- WHERE completed = true since that's the only value ever queried.

CREATE INDEX IF NOT EXISTS idx_habit_logs_stats
  ON habit_logs (habit_id, user_id, logged_date) WHERE completed = true;
