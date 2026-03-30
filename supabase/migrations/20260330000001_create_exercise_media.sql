-- Exercise media cache for ExerciseDB API data
-- Writes happen via admin client only (createAdminClient) -- bypasses RLS

CREATE TABLE exercise_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  exercisedb_id TEXT,
  gif_url TEXT,
  thumbnail_url TEXT,
  instructions TEXT[],
  alternative_names TEXT[],
  media_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'exercisedb',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id)
);

ALTER TABLE exercise_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_media_select" ON exercise_media
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policy: writes via admin client only (createAdminClient)

CREATE TABLE exercise_name_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  exercisedb_id TEXT,
  our_name TEXT NOT NULL,
  matched_name TEXT,
  match_confidence REAL DEFAULT 0.0,
  equipment_match BOOLEAN DEFAULT false,
  muscle_match BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id)
);

ALTER TABLE exercise_name_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_name_mappings_select" ON exercise_name_mappings
  FOR SELECT TO authenticated USING (true);
