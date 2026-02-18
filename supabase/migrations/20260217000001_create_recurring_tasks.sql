-- Create recurring_tasks table for recurrence templates
CREATE TABLE recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  intention TEXT,
  priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 3),
  category TEXT CHECK (category IN ('work', 'personal', 'shopping', 'other')),
  due_time TIME,
  recurrence_rule JSONB NOT NULL,
  start_date DATE NOT NULL,
  end_type TEXT NOT NULL CHECK (end_type IN ('never', 'after_count', 'on_date')) DEFAULT 'never',
  end_date DATE,
  end_count INTEGER,
  instances_generated INTEGER DEFAULT 0,
  next_generate_date DATE,
  status TEXT CHECK (status IN ('active', 'paused', 'archived')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recurring_tasks_user ON recurring_tasks(user_id);
CREATE INDEX idx_recurring_tasks_user_status ON recurring_tasks(user_id, status);
CREATE INDEX idx_recurring_tasks_next_gen ON recurring_tasks(user_id, next_generate_date)
  WHERE status = 'active';

-- RLS policies
ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_tasks_select ON recurring_tasks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY recurring_tasks_insert ON recurring_tasks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY recurring_tasks_update ON recurring_tasks
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY recurring_tasks_delete ON recurring_tasks
  FOR DELETE USING (user_id = auth.uid());

-- Reuse existing updated_at trigger function
CREATE TRIGGER update_recurring_tasks_updated_at
  BEFORE UPDATE ON recurring_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
