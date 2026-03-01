-- =============================================================================
-- FITNESS TABLES MIGRATION
-- Creates all 6 fitness tracking tables in dependency order:
--   1. exercises
--   2. routines
--   3. workouts (references routines)
--   4. workout_exercises (references workouts, exercises)
--   5. workout_sets (references workout_exercises)
--   6. routine_exercises (references routines, exercises)
-- =============================================================================

-- =============================================================================
-- 1. EXERCISES
-- =============================================================================

CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,  -- CASCADE: user deletion removes all their data; NULL for preset exercises
  name TEXT NOT NULL,
  muscle_group_primary TEXT NOT NULL,
  muscle_groups_secondary TEXT[] DEFAULT '{}',
  equipment TEXT NOT NULL DEFAULT 'barbell',
  exercise_type TEXT NOT NULL DEFAULT 'weight_reps',
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHECK constraints
ALTER TABLE exercises ADD CONSTRAINT exercises_type_check
  CHECK (exercise_type IN (
    'weight_reps',
    'bodyweight_reps',
    'weighted_bodyweight',
    'assisted_bodyweight',
    'duration',
    'duration_weight',
    'distance_duration',
    'weight_distance'
  ));

ALTER TABLE exercises ADD CONSTRAINT exercises_equipment_check
  CHECK (equipment IN (
    'barbell', 'dumbbell', 'machine', 'bodyweight', 'kettlebell',
    'cable', 'band', 'other', 'none'
  ));

ALTER TABLE exercises ADD CONSTRAINT exercises_muscle_group_check
  CHECK (muscle_group_primary IN (
    'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
    'core', 'quadriceps', 'hamstrings', 'glutes', 'calves',
    'traps', 'lats', 'full_body', 'cardio', 'other'
  ));

-- Indexes
CREATE INDEX idx_exercises_user ON exercises (user_id) WHERE is_custom = true;
CREATE INDEX idx_exercises_muscle ON exercises (muscle_group_primary);
CREATE INDEX idx_exercises_preset ON exercises (id) WHERE user_id IS NULL;

-- RLS
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view preset and own exercises"
  ON exercises FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can create custom exercises"
  ON exercises FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_custom = true);

CREATE POLICY "Users can update own custom exercises"
  ON exercises FOR UPDATE
  USING (auth.uid() = user_id AND is_custom = true);

CREATE POLICY "Users can delete own custom exercises"
  ON exercises FOR DELETE
  USING (auth.uid() = user_id AND is_custom = true);

-- Updated_at trigger
CREATE TRIGGER update_exercises_updated_at
  BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. ROUTINES
-- =============================================================================

CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- CASCADE: user deletion removes all their data
  name TEXT NOT NULL,
  notes TEXT,
  last_performed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routines_user ON routines (user_id);

-- RLS
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routines"
  ON routines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own routines"
  ON routines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own routines"
  ON routines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own routines"
  ON routines FOR DELETE USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. WORKOUTS
-- =============================================================================

CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- CASCADE: user deletion removes all their data
  title TEXT NOT NULL DEFAULT 'Workout',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed')), -- NOTE: 'discarded' status added in migration 20260224000003
  notes TEXT,
  routine_id UUID REFERENCES routines(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active workout per user at a time
CREATE UNIQUE INDEX idx_workouts_active
  ON workouts (user_id)
  WHERE status = 'in_progress';

CREATE INDEX idx_workouts_user_date ON workouts (user_id, started_at DESC);
CREATE INDEX idx_workouts_routine ON workouts (routine_id) WHERE routine_id IS NOT NULL;

-- RLS
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workouts"
  ON workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own workouts"
  ON workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workouts"
  ON workouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workouts"
  ON workouts FOR DELETE USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_workouts_updated_at
  BEFORE UPDATE ON workouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 4. WORKOUT_EXERCISES
-- =============================================================================

CREATE TABLE workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE, -- CASCADE: workout deletion removes its exercises
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT, -- RESTRICT: prevent deleting exercises still in use
  sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  rest_timer_seconds INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_exercises_workout
  ON workout_exercises (workout_id, sort_order);

-- RLS: inherit from workout ownership
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view exercises in own workouts"
  ON workout_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id
    AND workouts.user_id = auth.uid()
  ));

CREATE POLICY "Users can add exercises to own workouts"
  ON workout_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id
    AND workouts.user_id = auth.uid()
  ));

CREATE POLICY "Users can update exercises in own workouts"
  ON workout_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id
    AND workouts.user_id = auth.uid()
  ));

CREATE POLICY "Users can remove exercises from own workouts"
  ON workout_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id
    AND workouts.user_id = auth.uid()
  ));

-- =============================================================================
-- 5. WORKOUT_SETS
-- =============================================================================

CREATE TABLE workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE, -- CASCADE: exercise removal removes its sets
  set_number INTEGER NOT NULL,
  set_type TEXT NOT NULL DEFAULT 'normal'
    CHECK (set_type IN ('warmup', 'normal', 'drop', 'failure')),
  weight_kg NUMERIC(7,2),
  reps INTEGER,
  duration_seconds INTEGER,
  distance_meters NUMERIC(10,2),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  rpe SMALLINT CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_sets_exercise
  ON workout_sets (workout_exercise_id, set_number);

-- RLS: inherit through workout_exercises -> workouts chain
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sets in own workouts"
  ON workout_sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.id = workout_sets.workout_exercise_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can add sets to own workouts"
  ON workout_sets FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.id = workout_sets.workout_exercise_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can update sets in own workouts"
  ON workout_sets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.id = workout_sets.workout_exercise_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete sets in own workouts"
  ON workout_sets FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.id = workout_sets.workout_exercise_id
    AND w.user_id = auth.uid()
  ));

-- Updated_at trigger
CREATE TRIGGER update_workout_sets_updated_at
  BEFORE UPDATE ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 6. ROUTINE_EXERCISES
-- =============================================================================

CREATE TABLE routine_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE, -- CASCADE: routine deletion removes its exercises
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT, -- RESTRICT: prevent deleting exercises still in use
  sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
  target_sets INTEGER DEFAULT 3,
  target_reps INTEGER,
  target_weight_kg NUMERIC(7,2),
  target_duration_seconds INTEGER,
  rest_timer_seconds INTEGER DEFAULT 90,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routine_exercises_routine
  ON routine_exercises (routine_id, sort_order);

-- RLS: inherit from routine ownership
ALTER TABLE routine_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view exercises in own routines"
  ON routine_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id
    AND routines.user_id = auth.uid()
  ));

CREATE POLICY "Users can add exercises to own routines"
  ON routine_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id
    AND routines.user_id = auth.uid()
  ));

CREATE POLICY "Users can update exercises in own routines"
  ON routine_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id
    AND routines.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete exercises from own routines"
  ON routine_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id
    AND routines.user_id = auth.uid()
  ));
