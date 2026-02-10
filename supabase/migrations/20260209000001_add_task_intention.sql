ALTER TABLE tasks ADD COLUMN intention TEXT;
COMMENT ON COLUMN tasks.intention IS 'Optional user-stated reason/motivation for this task';
