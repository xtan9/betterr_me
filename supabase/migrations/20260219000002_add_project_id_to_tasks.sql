-- Add project_id FK to tasks table and section CHECK constraint
-- Phase 14: Projects & Sections

ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_project_id ON tasks (project_id) WHERE project_id IS NOT NULL;

-- Constrain section values now that Phase 14 defines the exact set
ALTER TABLE tasks ADD CONSTRAINT tasks_section_check CHECK (section IN ('personal', 'work'));
