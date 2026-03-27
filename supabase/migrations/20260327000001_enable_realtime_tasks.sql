-- Enable Realtime on the tasks table so Supabase broadcasts
-- postgres_changes events to subscribed clients.
-- RLS policies ensure users only receive events for their own tasks.

alter publication supabase_realtime add table tasks;
