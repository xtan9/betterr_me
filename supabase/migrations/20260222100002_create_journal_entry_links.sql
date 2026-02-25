-- Create journal_entry_links table for polymorphic links between journal entries and habits/tasks/projects
-- Phase 20: Database & API Foundation

CREATE TABLE journal_entry_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('habit', 'task', 'project')),
  link_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One link per entry+type+target combination
  UNIQUE (entry_id, link_type, link_id)
);

-- Indexes
CREATE INDEX idx_journal_entry_links_entry ON journal_entry_links (entry_id);
CREATE INDEX idx_journal_entry_links_target ON journal_entry_links (link_type, link_id);

-- RLS (use entry ownership via join to journal_entries)
ALTER TABLE journal_entry_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view links for their own entries"
  ON journal_entry_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create links for their own entries"
  ON journal_entry_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete links for their own entries"
  ON journal_entry_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );
