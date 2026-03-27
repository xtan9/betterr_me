-- Enable Realtime on the tasks table so Supabase broadcasts
-- postgres_changes events to subscribed clients.
-- RLS policies ensure users only receive events for their own tasks.
-- REPLICA IDENTITY FULL is required so DELETE events include the full
-- row (including task id) in payload.old.

alter table tasks replica identity full;
alter publication supabase_realtime add table tasks;
