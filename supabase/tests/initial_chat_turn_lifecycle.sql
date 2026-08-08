-- constrained-sql-fixture: true
-- The transaction leaves no test identity, conversation, or message data behind.
begin;

select public.sql_fixture_create_auth_user(
  '49800000-0000-0000-0000-000000000001',
  'initial-turn@example.test'
);

select public.sql_fixture_create_auth_user(
  '49800000-0000-0000-0000-000000000002',
  'other-initial-turn@example.test'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"49800000-0000-0000-0000-000000000001"}',
  true
);

set local role authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.save_initial_chat_turn(uuid,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role cannot execute initial-turn persistence';
  end if;

  if has_function_privilege(
    'anon',
    'public.save_initial_chat_turn(uuid,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'anonymous role can execute initial-turn persistence';
  end if;

  perform public.save_initial_chat_turn(
    '49800000-0000-0000-0000-000000000002',
    'foreign-first-turn',
    'This user id is not the caller.',
    'This response must not be persisted.',
    'gpt-5.3-codex-spark',
    'Foreign turn'
  );
  raise exception 'cross-user initial turn unexpectedly succeeded';
exception
  when raise_exception then
    if sqlerrm <> 'Unauthorized' then
      raise;
    end if;
end
$$;

reset role;

do $$
begin
  if exists (
    select 1 from public.conversations
    where initial_turn_id = 'foreign-first-turn'
  ) then
    raise exception 'cross-user initial turn created a conversation';
  end if;
end
$$;

set local role authenticated;

do $$
declare
  first_outcome jsonb;
  retry_outcome jsonb;
begin
  first_outcome := public.save_initial_chat_turn(
    '49800000-0000-0000-0000-000000000001',
    'stable-first-turn',
    'Help me plan a balanced week.',
    'Let us start with your fixed commitments.',
    'gpt-5.3-codex-spark',
    'Help me plan a balanced week.'
  );

  retry_outcome := public.save_initial_chat_turn(
    '49800000-0000-0000-0000-000000000001',
    'stable-first-turn',
    'Help me plan a balanced week.',
    'Let us start with your fixed commitments.',
    'gpt-5.3-codex-spark',
    'Help me plan a balanced week.'
  );

  if first_outcome->>'outcome' <> 'saved'
    or retry_outcome->>'outcome' <> 'already_saved'
    or first_outcome->>'conversationId' <> retry_outcome->>'conversationId'
    or first_outcome->>'title' <> 'Help me plan a balanced week.'
    or jsonb_array_length(first_outcome->'messages') <> 2
    or first_outcome->'messages'->0->>'role' <> 'user'
    or first_outcome->'messages'->1->>'role' <> 'assistant'
    or first_outcome->'messages'->1->>'model' <> 'gpt-5.3-codex-spark' then
    raise exception 'initial turn lifecycle outcome was incorrect: first=%, retry=%',
      first_outcome,
      retry_outcome;
  end if;
end
$$;

reset role;

do $$
begin
  if (
    select count(*)
    from public.conversations
    where user_id = '49800000-0000-0000-0000-000000000001'
      and initial_turn_id = 'stable-first-turn'
  ) <> 1 then
    raise exception 'retry created a duplicate conversation';
  end if;

  if (
    select count(*)
    from public.chat_messages
    where turn_id = 'stable-first-turn'
  ) <> 2 then
    raise exception 'retry created duplicate messages';
  end if;
end
$$;

set local role authenticated;

do $$
begin
  perform public.save_initial_chat_turn(
    '49800000-0000-0000-0000-000000000001',
    'stable-first-turn',
    'Changed content must not be accepted.',
    'Let us start with your fixed commitments.',
    'gpt-5.3-codex-spark',
    'Changed title'
  );
  raise exception 'conflicting retry unexpectedly succeeded';
exception
  when raise_exception then
    if sqlerrm <> 'Initial turn id already used with different content' then
      raise;
    end if;
end
$$;

rollback;
