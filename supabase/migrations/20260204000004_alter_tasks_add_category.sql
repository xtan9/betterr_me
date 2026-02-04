-- BetterR.Me - Add category column to tasks table
-- Migration: 20260204000004_alter_tasks_add_category.sql

ALTER TABLE tasks
  ADD COLUMN category TEXT CHECK (category IN ('work', 'personal', 'shopping', 'other'));

COMMENT ON COLUMN tasks.category IS 'Optional task category';
