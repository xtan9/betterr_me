-- ralph-ci: true
-- Run after `supabase db reset` against the local instance. The transaction
-- leaves no test identity, conversation, or message data behind.
begin;

select public.ralph_ci_create_auth_user(
  '48900000-0000-0000-0000-000000000001',
  'completed-turn@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"48900000-0000-0000-0000-000000000001"}',
  true
);

insert into public.conversations (id, user_id, model)
values (
  '48900000-0000-0000-0000-000000000010',
  '48900000-0000-0000-0000-000000000001',
  'gpt-5.4-mini'
);

do $$
declare
  first_outcome jsonb;
  retry_outcome jsonb;
begin
  first_outcome := public.save_completed_chat_turn(
    '48900000-0000-0000-0000-000000000010',
    'turn-1',
    'How am I doing?',
    'You are making progress.',
    'gpt-5.4-mini'
  );

  retry_outcome := public.save_completed_chat_turn(
    '48900000-0000-0000-0000-000000000010',
    'turn-1',
    'How am I doing?',
    'You are making progress.',
    'gpt-5.4-mini'
  );

  if first_outcome->>'outcome' <> 'saved'
    or retry_outcome->>'outcome' <> 'already_saved'
    or jsonb_array_length(first_outcome->'messages') <> 2
    or first_outcome->'messages'->0->>'role' <> 'user'
    or first_outcome->'messages'->1->>'role' <> 'assistant'
    or first_outcome->'messages'->1->>'model' <> 'gpt-5.4-mini' then
    raise exception 'completed turn outcome was incorrect: first=%, retry=%',
      first_outcome,
      retry_outcome;
  end if;

  if (
    select count(*)
    from public.chat_messages
    where conversation_id = '48900000-0000-0000-0000-000000000010'
      and turn_id = 'turn-1'
  ) <> 2 then
    raise exception 'retry created duplicate messages';
  end if;
end
$$;

do $$
begin
  perform public.save_completed_chat_turn(
    '48900000-0000-0000-0000-000000000010',
    'turn-2',
    'This user row must roll back.',
    'This assistant row is missing model metadata.',
    null
  );
  raise exception 'failing completed turn unexpectedly succeeded';
exception
  when check_violation then
    null;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.chat_messages
    where conversation_id = '48900000-0000-0000-0000-000000000010'
      and turn_id = 'turn-2'
  ) then
    raise exception 'partial completed turn was retained';
  end if;
end
$$;

rollback;
