-- Chat memory storage for Anthropic's memory tool.
-- Each row is a memory file (path + content) scoped to a user.
-- Claude reads/creates/updates these to remember user preferences across conversations.

create table if not exists chat_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_memories_user_path_unique unique (user_id, path)
);

create index idx_chat_memories_user_id on chat_memories (user_id);

-- RLS: users can only access their own memories
alter table chat_memories enable row level security;

create policy "Users manage own memories"
  on chat_memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
