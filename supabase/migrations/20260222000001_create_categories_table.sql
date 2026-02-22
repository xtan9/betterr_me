-- Create categories table for user-defined categories
-- Replaces the old hardcoded category CHECK constraints on tasks, habits, and recurring_tasks

-- =============================================================================
-- CATEGORIES TABLE
-- =============================================================================

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_categories_user ON categories(user_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own categories"
  ON categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own categories"
  ON categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories"
  ON categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories"
  ON categories FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- DROP OLD CATEGORY CHECK CONSTRAINT ON TASKS
-- =============================================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_category_check;

-- =============================================================================
-- ADD category_id FK TO TASKS, HABITS, RECURRING_TASKS
-- =============================================================================

ALTER TABLE tasks
  ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE habits
  ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE recurring_tasks
  ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
