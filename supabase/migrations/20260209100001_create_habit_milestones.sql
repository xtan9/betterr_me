-- BetterR.Me Vertical Depth — Habit Milestones Table
-- Records when a habit reaches a streak milestone (7, 14, 30, etc.)

CREATE TABLE habit_milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  milestone INTEGER NOT NULL,
  achieved_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_habit_milestones_habit ON habit_milestones(habit_id);
CREATE INDEX idx_habit_milestones_user ON habit_milestones(user_id);
CREATE UNIQUE INDEX idx_habit_milestones_unique ON habit_milestones(habit_id, milestone);

ALTER TABLE habit_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own milestones"
  ON habit_milestones FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own milestones"
  ON habit_milestones FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE habit_milestones IS 'Records when a habit reaches a streak milestone (7, 14, 30, etc.)';
