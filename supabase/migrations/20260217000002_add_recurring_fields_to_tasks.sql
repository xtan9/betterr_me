-- Add recurring task fields to tasks table
ALTER TABLE tasks ADD COLUMN recurring_task_id UUID REFERENCES recurring_tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN is_exception BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN original_date DATE;

CREATE INDEX idx_tasks_recurring ON tasks(recurring_task_id) WHERE recurring_task_id IS NOT NULL;
CREATE UNIQUE INDEX idx_tasks_recurring_date ON tasks(recurring_task_id, original_date)
  WHERE recurring_task_id IS NOT NULL AND original_date IS NOT NULL;
