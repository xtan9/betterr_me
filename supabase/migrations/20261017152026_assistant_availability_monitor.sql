-- Operator-managed identities only. Neither JWT metadata nor request flags can
-- grant monitoring quotas or history deletion. No service-role key is scheduled.
create table planner_private.assistant_monitor_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table planner_private.assistant_monitor_accounts enable row level security;
revoke all on planner_private.assistant_monitor_accounts from public, anon, authenticated;

create function planner_private.check_ai_chat_rate_limit(p_user_id uuid)
returns table(allowed boolean, minute_remaining integer, day_remaining integer)
language plpgsql security definer set search_path = '' as $$
declare
  minute_count integer; day_count integer;
  minute_limit integer := 10; day_limit integer := 100;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists(select 1 from planner_private.assistant_monitor_accounts where user_id = p_user_id) then
    minute_limit := 2; day_limit := 600;
  end if;
  insert into public.ai_chat_usage_windows(user_id, window_kind, window_start, request_count)
    values(p_user_id, 'minute', date_trunc('minute', now()), 1)
    on conflict(user_id, window_kind, window_start)
    do update set request_count = public.ai_chat_usage_windows.request_count + 1
    returning request_count into minute_count;
  insert into public.ai_chat_usage_windows(user_id, window_kind, window_start, request_count)
    values(p_user_id, 'day', date_trunc('day', now()), 1)
    on conflict(user_id, window_kind, window_start)
    do update set request_count = public.ai_chat_usage_windows.request_count + 1
    returning request_count into day_count;
  delete from public.ai_chat_usage_windows where user_id = p_user_id and window_start < now() - interval '8 days';
  return query select minute_count <= minute_limit and day_count <= day_limit,
    greatest(0, minute_limit - minute_count), greatest(0, day_limit - day_count);
end $$;
revoke all on function planner_private.check_ai_chat_rate_limit(uuid) from public, anon;
grant execute on function planner_private.check_ai_chat_rate_limit(uuid) to authenticated;

create or replace function public.check_ai_chat_rate_limit(p_user_id uuid)
returns table(allowed boolean, minute_remaining integer, day_remaining integer)
language sql security invoker set search_path = '' as $$
  select * from planner_private.check_ai_chat_rate_limit(p_user_id)
$$;
revoke all on function public.check_ai_chat_rate_limit(uuid) from public, anon;
grant execute on function public.check_ai_chat_rate_limit(uuid) to authenticated;

create function planner_private.cleanup_assistant_monitor() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  cutoff timestamptz := now() - interval '24 hours';
  deleted_count integer;
begin
  if owner_id is null or not exists(select 1 from planner_private.assistant_monitor_accounts where user_id = owner_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':assistant', 0));
  -- Memory has a non-cascading source-message FK, so remove it first. This also
  -- covers a late completion which produced fresh memory for an expired turn.
  delete from public.user_memories m where m.user_id = owner_id and (
    m.created_at < cutoff or m.source_message_id in (
      select msg.id from public.assistant_messages msg
      join public.assistant_conversations c on c.id = msg.conversation_id and c.user_id = msg.user_id
      where c.user_id = owner_id and c.created_at < cutoff
    )
  );
  -- Proposals expire logically but have no cascading conversation FK.
  delete from public.planner_ai_proposals p where p.user_id = owner_id and (
    p.created_at < cutoff or p.id in (
      select t.id from public.assistant_turns t
      join public.assistant_conversations c on c.id = t.conversation_id and c.user_id = t.user_id
      where c.user_id = owner_id and c.created_at < cutoff
    )
  );
  -- Cascades include messages, failed/prepared/completed turns, planning sessions.
  delete from public.assistant_conversations where user_id = owner_id and created_at < cutoff;
  get diagnostics deleted_count = row_count;
  -- Quota counters deliberately survive cleanup.
  return jsonb_build_object('monitor', true, 'deletedConversations', deleted_count);
end $$;
revoke all on function planner_private.cleanup_assistant_monitor() from public, anon;
grant execute on function planner_private.cleanup_assistant_monitor() to authenticated;
create function public.cleanup_assistant_monitor() returns jsonb
language sql security invoker set search_path = '' as $$ select planner_private.cleanup_assistant_monitor() $$;
revoke all on function public.cleanup_assistant_monitor() from public, anon;
grant execute on function public.cleanup_assistant_monitor() to authenticated;
