-- Run after `supabase db reset` against the local instance. The transaction
-- leaves no test identity, conversation, or message data behind.
begin;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '48900000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'completed-turn@example.test',
  crypt('not-used', gen_salt('bf')),
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '48900000-0000-0000-0000-000000000001',
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

alter table public.chat_messages
  add constraint completed_turn_forced_failure
  check (content <> 'force assistant failure');

do $$
begin
  perform public.save_completed_chat_turn(
    '48900000-0000-0000-0000-000000000010',
    'turn-2',
    'This user row must roll back.',
    'force assistant failure',
    'gpt-5.4-mini'
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
