-- Make mood column nullable to match app-level null semantics
-- (mood deselect sends null, per design decision in STATE.md)
ALTER TABLE journal_entries ALTER COLUMN mood DROP NOT NULL;
ALTER TABLE journal_entries ALTER COLUMN mood SET DEFAULT NULL;
