-- Use Codex 5.3 Spark for new chat conversations.
ALTER TABLE public.conversations
  ALTER COLUMN model SET DEFAULT 'gpt-5.3-codex-spark';
