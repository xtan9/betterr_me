-- Phase 13: Data Foundation & Migration
-- Adds status, section, sort_order columns to tasks table
-- Migrates existing data: is_completed=true -> status=done, is_completed=false -> status=todo
-- Seeds sort_order by creation date (oldest = lowest = top of column)

-- Step 1: Add columns with defaults
-- PostgreSQL 11+ handles ADD COLUMN ... DEFAULT NOT NULL as metadata-only (no table rewrite)
ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'
  CHECK (status IN ('backlog', 'todo', 'in_progress', 'done'));
ALTER TABLE tasks ADD COLUMN section TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE tasks ADD COLUMN sort_order DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Step 2: Sync status from is_completed for existing completed tasks
-- Default 'todo' already handles is_completed=false tasks (Claude's discretion: 'todo' chosen
-- for UX consistency — existing incomplete tasks are active/actionable, matching kanban convention)
UPDATE tasks SET status = 'done' WHERE is_completed = true;

-- Step 3: Seed sort_order by creation date (oldest = lowest = top of column)
-- Uses ROW_NUMBER per user with GAP spacing (65536.0) for float-based reordering headroom
UPDATE tasks SET sort_order = sub.new_order
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id ORDER BY created_at ASC
  ) * 65536.0 AS new_order
  FROM tasks
) sub
WHERE tasks.id = sub.id;

-- Step 4: Indexes for common queries (Phase 14/15 will use these heavily)
CREATE INDEX idx_tasks_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_section ON tasks(user_id, section);
CREATE INDEX idx_tasks_sort_order ON tasks(user_id, sort_order);

-- Step 5: Column documentation
COMMENT ON COLUMN tasks.status IS 'Task workflow status: backlog, todo, in_progress, done. Synced with is_completed at API layer.';
COMMENT ON COLUMN tasks.section IS 'Task section grouping (default: personal). Extended by projects in Phase 14.';
COMMENT ON COLUMN tasks.sort_order IS 'Float-based ordering within section for drag-and-drop reordering.';
